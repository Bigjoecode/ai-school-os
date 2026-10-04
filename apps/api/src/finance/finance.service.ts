import { BadRequestException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  DEFAULT_FINANCE_SETTINGS,
  type FinanceOverview,
  type FinanceSettings,
  type GenerateInvoicesInput,
  type GenerateInvoicesResult,
  type InvoiceDetail,
  type InvoiceRow,
  type PaymentMethod,
  type PaymentRow,
  type ReceiptView,
  type RecordPaymentInput,
} from '@aischool/shared';
import { Prisma } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { dateOnly, fullName, parseDate } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { schoolNow } from '../common/school-time';
import { PrismaService } from '../prisma/prisma.service';

export const invoiceInclude = {
  student: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      admissionNumber: true,
      classArm: { select: { name: true, classLevel: { select: { name: true } } } },
    },
  },
  term: { select: { id: true, name: true } },
} satisfies Prisma.InvoiceInclude;
type InvoiceWithRefs = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;

export const paymentInclude = {
  invoice: { select: { number: true } },
  student: {
    select: { id: true, firstName: true, lastName: true, classArm: { select: { name: true, classLevel: { select: { name: true } } } } },
  },
} satisfies Prisma.PaymentInclude;
type PaymentWithRefs = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;

const PAY_TOKEN_DAYS = 120;

const armLabel = (a: { name: string; classLevel: { name: string } } | null) => (a ? `${a.classLevel.name} ${a.name}` : null);

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------- settings

  async settings(): Promise<FinanceSettings & { currency: string; timezone: string }> {
    const t = await this.prisma.root.tenant.findUniqueOrThrow({
      where: { id: currentTenantId() },
      select: { financeSettings: true, currency: true, timezone: true },
    });
    return {
      ...DEFAULT_FINANCE_SETTINGS,
      ...((t.financeSettings as Partial<FinanceSettings> | null) ?? {}),
      currency: t.currency,
      timezone: t.timezone,
    };
  }

  async setSettings(settings: FinanceSettings) {
    await this.prisma.root.tenant.update({
      where: { id: currentTenantId() },
      data: { financeSettings: settings as unknown as Prisma.InputJsonValue },
    });
    await this.audit.log({ action: 'finance.settings', summary: 'Updated finance settings' });
    return this.settings();
  }

  // ---------------------------------------------------------- numbering

  /** e.g. INV/2026/00042 — prefix, year, running number within the year. */
  private async nextNumber(kind: 'invoice' | 'receipt', prefix: string, client: unknown): Promise<string> {
    const tx = client as Prisma.TransactionClient;
    const year = new Date().getUTCFullYear();
    const stem = `${prefix}/${year}/`;
    const tenantId = currentTenantId();
    const last =
      kind === 'invoice'
        ? (await tx.invoice.findFirst({ where: { tenantId, number: { startsWith: stem } }, orderBy: { number: 'desc' }, select: { number: true } }))?.number
        : (await tx.payment.findFirst({ where: { tenantId, receiptNumber: { startsWith: stem } }, orderBy: { receiptNumber: 'desc' }, select: { receiptNumber: true } }))?.receiptNumber;
    const n = (last ? Number(last.slice(stem.length)) || 0 : 0) + 1;
    return `${stem}${String(n).padStart(5, '0')}`;
  }

  // ---------------------------------------------------------- invoices

  /**
   * Issues one invoice per active student for the term, from the term's fee
   * schedule (compulsory items for their class level). Students who already
   * have an invoice for the term are skipped. A sibling discount applies to
   * every child after the eldest who shares a parent or guardian.
   */
  async generateInvoices(body: GenerateInvoicesInput): Promise<GenerateInvoicesResult> {
    const db = this.prisma.db;
    const tenantId = currentTenantId();
    const [term, fees, settings] = await Promise.all([
      db.term.findUniqueOrThrow({ where: { id: body.termId } }),
      db.feeItem.findMany({ where: { termId: body.termId, optional: false } }),
      this.settings(),
    ]);
    if (!fees.length) throw new BadRequestException('Add fee items for this term before issuing invoices');

    const students = await db.student.findMany({
      where: {
        status: 'ACTIVE',
        classArmId: { not: null },
        ...(body.classLevelIds.length ? { classArm: { classLevelId: { in: body.classLevelIds } } } : {}),
      },
      include: { classArm: true, guardians: { select: { guardianId: true } } },
      orderBy: [{ dateOfBirth: 'asc' }, { lastName: 'asc' }],
    });
    const existing = new Set(
      (await db.invoice.findMany({ where: { termId: term.id, studentId: { in: students.map((s) => s.id) } }, select: { studentId: true } })).map(
        (i) => i.studentId,
      ),
    );

    // Families: students linked through any shared guardian. Eldest first (ordered by birth date).
    const seenGuardian = new Set<string>();
    const isYounger = new Map<string, boolean>();
    for (const st of students) {
      const gs = st.guardians.map((g) => g.guardianId);
      isYounger.set(st.id, gs.some((g) => seenGuardian.has(g)));
      for (const g of gs) seenGuardian.add(g);
    }

    const today = schoolNow(settings.timezone).date;
    const dueDate = body.dueDate ?? new Date(Date.parse(`${today}T00:00:00Z`) + settings.defaultDueDays * 86_400_000).toISOString().slice(0, 10);
    let created = 0;
    let noFees = 0;
    let totalKobo = 0;

    for (const st of students) {
      if (existing.has(st.id)) continue;
      const items = fees.filter((f) => !f.classLevelIds.length || f.classLevelIds.includes(st.classArm!.classLevelId));
      if (!items.length) {
        noFees++;
        continue;
      }
      const lines: { feeItemId: string | null; description: string; kind: string; amountKobo: number }[] = items.map((f) => ({
        feeItemId: f.id,
        description: f.name,
        kind: 'FEE',
        amountKobo: f.amountKobo,
      }));
      if (body.siblingDiscountPct > 0 && isYounger.get(st.id)) {
        const tuition = items.filter((f) => f.category === 'TUITION').reduce((n, f) => n + f.amountKobo, 0);
        const discount = Math.round((tuition * body.siblingDiscountPct) / 100);
        if (discount > 0) lines.push({ feeItemId: null, description: `Sibling discount (${body.siblingDiscountPct}% of tuition)`, kind: 'DISCOUNT', amountKobo: -discount });
      }
      const total = lines.reduce((n, l) => n + l.amountKobo, 0);
      await db.$transaction(async (tx) => {
        const number = await this.nextNumber('invoice', settings.invoicePrefix, tx);
        await tx.invoice.create({
          data: {
            tenantId,
            studentId: st.id,
            termId: term.id,
            number,
            totalKobo: total,
            dueDate: parseDate(dueDate),
            createdById: currentContext().userId,
            lines: { create: lines.map((l) => ({ ...l, tenantId })) },
          },
        });
      });
      created++;
      totalKobo += total;
    }

    await this.audit.log({
      action: 'finance.invoices_issued',
      summary: `Issued ${created} invoices for ${term.name} (${(totalKobo / 100).toLocaleString('en-NG')} ${settings.currency})`,
    });
    return { created, skipped: existing.size, totalKobo, noFees };
  }

  /**
   * Issues one student's invoice for a term from the fee schedule (compulsory
   * items for their class level), e.g. on enrolment. Runs inside the caller's
   * transaction. Returns null, with the reason, when nothing is issued.
   */
  async invoiceStudent(client: unknown, studentId: string, termId: string): Promise<{ invoice: { id: string; number: string; totalKobo: number } | null; reason: string | null }> {
    const tx = client as Prisma.TransactionClient;
    const tenantId = currentTenantId();
    const [student, settings, existing] = await Promise.all([
      tx.student.findUniqueOrThrow({ where: { id: studentId }, include: { classArm: true } }),
      this.settings(),
      tx.invoice.findFirst({ where: { tenantId, studentId, termId }, select: { id: true, number: true, totalKobo: true } }),
    ]);
    if (existing) return { invoice: existing, reason: 'An invoice for this term already existed' };
    if (!student.classArm) return { invoice: null, reason: 'The student has no class' };
    const fees = await tx.feeItem.findMany({ where: { tenantId, termId, optional: false } });
    const items = fees.filter((f) => !f.classLevelIds.length || f.classLevelIds.includes(student.classArm!.classLevelId));
    if (!items.length) return { invoice: null, reason: 'No compulsory fees are set for this class and term' };
    const today = schoolNow(settings.timezone).date;
    const dueDate = new Date(Date.parse(`${today}T00:00:00Z`) + settings.defaultDueDays * 86_400_000).toISOString().slice(0, 10);
    const total = items.reduce((n, f) => n + f.amountKobo, 0);
    const number = await this.nextNumber('invoice', settings.invoicePrefix, tx);
    const invoice = await tx.invoice.create({
      data: {
        tenantId,
        studentId,
        termId,
        number,
        totalKobo: total,
        dueDate: parseDate(dueDate),
        createdById: currentContext().userId,
        lines: { create: items.map((f) => ({ tenantId, feeItemId: f.id, description: f.name, kind: 'FEE', amountKobo: f.amountKobo })) },
      },
      select: { id: true, number: true, totalKobo: true },
    });
    return { invoice, reason: null };
  }

  /**
   * Recomputes a total and status after lines or payments change. Accepts the
   * tenant-scoped or the root transaction client (webhooks run on the root one).
   */
  async refreshInvoice(client: unknown, invoiceId: string) {
    const tx = client as Prisma.TransactionClient;
    const [lines, paid, invoice] = await Promise.all([
      tx.invoiceLine.aggregate({ where: { invoiceId }, _sum: { amountKobo: true } }),
      tx.payment.aggregate({ where: { invoiceId, status: 'SUCCESS' }, _sum: { amountKobo: true } }),
      tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } }),
    ]);
    const totalKobo = lines._sum.amountKobo ?? 0;
    const paidKobo = paid._sum.amountKobo ?? 0;
    const status =
      invoice.status === 'CANCELLED' ? 'CANCELLED' : paidKobo >= totalKobo && totalKobo > 0 ? 'PAID' : paidKobo > 0 ? 'PART_PAID' : 'ISSUED';
    return tx.invoice.update({ where: { id: invoiceId }, data: { totalKobo, paidKobo, status } });
  }

  invoiceRow(i: InvoiceWithRefs, today: string): InvoiceRow {
    const balance = i.totalKobo - i.paidKobo;
    return {
      id: i.id,
      number: i.number,
      status: i.status,
      student: {
        id: i.student.id,
        name: fullName(i.student),
        admissionNumber: i.student.admissionNumber,
        classArm: armLabel(i.student.classArm),
      },
      term: i.term,
      totalKobo: i.totalKobo,
      paidKobo: i.paidKobo,
      balanceKobo: Math.max(0, balance),
      dueDate: dateOnly(i.dueDate)!,
      overdue: i.status !== 'CANCELLED' && balance > 0 && dateOnly(i.dueDate)! < today,
      issuedAt: i.issuedAt.toISOString(),
    };
  }

  async invoiceDetail(id: string, onlineEnabled: boolean): Promise<InvoiceDetail> {
    const [inv, settings, tenant] = await Promise.all([
      this.prisma.db.invoice.findUniqueOrThrow({
        where: { id },
        include: {
          ...invoiceInclude,
          lines: { orderBy: [{ kind: 'asc' }, { id: 'asc' }] },
          payments: { include: paymentInclude, orderBy: { paidAt: 'asc' } },
          student: {
            select: {
              ...invoiceInclude.student.select,
              guardians: { orderBy: { isPrimary: 'desc' }, include: { guardian: true } },
            },
          },
        },
      }),
      this.settings(),
      this.prisma.root.tenant.findUniqueOrThrow({
        where: { id: currentTenantId() },
        select: { name: true, address: true, phone: true, email: true, logoUrl: true },
      }),
    ]);
    const today = schoolNow(settings.timezone).date;
    const row = this.invoiceRow(inv, today);
    const receivers = await this.userNames(inv.payments.map((p) => p.receivedById));
    return {
      ...row,
      school: { ...tenant, bankDetails: settings.bankDetails },
      currency: settings.currency,
      lines: inv.lines.map((l) => ({ id: l.id, description: l.description, kind: l.kind as 'FEE' | 'DISCOUNT' | 'FINE', amountKobo: l.amountKobo })),
      payments: inv.payments.map((p) => this.paymentRow(p, receivers)),
      guardians: inv.student.guardians.map((g) => ({ id: g.guardian.id, name: fullName(g.guardian), phone: g.guardian.phone, email: g.guardian.email })),
      note: inv.note,
      payPath: onlineEnabled && row.balanceKobo > 0 && inv.status !== 'CANCELLED' ? `/pay/${await this.payToken(inv.id)}` : null,
      onlinePaymentsEnabled: onlineEnabled,
    };
  }

  /** A payment's receipt, for staff and (their own) families. */
  async receiptView(id: string): Promise<ReceiptView> {
    const p = await this.prisma.db.payment.findUniqueOrThrow({
      where: { id },
      include: { ...paymentInclude, invoice: { include: { term: true } } },
    });
    const [settings, tenant, names] = await Promise.all([
      this.settings(),
      this.prisma.root.tenant.findUniqueOrThrow({ where: { id: currentTenantId() }, select: { name: true, address: true, phone: true, email: true, logoUrl: true } }),
      this.userNames([p.receivedById]),
    ]);
    return {
      ...this.paymentRow(p, names),
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

  /** Long-lived signed token for the parent payment link. */
  payToken(invoiceId: string): Promise<string> {
    return this.jwt.signAsync({ typ: 'pay', tid: currentTenantId(), inv: invoiceId }, { expiresIn: `${PAY_TOKEN_DAYS}d` });
  }

  // ---------------------------------------------------------- payments

  paymentRow(p: PaymentWithRefs, receivers: Map<string, string>): PaymentRow {
    return {
      id: p.id,
      receiptNumber: p.receiptNumber,
      invoiceId: p.invoiceId,
      invoiceNumber: p.invoice.number,
      student: { id: p.student.id, name: fullName(p.student), classArm: armLabel(p.student.classArm) },
      amountKobo: p.amountKobo,
      method: p.method as PaymentMethod,
      status: p.status,
      reference: p.reference,
      payerName: p.payerName,
      paidAt: p.paidAt.toISOString(),
      receivedBy: p.receivedById ? (receivers.get(p.receivedById) ?? null) : null,
      note: p.note,
    };
  }

  async userNames(ids: (string | null)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((i): i is string => !!i))];
    if (!unique.length) return new Map();
    const users = await this.prisma.root.user.findMany({ where: { id: { in: unique } }, select: { id: true, firstName: true, lastName: true } });
    return new Map(users.map((u) => [u.id, fullName(u)]));
  }

  async recordPayment(body: RecordPaymentInput) {
    const settings = await this.settings();
    const db = this.prisma.db;
    const invoice = await db.invoice.findUniqueOrThrow({ where: { id: body.invoiceId }, include: { student: true } });
    if (invoice.status === 'CANCELLED') throw new BadRequestException('This invoice was cancelled');
    const balance = invoice.totalKobo - invoice.paidKobo;
    if (body.amountKobo > balance) {
      throw new BadRequestException({
        statusCode: 400,
        message: `That's more than the balance of ${(balance / 100).toLocaleString('en-NG')}`,
        errors: [{ path: 'amountKobo', message: 'More than the balance' }],
      });
    }
    const payment = await db.$transaction(async (tx) => {
      const receiptNumber = await this.nextNumber('receipt', settings.receiptPrefix, tx);
      const p = await tx.payment.create({
        data: {
          tenantId: currentTenantId(),
          invoiceId: invoice.id,
          studentId: invoice.studentId,
          amountKobo: body.amountKobo,
          method: body.method,
          status: 'SUCCESS',
          reference: body.reference,
          receiptNumber,
          payerName: body.payerName,
          paidAt: body.paidOn ? new Date(`${body.paidOn}T12:00:00.000Z`) : new Date(),
          receivedById: currentContext().userId,
          note: body.note,
        },
      });
      await this.refreshInvoice(tx, invoice.id);
      return p;
    });
    await this.audit.log({
      action: 'finance.payment',
      entityType: 'Payment',
      entityId: payment.id,
      summary: `Received ${(body.amountKobo / 100).toLocaleString('en-NG')} ${settings.currency} (${body.method.toLowerCase().replace('_', ' ')}) from ${invoice.student.firstName} ${invoice.student.lastName}'s family — receipt ${payment.receiptNumber}`,
    });
    return payment;
  }

  /**
   * Settles a pending online payment exactly once, whichever arrives first:
   * Paystack's webhook or the parent's return to the site. The PENDING →
   * SUCCESS update is conditional, so a second caller changes nothing.
   */
  async settleOnline(tenantId: string, reference: string, verified: { amountKobo: number; paidAt: Date; email?: string | null }) {
    return this.prisma.root.$transaction(async (tx) => {
      const pending = await tx.payment.findFirst({ where: { tenantId, reference, method: 'PAYSTACK' } });
      if (!pending) return { payment: null, settled: false, reason: 'unknown reference' as const };
      if (pending.status === 'SUCCESS') return { payment: pending, settled: false, reason: 'already settled' as const };
      if (verified.amountKobo !== pending.amountKobo) {
        await tx.payment.update({ where: { id: pending.id }, data: { status: 'FAILED', note: `Amount mismatch: paid ${verified.amountKobo}, expected ${pending.amountKobo}` } });
        return { payment: pending, settled: false, reason: 'amount mismatch' as const };
      }
      const settings = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { financeSettings: true } });
      const prefix = ((settings.financeSettings as Partial<FinanceSettings> | null)?.receiptPrefix ?? DEFAULT_FINANCE_SETTINGS.receiptPrefix);
      const stem = `${prefix}/${verified.paidAt.getUTCFullYear()}/`;
      const last = await tx.payment.findFirst({ where: { tenantId, receiptNumber: { startsWith: stem } }, orderBy: { receiptNumber: 'desc' }, select: { receiptNumber: true } });
      const receiptNumber = `${stem}${String((last ? Number(last.receiptNumber!.slice(stem.length)) || 0 : 0) + 1).padStart(5, '0')}`;
      const { count } = await tx.payment.updateMany({
        where: { id: pending.id, status: 'PENDING' },
        data: { status: 'SUCCESS', receiptNumber, paidAt: verified.paidAt, payerEmail: verified.email ?? pending.payerEmail },
      });
      if (!count) return { payment: pending, settled: false, reason: 'already settled' as const };
      await this.refreshInvoice(tx, pending.invoiceId);
      return { payment: { ...pending, status: 'SUCCESS' as const, receiptNumber }, settled: true, reason: null };
    });
  }

  // ---------------------------------------------------------- overview

  async overview(termId: string | undefined, onlineEnabled: boolean): Promise<FinanceOverview> {
    const db = this.prisma.db;
    const settings = await this.settings();
    const term = termId
      ? await db.term.findUniqueOrThrow({ where: { id: termId } })
      : await db.term.findFirst({ where: { isCurrent: true } });
    if (!term) throw new BadRequestException('Set a current term in Academic Setup first');
    const now = schoolNow(settings.timezone);
    const monthStart = `${now.date.slice(0, 7)}-01`;
    const lastMonth = new Date(`${monthStart}T00:00:00Z`);
    lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
    const lastMonthStart = lastMonth.toISOString().slice(0, 10);
    const sixMonthsAgo = new Date(`${monthStart}T00:00:00Z`);
    sixMonthsAgo.setUTCMonth(sixMonthsAgo.getUTCMonth() - 5);

    const [invoices, payments, expenses, recentPayments] = await Promise.all([
      db.invoice.findMany({ where: { termId: term.id, status: { not: 'CANCELLED' } }, include: invoiceInclude }),
      db.payment.findMany({ where: { status: 'SUCCESS', invoice: { termId: term.id } }, select: { amountKobo: true, method: true, paidAt: true } }),
      db.expense.findMany({ where: { spentOn: { gte: sixMonthsAgo } } }),
      db.payment.findMany({ where: { status: 'SUCCESS', paidAt: { gte: sixMonthsAgo } }, select: { amountKobo: true, paidAt: true } }),
    ]);

    const billed = invoices.reduce((n, i) => n + i.totalKobo, 0);
    const collected = invoices.reduce((n, i) => n + i.paidKobo, 0);
    const rows = invoices.map((i) => this.invoiceRow(i, now.date));
    const overdueRows = rows.filter((r) => r.overdue);

    const byClass = new Map<string, { billed: number; collected: number }>();
    for (const r of rows) {
      const key = r.student.classArm ?? '—';
      const c = byClass.get(key) ?? { billed: 0, collected: 0 };
      c.billed += r.totalKobo;
      c.collected += r.paidKobo;
      byClass.set(key, c);
    }
    const byMethod = new Map<string, { amount: number; count: number }>();
    const daily = new Map<string, number>();
    for (const p of payments) {
      const m = byMethod.get(p.method) ?? { amount: 0, count: 0 };
      m.amount += p.amountKobo;
      m.count++;
      byMethod.set(p.method, m);
      const d = schoolNow(settings.timezone, p.paidAt).date;
      daily.set(d, (daily.get(d) ?? 0) + p.amountKobo);
    }

    const termStart = dateOnly(term.startsOn)!;
    const termEnd = dateOnly(term.endsOn)!;
    const expensesIn = (from: string, to: string) =>
      expenses.filter((e) => dateOnly(e.spentOn)! >= from && dateOnly(e.spentOn)! < to).reduce((n, e) => n + e.amountKobo, 0);
    const termExpenses = expenses.filter((e) => dateOnly(e.spentOn)! >= termStart && dateOnly(e.spentOn)! <= termEnd);
    const byCategory = new Map<string, number>();
    for (const e of termExpenses) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amountKobo);

    const months: FinanceOverview['incomeVsExpense'] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(sixMonthsAgo);
      d.setUTCMonth(d.getUTCMonth() + i);
      const key = d.toISOString().slice(0, 7);
      months.push({
        month: key,
        incomeKobo: recentPayments.filter((p) => schoolNow(settings.timezone, p.paidAt).date.startsWith(key)).reduce((n, p) => n + p.amountKobo, 0),
        expenseKobo: expenses.filter((e) => dateOnly(e.spentOn)!.startsWith(key)).reduce((n, e) => n + e.amountKobo, 0),
      });
    }

    return {
      currency: settings.currency,
      term: { id: term.id, name: term.name, startsOn: termStart, endsOn: termEnd },
      billedKobo: billed,
      collectedKobo: collected,
      outstandingKobo: Math.max(0, billed - collected),
      overdueKobo: overdueRows.reduce((n, r) => n + r.balanceKobo, 0),
      collectionRate: billed ? Math.round((collected / billed) * 1000) / 10 : null,
      invoices: {
        total: rows.length,
        paid: rows.filter((r) => r.status === 'PAID').length,
        partPaid: rows.filter((r) => r.status === 'PART_PAID').length,
        unpaid: rows.filter((r) => r.status === 'ISSUED').length,
        overdue: overdueRows.length,
      },
      byClass: [...byClass]
        .map(([classArm, c]) => ({ classArm, billedKobo: c.billed, collectedKobo: c.collected, rate: c.billed ? Math.round((c.collected / c.billed) * 1000) / 10 : null }))
        .sort((a, b) => a.classArm.localeCompare(b.classArm, undefined, { numeric: true })),
      byMethod: [...byMethod].map(([method, m]) => ({ method: method as PaymentMethod, amountKobo: m.amount, count: m.count })).sort((a, b) => b.amountKobo - a.amountKobo),
      daily: [...daily].map(([date, amountKobo]) => ({ date, amountKobo })).sort((a, b) => a.date.localeCompare(b.date)),
      topDebtors: rows
        .filter((r) => r.balanceKobo > 0)
        .sort((a, b) => b.balanceKobo - a.balanceKobo)
        .slice(0, 10)
        .map((r) => ({
          invoiceId: r.id,
          student: r.student.name,
          classArm: r.student.classArm,
          balanceKobo: r.balanceKobo,
          overdueDays: r.overdue ? Math.round((Date.parse(now.date) - Date.parse(r.dueDate)) / 86_400_000) : 0,
        })),
      expenses: {
        thisMonthKobo: expensesIn(monthStart, '9999-12-31'),
        lastMonthKobo: expensesIn(lastMonthStart, monthStart),
        termKobo: termExpenses.reduce((n, e) => n + e.amountKobo, 0),
        byCategory: [...byCategory].map(([category, amountKobo]) => ({ category, amountKobo })).sort((a, b) => b.amountKobo - a.amountKobo),
      },
      incomeVsExpense: months,
      onlinePaymentsEnabled: onlineEnabled,
    };
  }
}
