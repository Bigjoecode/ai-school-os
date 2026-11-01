import { oxyCountShown, oxyLampAt, oxyTemp, potoRunShown, type BioPlantState, type BioPlantVariant } from '@aischool/shared';

/** What the bench shows now (shared by the 2D and the 3D lab): the last timing, the last count, the thermometer. */

/** The stopwatch reading of the last timing (s), with its run. */
export function lastRunShown(v: BioPlantVariant, s: BioPlantState) {
  const r = s.poto.runs.at(-1);
  return r ? { run: r, sec: potoRunShown(v.poto, s.poto, r, v.seed) } : null;
}
/** The last one-minute count: its distance and the bubbles seen. */
export function lastCountShown(v: BioPlantVariant, s: BioPlantState) {
  const w = s.oxy;
  const n = w.counts.length - 1;
  const c = w.counts[n];
  return c ? { n, at: c.at, d: oxyLampAt(w, c.at), bubbles: oxyCountShown(v.oxy, w, c.at, n, v.seed) } : null;
}
/** The thermometer in the beaker now (°C, to 0.5 °C). */
export const waterTemp = (v: BioPlantVariant, s: BioPlantState) => Math.round(oxyTemp(v.oxy, s.oxy, s.oxy.clock) * 2) / 2;
