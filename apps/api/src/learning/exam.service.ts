import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EXAMS, EXAM_LABELS, examEntitlement, type ExamBody, type ExamCatalog, type ExamQuestionInput, type ExamQuestionRow } from '@aischool/shared';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementService, type ResolvedAccess } from '../student-ai/entitlements.service';
import { MasteryService, subjectKey } from './mastery.service';
import { StudyService, type StoredQuestion } from './study.service';

/** Without an exam pack every student still gets a taste: a few short practice sets a term. */
const FREE_SETS_PER_TERM = 3;
const FREE_QUESTIONS = 5;
/** Minutes per question in a mock, by exam (JAMB CBT is fastest). */
const MINUTES_PER_QUESTION: Record<ExamBody, number> = { JAMB: 0.9, WAEC: 1.2, NECO: 1.2, BECE: 1.2 };

const theoryDraftSchema = z.object({
  questions: z.array(
    z.object({
      stem: z.string().describe('The question, with parts (a), (b)… where useful'),
      marks: z.number().int().describe('Total marks'),
      markingGuide: z.string().describe('The points that earn marks, each with its mark'),
      modelAnswer: z.string().describe('A concise full-mark answer'),
    }),
  ),
});
const theoryMarkSchema = z.object({
  marks: z.array(
    z.object({
      index: z.number().int().describe('Question number, from 1'),
      score: z.number().describe('Marks awarded'),
      strengths: z.array(z.string()).describe('Points the answer earned marks for'),
      missing: z.array(z.string()).describe('Guide points the answer missed'),
      feedback: z.string().describe('One or two sentences on how to improve'),
    }),
  ),
  overall: z.string().describe('Two or three sentences on the whole attempt and what to revise'),
});

const draftSchema = z.object({
  questions: z.array(
    z.object({
      stem: z.string(),
      options: z.array(z.string()).describe('Exactly 4 options (WAEC/NECO/BECE) or 4 (JAMB), without letters'),
      answer: z.number().int().describe('Index of the correct option'),
      explanation: z.string().describe('Why the answer is right, in 1–3 sentences'),
    }),
  ),
});

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Exam Academy: BECE, WAEC, NECO and JAMB preparation from one shared,
 * reviewed question bank. Practice is open to everyone in small doses; full
 * practice and timed mocks need the exam's entitlement (bought by a parent
 * or sponsored by the school). Marking uses the stored key; mastery is
 * updated per topic; an AI review is written only from the marked result.
 */
@Injectable()
export class ExamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: AiGatewayService,
    private readonly entitlements: EntitlementService,
    private readonly study: StudyService,
    private readonly audit: AuditService,
    private readonly mastery: MasteryService,
  ) {}

  private async freeUsed(access: ResolvedAccess) {
    return this.prisma.root.practiceAttempt.count({ where: { studentId: access.studentId, mode: 'PRACTICE', startedAt: { gte: new Date(access.windowStart) }, exam: { in: EXAMS.filter((e) => !access.exams.includes(e)) } } });
  }

  async catalog(access: ResolvedAccess): Promise<ExamCatalog> {
    const counts = await this.prisma.root.examQuestion.groupBy({ by: ['exam', 'subject'], where: { status: 'PUBLISHED' }, _count: { _all: true }, orderBy: [{ exam: 'asc' }, { subject: 'asc' }] });
    return {
      exams: EXAMS.map((exam) => ({
        exam,
        label: EXAM_LABELS[exam],
        entitled: access.exams.includes(exam),
        subjects: counts.filter((c) => c.exam === exam).map((c) => ({ subject: c.subject, questions: c._count._all })),
      })),
      freePractice: { setsPerTerm: FREE_SETS_PER_TERM, questionsPerSet: FREE_QUESTIONS, used: await this.freeUsed(access) },
    };
  }

  async start(access: ResolvedAccess, input: { mode: 'PRACTICE' | 'MOCK'; exam: ExamBody; subjects: string[]; topicId?: string | null; questions: number }) {
    const entitled = access.exams.includes(input.exam);
    if (input.mode === 'MOCK' && !entitled) throw new ForbiddenException({ statusCode: 403, code: 'EXAM_NOT_INCLUDED', exam: input.exam, message: `Timed ${EXAM_LABELS[input.exam]} mock exams come with ${EXAM_LABELS[input.exam]} Prep.` });
    let n = input.questions;
    if (!entitled) {
      if ((await this.freeUsed(access)) >= FREE_SETS_PER_TERM) {
        throw new ForbiddenException({ statusCode: 403, code: 'EXAM_NOT_INCLUDED', exam: input.exam, message: `You've used this term's free practice sets. ${EXAM_LABELS[input.exam]} Prep unlocks unlimited practice and timed mocks.` });
      }
      n = Math.min(n, FREE_QUESTIONS);
    }
    const subjects = [...new Set(input.subjects.map(subjectKey))];
    const pool = await this.prisma.root.examQuestion.findMany({
      where: { exam: input.exam, subject: { in: subjects }, status: 'PUBLISHED', type: 'OBJECTIVE', ...(input.topicId ? { topicId: input.topicId } : {}) },
      include: { topic: { select: { name: true } } },
    });
    if (!pool.length) throw new BadRequestException(`There are no ${EXAM_LABELS[input.exam]} questions for ${subjects.join(', ')} yet`);
    // An even spread across the chosen subjects.
    const per = Math.ceil(n / subjects.length);
    const picked = subjects.flatMap((s) => shuffle(pool.filter((q) => q.subject === s)).slice(0, per));
    const chosen = shuffle(picked).slice(0, n);
    const questions: StoredQuestion[] = chosen.map((q) => {
      // Options are shuffled too, so a remembered letter is no help.
      const opts = (q.options as string[]).map((text, i) => ({ text, right: i === q.answer }));
      const mixed = shuffle(opts);
      return { questionId: q.id, stem: q.stem, options: mixed.map((o) => o.text), answer: mixed.findIndex((o) => o.right), explanation: q.explanation, topicId: q.topicId, topic: q.topic?.name ?? null };
    });
    const minutes = input.mode === 'MOCK' ? Math.max(5, Math.round(questions.length * MINUTES_PER_QUESTION[input.exam])) : null;
    const title = `${EXAM_LABELS[input.exam]} ${input.mode === 'MOCK' ? 'mock' : 'practice'}: ${subjects.join(', ')}`;
    return this.study.createAttempt(access, { mode: input.mode, exam: input.exam, subject: subjects.length === 1 ? subjects[0] : null, topicId: input.topicId, title, questions, durationMinutes: minutes });
  }

  /** After marking: a short, specific review from the marked result (uses one tutor session if any are left). */
  async review(access: ResolvedAccess, attemptId: string) {
    const a = await this.study.attempt(access.studentId, attemptId);
    if (!a.submittedAt) throw new BadRequestException('Submit the attempt first');
    if (a.review) return a;
    if (access.remaining < 1) return a;
    const per = (a.perTopic as { topic: string; correct: number; total: number }[] | null) ?? [];
    const qs = a.questions as unknown as StoredQuestion[];
    const answers = (a.answers as (number | null)[] | null) ?? [];
    const wrong = qs.map((q, i) => ({ q, i })).filter(({ q, i }) => answers[i] !== q.answer).slice(0, 8);
    const facts = [
      `${a.title}: ${a.score}/${a.total} (${a.total ? Math.round(((a.score ?? 0) / a.total) * 100) : 0}%).`,
      `By topic: ${per.map((t) => `${t.topic} ${t.correct}/${t.total}`).join('; ')}`,
      'Questions missed:',
      ...wrong.map(({ q, i }) => `- ${q.stem.slice(0, 200)} | chose: ${answers[i] !== null && answers[i] !== undefined && answers[i]! >= 0 ? q.options[answers[i]!] : 'no answer'} | right: ${q.options[q.answer]}`),
    ].join('\n');
    try {
      const r = await this.study.withAllowance(access, {}, (tier) =>
        this.gateway.generate(
          {
            tier,
            system: 'You review a Nigerian student\'s exam practice from the marked result below. In under 150 words: one line on how they did, the 2–3 topics to work on with why (from the misses), and a concrete next step. Encouraging, specific, British English. Use only the facts given.',
            messages: [{ role: 'user', content: facts }],
            maxOutputTokens: 500,
          },
          'exam-review',
        ),
      );
      return this.prisma.root.practiceAttempt.update({ where: { id: a.id }, data: { review: r.text.trim() } });
    } catch {
      return a;
    }
  }

  // ---------------------------------------------------------- the bank (console)

  row(q: Prisma.ExamQuestionGetPayload<{ include: { topic: true } }>): ExamQuestionRow {
    return {
      id: q.id,
      exam: q.exam as ExamBody,
      type: q.type as ExamQuestionRow['type'],
      marks: q.marks,
      markingGuide: q.markingGuide,
      subject: q.subject,
      topicId: q.topicId,
      topic: q.topic?.name ?? null,
      year: q.year,
      stem: q.stem,
      options: q.options as string[],
      answer: q.answer,
      explanation: q.explanation,
      difficulty: q.difficulty as ExamQuestionRow['difficulty'],
      source: q.source as ExamQuestionRow['source'],
      status: q.status as ExamQuestionRow['status'],
      updatedAt: q.updatedAt.toISOString(),
    };
  }

  async bank(filter: { exam?: string; subject?: string; status?: string; q?: string; type?: string }) {
    const rows = await this.prisma.root.examQuestion.findMany({
      where: {
        ...(filter.exam ? { exam: filter.exam } : {}),
        ...(filter.type ? { type: filter.type } : {}),
        ...(filter.subject ? { subject: filter.subject } : {}),
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.q ? { stem: { contains: filter.q, mode: 'insensitive' } } : {}),
      },
      include: { topic: true },
      orderBy: [{ updatedAt: 'desc' }],
      take: 500,
    });
    const summary = await this.prisma.root.examQuestion.groupBy({ by: ['exam', 'status'], _count: { _all: true } });
    return { rows: rows.map((q) => this.row(q)), summary: summary.map((s) => ({ exam: s.exam, status: s.status, count: s._count._all })) };
  }

  private check(input: ExamQuestionInput) {
    if (input.type === 'THEORY') {
      if (!input.markingGuide) throw new BadRequestException('Theory questions need a marking guide: what a full-mark answer contains');
      return;
    }
    if (input.options.length < 2) throw new BadRequestException('Give at least two options');
    if (input.answer >= input.options.length) throw new BadRequestException('The answer must be one of the options');
  }

  async create(input: ExamQuestionInput, userId: string) {
    this.check(input);
    const q = await this.prisma.root.examQuestion.create({
      data: { ...input, subject: subjectKey(input.subject), options: input.options, createdById: userId, reviewedById: input.status === 'PUBLISHED' ? userId : null },
      include: { topic: true },
    });
    return this.row(q);
  }

  async update(id: string, input: ExamQuestionInput, userId: string) {
    this.check(input);
    const before = await this.prisma.root.examQuestion.findUniqueOrThrow({ where: { id } });
    const q = await this.prisma.root.examQuestion.update({
      where: { id },
      data: { ...input, subject: subjectKey(input.subject), options: input.options, ...(input.status === 'PUBLISHED' && before.status !== 'PUBLISHED' ? { reviewedById: userId } : {}) },
      include: { topic: true },
    });
    return this.row(q);
  }

  async setStatus(ids: string[], status: 'DRAFT' | 'PUBLISHED' | 'RETIRED', userId: string) {
    const r = await this.prisma.root.examQuestion.updateMany({ where: { id: { in: ids } }, data: { status, ...(status === 'PUBLISHED' ? { reviewedById: userId } : {}) } });
    await this.audit.log({ tenantId: null, action: 'content.questions_status', summary: `Marked ${r.count} exam questions ${status.toLowerCase()}` });
    return { updated: r.count };
  }

  async import(rows: ExamQuestionInput[], userId: string) {
    rows.forEach((r) => this.check(r));
    const r = await this.prisma.root.examQuestion.createMany({ data: rows.map((x) => ({ ...x, subject: subjectKey(x.subject), options: x.options, status: x.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT', createdById: userId, reviewedById: x.status === 'PUBLISHED' ? userId : null })) });
    await this.audit.log({ tenantId: null, action: 'content.questions_imported', summary: `Imported ${r.count} exam questions` });
    return { imported: r.count };
  }

  /** AI drafts for the content team: saved as DRAFT, never shown to students until a person publishes them. */
  async draft(input: { exam: ExamBody; subject: string; topicId?: string | null; count: number; difficulty: string; type?: 'OBJECTIVE' | 'THEORY' }, userId: string) {
    const topic = input.topicId ? await this.prisma.root.syllabusTopic.findUnique({ where: { id: input.topicId } }) : null;
    const subject = subjectKey(input.subject);
    if (input.type === 'THEORY') {
      const t = await this.gateway.generateJson(
        {
          tier: 'advanced',
          system: `You write original ${EXAM_LABELS[input.exam]}-style theory (essay/structured) questions for ${subject}${topic ? `, topic: ${topic.name}${topic.objectives.length ? `; objectives: ${topic.objectives.slice(0, 8).join('; ')}` : ''}` : ''}, at ${input.difficulty.toLowerCase()} difficulty, following the Nigerian syllabus. Do not copy past papers. Give each question its marks and a marking guide listing the points that earn marks (e.g. "1 mark: …"), adding up to the total.`,
          messages: [{ role: 'user', content: `Write ${input.count} theory questions.` }],
          maxOutputTokens: 5000,
        },
        theoryDraftSchema,
        'exam-question-draft',
      );
      const rows = t.data.questions.filter((q) => q.stem && q.markingGuide).slice(0, input.count);
      await this.prisma.root.examQuestion.createMany({
        data: rows.map((q) => ({ exam: input.exam, type: 'THEORY', subject, topicId: topic?.id ?? null, stem: q.stem, options: [], answer: 0, marks: Math.max(1, Math.min(100, Math.round(q.marks))), markingGuide: q.markingGuide, explanation: q.modelAnswer, difficulty: input.difficulty, source: 'AI_REVIEWED', status: 'DRAFT', createdById: userId })),
      });
      return { drafted: rows.length, provider: t.provider, model: t.model };
    }
    const r = await this.gateway.generateJson(
      {
        tier: 'advanced',
        system: `You write original ${EXAM_LABELS[input.exam]}-style multiple-choice questions for ${subject}${topic ? `, topic: ${topic.name}${topic.objectives.length ? `; objectives: ${topic.objectives.slice(0, 8).join('; ')}` : ''}` : ''}, at ${input.difficulty.toLowerCase()} difficulty, following the Nigerian syllabus. Do not copy past papers. Exactly 4 options. Double-check each answer and keep explanations accurate.`,
        messages: [{ role: 'user', content: `Write ${input.count} questions.` }],
        maxOutputTokens: 4000,
      },
      draftSchema,
      'exam-question-draft',
    );
    const ok = r.data.questions.filter((q) => q.options.length >= 2 && q.answer >= 0 && q.answer < q.options.length).slice(0, input.count);
    await this.prisma.root.examQuestion.createMany({
      data: ok.map((q) => ({ exam: input.exam, subject, topicId: topic?.id ?? null, stem: q.stem, options: q.options.slice(0, 5), answer: q.answer, explanation: q.explanation, difficulty: input.difficulty, source: 'AI_REVIEWED', status: 'DRAFT', createdById: userId })),
    });
    return { drafted: ok.length, provider: r.provider, model: r.model };
  }

  // ---------------------------------------------------------- theory practice

  /** Published theory questions for a written practice attempt (students need the exam's prep pack). */
  async startTheory(access: ResolvedAccess, input: { exam: ExamBody; subject: string; questions: number }) {
    if (!access.exams.includes(input.exam)) throw new ForbiddenException({ statusCode: 403, code: 'EXAM_NOT_INCLUDED', exam: input.exam, message: `Theory practice with AI marking comes with ${EXAM_LABELS[input.exam]} Prep.` });
    const subject = subjectKey(input.subject);
    const pool = await this.prisma.root.examQuestion.findMany({ where: { exam: input.exam, subject, status: 'PUBLISHED', type: 'THEORY' }, include: { topic: { select: { name: true } } } });
    if (!pool.length) throw new BadRequestException(`There are no ${EXAM_LABELS[input.exam]} theory questions for ${subject} yet`);
    const chosen = shuffle(pool).slice(0, input.questions);
    const questions: StoredQuestion[] = chosen.map((q) => ({ questionId: q.id, stem: q.stem, options: [], answer: -1, explanation: q.explanation, topicId: q.topicId, topic: q.topic?.name ?? null, marks: q.marks, markingGuide: q.markingGuide }));
    return this.study.createAttempt(access, { mode: 'THEORY', exam: input.exam, subject, title: `${EXAM_LABELS[input.exam]} theory: ${subject}`, questions });
  }

  /**
   * Marks written answers against each question's guide (one AI request for
   * the set, on the student's allowance). Topic mastery gets the evidence;
   * the marking guide and model answer are shown after marking.
   */
  async markTheory(access: ResolvedAccess, attemptId: string, answers: string[]) {
    const a = await this.study.attempt(access.studentId, attemptId);
    if (a.mode !== 'THEORY') throw new BadRequestException('This is not a theory attempt');
    if (a.submittedAt) return a;
    const qs = a.questions as unknown as (StoredQuestion & { marks: number; markingGuide: string | null })[];
    if (!answers.some((x) => x?.trim())) throw new BadRequestException('Write at least one answer');
    const marking = await this.study.withAllowance(access, {}, (tier) =>
      this.gateway.generateJson(
        {
          tier,
          system: 'You are an experienced Nigerian exam marker. Mark each answer strictly against its marking guide: award a mark only for a point the answer actually makes (equivalent wording is fine). Be fair and specific; never invent content the student did not write.',
          messages: [{ role: 'user', content: qs.map((q, i) => `QUESTION ${i + 1} (${q.marks} marks): ${q.stem}\nMARKING GUIDE: ${q.markingGuide}\nSTUDENT'S ANSWER: ${answers[i]?.trim() || '(no answer)'}`).join('\n\n') }],
          maxOutputTokens: 3000,
        },
        theoryMarkSchema,
        'exam-theory-mark',
      ),
    );
    const marks = qs.map((q, i) => {
      const m = marking.data.marks.find((x) => x.index === i + 1) ?? marking.data.marks[i];
      return { index: i, score: Math.max(0, Math.min(q.marks, Math.round((m?.score ?? 0) * 2) / 2)), outOf: q.marks, strengths: m?.strengths ?? [], missing: m?.missing ?? [], feedback: m?.feedback ?? '' };
    });
    const score = marks.reduce((t, m) => t + m.score, 0);
    const total = qs.reduce((t, q) => t + q.marks, 0);
    await this.prisma.root.practiceAttempt.update({
      where: { id: a.id },
      data: { answers: answers as unknown as Prisma.InputJsonValue, score: Math.round(score), total, submittedAt: new Date(), perTopic: marks as unknown as Prisma.InputJsonValue, review: marking.data.overall },
    });
    for (const [i, q] of qs.entries()) {
      const topicId = q.topicId ?? (q.topic && a.subject ? (await this.mastery.topicFor(a.studentId, a.subject, q.topic)).id : null);
      if (topicId) await this.mastery.record(a.tenantId, a.studentId, topicId, marks[i]!.score, q.marks);
    }
    return this.prisma.root.practiceAttempt.findUniqueOrThrow({ where: { id: a.id } });
  }

  async remove(id: string) {
    const q = await this.prisma.root.examQuestion.findUnique({ where: { id } });
    if (!q) throw new NotFoundException('Question not found');
    await this.prisma.root.examQuestion.delete({ where: { id } });
  }
}
