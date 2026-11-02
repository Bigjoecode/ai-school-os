import { create } from 'zustand';

/**
 * The acids bench's own view state (not saved): animation timestamps
 * (shaking a tube, pouring, crushing, a splint flaring, shaking the flask).
 */
interface Bench {
  shakeUntil: number;
  shakeId: string;
  pourUntil: number;
  crushUntil: number;
  popAt: number;
  set: (patch: Partial<Omit<Bench, 'set'>>) => void;
}
export type BenchState = Omit<Bench, 'set'>;
export const BENCH_IDLE: BenchState = { shakeUntil: 0, shakeId: '', pourUntil: 0, crushUntil: 0, popAt: 0 };
export const useBench = create<Bench>((set) => ({ ...BENCH_IDLE, set: (patch) => set(patch) }));
