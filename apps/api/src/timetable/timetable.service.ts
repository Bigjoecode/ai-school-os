import { BadRequestException, ConflictException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  DAY_NAMES,
  DEFAULT_BELL_SCHEDULE,
  aiInterpretationSchema,
  canStartDouble,
  lessonPeriods,
  timetableChangeSchema,
  type BellSchedule,
  type InterpretResult,
  type MoveConflict,
  type MoveEntryInput,
  type SolverReport,
  type TimetableChange,
  type TimetableDetail,
  type TimetableEntryView,
  type TimetableSetup,
  type TimetableSummary,
  type TodaySchedule,
} from '@aischool/shared';
import type { Prisma } from '../generated/prisma/client';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { GenerationQueue } from '../ai/generation-queue';
import { AuditService } from '../audit/audit.service';
import { fullName } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { explainPrompt, interpretPrompt } from './prompts';
import { bellScheduleFor, buildTimetable } from './timetable-builder';

const entryInclude = {
  classArm: { select: { id: true, name: true, classLevel: { select: { name: true } } } },
  subject: { select: { id: true, name: true, code: true } },
  teacher: { select: { id: true, firstName: true, lastName: true } },
  room: { select: { id: true, name: true, kind: true } },
} satisfies Prisma.TimetableEntryInclude;
type EntryRow = Prisma.TimetableEntryGetPayload<{ include: typeof entryInclude }>;

const timetableInclude = {
  term: { select: { id: true, name: true, session: { select: { name: true } } } },
  _count: { select: { entries: true } },
} satisfies Prisma.TimetableInclude;
type TimetableRow = Prisma.TimetableGetPayload<{ include: typeof timetableInclude }>;

@Injectable()
export class TimetableService implements OnModuleInit {
  private readonly logger = new Logger(TimetableService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: GenerationQueue,
    private readonly gateway: AiGatewayService,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit() {
    const { count } = await this.prisma.root.timetable.updateMany({
      where: { generation: { in: ['QUEUED', 'RUNNING'] } },
      data: { generation: 'FAILED', generationError: 'Interrupted by a server restart. Please try again.' },
    });
    if (count) this.logger.warn(`Marked ${count} interrupted timetable build(s) as failed`);
  }

  // ---------------------------------------------------------- setup

  bell(): Promise<BellSchedule> {
    return bellScheduleFor(this.prisma.root, currentTenantId());
  }

  async setup(): Promise<TimetableSetup> {
    const db = this.prisma.db;
    const [bell, rooms, levels, subjects, staff, loads] = await Promise.all([
      this.bell(),
      db.room.findMany({ orderBy: [{ kind: 'asc' }, { name: 'asc' }] }),
      db.classLevel.findMany({ orderBy: { order: 'asc' }, include: { arms: { orderBy: { name: 'asc' } } } }),
      db.subject.findMany({ orderBy: [{ isCore: 'desc' }, { name: 'asc' }] }),
      db.staff.findMany({
        where: { type: 'TEACHING', status: { not: 'EXITED' } },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        include: { unavailability: true },
      }),
      db.classSubject.findMany(),
    ]);
    const assigned = new Map<string, number>();
    for (const l of loads) if (l.teacherId) assigned.set(l.teacherId, (assigned.get(l.teacherId) ?? 0) + l.periodsPerWeek);
    return {
      bellSchedule: bell,
      rooms: rooms.map((r) => ({ id: r.id, name: r.name, kind: r.kind as TimetableSetup['rooms'][number]['kind'], capacity: r.capacity, isActive: r.isActive })),
      levels: levels.map((l) => ({ id: l.id, name: l.name, code: l.code, arms: l.arms.map((a) => ({ id: a.id, name: a.name })) })),
      subjects: subjects.map((s) => ({ id: s.id, name: s.name, code: s.code, isCore: s.isCore })),
      teachers: staff.map((s) => ({
        id: s.id,
        name: fullName(s),
        jobTitle: s.jobTitle,
        periodsAssigned: assigned.get(s.id) ?? 0,
        unavailable: s.unavailability.map((u) => ({ day: u.day, period: u.period })),
      })),
      loads: loads.map((l) => ({
        classArmId: l.classArmId,
        subjectId: l.subjectId,
        teacherId: l.teacherId,
        periodsPerWeek: l.periodsPerWeek,
        roomKind: l.roomKind as TimetableSetup['loads'][number]['roomKind'],
        doublePeriod: l.doublePeriod,
      })),
      slotsPerWeek: bell.days.length * lessonPeriods(bell).length,
    };
  }

  // ---------------------------------------------------------- generation

  async generate(termId: string, name?: string): Promise<TimetableSummary> {
    const term = await this.prisma.db.term.findUniqueOrThrow({ where: { id: termId }, include: { session: true } });
    const loads = await this.prisma.db.classSubject.count({ where: { periodsPerWeek: { gt: 0 } } });
    if (!loads) {
      throw new BadRequestException('Set weekly periods for class subjects in Timetable setup before generating');
    }
    const timetable = await this.prisma.db.timetable.create({
      data: {
        tenantId: currentTenantId(),
        termId: term.id,
        name: name || `${term.name} ${term.session.name}`,
        bellSchedule: (await this.bell()) as unknown as Prisma.InputJsonValue,
        generation: 'QUEUED',
        createdById: currentContext().userId,
      },
      include: timetableInclude,
    });
    this.queueBuild(timetable.id);
    await this.audit.log({ action: 'timetable.generated', entityType: 'Timetable', entityId: timetable.id, summary: `Started building timetable ${timetable.name}` });
    return summary(timetable);
  }

  /** Rebuilds around locked lessons, with the current bell schedule and setup. */
  async regenerate(id: string): Promise<TimetableSummary> {
    const t = await this.prisma.db.timetable.findUniqueOrThrow({ where: { id } });
    if (t.generation === 'QUEUED' || t.generation === 'RUNNING') throw new BadRequestException('This timetable is already being built');
    if (t.status === 'ARCHIVED') throw new BadRequestException('Archived timetables are read-only');
    const updated = await this.prisma.db.timetable.update({
      where: { id },
      data: {
        generation: 'QUEUED',
        generationError: null,
        bellSchedule: (await this.bell()) as unknown as Prisma.InputJsonValue,
      },
      include: timetableInclude,
    });
    this.queueBuild(id);
    return summary(updated);
  }

  private queueBuild(id: string) {
    const tenantId = currentTenantId();
    this.queue.enqueue(`timetable ${id}`, async () => {
      await this.prisma.root.timetable.update({ where: { id }, data: { generation: 'RUNNING' } });
      try {
        const report = await buildTimetable(this.prisma.root, tenantId, id);
        await this.prisma.root.timetable.update({ where: { id }, data: { generation: 'DONE' } });
        await this.audit.log({
          action: 'timetable.built',
          entityType: 'Timetable',
          entityId: id,
          summary: `Timetable built: ${report.placed} of ${report.required} lessons placed${report.unplaced.length ? `, ${report.unplaced.reduce((n, u) => n + u.missing, 0)} could not be placed` : ''}`,
        });
      } catch (err) {
        await this.prisma.root.timetable
          .update({ where: { id }, data: { generation: 'FAILED', generationError: (err as Error).message.slice(0, 500) } })
          .catch(() => undefined);
        throw err;
      }
    });
  }

  // ---------------------------------------------------------- reading

  async list(termId?: string): Promise<TimetableSummary[]> {
    const rows = await this.prisma.db.timetable.findMany({
      where: termId ? { termId } : {},
      include: timetableInclude,
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    });
    return rows.map(summary);
  }

  async detail(id: string): Promise<TimetableDetail> {
    const t = await this.prisma.db.timetable.findUniqueOrThrow({
      where: { id },
      include: { ...timetableInclude, entries: { include: entryInclude, orderBy: [{ day: 'asc' }, { period: 'asc' }] } },
    });
    return {
      ...summary(t),
      bellSchedule: t.bellSchedule as unknown as BellSchedule,
      entries: t.entries.map(entryView),
    };
  }

  // ---------------------------------------------------------- editing

  /**
   * Moves a lesson (both halves of a double together) after checking every
   * clash. A lesson moved by hand is locked so rebuilding keeps it.
   */
  async moveEntry(timetableId: string, entryId: string, body: MoveEntryInput): Promise<TimetableDetail> {
    const db = this.prisma.db;
    const t = await db.timetable.findUniqueOrThrow({ where: { id: timetableId } });
    if (t.status === 'ARCHIVED') throw new BadRequestException('Archived timetables are read-only');
    if (t.generation === 'QUEUED' || t.generation === 'RUNNING') throw new BadRequestException('Wait for the timetable to finish building');
    const bell = t.bellSchedule as unknown as BellSchedule;
    const periods = lessonPeriods(bell);

    const entry = await db.timetableEntry.findFirstOrThrow({ where: { id: entryId, timetableId } });
    const group = entry.doubleGroup
      ? await db.timetableEntry.findMany({ where: { timetableId, doubleGroup: entry.doubleGroup }, orderBy: { period: 'asc' } })
      : [entry];

    const conflicts: MoveConflict[] = [];
    if (!bell.days.includes(body.day)) conflicts.push({ kind: 'not_lesson', message: `${DAY_NAMES[body.day]} isn't a school day` });
    const targetPeriods = group.length === 2 ? [body.period, periods[periods.indexOf(body.period) + 1]] : [body.period];
    if (!periods.includes(body.period) || (group.length === 2 && !canStartDouble(bell, body.period))) {
      conflicts.push({
        kind: 'not_lesson',
        message: group.length === 2 ? 'A double needs two lesson periods in a row with no break between' : "That period isn't a lesson period",
      });
    }

    const roomId = body.roomId === undefined ? entry.roomId : body.roomId;
    if (!conflicts.length) {
      const ids = group.map((g) => g.id);
      const clashes = await db.timetableEntry.findMany({
        where: {
          timetableId,
          id: { notIn: ids },
          day: body.day,
          period: { in: targetPeriods as number[] },
          OR: [
            { classArmId: entry.classArmId },
            ...(entry.teacherId ? [{ teacherId: entry.teacherId }] : []),
            ...(roomId ? [{ roomId }] : []),
          ],
        },
        include: entryInclude,
      });
      for (const c of clashes) {
        const label = `${c.subject.name} for ${c.classArm.classLevel.name} ${c.classArm.name}`;
        if (c.classArmId === entry.classArmId) conflicts.push({ kind: 'class', message: `The class already has ${c.subject.name} then` });
        else if (entry.teacherId && c.teacherId === entry.teacherId) conflicts.push({ kind: 'teacher', message: `The teacher is teaching ${label} then` });
        else if (roomId && c.roomId === roomId) conflicts.push({ kind: 'room', message: `${c.room?.name ?? 'The room'} is used by ${label} then` });
      }
      if (entry.teacherId) {
        const off = await db.staffUnavailability.count({
          where: { staffId: entry.teacherId, day: body.day, period: { in: targetPeriods as number[] } },
        });
        if (off) conflicts.push({ kind: 'unavailable', message: "The teacher isn't available then" });
      }
      const load = await db.classSubject.findUnique({
        where: { classArmId_subjectId: { classArmId: entry.classArmId, subjectId: entry.subjectId } },
      });
      if (load?.roomKind) {
        const room = roomId ? await db.room.findUnique({ where: { id: roomId } }) : null;
        if (!room || room.kind !== load.roomKind) conflicts.push({ kind: 'room_kind', message: `This lesson needs a ${load.roomKind} room` });
      }
    }
    if (conflicts.length) {
      throw new ConflictException({ statusCode: 409, message: conflicts[0]!.message, conflicts });
    }

    const locked = body.locked ?? true;
    await db.$transaction(
      group.map((g, i) =>
        db.timetableEntry.update({
          where: { id: g.id },
          data: { day: body.day, period: targetPeriods[i]!, roomId, locked },
        }),
      ),
    );
    return this.detail(timetableId);
  }

  async setLocked(timetableId: string, entryId: string, locked: boolean): Promise<TimetableDetail> {
    const entry = await this.prisma.db.timetableEntry.findFirstOrThrow({ where: { id: entryId, timetableId } });
    await this.prisma.db.timetableEntry.updateMany({
      where: entry.doubleGroup ? { timetableId, doubleGroup: entry.doubleGroup } : { id: entry.id },
      data: { locked },
    });
    return this.detail(timetableId);
  }

  async publish(id: string): Promise<TimetableDetail> {
    const t = await this.prisma.db.timetable.findUniqueOrThrow({ where: { id } });
    if (t.generation !== 'DONE') throw new BadRequestException('Build the timetable before publishing it');
    await this.prisma.db.$transaction([
      this.prisma.db.timetable.updateMany({ where: { termId: t.termId, status: 'PUBLISHED', id: { not: id } }, data: { status: 'ARCHIVED' } }),
      this.prisma.db.timetable.update({ where: { id }, data: { status: 'PUBLISHED', publishedAt: new Date() } }),
    ]);
    await this.audit.log({ action: 'timetable.published', entityType: 'Timetable', entityId: id, summary: `Published timetable ${t.name}` });
    return this.detail(id);
  }

  // ---------------------------------------------------------- today

  /** Today in the school's time zone, from the current term's published timetable. */
  async today(): Promise<TodaySchedule> {
    const tenant = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: currentTenantId() }, select: { timezone: true } });
    const now = new Date();
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-GB', { timeZone: tenant.timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit' })
        .formatToParts(now)
        .map((p) => [p.type, p.value]),
    );
    const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday!) + 1;
    const hhmm = `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`;
    const date = `${parts.year}-${parts.month}-${parts.day}`;

    const term = await this.prisma.db.term.findFirst({ where: { isCurrent: true } });
    const timetable = term
      ? await this.prisma.db.timetable.findFirst({ where: { termId: term.id, status: 'PUBLISHED' } })
      : null;
    const bell = (timetable?.bellSchedule as unknown as BellSchedule | undefined) ?? (await this.bell()) ?? DEFAULT_BELL_SCHEDULE;
    const currentPeriod = bell.days.includes(day) ? bell.periods.findIndex((p) => p.start <= hhmm && hhmm < p.end) : -1;

    let myLessons: TodaySchedule['myLessons'] = [];
    let lessonsNow = 0;
    if (timetable && bell.days.includes(day)) {
      const staff = await this.prisma.db.staff.findFirst({ where: { userId: currentContext().userId }, select: { id: true } });
      const [mine, now] = await Promise.all([
        staff
          ? this.prisma.db.timetableEntry.findMany({
              where: { timetableId: timetable.id, day, teacherId: staff.id },
              include: entryInclude,
              orderBy: { period: 'asc' },
            })
          : [],
        currentPeriod >= 0 ? this.prisma.db.timetableEntry.count({ where: { timetableId: timetable.id, day, period: currentPeriod } }) : 0,
      ]);
      lessonsNow = now;
      // A double is one lesson on the day's list: first half's start to second half's end.
      for (const e of mine) {
        const p = bell.periods[e.period]!;
        const prev = myLessons[myLessons.length - 1];
        if (e.doubleGroup && prev?.doubleGroup === e.doubleGroup) {
          prev.end = p.end;
          prev.label = `${prev.label} – ${p.label}`;
          continue;
        }
        myLessons.push({ ...entryView(e), start: p.start, end: p.end, label: p.label });
      }
    }

    return {
      date,
      day,
      dayName: DAY_NAMES[day] ?? '',
      timetable: timetable ? { id: timetable.id, name: timetable.name } : null,
      currentPeriod: currentPeriod >= 0 ? currentPeriod : null,
      bellSchedule: bell,
      myLessons,
      lessonsNow,
    };
  }

  // ---------------------------------------------------------- AI

  async explain(id: string): Promise<{ text: string; provider: string; model: string }> {
    const t = await this.prisma.db.timetable.findUniqueOrThrow({ where: { id } });
    const report = t.report as unknown as SolverReport | null;
    if (!report) throw new BadRequestException('Build the timetable first');
    const tenant = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: currentTenantId() }, select: { name: true } });

    const loads = await this.prisma.db.classSubject.findMany({
      where: { periodsPerWeek: { gt: 0 }, teacherId: { not: null } },
      include: { teacher: true },
    });
    const byTeacher = new Map<string, { name: string; n: number }>();
    for (const l of loads) {
      const t2 = byTeacher.get(l.teacherId!) ?? { name: fullName(l.teacher!), n: 0 };
      t2.n += l.periodsPerWeek;
      byTeacher.set(l.teacherId!, t2);
    }
    const bell = t.bellSchedule as unknown as BellSchedule;
    const slots = bell.days.length * lessonPeriods(bell).length;
    const busiest = [...byTeacher.values()].sort((a, b) => b.n - a.n).slice(0, 6);

    const data = [
      `Timetable "${t.name}". ${report.placed} of ${report.required} lesson periods placed. Week has ${slots} lesson periods per class.`,
      report.unplaced.length
        ? `Could not place:\n${report.unplaced.map((u) => `- ${u.subject} for ${u.classArm} (${u.missing} period${u.missing === 1 ? '' : 's'}; teacher ${u.teacher ?? 'none'}): ${u.reason}`).join('\n')}`
        : 'Every lesson was placed.',
      `Quality: ${report.quality.sameDayRepeats} same-day subject repeats, ${report.quality.lateCoreLessons} core lessons in the last two periods, ` +
        `${report.quality.teacherOverloadDays} teacher-days over six lessons, doubles ${report.quality.doublesPlaced}/${report.quality.doublesRequested}.`,
      report.warnings.length ? `Warnings:\n${report.warnings.map((w) => `- ${w}`).join('\n')}` : '',
      `Heaviest teacher loads (periods/week): ${busiest.map((b) => `${b.name} ${b.n}`).join(', ')}.`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const { system, user } = explainPrompt(tenant.name, data);
    const result = await this.gateway.generate({ tier: 'advanced', system, messages: [{ role: 'user', content: user }] }, 'timetable-explain');
    return { text: result.text, provider: result.provider, model: result.model };
  }

  /** Turns a plain-English request into proposed constraint changes (nothing is saved). */
  async interpret(text: string): Promise<InterpretResult> {
    const db = this.prisma.db;
    const [tenant, teachers, subjects, levels, bell] = await Promise.all([
      this.prisma.root.tenant.findUniqueOrThrow({ where: { id: currentTenantId() }, select: { name: true } }),
      db.staff.findMany({ where: { type: 'TEACHING', status: { not: 'EXITED' } } }),
      db.subject.findMany(),
      db.classLevel.findMany({ orderBy: { order: 'asc' } }),
      this.bell(),
    ]);
    const catalogue = [
      'Teachers (id | name | job):',
      ...teachers.map((t) => `${t.id} | ${fullName(t)} | ${t.jobTitle}`),
      'Subjects (id | name | code):',
      ...subjects.map((s) => `${s.id} | ${s.name} | ${s.code}`),
      'Class levels (id | name):',
      ...levels.map((l) => `${l.id} | ${l.name}`),
      `School days: ${bell.days.map((d) => `${d}=${DAY_NAMES[d]}`).join(', ')}.`,
      'Bell periods (index | label | time | kind):',
      ...bell.periods.map((p, i) => `${i} | ${p.label} | ${p.start}-${p.end} | ${p.kind}`),
      'Room kinds: CLASSROOM, LAB, ICT, HALL, LIBRARY, WORKSHOP, STUDIO, FIELD.',
    ].join('\n');

    const { system, user } = interpretPrompt(tenant.name, catalogue, text);
    const result = await this.gateway.generateJson(
      { tier: 'advanced', system, messages: [{ role: 'user', content: user }] },
      aiInterpretationSchema,
      'timetable-assistant',
    );

    // Keep only changes whose ids are really this school's.
    const ids = {
      staff: new Set(teachers.map((t) => t.id)),
      subject: new Set(subjects.map((s) => s.id)),
      level: new Set(levels.map((l) => l.id)),
    };
    const valid = result.data.changes.filter((c) => this.validChange(c, ids, bell));
    const dropped = result.data.changes.length - valid.length;
    return {
      changes: valid,
      notUnderstood: [result.data.notUnderstood, dropped ? `${dropped} suggested change(s) referred to unknown people or subjects and were left out.` : '']
        .filter(Boolean)
        .join(' '),
      provider: result.provider,
      model: result.model,
    };
  }

  /** Applies confirmed changes to the setup. Rebuild the timetable afterwards to use them. */
  async apply(changes: TimetableChange[]): Promise<{ applied: string[] }> {
    const db = this.prisma.db;
    const tenantId = currentTenantId();
    const bell = await this.bell();
    const [teachers, subjects, levels] = await Promise.all([
      db.staff.findMany({ select: { id: true } }),
      db.subject.findMany({ select: { id: true } }),
      db.classLevel.findMany({ select: { id: true } }),
    ]);
    const ids = { staff: new Set(teachers.map((t) => t.id)), subject: new Set(subjects.map((s) => s.id)), level: new Set(levels.map((l) => l.id)) };
    const applied: string[] = [];

    for (const raw of changes) {
      const c = timetableChangeSchema.parse(raw);
      if (!this.validChange(c, ids, bell)) throw new BadRequestException(`Can't apply: ${c.summary}`);
      if (c.kind === 'teacher_unavailable' || c.kind === 'teacher_available') {
        const days = c.days?.length ? c.days : bell.days;
        const periods = c.periods?.length ? c.periods : lessonPeriods(bell);
        if (c.kind === 'teacher_unavailable') {
          await db.staffUnavailability.createMany({
            data: days.flatMap((day) => periods.map((period) => ({ tenantId, staffId: c.staffId!, day, period }))),
            skipDuplicates: true,
          });
        } else {
          await db.staffUnavailability.deleteMany({ where: { staffId: c.staffId!, day: { in: days }, period: { in: periods } } });
        }
      } else {
        const where: Prisma.ClassSubjectWhereInput = {
          subjectId: c.subjectId!,
          ...(c.classLevelId ? { classArm: { classLevelId: c.classLevelId } } : {}),
        };
        const data =
          c.kind === 'set_periods'
            ? { periodsPerWeek: c.periodsPerWeek! }
            : c.kind === 'set_room_kind'
              ? { roomKind: c.roomKind }
              : { doublePeriod: c.doublePeriod! };
        await db.classSubject.updateMany({ where, data });
        // set_periods also adds the subject to classes of that level that don't have it yet.
        if (c.kind === 'set_periods' && c.classLevelId && c.periodsPerWeek! > 0) {
          const arms = await db.classArm.findMany({ where: { classLevelId: c.classLevelId }, select: { id: true } });
          await db.classSubject.createMany({
            data: arms.map((a) => ({ tenantId, classArmId: a.id, subjectId: c.subjectId!, periodsPerWeek: c.periodsPerWeek! })),
            skipDuplicates: true,
          });
        }
      }
      applied.push(c.summary);
    }
    await this.audit.log({ action: 'timetable.setup_changed', summary: `Timetable setup changed: ${applied.join('; ')}`.slice(0, 900) });
    return { applied };
  }

  private validChange(c: TimetableChange, ids: { staff: Set<string>; subject: Set<string>; level: Set<string> }, bell: BellSchedule) {
    switch (c.kind) {
      case 'teacher_unavailable':
      case 'teacher_available':
        return (
          !!c.staffId &&
          ids.staff.has(c.staffId) &&
          (c.days ?? []).every((d) => bell.days.includes(d)) &&
          (c.periods ?? []).every((p) => bell.periods[p]?.kind === 'LESSON')
        );
      case 'set_periods':
        return !!c.subjectId && ids.subject.has(c.subjectId) && (!c.classLevelId || ids.level.has(c.classLevelId)) && c.periodsPerWeek != null && c.periodsPerWeek >= 0 && c.periodsPerWeek <= 20;
      case 'set_room_kind':
        return !!c.subjectId && ids.subject.has(c.subjectId) && (!c.classLevelId || ids.level.has(c.classLevelId));
      case 'set_double':
        return !!c.subjectId && ids.subject.has(c.subjectId) && (!c.classLevelId || ids.level.has(c.classLevelId)) && c.doublePeriod != null;
    }
  }
}

function summary(t: TimetableRow): TimetableSummary {
  return {
    id: t.id,
    name: t.name,
    term: { id: t.term.id, name: t.term.name, sessionName: t.term.session.name },
    status: t.status,
    generation: t.generation,
    generationError: t.generationError,
    entryCount: t._count.entries,
    report: (t.report as unknown as SolverReport | null) ?? null,
    publishedAt: t.publishedAt?.toISOString() ?? null,
    updatedAt: t.updatedAt.toISOString(),
  };
}

function entryView(e: EntryRow): TimetableEntryView {
  return {
    id: e.id,
    day: e.day,
    period: e.period,
    classArm: { id: e.classArm.id, name: e.classArm.name, levelName: e.classArm.classLevel.name },
    subject: e.subject,
    teacher: e.teacher ? { id: e.teacher.id, name: fullName(e.teacher) } : null,
    room: e.room ? { id: e.room.id, name: e.room.name } : null,
    doubleGroup: e.doubleGroup,
    locked: e.locked,
  };
}
