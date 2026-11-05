import type { CbtScoreRowStatus } from '@aischool/shared';

/**
 * Copying marks from a school assessment (an online exam, a practical test)
 * into a result component of the score sheet, the pure part: scaling to the
 * component's maximum and what would happen to each student's mark. The
 * service (score-sheet.service.ts) loads the rows and writes them.
 */

const round1 = (n: number) => Math.round(n * 10) / 10;

/** A mark out of `total`, scaled to the component's maximum (to one decimal place); null when there is nothing to scale. */
export function scaleToComponent(score: number | null, total: number | null, componentMax: number): number | null {
  if (score == null || !total || total <= 0) return null;
  return round1((Math.max(0, Math.min(score, total)) / total) * componentMax);
}

/** What sending would do for one student: a new mark, the same one, a different one already there, or nothing. */
export function scoreRowStatus(x: { hasClass: boolean; allowed: boolean; newScore: number | null; existingScore: number | null }): CbtScoreRowStatus {
  if (!x.hasClass) return 'NO_CLASS';
  if (!x.allowed) return 'NOT_ALLOWED';
  if (x.newScore == null) return 'NOT_MARKED';
  if (x.existingScore == null) return 'NEW';
  return Math.abs(x.existingScore - x.newScore) < 0.005 ? 'SAME' : 'CONFLICT';
}
