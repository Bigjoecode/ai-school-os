import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import {
  CBT_GRACE_SECONDS,
  OBJECTIVE_TYPES,
  type AssessmentComponent,
  type CbtAttemptStatus,
  type CbtExamStatus,
  type CbtExamSummary,
  type CbtPhase,
  type CbtRosterRow,
  type CbtShowResults,
  type QuestionType,
} from '@aischool/shared';
import { randomInt } from 'node:crypto';
import type { OnlineExam, OnlineExamAttempt, Prisma } from '../generated/prisma/client';
import { fullName } from '../common/format';
import { currentContext } from '../common/request-context';
import { registerTickTask } from '../common/tick-tasks';
import { PrismaService } from '../prisma/prisma.service';
import { AssessmentSettingsService } from '../assessment/assessment-settings.service';

/** One question as this student sees it: `order[displayed] = original option index`. */
export interface LayoutItem {
  id: string;
  type: QuestionType;
  marks: number;
  /** The key at the time the student started, so later edits in the bank can't change their mark. */
  correct: number | null;
  order: number[];
}
export interface Layout {
  v: 1;
  items: LayoutItem[];
}
/** Stored answers: original option index for objective questions, text for written ones. */
export type StoredAnswers = Record<string, number | string | null>;

export const paperInclude = {
  subject: { select: { id: true, name: true } },
  classLevel: { select: { id: true, name: true } },
  term: { select: { id: true, name: true, session: { select: { name: true } } } },
  items: {
    orderBy: { order: 'asc' },
    include: { question: { select: { id: true, type: true, topic: true, stem: true, options: true, correctIndex: true, answer: true, markingGuide: true, marks: true } } },
  },
} satisfies Prisma.ExamPaperInclude;
export type PaperRow = Prisma.ExamPaperGetPayload<{ include: typeof paperInclude }>;

export interface StaffScope {
  userId: string;
  /** Sees and manages every class (academics.manage or results.publish). */
  all: boolean;
  manage: boolean;
  teaches: Set<string>;
  leads: Set<string>;
}

export const isObjective = (t: QuestionType) => OBJECTIVE_TYPES.includes(t);
export const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function phaseOf(e: Pick<OnlineExam, 'status' | 'opensAt' | 'closesAt'>, now = new Date()): CbtPhase {
  if (e.status === 'DRAFT') return 'DRAFT';
  if (e.status === 'CLOSED' || now >= e.closesAt) return 'ENDED';
  return now < e.opensAt ? 'UPCOMING' : 'OPEN';
}

export const layoutOf = (a: Pick<OnlineExamAttempt, 'layout'>) => a.layout as unknown as Layout;
export const answersOf = (a: Pick<OnlineExamAttempt, 'answers'>) => (a.answers ?? {}) as unknown as StoredAnswers;
export const theoryMarksOf = (a: Pick<OnlineExamAttempt, 'theoryMarks'>) => (a.theoryMarks ?? {}) as unknown as Record<string, number>;

export function isAnswered(v: number | string | null | undefined) {
  return typeof v === 'number' || (typeof v === 'string' && v.trim().length > 0);
}

/**
 * Online exams (CBT): the shared rules — who may see or run an exam, the
 * per-student layout, marking and auto-submission when time runs out.
 */
@Injectable()
export class CbtService implements OnModuleInit {
  private readonly logger = new Logger(CbtService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AssessmentSettingsService,
  ) {}

  onModuleInit() {
    registerTickTask('cbtAutoSubmitted', () => this.sweep());
  }

  // ---------------------------------------------------------- staff access

  async staffScope(): Promise<StaffScope> {
    const ctx = currentContext();
    const staff = await this.prisma.db.staff.findFirst({
      where: { userId: ctx.userId },
      include: { classSubjects: { select: { classArmId: true, subjectId: true } }, classesLed: { select: { id: true } } },
    });
    return {
      userId: ctx.userId!,
      all: ctx.permissions.has('academics.manage') || ctx.permissions.has('results.publish'),
      manage: ctx.permissions.has('assessment.manage'),
      teaches: new Set(staff?.classSubjects.map((c) => `${c.classArmId}|${c.subjectId}`) ?? []),
      leads: new Set(staff?.classesLed.map((c) => c.id) ?? []),
    };
  }

  teachesArm(s: StaffScope, armId: string, subjectId: string) {
    return s.all || s.teaches.has(`${armId}|${subjectId}`) || s.leads.has(armId);
  }

  canSee(s: StaffScope, e: Pick<OnlineExam, 'classArmIds' | 'createdById'>, subjectId: string) {
    return s.all || e.createdById === s.userId || e.classArmIds.some((a) => this.teachesArm(s, a, subjectId));
  }

  canManage(s: StaffScope, e: Pick<OnlineExam, 'classArmIds'>, subjectId: string) {
    return s.manage && e.classArmIds.every((a) => this.teachesArm(s, a, subjectId));
  }

  /** The exam with its paper, for a member of staff allowed to see it (or manage it). */
  async staffExam(id: string, need: 'see' | 'manage' = 'see') {
    const exam = await this.prisma.db.onlineExam.findUnique({ where: { id } });
    if (!exam) throw new NotFoundException('Online exam not found');
    const paper = await this.prisma.db.examPaper.findUnique({ where: { id: exam.paperId }, include: paperInclude });
    if (!paper) throw new NotFoundException('The exam paper for this online exam was deleted');
    const scope = await this.staffScope();
    if (!this.canSee(scope, exam, paper.subjectId)) throw new NotFoundException('Online exam not found');
    const canManage = this.canManage(scope, exam, paper.subjectId);
    if (need === 'manage' && !canManage) throw new ForbiddenException('Only the teacher of these classes (or an academic manager) can do that');
    return { exam, paper, scope, canManage };
  }

  // ---------------------------------------------------------- summaries

  async summaries(exams: OnlineExam[], scope: StaffScope): Promise<CbtExamSummary[]> {
    if (!exams.length) return [];
    const db = this.prisma.db;
    const armIds = [...new Set(exams.flatMap((e) => e.classArmIds))];
    const [papers, arms, students, attempts, { components }] = await Promise.all([
      db.examPaper.findMany({ where: { id: { in: [...new Set(exams.map((e) => e.paperId))] } }, include: paperInclude }),
      db.classArm.findMany({ where: { id: { in: armIds } }, include: { classLevel: { select: { name: true } } } }),
      db.student.groupBy({ by: ['classArmId'], where: { classArmId: { in: armIds }, status: 'ACTIVE' }, _count: { _all: true } }),
      db.onlineExamAttempt.groupBy({ by: ['examId', 'status'], where: { examId: { in: exams.map((e) => e.id) } }, _count: { _all: true } }),
      this.settings.get(),
    ]);
    const paperById = new Map(papers.map((p) => [p.id, p]));
    const armById = new Map(arms.map((a) => [a.id, a]));
    const perArm = new Map(students.map((s) => [s.classArmId, s._count._all]));
    return exams.flatMap((e) => {
      const p = paperById.get(e.paperId);
      if (!p) return [];
      const count = (st: CbtAttemptStatus) => attempts.find((a) => a.examId === e.id && a.status === st)?._count._all ?? 0;
      return [
        this.summary(e, p, components, {
          arms: e.classArmIds.map((id) => armById.get(id)).filter((a) => !!a).map((a) => ({ id: a.id, name: `${a.classLevel.name} ${a.name}` })),
          students: e.classArmIds.reduce((n, id) => n + (perArm.get(id) ?? 0), 0),
          inProgress: count('IN_PROGRESS'),
          submitted: count('SUBMITTED'),
          marked: count('MARKED'),
          canManage: this.canManage(scope, e, p.subjectId),
        }),
      ];
    });
  }

  summary(
    e: OnlineExam,
    p: PaperRow,
    components: AssessmentComponent[],
    x: { arms: { id: string; name: string }[]; students: number; inProgress: number; submitted: number; marked: number; canManage: boolean },
  ): CbtExamSummary {
    return {
      id: e.id,
      title: e.title,
      status: e.status as CbtExamStatus,
      phase: phaseOf(e),
      paper: {
        id: p.id,
        title: p.title,
        questionCount: p.items.length,
        totalMarks: p.items.reduce((n, i) => n + i.question.marks, 0),
        hasWritten: p.items.some((i) => !isObjective(i.question.type)),
      },
      subject: p.subject,
      classLevel: p.classLevel,
      term: { id: p.term.id, name: p.term.name, sessionName: p.term.session.name },
      component: components.find((c) => c.key === p.componentKey) ?? null,
      classArms: x.arms,
      opensAt: e.opensAt.toISOString(),
      closesAt: e.closesAt.toISOString(),
      durationMinutes: e.durationMinutes,
      shuffleQuestions: e.shuffleQuestions,
      shuffleOptions: e.shuffleOptions,
      showResults: e.showResults as CbtShowResults,
      sendToScores: e.sendToScores,
      accessCode: x.canManage ? e.accessCode : e.accessCode ? '••••' : null,
      resultsReleasedAt: e.resultsReleasedAt?.toISOString() ?? null,
      counts: { students: x.students, started: x.inProgress + x.submitted + x.marked, inProgress: x.inProgress, submitted: x.submitted + x.marked, marked: x.marked },
      canManage: x.canManage,
      createdAt: e.createdAt.toISOString(),
    };
  }

  /** Everyone expected to sit (active students in the classes) plus anyone who already started. */
  async roster(exam: OnlineExam, now = new Date()): Promise<CbtRosterRow[]> {
    const db = this.prisma.db;
    const [attempts, enrolled] = await Promise.all([
      db.onlineExamAttempt.findMany({ where: { examId: exam.id } }),
      db.student.findMany({ where: { classArmId: { in: exam.classArmIds }, status: 'ACTIVE' }, select: { id: true } }),
    ]);
    const ids = [...new Set([...enrolled.map((s) => s.id), ...attempts.map((a) => a.studentId)])];
    const students = await db.student.findMany({
      where: { id: { in: ids } },
      select: { id: true, firstName: true, lastName: true, admissionNumber: true, classArm: { select: { name: true, classLevel: { select: { name: true } } } } },
    });
    const byStudent = new Map(attempts.map((a) => [a.studentId, a]));
    return students
      .map((s): CbtRosterRow => {
        const a = byStudent.get(s.id);
        const student = { id: s.id, name: fullName(s), admissionNumber: s.admissionNumber, classArm: s.classArm ? `${s.classArm.classLevel.name} ${s.classArm.name}` : null };
        if (!a) {
          return { student, attemptId: null, status: 'NOT_STARTED', startedAt: null, endsAt: null, submittedAt: null, secondsLeft: null, answered: 0, focusLosses: 0, lastSeenAt: null, objectiveScore: null, score: null, total: null, percent: null, timeTakenSeconds: null, writtenToMark: 0, ip: null };
        }
        const layout = layoutOf(a);
        const answers = answersOf(a);
        const marks = theoryMarksOf(a);
        const status = a.status as CbtAttemptStatus;
        return {
          student,
          attemptId: a.id,
          status,
          startedAt: a.startedAt.toISOString(),
          endsAt: a.endsAt.toISOString(),
          submittedAt: a.submittedAt?.toISOString() ?? null,
          secondsLeft: status === 'IN_PROGRESS' ? Math.max(0, Math.round((a.endsAt.getTime() - now.getTime()) / 1000)) : null,
          answered: layout.items.filter((i) => isAnswered(answers[i.id])).length,
          focusLosses: a.focusLosses,
          lastSeenAt: a.updatedAt.toISOString(),
          objectiveScore: a.objectiveScore,
          score: a.score,
          total: a.total,
          percent: a.score != null && a.total ? round1((a.score / a.total) * 100) : null,
          timeTakenSeconds: a.submittedAt ? Math.round((a.submittedAt.getTime() - a.startedAt.getTime()) / 1000) : null,
          writtenToMark: status === 'IN_PROGRESS' ? 0 : layout.items.filter((i) => !isObjective(i.type) && typeof marks[i.id] !== 'number').length,
          ip: a.ip,
        };
      })
      .sort((x, y) => (x.student.classArm ?? '').localeCompare(y.student.classArm ?? '') || x.student.name.localeCompare(y.student.name));
  }

  // ---------------------------------------------------------- attempts

  /** A fresh, randomised layout for one student. */
  buildLayout(exam: OnlineExam, paper: PaperRow): Layout {
    // Objective questions stay ahead of written ones; each section is shuffled on its own.
    const objective = paper.items.filter((i) => isObjective(i.question.type));
    const written = paper.items.filter((i) => !isObjective(i.question.type));
    const ordered = exam.shuffleQuestions ? [...shuffle(objective), ...shuffle(written)] : [...objective, ...written];
    return {
      v: 1,
      items: ordered.map(({ question: q }) => {
        const identity = q.options.map((_, i) => i);
        // True/False keeps its natural order.
        const order = isObjective(q.type) ? (exam.shuffleOptions && q.type === 'MULTIPLE_CHOICE' ? shuffle(identity) : identity) : [];
        return { id: q.id, type: q.type, marks: q.marks, correct: isObjective(q.type) ? q.correctIndex : null, order };
      }),
    };
  }

  /** Objective marks, totals and status from the stored answers and any teacher marks. */
  computeMarks(layout: Layout, answers: StoredAnswers, theory: Record<string, number>) {
    let objective = 0;
    let written = 0;
    let allWrittenMarked = true;
    for (const item of layout.items) {
      if (isObjective(item.type)) {
        if (item.correct != null && answers[item.id] === item.correct) objective += item.marks;
      } else if (typeof theory[item.id] === 'number') {
        written += theory[item.id]!;
      } else {
        allWrittenMarked = false;
      }
    }
    const total = layout.items.reduce((n, i) => n + i.marks, 0);
    return {
      objectiveScore: round2(objective),
      score: allWrittenMarked ? round2(objective + written) : null,
      total,
      status: (allWrittenMarked ? 'MARKED' : 'SUBMITTED') as CbtAttemptStatus,
    };
  }

  /**
   * Hands in an attempt: marks objective questions, gives blank written
   * answers 0 and works out the status. Safe to call twice or concurrently
   * (the row is locked, and only an attempt still in progress is changed).
   */
  async finalize(attemptId: string, now = new Date()): Promise<boolean> {
    return this.prisma.root.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM online_exam_attempts WHERE id = ${attemptId} FOR UPDATE`;
      const a = await tx.onlineExamAttempt.findUnique({ where: { id: attemptId } });
      if (!a || a.status !== 'IN_PROGRESS') return false;
      const layout = layoutOf(a);
      const answers = answersOf(a);
      const theory = { ...theoryMarksOf(a) };
      for (const item of layout.items) {
        if (!isObjective(item.type) && !isAnswered(answers[item.id]) && typeof theory[item.id] !== 'number') theory[item.id] = 0;
      }
      const m = this.computeMarks(layout, answers, theory);
      await tx.onlineExamAttempt.update({
        where: { id: a.id },
        data: {
          status: m.status,
          submittedAt: now < a.endsAt ? now : a.endsAt,
          objectiveScore: m.objectiveScore,
          score: m.score,
          total: m.total,
          theoryMarks: theory as unknown as Prisma.InputJsonValue,
        },
      });
      return true;
    });
  }

  /** Re-scores a handed-in attempt after the teacher's marks change. */
  async rescore(a: OnlineExamAttempt, theory: Record<string, number>) {
    const m = this.computeMarks(layoutOf(a), answersOf(a), theory);
    return this.prisma.db.onlineExamAttempt.update({
      where: { id: a.id },
      data: { theoryMarks: theory as unknown as Prisma.InputJsonValue, objectiveScore: m.objectiveScore, score: m.score, total: m.total, status: m.status },
    });
  }

  /** Whether a save can still be accepted (a little grace for slow networks). */
  withinGrace(a: Pick<OnlineExamAttempt, 'endsAt'>, now = new Date()) {
    return now.getTime() <= a.endsAt.getTime() + CBT_GRACE_SECONDS * 1000;
  }

  /** Auto-submits every attempt whose time (plus grace) has run out, across schools. */
  async sweep(): Promise<number> {
    const cutoff = new Date(Date.now() - CBT_GRACE_SECONDS * 1000);
    const due = await this.prisma.root.onlineExamAttempt.findMany({ where: { status: 'IN_PROGRESS', endsAt: { lt: cutoff } }, select: { id: true }, take: 500 });
    let n = 0;
    for (const a of due) {
      try {
        if (await this.finalize(a.id)) n++;
      } catch (err) {
        this.logger.warn(`Couldn't auto-submit attempt ${a.id}: ${(err as Error).message}`);
      }
    }
    if (n) this.logger.log(`Auto-submitted ${n} online exam attempt(s) whose time ran out`);
    return n;
  }

  /** Merges answers atomically, so overlapping saves from a flaky connection never lose one. */
  async mergeAnswers(attemptId: string, patch: StoredAnswers, focusLosses?: number) {
    const json = JSON.stringify(patch);
    return this.prisma.root.$executeRaw`
      UPDATE online_exam_attempts
      SET answers = COALESCE(answers, '{}'::jsonb) || ${json}::jsonb,
          "focusLosses" = GREATEST("focusLosses", ${focusLosses ?? 0}),
          "updatedAt" = now()
      WHERE id = ${attemptId} AND status = 'IN_PROGRESS'`;
  }

  /** Checks a student's answer patch against their layout and converts option indexes to the original order. */
  toStored(layout: Layout, patch: Record<string, number | string | null>): StoredAnswers {
    const byId = new Map(layout.items.map((i) => [i.id, i]));
    const out: StoredAnswers = {};
    for (const [qid, v] of Object.entries(patch)) {
      const item = byId.get(qid);
      if (!item) throw new BadRequestException('One of the answers is for a question that is not in this exam');
      if (v === null) out[qid] = null;
      else if (isObjective(item.type)) {
        if (typeof v !== 'number' || v < 0 || v >= item.order.length) throw new BadRequestException('Pick one of the options');
        out[qid] = item.order[v]!;
      } else {
        if (typeof v !== 'string') throw new BadRequestException('Type your answer');
        out[qid] = v;
      }
    }
    return out;
  }

  /** Stored answers back into the student's displayed option order. */
  toDisplayed(layout: Layout, answers: StoredAnswers): Record<string, number | string | null> {
    const out: Record<string, number | string | null> = {};
    for (const item of layout.items) {
      const v = answers[item.id];
      if (v === undefined || v === null) continue;
      out[item.id] = isObjective(item.type) ? (typeof v === 'number' ? item.order.indexOf(v) : null) : String(v);
    }
    return out;
  }
}
