import { create } from 'zustand';

/**
 * The mechanics bench's own view state (not saved): the run playing on the
 * bench (a pull, a tilt, a weighing, a drop, a roll: what it is, which
 * measurement, when it started, how long it lasts), the time-lapse for long
 * falls, which band the eye-level view reads and which sheet the paper view
 * shows.
 */
export type RunKind = 'pull' | 'tilt' | 'weigh' | 'drop' | 'roll';
export interface BenchRun {
  kind: RunKind;
  /** The measurement's index in its list (pulls, tilts, weighs, drops, runs). */
  k: number;
  at: number;
  ms: number;
}
interface Bench {
  run: BenchRun | null;
  lapse: number;
  band: 'top' | 'bot';
  sheet: number | null;
  /** Bumped while a run plays so the HUD re-renders (the reading appears when it ends). */
  tick: number;
  set: (patch: Partial<Omit<Bench, 'set'>>) => void;
}
export type BenchState = Omit<Bench, 'set'>;
export const BENCH_IDLE: BenchState = { run: null, lapse: 4, band: 'top', sheet: null, tick: 0 };
export const useBench = create<Bench>((set) => ({ ...BENCH_IDLE, set: (patch) => set(patch) }));
/** Progress 0…1 of the run now (1 when none), and whether it is still playing. */
export function runProgress(run: BenchRun | null, now = performance.now()): { p: number; busy: boolean } {
  if (!run) return { p: 1, busy: false };
  const p = Math.min(1, Math.max(0, (now - run.at) / run.ms));
  return { p, busy: p < 1 };
}
/** Starts a run on the bench; the HUD ticks until it ends. */
export function startRun(kind: RunKind, k: number, ms: number) {
  const run: BenchRun = { kind, k, at: performance.now(), ms };
  useBench.setState({ run });
  const id = window.setInterval(() => {
    const b = useBench.getState();
    if (b.run !== run) return window.clearInterval(id);
    useBench.setState({ tick: b.tick + 1 });
    if (!runProgress(run).busy) window.clearInterval(id);
  }, 120);
}
export const benchBusy = () => runProgress(useBench.getState().run).busy;
