import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import {
  isDemoSchoolSlug,
  lagosDate,
  PILOT_DETAIL,
  PILOT_PLACE_STATUSES,
  PILOT_REMINDER_DAYS,
  PILOT_SETTINGS_KEY,
  pilotEndDate,
  pilotEndsAtFromDate,
  pilotSettingsSchema,
  pilotTermsText,
  priceQuote,
  type PilotActionInput,
  type PilotCandidate,
  type PilotOverview,
  type PilotPublic,
  type PilotSchoolRow,
  type PilotSettings,
  type PilotStatus,
  type SchoolTypeKey,
} from '@aischool/shared';
import { AuditService } from '../audit/audit.service';
import { env } from '../config/env';
import { addMonths, invoicePaidHooks, PlatformBillingService } from '../console/billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { SuccessService } from '../success/success.service';
import { BillingStateService, platformSender } from './billing-state.service';

const DAY = 86_400_000;
const SETTINGS_TTL = 15_000;
const today = () => new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;
const fmt = (d: Date) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' }).format(d);
/** Serialises "is there a place left?" + "take it" across requests (and API instances). */
const PLACES_LOCK = 20_261_012;

/**
 * The free pilot programme (see packages/shared/src/pilot.ts): places, the
 * public offer, enrolling schools (from an approved application or from the
 * console), changing a school's pilot, the reminders before it ends and the
 * move to normal billing when it does.
 */
@Injectable()
export class PilotService implements OnModuleInit {
  private readonly logger = new Logger(PilotService.name);
  private settingsCache: { at: number; value: PilotSettings } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly state: BillingStateService,
    private readonly billing: PlatformBillingService,
    private readonly success: SuccessService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    // A pilot school that pays for its first term has converted.
    invoicePaidHooks.push((tenantId) => void this.markConverted(tenantId));
  }

  private async markConverted(tenantId: string) {
    try {
      const paid = await this.prisma.root.platformInvoice.count({ where: { tenantId, status: 'PAID', subscriptionId: { not: null } } });
      if (!paid) return;
      const r = await this.prisma.root.tenantBilling.updateMany({ where: { tenantId, pilotStatus: { in: ['ACTIVE', 'ENDED'] } }, data: { pilotStatus: 'CONVERTED' } });
      if (r.count) await this.audit.log({ tenantId, actorUserId: null, action: 'pilot.converted', entityType: 'Tenant', entityId: tenantId, summary: 'Pilot school paid for its first term (converted to paid)' });
    } catch (err) {
      this.logger.warn(`Marking pilot ${tenantId} converted failed: ${(err as Error).message}`);
    }
  }

  // ---------------------------------------------------------------- settings and places

  async settings(): Promise<PilotSettings> {
    if (this.settingsCache && Date.now() - this.settingsCache.at < SETTINGS_TTL) return this.settingsCache.value;
    const row = await this.prisma.root.platformSetting.findUnique({ where: { key: PILOT_SETTINGS_KEY } });
    const parsed = pilotSettingsSchema.safeParse(row?.value ?? {});
    const value = parsed.success ? parsed.data : pilotSettingsSchema.parse({});
    this.settingsCache = { at: Date.now(), value };
    return value;
  }

  async saveSettings(value: PilotSettings, userId: string) {
    const before = await this.settings();
    await this.prisma.root.platformSetting.upsert({ where: { key: PILOT_SETTINGS_KEY }, update: { value, updatedBy: userId }, create: { key: PILOT_SETTINGS_KEY, value, updatedBy: userId } });
    this.settingsCache = null;
    await this.audit.log({ tenantId: null, actorUserId: userId, action: 'pilot.settings', summary: `Pilot settings: ${value.open ? 'open' : 'closed'}, ${value.places} places (was ${before.open ? 'open' : 'closed'}, ${before.places})` });
    return this.settings();
  }

  async used(): Promise<number> {
    return this.prisma.root.tenantBilling.count({ where: { pilotStatus: { in: PILOT_PLACE_STATUSES } } });
  }

  /** The public offer. `canApply` is false where sign-up email cannot be sent. */
  async publicInfo(canApply = true): Promise<PilotPublic> {
    const [s, used] = await Promise.all([this.settings(), this.used()]);
    const placesLeft = Math.max(0, s.places - used);
    return {
      open: s.open && placesLeft > 0 && canApply,
      places: s.places,
      placesLeft,
      termsText: pilotTermsText(s.places, placesLeft),
      detail: PILOT_DETAIL,
      applyPath: '/pilot',
    };
  }

  /** Applications are accepted now (checked again, under a lock, when a place is actually taken). */
  async accepting() {
    const [s, used] = await Promise.all([this.settings(), this.used()]);
    return s.open && used < s.places;
  }

  async placesLeft() {
    const [s, used] = await Promise.all([this.settings(), this.used()]);
    return Math.max(0, s.places - used);
  }

  // ---------------------------------------------------------------- dates

  /** The calculated pilot end date for a school joining on `from`: its own terms when set up, else the typical calendar. */
  async proposedEnd(tenantId: string | null, from = new Date()) {
    const terms = tenantId
      ? await this.prisma.root.term.findMany({ where: { tenantId }, select: { startsOn: true, endsOn: true } })
      : [];
    return pilotEndDate(
      lagosDate(from),
      terms.map((t) => ({ startsOn: t.startsOn.toISOString().slice(0, 10), endsOn: t.endsOn.toISOString().slice(0, 10) })),
    );
  }

  // ---------------------------------------------------------------- enrolling

  /**
   * Puts a school in the pilot, taking one of the places (refused when none
   * is left). The school is on "trial" until pilotEndsAt, so when the pilot
   * ends the normal trial-ended flow (grace, then read-only) takes over.
   */
  async enrol(tenantId: string, actorId: string | null, opts: { endsOn?: string; source: 'APPLICATION' | 'CONSOLE' }) {
    const tenant = await this.prisma.root.tenant.findUnique({ where: { id: tenantId }, include: { billing: true } });
    if (!tenant) throw new NotFoundException('School not found');
    if (isDemoSchoolSlug(tenant.slug)) throw new BadRequestException('Demo schools cannot join the pilot');
    if (tenant.status === 'SUSPENDED' || tenant.status === 'ARCHIVED') throw new BadRequestException(`This school is ${tenant.status.toLowerCase()}`);
    if (tenant.billing?.pilotStatus && PILOT_PLACE_STATUSES.includes(tenant.billing.pilotStatus as PilotStatus)) throw new ConflictException('This school is already in the pilot');
    const paid = await this.prisma.root.platformInvoice.count({ where: { tenantId, status: 'PAID', subscriptionId: { not: null } } });
    if (paid) throw new BadRequestException('This school already pays for a subscription. Use a discount (Subscriptions → Manage) instead of the pilot.');

    const end = opts.endsOn ? { endsOn: opts.endsOn, basis: 'SET' as const } : await this.proposedEnd(tenantId);
    const pilotEndsAt = pilotEndsAtFromDate(end.endsOn);
    if (pilotEndsAt.getTime() <= Date.now()) throw new BadRequestException('The pilot end date must be in the future');
    const s = await this.settings();

    await this.prisma.root.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${PLACES_LOCK}::bigint)`;
      const used = await tx.tenantBilling.count({ where: { pilotStatus: { in: PILOT_PLACE_STATUSES } } });
      if (used >= s.places) throw new ConflictException(`All ${s.places} pilot places are used. Remove a school from the pilot or raise the number of places first.`);
      const selfServe = tenant.billing?.selfServe ?? false;
      await tx.tenantBilling.upsert({
        where: { tenantId },
        // Billing rules on, so normal pricing follows the pilot (self-serve schools have them on already).
        update: { pilotStatus: 'ACTIVE', pilotStartedAt: new Date(), pilotEndsAt, ...(selfServe ? {} : { enforced: true }) },
        create: { tenantId, pilotStatus: 'ACTIVE', pilotStartedAt: new Date(), pilotEndsAt, enforced: true },
      });
      await tx.tenant.update({ where: { id: tenantId }, data: { status: 'TRIAL', trialEndsAt: pilotEndsAt } });
      await tx.subscription.updateMany({ where: { tenantId, status: 'TRIALING' }, data: { currentPeriodEnd: pilotEndsAt } });
    });
    this.state.invalidate(tenantId);
    await this.audit.log({
      tenantId,
      actorUserId: actorId,
      action: 'pilot.enrolled',
      entityType: 'Tenant',
      entityId: tenantId,
      summary: `${tenant.name} joined the free pilot (${opts.source === 'APPLICATION' ? 'approved application' : 'added in the console'}) until ${end.endsOn}${end.basis === 'TYPICAL_CALENDAR' ? ' (typical term dates)' : end.basis === 'SCHOOL_CALENDAR' ? ' (school calendar)' : ''}`,
    });
    await this.notify(tenantId, 'Welcome to the AI School OS free pilot', this.welcomeText(tenant.name, tenant.slug, pilotEndsAt), { emailSubject: `${tenant.name}: welcome to the free pilot`, link: '/settings/billing', key: `pilot-welcome:${end.endsOn}` });
    return { tenantId, pilotEndsAt: pilotEndsAt.toISOString() };
  }

  private welcomeText(name: string, slug: string, endsAt: Date) {
    const origin = env().CORS_ORIGINS[0] ?? '';
    return [
      `${name} is part of the AI School OS free pilot. Everything is free until ${fmt(endsAt)}: the rest of this term and the whole of the next term. No payment is needed until then.`,
      '',
      'Your guided first week (the dashboard checklist walks you through each step):',
      '  Day 1: sign in, check the school details and the classes and subjects we set up for you.',
      '  Day 2: add your staff and send them their invitations.',
      '  Day 3: add or import your students (a spreadsheet is fine).',
      '  Day 4: invite parents so they get attendance, results and fee messages.',
      '  Day 5: take attendance, set some homework and try the AI lesson notes.',
      '',
      `Two weeks before the pilot ends we will email you the price for your number of students and how to continue. If you do nothing, your school keeps working for a grace period and then becomes read-only; nothing is ever deleted.`,
      '',
      origin ? `Sign in: ${origin}/login?school=${slug}` : '',
    ]
      .filter((l, i, a) => l !== '' || a[i - 1] !== '')
      .join('\n');
  }

  // ---------------------------------------------------------------- console actions

  async act(tenantId: string, input: PilotActionInput, actorId: string) {
    const tb = await this.prisma.root.tenantBilling.findUnique({ where: { tenantId }, include: { tenant: true } });
    if (!tb?.pilotStatus || tb.pilotStatus === 'REMOVED') throw new NotFoundException('This school is not in the pilot');
    const name = tb.tenant.name;
    const paid = (await this.prisma.root.platformInvoice.count({ where: { tenantId, status: 'PAID', subscriptionId: { not: null } } })) > 0;
    let summary = '';
    switch (input.action) {
      case 'SET_END': {
        const pilotEndsAt = pilotEndsAtFromDate(input.endsOn);
        if (pilotEndsAt.getTime() <= Date.now()) throw new BadRequestException('Choose a date in the future (or end the pilot now)');
        const status: PilotStatus = tb.pilotStatus === 'ENDED' ? 'ACTIVE' : (tb.pilotStatus as PilotStatus);
        await this.prisma.root.tenantBilling.update({ where: { tenantId }, data: { pilotEndsAt, pilotStatus: status } });
        // Unpaid schools stay "on trial" until the pilot ends; one that has paid keeps its paid status.
        if (!paid) {
          await this.prisma.root.tenant.update({ where: { id: tenantId }, data: { trialEndsAt: pilotEndsAt, ...(tb.tenant.status === 'ACTIVE' ? { status: 'TRIAL' } : {}) } });
          await this.prisma.root.subscription.updateMany({ where: { tenantId, status: { in: ['TRIALING', 'PAST_DUE'] } }, data: { status: 'TRIALING', currentPeriodEnd: pilotEndsAt } });
        }
        summary = `${name}: pilot ${tb.pilotEndsAt && pilotEndsAt > tb.pilotEndsAt ? 'extended' : 'end date changed'} to ${input.endsOn}`;
        break;
      }
      case 'END_NOW': {
        if (tb.pilotStatus !== 'ACTIVE' && tb.pilotStatus !== 'CONVERTED') throw new BadRequestException('The pilot has already ended for this school');
        const now = new Date();
        await this.prisma.root.tenantBilling.update({ where: { tenantId }, data: { pilotEndsAt: now, pilotStatus: tb.pilotStatus === 'CONVERTED' ? 'CONVERTED' : 'ENDED' } });
        if (!paid) await this.prisma.root.tenant.update({ where: { id: tenantId }, data: { trialEndsAt: now } });
        this.state.invalidate(tenantId);
        if (tb.pilotStatus === 'ACTIVE') await this.afterEnd(tenantId, now);
        summary = `${name}: pilot ended early`;
        break;
      }
      case 'CONVERT': {
        if (tb.pilotStatus === 'CONVERTED') throw new BadRequestException('Already converted');
        const start = tb.pilotEndsAt && tb.pilotEndsAt.getTime() > Date.now() ? tb.pilotEndsAt : new Date();
        const inv = paid ? null : await this.issueTermInvoice(tenantId, start);
        await this.prisma.root.tenantBilling.update({ where: { tenantId }, data: { pilotStatus: 'CONVERTED' } });
        summary = `${name}: converted to paid${inv ? ` (invoice ${inv.number}, ${naira(inv.amountKobo)}, for the term from ${lagosDate(start)})` : paid ? ' (already paying)' : ' (no invoice: no priced plan)'}`;
        if (inv) await this.notify(tenantId, 'Your next term’s invoice is ready', `Thank you for continuing with AI School OS after the pilot. Invoice ${inv.number} for ${naira(inv.amountKobo)} covers the term from ${fmt(start)}. You can pay it in Settings → Billing by card, bank transfer or USSD.`, { link: '/settings/billing' });
        break;
      }
      case 'REMOVE': {
        await this.prisma.root.tenantBilling.update({ where: { tenantId }, data: { pilotStatus: 'REMOVED' } });
        // Back to a normal trial: whatever is left of the usual trial from when the school joined, else the trial-ended flow starts now.
        if (!paid && tb.pilotStatus !== 'CONVERTED') {
          const rules = await this.state.settings();
          const trialEndsAt = new Date(Math.max(Date.now(), tb.tenant.createdAt.getTime() + rules.trialDays * DAY));
          await this.prisma.root.tenant.update({ where: { id: tenantId }, data: { trialEndsAt, ...(tb.tenant.status === 'ACTIVE' ? { status: 'TRIAL' } : {}) } });
          await this.prisma.root.subscription.updateMany({ where: { tenantId, status: 'TRIALING' }, data: { currentPeriodEnd: trialEndsAt } });
        }
        summary = `${name}: removed from the pilot (place freed)${input.action === 'REMOVE' && input.reason ? `: ${input.reason}` : ''}`;
        break;
      }
    }
    this.state.invalidate(tenantId);
    await this.audit.log({ tenantId, actorUserId: actorId, action: `pilot.${input.action.toLowerCase()}`, entityType: 'Tenant', entityId: tenantId, summary });
    return { ok: true, status: await this.state.status(tenantId, true) };
  }

  /**
   * The next term's invoice (one term on the school's plan, for its active
   * students or the number it gave when applying, never fewer than the
   * minimum), tied to the subscription and the period from `start`. Skipped
   * when an open subscription invoice already exists or the plan is free.
   */
  async issueTermInvoice(tenantId: string, start: Date) {
    const rules = await this.state.settings();
    let sub = await this.billing.current(tenantId);
    const tenant = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    if (!sub || sub.status === 'CANCELLED') {
      const planId = tenant.planId ?? (await this.prisma.root.plan.findFirst({ where: { isActive: true, isPublic: true }, orderBy: { sortOrder: 'asc' }, select: { id: true } }))?.id;
      if (!planId) return null;
      const created = await this.prisma.root.subscription.create({ data: { tenantId, planId, status: 'TRIALING', currentPeriodStart: tenant.createdAt, currentPeriodEnd: tenant.trialEndsAt ?? new Date() } });
      sub = await this.prisma.root.subscription.findUniqueOrThrow({ where: { id: created.id }, include: { plan: true, tenant: true } });
    }
    const open = await this.prisma.root.platformInvoice.findFirst({ where: { tenantId, subscriptionId: sub.id, status: 'OPEN' }, select: { id: true, number: true, amountKobo: true } });
    if (open) return open;
    const students = await this.studentsToBill(tenantId);
    const unit = sub.priceOverrideKobo ?? sub.plan.pricePerStudentKobo;
    const q = priceQuote({ pricePerStudentKobo: unit, billingPeriod: sub.plan.billingPeriod }, students, 'TERM', rules, sub.discountPct);
    if (q.totalKobo <= 0) return null;
    const end = addMonths(start, 4);
    const d = (x: Date) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' }).format(x);
    const due = new Date(Math.max(today().getTime(), new Date(lagosDate(start) + 'T00:00:00Z').getTime()) + rules.invoiceDueDays * DAY);
    const inv = await this.billing.manualInvoice({
      tenantId,
      description: `${sub.plan.name} plan, one term after the free pilot: ${q.billedStudents} students × ${naira(q.unitKobo)}${q.discountPct ? `, less ${q.discountPct}%` : ''} (${d(start)} – ${d(end)})`,
      amountKobo: q.totalKobo,
      dueDate: due.toISOString().slice(0, 10),
      notes: null,
      seats: q.billedStudents,
      unitKobo: q.unitKobo,
    });
    await this.prisma.root.platformInvoice.update({ where: { id: inv.id }, data: { subscriptionId: sub.id, periodStart: start, periodEnd: end, discountKobo: q.discountKobo } });
    await this.prisma.root.tenantBilling.updateMany({ where: { tenantId }, data: { cycle: 'TERM' } });
    this.state.invalidate(tenantId);
    return { id: inv.id, number: inv.number, amountKobo: q.totalKobo };
  }

  private async studentsToBill(tenantId: string) {
    const [active, signup] = await Promise.all([
      this.prisma.root.student.count({ where: { tenantId, status: 'ACTIVE' } }),
      this.prisma.root.schoolSignup.findFirst({ where: { tenantId }, select: { approxStudents: true } }),
    ]);
    return Math.max(active, signup?.approxStudents ?? 0);
  }

  /** One term's price after the pilot, on the school's plan, for its students. */
  async termPrice(tenantId: string): Promise<{ plan: string; students: number; totalKobo: number } | null> {
    const rules = await this.state.settings();
    const sub = await this.billing.current(tenantId);
    const tenant = await this.prisma.root.tenant.findUnique({ where: { id: tenantId }, select: { planId: true } });
    const plan = sub?.plan ?? (tenant?.planId ? await this.prisma.root.plan.findUnique({ where: { id: tenant.planId } }) : null);
    if (!plan) return null;
    const students = await this.studentsToBill(tenantId);
    const q = priceQuote({ pricePerStudentKobo: sub?.priceOverrideKobo ?? plan.pricePerStudentKobo, billingPeriod: plan.billingPeriod }, students, 'TERM', rules, sub?.discountPct ?? 0);
    return { plan: plan.name, students: q.billedStudents, totalKobo: q.totalKobo };
  }

  // ---------------------------------------------------------------- lifecycle

  /**
   * Called from the subscription lifecycle tick: reminders 14 and 3 days (plus
   * the usual trial reminder days) before a pilot ends, with the price; and,
   * once it has ended, the "pilot ended" notice and the next term's invoice.
   */
  async tick(): Promise<number> {
    const rules = await this.state.settings();
    const days = [...new Set([...PILOT_REMINDER_DAYS, ...rules.reminderDays])].sort((a, b) => a - b);
    const rows = await this.prisma.root.tenantBilling.findMany({ where: { pilotStatus: 'ACTIVE', pilotEndsAt: { not: null } }, include: { tenant: { select: { name: true, slug: true, status: true } } } });
    let sent = 0;
    const now = Date.now();
    for (const tb of rows) {
      if (tb.tenant.status === 'SUSPENDED' || tb.tenant.status === 'ARCHIVED') continue;
      const end = tb.pilotEndsAt!;
      if (end.getTime() <= now) {
        const paid = await this.prisma.root.platformInvoice.count({ where: { tenantId: tb.tenantId, status: 'PAID', subscriptionId: { not: null } } });
        await this.prisma.root.tenantBilling.update({ where: { tenantId: tb.tenantId }, data: { pilotStatus: paid ? 'CONVERTED' : 'ENDED' } });
        await this.audit.log({ tenantId: tb.tenantId, actorUserId: null, action: 'pilot.ended', entityType: 'Tenant', entityId: tb.tenantId, summary: `${tb.tenant.name}: the free pilot ended on ${lagosDate(end)}` });
        await this.afterEnd(tb.tenantId, end);
        sent++;
        continue;
      }
      const left = Math.ceil((end.getTime() - now) / DAY);
      const day = days.find((d) => left <= d);
      if (day == null) continue;
      const key = `pilot:${lagosDate(end)}:${day}`;
      if (tb.remindersSent.includes(key)) continue;
      await this.prisma.root.tenantBilling.update({ where: { tenantId: tb.tenantId }, data: { remindersSent: { push: key } } });
      const price = await this.termPrice(tb.tenantId);
      const title = left <= 1 ? 'Your free pilot ends tomorrow' : `${left} days left in your free pilot`;
      const body = [
        `The free pilot for ${tb.tenant.name} ends on ${fmt(end)}.`,
        price ? `To continue after that, one term on the ${price.plan} plan for ${price.students} students is ${naira(price.totalKobo)} (or pay for the whole session at a discount).` : 'To continue after that, choose a plan.',
        'How to continue: a school admin opens Settings → Billing, chooses a plan and pays by card, bank transfer or USSD. If you pay before the pilot ends, your paid term starts when the pilot ends, so you lose no free days.',
        `If nothing is paid, everything keeps working for ${rules.graceDays} days after the pilot ends, then the school becomes read-only (view and export only) until it pays. Nothing is deleted.`,
      ].join('\n\n');
      await this.notify(tb.tenantId, title, body, { link: '/settings/billing' });
      sent++;
    }
    return sent;
  }

  /** The pilot has ended: the next term's invoice (best effort) and the notice. */
  private async afterEnd(tenantId: string, endedAt: Date) {
    const paid = (await this.prisma.root.platformInvoice.count({ where: { tenantId, status: 'PAID', subscriptionId: { not: null } } })) > 0;
    let inv: { number: string; amountKobo: number } | null = null;
    if (!paid) {
      try {
        inv = await this.issueTermInvoice(tenantId, new Date());
      } catch (err) {
        this.logger.warn(`Post-pilot invoice for ${tenantId} failed: ${(err as Error).message}`);
      }
    }
    this.state.invalidate(tenantId);
    const rules = await this.state.settings();
    const body = paid
      ? 'Thank you for continuing with AI School OS: your paid subscription now applies.'
      : [
          `Thank you for taking part. From now on the normal price applies.${inv ? ` Invoice ${inv.number} for ${naira(inv.amountKobo)} covers your next term.` : ''}`,
          `Everything keeps working for ${rules.graceDays} days; after that the school becomes read-only (view and export only) until it pays. Nothing is deleted.`,
          'Pay in Settings → Billing by card, bank transfer or USSD.',
        ].join('\n\n');
    await this.notify(tenantId, 'Your free pilot has ended', body, { link: '/settings/billing', key: `pilot-ended:${lagosDate(endedAt)}` });
    // This notice already covers the start of the grace period: don't send the generic one too.
    const st = await this.state.status(tenantId, true);
    if (st.state === 'GRACE' && st.readOnlyAt && (st.daysLeft ?? 0) > 3) {
      await this.prisma.root.tenantBilling.updateMany({ where: { tenantId }, data: { remindersSent: { push: `grace:${st.readOnlyAt.slice(0, 10)}:start` } } });
    }
  }

  /** In-app notification to the school's admins, plus email when SMTP is set up (otherwise in-app only). */
  private async notify(tenantId: string, title: string, body: string, opts: { link?: string; emailSubject?: string; key?: string } = {}) {
    if (opts.key) {
      const tb = await this.prisma.root.tenantBilling.findUnique({ where: { tenantId }, select: { remindersSent: true } });
      if (tb?.remindersSent.includes(opts.key)) return;
      await this.prisma.root.tenantBilling.updateMany({ where: { tenantId }, data: { remindersSent: { push: opts.key } } });
    }
    const admins = await this.prisma.root.membership.findMany({
      where: { tenantId, status: 'ACTIVE', user: { status: 'ACTIVE' }, roles: { some: { role: { key: 'school_admin' } } } },
      select: { userId: true, user: { select: { email: true, firstName: true } } },
    });
    if (!admins.length) return;
    await this.prisma.root.notification.createMany({ data: admins.map((a) => ({ tenantId, userId: a.userId, title, body: body.slice(0, 2000), link: opts.link ?? '/settings/billing' })) });
    const mail = platformSender();
    if (!mail) return;
    const origin = env().CORS_ORIGINS[0] ?? '';
    for (const a of admins) {
      await mail
        .send(a.user.email, opts.emailSubject ?? `[AI School OS] ${title}`, `Dear ${a.user.firstName},\n\n${body}\n\n${origin}${opts.link ?? '/settings/billing'}\n\nAI School OS`)
        .catch((e: Error) => this.logger.warn(`Pilot email to ${a.user.email} failed: ${(e as Error).message}`));
    }
  }

  // ---------------------------------------------------------------- console views

  async overview(): Promise<PilotOverview> {
    const [settings, used, pendingApplications, rows] = await Promise.all([
      this.settings(),
      this.used(),
      this.prisma.root.schoolSignup.count({ where: { status: 'PENDING_REVIEW', pilot: true } }),
      this.prisma.root.tenantBilling.findMany({ where: { pilotStatus: { not: null } }, include: { tenant: { include: { plan: true } } }, orderBy: { pilotStartedAt: 'asc' } }),
    ]);
    const ids = rows.map((r) => r.tenantId);
    const [active, signups, health] = await Promise.all([
      ids.length ? this.billing.activeStudents(ids) : Promise.resolve(new Map<string, number>()),
      this.prisma.root.schoolSignup.findMany({ where: { tenantId: { in: ids } }, select: { tenantId: true, state: true, schoolType: true, approxStudents: true } }),
      this.success.platform().catch(() => null),
    ]);
    const signupBy = new Map(signups.map((s) => [s.tenantId!, s]));
    const healthBy = new Map((health?.schools ?? []).map((h) => [h.id, h]));
    const now = Date.now();
    const schools: PilotSchoolRow[] = [];
    for (const r of rows) {
      const su = signupBy.get(r.tenantId);
      const h = healthBy.get(r.tenantId);
      const price = r.pilotStatus === 'REMOVED' ? null : await this.termPrice(r.tenantId);
      const stateFromAddress = r.tenant.address?.match(/([A-Za-z ]+?) State\b/)?.[1]?.trim() ?? (r.tenant.address?.includes('Abuja') ? 'FCT (Abuja)' : null);
      schools.push({
        tenantId: r.tenantId,
        name: r.tenant.name,
        slug: r.tenant.slug,
        tenantStatus: r.tenant.status,
        state: su?.state ?? stateFromAddress,
        schoolType: (su?.schoolType as SchoolTypeKey | undefined) ?? null,
        activeStudents: active.get(r.tenantId) ?? 0,
        approxStudents: su?.approxStudents ?? null,
        joinedAt: r.tenant.createdAt.toISOString(),
        pilotStatus: r.pilotStatus as PilotStatus,
        pilotStartedAt: r.pilotStartedAt?.toISOString() ?? null,
        pilotEndsAt: r.pilotEndsAt?.toISOString() ?? null,
        daysLeft: r.pilotEndsAt && r.pilotEndsAt.getTime() > now ? Math.ceil((r.pilotEndsAt.getTime() - now) / DAY) : null,
        billing: await this.state.status(r.tenantId),
        plan: price?.plan ?? r.tenant.plan?.name ?? null,
        termPriceKobo: price?.totalKobo ?? null,
        health: h?.health ?? null,
        healthBand: h?.band ?? null,
        lastActivityAt: h?.lastActivityAt ?? null,
      });
    }
    return { settings, used, placesLeft: Math.max(0, settings.places - used), public: await this.publicInfo(), pendingApplications, schools };
  }

  /** Schools the operator could add: live, not demo, not in the pilot, not already paying. */
  async candidates(): Promise<PilotCandidate[]> {
    const tenants = await this.prisma.root.tenant.findMany({
      where: {
        status: { in: ['TRIAL', 'ACTIVE'] },
        OR: [{ billing: { is: null } }, { billing: { is: { OR: [{ pilotStatus: null }, { pilotStatus: 'REMOVED' }] } } }],
        platformInvoices: { none: { status: 'PAID', subscriptionId: { not: null } } },
      },
      select: { id: true, name: true, slug: true, status: true },
      orderBy: { name: 'asc' },
      take: 500,
    });
    const out: PilotCandidate[] = [];
    for (const t of tenants) {
      if (isDemoSchoolSlug(t.slug)) continue;
      const end = await this.proposedEnd(t.id);
      out.push({ tenantId: t.id, name: t.name, slug: t.slug, status: t.status, proposedEndsOn: end.endsOn, basis: end.basis });
    }
    return out;
  }
}
