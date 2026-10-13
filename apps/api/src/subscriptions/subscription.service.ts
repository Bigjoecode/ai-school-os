import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import {
  planQuote,
  priceQuote,
  type BillingCycle,
  type InvoiceLine,
  type BillingDocument,
  type BillingStateKey,
  type PlanChangeResult,
  type SubscriptionCheckoutInput,
  type SubscriptionCheckoutOptions,
  type SubscriptionCheckoutResult,
  type SubscriptionsSummary,
  type TenantBillingRow,
  type TenantBillingUpdate,
} from '@aischool/shared';
import { AuditService } from '../audit/audit.service';
import { dateOnly } from '../common/format';
import { registerTickTask } from '../common/tick-tasks';
import { env } from '../config/env';
import { addMonths, invoicePaidHooks, PlatformBillingService } from '../console/billing.service';
import { FeatureService } from '../features/features.service';
import { PrismaService } from '../prisma/prisma.service';
import { BillingStateService, platformSender } from './billing-state.service';
import { PilotService } from './pilot.service';
import { setupFeeLine, setupFeeStatus } from './setup-fee';
import { SignupService } from './signup.service';

const DAY = 86_400_000;
const TICK_EVERY_MS = 30 * 60_000;
const today = () => new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;

/**
 * Self-serve subscriptions on top of the console's billing: choosing a plan
 * and paying for a term or a session, plan changes, printable invoices and
 * receipts, trial reminders, and the console's subscriptions overview.
 *
 * The rules (documented in DEPLOYMENT.md → Self-serve sign-up and billing):
 *  - Billed students = active students on the invoice date, never fewer than
 *    the minimum (and, at the first payment, never fewer than the number the
 *    school expects that term).
 *  - Students added mid-period are not charged until the next invoice.
 *  - Upgrades take effect at once with a top-up invoice for the rest of the
 *    period (by days left); downgrades take effect from the next period.
 *    During the trial a plan change is free and immediate.
 */
@Injectable()
export class SubscriptionService implements OnModuleInit {
  private readonly logger = new Logger(SubscriptionService.name);
  private lastTick = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: PlatformBillingService,
    private readonly state: BillingStateService,
    private readonly signups: SignupService,
    private readonly features: FeatureService,
    private readonly audit: AuditService,
    private readonly pilot: PilotService,
  ) {}

  onModuleInit() {
    invoicePaidHooks.push((tenantId) => this.state.invalidate(tenantId));
    registerTickTask('subscriptionLifecycle', () => this.tick());
  }

  private async plans() {
    return this.signups.publicPlans();
  }

  private async tb(tenantId: string) {
    return this.prisma.root.tenantBilling.upsert({ where: { tenantId }, update: {}, create: { tenantId } });
  }

  /** The subscription's paid period is running (the school has paid at least once and is not in trial). */
  private async hasPaidPeriod(tenantId: string) {
    const t = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { status: true } });
    if (t.status === 'TRIAL') return false;
    return (await this.prisma.root.platformInvoice.count({ where: { tenantId, status: 'PAID', subscriptionId: { not: null } } })) > 0;
  }

  async options(tenantId: string): Promise<SubscriptionCheckoutOptions> {
    const [status, rules, sub, tb, active, plans, paying] = await Promise.all([
      this.state.status(tenantId, true),
      this.state.settings(),
      this.billing.current(tenantId),
      this.prisma.root.tenantBilling.findUnique({ where: { tenantId } }),
      this.prisma.root.student.count({ where: { tenantId, status: 'ACTIVE' } }),
      this.plans(),
      this.hasPaidPeriod(tenantId),
    ]);
    const open = sub ? await this.prisma.root.platformInvoice.findFirst({ where: { tenantId, subscriptionId: sub.id, status: 'OPEN' }, orderBy: { issuedAt: 'desc' }, select: { id: true } }) : null;
    const signup = await this.prisma.root.schoolSignup.findFirst({ where: { tenantId }, select: { approxStudents: true } });
    const pending = tb?.pendingPlanId ? await this.prisma.root.plan.findUnique({ where: { id: tb.pendingPlanId }, select: { name: true } }) : null;
    // A school on a private (negotiated) or retired plan still sees it.
    if (sub && !plans.some((p) => p.id === sub.planId)) plans.push(this.signups.toPublicPlan(sub.plan, rules.minBilledStudents));
    const setupFee = await setupFeeStatus(this.prisma.root, tenantId);
    const setupFeeByPlan: Record<string, number> = {};
    for (const p of plans) {
      const f = await setupFeeStatus(this.prisma.root, tenantId, p);
      setupFeeByPlan[p.id] = f.state === 'DUE' ? f.amountKobo : 0;
    }
    return {
      status,
      currentPlanId: sub?.planId ?? null,
      activeStudents: active,
      estimatedStudents: Math.max(active, signup?.approxStudents ?? 0),
      cycle: (tb?.cycle as BillingCycle) ?? 'TERM',
      rules: { minBilledStudents: rules.minBilledStudents, sessionDiscountPct: rules.sessionDiscountPct, graceDays: rules.graceDays, trialDays: rules.trialDays },
      plans,
      openInvoiceId: open?.id ?? null,
      pendingPlan: pending?.name ?? null,
      onlinePayment: this.billing.onlineEnabled(),
      paying,
      discountPct: sub?.discountPct ?? 0,
      setupFee,
      setupFeeByPlan,
    };
  }

  /**
   * Choose a plan and pay for a term or a session: issues the invoice for a new
   * period starting today (replacing an unpaid one from an earlier attempt) and,
   * when online payment is set up, starts the Paystack payment.
   */
  async checkout(tenantId: string, input: SubscriptionCheckoutInput, email: string, callbackUrl: string): Promise<SubscriptionCheckoutResult> {
    if (await this.hasPaidPeriod(tenantId)) {
      const st = await this.state.status(tenantId, true);
      if (st.state === 'OK') throw new BadRequestException('Your subscription is paid up. To change plan, use “Change plan”; renewals are invoiced automatically.');
    }
    const plan = await this.prisma.root.plan.findFirst({ where: { id: input.planId, isActive: true } });
    if (!plan) throw new BadRequestException('Choose one of the plans shown');
    if (plan.contactOnly) throw new BadRequestException(`The ${plan.name} plan is priced for each school: use “Talk to us” and we will get back to you.`);
    const tenant = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    if (plan.maxStudents && input.students > plan.maxStudents) throw new BadRequestException(`The ${plan.name} plan is for up to ${plan.maxStudents.toLocaleString('en-NG')} students; choose a larger plan`);
    const rules = await this.state.settings();
    const status0 = await this.state.status(tenantId, true);
    let sub = await this.billing.current(tenantId);
    if (!sub || sub.status === 'CANCELLED') {
      const created = await this.prisma.root.subscription.create({ data: { tenantId, planId: plan.id, status: 'TRIALING', currentPeriodStart: tenant.createdAt, currentPeriodEnd: tenant.trialEndsAt ?? new Date() } });
      sub = await this.prisma.root.subscription.findUniqueOrThrow({ where: { id: created.id }, include: { plan: true, tenant: true } });
    }
    if (sub.planId !== plan.id && sub.plan.isPublic === false && !(await this.plans()).some((p) => p.id === plan.id)) throw new BadRequestException('Choose one of the plans shown');

    // An unpaid invoice from an earlier attempt is replaced.
    const stale = await this.prisma.root.platformInvoice.findMany({ where: { tenantId, subscriptionId: sub.id, status: 'OPEN', paidKobo: 0 }, include: { payments: { where: { status: 'PENDING' } } } });
    for (const inv of stale) {
      // A payment may have gone through since: check before replacing the invoice.
      for (const p of inv.payments) await this.billing.verifyOnline(p.reference, tenantId).catch(() => null);
      const now = await this.prisma.root.platformInvoice.findUniqueOrThrow({ where: { id: inv.id } });
      if (now.status !== 'OPEN' || now.paidKobo > 0) throw new BadRequestException('A payment for your earlier plan choice has just come through. Refresh the page.');
      await this.prisma.root.platformPayment.updateMany({ where: { invoiceId: inv.id, status: 'PENDING' }, data: { status: 'FAILED', note: 'Invoice replaced by a new plan choice' } });
      await this.billing.voidInvoice(inv.id, 'Replaced by a new plan choice');
    }

    const active = await this.prisma.root.student.count({ where: { tenantId, status: 'ACTIVE' } });
    const unit = sub.priceOverrideKobo ?? plan.pricePerStudentKobo;
    const q = planQuote({ pricePerStudentKobo: unit, billingPeriod: plan.billingPeriod, minStudents: plan.minStudents, smsUnitsPerStudent: plan.smsUnitsPerStudent }, Math.max(active, input.students), input.cycle, rules, sub.discountPct);
    if (q.totalKobo <= 0) throw new BadRequestException('There is nothing to pay on this plan. Contact us to activate it.');
    // A new school's first invoice carries the one-off setup fee (onboarding and training), unless waived.
    const setup = setupFeeLine(await setupFeeStatus(this.prisma.root, tenantId, plan));

    await this.prisma.root.subscription.update({ where: { id: sub.id }, data: { planId: plan.id } });
    await this.prisma.root.tenant.update({ where: { id: tenantId }, data: { planId: plan.id } });
    await this.prisma.root.tenantBilling.upsert({ where: { tenantId }, update: { cycle: input.cycle, pendingPlanId: null }, create: { tenantId, cycle: input.cycle } });
    this.features.invalidate(tenantId);

    // During the free pilot, paying early does not lose free days: the paid period starts when the pilot ends.
    const pilotEnd = status0.state === 'PILOT' && status0.pilotEndsAt ? new Date(status0.pilotEndsAt) : null;
    const start = pilotEnd ?? new Date();
    const end = addMonths(pilotEnd ?? today(), input.cycle === 'SESSION' ? 12 : 4);
    const fmt = (d: Date) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
    const subDescription = `${plan.name} plan, ${input.cycle === 'SESSION' ? 'one session (3 terms)' : 'one term'}: ${q.billedStudents} students × ${naira(q.unitKobo)}${q.terms > 1 ? ' × 3 terms' : ''}${q.discountPct ? `, less ${q.discountPct}%` : ''} (${fmt(start)} – ${fmt(end)})`;
    const lines: InvoiceLine[] = [{ kind: 'SUBSCRIPTION', description: subDescription, quantity: q.billedStudents * q.terms, unitKobo: q.unitKobo, discountKobo: q.discountKobo, amountKobo: q.totalKobo }];
    if (setup) lines.push(setup);
    const amountKobo = q.totalKobo + (setup?.amountKobo ?? 0);
    const invoice = await this.billing.manualInvoice({
      tenantId,
      description: setup ? `${subDescription}; plus the one-off setup fee (${naira(setup.amountKobo)})` : subDescription,
      amountKobo,
      dueDate: new Date(today().getTime() + rules.invoiceDueDays * DAY).toISOString().slice(0, 10),
      notes: null,
      seats: q.billedStudents,
      unitKobo: q.unitKobo,
      lines,
    });
    // Tie it to the subscription and the period it pays for (manualInvoice issues free-standing invoices).
    await this.prisma.root.platformInvoice.update({ where: { id: invoice.id }, data: { subscriptionId: sub.id, periodStart: start, periodEnd: end, discountKobo: q.discountKobo } });
    await this.audit.log({ tenantId, action: 'billing.checkout', entityType: 'PlatformInvoice', entityId: invoice.id, summary: `Chose the ${plan.name} plan for ${input.cycle === 'SESSION' ? 'a session' : 'a term'}: ${q.billedStudents} students, ${naira(amountKobo)}${setup ? ` (including the ${naira(setup.amountKobo)} setup fee)` : ''}` });
    this.state.invalidate(tenantId);

    let authorizationUrl: string | null = null;
    if (this.billing.onlineEnabled()) {
      authorizationUrl = (await this.billing.startOnline(tenantId, invoice.id, email, callbackUrl)).authorizationUrl;
    }
    return { invoiceId: invoice.id, number: invoice.number, amountKobo, authorizationUrl };
  }

  async changePlan(tenantId: string, planId: string): Promise<PlanChangeResult> {
    const plan = await this.prisma.root.plan.findFirst({ where: { id: planId, isActive: true } });
    if (!plan || !(await this.plans()).some((p) => p.id === planId)) throw new BadRequestException('Choose one of the plans shown');
    if (plan.contactOnly) throw new BadRequestException(`The ${plan.name} plan is priced for each school: use “Talk to us” and we will get back to you.`);
    const sub = await this.billing.current(tenantId);
    if (!sub) throw new BadRequestException('Your school has no subscription yet. Choose a plan and pay first.');
    if (sub.planId === planId) {
      await this.prisma.root.tenantBilling.updateMany({ where: { tenantId }, data: { pendingPlanId: null } });
      return { effective: 'NOW', invoiceId: null, amountKobo: 0 };
    }
    const active = await this.prisma.root.student.count({ where: { tenantId, status: 'ACTIVE' } });
    if (plan.maxStudents && active > plan.maxStudents) throw new BadRequestException(`You have ${active} active students; the ${plan.name} plan is for up to ${plan.maxStudents}`);
    const tb = await this.tb(tenantId);
    const apply = async () => {
      await this.prisma.root.subscription.update({ where: { id: sub.id }, data: { planId } });
      await this.prisma.root.tenant.update({ where: { id: tenantId }, data: { planId } });
      await this.prisma.root.tenantBilling.update({ where: { tenantId }, data: { pendingPlanId: null } });
      this.features.invalidate(tenantId);
    };

    if (!(await this.hasPaidPeriod(tenantId))) {
      await apply();
      await this.audit.log({ tenantId, action: 'billing.plan_changed', summary: `Switched to the ${plan.name} plan (trial)` });
      return { effective: 'NOW', invoiceId: null, amountKobo: 0 };
    }
    const oldUnit = sub.priceOverrideKobo ?? sub.plan.pricePerStudentKobo;
    const newUnit = sub.priceOverrideKobo ?? plan.pricePerStudentKobo;
    if (newUnit <= oldUnit) {
      await this.prisma.root.tenantBilling.update({ where: { tenantId }, data: { pendingPlanId: planId } });
      await this.audit.log({ tenantId, action: 'billing.plan_scheduled', summary: `Scheduled a move to the ${plan.name} plan from ${dateOnly(sub.currentPeriodEnd)}` });
      return { effective: 'NEXT_PERIOD', invoiceId: null, amountKobo: 0 };
    }
    // Upgrade: at once, with a top-up for the days left in the paid period.
    const last = await this.prisma.root.platformInvoice.findFirst({ where: { tenantId, subscriptionId: sub.id, status: 'PAID' }, orderBy: { periodStart: 'desc' } });
    const seats = last?.seats || Math.max(active, plan.minStudents ?? (await this.state.settings()).minBilledStudents);
    const periodMs = sub.currentPeriodEnd.getTime() - sub.currentPeriodStart.getTime();
    const leftMs = Math.max(0, sub.currentPeriodEnd.getTime() - Date.now());
    const fraction = periodMs > 0 ? leftMs / periodMs : 0;
    const terms = tb.cycle === 'SESSION' ? 3 : 1;
    const rules = await this.state.settings();
    const discountPct = Math.min(100, (tb.cycle === 'SESSION' ? rules.sessionDiscountPct : 0) + sub.discountPct);
    const toPeriod = (unit: number) => Math.round((unit * 4) / ({ MONTHLY: 1, PER_TERM: 4, PER_SESSION: 12, ANNUAL: 12 }[plan.billingPeriod] ?? 4));
    const diffPerStudent = (toPeriod(newUnit) - toPeriod(oldUnit)) * terms;
    const amount = Math.round(diffPerStudent * seats * fraction * (1 - discountPct / 100));
    await apply();
    let invoiceId: string | null = null;
    if (amount > 0) {
      const inv = await this.billing.manualInvoice({
        tenantId,
        description: `Upgrade from ${sub.plan.name} to ${plan.name}: ${seats} students for the ${Math.ceil(leftMs / DAY)} days left in the current period`,
        amountKobo: amount,
        dueDate: new Date(today().getTime() + rules.invoiceDueDays * DAY).toISOString().slice(0, 10),
        notes: null,
        seats,
      });
      invoiceId = inv.id;
    }
    await this.audit.log({ tenantId, action: 'billing.plan_changed', summary: `Upgraded to the ${plan.name} plan${amount ? ` (top-up ${naira(amount)})` : ''}` });
    return { effective: 'NOW', invoiceId, amountKobo: amount };
  }

  async document(tenantId: string | null, invoiceId: string): Promise<BillingDocument> {
    const inv = await this.prisma.root.platformInvoice.findFirst({ where: { id: invoiceId, ...(tenantId ? { tenantId } : {}) }, include: { tenant: true, payments: { where: { status: 'SUCCESS' }, orderBy: { paidAt: 'asc' } } } });
    if (!inv) throw new NotFoundException('Invoice not found');
    const s = await this.state.settings();
    return {
      kind: inv.status === 'PAID' ? 'RECEIPT' : 'INVOICE',
      number: inv.number,
      status: inv.status,
      issuedAt: inv.issuedAt.toISOString(),
      dueDate: dateOnly(inv.dueDate)!,
      paidAt: inv.paidAt?.toISOString() ?? null,
      description: inv.description,
      periodStart: dateOnly(inv.periodStart),
      periodEnd: dateOnly(inv.periodEnd),
      seats: inv.seats,
      unitKobo: inv.unitKobo,
      discountKobo: inv.discountKobo,
      amountKobo: inv.amountKobo,
      paidKobo: inv.paidKobo,
      balanceKobo: inv.status === 'OPEN' ? inv.amountKobo - inv.paidKobo : 0,
      currency: inv.currency,
      school: { name: inv.tenant.name, address: inv.tenant.address, email: inv.tenant.email, phone: inv.tenant.phone },
      company: s.company,
      payments: inv.payments.map((p) => ({ reference: p.reference, method: p.method, amountKobo: p.amountKobo, paidAt: p.paidAt?.toISOString() ?? null })),
      bankDetails: env().PLATFORM_BANK_DETAILS?.replace(/\\n/g, '\n') ?? null,
      lines: Array.isArray(inv.lines) ? (inv.lines as unknown as InvoiceLine[]) : [],
    };
  }

  // ---------------------------------------------------------------- console

  async summary(): Promise<SubscriptionsSummary> {
    const [tenants, settings, pendingSignups] = await Promise.all([
      this.prisma.root.tenant.findMany({ where: { status: { not: 'ARCHIVED' } }, include: { billing: true, plan: true }, orderBy: { name: 'asc' } }),
      this.state.settings(),
      this.prisma.root.schoolSignup.count({ where: { status: 'PENDING_REVIEW' } }),
    ]);
    const ids = tenants.map((t) => t.id);
    const since = new Date(Date.now() - 120 * DAY);
    const [active, outstanding, subs, paid] = await Promise.all([
      this.billing.activeStudents(ids),
      this.billing.outstanding(ids),
      this.prisma.root.subscription.findMany({ where: { tenantId: { in: ids }, status: { not: 'CANCELLED' } }, include: { plan: true }, orderBy: { createdAt: 'desc' } }),
      this.prisma.root.platformPayment.groupBy({ by: ['tenantId'], where: { tenantId: { in: ids }, status: 'SUCCESS', paidAt: { gte: since } }, _sum: { amountKobo: true } }),
    ]);
    const subBy = new Map<string, (typeof subs)[number]>();
    for (const s of subs) if (!subBy.has(s.tenantId)) subBy.set(s.tenantId, s);
    const paidBy = new Map(paid.map((p) => [p.tenantId, p._sum.amountKobo ?? 0]));
    const counts: Record<BillingStateKey, number> = { OK: 0, TRIAL: 0, GRACE: 0, READ_ONLY: 0, PILOT: 0 };
    let termRevenue = 0;
    let overdue = 0;
    const rows: TenantBillingRow[] = [];
    for (const t of tenants) {
      const status = await this.state.status(t.id);
      counts[status.state]++;
      if (status.reason === 'INVOICE_OVERDUE') overdue++;
      const sub = subBy.get(t.id);
      const n = active.get(t.id) ?? 0;
      const cycle = (t.billing?.cycle as BillingCycle) ?? 'TERM';
      let termValue = 0;
      if (sub) {
        const unit = sub.priceOverrideKobo ?? sub.plan.pricePerStudentKobo;
        const rules = t.billing ? settings : { minBilledStudents: 0, sessionDiscountPct: 0 };
        termValue = priceQuote({ pricePerStudentKobo: unit, billingPeriod: sub.plan.billingPeriod }, Math.max(n, sub.studentSeats), t.billing ? cycle : 'TERM', t.billing ? { ...rules, minBilledStudents: sub.plan.minStudents ?? rules.minBilledStudents } : rules, sub.discountPct).perTermKobo;
        if (sub.status === 'ACTIVE' || sub.status === 'PAST_DUE') termRevenue += termValue;
      }
      rows.push({
        tenantId: t.id,
        name: t.name,
        slug: t.slug,
        tenantStatus: t.status,
        selfServe: t.billing?.selfServe ?? false,
        enforcedSetting: t.billing?.enforced ?? null,
        status,
        plan: sub?.plan.name ?? t.plan?.name ?? null,
        cycle,
        discountPct: sub?.discountPct ?? 0,
        activeStudents: n,
        termValueKobo: termValue,
        outstandingKobo: outstanding.get(t.id) ?? 0,
        paidThisTermKobo: paidBy.get(t.id) ?? 0,
        notes: t.billing?.notes ?? null,
        pilotStatus: t.billing?.pilotStatus ?? null,
        ...(await setupFeeStatus(this.prisma.root, t.id).then((f) => ({ setupFee: f.state, setupFeeKobo: f.amountKobo }))),
      });
    }
    return {
      rows,
      termRevenueKobo: termRevenue,
      collectedLast120DaysKobo: [...paidBy.values()].reduce((a, b) => a + b, 0),
      counts,
      overdue,
      pendingSignups,
      settings,
    };
  }

  async updateTenant(tenantId: string, body: TenantBillingUpdate) {
    const tenant = await this.prisma.root.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('School not found');
    await this.prisma.root.tenantBilling.upsert({
      where: { tenantId },
      update: { enforced: body.enforced, ...(body.notes !== undefined ? { notes: body.notes } : {}) },
      create: { tenantId, enforced: body.enforced, notes: body.notes ?? null },
    });
    const changes: string[] = [`billing rules ${body.enforced === null ? 'follow the platform setting' : body.enforced ? 'on' : 'off'}`];
    if (body.extendTrialDays) {
      const base = Math.max(tenant.trialEndsAt?.getTime() ?? 0, Date.now());
      const trialEndsAt = new Date(base + body.extendTrialDays * DAY);
      // Extending a trial puts a lapsed (unpaid) school back on trial.
      await this.prisma.root.tenant.update({ where: { id: tenantId }, data: { trialEndsAt, ...(tenant.status === 'ACTIVE' && !(await this.hasPaidPeriod(tenantId)) ? { status: 'TRIAL' } : {}) } });
      await this.prisma.root.subscription.updateMany({ where: { tenantId, status: 'TRIALING' }, data: { currentPeriodEnd: trialEndsAt } });
      changes.push(`trial extended by ${body.extendTrialDays} days to ${dateOnly(trialEndsAt)}`);
    }
    if (body.discountPct !== undefined) {
      const sub = await this.billing.current(tenantId);
      if (sub) {
        await this.prisma.root.subscription.update({ where: { id: sub.id }, data: { discountPct: body.discountPct } });
        changes.push(body.discountPct === 100 ? 'complimentary (100% discount)' : `discount ${body.discountPct}%`);
      }
    }
    this.state.invalidate(tenantId);
    await this.audit.log({ tenantId, action: 'billing.tenant_rules', entityType: 'Tenant', entityId: tenantId, summary: `${tenant.name}: ${changes.join('; ')}` });
    return { ok: true, status: await this.state.status(tenantId, true) };
  }

  // ---------------------------------------------------------------- lifecycle

  /** Every 30 minutes: trial and grace reminders (email and in-app), the period's peak student count, stale sign-ups. */
  async tick(force = false): Promise<number> {
    if (!force && Date.now() - this.lastTick < TICK_EVERY_MS) return 0;
    this.lastTick = Date.now();
    const settings = await this.state.settings();
    // The free pilot's own reminders, and moving schools whose pilot has ended to normal billing.
    let sent = await this.pilot.tick().catch((e: Error) => {
      this.logger.warn(`Pilot lifecycle failed: ${e.message}`);
      return 0;
    });
    const tenants = await this.prisma.root.tenant.findMany({ where: { status: { in: ['TRIAL', 'ACTIVE'] } }, select: { id: true, name: true, slug: true, billing: true } });
    for (const t of tenants) {
      if (!this.state.enforcedFor(t, t.billing, settings)) continue;
      const st = await this.state.status(t.id, true);
      let key: string | null = null;
      let title = '';
      let body = '';
      if (st.state === 'TRIAL' && st.trialEndsAt && st.daysLeft != null) {
        const day = [...settings.reminderDays].sort((a, b) => a - b).find((d) => st.daysLeft! <= d);
        if (day != null) {
          key = `trial:${st.trialEndsAt.slice(0, 10)}:${day}`;
          title = st.daysLeft <= 1 ? 'Your free trial ends tomorrow' : `${st.daysLeft} days left in your free trial`;
          body = `Choose a plan and pay in Settings → Billing to keep ${t.name} running without a break. Nothing is deleted if the trial ends.`;
        }
      } else if (st.state === 'GRACE' && st.readOnlyAt) {
        key = `grace:${st.readOnlyAt.slice(0, 10)}:${st.daysLeft != null && st.daysLeft <= 3 ? 3 : 'start'}`;
        title = st.reason === 'PILOT_ENDED' ? 'Your free pilot has ended' : st.reason === 'TRIAL_ENDED' ? 'Your free trial has ended' : 'Your AI School OS invoice is overdue';
        body = `Everything keeps working until ${st.readOnlyAt.slice(0, 10)}; after that the school becomes read-only (view and export only) until it pays. Pay in Settings → Billing.`;
      } else if (st.state === 'READ_ONLY' && st.readOnlyAt) {
        key = `readonly:${st.readOnlyAt.slice(0, 10)}`;
        title = 'Your school is now read-only';
        body = 'Everyone can still sign in, view and export, but nothing new can be added until the school pays in Settings → Billing. No data has been deleted.';
      }
      if (key && !(t.billing?.remindersSent ?? []).includes(key)) {
        await this.prisma.root.tenantBilling.upsert({ where: { tenantId: t.id }, update: { remindersSent: { push: key } }, create: { tenantId: t.id, remindersSent: [key] } });
        await this.remind(t.id, title, body);
        sent++;
      }
    }
    // The most active students seen this period, for the console (spotting schools that pay for fewer than they use).
    const billed = tenants.filter((t) => t.billing);
    if (billed.length) {
      const counts = await this.billing.activeStudents(billed.map((t) => t.id));
      for (const t of billed) {
        const n = counts.get(t.id) ?? 0;
        if (n > (t.billing?.peakStudents ?? 0)) await this.prisma.root.tenantBilling.update({ where: { tenantId: t.id }, data: { peakStudents: n } });
      }
    }
    await this.signups.purgeStale();
    return sent;
  }

  private async remind(tenantId: string, title: string, body: string) {
    const admins = await this.prisma.root.membership.findMany({
      where: { tenantId, status: 'ACTIVE', user: { status: 'ACTIVE' }, roles: { some: { role: { key: 'school_admin' } } } },
      select: { userId: true, user: { select: { email: true, firstName: true } } },
    });
    if (!admins.length) return;
    await this.prisma.root.notification.createMany({ data: admins.map((a) => ({ tenantId, userId: a.userId, title, body, link: '/settings/billing' })) });
    const mail = platformSender();
    if (!mail) return;
    const origin = env().CORS_ORIGINS[0] ?? '';
    for (const a of admins) {
      await mail
        .send(a.user.email, `[AI School OS] ${title}`, `Dear ${a.user.firstName},\n\n${title}.\n\n${body}\n\n${origin}/settings/billing\n\nAI School OS`)
        .catch((e: Error) => this.logger.warn(`Billing reminder to ${a.user.email} failed: ${e.message}`));
    }
  }
}
