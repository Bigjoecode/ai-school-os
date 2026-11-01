import { create } from 'zustand';

/**
 * The salts bench's own view state (not saved): animation timestamps
 * (stirring, pouring, spotting) and the choices the dock holds before they
 * are used (the baseline's height, the solvent and its depth).
 */
interface Bench {
  stirUntil: number;
  pourUntil: number;
  spotAt: number;
  lineAt: number;
  solvent: 'WATER' | 'ETHANOL';
  depth: number;
  set: (patch: Partial<Omit<Bench, 'set'>>) => void;
}
export type BenchState = Omit<Bench, 'set'>;
export const BENCH_IDLE: BenchState = { stirUntil: 0, pourUntil: 0, spotAt: 0, lineAt: 1.5, solvent: 'WATER', depth: 1 };
export const useBench = create<Bench>((set) => ({ ...BENCH_IDLE, set: (patch) => set(patch) }));
