import { BadRequestException, Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  cbtAiSuggestSchema,
  cbtMarksSchema,
  cbtSendScoresSchema,
  createOnlineExamSchema,
  updateOnlineExamSchema,
  type CbtAiSuggestInput,
  type CbtAiSuggestion,
  type CbtExamDetail,
  type CbtExamSummary,
  type CbtItemAnalysisRow,
  type CbtMarkingSheet,
  type CbtMarksInput,
  type CbtPaperOption,
  type CbtResults,
  type CbtScorePreview,
  type CbtScorePreviewRow,
  type CbtSendScoresResult,
  type CreateOnlineExamInput,
  type UpdateOnlineExamInput,
  gradeFor,
} from '@aischool/shared';
import { z } from 'zod';
import type { OnlineExam } from '../generated/prisma/client';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { AssessmentSettingsService } from '../assessment/assessment-settings.service';
import { ResultsService } from '../assessment/results.service';
import { AuditService } from '../audit/audit.service';
import { RequirePermissions } from '../common/decorators';
import { fullName } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { CbtService, answersOf, isAnswered, isObjective, layoutOf, paperInclude, round1, theoryMarksOf, type PaperRow } from './cbt.service';

const aiMarkSchema = z.object({
  marks: z.array(
    z.object({
      index: z.number().int().describe('The answer number, from 1'),
      score: z.number().describe('Marks awarded, from 0 to the maximum'),
      reasons: z.array(z.string()).describe('1–3 short points tied to the marking guide: what earned marks and what was missing'),
    }),
  ),
});

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const fmtSeconds = (s: number | null) => (s == null ? '' : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`);

/**
 * Online exams for staff: schedule a finalised paper for classes, watch it
 * live, mark written answers (with optional AI suggestions), analyse the
 * results and copy them into the score sheet.
 */
@Controller('online-exams')
export class OnlineExamsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cbt: CbtService,
    private readonly settings: AssessmentSettingsService,
    private readonly results: ResultsService,
    private readonly gateway: AiGatewayService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------- scheduling

  /** Finalised papers this user can schedule, with the classes they may schedule them for. */
  @Get('papers')
  @RequirePermissions('assessment.manage')
  async papers(): Promise<CbtPaperOption[]> {
    const db = this.prisma.db;
    const [papers, scope, { components }] = await Promise.all([
      db.examPaper.findMany({ where: { status: 'FINAL', items: { some: {} } }, include: paperInclude, orderBy: { updatedAt: 'desc' }, take: 200 }),
      this.cbt.staffScope(),
      this.settings.get(),
    ]);
    const arms = await db.classArm.findMany({ where: { classLevelId: { in: [...new Set(papers.map((p) => p.classLevelId))] } }, orderBy: { name: 'asc' }, include: { classLevel: { select: { name: true } } } });
    return papers
      .map((p) => ({
        id: p.id,
        title: p.title,
        subject: p.subject,
        classLevel: p.classLevel,
        term: { id: p.term.id, name: p.term.name, sessionName: p.term.session.name },
        component: components.find((c) => c.key === p.componentKey) ?? null,
        durationMinutes: p.durationMinutes,
        questionCount: p.items.length,
        totalMarks: p.items.reduce((n, i) => n + i.question.marks, 0),
        hasWritten: p.items.some((i) => !isObjective(i.question.type)),
        classArms: arms.filter((a) => a.classLevelId === p.classLevelId && this.cbt.teachesArm(scope, a.id, p.subjectId)).map((a) => ({ id: a.id, name: `${a.classLevel.name} ${a.name}` })),
      }))
      .filter((p) => p.classArms.length > 0);
  }

  @Get()
  @RequirePermissions('assessment.read')
  async list(): Promise<CbtExamSummary[]> {
    const scope = await this.cbt.staffScope();
    const exams = await this.prisma.db.onlineExam.findMany({ orderBy: { opensAt: 'desc' }, take: 300 });
    const papers = await this.prisma.db.examPaper.findMany({ where: { id: { in: [...new Set(exams.map((e) => e.paperId))] } }, select: { id: true, subjectId: true } });
    const subjectOf = new Map(papers.map((p) => [p.id, p.subjectId]));
    const visible = exams.filter((e) => subjectOf.has(e.paperId) && this.cbt.canSee(scope, e, subjectOf.get(e.paperId)!));
    return this.cbt.summaries(visible, scope);
  }

  @Post()
  @RequirePermissions('assessment.manage')
  async create(@Body(new ZodPipe(createOnlineExamSchema)) body: z.output<typeof createOnlineExamSchema>): Promise<CbtExamSummary> {
    const paper = await this.prisma.db.examPaper.findUnique({ where: { id: body.paperId }, include: paperInclude });
    if (!paper) throw new BadRequestException('Exam paper not found');
    if (paper.status !== 'FINAL') throw new BadRequestException('Mark the paper as final in Exams before scheduling it online');
    if (!paper.items.length) throw new BadRequestException('This paper has no questions');
    const scope = await this.cbt.staffScope();
    await this.checkArms(body.classArmIds, paper, scope);
    this.checkWindow(body.opensAt, body.closesAt, body.durationMinutes, body.publish);
    const { publish, ...fields } = body;
    const exam = await this.prisma.db.onlineExam.create({
      data: {
        ...fields,
        classArmIds: [...new Set(fields.classArmIds)],
        opensAt: new Date(fields.opensAt),
        closesAt: new Date(fields.closesAt),
        tenantId: currentTenantId(),
        status: publish ? 'SCHEDULED' : 'DRAFT',
        createdById: scope.userId,
      },
    });
    await this.audit.log({ action: 'cbt.created', entityType: 'OnlineExam', entityId: exam.id, summary: `${publish ? 'Scheduled' : 'Drafted'} online exam "${exam.title}"` });
    if (publish) await this.notifyStudents(exam, `New online exam: ${exam.title}`, `Opens ${await this.when(exam.opensAt)} · ${exam.durationMinutes} minutes.`);
    return (await this.cbt.summaries([exam], scope))[0]!;
  }

  @Patch(':id')
  @RequirePermissions('assessment.manage')
  async update(@Param('id') id: string, @Body(new ZodPipe(updateOnlineExamSchema)) body: z.output<typeof updateOnlineExamSchema>): Promise<CbtExamSummary> {
    const { exam, paper, scope } = await this.cbt.staffExam(id, 'manage');
    const started = await this.prisma.db.onlineExamAttempt.count({ where: { examId: id } });
    if (started) {
      // Once anyone has started, only what can't disadvantage a sitter may change.
      const locked = (['classArmIds', 'opensAt', 'durationMinutes', 'shuffleQuestions', 'shuffleOptions'] as const).filter((k) => body[k] !== undefined);
      if (locked.length) throw new BadRequestException('Students have already started this exam: you can only change the title, the closing time, the access code and how results are shown');
      if (body.closesAt && new Date(body.closesAt) < new Date()) throw new BadRequestException('The new closing time has already passed');
    } else {
      if (body.classArmIds) await this.checkArms(body.classArmIds, paper, scope);
      this.checkWindow(body.opensAt ?? exam.opensAt.toISOString(), body.closesAt ?? exam.closesAt.toISOString(), body.durationMinutes ?? exam.durationMinutes, exam.status === 'SCHEDULED');
    }
    if (body.closesAt && new Date(body.closesAt) <= (body.opensAt ? new Date(body.opensAt) : exam.opensAt)) throw new BadRequestException('The closing time must be after the opening time');
    const updated = await this.prisma.db.onlineExam.update({
      where: { id },
      data: {
        ...body,
        ...(body.classArmIds ? { classArmIds: [...new Set(body.classArmIds)] } : {}),
        ...(body.opensAt ? { opensAt: new Date(body.opensAt) } : {}),
        ...(body.closesAt ? { closesAt: new Date(body.closesAt) } : {}),
        // Re-opening a closed exam by moving its closing time later.
        ...(body.closesAt && exam.status === 'CLOSED' && new Date(body.closesAt) > new Date() ? { status: 'SCHEDULED' } : {}),
      },
    });
    // Time added while students are sitting: let them use it (never past their own duration).
    if (body.closesAt && started) {
      const live = await this.prisma.db.onlineExamAttempt.findMany({ where: { examId: id, status: 'IN_PROGRESS' } });
      for (const a of live) {
        const endsAt = new Date(Math.min(a.startedAt.getTime() + updated.durationMinutes * 60_000, updated.closesAt.getTime()));
        if (endsAt.getTime() !== a.endsAt.getTime()) await this.prisma.db.onlineExamAttempt.update({ where: { id: a.id }, data: { endsAt } });
      }
    }
    await this.audit.log({ action: 'cbt.updated', entityType: 'OnlineExam', entityId: id, summary: `Updated online exam "${updated.title}"` });
    return (await this.cbt.summaries([updated], scope))[0]!;
  }

  @Post(':id/publish')
  @HttpCode(200)
  @RequirePermissions('assessment.manage')
  async publish(@Param('id') id: string): Promise<CbtExamSummary> {
    const { exam, paper, scope } = await this.cbt.staffExam(id, 'manage');
    if (exam.status !== 'DRAFT') throw new BadRequestException('This exam is already scheduled');
    if (paper.status !== 'FINAL') throw new BadRequestException('The paper is no longer final. Finalise it in Exams first.');
    this.checkWindow(exam.opensAt.toISOString(), exam.closesAt.toISOString(), exam.durationMinutes, true);
    const updated = await this.prisma.db.onlineExam.update({ where: { id }, data: { status: 'SCHEDULED' } });
    await this.audit.log({ action: 'cbt.scheduled', entityType: 'OnlineExam', entityId: id, summary: `Scheduled online exam "${exam.title}"` });
    await this.notifyStudents(updated, `New online exam: ${exam.title}`, `Opens ${await this.when(exam.opensAt)} · ${exam.durationMinutes} minutes.`);
    return (await this.cbt.summaries([updated], scope))[0]!;
  }

  @Post(':id/unpublish')
  @HttpCode(200)
  @RequirePermissions('assessment.manage')
  async unpublish(@Param('id') id: string): Promise<CbtExamSummary> {
    const { exam, scope } = await this.cbt.staffExam(id, 'manage');
    if (await this.prisma.db.onlineExamAttempt.count({ where: { examId: id } })) throw new BadRequestException('Students have already started this exam. Close it instead.');
    const updated = await this.prisma.db.onlineExam.update({ where: { id }, data: { status: 'DRAFT' } });
    await this.audit.log({ action: 'cbt.unscheduled', entityType: 'OnlineExam', entityId: id, summary: `Moved online exam "${exam.title}" back to draft` });
    return (await this.cbt.summaries([updated], scope))[0]!;
  }

  /** Ends the exam now: anyone still writing is handed in with what they have saved. */
  @Post(':id/close')
  @HttpCode(200)
  @RequirePermissions('assessment.manage')
  async close(@Param('id') id: string): Promise<CbtExamSummary> {
    const { exam, scope } = await this.cbt.staffExam(id, 'manage');
    if (exam.status === 'DRAFT') throw new BadRequestException('This exam was never scheduled');
    const now = new Date();
    const updated = await this.prisma.db.onlineExam.update({ where: { id }, data: { status: 'CLOSED', ...(exam.closesAt > now ? { closesAt: now } : {}) } });
    const live = await this.prisma.db.onlineExamAttempt.findMany({ where: { examId: id, status: 'IN_PROGRESS' }, select: { id: true } });
    for (const a of live) await this.cbt.finalize(a.id, now);
    await this.audit.log({ action: 'cbt.closed', entityType: 'OnlineExam', entityId: id, summary: `Closed online exam "${exam.title}"${live.length ? ` (${live.length} handed in automatically)` : ''}` });
    return (await this.cbt.summaries([updated], scope))[0]!;
  }

  @Post(':id/release')
  @HttpCode(200)
  @RequirePermissions('assessment.manage')
  async release(@Param('id') id: string, @Body(new ZodPipe(z.object({ released: z.boolean() }))) body: { released: boolean }): Promise<CbtExamSummary> {
    const { exam, scope } = await this.cbt.staffExam(id, 'manage');
    const updated = await this.prisma.db.onlineExam.update({ where: { id }, data: { resultsReleasedAt: body.released ? (exam.resultsReleasedAt ?? new Date()) : null } });
    await this.audit.log({ action: body.released ? 'cbt.released' : 'cbt.unreleased', entityType: 'OnlineExam', entityId: id, summary: `${body.released ? 'Released' : 'Withdrew'} results of "${exam.title}"` });
    if (body.released && !exam.resultsReleasedAt) {
      const sat = await this.prisma.db.onlineExamAttempt.findMany({ where: { examId: id, status: { not: 'IN_PROGRESS' } }, select: { studentId: true } });
      await this.notifyStudents(updated, `Results are out: ${exam.title}`, 'Open the exam to see your score and review your answers.', sat.map((s) => s.studentId));
    }
    return (await this.cbt.summaries([updated], scope))[0]!;
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('assessment.manage')
  async remove(@Param('id') id: string) {
    const { exam } = await this.cbt.staffExam(id, 'manage');
    if (await this.prisma.db.onlineExamAttempt.count({ where: { examId: id } })) throw new BadRequestException('Students have sat this exam, so it can’t be deleted. Close it instead.');
    await this.prisma.db.onlineExam.delete({ where: { id } });
    await this.audit.log({ action: 'cbt.deleted', entityType: 'OnlineExam', entityId: id, summary: `Deleted online exam "${exam.title}"` });
  }

  // ---------------------------------------------------------- live and results

  @Get(':id')
  @RequirePermissions('assessment.read')
  async detail(@Param('id') id: string): Promise<CbtExamDetail> {
    const { exam, paper, scope } = await this.cbt.staffExam(id);
    const now = new Date();
    const [summary, roster] = await Promise.all([this.cbt.summaries([exam], scope), this.cbt.roster(exam, now)]);
    return {
      ...summary[0]!,
      serverNow: now.toISOString(),
      questionCount: paper.items.length,
      writtenQuestions: paper.items.filter((i) => !isObjective(i.question.type)).length,
      roster,
    };
  }

  @Get(':id/results')
  @RequirePermissions('assessment.read')
  async resultsView(@Param('id') id: string): Promise<CbtResults> {
    const { exam, paper, scope } = await this.cbt.staffExam(id);
    const [summary, rows, attempts, { gradingScale }] = await Promise.all([
      this.cbt.summaries([exam], scope),
      this.cbt.roster(exam),
      this.prisma.db.onlineExamAttempt.findMany({ where: { examId: id, status: { not: 'IN_PROGRESS' } } }),
      this.settings.get(),
    ]);
    const marked = rows.filter((r) => r.percent != null);
    const percents = marked.map((r) => r.percent!);
    return {
      exam: summary[0]!,
      summary: {
        sat: rows.filter((r) => r.status === 'SUBMITTED' || r.status === 'MARKED').length,
        marked: marked.length,
        average: percents.length ? round1(percents.reduce((a, b) => a + b, 0) / percents.length) : null,
        highest: percents.length ? Math.max(...percents) : null,
        lowest: percents.length ? Math.min(...percents) : null,
        passRate: percents.length ? round1((percents.filter((p) => gradeFor(p, gradingScale).pass).length / percents.length) * 100) : null,
      },
      rows,
      items: this.itemAnalysis(paper, attempts),
    };
  }

  @Get(':id/results.csv')
  @RequirePermissions('assessment.read')
  @Header('content-type', 'text/csv; charset=utf-8')
  async csv(@Param('id') id: string): Promise<string> {
    const r = await this.resultsView(id);
    const head = ['Student', 'Admission no.', 'Class', 'Status', 'Score', 'Out of', '%', 'Objective score', 'Time taken', 'Answered', 'Focus losses', 'Started', 'Submitted'];
    const lines = r.rows.map((x) =>
      [x.student.name, x.student.admissionNumber, x.student.classArm, x.status.replace('_', ' ').toLowerCase(), x.score, x.total, x.percent, x.objectiveScore, fmtSeconds(x.timeTakenSeconds), x.answered, x.focusLosses, x.startedAt, x.submittedAt].map(csvCell).join(','),
    );
    const items = ['', 'Question analysis', '', ['No.', 'Type', 'Topic', 'Question', 'Marks', 'Sat', '% correct / avg %', 'Discrimination', 'Option counts (A,B,C…)'].join(','), ...r.items.map((i) => [i.number, i.type, i.topic, i.stem.slice(0, 200), i.marks, i.attempts, i.percentCorrect, i.discrimination, i.optionCounts.join(' / ')].map(csvCell).join(','))];
    // A BOM so Excel opens the file as UTF-8.
    return `﻿${[head.join(','), ...lines, ...items].join('\r\n')}\r\n`;
  }

  private itemAnalysis(paper: PaperRow, attempts: Awaited<ReturnType<typeof this.prisma.db.onlineExamAttempt.findMany>>): CbtItemAnalysisRow[] {
    // Upper and lower 27% by overall percentage (objective part when unmarked), for discrimination.
    const pct = (a: (typeof attempts)[number]) => ((a.score ?? a.objectiveScore ?? 0) / Math.max(1, a.total ?? 1)) * 100;
    const ranked = [...attempts].sort((x, y) => pct(y) - pct(x));
    const k = ranked.length >= 10 ? Math.max(1, Math.round(ranked.length * 0.27)) : 0;
    const upper = new Set(ranked.slice(0, k).map((a) => a.id));
    const lower = new Set(ranked.slice(-k || ranked.length).map((a) => a.id));
    return paper.items.map((item, idx) => {
      const q = item.question;
      const objective = isObjective(q.type);
      const sitters = attempts.filter((a) => layoutOf(a).items.some((i) => i.id === q.id));
      const optionCounts = q.options.map(() => 0);
      let answered = 0;
      let correct = 0;
      let markSum = 0;
      let markN = 0;
      let up = 0;
      let low = 0;
      for (const a of sitters) {
        const v = answersOf(a)[q.id];
        const key = layoutOf(a).items.find((i) => i.id === q.id)!.correct;
        if (isAnswered(v)) answered++;
        if (objective) {
          if (typeof v === 'number' && v < optionCounts.length) optionCounts[v]!++;
          if (typeof v === 'number' && v === key) {
            correct++;
            if (upper.has(a.id)) up++;
            if (lower.has(a.id)) low++;
          }
        } else {
          const m = theoryMarksOf(a)[q.id];
          if (typeof m === 'number') {
            markSum += m;
            markN++;
          }
        }
      }
      return {
        questionId: q.id,
        number: idx + 1,
        type: q.type,
        topic: q.topic,
        stem: q.stem,
        marks: q.marks,
        options: q.options,
        correctIndex: objective ? q.correctIndex : null,
        attempts: sitters.length,
        answered,
        percentCorrect: objective ? (sitters.length ? round1((correct / sitters.length) * 100) : null) : markN ? round1((markSum / markN / Math.max(1, q.marks)) * 100) : null,
        averageMark: objective ? null : markN ? round1(markSum / markN) : null,
        optionCounts,
        discrimination: objective && k ? Math.round(((up - low) / k) * 100) / 100 : null,
      };
    });
  }

  // ---------------------------------------------------------- marking

  @Get(':id/marking')
  @RequirePermissions('assessment.manage')
  async marking(@Param('id') id: string): Promise<CbtMarkingSheet> {
    const { exam, paper, scope } = await this.cbt.staffExam(id, 'manage');
    const attempts = await this.prisma.db.onlineExamAttempt.findMany({
      where: { examId: id, status: { not: 'IN_PROGRESS' } },
      orderBy: { submittedAt: 'asc' },
    });
    const students = await this.prisma.db.student.findMany({ where: { id: { in: attempts.map((a) => a.studentId) } }, select: { id: true, firstName: true, lastName: true, admissionNumber: true } });
    const byId = new Map(students.map((s) => [s.id, s]));
    const written = paper.items.filter((i) => !isObjective(i.question.type));
    const sorted = [...attempts].sort((a, b) => fullName(byId.get(a.studentId) ?? { firstName: '', lastName: '' }).localeCompare(fullName(byId.get(b.studentId) ?? { firstName: '', lastName: '' })));
    return {
      exam: (await this.cbt.summaries([exam], scope))[0]!,
      questions: written.map((item) => {
        const q = item.question;
        const answers = sorted
          .filter((a) => layoutOf(a).items.some((i) => i.id === q.id))
          .map((a) => {
            const s = byId.get(a.studentId);
            const v = answersOf(a)[q.id];
            const m = theoryMarksOf(a)[q.id];
            return {
              attemptId: a.id,
              student: { id: a.studentId, name: s ? fullName(s) : 'Student', admissionNumber: s?.admissionNumber ?? '' },
              answer: typeof v === 'string' && v.trim() ? v : null,
              score: typeof m === 'number' ? m : null,
            };
          });
        return {
          questionId: q.id,
          number: paper.items.indexOf(item) + 1,
          type: q.type,
          stem: q.stem,
          marks: q.marks,
          answer: q.answer,
          markingGuide: q.markingGuide,
          answers,
          marked: answers.filter((a) => a.score != null).length,
        };
      }),
    };
  }

  @Put(':id/marks')
  @RequirePermissions('assessment.manage')
  async saveMarks(@Param('id') id: string, @Body(new ZodPipe(cbtMarksSchema)) body: CbtMarksInput): Promise<{ saved: number }> {
    const { exam } = await this.cbt.staffExam(id, 'manage');
    const attempts = await this.prisma.db.onlineExamAttempt.findMany({ where: { examId: exam.id, id: { in: [...new Set(body.marks.map((m) => m.attemptId))] } } });
    const byId = new Map(attempts.map((a) => [a.id, a]));
    const changes = new Map<string, Record<string, number>>();
    for (const m of body.marks) {
      const a = byId.get(m.attemptId);
      if (!a) throw new BadRequestException('One of these students did not sit this exam');
      if (a.status === 'IN_PROGRESS') throw new BadRequestException('A student is still writing; mark them after they hand in');
      const item = layoutOf(a).items.find((i) => i.id === m.questionId);
      if (!item || isObjective(item.type)) throw new BadRequestException('Only written questions are marked by hand');
      if (m.score !== null && m.score > item.marks) throw new BadRequestException(`That question is out of ${item.marks}`);
      const theory = changes.get(a.id) ?? { ...theoryMarksOf(a) };
      if (m.score === null) delete theory[m.questionId];
      else theory[m.questionId] = Math.round(m.score * 100) / 100;
      changes.set(a.id, theory);
    }
    for (const [attemptId, theory] of changes) await this.cbt.rescore(byId.get(attemptId)!, theory);
    return { saved: body.marks.length };
  }

  /** Suggested marks for one written question across students' answers; the teacher confirms each. */
  @Post(':id/questions/:questionId/ai-suggest')
  @HttpCode(200)
  @RequirePermissions('assessment.manage', 'ai.use')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async aiSuggest(@Param('id') id: string, @Param('questionId') questionId: string, @Body(new ZodPipe(cbtAiSuggestSchema)) body: CbtAiSuggestInput): Promise<CbtAiSuggestion[]> {
    const { exam, paper } = await this.cbt.staffExam(id, 'manage');
    const q = paper.items.find((i) => i.question.id === questionId)?.question;
    if (!q || isObjective(q.type)) throw new BadRequestException('Pick a written question');
    const attempts = await this.prisma.db.onlineExamAttempt.findMany({
      where: { examId: exam.id, status: { not: 'IN_PROGRESS' }, ...(body.attemptIds?.length ? { id: { in: body.attemptIds } } : {}) },
      orderBy: { submittedAt: 'asc' },
    });
    // Only real answers, and by default only the ones not yet marked; at most 25 at a time.
    const targets = attempts
      .filter((a) => isAnswered(answersOf(a)[q.id]) && (body.attemptIds?.length || typeof theoryMarksOf(a)[q.id] !== 'number'))
      .slice(0, 25);
    if (!targets.length) throw new BadRequestException('There are no unmarked written answers to this question');
    if (!q.markingGuide && !q.answer) throw new BadRequestException('Add a marking guide or model answer to this question in the Question Bank first');
    const r = await this.gateway.generateJson(
      {
        tier: 'standard',
        system: [
          `You help a Nigerian secondary school teacher mark students' answers to one ${paper.subject.name} exam question for ${paper.classLevel.name}, out of ${q.marks} mark${q.marks === 1 ? '' : 's'}.`,
          'Mark each answer strictly against the marking guide: award a mark only for a point the answer actually makes (equivalent wording and minor spelling errors are fine). Be consistent across answers. Never invent what a student wrote. The teacher reviews every suggestion.',
          `QUESTION: ${q.stem}`,
          q.markingGuide ? `MARKING GUIDE:\n${q.markingGuide}` : 'No marking guide was written; use the model answer.',
          q.answer ? `MODEL ANSWER:\n${q.answer}` : '',
        ]
          .filter(Boolean)
          .join('\n\n'),
        messages: [{ role: 'user', content: targets.map((a, i) => `ANSWER ${i + 1}:\n${String(answersOf(a)[q.id]).slice(0, 3000)}`).join('\n\n') }],
        maxOutputTokens: 400 + targets.length * 160,
      },
      aiMarkSchema,
      'cbt-mark',
    );
    return targets.map((a, i) => {
      const m = r.data.marks.find((x) => x.index === i + 1);
      return { attemptId: a.id, score: Math.max(0, Math.min(q.marks, Math.round((m?.score ?? 0) * 2) / 2)), outOf: q.marks, reasons: (m?.reasons ?? []).slice(0, 4) };
    });
  }

  // ---------------------------------------------------------- score sheet

  /** What sending to the score sheet would do: new marks, unchanged ones and conflicts with marks already there. */
  @Get(':id/scores/preview')
  @RequirePermissions('assessment.manage')
  async scoresPreview(@Param('id') id: string): Promise<CbtScorePreview> {
    const { exam, paper } = await this.cbt.staffExam(id, 'manage');
    return this.preview(exam, paper);
  }

  @Post(':id/scores')
  @HttpCode(200)
  @RequirePermissions('assessment.manage')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async sendScores(@Param('id') id: string, @Body(new ZodPipe(cbtSendScoresSchema)) body: z.output<typeof cbtSendScoresSchema>): Promise<CbtSendScoresResult> {
    const { exam, paper } = await this.cbt.staffExam(id, 'manage');
    const preview = await this.preview(exam, paper);
    const overwrite = new Set(body.overwriteStudentIds);
    const write = preview.rows.filter((r) => r.status === 'NEW' || (r.status === 'CONFLICT' && overwrite.has(r.student.id)));
    if (!write.length) return { written: 0, overwritten: 0, skipped: preview.rows.length };
    const userId = currentContext().userId;
    const tenantId = currentTenantId();
    await this.prisma.db.$transaction(
      write.map((r) =>
        this.prisma.db.score.upsert({
          where: { studentId_subjectId_termId_componentKey: { studentId: r.student.id, subjectId: paper.subjectId, termId: paper.termId, componentKey: paper.componentKey } },
          update: { score: r.newScore!, classArmId: r.classArm!.id, enteredById: userId },
          create: { tenantId, studentId: r.student.id, subjectId: paper.subjectId, termId: paper.termId, classArmId: r.classArm!.id, componentKey: paper.componentKey, score: r.newScore!, enteredById: userId },
        }),
      ),
    );
    const overwritten = write.filter((r) => r.status === 'CONFLICT').length;
    await this.audit.log({
      action: 'results.entered',
      entityType: 'OnlineExam',
      entityId: exam.id,
      summary: `Sent ${write.length} ${paper.subject.name} ${preview.component.name} mark${write.length === 1 ? '' : 's'} from online exam "${exam.title}" to the score sheet${overwritten ? ` (replacing ${overwritten})` : ''}`,
    });
    return { written: write.length - overwritten, overwritten, skipped: preview.rows.length - write.length };
  }

  private async preview(exam: OnlineExam, paper: PaperRow): Promise<CbtScorePreview> {
    const { components } = await this.settings.get();
    const component = components.find((c) => c.key === paper.componentKey);
    if (!component) throw new BadRequestException('The assessment this paper feeds no longer exists in your assessment settings');
    const attempts = await this.prisma.db.onlineExamAttempt.findMany({ where: { examId: exam.id, status: { not: 'IN_PROGRESS' } } });
    const [students, existing] = await Promise.all([
      this.prisma.db.student.findMany({
        where: { id: { in: attempts.map((a) => a.studentId) } },
        select: { id: true, firstName: true, lastName: true, admissionNumber: true, classArmId: true, classArm: { select: { id: true, name: true, classLevel: { select: { name: true } } } } },
      }),
      this.prisma.db.score.findMany({ where: { studentId: { in: attempts.map((a) => a.studentId) }, subjectId: paper.subjectId, termId: paper.termId, componentKey: paper.componentKey } }),
    ]);
    const byStudent = new Map(students.map((s) => [s.id, s]));
    const existingBy = new Map(existing.map((s) => [s.studentId, Number(s.score)]));
    const allowed = new Map<string, boolean>();
    const rows: CbtScorePreviewRow[] = [];
    for (const a of attempts) {
      const s = byStudent.get(a.studentId);
      if (!s) continue;
      const arm = s.classArm ? { id: s.classArm.id, name: `${s.classArm.classLevel.name} ${s.classArm.name}` } : null;
      const existingScore = existingBy.get(s.id) ?? null;
      const newScore = a.status === 'MARKED' && a.score != null && a.total ? round1((a.score / a.total) * component.maxScore) : null;
      let status: CbtScorePreviewRow['status'];
      if (!arm) status = 'NO_CLASS';
      else {
        if (!allowed.has(arm.id)) allowed.set(arm.id, await this.results.canEnterScores(arm.id, paper.subjectId));
        if (!allowed.get(arm.id)) status = 'NOT_ALLOWED';
        else if (newScore == null) status = 'NOT_MARKED';
        else if (existingScore == null) status = 'NEW';
        else status = Math.abs(existingScore - newScore) < 0.005 ? 'SAME' : 'CONFLICT';
      }
      rows.push({ student: { id: s.id, name: fullName(s), admissionNumber: s.admissionNumber }, classArm: arm, status, newScore, existingScore });
    }
    rows.sort((x, y) => (x.classArm?.name ?? '').localeCompare(y.classArm?.name ?? '') || x.student.name.localeCompare(y.student.name));
    return { component, subject: paper.subject, term: { id: paper.term.id, name: `${paper.term.name} · ${paper.term.session.name}` }, rows };
  }

  // ---------------------------------------------------------- helpers

  private async checkArms(armIds: string[], paper: PaperRow, scope: Awaited<ReturnType<CbtService['staffScope']>>) {
    const arms = await this.prisma.db.classArm.findMany({ where: { id: { in: armIds } }, select: { id: true, classLevelId: true } });
    if (arms.length !== new Set(armIds).size) throw new BadRequestException('One of the classes was not found');
    if (arms.some((a) => a.classLevelId !== paper.classLevelId)) throw new BadRequestException(`Every class must be in ${paper.classLevel.name}, the paper's class`);
    const notMine = arms.filter((a) => !this.cbt.teachesArm(scope, a.id, paper.subjectId));
    if (notMine.length) throw new BadRequestException(`You can only schedule ${paper.subject.name} exams for classes you teach it in`);
  }

  private checkWindow(opensAt: string, closesAt: string, duration: number, scheduling: boolean) {
    const open = Date.parse(opensAt);
    const close = Date.parse(closesAt);
    if (close <= open) throw new BadRequestException('The closing time must be after the opening time');
    if (close - open < duration * 60_000) throw new BadRequestException(`The window must be at least ${duration} minutes long so everyone can get the full time`);
    if (scheduling && close <= Date.now()) throw new BadRequestException('The closing time has already passed');
  }

  private async when(d: Date) {
    const t = await this.prisma.root.tenant.findUnique({ where: { id: currentTenantId() }, select: { timezone: true } });
    return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: t?.timezone || 'Africa/Lagos' }).format(d);
  }

  /** In-app notification to the students in the exam's classes (or just these students). */
  private async notifyStudents(exam: OnlineExam, title: string, body: string, studentIds?: string[]) {
    try {
      const students = await this.prisma.db.student.findMany({
        where: { ...(studentIds ? { id: { in: studentIds } } : { classArmId: { in: exam.classArmIds }, status: 'ACTIVE' }), userId: { not: null } },
        select: { userId: true },
      });
      if (!students.length) return;
      await this.prisma.db.notification.createMany({ data: students.map((s) => ({ tenantId: currentTenantId(), userId: s.userId!, title: title.slice(0, 160), body, link: `/my-exams` })) });
    } catch {
      /* notifications are a courtesy */
    }
  }
}
