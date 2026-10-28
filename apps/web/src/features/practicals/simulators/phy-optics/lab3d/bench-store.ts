import { create } from 'zustand';

/**
 * The optical bench's own view state (not saved): the rough focus (the
 * lens or mirror turned to the window and the hand-held screen's distance),
 * which holder's mark the eye-level view reads, the alignment animation.
 */
export type ReadAt = 'screen' | 'u';
interface Bench {
  /** Focusing the distant window for the rough focal length. */
  rough: boolean;
  /** The hand-held screen's distance from the lens or mirror during the rough focus (cm). */
  roughS: number;
  /** The holder whose mark the eye-level view reads. */
  readAt: ReadAt;
  /** When the centres were last lined up (ms timestamp: the lens or mirror slides to the axis). */
  alignAt: number | null;
  set: (patch: Partial<Omit<Bench, 'set'>>) => void;
}
export type BenchState = Omit<Bench, 'set'>;
export const BENCH_IDLE: BenchState = { rough: false, roughS: 25, readAt: 'screen', alignAt: null };
export const useBench = create<Bench>((set) => ({ ...BENCH_IDLE, set: (patch) => set(patch) }));
