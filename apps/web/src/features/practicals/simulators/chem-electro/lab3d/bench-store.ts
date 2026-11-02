import { create } from 'zustand';

/**
 * The electrochemistry bench's own view state (not saved): animation
 * timestamps (stirring, pouring, sanding, tapping filings).
 */
interface Bench {
  stirUntil: number;
  pourUntil: number;
  sandUntil: number;
  tapAt: number;
  set: (patch: Partial<Omit<Bench, 'set'>>) => void;
}
export type BenchState = Omit<Bench, 'set'>;
export const BENCH_IDLE: BenchState = { stirUntil: 0, pourUntil: 0, sandUntil: 0, tapAt: 0 };
export const useBench = create<Bench>((set) => ({ ...BENCH_IDLE, set: (patch) => set(patch) }));
