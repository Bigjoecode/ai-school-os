import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  AWARD_CATEGORY_LABELS,
  aiCitationSchema,
  awardCitationRequestSchema,
  awardSchema,
  departmentSchema,
  employeeListQuerySchema,
  employeeSchema,
  formatMoney,
  leaveDecisionSchema,
  leaveListQuerySchema,
  leaveRequestSchema,
  leaveTypeSchema,
  type AiCitation,
  type AiText,
  type AwardInput,
  type AwardRow,
  type DepartmentInput,
  type DepartmentRow,
  type EmployeeDetail,
  type EmployeeInput,
  type EmployeeListQuery,
  type EmployeeRow,
  type HrOverview,
  type LeaveRequestInput,
  type LeaveRequestRow,
  type LeaveTypeInput,
  type LeaveTypeRow,
  type MyHr,
  type Paginated,
  type PayslipView,
} from '@aischool/shared';
import { z } from 'zod';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { AuditService } from '../audit/audit.service';
import { RequirePermissions } from '../common/decorators';
import { dateOnly, fullName, parseDate } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { HrService, awardRow, leaveInclude, ref, yearsBetween } from './hr.service';
import { PayrollService } from './payroll.service';
import { citationPrompt, hrBriefingPrompt } from './prompts';

@Controller('hr')
export class HrController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hr: HrService,
    private readonly payroll: PayrollService,
    private readonly gateway: AiGatewayService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------- overview & AI

  @Get('overview')
  @RequirePermissions('hr.read')
  async overview(): Promise<HrOverview> {
    const o = await this.hr.overview();
    if (o.payroll) o.payroll.latest = await this.payroll.latestRun();
    return o;
  }

  @Post('insight')
  @HttpCode(200)
  @RequirePermissions('hr.read', 'ai.use')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async insight(): Promise<AiText> {
    const o = await this.overview();
    const school = await this.hr.school();
    const money = (k: number) => formatMoney(k, o.currency);
    const data = [
      `Today ${o.today}.`,
      `Headcount: ${o.headcount.active} active (${o.headcount.teaching} teaching, ${o.headcount.nonTeaching} non-teaching); ${o.headcount.joinersThisYear} joined and ${o.headcount.leaversThisYear} left this year.`,
      `By department: ${o.byDepartment.map((d) => `${d.name} ${d.count}`).join(', ')}.`,
      `Leave: ${o.leave.pending} requests awaiting a decision. On leave today: ${o.leave.onLeaveToday.map((l) => `${l.staff.name} (${l.staff.jobTitle}, ${l.leaveType} until ${l.until})`).join('; ') || 'nobody'}. ` +
        `Starting in the next 30 days: ${o.leave.upcoming.map((l) => `${l.staff.name} (${l.staff.jobTitle}) ${l.leaveType} ${l.startDate}–${l.endDate}`).join('; ') || 'none'}.`,
      `Staff attendance this month: ${o.attendance.present} on-time and ${o.attendance.late} late arrivals, ${o.attendance.absent} absences, ${o.attendance.onLeave} leave days; on-time rate ${o.attendance.onTimeRate ?? 'n/a'}%, average check-in ${o.attendance.avgCheckIn ?? 'n/a'}.` +
        (o.attendance.mostLate.length ? ` Most late arrivals (count only, do not name): ${o.attendance.mostLate.map((m) => m.late).join(', ')}.` : ''),
      o.payroll
        ? `Payroll by month (gross / net / staff): ${o.payroll.trend.map((t) => `${t.label} ${money(t.grossKobo)} / ${money(t.netKobo)} / ${t.staffCount}`).join('; ') || 'no payroll yet'}.` +
          (o.payroll.latest ? ` Latest: ${o.payroll.latest.label}, ${o.payroll.latest.status.toLowerCase()}.` : '')
        : '',
      `Recognition candidates: ${o.recognition.map((r) => `${r.staff.name} — ${r.detail}`).join('; ') || 'none'}. Awards given this year: ${o.awardsThisYear}.`,
      `Birthdays this month: ${o.birthdays.length}; work anniversaries this month: ${o.anniversaries.map((a) => `${a.staff.name} ${a.years} years`).join(', ') || 'none'}.`,
    ]
      .filter(Boolean)
      .join('\n');
    const { system, user } = hrBriefingPrompt(school.name, data);
    const r = await this.gateway.generate({ tier: 'advanced', system, messages: [{ role: 'user', content: user }] }, 'hr-insight');
    return { text: r.text, provider: r.provider, model: r.model };
  }

  // ---------------------------------------------------------- departments

  @Get('departments')
  @RequirePermissions('hr.read')
  async departments(): Promise<DepartmentRow[]> {
    const rows = await this.prisma.db.department.findMany({
      include: { head: true, _count: { select: { staff: { where: { status: { not: 'EXITED' } } } } } },
      orderBy: { name: 'asc' },
    });
    return rows.map((d) => ({ id: d.id, name: d.name, description: d.description, head: d.head ? ref(d.head) : null, headcount: d._count.staff }));
  }

  @Post('departments')
  @RequirePermissions('hr.manage')
  async createDepartment(@Body(new ZodPipe(departmentSchema)) body: DepartmentInput) {
    if (body.headStaffId) await this.prisma.db.staff.findUniqueOrThrow({ where: { id: body.headStaffId } });
    const d = await this.prisma.db.department.create({ data: { ...body, tenantId: currentTenantId() } });
    if (body.headStaffId) await this.prisma.db.staff.update({ where: { id: body.headStaffId }, data: { departmentId: d.id } });
    await this.audit.log({ action: 'hr.department_created', entityType: 'Department', entityId: d.id, summary: `Created the ${d.name} department` });
    return d;
  }

  @Put('departments/:id')
  @RequirePermissions('hr.manage')
  async updateDepartment(@Param('id') id: string, @Body(new ZodPipe(departmentSchema)) body: DepartmentInput) {
    if (body.headStaffId) await this.prisma.db.staff.findUniqueOrThrow({ where: { id: body.headStaffId } });
    const d = await this.prisma.db.department.update({ where: { id }, data: body });
    if (body.headStaffId) await this.prisma.db.staff.update({ where: { id: body.headStaffId }, data: { departmentId: d.id } });
    await this.audit.log({ action: 'hr.department_updated', entityType: 'Department', entityId: id, summary: `Updated the ${d.name} department` });
    return d;
  }

  @Delete('departments/:id')
  @HttpCode(204)
  @RequirePermissions('hr.manage')
  async deleteDepartment(@Param('id') id: string) {
    const d = await this.prisma.db.department.findUniqueOrThrow({ where: { id } });
    await this.prisma.db.department.delete({ where: { id } });
    await this.audit.log({ action: 'hr.department_deleted', entityType: 'Department', entityId: id, summary: `Deleted the ${d.name} department (its staff now have no department)` });
  }

  // ---------------------------------------------------------- employees

  @Get('employees')
  @RequirePermissions('hr.read')
  employees(@Query(new ZodPipe(employeeListQuerySchema)) q: EmployeeListQuery): Promise<Paginated<EmployeeRow>> {
    return this.hr.employees(q);
  }

  /** HR, or payroll staff setting someone's pay. */
  @Get('employees/:id')
  employee(@Param('id') id: string): Promise<EmployeeDetail> {
    if (!this.hr.can('hr.read') && !this.hr.can('payroll.read')) throw new ForbiddenException("You don't have access to staff records");
    return this.hr.employee(id);
  }

  @Put('employees/:id')
  @RequirePermissions('hr.manage')
  updateEmployee(@Param('id') id: string, @Body(new ZodPipe(employeeSchema)) body: EmployeeInput): Promise<EmployeeDetail> {
    return this.hr.updateEmployee(id, body);
  }

  // ---------------------------------------------------------- leave

  @Get('leave-types')
  @RequirePermissions('hr.read')
  leaveTypes(): Promise<LeaveTypeRow[]> {
    return this.hr.leaveTypes();
  }

  @Post('leave-types')
  @RequirePermissions('hr.manage')
  async createLeaveType(@Body(new ZodPipe(leaveTypeSchema)) body: LeaveTypeInput) {
    await this.hr.leaveTypes();
    const count = await this.prisma.db.leaveType.count();
    const t = await this.prisma.db.leaveType.create({ data: { ...body, tenantId: currentTenantId(), sortOrder: count } });
    await this.audit.log({ action: 'hr.leave_type_created', entityType: 'LeaveType', entityId: t.id, summary: `Added leave type ${t.name} (${t.daysPerYear} days a year)` });
    return t;
  }

  @Put('leave-types/:id')
  @RequirePermissions('hr.manage')
  async updateLeaveType(@Param('id') id: string, @Body(new ZodPipe(leaveTypeSchema)) body: LeaveTypeInput) {
    const t = await this.prisma.db.leaveType.update({ where: { id }, data: body });
    await this.audit.log({ action: 'hr.leave_type_updated', entityType: 'LeaveType', entityId: id, summary: `Updated leave type ${t.name} (${t.daysPerYear} days a year${t.active ? '' : ', retired'})` });
    return t;
  }

  @Get('leave')
  @RequirePermissions('hr.read')
  leave(@Query(new ZodPipe(leaveListQuerySchema)) q: z.infer<typeof leaveListQuerySchema>): Promise<LeaveRequestRow[]> {
    return this.hr.listLeave(q);
  }

  /** HR records leave on someone's behalf (e.g. sick leave phoned in). */
  @Post('leave')
  @RequirePermissions('hr.manage')
  async fileLeave(@Body(new ZodPipe(leaveRequestSchema)) body: LeaveRequestInput): Promise<LeaveRequestRow> {
    if (!body.staffId) throw new BadRequestException('Choose the staff member');
    return this.hr.requestLeave(body.staffId, body, false);
  }

  @Post('leave/:id/decide')
  @HttpCode(200)
  @RequirePermissions('leave.approve')
  decide(@Param('id') id: string, @Body(new ZodPipe(leaveDecisionSchema)) body: z.infer<typeof leaveDecisionSchema>): Promise<LeaveRequestRow> {
    return this.hr.decideLeave(id, body.decision, body.note);
  }

  @Post('leave/:id/cancel')
  @HttpCode(200)
  @RequirePermissions('hr.manage')
  cancel(@Param('id') id: string): Promise<LeaveRequestRow> {
    return this.hr.cancelLeave(id, false);
  }

  // ---------------------------------------------------------- awards

  @Get('awards')
  @RequirePermissions('hr.read')
  async awards(): Promise<AwardRow[]> {
    const rows = await this.prisma.db.award.findMany({ include: { staff: true }, orderBy: { awardedOn: 'desc' }, take: 300 });
    return rows.map(awardRow);
  }

  @Post('awards')
  @RequirePermissions('hr.manage')
  async createAward(@Body(new ZodPipe(awardSchema)) body: AwardInput): Promise<AwardRow> {
    const staff = await this.prisma.db.staff.findUniqueOrThrow({ where: { id: body.staffId } });
    const a = await this.prisma.db.award.create({
      data: { ...body, awardedOn: parseDate(body.awardedOn), tenantId: currentTenantId(), createdById: currentContext().userId },
      include: { staff: true },
    });
    await this.audit.log({ action: 'hr.award', entityType: 'Award', entityId: a.id, summary: `Gave ${fullName(staff)} the award "${body.title}"` });
    return awardRow(a);
  }

  @Delete('awards/:id')
  @HttpCode(204)
  @RequirePermissions('hr.manage')
  async deleteAward(@Param('id') id: string) {
    const a = await this.prisma.db.award.findUniqueOrThrow({ where: { id }, include: { staff: true } });
    await this.prisma.db.award.delete({ where: { id } });
    await this.audit.log({ action: 'hr.award_deleted', entityType: 'Award', entityId: id, summary: `Removed the award "${a.title}" from ${fullName(a.staff)}` });
  }

  /** Drafts a citation from the employee's record and the nominator's notes (nothing is saved). */
  @Post('awards/citation')
  @HttpCode(200)
  @RequirePermissions('hr.manage', 'ai.use')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async citation(@Body(new ZodPipe(awardCitationRequestSchema)) body: z.infer<typeof awardCitationRequestSchema>): Promise<AiCitation & AiText> {
    const db = this.prisma.db;
    const school = await this.hr.school();
    const s = await db.staff.findUniqueOrThrow({
      where: { id: body.staffId },
      include: {
        department: { select: { name: true } },
        classesLed: { select: { name: true, classLevel: { select: { name: true } } } },
        classSubjects: { select: { subject: { select: { name: true } }, classArm: { select: { name: true, classLevel: { select: { name: true } } } } } },
      },
    });
    const since = new Date(Date.parse(`${school.today}T00:00:00Z`) - 90 * 86_400_000);
    const [att, plans, awards] = await Promise.all([
      db.staffAttendance.groupBy({ by: ['status'], where: { staffId: s.id, date: { gte: since } }, _count: { _all: true } }),
      db.lessonPlan.count({ where: { teacherId: s.id } }),
      db.award.findMany({ where: { staffId: s.id }, orderBy: { awardedOn: 'desc' }, take: 5 }),
    ]);
    const n = (st: string) => att.find((a) => a.status === st)?._count._all ?? 0;
    const employedOn = dateOnly(s.employedOn);
    const facts = [
      `Award: "${body.title}" (${AWARD_CATEGORY_LABELS[body.category]}).`,
      `Recipient: ${s.firstName} ${s.lastName} (${s.gender === 'FEMALE' ? 'she/her' : 'he/him'}), ${s.jobTitle}${s.department ? `, ${s.department.name} department` : ''}.`,
      employedOn ? `Joined the school on ${employedOn} — ${yearsBetween(employedOn, school.today)} full years of service.` : 'Start date not recorded.',
      s.qualification ? `Qualification: ${s.qualification}.` : '',
      s.classesLed.length ? `Class teacher of ${s.classesLed.map((c) => `${c.classLevel.name} ${c.name}`).join(', ')}.` : '',
      s.classSubjects.length
        ? `Teaches ${[...new Set(s.classSubjects.map((c) => c.subject.name))].join(', ')} to ${s.classSubjects.length} class groups.`
        : '',
      plans ? `Lesson plans on record: ${plans}.` : '',
      `Last 90 days at work: ${n('PRESENT')} days on time, ${n('LATE')} late, ${n('ABSENT')} absent, ${n('ON_LEAVE')} on leave.`,
      awards.length ? `Earlier awards: ${awards.map((a) => `${a.title} (${dateOnly(a.awardedOn)!.slice(0, 4)})`).join(', ')}.` : '',
      body.notes ? `Nominator's notes: ${body.notes}` : 'No nominator notes were given — keep to the record above.',
    ]
      .filter(Boolean)
      .join('\n');
    const { system, user } = citationPrompt(school.name, facts);
    const r = await this.gateway.generateJson({ tier: 'standard', system, messages: [{ role: 'user', content: user }] }, aiCitationSchema, 'award-citation');
    return { ...r.data, text: r.data.citation, provider: r.provider, model: r.model };
  }

  // ---------------------------------------------------------- my HR (self-service)

  private async me() {
    const staff = await this.hr.myStaff();
    if (!staff) throw new ForbiddenException("Your account isn't linked to a staff record — ask HR to link it");
    return staff;
  }

  @Get('me')
  @RequirePermissions('hr.self')
  async my(): Promise<MyHr> {
    const school = await this.hr.school();
    const staff = await this.hr.myStaff();
    const types = (await this.hr.leaveTypes()).filter((t) => t.active && (!staff || t.appliesTo === 'ALL' || t.appliesTo === staff.gender));
    if (!staff) return { staff: null, leaveTypes: types, leaveBalances: [], leave: [], payslips: [], awards: [], currency: school.currency };
    const db = this.prisma.db;
    const [balances, leave, payslips, awards] = await Promise.all([
      this.hr.balances([staff], school.today.slice(0, 4)),
      db.leaveRequest.findMany({ where: { staffId: staff.id }, include: leaveInclude, orderBy: { startDate: 'desc' }, take: 30 }),
      this.payroll.myPayslips(staff.id),
      db.award.findMany({ where: { staffId: staff.id }, include: { staff: true }, orderBy: { awardedOn: 'desc' } }),
    ]);
    return {
      staff: { ...ref(staff), staffNumber: staff.staffNumber, department: staff.department?.name ?? null },
      leaveTypes: types,
      leaveBalances: balances.get(staff.id) ?? [],
      leave: await this.hr.leaveRows(leave),
      payslips,
      awards: awards.map(awardRow),
      currency: school.currency,
    };
  }

  @Post('me/leave')
  @RequirePermissions('hr.self')
  async requestMine(@Body(new ZodPipe(leaveRequestSchema)) body: LeaveRequestInput): Promise<LeaveRequestRow> {
    const staff = await this.me();
    const { today } = await this.hr.school();
    if (body.endDate < today) throw new BadRequestException('That leave has already ended — ask HR to record it');
    return this.hr.requestLeave(staff.id, body, true);
  }

  @Post('me/leave/:id/cancel')
  @HttpCode(200)
  @RequirePermissions('hr.self')
  cancelMine(@Param('id') id: string): Promise<LeaveRequestRow> {
    return this.hr.cancelLeave(id, true);
  }

  @Get('me/payslips/:id')
  @RequirePermissions('hr.self')
  async myPayslip(@Param('id') id: string): Promise<PayslipView> {
    const staff = await this.me();
    const slip = await this.prisma.db.payslip.findUniqueOrThrow({ where: { id }, include: { run: { select: { status: true } } } });
    if (slip.staffId !== staff.id || slip.run.status === 'DRAFT') throw new ForbiddenException('That payslip is not available to you');
    return this.payroll.payslip(id);
  }
}
