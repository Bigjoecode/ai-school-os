import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import {
  DEFAULT_HR_SETTINGS,
  DEFAULT_LEAVE_TYPES,
  computePayslip,
  periodBounds,
  workingDates,
  workingDaysBetween,
  type Allowance,
  type AwardCategory,
  type AwardRow,
  type EmployeeDetail,
  type EmployeeInput,
  type EmployeeListQuery,
  type EmployeeRow,
  type HrOverview,
  type HrSettings,
  type LeaveAppliesTo,
  type LeaveBalance,
  type LeaveRequestInput,
  type LeaveRequestRow,
  type LeaveTypeRow,
  type Paginated,
  type RecognitionSuggestion,
  type StaffAttendanceSummary,
  type StaffRef,
} from '@aischool/shared';
import { Prisma } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { dateOnly, fullName, paginate, parseDate } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { schoolNow, schoolTimeOf } from '../common/school-time';
import { PrismaService } from '../prisma/prisma.service';

const employeeInclude = {
  department: { select: { id: true, name: true } },
  payProfile: { select: { id: true } },
} satisfies Prisma.StaffInclude;
type StaffWithRefs = Prisma.StaffGetPayload<{ include: typeof employeeInclude }>;

export const leaveInclude = {
  staff: { select: { id: true, firstName: true, lastName: true, jobTitle: true, departmentId: true, department: { select: { name: true } } } },
  leaveType: { select: { id: true, name: true, paid: true, daysPerYear: true } },
} satisfies Prisma.LeaveRequestInclude;
type LeaveWithRefs = Prisma.LeaveRequestGetPayload<{ include: typeof leaveInclude }>;

export const ref = (s: { id: string; firstName: string; lastName: string; jobTitle: string }): StaffRef => ({
  id: s.id,
  name: fullName(s),
  jobTitle: s.jobTitle,
});

/** Whole years between two YYYY-MM-DD dates. */
export function yearsBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = to.split('-').map(Number) as [number, number, number];
  return ty - fy - (tm < fm || (tm === fm && td < fd) ? 1 : 0);
}

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;

@Injectable()
export class HrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------- school & settings

  async school() {
    const t = await this.prisma.root.tenant.findUniqueOrThrow({
      where: { id: currentTenantId() },
      select: { name: true, address: true, logoUrl: true, currency: true, timezone: true, hrSettings: true },
    });
    const settings: HrSettings = { ...DEFAULT_HR_SETTINGS, ...((t.hrSettings as Partial<HrSettings> | null) ?? {}) };
    return { ...t, settings, today: schoolNow(t.timezone).date };
  }

  async setSettings(settings: HrSettings) {
    await this.prisma.root.tenant.update({
      where: { id: currentTenantId() },
      data: { hrSettings: settings as unknown as Prisma.InputJsonValue },
    });
    await this.audit.log({ action: 'hr.settings', summary: 'Updated payroll settings' });
    return (await this.school()).settings;
  }

  can(permission: Parameters<RequestContextPermissions['has']>[0]): boolean {
    return currentContext().permissions.has(permission);
  }

  async userNames(ids: (string | null)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((i): i is string => !!i))];
    if (!unique.length) return new Map();
    const users = await this.prisma.root.user.findMany({ where: { id: { in: unique } }, select: { id: true, firstName: true, lastName: true } });
    return new Map(users.map((u) => [u.id, fullName(u)]));
  }

  /** The staff record linked to the signed-in user, if any. */
  async myStaff() {
    return this.prisma.db.staff.findFirst({ where: { userId: currentContext().userId }, include: { department: { select: { name: true } } } });
  }

  // ---------------------------------------------------------- employees

  private async onLeaveToday(staffIds: string[], today: string): Promise<Map<string, string>> {
    const d = parseDate(today);
    const rows = await this.prisma.db.leaveRequest.findMany({
      where: { staffId: { in: staffIds }, status: 'APPROVED', startDate: { lte: d }, endDate: { gte: d } },
      select: { staffId: true, endDate: true },
    });
    return new Map(rows.map((r) => [r.staffId, dateOnly(r.endDate)!]));
  }

  private employeeRow(s: StaffWithRefs, today: string, leaveUntil: Map<string, string>): EmployeeRow {
    const employedOn = dateOnly(s.employedOn);
    return {
      id: s.id,
      staffNumber: s.staffNumber,
      firstName: s.firstName,
      lastName: s.lastName,
      name: fullName(s),
      gender: s.gender,
      email: s.email,
      phone: s.phone,
      jobTitle: s.jobTitle,
      type: s.type,
      status: s.status,
      department: s.department,
      employedOn,
      yearsOfService: employedOn ? Math.max(0, yearsBetween(employedOn, dateOnly(s.exitedOn) ?? today)) : null,
      onLeaveUntil: leaveUntil.get(s.id) ?? null,
      hasPayProfile: this.can('payroll.read') ? !!s.payProfile : null,
    };
  }

  async employees(q: EmployeeListQuery): Promise<Paginated<EmployeeRow>> {
    const { today } = await this.school();
    const terms = q.q?.split(/\s+/).filter(Boolean) ?? [];
    const where: Prisma.StaffWhereInput = {
      ...(q.departmentId ? { departmentId: q.departmentId === 'none' ? null : q.departmentId } : {}),
      ...(q.status ? { status: q.status } : { status: { not: 'EXITED' } }),
      ...(q.type ? { type: q.type } : {}),
      AND: terms.map((t) => ({
        OR: [
          { firstName: { contains: t, mode: 'insensitive' } },
          { lastName: { contains: t, mode: 'insensitive' } },
          { staffNumber: { contains: t, mode: 'insensitive' } },
          { jobTitle: { contains: t, mode: 'insensitive' } },
        ],
      })),
    };
    const [rows, total] = await Promise.all([
      this.prisma.db.staff.findMany({ where, include: employeeInclude, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], ...paginate(q.page, q.pageSize) }),
      this.prisma.db.staff.count({ where }),
    ]);
    const leave = await this.onLeaveToday(rows.map((r) => r.id), today);
    return { items: rows.map((r) => this.employeeRow(r, today, leave)), total, page: q.page, pageSize: q.pageSize };
  }

  async employee(id: string): Promise<EmployeeDetail> {
    const db = this.prisma.db;
    const school = await this.school();
    const s = await db.staff.findUniqueOrThrow({
      where: { id },
      include: {
        ...employeeInclude,
        classesLed: { select: { name: true, classLevel: { select: { name: true } } } },
        classSubjects: { select: { subject: { select: { name: true } } } },
      },
    });
    const year = school.today.slice(0, 4);
    const [leaveUntil, balances, leave, attendance, awards] = await Promise.all([
      this.onLeaveToday([s.id], school.today),
      this.balances([s], year),
      db.leaveRequest.findMany({ where: { staffId: s.id }, include: leaveInclude, orderBy: { startDate: 'desc' }, take: 20 }),
      this.attendanceSummary(school.today.slice(0, 7), school.timezone, s.id),
      db.award.findMany({ where: { staffId: s.id }, include: { staff: true }, orderBy: { awardedOn: 'desc' } }),
    ]);
    const canSeePay = this.can('payroll.read');
    let payProfile: EmployeeDetail['payProfile'] = null;
    if (canSeePay) {
      const p = await db.staffPayProfile.findUnique({ where: { staffId: s.id }, include: { grade: { select: { name: true } } } });
      if (p) payProfile = this.payProfileView(p, school.settings, school.today.slice(0, 7));
    }
    return {
      ...this.employeeRow(s, school.today, leaveUntil),
      dateOfBirth: dateOnly(s.dateOfBirth),
      address: s.address,
      qualification: s.qualification,
      nextOfKinName: s.nextOfKinName,
      nextOfKinPhone: s.nextOfKinPhone,
      exitedOn: dateOnly(s.exitedOn),
      exitReason: s.exitReason,
      hasLogin: !!s.userId,
      classesLed: s.classesLed.map((c) => `${c.classLevel.name} ${c.name}`),
      subjectsTaught: [...new Set(s.classSubjects.map((c) => c.subject.name))].sort(),
      leaveBalances: balances.get(s.id) ?? [],
      leave: await this.leaveRows(leave),
      attendance,
      awards: awards.map(awardRow),
      canSeePay,
      payProfile,
      currency: school.currency,
    };
  }

  payProfileView(
    p: Prisma.StaffPayProfileGetPayload<{ include: { grade: { select: { name: true } } } }>,
    settings: HrSettings,
    period: string,
  ): NonNullable<EmployeeDetail['payProfile']> {
    const otherAllowances = p.otherAllowances as unknown as Allowance[];
    const { start, end } = periodBounds(period);
    return {
      gradeId: p.gradeId,
      gradeName: p.grade?.name ?? null,
      basicKobo: p.basicKobo,
      housingKobo: p.housingKobo,
      transportKobo: p.transportKobo,
      otherAllowances,
      pensionEnabled: p.pensionEnabled,
      nhfEnabled: p.nhfEnabled,
      annualRentKobo: p.annualRentKobo,
      bankName: p.bankName,
      accountNumber: p.accountNumber,
      accountName: p.accountName,
      pfaName: p.pfaName,
      pensionPin: p.pensionPin,
      taxId: p.taxId,
      preview: computePayslip(
        { ...p, otherAllowances, unpaidLeaveDays: 0, workingDays: workingDaysBetween(start, end), adjustments: [] },
        settings,
      ),
    };
  }

  async updateEmployee(id: string, body: EmployeeInput): Promise<EmployeeDetail> {
    const db = this.prisma.db;
    const before = await db.staff.findUniqueOrThrow({ where: { id } });
    if (body.departmentId) await db.department.findUniqueOrThrow({ where: { id: body.departmentId } });
    const { today } = await this.school();
    const exiting = body.status === 'EXITED';
    await db.staff.update({
      where: { id },
      data: {
        ...body,
        employedOn: body.employedOn ? parseDate(body.employedOn) : null,
        dateOfBirth: body.dateOfBirth ? parseDate(body.dateOfBirth) : null,
        exitedOn: exiting ? parseDate(body.exitedOn ?? today) : null,
        exitReason: exiting ? body.exitReason : null,
      },
    });
    const changes: string[] = [];
    if (before.jobTitle !== body.jobTitle) changes.push(`job title to ${body.jobTitle}`);
    if (before.departmentId !== body.departmentId) changes.push('department');
    if (before.status !== body.status) changes.push(`status to ${body.status.toLowerCase().replace('_', ' ')}`);
    await this.audit.log({
      action: exiting && before.status !== 'EXITED' ? 'hr.employee_exited' : 'hr.employee_updated',
      entityType: 'Staff',
      entityId: id,
      summary: `Updated ${fullName(body)}'s record${changes.length ? ` (${changes.join(', ')})` : ''}`,
    });
    return this.employee(id);
  }

  // ---------------------------------------------------------- leave types & balances

  /** Leave types, creating the standard set the first time a school opens leave. */
  async leaveTypes(): Promise<LeaveTypeRow[]> {
    const db = this.prisma.db;
    let rows = await db.leaveType.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    if (!rows.length) {
      await db.leaveType.createMany({
        data: DEFAULT_LEAVE_TYPES.map((t, i) => ({ ...t, tenantId: currentTenantId(), sortOrder: i })),
        skipDuplicates: true,
      });
      rows = await db.leaveType.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    }
    return rows.map((t) => ({ id: t.id, name: t.name, daysPerYear: t.daysPerYear, paid: t.paid, appliesTo: t.appliesTo as LeaveAppliesTo, active: t.active }));
  }

  /** Entitlement, taken and pending days per leave type for the calendar year. */
  async balances(staff: { id: string; gender: 'MALE' | 'FEMALE' }[], year: string): Promise<Map<string, LeaveBalance[]>> {
    const types = (await this.leaveTypes()).filter((t) => t.active);
    const rows = await this.prisma.db.leaveRequest.groupBy({
      by: ['staffId', 'leaveTypeId', 'status'],
      where: {
        staffId: { in: staff.map((s) => s.id) },
        status: { in: ['APPROVED', 'PENDING'] },
        startDate: { gte: parseDate(`${year}-01-01`), lte: parseDate(`${year}-12-31`) },
      },
      _sum: { days: true },
    });
    const used = new Map<string, number>();
    for (const r of rows) used.set(`${r.staffId}:${r.leaveTypeId}:${r.status}`, r._sum.days ?? 0);
    return new Map(
      staff.map((s) => [
        s.id,
        types
          .filter((t) => t.appliesTo === 'ALL' || t.appliesTo === s.gender)
          .map((t) => {
            const taken = used.get(`${s.id}:${t.id}:APPROVED`) ?? 0;
            const pending = used.get(`${s.id}:${t.id}:PENDING`) ?? 0;
            return { leaveTypeId: t.id, name: t.name, paid: t.paid, entitled: t.daysPerYear, taken, pending, remaining: t.daysPerYear - taken - pending };
          }),
      ]),
    );
  }

  // ---------------------------------------------------------- leave requests

  async leaveRows(rows: LeaveWithRefs[]): Promise<LeaveRequestRow[]> {
    if (!rows.length) return [];
    const db = this.prisma.db;
    const names = await this.userNames(rows.map((r) => r.decidedById));
    // Colleagues in the same department away on overlapping days.
    const deptIds = [...new Set(rows.map((r) => r.staff.departmentId).filter((d): d is string => !!d))];
    const min = new Date(Math.min(...rows.map((r) => r.startDate.getTime())));
    const max = new Date(Math.max(...rows.map((r) => r.endDate.getTime())));
    const others = deptIds.length
      ? await db.leaveRequest.findMany({
          where: { status: { in: ['APPROVED', 'PENDING'] }, staff: { departmentId: { in: deptIds } }, startDate: { lte: max }, endDate: { gte: min } },
          include: { staff: { select: { firstName: true, lastName: true, departmentId: true } } },
        })
      : [];
    // Remaining before each pending request (other requests of the year, excluding this one).
    const pending = rows.filter((r) => r.status === 'PENDING');
    const usage = pending.length
      ? await db.leaveRequest.findMany({
          where: {
            staffId: { in: [...new Set(pending.map((r) => r.staffId))] },
            status: { in: ['APPROVED', 'PENDING'] },
          },
          select: { id: true, staffId: true, leaveTypeId: true, days: true, startDate: true },
        })
      : [];
    return rows.map((r) => {
      const year = dateOnly(r.startDate)!.slice(0, 4);
      const usedBefore = usage
        .filter((u) => u.id !== r.id && u.staffId === r.staffId && u.leaveTypeId === r.leaveTypeId && dateOnly(u.startDate)!.startsWith(year))
        .reduce((n, u) => n + u.days, 0);
      return {
        id: r.id,
        staff: { ...ref(r.staff), department: r.staff.department?.name ?? null },
        leaveType: { id: r.leaveType.id, name: r.leaveType.name, paid: r.leaveType.paid },
        startDate: dateOnly(r.startDate)!,
        endDate: dateOnly(r.endDate)!,
        days: r.days,
        reason: r.reason,
        status: r.status,
        requestedAt: r.createdAt.toISOString(),
        decidedBy: r.decidedById ? (names.get(r.decidedById) ?? null) : null,
        decidedAt: r.decidedAt?.toISOString() ?? null,
        decisionNote: r.decisionNote,
        overlaps: r.staff.departmentId
          ? others
              .filter((o) => o.id !== r.id && o.staffId !== r.staffId && o.staff.departmentId === r.staff.departmentId && o.startDate <= r.endDate && o.endDate >= r.startDate)
              .map((o) => fullName(o.staff))
          : [],
        remainingBefore: r.status === 'PENDING' ? r.leaveType.daysPerYear - usedBefore : null,
      };
    });
  }

  async listLeave(q: { status?: LeaveRequestRow['status']; staffId?: string; from?: string; to?: string }): Promise<LeaveRequestRow[]> {
    const rows = await this.prisma.db.leaveRequest.findMany({
      where: {
        ...(q.status ? { status: q.status } : {}),
        ...(q.staffId ? { staffId: q.staffId } : {}),
        ...(q.to ? { startDate: { lte: parseDate(q.to) } } : {}),
        ...(q.from ? { endDate: { gte: parseDate(q.from) } } : {}),
      },
      include: leaveInclude,
      orderBy: { startDate: 'desc' },
      take: 300,
    });
    // Awaiting a decision first, soonest first; then the rest, latest first.
    const pending = rows.filter((r) => r.status === 'PENDING').sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    return this.leaveRows([...pending, ...rows.filter((r) => r.status !== 'PENDING')]);
  }

  async requestLeave(staffId: string, body: LeaveRequestInput, self: boolean): Promise<LeaveRequestRow> {
    const db = this.prisma.db;
    const [staff, type] = await Promise.all([
      db.staff.findUniqueOrThrow({ where: { id: staffId } }),
      db.leaveType.findUniqueOrThrow({ where: { id: body.leaveTypeId } }),
    ]);
    if (staff.status === 'EXITED') throw new BadRequestException(`${fullName(staff)} has left the school`);
    if (!type.active) throw new BadRequestException(`${type.name} is no longer offered`);
    if (type.appliesTo !== 'ALL' && type.appliesTo !== staff.gender) throw new BadRequestException(`${type.name} doesn't apply to ${self ? 'you' : fullName(staff)}`);
    const days = workingDaysBetween(body.startDate, body.endDate);
    if (!days) throw new BadRequestException('Those dates fall on a weekend — no working days to take');

    const start = parseDate(body.startDate);
    const end = parseDate(body.endDate);
    const clash = await db.leaveRequest.findFirst({
      where: { staffId, status: { in: ['APPROVED', 'PENDING'] }, startDate: { lte: end }, endDate: { gte: start } },
      include: { leaveType: true },
    });
    if (clash) {
      throw new BadRequestException(
        `${self ? 'You already have' : `${fullName(staff)} already has`} ${clash.leaveType.name.toLowerCase()} from ${dateOnly(clash.startDate)} to ${dateOnly(clash.endDate)}`,
      );
    }
    const balance = (await this.balances([staff], body.startDate.slice(0, 4))).get(staff.id)?.find((b) => b.leaveTypeId === type.id);
    if (balance && days > balance.remaining) {
      throw new BadRequestException(
        `That's ${days} working days, but only ${Math.max(0, balance.remaining)} day${balance.remaining === 1 ? '' : 's'} of ${type.name.toLowerCase()} ${balance.remaining === 1 ? 'is' : 'are'} left for ${body.startDate.slice(0, 4)}` +
          (balance.pending ? ` (${balance.pending} already requested)` : ''),
      );
    }
    const created = await db.leaveRequest.create({
      data: {
        tenantId: currentTenantId(),
        staffId,
        leaveTypeId: type.id,
        startDate: start,
        endDate: end,
        days,
        reason: body.reason,
        requestedById: currentContext().userId,
      },
      include: leaveInclude,
    });
    await this.audit.log({
      action: 'hr.leave_requested',
      entityType: 'LeaveRequest',
      entityId: created.id,
      summary: `${self ? `${fullName(staff)} requested` : `Requested for ${fullName(staff)}:`} ${days} day${days === 1 ? '' : 's'} of ${type.name.toLowerCase()} (${body.startDate} to ${body.endDate})`,
    });
    return (await this.leaveRows([created]))[0]!;
  }

  async decideLeave(id: string, decision: 'APPROVE' | 'DECLINE', note: string | null): Promise<LeaveRequestRow> {
    const db = this.prisma.db;
    const req = await db.leaveRequest.findUniqueOrThrow({ where: { id }, include: leaveInclude });
    const me = await this.myStaff();
    if (me && me.id === req.staffId) throw new ForbiddenException('Someone else must decide your own leave request');
    const status = decision === 'APPROVE' ? 'APPROVED' : 'DECLINED';
    if (decision === 'DECLINE' && !note) throw new BadRequestException('Give a short reason when declining');
    const done = await db.leaveRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: { status, decidedById: currentContext().userId, decidedAt: new Date(), decisionNote: note },
    });
    if (!done.count) throw new BadRequestException('This request has already been decided');
    if (status === 'APPROVED') await this.markLeaveOnRegister(req.staffId, dateOnly(req.startDate)!, dateOnly(req.endDate)!);
    await this.audit.log({
      action: status === 'APPROVED' ? 'hr.leave_approved' : 'hr.leave_declined',
      entityType: 'LeaveRequest',
      entityId: id,
      summary: `${status === 'APPROVED' ? 'Approved' : 'Declined'} ${fullName(req.staff)}'s ${req.leaveType.name.toLowerCase()} (${dateOnly(req.startDate)} to ${dateOnly(req.endDate)})`,
    });
    return (await this.leaveRows([await db.leaveRequest.findUniqueOrThrow({ where: { id }, include: leaveInclude })]))[0]!;
  }

  /**
   * Withdraws a request. Staff may cancel their own pending request or approved
   * leave that hasn't started; managers may cancel any.
   */
  async cancelLeave(id: string, asOwner: boolean): Promise<LeaveRequestRow> {
    const db = this.prisma.db;
    const req = await db.leaveRequest.findUniqueOrThrow({ where: { id }, include: leaveInclude });
    const { today } = await this.school();
    if (asOwner) {
      const me = await this.myStaff();
      if (!me || me.id !== req.staffId) throw new ForbiddenException('You can only cancel your own leave');
      if (req.status === 'APPROVED' && dateOnly(req.startDate)! <= today) {
        throw new BadRequestException('This leave has already started — ask HR to change it');
      }
    }
    if (req.status !== 'PENDING' && req.status !== 'APPROVED') throw new BadRequestException('Only pending or approved leave can be cancelled');
    await db.leaveRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
    if (req.status === 'APPROVED') {
      await db.staffAttendance.deleteMany({
        where: { staffId: req.staffId, method: 'LEAVE', date: { gte: req.startDate, lte: req.endDate } },
      });
    }
    await this.audit.log({
      action: 'hr.leave_cancelled',
      entityType: 'LeaveRequest',
      entityId: id,
      summary: `Cancelled ${fullName(req.staff)}'s ${req.leaveType.name.toLowerCase()} (${dateOnly(req.startDate)} to ${dateOnly(req.endDate)})`,
    });
    return (await this.leaveRows([await db.leaveRequest.findUniqueOrThrow({ where: { id }, include: leaveInclude })]))[0]!;
  }

  /** Approved leave shows on the staff register as "on leave" (unless they checked in anyway). */
  private async markLeaveOnRegister(staffId: string, start: string, end: string) {
    const db = this.prisma.db;
    const dates = workingDates(start, end).map((d) => parseDate(d));
    const existing = await db.staffAttendance.findMany({ where: { staffId, date: { in: dates } } });
    const byDate = new Map(existing.map((e) => [e.date.getTime(), e]));
    const tenantId = currentTenantId();
    await db.$transaction(
      dates
        .filter((d) => !byDate.get(d.getTime())?.checkInAt)
        .map((date) =>
          db.staffAttendance.upsert({
            where: { staffId_date: { staffId, date } },
            update: { status: 'ON_LEAVE', method: 'LEAVE' },
            create: { tenantId, staffId, date, status: 'ON_LEAVE', method: 'LEAVE' },
          }),
        ),
    );
  }

  /** Approved unpaid leave days falling in a month, per staff member. */
  async unpaidLeaveDays(period: string, start: string, end: string): Promise<Map<string, number>> {
    const rows = await this.prisma.db.leaveRequest.findMany({
      where: { status: 'APPROVED', leaveType: { paid: false }, startDate: { lte: parseDate(end) }, endDate: { gte: parseDate(start) } },
      select: { staffId: true, startDate: true, endDate: true },
    });
    const out = new Map<string, number>();
    for (const r of rows) {
      const from = dateOnly(r.startDate)! < start ? start : dateOnly(r.startDate)!;
      const to = dateOnly(r.endDate)! > end ? end : dateOnly(r.endDate)!;
      out.set(r.staffId, (out.get(r.staffId) ?? 0) + workingDaysBetween(from, to));
    }
    return out;
  }

  // ---------------------------------------------------------- attendance

  async attendanceSummary(month: string, timezone: string, staffId?: string): Promise<StaffAttendanceSummary> {
    const rows = await this.prisma.db.staffAttendance.findMany({
      where: { ...(staffId ? { staffId } : {}), date: { gte: parseDate(`${month}-01`), lte: parseDate(`${month}-31`) } },
      select: { status: true, checkInAt: true },
    });
    return summarise(month, rows, timezone);
  }

  // ---------------------------------------------------------- overview

  async overview(): Promise<HrOverview> {
    const db = this.prisma.db;
    const school = await this.school();
    const today = school.today;
    const year = today.slice(0, 4);
    const month = today.slice(0, 7);
    const in30 = new Date(Date.parse(`${today}T00:00:00Z`) + 30 * 86_400_000);
    const d = parseDate(today);
    const since = new Date(Date.parse(`${today}T00:00:00Z`) - 60 * 86_400_000);

    const [staff, departments, pending, current, upcoming, monthAttendance, recentAttendance, awardsThisYear] = await Promise.all([
      db.staff.findMany({ select: { id: true, firstName: true, lastName: true, jobTitle: true, type: true, status: true, departmentId: true, employedOn: true, exitedOn: true, dateOfBirth: true } }),
      db.department.findMany({ select: { id: true, name: true } }),
      db.leaveRequest.count({ where: { status: 'PENDING' } }),
      db.leaveRequest.findMany({ where: { status: 'APPROVED', startDate: { lte: d }, endDate: { gte: d } }, include: leaveInclude }),
      db.leaveRequest.findMany({ where: { status: 'APPROVED', startDate: { gt: d, lte: in30 } }, include: leaveInclude, orderBy: { startDate: 'asc' } }),
      db.staffAttendance.findMany({ where: { date: { gte: parseDate(`${month}-01`), lte: d } }, select: { staffId: true, status: true, checkInAt: true } }),
      db.staffAttendance.findMany({ where: { date: { gte: since, lte: d } }, select: { staffId: true, status: true, checkInAt: true } }),
      db.award.count({ where: { awardedOn: { gte: parseDate(`${year}-01-01`) } } }),
    ]);
    const active = staff.filter((s) => s.status !== 'EXITED');
    const byId = new Map(staff.map((s) => [s.id, s]));

    const deptCount = new Map<string | null, number>();
    for (const s of active) deptCount.set(s.departmentId, (deptCount.get(s.departmentId) ?? 0) + 1);
    const byDepartment = [
      ...departments.map((dep) => ({ id: dep.id, name: dep.name, count: deptCount.get(dep.id) ?? 0 })).sort((a, b) => b.count - a.count),
      ...(deptCount.get(null) ? [{ id: null, name: 'No department', count: deptCount.get(null)! }] : []),
    ];

    const lateBy = new Map<string, number>();
    for (const r of monthAttendance) if (r.status === 'LATE') lateBy.set(r.staffId, (lateBy.get(r.staffId) ?? 0) + 1);
    const mostLate = [...lateBy]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .filter(([id]) => byId.has(id))
      .map(([id, late]) => ({ staff: ref(byId.get(id)!), late }));

    const monthDay = today.slice(5);
    const thisMonth = (date: Date | null) => !!date && dateOnly(date)!.slice(5, 7) === monthDay.slice(0, 2);
    const birthdays = active
      .filter((s) => thisMonth(s.dateOfBirth))
      .map((s) => ({ staff: ref(s), date: `${year}-${dateOnly(s.dateOfBirth)!.slice(5)}` }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const anniversaries = active
      .filter((s) => thisMonth(s.employedOn) && yearsBetween(dateOnly(s.employedOn)!, `${year}-12-31`) >= 1)
      .map((s) => ({ staff: ref(s), years: Number(year) - Number(dateOnly(s.employedOn)!.slice(0, 4)), date: `${year}-${dateOnly(s.employedOn)!.slice(5)}` }))
      .sort((a, b) => a.date.localeCompare(b.date));

    let payroll: HrOverview['payroll'] = null;
    if (this.can('payroll.read')) {
      const runs = await db.payrollRun.findMany({
        orderBy: { period: 'desc' },
        take: 6,
        include: { payslips: { select: { grossKobo: true, netKobo: true } } },
      });
      const trend = runs
        .map((r) => ({
          period: r.period,
          label: new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${r.period}-01T00:00:00Z`)),
          grossKobo: r.payslips.reduce((n, p) => n + p.grossKobo, 0),
          netKobo: r.payslips.reduce((n, p) => n + p.netKobo, 0),
          staffCount: r.payslips.length,
        }))
        .reverse();
      payroll = { latest: null, trend };
    }

    return {
      today,
      currency: school.currency,
      headcount: {
        active: active.length,
        teaching: active.filter((s) => s.type === 'TEACHING').length,
        nonTeaching: active.filter((s) => s.type === 'NON_TEACHING').length,
        onLeaveToday: current.length,
        joinersThisYear: staff.filter((s) => dateOnly(s.employedOn)?.startsWith(year)).length,
        leaversThisYear: staff.filter((s) => dateOnly(s.exitedOn)?.startsWith(year)).length,
      },
      byDepartment,
      leave: {
        pending,
        onLeaveToday: current.map((r) => ({ staff: ref(r.staff), leaveType: r.leaveType.name, until: dateOnly(r.endDate)! })),
        upcoming: upcoming.map((r) => ({ staff: ref(r.staff), leaveType: r.leaveType.name, startDate: dateOnly(r.startDate)!, endDate: dateOnly(r.endDate)!, days: r.days })),
      },
      attendance: { ...summarise(month, monthAttendance, school.timezone), mostLate },
      payroll,
      birthdays,
      anniversaries,
      awardsThisYear,
      recognition: recognition(active, recentAttendance, school.timezone, year),
    };
  }
}

type RequestContextPermissions = ReturnType<typeof currentContext>['permissions'];

export function awardRow(a: Prisma.AwardGetPayload<{ include: { staff: true } }>): AwardRow {
  return {
    id: a.id,
    staff: ref(a.staff),
    title: a.title,
    category: a.category as AwardCategory,
    citation: a.citation,
    prize: a.prize,
    awardedOn: dateOnly(a.awardedOn)!,
  };
}

function summarise(month: string, rows: { status: string; checkInAt: Date | null }[], timezone: string): StaffAttendanceSummary {
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  const present = count('PRESENT');
  const late = count('LATE');
  const times = rows.filter((r) => r.checkInAt).map((r) => minutes(schoolTimeOf(timezone, r.checkInAt!)));
  return {
    month,
    present,
    late,
    absent: count('ABSENT'),
    onLeave: count('ON_LEAVE'),
    onTimeRate: present + late ? Math.round((present / (present + late)) * 1000) / 10 : null,
    avgCheckIn: times.length ? hhmm(times.reduce((n, t) => n + t, 0) / times.length) : null,
  };
}

/**
 * People worth recognising, from the record rather than opinion: perfect
 * attendance over the last 60 days, the most punctual, and long-service
 * milestones this year.
 */
function recognition(
  active: { id: string; firstName: string; lastName: string; jobTitle: string; employedOn: Date | null }[],
  rows: { staffId: string; status: string; checkInAt: Date | null }[],
  timezone: string,
  year: string,
): RecognitionSuggestion[] {
  const out: RecognitionSuggestion[] = [];
  const per = new Map<string, { days: number; late: number; absent: number; times: number[] }>();
  for (const r of rows) {
    const p = per.get(r.staffId) ?? { days: 0, late: 0, absent: 0, times: [] };
    if (r.status === 'PRESENT' || r.status === 'LATE') p.days++;
    if (r.status === 'LATE') p.late++;
    if (r.status === 'ABSENT') p.absent++;
    if (r.checkInAt) p.times.push(minutes(schoolTimeOf(timezone, r.checkInAt)));
    per.set(r.staffId, p);
  }
  const byId = new Map(active.map((s) => [s.id, s]));
  const perfect = [...per].filter(([id, p]) => byId.has(id) && p.days >= 15 && !p.late && !p.absent);
  for (const [id, p] of perfect.slice(0, 5)) {
    out.push({ kind: 'PERFECT_ATTENDANCE', staff: ref(byId.get(id)!), detail: `Present and on time every day for the last ${p.days} school days` });
  }
  const earliest = [...per]
    .filter(([id, p]) => byId.has(id) && p.times.length >= 15)
    .map(([id, p]) => ({ id, avg: p.times.reduce((n, t) => n + t, 0) / p.times.length }))
    .sort((a, b) => a.avg - b.avg)
    .slice(0, 3);
  for (const e of earliest) {
    if (out.some((o) => o.staff.id === e.id)) continue;
    out.push({ kind: 'PUNCTUALITY', staff: ref(byId.get(e.id)!), detail: `Arrives at ${hhmm(e.avg)} on average — among the earliest in school` });
  }
  for (const s of active) {
    if (!s.employedOn) continue;
    const years = Number(year) - s.employedOn.getUTCFullYear();
    if ([5, 10, 15, 20, 25, 30].includes(years)) {
      out.push({ kind: 'LONG_SERVICE', staff: ref(s), detail: `${years} years at the school this year (joined ${dateOnly(s.employedOn)})` });
    }
  }
  return out;
}
