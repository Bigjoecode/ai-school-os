import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BROADCAST_STATUSES, CHANNELS, DAY_NAMES, formatMoney, type AiProposedAction, type Audience, type BellSchedule, type Permission } from '@aischool/shared';
import { z, type ZodType } from 'zod';
import type { Prisma } from '../generated/prisma/client';
import { snapshotToText } from '../ai/agents';
import type { AiToolSpec } from '../ai/providers/provider';
import { ResultsService } from '../assessment/results.service';
import { SenderService } from '../comms/sender.service';
import { dateOnly, fullName, parseDate } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { schoolNow, weekdayOf } from '../common/school-time';
import { SchoolSnapshotService } from '../dashboard/school-snapshot.service';
import { HrService } from '../hr/hr.service';
import { PrismaService } from '../prisma/prisma.service';
import { InsightsService } from './insights.service';

interface ToolContext {
  actions: AiProposedAction[];
}

interface ToolDef<I> {
  name: string;
  description: string;
  input: ZodType<I>;
  /** All needed. Empty = anyone who may open the assistant (family tools scope themselves). */
  permissions: Permission[];
  label: (input: I) => string;
  run: (input: I, ctx: ToolContext) => Promise<unknown>;
}

const MAX_RESULT = 14_000;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const arm = (a: { name: string; classLevel: { name: string } } | null | undefined) => (a ? `${a.classLevel.name} ${a.name}` : null);
const pct = (num: number, den: number) => (den ? Math.round((num / den) * 1000) / 10 : null);

/**
 * The tools the assistants use. Every tool runs inside the signed-in user's
 * request, so the tenant-scoped database applies, and checks the user's own
 * permissions — an assistant can never see more than its user can. Results
 * are compact JSON. Write tools only ever create drafts for a person to review.
 */
@Injectable()
export class AgentToolsService {
  private readonly defs = new Map<string, ToolDef<unknown>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly snapshot: SchoolSnapshotService,
    private readonly results: ResultsService,
    private readonly insights: InsightsService,
    private readonly hr: HrService,
    private readonly sender: SenderService,
  ) {
    this.register();
  }

  // ---------------------------------------------------------- registry

  private add<I>(def: ToolDef<I>) {
    this.defs.set(def.name, def as ToolDef<unknown>);
  }

  private can(p: Permission) {
    return currentContext().permissions.has(p);
  }

  /** The tools this user may use within an assistant. */
  available(names: string[]): AiToolSpec[] {
    return names
      .map((n) => this.defs.get(n))
      .filter((d): d is ToolDef<unknown> => !!d && d.permissions.every((p) => this.can(p)))
      .map((d) => {
        const schema = z.toJSONSchema(d.input) as Record<string, unknown>;
        delete schema.$schema;
        return { name: d.name, description: d.description, inputSchema: schema };
      });
  }

  labelOf(name: string, input: unknown): string {
    const d = this.defs.get(name);
    if (!d) return name;
    const parsed = d.input.safeParse(input);
    return parsed.success ? d.label(parsed.data) : d.name.replace(/_/g, ' ');
  }

  /** Runs one call; failures become a readable error for the model. */
  async execute(name: string, input: unknown, ctx: ToolContext, allowed: Set<string>): Promise<{ content: string; isError?: boolean }> {
    const d = this.defs.get(name);
    if (!d || !allowed.has(name)) return { content: `There is no tool called ${name}.`, isError: true };
    const parsed = d.input.safeParse(input ?? {});
    if (!parsed.success) return { content: `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ')}`, isError: true };
    try {
      const out = await d.run(parsed.data, ctx);
      const text = typeof out === 'string' ? out : JSON.stringify(out);
      return { content: text.length > MAX_RESULT ? `${text.slice(0, MAX_RESULT)}…(truncated)` : text };
    } catch (err) {
      const msg = err instanceof BadRequestException || err instanceof ForbiddenException || err instanceof NotFoundException ? err.message : 'Lookup failed';
      return { content: msg, isError: true };
    }
  }

  // ---------------------------------------------------------- helpers

  private async school() {
    const t = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: currentTenantId() }, select: { name: true, timezone: true, currency: true } });
    return { ...t, today: schoolNow(t.timezone).date };
  }

  private term() {
    return this.prisma.db.term.findFirst({ where: { isCurrent: true } });
  }

  /** "JSS 1 A", "jss1a", "SS 2" (a level) or an id → class arms. */
  private async arms(name: string | undefined) {
    const all = await this.prisma.db.classArm.findMany({ include: { classLevel: true }, orderBy: [{ classLevel: { order: 'asc' } }, { name: 'asc' }] });
    if (!name) return all;
    const key = norm(name);
    const exact = all.filter((a) => a.id === name || norm(`${a.classLevel.name}${a.name}`) === key || norm(`${a.classLevel.code}${a.name}`) === key);
    if (exact.length) return exact;
    const level = all.filter((a) => norm(a.classLevel.name) === key || norm(a.classLevel.code) === key);
    if (level.length) return level;
    throw new NotFoundException(`No class called "${name}". Classes: ${all.map((a) => arm(a)).join(', ')}`);
  }

  private async attendanceCounts(where: Prisma.StudentAttendanceWhereInput) {
    const rows = await this.prisma.db.studentAttendance.groupBy({ by: ['status'], where, _count: { _all: true } });
    const n = (s: string) => rows.find((r) => r.status === s)?._count._all ?? 0;
    return { present: n('PRESENT'), late: n('LATE'), absent: n('ABSENT'), excused: n('EXCUSED'), rate: pct(n('PRESENT') + n('LATE'), n('PRESENT') + n('LATE') + n('ABSENT')) };
  }

  /** The current term's results for a class, or null when nothing has been marked. */
  private async classResults(classArmId: string, termId: string) {
    const marked = await this.prisma.db.score.count({ where: { classArmId, termId } });
    return marked ? this.results.classResults(classArmId, termId) : null;
  }

  /** Children linked to the signed-in parent (empty for anyone else). */
  private async myChildren() {
    const userId = currentContext().userId!;
    const links = await this.prisma.db.studentGuardian.findMany({
      where: { guardian: { userId }, student: { status: 'ACTIVE' } },
      include: { student: { include: { classArm: { include: { classLevel: true } } } } },
    });
    return links.map((l) => l.student);
  }

  // ---------------------------------------------------------- tools

  private register() {
    this.add({
      name: 'school_overview',
      description: 'Headline numbers for the whole school: enrolment, staff, classes, attendance today and this term, fee collection, and current flags.',
      input: z.object({}),
      permissions: ['school.read'],
      label: () => 'Checked the school overview',
      run: async () => snapshotToText(await this.snapshot.overview()),
    });

    this.add({
      name: 'find_students',
      description: 'Search students by name or admission number, optionally within a class. Returns ids to use with student_profile.',
      input: z.object({ query: z.string().min(1).describe('Name or admission number'), className: z.string().optional().describe('e.g. "JSS 1 A"'), limit: z.number().int().min(1).max(25).optional() }),
      permissions: ['students.read'],
      label: (i) => `Searched students for “${i.query}”`,
      run: async (i) => {
        const terms = i.query.split(/\s+/).filter(Boolean);
        const armIds = i.className ? (await this.arms(i.className)).map((a) => a.id) : undefined;
        const rows = await this.prisma.db.student.findMany({
          where: {
            ...(armIds ? { classArmId: { in: armIds } } : {}),
            AND: terms.map((t) => ({ OR: [{ firstName: { contains: t, mode: 'insensitive' } }, { lastName: { contains: t, mode: 'insensitive' } }, { admissionNumber: { contains: t, mode: 'insensitive' } }] })),
          },
          include: { classArm: { include: { classLevel: true } } },
          take: i.limit ?? 10,
          orderBy: { lastName: 'asc' },
        });
        return rows.map((s) => ({ id: s.id, name: fullName(s), admissionNumber: s.admissionNumber, class: arm(s.classArm), status: s.status, gender: s.gender }));
      },
    });

    this.add({
      name: 'student_profile',
      description: "One student's record: class, guardians, attendance this term, results so far, fees, homework due, transport and boarding.",
      input: z.object({ studentId: z.string().min(1) }),
      permissions: ['students.read'],
      label: () => 'Looked up a student’s record',
      run: async (i) => {
        const db = this.prisma.db;
        const s = await db.student.findUnique({
          where: { id: i.studentId },
          include: {
            classArm: { include: { classLevel: true, classTeacher: true } },
            guardians: { include: { guardian: true } },
            transport: { include: { route: true } },
            hostelBeds: { where: { active: true }, include: { room: { include: { hostel: true } } } },
          },
        });
        if (!s) throw new NotFoundException('No student with that id — use find_students first');
        const [term, school] = await Promise.all([this.term(), this.school()]);
        const out: Record<string, unknown> = {
          name: fullName(s),
          admissionNumber: s.admissionNumber,
          class: arm(s.classArm),
          classTeacher: s.classArm?.classTeacher ? fullName(s.classArm.classTeacher) : null,
          status: s.status,
          gender: s.gender,
          admittedOn: dateOnly(s.admittedOn),
          transport: s.transport ? `${s.transport.route.name} (${s.transport.stop})` : null,
          boarding: s.hostelBeds[0] ? `${s.hostelBeds[0].room.hostel.name}, ${s.hostelBeds[0].room.name}` : null,
        };
        if (this.can('guardians.read')) out.guardians = s.guardians.map((g) => ({ name: fullName(g.guardian), relationship: g.guardian.relationship, phone: g.guardian.phone, primary: g.isPrimary }));
        if (term && this.can('attendance.read')) out.attendanceThisTerm = await this.attendanceCounts({ studentId: s.id, date: { gte: term.startsOn, lte: term.endsOn } });
        if (term && s.classArmId && this.can('results.read')) {
          const r = await this.classResults(s.classArmId, term.id);
          if (r) {
            const mine = r.results.get(s.id);
            out.resultsThisTerm = {
              term: term.name,
              average: r.averages.get(s.id) ?? null,
              position: r.positions.get(s.id) ?? null,
              outOf: r.students.length,
              subjects: r.subjects.map((sub) => ({ subject: sub.name, percent: mine?.get(sub.id)?.percent ?? null })).filter((x) => x.percent !== null),
            };
          }
        }
        if (term && this.can('finance.read')) {
          const inv = await db.invoice.findFirst({ where: { studentId: s.id, termId: term.id, status: { not: 'CANCELLED' } } });
          if (inv) out.fees = { invoice: inv.number, billed: formatMoney(inv.totalKobo, school.currency), paid: formatMoney(inv.paidKobo, school.currency), balance: formatMoney(inv.totalKobo - inv.paidKobo, school.currency), due: dateOnly(inv.dueDate), overdue: inv.totalKobo > inv.paidKobo && dateOnly(inv.dueDate)! < school.today };
        }
        if (s.classArmId) {
          const hw = await db.homework.findMany({ where: { classArmId: s.classArmId, status: 'PUBLISHED', dueDate: { gte: parseDate(school.today) } }, include: { subject: true }, orderBy: { dueDate: 'asc' }, take: 5 });
          out.homeworkDue = hw.map((h) => ({ title: h.title, subject: h.subject?.name ?? null, due: dateOnly(h.dueDate) }));
        }
        return out;
      },
    });

    this.add({
      name: 'class_overview',
      description: 'A class arm (e.g. "JSS 1 A"): size, class teacher, subjects and teachers, attendance this term and the results so far by subject.',
      input: z.object({ className: z.string().min(1).describe('e.g. "JSS 1 A"') }),
      permissions: ['academics.read'],
      label: (i) => `Looked at ${i.className}`,
      run: async (i) => {
        const [a] = await this.arms(i.className);
        if (!a) throw new NotFoundException('Class not found');
        const db = this.prisma.db;
        const [term, students, subjects, teacher] = await Promise.all([
          this.term(),
          db.student.groupBy({ by: ['gender'], where: { classArmId: a.id, status: 'ACTIVE' }, _count: { _all: true } }),
          db.classSubject.findMany({ where: { classArmId: a.id }, include: { subject: true, teacher: true } }),
          a.classTeacherId ? db.staff.findUnique({ where: { id: a.classTeacherId } }) : null,
        ]);
        const n = (g: string) => students.find((x) => x.gender === g)?._count._all ?? 0;
        const out: Record<string, unknown> = {
          class: arm(a),
          capacity: a.capacity,
          students: n('MALE') + n('FEMALE'),
          boys: n('MALE'),
          girls: n('FEMALE'),
          classTeacher: teacher ? fullName(teacher) : null,
          subjects: subjects.map((cs) => ({ subject: cs.subject.name, teacher: cs.teacher ? fullName(cs.teacher) : null, periodsPerWeek: cs.periodsPerWeek })),
        };
        if (term && this.can('attendance.read')) out.attendanceThisTerm = await this.attendanceCounts({ register: { classArmId: a.id }, date: { gte: term.startsOn, lte: term.endsOn } });
        if (term && this.can('results.read')) {
          const r = await this.classResults(a.id, term.id);
          if (r) {
            const avgs = [...r.averages.values()].filter((v): v is number => v !== null);
            out.resultsThisTerm = {
              classAverage: avgs.length ? Math.round((avgs.reduce((t, v) => t + v, 0) / avgs.length) * 10) / 10 : null,
              bySubject: r.subjects
                .map((sub) => {
                  const ps = r.students.map((st) => r.results.get(st.id)?.get(sub.id)?.percent).filter((v): v is number => v !== null && v !== undefined);
                  return { subject: sub.name, average: ps.length ? Math.round((ps.reduce((t, v) => t + v, 0) / ps.length) * 10) / 10 : null, below50: ps.filter((v) => v < 50).length };
                })
                .filter((x) => x.average !== null),
            };
          }
        }
        return out;
      },
    });

    this.add({
      name: 'attendance_report',
      description: 'Student attendance rates by class over a period (default: this term so far), and the lowest individual rates. Optionally one class.',
      input: z.object({ className: z.string().optional(), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
      permissions: ['attendance.read'],
      label: (i) => `Checked attendance${i.className ? ` for ${i.className}` : ''}`,
      run: async (i) => {
        const db = this.prisma.db;
        const [term, school] = await Promise.all([this.term(), this.school()]);
        const from = i.from ? parseDate(i.from) : term?.startsOn;
        const to = i.to ? parseDate(i.to) : parseDate(school.today);
        if (!from) throw new BadRequestException('No current term — give a from date');
        const arms = await this.arms(i.className);
        const rows = await db.studentAttendance.findMany({
          where: { date: { gte: from, lte: to }, register: { classArmId: { in: arms.map((a) => a.id) } } },
          select: { studentId: true, status: true, register: { select: { classArmId: true } } },
        });
        const byArm = new Map<string, { p: number; a: number }>();
        const byStudent = new Map<string, { p: number; a: number }>();
        for (const r of rows) {
          if (r.status === 'EXCUSED') continue;
          const present = r.status === 'PRESENT' || r.status === 'LATE';
          for (const [m, k] of [[byArm, r.register.classArmId], [byStudent, r.studentId]] as const) {
            const c = m.get(k) ?? { p: 0, a: 0 };
            if (present) c.p++;
            else c.a++;
            m.set(k, c);
          }
        }
        const lowest = [...byStudent].map(([id, c]) => ({ id, rate: pct(c.p, c.p + c.a)!, absent: c.a })).filter((x) => x.rate < 92).sort((a, b) => a.rate - b.rate).slice(0, 12);
        const names = await db.student.findMany({ where: { id: { in: lowest.map((l) => l.id) } }, include: { classArm: { include: { classLevel: true } } } });
        return {
          period: `${dateOnly(from)} to ${dateOnly(to)}`,
          byClass: arms.map((a) => ({ class: arm(a), rate: byArm.has(a.id) ? pct(byArm.get(a.id)!.p, byArm.get(a.id)!.p + byArm.get(a.id)!.a) : null })),
          overall: pct([...byArm.values()].reduce((t, c) => t + c.p, 0), [...byArm.values()].reduce((t, c) => t + c.p + c.a, 0)),
          lowestStudents: lowest.map((l) => {
            const s = names.find((n) => n.id === l.id)!;
            return { studentId: l.id, name: fullName(s), class: arm(s.classArm), rate: l.rate, daysAbsent: l.absent };
          }),
        };
      },
    });

    this.add({
      name: 'results_overview',
      description: "This term's results so far: class averages, subject averages across classes, and (for one class) the top and bottom students. Optionally one class and/or subject.",
      input: z.object({ className: z.string().optional(), subject: z.string().optional() }),
      permissions: ['results.read'],
      label: (i) => `Checked results${i.className ? ` for ${i.className}` : ''}${i.subject ? ` in ${i.subject}` : ''}`,
      run: async (i) => {
        const term = await this.term();
        if (!term) throw new BadRequestException('No current term');
        const arms = await this.arms(i.className);
        const subjectKey = i.subject ? norm(i.subject) : null;
        const classes: unknown[] = [];
        const subj = new Map<string, number[]>();
        let single: unknown = null;
        for (const a of arms) {
          const r = await this.classResults(a.id, term.id);
          if (!r) continue;
          const subs = r.subjects.filter((s) => !subjectKey || norm(s.name) === subjectKey || norm(s.code) === subjectKey);
          const per = (sid: string) => r.students.map((st) => r.results.get(st.id)?.get(sid)?.percent).filter((v): v is number => v !== null && v !== undefined);
          for (const s of subs) subj.set(s.name, [...(subj.get(s.name) ?? []), ...per(s.id)]);
          const avgs = subjectKey ? subs.flatMap((s) => per(s.id)) : [...r.averages.values()].filter((v): v is number => v !== null);
          classes.push({ class: arm(a), average: avgs.length ? Math.round((avgs.reduce((t, v) => t + v, 0) / avgs.length) * 10) / 10 : null, marked: avgs.length });
          if (arms.length === 1) {
            const ranked = r.students
              .map((st) => ({ studentId: st.id, name: st.name, average: subjectKey ? (subs[0] ? (r.results.get(st.id)?.get(subs[0].id)?.percent ?? null) : null) : (r.averages.get(st.id) ?? null) }))
              .filter((x): x is { studentId: string; name: string; average: number } => x.average !== null)
              .sort((x, y) => y.average - x.average);
            single = { top: ranked.slice(0, 5), bottom: ranked.slice(-5).reverse() };
          }
        }
        return {
          term: term.name,
          note: 'Percentages of what has been assessed so far this term.',
          byClass: classes,
          bySubject: [...subj].map(([subject, ps]) => ({ subject, average: ps.length ? Math.round((ps.reduce((t, v) => t + v, 0) / ps.length) * 10) / 10 : null, below50: ps.filter((v) => v < 50).length, marked: ps.length })).sort((x, y) => (x.average ?? 0) - (y.average ?? 0)),
          ...(single ? { students: single } : {}),
        };
      },
    });

    this.add({
      name: 'fees_overview',
      description: "This term's fees: billed, collected, outstanding and overdue, collection rate by class, and the largest balances. Optionally one class.",
      input: z.object({ className: z.string().optional() }),
      permissions: ['finance.read'],
      label: (i) => `Checked fees${i.className ? ` for ${i.className}` : ''}`,
      run: async (i) => {
        const [term, school] = await Promise.all([this.term(), this.school()]);
        if (!term) throw new BadRequestException('No current term');
        const arms = await this.arms(i.className);
        const invoices = await this.prisma.db.invoice.findMany({
          where: { termId: term.id, status: { not: 'CANCELLED' }, student: { classArmId: { in: arms.map((a) => a.id) } } },
          include: { student: { include: { classArm: { include: { classLevel: true } } } } },
        });
        const m = (k: number) => formatMoney(k, school.currency);
        const billed = invoices.reduce((t, x) => t + x.totalKobo, 0);
        const paid = invoices.reduce((t, x) => t + x.paidKobo, 0);
        const owing = invoices.filter((x) => x.totalKobo > x.paidKobo);
        const overdue = owing.filter((x) => dateOnly(x.dueDate)! < school.today);
        const byArm = new Map<string, { b: number; p: number }>();
        for (const x of invoices) {
          const k = arm(x.student.classArm) ?? '-';
          const c = byArm.get(k) ?? { b: 0, p: 0 };
          c.b += x.totalKobo;
          c.p += x.paidKobo;
          byArm.set(k, c);
        }
        return {
          term: term.name,
          invoices: invoices.length,
          billed: m(billed),
          collected: m(paid),
          collectionRate: pct(paid, billed),
          outstanding: m(billed - paid),
          overdue: m(overdue.reduce((t, x) => t + x.totalKobo - x.paidKobo, 0)),
          overdueInvoices: overdue.length,
          byClass: [...byArm].map(([c, v]) => ({ class: c, rate: pct(v.p, v.b) })),
          largestBalances: owing
            .sort((a, b) => b.totalKobo - b.paidKobo - (a.totalKobo - a.paidKobo))
            .slice(0, 10)
            .map((x) => ({ studentId: x.studentId, name: fullName(x.student), class: arm(x.student.classArm), balance: m(x.totalKobo - x.paidKobo), due: dateOnly(x.dueDate), overdue: dateOnly(x.dueDate)! < school.today })),
        };
      },
    });

    this.add({
      name: 'staff_directory',
      description: 'Staff by name, job title or department: role, department, teaching or not, and contact details where the user may see them.',
      input: z.object({ query: z.string().optional(), department: z.string().optional() }),
      permissions: ['staff.read'],
      label: (i) => `Looked up staff${i.query ? ` (“${i.query}”)` : ''}`,
      run: async (i) => {
        const terms = i.query?.split(/\s+/).filter(Boolean) ?? [];
        const rows = await this.prisma.db.staff.findMany({
          where: {
            status: { not: 'EXITED' },
            ...(i.department ? { department: { name: { contains: i.department, mode: 'insensitive' } } } : {}),
            AND: terms.map((t) => ({ OR: [{ firstName: { contains: t, mode: 'insensitive' } }, { lastName: { contains: t, mode: 'insensitive' } }, { jobTitle: { contains: t, mode: 'insensitive' } }] })),
          },
          include: { department: true },
          take: 40,
          orderBy: { lastName: 'asc' },
        });
        const contact = this.can('hr.read');
        return rows.map((s) => ({ name: fullName(s), jobTitle: s.jobTitle, department: s.department?.name ?? null, type: s.type, status: s.status, ...(contact ? { phone: s.phone, email: s.email } : {}) }));
      },
    });

    this.add({
      name: 'hr_overview',
      description: 'Staff headcount by department, who is on leave today and soon, leave awaiting a decision, punctuality this month and work anniversaries.',
      input: z.object({}),
      permissions: ['hr.read'],
      label: () => 'Checked staff, leave and punctuality',
      run: async () => {
        const o = await this.hr.overview();
        return { headcount: o.headcount, byDepartment: o.byDepartment, leave: o.leave, punctuality: o.attendance, birthdaysThisMonth: o.birthdays.length, anniversaries: o.anniversaries, recognition: o.recognition.slice(0, 6) };
      },
    });

    this.add({
      name: 'timetable',
      description: "The published timetable for a class or a teacher, for one day or the whole week, with lesson times.",
      input: z.object({ className: z.string().optional(), teacherName: z.string().optional(), day: z.enum(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']).optional() }),
      permissions: ['timetable.read'],
      label: (i) => `Checked the timetable${i.className ? ` for ${i.className}` : i.teacherName ? ` for ${i.teacherName}` : ''}`,
      run: async (i) => {
        if (!i.className && !i.teacherName) throw new BadRequestException('Give a class or a teacher');
        const term = await this.term();
        const tt = term ? await this.prisma.db.timetable.findFirst({ where: { termId: term.id, status: 'PUBLISHED' }, orderBy: { publishedAt: 'desc' } }) : null;
        if (!tt) throw new NotFoundException('No published timetable this term');
        const armIds = i.className ? (await this.arms(i.className)).map((a) => a.id) : undefined;
        let teacherIds: string[] | undefined;
        if (i.teacherName) {
          const t = i.teacherName.split(/\s+/).filter(Boolean);
          teacherIds = (await this.prisma.db.staff.findMany({ where: { AND: t.map((w) => ({ OR: [{ firstName: { contains: w, mode: 'insensitive' } }, { lastName: { contains: w, mode: 'insensitive' } }] })) }, select: { id: true } })).map((s) => s.id);
        }
        const dayNo = i.day ? DAY_NAMES.indexOf(i.day) : undefined;
        const entries = await this.prisma.db.timetableEntry.findMany({
          where: { timetableId: tt.id, ...(armIds ? { classArmId: { in: armIds } } : {}), ...(teacherIds ? { teacherId: { in: teacherIds } } : {}), ...(dayNo ? { day: dayNo } : {}) },
          include: { subject: true, teacher: true, room: true, classArm: { include: { classLevel: true } } },
          orderBy: [{ day: 'asc' }, { period: 'asc' }],
        });
        const bell = tt.bellSchedule as unknown as BellSchedule;
        return entries.map((e) => ({ day: DAY_NAMES[e.day], time: `${bell.periods[e.period]?.start}–${bell.periods[e.period]?.end}`, class: arm(e.classArm), subject: e.subject.name, teacher: e.teacher ? fullName(e.teacher) : null, room: e.room?.name ?? null }));
      },
    });

    this.add({
      name: 'calendar',
      description: 'School events (holidays, exams, PTA meetings, trips…) between two dates (default: the next 30 days).',
      input: z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
      permissions: [],
      label: () => 'Checked the school calendar',
      run: async (i) => {
        const school = await this.school();
        const from = i.from ?? school.today;
        const to = i.to ?? new Date(Date.parse(`${from}T00:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10);
        const staff = this.can('school.read');
        const children = staff ? [] : await this.myChildren();
        const arms = new Set(children.map((c) => c.classArmId).filter((x): x is string => !!x));
        const rows = await this.prisma.db.schoolEvent.findMany({ where: { startDate: { lte: parseDate(to) }, OR: [{ startDate: { gte: parseDate(from) } }, { endDate: { gte: parseDate(from) } }] }, orderBy: { startDate: 'asc' }, take: 60 });
        return rows
          .filter((e) => staff || ((e.audience === 'EVERYONE' || e.audience === 'PARENTS' || e.audience === 'STUDENTS') && (!e.classArmIds.length || e.classArmIds.some((c) => arms.has(c)))))
          .map((e) => ({ title: e.title, category: e.category, date: dateOnly(e.startDate), endDate: dateOnly(e.endDate), time: e.allDay ? 'all day' : [e.startTime, e.endTime].filter(Boolean).join('–'), location: e.location, for: e.audience }));
      },
    });

    this.add({
      name: 'operations_overview',
      description: 'Library loans overdue, stock running low, buses over capacity, boarders away or late back, visitors on site and admissions follow-ups due — whichever the user may see.',
      input: z.object({}),
      permissions: ['school.read'],
      label: () => 'Checked library, stores, transport, hostel and reception',
      run: async () => {
        const db = this.prisma.db;
        const school = await this.school();
        const today = parseDate(school.today);
        const out: Record<string, unknown> = {};
        if (this.can('library.read')) out.library = { onLoan: await db.libraryLoan.count({ where: { returnedOn: null } }), overdue: await db.libraryLoan.count({ where: { returnedOn: null, dueOn: { lt: today } } }) };
        if (this.can('inventory.read')) {
          const items = await db.inventoryItem.findMany({ where: { isAsset: false, reorderLevel: { gt: 0 } } });
          out.lowStock = items.filter((x) => x.quantity <= x.reorderLevel).map((x) => `${x.name} (${x.quantity} ${x.unit})`);
        }
        if (this.can('transport.read')) {
          const routes = await db.transportRoute.findMany({ where: { active: true }, include: { vehicle: true, _count: { select: { assignments: true } } } });
          out.transport = routes.map((r) => ({ route: r.name, riders: r._count.assignments, seats: r.vehicle?.capacity ?? null }));
        }
        if (this.can('hostel.read')) out.hostel = { boarders: await db.hostelAllocation.count({ where: { active: true } }), awayOnExeat: await db.exeat.count({ where: { returnedAt: null } }), lateBack: await db.exeat.count({ where: { returnedAt: null, expectedReturnAt: { lt: new Date() } } }) };
        if (this.can('reception.read')) out.reception = { enquiriesOpen: await db.enquiry.count({ where: { status: { notIn: ['ENROLLED', 'CLOSED'] } } }), followUpsDue: await db.enquiry.count({ where: { status: { notIn: ['ENROLLED', 'CLOSED'] }, followUpOn: { lte: today } } }) };
        return out;
      },
    });

    this.add({
      name: 'at_risk_students',
      description: 'Students who need attention this term (low attendance, low results, with overdue fees and missed live classes as supporting signals), with reasons. Optionally one class.',
      input: z.object({ className: z.string().optional(), limit: z.number().int().min(1).max(40).optional() }),
      permissions: ['students.read', 'attendance.read'],
      label: (i) => `Checked students at risk${i.className ? ` in ${i.className}` : ''}`,
      run: async (i) => {
        const armIds = i.className ? (await this.arms(i.className)).map((a) => a.id) : [undefined];
        const lists = await Promise.all(armIds.map((id) => this.insights.atRisk({ classArmId: id, limit: i.limit ?? 15 })));
        const school = await this.school();
        return {
          counts: lists.reduce((t, l) => ({ high: t.high + l.counts.high, medium: t.medium + l.counts.medium }), { high: 0, medium: 0 }),
          students: lists.flatMap((l) => l.students).slice(0, i.limit ?? 15).map((s) => ({ ...s, overdue: s.overdueKobo !== null ? formatMoney(s.overdueKobo, school.currency) : null })),
        };
      },
    });

    this.add({
      name: 'recent_messages',
      description: 'Messages recently sent or scheduled to parents and staff: title, audience, channels, status and delivery counts.',
      input: z.object({ limit: z.number().int().min(1).max(20).optional(), status: z.enum(BROADCAST_STATUSES).optional() }),
      permissions: ['comms.read'],
      label: () => 'Checked recent messages',
      run: async (i) => {
        const rows = await this.prisma.db.broadcast.findMany({ where: i.status ? { status: i.status } : { status: { not: 'CANCELLED' } }, orderBy: { createdAt: 'desc' }, take: i.limit ?? 10 });
        const counts = await this.prisma.db.delivery.groupBy({ by: ['broadcastId', 'status'], where: { broadcastId: { in: rows.map((r) => r.id) } }, _count: { _all: true } });
        const n = (id: string, s: string) => counts.find((c) => c.broadcastId === id && c.status === s)?._count._all ?? 0;
        return rows.map((b) => ({ title: b.title, audience: b.audienceSummary, channels: b.channels, status: b.status, source: b.source, date: (b.sentAt ?? b.scheduledAt ?? b.createdAt).toISOString().slice(0, 10), delivered: n(b.id, 'SENT'), failed: n(b.id, 'FAILED') }));
      },
    });

    // ---------------------------------------------------------- family tools

    this.add({
      name: 'my_children',
      description: "The signed-in parent's children: class, attendance this term, latest report-card remarks, fee balance, homework due, upcoming live classes and recent class notes.",
      input: z.object({}),
      permissions: [],
      label: () => 'Looked at your children’s records',
      run: async () => {
        const kids = await this.myChildren();
        if (!kids.length) return { children: [], note: 'No children are linked to this account yet — the school office can link them.' };
        const [term, school] = await Promise.all([this.term(), this.school()]);
        const db = this.prisma.db;
        const now = new Date();
        return {
          children: await Promise.all(
            kids.map(async (k) => {
              const [att, report, invoice, homework, live, notes] = await Promise.all([
                term ? this.attendanceCounts({ studentId: k.id, date: { gte: term.startsOn, lte: term.endsOn } }) : null,
                db.reportCard.findFirst({ where: { studentId: k.id, status: 'PUBLISHED' }, include: { term: true }, orderBy: { publishedAt: 'desc' } }),
                term ? db.invoice.findFirst({ where: { studentId: k.id, termId: term.id, status: { not: 'CANCELLED' } } }) : null,
                k.classArmId ? db.homework.findMany({ where: { classArmId: k.classArmId, status: 'PUBLISHED', dueDate: { gte: parseDate(school.today) } }, include: { subject: true }, orderBy: { dueDate: 'asc' }, take: 6 }) : [],
                k.classArmId ? db.liveClass.findMany({ where: { classArmId: k.classArmId, status: { not: 'CANCELLED' }, endsAt: { gte: now } }, include: { subject: true }, orderBy: { startsAt: 'asc' }, take: 5 }) : [],
                k.classArmId ? db.liveClass.findMany({ where: { classArmId: k.classArmId, summarySharedAt: { not: null } }, orderBy: { startsAt: 'desc' }, take: 3 }) : [],
              ]);
              return {
                name: k.firstName,
                class: arm(k.classArm),
                attendanceThisTerm: att,
                latestReport: report ? { term: report.term.name, classTeacher: report.teacherRemark, principal: report.principalRemark } : null,
                fees: invoice ? { balance: formatMoney(invoice.totalKobo - invoice.paidKobo, school.currency), due: dateOnly(invoice.dueDate), paid: invoice.totalKobo <= invoice.paidKobo } : null,
                homeworkDue: homework.map((h) => ({ title: h.title, subject: h.subject?.name ?? null, due: dateOnly(h.dueDate) })),
                upcomingLiveClasses: live.map((l) => ({ title: l.title, subject: l.subject?.name ?? null, startsAt: l.startsAt.toISOString() })),
                recentClassNotes: notes.map((n) => ({ date: dateOnly(n.startsAt), topic: (n.intelligence as { topic?: string } | null)?.topic ?? n.title })),
              };
            }),
          ),
        };
      },
    });

    this.add({
      name: 'my_learning',
      description: "The signed-in student's own class: today's lessons, homework due, upcoming live classes and recent class notes.",
      input: z.object({}),
      permissions: [],
      label: () => 'Looked at your timetable and homework',
      run: async () => {
        const me = await this.prisma.db.student.findFirst({ where: { userId: currentContext().userId, status: 'ACTIVE' }, include: { classArm: { include: { classLevel: true } } } });
        if (!me?.classArmId) return { note: 'This account is not linked to a student in a class yet.' };
        const school = await this.school();
        const db = this.prisma.db;
        const term = await this.term();
        const tt = term ? await db.timetable.findFirst({ where: { termId: term.id, status: 'PUBLISHED' } }) : null;
        const day = weekdayOf(school.today);
        const lessons = tt ? await db.timetableEntry.findMany({ where: { timetableId: tt.id, classArmId: me.classArmId, day }, include: { subject: true }, orderBy: { period: 'asc' } }) : [];
        const bell = tt?.bellSchedule as unknown as BellSchedule | undefined;
        const [homework, notes] = await Promise.all([
          db.homework.findMany({ where: { classArmId: me.classArmId, status: 'PUBLISHED', dueDate: { gte: parseDate(school.today) } }, include: { subject: true }, orderBy: { dueDate: 'asc' } }),
          db.liveClass.findMany({ where: { classArmId: me.classArmId, summarySharedAt: { not: null } }, orderBy: { startsAt: 'desc' }, take: 3 }),
        ]);
        return {
          name: me.firstName,
          class: arm(me.classArm),
          today: lessons.map((l) => ({ time: bell ? `${bell.periods[l.period]?.start}–${bell.periods[l.period]?.end}` : null, subject: l.subject.name })),
          homeworkDue: homework.map((h) => ({ title: h.title, subject: h.subject?.name ?? null, due: dateOnly(h.dueDate), questions: h.questions })),
          classNotes: notes.map((n) => {
            const ai = n.intelligence as { topic?: string; summary?: string; keyConcepts?: string[] } | null;
            return { date: dateOnly(n.startsAt), topic: ai?.topic ?? n.title, summary: ai?.summary ?? null, keyConcepts: ai?.keyConcepts ?? [] };
          }),
        };
      },
    });

    // ---------------------------------------------------------- draft-only actions

    this.add({
      name: 'draft_message',
      description:
        'Prepare (not send) a message to parents or staff. It is saved as a draft for the user to review, adjust and send from Messages. ' +
        'Use {{first_name}}, {{children}} and {{balance}} placeholders to personalise.',
      input: z.object({
        audience: z.enum(['ALL_PARENTS', 'CLASS_PARENTS', 'FEE_DEBTORS', 'ALL_STAFF']),
        className: z.string().optional().describe('For CLASS_PARENTS: a class arm like "JSS 1 A" or a level like "JSS 1"'),
        channels: z.array(z.enum(CHANNELS)).min(1).optional().describe('Default: IN_APP and SMS'),
        title: z.string().min(2).max(120).describe('Internal title'),
        subject: z.string().min(2).max(160),
        body: z.string().min(10).max(5000),
        smsBody: z.string().max(300).optional().describe('Plain ASCII, under 160 characters if possible'),
      }),
      permissions: ['comms.send'],
      label: (i) => `Prepared a draft message: ${i.title}`,
      run: async (i, ctx) => {
        let audience: Audience;
        if (i.audience === 'CLASS_PARENTS') {
          if (!i.className) throw new BadRequestException('Name the class for CLASS_PARENTS');
          audience = { type: 'CLASS_PARENTS', classArmIds: (await this.arms(i.className)).map((a) => a.id), classLevelIds: [], primaryOnly: true };
        } else if (i.audience === 'FEE_DEBTORS') audience = { type: 'FEE_DEBTORS', minBalanceKobo: 0, overdueOnly: true, primaryOnly: true };
        else if (i.audience === 'ALL_STAFF') audience = { type: 'ALL_STAFF' };
        else audience = { type: 'ALL_PARENTS', primaryOnly: true };
        const channels = i.channels ?? ['IN_APP', 'SMS'];
        const { contacts, summary } = await this.sender.contactsFor(currentTenantId(), audience, false);
        const b = await this.prisma.db.broadcast.create({
          data: {
            tenantId: currentTenantId(),
            title: i.title,
            channels,
            audience: audience as unknown as Prisma.InputJsonValue,
            audienceSummary: summary,
            subject: i.subject,
            body: i.body,
            smsBody: i.smsBody ?? null,
            source: 'MANUAL',
            createdById: currentContext().userId,
          },
        });
        const link = `/messages/${b.id}/edit`;
        ctx.actions.push({ kind: 'DRAFT_MESSAGE', label: `Review draft: ${i.title} (${contacts.length} recipients)`, link });
        return { draftId: b.id, status: 'DRAFT — not sent', audience: summary, recipients: contacts.length, channels, reviewAt: link };
      },
    });

    this.add({
      name: 'draft_homework',
      description: 'Prepare (not publish) homework for a class. It is saved as a draft for the teacher to review and publish from Homework.',
      input: z.object({
        className: z.string().min(1).describe('A class arm like "JSS 1 A"'),
        subject: z.string().optional(),
        title: z.string().min(2).max(160),
        instructions: z.string().min(2).max(3000),
        questions: z.array(z.string().min(2).max(1000)).max(30).optional(),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
      permissions: ['homework.manage'],
      label: (i) => `Prepared draft homework for ${i.className}: ${i.title}`,
      run: async (i, ctx) => {
        const [a] = await this.arms(i.className);
        if (!a) throw new NotFoundException('Class not found');
        const db = this.prisma.db;
        const subject = i.subject ? await db.subject.findFirst({ where: { OR: [{ name: { equals: i.subject, mode: 'insensitive' } }, { code: { equals: i.subject, mode: 'insensitive' } }] } }) : null;
        const me = await db.staff.findFirst({ where: { userId: currentContext().userId } });
        if (!this.can('live.manage')) {
          const teaches = me && (a.classTeacherId === me.id || (await db.classSubject.count({ where: { classArmId: a.id, teacherId: me.id, ...(subject ? { subjectId: subject.id } : {}) } })) > 0);
          if (!teaches) throw new ForbiddenException('You can only set homework for the classes you teach');
        }
        const school = await this.school();
        if (i.dueDate < school.today) throw new BadRequestException('The due date has passed');
        const h = await db.homework.create({
          data: { tenantId: currentTenantId(), classArmId: a.id, subjectId: subject?.id ?? null, teacherId: me?.id ?? null, title: i.title, instructions: i.instructions, questions: i.questions ?? [], dueDate: parseDate(i.dueDate), status: 'DRAFT', source: 'AI', createdById: currentContext().userId },
        });
        ctx.actions.push({ kind: 'DRAFT_HOMEWORK', label: `Review draft homework: ${i.title} (${arm(a)})`, link: '/homework?status=DRAFT' });
        return { homeworkId: h.id, status: 'DRAFT — not published', class: arm(a), subject: subject?.name ?? null, due: i.dueDate };
      },
    });
  }
}
