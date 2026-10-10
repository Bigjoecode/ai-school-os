import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger, NotFoundException, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import {
  DEFAULT_PORTAL_SETTINGS,
  formatMoney,
  formatPin,
  isDemoSchoolSlug,
  normalisePhone,
  type CreatePinBatchInput,
  type PinBatchRow,
  type PinCardDetail,
  type PinChallenge,
  type PinCheckResult,
  type PinExport,
  type PinOverview,
  type PinPurchaseResult,
  type PinPurchaseStart,
  type PinSaleRow,
  type PinUseRow,
  type PortalSettings,
  type PublicPinInfo,
  type ReportCardView,
  type ResultPinChannel,
} from '@aischool/shared';
import { raiseAlert } from '../alerts/alerts.service';
import { ReportCardService } from '../assessment/report-card.service';
import { AuditService } from '../audit/audit.service';
import { DemoModeService } from '../auth/demo-mode.service';
import { decryptSecret, encryptSecret } from '../common/crypto-box';
import { dateOnly, fullName } from '../common/format';
import { RequestContextStore, currentContext, currentTenantId } from '../common/request-context';
import { ChannelsService } from '../comms/channels.service';
import { env } from '../config/env';
import { FeatureService } from '../features/features.service';
import { PaystackService, paystackReferenceHandlers } from '../finance/paystack.service';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Wrong tries on one card before it locks, and for how long. */
const CARD_FAILURES = 5;
const CARD_LOCK_MS = 30 * 60_000;
/** Wrong tries from one IP address: a sum to solve after this many, blocked after that many (per hour). */
const IP_CHALLENGE_AFTER = 3;
const IP_BLOCK_AFTER = 20;
const IP_WINDOW_MS = 60 * 60_000;
/** How long a buyer can see their PIN again on the confirmation page. */
const REVEAL_MS = 48 * 3600_000;
export const PIN_REFERENCE_PREFIX = 'RPIN-';

const GENERIC_MISMATCH =
  'We could not find a released result for those details. Check the admission number and term. If you are sure they are right, the result may not be released yet or may be on hold — please contact the school office.';
const CARD_MISMATCH = 'The serial number and PIN do not match. Check the card and try again.';

type Batch = Prisma.ResultPinBatchGetPayload<object>;
type Pin = Prisma.ResultPinGetPayload<{ include: { batch: true } }>;

function secretKey(): Buffer {
  const k = env().APP_ENCRYPTION_KEY;
  if (!k) throw new ServiceUnavailableException('The server has no APP_ENCRYPTION_KEY set, so result PINs cannot be issued yet');
  return createHash('sha256').update(`result-pins:${k}`).digest();
}

/** A keyed hash of the PIN, tied to its school and serial, so a leaked table cannot be brute-forced offline. */
export function hashPin(tenantId: string, serial: string, pin: string): string {
  return createHmac('sha256', secretKey()).update(`${tenantId}:${serial}:${pin}`).digest('hex');
}

function sameHex(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}

const newPin = () => String(randomInt(0, 1_000_000_000_000)).padStart(12, '0');
const serialOf = (batchNumber: number, seq: number) => `${String(batchNumber).padStart(3, '0')}${String(seq).padStart(5, '0')}`;
/** The end of the chosen day in Nigeria (WAT, UTC+1). */
const endOfDay = (date: string) => new Date(`${date}T23:59:59+01:00`);

@Injectable()
export class ResultPinsService implements OnModuleInit {
  private readonly logger = new Logger(ResultPinsService.name);
  /** Wrong tries per IP address (in memory; the server runs as one process). */
  private readonly ipFailures = new Map<string, { count: number; since: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly cards: ReportCardService,
    private readonly audit: AuditService,
    private readonly paystack: PaystackService,
    private readonly channels: ChannelsService,
    private readonly features: FeatureService,
    private readonly demo: DemoModeService,
  ) {}

  onModuleInit() {
    // Paystack sends every school event to the one webhook; result-card sales are ours.
    paystackReferenceHandlers.push({ prefix: PIN_REFERENCE_PREFIX, handle: (tenantId, reference) => this.settle(tenantId, reference, 'webhook') });
  }

  // ================================================================ admin

  async overview(): Promise<PinOverview> {
    const tenantId = currentTenantId();
    const db = this.prisma.db;
    const [batches, tenant, onlineReady] = await Promise.all([
      db.resultPinBatch.findMany({ orderBy: { number: 'desc' } }),
      this.prisma.root.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { currency: true, slug: true } }),
      this.onlineReady(tenantId),
    ]);
    const rows = await this.batchRows(batches);
    const checks = await db.resultPinUse.count();
    const sum = (f: (r: PinBatchRow) => number) => rows.reduce((n, r) => n + f(r), 0);
    return {
      currency: tenant.currency,
      batches: rows,
      totals: {
        cards: sum((r) => r.count),
        sold: sum((r) => r.counts.sold),
        used: sum((r) => r.counts.used),
        unused: sum((r) => r.counts.unused),
        void: sum((r) => r.counts.void),
        revenueKobo: sum((r) => r.revenueKobo),
        onlineKobo: sum((r) => r.onlineKobo),
        checks,
      },
      onlineReady,
      checkerUrl: `/check-result/${tenant.slug}`,
      slug: tenant.slug,
    };
  }

  private async onlineReady(tenantId: string) {
    return (await this.paystack.connected(tenantId)) && (await this.features.isEnabled(tenantId, 'online_payments'));
  }

  private async batchRows(batches: Batch[]): Promise<PinBatchRow[]> {
    if (!batches.length) return [];
    const tenantId = currentTenantId();
    const ids = batches.map((b) => b.id);
    const [stats, online, sessions, terms] = await Promise.all([
      this.prisma.root.$queryRaw<{ batchId: string; sold: bigint; used: bigint; unused: bigint; void: bigint; exhausted: bigint; unrecorded: bigint }[]>`
        SELECT "batchId",
          count(*) FILTER (WHERE status = 'SOLD') AS sold,
          count(*) FILTER (WHERE "studentId" IS NOT NULL) AS used,
          count(*) FILTER (WHERE "studentId" IS NULL AND status <> 'VOID') AS unused,
          count(*) FILTER (WHERE status = 'VOID') AS void,
          count(*) FILTER (WHERE "usesLeft" <= 0) AS exhausted,
          count(*) FILTER (WHERE "studentId" IS NOT NULL AND status = 'UNSOLD') AS unrecorded
        FROM result_pins WHERE "tenantId" = ${tenantId} GROUP BY "batchId"`,
      this.prisma.db.resultPinSale.groupBy({ by: ['batchId'], where: { status: { in: ['PAID', 'PAID_NO_CARD'] }, batchId: { in: ids } }, _sum: { amountKobo: true } }),
      this.prisma.db.academicSession.findMany({ where: { id: { in: batches.map((b) => b.sessionId) } }, select: { id: true, name: true } }),
      this.prisma.db.term.findMany({ where: { id: { in: batches.map((b) => b.termId).filter((x): x is string => !!x) } }, select: { id: true, name: true } }),
    ]);
    const now = new Date();
    return batches.map((b) => {
      const s = stats.find((x) => x.batchId === b.id);
      const n = (v: bigint | undefined) => Number(v ?? 0);
      const sold = n(s?.sold);
      return {
        id: b.id,
        number: b.number,
        label: b.label,
        channel: b.channel as ResultPinChannel,
        sessionId: b.sessionId,
        sessionName: sessions.find((x) => x.id === b.sessionId)?.name ?? '—',
        termId: b.termId,
        termName: b.termId ? (terms.find((x) => x.id === b.termId)?.name ?? '—') : null,
        count: b.count,
        usesPerPin: b.usesPerPin,
        priceKobo: b.priceKobo,
        expiresOn: dateOnly(new Date(b.expiresAt.getTime() + 3600_000))!,
        expired: b.expiresAt < now,
        requireSale: b.requireSale,
        status: b.status as 'ACTIVE' | 'VOID',
        exportedAt: b.exportedAt?.toISOString() ?? null,
        createdAt: b.createdAt.toISOString(),
        firstSerial: serialOf(b.number, 1),
        lastSerial: serialOf(b.number, b.count),
        counts: { sold, used: n(s?.used), unused: n(s?.unused), void: n(s?.void), exhausted: n(s?.exhausted), usedNotRecordedSold: n(s?.unrecorded) },
        revenueKobo: sold * b.priceKobo,
        onlineKobo: online.find((o) => o.batchId === b.id)?._sum.amountKobo ?? 0,
      };
    });
  }

  async batchRow(id: string): Promise<PinBatchRow> {
    const b = await this.prisma.db.resultPinBatch.findUnique({ where: { id } });
    if (!b) throw new NotFoundException('Batch not found');
    return (await this.batchRows([b]))[0]!;
  }

  async generate(input: CreatePinBatchInput): Promise<PinBatchRow> {
    const tenantId = currentTenantId();
    const db = this.prisma.db;
    const session = await db.academicSession.findUnique({ where: { id: input.sessionId } });
    if (!session) throw new BadRequestException('That session does not exist');
    if (input.termId && !(await db.term.findFirst({ where: { id: input.termId, sessionId: input.sessionId } }))) throw new BadRequestException('That term is not in the chosen session');
    const expiresAt = endOfDay(input.expiresOn);
    if (expiresAt < new Date()) throw new BadRequestException({ statusCode: 400, message: 'The expiry date has passed', errors: [{ path: 'expiresOn', message: 'Choose a future date' }] });
    if (input.channel === 'ONLINE' && !(await this.onlineReady(tenantId))) {
      throw new BadRequestException('Selling online needs Paystack connected (Fees → Settings) and online payments switched on');
    }
    secretKey(); // fail early without the server key
    const userId = currentContext().userId ?? null;

    const batch = await this.prisma.root.$transaction(
      async (tx) => {
        const last = await tx.resultPinBatch.findFirst({ where: { tenantId }, orderBy: { number: 'desc' }, select: { number: true } });
        const number = (last?.number ?? 0) + 1;
        const b = await tx.resultPinBatch.create({
          data: {
            tenantId,
            number,
            label: input.label,
            channel: input.channel,
            sessionId: input.sessionId,
            termId: input.termId,
            count: input.count,
            usesPerPin: input.usesPerPin,
            priceKobo: input.priceKobo,
            expiresAt,
            requireSale: input.channel === 'ONLINE' ? false : input.requireSale,
            createdById: userId,
          },
        });
        for (let start = 1; start <= input.count; start += 500) {
          const rows: Prisma.ResultPinCreateManyInput[] = [];
          for (let seq = start; seq < Math.min(start + 500, input.count + 1); seq++) {
            const serial = serialOf(number, seq);
            const pin = newPin();
            rows.push({ tenantId, batchId: b.id, serial, pinHash: hashPin(tenantId, serial, pin), last4: pin.slice(-4), sealed: encryptSecret(pin), usesLeft: input.usesPerPin });
          }
          await tx.resultPin.createMany({ data: rows });
        }
        return b;
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
    await this.audit.log({
      action: 'result_pins.generated',
      entityType: 'ResultPinBatch',
      entityId: batch.id,
      summary: `Generated result-checker batch ${batch.number}: ${input.count} cards (${input.channel === 'ONLINE' ? 'sold online' : 'printed'}), ${input.usesPerPin} checks each, ${input.priceKobo / 100} per card, expires ${input.expiresOn}`,
    });
    return this.batchRow(batch.id);
  }

  /** The one-time export: returns every PIN in the batch once, then forgets them. */
  async export(id: string, origin: string): Promise<PinExport> {
    const tenantId = currentTenantId();
    const db = this.prisma.db;
    const b = await db.resultPinBatch.findUnique({ where: { id } });
    if (!b) throw new NotFoundException('Batch not found');
    if (b.channel !== 'PRINT') throw new BadRequestException('Online cards are never printed: each PIN is shown only to the parent who buys it');
    if (b.status !== 'ACTIVE') throw new BadRequestException('This batch has been voided');
    const won = await db.resultPinBatch.updateMany({ where: { id, exportedAt: null }, data: { exportedAt: new Date(), exportedById: currentContext().userId ?? null } });
    if (!won.count) throw new ConflictException('These cards were already printed or downloaded. PINs cannot be shown again — void the batch and generate a new one if the printout was lost.');
    const pins = await db.resultPin.findMany({ where: { batchId: id }, orderBy: { serial: 'asc' }, select: { id: true, serial: true, sealed: true, status: true } });
    const cards = pins.filter((p) => p.sealed && p.status !== 'VOID').map((p) => ({ serial: p.serial, pin: decryptSecret(p.sealed!) }));
    await db.resultPin.updateMany({ where: { batchId: id }, data: { sealed: null } });
    const tenant = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true, logoUrl: true, motto: true, slug: true } });
    await this.audit.log({ action: 'result_pins.exported', entityType: 'ResultPinBatch', entityId: id, summary: `Printed / downloaded the PINs of result-checker batch ${b.number} (${cards.length} cards). They cannot be shown again.` });
    return { batch: await this.batchRow(id), school: { name: tenant.name, logoUrl: tenant.logoUrl, motto: tenant.motto }, checkerUrl: `${origin}/check-result/${tenant.slug}`, cards };
  }

  async extend(id: string, expiresOn: string): Promise<PinBatchRow> {
    const b = await this.prisma.db.resultPinBatch.findUnique({ where: { id } });
    if (!b) throw new NotFoundException('Batch not found');
    const expiresAt = endOfDay(expiresOn);
    if (expiresAt < new Date()) throw new BadRequestException('Choose a future date');
    await this.prisma.db.resultPinBatch.update({ where: { id }, data: { expiresAt } });
    await this.audit.log({ action: 'result_pins.extended', entityType: 'ResultPinBatch', entityId: id, summary: `Changed the expiry of result-checker batch ${b.number} to ${expiresOn}` });
    return this.batchRow(id);
  }

  async voidBatch(id: string, reason: string): Promise<PinBatchRow> {
    const b = await this.prisma.db.resultPinBatch.findUnique({ where: { id } });
    if (!b) throw new NotFoundException('Batch not found');
    await this.prisma.db.resultPinBatch.update({ where: { id }, data: { status: 'VOID' } });
    await this.prisma.db.resultPin.updateMany({ where: { batchId: id, status: { not: 'VOID' } }, data: { status: 'VOID', voidReason: reason, sealed: null } });
    await this.audit.log({ action: 'result_pins.batch_voided', entityType: 'ResultPinBatch', entityId: id, summary: `Voided result-checker batch ${b.number}: ${reason}` });
    return this.batchRow(id);
  }

  async voidCard(serial: string, reason: string) {
    const pin = await this.prisma.db.resultPin.findFirst({ where: { serial } });
    if (!pin) throw new NotFoundException('No card with that serial number');
    await this.prisma.db.resultPin.update({ where: { id: pin.id }, data: { status: 'VOID', voidReason: reason, sealed: null } });
    await this.audit.log({ action: 'result_pins.card_voided', entityType: 'ResultPin', entityId: pin.id, summary: `Voided result-checker card ${serial}: ${reason}` });
    return this.card(serial);
  }

  async unlockCard(serial: string) {
    const pin = await this.prisma.db.resultPin.findFirst({ where: { serial } });
    if (!pin) throw new NotFoundException('No card with that serial number');
    await this.prisma.db.resultPin.update({ where: { id: pin.id }, data: { failedAttempts: 0, lockedUntil: null } });
    await this.audit.log({ action: 'result_pins.card_unlocked', entityType: 'ResultPin', entityId: pin.id, summary: `Unlocked result-checker card ${serial} after wrong tries` });
    return this.card(serial);
  }

  /** The bursar records a stack of printed cards as sold (first to last serial). */
  async sell(fromSerial: string, toSerial: string, soldTo: string | null) {
    const db = this.prisma.db;
    const [a, z] = await Promise.all([db.resultPin.findFirst({ where: { serial: fromSerial }, include: { batch: true } }), db.resultPin.findFirst({ where: { serial: toSerial } })]);
    if (!a || !z) throw new BadRequestException('Check the serial numbers: one of them is not a card of this school');
    if (a.batchId !== z.batchId) throw new BadRequestException('Both serial numbers must be from the same batch');
    if (a.batch.channel !== 'PRINT') throw new BadRequestException('Online cards are recorded as sold automatically');
    const [lo, hi] = fromSerial <= toSerial ? [fromSerial, toSerial] : [toSerial, fromSerial];
    const r = await db.resultPin.updateMany({
      where: { batchId: a.batchId, serial: { gte: lo, lte: hi }, status: 'UNSOLD' },
      data: { status: 'SOLD', soldAt: new Date(), soldVia: 'MANUAL', soldById: currentContext().userId ?? null, soldTo },
    });
    await this.audit.log({ action: 'result_pins.sold', entityType: 'ResultPinBatch', entityId: a.batchId, summary: `Recorded ${r.count} result-checker cards as sold (${lo}–${hi})${soldTo ? ` to ${soldTo}` : ''}` });
    return { sold: r.count };
  }

  async card(serial: string): Promise<PinCardDetail> {
    const pin = await this.prisma.db.resultPin.findFirst({ where: { serial }, include: { batch: true, student: true } });
    if (!pin) throw new NotFoundException('No card with that serial number');
    const [row] = await this.batchRows([pin.batch]);
    return {
      serial: pin.serial,
      last4: pin.last4,
      status: pin.status as PinCardDetail['status'],
      batch: { id: pin.batch.id, number: pin.batch.number, label: pin.batch.label, sessionName: row!.sessionName, termName: row!.termName, expiresOn: row!.expiresOn },
      soldAt: pin.soldAt?.toISOString() ?? null,
      soldVia: pin.soldVia,
      soldTo: pin.soldTo,
      student: pin.student ? { id: pin.student.id, name: fullName(pin.student), admissionNumber: pin.student.admissionNumber } : null,
      usesLeft: pin.usesLeft,
      usesPerPin: pin.batch.usesPerPin,
      failedAttempts: pin.failedAttempts,
      lockedUntil: pin.lockedUntil && pin.lockedUntil > new Date() ? pin.lockedUntil.toISOString() : null,
      voidReason: pin.voidReason,
      uses: await this.uses({ pinId: pin.id }),
    };
  }

  /** Support lookup by the last four digits of the PIN (parents read them out on the phone). */
  async findByLast4(last4: string) {
    const rows = await this.prisma.db.resultPin.findMany({ where: { last4 }, take: 20, orderBy: { serial: 'asc' }, include: { student: true } });
    return rows.map((p) => ({ serial: p.serial, status: p.status, usesLeft: p.usesLeft, student: p.student ? fullName(p.student) : null }));
  }

  async uses(where: { pinId?: string; batchId?: string }, take = 200): Promise<PinUseRow[]> {
    const rows = await this.prisma.db.resultPinUse.findMany({
      where: { ...(where.pinId ? { pinId: where.pinId } : {}), ...(where.batchId ? { pin: { batchId: where.batchId } } : {}) },
      orderBy: { createdAt: 'desc' },
      take,
      include: { pin: { select: { serial: true } }, student: true },
    });
    const terms = await this.prisma.db.term.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.termId))] } }, include: { session: { select: { name: true } } } });
    return rows.map((u) => {
      const t = terms.find((x) => x.id === u.termId);
      return {
        id: u.id,
        at: u.createdAt.toISOString(),
        serial: u.pin.serial,
        student: fullName(u.student),
        admissionNumber: u.student.admissionNumber,
        term: t ? `${t.name} · ${t.session.name}` : '—',
        channel: u.channel as 'WEB' | 'PORTAL',
        ipHash: u.ipHash,
      };
    });
  }

  async sales(): Promise<PinSaleRow[]> {
    const rows = await this.prisma.db.resultPinSale.findMany({ orderBy: { createdAt: 'desc' }, take: 200, include: { pin: { select: { serial: true } } } });
    return rows.map((s) => ({ id: s.id, reference: s.reference, at: (s.paidAt ?? s.createdAt).toISOString(), buyerName: s.buyerName, email: s.email, phone: s.phone, amountKobo: s.amountKobo, status: s.status as PinSaleRow['status'], serial: s.pin?.serial ?? null }));
  }

  // ================================================================ checking a result

  /** The school behind a public checker address; scopes this request to it. */
  async publicTenant(slug: string) {
    const t = await this.prisma.root.tenant.findUnique({ where: { slug }, select: { id: true, slug: true, name: true, logoUrl: true, status: true, currency: true } });
    if (!t || t.status === 'SUSPENDED' || t.status === 'ARCHIVED') throw new NotFoundException('This school was not found');
    if (isDemoSchoolSlug(t.slug) && !(await this.demo.effective()).publicHints) throw new NotFoundException('This school was not found');
    const ctx = RequestContextStore.get();
    if (ctx) ctx.tenantId = t.id;
    return t;
  }

  async publicInfo(slug: string): Promise<PublicPinInfo> {
    const t = await this.publicTenant(slug);
    const db = this.prisma.db;
    const now = new Date();
    const batches = await db.resultPinBatch.findMany({ where: { status: 'ACTIVE', expiresAt: { gt: now } } });
    const sessionIds = [...new Set(batches.map((b) => b.sessionId))];
    const anyTermSessions = new Set(batches.filter((b) => !b.termId).map((b) => b.sessionId));
    const termIds = new Set(batches.map((b) => b.termId).filter(Boolean));
    const terms = await db.term.findMany({ where: { sessionId: { in: sessionIds } }, include: { session: { select: { name: true } } }, orderBy: { startsOn: 'desc' } });
    const online = batches.filter((b) => b.channel === 'ONLINE');
    const ready = online.length ? await this.onlineReady(t.id) : false;
    const offers = ready
      ? await Promise.all(
          online.map(async (b) => {
            const available = (await db.resultPin.count({ where: { batchId: b.id, status: 'UNSOLD', sealed: { not: null } } })) > 0;
            const term = b.termId ? terms.find((x) => x.id === b.termId) : null;
            const session = terms.find((x) => x.sessionId === b.sessionId)?.session.name ?? '';
            return {
              batchId: b.id,
              title: b.label ?? (term ? `${term.name}, ${term.session.name}` : `Any term, ${session} session`),
              priceKobo: b.priceKobo,
              usesPerPin: b.usesPerPin,
              expiresOn: dateOnly(new Date(b.expiresAt.getTime() + 3600_000))!,
              available,
            };
          }),
        )
      : [];
    return {
      school: { name: t.name, logoUrl: t.logoUrl, slug: t.slug },
      enabled: batches.length > 0,
      terms: terms.filter((x) => anyTermSessions.has(x.sessionId) || termIds.has(x.id)).map((x) => ({ id: x.id, name: x.name, sessionName: x.session.name, isCurrent: x.isCurrent })),
      currency: t.currency,
      offers,
    };
  }

  ipHash(ip: string | undefined): string | null {
    if (!ip) return null;
    return createHmac('sha256', secretKey()).update(`ip:${ip}`).digest('hex').slice(0, 12);
  }

  private ipState(ip: string | undefined) {
    const key = ip ?? 'unknown';
    const s = this.ipFailures.get(key);
    if (s && Date.now() - s.since > IP_WINDOW_MS) {
      this.ipFailures.delete(key);
      return { key, count: 0 };
    }
    return { key, count: s?.count ?? 0 };
  }

  private recordIpFailure(ip: string | undefined) {
    const { key, count } = this.ipState(ip);
    const prev = this.ipFailures.get(key);
    this.ipFailures.set(key, { count: count + 1, since: prev?.since ?? Date.now() });
    if (this.ipFailures.size > 50_000) this.ipFailures.clear();
  }

  /** A simple sum, asked after a few wrong tries from the same address. */
  challenge(): PinChallenge {
    const a = randomInt(2, 10);
    const b = randomInt(2, 10);
    const exp = Date.now() + 10 * 60_000;
    const sig = createHmac('sha256', secretKey()).update(`challenge:${exp}:${a + b}`).digest('hex').slice(0, 32);
    return { question: `What is ${a} + ${b}?`, token: `${exp}.${sig}` };
  }

  private challengeOk(c: { token: string; answer: string } | null | undefined): boolean {
    if (!c) return false;
    const [exp, sig] = c.token.split('.');
    if (!exp || !sig || Number(exp) < Date.now()) return false;
    const want = createHmac('sha256', secretKey()).update(`challenge:${exp}:${Number(c.answer)}`).digest('hex').slice(0, 32);
    return want.length === sig.length && timingSafeEqual(Buffer.from(want), Buffer.from(sig));
  }

  /**
   * Checks a card and, when everything matches, returns the published report
   * card and uses one check. The first use binds the card to the student.
   * Wrong details never say whether an admission number exists.
   */
  async check(args: {
    serial: string;
    pin: string;
    termId: string;
    who: { admissionNumber: string; surname: string } | { studentId: string };
    channel: 'WEB' | 'PORTAL';
    challenge?: { token: string; answer: string } | null;
  }): Promise<PinCheckResult> {
    const tenantId = currentTenantId();
    const ctx = currentContext();
    const ip = ctx.ip;
    const db = this.prisma.db;
    const now = new Date();

    if (args.channel === 'WEB') {
      const { count } = this.ipState(ip);
      if (count >= IP_BLOCK_AFTER) throw new HttpException('Too many wrong attempts from this connection. Please try again in an hour, or contact the school office.', HttpStatus.TOO_MANY_REQUESTS);
      if (count >= IP_CHALLENGE_AFTER && !this.challengeOk(args.challenge)) {
        throw new BadRequestException({ statusCode: 400, code: 'CHALLENGE_REQUIRED', message: args.challenge ? 'That answer is not right. Try the new sum.' : 'Please answer the sum to continue.' });
      }
    }

    const pin = (await db.resultPin.findFirst({ where: { serial: args.serial }, include: { batch: true } })) as Pin | null;
    if (pin?.lockedUntil && pin.lockedUntil > now) {
      throw new HttpException(`This card is locked after too many wrong tries. Try again after ${pin.lockedUntil.toLocaleTimeString('en-GB', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit' })}, or ask the school office.`, HttpStatus.TOO_MANY_REQUESTS);
    }
    if (!pin || !sameHex(pin.pinHash, hashPin(tenantId, pin.serial, args.pin))) {
      if (pin) await this.cardFailure(pin);
      this.recordIpFailure(ip);
      throw new BadRequestException({ statusCode: 400, code: 'CARD_MISMATCH', message: CARD_MISMATCH });
    }

    // The card is genuine: its own state can be told plainly.
    if (pin.status === 'VOID' || pin.batch.status !== 'ACTIVE') throw new ForbiddenException({ statusCode: 403, code: 'CARD_VOID', message: 'This card has been cancelled by the school. Please contact the school office.' });
    if (pin.batch.expiresAt < now) throw new ForbiddenException({ statusCode: 403, code: 'CARD_EXPIRED', message: `This card expired on ${dateOnly(new Date(pin.batch.expiresAt.getTime() + 3600_000))}. Please buy a new card.` });
    if (pin.batch.requireSale && pin.status !== 'SOLD') throw new ForbiddenException({ statusCode: 403, code: 'CARD_NOT_SOLD', message: 'This card has not been activated by the school yet. Please contact the bursar.' });
    if (pin.usesLeft <= 0) throw new ForbiddenException({ statusCode: 403, code: 'CARD_USED_UP', message: `This card has been used ${pin.batch.usesPerPin} times, which is all its checks. Please buy a new card.` });
    const term = await db.term.findUnique({ where: { id: args.termId }, include: { session: { select: { name: true } } } });
    if (!term || term.sessionId !== pin.batch.sessionId || (pin.batch.termId && pin.batch.termId !== term.id)) {
      const forTerm = pin.batch.termId ? await db.term.findUnique({ where: { id: pin.batch.termId }, include: { session: { select: { name: true } } } }) : null;
      const forSession = forTerm ? null : await db.academicSession.findUnique({ where: { id: pin.batch.sessionId }, select: { name: true } });
      throw new BadRequestException({ statusCode: 400, code: 'CARD_WRONG_TERM', message: `This card is for ${forTerm ? `${forTerm.name}, ${forTerm.session.name}` : `the ${forSession?.name ?? ''} session`}. Choose that term.` });
    }

    // Now the student: every miss gets the same answer and counts as a wrong try.
    const student =
      'studentId' in args.who
        ? await db.student.findUnique({ where: { id: args.who.studentId } })
        : await db.student.findFirst({ where: { admissionNumber: { equals: args.who.admissionNumber.trim(), mode: 'insensitive' } } });
    const fail = async () => {
      await this.cardFailure(pin);
      if (args.channel === 'WEB') this.recordIpFailure(ip);
      throw new BadRequestException({ statusCode: 400, code: 'NO_RESULT', message: args.channel === 'PORTAL' ? this.portalMismatch(pin, student?.id) : GENERIC_MISMATCH });
    };
    if (!student || (pin.studentId && pin.studentId !== student.id)) return fail();
    if ('surname' in args.who && nameKey(args.who.surname) !== nameKey(student.lastName)) return fail();
    const card = await db.reportCard.findUnique({ where: { studentId_termId: { studentId: student.id, termId: term.id } } });
    if (card?.status !== 'PUBLISHED') return fail();
    if (await this.withheld(student.id)) return fail();

    const view: ReportCardView = await this.cards.view({ studentId: student.id, termId: term.id });
    const used = pin.studentId
      ? await db.resultPin.updateMany({ where: { id: pin.id, studentId: student.id, usesLeft: { gt: 0 } }, data: { usesLeft: { decrement: 1 }, lastUsedAt: now, failedAttempts: 0 } })
      : await db.resultPin.updateMany({ where: { id: pin.id, studentId: null, usesLeft: { gt: 0 } }, data: { usesLeft: { decrement: 1 }, lastUsedAt: now, failedAttempts: 0, studentId: student.id, boundAt: now } });
    if (!used.count) return fail();
    await db.resultPinUse.create({ data: { tenantId, pinId: pin.id, studentId: student.id, termId: term.id, channel: args.channel, ipHash: this.ipHash(ip), userId: ctx.userId ?? null } });
    // A public view must never offer editing.
    view.canEditPrincipalRemark = false;
    view.canEditTeacherRemark = false;
    return { view, card: { serial: pin.serial, usesLeft: pin.usesLeft - 1, expiresOn: dateOnly(new Date(pin.batch.expiresAt.getTime() + 3600_000))! } };
  }

  /** In the portal the parent is already verified, so they may be told why. */
  private portalMismatch(pin: Pin, studentId: string | undefined) {
    if (pin.studentId && pin.studentId !== studentId) return 'This card has already been used for another student. Each card works for one student only.';
    return 'This result is not available yet. Please contact the school office.';
  }

  private async cardFailure(pin: { id: string; failedAttempts: number }) {
    const failures = pin.failedAttempts + 1;
    await this.prisma.db.resultPin.update({
      where: { id: pin.id },
      data: failures >= CARD_FAILURES ? { failedAttempts: 0, lockedUntil: new Date(Date.now() + CARD_LOCK_MS) } : { failedAttempts: failures },
    });
  }

  /** Results held back while fees are owed (the school's portal setting) stay held here too. */
  private async withheld(studentId: string): Promise<boolean> {
    const s = await this.portalSettings();
    if (!s.withholdResultsWhenOwing) return false;
    const invoices = await this.prisma.db.invoice.findMany({ where: { studentId, status: { not: 'CANCELLED' } }, select: { totalKobo: true, paidKobo: true } });
    return invoices.some((i) => i.totalKobo > i.paidKobo);
  }

  async portalSettings(): Promise<PortalSettings> {
    const t = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: currentTenantId() }, select: { portalSettings: true } });
    return { ...DEFAULT_PORTAL_SETTINGS, ...((t.portalSettings as Partial<PortalSettings> | null) ?? {}) };
  }

  /** Has a PIN been used for this child and term (on the website or in the portal)? */
  async unlocked(studentId: string, termId: string): Promise<boolean> {
    return (await this.prisma.db.resultPinUse.count({ where: { studentId, termId } })) > 0;
  }

  async unlockedTerms(studentId: string): Promise<Set<string>> {
    const rows = await this.prisma.db.resultPinUse.findMany({ where: { studentId }, select: { termId: true }, distinct: ['termId'] });
    return new Set(rows.map((r) => r.termId));
  }

  // ================================================================ selling online

  async startPurchase(slug: string, input: { batchId: string; name: string; email: string; phone: string; returnPath: string }, origin: string): Promise<PinPurchaseStart> {
    const t = await this.publicTenant(slug);
    if (!(await this.onlineReady(t.id))) throw new BadRequestException('This school is not selling result cards online at the moment');
    const db = this.prisma.db;
    const b = await db.resultPinBatch.findUnique({ where: { id: input.batchId } });
    if (!b || b.channel !== 'ONLINE' || b.status !== 'ACTIVE' || b.expiresAt < new Date()) throw new BadRequestException('Those cards are not on sale');
    if (b.priceKobo < 100) throw new BadRequestException('This card has no price set. Please contact the school.');
    if (!(await db.resultPin.count({ where: { batchId: b.id, status: 'UNSOLD', sealed: { not: null } } }))) throw new BadRequestException('Sold out. Please contact the school office.');
    const phone = normalisePhone(input.phone);
    if (!phone) throw new BadRequestException({ statusCode: 400, message: 'Enter a Nigerian phone number like 0803 123 4567', errors: [{ path: 'phone', message: 'Enter a phone number like 0803 123 4567' }] });
    const reference = `${PIN_REFERENCE_PREFIX}${Date.now().toString(36)}-${randomBytes(5).toString('hex')}`.toUpperCase();
    const claim = randomBytes(16).toString('hex');
    await db.resultPinSale.create({
      data: { tenantId: t.id, batchId: b.id, reference, amountKobo: b.priceKobo, buyerName: input.name, email: input.email, phone, claimHash: createHash('sha256').update(claim).digest('hex'), delivery: { origin } },
    });
    const sep = input.returnPath.includes('?') ? '&' : '?';
    const { authorizationUrl } = await this.paystack.initialize(t.id, {
      email: input.email,
      amountKobo: b.priceKobo,
      reference,
      currency: t.currency,
      callbackUrl: `${origin}${input.returnPath}${sep}ref=${encodeURIComponent(reference)}&claim=${claim}`,
      metadata: { purpose: 'result-checker card', tenantId: t.id, batch: b.number },
    });
    return { authorizationUrl, reference, claim };
  }

  /** Settles an online sale exactly once (the webhook and the buyer's return may race). */
  async settle(tenantId: string, reference: string, via: 'webhook' | 'callback'): Promise<void> {
    const ctx = RequestContextStore.get();
    if (ctx) ctx.tenantId = tenantId;
    const root = this.prisma.root;
    const sale = await root.resultPinSale.findUnique({ where: { reference }, include: { batch: true } });
    if (!sale || sale.tenantId !== tenantId || sale.status !== 'PENDING') return;
    const tx = await this.paystack.verify(tenantId, reference);
    if (tx.status !== 'success') {
      if (['failed', 'abandoned', 'reversed'].includes(tx.status)) await root.resultPinSale.updateMany({ where: { id: sale.id, status: 'PENDING' }, data: { status: 'FAILED' } });
      return;
    }
    if (tx.amount < sale.amountKobo) {
      this.logger.error(`Result card sale ${reference}: Paystack amount ${tx.amount} below price ${sale.amountKobo}`);
      raiseAlert('payments', `pin-amount:${tenantId}`, 'A result-card payment did not match its price', `School ${tenantId}, reference ${reference}: Paystack reported a lower amount, so no PIN was issued.`);
      return;
    }
    const won = await root.resultPinSale.updateMany({ where: { id: sale.id, status: 'PENDING' }, data: { status: 'PAID', paidAt: tx.paid_at ? new Date(tx.paid_at) : new Date(), amountKobo: tx.amount } });
    if (!won.count) return;

    let pin: { id: string; serial: string; sealed: string } | null = null;
    for (let i = 0; i < 8 && !pin; i++) {
      const pick = await root.resultPin.findFirst({ where: { tenantId, batchId: sale.batchId, status: 'UNSOLD', sealed: { not: null } }, orderBy: { serial: 'asc' }, skip: i, select: { id: true, serial: true, sealed: true } });
      if (!pick) break;
      const got = await root.resultPin.updateMany({ where: { id: pick.id, status: 'UNSOLD' }, data: { status: 'SOLD', soldAt: new Date(), soldVia: 'ONLINE', soldTo: sale.buyerName } });
      if (got.count) pin = { id: pick.id, serial: pick.serial, sealed: pick.sealed! };
    }
    if (!pin) {
      await root.resultPinSale.update({ where: { id: sale.id }, data: { status: 'PAID_NO_CARD' } });
      raiseAlert('payments', `pin-soldout:${tenantId}`, 'A result card was paid for but none were left', `School ${tenantId}, reference ${reference}: generate more online cards and send one to ${sale.email}, or refund.`);
      await this.audit.log({ action: 'result_pins.sold_out', entityType: 'ResultPinSale', entityId: sale.id, tenantId, actorUserId: null, summary: `A result card was paid for online (${reference}) but the batch was sold out — send a card or refund` });
      return;
    }
    await root.resultPinSale.update({ where: { id: sale.id }, data: { pinId: pin.id, sealed: pin.sealed } });
    await root.resultPin.update({ where: { id: pin.id }, data: { sealed: null } });
    const delivered = await this.deliver(tenantId, sale, pin.serial, decryptSecret(pin.sealed));
    await root.resultPinSale.update({ where: { id: sale.id }, data: { delivery: delivered } });
    await this.audit.log({
      action: 'result_pins.sold_online',
      entityType: 'ResultPinSale',
      entityId: sale.id,
      tenantId,
      actorUserId: null,
      summary: `Sold result-checker card ${pin.serial} online for ${tx.amount / 100} via Paystack (${via})`,
    });
  }

  private async deliver(tenantId: string, sale: { buyerName: string; email: string; phone: string | null; batch: Batch; delivery: Prisma.JsonValue }, serial: string, pin: string) {
    const tenant = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true, slug: true, currency: true } });
    const expires = dateOnly(new Date(sale.batch.expiresAt.getTime() + 3600_000));
    const origin = (sale.delivery as { origin?: string } | null)?.origin ?? '';
    const url = `${origin}/check-result/${tenant.slug}`;
    const text = `${tenant.name} result checker. Serial: ${serial} PIN: ${formatPin(pin)}. ${sale.batch.usesPerPin} checks, valid till ${expires}. Check at ${url}`;
    const out = { origin, sms: false, email: false, smsError: null as string | null, emailError: null as string | null };
    let ch: Awaited<ReturnType<ChannelsService['load']>> | null = null;
    try {
      ch = await this.channels.load(tenantId);
      if (sale.phone && this.channels.configured(ch, 'SMS')) {
        await this.channels.sendSms(ch, sale.phone, text).then(
          () => (out.sms = true),
          (e: Error) => (out.smsError = e.message.slice(0, 200)),
        );
      }
      if (this.channels.configured(ch, 'EMAIL')) {
        const html = `<p>Dear ${escapeHtml(sale.buyerName)},</p><p>Thank you for buying a result-checker card from <strong>${escapeHtml(tenant.name)}</strong> (${escapeHtml(formatMoney(sale.batch.priceKobo, tenant.currency))}).</p>
<p style="font-size:18px">Serial number: <strong>${serial}</strong><br/>PIN: <strong style="letter-spacing:2px">${formatPin(pin)}</strong></p>
<p>The card can be used ${sale.batch.usesPerPin} times for one student and is valid until ${expires}. Check results at <a href="${url}">${url}</a> with the student's admission number.</p><p>Keep this PIN private.</p>`;
        await this.channels.sendEmail(ch, sale.email, `${tenant.name}: your result-checker PIN`, html, text, tenant.name).then(
          () => (out.email = true),
          (e: Error) => (out.emailError = e.message.slice(0, 200)),
        );
      }
    } catch (e) {
      this.logger.warn(`Could not send a result PIN for ${tenantId}: ${(e as Error).message}`);
    } finally {
      if (ch) this.channels.close(ch);
    }
    return out;
  }

  async purchase(slug: string, reference: string, claim: string): Promise<PinPurchaseResult> {
    const t = await this.publicTenant(slug);
    const db = this.prisma.db;
    let sale = await db.resultPinSale.findUnique({ where: { reference }, include: { batch: true } });
    const ok = sale && sameHex(sale.claimHash, createHash('sha256').update(claim).digest('hex'));
    if (!sale || !ok) throw new NotFoundException('We could not find that purchase');
    if (sale.status === 'PENDING') {
      await this.settle(t.id, reference, 'callback').catch((e: Error) => this.logger.warn(`Verify ${reference}: ${e.message}`));
      sale = await db.resultPinSale.findUniqueOrThrow({ where: { reference }, include: { batch: true } });
    }
    const delivery = (sale.delivery as { sms?: boolean; email?: boolean } | null) ?? {};
    const base = { usesPerPin: sale.batch.usesPerPin, expiresOn: dateOnly(new Date(sale.batch.expiresAt.getTime() + 3600_000)), delivered: { sms: !!delivery.sms, email: !!delivery.email } };
    if (sale.status === 'PAID' && sale.pinId) {
      const pin = await db.resultPin.findUniqueOrThrow({ where: { id: sale.pinId }, select: { serial: true } });
      const fresh = sale.paidAt && Date.now() - sale.paidAt.getTime() < REVEAL_MS && sale.sealed;
      return {
        status: 'PAID',
        serial: pin.serial,
        pin: fresh ? decryptSecret(sale.sealed!) : null,
        ...base,
        message: fresh ? 'Payment received. Here is your result-checker card — keep the PIN private.' : 'For your security the PIN is no longer shown here. Check the SMS or email we sent, or contact the school with the serial number.',
      };
    }
    if (sale.status === 'PAID_NO_CARD') return { status: 'PAID_NO_CARD', serial: null, pin: null, ...base, message: 'Payment received, but the cards ran out. The school has been told and will send you a card or a refund.' };
    if (sale.status === 'FAILED') return { status: 'FAILED', serial: null, pin: null, ...base, message: 'The payment did not go through. You have not been charged; please try again.' };
    return { status: 'PENDING', serial: null, pin: null, ...base, message: 'Your bank has not confirmed the payment yet. This page will update shortly.' };
  }
}

/** "Ọ̀kafọ̀r-Eze " → "okaforeze": case, spaces, hyphens, apostrophes and accents don't matter. */
export const nameKey = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
