import { create } from 'zustand';

/**
 * The spring bench's own view state (not saved): the hanger held pulled down
 * by a drag (cm), and the dock's tab.
 */
interface Bench {
  /** The hanger pulled down by a drag (cm), or null. */
  pull: number | null;
  tab: 'load' | 'time';
  set: (patch: Partial<Omit<Bench, 'set'>>) => void;
}
export type BenchState = Omit<Bench, 'set'>;
export const BENCH_IDLE: BenchState = { pull: null, tab: 'load' };
export const useBench = create<Bench>((set) => ({ ...BENCH_IDLE, set: (patch) => set(patch) }));
