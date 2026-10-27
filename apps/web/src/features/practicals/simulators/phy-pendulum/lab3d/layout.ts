import { create } from 'zustand';

/**
 * Where everything stands on the student's bench (station-local metres: x
 * along the bench, y up from the bench top, z towards the student; the bench's
 * front edge is at z = 0.45). The retort stand stands near the front edge with
 * its clamp reaching out past it, so the pendulum hangs in front of the bench
 * and swings left–right, across the student's view.
 */
export type V3 = [number, number, number];

export const STAND = { base: [0.55, 0, 0.3] as V3, rod: [0.55, 0, 0.24] as V3, rodH: 1.06 };
/** The point of suspension: the bottom of the split cork, held in the clamp. */
export const PIVOT: V3 = [0.55, 0.985, 0.6];
/** The white card with the fiducial line, behind the bob. */
export const CARD = { x: PIVOT[0], z: PIVOT[2] - 0.035, top: 0.95, bottom: -0.2, w: 0.15 };
/** The metre rule hangs beside the thread, its zero level with the point of suspension (moved aside while the bob swings). */
export const RULE = { x: PIVOT[0] + 0.022, z: PIVOT[2] + 0.012, aside: PIVOT[0] - 0.2 };
export const SPOT = {
  stopwatch: [0.18, 0, 0.3] as V3,
  card: [-0.86, 0, -0.2] as V3,
  book: [-0.3, 0, 0.25] as V3,
  extras: [-1.0, 0, 0.2] as V3,
};

/** Bob centre below the pivot (m) for a thread length to the top of the bob (cm) and a bob radius (cm). */
export const bobDrop = (threadCm: number, radiusCm: number) => (threadCm + radiusCm) / 100;

/** The bench's own view state: the bob held aside (degrees) while it is being displaced, the dock's tab. */
interface Bench {
  /** The bob pulled aside by a drag (signed degrees), or null. */
  pull: number | null;
  tab: 'setup' | 'time';
  set: (patch: Partial<Omit<Bench, 'set'>>) => void;
}
export type BenchState = Omit<Bench, 'set'>;
export const BENCH_IDLE: BenchState = { pull: null, tab: 'setup' };
export const useBench = create<Bench>((set) => ({ ...BENCH_IDLE, set: (patch) => set(patch) }));

/** A clock that can run faster than real time (the demo's time-lapse while 20 oscillations are timed). */
export function makeClock() {
  let base = 0;
  let at = performance.now();
  let rate = 1;
  const now = () => base + (performance.now() - at) * rate;
  return {
    now,
    rate: () => rate,
    setRate(r: number) {
      base = now();
      at = performance.now();
      rate = r;
    },
  };
}
export type Clock = ReturnType<typeof makeClock>;
