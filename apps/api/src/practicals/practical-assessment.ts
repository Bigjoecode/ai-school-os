import type { PortalPracticalTest, PracticalAssessmentKind, PracticalAssessmentRowStatus } from '@aischool/shared';
import { attemptDeadline, familyResultNote, phaseOf, resultNote, resultVisibility, startRefusal, type WindowedAssessment } from '../cbt/cbt-rules';

/**
 * Practical assessments (a virtual lab set by a teacher as a timed class
 * test or exam), the pure part: starting a sitting (one per student), its
 * deadline, which lab mode it runs in, what the student may see and what
 * may change once students have started. The service
 * (practical-assessments.service.ts) loads the rows and writes the result.
 */

export interface AssessmentRules extends WindowedAssessment {
  kind: string;
  durationMinutes: number;
  accessCode: string | null;
  showResults: string;
  resultsReleasedAt: Date | null;
}

export interface SittingRow {
  id: string;
  startedAt: Date;
  endsAt: Date | null;
  submittedAt: Date | null;
}

/** The lab mode a sitting runs in: an EXAM is the lab's exam mode (Try only, no guidance or assistant); a TEST is the guided lab. Both are timed. */
export const sittingMode = (kind: string): 'LAB' | 'EXAM' => ((kind as PracticalAssessmentKind) === 'TEST' ? 'LAB' : 'EXAM');

export type StartDecision =
  | { action: 'RESUME'; attemptId: string }
  | { action: 'REFUSE'; code: 'NOT_OPEN' | 'CLOSED' | 'ACCESS_CODE'; message: string }
  | { action: 'CREATE'; startedAt: Date; endsAt: Date; mode: 'LAB' | 'EXAM' };

/**
 * Starting a sitting. One attempt per student: an existing sitting (still
 * running or handed in) is always returned, never re-rolled, even after the
 * window closed. Otherwise it must be open and the access code right; the
 * student gets the full duration from now, but never past the closing time.
 */
export function startDecision(a: AssessmentRules, existing: { id: string } | null, accessCode: string | null | undefined, now = new Date()): StartDecision {
  if (existing) return { action: 'RESUME', attemptId: existing.id };
  const refusal = startRefusal(a, accessCode, now);
  if (refusal) return { action: 'REFUSE', ...refusal, message: refusal.code === 'ACCESS_CODE' ? refusal.message : refusal.code === 'NOT_OPEN' ? 'This practical test has not opened yet' : 'This practical test has closed' };
  return { action: 'CREATE', startedAt: now, endsAt: attemptDeadline(now, a.durationMinutes, a.closesAt), mode: sittingMode(a.kind) };
}

/** Where a student's sitting is: not started, running, or handed in. */
export function sittingStatus(s: SittingRow | null): PracticalAssessmentRowStatus {
  if (!s) return 'NOT_STARTED';
  return s.submittedAt ? 'SUBMITTED' : 'IN_PROGRESS';
}

/** Seconds from starting to handing in (a sitting handed in for the student after time-up counts to its deadline). */
export function timeTakenSeconds(s: SittingRow): number | null {
  if (!s.submittedAt) return null;
  const end = s.endsAt && s.submittedAt > s.endsAt ? s.endsAt : s.submittedAt;
  return Math.max(0, Math.round((end.getTime() - s.startedAt.getTime()) / 1000));
}

/**
 * What the student may see of their handed-in sitting right now: the score;
 * the marks in detail, feedback and worked solution (`review`), which wait
 * until nobody can still be sitting, as answers do in an online exam; and if
 * not, why.
 */
export function studentView(a: AssessmentRules, s: SittingRow | null, now = new Date()): { score: boolean; review: boolean; note: string | null } {
  if (!s?.submittedAt) return { score: false, review: false, note: null };
  const { score, review } = resultVisibility(a, { status: 'SUBMITTED' }, now);
  return { score, review, note: resultNote(a, score, 'practical test') ?? (review ? null : 'You can see your marks in detail once the practical test has closed.') };
}

/**
 * A sitting as the family sees it: the same moment the child may see it,
 * never while the school withholds results, and class figures only with at
 * least two marks to average. The caller passes only handed-in sittings.
 */
export function familyTest(
  a: AssessmentRules & { id: string; title: string },
  s: { startedAt: Date; submittedAt: Date | null; maxScore: number },
  score: number | null,
  names: { subject: string; term: string | null; practicalTitle: string },
  peerPercents: number[],
  withheld: string | null,
  now = new Date(),
): PortalPracticalTest {
  const vis = resultVisibility(a, { status: 'SUBMITTED' }, now);
  const show = vis.score && !withheld && score != null && s.maxScore > 0;
  const stats = show && peerPercents.length >= 2;
  const round1 = (n: number) => Math.round(n * 10) / 10;
  return {
    id: a.id,
    title: a.title,
    kind: a.kind as PracticalAssessmentKind,
    subject: names.subject,
    term: names.term,
    practicalTitle: names.practicalTitle,
    satAt: (s.submittedAt ?? s.startedAt).toISOString(),
    status: 'MARKED',
    score: show ? score : null,
    total: show ? s.maxScore : null,
    percent: show ? round1((score / s.maxScore) * 100) : null,
    classAverage: stats ? round1(peerPercents.reduce((x, y) => x + y, 0) / peerPercents.length) : null,
    classHighest: stats ? round1(Math.max(...peerPercents)) : null,
    canReview: !withheld && vis.review,
    note: familyResultNote(a, vis, { withheld: !!withheld }),
  };
}

/** Fields that can't change once a student has started (they would treat sitters differently). */
export const LOCKED_ONCE_STARTED = ['kind', 'classArmIds', 'opensAt', 'durationMinutes'] as const;
export function lockedChanges(body: Partial<Record<(typeof LOCKED_ONCE_STARTED)[number], unknown>>): string[] {
  return LOCKED_ONCE_STARTED.filter((k) => body[k] !== undefined);
}

/** A sitting is due to be handed in for the student once its clock and the grace period have passed. */
export const overdue = (s: SittingRow, graceMs: number, now = Date.now()) => !s.submittedAt && !!s.endsAt && now > s.endsAt.getTime() + graceMs;

/** The edit form sends times to the minute: a time left as it was is not a change (it may well be in the past by now). */
export const sameMinute = (a: Date, b: Date) => Math.floor(a.getTime() / 60_000) === Math.floor(b.getTime() / 60_000);

export { phaseOf };
