import { POTATO_MAX_CYL, bioOsmosisVariant, roundDp, type BioOsmosisVariant, type OsmoTask } from '@aischool/shared';
import { create } from 'zustand';
import type { CameraPresets } from '../../../lab3d-kit/controls';
import { STATION } from '../../../lab3d-kit/layout';
import type { Spot } from '../../../lab3d-kit/store';

/**
 * The osmosis bench: where things stand (station-local metres: x along the
 * bench, y up from its top, z towards the student), the camera presets, the
 * bench's own view state (the cylinder or cube in hand and where it lies) and
 * the demo / sandbox variants.
 */

type V3 = readonly [number, number, number];
export const OSPOT = {
  card: [-0.95, 0, -0.18] as V3,
  book: [-0.98, 0, 0.27] as V3,
  extras: [-1.14, 0, 0.0] as V3,
  // potato
  tile: [-0.32, 0, 0.12] as V3,
  tuber: [-0.5, 0, 0.0] as V3,
  borer: [-0.14, 0, 0.22] as V3,
  scalpel: [-0.12, 0, 0.12] as V3,
  ruler: [0.24, 0, 0.24] as V3,
  balance: [0.64, 0, 0.06] as V3,
  paper: [0.26, 0, 0.04] as V3,
  forceps: [0.02, 0, 0.27] as V3,
  clock: [0.66, 0, -0.24] as V3,
  // plasmolysis
  scope: [0.3, 0, -0.1] as V3,
  slideTile: [-0.16, 0, 0.14] as V3,
  onion: [-0.5, 0, 0.1] as V3,
  droppers: [-0.56, 0, -0.24] as V3,
  needle: [0.02, 0, 0.26] as V3,
  // agar
  block: [-0.34, 0, 0.12] as V3,
  acidBeaker: [0.3, 0, -0.08] as V3,
  acidBottle: [0.58, 0, -0.26] as V3,
  stopwatch: [0.62, 0, 0.16] as V3,
};
/** The solution beakers along the back of the bench (one per cylinder). */
export const beakerSpot = (k: number): V3 => [-0.62 + k * 0.125, 0, -0.26];
/** Cylinders waiting on the tile (before and after soaking). */
export const cylOnTile = (k: number): V3 => [OSPOT.tile[0] - 0.035 + (k % 3) * 0.035, 0.008, OSPOT.tile[2] - 0.02 + Math.floor(k / 3) * 0.065];
/** Agar cubes on the tile before they go into the acid. */
export const cubeOnTile = (k: number): V3 => [OSPOT.block[0] + 0.14 - (k % 3) * 0.05, 0.008, OSPOT.block[2] + 0.02 - Math.floor(k / 3) * 0.05];

const local = (p: V3, y: number): [number, number, number] => [p[0], y, p[2]];
export const OSMO_VIEWS: CameraPresets = {
  tile: { target: local(OSPOT.tile, 0.04), dist: 0.5, pitch: 0.55 },
  beakers: { target: [beakerSpot(3)[0], 0.06, -0.24], dist: 0.85, pitch: 0.38 },
  ruler: { target: local(OSPOT.ruler, 0.01), dist: 0.38, pitch: 0.85 },
  balance: { target: local(OSPOT.balance, 0.05), dist: 0.42, pitch: 0.45 },
  scope: { target: local(OSPOT.scope, 0.2), dist: 0.72, pitch: 0.2, yaw: -0.4 },
  slide: { target: local(OSPOT.slideTile, 0.01), dist: 0.36, pitch: 0.8 },
  acid: { target: local(OSPOT.acidBeaker, 0.06), dist: 0.48, pitch: 0.3 },
  block: { target: local(OSPOT.block, 0.03), dist: 0.48, pitch: 0.6 },
};
export const VIEW_BUTTONS: Record<OsmoTask, { id: string; label: string }[]> = {
  POTATO: [
    { id: 'bench', label: 'Whole bench' },
    { id: 'tile', label: 'Tile' },
    { id: 'beakers', label: 'Beakers' },
    { id: 'balance', label: 'Balance' },
  ],
  PLASMOLYSIS: [
    { id: 'bench', label: 'Whole bench' },
    { id: 'slide', label: 'Slide' },
    { id: 'scope', label: 'Microscope' },
  ],
  AGAR: [
    { id: 'bench', label: 'Whole bench' },
    { id: 'block', label: 'Tile' },
    { id: 'acid', label: 'Beaker of acid' },
  ],
};
export const spotOf = (p: V3, y: number, dist: number, pitch = 0.3, yaw?: number): Spot => ({ target: [p[0], y, p[2]], dist, pitch, ...(yaw !== undefined ? { yaw } : {}) });
export const world = (p: V3, y = 0): [number, number, number] => [STATION[0] + p[0], STATION[1] + p[1] + y, STATION[2] + p[2]];

/** The bench's view state: the cylinder / cube in hand and where it lies (on the ruler, the balance, or the tile). */
export type Lying = 'tile' | 'ruler' | 'balance';
interface OsmoBench {
  sel: number;
  lying: Lying;
  /** Cells marked while counting (plasmolysis). */
  tally: number[];
  set: (p: Partial<Omit<OsmoBench, 'set'>>) => void;
}
export const BENCH_IDLE = { sel: 0, lying: 'tile' as Lying, tally: [] as number[] };
export const useOsmoBench = create<OsmoBench>((set) => ({ ...BENCH_IDLE, set: (p) => set(p) }));

// ------------------------------------------------------------------ demo and sandbox variants

/** The demonstration's material: never the student's own (the demo would give their answers away). */
export function demoVariant(studentSeed: number, task: OsmoTask): BioOsmosisVariant {
  const mine = bioOsmosisVariant(studentSeed, task);
  for (let s = 9001; s < 9400; s++) {
    const v = bioOsmosisVariant(s, task);
    if (Math.abs(v.potato.iso - mine.potato.iso) >= 0.03 && Math.abs(v.agar.k - mine.agar.k) >= 0.08 && v.plas.countIdx.length !== mine.plas.countIdx.length) return v;
  }
  return bioOsmosisVariant(9001, task);
}

export const TUBERS = [
  { id: 'irish', label: 'Irish potato (cell sap ≈ 0.30 mol/dm³)', iso: 0.3 },
  { id: 'yam', label: 'Yam (≈ 0.38 mol/dm³)', iso: 0.38 },
  { id: 'sweet', label: 'Sweet potato (≈ 0.45 mol/dm³)', iso: 0.45 },
  { id: 'cassava', label: 'Cassava (≈ 0.24 mol/dm³)', iso: 0.24 },
];
export const SAPS = [
  { id: 'weak', label: 'Weak cell sap (plasmolyses easily, ≈ 0.30 mol/dm³)', c: 0.3 },
  { id: 'typical', label: 'Typical red onion (≈ 0.42 mol/dm³)', c: 0.42 },
  { id: 'strong', label: 'Strong cell sap (≈ 0.65 mol/dm³)', c: 0.65 },
];
export const ACIDS = [
  { id: '0.05', label: '0.05 mol/dm³ HCl', f: Math.SQRT1_2 },
  { id: '0.1', label: '0.1 mol/dm³ HCl (the lesson)', f: 1 },
  { id: '0.2', label: '0.2 mol/dm³ HCl', f: Math.SQRT2 },
];
/** A sandbox variant: a chosen tuber, cell sap or acid. */
export function sandboxVariant(task: OsmoTask, o: { tuber: string; sap: string; acid: string }, seed = 515_151): BioOsmosisVariant {
  const v = bioOsmosisVariant(seed, task);
  const iso = TUBERS.find((t) => t.id === o.tuber)?.iso ?? 0.3;
  const c = SAPS.find((x) => x.id === o.sap)?.c ?? 0.42;
  const f = ACIDS.find((x) => x.id === o.acid)?.f ?? 1;
  return {
    ...v,
    potato: { ...v.potato, iso },
    plas: { ...v.plas, meanC: c, cells: v.plas.cells.map((x) => ({ ...x, c: roundDp(Math.max(0.15, x.c - v.plas.meanC + c), 3) })) },
    agar: { ...v.agar, k: roundDp(v.agar.k * f, 3) },
  };
}
export const MAX_CYL = POTATO_MAX_CYL;
