import { create } from 'zustand';
import type { PinId } from '../actions';

/**
 * The pin bench's own view state (not saved): the pin in hand, sighting at
 * paper level and the eye's angle, the P₁/P₂ distances for the buttons, the
 * drawing animation, which sheet is shown, the next angle; looking down on
 * the stack (depth) and looking at the screen (dispersion).
 */
interface Bench {
  tool: PinId | null;
  sight: boolean;
  /** Eye angle φ (°) on its circle; null: a little off the line, to start. */
  phi: number | null;
  dist: { p1: number; p2: number };
  nudgePin: 'p3' | 'p4';
  anim: { kind: 'normal' | 'ray' | 'join' | 'pin'; at: number } | null;
  viewing: number | null;
  nextI: number | null;
  /** Depth: looking vertically down on the stack. */
  look: boolean;
  /** Dispersion: looking at the screen. */
  screen: boolean;
  set: (patch: Partial<Omit<Bench, 'set'>>) => void;
}
export type BenchState = Omit<Bench, 'set'>;
export const BENCH_IDLE: BenchState = { tool: null, sight: false, phi: null, dist: { p1: 10, p2: 3 }, nudgePin: 'p3', anim: null, viewing: null, nextI: null, look: false, screen: false };
export const useBench = create<Bench>((set) => ({ ...BENCH_IDLE, set: (patch) => set(patch) }));
