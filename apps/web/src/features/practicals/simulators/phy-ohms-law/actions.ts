import { OHMS_BOARD, ohmsMeters, ohmsWireKey, phyOhmsVariant, type OhmsSettings, type OhmsTask, type OhmsTerminal, type PhyOhmsState, type PhyOhmsVariant } from '@aischool/shared';
import { useEffect, useMemo } from 'react';
import { useLabUpdate } from '../phy-common';

/**
 * The Ohm's law lab's state transitions, shared by the 2D and the 3D lab so
 * both produce exactly the same state and action log.
 */

/** Lessons that open this lab on the resistance-wire task (every other lesson starts on Ohm's law). */
export const WIRE_LESSONS = ['pr-phy-resistivity-of-wire'];
export const lessonTask = (practicalId?: string): OhmsTask => (practicalId && WIRE_LESSONS.includes(practicalId) ? 'WIRE' : 'OHM');
export const MAX_WIRES = 24;
export const MAX_READINGS = 14;

export function ohmsHint(s: PhyOhmsState, on: boolean, I: number): string {
  if (!s.task) return 'Choose the experiment first.';
  if (s.wires.length < 6) return `Wire the circuit: tap one terminal, then another, to join them. Battery, key, rheostat, ammeter and the ${s.task === 'WIRE' ? 'wire (0 end to the jockey)' : 'resistor'} in series; the voltmeter across the ${s.task === 'WIRE' ? 'length of wire' : 'resistor'}.`;
  if (!on) return s.readings.length ? 'Close the key, adjust and take the next reading.' : 'Close the key to switch on.';
  if (I < 0.005) return 'No current: check that the circuit is a complete loop and the ammeter is in series (not across something).';
  return s.readings.length < 5 ? `Read both meters, take the reading, then open the key. Change the ${s.task === 'WIRE' ? 'length L' : 'rheostat'} for the next one.` : 'Fill in the table, plot your graph and work out the answers.';
}

export const settingsOf = (s: PhyOhmsState): OhmsSettings => ({ task: s.task ?? 'OHM', wires: s.wires, key: s.key, rheostat: s.rheostat, jockey: s.jockey, heat: s.heat });

export function useOhms({
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
  state: PhyOhmsState;
  onChange: (next: PhyOhmsState) => void;
  readOnly: boolean;
  startedAt: string;
  practicalId?: string;
  /** A custom variant (the sandbox). */
  variant?: PhyOhmsVariant;
  /** Pre-select the experiment from the lesson on opening (the attempt; not the demo or sandbox). */
  autoTask?: boolean;
}) {
  const seeded = useMemo(() => phyOhmsVariant(seed), [seed]);
  const v = variant ?? seeded;
  const { update, ref } = useLabUpdate(state, onChange, readOnly, startedAt);
  // Pre-select the experiment from the lesson that opened the lab (the student can still change it before the first reading).
  useEffect(() => {
    if (autoTask && !readOnly && !state.task && !state.readings.length) update((s) => (s.task ? s : { ...s, task: lessonTask(practicalId) }), 'task:auto');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, practicalId]);
  const task: OhmsTask = state.task ?? 'OHM';
  const board = OHMS_BOARD[task];
  const meters = ohmsMeters(v, settingsOf(state), state.readings.length);

  const chooseTask = (t: OhmsTask) => update((s) => ({ ...s, task: t, wires: [], key: false, heat: 0, line: null }), `task:${t}`);
  const connect = (a: OhmsTerminal, b: OhmsTerminal) => {
    if (a === b) return;
    const key = ohmsWireKey(a, b);
    update((s) => (s.wires.includes(key) || s.wires.length >= MAX_WIRES ? s : { ...s, wires: [...s.wires, key] }), `wire:${key}`);
  };
  const removeWire = (w: string) => update((s) => ({ ...s, wires: s.wires.filter((x) => x !== w) }), `unwire:${w}`);
  const toggleKey = () => {
    const on = ref.current.key;
    update((s) => ({ ...s, key: !s.key, heat: 0 }), on ? 'open-key' : 'close-key');
  };
  const setRheostat = (x: number) => update((s) => ({ ...s, rheostat: Math.max(0, Math.min(1, Math.round(x * 100) / 100)) }));
  const setJockey = (x: number) => update((s) => ({ ...s, jockey: Math.max(5, Math.min(100, Math.round(x * 2) / 2)) }));
  const takeReading = () => {
    const s0 = ref.current;
    if (!s0.key || s0.readings.length >= MAX_READINGS) return;
    update(
      (s) => ({ ...s, readings: [...s.readings, { wires: s.wires, rheostat: s.rheostat, jockey: s.jockey, heat: s.heat }].slice(0, MAX_READINGS), table: [...s.table, { L: '', I: '', V: '', R: '' }].slice(0, MAX_READINGS), heat: s.heat + 1 }),
      `reading:${s0.rheostat.toFixed(2)}:${s0.jockey}`,
    );
  };
  const removeReading = (i: number) => update((s) => ({ ...s, readings: s.readings.filter((_, k) => k !== i), table: s.table.filter((_, k) => k !== i) }), `remove-reading:${i}`);
  /** A step with no field in the state (collecting apparatus…): written to the action log only. */
  const note = (a: string) => update((s) => s, a);
  return { v, update, ref, task, board, meters, chooseTask, connect, removeWire, toggleKey, setRheostat, setJockey, takeReading, removeReading, note };
}
export type Ohms = ReturnType<typeof useOhms>;
