import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  EXPENSE_CATEGORY_LABELS,
  PAYMENT_METHOD_LABELS,
  aiFeeReminderSchema,
  copyFeesSchema,
  expenseListQuerySchema,
  expenseSchema,
  feeItemSchema,
  feeReminderSchema,
  financeReportQuerySchema,
  financeSettingsSchema,
  formatMoney,
  generateInvoicesSchema,
  invoiceLineSchema,
  invoiceListQuerySchema,
  paymentListQuerySchema,
  paystackSettingsSchema,
  recordPaymentSchema,
  reversePaymentSchema,
  type ExpenseInput,
  type ExpenseRow,
  type FeeItemInput,
  type FeeItemRow,
  type FeeReminder,
  type FinanceOverview,
  type FinanceSettings,
  type GenerateInvoicesInput,
  type GenerateInvoicesResult,
  type InvoiceDetail,
  type InvoiceLineInput,
  type InvoiceListQuery,
  type InvoiceRow,
  type Paginated,
  type PaymentListQuery,
  type PaymentRow,
  type PaystackStatus,
  type ReceiptView,
  type RecordPaymentInput,
} from '@aischool/shared';
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { AuditService } from '../audit/audit.service';
import { RequirePermissions } from '../common/decorators';
import { dateOnly, paginate, parseDate } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { schoolNow } from '../common/school-time';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceService, invoiceInclude, paymentInclude } from './finance.service';
import { PaystackService } from './paystack.service';
import { feeReminderPrompt, financeBriefingPrompt } from './prompts';

export function siteOrigin(req: Request): string {
  const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0] ?? req.protocol;
  const host = (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers.host;
  return (req.headers.origin as string | undefined) ?? `${proto}://${host}`;
}

@Controller('finance')
export class FinanceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: FinanceService,
    private readonly paystack: PaystackService,
    private readonly gateway: AiGatewayService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------- settings

  @Get('settings')
  @RequirePermissions('finance.read')
  settings() {
    return this.finance.settings();
  }

  @Put('settings')
  @RequirePermissions('finance.manage')
  setSettings(@Body(new ZodPipe(financeSettingsSchema)) body: FinanceSettings) {
    return this.finance.setSettings(body);
  }

  @Get('paystack')
  @RequirePermissions('finance.read')
  async paystackStatus(): Promise<PaystackStatus> {
    const t = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: currentTenantId() }, select: { slug: true } });
    return this.paystack.status(currentTenantId(), t.slug);
  }

  @Put('paystack')
  @RequirePermissions('finance.manage', 'school.manage')
  async connectPaystack(@Body(new ZodPipe(paystackSettingsSchema)) body: z.infer<typeof paystackSettingsSchema>): Promise<PaystackStatus> {
    await this.paystack.connect(currentTenantId(), body.publicKey, body.secretKey);
    await this.audit.log({ action: 'finance.paystack_connected', summary: `Connected Paystack (${body.secretKey.startsWith('sk_live_') ? 'live' : 'test'} keys)` });
    return this.paystackStatus();
  }

  @Delete('paystack')
  @HttpCode(204)
  @RequirePermissions('finance.manage', 'school.manage')
  async disconnectPaystack() {
    await this.paystack.disconnect(currentTenantId());
    await this.audit.log({ action: 'finance.paystack_disconnected', summary: 'Disconnected Paystack' });
  }

  // ---------------------------------------------------------- fee schedule

  @Get('fees')
  @RequirePermissions('finance.read')
  async fees(@Query(new ZodPipe(z.object({ termId: z.string().min(1) }))) q: { termId: string }): Promise<FeeItemRow[]> {
    const rows = await this.prisma.db.feeItem.findMany({
      where: { termId: q.termId },
      include: { _count: { select: { lines: true } } },
      orderBy: [{ optional: 'asc' }, { category: 'asc' }, { name: 'asc' }],
    });
    return rows.map((f) => ({
      id: f.id,
      termId: f.termId,
      name: f.name,
      category: f.category as FeeItemRow['category'],
      amountKobo: f.amountKobo,
      classLevelIds: f.classLevelIds,
      optional: f.optional,
      invoicedCount: f._count.lines,
    }));
  }

  @Post('fees')
  @RequirePermissions('finance.manage')
  async createFee(@Body(new ZodPipe(feeItemSchema)) body: FeeItemInput) {
    await this.checkLevels(body.classLevelIds);
    await this.prisma.db.term.findUniqueOrThrow({ where: { id: body.termId } });
    const fee = await this.prisma.db.feeItem.create({ data: { ...body, tenantId: currentTenantId() } });
    await this.audit.log({ action: 'finance.fee_added', entityType: 'FeeItem', entityId: fee.id, summary: `Added fee "${fee.name}" (${fee.amountKobo / 100})` });
    return fee;
  }

  @Put('fees/:id')
  @RequirePermissions('finance.manage')
  async updateFee(@Param('id') id: string, @Body(new ZodPipe(feeItemSchema)) body: FeeItemInput) {
    await this.checkLevels(body.classLevelIds);
    // Changing a fee doesn't rewrite invoices already issued; new invoices use the new amount.
    return this.prisma.db.feeItem.update({ where: { id }, data: body });
  }

  @Delete('fees/:id')
  @HttpCode(204)
  @RequirePermissions('finance.manage')
  async deleteFee(@Param('id') id: string) {
    await this.prisma.db.feeItem.delete({ where: { id } });
  }

  @Post('fees/copy')
  @HttpCode(200)
  @RequirePermissions('finance.manage')
  async copyFees(@Body(new ZodPipe(copyFeesSchema)) body: z.infer<typeof copyFeesSchema>) {
    const from = await this.prisma.db.feeItem.findMany({ where: { termId: body.fromTermId } });
    await this.prisma.db.term.findUniqueOrThrow({ where: { id: body.toTermId } });
    if (!from.length) throw new BadRequestException('That term has no fee items to copy');
    await this.prisma.db.feeItem.createMany({
      data: from.map(({ name, category, amountKobo, classLevelIds, optional }) => ({
        tenantId: currentTenantId(),
        termId: body.toTermId,
        name,
        category,
        amountKobo,
        classLevelIds,
        optional,
      })),
    });
    return { copied: from.length };
  }

  private async checkLevels(ids: string[]) {
    if (ids.length && (await this.prisma.db.classLevel.count({ where: { id: { in: ids } } })) !== ids.length) {
      throw new BadRequestException('Some class levels were not found');
    }
  }

  // ---------------------------------------------------------- invoices

  @Post('invoices/generate')
  @HttpCode(200)
  @RequirePermissions('finance.manage')
  generate(@Body(new ZodPipe(generateInvoicesSchema)) body: GenerateInvoicesInput): Promise<GenerateInvoicesResult> {
    return this.finance.generateInvoices(body);
  }

  @Get('invoices')
  @RequirePermissions('finance.read')
  async invoices(@Query(new ZodPipe(invoiceListQuerySchema)) q: InvoiceListQuery): Promise<Paginated<InvoiceRow>> {
    const settings = await this.finance.settings();
    const today = schoolNow(settings.timezone).date;
    const terms = q.q?.split(/\s+/).filter(Boolean) ?? [];
    const where: Prisma.InvoiceWhereInput = {
      ...(q.termId ? { termId: q.termId } : {}),
      ...(q.classArmId ? { student: { classArmId: q.classArmId } } : {}),
      ...(q.status === 'OUTSTANDING' || q.status === 'OVERDUE'
        ? { status: { in: ['ISSUED', 'PART_PAID'] }, ...(q.status === 'OVERDUE' ? { dueDate: { lt: parseDate(today) } } : {}) }
        : q.status
          ? { status: q.status }
          : {}),
      AND: terms.map((t) => ({
        OR: [
          { number: { contains: t, mode: 'insensitive' as const } },
          { student: { firstName: { contains: t, mode: 'insensitive' as const } } },
          { student: { lastName: { contains: t, mode: 'insensitive' as const } } },
          { student: { admissionNumber: { contains: t, mode: 'insensitive' as const } } },
        ],
      })),
    };
    const [rows, total] = await Promise.all([
      this.prisma.db.invoice.findMany({
        where,
        include: invoiceInclude,
        orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
        ...paginate(q.page, q.pageSize),
      }),
      this.prisma.db.invoice.count({ where }),
    ]);
    return { items: rows.map((r) => this.finance.invoiceRow(r, today)), total, page: q.page, pageSize: q.pageSize };
  }

  @Get('invoices/:id')
  @RequirePermissions('finance.read')
  async invoice(@Param('id') id: string): Promise<InvoiceDetail> {
    return this.finance.invoiceDetail(id, await this.paystack.connected(currentTenantId()));
  }

  @Post('invoices/:id/lines')
  @RequirePermissions('finance.manage')
  async addLine(@Param('id') id: string, @Body(new ZodPipe(invoiceLineSchema)) body: InvoiceLineInput): Promise<InvoiceDetail> {
    const invoice = await this.prisma.db.invoice.findUniqueOrThrow({ where: { id } });
    if (invoice.status === 'CANCELLED') throw new BadRequestException('This invoice was cancelled');
    const amount = body.kind === 'DISCOUNT' ? -body.amountKobo : body.amountKobo;
    if (invoice.totalKobo + amount < invoice.paidKobo) throw new BadRequestException('That would bring the total below what has already been paid');
    await this.prisma.db.$transaction(async (tx) => {
      await tx.invoiceLine.create({ data: { tenantId: currentTenantId(), invoiceId: id, description: body.description, kind: body.kind, amountKobo: amount } });
      await this.finance.refreshInvoice(tx, id);
    });
    await this.audit.log({ action: 'finance.invoice_line', entityType: 'Invoice', entityId: id, summary: `Added ${body.kind.toLowerCase()} "${body.description}" to ${invoice.number}` });
    return this.invoice(id);
  }

  @Delete('invoices/:id/lines/:lineId')
  @RequirePermissions('finance.manage')
  async removeLine(@Param('id') id: string, @Param('lineId') lineId: string): Promise<InvoiceDetail> {
    const [invoice, line] = await Promise.all([
      this.prisma.db.invoice.findUniqueOrThrow({ where: { id } }),
      this.prisma.db.invoiceLine.findFirstOrThrow({ where: { id: lineId, invoiceId: id } }),
    ]);
    if (invoice.totalKobo - line.amountKobo < invoice.paidKobo) throw new BadRequestException('That would bring the total below what has already been paid');
    await this.prisma.db.$transaction(async (tx) => {
      await tx.invoiceLine.delete({ where: { id: lineId } });
      await this.finance.refreshInvoice(tx, id);
    });
    return this.invoice(id);
  }

  @Post('invoices/:id/cancel')
  @HttpCode(200)
  @RequirePermissions('finance.manage')
  async cancel(@Param('id') id: string, @Body(new ZodPipe(reversePaymentSchema)) body: { reason: string }): Promise<InvoiceDetail> {
    const invoice = await this.prisma.db.invoice.findUniqueOrThrow({ where: { id } });
    if (invoice.paidKobo > 0) throw new BadRequestException('Reverse the payments on this invoice before cancelling it');
    await this.prisma.db.invoice.update({ where: { id }, data: { status: 'CANCELLED', note: body.reason } });
    await this.audit.log({ action: 'finance.invoice_cancelled', entityType: 'Invoice', entityId: id, summary: `Cancelled ${invoice.number}: ${body.reason}` });
    return this.invoice(id);
  }

  // ---------------------------------------------------------- payments

  @Get('payments')
  @RequirePermissions('finance.read')
  async payments(@Query(new ZodPipe(paymentListQuerySchema)) q: PaymentListQuery): Promise<Paginated<PaymentRow>> {
    const where: Prisma.PaymentWhereInput = {
      status: { in: ['SUCCESS', 'REVERSED'] },
      ...(q.method ? { method: q.method } : {}),
      ...(q.from || q.to ? { paidAt: { ...(q.from ? { gte: new Date(`${q.from}T00:00:00Z`) } : {}), ...(q.to ? { lte: new Date(`${q.to}T23:59:59Z`) } : {}) } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.db.payment.findMany({ where, include: paymentInclude, orderBy: { paidAt: 'desc' }, ...paginate(q.page, q.pageSize) }),
      this.prisma.db.payment.count({ where }),
    ]);
    const names = await this.finance.userNames(rows.map((r) => r.receivedById));
    return { items: rows.map((r) => this.finance.paymentRow(r, names)), total, page: q.page, pageSize: q.pageSize };
  }

  @Post('payments')
  @RequirePermissions('finance.manage')
  async record(@Body(new ZodPipe(recordPaymentSchema)) body: RecordPaymentInput): Promise<ReceiptView> {
    const payment = await this.finance.recordPayment(body);
    return this.receipt(payment.id);
  }

  @Post('payments/:id/reverse')
  @HttpCode(200)
  @RequirePermissions('finance.manage')
  async reverse(@Param('id') id: string, @Body(new ZodPipe(reversePaymentSchema)) body: { reason: string }): Promise<ReceiptView> {
    const payment = await this.prisma.db.payment.findUniqueOrThrow({ where: { id } });
    if (payment.status !== 'SUCCESS') throw new BadRequestException('Only successful payments can be reversed');
    if (payment.method === 'PAYSTACK') throw new BadRequestException('Refund online payments from the Paystack dashboard, then record the reversal here with a note');
    await this.prisma.db.$transaction(async (tx) => {
      await tx.payment.update({ where: { id }, data: { status: 'REVERSED', note: `Reversed: ${body.reason}` } });
      await this.finance.refreshInvoice(tx, payment.invoiceId);
    });
    await this.audit.log({ action: 'finance.payment_reversed', entityType: 'Payment', entityId: id, summary: `Reversed receipt ${payment.receiptNumber}: ${body.reason}` });
    return this.receipt(id);
  }

  @Get('payments/:id/receipt')
  @RequirePermissions('finance.read')
  async receipt(@Param('id') id: string): Promise<ReceiptView> {
    const p = await this.prisma.db.payment.findUniqueOrThrow({
      where: { id },
      include: { ...paymentInclude, invoice: { include: { term: true } } },
    });
    const [settings, tenant, names] = await Promise.all([
      this.finance.settings(),
      this.prisma.root.tenant.findUniqueOrThrow({ where: { id: currentTenantId() }, select: { name: true, address: true, phone: true, email: true, logoUrl: true } }),
      this.finance.userNames([p.receivedById]),
    ]);
    return {
      ...this.finance.paymentRow(p, names),
      school: { ...tenant, bankDetails: settings.bankDetails },
      currency: settings.currency,
      invoice: {
        number: p.invoice.number,
        totalKobo: p.invoice.totalKobo,
        paidKobo: p.invoice.paidKobo,
        balanceKobo: Math.max(0, p.invoice.totalKobo - p.invoice.paidKobo),
        term: p.invoice.term.name,
      },
    };
  }

  // ---------------------------------------------------------- expenses

  @Get('expenses')
  @RequirePermissions('finance.read')
  async expenses(@Query(new ZodPipe(expenseListQuerySchema)) q: z.infer<typeof expenseListQuerySchema>): Promise<ExpenseRow[]> {
    const rows = await this.prisma.db.expense.findMany({
      where: {
        ...(q.category ? { category: q.category } : {}),
        ...(q.from || q.to ? { spentOn: { ...(q.from ? { gte: parseDate(q.from) } : {}), ...(q.to ? { lte: parseDate(q.to) } : {}) } } : {}),
      },
      orderBy: [{ spentOn: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
    const names = await this.finance.userNames(rows.map((r) => r.recordedById));
    return rows.map((e) => ({
      id: e.id,
      category: e.category as ExpenseRow['category'],
      description: e.description,
      amountKobo: e.amountKobo,
      spentOn: dateOnly(e.spentOn)!,
      paidTo: e.paidTo,
      method: e.method,
      reference: e.reference,
      recordedBy: e.recordedById ? (names.get(e.recordedById) ?? null) : null,
    }));
  }

  @Post('expenses')
  @RequirePermissions('finance.manage')
  async createExpense(@Body(new ZodPipe(expenseSchema)) body: ExpenseInput) {
    const e = await this.prisma.db.expense.create({
      data: { ...body, spentOn: parseDate(body.spentOn), tenantId: currentTenantId(), recordedById: currentContext().userId },
    });
    await this.audit.log({
      action: 'finance.expense',
      entityType: 'Expense',
      entityId: e.id,
      summary: `Recorded ${EXPENSE_CATEGORY_LABELS[body.category].toLowerCase()} expense: ${body.description} (${body.amountKobo / 100})`,
    });
    return e;
  }

  @Put('expenses/:id')
  @RequirePermissions('finance.manage')
  updateExpense(@Param('id') id: string, @Body(new ZodPipe(expenseSchema)) body: ExpenseInput) {
    return this.prisma.db.expense.update({ where: { id }, data: { ...body, spentOn: parseDate(body.spentOn) } });
  }

  @Delete('expenses/:id')
  @HttpCode(204)
  @RequirePermissions('finance.manage')
  async deleteExpense(@Param('id') id: string) {
    const e = await this.prisma.db.expense.findUniqueOrThrow({ where: { id } });
    await this.prisma.db.expense.delete({ where: { id } });
    await this.audit.log({ action: 'finance.expense_deleted', entityType: 'Expense', entityId: id, summary: `Deleted expense: ${e.description}` });
  }

  // ---------------------------------------------------------- reports & AI

  @Get('overview')
  @RequirePermissions('finance.read')
  async overview(@Query(new ZodPipe(financeReportQuerySchema)) q: { termId?: string }): Promise<FinanceOverview> {
    return this.finance.overview(q.termId, await this.paystack.connected(currentTenantId()));
  }

  @Post('insight')
  @HttpCode(200)
  @RequirePermissions('finance.read', 'ai.use')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async insight(@Body(new ZodPipe(financeReportQuerySchema)) q: { termId?: string }) {
    const o = await this.finance.overview(q.termId, await this.paystack.connected(currentTenantId()));
    if (!o.invoices.total) throw new BadRequestException('No invoices have been issued for this term yet');
    const money = (k: number) => formatMoney(k, o.currency);
    const tenant = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: currentTenantId() }, select: { name: true } });
    const data = [
      `${o.term.name} (${o.term.startsOn} to ${o.term.endsOn}). Currency ${o.currency}.`,
      `Billed ${money(o.billedKobo)}; collected ${money(o.collectedKobo)} (${o.collectionRate}%); outstanding ${money(o.outstandingKobo)}, of which overdue ${money(o.overdueKobo)}.`,
      `Invoices: ${o.invoices.total} total, ${o.invoices.paid} paid in full, ${o.invoices.partPaid} part-paid, ${o.invoices.unpaid} unpaid, ${o.invoices.overdue} overdue.`,
      `By class (collection rate): ${o.byClass.map((c) => `${c.classArm} ${c.rate}%`).join(', ')}.`,
      `By payment method: ${o.byMethod.map((m) => `${PAYMENT_METHOD_LABELS[m.method]} ${money(m.amountKobo)} (${m.count})`).join(', ')}.`,
      `Largest balances (count and total only): ${o.topDebtors.length} families owe ${money(o.topDebtors.reduce((n, d) => n + d.balanceKobo, 0))} between them.`,
      `Expenses: this month ${money(o.expenses.thisMonthKobo)}, last month ${money(o.expenses.lastMonthKobo)}, this term ${money(o.expenses.termKobo)}. ` +
        `Term spending by category: ${o.expenses.byCategory.map((c) => `${c.category} ${money(c.amountKobo)}`).join(', ')}.`,
      `Income vs expenditure by month: ${o.incomeVsExpense.map((m) => `${m.month} in ${money(m.incomeKobo)} / out ${money(m.expenseKobo)}`).join('; ')}.`,
    ].join('\n');
    const { system, user } = financeBriefingPrompt(tenant.name, data);
    const result = await this.gateway.generate({ tier: 'advanced', system, messages: [{ role: 'user', content: user }] }, 'finance-insight');
    return { text: result.text, provider: result.provider, model: result.model };
  }

  /** Drafts a courteous reminder for an unpaid invoice (nothing is sent). */
  @Post('reminder')
  @HttpCode(200)
  @RequirePermissions('finance.read', 'ai.use')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async reminder(@Body(new ZodPipe(feeReminderSchema)) body: z.infer<typeof feeReminderSchema>, @Req() req: Request): Promise<FeeReminder> {
    const online = await this.paystack.connected(currentTenantId());
    const inv = await this.finance.invoiceDetail(body.invoiceId, online);
    if (inv.balanceKobo <= 0) throw new BadRequestException('This invoice is fully paid');
    const [student, tenant, settings] = await Promise.all([
      this.prisma.db.student.findUniqueOrThrow({ where: { id: inv.student.id } }),
      this.prisma.root.tenant.findUniqueOrThrow({ where: { id: currentTenantId() }, select: { name: true } }),
      this.finance.settings(),
    ]);
    const money = (k: number) => formatMoney(k, inv.currency);
    const guardian = inv.guardians[0] ?? null;
    const facts = [
      `Learner: ${student.firstName} (${inv.student.classArm ?? 'no class'}).`,
      `Parent/guardian: ${guardian ? guardian.name : 'not on record (address as "Dear Parent/Guardian")'}.`,
      `Invoice ${inv.number} for ${inv.term.name}: total ${money(inv.totalKobo)}, paid so far ${money(inv.paidKobo)}, balance ${money(inv.balanceKobo)}, due ${inv.dueDate}${inv.overdue ? ' (now past due)' : ''}.`,
      inv.payPath ? `Pay online (card, transfer or USSD): ${siteOrigin(req)}${inv.payPath}` : 'Online payment is not available.',
      settings.bankDetails ? `Bank transfer details: ${settings.bankDetails}` : '',
      'Cash or POS payments can also be made at the bursary.',
    ]
      .filter(Boolean)
      .join('\n');
    const { system, user } = feeReminderPrompt(tenant.name, facts);
    const result = await this.gateway.generateJson({ tier: 'standard', system, messages: [{ role: 'user', content: user }] }, aiFeeReminderSchema, 'fee-reminder');
    return { ...result.data, guardian, provider: result.provider, model: result.model };
  }
}

