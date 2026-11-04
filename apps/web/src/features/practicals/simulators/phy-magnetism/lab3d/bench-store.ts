import { create } from 'zustand';

/**
 * The magnetism bench's own view state (not saved): the run playing on the
 * bench (a lift of the clips, a movement of the magnet), which neutral mark
 * the rule lies to, and a tick so the HUD re-renders while a run plays.
 */
export type RunKind = 'lift' | 'move';
export interface BenchRun {
  kind: RunKind;
  k: number;
  at: number;
  ms: number;
}
interface Bench {
  run: BenchRun | null;
  ruler: number | null;
  tick: number;
  set: (patch: Partial<Omit<Bench, 'set'>>) => void;
}
export type BenchState = Omit<Bench, 'set'>;
export const BENCH_IDLE: BenchState = { run: null, ruler: null, tick: 0 };
export const useBench = create<Bench>((set) => ({ ...BENCH_IDLE, set: (patch) => set(patch) }));
export function runProgress(run: BenchRun | null, now = performance.now()): { p: number; busy: boolean } {
  if (!run) return { p: 1, busy: false };
  const p = Math.min(1, Math.max(0, (now - run.at) / run.ms));
  return { p, busy: p < 1 };
}
export function startRun(kind: RunKind, k: number, ms: number) {
  const run: BenchRun = { kind, k, at: performance.now(), ms };
  useBench.setState({ run });
  const id = window.setInterval(() => {
    const b = useBench.getState();
    if (b.run !== run) return window.clearInterval(id);
    useBench.setState({ tick: b.tick + 1 });
    if (!runProgress(run).busy) window.clearInterval(id);
  }, 100);
}
export const benchBusy = () => runProgress(useBench.getState().run).busy;
/** The galvanometer's needle during a movement: a swing to the peak and back (divisions). */
export function swing(peak: number, offset: number, p: number, still: boolean): number {
  if (still) return peak;
  const t = p * 2.2;
  const env = t < 0.35 ? Math.sin((t / 0.35) * (Math.PI / 2)) : Math.max(0, 1 - (t - 0.35) / 1.2);
  return offset + (peak - offset) * env;
}
