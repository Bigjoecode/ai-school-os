import {
  DEFAULT_BELL_SCHEDULE,
  canStartDouble,
  lessonPeriods,
  type BellSchedule,
  type SolverReport,
} from '@aischool/shared';
import type { Prisma, PrismaClient } from '../generated/prisma/client';
import { solve, type SolverLesson, type SolverPlacement } from './solver';

type Db = Pick<
  PrismaClient,
  'tenant' | 'classSubject' | 'room' | 'staffUnavailability' | 'timetableEntry' | 'timetable' | '$transaction'
>;

export async function bellScheduleFor(db: Pick<PrismaClient, 'tenant'>, tenantId: string): Promise<BellSchedule> {
  const t = await db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { bellSchedule: true } });
  return (t.bellSchedule as BellSchedule | null) ?? DEFAULT_BELL_SCHEDULE;
}

/**
 * Solves a timetable from the school's current setup and writes the result,
 * keeping any locked entries exactly where they are. Takes an explicit
 * tenantId (every query filters on it) so the demo seed can use it outside a
 * request.
 */
export async function buildTimetable(db: Db, tenantId: string, timetableId: string, seed?: number): Promise<SolverReport> {
  const timetable = await db.timetable.findFirstOrThrow({ where: { id: timetableId, tenantId } });
  const bell = timetable.bellSchedule as unknown as BellSchedule;
  const periods = lessonPeriods(bell);

  const [loads, rooms, unavailable, locked] = await Promise.all([
    db.classSubject.findMany({
      where: { tenantId, periodsPerWeek: { gt: 0 } },
      include: {
        classArm: { select: { name: true, classLevel: { select: { name: true } } } },
        subject: { select: { name: true, isCore: true } },
        teacher: { select: { firstName: true, lastName: true, status: true } },
      },
    }),
    db.room.findMany({ where: { tenantId, isActive: true }, select: { id: true, kind: true } }),
    db.staffUnavailability.findMany({ where: { tenantId } }),
    db.timetableEntry.findMany({ where: { tenantId, timetableId, locked: true } }),
  ]);

  const lessons: SolverLesson[] = loads.map((l) => {
    const teacher = l.teacher && l.teacher.status !== 'EXITED' ? l.teacher : null;
    return {
      key: l.id,
      classArmId: l.classArmId,
      subjectId: l.subjectId,
      teacherId: teacher ? l.teacherId : null,
      periodsPerWeek: l.periodsPerWeek,
      roomKind: l.roomKind,
      double: l.doublePeriod,
      isCore: l.subject.isCore,
      labels: {
        classArm: `${l.classArm.classLevel.name} ${l.classArm.name}`,
        subject: l.subject.name,
        teacher: teacher ? `${teacher.firstName} ${teacher.lastName}` : null,
      },
    };
  });

  const unavailableMap = new Map<string, Set<string>>();
  for (const u of unavailable) {
    const set = unavailableMap.get(u.staffId) ?? new Set<string>();
    set.add(`${u.day}:${u.period}`);
    unavailableMap.set(u.staffId, set);
  }

  // Locked entries only survive if they still fit the current day shape.
  const keep: SolverPlacement[] = locked
    .filter((e) => bell.days.includes(e.day) && periods.includes(e.period))
    .map((e) => ({
      classArmId: e.classArmId,
      subjectId: e.subjectId,
      teacherId: e.teacherId,
      roomId: e.roomId,
      day: e.day,
      period: e.period,
      doubleGroup: e.doubleGroup,
      locked: true,
    }));

  const result = await solve({
    days: bell.days,
    lessonPeriods: periods,
    doubleStarts: periods.filter((p) => canStartDouble(bell, p)),
    lessons,
    rooms,
    unavailable: unavailableMap,
    locked: keep,
    seed,
  });

  const report: SolverReport = {
    required: result.required,
    placed: result.placed,
    unplaced: result.unplaced.map((u) => ({
      classArm: u.lesson.labels.classArm,
      subject: u.lesson.labels.subject,
      teacher: u.lesson.labels.teacher,
      missing: u.missing,
      reason: u.reason,
    })),
    quality: result.quality,
    warnings: [
      ...result.warnings,
      ...(locked.length > keep.length ? [`${locked.length - keep.length} locked lessons no longer fit the bell schedule and were released.`] : []),
    ],
    durationMs: result.durationMs,
  };

  await db.$transaction([
    db.timetableEntry.deleteMany({ where: { tenantId, timetableId } }),
    db.timetableEntry.createMany({
      data: result.placements.map((p) => ({ ...p, tenantId, timetableId })),
    }),
    db.timetable.update({
      where: { id: timetableId },
      data: { report: report as unknown as Prisma.InputJsonValue },
    }),
  ]);
  return report;
}
