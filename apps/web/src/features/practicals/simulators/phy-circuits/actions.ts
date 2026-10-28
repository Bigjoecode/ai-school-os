import {
  CIRCUITS_BOARD,
  CIRCUITS_MAX_ROWS,
  RBOX_MAX,
  circuitsMeters,
  circuitsWireKey,
  phyCircuitsVariant,
  type CircuitsMeters,
  type CircuitsSettings,
  type CircuitsTask,
  type CircuitsTerminal,
  type PhyCircuitsState,
  type PhyCircuitsVariant,
} from '@aischool/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLabUpdate } from '../phy-common';

/**
 * The current-electricity lab's state transitions, shared by the 2D and the
 * 3D lab so both produce exactly the same state and action log: choose the
 * task, join and remove wires, open and close the key, set the rheostat (e.m.f.),
 * the resistance box, which gap X is in and the jockey (metre bridge), tap or
 * press the jockey, and take a reading. A tap of the jockey is live only (the
 * galvanometer kicks for a moment); sliding the jockey while it is pressed is
 * counted as a scrape, and closing the key (or changing the circuit) with the
 * ammeter past full scale as an overload.
 */

export const LESSON_TASKS: Record<string, CircuitsTask> = {
  'pr-phy-metre-bridge': 'BRIDGE',
  'pr-phy-emf-internal-resistance': 'EMF',
  'pr-phy-series-parallel-resistors': 'SERIES',
};
export const lessonTask = (practicalId?: string): CircuitsTask => (practicalId && LESSON_TASKS[practicalId]) || 'BRIDGE';
export const TASK_NAME: Record<CircuitsTask, string> = { BRIDGE: 'Unknown resistance with a metre bridge', EMF: 'E.m.f. and internal resistance of a cell', SERIES: 'Resistors in series and in parallel' };
export const MAX_WIRES = 24;
export const MAX_READINGS = CIRCUITS_MAX_ROWS;
/** How long a tap of the jockey shows on the galvanometer (ms). */
export const TAP_MS = 1300;

export const settingsOf = (s: PhyCircuitsState, pressed = s.pressed): CircuitsSettings => ({ task: s.task ?? 'BRIDGE', wires: s.wires, key: s.key, rheostat: s.rheostat, jockey: s.jockey, pressed, rbox: s.rbox, swap: s.swap, heat: s.heat });
/** The live meters: with the key open the e.m.f. lab's voltmeter shows the open-circuit reading the grader marks. */
export const liveMeters = (v: PhyCircuitsVariant, s: PhyCircuitsState, pressed: boolean): CircuitsMeters => circuitsMeters(v, settingsOf(s, pressed), s.key ? s.readings.length : 'open');
const overloaded = (v: PhyCircuitsVariant, s: PhyCircuitsState) => s.task !== 'BRIDGE' && !!s.task && s.key && circuitsMeters(v, settingsOf(s), s.readings.length).overI;

export function circuitsHint(s: PhyCircuitsState, m: CircuitsMeters): string {
  if (!s.task) return 'Choose the experiment first.';
  const t = s.task;
  if (s.wires.length < 5)
    return t === 'BRIDGE'
      ? 'Wire the bridge: cell + to the key, the key to end A of the wire, end C back to the cell −; the galvanometer from the centre strip D to the jockey.'
      : t === 'EMF'
        ? 'Wire the circuit: cell, key, ammeter and rheostat (one end and the slider) in series; the voltmeter straight across the cell terminals.'
        : 'Wire the circuit: cell, key, ammeter and the resistor(s) in series; the voltmeter across the resistor arrangement only.';
  if (t === 'BRIDGE') {
    if (s.rbox === 0) return 'Pull a plug out of the resistance box to choose R (e.g. about the size of X, so the balance is near the middle).';
    if (!s.key) return s.readings.length ? 'Close the key, find the balance point for the next R and record it.' : 'Close the key, then tap the jockey along the wire.';
    if (Math.abs(m.galvo) > 0.6) return `The galvanometer deflects ${m.galvo > 0 ? 'right' : 'left'} when you tap: move the jockey and tap again until it shows no deflection.`;
    return 'Record the balance length l (from the left end), then open the key. Change R (and later interchange X and R).';
  }
  if (!s.key) return t === 'EMF' && !s.answers.e0.value.trim() ? 'With the key open, read the voltmeter: that is the e.m.f. (almost). Write it in your notebook, then close the key.' : 'Close the key, read both meters and take the reading.';
  if (m.overI) return 'The ammeter is hard against its end stop: too much current. Open the key and add resistance.';
  if (m.I < 0.005) return 'No current: check that the circuit is a complete loop and the ammeter is in series.';
  return s.readings.length < (t === 'EMF' ? 4 : 4) ? `Read both meters, take the reading, then open the key. ${t === 'EMF' ? 'Change the rheostat for the next current.' : 'Rewire for the next arrangement.'}` : 'Fill in the table, then work out the answers.';
}

export function useCircuits({
  seed,
  state,
  onChange,
  readOnly,
  startedAt,
  practicalId,
  variant,
  autoTask = true,
}: {
  seed: number;
  state: PhyCircuitsState;
  onChange: (next: PhyCircuitsState) => void;
  readOnly: boolean;
  startedAt: string;
  practicalId?: string;
  /** A custom variant (the sandbox). */
  variant?: PhyCircuitsVariant;
  /** Pre-select the experiment from the lesson on opening (the attempt; not the demo or sandbox). */
  autoTask?: boolean;
}) {
  const seeded = useMemo(() => phyCircuitsVariant(seed), [seed]);
  const v = variant ?? seeded;
  const { update, ref } = useLabUpdate(state, onChange, readOnly, startedAt);
  useEffect(() => {
    if (autoTask && !readOnly && !state.task && !state.readings.length) update((s) => (s.task ? s : { ...s, task: lessonTask(practicalId) }), 'task:auto');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, practicalId]);
  const task: CircuitsTask = state.task ?? lessonTask(practicalId);
  const board = CIRCUITS_BOARD[task];
  // A tap of the jockey: the galvanometer shows the current for a moment (not saved).
  const [tapping, setTapping] = useState(false);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (tapTimer.current && clearTimeout(tapTimer.current)), []);
  const touching = state.pressed || tapping;
  const meters = liveMeters(v, state, touching);

  /** A change to the board: counts an overload when it drives the ammeter past full scale with the key closed. */
  const change = (fn: (s: PhyCircuitsState) => PhyCircuitsState, log?: string) => {
    const before = ref.current;
    const wasOver = overloaded(v, before);
    update((s) => {
      const next = fn(s);
      return !wasOver && overloaded(v, next) ? { ...next, overloads: next.overloads + 1 } : next;
    }, log);
    if (!wasOver && overloaded(v, ref.current)) update((s) => s, 'overload');
  };

  const chooseTask = (t: CircuitsTask) => update((s) => ({ ...s, task: t, wires: [], key: false, heat: 0, pressed: false, line: null }), `task:${t}`);
  const connect = (a: CircuitsTerminal, b: CircuitsTerminal) => {
    if (a === b) return;
    const key = circuitsWireKey(a, b);
    change((s) => (s.wires.includes(key) || s.wires.length >= MAX_WIRES ? s : { ...s, wires: [...s.wires, key] }), `wire:${key}`);
  };
  const removeWire = (w: string) => change((s) => ({ ...s, wires: s.wires.filter((x) => x !== w) }), `unwire:${w}`);
  const toggleKey = () => {
    const on = ref.current.key;
    change((s) => ({ ...s, key: !s.key, heat: 0 }), on ? 'open-key' : 'close-key');
  };
  const setRheostat = (x: number) => change((s) => ({ ...s, rheostat: Math.max(0, Math.min(1, Math.round(x * 200) / 200)) }));
  const setJockey = (x: number) => {
    const s0 = ref.current;
    const next = Math.max(0, Math.min(100, Math.round(x * 10) / 10));
    if (next === s0.jockey) return;
    if (s0.pressed) update((s) => ({ ...s, jockey: next, scrapes: s.scrapes + 1 }), `scrape:${next.toFixed(1)}`);
    else update((s) => ({ ...s, jockey: next }));
  };
  const tap = () => {
    const s0 = ref.current;
    if (s0.pressed) return;
    update((s) => s, `tap:${s0.jockey.toFixed(1)}`);
    setTapping(true);
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => setTapping(false), TAP_MS);
  };
  const press = (down: boolean) => update((s) => (s.pressed === down ? s : { ...s, pressed: down }), down ? 'press-jockey' : 'lift-jockey');
  const setRbox = (x: number) => update((s) => ({ ...s, rbox: Math.max(0, Math.min(RBOX_MAX, Math.round(x))) }), `rbox:${Math.max(0, Math.min(RBOX_MAX, Math.round(x)))}`);
  const toggleSwap = () => update((s) => ({ ...s, swap: !s.swap }), ref.current.swap ? 'swap:back' : 'swap:interchange');
  const takeReading = () => {
    const s0 = ref.current;
    if (!s0.key || s0.readings.length >= MAX_READINGS || !s0.task) return;
    const t = s0.task;
    update(
      (s) => ({
        ...s,
        readings: [...s.readings, { wires: s.wires, rheostat: s.rheostat, jockey: s.jockey, rbox: s.rbox, swap: s.swap, heat: s.heat }],
        bridge: t === 'BRIDGE' ? [...s.bridge, { R: String(s.rbox), l: '', m: '', q: '', X: '' }] : s.bridge,
        emf: t === 'EMF' ? [...s.emf, { I: '', V: '' }] : s.emf,
        series: t === 'SERIES' ? [...s.series, { arr: '', V: '', I: '', R: '' }] : s.series,
        heat: s.heat + 1,
      }),
      t === 'BRIDGE' ? `reading:${s0.rbox}:${s0.swap ? 'swap' : 'normal'}:${s0.jockey.toFixed(1)}` : `reading:${s0.rheostat.toFixed(3)}`,
    );
  };
  const removeReading = (i: number) =>
    update((s) => ({ ...s, readings: s.readings.filter((_, k) => k !== i), bridge: s.bridge.filter((_, k) => k !== i), emf: s.emf.filter((_, k) => k !== i), series: s.series.filter((_, k) => k !== i) }), `remove-reading:${i}`);
  /** A step with no field in the state (collecting apparatus…): written to the action log only. */
  const note = (a: string) => update((s) => s, a);
  return { v, update, ref, task, board, meters, touching, tapping, chooseTask, connect, removeWire, toggleKey, setRheostat, setJockey, tap, press, setRbox, toggleSwap, takeReading, removeReading, note };
}
export type Circuits = ReturnType<typeof useCircuits>;
