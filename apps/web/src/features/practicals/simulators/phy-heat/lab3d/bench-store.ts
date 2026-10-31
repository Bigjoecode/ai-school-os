import type { HeatThermo } from '@aischool/shared';
import { create } from 'zustand';

/**
 * The heat bench's own view state (not saved): which thermometer the
 * eye-level view reads, the dock's tab and the ice options (dried, melting
 * ice).
 */
interface Bench {
  thermo: HeatThermo | null;
  tab: 'work' | 'balance';
  dry: boolean;
  melting: boolean;
  set: (patch: Partial<Omit<Bench, 'set'>>) => void;
}
export type BenchState = Omit<Bench, 'set'>;
export const BENCH_IDLE: BenchState = { thermo: null, tab: 'work', dry: true, melting: true };
export const useBench = create<Bench>((set) => ({ ...BENCH_IDLE, set: (patch) => set(patch) }));
