import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  classroomSuggestion,
  type CheckInOutcome,
  type CheckInStart,
  type ChildModules,
  type ClassroomSessionView,
  type CueResult,
  type LiveJoin,
  type LiveStudentState,
  type LiveTally,
  type MyModuleDetail,
  type MyModuleRow,
  type MyModules,
  type MyModuleStep,
  type SessionHandsInput,
  type SessionStepResult,
  type ClassroomDecision,
} from '@aischool/shared';
import type { z } from 'zod';
import type { CheckInAttempt, ClassroomSession, LearningModule, LearningModuleStep, ModuleProgress, Prisma } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { fullName } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { MasteryService } from '../learning/mastery.service';
import { forStudent, joinCode, markAll, questionsOf, shuffle, type Answer } from './modules.helpers';
import { ModulesService } from './modules.service';
import { WorkbookService } from './workbook.service';

type ModuleWithSteps = LearningModule & { steps: LearningModuleStep[] };
type Hands = z.output<typeof import('@aischool/shared').sessionHandsSchema>;

/** A live session stops taking answers after this long (the teacher forgot to end it). */
const SESSION_HOURS = 8;

interface Layout {
  order: string[];
}

/**
 * Check-ins: the student's self-paced way through a module (gating, tries,
 * video questions), the live classroom session (join code, tallies, show of
 * hands, re-teach or move on), and the evidence each one adds to topic mastery.
 */
@Injectable()
export class CheckInService {
  private readonly logger = new Logger(CheckInService.name);

  constructor(
    private readonly modules: ModulesService,
    private readonly workbook: WorkbookService,
    private readonly mastery: MasteryService,
    private readonly audit: AuditService,
  ) {}

  private get db() {
    return this.modules.prisma.db;
  }

  // ---------------------------------------------------------- evidence

  /** Adds (or takes back) an attempt's mastery evidence for the module's topic. Never breaks the check-in. */
  private async evidence(m: LearningModule, a: Pick<CheckInAttempt, 'id' | 'studentId' | 'correct' | 'total'> | { id: string; studentId: string; clear: true }) {
    if (!m.topicId) return;
    try {
      const items = 'clear' in a ? [] : a.total > 0 ? [{ topicId: m.topicId, correct: a.correct, total: a.total }] : [];
      await this.mastery.replaceEvidence(m.tenantId, a.studentId, 'CHECKIN', a.id, items);
    } catch (err) {
      this.logger.warn(`Couldn't record check-in evidence for attempt ${a.id}: ${(err as Error).message}`);
    }
  }

  // ---------------------------------------------------------- the student

  private async me() {
    const ctx = currentContext();
    if (!ctx.permissions.has('learning.use')) throw new ForbiddenException('My lessons are for students');
    const s = await this.db.student.findFirst({ where: { userId: ctx.userId, status: 'ACTIVE' }, include: { classArm: { include: { classLevel: true } } } });
    if (!s) throw new ForbiddenException('Your account isn’t linked to a student record');
    return s;
  }

  private async mine(moduleId: string) {
    const s = await this.me();
    const m = await this.db.learningModule.findUnique({ where: { id: moduleId }, include: { steps: { orderBy: { order: 'asc' } } } });
    if (!m || m.status !== 'PUBLISHED' || m.library || !s.classArmId || m.classArmId !== s.classArmId) throw new NotFoundException('Lesson not found');
    return { s, m };
  }

  private rowOf(m: ModuleWithSteps, subject: { id: string; name: string }, p: ModuleProgress | null, lastScore: number | null): MyModuleRow {
    const done = p ? p.completedStepIds.filter((x) => m.steps.some((y) => y.id === x)).length : 0;
    return {
      id: m.id,
      title: m.title,
      summary: m.summary,
      subject,
      topic: m.topicName,
      week: m.week,
      stepCount: m.steps.length,
      done,
      status: !p ? 'NOT_STARTED' : p.status === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS',
      currentStepId: p?.currentStepId ?? null,
      lastScore,
      publishedAt: m.publishedAt?.toISOString() ?? null,
      completedAt: p?.completedAt?.toISOString() ?? null,
    };
  }

  private async rows(studentId: string, classArmId: string | null): Promise<MyModuleRow[]> {
    if (!classArmId) return [];
    const list = await this.db.learningModule.findMany({ where: { classArmId, status: 'PUBLISHED', library: false }, include: { steps: true }, orderBy: [{ publishedAt: 'desc' }] });
    if (!list.length) return [];
    const ids = list.map((m) => m.id);
    const [subjects, progress, attempts] = await Promise.all([
      this.db.subject.findMany({ where: { id: { in: [...new Set(list.map((m) => m.subjectId))] } }, select: { id: true, name: true } }),
      this.db.moduleProgress.findMany({ where: { studentId, moduleId: { in: ids } } }),
      this.db.checkInAttempt.findMany({ where: { studentId, moduleId: { in: ids }, submittedAt: { not: null } }, orderBy: { submittedAt: 'desc' }, select: { moduleId: true, percent: true } }),
    ]);
    const rows = list.map((m) =>
      this.rowOf(m, subjects.find((x) => x.id === m.subjectId) ?? { id: m.subjectId, name: 'Subject' }, progress.find((p) => p.moduleId === m.id) ?? null, attempts.find((a) => a.moduleId === m.id)?.percent ?? null),
    );
    const rank = { IN_PROGRESS: 0, NOT_STARTED: 1, COMPLETED: 2 } as const;
    return rows.sort((a, b) => rank[a.status] - rank[b.status] || (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
  }

  async myModules(): Promise<MyModules> {
    const s = await this.me();
    return { student: { id: s.id, name: fullName(s), className: s.classArm ? `${s.classArm.classLevel.name} ${s.classArm.name}`.trim() : null }, modules: await this.rows(s.id, s.classArmId) };
  }

  /** A parent's child (or the student themself): module completion. */
  async child(studentId: string): Promise<ChildModules> {
    const ctx = currentContext();
    const s = await this.db.student.findUnique({ where: { id: studentId } });
    if (!s) throw new NotFoundException('Student not found');
    const isParent = ctx.permissions.has('family.manage') && (await this.db.studentGuardian.count({ where: { studentId, guardian: { userId: ctx.userId } } })) > 0;
    const isSelf = s.userId === ctx.userId;
    if (!isParent && !isSelf) throw new ForbiddenException('You can only see your own children');
    const modules = await this.rows(s.id, s.classArmId);
    return { student: { id: s.id, name: fullName(s), firstName: s.firstName }, modules, completed: modules.filter((m) => m.status === 'COMPLETED').length, total: modules.length };
  }

  /** Which steps are done, open or locked: in order, each unlocks when the one before is done. */
  private states(m: ModuleWithSteps, p: ModuleProgress | null) {
    const done = new Set(p?.completedStepIds ?? []);
    const firstOpen = m.steps.findIndex((x) => !done.has(x.id));
    return new Map(m.steps.map((x, i) => [x.id, done.has(x.id) ? ('DONE' as const) : i === firstOpen ? ('OPEN' as const) : ('LOCKED' as const)]));
  }

  async myModule(id: string): Promise<MyModuleDetail> {
    const { s, m } = await this.mine(id);
    const db = this.db;
    const [subject, p, attempts, rows] = await Promise.all([
      db.subject.findUniqueOrThrow({ where: { id: m.subjectId }, select: { id: true, name: true } }),
      db.moduleProgress.findUnique({ where: { moduleId_studentId: { moduleId: id, studentId: s.id } } }),
      db.checkInAttempt.findMany({ where: { moduleId: id, studentId: s.id }, orderBy: { createdAt: 'asc' } }),
      this.modules.stepRows(m.steps, false),
    ]);
    if (p) await db.moduleProgress.update({ where: { id: p.id }, data: { lastSeenAt: new Date() } });
    const states = this.states(m, p);
    const steps: MyModuleStep[] = rows.map((r) => {
      const qs = questionsOf(m.steps.find((x) => x.id === r.id)!.questions);
      const mine = attempts.filter((a) => a.stepId === r.id && a.submittedAt && a.mode !== 'VIDEO');
      const video = attempts.find((a) => a.stepId === r.id && a.mode === 'VIDEO');
      const cuesAnswered: Record<string, boolean> = {};
      if (video) {
        const ans = (video.answers ?? {}) as Record<string, Answer>;
        for (const q of qs) if (q.id in ans) cuesAnswered[q.id] = markAll([q], { [q.id]: ans[q.id] }).correct === 1;
      }
      const best = mine.length ? mine.reduce((b, a) => (a.percent > b.percent ? a : b)) : null;
      return {
        id: r.id,
        order: r.order,
        kind: r.kind,
        title: r.title,
        body: r.body,
        url: r.url,
        youtubeId: r.youtubeId,
        mimeType: r.mimeType,
        fileName: r.fileName,
        hasFile: !!r.fileId,
        material: r.material,
        cues: r.kind === 'VIDEO' ? qs.map((q) => forStudent(q, false)).sort((a, b) => (a.at ?? 0) - (b.at ?? 0)) : [],
        cuesAnswered,
        questionCount: qs.length,
        passMark: r.passMark ?? m.passMark,
        state: states.get(r.id) ?? 'LOCKED',
        best: best ? { percent: best.percent, passed: mine.some((a) => a.passed), tries: mine.length } : null,
      };
    });
    const last = [...attempts].reverse().find((a) => a.submittedAt);
    return {
      ...this.rowOf(m, subject, p, last?.percent ?? null),
      mustPass: m.mustPass,
      passMark: m.passMark,
      steps,
      className: s.classArm ? `${s.classArm.classLevel.name} ${s.classArm.name}`.trim() : null,
    };
  }

  private async progressOf(m: ModuleWithSteps, studentId: string) {
    return this.db.moduleProgress.upsert({
      where: { moduleId_studentId: { moduleId: m.id, studentId } },
      update: { lastSeenAt: new Date() },
      create: { tenantId: currentTenantId(), moduleId: m.id, studentId, currentStepId: m.steps[0]?.id ?? null },
    });
  }

  /** Marks a step done and moves on; returns whether the whole module is now done. */
  private async markDone(m: ModuleWithSteps, studentId: string, stepId: string) {
    const p = await this.progressOf(m, studentId);
    const done = new Set([...p.completedStepIds, stepId]);
    const next = m.steps.find((x) => !done.has(x.id));
    const complete = m.steps.every((x) => done.has(x.id));
    await this.db.moduleProgress.update({
      where: { id: p.id },
      data: { completedStepIds: [...done], currentStepId: next?.id ?? stepId, status: complete ? 'COMPLETED' : 'IN_PROGRESS', completedAt: complete ? (p.completedAt ?? new Date()) : null },
    });
    return complete;
  }

  private async openStep(id: string, stepId: string) {
    const { s, m } = await this.mine(id);
    const step = m.steps.find((x) => x.id === stepId);
    if (!step) throw new NotFoundException('Step not found');
    const p = await this.db.moduleProgress.findUnique({ where: { moduleId_studentId: { moduleId: id, studentId: s.id } } });
    if (this.states(m, p).get(stepId) === 'LOCKED') throw new ForbiddenException(m.mustPass ? 'Finish the steps before this one first (pass each check-in to move on)' : 'Finish the steps before this one first');
    return { s, m, step };
  }

  /** Remembers where the student is (resume later). */
  async visit(id: string, stepId: string) {
    const { s, m } = await this.openStep(id, stepId);
    const p = await this.progressOf(m, s.id);
    await this.db.moduleProgress.update({ where: { id: p.id }, data: { currentStepId: stepId } });
    return { ok: true };
  }

  async completeStep(id: string, stepId: string): Promise<{ moduleCompleted: boolean }> {
    const { s, m, step } = await this.openStep(id, stepId);
    if (step.kind === 'CHECKIN') throw new BadRequestException('Answer the check-in to finish this step');
    const cues = questionsOf(step.questions);
    if (step.kind === 'VIDEO' && cues.length) {
      const a = await this.db.checkInAttempt.findFirst({ where: { stepId, studentId: s.id, mode: 'VIDEO' } });
      const answered = Object.keys((a?.answers ?? {}) as object);
      if (cues.some((q) => !answered.includes(q.id))) throw new BadRequestException('Answer the questions in the video to finish it');
    }
    return { moduleCompleted: await this.markDone(m, s.id, stepId) };
  }

  /** A fresh try at a check-in: the questions in a new order, without answers. */
  async startCheckIn(id: string, stepId: string): Promise<CheckInStart> {
    const { s, m, step } = await this.openStep(id, stepId);
    if (step.kind !== 'CHECKIN') throw new BadRequestException('This step is not a check-in');
    const qs = questionsOf(step.questions);
    if (!qs.length) throw new BadRequestException('This check-in has no questions yet');
    const order = shuffle(qs.map((q) => q.id));
    const [a, tries] = await Promise.all([
      this.db.checkInAttempt.create({ data: { tenantId: currentTenantId(), moduleId: id, stepId, studentId: s.id, mode: 'SELF', layout: { order } satisfies Layout as unknown as Prisma.InputJsonValue, total: qs.length } }),
      this.db.checkInAttempt.count({ where: { stepId, studentId: s.id, mode: 'SELF', submittedAt: { not: null } } }),
      this.progressOf(m, s.id),
    ]);
    return { attemptId: a.id, questions: order.map((qid) => forStudent(qs.find((q) => q.id === qid)!)), passMark: step.passMark ?? m.passMark, tries };
  }

  async submit(attemptId: string, answers: Record<string, Answer>): Promise<CheckInOutcome> {
    const s = await this.me();
    const a = await this.db.checkInAttempt.findUnique({ where: { id: attemptId } });
    if (!a || a.studentId !== s.id || a.mode !== 'SELF') throw new NotFoundException('Check-in not found');
    if (a.submittedAt) throw new ConflictException('These answers were already sent. Start the check-in again for another try.');
    const { m } = await this.mine(a.moduleId);
    const step = m.steps.find((x) => x.id === a.stepId);
    if (!step) throw new NotFoundException('This check-in has been removed');
    const qs = questionsOf(step.questions);
    const r = markAll(qs, answers);
    const passMark = step.passMark ?? m.passMark;
    const passed = r.percent >= passMark;
    const saved = await this.db.checkInAttempt.update({ where: { id: a.id }, data: { answers: answers as Prisma.InputJsonValue, correct: r.correct, total: r.total, percent: r.percent, passed, submittedAt: new Date() } });
    // Only the latest self-paced try counts towards mastery (retries replace it).
    const earlier = await this.db.checkInAttempt.findMany({ where: { stepId: a.stepId, studentId: s.id, mode: 'SELF', submittedAt: { not: null }, id: { not: a.id } }, select: { id: true } });
    for (const e of earlier) await this.evidence(m, { id: e.id, studentId: s.id, clear: true });
    await this.evidence(m, saved);
    const completes = passed || !m.mustPass;
    const moduleCompleted = completes ? await this.markDone(m, s.id, step.id) : false;
    return { attemptId: a.id, ...r, passed, passMark, mustPass: m.mustPass, stepCompleted: completes, moduleCompleted };
  }

  /** A question pinned in a video: checked one at a time as the video pauses. */
  async cue(id: string, stepId: string, questionId: string, answer: Answer): Promise<CueResult> {
    const { s, m, step } = await this.openStep(id, stepId);
    if (step.kind !== 'VIDEO') throw new BadRequestException('This step is not a video');
    const qs = questionsOf(step.questions);
    const q = qs.find((x) => x.id === questionId);
    if (!q) throw new NotFoundException('Question not found');
    let a = await this.db.checkInAttempt.findFirst({ where: { stepId, studentId: s.id, mode: 'VIDEO' } });
    if (!a) a = await this.db.checkInAttempt.create({ data: { tenantId: currentTenantId(), moduleId: id, stepId, studentId: s.id, mode: 'VIDEO', layout: { order: qs.map((x) => x.id) } as unknown as Prisma.InputJsonValue, total: qs.length } });
    const answers = { ...((a.answers ?? {}) as Record<string, Answer>) };
    // The first answer to each question counts; watching again just shows it.
    if (!(q.id in answers)) answers[q.id] = answer;
    const r = markAll(qs, answers);
    const one = markAll([q], { [q.id]: answers[q.id] }).review[0]!;
    const all = qs.every((x) => x.id in answers);
    const passMark = step.passMark ?? m.passMark;
    const saved = await this.db.checkInAttempt.update({
      where: { id: a.id },
      data: { answers: answers as Prisma.InputJsonValue, correct: r.correct, total: r.total, percent: r.percent, passed: r.percent >= passMark, submittedAt: all ? (a.submittedAt ?? new Date()) : null },
    });
    if (all) await this.evidence(m, saved);
    await this.progressOf(m, s.id);
    return { correct: one.correct, correctAnswer: one.correctAnswer, explanation: one.explanation, allAnswered: all };
  }

  // ---------------------------------------------------------- classroom (teacher)

  private async mustTeach(sessionId: string) {
    const s = await this.modules.scope();
    const session = await this.db.classroomSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');
    const m = await this.db.learningModule.findUniqueOrThrow({ where: { id: session.moduleId }, include: { steps: { orderBy: { order: 'asc' } } } });
    const mine = session.teacherUserId === s.userId || this.modules.canEdit(s, m);
    if (!mine && !s.readAll) throw new NotFoundException('Session not found');
    return { s, session, m, canRun: mine || s.manageAll };
  }

  private async mustRun(sessionId: string) {
    const r = await this.mustTeach(sessionId);
    if (!r.canRun) throw new ForbiddenException('Only the teacher running this lesson can change it');
    if (r.session.status !== 'LIVE') throw new BadRequestException('This lesson has ended');
    return r;
  }

  async startSession(moduleId: string, present: number | null) {
    const { s, m } = await this.modules.mustEdit(moduleId);
    if (!m.classArmId) throw new BadRequestException('Copy this library module into your class to teach it');
    if (!m.steps.length) throw new BadRequestException('Add the module’s steps before teaching it');
    // One live lesson per module and teacher: carry on with it rather than starting another.
    const live = await this.db.classroomSession.findFirst({ where: { moduleId, teacherUserId: s.userId, status: 'LIVE', startedAt: { gte: new Date(Date.now() - SESSION_HOURS * 3_600_000) } } });
    if (live) return { id: live.id };
    let code = joinCode();
    for (let i = 0; i < 5 && (await this.db.classroomSession.count({ where: { code, status: 'LIVE' } })); i++) code = joinCode();
    const session = await this.db.classroomSession.create({
      data: { tenantId: currentTenantId(), moduleId, classArmId: m.classArmId, teacherUserId: s.userId, code, present, currentStepId: m.steps[0]!.id },
    });
    await this.audit.log({ action: 'modules.session_started', entityType: 'ClassroomSession', entityId: session.id, summary: `Started teaching "${m.title}" in class` });
    return { id: session.id };
  }

  async sessions(moduleId?: string) {
    const s = await this.modules.scope();
    const list = await this.db.classroomSession.findMany({ where: moduleId ? { moduleId } : s.readAll ? {} : { teacherUserId: s.userId }, orderBy: { startedAt: 'desc' }, take: 50 });
    return this.workbook.sessionSummaries(list);
  }

  private async tally(session: ClassroomSession, m: ModuleWithSteps, classSize: number): Promise<LiveTally | null> {
    if (!session.openStepId || !session.openedAt) return null;
    const step = m.steps.find((x) => x.id === session.openStepId);
    if (!step) return null;
    const qs = questionsOf(step.questions);
    const passMark = step.passMark ?? m.passMark;
    const attempts = await this.db.checkInAttempt.findMany({ where: { sessionId: session.id, stepId: step.id, mode: 'CLASS', submittedAt: { not: null }, createdAt: { gte: session.openedAt } } });
    const students = await this.db.student.findMany({ where: { id: { in: attempts.map((a) => a.studentId) } }, select: { id: true, firstName: true, lastName: true } });
    const understood = attempts.filter((a) => a.percent >= passMark).length;
    return {
      stepId: step.id,
      openedAt: session.openedAt.toISOString(),
      classSize,
      responses: attempts.length,
      understood,
      percent: attempts.length ? Math.round(attempts.reduce((t, a) => t + a.percent, 0) / attempts.length) : 0,
      suggestion: classroomSuggestion(understood, attempts.length),
      perQuestion: qs.map((q) => {
        const answered = attempts.filter((a) => q.id in ((a.answers ?? {}) as object));
        return { questionId: q.id, answered: answered.length, correct: answered.filter((a) => markAll([q], (a.answers ?? {}) as Record<string, Answer>).correct === 1).length };
      }),
      respondents: attempts
        .map((a) => {
          const st = students.find((x) => x.id === a.studentId);
          return { studentId: a.studentId, name: st ? fullName(st) : 'Student', percent: a.percent };
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  async view(sessionId: string): Promise<ClassroomSessionView> {
    const { s, session, m } = await this.mustTeach(sessionId);
    const [detail, arm, students] = await Promise.all([
      this.modules.detail(m, s),
      this.db.classArm.findUniqueOrThrow({ where: { id: session.classArmId }, include: { classLevel: true } }),
      this.db.student.findMany({ where: { classArmId: session.classArmId, status: 'ACTIVE' }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], select: { id: true, firstName: true, lastName: true } }),
    ]);
    return {
      id: session.id,
      code: session.code,
      status: session.status === 'LIVE' ? 'LIVE' : 'ENDED',
      module: detail,
      class: { id: arm.id, label: `${arm.classLevel.name} ${arm.name}`.trim() },
      students: students.map((x) => ({ id: x.id, name: fullName(x) })),
      currentStepId: session.currentStepId,
      openStepId: session.openStepId,
      present: session.present,
      results: (session.results ?? {}) as unknown as Record<string, SessionStepResult>,
      live: await this.tally(session, m, students.length),
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt?.toISOString() ?? null,
    };
  }

  async update(sessionId: string, body: { currentStepId?: string; present?: number | null }) {
    const { session, m } = await this.mustRun(sessionId);
    if (body.currentStepId && !m.steps.some((x) => x.id === body.currentStepId)) throw new BadRequestException('Step not found');
    await this.db.classroomSession.update({ where: { id: session.id }, data: { ...(body.currentStepId ? { currentStepId: body.currentStepId } : {}), ...(body.present !== undefined ? { present: body.present } : {}) } });
    return this.view(sessionId);
  }

  /** Opens a check-in for students to answer on their own devices (a fresh round each time). */
  async open(sessionId: string, stepId: string) {
    const { session, m } = await this.mustRun(sessionId);
    const step = m.steps.find((x) => x.id === stepId);
    if (!step || step.kind !== 'CHECKIN') throw new BadRequestException('Choose a check-in step');
    if (session.openStepId) await this.closeRound(session, m);
    await this.db.classroomSession.update({ where: { id: session.id }, data: { openStepId: stepId, openedAt: new Date(), currentStepId: stepId } });
    return this.view(sessionId);
  }

  private saveResult(session: ClassroomSession, stepId: string, r: Omit<SessionStepResult, 'rounds' | 'at' | 'decision'>) {
    const results = { ...((session.results ?? {}) as unknown as Record<string, SessionStepResult>) };
    const prev = results[stepId];
    results[stepId] = { ...r, decision: null, rounds: (prev?.rounds ?? 0) + 1, at: new Date().toISOString() };
    return results;
  }

  private async closeRound(session: ClassroomSession, m: ModuleWithSteps) {
    const size = await this.db.student.count({ where: { classArmId: session.classArmId, status: 'ACTIVE' } });
    const t = await this.tally(session, m, size);
    const results = t && t.responses > 0 ? this.saveResult(session, t.stepId, { mode: 'DEVICES', responses: t.responses, understood: t.understood, percent: t.percent, suggestion: t.suggestion }) : (session.results as unknown as Record<string, SessionStepResult>);
    await this.db.classroomSession.update({ where: { id: session.id }, data: { openStepId: null, openedAt: null, results: results as unknown as Prisma.InputJsonValue } });
  }

  async close(sessionId: string) {
    const { session, m } = await this.mustRun(sessionId);
    if (session.openStepId) await this.closeRound(session, m);
    return this.view(sessionId);
  }

  /** No devices: the teacher counts hands for each question, or marks each student got it / not yet. */
  async hands(sessionId: string, body: Hands) {
    const { session, m } = await this.mustRun(sessionId);
    const step = m.steps.find((x) => x.id === body.stepId);
    if (!step || step.kind !== 'CHECKIN') throw new BadRequestException('Choose a check-in step');
    let r: Omit<SessionStepResult, 'rounds' | 'at' | 'decision'>;
    if (body.marks.length) {
      const ids = new Set((await this.db.student.findMany({ where: { classArmId: session.classArmId, status: 'ACTIVE' }, select: { id: true } })).map((x) => x.id));
      const marks = body.marks.filter((x) => ids.has(x.studentId));
      const tenantId = currentTenantId();
      for (const mk of marks) {
        const a = await this.db.checkInAttempt.create({
          data: { tenantId, moduleId: m.id, stepId: step.id, studentId: mk.studentId, sessionId: session.id, mode: 'MARKED', layout: { order: [] } as unknown as Prisma.InputJsonValue, correct: mk.understood ? 1 : 0, total: 1, percent: mk.understood ? 100 : 0, passed: mk.understood, submittedAt: new Date() },
        });
        await this.evidence(m, a);
      }
      const understood = marks.filter((x) => x.understood).length;
      r = { mode: 'MARKED', responses: marks.length, understood, percent: marks.length ? Math.round((100 * understood) / marks.length) : 0, suggestion: classroomSuggestion(understood, marks.length) };
    } else {
      const counts = body.correctCounts.map((c) => Math.min(c, body.present));
      const share = counts.reduce((t, c) => t + c / body.present, 0) / counts.length;
      // Estimate: the average share of right hands stands for the students who understood.
      const understood = Math.round(body.present * share);
      r = { mode: 'HANDS', responses: body.present, understood, percent: Math.round(share * 100), suggestion: classroomSuggestion(understood, body.present) };
    }
    const results = this.saveResult(session, step.id, r);
    await this.db.classroomSession.update({ where: { id: session.id }, data: { results: results as unknown as Prisma.InputJsonValue, present: body.present } });
    return this.view(sessionId);
  }

  async decide(sessionId: string, stepId: string, decision: ClassroomDecision) {
    const { session, m } = await this.mustRun(sessionId);
    const results = { ...((session.results ?? {}) as unknown as Record<string, SessionStepResult>) };
    if (!results[stepId]) throw new BadRequestException('Run the check-in first');
    results[stepId] = { ...results[stepId], decision };
    const i = m.steps.findIndex((x) => x.id === stepId);
    // Re-teach goes back to the content before the check-in; moving on goes to the next step.
    const back = [...m.steps.slice(0, i)].reverse().find((x) => x.kind !== 'CHECKIN');
    const target = decision === 'RETEACH' ? (back ?? m.steps[i]) : (m.steps[i + 1] ?? m.steps[i]);
    await this.db.classroomSession.update({ where: { id: session.id }, data: { results: results as unknown as Prisma.InputJsonValue, currentStepId: target?.id ?? stepId } });
    return this.view(sessionId);
  }

  async end(sessionId: string) {
    const { session, m } = await this.mustRun(sessionId);
    if (session.openStepId) await this.closeRound(session, m);
    await this.db.classroomSession.update({ where: { id: session.id }, data: { status: 'ENDED', endedAt: new Date(), openStepId: null } });
    await this.audit.log({ action: 'modules.session_ended', entityType: 'ClassroomSession', entityId: session.id, summary: `Finished teaching "${m.title}" in class` });
    return this.view(sessionId);
  }

  // ---------------------------------------------------------- classroom (student)

  private async liveSession(sessionId: string) {
    const s = await this.me();
    const session = await this.db.classroomSession.findUnique({ where: { id: sessionId } });
    if (!session || session.classArmId !== s.classArmId) throw new NotFoundException('Lesson not found');
    const m = await this.db.learningModule.findUniqueOrThrow({ where: { id: session.moduleId }, include: { steps: { orderBy: { order: 'asc' } } } });
    return { s, session, m, live: session.status === 'LIVE' && session.startedAt.getTime() > Date.now() - SESSION_HOURS * 3_600_000 };
  }

  async join(code: string): Promise<LiveJoin> {
    const s = await this.me();
    const session = await this.db.classroomSession.findFirst({ where: { code, status: 'LIVE', startedAt: { gte: new Date(Date.now() - SESSION_HOURS * 3_600_000) } }, orderBy: { startedAt: 'desc' } });
    if (!session) throw new NotFoundException('No live lesson has that code. Check the code on the board.');
    if (session.classArmId !== s.classArmId) throw new ForbiddenException('That code is for another class');
    const m = await this.db.learningModule.findUniqueOrThrow({ where: { id: session.moduleId } });
    const subject = await this.db.subject.findUniqueOrThrow({ where: { id: m.subjectId } });
    return { sessionId: session.id, moduleTitle: m.title, subject: subject.name, className: s.classArm ? `${s.classArm.classLevel.name} ${s.classArm.name}`.trim() : '' };
  }

  async liveState(sessionId: string): Promise<LiveStudentState> {
    const { s, session, m, live } = await this.liveSession(sessionId);
    const subject = await this.db.subject.findUniqueOrThrow({ where: { id: m.subjectId } });
    const base = { sessionId, status: live ? ('LIVE' as const) : ('ENDED' as const), moduleTitle: m.title, subject: subject.name };
    const step = live && session.openStepId && session.openedAt ? m.steps.find((x) => x.id === session.openStepId) : null;
    if (!step || !session.openedAt) return { ...base, open: null, answered: null };
    const qs = questionsOf(step.questions);
    let a = await this.db.checkInAttempt.findFirst({ where: { sessionId, stepId: step.id, studentId: s.id, mode: 'CLASS', createdAt: { gte: session.openedAt } } });
    if (!a) {
      a = await this.db.checkInAttempt.create({
        data: { tenantId: currentTenantId(), moduleId: m.id, stepId: step.id, studentId: s.id, sessionId, mode: 'CLASS', layout: { order: shuffle(qs.map((q) => q.id)) } as unknown as Prisma.InputJsonValue, total: qs.length },
      });
    }
    const order = ((a.layout ?? {}) as unknown as Layout).order ?? qs.map((q) => q.id);
    return {
      ...base,
      open: { stepId: step.id, title: step.title, openedAt: session.openedAt.toISOString(), attemptId: a.id, questions: order.map((id) => qs.find((q) => q.id === id)).filter((q) => !!q).map((q) => forStudent(q!)) },
      answered: a.submittedAt ? { percent: a.percent, passed: a.passed, correct: a.correct, total: a.total } : null,
    };
  }

  async liveAnswer(sessionId: string, attemptId: string, answers: Record<string, Answer>): Promise<CheckInOutcome> {
    const { s, session, m, live } = await this.liveSession(sessionId);
    if (!live) throw new BadRequestException('This lesson has ended');
    const a = await this.db.checkInAttempt.findUnique({ where: { id: attemptId } });
    if (!a || a.studentId !== s.id || a.sessionId !== sessionId || a.mode !== 'CLASS') throw new NotFoundException('Check-in not found');
    if (a.stepId !== session.openStepId || !session.openedAt || a.createdAt < session.openedAt) throw new BadRequestException('Your teacher has closed this check-in');
    if (a.submittedAt) throw new ConflictException('You have already answered this check-in');
    const step = m.steps.find((x) => x.id === a.stepId)!;
    const r = markAll(questionsOf(step.questions), answers);
    const passMark = step.passMark ?? m.passMark;
    const saved = await this.db.checkInAttempt.update({ where: { id: a.id }, data: { answers: answers as Prisma.InputJsonValue, correct: r.correct, total: r.total, percent: r.percent, passed: r.percent >= passMark, submittedAt: new Date() } });
    await this.evidence(m, saved);
    return { attemptId: a.id, ...r, passed: saved.passed, passMark, mustPass: m.mustPass, stepCompleted: false, moduleCompleted: false };
  }

  // ---------------------------------------------------------- files

  /** A step's file, for staff who can see the module, its class's students, or their parents. */
  async fileOf(moduleId: string, stepId: string): Promise<{ fileId: string; staff: boolean }> {
    const ctx = currentContext();
    const m = await this.db.learningModule.findUnique({ where: { id: moduleId }, include: { steps: { where: { id: stepId } } } });
    const step = m?.steps[0];
    if (!m || !step) throw new NotFoundException('File not found');
    let fileId = step.fileId;
    if (!fileId && step.materialId) fileId = (await this.db.studyMaterial.findUnique({ where: { id: step.materialId }, select: { fileId: true } }))?.fileId ?? null;
    if (!fileId) throw new NotFoundException('This step has no file');
    const staffy = ['lessons.manage', 'homework.manage', 'academics.manage', 'curriculum.manage', 'results.publish', 'lessons.approve'].some((p) => ctx.permissions.has(p as never));
    if (staffy) {
      const s = await this.modules.scope();
      if (this.modules.canView(s, m)) return { fileId, staff: true };
    }
    if (m.status !== 'PUBLISHED' || !m.classArmId) throw new NotFoundException('File not found');
    const kids = await this.db.student.findMany({
      where: { status: 'ACTIVE', classArmId: m.classArmId, OR: [{ userId: ctx.userId }, { guardians: { some: { guardian: { userId: ctx.userId } } } }] },
      select: { id: true },
    });
    if (!kids.length) throw new NotFoundException('File not found');
    return { fileId, staff: false };
  }
}
