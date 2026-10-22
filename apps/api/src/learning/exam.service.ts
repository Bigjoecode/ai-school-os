import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EXAMS, EXAM_LABELS, MIN_PUBLISHED_TO_LIST, MOCK_EXAMS, MOCK_PAPERS, UTME, examEntitlement, utmeLabel, type ExamBody, type ExamCatalog, type ExamQuestionInput, type ExamQuestionRow, type ExamTopicRow, type MockExam, type MockPaper, type UtmeShortfall } from '@aischool/shared';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementService, type ResolvedAccess } from '../student-ai/entitlements.service';
import { MasteryService, levelOf, subjectKey } from './mastery.service';
import { StudyService, THEORY_GRACE_MS, type StoredQuestion } from './study.service';

/** Without an exam pack every student still gets a taste: a few short practice sets a term. */
const FREE_SETS_PER_TERM = 3;
const FREE_QUESTIONS = 5;
/** Minutes per question in a mock, by exam (JAMB CBT is fastest). */
const MINUTES_PER_QUESTION: Record<ExamBody, number> = { JAMB: 0.9, WAEC: 1.2, NECO: 1.2, BECE: 1.2 };
/** Fewest Paper 1 questions for a full WASSCE, NECO or BECE mock (a short bank gives a shorter, pro-rata timed Paper 1). */
export const MIN_SITTING_OBJECTIVE = 10;
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
      options: z.array(z.string()).describe('Exactly 4 options (5 for NECO), without letters'),
      answer: z.number().int().describe('Index of the correct option'),
      explanation: z.string().describe('Why the answer is right, in 1–3 sentences'),
    }),
  ),
});

export function shuffle<T>(xs: T[]): T[] {
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
    const counts = await this.prisma.root.examQuestion.groupBy({ by: ['exam', 'subject', 'type'], where: { status: 'PUBLISHED' }, _count: { _all: true }, orderBy: [{ exam: 'asc' }, { subject: 'asc' }] });
    // Subjects with a syllabus in the graph (NECO uses WAEC's until its own is loaded) appear as "coming soon" until they have enough questions.
    const syllabus = await this.prisma.root.syllabusTopic.findMany({ where: { parentId: null, exams: { isEmpty: false } }, select: { subject: true, exams: true } });
    const topicsFor = (exam: ExamBody) => {
      const own = syllabus.filter((t) => t.exams.includes(exam));
      const rows = own.length || exam !== 'NECO' ? own : syllabus.filter((t) => t.exams.includes('WAEC'));
      const m = new Map<string, number>();
      for (const t of rows) m.set(t.subject, (m.get(t.subject) ?? 0) + 1);
      return m;
    };
    // Past papers by year: licensed past questions only (our own questions carry no year).
    const papers = await this.prisma.root.examQuestion.groupBy({ by: ['exam', 'subject', 'year'], where: { status: 'PUBLISHED', type: 'OBJECTIVE', source: 'LICENSED', year: { not: null } }, _count: { _all: true }, orderBy: [{ subject: 'asc' }, { year: 'desc' }] });
    const fullMock = new Map<string, Set<string>>();
    for (const exam of MOCK_EXAMS) fullMock.set(exam, await this.fullMockSubjects(exam, counts.filter((c) => c.exam === exam && c.type === 'OBJECTIVE').map((c) => ({ subject: c.subject, n: c._count._all }))));
    // Only known when the student is in a class (no guessing for unplaced students).
    const placed = await this.prisma.root.student.findUnique({ where: { id: access.studentId }, select: { classArm: { select: { classLevel: { select: { stage: true, name: true } } } } } });
    const level = placed?.classArm ? levelOf(placed.classArm.classLevel.stage, placed.classArm.classLevel.name) : null;
    return {
      level: (level as ExamCatalog['level']) ?? null,
      exams: EXAMS.map((exam) => {
        // A subject is listed once it has enough objective questions for a practice set; the count shown includes theory.
        const mine = new Map<string, { objective: number; all: number }>();
        for (const c of counts.filter((x) => x.exam === exam)) {
          const m = mine.get(c.subject) ?? { objective: 0, all: 0 };
          m.all += c._count._all;
          if (c.type === 'OBJECTIVE') m.objective += c._count._all;
          mine.set(c.subject, m);
        }
        const topics = topicsFor(exam);
        const listed = [...mine].filter(([, m]) => m.objective >= MIN_PUBLISHED_TO_LIST);
        const soon = [...new Set([...topics.keys(), ...mine.keys()])]
          .filter((subject) => !listed.some(([s]) => s === subject))
          .map((subject) => ({ subject, topics: topics.get(subject) ?? 0, questions: mine.get(subject)?.objective ?? 0 }))
          .sort((a, b) => b.questions - a.questions || a.subject.localeCompare(b.subject));
        return {
          exam,
          label: EXAM_LABELS[exam],
          entitled: access.exams.includes(exam),
          subjects: listed.map(([subject, m]) => ({ subject, questions: m.all, objective: m.objective, ...(fullMock.has(exam) ? { fullMock: fullMock.get(exam)!.has(subject) } : {}) })),
          comingSoon: soon,
          pastPapers: papers.filter((p) => p.exam === exam && p.year !== null).map((p) => ({ subject: p.subject, year: p.year!, questions: p._count._all })),
        };
      }),
      freePractice: { setsPerTerm: FREE_SETS_PER_TERM, questionsPerSet: FREE_QUESTIONS, used: await this.freeUsed(access) },
    };
  }

  /** Subjects whose full WASSCE, NECO or BECE mock has enough Paper 1 questions (topic-restricted papers are counted on their own pool). */
  private async fullMockSubjects(exam: MockExam, objective: { subject: string; n: number }[]) {
    const out = new Set<string>();
    for (const { subject, n } of objective) {
      const p1 = MOCK_PAPERS[exam][subject]?.find((p) => p.kind === 'OBJECTIVE' && p.paper === 1);
      if (!p1 || n < MIN_SITTING_OBJECTIVE) continue;
      const enough = p1.topics?.length || p1.excludeTopics?.length ? (await this.prisma.root.examQuestion.count({ where: await this.poolWhere(exam, subject, p1) })) >= MIN_SITTING_OBJECTIVE : true;
      if (enough) out.add(subject);
    }
    return out;
  }

  /**
   * The published questions a mock paper draws from: its question type
   * (objective, theory or practical) and any topic restriction, a named topic
   * taking in its subtopics. BECE papers name junior topics (WAEC's senior
   * syllabus can share a subject and topic names); NECO papers name senior
   * ones, from WAEC's syllabus until NECO's own is loaded.
   */
  async poolWhere(exam: ExamBody, subject: string, paper: MockPaper): Promise<Prisma.ExamQuestionWhereInput> {
    const type = paper.kind === 'NOT_IN_APP' ? 'OBJECTIVE' : paper.kind;
    const level = exam === 'BECE' ? { level: 'JUNIOR' } : exam === 'NECO' ? { level: 'SENIOR' } : {};
    const ids = async (names: string[]) => {
      let found = (await this.prisma.root.syllabusTopic.findMany({ where: { subject, ...level, name: { in: names, mode: 'insensitive' } }, select: { id: true } })).map((t) => t.id);
      for (let depth = 0, next = found; depth < 2 && next.length; depth++) {
        next = (await this.prisma.root.syllabusTopic.findMany({ where: { parentId: { in: next } }, select: { id: true } })).map((t) => t.id);
        found = [...found, ...next];
      }
      return found;
    };
    const only = paper.topics?.length ? await ids(paper.topics) : null;
    const not = paper.excludeTopics?.length ? await ids(paper.excludeTopics) : null;
    return {
      exam,
      subject,
      status: 'PUBLISHED',
      type,
      ...(only ? { topicId: { in: only } } : {}),
      // NOT IN leaves out rows without a topic, so those are let back in.
      ...(not?.length ? { OR: [{ topicId: null }, { topicId: { notIn: not } }] } : {}),
    };
  }

  /** A question for an attempt; options are shuffled (so a remembered letter is no help) unless `keepOrder` (past papers). */
  stored(q: { id: string; stem: string; options: Prisma.JsonValue; answer: number; explanation: string | null; topicId: string | null; subject: string; topic: { name: string } | null }, keepOrder = false): StoredQuestion {
    const opts = (q.options as string[]).map((text, i) => ({ text, right: i === q.answer }));
    const mixed = keepOrder ? opts : shuffle(opts);
    return { questionId: q.id, stem: q.stem, options: mixed.map((o) => o.text), answer: mixed.findIndex((o) => o.right), explanation: q.explanation, topicId: q.topicId, topic: q.topic?.name ?? null, subject: q.subject };
  }

  async start(access: ResolvedAccess, input: { mode: 'PRACTICE' | 'MOCK'; exam: ExamBody; subjects: string[]; topicId?: string | null; questions: number; difficulty?: 'EASY' | 'MEDIUM' | 'HARD' | null; year?: number | null }) {
    if (input.year) return this.startPastPaper(access, { exam: input.exam, subject: input.subjects[0]!, year: input.year });
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
    // A topic filter takes in its subtopics too.
    const topicIds = input.topicId ? [input.topicId, ...(await this.prisma.root.syllabusTopic.findMany({ where: { parentId: input.topicId }, select: { id: true } })).map((t) => t.id)] : null;
    const pool = await this.prisma.root.examQuestion.findMany({
      where: { exam: input.exam, subject: { in: subjects }, status: 'PUBLISHED', type: 'OBJECTIVE', ...(topicIds ? { topicId: { in: topicIds } } : {}), ...(input.difficulty ? { difficulty: input.difficulty } : {}) },
      include: { topic: { select: { name: true } } },
    });
    if (!pool.length) throw new BadRequestException(`There are no ${EXAM_LABELS[input.exam]} questions for ${subjects.join(', ')}${input.difficulty || topicIds ? ' with these filters' : ''} yet`);
    // An even spread across the chosen subjects.
    const per = Math.ceil(n / subjects.length);
    const picked = subjects.flatMap((s) => shuffle(pool.filter((q) => q.subject === s)).slice(0, per));
    const chosen = shuffle(picked).slice(0, n);
    const questions: StoredQuestion[] = chosen.map((q) => this.stored(q));
    const minutes = input.mode === 'MOCK' ? Math.max(5, Math.round(questions.length * MINUTES_PER_QUESTION[input.exam])) : null;
    const topicName = input.topicId ? (await this.prisma.root.syllabusTopic.findUnique({ where: { id: input.topicId }, select: { name: true } }))?.name : null;
    const filters = [topicName ?? '', input.difficulty ? input.difficulty.toLowerCase() : ''].filter(Boolean);
    const title = `${EXAM_LABELS[input.exam]} ${input.mode === 'MOCK' ? 'mock' : 'practice'}: ${subjects.join(', ')}${filters.length ? ` (${filters.join(', ')})` : ''}`;
    return this.study.createAttempt(access, { mode: input.mode, exam: input.exam, subject: subjects.length === 1 ? subjects[0] : null, topicId: input.topicId, title, questions, durationMinutes: minutes });
  }

  /**
   * A past paper by year: the licensed past questions of one subject and year,
   * in their original order (bank reference, then creation), options as set.
   * Untimed practice; free practice rules apply without the exam's Prep.
   */
  async startPastPaper(access: ResolvedAccess, input: { exam: ExamBody; subject: string; year: number }) {
    const entitled = access.exams.includes(input.exam);
    if (!entitled && (await this.freeUsed(access)) >= FREE_SETS_PER_TERM) {
      throw new ForbiddenException({ statusCode: 403, code: 'EXAM_NOT_INCLUDED', exam: input.exam, message: `You've used this term's free practice sets. ${EXAM_LABELS[input.exam]} Prep unlocks every past paper.` });
    }
    const subject = subjectKey(input.subject);
    const rows = await this.prisma.root.examQuestion.findMany({
      where: { exam: input.exam, subject, year: input.year, source: 'LICENSED', status: 'PUBLISHED', type: 'OBJECTIVE' },
      include: { topic: { select: { name: true } } },
      orderBy: [{ bankRef: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }, { id: 'asc' }],
      take: 200,
    });
    if (!rows.length) throw new BadRequestException(`There is no ${EXAM_LABELS[input.exam]} ${input.year} ${subject} paper yet`);
    const chosen = entitled ? rows : rows.slice(0, FREE_QUESTIONS);
    const exam = input.exam === 'JAMB' ? 'JAMB' : EXAM_LABELS[input.exam];
    return this.study.createAttempt(access, { mode: 'PRACTICE', exam: input.exam, subject, title: `${exam} ${input.year} — ${input.exam === 'JAMB' ? utmeLabel(subject) : subject}`, questions: chosen.map((q) => this.stored(q, true)) });
  }

  /** Approved questions per topic for one exam subject (practice by topic). */
  async topics(exam: ExamBody, subjectName: string): Promise<ExamTopicRow[]> {
    const subject = subjectKey(subjectName);
    const counts = await this.prisma.root.examQuestion.groupBy({ by: ['topicId'], where: { exam, subject, status: 'PUBLISHED', type: 'OBJECTIVE', topicId: { not: null } }, _count: { _all: true } });
    const topics = await this.prisma.root.syllabusTopic.findMany({ where: { id: { in: counts.map((c) => c.topicId!) } }, select: { id: true, name: true, parent: { select: { name: true } } } });
    return counts
      .map((c) => {
        const t = topics.find((x) => x.id === c.topicId);
        return { topicId: c.topicId!, topic: t?.name ?? 'Topic', parent: t?.parent?.name ?? null, questions: c._count._all };
      })
      .sort((a, b) => (a.parent ?? a.topic).localeCompare(b.parent ?? b.topic) || a.topic.localeCompare(b.topic));
  }

  /** How many approved objective questions each UTME subject has, against what the full paper needs. */
  private async utmePools(subjects: string[]) {
    const pool = await this.prisma.root.examQuestion.findMany({
      where: { exam: 'JAMB', subject: { in: subjects }, status: 'PUBLISHED', type: 'OBJECTIVE' },
      include: { topic: { select: { name: true } } },
    });
    return subjects.map((subject) => {
      const rows = pool.filter((q) => q.subject === subject);
      const needed: number = subject === UTME.english ? UTME.englishQuestions : UTME.otherQuestions;
      return { subject, rows, needed, shortfall: rows.length < needed ? ({ subject, label: utmeLabel(subject), available: rows.length, needed } satisfies UtmeShortfall) : null };
    });
  }

  /**
   * A full JAMB UTME CBT mock: Use of English (60) plus three other subjects
   * (40 each), 180 questions on one 120-minute timer. Questions stay grouped
   * by subject (Use of English first, then the order chosen), shuffled within
   * each subject, options shuffled per attempt. If a subject has fewer
   * approved questions than the paper needs, the student is told exactly
   * which and may start a shorter mock (time scaled to the questions).
   */
  async startUtme(access: ResolvedAccess, input: { subjects: string[]; allowShort: boolean }) {
    if (!access.exams.includes('JAMB')) throw new ForbiddenException({ statusCode: 403, code: 'EXAM_NOT_INCLUDED', exam: 'JAMB', message: `Full UTME CBT mocks come with ${EXAM_LABELS.JAMB} Prep.` });
    const others = [...new Set(input.subjects.map(subjectKey))].filter((s) => s !== UTME.english);
    if (others.length !== UTME.otherSubjects) throw new BadRequestException(`Choose ${UTME.otherSubjects} different subjects besides ${UTME.englishLabel} (it is compulsory and always included).`);
    const pools = await this.utmePools([UTME.english, ...others]);
    const empty = pools.filter((p) => !p.rows.length);
    if (empty.length) throw new BadRequestException(`${empty.map((p) => utmeLabel(p.subject)).join(', ')} ${empty.length === 1 ? 'has' : 'have'} no approved ${EXAM_LABELS.JAMB} questions yet. Choose another subject.`);
    const short = pools.map((p) => p.shortfall).filter((x): x is UtmeShortfall => !!x);
    if (short.length && !input.allowShort) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'UTME_SHORTFALL',
        shortfalls: short,
        message: short.map((s) => `${s.label} has only ${s.available} approved question${s.available === 1 ? '' : 's'} — a full mock needs ${s.needed}`).join('. ') + '. You can start a shorter mock instead.',
      });
    }
    const questions = pools.flatMap((p) => shuffle(p.rows).slice(0, p.needed).map((q) => this.stored(q)));
    const full = questions.length === UTME.questions;
    const minutes = full ? UTME.minutes : Math.max(10, Math.round((UTME.minutes * questions.length) / UTME.questions));
    const title = `${EXAM_LABELS.JAMB} mock${full ? '' : ' (shorter)'}: ${pools.map((p) => utmeLabel(p.subject)).join(', ')}`;
    return this.study.createAttempt(access, { mode: 'UTME', exam: 'JAMB', subject: null, title, questions, durationMinutes: minutes });
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
      reviewedAt: q.reviewedAt?.toISOString() ?? null,
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
    if (input.type !== 'OBJECTIVE') {
      if (!input.markingGuide) throw new BadRequestException(`${input.type === 'PRACTICAL' ? 'Practical' : 'Theory'} questions need a marking guide: what a full-mark answer contains`);
      return;
    }
    if (input.options.length < 2) throw new BadRequestException('Give at least two options');
    if (input.answer >= input.options.length) throw new BadRequestException('The answer must be one of the options');
  }

  async create(input: ExamQuestionInput, userId: string) {
    this.check(input);
    const q = await this.prisma.root.examQuestion.create({
      data: { ...input, subject: subjectKey(input.subject), options: input.options, createdById: userId, reviewedById: input.status === 'PUBLISHED' ? userId : null, reviewedAt: input.status === 'PUBLISHED' ? new Date() : null },
      include: { topic: true },
    });
    return this.row(q);
  }

  async update(id: string, input: ExamQuestionInput, userId: string) {
    this.check(input);
    const before = await this.prisma.root.examQuestion.findUniqueOrThrow({ where: { id } });
    const q = await this.prisma.root.examQuestion.update({
      where: { id },
      data: { ...input, subject: subjectKey(input.subject), options: input.options, ...(input.status === 'PUBLISHED' && before.status !== 'PUBLISHED' ? { reviewedById: userId, reviewedAt: new Date() } : {}) },
      include: { topic: true },
    });
    return this.row(q);
  }

  async setStatus(ids: string[], status: 'DRAFT' | 'PUBLISHED' | 'RETIRED', userId: string) {
    const r = await this.prisma.root.examQuestion.updateMany({ where: { id: { in: ids } }, data: { status, ...(status === 'PUBLISHED' ? { reviewedById: userId, reviewedAt: new Date() } : {}) } });
    await this.audit.log({ tenantId: null, action: 'content.questions_status', summary: `Marked ${r.count} exam questions ${status.toLowerCase()}` });
    return { updated: r.count };
  }

  async import(rows: ExamQuestionInput[], userId: string) {
    rows.forEach((r) => this.check(r));
    const r = await this.prisma.root.examQuestion.createMany({ data: rows.map((x) => ({ ...x, subject: subjectKey(x.subject), options: x.options, status: x.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT', createdById: userId, reviewedById: x.status === 'PUBLISHED' ? userId : null, reviewedAt: x.status === 'PUBLISHED' ? new Date() : null })) });
    await this.audit.log({ tenantId: null, action: 'content.questions_imported', summary: `Imported ${r.count} exam questions` });
    return { imported: r.count };
  }

  /** AI drafts for the content team: saved as DRAFT, never shown to students until a person publishes them. */
  async draft(input: { exam: ExamBody; subject: string; topicId?: string | null; count: number; difficulty: string; type?: 'OBJECTIVE' | 'THEORY' | 'PRACTICAL' }, userId: string) {
    const topic = input.topicId ? await this.prisma.root.syllabusTopic.findUnique({ where: { id: input.topicId } }) : null;
    const subject = subjectKey(input.subject);
    if (input.type === 'THEORY' || input.type === 'PRACTICAL') {
      const practical = input.type === 'PRACTICAL';
      const t = await this.gateway.generateJson(
        {
          tier: 'advanced',
          system: `You write original ${EXAM_LABELS[input.exam]}-style ${practical ? '"alternative to practical" questions (a described experiment, specimen or task with readings, tables or diagrams in words; the candidate records, calculates, interprets and states precautions)' : 'theory (essay/structured) questions'} for ${subject}${topic ? `, topic: ${topic.name}${topic.objectives.length ? `; objectives: ${topic.objectives.slice(0, 8).join('; ')}` : ''}` : ''}, at ${input.difficulty.toLowerCase()} difficulty, following the Nigerian syllabus. Do not copy past papers. Give each question its marks and a marking guide listing the points that earn marks (e.g. "1 mark: …"), adding up to the total.`,
          messages: [{ role: 'user', content: `Write ${input.count} ${practical ? 'practical' : 'theory'} questions.` }],
          maxOutputTokens: 5000,
        },
        theoryDraftSchema,
        'exam-question-draft',
      );
      const rows = t.data.questions.filter((q) => q.stem && q.markingGuide).slice(0, input.count);
      await this.prisma.root.examQuestion.createMany({
        data: rows.map((q) => ({ exam: input.exam, type: input.type, subject, topicId: topic?.id ?? null, stem: q.stem, options: [], answer: 0, marks: Math.max(1, Math.min(100, Math.round(q.marks))), markingGuide: q.markingGuide, explanation: q.modelAnswer, difficulty: input.difficulty, source: 'AI_REVIEWED', status: 'DRAFT', createdById: userId })),
      });
      return { drafted: rows.length, provider: t.provider, model: t.model };
    }
    const r = await this.gateway.generateJson(
      {
        tier: 'advanced',
        system: `You write original ${EXAM_LABELS[input.exam]}-style multiple-choice questions for ${subject}${topic ? `, topic: ${topic.name}${topic.objectives.length ? `; objectives: ${topic.objectives.slice(0, 8).join('; ')}` : ''}` : ''}, at ${input.difficulty.toLowerCase()} difficulty, following the Nigerian syllabus. Do not copy past papers. Exactly ${input.exam === 'NECO' ? 5 : 4} options. Double-check each answer and keep explanations accurate.`,
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

  /** A full mock paper's spec (marks, how many answers count), or null for an attempt outside a sitting. */
  async sittingPaper(a: { sittingId: string | null; paper: number | null }): Promise<MockPaper | null> {
    if (!a.sittingId || !a.paper) return null;
    const s = await this.prisma.root.examSitting.findUnique({ where: { id: a.sittingId }, select: { spec: true } });
    return (s?.spec as unknown as MockPaper[] | undefined)?.find((p) => p.paper === a.paper) ?? null;
  }

  /**
   * Marks written answers against each question's guide (one AI request for
   * the answered questions, on the student's allowance; blanks score zero
   * without asking). Topic mastery gets the evidence from answered questions;
   * the marking guide and model answer are shown after marking.
   *
   * A paper of a full mock counts the best `answer` questions (blanks as
   * zero when fewer were answered), scaled to the paper's marks. A timed
   * paper is accepted up to THEORY_GRACE_MS after its clock; after that, the
   * draft saved in time is what gets marked.
   */
  async markTheory(access: ResolvedAccess, attemptId: string, posted: string[]) {
    const a = await this.study.attempt(access.studentId, attemptId);
    if (a.mode !== 'THEORY') throw new BadRequestException('This is not a theory attempt');
    if (a.submittedAt) return a;
    const late = !!a.endsAt && Date.now() > a.endsAt.getTime() + THEORY_GRACE_MS;
    const answers = (late ? ((a.answers as (string | null)[] | null) ?? []) : posted).map((x) => (typeof x === 'string' ? x : ''));
    const qs = a.questions as unknown as (StoredQuestion & { marks: number; markingGuide: string | null })[];
    const answered = qs.map((_, i) => i).filter((i) => answers[i]?.trim());
    if (!answered.length && !a.endsAt) throw new BadRequestException('Write at least one answer');
    const marks = qs.map((q, i) => ({ index: i, score: 0, outOf: q.marks, strengths: [] as string[], missing: [] as string[], feedback: 'Not answered.' }));
    let overall = 'No answers were written before time ran out, so this paper scores zero.';
    if (answered.length) {
      const marking = await this.study.withAllowance(access, {}, (tier) =>
        this.gateway.generateJson(
          {
            tier,
            system: 'You are an experienced Nigerian exam marker. Mark each answer strictly against its marking guide: award a mark only for a point the answer actually makes (equivalent wording is fine). Be fair and specific; never invent content the student did not write.',
            messages: [{ role: 'user', content: answered.map((qi, k) => `QUESTION ${k + 1} (${qs[qi]!.marks} marks): ${qs[qi]!.stem}\nMARKING GUIDE: ${qs[qi]!.markingGuide}\nSTUDENT'S ANSWER: ${answers[qi]!.trim()}`).join('\n\n') }],
            maxOutputTokens: Math.min(8000, 1000 + 500 * answered.length),
          },
          theoryMarkSchema,
          'exam-theory-mark',
        ),
      );
      answered.forEach((qi, k) => {
        const q = qs[qi]!;
        const m = marking.data.marks.find((x) => x.index === k + 1) ?? marking.data.marks[k];
        marks[qi] = { index: qi, score: Math.max(0, Math.min(q.marks, Math.round((m?.score ?? 0) * 2) / 2)), outOf: q.marks, strengths: m?.strengths ?? [], missing: m?.missing ?? [], feedback: m?.feedback ?? '' };
      });
      overall = marking.data.overall;
    }
    const paper = await this.sittingPaper(a);
    let score: number;
    let total: number;
    if (paper) {
      // The exam counts the questions the rubric asks for: the best `answer` of them, blanks as zero.
      const counted = Math.max(1, Math.min(paper.answer ?? qs.length, qs.length));
      const best = marks.map((m) => (m.outOf ? m.score / m.outOf : 0)).sort((x, y) => y - x).slice(0, counted);
      total = paper.marks;
      score = Math.round((best.reduce((t, f) => t + f, 0) / counted) * paper.marks);
    } else {
      score = Math.round(marks.reduce((t, m) => t + m.score, 0));
      total = qs.reduce((t, q) => t + q.marks, 0);
    }
    const saved = await this.prisma.root.practiceAttempt.updateMany({
      where: { id: a.id, submittedAt: null },
      data: { answers: answers as unknown as Prisma.InputJsonValue, score, total, submittedAt: new Date(), perTopic: marks as unknown as Prisma.InputJsonValue, review: overall },
    });
    if (saved.count) {
      for (const qi of answered) {
        const q = qs[qi]!;
        try {
          const topicId = q.topicId ?? (q.topic && a.subject ? (await this.mastery.topicFor(a.studentId, a.subject, q.topic)).id : null);
          if (topicId) await this.mastery.record(a.tenantId, a.studentId, topicId, marks[qi]!.score, q.marks, { source: 'PRACTICE', sourceId: a.id });
        } catch {
          /* mastery is a side effect: the marked result stands */
        }
      }
    }
    return this.prisma.root.practiceAttempt.findUniqueOrThrow({ where: { id: a.id } });
  }

  /** A timed written paper left past its clock and grace: marks the saved draft (zero if blank). If marking can't run now, it stays open to submit later. */
  async settle(access: ResolvedAccess, a: Prisma.PracticeAttemptGetPayload<object>) {
    if (a.mode !== 'THEORY' || a.submittedAt || !a.endsAt || Date.now() <= a.endsAt.getTime() + THEORY_GRACE_MS) return a;
    try {
      return await this.markTheory(access, a.id, []);
    } catch {
      return a;
    }
  }

  async remove(id: string) {
    const q = await this.prisma.root.examQuestion.findUnique({ where: { id } });
    if (!q) throw new NotFoundException('Question not found');
    await this.prisma.root.examQuestion.delete({ where: { id } });
  }
}
