import {
  THERM_HEAT_TIME,
  THERM_INTERVAL,
  THERM_MAX_EVENTS,
  THERM_MAX_READS,
  THERM_MAX_ROWS,
  phyThermalVariant,
  thermIndicates,
  thermLastTime,
  thermSim,
  thermWatch,
  type PhyThermalState,
  type PhyThermalVariant,
  type ThermEvent,
  type ThermEventCode,
  type ThermInstrument,
  type ThermPhys,
  type ThermSim,
  type ThermTask,
} from '@aischool/shared';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useLabUpdate } from '../phy-common';
import { makeClock, type Clock } from '../phy-heat/actions';

export { clockText, makeClock, useLive, type Clock } from '../phy-heat/actions';

/**
 * The thermal bench's state transitions, shared by the 2D and the 3D lab (and
 * the demo and the sandbox) so every view produces the same state and log.
 * Every physical step (light the burner under the steam can or the bath,
 * screw the micrometer up by its ratchet or back it off, immerse the tube,
 * stir, pour the water, lag and cover the calorimeter, wire the meters,
 * switch the heater, the stopwatch) is an event at the lab clock's time; the
 * shared `thermSim` turns the events into temperatures, lengths and currents.
 * Readings are recorded with their time and the student writes the values.
 * The lab clock can run in time-lapse (it eases to real time near each 60 s
 * reading and the switch-off of the electrical heating) and resumes where the
 * record ends after a reload.
 */

export const LESSON_TASKS: Record<string, ThermTask> = {
  'pr-phy-linear-expansivity': 'EXPANSION',
  'pr-phy-charles-law': 'CHARLES',
  'pr-phy-electrical-heating': 'ELECTRIC',
};
export const lessonTask = (practicalId?: string): ThermTask => (practicalId && LESSON_TASKS[practicalId]) || 'EXPANSION';
export const TASK_NAME: Record<ThermTask, string> = { EXPANSION: 'Linear expansivity of a metal rod', CHARLES: 'Charles’s law with a capillary tube', ELECTRIC: 'Specific heat capacity of water by electrical heating' };
export const SPEEDS = [1, 5, 10, 20] as const;
const r2 = (x: number) => Math.round(x * 100) / 100;

/** What the events leave in place (for the buttons and the scene). */
export function thermFlags(events: readonly ThermEvent[]) {
  const last = (pre: string) => [...events].reverse().find((x) => x.e.startsWith(pre))?.e ?? null;
  const lastOf = (...codes: ThermEventCode[]) => [...events].reverse().find((x) => codes.includes(x.e))?.e ?? null;
  return {
    boiler: last('boiler:') === 'boiler:on',
    /** The micrometer is touching the rod (screwed up since it was last backed off). */
    touching: ((m) => m === 'micro:ratchet' || m === 'micro:thimble')(last('micro:')),
    bunsen: last('bunsen:') === 'bunsen:on',
    immersed: ((e) => (e === 'immerse:full' ? 'full' : e === 'immerse:part' ? 'part' : 'none'))(last('immerse:')) as 'none' | 'full' | 'part',
    iced: events.some((x) => x.e === 'ice'),
    poured: events.some((x) => x.e === 'pour'),
    pan: last('pan:') === 'pan:on',
    lagged: last('lag:') === 'lag:on',
    lid: last('lid:') === 'lid:on',
    heaterIn: last('heater:') === 'heater:in',
    wire: ((e) => (e === 'wire:ok' ? 'ok' : e === 'wire:wide' ? 'wide' : 'none'))(last('wire:')) as 'none' | 'ok' | 'wide',
    on: last('switch:') === 'switch:on',
    stirring: lastOf('stir:on', 'stir:off') === 'stir:on',
    watch: ((w) => (w === 'watch:start' ? 'running' : w === 'watch:stop' ? 'stopped' : 'idle'))(lastOf('watch:start', 'watch:stop')) as 'idle' | 'running' | 'stopped',
    switchedOn: events.some((x) => x.e === 'switch:on'),
    switchedOff: events.some((x) => x.e === 'switch:off'),
  };
}
export type ThermFlags = ReturnType<typeof thermFlags>;

const has = (s: PhyThermalState, k: ThermInstrument, pred: (t: number) => boolean = () => true) => s.reads.some((r) => r.k === k && pred(r.t));

/** The next thing to do (practice without the guide). */
export function thermHint(s: PhyThermalState, f: ThermFlags, p: ThermPhys, v: PhyThermalVariant): string {
  if (!s.task) return 'Choose the experiment first.';
  if (s.task === 'EXPANSION') {
    const boilAt = s.events.find((e) => e.e === 'boiler:on')?.t ?? Infinity;
    if (!has(s, 'rule')) return 'Measure the length of the rod l₀ with the metre rule (to the nearest mm).';
    if (!has(s, 'thermo', (t) => t < boilAt)) return 'Read the thermometer in the jacket: the rod is at room temperature, θ₁.';
    if (!has(s, 'micro', (t) => t < boilAt)) return f.touching ? 'Read the micrometer (sleeve + thimble) and write down r₁.' : 'Turn the micrometer’s ratchet until it just touches the rod (it clicks), then read it: r₁.';
    if (!f.boiler) return f.touching ? 'Back the micrometer off a few turns, so the rod is free to expand — then light the burner under the steam can.' : 'Light the burner under the steam can.';
    if (p.can < v.boil - 0.05) return 'Wait for the water in the can to boil (use the time-lapse). Keep the steam outlet pointing into the beaker.';
    if (p.thJ < v.boil - 0.3) return 'Steam is passing: wait until the thermometer is steady.';
    if (!has(s, 'micro', (t) => t > boilAt)) return 'Read θ₂. Then screw the micrometer up with the ratchet and read it (r₂).';
    return 'The rod lags behind the steam: back off, wait a minute, ratchet up again and read until two readings agree. Then fill in the table and work out α.';
  }
  if (s.task === 'CHARLES') {
    if (f.immersed === 'none') return 'Lower the ruler with the capillary tube and thermometer into the water, the whole air column under the water.';
    const rows = s.rows.length;
    if (f.bunsen) return 'Heat until the water is about 15 °C warmer than your last reading, then remove the flame, stir well and wait for the temperature to steady.';
    if (!rows) return 'Stir, wait a moment, then read the thermometer (θ) and the length of the air column (l).';
    if (rows < 5) return `Light the burner and heat about 15 °C more, then remove the flame, stir, wait and read θ and l again (${rows} of at least 5 readings).`;
    return 'Fill in T = θ + 273 and l/T, plot l against θ, extend the line back to l = 0 and read absolute zero.';
  }
  if (!has(s, 'balance', () => true)) return f.pan ? 'Read the balance: the empty calorimeter and stirrer, m_c.' : 'Put the empty calorimeter on the balance and weigh it.';
  if (!f.poured) return 'Pour about 200 g of water into the calorimeter.';
  if (s.reads.filter((r) => r.k === 'balance').length < 2) return f.pan ? 'Read the balance again: calorimeter + water.' : 'Weigh the calorimeter with the water.';
  if (f.pan) return 'Take the calorimeter off the balance.';
  if (!f.lagged) return 'Stand the calorimeter in its lagging.';
  if (!f.heaterIn) return 'Put the immersion heater in, fully under the water.';
  if (!f.lid) return 'Put the lid on (the heater, thermometer and stirrer pass through it).';
  if (f.wire === 'none') return 'Connect the circuit: the ammeter in series with the heater, the voltmeter across the heater.';
  if (!f.switchedOn) return !has(s, 'thermo') ? 'Stir and read the starting temperature θ₀.' : 'Switch the heater on and start the stopwatch at the same moment.';
  if (f.on) return !f.stirring ? 'Stir continuously while the heater is on.' : `Read V and I, and the thermometer every ${THERM_INTERVAL} s; switch off at ${THERM_HEAT_TIME} s on the stopwatch.`;
  return 'Keep stirring: the temperature goes on rising for a little while. Record the highest temperature, then work out E, P and c.';
}

export function useThermal({
  seed,
  state,
  onChange,
  readOnly,
  startedAt,
  practicalId,
  variant,
  autoTask = true,
  clock: givenClock,
}: {
  seed: number;
  state: PhyThermalState;
  onChange: (next: PhyThermalState) => void;
  readOnly: boolean;
  startedAt: string;
  practicalId?: string;
  variant?: PhyThermalVariant;
  autoTask?: boolean;
  clock?: Clock;
}) {
  const seeded = useMemo(() => phyThermalVariant(seed), [seed]);
  const v = variant ?? seeded;
  const { update, ref } = useLabUpdate(state, onChange, readOnly, startedAt);
  const own = useRef<Clock | null>(null);
  if (!own.current) own.current = makeClock(thermLastTime(state) * 1000);
  const clock = givenClock ?? own.current;
  const now = () => clock.now() / 1000;
  const simRef = useRef<{ events: ThermEvent[]; v: PhyThermalVariant; sim: ThermSim } | null>(null);
  const simFor = (s: PhyThermalState): ThermSim => {
    const c = simRef.current;
    if (c && c.events === s.events && c.v === v) return c.sim;
    const sim = thermSim(v, s.events);
    simRef.current = { events: s.events, v, sim };
    return sim;
  };
  const [speed, setSpeed] = useState(1);
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (autoTask && !readOnly && !ref.current.task && !ref.current.events.length) {
      const t = lessonTask(practicalId);
      update((s) => (s.task ? s : { ...s, task: t }), 'task:auto');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, practicalId]);
  const task: ThermTask = state.task ?? 'EXPANSION';
  const tNow = () => r2(Math.max(now(), thermLastTime(ref.current)));
  const phys = (t = now()): ThermPhys => simFor(ref.current).at(Math.max(0, t));
  const flags = () => thermFlags(ref.current.events);
  const ev = (e: ThermEventCode, log: string = e) => {
    if (ref.current.events.length >= THERM_MAX_EVENTS) return;
    const t = tNow();
    update((s) => ({ ...s, events: [...s.events, { t, e }] }), log);
  };
  /** Several events at one instant (e.g. switch on and start the stopwatch). */
  const evs = (codes: ThermEventCode[], log: string) => {
    if (ref.current.events.length + codes.length > THERM_MAX_EVENTS) return;
    const t = tNow();
    update((s) => ({ ...s, events: [...s.events, ...codes.map((e) => ({ t, e }))] }), log);
  };
  const shows = (k: ThermInstrument, t = now()) => thermIndicates(v, phys(t), k, ref.current.task ?? 'EXPANSION', t);
  const setRow = (key: number, col: string, value: string) =>
    update((s) => {
      const i = s.rows.findIndex((r) => r.key === key);
      if (i < 0) return s.rows.length >= THERM_MAX_ROWS ? s : { ...s, rows: [...s.rows, { key, c: { [col]: value } }].sort((a, b) => a.key - b.key) };
      return { ...s, rows: s.rows.map((r, k) => (k === i ? { ...r, c: { ...r.c, [col]: value } } : r)) };
    });

  const o = {
    v,
    update,
    ref,
    task,
    clock,
    now,
    phys,
    flags,
    speed,
    setSpeed,
    bump,
    shows,
    chooseTask: (t: ThermTask) => update((s) => ({ ...s, task: t, line: null }), `task:${t}`),
    note: (a: string) => update((s) => s, a),
    ev,
    evs,
    // ---- expansion
    boiler: (on: boolean) => ev(on ? 'boiler:on' : 'boiler:off'),
    ratchet: () => ev('micro:ratchet'),
    thimble: () => ev('micro:thimble'),
    backOff: () => ev('micro:back'),
    // ---- Charles
    bunsen: (on: boolean) => ev(on ? 'bunsen:on' : 'bunsen:off'),
    stirOnce: () => ev('stir'),
    immerse: (full: boolean) => ev(full ? 'immerse:full' : 'immerse:part'),
    ice: () => ev('ice'),
    // ---- electrical heating
    pour: () => !flags().poured && ev('pour'),
    pan: (on: boolean) => ev(on ? 'pan:on' : 'pan:off'),
    lag: (on: boolean) => ev(on ? 'lag:on' : 'lag:off'),
    lid: (on: boolean) => ev(on ? 'lid:on' : 'lid:off'),
    heater: (inn: boolean) => ev(inn ? 'heater:in' : 'heater:out'),
    wire: (kind: 'ok' | 'wide') => ev(kind === 'ok' ? 'wire:ok' : 'wire:wide'),
    switchOn: (withWatch: boolean) => (withWatch && flags().watch !== 'running' ? evs(['switch:on', 'watch:start'], 'switch:on+watch') : ev('switch:on')),
    switchOff: () => ev('switch:off'),
    stir: (on: boolean) => ev(on ? 'stir:on' : 'stir:off'),
    watchStart: () => ev('watch:start'),
    watchStop: () => ev('watch:stop'),
    watchReset: () => ev('watch:reset'),
    /** The stopwatch reading (s). */
    watchTime: (t = now()) => thermWatch(phys(t), t),
    // ---- recording
    /** Record a reading of an instrument (Charles: a new table row with each air-column reading). */
    read: (k: ThermInstrument): string | null => {
      const s0 = ref.current;
      if (s0.reads.length >= THERM_MAX_READS) return 'The record is full.';
      const t = tNow();
      const addRow = s0.task === 'CHARLES' && k === 'column' && s0.rows.length < THERM_MAX_ROWS;
      update(
        (s) => {
          const reads = [...s.reads, { k, t }];
          return addRow ? { ...s, reads, rows: [...s.rows, { key: s.rows.length ? Math.max(...s.rows.map((r) => r.key)) + 1 : 0, c: {} }] } : { ...s, reads };
        },
        `read:${k}`,
      );
      return null;
    },
    removeRead: (i: number) => update((s) => ({ ...s, reads: s.reads.filter((_, k) => k !== i) }), `remove-read:${i}`),
    setCell: (id: string, value: string) => update((s) => ({ ...s, cells: { ...s.cells, [id]: value.slice(0, 40) } })),
    setRow,
    addRow: () => update((s) => (s.rows.length >= THERM_MAX_ROWS ? s : { ...s, rows: [...s.rows, { key: s.rows.length ? Math.max(...s.rows.map((r) => r.key)) + 1 : 0, c: {} }] }), 'add-row'),
    removeRow: (key: number) => update((s) => ({ ...s, rows: s.rows.filter((r) => r.key !== key) }), `remove-row:${key}`),
  };
  // Time-lapse: real time near each 60 s reading and the switch-off of the electrical heating.
  useEffect(() => {
    if (givenClock) return;
    const id = setInterval(() => {
      let r = speed;
      if (r > 1 && ref.current.task === 'ELECTRIC') {
        const f = thermFlags(ref.current.events);
        if (f.watch === 'running') {
          const w = o.watchTime();
          const e = w % THERM_INTERVAL;
          if (e > THERM_INTERVAL - 5 || e < 2 || (f.on && w > THERM_HEAT_TIME - 8)) r = 1;
        }
      }
      clock.setRate(r);
    }, 40);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speed, givenClock]);
  return o;
}
export type Thermal = ReturnType<typeof useThermal>;
