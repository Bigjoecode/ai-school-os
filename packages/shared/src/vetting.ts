import { z } from 'zod';
import type { LessonDetail, LessonSummary } from './academic';

/**
 * Lesson note vetting: teachers submit their week's lesson plans, the HOD,
 * vice principal or principal approves them or returns them with
 * corrections, and supervisors track who hasn't submitted.
 *
 * The rule for changes after submission: editing a SUBMITTED or APPROVED
 * plan's content takes it back to NOT_SUBMITTED, so it has to be vetted
 * again. Editing a RETURNED plan keeps it RETURNED (with the reviewer's note
 * visible) until the teacher resubmits. Changing only the delivery status
 * (draft / ready / delivered) never affects vetting.
 */

export const LESSON_REVIEW_STATUSES = ['NOT_SUBMITTED', 'SUBMITTED', 'APPROVED', 'RETURNED'] as const;
export type LessonReviewStatus = (typeof LESSON_REVIEW_STATUSES)[number];
export const LESSON_REVIEW_LABELS: Record<LessonReviewStatus, string> = {
  NOT_SUBMITTED: 'Not submitted',
  SUBMITTED: 'Awaiting vetting',
  APPROVED: 'Approved',
  RETURNED: 'Returned',
};

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const ids = z.array(z.string().min(1)).min(1, 'Pick at least one lesson plan').max(200);

/** Review fields added to every lesson plan the API returns. */
export interface LessonReviewInfo {
  reviewStatus: LessonReviewStatus;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  reviewedBy: { id: string; name: string } | null;
  /** Monday of the week the lesson falls in (from its date, or its scheme week). */
  weekStart: string | null;
  /** Submitted after its week had started. */
  late: boolean;
  /** The signed-in user wrote it or is its teacher (only they can submit it). */
  mine: boolean;
  /** The signed-in user may approve or return it now. */
  canReview: boolean;
}

export type VettedLessonSummary = LessonSummary & LessonReviewInfo;
export type VettedLessonDetail = LessonDetail & LessonReviewInfo;

export const submitLessonsSchema = z.object({ ids });
export type SubmitLessonsInput = z.infer<typeof submitLessonsSchema>;

export const submitWeekSchema = z.object({ weekStart: isoDate });
export type SubmitWeekInput = z.infer<typeof submitWeekSchema>;

export interface SubmitLessonsResult {
  submitted: number;
  skipped: { id: string; topic: string; reason: string }[];
}

export const reviewLessonSchema = z
  .object({
    decision: z.enum(['APPROVE', 'RETURN']),
    note: z.string().trim().max(3000).optional(),
  })
  .refine((v) => v.decision === 'APPROVE' || (v.note && v.note.length >= 3), {
    message: 'Say what needs correcting before returning the lesson note',
    path: ['note'],
  });
export type ReviewLessonInput = z.infer<typeof reviewLessonSchema>;

export const bulkApproveSchema = z.object({ ids, note: z.string().trim().max(3000).optional() });
export type BulkApproveInput = z.infer<typeof bulkApproveSchema>;

export const vettingQueueQuerySchema = z.object({
  status: z.enum(LESSON_REVIEW_STATUSES).default('SUBMITTED'),
  subjectId: z.string().optional(),
  classArmId: z.string().optional(),
  teacherId: z.string().optional(),
  weekStart: isoDate.optional(),
});
export type VettingQueueQuery = z.infer<typeof vettingQueueQuerySchema>;

export const complianceQuerySchema = z.object({ weekStart: isoDate });
export type ComplianceQuery = z.infer<typeof complianceQuerySchema>;

/** What a class-subject's lesson note looks like for the week. MISSING = nothing written yet. */
export type ComplianceItemStatus = LessonReviewStatus | 'MISSING';

export interface ComplianceItem {
  classArm: { id: string; name: string };
  subject: { id: string; name: string };
  /** Timetabled periods for this class and subject in the week (0 when unknown). */
  periods: number;
  status: ComplianceItemStatus;
  lessonIds: string[];
  submittedAt: string | null;
  late: boolean;
}

export interface ComplianceTeacherRow {
  teacher: { id: string; name: string };
  expected: number;
  /** Handed in: awaiting vetting, approved or returned. */
  submitted: number;
  pending: number;
  approved: number;
  returned: number;
  /** Nothing handed in (no plan, or only an unsubmitted draft). */
  missing: number;
  late: number;
  items: ComplianceItem[];
}

export interface ComplianceReport {
  weekStart: string;
  weekEnd: string;
  /** Where "expected" came from: the published timetable, or class-subject assignments. */
  basis: 'TIMETABLE' | 'ASSIGNMENTS';
  termName: string | null;
  teachers: ComplianceTeacherRow[];
  totals: Omit<ComplianceTeacherRow, 'teacher' | 'items'>;
}

/** The AI's draft feedback for a reviewer. Never saved automatically. */
export const aiLessonCheckSchema = z.object({
  summary: z.string().describe('One or two sentences: how well the plan serves its stated objectives'),
  strengths: z.array(z.string()).describe('Up to three things the plan does well'),
  suggestions: z
    .array(
      z.object({
        title: z.string().describe('A short heading for the improvement'),
        detail: z.string().describe('What to change and why, in one to three sentences'),
      }),
    )
    .describe('Two to four specific improvements'),
});
export type AiLessonCheck = z.infer<typeof aiLessonCheckSchema>;

/** Monday (YYYY-MM-DD) of the week containing a date. */
export function mondayOf(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(`${date.slice(0, 10)}T00:00:00Z`) : new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const offset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}
