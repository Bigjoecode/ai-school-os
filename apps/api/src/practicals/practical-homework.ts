/**
 * PRACTICAL homework, the pure part: which of a student's practical attempts
 * hands the homework in, with what mark, and whether it may replace the
 * current hand-in. The service (practical-homework.service.ts) loads the rows
 * and writes the result.
 */

/** Quick checks passed at this fraction count as "learned" (and hand in a practical that has no virtual lab). */
export const CHECK_PASS = 0.6;

export interface HandInAttempt {
  id: string;
  /** LAB | EXAM | CHECK */
  mode: string;
  score: number | null;
  maxScore: number;
  /** A teacher's review: { score, … }. */
  override: unknown;
  submittedAt: Date | null;
}

export interface HandInHomework {
  publishedAt: Date | null;
  /** YYYY-MM-DD */
  dueDate: string;
  allowLate: boolean;
  /** The teacher's "Count labs already done": attempts from before publishing count too. */
  countEarlierLabs?: boolean;
}

export interface HandIn {
  attemptId: string;
  mode: string;
  /** 0–100: the homework's score (PRACTICAL homework is out of 100). */
  percent: number;
  score: number;
  maxScore: number;
  reviewed: boolean;
  late: boolean;
  submittedAt: Date;
}

/** The score that counts: a teacher's review, else the marked score (as effectiveScore in practicals.service). */
const scoreOf = (a: HandInAttempt) => (a.override as { score?: number } | null)?.score ?? a.score;
const percentOf = (a: HandInAttempt) => {
  const s = scoreOf(a);
  return s !== null && a.maxScore > 0 ? Math.round((s / a.maxScore) * 100) : null;
};

/** The attempts that do the practical: handed-in labs (LAB or EXAM), or, when it has no virtual lab, passed quick checks. */
export function doneAttempts(attempts: HandInAttempt[], hasLab: boolean): (HandInAttempt & { submittedAt: Date; percent: number })[] {
  const out: (HandInAttempt & { submittedAt: Date; percent: number })[] = [];
  for (const a of attempts) {
    const percent = percentOf(a);
    if (!a.submittedAt || percent === null) continue;
    if (hasLab ? a.mode !== 'LAB' && a.mode !== 'EXAM' : a.mode !== 'CHECK' || percent < CHECK_PASS * 100) continue;
    out.push({ ...a, submittedAt: a.submittedAt, percent });
  }
  return out;
}

/**
 * The attempt that hands the homework in: the best one handed in after the
 * homework was published (or any, when the teacher counts labs already done),
 * and by the due date unless late work is accepted
 * (as a normal hand-in: late once the school's day is past the due date).
 * Ties keep the earlier attempt. `dayOf` gives an instant's date at the school.
 */
export function bestHandIn(attempts: HandInAttempt[], hasLab: boolean, h: HandInHomework, dayOf: (d: Date) => string): HandIn | null {
  if (!h.publishedAt) return null;
  let best: HandIn | null = null;
  for (const a of doneAttempts(attempts, hasLab)) {
    if (!h.countEarlierLabs && a.submittedAt < h.publishedAt) continue;
    const late = dayOf(a.submittedAt) > h.dueDate;
    if (late && !h.allowLate) continue;
    if (best && (a.percent < best.percent || (a.percent === best.percent && a.submittedAt >= best.submittedAt))) continue;
    best = { attemptId: a.id, mode: a.mode, percent: a.percent, score: scoreOf(a)!, maxScore: a.maxScore, reviewed: !!a.override, late, submittedAt: a.submittedAt };
  }
  return best;
}

/**
 * Whether the best attempt replaces the current hand-in. A new attempt only
 * ever raises the mark (the best attempt is kept); `force` (a teacher's review
 * of a lab score) writes it whatever it is.
 */
export function shouldWrite(existing: { status: string; score: number | null; links: string[] } | null, best: HandIn, force = false): boolean {
  if (!existing || existing.status !== 'GRADED' || existing.score === null) return true;
  if (force) return existing.score !== best.percent || !existing.links.includes(labLink(best.attemptId));
  return best.percent > existing.score;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** The hand-in's feedback: the lab's (or quick check's) score, and where to see the result. */
export function handInFeedback(best: HandIn): string {
  if (best.mode === 'CHECK') return `Quick check passed: ${fmt(best.score)}/${fmt(best.maxScore)} (${best.percent}%). Handed in automatically from the Practical Academy.`;
  const what = best.mode === 'EXAM' ? 'Timed practical' : 'Virtual lab';
  return `${what}: ${fmt(best.score)}/${fmt(best.maxScore)} (${best.percent}%)${best.reviewed ? ', reviewed by your teacher' : ''}. Handed in automatically from the Practical Academy: open the lab result for the marks on each criterion.`;
}

/** Whether the student hears about the hand-in: it's new, or its mark changed. */
export function shouldNotify(existing: { score: number | null } | null, best: HandIn): boolean {
  return !existing || existing.score !== best.percent;
}

/** The student's in-app notice for an automatic hand-in. */
export function handInNotice(title: string, best: HandIn): { title: string; body: string } {
  const from = best.mode === 'CHECK' ? 'your quick check' : 'your lab';
  return {
    title: `${title}: handed in from ${from}, ${best.percent}/100`.slice(0, 160),
    body: best.mode === 'CHECK' ? 'Your Practical Academy quick check handed in this homework for you.' : 'Your Practical Academy lab handed in this homework for you. Open it for the marks on each criterion.',
  };
}

/** The student's lab result page, kept in the hand-in's links (the web shows it as "Open the lab result"). */
export const labLink = (attemptId: string) => `/learn/practicals/labs/${attemptId}`;
const LAB_LINK = /^\/learn\/practicals\/labs\/([A-Za-z0-9_-]+)$/;
/** Splits a hand-in's links into the lab attempt it came from and the rest. */
export function splitLabLink(links: string[]): { labAttemptId: string | null; links: string[] } {
  const lab = links.map((l) => LAB_LINK.exec(l)?.[1]).find((x): x is string => !!x) ?? null;
  return { labAttemptId: lab, links: links.filter((l) => !LAB_LINK.test(l)) };
}
