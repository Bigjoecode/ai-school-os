import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  CHRONIC_ABSENCE_THRESHOLD,
  DAY_NAMES,
  DEFAULT_ATTENDANCE_SETTINGS,
  attendanceRate,
  type AttendanceCounts,
  type AttendanceSettings,
  type AttendanceStatus,
  type CheckInResult,
  type ClassAttendanceReport,
  type KioskToken,
  type MyAttendanceToday,
  type RegisterView,
  type SaveRegisterInput,
  type SaveStaffAttendanceInput,
  type SchoolAttendanceReport,
  type StaffAttendanceDay,
  type StudentAttendanceView,
  type TodayAttendance,
} from '@aischool/shared';
import type { Prisma } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { dateOnly, fullName, parseDate } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { datesBetween, schoolNow, schoolTimeOf, weekdayOf } from '../common/school-time';
import { PrismaService } from '../prisma/prisma.service';
import { bellScheduleFor } from '../timetable/timetable-builder';

const KIOSK_TOKEN_SECONDS = 90;
/** A second scan within this time of checking in is treated as a double scan, not a check-out. */
const MIN_MINUTES_BEFORE_CHECKOUT = 30;

const empty = (): AttendanceCounts => ({ present: 0, absent: 0, late: 0, excused: 0 });
function tally(c: AttendanceCounts, status: AttendanceStatus) {
  if (status === 'PRESENT') c.present++;
  else if (status === 'ABSENT') c.absent++;
  else if (status === 'LATE') c.late++;
  else c.excused++;
}

interface SchoolContext {
  timezone: string;
  name: string;
  days: number[];
  settings: AttendanceSettings;
  today: string;
  time: string;
}

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------- context

  async school(): Promise<SchoolContext> {
    const tenantId = currentTenantId();
    const [tenant, bell] = await Promise.all([
      this.prisma.root.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { timezone: true, name: true, attendanceSettings: true },
      }),
      bellScheduleFor(this.prisma.root, tenantId),
    ]);
    const now = schoolNow(tenant.timezone);
    return {
      timezone: tenant.timezone,
      name: tenant.name,
      days: bell.days,
      settings: { ...DEFAULT_ATTENDANCE_SETTINGS, ...((tenant.attendanceSettings as Partial<AttendanceSettings> | null) ?? {}) },
      today: now.date,
      time: now.time,
    };
  }

  async setSettings(settings: AttendanceSettings) {
    await this.prisma.root.tenant.update({
      where: { id: currentTenantId() },
      data: { attendanceSettings: settings as unknown as Prisma.InputJsonValue },
    });
    await this.audit.log({
      action: 'attendance.settings',
      summary: `Staff are late after ${settings.staffLateAfter}; registers editable for ${settings.editWindowDays} days`,
    });
    return settings;
  }

  private async term(termId?: string) {
    const term = termId
      ? await this.prisma.db.term.findUniqueOrThrow({ where: { id: termId } })
      : await this.prisma.db.term.findFirst({ where: { isCurrent: true } });
    if (!term) throw new BadRequestException('Set a current term in Academic Setup first');
    return term;
  }

  /** School days of a term up to today (or the term's end). */
  private schoolDaysSoFar(term: { startsOn: Date; endsOn: Date }, s: SchoolContext): string[] {
    const end = dateOnly(term.endsOn)! < s.today ? dateOnly(term.endsOn)! : s.today;
    return datesBetween(dateOnly(term.startsOn)!, end).filter((d) => s.days.includes(weekdayOf(d)));
  }

  // ---------------------------------------------------------- registers

  async register(classArmId: string, date?: string): Promise<RegisterView> {
    const s = await this.school();
    const day = date ?? s.today;
    const db = this.prisma.db;
    const [arm, register, enrolled, term] = await Promise.all([
      db.classArm.findUniqueOrThrow({ where: { id: classArmId }, include: { classLevel: true, classTeacher: true } }),
      db.attendanceRegister.findUnique({
        where: { classArmId_date: { classArmId, date: parseDate(day) } },
        include: { marks: { include: { student: true } } },
      }),
      db.student.findMany({ where: { classArmId, status: 'ACTIVE' }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] }),
      db.term.findFirst({ where: { startsOn: { lte: parseDate(day) }, endsOn: { gte: parseDate(day) } } }),
    ]);

    // Everyone in the class now, plus anyone marked on this register who has since moved.
    const students = new Map(enrolled.map((st) => [st.id, st]));
    for (const m of register?.marks ?? []) if (!students.has(m.studentId)) students.set(m.studentId, m.student);
    const marks = new Map((register?.marks ?? []).map((m) => [m.studentId, m]));

    const rates = term ? await this.termRates([...students.keys()], term) : new Map<string, number | null>();
    const takenBy = register?.takenById
      ? await this.prisma.root.user.findUnique({ where: { id: register.takenById }, select: { firstName: true, lastName: true } })
      : null;
    const edit = await this.editPermission(arm.id, arm.classTeacher?.userId ?? null, day, s);
    const counts = empty();
    for (const m of marks.values()) tally(counts, m.status);

    return {
      classArm: {
        id: arm.id,
        name: arm.name,
        levelName: arm.classLevel.name,
        classTeacher: arm.classTeacher ? fullName(arm.classTeacher) : null,
      },
      date: day,
      dayName: DAY_NAMES[weekdayOf(day)] ?? '',
      schoolDay: s.days.includes(weekdayOf(day)),
      taken: Boolean(register),
      takenBy: takenBy ? fullName(takenBy) : null,
      takenAt: register?.updatedAt.toISOString() ?? null,
      canEdit: edit.allowed,
      readOnlyReason: edit.reason,
      students: [...students.values()]
        .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
        .map((st) => ({
          id: st.id,
          name: fullName(st),
          admissionNumber: st.admissionNumber,
          status: marks.get(st.id)?.status ?? null,
          note: marks.get(st.id)?.note ?? null,
          termRate: rates.get(st.id) ?? null,
        })),
      counts,
    };
  }

  /**
   * Who may mark a class on a day: managers any school day up to today; the
   * class teacher (attendance.take) today and within the edit window.
   */
  private async editPermission(
    classArmId: string,
    classTeacherUserId: string | null,
    day: string,
    s: SchoolContext,
  ): Promise<{ allowed: boolean; reason: string | null }> {
    const ctx = currentContext();
    if (!s.days.includes(weekdayOf(day))) return { allowed: false, reason: `${DAY_NAMES[weekdayOf(day)]} isn't a school day` };
    if (day > s.today) return { allowed: false, reason: "You can't take a register for a future date" };
    if (ctx.permissions.has('attendance.manage')) return { allowed: true, reason: null };
    if (!ctx.permissions.has('attendance.take') || classTeacherUserId !== ctx.userId) {
      return { allowed: false, reason: "Only this class's teacher can take its register" };
    }
    const oldest = new Date(`${s.today}T00:00:00.000Z`);
    oldest.setUTCDate(oldest.getUTCDate() - s.settings.editWindowDays);
    if (day < oldest.toISOString().slice(0, 10)) {
      return { allowed: false, reason: `Registers older than ${s.settings.editWindowDays} days can only be changed by an administrator` };
    }
    return { allowed: true, reason: null };
  }

  async saveRegister(body: SaveRegisterInput): Promise<RegisterView> {
    const s = await this.school();
    const db = this.prisma.db;
    const arm = await db.classArm.findUniqueOrThrow({ where: { id: body.classArmId }, include: { classTeacher: true, classLevel: true } });
    const edit = await this.editPermission(arm.id, arm.classTeacher?.userId ?? null, body.date, s);
    if (!edit.allowed) throw new ForbiddenException(edit.reason);

    const date = parseDate(body.date);
    const existing = await db.attendanceRegister.findUnique({ where: { classArmId_date: { classArmId: arm.id, date } }, include: { marks: true } });
    const ids = [...new Set(body.marks.map((m) => m.studentId))];
    const allowed = await db.student.findMany({
      where: { id: { in: ids }, OR: [{ classArmId: arm.id }, { id: { in: existing?.marks.map((m) => m.studentId) ?? [] } }] },
      select: { id: true },
    });
    if (allowed.length !== ids.length) throw new BadRequestException('Some students are not in this class');

    const tenantId = currentTenantId();
    const userId = currentContext().userId;
    await db.$transaction(async (tx) => {
      const register = await tx.attendanceRegister.upsert({
        where: { classArmId_date: { classArmId: arm.id, date } },
        update: { takenById: userId },
        create: { tenantId, classArmId: arm.id, date, takenById: userId },
      });
      for (const m of body.marks) {
        await tx.studentAttendance.upsert({
          where: { registerId_studentId: { registerId: register.id, studentId: m.studentId } },
          update: { status: m.status, note: m.note ?? null },
          create: { tenantId, registerId: register.id, studentId: m.studentId, date, status: m.status, note: m.note },
        });
      }
    });

    const counts = empty();
    for (const m of body.marks) tally(counts, m.status);
    await this.audit.log({
      action: existing ? 'attendance.register_updated' : 'attendance.register_taken',
      entityType: 'AttendanceRegister',
      summary: `${existing ? 'Updated' : 'Took'} the register for ${arm.classLevel.name} ${arm.name} on ${body.date}: ${counts.present + counts.late} present, ${counts.absent} absent${counts.late ? `, ${counts.late} late` : ''}`,
    });
    return this.register(arm.id, body.date);
  }

  private async termRates(studentIds: string[], term: { startsOn: Date; endsOn: Date }) {
    const rows = await this.prisma.db.studentAttendance.groupBy({
      by: ['studentId', 'status'],
      where: { studentId: { in: studentIds }, date: { gte: term.startsOn, lte: term.endsOn } },
      _count: { _all: true },
    });
    const counts = new Map<string, AttendanceCounts>();
    for (const r of rows) {
      const c = counts.get(r.studentId) ?? empty();
      for (let i = 0; i < r._count._all; i++) tally(c, r.status);
      counts.set(r.studentId, c);
    }
    return new Map([...counts].map(([id, c]) => [id, attendanceRate(c)]));
  }

  // ---------------------------------------------------------- today

  async today(date?: string): Promise<TodayAttendance> {
    const s = await this.school();
    const day = date ?? s.today;
    const db = this.prisma.db;
    const [arms, registers, onRoll, staffTotal, staffRows, term] = await Promise.all([
      db.classArm.findMany({
        include: { classLevel: true, classTeacher: true },
        orderBy: [{ classLevel: { order: 'asc' } }, { name: 'asc' }],
      }),
      db.attendanceRegister.findMany({ where: { date: parseDate(day) }, include: { marks: { include: { student: true } } } }),
      db.student.groupBy({ by: ['classArmId'], where: { status: 'ACTIVE', classArmId: { not: null } }, _count: { _all: true } }),
      db.staff.count({ where: { status: { not: 'EXITED' } } }),
      db.staffAttendance.findMany({ where: { date: parseDate(day) } }),
      db.term.findFirst({ where: { startsOn: { lte: parseDate(day) }, endsOn: { gte: parseDate(day) } } }),
    ]);
    const rollByArm = new Map(onRoll.map((r) => [r.classArmId!, r._count._all]));
    const regByArm = new Map(registers.map((r) => [r.classArmId, r]));

    const total = empty();
    const classes = arms.map((arm) => {
      const reg = regByArm.get(arm.id);
      const counts = empty();
      for (const m of reg?.marks ?? []) {
        tally(counts, m.status);
        tally(total, m.status);
      }
      return {
        classArm: { id: arm.id, name: arm.name, levelName: arm.classLevel.name },
        classTeacher: arm.classTeacher ? fullName(arm.classTeacher) : null,
        classTeacherUserId: arm.classTeacher?.userId ?? null,
        taken: Boolean(reg),
        counts,
        rate: attendanceRate(counts),
        onRoll: rollByArm.get(arm.id) ?? 0,
      };
    });

    const absentMarks = registers.flatMap((r) =>
      r.marks.filter((m) => m.status === 'ABSENT' || m.status === 'LATE').map((m) => ({ m, arm: arms.find((a) => a.id === r.classArmId)! })),
    );
    const streaks = await this.absenceStreaks(absentMarks.filter((x) => x.m.status === 'ABSENT').map((x) => x.m.studentId), day);

    const staff = { present: 0, late: 0, absent: 0, onLeave: 0, notIn: 0, total: staffTotal };
    for (const r of staffRows) {
      if (r.status === 'PRESENT') staff.present++;
      else if (r.status === 'LATE') staff.late++;
      else if (r.status === 'ABSENT') staff.absent++;
      else staff.onLeave++;
    }
    staff.notIn = Math.max(0, staffTotal - staffRows.length);

    const onRollTotal = [...rollByArm.values()].reduce((n, v) => n + v, 0);
    const marked = total.present + total.absent + total.late + total.excused;
    return {
      date: day,
      dayName: DAY_NAMES[weekdayOf(day)] ?? '',
      schoolDay: s.days.includes(weekdayOf(day)),
      term: term ? { id: term.id, name: term.name } : null,
      students: { ...total, rate: attendanceRate(total), onRoll: onRollTotal, unmarked: Math.max(0, onRollTotal - marked) },
      classes,
      registersTaken: registers.length,
      registersExpected: arms.filter((a) => (rollByArm.get(a.id) ?? 0) > 0).length,
      staff,
      absentees: absentMarks
        .map(({ m, arm }) => ({
          id: m.studentId,
          name: fullName(m.student),
          classArm: `${arm.classLevel.name} ${arm.name}`,
          status: m.status as 'ABSENT' | 'LATE',
          note: m.note,
          consecutive: m.status === 'ABSENT' ? (streaks.get(m.studentId) ?? 1) : 0,
        }))
        .sort((a, b) => b.consecutive - a.consecutive || a.classArm.localeCompare(b.classArm)),
    };
  }

  /** Consecutive ABSENT marks ending on `day`, per student. */
  private async absenceStreaks(studentIds: string[], day: string): Promise<Map<string, number>> {
    if (!studentIds.length) return new Map();
    const rows = await this.prisma.db.studentAttendance.findMany({
      where: { studentId: { in: studentIds }, date: { lte: parseDate(day) } },
      orderBy: { date: 'desc' },
      select: { studentId: true, status: true },
    });
    const streaks = new Map<string, number>();
    const done = new Set<string>();
    for (const r of rows) {
      if (done.has(r.studentId)) continue;
      if (r.status === 'ABSENT') streaks.set(r.studentId, (streaks.get(r.studentId) ?? 0) + 1);
      else done.add(r.studentId);
    }
    return streaks;
  }

  // ---------------------------------------------------------- reports

  async studentView(studentId: string, termId?: string): Promise<StudentAttendanceView> {
    const [s, term, student] = await Promise.all([
      this.school(),
      this.term(termId),
      this.prisma.db.student.findUniqueOrThrow({ where: { id: studentId }, include: { classArm: { include: { classLevel: true } } } }),
    ]);
    const marks = await this.prisma.db.studentAttendance.findMany({
      where: { studentId, date: { gte: term.startsOn, lte: term.endsOn } },
      orderBy: { date: 'asc' },
    });
    const counts = empty();
    const byWeekday = new Map<number, AttendanceCounts>();
    for (const m of marks) {
      tally(counts, m.status);
      const wd = weekdayOf(dateOnly(m.date)!);
      const c = byWeekday.get(wd) ?? empty();
      tally(c, m.status);
      byWeekday.set(wd, c);
    }
    let streak = 0;
    for (let i = marks.length - 1; i >= 0 && marks[i]!.status === 'ABSENT'; i--) streak++;
    return {
      student: {
        id: student.id,
        name: fullName(student),
        admissionNumber: student.admissionNumber,
        classArm: student.classArm ? `${student.classArm.classLevel.name} ${student.classArm.name}` : null,
      },
      term: { id: term.id, name: term.name, startsOn: dateOnly(term.startsOn)!, endsOn: dateOnly(term.endsOn)! },
      counts,
      rate: attendanceRate(counts),
      daysMarked: marks.length,
      currentAbsenceStreak: streak,
      days: marks.map((m) => ({ date: dateOnly(m.date)!, status: m.status, note: m.note })),
      byWeekday: s.days.map((d) => ({ day: d, rate: byWeekday.has(d) ? attendanceRate(byWeekday.get(d)!) : null })),
    };
  }

  async classReport(classArmId: string, termId?: string): Promise<ClassAttendanceReport> {
    const [s, term, arm] = await Promise.all([
      this.school(),
      this.term(termId),
      this.prisma.db.classArm.findUniqueOrThrow({ where: { id: classArmId }, include: { classLevel: true } }),
    ]);
    const registers = await this.prisma.db.attendanceRegister.findMany({
      where: { classArmId, date: { gte: term.startsOn, lte: term.endsOn } },
      include: { marks: { include: { student: true } } },
      orderBy: { date: 'asc' },
    });
    const enrolled = await this.prisma.db.student.findMany({ where: { classArmId, status: 'ACTIVE' } });
    const students = new Map(enrolled.map((st) => [st.id, { st, counts: empty() }]));
    const total = empty();
    const daily = registers.map((r) => {
      const c = empty();
      for (const m of r.marks) {
        tally(c, m.status);
        tally(total, m.status);
        const entry = students.get(m.studentId) ?? { st: m.student, counts: empty() };
        tally(entry.counts, m.status);
        students.set(m.studentId, entry);
      }
      return { date: dateOnly(r.date)!, rate: attendanceRate(c) };
    });
    return {
      classArm: { id: arm.id, name: arm.name, levelName: arm.classLevel.name },
      term: { id: term.id, name: term.name },
      registersTaken: registers.length,
      schoolDaysSoFar: this.schoolDaysSoFar(term, s).length,
      rate: attendanceRate(total),
      students: [...students.values()]
        .map(({ st, counts }) => {
          const rate = attendanceRate(counts);
          return { id: st.id, name: fullName(st), admissionNumber: st.admissionNumber, counts, rate, chronic: rate !== null && rate < CHRONIC_ABSENCE_THRESHOLD };
        })
        .sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101) || a.name.localeCompare(b.name)),
      daily,
    };
  }

  async schoolReport(termId?: string): Promise<SchoolAttendanceReport> {
    const [s, term] = await Promise.all([this.school(), this.term(termId)]);
    const db = this.prisma.db;
    const range = { gte: term.startsOn, lte: term.endsOn };
    const [marks, registers, arms, staffRows] = await Promise.all([
      db.studentAttendance.findMany({ where: { date: range }, select: { studentId: true, date: true, status: true, registerId: true } }),
      db.attendanceRegister.findMany({ where: { date: range }, select: { id: true, classArmId: true, date: true } }),
      db.classArm.findMany({ include: { classLevel: true }, orderBy: [{ classLevel: { order: 'asc' } }, { name: 'asc' }] }),
      db.staffAttendance.findMany({ where: { date: range }, select: { status: true } }),
    ]);
    const armOfRegister = new Map(registers.map((r) => [r.id, r.classArmId]));
    const total = empty();
    const byDay = new Map<string, AttendanceCounts>();
    const byWeekday = new Map<number, AttendanceCounts>();
    const byArm = new Map<string, AttendanceCounts>();
    const byStudent = new Map<string, AttendanceCounts>();
    for (const m of marks) {
      const d = dateOnly(m.date)!;
      tally(total, m.status);
      for (const [map, key] of [
        [byDay, d],
        [byWeekday, weekdayOf(d)],
        [byArm, armOfRegister.get(m.registerId)!],
        [byStudent, m.studentId],
      ] as const) {
        const c = (map as Map<string | number, AttendanceCounts>).get(key) ?? empty();
        tally(c, m.status);
        (map as Map<string | number, AttendanceCounts>).set(key, c);
      }
    }
    const registersPerDay = new Map<string, number>();
    for (const r of registers) registersPerDay.set(dateOnly(r.date)!, (registersPerDay.get(dateOnly(r.date)!) ?? 0) + 1);

    const chronicIds = [...byStudent].filter(([, c]) => {
      const rate = attendanceRate(c);
      return rate !== null && rate < CHRONIC_ABSENCE_THRESHOLD && c.present + c.late + c.absent >= 5;
    });
    const chronicStudents = await db.student.findMany({
      where: { id: { in: chronicIds.map(([id]) => id) } },
      include: { classArm: { include: { classLevel: true } } },
    });
    const staffPresent = staffRows.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length;
    const staffCounted = staffRows.filter((r) => r.status !== 'ON_LEAVE').length;

    return {
      term: { id: term.id, name: term.name, startsOn: dateOnly(term.startsOn)!, endsOn: dateOnly(term.endsOn)! },
      rate: attendanceRate(total),
      counts: total,
      daily: this.schoolDaysSoFar(term, s).map((d) => ({
        date: d,
        rate: byDay.has(d) ? attendanceRate(byDay.get(d)!) : null,
        registers: registersPerDay.get(d) ?? 0,
      })),
      byWeekday: s.days.map((d) => ({ day: d, rate: byWeekday.has(d) ? attendanceRate(byWeekday.get(d)!) : null })),
      classes: arms.map((a) => ({
        classArm: { id: a.id, name: a.name, levelName: a.classLevel.name },
        rate: byArm.has(a.id) ? attendanceRate(byArm.get(a.id)!) : null,
        registersTaken: registers.filter((r) => r.classArmId === a.id).length,
      })),
      chronic: chronicStudents
        .map((st) => {
          const c = byStudent.get(st.id)!;
          return {
            id: st.id,
            name: fullName(st),
            classArm: st.classArm ? `${st.classArm.classLevel.name} ${st.classArm.name}` : '—',
            rate: attendanceRate(c)!,
            absent: c.absent,
          };
        })
        .sort((a, b) => a.rate - b.rate),
      staffRate: staffCounted ? Math.round((staffPresent / staffCounted) * 1000) / 10 : null,
      staffLateDays: staffRows.filter((r) => r.status === 'LATE').length,
    };
  }

  /** Attendance summary for a report card. */
  async termCounts(studentId: string, term: { startsOn: Date; endsOn: Date }) {
    const rows = await this.prisma.db.studentAttendance.groupBy({
      by: ['status'],
      where: { studentId, date: { gte: term.startsOn, lte: term.endsOn } },
      _count: { _all: true },
    });
    const c = empty();
    for (const r of rows) for (let i = 0; i < r._count._all; i++) tally(c, r.status);
    return { ...c, rate: attendanceRate(c), daysMarked: rows.reduce((n, r) => n + r._count._all, 0) };
  }

  // ---------------------------------------------------------- staff

  async staffDay(date?: string): Promise<StaffAttendanceDay> {
    const s = await this.school();
    const day = date ?? s.today;
    const [staff, rows] = await Promise.all([
      this.prisma.db.staff.findMany({ where: { status: { not: 'EXITED' } }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] }),
      this.prisma.db.staffAttendance.findMany({ where: { date: parseDate(day) } }),
    ]);
    const byStaff = new Map(rows.map((r) => [r.staffId, r]));
    return {
      date: day,
      settings: s.settings,
      staff: staff.map((st) => {
        const r = byStaff.get(st.id);
        return {
          id: st.id,
          name: fullName(st),
          jobTitle: st.jobTitle,
          type: st.type,
          status: r?.status ?? null,
          checkInAt: r?.checkInAt?.toISOString() ?? null,
          checkOutAt: r?.checkOutAt?.toISOString() ?? null,
          method: r?.method ?? null,
          note: r?.note ?? null,
        };
      }),
    };
  }

  async saveStaff(body: SaveStaffAttendanceInput): Promise<StaffAttendanceDay> {
    const s = await this.school();
    if (body.date > s.today) throw new BadRequestException("You can't record attendance for a future date");
    const ids = [...new Set(body.marks.map((m) => m.staffId))];
    if ((await this.prisma.db.staff.count({ where: { id: { in: ids } } })) !== ids.length) {
      throw new BadRequestException('Some staff were not found');
    }
    const tenantId = currentTenantId();
    const date = parseDate(body.date);
    await this.prisma.db.$transaction(
      body.marks.map((m) =>
        this.prisma.db.staffAttendance.upsert({
          where: { staffId_date: { staffId: m.staffId, date } },
          update: { status: m.status, note: m.note ?? null, method: 'MANUAL' },
          create: { tenantId, staffId: m.staffId, date, status: m.status, note: m.note, method: 'MANUAL' },
        }),
      ),
    );
    await this.audit.log({ action: 'attendance.staff', summary: `Recorded staff attendance for ${body.date} (${body.marks.length} staff)` });
    return this.staffDay(body.date);
  }

  /** A short-lived signed token for the reception kiosk's QR code. */
  async kioskToken(origin: string): Promise<KioskToken> {
    const s = await this.school();
    const token = await this.jwt.signAsync({ typ: 'kiosk', tid: currentTenantId() }, { expiresIn: KIOSK_TOKEN_SECONDS });
    const recent = await this.prisma.db.staffAttendance.findMany({
      where: { date: parseDate(s.today), method: 'KIOSK' },
      orderBy: { updatedAt: 'desc' },
      take: 8,
      include: { staff: true },
    });
    return {
      token,
      url: `${origin}/check-in?t=${encodeURIComponent(token)}`,
      expiresAt: new Date(Date.now() + KIOSK_TOKEN_SECONDS * 1000).toISOString(),
      schoolName: s.name,
      recent: recent.map((r) => ({
        name: fullName(r.staff),
        action: r.checkOutAt ? ('out' as const) : ('in' as const),
        at: (r.checkOutAt ?? r.checkInAt ?? r.updatedAt).toISOString(),
        late: r.status === 'LATE',
      })),
    };
  }

  /** Staff scan the kiosk QR with their phone: first scan checks in, a later one checks out. */
  async checkIn(token: string): Promise<CheckInResult> {
    let payload: { typ?: string; tid?: string };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException("That code isn't valid any more — scan the code on the screen again");
    }
    if (payload.typ !== 'kiosk' || payload.tid !== currentTenantId()) {
      throw new ForbiddenException("That code isn't for this school");
    }
    const staff = await this.prisma.db.staff.findFirst({ where: { userId: currentContext().userId } });
    if (!staff) throw new ForbiddenException("Your account isn't linked to a staff record — ask the administrator");

    const s = await this.school();
    const now = new Date();
    const date = parseDate(s.today);
    const existing = await this.prisma.db.staffAttendance.findUnique({ where: { staffId_date: { staffId: staff.id, date } } });
    const name = staff.firstName;
    const time = schoolTimeOf(s.timezone, now);

    if (!existing || !existing.checkInAt) {
      const status = time > s.settings.staffLateAfter ? 'LATE' : 'PRESENT';
      await this.prisma.db.staffAttendance.upsert({
        where: { staffId_date: { staffId: staff.id, date } },
        update: { status, checkInAt: now, method: 'KIOSK' },
        create: { tenantId: currentTenantId(), staffId: staff.id, date, status, checkInAt: now, method: 'KIOSK' },
      });
      return {
        action: 'in',
        at: now.toISOString(),
        status,
        name,
        message: status === 'LATE' ? `Checked in at ${time} — after ${s.settings.staffLateAfter}, so marked late.` : `Good morning, ${name}. Checked in at ${time}.`,
      };
    }
    if (existing.checkOutAt) {
      return {
        action: 'out',
        at: existing.checkOutAt.toISOString(),
        status: existing.status,
        name,
        message: `You already checked out at ${schoolTimeOf(s.timezone, existing.checkOutAt)}.`,
      };
    }
    const minutesIn = (now.getTime() - existing.checkInAt.getTime()) / 60_000;
    if (minutesIn < MIN_MINUTES_BEFORE_CHECKOUT) {
      return {
        action: 'in',
        at: existing.checkInAt.toISOString(),
        status: existing.status,
        name,
        message: `You're already checked in (${schoolTimeOf(s.timezone, existing.checkInAt)}).`,
      };
    }
    await this.prisma.db.staffAttendance.update({ where: { id: existing.id }, data: { checkOutAt: now } });
    const farewell = time >= '15:00' ? ` Have a good evening, ${name}.` : ` See you soon, ${name}.`;
    return { action: 'out', at: now.toISOString(), status: existing.status, name, message: `Checked out at ${time}.${farewell}` };
  }

  async me(): Promise<MyAttendanceToday> {
    const s = await this.school();
    const staff = await this.prisma.db.staff.findFirst({ where: { userId: currentContext().userId } });
    if (!staff) return { isStaff: false, date: s.today, status: null, checkInAt: null, checkOutAt: null };
    const r = await this.prisma.db.staffAttendance.findUnique({ where: { staffId_date: { staffId: staff.id, date: parseDate(s.today) } } });
    return {
      isStaff: true,
      date: s.today,
      status: r?.status ?? null,
      checkInAt: r?.checkInAt?.toISOString() ?? null,
      checkOutAt: r?.checkOutAt?.toISOString() ?? null,
    };
  }
}
