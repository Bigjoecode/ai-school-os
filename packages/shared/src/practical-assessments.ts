import { z } from 'zod';
import { CBT_SHOW_RESULTS, type CbtExamStatus, type CbtPhase, type CbtShowResults } from './cbt';
import type { CriterionScore, SimulatorId } from './practicals';

/**
 * Practical assessments: a teacher schedules a Practical Academy virtual lab
 * as a class test or exam for one or more class arms. Like an online exam it
 * has a window, a duration, an optional access code and a "show results"
 * rule; each student sits it once, on a fresh variant, and the marks can be
 * copied (scaled) into a result component of the score sheet.
 *
 * TEST: the guided lab (Learn, Demo and Try, lab assistant allowed), timed.
 * EXAM: the lab's exam mode (Try only, no guidance or assistant), timed.
 * Only practicals with a virtual lab can be scheduled; the others are set as
 * homework (their quick check hands it in).
 */

export const PRACTICAL_ASSESSMENT_KINDS = ['TEST', 'EXAM'] as const;
export type PracticalAssessmentKind = (typeof PRACTICAL_ASSESSMENT_KINDS)[number];
export const PRACTICAL_ASSESSMENT_KIND_LABELS: Record<PracticalAssessmentKind, string> = {
  TEST: 'Class test (guided lab)',
  EXAM: 'Practical exam (exam mode)',
};

const fields = {
  title: z.string().trim().min(3, 'Give it a title').max(160),
  kind: z.enum(PRACTICAL_ASSESSMENT_KINDS).default('EXAM'),
  classArmIds: z.array(z.string().min(1)).min(1, 'Pick at least one class').max(40),
  opensAt: z.iso.datetime({ offset: true }),
  closesAt: z.iso.datetime({ offset: true }),
  durationMinutes: z.number().int().min(5, 'At least 5 minutes').max(240, 'At most 4 hours'),
  showResults: z.enum(CBT_SHOW_RESULTS).default('AFTER_CLOSE'),
  /** Result component the marks can go into; null: not for the score sheet. */
  componentKey: z.string().trim().min(1).max(40).nullish().transform((v) => v ?? null),
  accessCode: z
    .string()
    .trim()
    .max(20)
    .regex(/^[A-Za-z0-9-]*$/, 'Letters, numbers and dashes only')
    .nullish()
    .transform((v) => (v ? v.toUpperCase() : null)),
};

export const createPracticalAssessmentSchema = z
  .object({ practicalId: z.string().trim().min(3).max(120), subjectId: z.string().min(1, 'Pick a subject'), termId: z.string().min(1, 'Pick a term'), ...fields, publish: z.boolean().default(false) })
  .refine((v) => Date.parse(v.closesAt) > Date.parse(v.opensAt), { path: ['closesAt'], message: 'Must be after the opening time' });
export type CreatePracticalAssessmentInput = z.input<typeof createPracticalAssessmentSchema>;

export const updatePracticalAssessmentSchema = z
  .object({
    title: fields.title.optional(),
    kind: z.enum(PRACTICAL_ASSESSMENT_KINDS).optional(),
    classArmIds: fields.classArmIds.optional(),
    opensAt: fields.opensAt.optional(),
    closesAt: fields.closesAt.optional(),
    durationMinutes: fields.durationMinutes.optional(),
    showResults: z.enum(CBT_SHOW_RESULTS).optional(),
    componentKey: z.string().trim().min(1).max(40).nullable().optional(),
    termId: z.string().min(1).optional(),
    accessCode: fields.accessCode.optional(),
  })
  .refine((v) => !v.opensAt || !v.closesAt || Date.parse(v.closesAt) > Date.parse(v.opensAt), { path: ['closesAt'], message: 'Must be after the opening time' });
export type UpdatePracticalAssessmentInput = z.input<typeof updatePracticalAssessmentSchema>;

export const practicalAssessmentStartSchema = z.object({ accessCode: z.string().trim().max(20).nullish() });
export type PracticalAssessmentStartInput = z.infer<typeof practicalAssessmentStartSchema>;

// ------------------------------------------------------------------ staff views

/** What the schedule form offers: subjects with practicals and the classes this user may set them for, terms, and result components. */
export interface PracticalAssessmentOptions {
  subjects: { id: string; name: string; /** Practical Academy subject key. */ practicalSubject: string; classArms: { id: string; name: string }[] }[];
  terms: { id: string; name: string; sessionName: string; current: boolean }[];
  components: { key: string; name: string; maxScore: number }[];
}

/** A practical that can be scheduled (has a virtual lab), with the lab's marks and usual exam time. */
export interface PracticalAssessmentPick {
  id: string;
  title: string;
  topic: string;
  simulatorId: SimulatorId;
  maxScore: number;
  minutes: number;
}

export interface PracticalAssessmentSummary {
  id: string;
  title: string;
  kind: PracticalAssessmentKind;
  status: CbtExamStatus;
  phase: CbtPhase;
  practical: { id: string; title: string; simulatorId: SimulatorId | null; maxScore: number };
  subject: { id: string; name: string };
  term: { id: string; name: string; sessionName: string } | null;
  component: { key: string; name: string; maxScore: number } | null;
  classArms: { id: string; name: string }[];
  opensAt: string;
  closesAt: string;
  durationMinutes: number;
  showResults: CbtShowResults;
  /** Shown to managers; others see "••••" when one is set. */
  accessCode: string | null;
  resultsReleasedAt: string | null;
  counts: { students: number; started: number; inProgress: number; submitted: number };
  canManage: boolean;
  createdAt: string;
}

export type PracticalAssessmentRowStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED';
export interface PracticalAssessmentRow {
  student: { id: string; name: string; admissionNumber: string; classArm: string | null };
  attemptId: string | null;
  status: PracticalAssessmentRowStatus;
  startedAt: string | null;
  endsAt: string | null;
  submittedAt: string | null;
  /** The score that counts (a teacher's review, else the marked score). */
  score: number | null;
  /** The score from marking, before any review. */
  markedScore: number | null;
  maxScore: number;
  percent: number | null;
  reviewed: boolean;
  /** Per rubric criterion, in the rubric's order. */
  criteria: Pick<CriterionScore, 'id' | 'awarded' | 'max' | 'how'>[];
  timeTakenSeconds: number | null;
  /** Times the student left the lab during a practical exam (a signal for the teacher: 0 for class tests, which don't track it). */
  focusLosses: number;
  /** When the lab last saved this sitting (while it runs, the student is still there). */
  lastSeenAt: string | null;
  /** The address the sitting was started from. */
  ip: string | null;
}
export interface PracticalAssessmentResults {
  assessment: PracticalAssessmentSummary;
  serverNow: string;
  /** The lab's rubric: AUTO criteria are marked exactly, AI ones (written answers) by AI or key points. */
  criteria: { id: string; label: string; max: number; how: 'AUTO' | 'AI' }[];
  summary: { sat: number; average: number | null; highest: number | null; lowest: number | null; passRate: number | null };
  rows: PracticalAssessmentRow[];
}

// ------------------------------------------------------------------ student views

export interface PracticalMyAssessment {
  id: string;
  title: string;
  kind: PracticalAssessmentKind;
  subject: string;
  practicalTitle: string;
  phase: CbtPhase;
  opensAt: string;
  closesAt: string;
  durationMinutes: number;
  needsAccessCode: boolean;
  attempt: { id: string; endsAt: string | null; submittedAt: string | null } | null;
  /** Shown once results are visible to the student. */
  result: { score: number; maxScore: number; percent: number } | null;
  resultNote: string | null;
}

/** Set on a lab attempt that is a sitting of a practical assessment. */
export interface PracticalAttemptAssessment {
  id: string;
  title: string;
  kind: PracticalAssessmentKind;
  /** Why the result (or the marks in detail) isn't shown yet (null once it is). */
  resultNote: string | null;
  /** The marks in detail, feedback and worked solution may be seen: once nobody can still be sitting, or the teacher released them. */
  review: boolean;
}

/** The API's code when something is locked while the student has a practical test running on that practical. */
export const PRACTICAL_SITTING_OPEN = 'SITTING_OPEN';
/** The body of that refusal (403): where to send the student back to. */
export interface PracticalSittingLock {
  code: typeof PRACTICAL_SITTING_OPEN;
  message: string;
  attemptId: string;
  title: string;
}
