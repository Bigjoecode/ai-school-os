import type { BioSpecimensState } from '@aischool/shared';
import { create } from 'zustand';
import type { CameraPresets } from '../../../lab3d-kit/controls';
import type { Spot } from '../../../lab3d-kit/store';

/**
 * The specimen bench's 3D-only state (coat and gloves on, apparatus
 * collected, specimens measured with the ruler, hands washed), read back from
 * the attempt's own action log — the grader only reads the 2D fields
 * (names, groups, labels, features, the measurement, the comparison).
 */

export type ApparatusId = 'lens' | 'ruler' | 'forceps' | 'scalpel' | 'board' | 'thermometer' | 'burner' | 'testTubes';
export const APPARATUS_LABEL: Record<ApparatusId, string> = {
  lens: 'Hand lens',
  ruler: '30 cm ruler',
  forceps: 'Forceps',
  scalpel: 'Scalpel',
  board: 'Dissecting board',
  thermometer: 'Thermometer',
  burner: 'Bunsen burner',
  testTubes: 'Test tubes in a rack',
};
export const NEEDED: ApparatusId[] = ['lens', 'ruler'];
export const CUPBOARD: ApparatusId[] = ['lens', 'ruler', 'forceps', 'scalpel', 'board', 'thermometer', 'burner', 'testTubes'];
export const DISTRACTORS: ApparatusId[] = ['thermometer', 'burner', 'testTubes'];

export interface SceneState {
  coat: boolean;
  goggles: boolean;
  gloves: boolean;
  collected: Set<ApparatusId>;
  /** Letters measured against the ruler. */
  measured: Set<string>;
  washed: boolean;
  /** Washed after the gloves came off (the end of the practical). */
  washedAtEnd: boolean;
}

export function sceneFromState(s: BioSpecimensState): SceneState {
  const out: SceneState = { coat: false, goggles: false, gloves: false, collected: new Set(), measured: new Set(), washed: false, washedAtEnd: false };
  // Work started in the 2D lab: the hand lens and the ruler are already on the bench.
  const firstCollect = s.log.findIndex((e) => e.a.startsWith('collect:'));
  const first2d = s.log.findIndex((e) => /^(lens:|labels:|class:|drawing)/.test(e.a));
  if (first2d >= 0 && (firstCollect < 0 || first2d < firstCollect)) for (const x of NEEDED) out.collected.add(x);
  let glovesOffAt = -1;
  s.log.forEach(({ a }, i) => {
    const [verb, arg] = a.split(':') as [string, string | undefined];
    if (verb === 'safety' && arg === 'coat') out.coat = true;
    else if (verb === 'safety' && arg === 'goggles') out.goggles = true;
    else if (verb === 'safety' && arg === 'gloves') out.gloves = true;
    else if (verb === 'safety-off' && arg === 'coat') out.coat = false;
    else if (verb === 'safety-off' && arg === 'goggles') out.goggles = false;
    else if (verb === 'safety-off' && arg === 'gloves') {
      out.gloves = false;
      glovesOffAt = i;
    } else if (verb === 'collect' && arg) out.collected.add(arg as ApparatusId);
    else if (verb === 'return' && arg) out.collected.delete(arg as ApparatusId);
    else if (verb === 'ruler' && arg) out.measured.add(arg);
    else if (verb === 'wash-hands') {
      out.washed = true;
      if (glovesOffAt >= 0 && !out.gloves) out.washedAtEnd = true;
    } else if (verb === 'set' || verb === 'change-set') Object.assign(out, { measured: new Set(), washedAtEnd: false });
  });
  return out;
}

/** Where things are on the bench (station-local metres). */
export const SPOT = {
  trays: [-0.62, -0.31, 0, 0.31, 0.62],
  trayZ: -0.1,
  lens: [0.28, 0, 0.28] as const,
  ruler: [-0.12, 0, 0.3] as const,
  gloves: [0.98, 0, -0.26] as const,
  tools: [-0.62, 0, 0.3] as const,
  card: [-0.92, 0, -0.3] as const,
  book: [0.86, 0, 0.27] as const,
  extras: [-0.98, 0, 0.27] as const,
};
export const trayAt = (i: number, n: number): [number, number, number] => {
  const xs = n <= 3 ? [-0.42, 0, 0.42] : n === 4 ? [-0.6, -0.2, 0.2, 0.6] : SPOT.trays;
  return [xs[i] ?? 0, 0, SPOT.trayZ];
};
export const SPEC_VIEWS: CameraPresets = {
  // A little further back than the kit's bench view, so five specimens (trays and display stands) fit across a 1366-wide screen.
  bench: { target: [0, 0.1, -0.04], dist: 1.35, pitch: 0.66 },
  trays: { target: [0, 0.04, SPOT.trayZ], dist: 1.0, pitch: 0.75 },
  tools: { target: [0.05, 0.02, 0.26], dist: 0.7, pitch: 0.85 },
};
export const SPEC_VIEW_BUTTONS = [
  { id: 'bench', label: 'Whole bench' },
  { id: 'trays', label: 'Specimens' },
  { id: 'tools', label: 'Lens and ruler' },
];
export const specSpot = (i: number, n: number): Spot => {
  const [x, , z] = trayAt(i, n);
  return { target: [x, 0.03, z], dist: 0.45, pitch: 0.85, yaw: 0.05 };
};
export const SPOTS: Record<string, Spot> = {
  bench: { target: [0, 0.1, -0.04], dist: 1.35, pitch: 0.66 },
  trays: { target: [0, 0.04, SPOT.trayZ], dist: 0.95, pitch: 0.78 },
  tools: { target: [0.08, 0.02, 0.26], dist: 0.6, pitch: 0.85 },
  gloves: { target: [SPOT.gloves[0], 0.04, SPOT.gloves[2]], dist: 0.5, pitch: 0.5, yaw: -0.3 },
};

/** The specimen bench's own view state: which specimen the hand lens / ruler view shows. */
interface Bench {
  /** The specimen in front of the student (index on the bench). */
  current: number;
  /** What the close-up view shows. */
  look: 'lens' | 'ruler';
  /** The answer sheet's open specimen tab. */
  tab: number;
  set: (patch: Partial<Omit<Bench, 'set'>>) => void;
}
export const BENCH_IDLE = { current: 0, look: 'lens' as const, tab: 0 };
export const useBench = create<Bench>((set) => ({ ...BENCH_IDLE, set: (patch) => set(patch) }));
