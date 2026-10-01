import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import {
  allocateSchema,
  exeatSchema,
  hostelRoomSchema,
  hostelSchema,
  type ExeatInput,
  type ExeatRow,
  type HostelInput,
  type HostelOverview,
  type HostelRow,
} from '@aischool/shared';
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { RequirePermissions } from '../common/decorators';
import { fullName, parseDate } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { OperationsService, armLabel } from './operations.service';

const exeatInclude = {
  student: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      classArm: { select: { name: true, classLevel: { select: { name: true } } } },
      hostelBeds: { where: { active: true }, select: { room: { select: { hostel: { select: { name: true } } } } } },
    },
  },
} satisfies Prisma.ExeatInclude;
type ExeatWithRefs = Prisma.ExeatGetPayload<{ include: typeof exeatInclude }>;

@Controller('hostel')
export class HostelController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ops: OperationsService,
    private readonly audit: AuditService,
  ) {}

  private exeatRow(e: ExeatWithRefs, names: Map<string, string>, now: Date): ExeatRow {
    return {
      id: e.id,
      student: { id: e.student.id, name: fullName(e.student), classArm: armLabel(e.student.classArm), hostel: e.student.hostelBeds[0]?.room.hostel.name ?? null },
      leaveAt: e.leaveAt.toISOString(),
      expectedReturnAt: e.expectedReturnAt.toISOString(),
      returnedAt: e.returnedAt?.toISOString() ?? null,
      reason: e.reason,
      collectedBy: e.collectedBy,
      approvedBy: e.approvedById ? (names.get(e.approvedById) ?? null) : null,
      overdue: !e.returnedAt && e.expectedReturnAt < now,
    };
  }

  private async hostels(): Promise<HostelRow[]> {
    const db = this.prisma.db;
    const [rows, away] = await Promise.all([
      db.hostel.findMany({
        include: {
          warden: { select: { id: true, firstName: true, lastName: true, phone: true } },
          rooms: {
            orderBy: { name: 'asc' },
            include: {
              allocations: {
                where: { active: true },
                orderBy: { bed: 'asc' },
                include: { student: { select: { id: true, firstName: true, lastName: true, classArm: { select: { name: true, classLevel: { select: { name: true } } } } } } },
              },
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
      db.exeat.findMany({ where: { returnedAt: null }, select: { studentId: true } }),
    ]);
    const out = new Set(away.map((a) => a.studentId));
    return rows.map((h) => {
      const rooms = h.rooms.map((r) => ({
        id: r.id,
        name: r.name,
        beds: r.beds,
        occupants: r.allocations.map((a) => ({
          allocationId: a.id,
          studentId: a.student.id,
          name: fullName(a.student),
          classArm: armLabel(a.student.classArm),
          bed: a.bed,
          awayOnExeat: out.has(a.student.id),
        })),
      }));
      return {
        id: h.id,
        name: h.name,
        gender: h.gender as HostelRow['gender'],
        warden: h.warden ? { id: h.warden.id, name: fullName(h.warden), phone: h.warden.phone } : null,
        notes: h.notes,
        beds: rooms.reduce((n, r) => n + r.beds, 0),
        occupied: rooms.reduce((n, r) => n + r.occupants.length, 0),
        rooms,
      };
    });
  }

  @Get('overview')
  @RequirePermissions('hostel.read')
  async overview(): Promise<HostelOverview> {
    const [hostels, away] = await Promise.all([
      this.hostels(),
      this.prisma.db.exeat.findMany({ where: { returnedAt: null }, include: exeatInclude, orderBy: { expectedReturnAt: 'asc' } }),
    ]);
    const names = await this.ops.userNames(away.map((e) => e.approvedById));
    const now = new Date();
    const rows = away.map((e) => this.exeatRow(e, names, now));
    return {
      hostels,
      boarders: hostels.reduce((n, h) => n + h.occupied, 0),
      beds: hostels.reduce((n, h) => n + h.beds, 0),
      away: rows,
      overdue: rows.filter((r) => r.overdue),
    };
  }

  // ---------------------------------------------------------- hostels & rooms

  @Post('hostels')
  @RequirePermissions('hostel.manage')
  async createHostel(@Body(new ZodPipe(hostelSchema)) body: HostelInput) {
    if (body.wardenStaffId) await this.prisma.db.staff.findUniqueOrThrow({ where: { id: body.wardenStaffId } });
    const h = await this.prisma.db.hostel.create({ data: { ...body, tenantId: currentTenantId() } });
    await this.audit.log({ action: 'hostel.created', entityType: 'Hostel', entityId: h.id, summary: `Added ${h.name} (${h.gender.toLowerCase()})` });
    return h;
  }

  @Put('hostels/:id')
  @RequirePermissions('hostel.manage')
  async updateHostel(@Param('id') id: string, @Body(new ZodPipe(hostelSchema)) body: HostelInput) {
    if (body.wardenStaffId) await this.prisma.db.staff.findUniqueOrThrow({ where: { id: body.wardenStaffId } });
    const before = await this.prisma.db.hostel.findUniqueOrThrow({ where: { id } });
    if (before.gender !== body.gender && body.gender !== 'MIXED') {
      const clash = await this.prisma.db.hostelAllocation.count({ where: { active: true, room: { hostelId: id }, student: { gender: { not: body.gender } } } });
      if (clash) throw new BadRequestException(`${clash} current boarders don't match — move them before changing the hostel to ${body.gender.toLowerCase()}`);
    }
    return this.prisma.db.hostel.update({ where: { id }, data: body });
  }

  @Delete('hostels/:id')
  @HttpCode(204)
  @RequirePermissions('hostel.manage')
  async deleteHostel(@Param('id') id: string) {
    const h = await this.prisma.db.hostel.findUniqueOrThrow({ where: { id } });
    if (await this.prisma.db.hostelAllocation.count({ where: { active: true, room: { hostelId: id } } })) throw new BadRequestException('Move the boarders out first');
    await this.prisma.db.hostel.delete({ where: { id } });
    await this.audit.log({ action: 'hostel.deleted', entityType: 'Hostel', entityId: id, summary: `Removed ${h.name}` });
  }

  @Post('hostels/:id/rooms')
  @RequirePermissions('hostel.manage')
  async createRoom(@Param('id') hostelId: string, @Body(new ZodPipe(hostelRoomSchema)) body: z.infer<typeof hostelRoomSchema>) {
    await this.prisma.db.hostel.findUniqueOrThrow({ where: { id: hostelId } });
    return this.prisma.db.hostelRoom.create({ data: { ...body, hostelId, tenantId: currentTenantId() } });
  }

  @Put('rooms/:id')
  @RequirePermissions('hostel.manage')
  async updateRoom(@Param('id') id: string, @Body(new ZodPipe(hostelRoomSchema)) body: z.infer<typeof hostelRoomSchema>) {
    const taken = await this.prisma.db.hostelAllocation.findMany({ where: { roomId: id, active: true }, select: { bed: true } });
    if (body.beds < taken.length) throw new BadRequestException(`${taken.length} boarders sleep in this room — it needs at least ${taken.length} beds`);
    const highBed = taken.find((t) => t.bed && t.bed > body.beds);
    if (highBed) throw new BadRequestException(`Bed ${highBed.bed} is taken — move that boarder before reducing the beds`);
    return this.prisma.db.hostelRoom.update({ where: { id }, data: body });
  }

  @Delete('rooms/:id')
  @HttpCode(204)
  @RequirePermissions('hostel.manage')
  async deleteRoom(@Param('id') id: string) {
    if (await this.prisma.db.hostelAllocation.count({ where: { roomId: id, active: true } })) throw new BadRequestException('Move the boarders out first');
    await this.prisma.db.hostelRoom.delete({ where: { id } });
  }

  // ---------------------------------------------------------- allocations

  /** Gives a student a bed, moving them if they already have one. */
  @Post('allocations')
  @RequirePermissions('hostel.manage')
  async allocate(@Body(new ZodPipe(allocateSchema)) body: z.infer<typeof allocateSchema>) {
    const db = this.prisma.db;
    const school = await this.ops.school();
    const [student, room] = await Promise.all([
      db.student.findUniqueOrThrow({ where: { id: body.studentId } }),
      db.hostelRoom.findUniqueOrThrow({ where: { id: body.roomId }, include: { hostel: true } }),
    ]);
    if (student.status !== 'ACTIVE') throw new BadRequestException(`${fullName(student)} is not an active student`);
    if (room.hostel.gender !== 'MIXED' && room.hostel.gender !== student.gender) throw new BadRequestException(`${room.hostel.name} is for ${room.hostel.gender === 'MALE' ? 'boys' : 'girls'}`);
    if (body.bed && body.bed > room.beds) throw new BadRequestException(`${room.name} has ${room.beds} beds`);
    const today = parseDate(school.today);
    const tenantId = currentTenantId();
    const result = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM hostel_rooms WHERE id = ${room.id} FOR UPDATE`;
      const inRoom = await tx.hostelAllocation.findMany({ where: { roomId: room.id, active: true, studentId: { not: student.id } } });
      if (inRoom.length >= room.beds) throw new BadRequestException(`${room.name} is full (${room.beds} beds)`);
      if (body.bed && inRoom.some((a) => a.bed === body.bed)) throw new BadRequestException(`Bed ${body.bed} in ${room.name} is taken`);
      const previous = await tx.hostelAllocation.findFirst({ where: { studentId: student.id, active: true } });
      if (previous) await tx.hostelAllocation.update({ where: { id: previous.id }, data: { active: false, toDate: today } });
      const a = await tx.hostelAllocation.create({ data: { tenantId, roomId: room.id, studentId: student.id, bed: body.bed, fromDate: today } });
      return { a, moved: !!previous };
    });
    await this.audit.log({
      action: 'hostel.allocated',
      entityType: 'Student',
      entityId: student.id,
      summary: `${result.moved ? 'Moved' : 'Gave'} ${fullName(student)} ${result.moved ? 'to' : 'a bed in'} ${room.hostel.name}, ${room.name}${body.bed ? ` (bed ${body.bed})` : ''}`,
    });
    return result.a;
  }

  @Post('allocations/:id/end')
  @HttpCode(200)
  @RequirePermissions('hostel.manage')
  async endAllocation(@Param('id') id: string) {
    const school = await this.ops.school();
    const a = await this.prisma.db.hostelAllocation.findUniqueOrThrow({ where: { id }, include: { student: true, room: { include: { hostel: true } } } });
    if (!a.active) throw new BadRequestException('This bed has already been given up');
    await this.prisma.db.hostelAllocation.update({ where: { id }, data: { active: false, toDate: parseDate(school.today) } });
    await this.audit.log({ action: 'hostel.vacated', entityType: 'Student', entityId: a.studentId, summary: `${fullName(a.student)} left ${a.room.hostel.name}, ${a.room.name}` });
    return { ok: true };
  }

  // ---------------------------------------------------------- exeats

  @Get('exeats')
  @RequirePermissions('hostel.read')
  async exeats(@Query(new ZodPipe(z.object({ status: z.enum(['OUT', 'ALL']).default('OUT') }))) q: { status: 'OUT' | 'ALL' }): Promise<ExeatRow[]> {
    const rows = await this.prisma.db.exeat.findMany({
      where: q.status === 'OUT' ? { returnedAt: null } : {},
      include: exeatInclude,
      orderBy: { leaveAt: 'desc' },
      take: 300,
    });
    const names = await this.ops.userNames(rows.map((e) => e.approvedById));
    const now = new Date();
    return rows.map((e) => this.exeatRow(e, names, now));
  }

  @Post('exeats')
  @RequirePermissions('hostel.manage')
  async signOut(@Body(new ZodPipe(exeatSchema)) body: ExeatInput): Promise<ExeatRow> {
    const db = this.prisma.db;
    const leaveAt = new Date(body.leaveAt);
    const back = new Date(body.expectedReturnAt);
    if (back <= leaveAt) throw new BadRequestException('The return must be after the departure');
    const student = await db.student.findUniqueOrThrow({ where: { id: body.studentId } });
    if (!(await db.hostelAllocation.count({ where: { studentId: student.id, active: true } }))) throw new BadRequestException(`${fullName(student)} is not a boarder`);
    if (await db.exeat.count({ where: { studentId: student.id, returnedAt: null } })) throw new BadRequestException(`${fullName(student)} is already signed out`);
    const e = await db.exeat.create({
      data: { tenantId: currentTenantId(), studentId: student.id, leaveAt, expectedReturnAt: back, reason: body.reason, collectedBy: body.collectedBy, approvedById: currentContext().userId },
      include: exeatInclude,
    });
    await this.audit.log({ action: 'hostel.exeat', entityType: 'Student', entityId: student.id, summary: `Signed ${fullName(student)} out on exeat with ${body.collectedBy} (${body.reason})` });
    return this.exeatRow(e, await this.ops.userNames([e.approvedById]), new Date());
  }

  @Post('exeats/:id/return')
  @HttpCode(200)
  @RequirePermissions('hostel.manage')
  async signIn(@Param('id') id: string): Promise<ExeatRow> {
    const db = this.prisma.db;
    const done = await db.exeat.updateMany({ where: { id, returnedAt: null }, data: { returnedAt: new Date() } });
    if (!done.count) throw new BadRequestException('This boarder has already been signed back in');
    const e = await db.exeat.findUniqueOrThrow({ where: { id }, include: exeatInclude });
    await this.audit.log({ action: 'hostel.exeat_return', entityType: 'Student', entityId: e.studentId, summary: `Signed ${fullName(e.student)} back in from exeat` });
    return this.exeatRow(e, await this.ops.userNames([e.approvedById]), new Date());
  }
}
