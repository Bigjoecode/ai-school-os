import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import {
  isDemoSchoolSlug,
  READ_ONLY_CODE,
  SELF_SERVE_SETTINGS_KEY,
  selfServeSettingsSchema,
  type BillingStatus,
  type PlatformRole,
  type SelfServeSettings,
} from '@aischool/shared';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

const DAY = 86_400_000;
const SETTINGS_TTL = 15_000;
const STATE_TTL = 30_000;

/**
 * Writes a school may still make while it is read-only: signing in and out,
 * paying (or asking about) the bill, notifications, and privacy/consent
 * actions (the law gives parents those rights whatever the school owes),
 * parents' own purchases, and unlocking published results.
 * Paths are after the /api prefix.
 */
const READ_ONLY_ALLOWED = [
  /^\/auth(\/|$)/,
  /^\/billing(\/|$)/,
  /^\/support\//,
  /^\/notifications\//,
  /^\/push\//,
  /^\/cron\//,
  /^\/data-protection\//,
  // Parents: their own purchases from the platform, consent, and unlocking published results.
  /^\/family(\/|$)/,
  /^\/portal\/students\/[^/]+\/results\/[^/]+\/unlock$/,
];

/** The platform's own email (sign-up codes, trial reminders): the SMTP_* settings, without needing ALERT_EMAIL. */
export function platformSender() {
  const e = env();
  if (!e.SMTP_HOST) return null;
  const transport = nodemailer.createTransport({
    host: e.SMTP_HOST,
    port: e.SMTP_PORT,
    secure: e.SMTP_PORT === 465,
    auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD } : undefined,
    connectionTimeout: 15_000,
  });
  const from = e.SMTP_FROM ?? e.SMTP_USER ?? `no-reply@${e.SMTP_HOST}`;
  return {
    async send(to: string, subject: string, text: string) {
      try {
        await transport.sendMail({ from, to, subject, text });
      } finally {
        transport.close();
      }
    },
  };
}

/**
 * Where a school stands with the platform (trial, grace, read-only), worked out
 * from its records each time rather than stored, so a payment brings a school
 * straight back. Cached briefly because the guard asks on every write.
 */
@Injectable()
export class BillingStateService {
  private readonly logger = new Logger(BillingStateService.name);
  private settingsCache: { at: number; value: SelfServeSettings } | null = null;
  private cache = new Map<string, { at: number; status: BillingStatus }>();

  constructor(private readonly prisma: PrismaService) {}

  async settings(): Promise<SelfServeSettings> {
    if (this.settingsCache && Date.now() - this.settingsCache.at < SETTINGS_TTL) return this.settingsCache.value;
    const row = await this.prisma.root.platformSetting.findUnique({ where: { key: SELF_SERVE_SETTINGS_KEY } });
    const parsed = selfServeSettingsSchema.safeParse(row?.value ?? {});
    const value = parsed.success ? parsed.data : selfServeSettingsSchema.parse({});
    this.settingsCache = { at: Date.now(), value };
    return value;
  }

  async saveSettings(value: SelfServeSettings, userId: string) {
    await this.prisma.root.platformSetting.upsert({ where: { key: SELF_SERVE_SETTINGS_KEY }, update: { value, updatedBy: userId }, create: { key: SELF_SERVE_SETTINGS_KEY, value, updatedBy: userId } });
    this.settingsCache = null;
    this.cache.clear();
  }

  invalidate(tenantId?: string) {
    if (tenantId) this.cache.delete(tenantId);
    else this.cache.clear();
  }

  /** Billing rules apply: per-school switch, else self-serve schools, else the platform-wide switch. Demo schools never. */
  enforcedFor(t: { slug: string }, tb: { enforced: boolean | null; selfServe: boolean } | null, s: SelfServeSettings) {
    if (isDemoSchoolSlug(t.slug)) return false;
    if (tb?.enforced != null) return tb.enforced;
    return tb?.selfServe ? true : s.enforceAll;
  }

  async status(tenantId: string, fresh = false): Promise<BillingStatus> {
    const hit = this.cache.get(tenantId);
    if (!fresh && hit && Date.now() - hit.at < STATE_TTL) return hit.status;
    const status = await this.compute(tenantId);
    this.cache.set(tenantId, { at: Date.now(), status });
    return status;
  }

  private async compute(tenantId: string): Promise<BillingStatus> {
    const [tenant, tb, s] = await Promise.all([
      this.prisma.root.tenant.findUnique({ where: { id: tenantId }, select: { slug: true, status: true, trialEndsAt: true } }),
      this.prisma.root.tenantBilling.findUnique({ where: { tenantId }, select: { enforced: true, selfServe: true } }),
      this.settings(),
    ]);
    const trialEndsAt = tenant?.trialEndsAt?.toISOString() ?? null;
    const ok: BillingStatus = { state: 'OK', enforced: false, trialEndsAt, readOnlyAt: null, daysLeft: null, reason: null };
    if (!tenant) return ok;
    const enforced = this.enforcedFor(tenant, tb, s);
    if (!enforced || tenant.status === 'SUSPENDED' || tenant.status === 'ARCHIVED') return { ...ok, enforced };
    const now = Date.now();

    let lapse: { at: Date; reason: BillingStatus['reason'] } | null = null;
    if (tenant.status === 'TRIAL' && tenant.trialEndsAt) {
      if (tenant.trialEndsAt.getTime() > now) {
        return { ...ok, enforced, state: 'TRIAL', daysLeft: Math.ceil((tenant.trialEndsAt.getTime() - now) / DAY) };
      }
      lapse = { at: tenant.trialEndsAt, reason: 'TRIAL_ENDED' };
    } else {
      const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
      const overdue = await this.prisma.root.platformInvoice.findFirst({
        where: { tenantId, status: 'OPEN', domain: 'SCHOOL', dueDate: { lt: today } },
        orderBy: { dueDate: 'asc' },
        select: { dueDate: true },
      });
      // An invoice is overdue from the end of its due date.
      if (overdue) lapse = { at: new Date(overdue.dueDate.getTime() + DAY), reason: 'INVOICE_OVERDUE' };
    }
    if (!lapse) return { ...ok, enforced };
    const readOnlyAt = new Date(lapse.at.getTime() + s.graceDays * DAY);
    const graceLeft = Math.ceil((readOnlyAt.getTime() - now) / DAY);
    return {
      state: graceLeft > 0 ? 'GRACE' : 'READ_ONLY',
      enforced,
      trialEndsAt,
      readOnlyAt: readOnlyAt.toISOString(),
      daysLeft: graceLeft > 0 ? graceLeft : 0,
      reason: lapse.reason,
    };
  }

  /** Called by the auth guard: a read-only school may read everything but change only a few things. */
  async assertWritable(method: string, path: string, tenantId: string | null | undefined, platformRole: PlatformRole | null) {
    if (!tenantId || platformRole) return;
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;
    const p = path.replace(/^\/api(?=\/)/, '');
    if (READ_ONLY_ALLOWED.some((r) => r.test(p))) return;
    const st = await this.status(tenantId);
    if (st.state !== 'READ_ONLY') return;
    throw new ForbiddenException({
      statusCode: 403,
      code: READ_ONLY_CODE,
      message:
        st.reason === 'TRIAL_ENDED'
          ? 'Your school’s free trial has ended, so the account is read-only. Everything is still here: a school admin can choose a plan and pay in Settings → Billing to carry on.'
          : 'Your school’s subscription is overdue, so the account is read-only. Everything is still here: a school admin can pay in Settings → Billing to carry on.',
    });
  }
}
