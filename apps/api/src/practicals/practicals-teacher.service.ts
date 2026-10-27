import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { isSimulatorId, type CriterionScore, type PracticalClassView, type PracticalPickList, type PracticalTeacherAttemptRow, type PracticalTeacherAttemptView } from '@aischool/shared';
import type { Prisma } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { ClassInsightsService } from '../class-insights/class-insights.service';
import { fullName } from '../common/format';
import { currentContext, currentUserId } from '../common/request-context';
import { subjectKey } from '../learning/mastery.service';
import { PrismaService } from '../prisma/prisma.service';
import { PracticalHomeworkService } from './practical-homework.service';
import { PracticalsService, effectiveScore, lessonData, percentOf, type StoredOverride } from './practicals.service';

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

/**
 * Practical Academy for teachers: their classes' lab and practical-question
 * attempts, class averages per practical, per skill and per rubric criterion,
 * and review of a lab's marks with an audited score override. Access follows
 * Class insights (academics.read or homework.manage; the classes and subjects
 * they teach or lead, everything for academic managers); overriding also needs
 * results.enter or homework.manage.
 */
@Injectable()
export class PracticalsTeacherService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly insights: ClassInsightsService,
    private readonly practicals: PracticalsService,
    private readonly audit: AuditService,
    private readonly homework: PracticalHomeworkService,
  ) {}

  async classView(classArmId?: string, subjectName?: string): Promise<PracticalClassView> {
    const opts = await this.insights.options();
    const lessonSubjects = new Set((await this.prisma.root.practicalLesson.findMany({ select: { subject: true }, distinct: ['subject'] })).map((l) => l.subject));
    const classes = opts.classes
      .map((c) => ({ classArmId: c.classArmId, label: c.label, subjects: [...new Set(c.subjects.map((s) => subjectKey(s.name)).filter((k) => lessonSubjects.has(k)))].sort() }))
      .filter((c) => c.subjects.length);
    const cls = classes.find((c) => c.classArmId === classArmId) ?? classes[0];
    const empty: PracticalClassView = { classes, classArmId: cls?.classArmId ?? null, subject: null, students: [], attempts: [], practicals: [], skills: [], criteria: [] };
    if (!cls) return empty;
    const subject = cls.subjects.find((s) => s === (subjectName ? subjectKey(subjectName) : '')) ?? cls.subjects[0]!;
    const students = await this.prisma.db.student.findMany({ where: { classArmId: cls.classArmId, status: 'ACTIVE' }, select: { id: true, firstName: true, lastName: true }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] });
    const ids = students.map((s) => s.id);
    const lessons = await this.practicals.lessons({ subject });
    const byId = new Map(lessons.map((l) => [l.id, l]));
    const [labs, questions] = await Promise.all([
      this.prisma.db.practicalAttempt.findMany({ where: { studentId: { in: ids }, mode: { in: ['LAB', 'EXAM'] }, practicalId: { in: lessons.map((l) => l.id) } }, orderBy: { startedAt: 'desc' }, take: 500 }),
      // Practical-question practice (Academy practice and Paper 3 of a full mock): written attempts with "practical" in the title.
      this.prisma.db.practiceAttempt.findMany({ where: { studentId: { in: ids }, mode: 'THEORY', subject, title: { contains: 'ractical' } }, orderBy: { startedAt: 'desc' }, take: 300 }),
    ]);
    const nameOf = new Map(students.map((s) => [s.id, `${s.lastName} ${s.firstName}`]));
    const attempts: PracticalTeacherAttemptRow[] = [
      ...labs.map((a) => ({ ...this.practicals.row(a, byId.get(a.practicalId)?.title ?? a.practicalId), studentId: a.studentId, student: nameOf.get(a.studentId) ?? 'Student', subject, kind: 'LAB' as const })),
      ...questions.map((q) => ({
        id: q.id,
        practicalId: '',
        title: q.title,
        simulatorId: null,
        mode: 'LAB' as const,
        startedAt: q.startedAt.toISOString(),
        submittedAt: q.submittedAt?.toISOString() ?? null,
        score: q.submittedAt ? q.score : null,
        maxScore: q.total,
        percent: q.submittedAt ? percentOf(q.score, q.total) : null,
        reviewed: false,
        studentId: q.studentId,
        student: nameOf.get(q.studentId) ?? 'Student',
        subject,
        kind: 'QUESTIONS' as const,
      })),
    ].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    const marked = labs.filter((a) => a.submittedAt);
    const pct = (a: (typeof labs)[number]) => percentOf(effectiveScore(a), a.maxScore) ?? 0;
    const skills = new Map<string, number[]>();
    for (const a of marked) for (const s of lessonData(byId.get(a.practicalId)!).skills ?? []) skills.set(s, [...(skills.get(s) ?? []), pct(a)]);
    const criteria = new Map<string, { simulatorId: string; id: string; label: string; values: number[] }>();
    for (const a of marked) {
      for (const c of (a.scores as unknown as CriterionScore[] | null) ?? []) {
        const k = `${a.simulatorId}|${c.id}`;
        const row = criteria.get(k) ?? { simulatorId: a.simulatorId ?? '', id: c.id, label: c.label, values: [] };
        row.values.push(c.max ? (100 * c.awarded) / c.max : 0);
        criteria.set(k, row);
      }
    }
    return {
      classes,
      classArmId: cls.classArmId,
      subject,
      students: students.map((s) => {
        const mine = marked.filter((a) => a.studentId === s.id);
        return { id: s.id, name: `${s.lastName} ${s.firstName}`, labs: mine.length, questions: questions.filter((q) => q.studentId === s.id && q.submittedAt).length, average: avg(mine.map(pct)) };
      }),
      attempts,
      practicals: lessons
        .filter((l) => labs.some((a) => a.practicalId === l.id))
        .map((l) => {
          const mine = marked.filter((a) => a.practicalId === l.id);
          return { practicalId: l.id, title: l.title, attempts: mine.length, students: new Set(mine.map((a) => a.studentId)).size, average: avg(mine.map(pct)) };
        }),
      skills: [...skills].map(([skill, xs]) => ({ skill, attempts: xs.length, average: avg(xs) })).sort((a, b) => (a.average ?? 0) - (b.average ?? 0)),
      criteria: [...criteria.values()].map((c) => ({ simulatorId: c.simulatorId, id: c.id, label: c.label, attempts: c.values.length, average: avg(c.values) })).sort((a, b) => (a.average ?? 0) - (b.average ?? 0)),
    };
  }

  /**
   * Practicals to set as homework: those of the school subject (matched by
   * subject key), or every subject's, filtered by title or topic.
   */
  async pickList(subjectId?: string, q?: string): Promise<PracticalPickList> {
    const name = subjectId ? (await this.prisma.db.subject.findUnique({ where: { id: subjectId }, select: { name: true } }))?.name : null;
    if (subjectId && !name) throw new NotFoundException('Subject not found');
    const subject = name ? subjectKey(name) : null;
    const words = (q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    const lessons = await this.practicals.lessons(subject ? { subject } : {});
    if (subject && !lessons.length) return { subject: null, practicals: [] };
    return {
      subject,
      practicals: lessons
        .map((l) => ({ id: l.id, title: l.title, subject: l.subject, topic: l.topic?.name ?? l.topicName, topicId: l.topicId, lab: isSimulatorId(l.simulator) }))
        .filter((l) => words.every((w) => `${l.title} ${l.topic} ${l.subject}`.toLowerCase().includes(w)))
        .slice(0, 100),
    };
  }

  /** The attempt, if the signed-in teacher may see this student's work in the practical's subject. */
  private async visible(id: string) {
    const a = await this.prisma.db.practicalAttempt.findFirst({ where: { id, mode: { in: ['LAB', 'EXAM'] } } });
    if (!a) throw new NotFoundException('Lab attempt not found');
    const scope = await this.insights.scope();
    const lesson = await this.practicals.lesson(a.practicalId).catch(() => null);
    const student = await this.prisma.db.student.findUnique({ where: { id: a.studentId }, select: { firstName: true, lastName: true, classArmId: true, classArm: { select: { subjects: { select: { subjectId: true, subject: { select: { name: true } } } } } } } });
    const subject = lesson?.subject ?? null;
    const subjectIds = student?.classArm?.subjects.filter((s) => subject && subjectKey(s.subject.name) === subject).map((s) => s.subjectId) ?? [];
    const ok = scope.manage || (!!student?.classArmId && (scope.leads.has(student.classArmId) || subjectIds.some((sid) => this.insights.canView(scope, student.classArmId!, sid))));
    if (!ok) throw new ForbiddenException('You can only see practical work for the classes and subjects you teach');
    const p = currentContext().permissions;
    return { a, lesson, student, canOverride: scope.manage || p.has('results.enter') || p.has('homework.manage') };
  }

  async attempt(id: string): Promise<PracticalTeacherAttemptView> {
    const { a, lesson, student, canOverride } = await this.visible(id);
    return { ...(await this.practicals.view(a, lesson)), studentId: a.studentId, student: student ? fullName(student) : 'Student', canOverride: canOverride && !!a.submittedAt };
  }

  /** A teacher's reviewed score replaces the marked one (kept alongside it) and is audited; the student sees "Reviewed by your teacher". */
  async override(id: string, input: { score: number; note: string }): Promise<PracticalTeacherAttemptView> {
    const { a, canOverride } = await this.visible(id);
    if (!canOverride) throw new ForbiddenException('Reviewing marks needs results entry or homework permission');
    if (!a.submittedAt) throw new BadRequestException('This lab has not been handed in yet');
    if (input.score > a.maxScore) throw new BadRequestException(`The score can be at most ${a.maxScore}`);
    const userId = currentUserId();
    const me = await this.prisma.root.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
    const before = effectiveScore(a);
    const value: StoredOverride = { score: Math.round(input.score * 2) / 2, note: input.note, byUserId: userId, by: me ? fullName(me) : 'Teacher', at: new Date().toISOString() };
    await this.prisma.db.practicalAttempt.update({ where: { id }, data: { override: value as unknown as Prisma.InputJsonValue, reviewedById: userId, reviewedAt: new Date() } });
    await this.practicals.remasterLab(a, value.score);
    // Homework this lab handed in follows the reviewed score.
    await this.homework.handIn(a, { force: true });
    await this.audit.log({
      action: 'practical.override',
      summary: `Reviewed a ${isSimulatorId(a.simulatorId) ? a.simulatorId : 'lab'} attempt: ${before ?? '—'} → ${value.score}/${a.maxScore}`,
      entityType: 'PracticalAttempt',
      entityId: a.id,
      metadata: { studentId: a.studentId, practicalId: a.practicalId, from: before, to: value.score, marked: a.score, note: input.note },
    });
    return this.attempt(id);
  }
}
