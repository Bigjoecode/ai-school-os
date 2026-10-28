import {
  SPRING_MAX_LOAD,
  SPRING_STEP,
  SPRING_STILL,
  phySpringVariant,
  springMassesFly,
  springOffset,
  springPeriod,
  springReading,
  type PhySpringState,
  type PhySpringVariant,
  type SpringTask,
} from '@aischool/shared';
import { useEffect, useMemo, useReducer, useRef } from 'react';
import { useLabUpdate } from '../phy-common';

/**
 * The spiral spring's state transitions, shared by the 2D and the 3D lab so
 * both produce exactly the same state and action log: choose the task, hang
 * the hanger and add or take off slotted masses, steady the spring, take a
 * pointer reading (Hooke's law), set the displacement and the oscillations to
 * time, release, start and stop the stopwatch and record the timing
 * (oscillations). The motion of the spring and the stopwatch are live (not
 * saved): a reading or a timing is written to the state only when taken.
 */

/** Lessons that open on the oscillations (every other lesson starts on Hooke's law). */
export const OSC_LESSONS = ['pr-phy-loaded-spring-oscillation'];
export const lessonTask = (practicalId?: string): SpringTask => (practicalId && OSC_LESSONS.includes(practicalId) ? 'OSC' : 'HOOKE');
export const MAX_READINGS = 40;
export const MAX_RUNS = 24;
export const MAX_ROWS = 14;
const r2 = (x: number) => Math.round(x * 100) / 100;
/** A load in words: "the hanger alone", "hanger + 100 g"… */
export const loadName = (g: number) => (g <= 0 ? 'no load' : g === SPRING_STEP ? 'the 50 g hanger' : `${g} g (hanger + ${g - SPRING_STEP} g)`);

/** The spring's live vertical motion about its rest position (not saved). */
export interface Motion {
  /** Clock time (ms) the motion began. */
  at: number;
  /** Starting displacement (cm, + = below the rest position). */
  a0: number;
  period: number;
  load: number;
  /** A release for timing (OSC), not a bounce from adding a mass. */
  released: boolean;
}
export interface Watch {
  start: number | null;
  stop: number | null;
  /** |x|/A when the watch was started (0 = the rest position). */
  phase: number;
}
const IDLE_WATCH: Watch = { start: null, stop: null, phase: 1 };

export function springHint(s: PhySpringState, motion: Motion | null, watch: Watch, v: PhySpringVariant, now: number): string {
  if (!s.task) return 'Choose the experiment first.';
  const moving = motionAmp(v, motion, now) > SPRING_STILL;
  if (s.task === 'HOOKE') {
    if (!s.readings.some((r) => r.load === 0)) return s.load > 0 ? 'Take the hanger off: read the pointer with no load first (R₀).' : 'Read the pointer with no load (R₀): eye level with the pointer, to 0.1 cm. Take the reading.';
    if (s.load === 0 && s.peak === 0) return 'Hang the 50 g mass hanger on the spring.';
    if (moving) return 'The spring is bouncing: steady the hanger and let the pointer come to rest before you read it.';
    const loads = new Set(s.readings.filter((r) => r.load > 0 && r.peak <= r.load).map((r) => r.load));
    if (!loads.has(s.load) && s.load > 0 && s.peak <= s.load) return `Read the pointer at eye level and take the reading for ${loadName(s.load)}.`;
    if (loads.size < 6 && s.peak <= s.load) return `Add another 50 g, steady it and read the pointer. ${loads.size} of 6 loads.`;
    if (s.load > SPRING_STEP) return 'Now take the masses off one at a time, reading the pointer each time (unloading).';
    return 'Fill in the table, plot e against W, find the slope and k = 1/slope.';
  }
  if (s.load === 0) return 'Hang the mass hanger and masses: 100 g to start (as on the task card).';
  if (!motion?.released) return `Pull the hanger down ${s.amp} cm and release it: it oscillates up and down.`;
  if (watch.start === null) return 'Let it settle into a steady up-and-down motion, then start the stopwatch as the hanger passes the fiducial mark.';
  if (watch.stop === null) return `Count the oscillations ("0" at the start) and stop the watch after ${s.n}, as the hanger passes the mark going the same way.`;
  return 'Record this timing. Time each mass twice, then change the mass (five masses).';
}

/** The size (cm) of the live motion at clock time `now`. */
export const motionAmp = (v: PhySpringVariant, m: Motion | null, now: number) => (m ? Math.abs(m.a0) * Math.exp(-Math.max(0, now - m.at) / 1000 / v.tau) : 0);
/** The displacement (cm, + = down) of the spring's lower end from its rest position at `now`. */
export const motionOffset = (v: PhySpringVariant, m: Motion | null, now: number) => (m ? springOffset(v, m.a0, m.period, Math.max(0, now - m.at) / 1000) : 0);

export function useSpring({
  seed,
  state,
  onChange,
  readOnly,
  startedAt,
  practicalId,
  variant,
  autoTask = true,
  clock = () => performance.now(),
}: {
  seed: number;
  state: PhySpringState;
  onChange: (next: PhySpringState) => void;
  readOnly: boolean;
  startedAt: string;
  practicalId?: string;
  /** A custom variant (the sandbox). */
  variant?: PhySpringVariant;
  /** Pre-select the experiment from the lesson on opening (the attempt; not the demo or sandbox). */
  autoTask?: boolean;
  /** The clock the motion and the stopwatch run on (ms): real time, or the demo's own clock. */
  clock?: () => number;
}) {
  const seeded = useMemo(() => phySpringVariant(seed), [seed]);
  const v = variant ?? seeded;
  const { update, ref } = useLabUpdate(state, onChange, readOnly, startedAt);
  const motionRef = useRef<Motion | null>(null);
  const watchRef = useRef<Watch>(IDLE_WATCH);
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const clockRef = useRef(clock);
  clockRef.current = clock;
  const now = () => clockRef.current();
  useEffect(() => {
    if (autoTask && !readOnly && !ref.current.task && !ref.current.readings.length && !ref.current.runs.length) {
      const t = lessonTask(practicalId);
      update((s) => (s.task ? s : { ...s, task: t }), 'task:auto');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, practicalId]);
  const task: SpringTask = state.task ?? 'HOOKE';

  const steady = () => {
    motionRef.current = null;
    watchRef.current = IDLE_WATCH;
    bump();
  };
  /** Change the load (g): lowered gently by hand, it still bounces a little about its new rest position. */
  const setLoad = (next: number) => {
    const s0 = ref.current;
    const load = Math.max(0, Math.min(SPRING_MAX_LOAD, Math.round(next / SPRING_STEP) * SPRING_STEP));
    if (load === s0.load) return;
    const peak = Math.max(s0.peak, load);
    const jump = springReading(v, load, peak) - springReading(v, s0.load, s0.peak);
    watchRef.current = IDLE_WATCH;
    motionRef.current = load > 0 ? { at: now(), a0: -0.4 * jump, period: springPeriod(v, load, 0), load, released: false } : null;
    bump();
    update((s) => ({ ...s, load, peak }), `load:${load}`);
  };
  const o = {
    v,
    update,
    ref,
    task,
    motionRef,
    watchRef,
    now,
    chooseTask: (t: SpringTask) => {
      steady();
      update((s) => ({ ...s, task: t, line: null }), `task:${t}`);
    },
    setLoad,
    hangHanger: () => ref.current.load === 0 && setLoad(SPRING_STEP),
    addMass: () => ref.current.load > 0 && setLoad(ref.current.load + SPRING_STEP),
    removeMass: () => ref.current.load > SPRING_STEP && setLoad(ref.current.load - SPRING_STEP),
    removeHanger: () => ref.current.load === SPRING_STEP && setLoad(0),
    steady,
    /** The pointer's reading now (cm): the rest reading and the live motion. */
    pointerAt: (t = now()) => springReading(v, ref.current.load, ref.current.peak) + motionOffset(v, motionRef.current, t),
    moving: (t = now()) => motionAmp(v, motionRef.current, t) > SPRING_STILL,
    /** HOOKE: take a pointer reading (a row appears for a new load). */
    takeReading: (): string | null => {
      const s0 = ref.current;
      if (s0.readings.length >= MAX_READINGS) return 'The record is full.';
      const r = { load: s0.load, peak: s0.peak, moving: o.moving() };
      const newRow = s0.load > 0 && !s0.rows.includes(s0.load) && s0.rows.length < MAX_ROWS;
      update(
        (s) => ({
          ...s,
          readings: [...s.readings, r],
          rows: newRow ? [...s.rows, s.load] : s.rows,
          hooke: newRow ? [...s.hooke, { m: '', W: '', Rl: '', Ru: '', e: '' }] : s.hooke,
        }),
        `reading:${s0.load}${r.moving ? ':moving' : ''}`,
      );
      return null;
    },
    /** Delete a table row and every reading or timing at its load. */
    removeRow: (i: number) =>
      update((s) => {
        const L = s.rows[i];
        return { ...s, rows: s.rows.filter((_, k) => k !== i), hooke: s.hooke.filter((_, k) => k !== i), osc: s.osc.filter((_, k) => k !== i), readings: s.readings.filter((r) => r.load !== L), runs: s.runs.filter((r) => r.load !== L) };
      }, `remove-row:${i}`),
    // ---- oscillations
    setAmp: (amp: number) => update((s) => ({ ...s, amp })),
    setN: (n: number) => update((s) => ({ ...s, n })),
    /** Pull the hanger down by the displacement and let go (refused when the masses would jump off). */
    release: (amp?: number): string | null => {
      const s0 = ref.current;
      const a = amp ?? s0.amp;
      if (s0.load === 0) return 'Hang the hanger and masses first.';
      if (springMassesFly(v, s0.load, a)) {
        update((s) => s, `fly:${s0.load}:${a}`);
        return `Pulled down ${a} cm, the slotted masses would jump off the hanger at the top of the swing: use a smaller displacement (1–2 cm).`;
      }
      if (amp !== undefined && amp !== s0.amp) update((s) => ({ ...s, amp: a }));
      watchRef.current = IDLE_WATCH;
      motionRef.current = { at: now(), a0: a, period: springPeriod(v, s0.load, s0.runs.length), load: s0.load, released: true };
      bump();
      update((s) => s, `release:${s0.load}:${a}`);
      return null;
    },
    startWatch: (at?: number) => {
      const m = motionRef.current;
      if (!m) return;
      const t = at ?? now();
      const phase = Math.abs(Math.cos((2 * Math.PI * (t - m.at)) / 1000 / m.period));
      watchRef.current = { start: t, stop: null, phase };
      bump();
    },
    stopWatch: (at?: number) => {
      const w = watchRef.current;
      if (w.start === null || w.stop !== null) return;
      watchRef.current = { ...w, stop: at ?? now() };
      bump();
    },
    resetWatch: () => {
      watchRef.current = IDLE_WATCH;
      bump();
    },
    /** OSC: record the stopwatch reading as a timing (a row appears for a new mass). */
    record: () => {
      const m = motionRef.current;
      const w = watchRef.current;
      const s0 = ref.current;
      if (!m || !m.released || w.start === null || w.stop === null || s0.runs.length >= MAX_RUNS) return;
      const run = { load: m.load, amp: Math.abs(m.a0), n: s0.n, elapsed: r2((w.stop - w.start) / 1000), startPhase: Math.round(w.phase * 1000) / 1000 };
      const newRow = !s0.rows.includes(m.load) && s0.rows.length < MAX_ROWS;
      update(
        (s) => ({ ...s, runs: [...s.runs, run], rows: newRow ? [...s.rows, m.load] : s.rows, osc: newRow ? [...s.osc, { m: '', t1: '', t2: '', t: '', T: '', T2: '' }] : s.osc }),
        `record:${run.load}:${run.elapsed}s`,
      );
      steady();
    },
    removeRun: (i: number) =>
      update((s) => {
        const runs = s.runs.filter((_, k) => k !== i);
        const keep = s.rows.map((L) => runs.some((r) => r.load === L));
        return { ...s, runs, rows: s.rows.filter((_, k) => keep[k]), osc: s.osc.filter((_, k) => keep[k]) };
      }, `remove-run:${i}`),
    /** A step with no field in the state (collecting apparatus, the briefing): written to the action log only. */
    note: (a: string) => update((s) => s, a),
  };
  const motion = motionRef.current;
  const watch = watchRef.current;
  /** Stopwatch reading (s) and whole oscillations since it started, at clock time `t`. */
  const elapsed = (t = now()) => (watch.start === null ? 0 : ((watch.stop ?? t) - watch.start) / 1000);
  const counted = (t = now()) => (motion && watch.start !== null ? Math.floor(elapsed(t) / motion.period + 0.01) : 0);
  return { ...o, motion, watch, elapsed, counted };
}
export type Spring = ReturnType<typeof useSpring>;

/** Re-renders while the spring moves or the watch runs (the 2D view and the dock). */
export function useLive(on: boolean, ms = 40) {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(tick, ms);
    return () => clearInterval(id);
  }, [on, ms]);
}

/** A clock that can run faster than real time (the demo's time-lapse while oscillations are timed). */
export function makeClock() {
  let base = 0;
  let at = performance.now();
  let rate = 1;
  const now = () => base + (performance.now() - at) * rate;
  return {
    now,
    rate: () => rate,
    setRate(r: number) {
      base = now();
      at = performance.now();
      rate = r;
    },
  };
}
export type Clock = ReturnType<typeof makeClock>;
