import { Controller, ForbiddenException, Get, NotFoundException, Param } from '@nestjs/common';
import { DAY_NAMES, DEFAULT_BELL_SCHEDULE, gameStageOf, type BellSchedule, type ClassLesson, type ClassTimetable } from '@aischool/shared';
import { currentContext, currentTenantId } from '../common/request-context';
import { schoolNow } from '../common/school-time';
import { FeatureService } from '../features/features.service';
import { PrismaService } from '../prisma/prisma.service';
import { bellScheduleFor } from './timetable-builder';

type Viewer = { role: 'PARENT' | 'STUDENT'; childIds: Set<string> };

/** "Mr Okafor" / "Ms Bello": families see a title and surname, never a teacher's full name. */
export function teacherDisplayName(t: { gender: string; lastName: string } | null): string | null {
  if (!t) return null;
  const title = t.gender === 'MALE' ? 'Mr' : t.gender === 'FEMALE' ? 'Ms' : 'Teacher';
  return `${title} ${t.lastName}`.trim();
}

/**
 * The class timetable for families: a student sees their own class's week, a
 * parent sees each linked child's. Read-only, and only the current term's
 * PUBLISHED timetable (drafts and archived versions are never shown).
 *
 * Not behind @RequireFeature('timetable'): the plan feature pays for the
 * timetable generator and editor. A school that has published a timetable
 * (for example before a downgrade) can still show it to families. Only a
 * console master switch or an explicit per-school override turns this off.
 * Parents go through the server-side NDPA consent gate like every other
 * child-data route.
 */
@Controller('portal')
export class FamilyTimetableController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly features: FeatureService,
  ) {}

  @Get('students/:id/timetable')
  async timetable(@Param('id') id: string): Promise<ClassTimetable> {
    const v = await this.viewer();
    if (!v.childIds.has(id)) throw new ForbiddenException(v.role === 'PARENT' ? 'You can only see your own children' : 'You can only see your own records');
    await this.assertNotSwitchedOff();

    const db = this.prisma.db;
    const tenant = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: currentTenantId() }, select: { timezone: true } });
    const now = schoolNow(tenant.timezone);
    const student = await db.student.findUnique({
      where: { id },
      select: { id: true, firstName: true, classArmId: true, classArm: { select: { name: true, classLevel: { select: { name: true, stage: true } } } } },
    });
    if (!student) throw new NotFoundException('Student not found');
    const className = student.classArm ? `${student.classArm.classLevel.name} ${student.classArm.name}`.trim() : null;
    const young = gameStageOf(student.classArm?.classLevel.stage, student.classArm?.classLevel.name).young;

    const term = (await db.term.findFirst({ where: { isCurrent: true }, include: { session: { select: { name: true } } } }))
      ?? (await db.term.findFirst({ orderBy: { startsOn: 'desc' }, include: { session: { select: { name: true } } } }));
    const timetable = term && student.classArmId
      ? await db.timetable.findFirst({ where: { termId: term.id, status: 'PUBLISHED' }, orderBy: { publishedAt: 'desc' } })
      : null;

    const bell: BellSchedule = (timetable?.bellSchedule as unknown as BellSchedule | undefined)
      ?? (await bellScheduleFor(this.prisma.root, currentTenantId()).catch(() => null))
      ?? DEFAULT_BELL_SCHEDULE;

    const entries = timetable && student.classArmId
      ? await db.timetableEntry.findMany({
          where: { timetableId: timetable.id, classArmId: student.classArmId },
          select: {
            day: true,
            period: true,
            doubleGroup: true,
            subject: { select: { name: true, code: true } },
            teacher: { select: { gender: true, lastName: true } },
            room: { select: { name: true } },
          },
          orderBy: [{ day: 'asc' }, { period: 'asc' }],
        })
      : [];

    const lessons: ClassLesson[] = entries
      .filter((e) => bell.periods[e.period])
      .map((e) => ({
        day: e.day,
        period: e.period,
        start: bell.periods[e.period]!.start,
        end: bell.periods[e.period]!.end,
        subject: e.subject,
        teacher: teacherDisplayName(e.teacher),
        room: e.room?.name ?? null,
        doubleGroup: e.doubleGroup,
      }));

    const schoolDay = bell.days.includes(now.weekday);
    const idx = schoolDay ? bell.periods.findIndex((p) => p.start <= now.time && now.time < p.end) : -1;
    const todays = lessons.filter((l) => l.day === now.weekday);
    const current = idx >= 0 ? todays.find((l) => l.period === idx) ?? null : null;
    const next = todays.find((l) => l.start > now.time && (!current?.doubleGroup || l.doubleGroup !== current.doubleGroup)) ?? null;

    return {
      student: { id: student.id, firstName: student.firstName },
      className,
      young,
      timetable: timetable && term ? { name: timetable.name, termName: term.name, sessionName: term.session.name, publishedAt: timetable.publishedAt?.toISOString() ?? null } : null,
      emptyReason: !student.classArmId ? 'NO_CLASS' : !timetable ? 'NOT_PUBLISHED' : lessons.length === 0 ? 'NO_LESSONS' : null,
      bellSchedule: bell,
      lessons,
      today: {
        date: now.date,
        day: now.weekday,
        dayName: DAY_NAMES[now.weekday] ?? '',
        time: now.time,
        schoolDay,
        currentPeriod: idx >= 0 ? idx : null,
        now: current,
        next,
      },
    };
  }

  /** Viewing follows the timetable module unless the platform or an override has switched it off (a plan without the generator still shows what was published). */
  private async assertNotSwitchedOff() {
    const state = (await this.features.states(currentTenantId())).find((s) => s.key === 'timetable');
    if (state && !state.enabled && (state.source === 'MASTER_OFF' || state.source === 'OVERRIDE')) {
      throw new ForbiddenException({ statusCode: 403, code: 'FEATURE_OFF', feature: 'timetable', message: 'Class timetables are switched off for this school.' });
    }
  }

  /** Same rule as the rest of the portal: parents see linked active children, students themselves. */
  private async viewer(): Promise<Viewer> {
    const ctx = currentContext();
    const db = this.prisma.db;
    if (ctx.permissions.has('family.manage')) {
      const links = await db.studentGuardian.findMany({ where: { guardian: { userId: ctx.userId }, student: { status: 'ACTIVE' } }, select: { studentId: true } });
      return { role: 'PARENT', childIds: new Set(links.map((l) => l.studentId)) };
    }
    if (ctx.permissions.has('learning.use')) {
      const me = await db.student.findFirst({ where: { userId: ctx.userId, status: 'ACTIVE' }, select: { id: true } });
      if (me) return { role: 'STUDENT', childIds: new Set([me.id]) };
    }
    throw new ForbiddenException('The portal is for parents and students');
  }
}
