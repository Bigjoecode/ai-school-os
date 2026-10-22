import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EXAM_LABELS, MOCK_NAME, MOCK_PAPERS, inAppPapers, mockGrade, type ExamSittingRow, type ExamSittingView, type MockExam, type MockPaper, type SittingPaperView, type SittingResult } from '@aischool/shared';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ResolvedAccess } from '../student-ai/entitlements.service';
import { ExamService, MIN_SITTING_OBJECTIVE, shuffle } from './exam.service';
import { subjectKey } from './mastery.service';
import { StudyService, type StoredQuestion } from './study.service';

type Attempt = Prisma.PracticeAttemptGetPayload<object>;
const round1 = (n: number) => Math.round(n * 10) / 10;
const KIND_WORD: Record<MockPaper['kind'], string> = { OBJECTIVE: 'objective', THEORY: 'theory', PRACTICAL: 'practical', NOT_IN_APP: '' };

/**
 * The full mock: one subject, paper by paper as the exam body sets it
 * (WASSCE_PAPERS for WAEC, BECE_PAPERS for BECE). Each paper is its own
 * timed attempt; once every in-app paper is marked, the marks are added up
 * (marks earned over the papers' marks) and graded on the exam's own scale:
 * WAEC A1–F9, BECE A/C/P/F. Papers sat only in person are listed and left
 * out of the grade.
 */
@Injectable()
export class SittingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly study: StudyService,
    private readonly exams: ExamService,
  ) {}

  private entitled(access: ResolvedAccess, exam: MockExam) {
    if (!access.exams.includes(exam)) throw new ForbiddenException({ statusCode: 403, code: 'EXAM_NOT_INCLUDED', exam, message: `Full ${MOCK_NAME[exam]} mocks come with ${EXAM_LABELS[exam]} Prep.` });
  }

  /** Starts a sitting with a snapshot of the subject's papers; a paper with no approved questions yet is left out (and said so). */
  async create(access: ResolvedAccess, input: { exam: MockExam; subject: string }): Promise<ExamSittingView> {
    const exam = input.exam;
    this.entitled(access, exam);
    const subject = subjectKey(input.subject);
    const spec = MOCK_PAPERS[exam][subject];
    if (!spec) throw new BadRequestException(`There is no full ${MOCK_NAME[exam]} mock for ${subject} yet`);
    if (!inAppPapers(spec).length) throw new BadRequestException(`${subject} is examined by practical work only (${spec.map((p) => p.title).join(', ')}), so there is no written mock to sit in the app`);
    const counts = await Promise.all(spec.map(async (p) => (p.kind === 'NOT_IN_APP' ? 0 : this.prisma.root.examQuestion.count({ where: await this.exams.poolWhere(exam, subject, p) }))));
    const p1 = spec.findIndex((p) => p.paper === 1 && p.kind === 'OBJECTIVE');
    if (p1 >= 0 && counts[p1]! < MIN_SITTING_OBJECTIVE) {
      throw new BadRequestException(`${subject} has only ${counts[p1]} approved Paper 1 question${counts[p1] === 1 ? '' : 's'}; a full mock needs at least ${MIN_SITTING_OBJECTIVE}. Try another subject, or practise ${subject} for now.`);
    }
    const snapshot = spec.map((p, i): MockPaper => (p.kind !== 'NOT_IN_APP' && counts[i] === 0 ? { ...p, kind: 'NOT_IN_APP', note: `There are no approved ${KIND_WORD[p.kind]} questions for this paper yet, so it isn’t part of this mock.` } : p));
    if (!inAppPapers(snapshot).length) throw new BadRequestException(`There are no approved ${EXAM_LABELS[exam]} questions for ${subject} yet`);
    const s = await this.prisma.root.examSitting.create({ data: { tenantId: access.tenantId, studentId: access.studentId, exam, subject, spec: snapshot as unknown as Prisma.InputJsonValue } });
    return this.view(access, s.id);
  }

  async list(studentId: string, take = 20): Promise<ExamSittingRow[]> {
    const rows = await this.prisma.root.examSitting.findMany({ where: { studentId }, orderBy: { startedAt: 'desc' }, take, include: { attempts: { select: { paper: true, submittedAt: true } } } });
    return rows.map((s) => {
      const inApp = inAppPapers(s.spec as unknown as MockPaper[]);
      const done = new Set(s.attempts.filter((a) => a.submittedAt).map((a) => a.paper));
      const r = s.result as unknown as SittingResult | null;
      return { id: s.id, exam: s.exam as MockExam, subject: s.subject, startedAt: s.startedAt.toISOString(), finishedAt: s.finishedAt?.toISOString() ?? null, papersDone: inApp.filter((p) => done.has(p.paper)).length, papersInApp: inApp.length, percent: r?.percent ?? null, grade: r?.grade ?? null };
    });
  }

  /**
   * The sitting, paper by paper. Papers whose clock ran out are marked first
   * (objective: what was saved; written: the saved draft), and once every
   * in-app paper is marked the overall result is worked out and kept.
   */
  async view(access: ResolvedAccess, id: string): Promise<ExamSittingView> {
    const s = await this.prisma.root.examSitting.findFirst({ where: { id, studentId: access.studentId } });
    if (!s) throw new NotFoundException('Mock not found');
    const spec = s.spec as unknown as MockPaper[];
    const exam = s.exam as MockExam;
    const attempts: Attempt[] = [];
    for (const a of await this.prisma.root.practiceAttempt.findMany({ where: { sittingId: s.id }, orderBy: { startedAt: 'asc' } })) {
      attempts.push(a.submittedAt ? a : await this.exams.settle(access, await this.study.attempt(access.studentId, a.id)));
    }
    const papers = spec.map((p) => this.paperView(p, attempts.find((a) => a.paper === p.paper) ?? null));
    let result = s.result as unknown as SittingResult | null;
    let finishedAt = s.finishedAt;
    const inApp = papers.filter((p) => p.kind !== 'NOT_IN_APP');
    if (!result && inApp.every((p) => p.status === 'SUBMITTED')) {
      result = this.result(exam, papers, attempts);
      finishedAt = new Date();
      await this.prisma.root.examSitting.update({ where: { id: s.id }, data: { result: result as unknown as Prisma.InputJsonValue, finishedAt } });
    }
    return { id: s.id, exam, subject: s.subject, startedAt: s.startedAt.toISOString(), finishedAt: finishedAt?.toISOString() ?? null, papers, result, notes: this.notes(exam, papers) };
  }

  private paperView(p: MockPaper, a: Attempt | null): SittingPaperView {
    const base = { ...p, attemptId: a?.id ?? null, set: a ? (a.questions as unknown[]).length : null, clockMinutes: a?.durationMinutes ?? p.minutes, endsAt: a?.endsAt?.toISOString() ?? null, earned: null, percent: null };
    if (p.kind === 'NOT_IN_APP') return { ...base, status: 'NOT_IN_APP' };
    if (!a) return { ...base, status: 'NOT_STARTED' };
    if (!a.submittedAt || a.score === null) return { ...base, status: 'IN_PROGRESS' };
    // Objective: correct / items x the paper's marks. Written papers are already scored out of the paper's marks.
    const fraction = a.total ? a.score / a.total : 0;
    return { ...base, status: 'SUBMITTED', earned: p.kind === 'OBJECTIVE' ? round1(fraction * p.marks) : a.score, percent: Math.round(fraction * 100) };
  }

  private result(exam: MockExam, papers: SittingPaperView[], attempts: Attempt[]): SittingResult {
    const inApp = papers.filter((p) => p.kind !== 'NOT_IN_APP');
    const earned = round1(inApp.reduce((t, p) => t + (p.earned ?? 0), 0));
    const outOf = inApp.reduce((t, p) => t + p.marks, 0);
    const percent = outOf ? Math.round((earned / outOf) * 100) : 0;
    const topics = new Map<string, { topic: string; correct: number; total: number }>();
    for (const a of attempts.filter((x) => x.mode === 'MOCK' && x.submittedAt)) {
      for (const t of (a.perTopic as { topic: string; correct: number; total: number }[] | null) ?? []) {
        const m = topics.get(t.topic) ?? { topic: t.topic, correct: 0, total: 0 };
        m.correct += t.correct;
        m.total += t.total;
        topics.set(t.topic, m);
      }
    }
    const topicsMissed = [...topics.values()]
      .filter((t) => t.correct < t.total && t.topic !== 'General')
      .sort((x, y) => x.correct / x.total - y.correct / y.total || y.total - x.total)
      .slice(0, 5);
    const ranked = [...inApp].sort((x, y) => (y.percent ?? 0) - (x.percent ?? 0));
    const best = ranked[0];
    const worst = ranked[ranked.length - 1];
    const summary = [
      ranked.length > 1 && best && worst && best.percent !== worst.percent ? `Strongest: ${best.title} (${best.percent}%). Weakest: ${worst.title} (${worst.percent}%).` : best ? `${inApp.length > 1 ? 'Every paper' : best.title}: ${best.percent}%.` : '',
      topicsMissed.length ? `Revise first: ${topicsMissed.slice(0, 3).map((t) => t.topic).join(', ')}.` : '',
    ]
      .filter(Boolean)
      .join(' ');
    const g = mockGrade(exam, percent);
    return {
      earned,
      outOf,
      percent,
      grade: g.grade,
      remark: g.remark,
      scale: exam,
      papers: inApp.map((p) => ({ paper: p.paper, title: p.title, earned: p.earned ?? 0, marks: p.marks, percent: p.percent ?? 0 })),
      topicsMissed,
      summary,
      leftOut: papers.filter((p) => p.kind === 'NOT_IN_APP').map((p) => p.title),
    };
  }

  private notes(exam: MockExam, papers: SittingPaperView[]): string[] {
    const out: string[] = [];
    const inApp = papers.filter((p) => p.kind !== 'NOT_IN_APP');
    const left = papers.filter((p) => p.kind === 'NOT_IN_APP');
    if (left.length) out.push(`${left.map((p) => p.title.split(':')[0]).join(' and ')} ${left.length === 1 ? 'isn’t' : 'aren’t'} sat in the app, so this grade uses ${inApp.map((p) => p.title.split(':')[0]).join(' and ')} only.`);
    for (const p of inApp) {
      const full = p.kind === 'OBJECTIVE' ? p.questions : p.offered;
      if (p.set !== null && full && p.set < full) out.push(`${p.title.split(':')[0]} has ${p.set} of ${exam === 'BECE' ? 'BECE' : 'WAEC'}’s ${full} questions while our bank grows, timed at ${p.clockMinutes} minutes.`);
    }
    if (inApp.some((p) => p.kind !== 'OBJECTIVE')) out.push('Written papers are marked by AI against the marking guide: treat the grade as a strong guide, not an official result.');
    return out;
  }

  /** Starts one paper on its own clock (or returns it if already started). */
  /** Sets a paper once: if a second request set it first (double click), returns that attempt. */
  private async once<T>(sittingId: string, paper: number, create: () => Promise<T>) {
    try {
      return await create();
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002') throw err;
      return this.prisma.root.practiceAttempt.findFirstOrThrow({ where: { sittingId, paper } });
    }
  }

  async startPaper(access: ResolvedAccess, id: string, paperNo: number) {
    const s = await this.prisma.root.examSitting.findFirst({ where: { id, studentId: access.studentId } });
    if (!s) throw new NotFoundException('Mock not found');
    const exam = s.exam as MockExam;
    this.entitled(access, exam);
    const paper = (s.spec as unknown as MockPaper[]).find((p) => p.paper === paperNo);
    if (!paper) throw new NotFoundException(`This mock has no Paper ${paperNo}`);
    if (paper.kind === 'NOT_IN_APP') throw new BadRequestException(paper.note ?? `${paper.title} isn’t sat in the app`);
    const existing = await this.prisma.root.practiceAttempt.findFirst({ where: { sittingId: s.id, paper: paperNo } });
    if (existing) return existing;
    const pool = await this.prisma.root.examQuestion.findMany({ where: await this.exams.poolWhere(exam, s.subject, paper), include: { topic: { select: { name: true } } } });
    if (!pool.length) throw new BadRequestException(`There are no approved questions for ${paper.title} yet`);
    const title = `${MOCK_NAME[exam]} mock: ${s.subject} — ${paper.title}`;
    if (paper.kind === 'OBJECTIVE') {
      const want = paper.questions ?? pool.length;
      const chosen = shuffle(pool).slice(0, want);
      // A short bank gives a shorter paper on the same time per question.
      const minutes = chosen.length === want ? paper.minutes : Math.max(5, Math.round((paper.minutes * chosen.length) / want));
      return this.once(s.id, paperNo, () => this.study.createAttempt(access, { mode: 'MOCK', exam, subject: s.subject, title, questions: chosen.map((q) => this.exams.stored(q)), durationMinutes: minutes, sittingId: s.id, paper: paperNo }));
    }
    // Written papers: spread across topics, as the exam spreads questions over the syllabus.
    const byTopic = new Map<string, typeof pool>();
    for (const q of shuffle(pool)) byTopic.set(q.topicId ?? '', [...(byTopic.get(q.topicId ?? '') ?? []), q]);
    const groups = shuffle([...byTopic.values()]);
    const offered = Math.min(paper.offered ?? pool.length, pool.length);
    const chosen: typeof pool = [];
    for (let round = 0; chosen.length < offered; round++) for (const g of groups) if (g[round] && chosen.length < offered) chosen.push(g[round]!);
    const want = paper.answer ?? offered;
    const answer = Math.min(want, chosen.length);
    const minutes = answer === want ? paper.minutes : Math.max(10, Math.round((paper.minutes * answer) / want));
    const questions: StoredQuestion[] = chosen.map((q) => ({ questionId: q.id, stem: q.stem, options: [], answer: -1, explanation: q.explanation, topicId: q.topicId, topic: q.topic?.name ?? null, marks: q.marks, markingGuide: q.markingGuide }));
    return this.once(s.id, paperNo, () => this.study.createAttempt(access, { mode: 'THEORY', exam, subject: s.subject, title, questions, durationMinutes: minutes, sittingId: s.id, paper: paperNo, total: paper.marks }));
  }
}
