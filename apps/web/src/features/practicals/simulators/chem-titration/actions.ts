import {
  BURETTE_CAPACITY,
  TITRATION_INDICATOR_INFO,
  chemTitrationVariant,
  titrationEndpoint,
  titrationFillLevel,
  type ChemTitrationState,
  type ChemTitrationVariant,
  type TitrationIndicator,
  type TitrationRinse,
  type TitrationRun,
} from '@aischool/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { SimulatorProps } from '../types';

/**
 * The titration bench's actions, shared by the 2D and the 3D lab so both
 * produce exactly the same `ChemTitrationState` (the grader cannot tell them
 * apart). Every change goes through `update`, which appends to the action log.
 */

/** One drop from the burette (cm³). */
export const DROP = 0.05;
/** Stream rate while the tap is held open: cm³ per 100 ms tick. */
export const STREAM_STEP = 0.1;
export const r2 = (x: number) => Math.round(x * 100) / 100;
export const RINSE_LABEL: Record<TitrationRinse, string> = { ACID: 'Acid (A)', BASE: 'Base (B)', WATER: 'Distilled water', NONE: 'Not rinsed' };

/** The flask's colour for a run: indicator colour in the base, at the end point, or with excess acid. */
export function flaskColour(run: TitrationRun | null, v: ChemTitrationVariant, index: number, level: number | null, flash: boolean): string | null {
  if (!run) return null;
  if (!run.indicator) return '#e6eef6';
  const info = TITRATION_INDICATOR_INFO[run.indicator];
  const delivered = run.initial !== null ? (run.final ?? level ?? run.initial) - run.initial : 0;
  const end = titrationEndpoint(v, index, run.indicator);
  if (run.indicator === 'LITMUS') {
    // Litmus changes gradually: no sharp end point.
    const f = Math.max(0, Math.min(1, (delivered - end * 0.85) / (end * 0.25)));
    return f < 0.5 ? info.base : f < 0.85 ? info.end : info.acid;
  }
  if (delivered >= end + 0.3) return info.acid;
  if (delivered >= end - 0.001) return info.end;
  return flash ? info.end : info.base;
}

/** What to do next (practice mode only). */
export function nextHint(s: ChemTitrationState, open: TitrationRun | null): string {
  if (!s.setup.burette) return 'Rinse the burette with the liquid it will hold.';
  if (!s.setup.pipette) return 'Rinse the pipette with the liquid it will measure.';
  if (!s.setup.flask) return 'Rinse the conical flask.';
  if (!s.setup.indicator) return 'Choose an indicator suitable for this acid and base.';
  if (s.burette === null) return 'Fill the burette with A using the filter funnel.';
  if (!open) return s.runs.filter((r) => r.done).length === 0 ? 'Pipette 25.0 cm³ of B into the flask for a rough titration.' : 'Pipette 25.0 cm³ of B into a clean flask for the next titration.';
  if (!open.indicator) return 'Add two or three drops of the indicator to the flask.';
  if (s.funnelIn && open.initial === null) return 'Remove the funnel, then read and record the initial burette reading.';
  if (open.initial === null) return 'Record the initial burette reading, then run in the acid while swirling.';
  return open.kind === 'ROUGH' ? 'Run the acid in fairly quickly, swirling, until the colour changes; then finish and record.' : 'Run in acid to within about 1 cm³ of the rough titre, then add it drop by drop, swirling, until one drop changes the colour.';
}

export type TitrationUpdate = (fn: (s: ChemTitrationState) => ChemTitrationState, log?: string) => void;

export function useTitration({ seed, state, onChange, readOnly, startedAt }: Pick<SimulatorProps<'chem-titration'>, 'seed' | 'state' | 'onChange' | 'readOnly' | 'startedAt'>) {
  const v = useMemo(() => chemTitrationVariant(seed), [seed]);
  const t0 = useMemo(() => new Date(startedAt).getTime(), [startedAt]);
  const ref = useRef(state);
  ref.current = state;
  const [flash, setFlash] = useState(false);
  const openIndex = state.runs.findIndex((r) => !r.done);
  const open = openIndex >= 0 ? state.runs[openIndex]! : null;
  const shownIndex = openIndex >= 0 ? openIndex : state.runs.length - 1;
  const shown = shownIndex >= 0 ? state.runs[shownIndex]! : null;
  const colour = flaskColour(open ?? (readOnly ? shown : null), v, open ? openIndex : shownIndex, state.burette, flash);

  const update: TitrationUpdate = (fn, log) => {
    if (readOnly) return;
    let next = fn(ref.current);
    if (log) next = { ...next, log: [...next.log, { t: Math.max(0, Date.now() - t0), a: log.slice(0, 80) }].slice(-600) };
    ref.current = next;
    onChange(next);
  };
  const setRun = (s: ChemTitrationState, i: number, patch: Partial<TitrationRun>): ChemTitrationState => ({ ...s, runs: s.runs.map((r, k) => (k === i ? { ...r, ...patch } : r)) });

  /** Records a step in the action log only (no marked field changes). */
  const note = (a: string) => update((s) => s, a);
  const rinse = (what: 'burette' | 'pipette' | 'flask', liquid: TitrationRinse) =>
    update((s) => ({ ...s, setup: { ...s.setup, [what]: liquid }, ...(what === 'burette' ? { burette: null } : {}) }), `rinse-${what}:${liquid}`);
  const chooseIndicator = (i: TitrationIndicator) => update((s) => ({ ...s, setup: { ...s.setup, indicator: i } }), `indicator:${i}`);
  const fill = () => update((s) => ({ ...s, burette: titrationFillLevel(seed, s.fills), fills: s.fills + 1, funnelIn: true }), 'fill-burette');
  const removeFunnel = () => update((s) => ({ ...s, funnelIn: false }), 'remove-funnel');
  const pipette = (kind: TitrationRun['kind']) =>
    update((s) => {
      const runs = [...s.runs, { kind, indicator: null, initial: null, final: null, swirls: 0, funnelRemoved: false, done: false } satisfies TitrationRun];
      const table = [...s.table];
      while (table.length < runs.length) table.push({ initial: '', final: '', titre: '' });
      return { ...s, runs, table };
    }, `pipette:${kind}`);
  const addIndicator = () => {
    const s = ref.current;
    const i = s.runs.findIndex((r) => !r.done);
    if (i < 0 || !s.setup.indicator) return;
    update((x) => setRun(x, i, { indicator: x.setup.indicator }), `add-indicator:${s.setup.indicator}`);
  };
  /** Runs acid into the flask; the run's initial reading is the level when the first acid goes in. */
  const deliver = (vol: number, stream: boolean) => {
    const s = ref.current;
    const i = s.runs.findIndex((r) => !r.done);
    if (i < 0 || s.burette === null || s.burette >= BURETTE_CAPACITY || !s.runs[i]!.indicator) {
      stopStream();
      return;
    }
    const run = s.runs[i]!;
    const level = r2(Math.min(BURETTE_CAPACITY, s.burette + vol));
    const initial = run.initial ?? s.burette;
    const first = run.initial === null;
    update((x) => ({ ...setRun(x, i, first ? { initial, funnelRemoved: !x.funnelIn } : {}), burette: level }), first ? 'start-titrating' : undefined);
    if (stream && run.indicator) {
      const end = titrationEndpoint(v, i, run.indicator);
      const d = level - initial;
      setFlash(d > end - 0.8 && d < end);
    }
  };
  const swirl = () => {
    const i = ref.current.runs.findIndex((r) => !r.done);
    if (i < 0) return;
    setFlash(false);
    update((x) => setRun(x, i, { swirls: x.runs[i]!.swirls + 1 }));
  };
  const finish = () => {
    const s = ref.current;
    const i = s.runs.findIndex((r) => !r.done);
    if (i < 0 || s.runs[i]!.initial === null) return;
    setFlash(false);
    update((x) => setRun(x, i, { final: x.burette, done: true }), 'finish-titration');
  };
  const pourAway = () => {
    const i = ref.current.runs.findIndex((r) => !r.done);
    if (i < 0) return;
    setFlash(false);
    update((x) => ({ ...x, runs: x.runs.filter((_, k) => k !== i), table: x.table.filter((_, k) => k !== i) }), 'pour-away');
  };

  // Hold-to-run tap.
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopStream = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  const startStream = () => {
    stopStream();
    deliver(STREAM_STEP, true);
    timer.current = setInterval(() => deliver(STREAM_STEP, true), 100);
  };
  useEffect(() => stopStream, []);

  const doneRuns = state.runs.filter((r) => r.done).length;
  const canDeliver = !!open && !!open.indicator && state.burette !== null && state.burette < BURETTE_CAPACITY;

  return { v, ref, update, flash, open, openIndex, shown, shownIndex, colour, doneRuns, canDeliver, note, rinse, chooseIndicator, fill, removeFunnel, pipette, addIndicator, deliver, swirl, finish, pourAway, startStream, stopStream };
}
export type Titration = ReturnType<typeof useTitration>;
