import { eosinShown, microIncDays, plateVisible, ratShown, type BioDissectionState, type BioDissectionVariant } from '@aischool/shared';

/** What the bench shows now (shared by the 2D and the 3D lab): the last ruler readings and the plates as counted. */

/** The ruler at the red line for the last dye reading (cm, to 0.1 cm). */
export function lastEosinShown(v: BioDissectionVariant, s: BioDissectionState) {
  const w = s.eosin;
  const n = w.reads.length - 1;
  return n < 0 ? null : { n, at: w.reads[n]!, cm: eosinShown(v.eosin, w, n, v.seed) };
}
/** The last rat measurement (cm, to 0.5 cm). */
export function lastRatShown(v: BioDissectionVariant, s: BioDissectionState) {
  const w = s.rat;
  const n = w.measures.length - 1;
  const m = w.measures[n];
  return m ? { ...m, n, cm: ratShown(v.rat, w, n, v.seed) } : null;
}
/** Days of incubation the plates have had now (null: not incubated). */
export const plateDaysNow = (s: BioDissectionState) => (s.micro.incAt === null ? null : s.micro.day - s.micro.incAt);
/** Colonies visible on each plate when counted (null: not counted). */
export function countedColonies(v: BioDissectionVariant, s: BioDissectionState): number[] | null {
  const d = microIncDays(s.micro);
  return d === null ? null : s.micro.plates.map((_, k) => plateVisible(v.micro, s.micro, k, d, v.seed).length);
}
