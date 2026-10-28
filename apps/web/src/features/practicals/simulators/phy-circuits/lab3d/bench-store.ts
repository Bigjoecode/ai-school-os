import type { CircuitsTerminal } from '@aischool/shared';
import { create } from 'zustand';

/** The bench's own view state: the terminal a wire is being joined from, and what the eye-level view reads. */
export type ReadTarget = 'A' | 'V' | 'G' | 'L';
interface Bench {
  picked: CircuitsTerminal | null;
  meter: ReadTarget;
  set: (patch: Partial<Omit<Bench, 'set'>>) => void;
}
export type BenchState = Omit<Bench, 'set'>;
export const BENCH_IDLE: BenchState = { picked: null, meter: 'A' };
export const useBench = create<Bench>((set) => ({ ...BENCH_IDLE, set: (patch) => set(patch) }));

/** The wire being dragged out of a terminal (station-local end point), read by the station each frame. */
export const wireDrag = { from: null as CircuitsTerminal | null, to: [0, 0, 0] as [number, number, number], over: null as CircuitsTerminal | null };
