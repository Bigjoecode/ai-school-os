import type { OhmsTerminal } from '@aischool/shared';
import { create } from 'zustand';

/** The circuit bench's own view state: the terminal a wire is being joined from, and which meter the reading view reads. */
interface Bench {
  picked: OhmsTerminal | null;
  meter: 'A' | 'V';
  set: (patch: Partial<Omit<Bench, 'set'>>) => void;
}
export type BenchState = Omit<Bench, 'set'>;
export const BENCH_IDLE: BenchState = { picked: null, meter: 'A' };
export const useBench = create<Bench>((set) => ({ ...BENCH_IDLE, set: (patch) => set(patch) }));

/** The wire being dragged out of a terminal (station-local end point), read by the station each frame. */
export const wireDrag = { from: null as OhmsTerminal | null, to: [0, 0, 0] as [number, number, number], over: null as OhmsTerminal | null };
