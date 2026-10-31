import { create } from 'zustand';

/** The resonance bench's own view state (not saved): the dock's tab. */
interface Bench {
  tab: 'fork' | 'length';
  set: (patch: Partial<Omit<Bench, 'set'>>) => void;
}
export type BenchState = Omit<Bench, 'set'>;
export const BENCH_IDLE: BenchState = { tab: 'fork' };
export const useBench = create<Bench>((set) => ({ ...BENCH_IDLE, set: (patch) => set(patch) }));
