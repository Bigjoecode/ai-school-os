import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import {
  AMBASSADOR_SETTINGS_KEY,
  AMBASSADOR_TERMS_VERSION,
  ambassadorSettingsSchema,
  commissionableKobo,
  normaliseNgPhone,
  referralCodeSchema,
  type AmbassadorApplyInput,
  type AmbassadorApplyResult,
  type AmbassadorCommissionRow,
  type AmbassadorDashboard,
  type AmbassadorOverview,
  type AmbassadorPublicConfig,
  type AmbassadorRow,
  type AmbassadorSettings,
  type AmbassadorStatus,
  type AmbassadorTotals,
  type BankDetailsInput,
  type CommissionStatus,
  type InvoiceLine,
  type ConsoleCommissionRow,
  type ConsolePayoutRow,
  type ConsoleReferralRow,
  type PayoutDueRow,
  type PayoutMarkPaidInput,
  type ReferralCodeCheck,
  type ReferralSchoolStatus,
} from '@aischool/shared';
import { Prisma } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { hashPassword } from '../auth/password';
import { decryptSecret, encryptSecret } from '../common/crypto-box';
import { env } from '../config/env';
import { addMonths, invoicePaidHooks } from '../console/billing.service';
import { platformRefundHooks } from '../commerce/commerce.service';
import { PrismaService } from '../prisma/prisma.service';
import { emailOperator, platformSender } from '../subscriptions/billing-state.service';

const CODE_TTL_MS = 30 * 60_000;
const MAX_CODE_ATTEMPTS = 5;
const MAX_CODES = 5;
const MAX_APPLICATIONS_PER_IP = 5;
const MAX_APPLICATIONS_PER_EMAIL = 3;
const DAY = 86_400_000;
const PROMOTE_MS = 60 * 60_000;

const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const money = (k: number) => `₦${(k / 100).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;
const firstNameOf = (full: string) => full.trim().split(/\s+/)[0] ?? full;
/** Spreadsheet formula injection: a cell starting with = + - @ is read as text. */
const csvCell = (v: unknown) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

type AmbassadorRecord = Prisma.AmbassadorGetPayload<object>;

/**
 * The ambassador referral programme.
 *
 * Auth model: an approved ambassador gets an ordinary User with no school
 * membership and no platform role. AuthService lets such a user sign in with
 * no school selected; the guard then refuses every school route ("Select a
 * school first"), so the only things they can reach are their profile and
 * the /ambassador endpoints, which look the ambassador up by the signed-in
 * user. Nothing here ever reads a school's data beyond its name, state and a
 * coarse billing status.
 */
@Injectable()
export class AmbassadorsService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(AmbassadorsService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    invoicePaidHooks.push((tenantId) => void this.onTenantPaid(tenantId).catch((e: Error) => this.logger.error(`Commission for ${tenantId} failed: ${e.message}`)));
    platformRefundHooks.push((refundId) => void this.onRefund(refundId).catch((e: Error) => this.logger.error(`Commission reversal for refund ${refundId} failed: ${e.message}`)));
    if (env().NODE_ENV === 'test') return;
    this.timer = setInterval(() => void Promise.all([this.promote(), this.purgeStale()]).catch((e: Error) => this.logger.error(`Commission promotion failed: ${e.message}`)), PROMOTE_MS);
    this.timer.unref();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  // ---------------------------------------------------------- settings

  async settings(): Promise<AmbassadorSettings> {
    const row = await this.prisma.root.platformSetting.findUnique({ where: { key: AMBASSADOR_SETTINGS_KEY } });
    const parsed = ambassadorSettingsSchema.safeParse(row?.value ?? {});
    return parsed.success ? parsed.data : ambassadorSettingsSchema.parse({});
  }

  async saveSettings(body: AmbassadorSettings, userId: string) {
    const before = await this.settings();
    await this.prisma.root.platformSetting.upsert({
      where: { key: AMBASSADOR_SETTINGS_KEY },
      create: { key: AMBASSADOR_SETTINGS_KEY, value: body as unknown as Prisma.InputJsonValue, updatedBy: userId },
      update: { value: body as unknown as Prisma.InputJsonValue, updatedBy: userId },
    });
    const changed = (Object.keys(body) as (keyof AmbassadorSettings)[]).filter((k) => JSON.stringify(body[k]) !== JSON.stringify(before[k]));
    await this.audit.log({
      tenantId: null,
      action: 'ambassador.settings',
      summary: `Updated ambassador programme settings: ${changed.map((k) => `${k} ${JSON.stringify(before[k])} → ${JSON.stringify(body[k])}`).join(', ') || 'no changes'}`,
      metadata: { before, after: body } as unknown as Prisma.InputJsonValue,
    });
    return this.settings();
  }

  private canEmail() {
    return !!platformSender() || env().NODE_ENV !== 'production';
  }

  async publicConfig(): Promise<AmbassadorPublicConfig> {
    const s = await this.settings();
    return { open: s.open && this.canEmail(), ratePct: s.ratePct, holdDays: s.holdDays, minPayoutKobo: s.minPayoutKobo, commissionMonths: s.commissionMonths, excludedLineKinds: s.excludedLineKinds };
  }

  private origin() {
    return (env().CORS_ORIGINS[0] ?? '').replace(/\/$/, '');
  }

  // ---------------------------------------------------------- notifications

  /** In the dashboard always; by email too when SMTP is set up. */
  private async notify(a: { id: string; email: string; fullName: string }, kind: string, title: string, body: string) {
    await this.prisma.root.ambassadorNotice.create({ data: { ambassadorId: a.id, kind, title, body } });
    const mail = platformSender();
    if (!mail) return;
    const text = `Dear ${firstNameOf(a.fullName)},\n\n${body}\n\nYour ambassador dashboard: ${this.origin()}/ambassador\n\nAI School OS`;
    await mail.send(a.email, title, text).catch((e: Error) => this.logger.warn(`Ambassador email (${kind}) failed: ${e.message}`));
  }

  // ---------------------------------------------------------- application

  private async sendCode(a: AmbassadorRecord, purpose: 'EMAIL' | 'BANK', origin: string): Promise<string | undefined> {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.prisma.root.ambassador.update({
      where: { id: a.id },
      data: { codeHash: sha(`${a.id}:${purpose}:${code}`), codePurpose: purpose, codeExpiresAt: new Date(Date.now() + CODE_TTL_MS), codeAttempts: 0, ...(purpose === 'EMAIL' ? { codesSent: { increment: 1 } } : {}) },
    });
    const mail = platformSender();
    if (mail) {
      const name = firstNameOf(a.fullName);
      const text =
        purpose === 'EMAIL'
          ? `Dear ${name},\n\nThank you for applying to be an AI School OS ambassador.\n\nYour confirmation code is: ${code}\n\nOr open this link to confirm your email:\n${origin}/ambassadors/verify?id=${encodeURIComponent(a.id)}&code=${code}\n\nThe code expires in 30 minutes. If you did not apply, you can ignore this email.\n\nAI School OS`
          : `Dear ${name},\n\nSomeone (hopefully you) asked to change the bank account your ambassador commission is paid into.\n\nYour confirmation code is: ${code}\n\nThe code expires in 30 minutes. If this was not you, do not share the code; sign in and change your password, and tell us.\n\nAI School OS`;
      try {
        await mail.send(a.email, purpose === 'EMAIL' ? `Your AI School OS ambassador code: ${code}` : `Confirm your new bank details: ${code}`, text);
      } catch (err) {
        this.logger.error(`Ambassador code email to ${a.email} failed: ${(err as Error).message}`);
        throw new BadRequestException('We could not send the confirmation email just now. Please try again in a few minutes.');
      }
      return undefined;
    }
    if (env().NODE_ENV === 'production') throw new BadRequestException('This is not available right now.');
    this.logger.warn(`[dev] Ambassador ${purpose} code for ${a.email}: ${code}`);
    return code;
  }

  private async checkCode(a: AmbassadorRecord, purpose: 'EMAIL' | 'BANK', code: string) {
    const wrong = () => new BadRequestException({ statusCode: 400, message: 'That code is not right, or it has expired', errors: [{ path: 'code', message: 'Check the code in the email' }] });
    if (!a.codeHash || !a.codeExpiresAt || a.codePurpose !== purpose) throw wrong();
    if (a.codeAttempts >= MAX_CODE_ATTEMPTS) throw new BadRequestException('Too many wrong codes. Ask for a new code.');
    if (a.codeExpiresAt < new Date()) throw new BadRequestException('That code has expired. Ask for a new code.');
    const x = Buffer.from(sha(`${a.id}:${purpose}:${code}`));
    const y = Buffer.from(a.codeHash);
    if (x.length !== y.length || !timingSafeEqual(x, y)) {
      await this.prisma.root.ambassador.update({ where: { id: a.id }, data: { codeAttempts: { increment: 1 } } });
      throw wrong();
    }
  }

  async apply(input: AmbassadorApplyInput, ip: string | undefined, origin: string): Promise<AmbassadorApplyResult> {
    const s = await this.settings();
    if (!s.open || !this.canEmail()) throw new BadRequestException('The ambassador programme is not taking applications at the moment.');
    if (input.website) return { id: `x${sha(input.email + Date.now()).slice(0, 24)}`, email: input.email };
    const since = new Date(Date.now() - DAY);
    const [byIp, byEmail] = await Promise.all([
      ip ? this.prisma.root.ambassador.count({ where: { ip, createdAt: { gte: since } } }) : 0,
      this.prisma.root.ambassador.count({ where: { email: input.email, createdAt: { gte: since } } }),
    ]);
    if (byIp >= MAX_APPLICATIONS_PER_IP || byEmail >= MAX_APPLICATIONS_PER_EMAIL) throw new HttpException('Too many applications today. Please try again tomorrow.', HttpStatus.TOO_MANY_REQUESTS);
    // One ambassador per email and per phone number (unconfirmed applications don't count).
    const clash = await this.prisma.root.ambassador.findFirst({ where: { status: { not: 'PENDING_VERIFICATION' }, OR: [{ email: input.email }, { phone: input.phone }] }, select: { email: true } });
    if (clash) {
      const path = clash.email === input.email ? 'email' : 'phone';
      throw new ConflictException({ statusCode: 409, message: 'There is already an ambassador application or account with these details. Sign in, or contact us if you need help.', errors: [{ path, message: 'Already registered' }] });
    }
    const staff = await this.prisma.root.user.findUnique({ where: { email: input.email }, select: { platformRole: true } });
    if (staff?.platformRole) throw new ConflictException({ statusCode: 409, message: 'This email cannot be used for an ambassador account.', errors: [{ path: 'email', message: 'Use another email' }] });
    await this.prisma.root.ambassador.deleteMany({ where: { email: input.email, status: 'PENDING_VERIFICATION' } });
    const row = await this.prisma.root.ambassador.create({
      data: {
        fullName: input.fullName,
        email: input.email,
        phone: input.phone,
        state: input.state,
        approach: input.approach,
        bankName: input.bank.bankName,
        accountNumberEnc: encryptSecret(input.bank.accountNumber),
        accountLast4: input.bank.accountNumber.slice(-4),
        accountName: input.bank.accountName,
        passwordHash: await hashPassword(input.password),
        termsVersion: AMBASSADOR_TERMS_VERSION,
        termsAcceptedAt: new Date(),
        ip: ip ?? null,
      },
    });
    const devCode = await this.sendCode(row, 'EMAIL', origin);
    return { id: row.id, email: row.email, ...(devCode ? { devCode } : {}) };
  }

  async resend(id: string, origin: string): Promise<AmbassadorApplyResult> {
    const row = await this.prisma.root.ambassador.findUnique({ where: { id } });
    if (!row || row.status !== 'PENDING_VERIFICATION') throw new NotFoundException('This application is already confirmed or has expired. Start again.');
    if (row.codesSent >= MAX_CODES) throw new HttpException('We have sent the most codes we can. Please try again tomorrow.', HttpStatus.TOO_MANY_REQUESTS);
    const devCode = await this.sendCode(row, 'EMAIL', origin);
    return { id: row.id, email: row.email, ...(devCode ? { devCode } : {}) };
  }

  async verify(id: string, code: string): Promise<{ status: AmbassadorStatus }> {
    const row = await this.prisma.root.ambassador.findUnique({ where: { id } });
    if (!row) throw new BadRequestException({ statusCode: 400, message: 'That code is not right, or it has expired', errors: [{ path: 'code', message: 'Check the code in the email' }] });
    if (row.status !== 'PENDING_VERIFICATION') return { status: row.status as AmbassadorStatus };
    await this.checkCode(row, 'EMAIL', code);
    const claimed = await this.prisma.root.ambassador.updateMany({ where: { id, status: 'PENDING_VERIFICATION' }, data: { status: 'PENDING_REVIEW', verifiedAt: new Date(), codeHash: null, codePurpose: null } });
    if (claimed.count) {
      await this.audit.log({ tenantId: null, actorUserId: null, action: 'ambassador.applied', entityType: 'Ambassador', entityId: id, summary: `${row.fullName} (${row.state}) applied to be an ambassador and is waiting for review` });
      emailOperator(`Ambassador application: ${row.fullName}`, [
        `${row.fullName} has applied to be an ambassador and is waiting for your approval.`,
        '',
        `Email: ${row.email} · phone: ${row.phone} · state: ${row.state}`,
        row.approach ? `How they'll find schools: ${row.approach}` : null,
      ]);
    }
    return { status: 'PENDING_REVIEW' };
  }

  /** Housekeeping: unconfirmed applications older than a week hold a password hash; remove them. */
  async purgeStale() {
    return (await this.prisma.root.ambassador.deleteMany({ where: { status: 'PENDING_VERIFICATION', createdAt: { lt: new Date(Date.now() - 7 * DAY) } } })).count;
  }

  // ---------------------------------------------------------- review (console)

  private async uniqueCode(fullName: string) {
    const letters = firstNameOf(fullName).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    const stem = letters.length >= 2 ? letters : `AMB${letters}`.slice(0, 4);
    for (let i = 0; i < 40; i++) {
      const code = `${stem}${i < 20 ? randomInt(10, 100) : randomInt(100, 1000)}`;
      if (!(await this.prisma.root.ambassador.findUnique({ where: { referralCode: code }, select: { id: true } }))) return code;
    }
    throw new ConflictException('Could not make a unique code; try again');
  }

  async approve(id: string, reviewerId: string) {
    const row = await this.prisma.root.ambassador.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Application not found');
    if (row.status !== 'PENDING_REVIEW') throw new BadRequestException('Only confirmed applications waiting for review can be approved');
    const parts = row.fullName.trim().split(/\s+/);
    const existing = await this.prisma.root.user.findUnique({ where: { email: row.email } });
    if (existing?.platformRole) throw new BadRequestException('This email belongs to a platform team account');
    if (existing && (await this.prisma.root.ambassador.findFirst({ where: { userId: existing.id }, select: { id: true } }))) throw new ConflictException('That person already has an ambassador account');
    const user =
      existing ??
      (await this.prisma.root.user.create({
        data: { email: row.email, passwordHash: row.passwordHash, firstName: parts[0] ?? row.fullName, lastName: parts.slice(1).join(' ') || '-', phone: row.phone },
      }));
    const code = await this.uniqueCode(row.fullName);
    const updated = await this.prisma.root.ambassador.update({
      where: { id },
      data: { status: 'ACTIVE', userId: user.id, referralCode: code, passwordHash: '', reviewedById: reviewerId, reviewedAt: new Date(), reviewNote: null },
    });
    await this.audit.log({ tenantId: null, action: 'ambassador.approved', entityType: 'Ambassador', entityId: id, summary: `Approved ambassador ${row.fullName} with code ${code}${existing ? ' (linked to their existing account)' : ''}` });
    const s = await this.settings();
    await this.notify(
      updated,
      'APPROVED',
      'You are now an AI School OS ambassador',
      `Welcome aboard. Your referral code is ${code}.\n\nShare this link with schools: ${this.origin()}/signup?ref=${code}\n(or for the free pilot: ${this.origin()}/pilot?ref=${code})\n\nYou earn ${s.ratePct}% of every subscription payment a school you refer makes${s.commissionMonths ? ` in its first ${s.commissionMonths} months` : ', for as long as it pays'}. Commissions become payable ${s.holdDays} days after each payment and are paid monthly once your balance reaches ${money(s.minPayoutKobo)}.\n\nSign in at ${this.origin()}/login with ${row.email}${existing ? ' and your existing password' : ' and the password you chose when you applied'}.`,
    );
    return { id, code, userId: user.id };
  }

  async decline(id: string, reason: string, reviewerId: string) {
    const row = await this.prisma.root.ambassador.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Application not found');
    if (row.status !== 'PENDING_REVIEW' && row.status !== 'PENDING_VERIFICATION') throw new BadRequestException('Only applications waiting for review can be declined');
    await this.prisma.root.ambassador.update({ where: { id }, data: { status: 'DECLINED', reviewNote: reason, reviewedById: reviewerId, reviewedAt: new Date(), passwordHash: '', codeHash: null } });
    await this.audit.log({ tenantId: null, action: 'ambassador.declined', entityType: 'Ambassador', entityId: id, summary: `Declined the ambassador application from ${row.fullName}: ${reason}` });
    const mail = platformSender();
    if (mail && row.verifiedAt) {
      const text = `Dear ${firstNameOf(row.fullName)},\n\nThank you for applying to be an AI School OS ambassador. We are not able to accept your application at the moment.\n\nReason: ${reason}\n\nIf you think this is a mistake, reply to this email.\n\nAI School OS`;
      await mail.send(row.email, 'Your AI School OS ambassador application', text).catch((e: Error) => this.logger.warn(`Decline email failed: ${e.message}`));
    }
  }

  async suspend(id: string, suspend: boolean, reason: string) {
    const row = await this.prisma.root.ambassador.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Ambassador not found');
    if (suspend && row.status !== 'ACTIVE') throw new BadRequestException('Only active ambassadors can be suspended');
    if (!suspend && row.status !== 'SUSPENDED') throw new BadRequestException('This ambassador is not suspended');
    await this.prisma.root.ambassador.update({ where: { id }, data: suspend ? { status: 'SUSPENDED', suspendedAt: new Date(), reviewNote: reason } : { status: 'ACTIVE', suspendedAt: null, reviewNote: null } });
    await this.audit.log({ tenantId: null, action: suspend ? 'ambassador.suspended' : 'ambassador.reinstated', entityType: 'Ambassador', entityId: id, summary: `${suspend ? 'Suspended' : 'Reinstated'} ambassador ${row.fullName}: ${reason}` });
    const s = await this.settings();
    await this.notify(
      row,
      suspend ? 'SUSPENDED' : 'REINSTATED',
      suspend ? 'Your ambassador account is suspended' : 'Your ambassador account is active again',
      suspend
        ? `Your ambassador account has been suspended. Reason: ${reason}\n\nWhile it is suspended, new payments by schools you referred do not earn commission${s.suspendedPayable === 'WITHHOLD' ? ', and your payable balance is held' : ''}. Reply to this email if you have questions.`
        : `Your ambassador account is active again. New payments by schools you referred earn commission as before.`,
    );
  }

  /** The operator may change a code once (e.g. to something memorable). Old links with the previous code stop working. */
  async setCode(id: string, raw: string) {
    const code = referralCodeSchema.parse(raw);
    const row = await this.prisma.root.ambassador.findUnique({ where: { id } });
    if (!row || !row.referralCode) throw new NotFoundException('Ambassador not found');
    if (row.codeChangedAt) throw new BadRequestException('This ambassador’s code has already been changed once');
    if (code === row.referralCode) return { code };
    if (await this.prisma.root.ambassador.findUnique({ where: { referralCode: code }, select: { id: true } })) {
      throw new ConflictException({ statusCode: 409, message: 'That code is taken', errors: [{ path: 'code', message: 'Already taken' }] });
    }
    await this.prisma.root.ambassador.update({ where: { id }, data: { referralCode: code, codeChangedAt: new Date() } });
    await this.audit.log({ tenantId: null, action: 'ambassador.code_changed', entityType: 'Ambassador', entityId: id, summary: `Changed ${row.fullName}’s referral code ${row.referralCode} → ${code}` });
    await this.notify(row, 'CODE_CHANGED', `Your referral code is now ${code}`, `Your referral code has changed from ${row.referralCode} to ${code}. Your new link: ${this.origin()}/signup?ref=${code}\n\nLinks with the old code no longer work, so please share the new one.`);
    return { code };
  }

  // ---------------------------------------------------------- referral codes and attribution

  private async activeByCode(raw: string | null | undefined) {
    if (!raw) return null;
    const parsed = referralCodeSchema.safeParse(raw);
    if (!parsed.success) return null;
    const a = await this.prisma.root.ambassador.findUnique({ where: { referralCode: parsed.data } });
    return a && a.status === 'ACTIVE' ? a : null;
  }

  async checkReferralCode(raw: string): Promise<ReferralCodeCheck> {
    const a = await this.activeByCode(raw);
    return { code: raw.trim().toUpperCase(), valid: !!a, firstName: a ? firstNameOf(a.fullName) : null };
  }

  private isSelf(a: { email: string; phone: string }, people: { email?: string | null; phone?: string | null }[]) {
    return people.some((p) => (p.email && p.email.toLowerCase() === a.email.toLowerCase()) || (p.phone && normaliseNgPhone(p.phone) === a.phone));
  }

  /** At sign-up: the ambassador for a valid code, unless they are referring themselves (then nothing, logged). Invalid codes are ignored. */
  async forSignup(code: string | undefined, admin: { email: string; phone: string }, schoolName: string): Promise<{ referralCode: string; ambassadorId: string } | null> {
    const a = await this.activeByCode(code);
    if (!a) return null;
    if (this.isSelf(a, [admin])) {
      await this.audit.log({ tenantId: null, actorUserId: null, action: 'ambassador.self_referral_blocked', entityType: 'Ambassador', entityId: a.id, summary: `Ignored referral code ${a.referralCode} on the sign-up for ${schoolName}: the school admin is the ambassador` });
      return null;
    }
    return { referralCode: a.referralCode!, ambassadorId: a.id };
  }

  private async fraudFlags(ambassadorId: string, ambassadorIp: string | null, school: { tenantId: string; ip?: string | null; adminPhone?: string | null }) {
    const flags: string[] = [];
    if (school.ip && ambassadorIp && school.ip === ambassadorIp) flags.push('SAME_IP_AS_AMBASSADOR');
    const others = await this.prisma.root.schoolSignup.findMany({ where: { ambassadorId, tenantId: { not: null }, NOT: { tenantId: school.tenantId } }, select: { ip: true, adminPhone: true } });
    const phone = school.adminPhone ? normaliseNgPhone(school.adminPhone) : null;
    if (phone && others.some((o) => normaliseNgPhone(o.adminPhone) === phone)) flags.push('SHARED_ADMIN_PHONE');
    if (school.ip && others.filter((o) => o.ip === school.ip).length >= 2) flags.push('MANY_SCHOOLS_SAME_IP');
    return flags;
  }

  /** When a referred sign-up becomes a school: one ambassador per school, first valid code wins. Best effort. */
  async attachSignup(tenantId: string, signup: { id: string; ambassadorId: string | null; referralCode: string | null; schoolName: string; adminEmail: string; adminPhone: string; ip: string | null; state: string }, pilot: boolean) {
    if (!signup.ambassadorId) return;
    const a = await this.prisma.root.ambassador.findUnique({ where: { id: signup.ambassadorId } });
    if (!a || a.status !== 'ACTIVE') return;
    if (this.isSelf(a, [{ email: signup.adminEmail, phone: signup.adminPhone }])) return;
    if (await this.prisma.root.tenantReferral.findUnique({ where: { tenantId }, select: { tenantId: true } })) return;
    const flags = await this.fraudFlags(a.id, a.ip, { tenantId, ip: signup.ip, adminPhone: signup.adminPhone });
    await this.prisma.root.tenantReferral.create({ data: { tenantId, ambassadorId: a.id, code: signup.referralCode ?? a.referralCode ?? '', source: 'SIGNUP', signupId: signup.id, flags } });
    await this.audit.log({ tenantId, actorUserId: null, action: 'ambassador.referral', entityType: 'TenantReferral', entityId: tenantId, summary: `${signup.schoolName} was referred by ambassador ${a.fullName} (${a.referralCode})${flags.length ? `; flagged: ${flags.join(', ')}` : ''}` });
    await this.notify(a, 'SCHOOL_SIGNED_UP', `${signup.schoolName} signed up with your code`, `${signup.schoolName} (${signup.state}) has joined AI School OS with your code, ${pilot ? 'as a free pilot school' : 'on a free trial'}. You earn commission on every subscription payment it makes.`);
  }

  /** Console: set, change or remove a school's ambassador (also for schools created in the console). */
  async assign(tenantId: string, ambassadorId: string | null, reason: string, userId: string) {
    const tenant = await this.prisma.root.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, email: true, phone: true } });
    if (!tenant) throw new NotFoundException('School not found');
    const current = await this.prisma.root.tenantReferral.findUnique({ where: { tenantId }, include: { ambassador: true } });
    if (!ambassadorId) {
      if (!current) return { ok: true };
      await this.prisma.root.tenantReferral.delete({ where: { tenantId } });
      await this.audit.log({ tenantId: null, action: 'ambassador.referral_removed', entityType: 'TenantReferral', entityId: tenantId, summary: `Removed ambassador ${current.ambassador.fullName} from ${tenant.name}: ${reason}` });
      return { ok: true };
    }
    const a = await this.prisma.root.ambassador.findUnique({ where: { id: ambassadorId } });
    if (!a || a.status !== 'ACTIVE') throw new BadRequestException('Choose an active ambassador');
    const members = await this.prisma.root.membership.findMany({ where: { tenantId, status: 'ACTIVE' }, select: { userId: true, user: { select: { email: true, phone: true } } } });
    if (this.isSelf(a, [{ email: tenant.email, phone: tenant.phone }, ...members.map((m) => m.user)]) || (a.userId && members.some((m) => m.userId === a.userId))) {
      throw new BadRequestException('Self-referral: this ambassador is the school’s contact or one of its users');
    }
    if (current?.ambassadorId === a.id) return { ok: true };
    const signup = await this.prisma.root.schoolSignup.findFirst({ where: { tenantId }, select: { ip: true, adminPhone: true } });
    const flags = await this.fraudFlags(a.id, a.ip, { tenantId, ip: signup?.ip, adminPhone: signup?.adminPhone ?? tenant.phone });
    // A new attribution starts now: only payments from here on earn this ambassador commission.
    await this.prisma.root.tenantReferral.upsert({
      where: { tenantId },
      create: { tenantId, ambassadorId: a.id, code: a.referralCode ?? '', source: 'CONSOLE', setById: userId, flags },
      update: { ambassadorId: a.id, code: a.referralCode ?? '', source: 'CONSOLE', setById: userId, flags, createdAt: new Date() },
    });
    await this.audit.log({
      tenantId: null,
      action: current ? 'ambassador.referral_changed' : 'ambassador.referral_set',
      entityType: 'TenantReferral',
      entityId: tenantId,
      summary: `${current ? `Changed ${tenant.name}’s ambassador from ${current.ambassador.fullName} to` : `Set ${tenant.name}’s ambassador to`} ${a.fullName}: ${reason}`,
    });
    await this.notify(a, 'SCHOOL_SIGNED_UP', `${tenant.name} is now credited to you`, `${tenant.name} has been added to your referred schools. You earn commission on its subscription payments from today.`);
    return { ok: true };
  }

  // ---------------------------------------------------------- commissions

  private async refundedKobo(paymentId: string) {
    const r = await this.prisma.root.refund.aggregate({ where: { sourceType: 'PLATFORM_PAYMENT', sourceId: paymentId, status: { not: 'FAILED' } }, _sum: { amountKobo: true } });
    return r._sum.amountKobo ?? 0;
  }

  /**
   * Called (via invoicePaidHooks) for every payment applied to a school's
   * invoice, part-payments included. Creates one commission per school
   * subscription payment received since the referral, idempotently (the
   * payment id is unique). The base is the payment's pro-rata share of the
   * invoice's commissionable lines: one-off setup fees (settings
   * excludedLineKinds, default SETUP_FEE) earn nothing, so a part-payment on an
   * invoice that is one-third setup fee counts two-thirds. Platform invoices
   * carry no VAT line today, and Paystack fees are the platform's cost, so
   * nothing else is deducted.
   */
  async onTenantPaid(tenantId: string) {
    const ref = await this.prisma.root.tenantReferral.findUnique({ where: { tenantId }, include: { ambassador: true, tenant: { select: { name: true } } } });
    if (!ref) return 0;
    if (ref.ambassador.status !== 'ACTIVE') {
      this.logger.log(`No commission for ${ref.tenant.name}: ambassador ${ref.ambassadorId} is ${ref.ambassador.status}`);
      return 0;
    }
    const payments = await this.prisma.root.platformPayment.findMany({
      where: { tenantId, status: 'SUCCESS', createdAt: { gte: ref.createdAt }, invoice: { domain: 'SCHOOL' } },
      select: { id: true, amountKobo: true, paidAt: true, createdAt: true, reference: true, invoice: { select: { amountKobo: true, lines: true } } },
      orderBy: { createdAt: 'asc' },
    });
    if (!payments.length) return 0;
    const done = new Set((await this.prisma.root.ambassadorCommission.findMany({ where: { paymentId: { in: payments.map((p) => p.id) } }, select: { paymentId: true } })).map((c) => c.paymentId));
    const s = await this.settings();
    const rateBp = Math.round(s.ratePct * 100);
    let created = 0;
    for (const p of payments) {
      if (done.has(p.id)) continue;
      const at = p.paidAt ?? p.createdAt;
      if (s.commissionMonths && at > addMonths(ref.createdAt, s.commissionMonths)) continue;
      const received = p.amountKobo - (await this.refundedKobo(p.id));
      const base = this.commissionBase(received, p.invoice, s);
      const amount = Math.floor((base * rateBp) / 10_000);
      if (base <= 0 || amount <= 0) {
        if (received > 0 && base <= 0) this.logger.log(`No commission on ${ref.tenant.name}'s payment ${p.reference}: it only covers excluded lines (${s.excludedLineKinds.join(', ')})`);
        continue;
      }
      const excludedNote = base < received ? ` (${money(received - base)} of the ${money(received)} paid was a one-off setup fee or other non-commissionable item)` : '';
      try {
        const c = await this.prisma.root.ambassadorCommission.create({
          data: { ambassadorId: ref.ambassadorId, tenantId, schoolName: ref.tenant.name, kind: 'COMMISSION', paymentId: p.id, baseKobo: base, rateBp, amountKobo: amount, status: 'PENDING', payableAt: new Date(Date.now() + s.holdDays * DAY) },
        });
        created++;
        await this.audit.log({ tenantId: null, actorUserId: null, action: 'ambassador.commission', entityType: 'AmbassadorCommission', entityId: c.id, summary: `Commission ${money(amount)} (${s.ratePct}% of ${money(base)}) to ${ref.ambassador.fullName} for ${ref.tenant.name}'s payment ${p.reference}${excludedNote}` });
        await this.notify(
          ref.ambassador,
          'COMMISSION',
          `You earned ${money(amount)} from ${ref.tenant.name}`,
          `${ref.tenant.name} made a subscription payment of ${money(base)}${excludedNote}. Your ${s.ratePct}% commission of ${money(amount)} becomes payable on ${new Date(c.payableAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}${s.holdDays ? ` (after a ${s.holdDays}-day hold)` : ''}.`,
        );
      } catch (err) {
        if ((err as { code?: string }).code === 'P2002') continue; // another hook got there first
        throw err;
      }
    }
    return created;
  }

  /** The commissionable part of a payment (see commissionableKobo): excluded invoice lines' share is left out. */
  private commissionBase(paymentKobo: number, invoice: { amountKobo: number; lines: unknown } | null, s: AmbassadorSettings): number {
    if (!invoice) return Math.max(0, paymentKobo);
    return commissionableKobo(paymentKobo, { amountKobo: invoice.amountKobo, lines: invoice.lines as InvoiceLine[] | null }, s.excludedLineKinds);
  }

  /** A school's payment was refunded: shrink or reverse its commission, or claw back what was already paid out. */
  async onRefund(refundId: string) {
    const r = await this.prisma.root.refund.findUnique({ where: { id: refundId } });
    if (!r || r.sourceType !== 'PLATFORM_PAYMENT') return;
    const c = await this.prisma.root.ambassadorCommission.findUnique({ where: { paymentId: r.sourceId }, include: { ambassador: true } });
    if (!c || c.status === 'REVERSED') return;
    const p = await this.prisma.root.platformPayment.findUniqueOrThrow({ where: { id: r.sourceId }, include: { invoice: { select: { amountKobo: true, lines: true } } } });
    // Same proportion as when the commission was made: only the commissionable share of what is left counts.
    const s = await this.settings();
    const fullBase = this.commissionBase(p.amountKobo, p.invoice, s);
    const base = this.commissionBase(Math.max(0, p.amountKobo - (await this.refundedKobo(p.id))), p.invoice, s);
    const shouldBe = Math.floor((base * c.rateBp) / 10_000);
    const why = `Payment refunded (${money(r.amountKobo)}): ${r.reason}`;
    if (c.status === 'PENDING' || c.status === 'PAYABLE') {
      if (shouldBe <= 0) await this.prisma.root.ambassadorCommission.update({ where: { id: c.id }, data: { status: 'REVERSED', reversedAt: new Date(), reason: why } });
      else await this.prisma.root.ambassadorCommission.update({ where: { id: c.id }, data: { baseKobo: base, amountKobo: shouldBe, reason: why } });
    } else {
      const clawed = await this.prisma.root.ambassadorCommission.aggregate({ where: { reversesId: c.id, status: { not: 'REVERSED' } }, _sum: { amountKobo: true } });
      const owed = c.amountKobo + (clawed._sum.amountKobo ?? 0) - shouldBe;
      if (owed <= 0) return;
      await this.prisma.root.ambassadorCommission.create({
        data: { ambassadorId: c.ambassadorId, tenantId: c.tenantId, schoolName: c.schoolName, kind: 'CLAWBACK', refundId: r.id, reversesId: c.id, baseKobo: -(fullBase - base), rateBp: c.rateBp, amountKobo: -owed, status: 'PAYABLE', payableAt: new Date(), reason: why },
      });
    }
    await this.audit.log({ tenantId: null, actorUserId: null, action: 'ambassador.commission_reversed', entityType: 'AmbassadorCommission', entityId: c.id, summary: `Commission for ${c.schoolName} adjusted after a refund: now ${money(shouldBe)} (${why})` });
    await this.notify(c.ambassador, 'REVERSED', `A commission from ${c.schoolName} was adjusted`, `${c.schoolName}'s payment was refunded, so the commission on it is now ${money(shouldBe)}${c.status === 'PAID' ? '. The difference will be deducted from your next payout' : ''}.`);
  }

  /** Operator: reverse a commission (fraud, a reversed transfer, a mistake). A paid one becomes a deduction from the next payout. */
  async reverse(id: string, reason: string, userId: string) {
    const c = await this.prisma.root.ambassadorCommission.findUnique({ where: { id }, include: { ambassador: true } });
    if (!c) throw new NotFoundException('Commission not found');
    if (c.status === 'REVERSED') throw new BadRequestException('Already reversed');
    if (c.status === 'PENDING' || c.status === 'PAYABLE') {
      await this.prisma.root.ambassadorCommission.update({ where: { id }, data: { status: 'REVERSED', reversedAt: new Date(), reason, createdById: c.createdById ?? userId } });
    } else {
      if (c.kind !== 'COMMISSION') throw new BadRequestException('A deduction that has been settled cannot be reversed');
      const clawed = await this.prisma.root.ambassadorCommission.aggregate({ where: { reversesId: c.id, status: { not: 'REVERSED' } }, _sum: { amountKobo: true } });
      const owed = c.amountKobo + (clawed._sum.amountKobo ?? 0);
      if (owed <= 0) throw new BadRequestException('This commission has already been taken back');
      await this.prisma.root.ambassadorCommission.create({
        data: { ambassadorId: c.ambassadorId, tenantId: c.tenantId, schoolName: c.schoolName, kind: 'CLAWBACK', reversesId: c.id, baseKobo: 0, rateBp: c.rateBp, amountKobo: -owed, status: 'PAYABLE', payableAt: new Date(), reason, createdById: userId },
      });
    }
    await this.audit.log({ tenantId: null, action: 'ambassador.commission_reversed', entityType: 'AmbassadorCommission', entityId: id, summary: `Reversed ${money(c.amountKobo)} commission (${c.schoolName}) for ${c.ambassador.fullName}: ${reason}` });
    await this.notify(c.ambassador, 'REVERSED', `A commission from ${c.schoolName} was reversed`, `Your ${money(c.amountKobo)} commission from ${c.schoolName} was reversed. Reason: ${reason}${c.status === 'PAID' ? '\n\nIt had already been paid, so it will be deducted from your next payout.' : ''}`);
  }

  /** Commissions past their hold become payable. Hourly, and before anything reads balances. */
  async promote() {
    return (await this.prisma.root.ambassadorCommission.updateMany({ where: { status: 'PENDING', payableAt: { lte: new Date() } }, data: { status: 'PAYABLE' } })).count;
  }

  private async totalsBy(where: Prisma.AmbassadorCommissionWhereInput): Promise<Map<string, AmbassadorTotals>> {
    const rows = await this.prisma.root.ambassadorCommission.groupBy({ by: ['ambassadorId', 'status'], where, _sum: { amountKobo: true } });
    const m = new Map<string, AmbassadorTotals>();
    for (const r of rows) {
      const t = m.get(r.ambassadorId) ?? { pendingKobo: 0, payableKobo: 0, paidKobo: 0, reversedKobo: 0 };
      const v = r._sum.amountKobo ?? 0;
      if (r.status === 'PENDING') t.pendingKobo += v;
      else if (r.status === 'PAYABLE') t.payableKobo += v;
      else if (r.status === 'PAID') t.paidKobo += v;
      else if (r.status === 'REVERSED') t.reversedKobo += v;
      m.set(r.ambassadorId, t);
    }
    return m;
  }

  private commissionRow(c: Prisma.AmbassadorCommissionGetPayload<object>): AmbassadorCommissionRow {
    return {
      id: c.id,
      schoolName: c.schoolName,
      kind: c.kind as 'COMMISSION' | 'CLAWBACK',
      baseKobo: c.baseKobo,
      ratePct: c.rateBp / 100,
      amountKobo: c.amountKobo,
      status: c.status as CommissionStatus,
      payableAt: c.payableAt.toISOString(),
      paidAt: c.paidAt?.toISOString() ?? null,
      reason: c.reason,
      createdAt: c.createdAt.toISOString(),
    };
  }

  // ---------------------------------------------------------- school statuses (name, state, coarse status only)

  private async schoolStatuses(tenantIds: string[]) {
    const [tenants, paid, signups] = await Promise.all([
      this.prisma.root.tenant.findMany({
        where: { id: { in: tenantIds } },
        select: { id: true, name: true, slug: true, status: true, trialEndsAt: true, billing: { select: { pilotStatus: true } }, subscriptions: { select: { status: true }, orderBy: { createdAt: 'desc' }, take: 1 } },
      }),
      this.prisma.root.platformPayment.groupBy({ by: ['tenantId'], where: { tenantId: { in: tenantIds }, status: 'SUCCESS' }, _count: { _all: true } }),
      this.prisma.root.schoolSignup.findMany({ where: { tenantId: { in: tenantIds } }, select: { tenantId: true, state: true } }),
    ]);
    const hasPaid = new Set(paid.map((p) => p.tenantId));
    const stateOf = new Map(signups.map((s) => [s.tenantId!, s.state]));
    const now = new Date();
    const out = new Map<string, { name: string; slug: string; state: string | null; status: ReferralSchoolStatus }>();
    for (const t of tenants) {
      const sub = t.subscriptions[0]?.status;
      let status: ReferralSchoolStatus;
      if (t.status === 'SUSPENDED' || t.status === 'ARCHIVED') status = 'LAPSED';
      else if (t.billing?.pilotStatus === 'ACTIVE') status = 'PILOT';
      else if (hasPaid.has(t.id)) status = sub === 'ACTIVE' ? 'PAYING' : 'LAPSED';
      else if (t.status === 'TRIAL') status = t.trialEndsAt && t.trialEndsAt < now ? 'LAPSED' : 'TRIAL';
      else if (sub === 'PAST_DUE' || sub === 'CANCELLED') status = 'LAPSED';
      else status = 'SETUP';
      out.set(t.id, { name: t.name, slug: t.slug, state: stateOf.get(t.id) ?? null, status });
    }
    return out;
  }

  // ---------------------------------------------------------- the ambassador's own area

  async byUser(userId: string) {
    const a = await this.prisma.root.ambassador.findUnique({ where: { userId } });
    if (!a || (a.status !== 'ACTIVE' && a.status !== 'SUSPENDED')) throw new NotFoundException('You do not have an ambassador account');
    return a;
  }

  async dashboard(userId: string): Promise<AmbassadorDashboard> {
    const a = await this.byUser(userId);
    await this.promote();
    const [s, refs, applied, commissions, payouts, notices, totals] = await Promise.all([
      this.settings(),
      this.prisma.root.tenantReferral.findMany({ where: { ambassadorId: a.id }, orderBy: { createdAt: 'desc' } }),
      this.prisma.root.schoolSignup.findMany({ where: { ambassadorId: a.id, tenantId: null, status: 'PENDING_REVIEW' }, select: { schoolName: true, state: true, createdAt: true } }),
      this.prisma.root.ambassadorCommission.findMany({ where: { ambassadorId: a.id }, orderBy: { createdAt: 'desc' }, take: 300 }),
      this.prisma.root.ambassadorPayout.findMany({ where: { ambassadorId: a.id }, orderBy: { createdAt: 'desc' }, take: 100 }),
      this.prisma.root.ambassadorNotice.findMany({ where: { ambassadorId: a.id }, orderBy: { createdAt: 'desc' }, take: 30 }),
      this.totalsBy({ ambassadorId: a.id }),
    ]);
    const statuses = await this.schoolStatuses(refs.map((r) => r.tenantId));
    const pending = a.pendingBank as { bankName?: string } | null;
    return {
      id: a.id,
      firstName: firstNameOf(a.fullName),
      fullName: a.fullName,
      email: a.email,
      phone: a.phone,
      state: a.state,
      status: a.status as AmbassadorStatus,
      code: a.referralCode ?? '',
      bank: { bankName: a.bankName, accountLast4: a.accountLast4, accountName: a.accountName, changePending: !!pending?.bankName && a.codePurpose === 'BANK' },
      settings: { open: s.open, ratePct: s.ratePct, holdDays: s.holdDays, minPayoutKobo: s.minPayoutKobo, commissionMonths: s.commissionMonths, excludedLineKinds: s.excludedLineKinds, suspendedPayable: s.suspendedPayable },
      totals: totals.get(a.id) ?? { pendingKobo: 0, payableKobo: 0, paidKobo: 0, reversedKobo: 0 },
      schools: [
        ...applied.map((x) => ({ name: x.schoolName, state: x.state, status: 'APPLIED' as const, referredAt: x.createdAt.toISOString() })),
        ...refs.flatMap((r) => {
          const t = statuses.get(r.tenantId);
          return t ? [{ name: t.name, state: t.state, status: t.status, referredAt: r.createdAt.toISOString() }] : [];
        }),
      ],
      commissions: commissions.map((c) => this.commissionRow(c)),
      payouts: payouts.map((p) => ({ id: p.id, amountKobo: p.amountKobo, commissionCount: p.commissionCount, reference: p.reference, paidOn: p.paidOn.toISOString().slice(0, 10), createdAt: p.createdAt.toISOString() })),
      notices: notices.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, read: !!n.readAt, createdAt: n.createdAt.toISOString() })),
      termsVersion: a.termsVersion,
      approvedAt: a.reviewedAt?.toISOString() ?? null,
    };
  }

  async markNoticesRead(userId: string) {
    const a = await this.byUser(userId);
    await this.prisma.root.ambassadorNotice.updateMany({ where: { ambassadorId: a.id, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }

  /** A change of bank details waits for a code sent to the ambassador's email. */
  async startBankChange(userId: string, input: BankDetailsInput, origin: string) {
    const a = await this.byUser(userId);
    await this.prisma.root.ambassador.update({
      where: { id: a.id },
      data: { pendingBank: { bankName: input.bankName, accountNumberEnc: encryptSecret(input.accountNumber), accountLast4: input.accountNumber.slice(-4), accountName: input.accountName } },
    });
    const devCode = await this.sendCode(a, 'BANK', origin);
    await this.audit.log({ tenantId: null, action: 'ambassador.bank_change_requested', entityType: 'Ambassador', entityId: a.id, summary: `${a.fullName} asked to change their bank details (new account ending ${input.accountNumber.slice(-4)}); code sent to their email` });
    return { email: a.email, ...(devCode ? { devCode } : {}) };
  }

  async confirmBankChange(userId: string, code: string) {
    const a = await this.byUser(userId);
    const pending = a.pendingBank as { bankName: string; accountNumberEnc: string; accountLast4: string; accountName: string } | null;
    if (!pending?.bankName) throw new BadRequestException('There is no change of bank details waiting');
    await this.checkCode(a, 'BANK', code);
    await this.prisma.root.ambassador.update({
      where: { id: a.id },
      data: { bankName: pending.bankName, accountNumberEnc: pending.accountNumberEnc, accountLast4: pending.accountLast4, accountName: pending.accountName, pendingBank: Prisma.DbNull, codeHash: null, codePurpose: null },
    });
    await this.audit.log({ tenantId: null, action: 'ambassador.bank_changed', entityType: 'Ambassador', entityId: a.id, summary: `${a.fullName} changed their bank details: ${a.bankName} ••${a.accountLast4} → ${pending.bankName} ••${pending.accountLast4}` });
    await this.notify(a, 'BANK_CHANGED', 'Your bank details were changed', `Your commission will now be paid to ${pending.bankName}, account ending ${pending.accountLast4} (${pending.accountName}). If you did not make this change, contact us at once.`);
    return { bankName: pending.bankName, accountLast4: pending.accountLast4, accountName: pending.accountName };
  }

  /** The ambassador's own data (their copy): the account number is shown as its last four digits. */
  async ownExport(ambassadorId: string, full: boolean) {
    const a = await this.prisma.root.ambassador.findUniqueOrThrow({ where: { id: ambassadorId } });
    const [refs, commissions, payouts, notices] = await Promise.all([
      this.prisma.root.tenantReferral.findMany({ where: { ambassadorId }, include: { tenant: { select: { name: true } } } }),
      this.prisma.root.ambassadorCommission.findMany({ where: { ambassadorId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.root.ambassadorPayout.findMany({ where: { ambassadorId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.root.ambassadorNotice.findMany({ where: { ambassadorId }, orderBy: { createdAt: 'asc' } }),
    ]);
    return {
      exportedAt: new Date().toISOString(),
      profile: {
        fullName: a.fullName,
        email: a.email,
        phone: a.phone,
        state: a.state,
        approach: a.approach,
        status: a.status,
        referralCode: a.referralCode,
        bank: { bankName: a.bankName, accountNumber: full ? decryptSecret(a.accountNumberEnc) : `••••••${a.accountLast4}`, accountName: a.accountName },
        termsVersion: a.termsVersion,
        termsAcceptedAt: a.termsAcceptedAt,
        appliedAt: a.createdAt,
        emailConfirmedAt: a.verifiedAt,
        approvedAt: a.reviewedAt,
        applicationIp: a.ip,
      },
      referredSchools: refs.map((r) => ({ school: r.tenant.name, since: r.createdAt, source: r.source })),
      commissions: commissions.map((c) => this.commissionRow(c)),
      payouts: payouts.map((p) => ({ amountKobo: p.amountKobo, reference: p.reference, paidOn: p.paidOn.toISOString().slice(0, 10) })),
      notices: notices.map((n) => ({ title: n.title, body: n.body, createdAt: n.createdAt })),
    };
  }

  // ---------------------------------------------------------- console lists

  async overview(): Promise<AmbassadorOverview> {
    await this.promote();
    const [settings, byStatus, referred, flagged, totalsRows, due] = await Promise.all([
      this.settings(),
      this.prisma.root.ambassador.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.root.tenantReferral.count(),
      this.prisma.root.tenantReferral.count({ where: { NOT: { flags: { isEmpty: true } } } }),
      this.prisma.root.ambassadorCommission.groupBy({ by: ['status'], _sum: { amountKobo: true } }),
      this.payoutsDue(),
    ]);
    const n = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
    const sum = (s: string) => totalsRows.find((t) => t.status === s)?._sum.amountKobo ?? 0;
    return {
      settings,
      counts: { pendingReview: n('PENDING_REVIEW'), active: n('ACTIVE'), suspended: n('SUSPENDED'), referredSchools: referred, flagged },
      totals: { pendingKobo: sum('PENDING'), payableKobo: sum('PAYABLE'), paidKobo: sum('PAID'), reversedKobo: sum('REVERSED') },
      dueCount: due.length,
      dueKobo: due.reduce((t, d) => t + d.payableKobo, 0),
    };
  }

  async list(status?: AmbassadorStatus): Promise<AmbassadorRow[]> {
    await this.promote();
    const rows = await this.prisma.root.ambassador.findMany({ where: status ? { status } : { status: { not: 'PENDING_VERIFICATION' } }, orderBy: { createdAt: 'desc' }, take: 500 });
    const ids = rows.map((r) => r.id);
    const [totals, refs] = await Promise.all([this.totalsBy({ ambassadorId: { in: ids } }), this.prisma.root.tenantReferral.findMany({ where: { ambassadorId: { in: ids } }, select: { ambassadorId: true, tenantId: true, flags: true } })]);
    const statuses = await this.schoolStatuses(refs.map((r) => r.tenantId));
    return rows.map((r) => {
      const t = totals.get(r.id) ?? { pendingKobo: 0, payableKobo: 0, paidKobo: 0, reversedKobo: 0 };
      const mine = refs.filter((x) => x.ambassadorId === r.id);
      return {
        id: r.id,
        status: r.status as AmbassadorStatus,
        fullName: r.fullName,
        email: r.email,
        phone: r.phone,
        state: r.state,
        approach: r.approach,
        bankName: r.bankName,
        accountLast4: r.accountLast4,
        accountName: r.accountName,
        code: r.referralCode,
        codeChangeable: !!r.referralCode && !r.codeChangedAt,
        hasLogin: !!r.userId,
        referrals: mine.length,
        payingSchools: mine.filter((x) => statuses.get(x.tenantId)?.status === 'PAYING').length,
        earnedKobo: t.pendingKobo + t.payableKobo + t.paidKobo,
        payableKobo: t.payableKobo,
        paidKobo: t.paidKobo,
        flags: mine.reduce((n, x) => n + x.flags.length, 0),
        reviewNote: r.reviewNote,
        verifiedAt: r.verifiedAt?.toISOString() ?? null,
        reviewedAt: r.reviewedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      };
    });
  }

  async referrals(): Promise<ConsoleReferralRow[]> {
    const refs = await this.prisma.root.tenantReferral.findMany({ include: { ambassador: { select: { id: true, fullName: true, referralCode: true, status: true } } }, orderBy: { createdAt: 'desc' }, take: 1000 });
    const statuses = await this.schoolStatuses(refs.map((r) => r.tenantId));
    const earned = await this.prisma.root.ambassadorCommission.groupBy({ by: ['tenantId', 'ambassadorId'], where: { tenantId: { in: refs.map((r) => r.tenantId) }, status: { not: 'REVERSED' } }, _sum: { amountKobo: true } });
    return refs.flatMap((r) => {
      const t = statuses.get(r.tenantId);
      if (!t) return [];
      return [
        {
          tenantId: r.tenantId,
          schoolName: t.name,
          slug: t.slug,
          state: t.state,
          status: t.status,
          ambassador: { id: r.ambassador.id, name: r.ambassador.fullName, code: r.ambassador.referralCode, status: r.ambassador.status as AmbassadorStatus },
          source: r.source as 'SIGNUP' | 'CONSOLE',
          flags: r.flags,
          earnedKobo: earned.find((e) => e.tenantId === r.tenantId && e.ambassadorId === r.ambassadorId)?._sum.amountKobo ?? 0,
          createdAt: r.createdAt.toISOString(),
        },
      ];
    });
  }

  /** Schools for the "set ambassador" dialog: name or portal address. */
  async schoolSearch(q: string) {
    const rows = await this.prisma.root.tenant.findMany({
      where: q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { slug: { contains: q.toLowerCase() } }] } : {},
      select: { id: true, name: true, slug: true, referral: { select: { ambassador: { select: { id: true, fullName: true } } } } },
      orderBy: { name: 'asc' },
      take: 20,
    });
    return rows.map((t) => ({ id: t.id, name: t.name, slug: t.slug, ambassador: t.referral ? { id: t.referral.ambassador.id, name: t.referral.ambassador.fullName } : null }));
  }

  async commissions(f: { status?: CommissionStatus; ambassadorId?: string; tenantId?: string }): Promise<ConsoleCommissionRow[]> {
    await this.promote();
    const rows = await this.prisma.root.ambassadorCommission.findMany({
      where: { ...(f.status ? { status: f.status } : {}), ...(f.ambassadorId ? { ambassadorId: f.ambassadorId } : {}), ...(f.tenantId ? { tenantId: f.tenantId } : {}) },
      include: { ambassador: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });
    return rows.map((c) => ({ ...this.commissionRow(c), ambassador: { id: c.ambassador.id, name: c.ambassador.fullName }, tenantId: c.tenantId, paymentId: c.paymentId, payoutId: c.payoutId }));
  }

  // ---------------------------------------------------------- payouts

  async payoutsDue(): Promise<PayoutDueRow[]> {
    await this.promote();
    const s = await this.settings();
    const sums = await this.prisma.root.ambassadorCommission.groupBy({ by: ['ambassadorId'], where: { status: 'PAYABLE' }, _sum: { amountKobo: true }, _count: { _all: true } });
    const amb = await this.prisma.root.ambassador.findMany({ where: { id: { in: sums.map((x) => x.ambassadorId) } } });
    return sums
      .flatMap((x) => {
        const a = amb.find((y) => y.id === x.ambassadorId);
        const total = x._sum.amountKobo ?? 0;
        if (!a || total <= 0 || total < s.minPayoutKobo) return [];
        if (a.status === 'SUSPENDED' && s.suspendedPayable === 'WITHHOLD') return [];
        if (a.status !== 'ACTIVE' && a.status !== 'SUSPENDED') return [];
        return [{ ambassadorId: a.id, name: a.fullName, email: a.email, phone: a.phone, bankName: a.bankName, accountLast4: a.accountLast4, accountName: a.accountName, payableKobo: total, commissionCount: x._count._all, status: a.status as AmbassadorStatus }];
      })
      .sort((p, q) => q.payableKobo - p.payableKobo);
  }

  async payoutHistory(): Promise<ConsolePayoutRow[]> {
    const rows = await this.prisma.root.ambassadorPayout.findMany({ include: { ambassador: { select: { id: true, fullName: true } } }, orderBy: { createdAt: 'desc' }, take: 500 });
    return rows.map((p) => ({ id: p.id, amountKobo: p.amountKobo, commissionCount: p.commissionCount, reference: p.reference, paidOn: p.paidOn.toISOString().slice(0, 10), createdAt: p.createdAt.toISOString(), note: p.note, ambassador: { id: p.ambassador.id, name: p.ambassador.fullName } }));
  }

  /** The bank transfer list. Account numbers are decrypted only here; super admin only, audit-logged. */
  async payoutCsv(userId: string) {
    const due = await this.payoutsDue();
    const full = await this.prisma.root.ambassador.findMany({ where: { id: { in: due.map((d) => d.ambassadorId) } }, select: { id: true, accountNumberEnc: true } });
    const header = ['Ambassador', 'Email', 'Phone', 'Bank', 'Account number', 'Account name', 'Amount (NGN)', 'Commissions', 'Narration'];
    const month = new Date().toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
    const lines = [header.map(csvCell).join(',')];
    for (const d of due) {
      const enc = full.find((f) => f.id === d.ambassadorId)!.accountNumberEnc;
      lines.push([d.name, d.email, d.phone, d.bankName, decryptSecret(enc), d.accountName, (d.payableKobo / 100).toFixed(2), d.commissionCount, `AI School OS ambassador commission ${month}`].map(csvCell).join(','));
    }
    await this.audit.log({
      tenantId: null,
      actorUserId: userId,
      action: 'ambassador.payout_export',
      summary: `Exported the ambassador payout list with bank account numbers: ${due.length} ambassador${due.length === 1 ? '' : 's'}, ${money(due.reduce((t, d) => t + d.payableKobo, 0))}`,
      metadata: { ambassadorIds: due.map((d) => d.ambassadorId) },
    });
    return lines.join('\r\n') + '\r\n';
  }

  async markPaid(input: PayoutMarkPaidInput, userId: string) {
    const s = await this.settings();
    const a = await this.prisma.root.ambassador.findUnique({ where: { id: input.ambassadorId } });
    if (!a) throw new NotFoundException('Ambassador not found');
    if (a.status === 'SUSPENDED' && s.suspendedPayable === 'WITHHOLD') throw new ForbiddenException('This ambassador is suspended and their balance is withheld');
    await this.promote();
    const payout = await this.prisma.root.$transaction(async (tx) => {
      const rows = await tx.ambassadorCommission.findMany({ where: { ambassadorId: a.id, status: 'PAYABLE' }, select: { id: true, amountKobo: true } });
      const total = rows.reduce((t, r) => t + r.amountKobo, 0);
      if (total <= 0) throw new BadRequestException('Nothing is payable to this ambassador');
      if (total !== input.expectedKobo) throw new ConflictException(`The payable balance is now ${money(total)}, not ${money(input.expectedKobo)}. Refresh and check before marking it paid.`);
      const p = await tx.ambassadorPayout.create({ data: { ambassadorId: a.id, amountKobo: total, commissionCount: rows.length, reference: input.reference, paidOn: new Date(`${input.paidOn}T00:00:00Z`), note: input.note ?? null, createdById: userId } });
      const flipped = await tx.ambassadorCommission.updateMany({ where: { id: { in: rows.map((r) => r.id) }, status: 'PAYABLE' }, data: { status: 'PAID', paidAt: new Date(), payoutId: p.id } });
      if (flipped.count !== rows.length) throw new ConflictException('The balance changed while saving; try again');
      return p;
    });
    await this.audit.log({ tenantId: null, action: 'ambassador.payout', entityType: 'AmbassadorPayout', entityId: payout.id, summary: `Paid ${a.fullName} ${money(payout.amountKobo)} for ${payout.commissionCount} commission${payout.commissionCount === 1 ? '' : 's'} (ref ${input.reference}, ${input.paidOn})` });
    await this.notify(a, 'PAYOUT', `We paid you ${money(payout.amountKobo)}`, `We have sent ${money(payout.amountKobo)} to ${a.bankName}, account ending ${a.accountLast4}, on ${input.paidOn} (reference ${input.reference}). It covers ${payout.commissionCount} commission${payout.commissionCount === 1 ? '' : 's'}.\n\nYou are responsible for declaring this income for tax.`);
    return { id: payout.id, amountKobo: payout.amountKobo, commissionCount: payout.commissionCount };
  }
}
