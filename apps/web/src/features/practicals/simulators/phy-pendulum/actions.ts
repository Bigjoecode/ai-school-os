import { pendulumPeriod, phyPendulumVariant, type PhyPendulumState, type PhyPendulumVariant } from '@aischool/shared';
import { useMemo, useReducer, useRef } from 'react';
import { useLabUpdate } from '../phy-common';

/**
 * The simple-pendulum lab's state transitions, shared by the 2D and the 3D
 * lab so both produce exactly the same state and action log. The swing and
 * the stopwatch are live (not saved): a timing is written to the state only
 * when the student records it.
 */

export interface Swing {
  /** Clock time (ms) at release. */
  at: number;
  period: number;
  thread: number;
  amplitude: number;
  n: number;
  shielded: boolean;
}
export interface Watch {
  start: number | null;
  stop: number | null;
  /** |θ|/θ₀ when the watch was started (0 = the mean position). */
  phase: number;
}
export const MAX_RUNS = 16;
const r2 = (x: number) => Math.round(x * 100) / 100;
const IDLE_WATCH: Watch = { start: null, stop: null, phase: 1 };

export function pendulumHint(s: PhyPendulumState, swing: Swing | null, watch: Watch): string {
  if (!s.shielded && s.runs.length === 0) return 'There is a draught from the open window: close it before you time.';
  if (!swing) return s.amplitude > 10 ? 'Make the angle of displacement small (10° or less), then release the bob.' : 'Set the thread length, then displace the bob slightly and release it.';
  if (watch.start === null) return 'Let it settle, then start the stopwatch as the bob passes the fiducial mark (the mean position).';
  if (watch.stop === null) return `Count the oscillations ("0" at the start) and stop the watch after ${swing.n} complete oscillations, as the bob passes the mark in the same direction.`;
  return 'Record this timing, then change the length and repeat (at least five lengths).';
}

/** The angle (degrees) of a released bob at clock time `now`. */
export const swingAngle = (sw: Swing | null, now: number) => (sw ? sw.amplitude * Math.cos((2 * Math.PI * (now - sw.at)) / 1000 / sw.period) : 0);

export function usePendulum({
  seed,
  state,
  onChange,
  readOnly,
  startedAt,
  variant,
  clock = () => performance.now(),
}: {
  seed: number;
  state: PhyPendulumState;
  onChange: (next: PhyPendulumState) => void;
  readOnly: boolean;
  startedAt: string;
  /** A custom variant (the sandbox). */
  variant?: PhyPendulumVariant;
  /** The clock the swing and the stopwatch run on (ms): real time, or the demo's own clock. */
  clock?: () => number;
}) {
  const seeded = useMemo(() => phyPendulumVariant(seed), [seed]);
  const v = variant ?? seeded;
  const { update, ref } = useLabUpdate(state, onChange, readOnly, startedAt);
  // The swing and the stopwatch live in refs (so a sequence of actions in one go sees each other) and re-render on change.
  const swingRef = useRef<Swing | null>(null);
  const watchRef = useRef<Watch>(IDLE_WATCH);
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const clockRef = useRef(clock);
  clockRef.current = clock;
  const now = () => clockRef.current();

  const stopSwing = () => {
    swingRef.current = null;
    watchRef.current = IDLE_WATCH;
    bump();
  };
  /** Change a setting (thread, angle, oscillations, window): the bob is stopped first, as in a real lab. */
  const set = (patch: Partial<Pick<PhyPendulumState, 'thread' | 'amplitude' | 'n' | 'shielded'>>, log?: string) => {
    stopSwing();
    update((s) => ({ ...s, ...patch }), log);
  };
  const toggleWindow = () => {
    const shielded = ref.current.shielded;
    set({ shielded: !shielded }, shielded ? 'open-window' : 'close-window');
  };
  const release = () => {
    const s = ref.current;
    const period = pendulumPeriod(v, s.thread, s.amplitude, s.runs.length, s.shielded);
    watchRef.current = IDLE_WATCH;
    swingRef.current = { at: now(), period, thread: s.thread, amplitude: s.amplitude, n: s.n, shielded: s.shielded };
    bump();
    update((x) => x, `release:${s.thread}cm:${s.amplitude}deg`);
  };
  /** Start the stopwatch (now, or at a given clock time — the demo). */
  const startWatch = (at?: number) => {
    const sw = swingRef.current;
    if (!sw) return;
    const t = at ?? now();
    const phase = Math.abs(Math.cos((2 * Math.PI * (t - sw.at)) / 1000 / sw.period));
    watchRef.current = { start: t, stop: null, phase };
    bump();
  };
  const stopWatch = (at?: number) => {
    const w = watchRef.current;
    if (w.start === null || w.stop !== null) return;
    watchRef.current = { ...w, stop: at ?? now() };
    bump();
  };
  const resetWatch = () => {
    watchRef.current = IDLE_WATCH;
    bump();
  };
  const record = () => {
    const sw = swingRef.current;
    const w = watchRef.current;
    if (!sw || w.start === null || w.stop === null || ref.current.runs.length >= MAX_RUNS) return;
    const run = { thread: sw.thread, amplitude: sw.amplitude, n: sw.n, shielded: sw.shielded, elapsed: r2((w.stop - w.start) / 1000), startPhase: Math.round(w.phase * 1000) / 1000 };
    update((s) => ({ ...s, runs: [...s.runs, run].slice(0, MAX_RUNS), table: [...s.table, { l: '', t: '', T: '', T2: '' }].slice(0, MAX_RUNS) }), `record:${run.elapsed}s`);
    // The swing dies down; release again for the next timing.
    stopSwing();
  };
  const removeRun = (i: number) => update((s) => ({ ...s, runs: s.runs.filter((_, k) => k !== i), table: s.table.filter((_, k) => k !== i) }), `remove-run:${i}`);
  /** A step with no field in the state (collecting apparatus…): written to the action log only. */
  const note = (a: string) => update((s) => s, a);

  const swing = swingRef.current;
  const watch = watchRef.current;
  /** Stopwatch reading (s) and whole oscillations since it started, at clock time `t`. */
  const elapsed = (t = now()) => (watch.start === null ? 0 : ((watch.stop ?? t) - watch.start) / 1000);
  const counted = (t = now()) => (swing && watch.start !== null ? Math.floor(elapsed(t) / swing.period + 0.01) : 0);
  return { v, update, ref, swing, watch, swingRef, watchRef, now, set, toggleWindow, release, stopSwing, startWatch, stopWatch, resetWatch, record, removeRun, note, elapsed, counted };
}
export type Pendulum = ReturnType<typeof usePendulum>;
