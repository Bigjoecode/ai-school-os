import { z } from 'zod';
import type { QuestionType } from './assessment';

/**
 * Online exams (CBT): a finalised exam paper scheduled for one or more class
 * arms, sat on computers or phones inside a time window. The server keeps
 * the clock and the answers; objective questions are marked automatically,
 * written ones by the teacher (optionally with AI suggestions).
 */

export const CBT_SHOW_RESULTS = ['IMMEDIATE', 'AFTER_CLOSE', 'NEVER'] as const;
export type CbtShowResults = (typeof CBT_SHOW_RESULTS)[number];
export const CBT_SHOW_RESULTS_LABELS: Record<CbtShowResults, string> = {
  IMMEDIATE: 'Straight after submitting',
  AFTER_CLOSE: 'When the exam closes',
  NEVER: 'Only when I release them',
};

export type CbtExamStatus = 'DRAFT' | 'SCHEDULED' | 'CLOSED';
/** Where the exam is in time: DRAFT, UPCOMING (scheduled, not open yet), OPEN, ENDED. */
export type CbtPhase = 'DRAFT' | 'UPCOMING' | 'OPEN' | 'ENDED';
export type CbtAttemptStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'MARKED';

/** Seconds after the deadline in which a late save (slow network) is still accepted. */
export const CBT_GRACE_SECONDS = 30;

const examFields = {
  title: z.string().trim().min(3, 'Give the exam a title').max(160),
  classArmIds: z.array(z.string().min(1)).min(1, 'Pick at least one class').max(40),
  opensAt: z.iso.datetime({ offset: true }),
  closesAt: z.iso.datetime({ offset: true }),
  durationMinutes: z.number().int().min(1, 'At least a minute').max(600, 'At most 10 hours'),
  shuffleQuestions: z.boolean().default(true),
  shuffleOptions: z.boolean().default(true),
  showResults: z.enum(CBT_SHOW_RESULTS).default('AFTER_CLOSE'),
  sendToScores: z.boolean().default(true),
  accessCode: z
    .string()
    .trim()
    .max(20)
    .regex(/^[A-Za-z0-9-]*$/, 'Letters, numbers and dashes only')
    .nullish()
    .transform((v) => (v ? v.toUpperCase() : null)),
};

export const createOnlineExamSchema = z
  .object({ paperId: z.string().min(1, 'Pick a paper'), ...examFields, publish: z.boolean().default(false) })
  .refine((v) => Date.parse(v.closesAt) > Date.parse(v.opensAt), { path: ['closesAt'], message: 'Must be after the opening time' });
export type CreateOnlineExamInput = z.input<typeof createOnlineExamSchema>;

export const updateOnlineExamSchema = z
  .object({
    title: examFields.title.optional(),
    classArmIds: examFields.classArmIds.optional(),
    opensAt: examFields.opensAt.optional(),
    closesAt: examFields.closesAt.optional(),
    durationMinutes: examFields.durationMinutes.optional(),
    shuffleQuestions: z.boolean().optional(),
    shuffleOptions: z.boolean().optional(),
    showResults: z.enum(CBT_SHOW_RESULTS).optional(),
    sendToScores: z.boolean().optional(),
    accessCode: examFields.accessCode.optional(),
  })
  .refine((v) => !v.opensAt || !v.closesAt || Date.parse(v.closesAt) > Date.parse(v.opensAt), { path: ['closesAt'], message: 'Must be after the opening time' });
export type UpdateOnlineExamInput = z.input<typeof updateOnlineExamSchema>;

export const cbtStartSchema = z.object({ accessCode: z.string().trim().max(20).nullish() });
export type CbtStartInput = z.infer<typeof cbtStartSchema>;

/** Option index (as displayed) for objective questions, text for written ones, null to clear. */
export const cbtAnswerValueSchema = z.union([z.number().int().min(0).max(9), z.string().max(8000), z.null()]);
export const cbtSaveAnswersSchema = z.object({
  answers: z.record(z.string().min(1).max(40), cbtAnswerValueSchema).refine((r) => Object.keys(r).length <= 300, 'Too many answers'),
  /** The student's running count of times they left the exam screen (the server keeps the highest). */
  focusLosses: z.number().int().min(0).max(10_000).optional(),
});
export type CbtSaveAnswersInput = z.infer<typeof cbtSaveAnswersSchema>;
export const cbtSubmitSchema = cbtSaveAnswersSchema.partial();
export type CbtSubmitInput = z.infer<typeof cbtSubmitSchema>;

export const cbtMarksSchema = z.object({
  marks: z
    .array(z.object({ attemptId: z.string().min(1), questionId: z.string().min(1), score: z.number().min(0).max(1000).nullable() }))
    .min(1)
    .max(500),
});
export type CbtMarksInput = z.infer<typeof cbtMarksSchema>;

export const cbtAiSuggestSchema = z.object({ attemptIds: z.array(z.string().min(1)).max(40).optional() });
export type CbtAiSuggestInput = z.infer<typeof cbtAiSuggestSchema>;

export const cbtSendScoresSchema = z.object({
  /** Students whose existing, different score may be replaced. Anyone else with a different score is left alone. */
  overwriteStudentIds: z.array(z.string().min(1)).max(2000).default([]),
});
export type CbtSendScoresInput = z.input<typeof cbtSendScoresSchema>;

// ------------------------------------------------------------------ staff views

interface Ref {
  id: string;
  name: string;
}

export interface CbtExamSummary {
  id: string;
  title: string;
  status: CbtExamStatus;
  phase: CbtPhase;
  paper: { id: string; title: string; questionCount: number; totalMarks: number; hasWritten: boolean };
  subject: Ref;
  classLevel: Ref;
  term: { id: string; name: string; sessionName: string };
  component: { key: string; name: string; maxScore: number } | null;
  classArms: { id: string; name: string }[];
  opensAt: string;
  closesAt: string;
  durationMinutes: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  showResults: CbtShowResults;
  sendToScores: boolean;
  accessCode: string | null;
  resultsReleasedAt: string | null;
  counts: { students: number; started: number; inProgress: number; submitted: number; marked: number };
  canManage: boolean;
  createdAt: string;
}

/** A paper that can be scheduled, with the classes this user may schedule it for. */
export interface CbtPaperOption {
  id: string;
  title: string;
  subject: Ref;
  classLevel: Ref;
  term: { id: string; name: string; sessionName: string };
  component: { key: string; name: string; maxScore: number } | null;
  durationMinutes: number;
  questionCount: number;
  totalMarks: number;
  hasWritten: boolean;
  classArms: { id: string; name: string }[];
}

export interface CbtRosterRow {
  student: { id: string; name: string; admissionNumber: string; classArm: string | null };
  attemptId: string | null;
  status: 'NOT_STARTED' | CbtAttemptStatus;
  startedAt: string | null;
  endsAt: string | null;
  submittedAt: string | null;
  /** Seconds left for an attempt in progress. */
  secondsLeft: number | null;
  answered: number;
  focusLosses: number;
  lastSeenAt: string | null;
  objectiveScore: number | null;
  score: number | null;
  total: number | null;
  percent: number | null;
  /** Seconds between starting and submitting. */
  timeTakenSeconds: number | null;
  writtenToMark: number;
  ip: string | null;
}

export interface CbtExamDetail extends CbtExamSummary {
  serverNow: string;
  questionCount: number;
  writtenQuestions: number;
  roster: CbtRosterRow[];
}

export interface CbtItemAnalysisRow {
  questionId: string;
  number: number;
  type: QuestionType;
  topic: string;
  stem: string;
  marks: number;
  options: string[];
  correctIndex: number | null;
  /** Students who saw the question in a submitted attempt. */
  attempts: number;
  answered: number;
  /** Objective: % who chose the key. Written: average % of the marks. */
  percentCorrect: number | null;
  averageMark: number | null;
  /** How many chose each option (original order). */
  optionCounts: number[];
  /** Upper-group minus lower-group facility (−1…1), objective questions with enough sitters. */
  discrimination: number | null;
}

export interface CbtResults {
  exam: CbtExamSummary;
  summary: { sat: number; marked: number; average: number | null; highest: number | null; lowest: number | null; passRate: number | null };
  rows: CbtRosterRow[];
  items: CbtItemAnalysisRow[];
}

export interface CbtMarkingAnswer {
  attemptId: string;
  student: { id: string; name: string; admissionNumber: string };
  answer: string | null;
  score: number | null;
}
export interface CbtMarkingQuestion {
  questionId: string;
  number: number;
  type: QuestionType;
  stem: string;
  marks: number;
  answer: string | null;
  markingGuide: string | null;
  answers: CbtMarkingAnswer[];
  marked: number;
}
export interface CbtMarkingSheet {
  exam: CbtExamSummary;
  questions: CbtMarkingQuestion[];
}

export interface CbtAiSuggestion {
  attemptId: string;
  score: number;
  outOf: number;
  reasons: string[];
}

export type CbtScoreRowStatus = 'NEW' | 'SAME' | 'CONFLICT' | 'NOT_MARKED' | 'NOT_ALLOWED' | 'NO_CLASS';
export interface CbtScorePreviewRow {
  student: { id: string; name: string; admissionNumber: string };
  classArm: { id: string; name: string } | null;
  status: CbtScoreRowStatus;
  /** The exam score scaled to the component's maximum. */
  newScore: number | null;
  existingScore: number | null;
}
export interface CbtScorePreview {
  component: { key: string; name: string; maxScore: number };
  subject: Ref;
  term: { id: string; name: string };
  rows: CbtScorePreviewRow[];
}
export interface CbtSendScoresResult {
  written: number;
  overwritten: number;
  skipped: number;
}

// ------------------------------------------------------------------ student views

export interface CbtMyExam {
  id: string;
  title: string;
  subject: string;
  phase: CbtPhase;
  opensAt: string;
  closesAt: string;
  durationMinutes: number;
  questionCount: number;
  needsAccessCode: boolean;
  attempt: { status: CbtAttemptStatus; endsAt: string; submittedAt: string | null } | null;
  /** Shown once results are visible to the student. */
  result: { score: number; total: number; percent: number; partial: boolean } | null;
}

export interface CbtRoomQuestion {
  id: string;
  number: number;
  type: QuestionType;
  objective: boolean;
  stem: string;
  /** In this student's order; empty for written questions. */
  options: string[];
  marks: number;
}

export interface CbtRoomReviewItem {
  questionId: string;
  /** Displayed index of the key for objective questions. */
  correctIndex: number | null;
  correct: boolean | null;
  awarded: number | null;
  modelAnswer: string | null;
}

export interface CbtRoom {
  exam: { id: string; title: string; subject: string; classLevel: string; instructions: string | null; durationMinutes: number; showResults: CbtShowResults; closesAt: string; phase: CbtPhase; questionCount: number; totalMarks: number; needsAccessCode: boolean };
  serverNow: string;
  attempt: {
    id: string;
    status: CbtAttemptStatus;
    startedAt: string;
    endsAt: string;
    submittedAt: string | null;
    focusLosses: number;
    questions: CbtRoomQuestion[];
    /** Objective answers as displayed option indexes; written answers as text. */
    answers: Record<string, number | string | null>;
  } | null;
  result: { score: number; total: number; percent: number; partial: boolean; review: CbtRoomReviewItem[] | null } | null;
  /** Why results aren't shown yet (after submitting). */
  resultNote: string | null;
}

export interface CbtSaveResult {
  savedAt: string;
  serverNow: string;
  endsAt: string;
  status: CbtAttemptStatus;
}
