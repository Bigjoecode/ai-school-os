import {
  ETH_FULL,
  OXY_CLOCK_MAX,
  OXY_MAX_COUNTS,
  PLANT_PRACTICAL_TASKS,
  POTO_CLOCK_MAX,
  POTO_MAX_RUNS,
  STARCH_MAX_HOURS,
  bioPlantVariant,
  emptyBioPlantState,
  emptyOxyRow,
  emptyStarchRow,
  oxyLampAt,
  potoCondAt,
  potoRunMinutes,
  roundDp,
  type BioPlantState,
  type BioPlantVariant,
  type LeafKind,
  type PlantTask,
  type PotoCond,
  type StarchPlant,
} from '@aischool/shared';
import { useEffect, useMemo, useRef } from 'react';
import type { SimulatorProps } from '../types';

/**
 * The plant bench's actions, shared by the 2D and the 3D lab so both produce
 * exactly the same `BioPlantState`. Every change goes through `update`, which
 * appends to the action log.
 */

export type PlantUpdate = (fn: (s: BioPlantState) => BioPlantState, log?: string) => void;
export const lessonTask = (practicalId?: string): PlantTask => (practicalId ? PLANT_PRACTICAL_TASKS[practicalId] : undefined) ?? 'POTOMETER';

/** What to do next (practice mode only). */
export function nextHint(_v: BioPlantVariant, s: BioPlantState): string {
  const task = s.task ?? 'POTOMETER';
  if (task === 'POTOMETER') {
    const w = s.poto;
    if (!w.cut) return 'Cut a leafy shoot with a slanting cut — under water in the bowl, so no air enters the xylem.';
    if (!w.fit) return 'Fit the shoot into the potometer’s rubber tubing, still under water.';
    if (!w.sealed) return 'Smear Vaseline round the joint so it is airtight.';
    if (!w.bubble) return 'Lift the potometer out, dry the leaves and let one air bubble into the capillary.';
    const used = new Set(w.runs.map((r) => r.cond));
    const cur = potoCondAt(w, w.clock);
    const mine = w.runs.filter((r) => r.cond === cur).length;
    if (mine < 3) return w.clock - (w.conds.at(-1)?.at ?? 0) < 5 ? 'Let the shoot adjust for 5 minutes in this condition before timing.' : 'Reset the bubble to the zero mark with the reservoir tap, then time it over 30 mm.';
    if (used.size < 3) return 'Change the condition (fan, lamp, dark or a polythene bag), let it adjust 5 minutes, and time the bubble three times again.';
    if (!w.rows.some((r) => r.rate)) return 'Work out the mean time, the rate (mm/min) and the volume for each condition.';
    return 'Plot the bar chart of the rates, name the fastest condition and write your conclusions.';
  }
  if (task === 'OXYGEN') {
    const w = s.oxy;
    if (!w.nahco3 && !w.plant) return 'Add a pinch of sodium hydrogencarbonate to the water: it supplies carbon dioxide.';
    if (!w.plant) return 'Put the freshly cut pondweed under the funnel, cut end up.';
    if (w.tubeAt === null) return 'Put a test tube full of water over the funnel stem to collect the gas.';
    if (!w.shield) return 'Put the water trough between the lamp and the beaker as a heat filter.';
    if (!w.dark) return 'Darken the room so only the lamp lights the plant.';
    if (!w.moves.length) return 'Switch on the lamp 10 cm from the beaker and let the plant adjust for 5 minutes.';
    if (w.rows.length < 5) return 'Count the bubbles for a minute three times, then move the lamp further away and wait 5 minutes again.';
    if (w.splintAt === null) return 'When enough gas has collected, test it with a glowing splint.';
    return 'Work out the means and light intensities, plot the graph and write your conclusions.';
  }
  const w = s.starch;
  if (!w.plant) return 'Choose the destarched plant (48 hours in the dark).';
  if (!w.foil || !w.koh) return 'Before the light: fix a strip of foil across one leaf, and seal another leaf in a flask with potassium hydroxide.';
  if (w.hours < 4) return 'Put the plant in bright light for at least 4 hours (time-lapse).';
  if (w.leaves.length < 3) return 'Pick the leaves to test: the foil-strip leaf, a variegated leaf, the leaf from the flask and a green control.';
  const l = w.leaves.findIndex((x) => !x.iodine);
  if (l >= 0) {
    const x = w.leaves[l]!;
    if (x.boiled <= 0) return `Boil leaf ${l + 1} in water for a minute (Bunsen on).`;
    if (x.eth < ETH_FULL) return w.flame ? 'Turn the flame OFF before the ethanol goes anywhere near the water bath.' : `Put leaf ${l + 1} in a tube of ethanol standing in the hot water bath until it is white.`;
    if (!x.soft) return `Dip leaf ${l + 1} in warm water to soften it.`;
    if (!x.tile) return `Spread leaf ${l + 1} on the white tile.`;
    return `Cover leaf ${l + 1} with iodine solution.`;
  }
  if (w.grid.leaf === null) return 'Lay the foil-strip leaf on the 1 cm² grid and count the squares.';
  return 'Record the observation and inference for each leaf, label the drawing and write your answers.';
}

/** `variant`: use these values instead of the seed's (the 3D lab's demo and sandbox). */
export function usePlant({ seed, state, onChange, readOnly, startedAt, practicalId, variant }: Pick<SimulatorProps<'bio-plant'>, 'seed' | 'state' | 'onChange' | 'readOnly' | 'startedAt' | 'practicalId'> & { variant?: BioPlantVariant }) {
  const task: PlantTask = state.task ?? lessonTask(practicalId);
  const v = useMemo(() => variant ?? bioPlantVariant(seed, task), [variant, seed, task]);
  const t0 = useMemo(() => new Date(startedAt).getTime(), [startedAt]);
  const ref = useRef(state);
  ref.current = state;

  const update: PlantUpdate = (fn, log) => {
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
  const chooseTask = (t: PlantTask) => update((s) => ({ ...emptyBioPlantState(), log: s.log, task: t }), `task:${t}`);
  const P = () => ref.current.poto;
  const O = () => ref.current.oxy;
  const S = () => ref.current.starch;
  const pw = (fn: (w: BioPlantState['poto']) => BioPlantState['poto'], log: string) => update((s) => ({ ...s, poto: fn(s.poto) }), log);
  const ow = (fn: (w: BioPlantState['oxy']) => BioPlantState['oxy'], log: string) => update((s) => ({ ...s, oxy: fn(s.oxy) }), log);
  const sw = (fn: (w: BioPlantState['starch']) => BioPlantState['starch'], log: string) => update((s) => ({ ...s, starch: fn(s.starch) }), log);

  // ---------------------------------------------------------------- potometer
  const poto = {
    cut: (where: 'WATER' | 'AIR') => !P().cut && pw((w) => ({ ...w, cut: where }), `cut:${where}`),
    fit: (where: 'WATER' | 'AIR') => !!P().cut && !P().fit && pw((w) => ({ ...w, fit: where }), `fit:${where}`),
    seal: () => !!P().fit && !P().sealed && pw((w) => ({ ...w, sealed: true }), 'seal'),
    bubble: () => !!P().fit && !P().bubble && pw((w) => ({ ...w, bubble: true, zeroAt: w.clock, conds: w.conds.length ? w.conds : [{ cond: 'STILL', at: w.clock }] }), 'bubble'),
    setCond: (c: PotoCond) => {
      const w = P();
      if (!w.bubble || potoCondAt(w, w.clock) === c || w.conds.length >= 40) return;
      pw((x) => ({ ...x, conds: [...x.conds.filter((k) => k.at < x.clock - 1e-9 || k === x.conds[0]), { cond: c, at: x.clock }] }), `cond:${c}`);
    },
    wait: (min: number) => {
      const w = P();
      if (!w.bubble || w.clock >= POTO_CLOCK_MAX) return;
      pw((x) => ({ ...x, clock: roundDp(Math.min(POTO_CLOCK_MAX, x.clock + min), 2) }), `wait:${min}`);
    },
    /** Opens the reservoir tap: the bubble goes back to the zero mark. */
    reset: () => {
      const w = P();
      if (!w.bubble || w.zeroAt === w.clock) return;
      pw((x) => ({ ...x, zeroAt: x.clock }), 'reset');
    },
    /** Times the bubble from the zero mark over 30 mm (time-lapse); returns the run index or −1. */
    time: (): number => {
      const w = P();
      if (!w.bubble || w.zeroAt !== w.clock || w.runs.length >= POTO_MAX_RUNS || w.clock >= POTO_CLOCK_MAX) return -1;
      const run = { cond: potoCondAt(w, w.clock), at: w.clock, n: w.runs.length };
      const dt = Math.ceil(potoRunMinutes(v.poto, w, w.clock) * 10) / 10;
      pw((x) => ({ ...x, runs: [...x.runs, run], clock: roundDp(Math.min(POTO_CLOCK_MAX, x.clock + dt), 2) }), `time#${run.n + 1}`);
      return run.n;
    },
  };

  // ---------------------------------------------------------------- oxygen
  const oxy = {
    nahco3: () => {
      const w = O();
      if (!w.plant && !w.nahco3) ow((x) => ({ ...x, nahco3: true }), 'nahco3');
      else if (w.plant && w.co2At === null) ow((x) => ({ ...x, co2At: x.clock, nahco3: x.nahco3 }), 'nahco3:more');
    },
    plant: () => !O().plant && ow((x) => ({ ...x, plant: true }), 'plant'),
    tube: () => O().plant && O().tubeAt === null && ow((x) => ({ ...x, tubeAt: x.clock }), 'tube'),
    shield: (on: boolean) => O().shield !== on && ow((x) => ({ ...x, shield: on }), `shield:${on ? 'on' : 'off'}`),
    dark: (on: boolean) => O().dark !== on && ow((x) => ({ ...x, dark: on }), `dark:${on ? 'on' : 'off'}`),
    lamp: (d: number | null) => {
      const w = O();
      if (!w.plant || oxyLampAt(w, w.clock) === d || w.moves.length >= 60) return;
      ow((x) => ({ ...x, moves: [...x.moves.filter((m) => m.at < x.clock - 1e-9), { d, at: x.clock }], rows: d !== null && !x.rows.some((r) => r.d === d) ? [...x.rows, emptyOxyRow(d)] : x.rows }), d === null ? 'lamp:off' : `lamp:${d}`);
    },
    wait: (min: number) => {
      const w = O();
      if (!w.plant || w.clock >= OXY_CLOCK_MAX) return;
      ow((x) => ({ ...x, clock: roundDp(Math.min(OXY_CLOCK_MAX, x.clock + min), 2) }), `wait:${min}`);
    },
    /** Counts the bubbles for one minute (time-lapse); returns the count's index or −1. */
    count: (): number => {
      const w = O();
      if (!w.plant || oxyLampAt(w, w.clock) === null || w.counts.length >= OXY_MAX_COUNTS || w.clock + 1 > OXY_CLOCK_MAX) return -1;
      ow((x) => ({ ...x, counts: [...x.counts, { at: x.clock }], clock: roundDp(x.clock + 1, 2) }), `count#${w.counts.length + 1}`);
      return w.counts.length;
    },
    temp: () => O().temps.length < 60 && ow((x) => ({ ...x, temps: [...x.temps, x.clock] }), 'temp'),
    splint: () => O().tubeAt !== null && O().splintAt === null && ow((x) => ({ ...x, splintAt: x.clock }), 'splint'),
  };

  // ---------------------------------------------------------------- starch
  const leaf = (i: number, patch: (l: BioPlantState['starch']['leaves'][number], w: BioPlantState['starch']) => Partial<BioPlantState['starch']['leaves'][number]>, log: string) => {
    if (!S().leaves[i]) return;
    sw((w) => ({ ...w, leaves: w.leaves.map((l, k) => (k === i ? { ...l, ...patch(l, w) } : l)) }), log);
  };
  const starch = {
    plant: (p: StarchPlant) => !S().plant && sw((w) => ({ ...w, plant: p }), `plant:${p}`),
    foil: () => !!S().plant && !S().foil && S().hours === 0 && sw((w) => ({ ...w, foil: true }), 'foil'),
    koh: () => !!S().plant && !S().koh && S().hours === 0 && sw((w) => ({ ...w, koh: true }), 'koh'),
    light: (h: number) => {
      const w = S();
      if (!w.plant || w.hours >= STARCH_MAX_HOURS) return;
      sw((x) => ({ ...x, hours: Math.min(STARCH_MAX_HOURS, x.hours + h) }), `light:${h}`);
    },
    /** Picks a leaf of a kind (−1 if not possible). */
    pick: (kind: LeafKind): number => {
      const w = S();
      if (!w.plant || w.leaves.length >= 8 || w.leaves.some((l) => l.kind === kind) || (kind === 'FOIL' && !w.foil) || (kind === 'NOCO2' && !w.koh)) return -1;
      sw((x) => ({ ...x, leaves: [...x.leaves, { kind, at: x.hours, boiled: 0, boiledFirst: false, eth: 0, ethFlame: false, direct: false, soft: false, tile: false, iodine: false }], rows: [...x.rows, emptyStarchRow()] }), `pick:${kind}`);
      return w.leaves.length;
    },
    draw: () => !S().drawn && sw((w) => ({ ...w, drawn: true }), 'draw'),
    flame: (on: boolean) => S().flame !== on && sw((w) => ({ ...w, flame: on, hot: w.hot || on }), `flame:${on ? 'on' : 'off'}`),
    boil: (i: number) => {
      const w = S();
      if (!w.flame || !w.hot) return;
      leaf(i, (l) => ({ boiled: Math.min(600, l.boiled + 60), boiledFirst: l.boiledFirst || (l.boiled === 0 && l.eth === 0) }), `boil#${i + 1}`);
    },
    /** Ethanol in a boiling tube standing in the hot water bath (`direct`: heated over the flame instead). */
    ethanol: (i: number, direct = false) => {
      const w = S();
      if (!w.hot || (direct && !w.flame)) return;
      leaf(i, (l, x) => ({ eth: Math.min(30, l.eth + ETH_FULL), ethFlame: l.ethFlame || (!direct && x.flame), direct: l.direct || direct }), `${direct ? 'eth-direct' : 'ethanol'}#${i + 1}`);
    },
    soften: (i: number) => leaf(i, () => ({ soft: true }), `soften#${i + 1}`),
    tile: (i: number) => leaf(i, () => ({ tile: true }), `tile#${i + 1}`),
    iodine: (i: number) => S().leaves[i]?.tile && leaf(i, () => ({ iodine: true }), `iodine#${i + 1}`),
    grid: (i: number) => S().leaves[i]?.iodine && S().grid.leaf !== i && sw((w) => ({ ...w, grid: { ...w.grid, leaf: i } }), `grid#${i + 1}`),
  };

  return { v, task, ref, update, note, chooseTask, poto, oxy, starch };
}
export type Plant = ReturnType<typeof usePlant>;
