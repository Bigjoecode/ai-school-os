import {
  HEAT_INTERVAL,
  heatLastTime,
  heatMass,
  heatReading,
  heatSim,
  phyHeatVariant,
  type HeatEvent,
  type HeatEventCode,
  type HeatItem,
  type HeatPhys,
  type HeatSim,
  type HeatTask,
  type HeatThermo,
  type PhyHeatState,
  type PhyHeatVariant,
} from '@aischool/shared';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useLabUpdate } from '../phy-common';

/**
 * The heat bench's state transitions, shared by the 2D and the 3D lab (and the
 * demo and sandbox) so all of them produce the same state and log. Every
 * physical step (light the Bunsen, lag and cover the calorimeter, pour water,
 * hang the block in the bath, lift and lower it, add a piece of ice, stir,
 * move the boiling tube, the stopwatch) is an event at the lab clock's time;
 * the shared `heatSim` turns the events into temperatures. Weighings and
 * thermometer readings are recorded with their time (the student writes the
 * values); the balance's riders and the pan are live view state. The lab
 * clock can run in time-lapse (it eases to real time while the hot block is in
 * the air and near each 30 s mark of the cooling curve) and resumes where the
 * record ends after a reload.
 */

export const LESSON_TASKS: Record<string, HeatTask> = {
  'pr-phy-specific-heat-mixtures': 'MIX',
  'pr-phy-latent-heat-of-fusion': 'LATENT',
  'pr-phy-cooling-curve': 'COOL',
};
export const lessonTask = (practicalId?: string): HeatTask => (practicalId && LESSON_TASKS[practicalId]) || 'MIX';
export const TASK_NAME: Record<HeatTask, string> = { MIX: 'Specific heat capacity by the method of mixtures', LATENT: 'Specific latent heat of fusion of ice', COOL: 'Cooling curve of naphthalene' };
export const SPEEDS = [1, 5, 10, 20] as const;
export const MAX_EVENTS = 400;
export const MAX_READS = 120;
export const MAX_WEIGHS = 20;
export const MAX_COOL_ROWS = 80;
const r2 = (x: number) => Math.round(x * 100) / 100;

/** A clock that can run faster than real time (ms of lab time). */
export function makeClock(startMs = 0) {
  let base = startMs;
  let at = performance.now();
  let rate = 1;
  const now = () => base + (performance.now() - at) * rate;
  return {
    now,
    rate: () => rate,
    setRate(r: number) {
      if (r === rate) return;
      base = now();
      at = performance.now();
      rate = r;
    },
    /** Jump forward (the demo skips ahead). */
    shift(ms: number) {
      base += ms;
    },
    reset(ms: number) {
      base = ms;
      at = performance.now();
      rate = 1;
    },
  };
}
export type Clock = ReturnType<typeof makeClock>;

/** The triple-beam balance's riders: hundreds (0–2), tens (0–9) and the front rider (0–10 g in 0.1 g). */
export interface Riders {
  h: number;
  t: number;
  f: number;
}
export const ridersSum = (r: Riders) => Math.round((r.h * 100 + r.t * 10 + r.f) * 10) / 10;
/** The beam's pointer: −1 (beam down on the riders' side: too much on the riders) … +1 (the pan side heavy). 0 = balanced. */
export const beamTilt = (massG: number, r: Riders) => Math.max(-1, Math.min(1, (massG - ridersSum(r)) / 0.6));

/** What the last events left in place, read straight from the events (for the buttons and the scene). */
export function heatFlags(events: readonly HeatEvent[]) {
  const has = (e: HeatEventCode) => events.some((x) => x.e === e);
  const last = (pre: string) => [...events].reverse().find((x) => x.e.startsWith(pre))?.e ?? null;
  const ices = events.filter((x) => x.e.startsWith('ice:'));
  return {
    bunsen: last('bunsen:') === 'bunsen:on',
    lagged: last('lag:') === 'lag:on',
    lid: last('lid:') === 'lid:on',
    stirring: last('stir:') === 'stir:on',
    filled: events.some((x) => x.e.startsWith('fill:') || x.e.startsWith('warm:')),
    block: ((): 'bench' | 'bath' | 'air' | 'cal' => {
      const b = last('block:');
      return b === 'block:bath' ? 'bath' : b === 'block:lift' ? 'air' : b === 'block:gentle' || b === 'block:drop' ? 'cal' : 'bench';
    })(),
    ice: ices.length,
    tube: ((): 'rack' | 'bath' | 'air' => {
      const t = [...events].reverse().find((x) => x.e === 'tube:bath' || x.e === 'tube:air')?.e;
      return t === 'tube:bath' ? 'bath' : t === 'tube:air' ? 'air' : 'rack';
    })(),
    watch: ((): 'idle' | 'running' | 'stopped' => {
      const w = last('watch:');
      return w === 'watch:start' ? 'running' : w === 'watch:stop' ? 'stopped' : 'idle';
    })(),
    flame: has('tube:flame'),
  };
}
export type HeatFlags = ReturnType<typeof heatFlags>;

export function heatHint(s: PhyHeatState, f: HeatFlags, p: HeatPhys, v: PhyHeatVariant, pan: HeatItem | null): string {
  if (!s.task) return 'Choose the experiment first.';
  const weighedEmpty = s.weighs.some((x) => x.item === 'cal' && x.t <= (s.events.find((e) => e.e.startsWith('fill:') || e.e.startsWith('warm:'))?.t ?? Infinity));
  if (s.task === 'MIX') {
    if (!weighedEmpty && !f.filled) return pan === 'cal' ? 'Slide the riders until the pointer is on zero, read the beams and record the weighing (m_c).' : 'Weigh the empty calorimeter and stirrer first: put it on the balance.';
    if (!f.filled) return 'Pour water into the calorimeter until it is about two-thirds full.';
    if (s.weighs.filter((x) => x.item === 'cal').length < 2) return 'Weigh the calorimeter with the water (m₁).';
    if (!s.weighs.some((x) => x.item === 'block')) return 'Weigh the metal block (m).';
    if (!f.lagged) return 'Stand the calorimeter in its lagging (cotton wool) jacket.';
    if (f.block === 'bench') return f.bunsen ? 'Hang the block by its thread in the beaker of water.' : 'Light the Bunsen burner under the beaker of water and hang the block in the water.';
    if (f.block === 'bath') {
      if (p.bath < v.boil - 0.3) return 'Wait for the water to boil (use the time-lapse). Meanwhile read the calorimeter water (θ₂).';
      return 'Let the block stay in the boiling water for several minutes; read the bath thermometer (θ₁) and the calorimeter water (θ₂), then lift the block out.';
    }
    if (f.block === 'air') return 'Quickly lower the block gently into the calorimeter by its thread!';
    if (!f.lid) return 'Cover the calorimeter at once.';
    if (!f.stirring) return 'Stir gently and continuously with the stirrer.';
    return 'Watch the thermometer rise: record the highest steady temperature θ₃. Then fill in the table and work out c.';
  }
  if (s.task === 'LATENT') {
    if (!weighedEmpty && !f.filled) return pan === 'cal' ? 'Balance the riders, read the beams and record the weighing (m_c).' : 'Weigh the empty calorimeter and stirrer first.';
    if (!f.lagged) return 'Stand the calorimeter in its lagging jacket.';
    if (!f.filled) return 'Pour in warm water (about 10 °C above room temperature) until two-thirds full.';
    if (s.weighs.filter((x) => x.item === 'cal').length < 2) return 'Weigh the calorimeter with the warm water (m₁).';
    if (!s.reads.some((r) => r.th === 'room')) return 'Read the room thermometer on the bench.';
    if (!f.ice) return 'Stir and read the water temperature θ₁, then dry a piece of melting ice with blotting paper and add it.';
    if (p.meltedAt === null) return `Keep stirring while the ice melts. Add more dried pieces until the water will end about as far below room temperature (${v.room.toFixed(0)} °C) as it started above.`;
    return 'All the ice has melted: read the lowest steady temperature θ₂, then weigh the calorimeter again (m₂).';
  }
  if (f.tube === 'rack') return f.bunsen ? 'Stand the boiling tube of naphthalene in the beaker of water (the water bath).' : 'Light the Bunsen burner under the water bath, then put the boiling tube in the water.';
  if (f.tube === 'bath') return p.fs > 0.001 ? 'Wait until the naphthalene has completely melted (use the time-lapse).' : 'When the thermometer reads about 90 °C, take the tube out, clamp it in air and start the stopwatch.';
  if (f.watch === 'idle') return 'Start the stopwatch now, and read the thermometer straight away (0 s).';
  if (p.fs < 0.05 && !f.stirring) return 'Stir gently with the thermometer while the naphthalene is liquid.';
  if (p.fs > 0.3 && f.stirring) return 'Crystals are forming: stop stirring, and leave the thermometer in place.';
  if (p.fs >= 0.999 && heatReading(v, p, 'tube') < 65) return 'Solid and below 65 °C: stop. Fill in the table, plot θ against t, mark the plateau and work out the answers.';
  return 'Read the thermometer every 30 s on the stopwatch and write each reading in the table.';
}

export function useHeat({
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
  state: PhyHeatState;
  onChange: (next: PhyHeatState) => void;
  readOnly: boolean;
  startedAt: string;
  practicalId?: string;
  variant?: PhyHeatVariant;
  autoTask?: boolean;
  clock?: Clock;
}) {
  const seeded = useMemo(() => phyHeatVariant(seed), [seed]);
  const v = variant ?? seeded;
  const { update, ref } = useLabUpdate(state, onChange, readOnly, startedAt);
  const own = useRef<Clock | null>(null);
  if (!own.current) own.current = makeClock(heatLastTime(state) * 1000);
  const clock = givenClock ?? own.current;
  /** Lab time now (s). */
  const now = () => clock.now() / 1000;
  const simRef = useRef<{ events: HeatEvent[]; v: PhyHeatVariant; sim: HeatSim } | null>(null);
  const simFor = (s: PhyHeatState): HeatSim => {
    const c = simRef.current;
    if (c && c.events === s.events && c.v === v) return c.sim;
    const sim = heatSim(v, s.events);
    simRef.current = { events: s.events, v, sim };
    return sim;
  };
  const [speed, setSpeed] = useState(1);
  const [pan, setPanState] = useState<HeatItem | null>(null);
  const [riders, setRiders] = useState<Riders>({ h: 0, t: 0, f: 0 });
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (autoTask && !readOnly && !ref.current.task && !ref.current.events.length) {
      const t = lessonTask(practicalId);
      update((s) => (s.task ? s : { ...s, task: t }), 'task:auto');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, practicalId]);
  const task: HeatTask = state.task ?? 'MIX';
  const tNow = () => r2(Math.max(now(), heatLastTime(ref.current)));

  /** The bench now (or at lab time t). */
  const phys = (t = now()): HeatPhys => simFor(ref.current).at(Math.max(0, t));
  const ev = (e: HeatEventCode, log = e) => {
    if (ref.current.events.length >= MAX_EVENTS) return;
    const t = tNow();
    update((s) => ({ ...s, events: [...s.events, { t, e }] }), log);
  };
  const flags = () => heatFlags(ref.current.events);

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
    pan,
    riders,
    setRiders: (r: Riders) => setRiders({ h: Math.max(0, Math.min(2, r.h)), t: Math.max(0, Math.min(9, r.t)), f: Math.max(0, Math.min(10, Math.round(r.f * 10) / 10)) }),
    nudgeRider: (which: keyof Riders, d: number) =>
      setRiders((r) => {
        const n = { ...r, [which]: r[which] + d };
        return { h: Math.max(0, Math.min(2, n.h)), t: Math.max(0, Math.min(9, n.t)), f: Math.max(0, Math.min(10, Math.round(n.f * 10) / 10)) };
      }),
    /** Put an item on the balance pan (null: clear it). */
    setPan: (item: HeatItem | null) => {
      setPanState(item);
      update((s) => s, item ? `pan:${item}` : 'pan:off');
    },
    /** The true mass on the pan now (g). */
    panMass: (t = now()) => (pan ? heatMass(v, phys(t), pan) * 1000 : 0),
    chooseTask: (t: HeatTask) => update((s) => ({ ...s, task: t, line: null, curve: false }), `task:${t}`),
    note: (a: string) => update((s) => s, a),
    ev,
    // ---- heating
    bunsen: (on: boolean) => ev(on ? 'bunsen:on' : 'bunsen:off'),
    lag: (on: boolean) => ev(on ? 'lag:on' : 'lag:off'),
    lid: (on: boolean) => ev(on ? 'lid:on' : 'lid:off'),
    stir: (on: boolean) => ev(on ? 'stir:on' : 'stir:off'),
    thStir: () => ev('thstir'),
    fill: (level: 1 | 2 | 3) => !flags().filled && ev(`fill:${level}` as HeatEventCode),
    warm: (nominal: number) => !flags().filled && ev(`warm:${nominal}` as HeatEventCode),
    blockToBath: () => flags().block === 'bench' && ev('block:bath'),
    lift: () => flags().block === 'bath' && ev('block:lift'),
    lower: (gentle: boolean) => {
      const b = flags().block;
      if (b !== 'bath' && b !== 'air') return;
      if (b === 'bath') ev('block:lift');
      ev(gentle ? 'block:gentle' : 'block:drop');
    },
    addIce: (dry: boolean, melting: boolean) => flags().filled && ev(`ice:${dry ? 'dry' : 'wet'}:${melting ? 'melt' : 'freezer'}` as HeatEventCode),
    tubeToBath: () => ev('tube:bath'),
    tubeFlame: () => ev('tube:flame'),
    tubeToAir: () => ev('tube:air'),
    pullThermo: () => ev('th:pull'),
    watchStart: () => ev('watch:start'),
    watchStop: () => ev('watch:stop'),
    /** The stopwatch reading (s). */
    watchTime: (t = now()) => {
      const p = phys(t);
      return p.watchStart === null ? 0 : Math.max(0, (p.watchStop ?? t) - p.watchStart);
    },
    // ---- recording
    /** Record the balance reading of what is on the pan. */
    weigh: (): string | null => {
      if (!pan) return 'Put something on the balance pan first.';
      if (ref.current.weighs.length >= MAX_WEIGHS) return 'The record is full.';
      const t = tNow();
      update((s) => ({ ...s, weighs: [...s.weighs, { item: pan, t }] }), `weigh:${pan}`);
      return null;
    },
    /** Record a thermometer reading (a cooling-curve row appears for the tube while the stopwatch runs). */
    read: (th: HeatThermo): string | null => {
      const s0 = ref.current;
      if (s0.reads.length >= MAX_READS) return 'The record is full.';
      const t = tNow();
      const row = s0.task === 'COOL' && th === 'tube' && heatFlags(s0.events).watch === 'running' && s0.cool.length < MAX_COOL_ROWS;
      update(
        (s) => {
          const reads = [...s.reads, { th, t }];
          return row ? { ...s, reads, coolRows: [...s.coolRows, reads.length - 1], cool: [...s.cool, { t: '', th: '' }] } : { ...s, reads };
        },
        `read:${th}`,
      );
      return null;
    },
    removeCoolRow: (i: number) => update((s) => ({ ...s, coolRows: s.coolRows.filter((_, k) => k !== i), cool: s.cool.filter((_, k) => k !== i) }), `remove-row:${i}`),
    removeWeigh: (i: number) => update((s) => ({ ...s, weighs: s.weighs.filter((_, k) => k !== i) }), `remove-weigh:${i}`),
    removeRead: (i: number) =>
      update((s) => {
        // the cooling rows point at reads by index
        const rows = s.coolRows.map((r, k) => ({ r, k })).filter((x) => x.r !== i);
        return { ...s, reads: s.reads.filter((_, k) => k !== i), coolRows: rows.map((x) => (x.r > i ? x.r - 1 : x.r)), cool: rows.map((x) => s.cool[x.k]!) };
      }, `remove-read:${i}`),
    bump,
  };
  // Time-lapse: real time while the block is in the air, and for the last seconds before each 30 s mark of the cooling curve.
  useEffect(() => {
    if (givenClock) return;
    const id = setInterval(() => {
      let r = speed;
      if (r > 1) {
        const f = heatFlags(ref.current.events);
        if (f.block === 'air') r = 1;
        if (ref.current.task === 'COOL' && f.watch === 'running') {
          const e = o.watchTime() % HEAT_INTERVAL;
          if (e > HEAT_INTERVAL - 4 || e < 3) r = 1;
        }
      }
      clock.setRate(r);
    }, 40);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speed, givenClock]);
  return o;
}
export type Heat = ReturnType<typeof useHeat>;

/** Re-renders on a timer while the lab is live (the 2D view and the docks). */
export function useLive(on: boolean, ms = 100) {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(tick, ms);
    return () => clearInterval(id);
  }, [on, ms]);
}

/** mm:ss of lab time. */
export const clockText = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
