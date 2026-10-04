import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Put, Query } from '@nestjs/common';
import {
  HOUSE_POINT_CATEGORY_LABELS,
  houseAllocateSchema,
  housePointSchema,
  houseSchema,
  houseSettingsSchema,
  houseStandingsQuerySchema,
  type HouseAllocateResult,
  type HouseDetail,
  type HouseList,
  type HousePointRow,
  type HouseRow,
  type HouseSettings,
  type HouseStandings,
  type Paginated,
  type StudentHouseView,
} from '@aischool/shared';
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { RequirePermissions } from '../common/decorators';
import { dateOnly, paginate, parseDate } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { armLabel, houseRef, HousesService, pointInclude } from './houses.service';

type HouseParsed = z.output<typeof houseSchema>;
type AllocateParsed = z.output<typeof houseAllocateSchema>;
type PointParsed = z.output<typeof housePointSchema>;
type StandingsQuery = z.output<typeof houseStandingsQuerySchema>;

const pointsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  houseId: z.string().optional(),
  category: z.string().max(20).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
type PointsQuery = z.output<typeof pointsQuery>;

const studentHouseSchema = z.object({ houseId: z.string().nullable() });

/** Fisher–Yates, so allocations differ from run to run. */
function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * School houses: setting them up and putting students in them (house
 * masters and senior staff), awarding and deducting points (any teacher),
 * and the leaderboard every member of staff can see.
 */
@Controller('houses')
export class HousesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly houses: HousesService,
    private readonly audit: AuditService,
  ) {}

  private mustManage() {
    if (!this.houses.canManage()) throw new ForbiddenException('Only staff who manage academics or students can change houses');
  }

  // ---------------------------------------------------------- houses

  @Get()
  @RequirePermissions('school.read')
  async list(): Promise<HouseList> {
    const db = this.prisma.db;
    const canManage = this.houses.canManage();
    const [houses, counts, unassigned, settings, staff] = await Promise.all([
      db.house.findMany({ orderBy: { name: 'asc' } }),
      db.student.groupBy({ by: ['houseId', 'gender'], where: { status: 'ACTIVE', houseId: { not: null } }, _count: { _all: true } }),
      db.student.count({ where: { status: 'ACTIVE', houseId: null } }),
      this.houses.settings(),
      canManage ? db.staff.findMany({ where: { status: { not: 'EXITED' } }, select: { id: true, firstName: true, lastName: true }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] }) : [],
    ]);
    return {
      houses: await this.rows(houses, counts),
      settings,
      unassigned,
      staff: staff.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}` })),
      canManage,
      canAward: this.houses.canAward(),
    };
  }

  @Post()
  @RequirePermissions('school.read')
  async create(@Body(new ZodPipe(houseSchema)) body: HouseParsed): Promise<HouseRow> {
    this.mustManage();
    await this.checkMaster(body.masterStaffId);
    await this.uniqueName(body.name);
    const h = await this.prisma.db.house.create({ data: { tenantId: currentTenantId(), name: body.name, colour: body.colour.toLowerCase(), motto: body.motto, masterStaffId: body.masterStaffId } });
    await this.audit.log({ action: 'houses.created', entityType: 'House', entityId: h.id, summary: `Created ${h.name}` });
    return (await this.rows([h], []))[0]!;
  }

  @Patch(':id')
  @RequirePermissions('school.read')
  async update(@Param('id') id: string, @Body(new ZodPipe(houseSchema.partial())) body: Partial<HouseParsed>): Promise<HouseRow> {
    this.mustManage();
    const db = this.prisma.db;
    const h = await db.house.findUnique({ where: { id } });
    if (!h) throw new NotFoundException('House not found');
    if (body.masterStaffId) await this.checkMaster(body.masterStaffId);
    if (body.name && body.name.toLowerCase() !== h.name.toLowerCase()) await this.uniqueName(body.name);
    const u = await db.house.update({
      where: { id },
      data: { name: body.name, colour: body.colour?.toLowerCase(), motto: body.motto === undefined ? undefined : body.motto, masterStaffId: body.masterStaffId === undefined ? undefined : body.masterStaffId },
    });
    await this.audit.log({ action: 'houses.updated', entityType: 'House', entityId: id, summary: `Updated ${u.name}${u.name !== h.name ? ` (was ${h.name})` : ''}` });
    const counts = await db.student.groupBy({ by: ['houseId', 'gender'], where: { status: 'ACTIVE', houseId: id }, _count: { _all: true } });
    return (await this.rows([u], counts))[0]!;
  }

  @Delete(':id')
  @RequirePermissions('school.read')
  async remove(@Param('id') id: string): Promise<{ ok: true; released: number }> {
    this.mustManage();
    const db = this.prisma.db;
    const h = await db.house.findUnique({ where: { id }, include: { _count: { select: { students: true, points: true } } } });
    if (!h) throw new NotFoundException('House not found');
    await db.$transaction([db.student.updateMany({ where: { houseId: id }, data: { houseId: null } }), db.house.delete({ where: { id } })]);
    await this.audit.log({
      action: 'houses.deleted',
      entityType: 'House',
      entityId: id,
      summary: `Deleted ${h.name} (${h._count.students} student(s) released, ${h._count.points} points entr${h._count.points === 1 ? 'y' : 'ies'} removed)`,
    });
    return { ok: true, released: h._count.students };
  }

  // ---------------------------------------------------------- settings

  @Get('settings')
  @RequirePermissions('school.read')
  getSettings(): Promise<HouseSettings> {
    return this.houses.settings();
  }

  @Put('settings')
  @RequirePermissions('school.read')
  async setSettings(@Body(new ZodPipe(houseSettingsSchema)) body: HouseSettings): Promise<HouseSettings> {
    this.mustManage();
    const saved = await this.houses.saveSettings(body);
    await this.audit.log({ action: 'houses.settings', summary: `${saved.countBehaviour ? 'Counted' : 'Stopped counting'} behaviour points towards houses` });
    return saved;
  }

  // ---------------------------------------------------------- standings

  @Get('standings')
  @RequirePermissions('school.read')
  async standings(@Query(new ZodPipe(houseStandingsQuerySchema)) q: StandingsQuery): Promise<HouseStandings> {
    return this.houses.standings(await this.houses.period(q.period, q.from, q.to), { recent: 12, contributors: 10 });
  }

  // ---------------------------------------------------------- points

  @Get('points')
  @RequirePermissions('school.read')
  async points(@Query(new ZodPipe(pointsQuery)) q: PointsQuery): Promise<Paginated<HousePointRow>> {
    const where: Prisma.HousePointEntryWhereInput = {
      ...(q.houseId ? { houseId: q.houseId } : {}),
      ...(q.category ? { category: q.category } : {}),
      ...(q.from || q.to ? { date: { ...(q.from ? { gte: parseDate(q.from) } : {}), ...(q.to ? { lte: parseDate(q.to) } : {}) } } : {}),
    };
    const db = this.prisma.db;
    const [rows, total] = await Promise.all([
      db.housePointEntry.findMany({ where, include: pointInclude, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], ...paginate(q.page, q.pageSize) }),
      db.housePointEntry.count({ where }),
    ]);
    return { items: await this.houses.pointRows(rows), total, page: q.page, pageSize: q.pageSize };
  }

  @Post('points')
  @RequirePermissions('behaviour.manage')
  async award(@Body(new ZodPipe(housePointSchema)) body: PointParsed): Promise<{ entries: HousePointRow[]; notice: string | null }> {
    const db = this.prisma.db;
    const today = await this.houses.today();
    if (body.date > today) throw new BadRequestException('The date cannot be in the future');
    const tenantId = currentTenantId();
    const userId = currentContext().userId ?? null;
    const base = { tenantId, points: body.points, reason: body.reason, category: body.category, date: parseDate(body.date), awardedById: userId };
    const data: Prisma.HousePointEntryCreateManyInput[] = [];
    let notice: string | null = null;
    if (body.studentIds.length) {
      const ids = [...new Set(body.studentIds)];
      const students = await db.student.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, houseId: true } });
      if (students.length !== ids.length) throw new NotFoundException('Student not found');
      const housed = students.filter((s) => s.houseId);
      const without = students.filter((s) => !s.houseId);
      if (!housed.length) throw new BadRequestException(students.length === 1 ? `${students[0]!.firstName} is not in a house yet` : 'None of these students is in a house yet');
      if (without.length) notice = `${without.map((s) => s.firstName).join(', ')} ${without.length === 1 ? 'is' : 'are'} not in a house, so got no points`;
      for (const s of housed) data.push({ ...base, houseId: s.houseId!, studentId: s.id });
    } else {
      const h = await db.house.findUnique({ where: { id: body.houseId! } });
      if (!h) throw new NotFoundException('House not found');
      data.push({ ...base, houseId: h.id, studentId: null });
    }
    const created = await db.$transaction(data.map((d) => db.housePointEntry.create({ data: d, include: pointInclude })));
    const verb = body.points > 0 ? `Awarded ${body.points}` : `Deducted ${-body.points}`;
    const who = created.map((c) => (c.student ? `${c.student.firstName} ${c.student.lastName} (${c.house.name})` : c.house.name));
    await this.audit.log({
      action: 'houses.points',
      entityType: 'HousePointEntry',
      entityId: created[0]!.id,
      summary: `${verb} house point${Math.abs(body.points) === 1 ? '' : 's'} for ${HOUSE_POINT_CATEGORY_LABELS[body.category].toLowerCase()} (${body.reason}): ${who.length > 3 ? `${who.slice(0, 3).join(', ')} and ${who.length - 3} more` : who.join(', ')}`,
    });
    return { entries: await this.houses.pointRows(created), notice };
  }

  @Delete('points/:id')
  @RequirePermissions('behaviour.manage')
  async removePoints(@Param('id') id: string): Promise<{ ok: true }> {
    const db = this.prisma.db;
    const e = await db.housePointEntry.findUnique({ where: { id }, include: pointInclude });
    if (!e) throw new NotFoundException('Entry not found');
    if (!this.houses.canDelete(e)) throw new ForbiddenException('You can only remove points you awarded');
    await db.housePointEntry.delete({ where: { id } });
    await this.audit.log({ action: 'houses.points_removed', entityType: 'HousePointEntry', entityId: id, summary: `Removed ${e.points} point(s) from ${e.house.name} (${e.reason}, ${dateOnly(e.date)})` });
    return { ok: true };
  }

  // ---------------------------------------------------------- members

  @Post('allocate')
  @RequirePermissions('school.read')
  async allocate(@Body(new ZodPipe(houseAllocateSchema)) body: AllocateParsed): Promise<HouseAllocateResult> {
    this.mustManage();
    const db = this.prisma.db;
    const houses = await db.house.findMany({ orderBy: { name: 'asc' } });
    if (!houses.length) throw new ConflictException('Create the houses first');
    const byId = new Map(houses.map((h) => [h.id, h]));
    const before = await db.student.groupBy({ by: ['houseId'], where: { status: 'ACTIVE', houseId: { not: null } }, _count: { _all: true } });
    const beforeCount = new Map(before.map((b) => [b.houseId!, b._count._all]));
    const moves = new Map<string, string | null>();
    let unchanged = 0;

    if (body.mode === 'SET') {
      if (body.houseId && !byId.has(body.houseId)) throw new NotFoundException('House not found');
      const students = await db.student.findMany({
        where: { status: 'ACTIVE', OR: [...(body.studentIds.length ? [{ id: { in: body.studentIds } }] : []), ...(body.classArmIds.length ? [{ classArmId: { in: body.classArmIds } }] : [])] },
        select: { id: true, houseId: true },
      });
      if (!students.length) throw new BadRequestException('No active students were found');
      for (const s of students) {
        if (s.houseId === body.houseId) unchanged++;
        else moves.set(s.id, body.houseId);
      }
    } else {
      const targets = body.houseIds.length ? houses.filter((h) => body.houseIds.includes(h.id)) : houses;
      if (targets.length < 2) throw new BadRequestException('Choose at least two houses to share students between');
      const students = await db.student.findMany({
        where: { status: 'ACTIVE', ...(body.classArmIds.length ? { classArmId: { in: body.classArmIds } } : {}) },
        select: { id: true, houseId: true, gender: true, classArmId: true },
      });
      if (!students.length) throw new BadRequestException('No active students were found in those classes');
      const targetIds = new Set(targets.map((t) => t.id));
      // Counts per house, overall and within each class + sex group, starting from who stays put.
      const total = new Map(targets.map((t) => [t.id, 0]));
      const group = new Map<string, Map<string, number>>();
      const key = (s: { classArmId: string | null; gender: string }) => `${s.classArmId ?? '-'}|${s.gender}`;
      const stays = body.onlyUnassigned ? students.filter((s) => s.houseId && targetIds.has(s.houseId)) : [];
      const toPlace = body.onlyUnassigned ? students.filter((s) => !s.houseId) : students;
      unchanged = students.length - toPlace.length;
      for (const s of stays) {
        total.set(s.houseId!, (total.get(s.houseId!) ?? 0) + 1);
        const g = group.get(key(s)) ?? new Map<string, number>();
        g.set(s.houseId!, (g.get(s.houseId!) ?? 0) + 1);
        group.set(key(s), g);
      }
      // Whole school when every class is included: count members from elsewhere too.
      if (body.onlyUnassigned && !body.classArmIds.length) {
        for (const t of targets) total.set(t.id, beforeCount.get(t.id) ?? 0);
      }
      const groups = new Map<string, typeof toPlace>();
      for (const s of toPlace) groups.set(key(s), [...(groups.get(key(s)) ?? []), s]);
      for (const [k, list] of groups) {
        const g = group.get(k) ?? new Map<string, number>();
        for (const s of shuffle(list)) {
          const order = shuffle(targets).sort((a, b) => (g.get(a.id) ?? 0) - (g.get(b.id) ?? 0) || (total.get(a.id) ?? 0) - (total.get(b.id) ?? 0));
          const pick = order[0]!.id;
          g.set(pick, (g.get(pick) ?? 0) + 1);
          total.set(pick, (total.get(pick) ?? 0) + 1);
          if (s.houseId === pick) unchanged++;
          else moves.set(s.id, pick);
        }
        group.set(k, g);
      }
    }

    // Apply house by house.
    const byTarget = new Map<string | null, string[]>();
    for (const [sid, hid] of moves) byTarget.set(hid, [...(byTarget.get(hid) ?? []), sid]);
    await db.$transaction([...byTarget].map(([hid, ids]) => db.student.updateMany({ where: { id: { in: ids } }, data: { houseId: hid } })), { timeout: 60_000 });

    const after = await db.student.groupBy({ by: ['houseId'], where: { status: 'ACTIVE', houseId: { not: null } }, _count: { _all: true } });
    const afterCount = new Map(after.map((a) => [a.houseId!, a._count._all]));
    const result: HouseAllocateResult = {
      assigned: moves.size,
      unchanged,
      byHouse: houses.map((h) => ({ house: houseRef(h), added: (byTarget.get(h.id) ?? []).length, members: afterCount.get(h.id) ?? 0 })),
    };
    const what =
      body.mode === 'SET'
        ? `${body.houseId ? `Put ${moves.size} student(s) in ${byId.get(body.houseId)!.name}` : `Took ${moves.size} student(s) out of their houses`}`
        : `Shared ${moves.size} student(s) across ${(body.houseIds.length || houses.length)} houses (balanced by class and sex)`;
    await this.audit.log({ action: 'houses.allocated', entityType: 'House', summary: what, metadata: { byHouse: result.byHouse.map((b) => ({ house: b.house.name, added: b.added })) } });
    return result;
  }

  // ---------------------------------------------------------- one student

  @Get('students/:id')
  @RequirePermissions('school.read')
  async studentHouse(@Param('id') id: string): Promise<StudentHouseView> {
    const db = this.prisma.db;
    const s = await db.student.findUnique({ where: { id }, select: { house: true } });
    if (!s) throw new NotFoundException('Student not found');
    const houses = await db.house.findMany({ orderBy: { name: 'asc' } });
    return { house: s.house ? { ...houseRef(s.house), motto: s.house.motto } : null, houses: houses.map(houseRef), canChange: this.houses.canManage() };
  }

  @Put('students/:id')
  @RequirePermissions('school.read')
  async setStudentHouse(@Param('id') id: string, @Body(new ZodPipe(studentHouseSchema)) body: { houseId: string | null }): Promise<StudentHouseView> {
    this.mustManage();
    const db = this.prisma.db;
    const s = await db.student.findUnique({ where: { id }, select: { firstName: true, lastName: true, house: { select: { name: true } } } });
    if (!s) throw new NotFoundException('Student not found');
    const h = body.houseId ? await db.house.findUnique({ where: { id: body.houseId } }) : null;
    if (body.houseId && !h) throw new NotFoundException('House not found');
    await db.student.update({ where: { id }, data: { houseId: body.houseId } });
    await this.audit.log({
      action: 'houses.student_moved',
      entityType: 'Student',
      entityId: id,
      summary: h ? `Put ${s.firstName} ${s.lastName} in ${h.name}${s.house ? ` (was ${s.house.name})` : ''}` : `Took ${s.firstName} ${s.lastName} out of ${s.house?.name ?? 'their house'}`,
    });
    return this.studentHouse(id);
  }

  // ---------------------------------------------------------- one house

  @Get(':id')
  @RequirePermissions('school.read')
  async detail(@Param('id') id: string, @Query(new ZodPipe(houseStandingsQuerySchema)) q: StandingsQuery): Promise<HouseDetail> {
    const db = this.prisma.db;
    const h = await db.house.findUnique({ where: { id } });
    if (!h) throw new NotFoundException('House not found');
    const [members, counts, s] = await Promise.all([
      db.student.findMany({
        where: { houseId: id, status: 'ACTIVE' },
        select: { id: true, firstName: true, lastName: true, admissionNumber: true, gender: true, classArm: { select: { name: true, classLevel: { select: { name: true, order: true } } } } },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
      db.student.groupBy({ by: ['houseId', 'gender'], where: { status: 'ACTIVE', houseId: id }, _count: { _all: true } }),
      this.houses.standings(await this.houses.period(q.period, q.from, q.to), { recent: 50, contributors: 10, houseId: id }),
    ]);
    members.sort((a, b) => (a.classArm?.classLevel.order ?? 999) - (b.classArm?.classLevel.order ?? 999) || (armLabel(a.classArm) ?? '').localeCompare(armLabel(b.classArm) ?? '') || a.lastName.localeCompare(b.lastName));
    return {
      house: (await this.rows([h], counts))[0]!,
      members: members.map((m) => ({ id: m.id, name: `${m.firstName} ${m.lastName}`, admissionNumber: m.admissionNumber, gender: m.gender, className: armLabel(m.classArm) })),
      history: s.recent,
      topContributors: s.topContributors,
    };
  }

  // ---------------------------------------------------------- helpers

  private async rows(houses: { id: string; name: string; colour: string; motto: string | null; masterStaffId: string | null }[], counts: { houseId: string | null; gender: string; _count: { _all: number } }[]): Promise<HouseRow[]> {
    const masterIds = houses.map((h) => h.masterStaffId).filter((x): x is string => !!x);
    const masters = masterIds.length ? await this.prisma.db.staff.findMany({ where: { id: { in: masterIds } }, select: { id: true, firstName: true, lastName: true } }) : [];
    const mById = new Map(masters.map((m) => [m.id, `${m.firstName} ${m.lastName}`]));
    return houses.map((h) => {
      const mine = counts.filter((c) => c.houseId === h.id);
      const boys = mine.find((c) => c.gender === 'MALE')?._count._all ?? 0;
      const girls = mine.find((c) => c.gender === 'FEMALE')?._count._all ?? 0;
      return {
        ...houseRef(h),
        motto: h.motto,
        master: h.masterStaffId && mById.has(h.masterStaffId) ? { id: h.masterStaffId, name: mById.get(h.masterStaffId)! } : null,
        members: boys + girls,
        boys,
        girls,
      };
    });
  }

  private async checkMaster(staffId: string | null | undefined) {
    if (staffId && !(await this.prisma.db.staff.findUnique({ where: { id: staffId }, select: { id: true } }))) throw new NotFoundException('Staff member not found');
  }

  private async uniqueName(name: string) {
    if (await this.prisma.db.house.findFirst({ where: { name: { equals: name, mode: 'insensitive' } }, select: { id: true } })) throw new ConflictException(`There is already a house called ${name}`);
  }
}
