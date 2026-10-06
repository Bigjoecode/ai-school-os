import { BadRequestException, ConflictException, HttpException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import {
  DEFAULT_QUESTION_TARGETS,
  EXAMS,
  EXAM_LABELS,
  MIN_PUBLISHED_TO_LIST,
  QUESTION_DIFFICULTIES,
  type CoverageCounts,
  type ExamBody,
  type ExamCoverage,
  type ExamCoverageRow,
  type ExamQuestionInput,
  type FillGapsInput,
  type PipelineJob,
  type PipelineSettings,
  type PipelineSettingsInput,
  type QuestionFlag,
  type QuestionTarget,
  type ReviewItem,
  type ReviewQueue,
  type ReviewStats,
  type SelfCheck,
  type SubjectCoverage,
  type TopicCoverage,
} from '@aischool/shared';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client';
import { AiGatewayService, type GatewayResult } from '../ai/ai-gateway.service';
import { GenerationQueue } from '../ai/generation-queue';
import { costUsd } from '../ai/pricing';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ExamService } from './exam.service';
import { subjectKey } from './mastery.service';

/*
 * Exam Academy question-bank pipeline.
 *
 * Coverage: every root syllabus topic of an exam's subject has a target
 * (objective + theory questions); published questions count toward it,
 * drafts are shown but don't. Subtopic questions roll up into their root.
 *
 * Fill gaps: a background job drafts questions per topic with the AI (the
 * topic's objectives and content, the exam's style, a difficulty mix, the
 * topic's existing stems to avoid), validates each item, drops near
 * duplicates, then asks a cheaper model to solve each one independently and
 * records whether it agrees with the key. Drafts are saved as DRAFT.
 *
 * Review: nothing is published without a person. Approving sets
 * reviewedById/reviewedAt. AI drafts are marked by source AI_REVIEWED with
 * createdById null and reviewedAt null (see packages/shared question-pipeline.ts).
 *
 * State lives in platform_settings (console work has no school, so ai_jobs,
 * which belongs to a school, doesn't fit):
 *   question-pipeline:settings      targets per exam/subject, daily AI budget
 *   question-job:<id>               one fill-gaps job (progress, counts, log)
 *   question-check:<questionId>     the AI self-check of one draft
 *   question-review-log:<YYYY-MM-DD> per reviewer approved/edited/rejected counts
 */

const SETTINGS_KEY = 'question-pipeline:settings';
const JOB_PREFIX = 'question-job:';
const CHECK_PREFIX = 'question-check:';
const LOG_PREFIX = 'question-review-log:';
const AGENTS = ['exam-question-batch', 'exam-question-check'];
const DEFAULT_DAILY_BUDGET_USD = 10;
/** NECO follows the same senior secondary curriculum; until its own syllabus is loaded it uses WAEC's topics. */
const SYLLABUS_FALLBACK: Partial<Record<ExamBody, ExamBody>> = { NECO: 'WAEC' };
const OBJ_CHUNK = 5;
const THEORY_CHUNK = 2;
const MAX_ROUNDS = 3;
const DUPLICATE_SIMILARITY = 0.8;
const DIFFICULTY_MIX: [(typeof QUESTION_DIFFICULTIES)[number], number][] = [
  ['EASY', 0.3],
  ['MEDIUM', 0.5],
  ['HARD', 0.2],
];

const EXAM_STYLE: Record<ExamBody, string> = {
  WAEC: 'WASSCE (WAEC) for SS3 candidates. Objective items are Paper 1 style: a clear stem and four options with one best answer. Theory items are Paper 2 style: structured questions with parts (a), (b), (c), using command words such as state, explain, describe, calculate, distinguish.',
  NECO: 'NECO SSCE for SS3 candidates. Objective items have a clear stem and four options with one best answer. Theory items are structured with parts (a), (b), (c), using command words such as state, explain, describe, calculate.',
  BECE: 'BECE (Junior WAEC) for JSS3 candidates: plain language a 14-year-old reads easily. Objective items have four options with one best answer. Theory items are short structured questions with parts.',
  JAMB: 'JAMB UTME computer-based test for university entry: concise stems, four options with one best answer, testing understanding and application rather than recall alone, with plausible distractors built from common misconceptions.',
};

const objectiveBatchSchema = z.object({
  questions: z.array(
    z.object({
      stem: z.string().describe('The question stem; self-contained; no option letters'),
      options: z.array(z.string()).describe('Exactly 4 options, plain text, without A/B/C/D letters'),
      answer: z.number().int().describe('0-based index of the single correct option (0 = first option)'),
      explanation: z.string().describe('Why the keyed option is right (and, briefly, why a tempting distractor is wrong), 1–3 sentences'),
      difficulty: z.enum(QUESTION_DIFFICULTIES),
      subtopic: z.string().describe('The subtopic it belongs to, copied from the list, or empty'),
    }),
  ),
});
const theoryBatchSchema = z.object({
  questions: z.array(
    z.object({
      stem: z.string().describe('The question with its parts (a), (b), (c)… and the marks for each part in brackets'),
      marks: z.number().int().describe('Total marks for the question'),
      guide: z.array(z.object({ point: z.string().describe('A point that earns marks'), marks: z.number().int().describe('Marks for this point') })).describe('Marking guide points; their marks add up exactly to the total'),
      modelAnswer: z.string().describe('A concise full-mark answer'),
      difficulty: z.enum(QUESTION_DIFFICULTIES),
      subtopic: z.string().describe('The subtopic it belongs to, copied from the list, or empty'),
    }),
  ),
});
const objectiveCheckSchema = z.object({
  results: z.array(
    z.object({
      index: z.number().int().describe('Question number, from 1'),
      answer: z.number().int().describe('Your own answer: 0 = A, 1 = B, 2 = C, 3 = D; -1 if no option is correct'),
      problem: z.boolean().describe('true if the question is ambiguous, factually wrong, has more than one correct option, or is outside the syllabus level'),
      issue: z.string().describe('One short sentence on the problem, or empty'),
    }),
  ),
});
const theoryCheckSchema = z.object({
  results: z.array(
    z.object({
      index: z.number().int().describe('Question number, from 1'),
      problem: z.boolean().describe('true if the question is unclear, a guide point is wrong, an expected point is missing, or the marks do not fit'),
      issue: z.string().describe('One short sentence on the problem, or empty'),
    }),
  ),
});

type Plan = { topicId: string; name: string; objective: number; theory: number };
type QRow = Prisma.ExamQuestionGetPayload<{ include: { topic: true } }>;

// ------------------------------------------------------------------ text helpers

const STOP = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'to', 'is', 'are', 'and', 'or', 'for', 'which', 'what', 'following', 'with', 'by', 'as', 'at', 'be', 'its', 'it', 'that', 'this', 'from']);
export function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function tokens(s: string): Set<string> {
  return new Set(normalise(s).split(' ').filter((w) => w && !STOP.has(w)));
}
/** Jaccard similarity of the content words (1 = same words). */
export function similarity(a: Set<string> | string, b: Set<string> | string): number {
  const x = typeof a === 'string' ? tokens(a) : a;
  const y = typeof b === 'string' ? tokens(b) : b;
  if (!x.size && !y.size) return 1;
  let inter = 0;
  for (const w of x) if (y.has(w)) inter++;
  return inter / (x.size + y.size - inter);
}
const stripLetter = (o: string) => o.replace(/^\s*(\(?[A-Ea-e][.):]|\([A-Ea-e]\))\s+/, '').trim();
/** Sum of the "N mark(s): …" lines of a marking guide, or null when none can be read. */
export function guideMarks(guide: string | null): number | null {
  if (!guide) return null;
  const nums = guide
    .split('\n')
    .map((l) => /^\s*[-•*]?\s*(\d+(?:\.\d+)?)\s*marks?\b/i.exec(l)?.[1])
    .filter((x): x is string => !!x)
    .map(Number);
  return nums.length ? nums.reduce((t, n) => t + n, 0) : null;
}
function dayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}
function emptyCounts(): CoverageCounts {
  return { published: { objective: 0, theory: 0 }, draft: { objective: 0, theory: 0 }, difficulty: { EASY: 0, MEDIUM: 0, HARD: 0 } };
}
function addCounts(into: CoverageCounts, c: CoverageCounts) {
  into.published.objective += c.published.objective;
  into.published.theory += c.published.theory;
  into.draft.objective += c.draft.objective;
  into.draft.theory += c.draft.theory;
  for (const d of QUESTION_DIFFICULTIES) into.difficulty[d] += c.difficulty[d];
}

@Injectable()
export class QuestionPipelineService implements OnModuleInit {
  private readonly logger = new Logger(QuestionPipelineService.name);
  private readonly cancelled = new Set<string>();
  /** Serialises read-modify-write of the review log within this process. */
  private logChain: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: AiGatewayService,
    private readonly queue: GenerationQueue,
    private readonly audit: AuditService,
    private readonly exams: ExamService,
  ) {}

  /** Jobs run in this process: any left running by a restart are marked failed. */
  async onModuleInit() {
    try {
      const rows = await this.prisma.root.platformSetting.findMany({ where: { key: { startsWith: JOB_PREFIX } } });
      for (const r of rows) {
        const j = r.value as unknown as PipelineJob;
        if (j.state === 'QUEUED' || j.state === 'RUNNING') {
          await this.saveJob({ ...j, state: 'FAILED', current: null, error: 'Interrupted by a server restart. Start it again to continue — drafts already saved are kept.', finishedAt: new Date().toISOString() });
        }
      }
    } catch (err) {
      this.logger.warn(`Pipeline job sweep skipped: ${(err as Error).message}`);
    }
  }

  // ---------------------------------------------------------------- settings

  async settings(): Promise<PipelineSettings> {
    const row = await this.prisma.root.platformSetting.findUnique({ where: { key: SETTINGS_KEY } });
    const v = (row?.value ?? {}) as PipelineSettingsInput;
    const defaults = { ...DEFAULT_QUESTION_TARGETS } as Record<ExamBody, QuestionTarget>;
    for (const e of EXAMS) if (v.defaults?.[e]) defaults[e] = { ...v.defaults[e] };
    defaults.JAMB = { ...defaults.JAMB, theory: 0 };
    return { defaults, subjects: v.subjects ?? {}, dailyBudgetUsd: v.dailyBudgetUsd ?? DEFAULT_DAILY_BUDGET_USD, spentTodayUsd: await this.spentToday() };
  }

  async saveSettings(input: PipelineSettingsInput, userId: string): Promise<PipelineSettings> {
    const row = await this.prisma.root.platformSetting.findUnique({ where: { key: SETTINGS_KEY } });
    const cur = (row?.value ?? {}) as PipelineSettingsInput;
    const subjects = { ...(cur.subjects ?? {}), ...(input.subjects ?? {}) };
    // A subject override equal to its exam default is dropped; JAMB never has theory.
    const next: PipelineSettingsInput = { defaults: { ...(cur.defaults ?? {}), ...(input.defaults ?? {}) }, subjects, dailyBudgetUsd: input.dailyBudgetUsd ?? cur.dailyBudgetUsd };
    for (const [k, t] of Object.entries(subjects)) if (k.startsWith('JAMB:')) subjects[k] = { ...t, theory: 0 };
    await this.prisma.root.platformSetting.upsert({ where: { key: SETTINGS_KEY }, create: { key: SETTINGS_KEY, value: next as Prisma.InputJsonValue, updatedBy: userId }, update: { value: next as Prisma.InputJsonValue, updatedBy: userId } });
    await this.audit.log({ tenantId: null, action: 'content.pipeline_settings', summary: 'Updated question-bank targets' });
    return this.settings();
  }

  private target(s: PipelineSettings, exam: ExamBody, subject: string): QuestionTarget {
    const t = s.subjects[`${exam}:${subject}`] ?? s.defaults[exam];
    return exam === 'JAMB' ? { objective: t.objective, theory: 0 } : t;
  }

  private async spentToday(): Promise<number> {
    const since = new Date(`${dayKey()}T00:00:00.000Z`);
    const agg = await this.prisma.root.aiUsage.aggregate({ where: { agent: { in: AGENTS }, createdAt: { gte: since } }, _sum: { costUsd: true } });
    return Number(agg._sum.costUsd ?? 0);
  }

  // ---------------------------------------------------------------- coverage

  /** The exam whose syllabus topics apply (its own, else a fallback), or null when none is loaded. */
  async syllabusExam(exam: ExamBody): Promise<ExamBody | null> {
    if (await this.prisma.root.syllabusTopic.count({ where: { exams: { has: exam } } })) return exam;
    const fb = SYLLABUS_FALLBACK[exam];
    if (fb && (await this.prisma.root.syllabusTopic.count({ where: { exams: { has: fb } } }))) return fb;
    return null;
  }

  private async counts(exam: ExamBody, subject?: string) {
    const groups = await this.prisma.root.examQuestion.groupBy({
      by: ['subject', 'topicId', 'status', 'type', 'difficulty'],
      where: { exam, status: { in: ['PUBLISHED', 'DRAFT'] }, ...(subject ? { subject } : {}) },
      _count: { _all: true },
    });
    const by = new Map<string, CoverageCounts>();
    for (const g of groups) {
      const key = `${g.subject}|${g.topicId ?? ''}`;
      const c = by.get(key) ?? emptyCounts();
      const n = g._count._all;
      const kind = g.type === 'THEORY' ? 'theory' : 'objective';
      if (g.status === 'PUBLISHED') c.published[kind] += n;
      else c.draft[kind] += n;
      if (g.status === 'PUBLISHED' && (QUESTION_DIFFICULTIES as readonly string[]).includes(g.difficulty)) c.difficulty[g.difficulty as 'EASY'] += n;
      by.set(key, c);
    }
    return by;
  }

  /** Builds topic coverage for one subject from its topics and the per-topic counts. */
  private build(subject: string, topics: { id: string; name: string; parentId: string | null; objectives: string[]; order: number }[], counts: Map<string, CoverageCounts>, target: QuestionTarget) {
    const ids = new Set(topics.map((t) => t.id));
    const node = (t: (typeof topics)[number]): TopicCoverage => ({ id: t.id, name: t.name, parentId: t.parentId, objectives: t.objectives.length, target: null, gap: null, children: [], ...structuredClone(counts.get(`${subject}|${t.id}`) ?? emptyCounts()) });
    const roots = topics.filter((t) => !t.parentId || !ids.has(t.parentId)).map(node);
    const byId = new Map(roots.map((r) => [r.id, r]));
    for (const t of topics) {
      if (!t.parentId || !ids.has(t.parentId)) continue;
      // Subtopics of subtopics roll up to the root as well.
      let p = topics.find((x) => x.id === t.parentId);
      while (p?.parentId && ids.has(p.parentId)) p = topics.find((x) => x.id === p!.parentId);
      const root = p ? byId.get(p.id) : undefined;
      if (!root) continue;
      const child = node(t);
      root.children.push(child);
      addCounts(root, child);
      root.objectives += child.objectives;
    }
    for (const r of roots) {
      r.target = target;
      r.gap = { objective: Math.max(0, target.objective - r.published.objective), theory: Math.max(0, target.theory - r.published.theory) };
    }
    const unassigned = emptyCounts();
    for (const [k, c] of counts) {
      const [s, tid] = k.split('|');
      if (s === subject && (!tid || !ids.has(tid))) addCounts(unassigned, c);
    }
    const per = target.objective + target.theory;
    const toward = roots.reduce((t, r) => t + Math.min(r.published.objective, target.objective) + Math.min(r.published.theory, target.theory), 0);
    const all = [...roots.map((r) => r as CoverageCounts), unassigned];
    const published = all.reduce((t, c) => t + c.published.objective + c.published.theory, 0);
    const drafts = all.reduce((t, c) => t + c.draft.objective + c.draft.theory, 0);
    const targetQuestions = roots.length * per;
    return {
      topics: roots,
      unassigned,
      totals: {
        topics: roots.length,
        objectives: roots.reduce((t, r) => t + r.objectives, 0),
        targetQuestions,
        publishedTowardTarget: toward,
        coveragePct: targetQuestions ? Math.round((toward / targetQuestions) * 1000) / 10 : 0,
        published,
        drafts,
        gap: targetQuestions - toward,
      },
      complete: roots.filter((r) => r.gap!.objective === 0 && r.gap!.theory === 0).length,
    };
  }

  async subjectCoverage(exam: ExamBody, subjectName: string): Promise<SubjectCoverage> {
    const subject = subjectKey(subjectName);
    const [settings, syl] = await Promise.all([this.settings(), this.syllabusExam(exam)]);
    const topics = syl ? await this.prisma.root.syllabusTopic.findMany({ where: { subject, exams: { has: syl } }, select: { id: true, name: true, parentId: true, objectives: true, order: true }, orderBy: [{ order: 'asc' }, { name: 'asc' }] }) : [];
    const target = this.target(settings, exam, subject);
    const b = this.build(subject, topics, await this.counts(exam, subject), target);
    return { exam, subject, syllabusExam: syl, target, topics: b.topics, unassigned: b.unassigned, totals: b.totals };
  }

  async examCoverage(exam: ExamBody): Promise<ExamCoverage> {
    const [settings, syl] = await Promise.all([this.settings(), this.syllabusExam(exam)]);
    const topics = syl ? await this.prisma.root.syllabusTopic.findMany({ where: { exams: { has: syl } }, select: { id: true, subject: true, name: true, parentId: true, objectives: true, order: true } }) : [];
    const counts = await this.counts(exam);
    const subjects = [...new Set([...topics.map((t) => t.subject), ...[...counts.keys()].map((k) => k.split('|')[0]!)])].sort();
    const rows: ExamCoverageRow[] = subjects.map((subject) => {
      const target = this.target(settings, exam, subject);
      const b = this.build(subject, topics.filter((t) => t.subject === subject), counts, target);
      const publishedObjective = [...counts].filter(([k]) => k.startsWith(`${subject}|`)).reduce((t, [, c]) => t + c.published.objective, 0);
      return { subject, topics: b.totals.topics, objectives: b.totals.objectives, target, targetQuestions: b.totals.targetQuestions, published: b.totals.published, drafts: b.totals.drafts, gap: b.totals.gap, coveragePct: b.totals.coveragePct, topicsComplete: b.complete, listed: publishedObjective >= MIN_PUBLISHED_TO_LIST };
    });
    const sum = (f: (r: ExamCoverageRow) => number) => rows.reduce((t, r) => t + f(r), 0);
    const targetQuestions = sum((r) => r.targetQuestions);
    const gap = sum((r) => r.gap);
    return {
      exam,
      syllabusExam: syl,
      subjects: rows,
      totals: { subjects: rows.length, listed: rows.filter((r) => r.listed).length, targetQuestions, published: sum((r) => r.published), drafts: sum((r) => r.drafts), gap, coveragePct: targetQuestions ? Math.round(((targetQuestions - gap) / targetQuestions) * 1000) / 10 : 0 },
    };
  }

  // ---------------------------------------------------------------- jobs

  private async saveJob(job: PipelineJob) {
    const key = JOB_PREFIX + job.id;
    const value = job as unknown as Prisma.InputJsonValue;
    await this.prisma.root.platformSetting.upsert({ where: { key }, create: { key, value, updatedBy: job.createdBy }, update: { value } });
  }

  async jobs(): Promise<PipelineJob[]> {
    const rows = await this.prisma.root.platformSetting.findMany({ where: { key: { startsWith: JOB_PREFIX } }, orderBy: { updatedAt: 'desc' }, take: 20 });
    return rows.map((r) => r.value as unknown as PipelineJob).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async job(id: string): Promise<PipelineJob> {
    const row = await this.prisma.root.platformSetting.findUnique({ where: { key: JOB_PREFIX + id } });
    if (!row) throw new NotFoundException('Job not found');
    return row.value as unknown as PipelineJob;
  }

  async cancel(id: string): Promise<PipelineJob> {
    const j = await this.job(id);
    if (j.state === 'QUEUED' || j.state === 'RUNNING') this.cancelled.add(id);
    return j;
  }

  /** Plans the topics to fill, records the job and queues it; returns at once. */
  async fill(input: FillGapsInput, userId: string): Promise<PipelineJob> {
    const subject = subjectKey(input.subject);
    if (input.exam === 'JAMB' && input.type === 'THEORY') throw new BadRequestException('JAMB UTME is objective-only: there are no theory questions to draft');
    const type = input.exam === 'JAMB' ? 'OBJECTIVE' : input.type;
    const running = (await this.jobs()).find((j) => j.exam === input.exam && j.subject === subject && (j.state === 'QUEUED' || j.state === 'RUNNING'));
    if (running) throw new ConflictException(`A job for ${EXAM_LABELS[input.exam]} ${subject} is already running`);
    const s = await this.settings();
    if (s.spentTodayUsd >= s.dailyBudgetUsd) throw new HttpException({ statusCode: 429, message: `Today's question-drafting AI budget ($${s.dailyBudgetUsd}) is used up. Raise it in Targets, or try tomorrow.` }, 429);
    const cov = await this.subjectCoverage(input.exam, subject);
    if (!cov.topics.length) throw new BadRequestException(`${subject} has no ${EXAM_LABELS[input.exam]} syllabus topics yet. Import the syllabus first.`);
    const flat = cov.topics.flatMap((t) => [t, ...t.children]);
    const want = (t: TopicCoverage, kind: 'objective' | 'theory'): number => {
      if (kind === 'theory' && (type === 'OBJECTIVE' || cov.target.theory === 0)) return 0;
      if (kind === 'objective' && type === 'THEORY') return 0;
      if (input.perTopic) return kind === 'theory' ? Math.min(input.perTopic, 5) : input.perTopic;
      // Gap filling: drafts awaiting review already count, so a second run doesn't pile up more.
      const gap = t.gap ?? { objective: 3, theory: 0 };
      return Math.max(0, gap[kind] - t.draft[kind]);
    };
    let picked: TopicCoverage[];
    if (input.topicIds.length) {
      const ids = new Set(input.topicIds);
      picked = flat.filter((t) => ids.has(t.id));
      if (!picked.length) throw new BadRequestException('None of those topics belong to this subject');
    } else {
      picked = [...cov.topics].sort((a, b) => b.gap!.objective + b.gap!.theory - (a.gap!.objective + a.gap!.theory));
    }
    const plan: Plan[] = picked
      .map((t) => ({ topicId: t.id, name: t.name, objective: Math.min(20, want(t, 'objective')), theory: Math.min(5, want(t, 'theory')) }))
      .filter((p) => p.objective + p.theory > 0)
      .slice(0, input.maxTopics);
    if (!plan.length) throw new BadRequestException('Nothing to fill: those topics have met their targets (drafts awaiting review count toward them)');

    const job: PipelineJob = {
      id: randomUUID(),
      exam: input.exam,
      subject,
      type,
      state: 'QUEUED',
      topicsTotal: plan.length,
      topicsDone: 0,
      current: null,
      counts: { drafted: 0, invalid: 0, duplicates: 0, flagged: 0, failedTopics: 0, aiCalls: 0 },
      costUsd: 0,
      log: [`Planned ${plan.length} topic${plan.length === 1 ? '' : 's'}: ${plan.reduce((t, p) => t + p.objective, 0)} objective, ${plan.reduce((t, p) => t + p.theory, 0)} theory`],
      error: null,
      createdBy: userId,
      createdAt: new Date().toISOString(),
      finishedAt: null,
    };
    await this.saveJob(job);
    await this.audit.log({ tenantId: null, action: 'content.pipeline_fill', summary: `Queued AI drafting for ${EXAM_LABELS[input.exam]} ${subject} (${plan.length} topics)` });
    this.queue.enqueue(`question pipeline ${job.id}`, () => this.run(job, plan, s.dailyBudgetUsd));
    return job;
  }

  private async run(job: PipelineJob, plan: Plan[], budget: number) {
    const note = (line: string) => {
      job.log = [...job.log, line].slice(-30);
    };
    job.state = 'RUNNING';
    await this.saveJob(job);
    let failures = 0;
    try {
      for (const p of plan) {
        if (this.cancelled.has(job.id)) {
          job.state = 'CANCELLED';
          note('Cancelled by a reviewer');
          break;
        }
        if ((await this.spentToday()) >= budget) {
          job.state = 'STOPPED';
          job.error = `Stopped: today's question-drafting AI budget ($${budget}) is used up`;
          note(job.error);
          break;
        }
        job.current = p.name;
        await this.saveJob(job);
        try {
          const r = await this.fillTopic(job, p);
          note(`${p.name}: ${r.drafted} drafted${r.duplicates ? `, ${r.duplicates} duplicates dropped` : ''}${r.invalid ? `, ${r.invalid} invalid` : ''}${r.flagged ? `, ${r.flagged} flagged by self-check` : ''}`);
          failures = 0;
        } catch (err) {
          job.counts.failedTopics++;
          const status = (err as { getStatus?: () => number }).getStatus?.();
          const msg = (err as { response?: { message?: string } }).response?.message ?? (err as Error).message;
          note(`${p.name}: failed — ${String(msg).slice(0, 200)}`);
          if (status === 429) {
            job.state = 'STOPPED';
            job.error = `Stopped: ${msg}`;
            break;
          }
          if (++failures >= 2) {
            job.state = 'FAILED';
            job.error = `Stopped after two failures in a row: ${String(msg).slice(0, 300)}`;
            break;
          }
        }
        job.topicsDone++;
        await this.saveJob(job);
      }
      if (job.state === 'RUNNING') job.state = 'DONE';
    } catch (err) {
      job.state = 'FAILED';
      job.error = String((err as Error).message).slice(0, 300);
    } finally {
      this.cancelled.delete(job.id);
      job.current = null;
      job.finishedAt = new Date().toISOString();
      note(`${job.state === 'DONE' ? 'Finished' : job.state.toLowerCase()}: ${job.counts.drafted} drafts for review`);
      await this.saveJob(job).catch((e) => this.logger.error(`Saving job ${job.id}: ${(e as Error).message}`));
    }
  }

  private track(job: PipelineJob, r: GatewayResult) {
    job.counts.aiCalls++;
    job.costUsd = Math.round((job.costUsd + costUsd(r.model, r.inputTokens, r.outputTokens, { read: r.cacheReadTokens, write: r.cacheWriteTokens }).cost) * 1e6) / 1e6;
  }

  /** Drafts one topic's questions (objective then theory), in small batches, until its count is met or rounds run out. */
  private async fillTopic(job: PipelineJob, p: Plan) {
    const topic = await this.prisma.root.syllabusTopic.findUniqueOrThrow({ where: { id: p.topicId }, include: { children: { select: { id: true, name: true, objectives: true } }, parent: { select: { name: true } } } });
    const ids = [topic.id, ...topic.children.map((c) => c.id)];
    const existing = await this.prisma.root.examQuestion.findMany({ where: { subject: job.subject, topicId: { in: ids }, status: { not: 'RETIRED' } }, select: { stem: true }, orderBy: { createdAt: 'desc' }, take: 300 });
    const seen = existing.map((e) => ({ stem: e.stem, t: tokens(e.stem) }));
    const out = { drafted: 0, duplicates: 0, invalid: 0, flagged: 0 };
    const objectives = [...topic.objectives, ...topic.children.flatMap((c) => c.objectives)].slice(0, 25);
    const context = [
      `Subject: ${job.subject}`,
      `Topic: ${topic.name}${topic.parent ? ` (part of ${topic.parent.name})` : ''}`,
      topic.children.length ? `Subtopics: ${topic.children.map((c) => c.name).join('; ')}` : '',
      objectives.length ? `Syllabus objectives (candidates should be able to):\n${objectives.map((o) => `- ${o}`).join('\n')}` : '',
      topic.content ? `Syllabus content notes:\n${topic.content.slice(0, 1500)}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    const avoid = () => (seen.length ? `\n\nQuestions that already exist for this topic — do NOT repeat or closely paraphrase them; test different objectives or angles:\n${seen.slice(0, 40).map((s) => `- ${s.stem.replace(/\s+/g, ' ').slice(0, 160)}`).join('\n')}` : '');
    const subtopicId = (name: string) => topic.children.find((c) => normalise(c.name) === normalise(name ?? ''))?.id ?? topic.id;
    const isDuplicate = (stem: string) => {
      const t = tokens(stem);
      const dup = seen.some((s) => similarity(s.t, t) >= DUPLICATE_SIMILARITY);
      if (!dup) seen.push({ stem, t });
      return dup;
    };

    for (const kind of ['OBJECTIVE', 'THEORY'] as const) {
      const need = kind === 'OBJECTIVE' ? p.objective : p.theory;
      let made = 0;
      for (let round = 0; round < MAX_ROUNDS && made < need; round++) {
        if (this.cancelled.has(job.id)) return out;
        const ask = Math.min(need - made, kind === 'OBJECTIVE' ? OBJ_CHUNK : THEORY_CHUNK);
        const mix = this.mix(ask);
        const accepted: Prisma.ExamQuestionCreateManyInput[] = [];
        if (kind === 'OBJECTIVE') {
          const r = await this.gateway.generateJson(
            {
              tier: 'advanced',
              system: this.systemPrompt(job.exam, 'OBJECTIVE'),
              messages: [{ role: 'user', content: `${context}\n\nWrite exactly ${ask} new objective question${ask === 1 ? '' : 's'}: ${mix}.${avoid()}` }],
              maxOutputTokens: 4000,
            },
            objectiveBatchSchema,
            'exam-question-batch',
          );
          this.track(job, r);
          for (const q of r.data.questions.slice(0, ask)) {
            const options = q.options.map(stripLetter);
            const okShape = q.stem.trim().length >= 10 && options.length === 4 && options.every((o) => o.length > 0) && new Set(options.map(normalise)).size === 4 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4 && q.explanation.trim().length >= 10;
            if (!okShape) {
              out.invalid++;
              job.counts.invalid++;
              continue;
            }
            if (isDuplicate(q.stem)) {
              out.duplicates++;
              job.counts.duplicates++;
              continue;
            }
            accepted.push({ exam: job.exam, type: 'OBJECTIVE', subject: job.subject, topicId: subtopicId(q.subtopic), stem: q.stem.trim(), options, answer: q.answer, explanation: q.explanation.trim(), marks: 1, difficulty: q.difficulty, source: 'AI_REVIEWED', status: 'DRAFT', createdById: null });
          }
        } else {
          const r = await this.gateway.generateJson(
            {
              tier: 'advanced',
              system: this.systemPrompt(job.exam, 'THEORY'),
              messages: [{ role: 'user', content: `${context}\n\nWrite exactly ${ask} new theory question${ask === 1 ? '' : 's'}: ${mix}.${avoid()}` }],
              maxOutputTokens: 5000,
            },
            theoryBatchSchema,
            'exam-question-batch',
          );
          this.track(job, r);
          for (const q of r.data.questions.slice(0, ask)) {
            const sum = q.guide.reduce((t, g) => t + g.marks, 0);
            const okShape = q.stem.trim().length >= 20 && q.marks >= 2 && q.marks <= 60 && q.guide.length >= 2 && q.guide.every((g) => g.point.trim() && g.marks > 0) && sum === q.marks && q.modelAnswer.trim().length >= 20;
            if (!okShape) {
              out.invalid++;
              job.counts.invalid++;
              continue;
            }
            if (isDuplicate(q.stem)) {
              out.duplicates++;
              job.counts.duplicates++;
              continue;
            }
            const markingGuide = q.guide.map((g) => `${g.marks} mark${g.marks === 1 ? '' : 's'}: ${g.point.trim()}`).join('\n');
            accepted.push({ exam: job.exam, type: 'THEORY', subject: job.subject, topicId: subtopicId(q.subtopic), stem: q.stem.trim(), options: [], answer: 0, marks: q.marks, markingGuide, explanation: q.modelAnswer.trim(), difficulty: q.difficulty, source: 'AI_REVIEWED', status: 'DRAFT', createdById: null });
          }
        }
        if (!accepted.length) continue;
        const created = await this.prisma.root.$transaction(accepted.map((data) => this.prisma.root.examQuestion.create({ data })));
        made += created.length;
        out.drafted += created.length;
        job.counts.drafted += created.length;
        // The second, cheaper pass; a failure here leaves the drafts unchecked rather than losing them.
        try {
          const flagged = await this.selfCheck(job, created);
          out.flagged += flagged;
          job.counts.flagged += flagged;
        } catch (err) {
          job.log = [...job.log, `${p.name}: self-check skipped — ${(err as Error).message.slice(0, 120)}`].slice(-30);
        }
        await this.saveJob(job);
      }
    }
    return out;
  }

  private mix(n: number): string {
    const counts = DIFFICULTY_MIX.map(([d, f]) => [d, Math.floor(n * f)] as const);
    let left = n - counts.reduce((t, [, c]) => t + c, 0);
    const out = counts.map(([d, c]) => [d, c] as [string, number]);
    for (const row of [out[1]!, out[0]!, out[2]!]) {
      if (left <= 0) break;
      row[1]++;
      left--;
    }
    return out
      .filter(([, c]) => c > 0)
      .map(([d, c]) => `${c} ${d.toLowerCase()}`)
      .join(', ');
  }

  private systemPrompt(exam: ExamBody, kind: 'OBJECTIVE' | 'THEORY'): string {
    const common = [
      `You are a senior Nigerian examiner writing ORIGINAL practice questions in the style of ${EXAM_STYLE[exam]}`,
      'Rules:',
      '- Write new questions. Never reproduce or lightly reword real past-paper questions, textbook exercises or any copyrighted item.',
      '- Test the syllabus objectives given, at the stated level; spread the questions across different objectives and subtopics.',
      '- Use Nigerian and West African contexts where natural (names, places, naira, local crops, industries, institutions), never stereotypes.',
      '- British English spelling; SI units; correct scientific notation; exact numbers that work out cleanly.',
      '- Each question must stand alone: no "the diagram above" unless the stem describes everything needed in words.',
      '- Label each question EASY (recall, one step), MEDIUM (understanding or two steps) or HARD (application, analysis, multi-step).',
    ];
    if (kind === 'OBJECTIVE') {
      common.push(
        '- Exactly four options, plain text without letters, similar in length and form; exactly ONE is correct.',
        '- Distractors are plausible: built from common misconceptions or calculation slips, never silly.',
        '- Never use "all of the above", "none of the above" or "both A and B"; avoid negative stems unless the word NOT is in capitals.',
        '- Vary the position of the correct option. Solve each question yourself before giving the key; make sure the key is right and unique.',
        '- The explanation says why the key is right (show the working for calculations) in 1–3 sentences.',
      );
    } else {
      common.push(
        '- Structured questions with parts (a), (b), (c)…; show the marks for each part in brackets in the stem.',
        '- The marking guide lists the creditable points with their marks; the points add up EXACTLY to the total marks.',
        '- The model answer is concise and earns full marks.',
      );
    }
    return common.join('\n');
  }

  /** Solves the drafts independently with the standard model; stores the outcome per draft. Returns how many disagree. */
  private async selfCheck(job: PipelineJob, rows: { id: string; type: string; stem: string; options: Prisma.JsonValue; answer: number; marks: number; markingGuide: string | null }[]): Promise<number> {
    const objective = rows.filter((r) => r.type === 'OBJECTIVE');
    const theory = rows.filter((r) => r.type === 'THEORY');
    const checks: { id: string; check: SelfCheck }[] = [];
    const at = new Date().toISOString();
    if (objective.length) {
      const r = await this.gateway.generateJson(
        {
          tier: 'standard',
          system: `You check draft ${EXAM_LABELS[job.exam]} ${job.subject} multiple-choice questions. Solve each one yourself from first principles; no key is given. Report the option you believe is correct, and whether the question has a problem (ambiguous wording, a factual error, more than one defensible option, no correct option, or beyond the syllabus level).`,
          messages: [{ role: 'user', content: objective.map((q, i) => `QUESTION ${i + 1}: ${q.stem}\n${(q.options as string[]).map((o, j) => `${'ABCD'[j]}) ${o}`).join('\n')}`).join('\n\n') }],
          maxOutputTokens: 1500,
        },
        objectiveCheckSchema,
        'exam-question-check',
      );
      this.track(job, r);
      objective.forEach((q, i) => {
        const res = r.data.results.find((x) => x.index === i + 1) ?? r.data.results[i];
        if (!res) return;
        const agrees = res.answer === q.answer && !res.problem;
        const note = res.answer !== q.answer ? `Independent solve chose ${res.answer >= 0 && res.answer < 4 ? 'ABCD'[res.answer] : 'no option'}, key is ${'ABCD'[q.answer]}.${res.issue ? ` ${res.issue}` : ''}` : res.problem ? res.issue || 'The checker reported a problem.' : res.issue || 'Agrees with the key.';
        checks.push({ id: q.id, check: { agrees, answer: res.answer, note: note.slice(0, 400), at } });
      });
    }
    if (theory.length) {
      const r = await this.gateway.generateJson(
        {
          tier: 'standard',
          system: `You check draft ${EXAM_LABELS[job.exam]} ${job.subject} theory questions and their marking guides. For each, say whether there is a problem: unclear wording, a wrong guide point, an expected point missing, or marks that don't fit the demand.`,
          messages: [{ role: 'user', content: theory.map((q, i) => `QUESTION ${i + 1} (${q.marks} marks): ${q.stem}\nMARKING GUIDE:\n${q.markingGuide}`).join('\n\n') }],
          maxOutputTokens: 1200,
        },
        theoryCheckSchema,
        'exam-question-check',
      );
      this.track(job, r);
      theory.forEach((q, i) => {
        const res = r.data.results.find((x) => x.index === i + 1) ?? r.data.results[i];
        if (!res) return;
        checks.push({ id: q.id, check: { agrees: !res.problem, answer: null, note: (res.issue || (res.problem ? 'The checker reported a problem.' : 'No problems found.')).slice(0, 400), at } });
      });
    }
    if (checks.length) await this.prisma.root.platformSetting.createMany({ data: checks.map((c) => ({ key: CHECK_PREFIX + c.id, value: c.check as unknown as Prisma.InputJsonValue })), skipDuplicates: true });
    return checks.filter((c) => !c.check.agrees).length;
  }

  // ---------------------------------------------------------------- flags

  private flags(q: QRow, others: { id: string; t: Set<string>; stem: string; status: string }[], check: SelfCheck | null): ReviewItem['flags'] {
    const f: ReviewItem['flags'] = [];
    const add = (flag: QuestionFlag, detail: string) => f.push({ flag, detail });
    const options = (q.options as string[]) ?? [];
    if (q.type !== 'THEORY') {
      if (options.length !== 4 || q.answer < 0 || q.answer >= options.length) add('BAD_SHAPE', `${options.length} options, key ${q.answer + 1}`);
      const norm = options.map(normalise);
      let overlap = '';
      for (let i = 0; i < norm.length && !overlap; i++)
        for (let j = i + 1; j < norm.length && !overlap; j++) {
          const a = norm[i]!;
          const b = norm[j]!;
          if (a === b || (a.split(' ').length >= 3 && b.split(' ').length >= 3 && similarity(a, b) >= 0.8)) overlap = `${'ABCDE'[i]} and ${'ABCDE'[j]} are nearly the same`;
        }
      if (overlap) add('OPTION_OVERLAP', overlap);
      const aota = options.find((o) => /\b(all|none|both|neither) of the (above|options|statements)\b|\bboth [a-e] and [a-e]\b/i.test(o));
      if (aota) add('ALL_OF_THE_ABOVE', `“${aota.slice(0, 60)}”`);
      const keyed = norm[q.answer];
      if ((keyed && norm.filter((n) => n === keyed).length > 1) || options.some((o) => /^\s*[a-e]\s*(and|&)\s*[a-e]\s*(only)?\s*$/i.test(o))) add('ANSWER_NOT_UNIQUE', 'The keyed option repeats another, or an option combines others');
      if (q.stem.length > 500) add('LONG_STEM', `${q.stem.length} characters`);
      if (!q.explanation || q.explanation.trim().length < 10) add('NO_EXPLANATION', 'Students see an explanation after marking');
    } else {
      if (q.stem.length > 1500) add('LONG_STEM', `${q.stem.length} characters`);
      if (!q.explanation || q.explanation.trim().length < 20) add('NO_EXPLANATION', 'No model answer');
      const sum = guideMarks(q.markingGuide);
      if (!q.markingGuide) add('GUIDE_MARKS', 'No marking guide');
      else if (sum !== null && sum !== q.marks) add('GUIDE_MARKS', `Guide points add up to ${sum}, question is worth ${q.marks}`);
    }
    const t = tokens(q.stem);
    let best: { s: number; o: (typeof others)[number] } | null = null;
    for (const o of others) {
      if (o.id === q.id) continue;
      const s = similarity(t, o.t);
      if (s >= DUPLICATE_SIMILARITY && (!best || s > best.s)) best = { s, o };
    }
    if (best) add('DUPLICATE', `${Math.round(best.s * 100)}% like a ${best.o.status.toLowerCase()} question: “${best.o.stem.replace(/\s+/g, ' ').slice(0, 90)}”`);
    if (check && !check.agrees) add('SELF_CHECK', check.note);
    return f;
  }

  private async checksFor(ids: string[]): Promise<Map<string, SelfCheck>> {
    if (!ids.length) return new Map();
    const rows = await this.prisma.root.platformSetting.findMany({ where: { key: { in: ids.map((id) => CHECK_PREFIX + id) } } });
    return new Map(rows.map((r) => [r.key.slice(CHECK_PREFIX.length), r.value as unknown as SelfCheck]));
  }

  /** Drafts with their flags and self-checks, in the order they arrived. */
  private async items(rows: QRow[]): Promise<ReviewItem[]> {
    const groups = new Map<string, { id: string; t: Set<string>; stem: string; status: string }[]>();
    for (const key of new Set(rows.map((r) => `${r.exam}|${r.subject}`))) {
      const [exam, subject] = key.split('|');
      const all = await this.prisma.root.examQuestion.findMany({ where: { exam, subject, status: { not: 'RETIRED' } }, select: { id: true, stem: true, status: true } });
      groups.set(key, all.map((a) => ({ id: a.id, stem: a.stem, status: a.status, t: tokens(a.stem) })));
    }
    const checks = await this.checksFor(rows.map((r) => r.id));
    const parents = await this.prisma.root.syllabusTopic.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.topic?.parentId).filter((x): x is string => !!x))] } }, select: { id: true, name: true } });
    return rows.map((q) => {
      const check = checks.get(q.id) ?? null;
      return {
        ...this.exams.row(q),
        aiDraft: q.source === 'AI_REVIEWED' && !q.reviewedAt,
        flags: this.flags(q, groups.get(`${q.exam}|${q.subject}`) ?? [], check),
        check,
        topicObjectives: q.topic?.objectives ?? [],
        parentTopic: parents.find((p) => p.id === q.topic?.parentId)?.name ?? null,
        createdAt: q.createdAt.toISOString(),
      };
    });
  }

  // ---------------------------------------------------------------- review

  async reviewQueue(f: { exam?: ExamBody; subject?: string; topicId?: string; flagged?: 'yes' | 'no'; aiOnly?: boolean; limit: number; offset: number }): Promise<ReviewQueue> {
    const subject = f.subject ? subjectKey(f.subject) : undefined;
    const topicIds = f.topicId ? [f.topicId, ...(await this.prisma.root.syllabusTopic.findMany({ where: { parentId: f.topicId }, select: { id: true } })).map((t) => t.id)] : null;
    const rows = await this.prisma.root.examQuestion.findMany({
      where: { status: 'DRAFT', ...(f.exam ? { exam: f.exam } : {}), ...(subject ? { subject } : {}), ...(topicIds ? { topicId: { in: topicIds } } : {}), ...(f.aiOnly ? { source: 'AI_REVIEWED', reviewedAt: null } : {}) },
      include: { topic: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 1000,
    });
    const items = await this.items(rows);
    const filtered = f.flagged === 'yes' ? items.filter((i) => i.flags.length) : f.flagged === 'no' ? items.filter((i) => !i.flags.length) : items;
    const subjects = await this.prisma.root.examQuestion.groupBy({ by: ['exam', 'subject'], where: { status: 'DRAFT' }, _count: { _all: true }, orderBy: [{ exam: 'asc' }, { subject: 'asc' }] });
    return {
      items: filtered.slice(f.offset, f.offset + f.limit),
      total: filtered.length,
      flagged: items.filter((i) => i.flags.length).length,
      subjects: subjects.map((s) => ({ exam: s.exam as ExamBody, subject: s.subject, drafts: s._count._all })),
    };
  }

  async approve(id: string, edits: ExamQuestionInput | undefined, userId: string): Promise<ReviewItem> {
    const q = await this.prisma.root.examQuestion.findUnique({ where: { id } });
    if (!q) throw new NotFoundException('Question not found');
    if (q.status !== 'DRAFT') throw new ConflictException(`This question is already ${q.status.toLowerCase()}`);
    let data: Prisma.ExamQuestionUpdateInput = {};
    if (edits) {
      if (edits.type === 'THEORY') {
        if (!edits.markingGuide) throw new BadRequestException('Theory questions need a marking guide');
      } else {
        if (edits.options.length !== 4) throw new BadRequestException('Give exactly four options');
        if (new Set(edits.options.map(normalise)).size !== edits.options.length) throw new BadRequestException('Two options are the same');
        if (edits.answer >= edits.options.length) throw new BadRequestException('The answer must be one of the options');
        if (!edits.explanation) throw new BadRequestException('Add an explanation: students see it after marking');
      }
      // Content only: provenance stays (an edited AI draft is still AI_REVIEWED), status comes from this action.
      const { status: _s, source: _src, ...content } = edits;
      data = { ...content, subject: subjectKey(content.subject), options: content.options, topic: content.topicId ? { connect: { id: content.topicId } } : { disconnect: true } };
      delete (data as { topicId?: unknown }).topicId;
    }
    const saved = await this.prisma.root.examQuestion.update({ where: { id }, data: { ...data, status: 'PUBLISHED', reviewedById: userId, reviewedAt: new Date() }, include: { topic: true } });
    await this.prisma.root.platformSetting.deleteMany({ where: { key: CHECK_PREFIX + id } });
    await this.bump(userId, edits ? 'edited' : 'approved');
    await this.audit.log({ tenantId: null, action: 'content.question_reviewed', summary: `${edits ? 'Edited and approved' : 'Approved'} ${q.exam} ${q.subject} question` });
    return (await this.items([saved]))[0]!;
  }

  async reject(id: string, mode: 'DELETE' | 'RETIRE', userId: string) {
    const q = await this.prisma.root.examQuestion.findUnique({ where: { id } });
    if (!q) throw new NotFoundException('Question not found');
    if (q.status !== 'DRAFT') throw new ConflictException(`This question is already ${q.status.toLowerCase()}`);
    if (mode === 'DELETE') await this.prisma.root.examQuestion.delete({ where: { id } });
    else await this.prisma.root.examQuestion.update({ where: { id }, data: { status: 'RETIRED' } });
    await this.prisma.root.platformSetting.deleteMany({ where: { key: CHECK_PREFIX + id } });
    await this.bump(userId, 'rejected');
    await this.audit.log({ tenantId: null, action: 'content.question_rejected', summary: `Rejected ${q.exam} ${q.subject} draft (${mode === 'DELETE' ? 'deleted' : 'retired'})` });
    return { id, mode };
  }

  /** Approves only drafts with no flags; flagged ones are left for one-by-one review. */
  async bulkApprove(ids: string[], userId: string) {
    const rows = await this.prisma.root.examQuestion.findMany({ where: { id: { in: ids }, status: 'DRAFT' }, include: { topic: true } });
    const items = await this.items(rows);
    const ok = items.filter((i) => !i.flags.length).map((i) => i.id);
    const skipped = items.filter((i) => i.flags.length).map((i) => ({ id: i.id, flags: i.flags.map((f) => f.flag) }));
    if (ok.length) {
      const r = await this.prisma.root.examQuestion.updateMany({ where: { id: { in: ok }, status: 'DRAFT' }, data: { status: 'PUBLISHED', reviewedById: userId, reviewedAt: new Date() } });
      await this.prisma.root.platformSetting.deleteMany({ where: { key: { in: ok.map((id) => CHECK_PREFIX + id) } } });
      await this.bump(userId, 'approved', r.count);
      await this.audit.log({ tenantId: null, action: 'content.questions_bulk_approved', summary: `Bulk-approved ${r.count} unflagged exam question drafts` });
    }
    return { approved: ok.length, skipped, notDraft: ids.length - rows.length };
  }

  private bump(userId: string, what: 'approved' | 'edited' | 'rejected', n = 1) {
    const next = this.logChain.then(async () => {
      const key = LOG_PREFIX + dayKey();
      const row = await this.prisma.root.platformSetting.findUnique({ where: { key } });
      const v = (row?.value ?? {}) as Record<string, { approved: number; edited: number; rejected: number }>;
      const me = v[userId] ?? { approved: 0, edited: 0, rejected: 0 };
      me[what] += n;
      v[userId] = me;
      await this.prisma.root.platformSetting.upsert({ where: { key }, create: { key, value: v as Prisma.InputJsonValue }, update: { value: v as Prisma.InputJsonValue } });
    });
    this.logChain = next.catch(() => undefined);
    return next.catch((e) => this.logger.warn(`Review log: ${(e as Error).message}`));
  }

  async stats(): Promise<ReviewStats> {
    const days = Array.from({ length: 7 }, (_, i) => dayKey(new Date(Date.now() - (6 - i) * 86_400_000)));
    const rows = await this.prisma.root.platformSetting.findMany({ where: { key: { in: days.map((d) => LOG_PREFIX + d) } } });
    const log = new Map(rows.map((r) => [r.key.slice(LOG_PREFIX.length), r.value as Record<string, { approved: number; edited: number; rejected: number }>]));
    const zero = () => ({ approved: 0, edited: 0, rejected: 0 });
    const today = zero();
    const week = zero();
    const people = new Map<string, { approvedWeek: number; rejectedWeek: number }>();
    const daily = days.map((day) => {
      const v = log.get(day) ?? {};
      const d = { day, approved: 0, rejected: 0 };
      for (const [uid, c] of Object.entries(v)) {
        // "approved" counts every approval, "edited" the ones changed first.
        const approved = c.approved + c.edited;
        d.approved += approved;
        d.rejected += c.rejected;
        week.approved += approved;
        week.edited += c.edited;
        week.rejected += c.rejected;
        if (day === dayKey()) {
          today.approved += approved;
          today.edited += c.edited;
          today.rejected += c.rejected;
        }
        const p = people.get(uid) ?? { approvedWeek: 0, rejectedWeek: 0 };
        p.approvedWeek += approved;
        p.rejectedWeek += c.rejected;
        people.set(uid, p);
      }
      return d;
    });
    const users = await this.prisma.root.user.findMany({ where: { id: { in: [...people.keys()] } }, select: { id: true, firstName: true, lastName: true } });
    return {
      today,
      week,
      daily,
      waiting: await this.prisma.root.examQuestion.count({ where: { status: 'DRAFT' } }),
      reviewers: [...people]
        .map(([userId, p]) => {
          const u = users.find((x) => x.id === userId);
          return { userId, name: u ? `${u.firstName} ${u.lastName}` : 'Former reviewer', ...p };
        })
        .sort((a, b) => b.approvedWeek - a.approvedWeek),
    };
  }
}
