import {
  AMY_MAX_CLOCK,
  AMY_MAX_SPOTS,
  AMY_MAX_TUBES,
  FOOD_MAX_TESTS,
  FOOD_PRACTICAL_TASKS,
  FOOD_TEST_INFO,
  bioFoodVariant,
  emptyAmyRecord,
  emptyBioFoodState,
  emptyFoodRecord,
  foodObserve,
  type AmyBath,
  type BioFoodState,
  type BioFoodVariant,
  type FoodSample,
  type FoodStep,
  type FoodTask,
  type FoodTestId,
} from '@aischool/shared';
import { useEffect, useMemo, useRef } from 'react';
import type { SimulatorProps } from '../types';

/**
 * The food-tests bench's actions, shared by the 2D and the 3D lab so both
 * produce exactly the same `BioFoodState`. Every change goes through
 * `update`, which appends to the action log.
 */

export type FoodUpdate = (fn: (s: BioFoodState) => BioFoodState, log?: string) => void;
export const lessonTask = (practicalId?: string): FoodTask => (practicalId ? FOOD_PRACTICAL_TASKS[practicalId] : undefined) ?? 'FOOD';
/** The heating button adds this much time in the water bath (s). */
export const HEAT_STEP = 60;
/** The longest a tube is kept in the bath (s). */
export const HEAT_MAX = 600;

/** What to do next (practice mode only). */
export function nextHint(v: BioFoodVariant, s: BioFoodState): string {
  if ((s.task ?? 'FOOD') === 'AMYLASE') {
    if (!s.tile) return 'Put a drop of iodine solution in each well of the spotting tile.';
    if (!s.tubes.length) return 'Set up tubes of starch and saliva in the ice bath, at 37 °C and in the boiling bath — and a control with boiled saliva.';
    if (s.clock === null && !s.equilibrated) return 'Leave the starch and saliva tubes in their baths for 5 minutes so they reach the temperature.';
    if (s.clock === null) return 'Pour each saliva into its starch, start the stopwatch and test a drop of each mixture straight away.';
    const body = s.tubes.findIndex((t) => t.bath === 'BODY' && !t.boiled);
    const spotsNow = s.spots.filter((x) => x.t === s.clock).length;
    if (spotsNow < s.tubes.length) return `Test a drop of each mixture on a fresh iodine well (stopwatch ${s.clock} s).`;
    if (body >= 0 && s.clock < 600) return 'Wait 30 s, then test a drop of each mixture again. Note when the iodine stops turning blue-black.';
    if (!s.tests.length) return "Test some of the 37 °C mixture with Benedict's solution in the water bath.";
    return 'Fill in the end points, the rates (1000 ÷ t) and the optimum temperature, then your precautions and explanation.';
  }
  for (const sm of v.samples) {
    const done = (t: FoodTestId[]) => s.tests.some((x) => x.sample === sm.letter && t.includes(x.test));
    if (!done(['IODINE'])) return `Test ${sm.letter} for starch: add 2–3 drops of iodine solution.`;
    if (!done(['BENEDICT'])) return `Test ${sm.letter} for a reducing sugar: Benedict's solution, heated in the boiling water bath for about 5 minutes.`;
    const ben = s.tests.filter((x) => x.sample === sm.letter && x.test === 'BENEDICT');
    if (ben.length && ben.every((x) => x.heat > 0 && !foodObserve(v, s, x).positive) && !done(['NONREDUCING'])) return `${sm.letter} gave no reducing sugar: test it for a non-reducing sugar (acid, neutralise, Benedict's).`;
    if (!done(['BIURET', 'MILLON'])) return `Test ${sm.letter} for protein (Biuret: NaOH, then 2 drops of CuSO₄).`;
    if (!done(['SUDAN', 'GREASE', 'EMULSION'])) return `Test ${sm.letter} for fat (Sudan III, the grease spot or the emulsion test).`;
  }
  if (s.tests.some((t) => FOOD_TEST_INFO[t.test].heats && t.heat === 0)) return 'Some tubes have not been heated yet: put them in the boiling water bath.';
  return 'Record each observation and inference, name the food substances in P, Q and R, then your precautions and explanation.';
}

/** `variant`: use these values instead of the seed's (the 3D lab's demo and sandbox). */
export function useFoodTests({ seed, state, onChange, readOnly, startedAt, practicalId, variant }: Pick<SimulatorProps<'bio-food-tests'>, 'seed' | 'state' | 'onChange' | 'readOnly' | 'startedAt' | 'practicalId'> & { variant?: BioFoodVariant }) {
  const task: FoodTask = state.task ?? lessonTask(practicalId);
  const v = useMemo(() => variant ?? bioFoodVariant(seed, task), [variant, seed, task]);
  const t0 = useMemo(() => new Date(startedAt).getTime(), [startedAt]);
  const ref = useRef(state);
  ref.current = state;

  const update: FoodUpdate = (fn, log) => {
    if (readOnly) return;
    let next = fn(ref.current);
    if (log) next = { ...next, log: [...next.log, { t: Math.max(0, Date.now() - t0), a: log.slice(0, 80) }].slice(-600) };
    ref.current = next;
    onChange(next);
  };
  // The task the lesson sets, written into the state once.
  useEffect(() => {
    if (!readOnly && !ref.current.task && !variant) update((s) => (s.task ? s : { ...s, task: lessonTask(practicalId) }), 'task:auto');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, practicalId]);

  /** Records a step in the action log only (no marked field changes). */
  const note = (a: string) => update((s) => s, a);
  const chooseTask = (t: FoodTask) => update((s) => ({ ...emptyBioFoodState(), log: s.log, task: t }), `task:${t}`);
  /** Starts a test of `test` on `sample`; returns its index (or -1 at the limit). */
  const doTest = (sample: FoodSample, test: FoodTestId): number => {
    if (ref.current.tests.length >= FOOD_MAX_TESTS) return -1;
    const i = ref.current.tests.length;
    const at = (['P', 'Q', 'R'] as string[]).includes(sample) ? 0 : (ref.current.clock ?? 0);
    update((s) => ({ ...s, tests: [...s.tests, { sample, test, steps: [], heat: 0, direct: false, at }], table: [...s.table, emptyFoodRecord()] }), `test:${test}@${sample}`);
    return i;
  };
  const addStep = (i: number, step: FoodStep) => update((s) => ({ ...s, tests: s.tests.map((t, k) => (k === i && !t.steps.includes(step) ? { ...t, steps: [...t.steps, step] } : t)) }), `step:${step}#${i + 1}`);
  /** Heats a tube for `sec` more seconds: in the boiling water bath, or (`direct`) straight over the flame. */
  const heat = (i: number, sec = HEAT_STEP, direct = false) =>
    update((s) => ({ ...s, tests: s.tests.map((t, k) => (k === i ? { ...t, heat: Math.min(HEAT_MAX, t.heat + sec), direct: t.direct || direct } : t)) }), `${direct ? 'heat-direct' : 'heat'}:${sec}#${i + 1}`);
  const discard = (i: number) => update((s) => ({ ...s, tests: s.tests.filter((_, k) => k !== i), table: s.table.filter((_, k) => k !== i) }), `discard#${i + 1}`);

  // ---- amylase
  const setTile = () => update((s) => ({ ...s, tile: true }), 'tile');
  const addTube = (bath: AmyBath, boiled: boolean) => {
    if (ref.current.clock !== null || ref.current.tubes.length >= AMY_MAX_TUBES) return;
    update((s) => ({ ...s, tubes: [...s.tubes, { bath, boiled }], amy: [...s.amy, emptyAmyRecord()], equilibrated: false }), `tube:${bath}${boiled ? ':boiled' : ''}`);
  };
  const removeTube = (i: number) => {
    if (ref.current.clock !== null) return;
    update((s) => ({ ...s, tubes: s.tubes.filter((_, k) => k !== i), amy: s.amy.filter((_, k) => k !== i), equilibrated: false }), `untube#${i + 1}`);
  };
  const equilibrate = () => ref.current.tubes.length && ref.current.clock === null && update((s) => ({ ...s, equilibrated: true }), 'equilibrate');
  const mix = () => ref.current.tubes.length && ref.current.clock === null && update((s) => ({ ...s, clock: 0 }), 'mix');
  const wait = (sec: number) => ref.current.clock !== null && update((s) => ({ ...s, clock: Math.min(AMY_MAX_CLOCK, (s.clock ?? 0) + sec) }), `wait:${sec}`);
  /** A drop of tube i (or of every tube) on a fresh iodine well at the stopwatch's time. */
  const spot = (i: number | 'all') => {
    const s0 = ref.current;
    if (s0.clock === null || !s0.tile) return;
    const t = s0.clock;
    const which = i === 'all' ? s0.tubes.map((_, k) => k) : [i];
    const fresh = which.filter((k) => !s0.spots.some((x) => x.tube === k && x.t === t));
    if (!fresh.length || s0.spots.length + fresh.length > AMY_MAX_SPOTS) return;
    update((s) => ({ ...s, spots: [...s.spots, ...fresh.map((k) => ({ tube: k, t }))] }), `spot:${i === 'all' ? 'all' : i + 1}@${t}`);
  };
  const resetAmylase = () => update((s) => ({ ...s, tubes: [], amy: [], equilibrated: false, clock: null, spots: [], tests: s.tests.filter((t) => ['P', 'Q', 'R'].includes(t.sample)), table: s.table.filter((_, k) => ['P', 'Q', 'R'].includes(s.tests[k]!.sample)) }), 'amy-reset');

  return { v, task, ref, update, note, chooseTask, doTest, addStep, heat, discard, setTile, addTube, removeTube, equilibrate, mix, wait, spot, resetAmylase };
}
export type FoodTests = ReturnType<typeof useFoodTests>;
