import { create } from 'zustand';

/**
 * The energetics bench's own view state (not saved): the last thermometer
 * reading held for writing down, animation timestamps (stirring, pouring),
 * and the volumes and masses chosen in the dock.
 */
interface Bench {
  snap: { at: number; value: number; label: string } | null;
  stirUntil: number;
  pourUntil: number;
  volA: number;
  volB: number;
  mass: number;
  add: number;
  set: (patch: Partial<Omit<Bench, 'set'>>) => void;
}
export type BenchState = Omit<Bench, 'set'>;
export const BENCH_IDLE: BenchState = { snap: null, stirUntil: 0, pourUntil: 0, volA: 50, volB: 50, mass: 4, add: 1 };
export const useBench = create<Bench>((set) => ({ ...BENCH_IDLE, set: (patch) => set(patch) }));
