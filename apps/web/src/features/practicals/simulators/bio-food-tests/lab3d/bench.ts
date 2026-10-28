import { FOODS, FOOD_BY_ID, FOOD_LETTERS, bioFoodVariant, type AmyBath, type BioFoodVariant, type FoodTask } from '@aischool/shared';
import { create } from 'zustand';
import type { CameraPresets } from '../../../lab3d-kit/controls';
import { STATION } from '../../../lab3d-kit/layout';
import type { Spot } from '../../../lab3d-kit/store';

/**
 * The food-tests bench: where things stand (station-local metres: x along the
 * bench, y up from its top, z towards the student), the camera presets, the
 * bench's own view state (the tube in use, the heating animation) and the
 * demo / sandbox variants.
 */

type V3 = readonly [number, number, number];
export const FSPOT = {
  samples: [-0.72, 0, -0.24] as V3,
  rack: [-0.3, 0, -0.27] as V3,
  /** The tube in use, in its stand. */
  tube: [0.02, 0, 0.04] as V3,
  /** The boiling water bath: beaker on a tripod over the Bunsen burner. */
  bath: [0.4, 0, 0.0] as V3,
  reagents: [0.62, 0, -0.31] as V3,
  holder: [0.0, 0, 0.27] as V3,
  paper: [-0.32, 0, 0.17] as V3,
  cylinder: [-0.56, 0, 0.18] as V3,
  card: [-0.95, 0, -0.18] as V3,
  book: [-0.98, 0, 0.27] as V3,
  extras: [-1.12, 0, 0.0] as V3,
  // amylase
  tile: [-0.24, 0, 0.17] as V3,
  stopwatch: [-0.5, 0, 0.24] as V3,
  amyReagents: [-0.72, 0, -0.26] as V3,
};
/** The amylase baths along the back of the bench (the boiling one is the water bath on the burner). */
export const AMY_BATH_X: Record<AmyBath, number> = { ICE: -0.2, ROOM: -0.04, BODY: 0.12, WARM: 0.27, BOILING: FSPOT.bath[0] };
export const AMY_BATH_Z = -0.15;
export const amyBathSpot = (b: AmyBath): V3 => (b === 'BOILING' ? FSPOT.bath : [AMY_BATH_X[b], 0, AMY_BATH_Z]);
/** The sample beakers P, Q, R. */
export const sampleSpot = (k: number): V3 => [FSPOT.samples[0] + k * 0.13, 0, FSPOT.samples[2]];
/** Height of the water bath's beaker base above the bench (on the tripod). */
export const BATH_TOP = 0.235;

const local = (p: V3, y: number): [number, number, number] => [p[0], y, p[2]];
export const FOOD_VIEWS: CameraPresets = {
  tube: { target: local(FSPOT.tube, 0.09), dist: 0.42, pitch: 0.16 },
  bath: { target: local(FSPOT.bath, 0.27), dist: 0.62, pitch: 0.25 },
  samples: { target: [FSPOT.samples[0] + 0.13, 0.06, FSPOT.samples[2]], dist: 0.62, pitch: 0.4 },
  reagents: { target: [FSPOT.reagents[0] + 0.16, 0.05, FSPOT.reagents[2] + 0.04], dist: 0.72, pitch: 0.42 },
  tile: { target: local(FSPOT.tile, 0.01), dist: 0.42, pitch: 0.95 },
  baths: { target: [0.22, 0.08, -0.08], dist: 0.9, pitch: 0.35 },
};
export const FOOD_VIEW_BUTTONS = [
  { id: 'bench', label: 'Whole bench' },
  { id: 'tube', label: 'Test tube' },
  { id: 'bath', label: 'Water bath' },
  { id: 'samples', label: 'Samples' },
];
export const AMY_VIEW_BUTTONS = [
  { id: 'bench', label: 'Whole bench' },
  { id: 'tile', label: 'Spotting tile' },
  { id: 'baths', label: 'Baths' },
  { id: 'tube', label: 'Test tube' },
];
/** Spots for Learn and the demo. */
export const spotOf = (p: V3, y: number, dist: number, pitch = 0.3, yaw?: number): Spot => ({ target: [p[0], y, p[2]], dist, pitch, ...(yaw !== undefined ? { yaw } : {}) });
/** A bench point in world coordinates. */
export const world = (p: V3, y = 0): [number, number, number] => [STATION[0] + p[0], STATION[1] + p[1] + y, STATION[2] + p[2]];

/** The bench's view state: the tube in use (index into tests) and the heating animation. */
interface FoodBench {
  active: number;
  /** A tube was just heated: its colour runs on from `from` s to its new heat (animation start, performance.now()). */
  anim: { i: number; from: number; at: number } | null;
  set: (p: Partial<Omit<FoodBench, 'set'>>) => void;
}
export const BENCH_IDLE = { active: -1, anim: null };
export const useFoodBench = create<FoodBench>((set) => ({ ...BENCH_IDLE, set: (p) => set(p) }));
/** The heating animation's length (ms) for one press. */
export const HEAT_ANIM_MS = 1800;

// ------------------------------------------------------------------ demo and sandbox variants

/** The demonstration's samples: never the student's own (the demo would give their answers away). */
export function demoVariant(studentSeed: number, task: FoodTask): BioFoodVariant {
  const mine = bioFoodVariant(studentSeed, task);
  if (task === 'AMYLASE') {
    for (let s = 7001; s < 7400; s++) {
      const v = bioFoodVariant(s, task);
      if (Math.abs(v.amy.t37 - mine.amy.t37) >= 12) return v;
    }
    return bioFoodVariant(7001, task);
  }
  const ids = mine.samples.map((x) => x.food.id);
  // Mrs Okon's own bench: glucose (colours develop in the bath), sugar (the non-reducing test) and groundnut paste (protein and fat) — or other foods when the student has those.
  const prefer = ['glucose', 'sucrose', 'groundnut'];
  const alt = ['honey', 'cane', 'milk'];
  const pick = prefer.map((id, k) => (ids.includes(id) ? alt[k]! : id));
  return foodsVariant(pick, 7001);
}

/** A variant with chosen foods for P, Q and R (the demo and the sandbox). */
export function foodsVariant(ids: string[], seed = 424_242): BioFoodVariant {
  const base = bioFoodVariant(seed, 'FOOD');
  const r = (() => {
    let x = seed % 997;
    return () => ((x = (x * 9301 + 49297) % 233280) / 233280);
  })();
  const samples = FOOD_LETTERS.map((letter, k) => {
    const food = FOOD_BY_ID[ids[k] ?? ''] ?? FOODS[k]!;
    return { letter, food, content: food.content(r) };
  });
  return { ...base, samples, minRows: 12 };
}

/** An amylase variant with a chosen saliva activity (the sandbox). */
export function amyVariant(t37: number, seed = 424_242): BioFoodVariant {
  const base = bioFoodVariant(seed, 'AMYLASE');
  return { ...base, amy: { ...base.amy, t37 } };
}
