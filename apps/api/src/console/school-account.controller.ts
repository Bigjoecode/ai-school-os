import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  createTicketSchema,
  ticketReplySchema,
  type SchoolBilling,
  type TicketDetail,
  type TicketRow,
} from '@aischool/shared';
import { z } from 'zod';
import { RequirePermissions } from '../common/decorators';
import { currentContext, currentTenantId, currentUserId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { env } from '../config/env';
import { FeatureService } from '../features/features.service';
import { siteOrigin } from '../finance/finance.controller';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformBillingService } from './billing.service';
import { SupportService } from './support.service';

/** A school's own view of its AI School OS account: subscription, invoices and payments. */
@Controller('billing')
export class SchoolBillingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: PlatformBillingService,
    private readonly features: FeatureService,
  ) {}

  @Get()
  @RequirePermissions('billing.manage')
  async overview(): Promise<SchoolBilling> {
    const tenantId = currentTenantId();
    const db = this.prisma.db;
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const [tenant, sub, invoices, payments, active, staff, ai, states] = await Promise.all([
      this.prisma.root.tenant.findUniqueOrThrow({ where: { id: tenantId }, include: { plan: true } }),
      this.billing.current(tenantId),
      db.platformInvoice.findMany({ include: { tenant: true }, orderBy: { issuedAt: 'desc' }, take: 50 }),
      db.platformPayment.findMany({ where: { status: { not: 'FAILED' } }, include: { tenant: true, invoice: true }, orderBy: { createdAt: 'desc' }, take: 50 }),
      db.student.count({ where: { status: 'ACTIVE' } }),
      db.staff.count({ where: { status: { not: 'EXITED' } } }),
      db.aiUsage.aggregate({ where: { createdAt: { gte: monthStart } }, _sum: { costUsd: true } }),
      this.features.states(tenantId),
    ]);
    const outstanding = invoices.filter((i) => i.status === 'OPEN').reduce((t, i) => t + i.amountKobo - i.paidKobo, 0);
    const budget = tenant.aiMonthlyBudgetUsd !== null ? Number(tenant.aiMonthlyBudgetUsd) : env().AI_DEFAULT_MONTHLY_BUDGET_USD;
    const names = new Map<string, string>();
    const subRow = sub ? this.billing.subscriptionRow(sub, active, outstanding) : null;
    return {
      status: tenant.status,
      trialEndsAt: tenant.trialEndsAt?.toISOString() ?? null,
      plan: tenant.plan
        ? {
            name: tenant.plan.name,
            description: tenant.plan.description,
            billingPeriod: tenant.plan.billingPeriod,
            pricePerStudentKobo: tenant.plan.pricePerStudentKobo,
            features: tenant.plan.features,
            aiMonthlyBudgetUsd: tenant.plan.aiMonthlyBudgetUsd !== null ? Number(tenant.plan.aiMonthlyBudgetUsd) : null,
            maxStudents: tenant.plan.maxStudents,
          }
        : null,
      subscription: subRow ? (({ tenant: _t, plan: _p, notes: _n, ...rest }) => rest)(subRow) : null,
      invoices: invoices.map((i) => (({ tenant: _t, ...rest }) => rest)(this.billing.invoiceRow(i))),
      payments: payments.map((p) => (({ tenant: _t, recordedBy: _r, ...rest }) => rest)(this.billing.paymentRow(p, names))),
      outstandingKobo: outstanding,
      onlinePayment: this.billing.onlineEnabled(),
      bankDetails: env().PLATFORM_BANK_DETAILS?.replace(/\\n/g, '\n') ?? null,
      features: states,
      usage: { activeStudents: active, staff, aiSpendUsd: Math.round(Number(ai._sum.costUsd ?? 0) * 100) / 100, aiBudgetUsd: budget > 0 ? budget : null },
    };
  }

  @Post('invoices/:id/pay')
  @HttpCode(200)
  @RequirePermissions('billing.manage')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async pay(@Param('id') id: string, @Req() req: Request, @Body(new ZodPipe(z.object({ email: z.email().trim().toLowerCase().max(160).nullish() }).default({}))) body: { email?: string | null }) {
    const user = await this.prisma.root.user.findUniqueOrThrow({ where: { id: currentUserId() }, select: { email: true } });
    return this.billing.startOnline(currentTenantId(), id, body.email || user.email, `${siteOrigin(req)}/settings/billing?paid=1`);
  }

  @Get('verify')
  @RequirePermissions('billing.manage')
  verify(@Query(new ZodPipe(z.object({ reference: z.string().min(6).max(80) }))) q: { reference: string }) {
    return this.billing.verifyOnline(q.reference, currentTenantId());
  }
}

/** A school's help desk: open tickets with AI School OS support and follow replies. */
@Controller('support')
export class SchoolSupportController {
  constructor(private readonly support: SupportService) {}

  @Get('tickets')
  @RequirePermissions('support.use')
  tickets(): Promise<TicketRow[]> {
    return this.support.list({}, true);
  }

  @Post('tickets')
  @RequirePermissions('support.use')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  open(@Body(new ZodPipe(createTicketSchema)) body: z.infer<typeof createTicketSchema>): Promise<TicketDetail> {
    return this.support.open(currentTenantId(), currentContext().userId!, body);
  }

  @Get('tickets/:id')
  @RequirePermissions('support.use')
  ticket(@Param('id') id: string): Promise<TicketDetail> {
    return this.support.detail(id, { scoped: true });
  }

  @Post('tickets/:id/reply')
  @HttpCode(200)
  @RequirePermissions('support.use')
  reply(@Param('id') id: string, @Body(new ZodPipe(ticketReplySchema.pick({ body: true }))) body: { body: string }): Promise<TicketDetail> {
    return this.support.schoolReply(id, currentUserId(), body.body);
  }

  @Post('tickets/:id/close')
  @HttpCode(200)
  @RequirePermissions('support.use')
  close(@Param('id') id: string): Promise<TicketDetail> {
    return this.support.schoolClose(id);
  }
}
