import { Injectable } from '@nestjs/common';
import { CHRONIC_ABSENCE_THRESHOLD, attendanceRate, type Insight, type OverviewResponse } from '@aischool/shared';
import { dateOnly, fullName } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { schoolNow, weekdayOf } from '../common/school-time';
import { bellScheduleFor } from '../timetable/timetable-builder';
import { PrismaService } from '../prisma/prisma.service';

const NEARLY_FULL = 0.9;
const MONTHS = 12;

/**
 * A live picture of the school computed from its records. It powers the
 * Overview dashboard and is the grounding context handed to the School AI,
 * so the assistant answers from the same numbers people see on screen.
 */
@Injectable()
export class SchoolSnapshotService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(): Promise<OverviewResponse> {
    const db = this.prisma.db;
    const tenantId = currentTenantId();
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const trendStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (MONTHS - 1), 1));

    const [
      tenant,
      user,
      session,
      term,
      totalStudents,
      addedThisMonth,
      staffByType,
      guardians,
      studentsWithGuardian,
      unassigned,
      genderRows,
      levels,
      admittedBefore,
      admissionsByDay,
      activity,
    ] = await Promise.all([
      this.prisma.root.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true, motto: true } }),
      this.prisma.root.user.findUniqueOrThrow({ where: { id: currentContext().userId! }, select: { firstName: true } }),
      db.academicSession.findFirst({ where: { isCurrent: true } }),
      db.term.findFirst({ where: { isCurrent: true } }),
      db.student.count({ where: { status: 'ACTIVE' } }),
      db.student.count({ where: { status: 'ACTIVE', admittedOn: { gte: monthStart } } }),
      db.staff.groupBy({ by: ['type'], where: { status: { not: 'EXITED' } }, _count: { _all: true } }),
      db.guardian.count(),
      db.student.count({ where: { status: 'ACTIVE', guardians: { some: {} } } }),
      db.student.count({ where: { status: 'ACTIVE', classArmId: null } }),
      db.student.groupBy({ by: ['gender'], where: { status: 'ACTIVE' }, _count: { _all: true } }),
      db.classLevel.findMany({
        orderBy: { order: 'asc' },
        include: {
          arms: {
            include: {
              classTeacher: { select: { id: true } },
              _count: { select: { students: { where: { status: 'ACTIVE' } } } },
            },
          },
        },
      }),
      db.student.count({ where: { admittedOn: { lt: trendStart } } }),
      db.student.groupBy({ by: ['admittedOn'], where: { admittedOn: { gte: trendStart } }, _count: { _all: true } }),
      this.prisma.root.auditLog.findMany({
        where: { tenantId, action: { notIn: ['auth.login', 'auth.login_failed', 'auth.switch_school'] } },
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: { actor: { select: { firstName: true, lastName: true } } },
      }),
    ]);

    // --- classes
    const arms = levels.flatMap((l) => l.arms.map((a) => ({ ...a, levelName: l.name })));
    const assigned = arms.reduce((n, a) => n + a._count.students, 0);
    const withCapacity = arms.filter((a) => a.capacity);
    const capacity = withCapacity.reduce((n, a) => n + (a.capacity ?? 0), 0);
    const seatedInCapped = withCapacity.reduce((n, a) => n + a._count.students, 0);

    // --- enrolment trend (admissions per month + running total)
    const buckets = new Map<string, number>();
    for (const row of admissionsByDay) {
      const key = row.admittedOn.toISOString().slice(0, 7);
      buckets.set(key, (buckets.get(key) ?? 0) + row._count._all);
    }
    let running = admittedBefore;
    const enrolmentTrend = Array.from({ length: MONTHS }, (_, i) => {
      const d = new Date(Date.UTC(trendStart.getUTCFullYear(), trendStart.getUTCMonth() + i, 1));
      const key = d.toISOString().slice(0, 7);
      const admitted = buckets.get(key) ?? 0;
      running += admitted;
      return { month: key, admitted, total: running };
    });

    const teaching = staffByType.find((s) => s.type === 'TEACHING')?._count._all ?? 0;
    const staffTotal = staffByType.reduce((n, s) => n + s._count._all, 0);
    const base = totalStudents - addedThisMonth;

    const daysLeft = term ? Math.ceil((term.endsOn.getTime() - now.getTime()) / 86_400_000) : 0;
    const attendance = await this.attendance(term, arms.filter((a) => a._count.students > 0).length);

    return {
      greetingName: user.firstName,
      school: tenant,
      currentSession: session ? { id: session.id, name: session.name } : null,
      currentTerm: term
        ? { id: term.id, name: term.name, endsOn: dateOnly(term.endsOn)!, daysLeft: Math.max(0, daysLeft) }
        : null,
      kpis: {
        students: {
          total: totalStudents,
          addedThisMonth,
          changePct: base > 0 ? round1((addedThisMonth / base) * 100) : null,
        },
        staff: { total: staffTotal, teaching },
        guardians: {
          total: guardians,
          coveragePct: totalStudents ? round1((studentsWithGuardian / totalStudents) * 100) : 0,
        },
        classes: {
          arms: arms.length,
          levels: levels.length,
          avgClassSize: arms.length ? round1(assigned / arms.length) : 0,
          utilisationPct: capacity ? round1((seatedInCapped / capacity) * 100) : null,
        },
        attendance: attendance?.kpi ?? null,
      },
      enrolmentTrend,
      byClassLevel: levels.map((l) => ({
        level: l.name,
        students: l.arms.reduce((n, a) => n + a._count.students, 0),
        capacity: l.arms.every((a) => a.capacity) && l.arms.length
          ? l.arms.reduce((n, a) => n + (a.capacity ?? 0), 0)
          : null,
      })),
      gender: {
        male: genderRows.find((g) => g.gender === 'MALE')?._count._all ?? 0,
        female: genderRows.find((g) => g.gender === 'FEMALE')?._count._all ?? 0,
      },
      insights: this.insights({
        attendance,
        totalStudents,
        addedThisMonth,
        withoutGuardian: totalStudents - studentsWithGuardian,
        unassigned,
        arms,
        term: term ? { name: term.name, daysLeft } : null,
        hasSession: Boolean(session),
      }),
      recentActivity: activity.map((a) => ({
        id: a.id,
        summary: a.summary,
        actor: a.actor ? fullName(a.actor) : null,
        at: a.createdAt.toISOString(),
      })),
    };
  }

  /** Today's registers and the term's attendance, or null before the first register. */
  private async attendance(term: { startsOn: Date; endsOn: Date } | null, armsWithStudents: number) {
    const db = this.prisma.db;
    if (!(await db.attendanceRegister.count())) return null;
    const tenantId = currentTenantId();
    const [tenant, bell] = await Promise.all([
      this.prisma.root.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { timezone: true } }),
      bellScheduleFor(this.prisma.root, tenantId),
    ]);
    const now = schoolNow(tenant.timezone);
    const today = new Date(`${now.date}T00:00:00.000Z`);
    const [registersToday, todayMarks, termMarks] = await Promise.all([
      db.attendanceRegister.count({ where: { date: today } }),
      db.studentAttendance.groupBy({ by: ['status'], where: { date: today }, _count: { _all: true } }),
      term
        ? db.studentAttendance.groupBy({
            by: ['studentId', 'status'],
            where: { date: { gte: term.startsOn, lte: term.endsOn } },
            _count: { _all: true },
          })
        : Promise.resolve([]),
    ]);
    const count = (rows: { status: string; _count: { _all: number } }[]) => {
      const c = { present: 0, absent: 0, late: 0, excused: 0 };
      for (const r of rows) c[r.status.toLowerCase() as keyof typeof c] += r._count._all;
      return c;
    };
    const perStudent = new Map<string, { status: string; _count: { _all: number } }[]>();
    for (const r of termMarks) perStudent.set(r.studentId, [...(perStudent.get(r.studentId) ?? []), r]);
    let persistentlyAbsent = 0;
    for (const rows of perStudent.values()) {
      const c = count(rows);
      const rate = attendanceRate(c);
      if (rate !== null && rate < CHRONIC_ABSENCE_THRESHOLD && c.present + c.late + c.absent >= 5) persistentlyAbsent++;
    }
    return {
      schoolDay: bell.days.includes(weekdayOf(now.date)),
      time: now.time,
      kpi: {
        todayRate: attendanceRate(count(todayMarks)),
        registersTaken: registersToday,
        registersExpected: armsWithStudents,
        termRate: attendanceRate(count(termMarks)),
        persistentlyAbsent,
      },
    };
  }

  private insights(d: {
    totalStudents: number;
    addedThisMonth: number;
    withoutGuardian: number;
    unassigned: number;
    arms: { name: string; levelName: string; capacity: number | null; classTeacher: { id: string } | null; _count: { students: number } }[];
    term: { name: string; daysLeft: number } | null;
    hasSession: boolean;
    attendance: Awaited<ReturnType<SchoolSnapshotService['attendance']>>;
  }): Insight[] {
    const out: Insight[] = [];
    const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

    if (!d.hasSession || !d.term) {
      out.push({
        tone: 'warning',
        title: d.hasSession ? 'No current term is set' : 'No current academic session is set',
        detail: 'Attendance, results and fees are organised by term. Set one to unlock them.',
        href: '/academics',
      });
    } else if (d.term.daysLeft >= 0 && d.term.daysLeft <= 21) {
      out.push({
        tone: 'info',
        title: `${d.term.name} ends in ${plural(d.term.daysLeft, 'day')}`,
        detail: 'A good time to finalise assessments and prepare report cards.',
        href: '/academics',
      });
    }

    const a = d.attendance;
    if (a?.schoolDay && a.time >= '10:00' && a.kpi.registersTaken < a.kpi.registersExpected) {
      const missing = a.kpi.registersExpected - a.kpi.registersTaken;
      out.push({
        tone: 'warning',
        title: `${plural(missing, "class hasn't", "classes haven't")} taken today's register`,
        detail: 'Registers keep children safe: absences are only followed up once the class is marked.',
        href: '/attendance',
      });
    }
    if (a && a.kpi.persistentlyAbsent > 0) {
      out.push({
        tone: 'warning',
        title: `${plural(a.kpi.persistentlyAbsent, 'student is', 'students are')} persistently absent`,
        detail: `Below ${CHRONIC_ABSENCE_THRESHOLD}% attendance this term. Early contact with parents makes the biggest difference.`,
        href: '/attendance',
      });
    }

    const full = d.arms.filter((a) => a.capacity && a._count.students / a.capacity >= NEARLY_FULL);
    if (full.length) {
      out.push({
        tone: 'warning',
        title: `${plural(full.length, 'class is', 'classes are')} nearly full`,
        detail: full
          .slice(0, 4)
          .map((a) => `${a.levelName} ${a.name} (${a._count.students}/${a.capacity})`)
          .join(', ') + (full.length > 4 ? ` and ${full.length - 4} more` : ''),
        href: '/academics',
      });
    }

    if (d.withoutGuardian > 0) {
      out.push({
        tone: 'warning',
        title: `${plural(d.withoutGuardian, 'student has', 'students have')} no parent or guardian on record`,
        detail: 'Parents can’t receive updates, results or fee reminders until they’re linked.',
        href: '/parents',
      });
    }

    if (d.unassigned > 0) {
      out.push({
        tone: 'warning',
        title: `${plural(d.unassigned, 'student is', 'students are')} not in a class`,
        detail: 'Assign them so they appear on registers, timetables and results.',
        href: '/students',
      });
    }

    const noTeacher = d.arms.filter((a) => !a.classTeacher);
    if (noTeacher.length) {
      out.push({
        tone: 'info',
        title: `${plural(noTeacher.length, 'class has', 'classes have')} no class teacher`,
        detail: noTeacher.slice(0, 5).map((a) => `${a.levelName} ${a.name}`).join(', ') +
          (noTeacher.length > 5 ? ` and ${noTeacher.length - 5} more` : ''),
        href: '/academics',
      });
    }

    if (d.addedThisMonth > 0) {
      out.push({
        tone: 'good',
        title: `${plural(d.addedThisMonth, 'new student')} admitted this month`,
        detail: `Your active roll is now ${d.totalStudents.toLocaleString('en')}.`,
        href: '/students',
      });
    }

    if (!out.length) {
      out.push({ tone: 'good', title: 'Everything looks in order', detail: 'No issues need your attention today.' });
    }
    return out.slice(0, 6);
  }
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
