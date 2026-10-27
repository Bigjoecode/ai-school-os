import {
  QUAL_MAX_TESTS,
  QUAL_SAMPLE_LABEL,
  chemQualitativeVariant,
  emptyQualRecord,
  qualObserve,
  qualSamples,
  type ChemQualitativeState,
  type ChemQualitativeVariant,
  type QualGasTest,
  type QualReagent,
  type QualSample,
  type QualStep,
} from '@aischool/shared';
import { useMemo, useRef } from 'react';
import type { SimulatorProps } from '../types';

/**
 * The qualitative-analysis bench's actions, shared by the 2D and the 3D lab so
 * both produce exactly the same `ChemQualitativeState`. Every change goes
 * through `update`, which appends to the action log.
 */

export type QualUpdate = (fn: (s: ChemQualitativeState) => ChemQualitativeState, log?: string) => void;
const lcFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** What to do next (practice mode only). */
export function nextHint(v: ChemQualitativeVariant, s: ChemQualitativeState): string {
  const samples = qualSamples(v, s.tests);
  const did = (r: QualReagent, on?: QualSample) => s.tests.some((t) => t.reagent === r && (!on || t.sample === on));
  if (!s.tests.length) return v.kind === 'MIXTURE' ? 'Start by adding distilled water to C, shaking and filtering: note the filtrate and the residue.' : 'Start by adding distilled water to C and shaking: does it dissolve? What colour is the solution?';
  if (v.kind === 'SALT' && !samples.includes('SOLUTION')) return 'C does not dissolve in water: dissolve some in dilute HNO₃ and watch for effervescence (test the gas).';
  if (v.kind === 'MIXTURE' && !samples.includes('RESIDUE_SOLN')) return 'Dissolve the residue in dilute HNO₃ so that its cation can be tested.';
  const sol: QualSample[] = v.kind === 'SALT' ? ['SOLUTION'] : ['FILTRATE', 'RESIDUE_SOLN'];
  for (const x of sol) {
    if (!s.tests.some((t) => t.sample === x && t.reagent === 'NAOH' && t.steps.includes('EXCESS'))) return `Add NaOH(aq) to the ${lcFirst(QUAL_SAMPLE_LABEL[x])} in drops, then in excess.`;
    if (!s.tests.some((t) => t.sample === x && t.reagent === 'NH3' && t.steps.includes('EXCESS'))) return `Add NH₃(aq) to the ${lcFirst(QUAL_SAMPLE_LABEL[x])} in drops, then in excess.`;
  }
  if (!did('HEAT')) return 'Heat a little of the solid in a dry test tube and test any gas given off.';
  if (s.tests.some((t) => qualObserve(v, t).gases.length && !t.gasTests.length)) return 'A gas was given off: test it (lime water, damp litmus, splints, dichromate paper…).';
  if (!did('AGNO3') && !did('BACL2') && !did('BROWN_RING')) return 'Now test for the anion: AgNO₃ (Cl⁻), BaCl₂ then HCl (SO₄²⁻, SO₃²⁻, CO₃²⁻), the brown-ring test (NO₃⁻).';
  return 'Record each observation and inference, then name the ions and write an ionic equation.';
}

/** `variant`: use these values instead of the seed's (the 3D lab's demo and sandbox). */
export function useQualitative({ seed, state, onChange, readOnly, startedAt, variant }: Pick<SimulatorProps<'chem-qualitative'>, 'seed' | 'state' | 'onChange' | 'readOnly' | 'startedAt'> & { variant?: ChemQualitativeVariant }) {
  const v = useMemo(() => variant ?? chemQualitativeVariant(seed), [variant, seed]);
  const t0 = useMemo(() => new Date(startedAt).getTime(), [startedAt]);
  const ref = useRef(state);
  ref.current = state;

  const update: QualUpdate = (fn, log) => {
    if (readOnly) return;
    let next = fn(ref.current);
    if (log) next = { ...next, log: [...next.log, { t: Math.max(0, Date.now() - t0), a: log.slice(0, 80) }].slice(-600) };
    ref.current = next;
    onChange(next);
  };
  /** Records a step in the action log only (no marked field changes). */
  const note = (a: string) => update((s) => s, a);
  /** Starts a test of `reagent` on `sample`; returns its index (or -1 at the limit). */
  const doTest = (sample: QualSample, reagent: QualReagent): number => {
    if (ref.current.tests.length >= QUAL_MAX_TESTS) return -1;
    const i = ref.current.tests.length;
    update((s) => ({ ...s, tests: [...s.tests, { sample, reagent, steps: [], gasTests: [] }], table: [...s.table, emptyQualRecord()] }), `test:${reagent}@${sample}`);
    return i;
  };
  const addStep = (i: number, step: QualStep) => update((s) => ({ ...s, tests: s.tests.map((t, k) => (k === i && !t.steps.includes(step) ? { ...t, steps: [...t.steps, step] } : t)) }), `step:${step}#${i + 1}`);
  const addGasTest = (i: number, g: QualGasTest) => update((s) => ({ ...s, tests: s.tests.map((t, k) => (k === i && !t.gasTests.includes(g) ? { ...t, gasTests: [...t.gasTests, g] } : t)) }), `gas:${g}#${i + 1}`);
  const discard = (i: number) => update((s) => ({ ...s, tests: s.tests.filter((_, k) => k !== i), table: s.table.filter((_, k) => k !== i) }), `discard#${i + 1}`);

  return { v, ref, update, note, doTest, addStep, addGasTest, discard };
}
export type Qualitative = ReturnType<typeof useQualitative>;
