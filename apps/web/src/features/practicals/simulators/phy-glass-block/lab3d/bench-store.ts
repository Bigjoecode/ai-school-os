import { create } from 'zustand';
import type { PinId } from '../actions';

/**
 * The glass-block bench's own view state (not saved): the pin tool in hand,
 * the eye's position along the bottom of the sheet while sighting through
 * face CD, the drawing animations and which trace's sheet is on the board.
 */
interface Bench {
  /** The pin the student is about to push in (a tap on the paper places it). */
  tool: PinId | null;
  /** Looking through face CD at eye level. */
  sight: boolean;
  /** The eye's x (cm, sheet coordinates) on the line y = EYE_Y. */
  eyeX: number;
  /** Distance along the incident ray (cm) for the P₁ / P₂ buttons. */
  dist: { p1: number; p2: number };
  nudgePin: 'p3' | 'p4';
  /** The ruler/protractor drawing animation in progress (ms timestamp of its start). */
  anim: { kind: 'normal' | 'ray' | 'join' | 'pin'; at: number } | null;
  /** A finished trace shown on the board (null: the one in progress, or the last). */
  viewing: number | null;
  /** The angle of incidence chosen for the next trace (null: 10° more than the last one). */
  nextI: number | null;
  set: (patch: Partial<Omit<Bench, 'set'>>) => void;
}
export type BenchState = Omit<Bench, 'set'>;
export const BENCH_IDLE: BenchState = { tool: null, sight: false, eyeX: 3, dist: { p1: 9, p2: 3 }, nudgePin: 'p3', anim: null, viewing: null, nextI: null };
export const useBench = create<Bench>((set) => ({ ...BENCH_IDLE, set: (patch) => set(patch) }));
