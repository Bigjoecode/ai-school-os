import type { CbtPhase, CbtShowResults } from '@aischool/shared';

/**
 * Timed, windowed school assessments, the pure rules shared by online exams
 * (CBT) and practical assessments: where one is in time, when a sitter may
 * see their score, and what makes a valid window. No database, so the rules
 * are tested on their own (test/practical-assessments.test.ts).
 */

export interface WindowedAssessment {
  /** DRAFT, SCHEDULED, CLOSED */
  status: string;
  opensAt: Date;
  closesAt: Date;
}

export function phaseOf(e: WindowedAssessment, now = new Date()): CbtPhase {
  if (e.status === 'DRAFT') return 'DRAFT';
  if (e.status === 'CLOSED' || now >= e.closesAt) return 'ENDED';
  return now < e.opensAt ? 'UPCOMING' : 'OPEN';
}

/**
 * What a sitter (and so their parents) may see of a handed-in attempt right
 * now: the score per the "show results" choice, and the answers only once
 * nobody can still be sitting (or the teacher released them).
 */
export function resultVisibility(e: WindowedAssessment & { showResults: string; resultsReleasedAt: Date | null }, a: { status: string }, now = new Date()) {
  if (a.status === 'IN_PROGRESS') return { score: false, review: false };
  const ended = phaseOf(e, now) === 'ENDED';
  const released = !!e.resultsReleasedAt;
  const show = e.showResults as CbtShowResults;
  return {
    score: released || show === 'IMMEDIATE' || (show === 'AFTER_CLOSE' && ended),
    review: released || (ended && show !== 'NEVER'),
  };
}

/** Why a sitter can't see their score yet, or null when they can. */
export function resultNote(e: { showResults: string }, visible: boolean, what = 'exam'): string | null {
  if (visible) return null;
  return e.showResults === 'AFTER_CLOSE' ? `Your results will be shown when the ${what} closes.` : 'Your results will be released by your teacher.';
}

/** Why the family can't see a result yet (or all of it), or null. `partial`: written answers are still being marked. */
export function familyResultNote(e: { showResults: string }, vis: { score: boolean; review: boolean }, opts: { withheld: boolean; partial?: boolean }): string | null {
  if (opts.withheld) return null;
  if (!vis.score) return e.showResults === 'AFTER_CLOSE' ? 'The score will show when the test closes.' : 'The score will show when the teacher releases the results.';
  if (opts.partial) return 'Written answers are still being marked; this is the score so far.';
  return vis.review ? null : 'Answers can be reviewed once the test has closed.';
}

/** Why a window can't be used, or null: it must close after it opens, fit the whole duration, and (when scheduling) not be over. */
export function windowError(opensAt: string | Date, closesAt: string | Date, durationMinutes: number, scheduling: boolean, now = Date.now()): string | null {
  const open = new Date(opensAt).getTime();
  const close = new Date(closesAt).getTime();
  if (close <= open) return 'The closing time must be after the opening time';
  if (close - open < durationMinutes * 60_000) return `The window must be at least ${durationMinutes} minutes long so everyone can get the full time`;
  if (scheduling && close <= now) return 'The closing time has already passed';
  return null;
}

/** A sitter's deadline: the full duration from starting, but never past the closing time. */
export function attemptDeadline(startedAt: Date, durationMinutes: number, closesAt: Date): Date {
  return new Date(Math.min(startedAt.getTime() + durationMinutes * 60_000, closesAt.getTime()));
}

/** Whether a sitter may start now: the assessment is open and the access code (when one is set) matches. */
export function startRefusal(e: WindowedAssessment & { accessCode: string | null }, accessCode: string | null | undefined, now = new Date()): { code: 'NOT_OPEN' | 'CLOSED' | 'ACCESS_CODE'; message: string } | null {
  const phase = phaseOf(e, now);
  if (phase === 'UPCOMING' || phase === 'DRAFT') return { code: 'NOT_OPEN', message: 'This has not opened yet' };
  if (phase !== 'OPEN') return { code: 'CLOSED', message: 'This has closed' };
  if (e.accessCode && (accessCode ?? '').trim().toUpperCase() !== e.accessCode.toUpperCase()) return { code: 'ACCESS_CODE', message: 'That access code is not right. Ask your invigilator.' };
  return null;
}
