import { bioGeneticsVariant, roundDp, type BioGeneticsVariant, type GenTask } from '@aischool/shared';
import { create } from 'zustand';
import type { CameraPresets } from '../../../lab3d-kit/controls';
import { BENCH, STATION } from '../../../lab3d-kit/layout';
import type { Spot } from '../../../lab3d-kit/store';

/**
 * The genetics bench: where things stand (station-local metres: x along the
 * bench, y up from its top, z towards the student), the camera presets, the
 * bench's own view state (animation times) and the demo / sandbox variants.
 */

type V3 = readonly [number, number, number];
export const FLOOR = -BENCH.h;
export const GSPOT = {
  card: [-0.95, 0, -0.18] as V3,
  book: [-0.98, 0, 0.27] as V3,
  extras: [-1.16, 0, 0.0] as V3,
  // height
  board: [1.72, FLOOR, -0.32] as V3,
  setsquare: [0.95, 0, 0.12] as V3,
  ruler: [0.55, 0, 0.05] as V3,
  tape: [0.25, 0, 0.2] as V3,
  graph: [-0.7, 0, 0.3] as V3,
  hand: [0.55, 0.012, -0.08] as V3,
  // discontinuous
  mirror: [0.35, 0, 0.05] as V3,
  cards: [-0.2, 0, -0.1] as V3,
  sheet: [-0.5, 0, 0.18] as V3,
  protractor: [0.0, 0, 0.25] as V3,
  // cross
  beakerA: [-0.22, 0, -0.08] as V3,
  beakerB: [0.22, 0, -0.08] as V3,
  beads: [0.6, 0, -0.1] as V3,
  tray: [0, 0, 0.18] as V3,
  // food
  notes: [0.0, 0, -0.05] as V3,
  net: [1.05, 0, -0.25] as V3,
  pooter: [0.75, 0, 0.2] as V3,
  lens: [0.5, 0, 0.25] as V3,
  gloves: [0.9, 0, 0.25] as V3,
  idchart: [-0.55, 0, -0.32] as V3,
};
/** Where the classmate being surveyed sits across the bench (DISCRETE), and the queue for the board (HEIGHT). */
export const SEAT: [number, number] = [0.3, -0.72];
export const QUEUE: [number, number][] = [
  [2.2, -0.9],
  [2.55, -0.75],
  [2.9, -0.95],
];
/** The field spot cards on the bench (FOOD): two rows. */
export const SPOT_AT = (k: number): [number, number, number] => [-0.48 + (k % 4) * 0.26, 0.002, -0.14 + Math.floor(k / 4) * 0.22];

const local = (p: V3, y: number): [number, number, number] => [p[0], y, p[2]];
export const GEN_VIEWS: CameraPresets = {
  board: { target: [GSPOT.board[0], 0.55, GSPOT.board[2]], dist: 2.0, pitch: 0.05 },
  head: { target: [GSPOT.board[0], 0.75, GSPOT.board[2] + 0.05], dist: 0.8, pitch: 0.08 },
  hand: { target: local(GSPOT.hand, 0.02), dist: 0.5, pitch: 0.7 },
  partner: { target: [SEAT[0], 0.3, SEAT[1] + 0.2], dist: 1.0, pitch: 0.15 },
  cards: { target: local(GSPOT.cards, 0.03), dist: 0.55, pitch: 0.7 },
  beakers: { target: [0, 0.06, -0.02], dist: 0.65, pitch: 0.45 },
  field: { target: [-0.1, 0.02, -0.02], dist: 0.9, pitch: 0.95 },
  net: { target: local(GSPOT.net, 0.15), dist: 0.8, pitch: 0.3 },
};
export const VIEW_BUTTONS: Record<GenTask, { id: string; label: string }[]> = {
  HEIGHT: [
    { id: 'bench', label: 'Whole bench' },
    { id: 'board', label: 'Height board' },
    { id: 'hand', label: 'Hand span' },
  ],
  DISCRETE: [
    { id: 'bench', label: 'Whole bench' },
    { id: 'partner', label: 'Classmate' },
    { id: 'cards', label: 'Health cards' },
  ],
  CROSS: [
    { id: 'bench', label: 'Whole bench' },
    { id: 'beakers', label: 'Beakers' },
  ],
  FOOD: [
    { id: 'bench', label: 'Whole bench' },
    { id: 'field', label: 'Field notes' },
    { id: 'net', label: 'Sweep net' },
  ],
};
export const FOCUS_OF: Record<GenTask, string> = { HEIGHT: 'board', DISCRETE: 'partner', CROSS: 'beakers', FOOD: 'field' };
export const spotOf = (p: V3, y: number, dist: number, pitch = 0.3, yaw?: number): Spot => ({ target: [p[0], y, p[2]], dist, pitch, ...(yaw !== undefined ? { yaw } : {}) });
export const world = (p: V3, y = 0): [number, number, number] => [STATION[0] + p[0], STATION[1] + p[1] + y, STATION[2] + p[2]];

interface GenBench {
  /** Animation times (performance.now ms). */
  measureAt: number;
  spanAt: number;
  rollAt: number;
  cardAt: number;
  drawAt: number;
  surveyAt: number;
  set: (p: Partial<Omit<GenBench, 'set'>>) => void;
}
export const BENCH_IDLE = { measureAt: 0, spanAt: 0, rollAt: 0, cardAt: 0, drawAt: 0, surveyAt: 0 };
export const useGenBench = create<GenBench>((set) => ({ ...BENCH_IDLE, set: (p) => set(p) }));
export const recent = (at: number, ms: number) => at > 0 && performance.now() - at < ms;

// ------------------------------------------------------------------ demo and sandbox variants

/** The demonstration's class: never the student's own (the demo would give their answers away). */
export function demoVariant(studentSeed: number, task: GenTask): BioGeneticsVariant {
  const mine = bioGeneticsVariant(studentSeed, task);
  for (let s = 9301; s < 9700; s++) {
    const v = bioGeneticsVariant(s, task);
    if (v.height.n !== mine.height.n && v.disc.n !== mine.disc.n && v.food.energy.P !== mine.food.energy.P && v.food.counts.GRASSHOPPER !== mine.food.counts.GRASSHOPPER) return v;
  }
  return bioGeneticsVariant(9301, task);
}

export const CLASSES = [
  { id: 'typical', label: 'A typical SS2 class', dh: 0, f: 1 },
  { id: 'short', label: 'A younger class (shorter on average)', dh: -8, f: 1 },
  { id: 'tall', label: 'An older class (taller on average)', dh: 7, f: 1 },
];
export const SEASONS = [
  { id: 'rainy', label: 'Rainy season (lush grass, many insects)', f: 1.3 },
  { id: 'typical', label: 'Early dry season', f: 1 },
  { id: 'dry', label: 'Late dry season (sparse grass, few insects)', f: 0.55 },
];
/** A sandbox variant: a chosen class or season, and a new shuffle of the beads with each round. */
export function sandboxVariant(task: GenTask, o: { cls: string; season: string }, seed = 727_272): BioGeneticsVariant {
  const v = bioGeneticsVariant(seed, task);
  const c = CLASSES.find((x) => x.id === o.cls) ?? CLASSES[0]!;
  const s = SEASONS.find((x) => x.id === o.season) ?? SEASONS[1]!;
  const people = v.height.people.map((p) => ({ ...p, h: roundDp(Math.max(149, Math.min(181, p.h + c.dh)), 1) }));
  const counts = { ...v.food.counts, GRASS: Math.round((v.food.counts.GRASS * s.f) / 50) * 50, GRASSHOPPER: Math.round(v.food.counts.GRASSHOPPER * s.f), CATERPILLAR: Math.round(v.food.counts.CATERPILLAR * s.f), LIZARD: Math.max(2, Math.round(v.food.counts.LIZARD * (0.5 + s.f / 2))) };
  return { ...v, height: { ...v.height, people }, food: { ...v.food, counts } };
}
