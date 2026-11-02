import type { ThermInstrument } from '@aischool/shared';
import { create } from 'zustand';

/** The thermal bench's own view state (not saved): which instrument the eye-level view reads, and the dock's tab. */
interface Bench {
  instr: ThermInstrument | null;
  tab: 'work' | 'more';
  set: (patch: Partial<Omit<Bench, 'set'>>) => void;
}
export type BenchState = Omit<Bench, 'set'>;
export const BENCH_IDLE: BenchState = { instr: null, tab: 'work' };
export const useBench = create<Bench>((set) => ({ ...BENCH_IDLE, set: (patch) => set(patch) }));
