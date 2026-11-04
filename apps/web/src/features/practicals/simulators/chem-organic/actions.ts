import {
  ORG_MAX_TESTS,
  ORG_PRACTICAL_TASKS,
  ORG_TASK_SAMPLES,
  ORG_TEST_INFO,
  SOAP_MAX_EVENTS,
  chemOrganicVariant,
  emptyChemOrganicState,
  emptyOrgRecord,
  orgObserve,
  soapRun,
  type ChemOrganicState,
  type ChemOrganicVariant,
  type OrgSample,
  type OrgStep,
  type OrgTask,
  type OrgTestId,
  type SoapAct,
} from '@aischool/shared';
import { useEffect, useMemo, useRef } from 'react';
import type { SimulatorProps } from '../types';

/**
 * The organic bench's actions, shared by the 2D and the 3D lab so both
 * produce exactly the same `ChemOrganicState`. Every change goes through
 * `update`, which appends to the action log.
 */

export type OrgUpdate = (fn: (s: ChemOrganicState) => ChemOrganicState, log?: string) => void;
export const lessonTask = (practicalId?: string): OrgTask => (practicalId ? ORG_PRACTICAL_TASKS[practicalId] : undefined) ?? 'GROUPS';
export const HEAT_MAX = 600;
export const BOIL_MAX = 1200;

/** What to do next (practice mode only). */
export function nextHint(v: ChemOrganicVariant, s: ChemOrganicState): string {
  const task = s.task ?? 'GROUPS';
  if (task === 'SOAP') {
    const r = soapRun(v, s.soap);
    if (!r.oil) return 'Measure 10 cm³ of palm oil into the 250 cm³ beaker.';
    if (!r.oilWeighed) return 'Weigh the oil on the balance and record its mass.';
    if (!r.naoh) return 'Add 20 cm³ of the 20% NaOH solution.';
    if (r.boiled < 900) return `Boil gently, stirring all the time, for 15–20 minutes (${Math.round(r.boiled / 60)} min so far). Add water when the level drops (${r.water.toFixed(0)} cm³ left).`;
    if (!r.brine) return 'Add about 20 cm³ of saturated brine and stir: the soap separates.';
    if (!r.filtered) return 'Let it cool, then filter (or skim) off the soap.';
    if (!r.washed || !r.dried) return 'Wash the soap with a little cold water and press it dry.';
    if (r.soapMass === null) return 'Weigh the soap.';
    if (!r.soft || !r.hard) return 'Shake a small piece with distilled water and another with hard water.';
    return 'Record your observations, the masses, the theoretical mass, the % yield and the by-product, then your precautions and explanation.';
  }
  const done = (x: OrgSample, t: OrgTestId[]) => s.tests.some((y) => y.sample === x && t.includes(y.test) && orgObserve(v, y).complete);
  for (const x of ORG_TASK_SAMPLES[task]) {
    if (task === 'GROUPS') {
      if (!done(x, ['BROMINE', 'KMNO4'])) return `Test ${x} for C=C: shake with bromine water.`;
      if (!done(x, ['DICHROMATE', 'SODIUM'])) return `Test ${x} for an alkanol: warm with acidified K₂Cr₂O₇ in the water bath.`;
      if (!done(x, ['NAHCO3'])) return `Test ${x} for an acid: add NaHCO₃ and pass any gas into lime water.`;
    } else if (task === 'CARBS') {
      if (!done(x, ['IODINE'])) return `Test ${x} for starch: 2 drops of iodine.`;
      if (!done(x, ['BENEDICT', 'FEHLING'])) return `Test ${x} for a reducing sugar: Benedict's in the boiling water bath for 5 minutes.`;
      const neg = s.tests.filter((y) => y.sample === x && (y.test === 'BENEDICT' || y.test === 'FEHLING') && orgObserve(v, y).complete && !orgObserve(v, y).positive);
      if (neg.length && !done(x, ['HYDROLYSIS'])) return `${x} gave no reducing sugar: boil it with dilute HCl, neutralise with NaHCO₃, then Benedict's.`;
    } else {
      if (!done(x, ['BIURET'])) return `Biuret test on ${orgSampleLabel(x)}: 2 cm³ NaOH, then CuSO₄ a drop at a time.`;
      if (x !== 'H2O' && !done(x, ['MILLON', 'XANTHO', 'NINHYDRIN'])) return `Confirm on ${x}: the xanthoproteic test (conc. HNO₃, warm, then NH₃).`;
    }
  }
  if (task === 'GROUPS' && !s.tests.some((t) => t.test === 'ESTER' && orgObserve(v, t).complete)) return 'Make an ester: warm the alkanol with ethanoic acid and conc. H₂SO₄, pour into water, waft.';
  if (task === 'PROTEINS' && !s.tests.some((t) => t.test === 'COAGULATE' && orgObserve(v, t).complete)) return 'Heat the samples in the boiling water bath: does any coagulate?';
  return 'Record each observation and inference, identify each sample, do the calculation, then your precautions and explanation.';
}
const orgSampleLabel = (x: OrgSample) => (x === 'H2O' ? 'the water control' : x);

/** `variant`: use these values instead of the seed's (the 3D lab's demo and sandbox). */
export function useOrganic({ seed, state, onChange, readOnly, startedAt, practicalId, variant }: Pick<SimulatorProps<'chem-organic'>, 'seed' | 'state' | 'onChange' | 'readOnly' | 'startedAt' | 'practicalId'> & { variant?: ChemOrganicVariant }) {
  const task: OrgTask = state.task ?? variant?.task ?? lessonTask(practicalId);
  const v = useMemo(() => variant ?? chemOrganicVariant(seed, task), [variant, seed, task]);
  const t0 = useMemo(() => new Date(startedAt).getTime(), [startedAt]);
  const ref = useRef(state);
  ref.current = state;

  const update: OrgUpdate = (fn, log) => {
    if (readOnly) return;
    let next = fn(ref.current);
    if (log) next = { ...next, log: [...next.log, { t: Math.max(0, Date.now() - t0), a: log.slice(0, 80) }].slice(-600) };
    ref.current = next;
    onChange(next);
  };
  useEffect(() => {
    if (!readOnly && !ref.current.task && !variant) update((s) => (s.task ? s : { ...s, task: lessonTask(practicalId) }), 'task:auto');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, practicalId]);

  const note = (a: string) => update((s) => s, a);
  const chooseTask = (t: OrgTask) => update((s) => ({ ...emptyChemOrganicState(), log: s.log, task: t }), `task:${t}`);
  const doTest = (sample: OrgSample, test: OrgTestId): number => {
    if (ref.current.tests.length >= ORG_MAX_TESTS) return -1;
    const i = ref.current.tests.length;
    update((s) => ({ ...s, tests: [...s.tests, { sample, test, steps: [], heat: 0, direct: false, boil: 0, portions: [], drops: 0 }], table: [...s.table, emptyOrgRecord()] }), `test:${test}@${sample}`);
    return i;
  };
  const addStep = (i: number, step: OrgStep) =>
    update(
      (s) => ({
        ...s,
        tests: s.tests.map((t, k) => {
          if (k !== i) return t;
          if (step === 'CUSO4') return { ...t, drops: Math.min(30, t.drops + 1), steps: t.steps.includes('CUSO4') ? t.steps : [...t.steps, step] };
          if ((step === 'ACID_PARTNER' && t.steps.includes('ETHANOL_PARTNER')) || (step === 'ETHANOL_PARTNER' && t.steps.includes('ACID_PARTNER'))) return t;
          return t.steps.includes(step) ? t : { ...t, steps: [...t.steps, step] };
        }),
      }),
      `step:${step}#${i + 1}`,
    );
  /** Heats a tube for `sec` more seconds in the water bath (or `direct` over the flame). Acid hydrolysis: boiling with the acid until it is neutralised. */
  const heat = (i: number, sec = 60, direct = false) =>
    update(
      (s) => ({
        ...s,
        tests: s.tests.map((t, k) => {
          if (k !== i) return t;
          if (t.test === 'HYDROLYSIS' && t.steps.includes('ACID') && !t.steps.includes('NEUTRALISE')) return { ...t, boil: Math.min(BOIL_MAX, t.boil + sec), direct: t.direct || direct };
          return { ...t, heat: Math.min(HEAT_MAX, t.heat + sec), direct: t.direct || direct };
        }),
      }),
      `${direct ? 'heat-direct' : 'heat'}:${sec}#${i + 1}`,
    );
  /** Acid hydrolysis: a portion tested with iodine at this boiling time. */
  const portion = (i: number) =>
    update((s) => ({ ...s, tests: s.tests.map((t, k) => (k === i && t.steps.includes('ACID') && !t.portions.includes(t.boil) && t.portions.length < 20 ? { ...t, portions: [...t.portions, t.boil] } : t)) }), `portion#${i + 1}`);
  const discard = (i: number) => update((s) => ({ ...s, tests: s.tests.filter((_, k) => k !== i), table: s.table.filter((_, k) => k !== i) }), `discard#${i + 1}`);
  const soap = (a: SoapAct, n = 0) => {
    if (ref.current.soap.length >= SOAP_MAX_EVENTS) return;
    update((s) => ({ ...s, soap: [...s.soap, { a, n }] }), `soap:${a}${n ? `:${n}` : ''}`);
  };
  const run = () => soapRun(v, ref.current.soap);
  return { v, task, ref, update, note, chooseTask, doTest, addStep, heat, portion, discard, soap, run };
}
export type Organic = ReturnType<typeof useOrganic>;

/** Whether the tube's next heating goes to the acid boil (hydrolysis) or the water bath. */
export const heatsNow = (t: { test: OrgTestId; steps: OrgStep[] }) => {
  const info = ORG_TEST_INFO[t.test];
  if (!info.heats) return t.test === 'IODINE';
  if (t.test === 'HYDROLYSIS') return t.steps.includes('ACID') && (!t.steps.includes('NEUTRALISE') || t.steps.includes('BENEDICT'));
  if (t.test === 'XANTHO') return t.steps.includes('HNO3');
  if (t.test === 'ESTER') return t.steps.includes('ACID_PARTNER') || t.steps.includes('ETHANOL_PARTNER');
  return true;
};
