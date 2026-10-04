import { BadRequestException, ConflictException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  STAFF_TYPES,
  listQuerySchema,
  staffExitSchema,
  staffSchema,
  updateStaffSchema,
  type Paginated,
  type StaffInput,
  type StaffRow,
} from '@aischool/shared';
import { Prisma } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { RequirePermissions } from '../common/decorators';
import { dateOnly, paginate, parseDate } from '../common/format';
import { currentTenantId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { releaseStaff } from './staff-release';

const staffListQuery = listQuerySchema.extend({ type: z.enum(STAFF_TYPES).optional(), status: z.enum(['CURRENT', 'EXITED', 'ALL']).default('ALL') });
type StaffListQuery = z.infer<typeof staffListQuery>;

const include = {
  classesLed: { select: { id: true, name: true, classLevel: { select: { name: true } } } },
} satisfies Prisma.StaffInclude;

function toRow(s: Prisma.StaffGetPayload<{ include: typeof include }>): StaffRow {
  return {
    id: s.id,
    staffNumber: s.staffNumber,
    firstName: s.firstName,
    lastName: s.lastName,
    gender: s.gender,
    email: s.email,
    phone: s.phone,
    jobTitle: s.jobTitle,
    type: s.type,
    status: s.status,
    employedOn: dateOnly(s.employedOn),
    classesLed: s.classesLed.map((c) => ({ id: c.id, name: `${c.classLevel.name} ${c.name}` })),
  };
}

@Controller('staff')
export class StaffController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('staff.read')
  async list(@Query(new ZodPipe(staffListQuery)) q: StaffListQuery): Promise<Paginated<StaffRow>> {
    const terms = q.q?.split(/\s+/).filter(Boolean) ?? [];
    const where: Prisma.StaffWhereInput = {
      ...(q.type ? { type: q.type } : {}),
      ...(q.status === 'CURRENT' ? { status: { not: 'EXITED' } } : q.status === 'EXITED' ? { status: 'EXITED' } : {}),
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
      this.prisma.db.staff.findMany({
        where,
        include,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        ...paginate(q.page, q.pageSize),
      }),
      this.prisma.db.staff.count({ where }),
    ]);
    return { items: rows.map(toRow), total, page: q.page, pageSize: q.pageSize };
  }

  @Post()
  @RequirePermissions('staff.manage')
  async create(@Body(new ZodPipe(staffSchema)) body: StaffInput) {
    const staffNumber = body.staffNumber ?? (await this.nextStaffNumber());
    const staff = await this.prisma.db.staff.create({
      data: { ...body, tenantId: currentTenantId(), staffNumber, employedOn: parseDate(body.employedOn) },
      include,
    });
    await this.audit.log({
      action: 'staff.added',
      entityType: 'Staff',
      entityId: staff.id,
      summary: `Added ${staff.jobTitle} ${staff.firstName} ${staff.lastName} (${staffNumber})`,
    });
    return toRow(staff);
  }

  @Patch(':id')
  @RequirePermissions('staff.manage')
  async update(@Param('id') id: string, @Body(new ZodPipe(updateStaffSchema)) body: z.infer<typeof updateStaffSchema>) {
    const db = this.prisma.db;
    const before = await db.staff.findUniqueOrThrow({ where: { id } });
    if (before.status === 'EXITED' && body.status) throw new BadRequestException('This person has left; reinstate them first');
    const { employedOn, ...rest } = body;
    const staff = await db.staff.update({ where: { id }, data: { ...rest, ...(employedOn !== undefined ? { employedOn: parseDate(employedOn) } : {}) }, include });
    await this.audit.log({ action: 'staff.updated', entityType: 'Staff', entityId: id, summary: `Updated ${staff.firstName} ${staff.lastName}'s record` });
    return toRow(staff);
  }

  /**
   * Marks someone as having left. Their history (payslips, attendance,
   * lesson plans, marks they entered) is kept; they stop being class teacher
   * or subject teacher anywhere, leave the timetable, and can no longer sign in.
   */
  @Post(':id/exit')
  @HttpCode(200)
  @RequirePermissions('staff.manage')
  async exit(@Param('id') id: string, @Body(new ZodPipe(staffExitSchema)) body: z.infer<typeof staffExitSchema>) {
    const db = this.prisma.db;
    const s = await db.staff.findUniqueOrThrow({ where: { id } });
    const released = await releaseStaff(this.prisma, id, s.userId);
    const staff = await db.staff.update({
      where: { id },
      data: { status: 'EXITED', exitedOn: parseDate(body.exitedOn) ?? new Date(), exitReason: body.reason ?? null },
      include,
    });
    await this.audit.log({
      action: 'staff.exited',
      entityType: 'Staff',
      entityId: id,
      summary: `Marked ${s.firstName} ${s.lastName} as left${body.reason ? ` (${body.reason})` : ''}: released ${released.classes} class(es), ${released.subjects} subject class(es), ${released.periods} timetable period(s)`,
    });
    return { ...toRow(staff), released };
  }

  /** Brings someone back (their sign-in is re-enabled; classes must be assigned again). */
  @Post(':id/reinstate')
  @HttpCode(200)
  @RequirePermissions('staff.manage')
  async reinstate(@Param('id') id: string) {
    const db = this.prisma.db;
    const s = await db.staff.update({ where: { id }, data: { status: 'ACTIVE', exitedOn: null, exitReason: null }, include });
    if (s.userId) await db.membership.updateMany({ where: { userId: s.userId }, data: { status: 'ACTIVE' } });
    await this.audit.log({ action: 'staff.reinstated', entityType: 'Staff', entityId: id, summary: `Reinstated ${s.firstName} ${s.lastName}` });
    return toRow(s);
  }

  /**
   * Deletes a record entered by mistake. Anyone with payroll, attendance or
   * leave history can't be deleted (that history would go with them):
   * mark them as left instead.
   */
  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('staff.manage')
  async remove(@Param('id') id: string) {
    const db = this.prisma.db;
    const s = await db.staff.findUniqueOrThrow({
      where: { id },
      include: { _count: { select: { payslips: true, attendance: true, leaveRequests: true, awards: true } } },
    });
    const c = s._count;
    const history = [c.payslips && `${c.payslips} payslip(s)`, c.attendance && `${c.attendance} attendance record(s)`, c.leaveRequests && `${c.leaveRequests} leave request(s)`, c.awards && `${c.awards} award(s)`].filter(Boolean);
    if (history.length) {
      throw new ConflictException({ statusCode: 409, code: 'HAS_HISTORY', message: `${s.firstName} ${s.lastName} has ${history.join(', ')}. Mark them as left instead, so the records are kept.` });
    }
    await releaseStaff(this.prisma, id, s.userId, true);
    await db.staff.delete({ where: { id } });
    await this.audit.log({ action: 'staff.deleted', entityType: 'Staff', entityId: id, summary: `Deleted the staff record for ${s.firstName} ${s.lastName} (${s.staffNumber})` });
  }

  private async nextStaffNumber(): Promise<string> {
    const last = await this.prisma.db.staff.findFirst({
      where: { staffNumber: { startsWith: 'STF-' } },
      orderBy: { staffNumber: 'desc' },
      select: { staffNumber: true },
    });
    const next = (last ? Number(last.staffNumber.slice(4)) || 0 : 0) + 1;
    return `STF-${String(next).padStart(4, '0')}`;
  }
}
