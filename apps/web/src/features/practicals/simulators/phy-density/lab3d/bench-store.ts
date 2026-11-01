import { create } from 'zustand';

/** The density bench's own view state (not saved): the dock's tab. */
interface Bench {
  tab: 'work' | 'balance';
  /** Flotation: the dock shows the vernier's controls (to measure the tube). */
  calipers: boolean;
  set: (patch: Partial<Omit<Bench, 'set'>>) => void;
}
export type BenchState = Omit<Bench, 'set'>;
export const BENCH_IDLE: BenchState = { tab: 'work', calipers: false };
export const useBench = create<Bench>((set) => ({ ...BENCH_IDLE, set: (patch) => set(patch) }));
