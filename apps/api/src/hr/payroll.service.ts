import { BadRequestException, Injectable } from '@nestjs/common';
import {
  PAYE_RULES_LABEL,
  computePayslip,
  formatMoney,
  periodBounds,
  periodLabel,
  workingDaysBetween,
  type Allowance,
  type HrSettings,
  type PayAdjustment,
  type PayProfileInput,
  type PayProfileRow,
  type PayrollCheck,
  type PayrollRunDetail,
  type PayrollRunRow,
  type PayrollStatus,
  type PayrollTotals,
  type PayslipRow,
  type PayslipView,
  type SalaryGradeInput,
  type SalaryGradeRow,
} from '@aischool/shared';
import { Prisma } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { dateOnly, fullName, parseDate } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { HrService, ref } from './hr.service';

type RunWithSlips = Prisma.PayrollRunGetPayload<{ include: { payslips: true } }>;
type PayslipRecord = Prisma.PayslipGetPayload<object>;

/** The most a single expense row holds (the column is a 32-bit integer). */
const EXPENSE_CHUNK_KOBO = 2_000_000_000;

function totals(slips: PayslipRecord[]): PayrollTotals {
  const sum = (k: keyof PayslipRecord) => slips.reduce((n, s) => n + (s[k] as number), 0);
  const gross = sum('grossKobo');
  const employer = sum('employerPensionKobo');
  return {
    staffCount: slips.length,
    grossKobo: gross,
    payeKobo: sum('payeKobo'),
    pensionKobo: sum('pensionKobo'),
    employerPensionKobo: employer,
    nhfKobo: sum('nhfKobo'),
    otherDeductionsKobo: sum('otherDeductionsKobo'),
    netKobo: sum('netKobo'),
    costKobo: gross + employer,
  };
}

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hr: HrService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------- grades

  async grades(): Promise<SalaryGradeRow[]> {
    const rows = await this.prisma.db.salaryGrade.findMany({ include: { _count: { select: { profiles: true } } }, orderBy: { basicKobo: 'asc' } });
    return rows.map((g) => {
      const other = g.otherAllowances as unknown as Allowance[];
      return {
        id: g.id,
        name: g.name,
        basicKobo: g.basicKobo,
        housingKobo: g.housingKobo,
        transportKobo: g.transportKobo,
        otherAllowances: other,
        grossKobo: g.basicKobo + g.housingKobo + g.transportKobo + other.reduce((n, a) => n + a.amountKobo, 0),
        staffCount: g._count.profiles,
      };
    });
  }

  async saveGrade(id: string | null, body: SalaryGradeInput) {
    const data = { ...body, otherAllowances: body.otherAllowances as unknown as Prisma.InputJsonValue };
    const g = id
      ? await this.prisma.db.salaryGrade.update({ where: { id }, data })
      : await this.prisma.db.salaryGrade.create({ data: { ...data, tenantId: currentTenantId() } });
    await this.audit.log({ action: id ? 'payroll.grade_updated' : 'payroll.grade_created', entityType: 'SalaryGrade', entityId: g.id, summary: `${id ? 'Updated' : 'Created'} salary grade ${g.name}` });
    return g;
  }

  /** Applies a grade's current amounts to everyone on it. */
  async applyGrade(id: string): Promise<{ updated: number }> {
    const g = await this.prisma.db.salaryGrade.findUniqueOrThrow({ where: { id } });
    const r = await this.prisma.db.staffPayProfile.updateMany({
      where: { gradeId: id },
      data: { basicKobo: g.basicKobo, housingKobo: g.housingKobo, transportKobo: g.transportKobo, otherAllowances: g.otherAllowances as Prisma.InputJsonValue },
    });
    await this.audit.log({ action: 'payroll.grade_applied', entityType: 'SalaryGrade', entityId: id, summary: `Applied salary grade ${g.name} to ${r.count} staff` });
    return { updated: r.count };
  }

  async deleteGrade(id: string) {
    const g = await this.prisma.db.salaryGrade.findUniqueOrThrow({ where: { id } });
    await this.prisma.db.salaryGrade.delete({ where: { id } });
    await this.audit.log({ action: 'payroll.grade_deleted', entityType: 'SalaryGrade', entityId: id, summary: `Deleted salary grade ${g.name}` });
  }

  // ---------------------------------------------------------- pay profiles

  async profiles(): Promise<PayProfileRow[]> {
    const school = await this.hr.school();
    const { start, end } = periodBounds(school.today.slice(0, 7));
    const workingDays = workingDaysBetween(start, end);
    const staff = await this.prisma.db.staff.findMany({
      where: { status: { not: 'EXITED' } },
      include: { department: { select: { name: true } }, payProfile: { include: { grade: { select: { name: true } } } } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return staff.map((s) => {
      const p = s.payProfile;
      const calc = p
        ? computePayslip({ ...p, otherAllowances: p.otherAllowances as unknown as Allowance[], unpaidLeaveDays: 0, workingDays, adjustments: [] }, school.settings)
        : null;
      return {
        staff: { ...ref(s), staffNumber: s.staffNumber, department: s.department?.name ?? null, type: s.type },
        gradeName: p?.grade?.name ?? null,
        grossKobo: calc?.grossKobo ?? null,
        payeKobo: calc?.payeKobo ?? null,
        netKobo: calc?.netKobo ?? null,
        missing: p ? missingDetails(p) : ['pay details'],
      };
    });
  }

  async saveProfile(staffId: string, body: PayProfileInput) {
    const db = this.prisma.db;
    const staff = await db.staff.findUniqueOrThrow({ where: { id: staffId } });
    if (body.gradeId) await db.salaryGrade.findUniqueOrThrow({ where: { id: body.gradeId } });
    if (body.basicKobo <= 0) throw new BadRequestException('Basic salary must be more than zero');
    const data = { ...body, otherAllowances: body.otherAllowances as unknown as Prisma.InputJsonValue };
    const before = await db.staffPayProfile.findUnique({ where: { staffId } });
    await db.staffPayProfile.upsert({ where: { staffId }, update: data, create: { ...data, staffId, tenantId: currentTenantId() } });
    const school = await this.hr.school();
    const gross = body.basicKobo + body.housingKobo + body.transportKobo + body.otherAllowances.reduce((n, a) => n + a.amountKobo, 0);
    const beforeGross = before
      ? before.basicKobo + before.housingKobo + before.transportKobo + (before.otherAllowances as unknown as Allowance[]).reduce((n, a) => n + a.amountKobo, 0)
      : null;
    await this.audit.log({
      action: 'payroll.profile_saved',
      entityType: 'Staff',
      entityId: staffId,
      summary:
        beforeGross === null
          ? `Set ${fullName(staff)}'s pay: ${formatMoney(gross, school.currency)} a month`
          : beforeGross !== gross
            ? `Changed ${fullName(staff)}'s monthly pay from ${formatMoney(beforeGross, school.currency)} to ${formatMoney(gross, school.currency)}`
            : `Updated ${fullName(staff)}'s pay details`,
    });
    return this.hr.employee(staffId);
  }

  // ---------------------------------------------------------- runs

  private async eligibleStaff(period: string) {
    const { start, end } = periodBounds(period);
    return this.prisma.db.staff.findMany({
      where: {
        payProfile: { isNot: null },
        OR: [{ status: { not: 'EXITED' } }, { exitedOn: { gte: parseDate(start) } }],
        AND: [{ OR: [{ employedOn: null }, { employedOn: { lte: parseDate(end) } }] }],
      },
      include: { payProfile: true, department: { select: { name: true } } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  /** Payslip columns from the employee's current details plus this month's adjustments. */
  private slipData(
    s: Awaited<ReturnType<PayrollService['eligibleStaff']>>[number],
    settings: HrSettings,
    workingDays: number,
    unpaidLeaveDays: number,
    adjustments: PayAdjustment[],
  ) {
    const p = s.payProfile!;
    const otherAllowances = p.otherAllowances as unknown as Allowance[];
    const calc = computePayslip({ ...p, otherAllowances, unpaidLeaveDays, workingDays, adjustments }, settings);
    return {
      staffName: fullName(s),
      staffNumber: s.staffNumber,
      jobTitle: s.jobTitle,
      department: s.department?.name ?? null,
      bankName: p.bankName,
      accountNumber: p.accountNumber,
      accountName: p.accountName,
      pfaName: p.pfaName,
      pensionPin: p.pensionPin,
      taxId: p.taxId,
      basicKobo: p.basicKobo,
      housingKobo: p.housingKobo,
      transportKobo: p.transportKobo,
      otherAllowances: otherAllowances as unknown as Prisma.InputJsonValue,
      pensionEnabled: p.pensionEnabled,
      nhfEnabled: p.nhfEnabled,
      annualRentKobo: p.annualRentKobo,
      unpaidLeaveDays: Math.min(unpaidLeaveDays, workingDays),
      adjustments: adjustments as unknown as Prisma.InputJsonValue,
      earnings: calc.earnings as unknown as Prisma.InputJsonValue,
      deductions: calc.deductions as unknown as Prisma.InputJsonValue,
      grossKobo: calc.grossKobo,
      payeKobo: calc.payeKobo,
      pensionKobo: calc.pensionKobo,
      nhfKobo: calc.nhfKobo,
      otherDeductionsKobo: calc.otherDeductionsKobo,
      netKobo: calc.netKobo,
      employerPensionKobo: calc.employerPensionKobo,
    };
  }

  async createRun(period: string, note: string | null): Promise<PayrollRunDetail> {
    const db = this.prisma.db;
    const school = await this.hr.school();
    if (period > school.today.slice(0, 7)) {
      const next = new Date(`${school.today.slice(0, 7)}-01T00:00:00Z`);
      next.setUTCMonth(next.getUTCMonth() + 1);
      if (period > next.toISOString().slice(0, 7)) throw new BadRequestException('Payroll can be prepared for this month or next month at the latest');
    }
    if (await db.payrollRun.findFirst({ where: { period } })) throw new BadRequestException(`There is already a payroll for ${periodLabel(period)}`);
    const { start, end } = periodBounds(period);
    const workingDays = workingDaysBetween(start, end);
    const [staff, unpaid] = await Promise.all([this.eligibleStaff(period), this.hr.unpaidLeaveDays(period, start, end)]);
    if (!staff.length) throw new BadRequestException('No staff have pay details yet — set salaries first');
    const tenantId = currentTenantId();
    const run = await db.$transaction(async (tx) => {
      const r = await tx.payrollRun.create({ data: { tenantId, period, workingDays, note, preparedById: currentContext().userId } });
      await tx.payslip.createMany({
        data: staff.map((s) => ({ tenantId, runId: r.id, staffId: s.id, ...this.slipData(s, school.settings, workingDays, unpaid.get(s.id) ?? 0, []) })),
      });
      return r;
    });
    await this.audit.log({ action: 'payroll.prepared', entityType: 'PayrollRun', entityId: run.id, summary: `Prepared payroll for ${periodLabel(period)} (${staff.length} staff)` });
    return this.runDetail(run.id);
  }

  /** Re-reads everyone's current pay details and leave into a draft, keeping adjustments. */
  async recalculate(id: string): Promise<PayrollRunDetail> {
    const db = this.prisma.db;
    const run = await db.payrollRun.findUniqueOrThrow({ where: { id }, include: { payslips: true } });
    if (run.status !== 'DRAFT') throw new BadRequestException('Only a draft payroll can be recalculated — reopen it first');
    const school = await this.hr.school();
    const { start, end } = periodBounds(run.period);
    const [staff, unpaid] = await Promise.all([this.eligibleStaff(run.period), this.hr.unpaidLeaveDays(run.period, start, end)]);
    const kept = new Map(run.payslips.map((p) => [p.staffId, p.adjustments as unknown as PayAdjustment[]]));
    const tenantId = currentTenantId();
    await db.$transaction(async (tx) => {
      await tx.payslip.deleteMany({ where: { runId: id } });
      await tx.payslip.createMany({
        data: staff.map((s) => ({ tenantId, runId: id, staffId: s.id, ...this.slipData(s, school.settings, run.workingDays, unpaid.get(s.id) ?? 0, kept.get(s.id) ?? []) })),
      });
      await tx.payrollRun.update({ where: { id }, data: { updatedAt: new Date() } });
    });
    await this.audit.log({ action: 'payroll.recalculated', entityType: 'PayrollRun', entityId: id, summary: `Recalculated payroll for ${periodLabel(run.period)}` });
    return this.runDetail(id);
  }

  async setAdjustments(payslipId: string, adjustments: PayAdjustment[]): Promise<PayrollRunDetail> {
    const db = this.prisma.db;
    const slip = await db.payslip.findUniqueOrThrow({ where: { id: payslipId }, include: { run: true } });
    if (slip.run.status !== 'DRAFT') throw new BadRequestException('This payroll is no longer a draft — reopen it to make changes');
    const school = await this.hr.school();
    const calc = computePayslip(
      {
        ...slip,
        otherAllowances: slip.otherAllowances as unknown as Allowance[],
        workingDays: slip.run.workingDays,
        adjustments,
      },
      school.settings,
    );
    if (calc.netKobo < 0) throw new BadRequestException(`Those deductions would leave ${slip.staffName} with negative pay (${formatMoney(calc.netKobo, school.currency)})`);
    await db.payslip.update({
      where: { id: payslipId },
      data: {
        adjustments: adjustments as unknown as Prisma.InputJsonValue,
        earnings: calc.earnings as unknown as Prisma.InputJsonValue,
        deductions: calc.deductions as unknown as Prisma.InputJsonValue,
        grossKobo: calc.grossKobo,
        payeKobo: calc.payeKobo,
        pensionKobo: calc.pensionKobo,
        nhfKobo: calc.nhfKobo,
        otherDeductionsKobo: calc.otherDeductionsKobo,
        netKobo: calc.netKobo,
        employerPensionKobo: calc.employerPensionKobo,
      },
    });
    await this.audit.log({
      action: 'payroll.adjusted',
      entityType: 'Payslip',
      entityId: payslipId,
      summary: `Set ${adjustments.length} adjustment${adjustments.length === 1 ? '' : 's'} on ${slip.staffName}'s ${periodLabel(slip.run.period)} payslip` +
        (adjustments.length ? `: ${adjustments.map((a) => `${a.label} ${a.kind === 'DEDUCTION' ? '−' : '+'}${formatMoney(a.amountKobo, school.currency)}`).join(', ')}` : ''),
    });
    return this.runDetail(slip.runId);
  }

  private async transition(id: string, from: PayrollStatus, data: Prisma.PayrollRunUpdateManyMutationInput, wrong: string) {
    const r = await this.prisma.db.payrollRun.updateMany({ where: { id, status: from }, data });
    if (!r.count) {
      await this.prisma.db.payrollRun.findUniqueOrThrow({ where: { id } });
      throw new BadRequestException(wrong);
    }
  }

  async approve(id: string): Promise<PayrollRunDetail> {
    const run = await this.prisma.db.payrollRun.findUniqueOrThrow({ where: { id }, include: { payslips: true } });
    if (run.payslips.some((p) => p.netKobo < 0)) throw new BadRequestException('Some payslips have negative pay — fix them first');
    await this.transition(id, 'DRAFT', { status: 'APPROVED', approvedById: currentContext().userId, approvedAt: new Date() }, 'Only a draft payroll can be approved');
    const school = await this.hr.school();
    await this.audit.log({
      action: 'payroll.approved',
      entityType: 'PayrollRun',
      entityId: id,
      summary: `Approved payroll for ${periodLabel(run.period)}: ${run.payslips.length} staff, net ${formatMoney(totals(run.payslips).netKobo, school.currency)}`,
    });
    return this.runDetail(id);
  }

  async reopen(id: string): Promise<PayrollRunDetail> {
    const run = await this.prisma.db.payrollRun.findUniqueOrThrow({ where: { id } });
    await this.transition(id, 'APPROVED', { status: 'DRAFT', approvedById: null, approvedAt: null }, 'Only an approved, unpaid payroll can be reopened');
    await this.audit.log({ action: 'payroll.reopened', entityType: 'PayrollRun', entityId: id, summary: `Reopened payroll for ${periodLabel(run.period)} for changes` });
    return this.runDetail(id);
  }

  /** Marks salaries paid and records them (and the statutory remittances) as expenses. */
  async markPaid(id: string, body: { paidOn: string; method: string; reference: string | null }): Promise<PayrollRunDetail> {
    const db = this.prisma.db;
    const run = await db.payrollRun.findUniqueOrThrow({ where: { id }, include: { payslips: true } });
    const t = totals(run.payslips);
    const label = periodLabel(run.period);
    const tenantId = currentTenantId();
    const userId = currentContext().userId;
    await db.$transaction(async (tx) => {
      const r = await tx.payrollRun.updateMany({
        where: { id, status: 'APPROVED' },
        data: { status: 'PAID', paidOn: parseDate(body.paidOn), payMethod: body.method, payReference: body.reference },
      });
      if (!r.count) throw new BadRequestException('Only an approved payroll can be marked paid');
      const rows: { description: string; amountKobo: number; paidTo: string }[] = [];
      const push = (description: string, amount: number, paidTo: string) => {
        const parts = Math.ceil(amount / EXPENSE_CHUNK_KOBO);
        for (let i = 0; i < parts; i++) {
          rows.push({
            description: parts > 1 ? `${description} (part ${i + 1} of ${parts})` : description,
            amountKobo: i < parts - 1 ? EXPENSE_CHUNK_KOBO : amount - EXPENSE_CHUNK_KOBO * (parts - 1),
            paidTo,
          });
        }
      };
      if (t.netKobo > 0) push(`${label} salaries (${t.staffCount} staff, net pay)`, t.netKobo, 'Staff payroll');
      const statutory = t.payeKobo + t.pensionKobo + t.employerPensionKobo + t.nhfKobo;
      if (statutory > 0) push(`${label} PAYE, pension & NHF remittances`, statutory, 'State IRS, PFAs & FMBN');
      await tx.expense.createMany({
        data: rows.map((e) => ({
          ...e,
          tenantId,
          category: 'SALARIES',
          spentOn: parseDate(body.paidOn),
          method: body.method,
          reference: body.reference ?? `PAYROLL-${run.period}`,
          recordedById: userId,
        })),
      });
    });
    const school = await this.hr.school();
    await this.audit.log({
      action: 'payroll.paid',
      entityType: 'PayrollRun',
      entityId: id,
      summary: `Paid ${label} salaries: net ${formatMoney(t.netKobo, school.currency)} to ${t.staffCount} staff (recorded under expenses)`,
    });
    return this.runDetail(id);
  }

  async deleteRun(id: string) {
    const run = await this.prisma.db.payrollRun.findUniqueOrThrow({ where: { id } });
    if (run.status !== 'DRAFT') throw new BadRequestException('Only a draft payroll can be deleted');
    await this.prisma.db.payrollRun.delete({ where: { id } });
    await this.audit.log({ action: 'payroll.deleted', entityType: 'PayrollRun', entityId: id, summary: `Deleted the draft payroll for ${periodLabel(run.period)}` });
  }

  // ---------------------------------------------------------- views

  private async runRow(r: RunWithSlips, names: Map<string, string>): Promise<PayrollRunRow> {
    return {
      id: r.id,
      period: r.period,
      label: periodLabel(r.period),
      status: r.status,
      ...totals(r.payslips),
      preparedBy: r.preparedById ? (names.get(r.preparedById) ?? null) : null,
      approvedBy: r.approvedById ? (names.get(r.approvedById) ?? null) : null,
      approvedAt: r.approvedAt?.toISOString() ?? null,
      paidOn: dateOnly(r.paidOn),
    };
  }

  async runs(): Promise<PayrollRunRow[]> {
    const runs = await this.prisma.db.payrollRun.findMany({ include: { payslips: true }, orderBy: { period: 'desc' } });
    const names = await this.hr.userNames(runs.flatMap((r) => [r.preparedById, r.approvedById]));
    return Promise.all(runs.map((r) => this.runRow(r, names)));
  }

  async latestRun(): Promise<PayrollRunRow | null> {
    const r = await this.prisma.db.payrollRun.findFirst({ include: { payslips: true }, orderBy: { period: 'desc' } });
    if (!r) return null;
    return this.runRow(r, await this.hr.userNames([r.preparedById, r.approvedById]));
  }

  async runDetail(id: string): Promise<PayrollRunDetail> {
    const db = this.prisma.db;
    const run = await db.payrollRun.findUniqueOrThrow({ where: { id }, include: { payslips: { orderBy: [{ department: 'asc' }, { staffName: 'asc' }] } } });
    const [school, previous, names, activeWithoutPay] = await Promise.all([
      this.hr.school(),
      db.payrollRun.findFirst({ where: { period: { lt: run.period } }, include: { payslips: true }, orderBy: { period: 'desc' } }),
      this.hr.userNames([run.preparedById, run.approvedById]),
      db.staff.findMany({ where: { status: { not: 'EXITED' }, payProfile: { is: null } }, orderBy: { lastName: 'asc' } }),
    ]);
    const prevNet = new Map(previous?.payslips.map((p) => [p.staffId, p.netKobo]) ?? []);
    const money = (k: number) => formatMoney(k, school.currency);

    const payslips: PayslipRow[] = run.payslips.map((p) => ({
      id: p.id,
      staffId: p.staffId,
      staffName: p.staffName,
      staffNumber: p.staffNumber,
      jobTitle: p.jobTitle,
      department: p.department,
      grossKobo: p.grossKobo,
      payeKobo: p.payeKobo,
      pensionKobo: p.pensionKobo,
      nhfKobo: p.nhfKobo,
      otherDeductionsKobo: p.otherDeductionsKobo,
      netKobo: p.netKobo,
      employerPensionKobo: p.employerPensionKobo,
      unpaidLeaveDays: p.unpaidLeaveDays,
      adjustments: p.adjustments as unknown as PayAdjustment[],
      bankName: p.bankName,
      accountNumber: p.accountNumber,
      accountName: p.accountName,
      previousNetKobo: prevNet.get(p.staffId) ?? null,
    }));

    // Checks an approver should see before money moves.
    const checks: PayrollCheck[] = [];
    const accounts = new Map<string, string[]>();
    for (const p of run.payslips) {
      if (!p.accountNumber || !p.bankName) checks.push({ level: 'warning', staffId: p.staffId, message: `${p.staffName} has no bank account on record` });
      else accounts.set(p.accountNumber, [...(accounts.get(p.accountNumber) ?? []), p.staffName]);
      if (p.pensionEnabled && !p.pensionPin) checks.push({ level: 'warning', staffId: p.staffId, message: `${p.staffName} pays into a pension but has no pension PIN (RSA) on record` });
      if (p.netKobo <= 0) checks.push({ level: 'warning', staffId: p.staffId, message: `${p.staffName}'s net pay is ${money(p.netKobo)}` });
      const before = prevNet.get(p.staffId);
      if (previous && before === undefined) checks.push({ level: 'info', staffId: p.staffId, message: `${p.staffName} is new on payroll this month` });
      if (before !== undefined && before > 0) {
        const change = (p.netKobo - before) / before;
        if (Math.abs(change) >= 0.15 && Math.abs(p.netKobo - before) >= 1_000_000) {
          const why = [
            p.unpaidLeaveDays ? `${p.unpaidLeaveDays} unpaid leave day${p.unpaidLeaveDays === 1 ? '' : 's'}` : '',
            ...(p.adjustments as unknown as PayAdjustment[]).map((a) => a.label.toLowerCase()),
          ].filter(Boolean);
          checks.push({
            level: 'warning',
            staffId: p.staffId,
            message: `${p.staffName}'s net pay is ${change > 0 ? 'up' : 'down'} ${Math.round(Math.abs(change) * 100)}% on last month (${money(before)} → ${money(p.netKobo)})${why.length ? ` — ${why.join(', ')}` : ' with no adjustment or leave to explain it'}`,
          });
        }
      }
      if (p.unpaidLeaveDays && !(before !== undefined && before > 0)) {
        checks.push({ level: 'info', staffId: p.staffId, message: `${p.staffName}: ${p.unpaidLeaveDays} day${p.unpaidLeaveDays === 1 ? '' : 's'} of unpaid leave deducted` });
      }
    }
    for (const [acct, who] of accounts) if (who.length > 1) checks.push({ level: 'warning', message: `${who.join(' and ')} share bank account ${acct}` });
    if (previous) {
      const here = new Set(run.payslips.map((p) => p.staffId));
      const gone = previous.payslips.filter((p) => !here.has(p.staffId));
      if (gone.length) checks.push({ level: 'info', message: `Not on this payroll but paid last month: ${gone.map((p) => p.staffName).join(', ')}` });
    }
    if (activeWithoutPay.length) {
      checks.push({ level: 'warning', message: `${activeWithoutPay.length} active staff have no pay details and are not on this payroll: ${activeWithoutPay.map(fullName).join(', ')}` });
    }

    const byPfa = new Map<string, { staff: number; amountKobo: number }>();
    for (const p of run.payslips) {
      if (!p.pensionKobo && !p.employerPensionKobo) continue;
      const k = p.pfaName ?? 'PFA not recorded';
      const v = byPfa.get(k) ?? { staff: 0, amountKobo: 0 };
      v.staff++;
      v.amountKobo += p.pensionKobo + p.employerPensionKobo;
      byPfa.set(k, v);
    }
    const t = totals(run.payslips);

    return {
      ...(await this.runRow(run, names)),
      workingDays: run.workingDays,
      payMethod: run.payMethod,
      payReference: run.payReference,
      note: run.note,
      payslips,
      checks: checks.sort((a, b) => (a.level === b.level ? 0 : a.level === 'warning' ? -1 : 1)),
      missing: activeWithoutPay.map(ref),
      previous: previous ? { period: previous.period, label: periodLabel(previous.period), ...totals(previous.payslips) } : null,
      remittances: {
        payeKobo: t.payeKobo,
        pensionKobo: t.pensionKobo + t.employerPensionKobo,
        nhfKobo: t.nhfKobo,
        byPfa: [...byPfa].map(([pfa, v]) => ({ pfa, ...v })).sort((a, b) => b.amountKobo - a.amountKobo),
      },
      currency: school.currency,
      taxRules: PAYE_RULES_LABEL,
    };
  }

  async payslip(id: string): Promise<PayslipView> {
    const db = this.prisma.db;
    const p = await db.payslip.findUniqueOrThrow({ where: { id }, include: { run: true } });
    const school = await this.hr.school();
    const year = p.run.period.slice(0, 4);
    const ytdSlips = await db.payslip.findMany({
      where: {
        staffId: p.staffId,
        run: { period: { gte: `${year}-01`, lte: p.run.period }, OR: [{ status: { in: ['APPROVED', 'PAID'] } }, { id: p.runId }] },
      },
      select: { grossKobo: true, payeKobo: true, pensionKobo: true, netKobo: true },
    });
    const sum = (k: 'grossKobo' | 'payeKobo' | 'pensionKobo' | 'netKobo') => ytdSlips.reduce((n, s) => n + s[k], 0);
    return {
      id: p.id,
      runId: p.runId,
      period: p.run.period,
      label: periodLabel(p.run.period),
      status: p.run.status,
      paidOn: dateOnly(p.run.paidOn),
      school: { name: school.name, address: school.address, logoUrl: school.logoUrl },
      staff: { id: p.staffId, name: p.staffName, staffNumber: p.staffNumber, jobTitle: p.jobTitle, department: p.department },
      bankName: p.bankName,
      accountNumber: p.accountNumber,
      accountName: p.accountName,
      pfaName: p.pfaName,
      pensionPin: p.pensionPin,
      taxId: p.taxId,
      earnings: p.earnings as unknown as PayslipView['earnings'],
      deductions: p.deductions as unknown as PayslipView['deductions'],
      grossKobo: p.grossKobo,
      netKobo: p.netKobo,
      employerPensionKobo: p.employerPensionKobo,
      unpaidLeaveDays: p.unpaidLeaveDays,
      ytd: { grossKobo: sum('grossKobo'), payeKobo: sum('payeKobo'), pensionKobo: sum('pensionKobo'), netKobo: sum('netKobo') },
      note: school.settings.payslipNote,
      currency: school.currency,
      taxRules: PAYE_RULES_LABEL,
    };
  }

  /** CSV for the bank's bulk-transfer upload: one row per employee with net pay. */
  async bankSchedule(id: string): Promise<{ filename: string; csv: string }> {
    const run = await this.prisma.db.payrollRun.findUniqueOrThrow({ where: { id }, include: { payslips: { orderBy: { staffName: 'asc' } } } });
    if (run.status === 'DRAFT') throw new BadRequestException('Approve the payroll before downloading the bank schedule');
    const cell = (v: string | number | null) => {
      const s = v === null ? '' : String(v);
      // Neutralise spreadsheet formulas and quote everything.
      return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
    };
    const lines = [
      ['Staff number', 'Name', 'Account name', 'Bank', 'Account number', 'Amount', 'Narration'].map(cell).join(','),
      ...run.payslips.map((p) =>
        [p.staffNumber, p.staffName, p.accountName ?? p.staffName, p.bankName, p.accountNumber, (p.netKobo / 100).toFixed(2), `${periodLabel(run.period)} salary`]
          .map(cell)
          .join(','),
      ),
    ];
    return { filename: `payroll-${run.period}-bank-schedule.csv`, csv: lines.join('\r\n') + '\r\n' };
  }

  /** My payslips (approved or paid months only). */
  async myPayslips(staffId: string) {
    const rows = await this.prisma.db.payslip.findMany({
      where: { staffId, run: { status: { in: ['APPROVED', 'PAID'] } } },
      include: { run: true },
      orderBy: { run: { period: 'desc' } },
    });
    return rows.map((p) => ({ id: p.id, period: p.run.period, label: periodLabel(p.run.period), netKobo: p.netKobo, status: p.run.status, paidOn: dateOnly(p.run.paidOn) }));
  }
}

export function missingDetails(p: { bankName: string | null; accountNumber: string | null; pensionEnabled: boolean; pensionPin: string | null; pfaName: string | null }): string[] {
  return [
    ...(!p.bankName || !p.accountNumber ? ['bank account'] : []),
    ...(p.pensionEnabled && !p.pensionPin ? ['pension PIN'] : []),
    ...(p.pensionEnabled && !p.pfaName ? ['PFA'] : []),
  ];
}
