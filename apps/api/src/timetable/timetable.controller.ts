import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  applyChangesSchema,
  availabilitySchema,
  bellScheduleSchema,
  generateTimetableSchema,
  interpretRequestSchema,
  lessonPeriods,
  moveEntrySchema,
  roomSchema,
  saveLoadsSchema,
  type AvailabilityInput,
  type BellSchedule,
  type GenerateTimetableInput,
  type InterpretResult,
  type MoveEntryInput,
  type RoomInput,
  type SaveLoadsInput,
  type TimetableChange,
  type TimetableDetail,
  type TimetableSetup,
  type TimetableSummary,
  type TodaySchedule,
} from '@aischool/shared';
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { RequirePermissions } from '../common/decorators';
import { currentTenantId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { TimetableService } from './timetable.service';

@Controller()
export class TimetableController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timetables: TimetableService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------- setup

  @Get('timetable-setup')
  @RequirePermissions('timetable.read')
  setup(): Promise<TimetableSetup> {
    return this.timetables.setup();
  }

  @Put('timetable-setup/bell')
  @RequirePermissions('timetable.manage')
  async setBell(@Body(new ZodPipe(bellScheduleSchema)) body: BellSchedule): Promise<TimetableSetup> {
    await this.prisma.root.tenant.update({
      where: { id: currentTenantId() },
      data: { bellSchedule: body as unknown as Prisma.InputJsonValue },
    });
    // Blocked periods that are no longer lesson periods would silently linger.
    const lessons = lessonPeriods(body);
    await this.prisma.db.staffUnavailability.deleteMany({
      where: { OR: [{ day: { notIn: body.days } }, { period: { notIn: lessons } }] },
    });
    await this.audit.log({
      action: 'timetable.bell',
      summary: `Set the school day to ${lessons.length} lesson periods, ${body.days.length} days a week`,
    });
    return this.timetables.setup();
  }

  /** Upserts each class's subjects: weekly periods, teacher, room kind, doubles. */
  @Put('timetable-setup/loads')
  @RequirePermissions('timetable.manage')
  async saveLoads(@Body(new ZodPipe(saveLoadsSchema)) body: SaveLoadsInput): Promise<TimetableSetup> {
    const db = this.prisma.db;
    const armIds = [...new Set(body.rows.map((r) => r.classArmId))];
    const subjectIds = [...new Set(body.rows.map((r) => r.subjectId))];
    const teacherIds = [...new Set(body.rows.map((r) => r.teacherId).filter((t): t is string => !!t))];
    const [arms, subjects, teachers] = await Promise.all([
      db.classArm.count({ where: { id: { in: armIds } } }),
      db.subject.count({ where: { id: { in: subjectIds } } }),
      db.staff.count({ where: { id: { in: teacherIds } } }),
    ]);
    if (arms !== armIds.length || subjects !== subjectIds.length || teachers !== teacherIds.length) {
      throw new BadRequestException('Some classes, subjects or teachers were not found');
    }
    const tenantId = currentTenantId();
    await db.$transaction(
      body.rows.map((r) =>
        db.classSubject.upsert({
          where: { classArmId_subjectId: { classArmId: r.classArmId, subjectId: r.subjectId } },
          update: { teacherId: r.teacherId, periodsPerWeek: r.periodsPerWeek, roomKind: r.roomKind, doublePeriod: r.doublePeriod },
          create: { tenantId, ...r },
        }),
      ),
    );
    await this.audit.log({ action: 'timetable.loads', summary: `Updated ${body.rows.length} class subject load${body.rows.length === 1 ? '' : 's'}` });
    return this.timetables.setup();
  }

  @Put('timetable-setup/availability')
  @RequirePermissions('timetable.manage')
  async setAvailability(@Body(new ZodPipe(availabilitySchema)) body: AvailabilityInput): Promise<TimetableSetup> {
    const staff = await this.prisma.db.staff.findUniqueOrThrow({ where: { id: body.staffId } });
    const tenantId = currentTenantId();
    await this.prisma.db.$transaction([
      this.prisma.db.staffUnavailability.deleteMany({ where: { staffId: staff.id } }),
      this.prisma.db.staffUnavailability.createMany({
        data: body.unavailable.map((s) => ({ tenantId, staffId: staff.id, day: s.day, period: s.period })),
        skipDuplicates: true,
      }),
    ]);
    await this.audit.log({
      action: 'timetable.availability',
      summary: `Set ${staff.firstName} ${staff.lastName}'s unavailable periods (${body.unavailable.length})`,
    });
    return this.timetables.setup();
  }

  @Get('rooms')
  @RequirePermissions('timetable.read')
  rooms() {
    return this.prisma.db.room.findMany({ orderBy: [{ kind: 'asc' }, { name: 'asc' }] });
  }

  @Post('rooms')
  @RequirePermissions('timetable.manage')
  async createRoom(@Body(new ZodPipe(roomSchema)) body: RoomInput) {
    const room = await this.prisma.db.room.create({ data: { ...body, tenantId: currentTenantId() } });
    await this.audit.log({ action: 'room.created', entityType: 'Room', entityId: room.id, summary: `Added room ${room.name}` });
    return room;
  }

  @Patch('rooms/:id')
  @RequirePermissions('timetable.manage')
  updateRoom(@Param('id') id: string, @Body(new ZodPipe(roomSchema.partial())) body: Partial<RoomInput>) {
    return this.prisma.db.room.update({ where: { id }, data: body });
  }

  @Delete('rooms/:id')
  @HttpCode(204)
  @RequirePermissions('timetable.manage')
  async deleteRoom(@Param('id') id: string) {
    await this.prisma.db.room.delete({ where: { id } });
  }

  // ---------------------------------------------------------- timetables

  @Get('timetables')
  @RequirePermissions('timetable.read')
  list(@Query(new ZodPipe(z.object({ termId: z.string().optional() }))) q: { termId?: string }): Promise<TimetableSummary[]> {
    return this.timetables.list(q.termId);
  }

  @Post('timetables/generate')
  @HttpCode(202)
  @RequirePermissions('timetable.manage')
  generate(@Body(new ZodPipe(generateTimetableSchema)) body: GenerateTimetableInput): Promise<TimetableSummary> {
    return this.timetables.generate(body.termId, body.name);
  }

  /** The signed-in teacher's lessons today, and what's on now. */
  @Get('timetables/today')
  @RequirePermissions('timetable.read')
  today(): Promise<TodaySchedule> {
    return this.timetables.today();
  }

  @Post('timetables/assistant/interpret')
  @HttpCode(200)
  @RequirePermissions('timetable.manage', 'ai.use')
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  interpret(@Body(new ZodPipe(interpretRequestSchema)) body: { text: string }): Promise<InterpretResult> {
    return this.timetables.interpret(body.text);
  }

  @Post('timetables/assistant/apply')
  @HttpCode(200)
  @RequirePermissions('timetable.manage')
  apply(@Body(new ZodPipe(applyChangesSchema)) body: { changes: TimetableChange[] }) {
    return this.timetables.apply(body.changes);
  }

  @Get('timetables/:id')
  @RequirePermissions('timetable.read')
  detail(@Param('id') id: string): Promise<TimetableDetail> {
    return this.timetables.detail(id);
  }

  @Post('timetables/:id/regenerate')
  @HttpCode(202)
  @RequirePermissions('timetable.manage')
  regenerate(@Param('id') id: string): Promise<TimetableSummary> {
    return this.timetables.regenerate(id);
  }

  @Patch('timetables/:id/entries/:entryId')
  @RequirePermissions('timetable.manage')
  move(
    @Param('id') id: string,
    @Param('entryId') entryId: string,
    @Body(new ZodPipe(moveEntrySchema)) body: MoveEntryInput,
  ): Promise<TimetableDetail> {
    return this.timetables.moveEntry(id, entryId, body);
  }

  @Post('timetables/:id/entries/:entryId/lock')
  @HttpCode(200)
  @RequirePermissions('timetable.manage')
  lock(
    @Param('id') id: string,
    @Param('entryId') entryId: string,
    @Body(new ZodPipe(z.object({ locked: z.boolean() }))) body: { locked: boolean },
  ): Promise<TimetableDetail> {
    return this.timetables.setLocked(id, entryId, body.locked);
  }

  @Post('timetables/:id/publish')
  @HttpCode(200)
  @RequirePermissions('timetable.manage')
  publish(@Param('id') id: string): Promise<TimetableDetail> {
    return this.timetables.publish(id);
  }

  @Post('timetables/:id/explain')
  @HttpCode(200)
  @RequirePermissions('timetable.read', 'ai.use')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  explain(@Param('id') id: string) {
    return this.timetables.explain(id);
  }

  @Delete('timetables/:id')
  @HttpCode(204)
  @RequirePermissions('timetable.manage')
  async remove(@Param('id') id: string) {
    const t = await this.prisma.db.timetable.findUniqueOrThrow({ where: { id } });
    if (t.status === 'PUBLISHED') throw new BadRequestException('Publish another timetable before deleting the live one');
    await this.prisma.db.timetable.delete({ where: { id } });
    await this.audit.log({ action: 'timetable.deleted', entityType: 'Timetable', entityId: id, summary: `Deleted timetable ${t.name}` });
  }
}
