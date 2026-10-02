import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import {
  PLATFORM_AREAS,
  PLATFORM_INVOICE_STATUSES,
  platformInvoiceSchema,
  recordPlatformPaymentSchema,
  subscriptionUpdateSchema,
  type PlatformInvoiceRow,
  type PlatformInvoiceStatus,
  type PlatformPaymentRow,
  type SubscriptionRow,
  type SubscriptionUpdateInput,
} from '@aischool/shared';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { RequirePlatformRole } from '../common/decorators';
import { currentUserId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { FeatureService } from '../features/features.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformBillingService } from './billing.service';

/** Subscriptions, invoices and payments for the platform's finance team. */
@Controller('platform')
@RequirePlatformRole(...PLATFORM_AREAS.billing)
export class ConsoleBillingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: PlatformBillingService,
    private readonly features: FeatureService,
    private readonly audit: AuditService,
  ) {}

  @Get('subscriptions')
  async subscriptions(): Promise<SubscriptionRow[]> {
    const subs = await this.prisma.root.subscription.findMany({ include: { plan: true, tenant: true }, orderBy: [{ status: 'asc' }, { currentPeriodEnd: 'asc' }] });
    const ids = subs.map((s) => s.tenantId);
    const [active, outstanding] = await Promise.all([this.billing.activeStudents(ids), this.billing.outstanding(ids)]);
    return subs.map((s) => this.billing.subscriptionRow(s, active.get(s.tenantId) ?? 0, outstanding.get(s.tenantId) ?? 0));
  }

  @Put('subscriptions/:id')
  async updateSubscription(@Param('id') id: string, @Body(new ZodPipe(subscriptionUpdateSchema)) body: SubscriptionUpdateInput) {
    if (body.currentPeriodEnd <= body.currentPeriodStart) throw new BadRequestException('The period must end after it starts');
    const plan = await this.prisma.root.plan.findUnique({ where: { id: body.planId } });
    if (!plan) throw new BadRequestException('Unknown plan');
    const s = await this.prisma.root.subscription.update({
      where: { id },
      data: { ...body, currentPeriodStart: new Date(`${body.currentPeriodStart}T00:00:00Z`), currentPeriodEnd: new Date(`${body.currentPeriodEnd}T00:00:00Z`) },
      include: { tenant: true },
    });
    // The school's plan follows its subscription.
    await this.prisma.root.tenant.update({ where: { id: s.tenantId }, data: { planId: body.planId } });
    this.features.invalidate(s.tenantId);
    await this.audit.log({ tenantId: null, action: 'billing.subscription_updated', entityType: 'Subscription', entityId: id, summary: `Updated ${s.tenant.name}'s subscription: ${plan.name}, ${body.status.toLowerCase().replace('_', ' ')}, ${body.studentSeats} seats${body.discountPct ? `, ${body.discountPct}% off` : ''}` });
    return { ok: true };
  }

  /** Bills the current period now (it is otherwise billed when the period rolls over). */
  @Post('subscriptions/:id/invoice')
  @HttpCode(200)
  async invoiceNow(@Param('id') id: string) {
    const inv = await this.billing.invoicePeriod(id);
    if (!inv) throw new BadRequestException('This period is already invoiced, or there is nothing to bill');
    return { id: inv.id, number: inv.number };
  }

  @Post('billing/run')
  @HttpCode(200)
  @RequirePlatformRole('SUPER_ADMIN', 'FINANCE_ADMIN')
  async run() {
    const r = await this.billing.runCycle();
    await this.audit.log({ tenantId: null, action: 'billing.cycle_run', summary: `Ran the billing cycle: ${r.renewed} renewed, ${r.invoiced} invoiced, ${r.pastDue} past due, ${r.cancelled} cancelled` });
    return r;
  }

  @Get('invoices')
  async invoices(
    @Query(new ZodPipe(z.object({ status: z.enum([...PLATFORM_INVOICE_STATUSES, 'OVERDUE']).optional(), tenantId: z.string().optional() })))
    q: { status?: PlatformInvoiceStatus | 'OVERDUE'; tenantId?: string },
  ): Promise<PlatformInvoiceRow[]> {
    const today = new Date(new Date().toISOString().slice(0, 10));
    const rows = await this.prisma.root.platformInvoice.findMany({
      where: {
        ...(q.tenantId ? { tenantId: q.tenantId } : {}),
        ...(q.status === 'OVERDUE' ? { status: 'OPEN', dueDate: { lt: today } } : q.status ? { status: q.status } : {}),
      },
      include: { tenant: true },
      orderBy: { issuedAt: 'desc' },
      take: 500,
    });
    return rows.map((i) => this.billing.invoiceRow(i));
  }

  @Post('invoices')
  async createInvoice(@Body(new ZodPipe(platformInvoiceSchema)) body: z.infer<typeof platformInvoiceSchema>) {
    const inv = await this.billing.manualInvoice(body);
    return { id: inv.id, number: inv.number };
  }

  @Post('invoices/:id/void')
  @HttpCode(200)
  async voidInvoice(@Param('id') id: string, @Body(new ZodPipe(z.object({ reason: z.string().trim().min(3).max(300) }))) body: { reason: string }) {
    await this.billing.voidInvoice(id, body.reason);
    return { ok: true };
  }

  @Post('invoices/:id/payments')
  async recordPayment(@Param('id') id: string, @Body(new ZodPipe(recordPlatformPaymentSchema)) body: z.infer<typeof recordPlatformPaymentSchema>) {
    const p = await this.billing.record(id, body, currentUserId());
    return { id: p.id };
  }

  @Get('payments')
  async payments(): Promise<PlatformPaymentRow[]> {
    const rows = await this.prisma.root.platformPayment.findMany({ include: { tenant: true, invoice: true }, orderBy: { createdAt: 'desc' }, take: 500 });
    const names = await this.billing.recorderNames(rows.map((r) => r.recordedById));
    return rows.map((p) => this.billing.paymentRow(p, names));
  }

  /** Re-checks a pending online payment with Paystack. */
  @Post('payments/:reference/verify')
  @HttpCode(200)
  verify(@Param('reference') reference: string) {
    return this.billing.verifyOnline(reference);
  }
}
