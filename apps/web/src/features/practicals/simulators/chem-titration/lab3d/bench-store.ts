import { create } from 'zustand';

/**
 * The titration bench's own view state (the kit's store holds the generic
 * camera / selection / assistant state): pipetting, the burette tap, and the
 * timestamps the swirl and drop animations read.
 */
interface Bench {
  /** Pipette sequence in progress: drawn up to the mark, drained into the flask. */
  pip: 'idle' | 'filled' | 'drained';
  /** The pipetting in progress is for an extra rough titration. */
  pipRough: boolean;
  /** Animations: swirling until (ms timestamp), the last single drop (ms timestamp). */
  swirlUntil: number;
  dropAt: number;
  streaming: boolean;
  /** Burette tap angle, 0 (closed) to 1 (fully open): < 0.15 closed, < 0.55 dropwise, else a stream. */
  tap: number;
  set: (patch: Partial<Omit<Bench, 'set'>>) => void;
}
export type BenchState = Omit<Bench, 'set'>;
export const BENCH_IDLE: BenchState = { pip: 'idle', pipRough: false, swirlUntil: 0, dropAt: 0, streaming: false, tap: 0 };
export const useBench = create<Bench>((set) => ({ ...BENCH_IDLE, set: (patch) => set(patch) }));
export const tapLevel = (tap: number) => (tap < 0.15 ? 'closed' : tap < 0.55 ? 'drops' : 'stream');
