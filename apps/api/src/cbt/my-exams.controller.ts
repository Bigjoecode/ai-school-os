import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, Post, Put } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  cbtSaveAnswersSchema,
  cbtStartSchema,
  cbtSubmitSchema,
  type CbtAttemptStatus,
  type CbtMyExam,
  type CbtRoom,
  type CbtSaveAnswersInput,
  type CbtSaveResult,
  type CbtShowResults,
  type CbtStartInput,
  type CbtSubmitInput,
} from '@aischool/shared';
import type { OnlineExam, OnlineExamAttempt, Prisma, Student } from '../generated/prisma/client';
import { RequirePermissions } from '../common/decorators';
import { currentContext, currentTenantId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { OfflineExamsService } from './offline-exams.service';
import { CbtService, answersOf, isObjective, layoutOf, paperInclude, phaseOf, resultVisibility, round1, theoryMarksOf } from './cbt.service';

/**
 * Online exams for the signed-in student: list, start (one attempt), save as
 * they go, resume after a dropped connection, hand in. The server keeps the
 * clock: every response carries its time and the attempt's deadline.
 */
@Controller('cbt/my')
@RequirePermissions('learning.use')
export class MyExamsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cbt: CbtService,
    private readonly offline: OfflineExamsService,
  ) {}

  private async me(): Promise<Student> {
    const me = await this.prisma.db.student.findFirst({ where: { userId: currentContext().userId, status: 'ACTIVE' } });
    if (!me) throw new ForbiddenException('Only students sit online exams');
    return me;
  }

  /** An exam this student may see: scheduled for their class, or one they already started. */
  private async exam(me: Student, id: string) {
    const exam = await this.prisma.db.onlineExam.findFirst({ where: { id, status: { not: 'DRAFT' } } });
    const attempt = exam ? await this.prisma.db.onlineExamAttempt.findUnique({ where: { examId_studentId: { examId: id, studentId: me.id } } }) : null;
    if (!exam || (!attempt && !exam.classArmIds.includes(me.classArmId ?? ''))) throw new NotFoundException('Exam not found');
    return { exam, attempt };
  }

  /** Hands in an attempt whose time (plus grace) is up, and returns it fresh. */
  private async settle(a: OnlineExamAttempt | null): Promise<OnlineExamAttempt | null> {
    if (a?.status === 'IN_PROGRESS' && !this.cbt.withinGrace(a)) {
      await this.cbt.finalize(a.id);
      return this.prisma.db.onlineExamAttempt.findUnique({ where: { id: a.id } });
    }
    return a;
  }

  @Get()
  async list(): Promise<CbtMyExam[]> {
    const me = await this.me();
    const attempts = await this.prisma.db.onlineExamAttempt.findMany({ where: { studentId: me.id } });
    const exams = await this.prisma.db.onlineExam.findMany({
      where: { status: { not: 'DRAFT' }, OR: [{ classArmIds: { has: me.classArmId ?? '__none__' } }, { id: { in: attempts.map((a) => a.examId) } }] },
      orderBy: { opensAt: 'asc' },
      take: 200,
    });
    const papers = await this.prisma.db.examPaper.findMany({ where: { id: { in: exams.map((e) => e.paperId) } }, include: { subject: { select: { name: true } }, _count: { select: { items: true } } } });
    const paperBy = new Map(papers.map((p) => [p.id, p]));
    const offline = await this.offline.myOffline(me.id, exams);
    const out: CbtMyExam[] = [];
    for (const e of exams) {
      const p = paperBy.get(e.paperId);
      if (!p) continue;
      const a = await this.settle(attempts.find((x) => x.examId === e.id) ?? null);
      const r = a ? this.result(e, a) : null;
      out.push({
        id: e.id,
        title: e.title,
        subject: p.subject.name,
        phase: phaseOf(e),
        opensAt: e.opensAt.toISOString(),
        closesAt: e.closesAt.toISOString(),
        durationMinutes: e.durationMinutes,
        questionCount: p._count.items,
        needsAccessCode: !!e.accessCode,
        attempt: a ? { status: a.status as CbtAttemptStatus, endsAt: a.endsAt.toISOString(), submittedAt: a.submittedAt?.toISOString() ?? null } : null,
        result: r?.score ? { score: r.score.score, total: r.score.total, percent: r.score.percent, partial: r.score.partial } : null,
        offline: e.offlineEnabled
          ? { availableFrom: e.offlineFrom?.toISOString() ?? null, syncBy: e.offlineSyncBy?.toISOString() ?? null, version: e.offlineVersion, downloaded: offline.get(e.id)?.downloaded ?? false, synced: offline.get(e.id)?.synced ?? false }
          : null,
      });
    }
    return out;
  }

  @Get(':id')
  async room(@Param('id') id: string): Promise<CbtRoom> {
    const me = await this.me();
    const { exam, attempt } = await this.exam(me, id);
    return this.view(exam, await this.settle(attempt));
  }

  @Post(':id/start')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async start(@Param('id') id: string, @Body(new ZodPipe(cbtStartSchema)) body: CbtStartInput): Promise<CbtRoom> {
    const me = await this.me();
    const { exam, attempt } = await this.exam(me, id);
    // Already started (another tab, or a refresh): carry on with the same attempt.
    if (attempt) return this.view(exam, await this.settle(attempt));
    const phase = phaseOf(exam);
    if (phase === 'UPCOMING') throw new BadRequestException('This exam has not opened yet');
    if (phase !== 'OPEN') throw new BadRequestException('This exam has closed');
    if (exam.accessCode && (body.accessCode ?? '').trim().toUpperCase() !== exam.accessCode.toUpperCase()) {
      throw new BadRequestException({ statusCode: 400, message: 'That access code is not right. Ask your invigilator.', errors: [{ path: 'accessCode', message: 'Wrong access code' }] });
    }
    const paper = await this.prisma.db.examPaper.findUnique({ where: { id: exam.paperId }, include: paperInclude });
    if (!paper || !paper.items.length) throw new BadRequestException('This exam has no questions. Tell your teacher.');
    const now = new Date();
    const endsAt = new Date(Math.min(now.getTime() + exam.durationMinutes * 60_000, exam.closesAt.getTime()));
    try {
      const created = await this.prisma.db.onlineExamAttempt.create({
        data: {
          tenantId: currentTenantId(),
          examId: exam.id,
          studentId: me.id,
          layout: this.cbt.buildLayout(exam, paper) as unknown as Prisma.InputJsonValue,
          startedAt: now,
          endsAt,
          ip: currentContext().ip?.slice(0, 64) ?? null,
        },
      });
      return this.view(exam, created);
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002') throw err;
      // Two taps at once: the other request created it.
      const existing = await this.prisma.db.onlineExamAttempt.findUnique({ where: { examId_studentId: { examId: exam.id, studentId: me.id } } });
      return this.view(exam, existing);
    }
  }

  /** Saves some answers (only the ones that changed are needed). */
  @Put(':id/answers')
  @Throttle({ default: { limit: 240, ttl: 60_000 } })
  async save(@Param('id') id: string, @Body(new ZodPipe(cbtSaveAnswersSchema)) body: CbtSaveAnswersInput): Promise<CbtSaveResult> {
    const me = await this.me();
    const { attempt } = await this.exam(me, id);
    if (!attempt) throw new BadRequestException('Start the exam first');
    if (attempt.status !== 'IN_PROGRESS') throw new ConflictException('You have already handed in this exam');
    if (!this.cbt.withinGrace(attempt)) {
      await this.cbt.finalize(attempt.id);
      throw new ConflictException('Time is up. Your saved answers have been handed in.');
    }
    const patch = this.cbt.toStored(layoutOf(attempt), body.answers);
    const n = await this.cbt.mergeAnswers(attempt.id, patch, body.focusLosses);
    if (!n) throw new ConflictException('You have already handed in this exam');
    const now = new Date();
    return { savedAt: now.toISOString(), serverNow: now.toISOString(), endsAt: attempt.endsAt.toISOString(), status: 'IN_PROGRESS' };
  }

  @Post(':id/submit')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async submit(@Param('id') id: string, @Body(new ZodPipe(cbtSubmitSchema)) body: CbtSubmitInput): Promise<CbtRoom> {
    const me = await this.me();
    const { exam, attempt } = await this.exam(me, id);
    if (!attempt) throw new BadRequestException('Start the exam first');
    if (attempt.status === 'IN_PROGRESS') {
      // Last answers ride along with the hand-in, as long as they arrive in time.
      if (this.cbt.withinGrace(attempt) && (body.answers || body.focusLosses != null)) {
        await this.cbt.mergeAnswers(attempt.id, this.cbt.toStored(layoutOf(attempt), body.answers ?? {}), body.focusLosses);
      }
      await this.cbt.finalize(attempt.id);
    }
    const fresh = await this.prisma.db.onlineExamAttempt.findUnique({ where: { id: attempt.id } });
    return this.view(exam, fresh);
  }

  // ---------------------------------------------------------- views

  private result(exam: OnlineExam, a: OnlineExamAttempt) {
    if (a.status === 'IN_PROGRESS') return { score: null, review: false, note: null };
    const show = exam.showResults as CbtShowResults;
    // Answers are only revealed once nobody can still be sitting the exam (the same rule parents get in the portal).
    const { score: seeScore, review: seeReview } = resultVisibility(exam, a);
    const total = a.total ?? 0;
    const partial = a.status !== 'MARKED';
    const raw = partial ? (a.objectiveScore ?? 0) : (a.score ?? 0);
    const score = seeScore && total ? { score: raw, total, percent: round1((raw / total) * 100), partial } : null;
    const note = !seeScore
      ? show === 'AFTER_CLOSE'
        ? 'Your results will be shown when the exam closes.'
        : 'Your results will be released by your teacher.'
      : partial
        ? 'Your written answers are still being marked; this is your objective score so far.'
        : !seeReview
          ? 'You can review your answers once the exam has closed.'
          : null;
    return { score, review: seeReview, note };
  }

  private async view(exam: OnlineExam, a: OnlineExamAttempt | null): Promise<CbtRoom> {
    const paper = await this.prisma.db.examPaper.findUnique({ where: { id: exam.paperId }, include: { subject: { select: { name: true } }, classLevel: { select: { name: true } }, items: { include: { question: { select: { marks: true } } } } } });
    if (!paper) throw new NotFoundException('Exam not found');
    const now = new Date();
    const phase = phaseOf(exam, now);
    const base: CbtRoom = {
      exam: {
        id: exam.id,
        title: exam.title,
        subject: paper.subject.name,
        classLevel: paper.classLevel.name,
        instructions: paper.instructions,
        durationMinutes: exam.durationMinutes,
        showResults: exam.showResults as CbtShowResults,
        closesAt: exam.closesAt.toISOString(),
        phase,
        questionCount: paper.items.length,
        totalMarks: paper.items.reduce((n, i) => n + i.question.marks, 0),
        needsAccessCode: !!exam.accessCode,
      },
      serverNow: now.toISOString(),
      attempt: null,
      result: null,
      resultNote: null,
    };
    if (!a) return base;

    const layout = layoutOf(a);
    const r = this.result(exam, a);
    const inProgress = a.status === 'IN_PROGRESS';
    // Questions are sent while writing, and again for the review once answers may be shown.
    const needQuestions = inProgress || r.review;
    const questions = needQuestions
      ? await this.prisma.db.question.findMany({ where: { id: { in: layout.items.map((i) => i.id) } }, select: { id: true, type: true, stem: true, options: true, answer: true } })
      : [];
    const qBy = new Map(questions.map((q) => [q.id, q]));
    const answers = answersOf(a);
    const theory = theoryMarksOf(a);
    base.attempt = {
      id: a.id,
      status: a.status as CbtAttemptStatus,
      startedAt: a.startedAt.toISOString(),
      endsAt: a.endsAt.toISOString(),
      submittedAt: a.submittedAt?.toISOString() ?? null,
      focusLosses: a.focusLosses,
      questions: needQuestions
        ? layout.items.map((item, i) => {
            const q = qBy.get(item.id);
            return {
              id: item.id,
              number: i + 1,
              type: item.type,
              objective: isObjective(item.type),
              stem: q?.stem ?? '(This question was removed from the bank.)',
              options: isObjective(item.type) ? item.order.map((o) => q?.options[o] ?? '') : [],
              marks: item.marks,
            };
          })
        : [],
      answers: needQuestions ? this.cbt.toDisplayed(layout, answers) : {},
    };
    if (r.score) {
      base.result = {
        ...r.score,
        review: r.review
          ? layout.items.map((item) => {
              const objective = isObjective(item.type);
              const chosen = answers[item.id];
              const correct = objective ? item.correct != null && chosen === item.correct : null;
              return {
                questionId: item.id,
                correctIndex: objective && item.correct != null ? item.order.indexOf(item.correct) : null,
                correct,
                awarded: objective ? (correct ? item.marks : 0) : typeof theory[item.id] === 'number' ? theory[item.id]! : null,
                modelAnswer: objective ? null : (qBy.get(item.id)?.answer ?? null),
              };
            })
          : null,
      };
    }
    base.resultNote = r.note;
    return base;
  }
}
