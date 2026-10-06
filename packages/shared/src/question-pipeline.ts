import { z } from 'zod';
import { EXAMS, QUESTION_DIFFICULTIES, examQuestionSchema, type ExamBody, type ExamQuestionRow } from './learning';

/**
 * Exam Academy question-bank pipeline (console): coverage against the
 * syllabus graph, background "fill gaps" AI drafting, and the human review
 * queue. Nothing reaches students until a person approves it.
 *
 * How AI drafts are marked (no schema change): an AI-written question is
 * saved with source AI_REVIEWED, status DRAFT, createdById null (no human
 * author) and reviewedAt null. "AI_REVIEWED" is the provenance — written by
 * AI, reviewed by a person before students see it — and the review itself
 * is recorded in reviewedById/reviewedAt when a reviewer approves it. So an
 * "AI draft awaiting review" is exactly: source AI_REVIEWED and reviewedAt null.
 */

/** Questions per root syllabus topic the bank aims for. JAMB is objective-only. */
export interface QuestionTarget {
  objective: number;
  theory: number;
}
export const DEFAULT_QUESTION_TARGETS: Record<ExamBody, QuestionTarget> = {
  WAEC: { objective: 10, theory: 2 },
  NECO: { objective: 10, theory: 2 },
  BECE: { objective: 10, theory: 2 },
  JAMB: { objective: 10, theory: 0 },
};
/** A subject is offered to students once it has at least this many published objective questions. */
export const MIN_PUBLISHED_TO_LIST = 5;

export const questionTargetSchema = z.object({ objective: z.number().int().min(0).max(100), theory: z.number().int().min(0).max(20) });
export const pipelineSettingsSchema = z.object({
  /** Per exam defaults. */
  defaults: z.partialRecord(z.enum(EXAMS), questionTargetSchema).optional(),
  /** Per subject overrides, keyed "EXAM:Subject". */
  subjects: z.record(z.string().max(80), questionTargetSchema).optional(),
  /** Daily cap on AI spend by the pipeline (USD); the batch stops when it is reached. */
  dailyBudgetUsd: z.number().min(0).max(1000).optional(),
});
export type PipelineSettingsInput = z.infer<typeof pipelineSettingsSchema>;
export interface PipelineSettings {
  defaults: Record<ExamBody, QuestionTarget>;
  subjects: Record<string, QuestionTarget>;
  dailyBudgetUsd: number;
  spentTodayUsd: number;
}

export interface CoverageCounts {
  published: { objective: number; theory: number };
  draft: { objective: number; theory: number };
  difficulty: Record<(typeof QUESTION_DIFFICULTIES)[number], number>;
}
export interface TopicCoverage extends CoverageCounts {
  id: string;
  name: string;
  parentId: string | null;
  objectives: number;
  /** Root topics only: the target and what's still missing (target − published, never negative). */
  target: QuestionTarget | null;
  gap: { objective: number; theory: number } | null;
  /** Root topics: these counts include the subtopics' questions. */
  children: TopicCoverage[];
}
export interface SubjectCoverage {
  exam: ExamBody;
  subject: string;
  /** Exam whose syllabus topics are used (NECO falls back to WAEC's). */
  syllabusExam: ExamBody | null;
  target: QuestionTarget;
  topics: TopicCoverage[];
  /** Questions with no topic (or a topic outside this syllabus). */
  unassigned: CoverageCounts;
  totals: { topics: number; objectives: number; targetQuestions: number; publishedTowardTarget: number; coveragePct: number; published: number; drafts: number; gap: number };
}
export interface ExamCoverageRow {
  subject: string;
  topics: number;
  objectives: number;
  target: QuestionTarget;
  targetQuestions: number;
  published: number;
  drafts: number;
  gap: number;
  coveragePct: number;
  /** Topics that have met their target. */
  topicsComplete: number;
  listed: boolean;
}
export interface ExamCoverage {
  exam: ExamBody;
  syllabusExam: ExamBody | null;
  subjects: ExamCoverageRow[];
  totals: { subjects: number; listed: number; targetQuestions: number; published: number; drafts: number; gap: number; coveragePct: number };
}

export const fillGapsSchema = z.object({
  exam: z.enum(EXAMS),
  subject: z.string().trim().min(2).max(60),
  /** Root topic ids; empty = every topic with a gap (largest gaps first). */
  topicIds: z.array(z.string()).max(60).default([]),
  type: z.enum(['OBJECTIVE', 'THEORY', 'BOTH']).default('OBJECTIVE'),
  /** Questions per topic; omitted = the topic's remaining gap (drafts awaiting review count toward it). */
  perTopic: z.number().int().min(1).max(20).nullish(),
  /** At most this many topics in one job. */
  maxTopics: z.number().int().min(1).max(60).default(15),
});
export type FillGapsInput = z.infer<typeof fillGapsSchema>;

export type PipelineJobState = 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED' | 'CANCELLED' | 'STOPPED';
export interface PipelineJob {
  id: string;
  exam: ExamBody;
  subject: string;
  type: FillGapsInput['type'];
  state: PipelineJobState;
  topicsTotal: number;
  topicsDone: number;
  current: string | null;
  counts: { drafted: number; invalid: number; duplicates: number; flagged: number; failedTopics: number; aiCalls: number };
  costUsd: number;
  log: string[];
  error: string | null;
  createdBy: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export const QUESTION_FLAGS = ['DUPLICATE', 'OPTION_OVERLAP', 'ALL_OF_THE_ABOVE', 'ANSWER_NOT_UNIQUE', 'LONG_STEM', 'NO_EXPLANATION', 'BAD_SHAPE', 'GUIDE_MARKS', 'SELF_CHECK'] as const;
export type QuestionFlag = (typeof QUESTION_FLAGS)[number];
export const QUESTION_FLAG_LABELS: Record<QuestionFlag, string> = {
  DUPLICATE: 'Looks like another question',
  OPTION_OVERLAP: 'Options overlap',
  ALL_OF_THE_ABOVE: '“All/none of the above”',
  ANSWER_NOT_UNIQUE: 'Answer may not be unique',
  LONG_STEM: 'Very long stem',
  NO_EXPLANATION: 'No explanation',
  BAD_SHAPE: 'Options or answer key invalid',
  GUIDE_MARKS: 'Marking guide doesn’t add up',
  SELF_CHECK: 'AI self-check disagrees',
};

export interface SelfCheck {
  /** For objective questions: whether a second, independent solve chose the keyed answer. */
  agrees: boolean;
  answer: number | null;
  note: string;
  at: string;
}
export interface ReviewItem extends ExamQuestionRow {
  aiDraft: boolean;
  flags: { flag: QuestionFlag; detail: string }[];
  check: SelfCheck | null;
  topicObjectives: string[];
  parentTopic: string | null;
  createdAt: string;
}
export interface ReviewQueue {
  items: ReviewItem[];
  total: number;
  flagged: number;
  subjects: { exam: ExamBody; subject: string; drafts: number }[];
}
export interface ReviewStats {
  today: { approved: number; edited: number; rejected: number };
  week: { approved: number; edited: number; rejected: number };
  reviewers: { userId: string; name: string; approvedWeek: number; rejectedWeek: number }[];
  waiting: number;
  /** Approvals per day (last 7 days, oldest first). */
  daily: { day: string; approved: number; rejected: number }[];
}

export const reviewApproveSchema = z.object({ edits: examQuestionSchema.optional() });
export const reviewRejectSchema = z.object({ mode: z.enum(['DELETE', 'RETIRE']).default('DELETE') });
export const reviewBulkApproveSchema = z.object({ ids: z.array(z.string()).min(1).max(200) });
