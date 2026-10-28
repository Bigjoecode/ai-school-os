import { create } from 'zustand';

/**
 * The knife edge's own view state (not saved): which mark the eye-level view
 * reads, when the rule was last steadied and let go (the tilt restarts from
 * level), and where a drag of the rule started.
 */
export type ReadAt = 'edge' | 'known' | 'other';
interface Bench {
  readAt: ReadAt;
  /** Bumped by "Steady it and let go": the rule is released level again. */
  release: number;
  /** A drag of the rule along the knife edge: the pointer's x (m, station-local) and the pivot mark when it started. */
  dragFrom: { x: number; pivot: number } | null;
  set: (patch: Partial<Omit<Bench, 'set'>>) => void;
}
export type BenchState = Omit<Bench, 'set'>;
export const BENCH_IDLE: BenchState = { readAt: 'edge', release: 0, dragFrom: null };
export const useBench = create<Bench>((set) => ({ ...BENCH_IDLE, set: (patch) => set(patch) }));
