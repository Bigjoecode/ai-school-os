import { plasShrink, potatoFirmness, potatoPhase, potatoReading, potatoTruth, type BioOsmosisState, type BioOsmosisVariant } from '@aischool/shared';
import { useMemo } from 'react';

/** What the bench shows now (shared by the 2D and the 3D lab): a cylinder's last reading, how it feels, each cell's protoplast. */

export const PHASE_LABEL = { B: 'before soaking', SOAK: 'soaking', A: 'after soaking' } as const;
/** The last reading of a cylinder in its current phase (what the ruler and balance show now). */
export function potatoShown(v: BioOsmosisVariant, s: BioOsmosisState, i: number) {
  const w = s.potato;
  const c = w.cyl[i];
  if (!c) return null;
  const ph = potatoPhase(c);
  if (ph === 'SOAK') return { ph, length: null, mass: null, trueLength: null, feel: null };
  const measured = w.measures.some((m) => m.cyl === i && m.phase === ph);
  const lastW = [...w.weighs].reverse().find((m) => m.cyl === i && m.phase === ph);
  const t = potatoTruth(v.potato, i, c, w.clock);
  return {
    ph,
    length: measured ? potatoReading(v.potato, i, c, w.clock, ph, true).length : null,
    trueLength: measured ? (ph === 'B' ? t.L0 : t.L) : null,
    mass: lastW ? potatoReading(v.potato, i, c, w.clock, ph, lastW.blotted).mass : null,
    feel: ph === 'A' ? potatoFirmness(t.pm) : null,
  };
}
export const FEEL_TEXT = { FIRM: 'It feels firm and stiff: it does not bend (turgid).', FLACCID: 'It feels soft and bends easily (flaccid).', SAME: 'It feels about the same as before.' } as const;

/** Each cell's protoplast at the plasmolysis clock (memoised: the integration is the expensive part). */
export function usePlasShrink(v: BioOsmosisVariant, w: BioOsmosisState['plas']) {
  const key = JSON.stringify([w.mount, w.irrigations, w.clock]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => plasShrink(v.plas, w, w.clock), [v, key]);
}

