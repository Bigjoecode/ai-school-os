import { respShown, seedMeasureShown, tropShown, type BioGrowthState, type BioGrowthVariant } from '@aischool/shared';

/** What the bench shows now (shared by the 2D and the 3D lab): the last ruler and protractor readings, the thermometers. */

/** The ruler reading of the last seedling measurement (mm). */
export function lastSeedShown(v: BioGrowthVariant, s: BioGrowthState) {
  const w = s.seedling;
  const n = w.measures.length - 1;
  const m = w.measures[n];
  return m ? { ...m, n, mm: seedMeasureShown(v.seedling, w, m, n, v.seed) } : null;
}
/** The protractor reading of the last angle measured (degrees). */
export function lastTropShown(v: BioGrowthVariant, s: BioGrowthState) {
  const w = s.trop;
  const n = w.measures.length - 1;
  const m = w.measures[n];
  return m ? { ...m, n, deg: tropShown(v.trop, w, m, n, v.seed) } : null;
}
/** Both thermometers at the last reading (°C, to 0.5 °C). */
export function lastRespShown(v: BioGrowthVariant, s: BioGrowthState) {
  const w = s.resp;
  const n = w.reads.length - 1;
  const at = w.reads[n];
  return at === undefined ? null : { n, at, a: respShown(v.resp, w, 'A', w.A, at, n, v.seed), b: respShown(v.resp, w, 'B', w.B, at, n, v.seed) };
}
export function respReadText(v: BioGrowthVariant, s: BioGrowthState): string {
  const w = s.resp;
  if (w.startAt === null) return 'The flasks start when both have seeds, a thermometer and a plug.';
  const r = lastRespShown(v, s);
  if (!r) return 'No reading yet: read both thermometers at the start.';
  const h = Math.round(r.at - w.startAt);
  return `Reading ${r.n + 1} (${h} h): A ${r.a.toFixed(1)} °C, B ${r.b.toFixed(1)} °C.`;
}
