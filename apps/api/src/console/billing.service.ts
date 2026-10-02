import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import {
  BILLING_PERIOD_MONTHS,
  type BillingPeriodKey,
  type PlatformInvoiceRow,
  type PlatformPaymentMethod,
  type PlatformPaymentRow,
  type SubscriptionRow,
  type SubscriptionStatusKey,
} from '@aischool/shared';
import type { Prisma } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { dateOnly, fullName } from '../common/format';
import { env } from '../config/env';
import { PaystackService, type PaystackTransaction } from '../finance/paystack.service';
import { LedgerService, REVENUE_ACCOUNT } from '../ledger/ledger.service';
import { PrismaService } from '../prisma/prisma.service';

type SubscriptionWithPlan = Prisma.SubscriptionGetPayload<{ include: { plan: true; tenant: true } }>;
type InvoiceWithTenant = Prisma.PlatformInvoiceGetPayload<{ include: { tenant: true } }>;

const DAY = 86_400_000;
const CYCLE_MS = 60 * 60_000;

export function addMonths(d: Date, months: number): Date {
  const r = new Date(d);
  r.setUTCMonth(r.getUTCMonth() + months);
  return r;
}
const today = () => new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');

/**
 * What schools pay the platform. A subscription bills per student per
 * period: the larger of the committed seats and the school's active
 * students, at the plan's price (or a negotiated one), less any discount.
 * Invoices are one per subscription period (a unique key keeps the hourly
 * cycle from billing twice); payments come in through the platform's own
 * Paystack account or are recorded by finance staff.
 */
@Injectable()
export class PlatformBillingService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(PlatformBillingService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly paystack: PaystackService,
    private readonly audit: AuditService,
    private readonly ledger: LedgerService,
  ) {}

  /** An invoice is revenue earned and money owed. */
  async postInvoice(inv: { id: string; number: string; tenantId: string; amountKobo: number; domain: string; issuedAt: Date }) {
    const domain = inv.domain as 'SCHOOL' | 'STUDENT_AI' | 'EXAM';
    await this.ledger.safePost(
      { event: 'invoice', domain, sourceType: 'PLATFORM_INVOICE', sourceId: inv.id, tenantId: inv.tenantId, memo: `Invoice ${inv.number}`, at: inv.issuedAt },
      [
        { account: 'RECEIVABLE_SCHOOLS', debitKobo: inv.amountKobo },
        { account: REVENUE_ACCOUNT[domain], creditKobo: inv.amountKobo },
      ],
    );
  }

  onModuleInit() {
    if (env().NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.runCycle().catch((e: Error) => this.logger.error(`Billing cycle failed: ${e.message}`)), CYCLE_MS);
    this.timer.unref();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  // ---------------------------------------------------------- pricing

  unitKobo(s: { priceOverrideKobo: number | null; plan: { pricePerStudentKobo: number } }) {
    return s.priceOverrideKobo ?? s.plan.pricePerStudentKobo;
  }

  quote(s: { priceOverrideKobo: number | null; discountPct: number; studentSeats: number; plan: { pricePerStudentKobo: number; billingPeriod: string } }, activeStudents: number) {
    const seats = Math.max(s.studentSeats, activeStudents);
    const unit = this.unitKobo(s);
    const gross = seats * unit;
    const discount = Math.round((gross * s.discountPct) / 100);
    const amount = gross - discount;
    const months = BILLING_PERIOD_MONTHS[s.plan.billingPeriod as BillingPeriodKey] ?? 12;
    return { seats, unit, gross, discount, amount, monthly: Math.round(amount / months) };
  }

  async activeStudents(tenantIds: string[]) {
    const rows = await this.prisma.root.student.groupBy({ by: ['tenantId'], where: { tenantId: { in: tenantIds }, status: 'ACTIVE' }, _count: { _all: true } });
    return new Map(rows.map((r) => [r.tenantId, r._count._all]));
  }

  async outstanding(tenantIds: string[]) {
    const rows = await this.prisma.root.platformInvoice.findMany({ where: { tenantId: { in: tenantIds }, status: 'OPEN' }, select: { tenantId: true, amountKobo: true, paidKobo: true } });
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.tenantId, (m.get(r.tenantId) ?? 0) + r.amountKobo - r.paidKobo);
    return m;
  }

  /** The school's current subscription: the latest one that isn't cancelled, else the latest. */
  async current(tenantId: string): Promise<SubscriptionWithPlan | null> {
    return (
      (await this.prisma.root.subscription.findFirst({ where: { tenantId, status: { not: 'CANCELLED' } }, include: { plan: true, tenant: true }, orderBy: { createdAt: 'desc' } })) ??
      (await this.prisma.root.subscription.findFirst({ where: { tenantId }, include: { plan: true, tenant: true }, orderBy: { createdAt: 'desc' } }))
    );
  }

  subscriptionRow(s: SubscriptionWithPlan, active: number, outstanding: number): SubscriptionRow {
    const q = this.quote(s, active);
    return {
      id: s.id,
      tenant: { id: s.tenant.id, name: s.tenant.name, slug: s.tenant.slug, status: s.tenant.status },
      plan: { id: s.plan.id, name: s.plan.name, billingPeriod: s.plan.billingPeriod as BillingPeriodKey },
      status: s.status as SubscriptionStatusKey,
      studentSeats: s.studentSeats,
      activeStudents: active,
      billableSeats: q.seats,
      unitKobo: q.unit,
      discountPct: s.discountPct,
      priceOverrideKobo: s.priceOverrideKobo,
      periodAmountKobo: q.amount,
      monthlyKobo: s.status === 'ACTIVE' || s.status === 'PAST_DUE' ? q.monthly : 0,
      currentPeriodStart: dateOnly(s.currentPeriodStart)!,
      currentPeriodEnd: dateOnly(s.currentPeriodEnd)!,
      cancelAtPeriodEnd: s.cancelAtPeriodEnd,
      trialEndsAt: s.tenant.trialEndsAt?.toISOString() ?? null,
      outstandingKobo: outstanding,
      notes: s.notes,
    };
  }

  invoiceRow(i: InvoiceWithTenant): PlatformInvoiceRow {
    return {
      id: i.id,
      number: i.number,
      tenant: { id: i.tenant.id, name: i.tenant.name, slug: i.tenant.slug },
      description: i.description,
      periodStart: dateOnly(i.periodStart),
      periodEnd: dateOnly(i.periodEnd),
      seats: i.seats,
      unitKobo: i.unitKobo,
      discountKobo: i.discountKobo,
      amountKobo: i.amountKobo,
      paidKobo: i.paidKobo,
      balanceKobo: i.status === 'VOID' ? 0 : i.amountKobo - i.paidKobo,
      currency: i.currency,
      status: i.status,
      overdue: i.status === 'OPEN' && i.dueDate < today(),
      issuedAt: i.issuedAt.toISOString(),
      dueDate: dateOnly(i.dueDate)!,
      paidAt: i.paidAt?.toISOString() ?? null,
      notes: i.notes,
    };
  }

  paymentRow(p: Prisma.PlatformPaymentGetPayload<{ include: { tenant: true; invoice: true } }>, recordedBy: Map<string, string>): PlatformPaymentRow {
    return {
      id: p.id,
      tenant: { id: p.tenant.id, name: p.tenant.name, slug: p.tenant.slug },
      invoice: { id: p.invoice.id, number: p.invoice.number },
      amountKobo: p.amountKobo,
      method: p.method as PlatformPaymentMethod,
      status: p.status as PlatformPaymentRow['status'],
      reference: p.reference,
      paidAt: p.paidAt?.toISOString() ?? null,
      recordedBy: p.recordedById ? (recordedBy.get(p.recordedById) ?? null) : null,
      note: p.note,
      createdAt: p.createdAt.toISOString(),
    };
  }

  async recorderNames(ids: (string | null)[]) {
    const users = await this.prisma.root.user.findMany({ where: { id: { in: ids.filter((x): x is string => !!x) } }, select: { id: true, firstName: true, lastName: true } });
    return new Map(users.map((u) => [u.id, fullName(u)]));
  }

  // ---------------------------------------------------------- invoices

  private async nextNumber(tx: Prisma.TransactionClient): Promise<string> {
    const year = new Date().getUTCFullYear();
    const prefix = `AIS-${year}-`;
    const last = await tx.platformInvoice.findFirst({ where: { number: { startsWith: prefix } }, orderBy: { number: 'desc' }, select: { number: true } });
    const n = last ? Number(last.number.slice(prefix.length)) + 1 : 1;
    return `${prefix}${String(n).padStart(5, '0')}`;
  }

  /** Bills the subscription's current period, once. Returns null if it is already billed or free. */
  async invoicePeriod(subscriptionId: string, opts: { dueDays?: number } = {}) {
    const s = await this.prisma.root.subscription.findUniqueOrThrow({ where: { id: subscriptionId }, include: { plan: true, tenant: true } });
    if (s.status === 'CANCELLED') throw new BadRequestException('This subscription is cancelled');
    const exists = await this.prisma.root.platformInvoice.findUnique({ where: { subscriptionId_periodStart: { subscriptionId, periodStart: s.currentPeriodStart } } });
    if (exists) return null;
    const active = (await this.activeStudents([s.tenantId])).get(s.tenantId) ?? 0;
    const q = this.quote(s, active);
    if (q.amount <= 0) return null;
    const fmt = (d: Date) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
    const invoice = await this.prisma.root.$transaction(async (tx) =>
      tx.platformInvoice.create({
        data: {
          number: await this.nextNumber(tx),
          tenantId: s.tenantId,
          subscriptionId: s.id,
          description: `${s.plan.name} plan: ${q.seats} students, ${fmt(s.currentPeriodStart)} – ${fmt(s.currentPeriodEnd)}`,
          periodStart: s.currentPeriodStart,
          periodEnd: s.currentPeriodEnd,
          seats: q.seats,
          unitKobo: q.unit,
          discountKobo: q.discount,
          amountKobo: q.amount,
          currency: s.tenant.currency,
          dueDate: new Date(today().getTime() + (opts.dueDays ?? env().PLATFORM_INVOICE_DUE_DAYS) * DAY),
        },
      }),
    );
    await this.audit.log({ tenantId: s.tenantId, action: 'billing.invoice_issued', entityType: 'PlatformInvoice', entityId: invoice.id, summary: `Issued subscription invoice ${invoice.number} to ${s.tenant.name}` });
    await this.postInvoice(invoice);
    return invoice;
  }

  async manualInvoice(input: { tenantId: string; description: string; amountKobo: number; dueDate: string; notes: string | null; domain?: 'SCHOOL' | 'STUDENT_AI' | 'EXAM'; seats?: number; unitKobo?: number }) {
    const tenant = await this.prisma.root.tenant.findUnique({ where: { id: input.tenantId } });
    if (!tenant) throw new NotFoundException('School not found');
    const invoice = await this.prisma.root.$transaction(async (tx) =>
      tx.platformInvoice.create({
        data: {
          number: await this.nextNumber(tx),
          tenantId: tenant.id,
          description: input.description,
          amountKobo: input.amountKobo,
          currency: tenant.currency,
          dueDate: new Date(`${input.dueDate}T00:00:00Z`),
          notes: input.notes,
          domain: input.domain ?? 'SCHOOL',
          seats: input.seats ?? 0,
          unitKobo: input.unitKobo ?? 0,
        },
      }),
    );
    await this.audit.log({ tenantId: tenant.id, action: 'billing.invoice_issued', entityType: 'PlatformInvoice', entityId: invoice.id, summary: `Issued invoice ${invoice.number} to ${tenant.name}: ${input.description}` });
    await this.postInvoice(invoice);
    return invoice;
  }

  async voidInvoice(id: string, reason: string) {
    const inv = await this.prisma.root.platformInvoice.findUniqueOrThrow({ where: { id }, include: { tenant: true } });
    if (inv.status !== 'OPEN') throw new BadRequestException('Only open invoices can be voided');
    if (inv.paidKobo > 0) throw new BadRequestException('This invoice has payments against it; record a credit instead');
    await this.prisma.root.platformInvoice.update({ where: { id }, data: { status: 'VOID', notes: [inv.notes, `Voided: ${reason}`].filter(Boolean).join('\n') } });
    const domain = inv.domain as 'SCHOOL' | 'STUDENT_AI' | 'EXAM';
    await this.ledger.safePost(
      { event: 'void', domain, sourceType: 'PLATFORM_INVOICE', sourceId: id, tenantId: inv.tenantId, memo: `Voided ${inv.number}: ${reason}` },
      [
        { account: REVENUE_ACCOUNT[domain], debitKobo: inv.amountKobo },
        { account: 'RECEIVABLE_SCHOOLS', creditKobo: inv.amountKobo },
      ],
    );
    await this.audit.log({ tenantId: inv.tenantId, action: 'billing.invoice_voided', entityType: 'PlatformInvoice', entityId: id, summary: `Voided invoice ${inv.number} for ${inv.tenant.name}: ${reason}` });
  }

  // ---------------------------------------------------------- payments

  /**
   * Applies a successful payment to its invoice exactly once (the payment
   * row's status flips from PENDING with a conditional update), then marks
   * the invoice paid and brings the subscription and school back to active.
   */
  async settle(paymentId: string, paidAt: Date) {
    const flipped = await this.prisma.root.platformPayment.updateMany({ where: { id: paymentId, status: 'PENDING' }, data: { status: 'SUCCESS', paidAt } });
    if (!flipped.count) return false;
    await this.applyToInvoice(paymentId);
    return true;
  }

  private async applyToInvoice(paymentId: string) {
    const p = await this.prisma.root.platformPayment.findUniqueOrThrow({ where: { id: paymentId }, include: { invoice: true, tenant: true } });
    const inv = await this.prisma.root.platformInvoice.update({ where: { id: p.invoiceId }, data: { paidKobo: { increment: p.amountKobo } } });
    if (inv.paidKobo >= inv.amountKobo && inv.status === 'OPEN') {
      await this.prisma.root.platformInvoice.update({ where: { id: inv.id }, data: { status: 'PAID', paidAt: p.paidAt ?? new Date() } });
      if (inv.subscriptionId) {
        await this.prisma.root.subscription.updateMany({ where: { id: inv.subscriptionId, status: { in: ['TRIALING', 'PAST_DUE'] } }, data: { status: 'ACTIVE' } });
      }
      await this.prisma.root.tenant.updateMany({ where: { id: inv.tenantId, status: 'TRIAL' }, data: { status: 'ACTIVE' } });
    }
    await this.ledger.safePost(
      { event: 'payment', domain: inv.domain as 'SCHOOL' | 'STUDENT_AI' | 'EXAM', sourceType: 'PLATFORM_PAYMENT', sourceId: p.id, tenantId: p.tenantId, memo: `Payment for ${p.invoice.number} (${p.reference})`, at: p.paidAt ?? undefined },
      [
        { account: p.method === 'PAYSTACK' ? 'CASH_PAYSTACK' : 'CASH_BANK', debitKobo: p.amountKobo },
        { account: 'RECEIVABLE_SCHOOLS', creditKobo: p.amountKobo },
      ],
    );
    await this.audit.log({
      tenantId: p.tenantId,
      actorUserId: p.recordedById ?? null,
      action: 'billing.payment',
      entityType: 'PlatformPayment',
      entityId: p.id,
      summary: `Payment of ₦${(p.amountKobo / 100).toLocaleString('en-NG')} from ${p.tenant.name} for ${p.invoice.number} (${p.method.replace('_', ' ').toLowerCase()})`,
    });
  }

  async record(invoiceId: string, input: { amountKobo: number; method: string; reference: string; paidOn: string; note: string | null }, userId: string) {
    const inv = await this.prisma.root.platformInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
    if (inv.status !== 'OPEN') throw new BadRequestException(`This invoice is ${inv.status.toLowerCase()}`);
    if (input.amountKobo > inv.amountKobo - inv.paidKobo) throw new BadRequestException('That is more than the balance on the invoice');
    try {
      const p = await this.prisma.root.platformPayment.create({
        data: { tenantId: inv.tenantId, invoiceId, amountKobo: input.amountKobo, method: input.method, status: 'SUCCESS', reference: input.reference, paidAt: new Date(`${input.paidOn}T12:00:00Z`), recordedById: userId, note: input.note },
      });
      await this.applyToInvoice(p.id);
      return p;
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') throw new ConflictException('A payment with that reference is already recorded');
      throw err;
    }
  }

  onlineEnabled() {
    return Boolean(env().PLATFORM_PAYSTACK_SECRET_KEY);
  }

  private secret() {
    const s = env().PLATFORM_PAYSTACK_SECRET_KEY;
    if (!s) throw new BadRequestException('Online payment of subscriptions is not set up yet. Please pay by bank transfer.');
    return s;
  }

  async startOnline(tenantId: string, invoiceId: string, email: string, callbackUrl: string) {
    const inv = await this.prisma.root.platformInvoice.findFirst({ where: { id: invoiceId, tenantId } });
    if (!inv) throw new NotFoundException('Invoice not found');
    if (inv.status !== 'OPEN') throw new BadRequestException(`This invoice is ${inv.status.toLowerCase()}`);
    const amount = inv.amountKobo - inv.paidKobo;
    const reference = this.paystack.newReference().replace(/^AIS-/, 'SUB-');
    await this.prisma.root.platformPayment.create({ data: { tenantId, invoiceId, amountKobo: amount, method: 'PAYSTACK', status: 'PENDING', reference } });
    const res = await this.paystack.call<{ authorization_url: string; reference: string }>(this.secret(), 'POST', '/transaction/initialize', {
      email,
      amount,
      currency: inv.currency,
      reference,
      callback_url: callbackUrl,
      metadata: { kind: 'subscription', invoiceNumber: inv.number, tenantId },
    });
    return { authorizationUrl: res.authorization_url, reference };
  }

  /** Checks a Paystack reference and settles it if paid in full. Safe to call repeatedly. */
  async verifyOnline(reference: string, tenantId?: string) {
    const p = await this.prisma.root.platformPayment.findUnique({ where: { reference } });
    if (!p || p.method !== 'PAYSTACK' || (tenantId && p.tenantId !== tenantId)) throw new NotFoundException('Payment not found');
    if (p.status !== 'PENDING') return { status: p.status, invoiceId: p.invoiceId };
    const tx = await this.paystack.call<PaystackTransaction>(this.secret(), 'GET', `/transaction/verify/${encodeURIComponent(reference)}`);
    if (tx.status === 'success') {
      if (tx.amount !== p.amountKobo) {
        this.logger.warn(`Subscription payment ${reference}: paid ${tx.amount}, expected ${p.amountKobo}`);
        await this.prisma.root.platformPayment.update({ where: { id: p.id }, data: { status: 'FAILED', note: `Amount mismatch: Paystack reported ${tx.amount} kobo` } });
        return { status: 'FAILED', invoiceId: p.invoiceId };
      }
      if (await this.settle(p.id, tx.paid_at ? new Date(tx.paid_at) : new Date())) {
        const fee = tx.fees ?? 0;
        if (fee > 0) {
          const inv = await this.prisma.root.platformInvoice.findUniqueOrThrow({ where: { id: p.invoiceId }, select: { domain: true } });
          await this.ledger.safePost(
            { event: 'fee', domain: inv.domain as 'SCHOOL' | 'STUDENT_AI' | 'EXAM', sourceType: 'PLATFORM_PAYMENT', sourceId: p.id, tenantId: p.tenantId, memo: `Paystack fee on ${reference}` },
            [
              { account: 'PAYMENT_FEES', debitKobo: fee },
              { account: 'CASH_PAYSTACK', creditKobo: fee },
            ],
          );
        }
      }
      return { status: 'SUCCESS', invoiceId: p.invoiceId };
    }
    if (tx.status === 'failed' || tx.status === 'abandoned' || tx.status === 'reversed') {
      await this.prisma.root.platformPayment.updateMany({ where: { id: p.id, status: 'PENDING' }, data: { status: 'FAILED' } });
      return { status: 'FAILED', invoiceId: p.invoiceId };
    }
    return { status: 'PENDING', invoiceId: p.invoiceId };
  }

  webhookSignatureValid(raw: Buffer, signature: string | undefined) {
    const secret = env().PLATFORM_PAYSTACK_SECRET_KEY;
    return !!secret && PaystackService.signatureMatches(secret, raw, signature);
  }

  // ---------------------------------------------------------- the cycle

  /**
   * Hourly, and from the console on demand:
   *  - active subscriptions past their period end roll into the next period
   *    (or cancel, if set to cancel at period end) and get that period's invoice,
   *  - active subscriptions with an overdue invoice become PAST_DUE,
   *  - trials past their end date with an unpaid invoice become PAST_DUE too.
   * Nothing is suspended automatically: that stays a person's decision.
   */
  async runCycle() {
    if (this.running) return { renewed: 0, invoiced: 0, pastDue: 0, cancelled: 0 };
    this.running = true;
    const result = { renewed: 0, invoiced: 0, pastDue: 0, cancelled: 0 };
    try {
      const now = new Date();
      const due = await this.prisma.root.subscription.findMany({ where: { status: { in: ['ACTIVE', 'PAST_DUE'] }, currentPeriodEnd: { lte: now } }, include: { plan: true } });
      for (const s of due) {
        if (s.cancelAtPeriodEnd) {
          await this.prisma.root.subscription.update({ where: { id: s.id }, data: { status: 'CANCELLED' } });
          await this.audit.log({ tenantId: s.tenantId, actorUserId: null, action: 'billing.subscription_cancelled', summary: 'Subscription ended at the close of its period' });
          result.cancelled++;
          continue;
        }
        const months = BILLING_PERIOD_MONTHS[s.plan.billingPeriod as BillingPeriodKey] ?? 12;
        await this.prisma.root.subscription.update({ where: { id: s.id }, data: { currentPeriodStart: s.currentPeriodEnd, currentPeriodEnd: addMonths(s.currentPeriodEnd, months) } });
        result.renewed++;
        if (await this.invoicePeriod(s.id)) result.invoiced++;
      }

      const overdue = await this.prisma.root.platformInvoice.findMany({ where: { status: 'OPEN', dueDate: { lt: today() }, subscriptionId: { not: null } }, select: { subscriptionId: true, tenantId: true, number: true } });
      for (const inv of overdue) {
        const r = await this.prisma.root.subscription.updateMany({ where: { id: inv.subscriptionId!, status: { in: ['ACTIVE', 'TRIALING'] } }, data: { status: 'PAST_DUE' } });
        if (r.count) {
          result.pastDue++;
          await this.audit.log({ tenantId: inv.tenantId, actorUserId: null, action: 'billing.past_due', summary: `Subscription is past due: invoice ${inv.number} is overdue` });
        }
      }
    } finally {
      this.running = false;
    }
    return result;
  }
}
