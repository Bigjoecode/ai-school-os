import { bioGrowthVariant, roundDp, type BioGrowthVariant, type GrowthTask, type SeedRef } from '@aischool/shared';
import { create } from 'zustand';
import type { CameraPresets } from '../../../lab3d-kit/controls';
import { STATION } from '../../../lab3d-kit/layout';
import type { Spot } from '../../../lab3d-kit/store';

/**
 * The growth bench: where things stand (station-local metres: x along the
 * bench, y up from its top, z towards the student), the camera presets, the
 * bench's own view state (the tube in hand, the ruler's reference point) and
 * the demo / sandbox variants.
 */

type V3 = readonly [number, number, number];
export const GSPOT = {
  card: [-0.95, 0, -0.18] as V3,
  book: [-0.98, 0, 0.27] as V3,
  extras: [-1.14, 0, 0.0] as V3,
  // germination
  rack: [-0.08, 0, -0.1] as V3,
  seeds: [-0.42, 0, 0.18] as V3,
  cotton: [-0.62, 0, -0.06] as V3,
  boiled: [0.3, 0, -0.24] as V3,
  oil: [0.44, 0, -0.02] as V3,
  labels: [0.16, 0, 0.28] as V3,
  washbottle: [-0.42, 0, -0.28] as V3,
  fridge: [0.78, 0, -0.18] as V3,
  // seedlings
  box: [-0.36, 0, -0.08] as V3,
  jar: [0.12, 0, -0.1] as V3,
  ruler: [0.38, 0, 0.22] as V3,
  soakbeaker: [-0.64, 0, -0.22] as V3,
  lens: [0.62, 0, 0.12] as V3,
  // respiration
  flaskA: [-0.3, 0, -0.14] as V3,
  flaskB: [-0.02, 0, -0.14] as V3,
  seedbeaker: [-0.62, 0, 0.14] as V3,
  disinfectant: [-0.64, 0, -0.18] as V3,
  boiler: [0.38, 0, -0.22] as V3,
  thermometers: [0.14, 0, 0.3] as V3,
  conical: [0.44, 0, 0.16] as V3,
  limewater: [0.62, 0, 0.16] as V3,
  // tropisms
  lightbox: [-0.38, 0, -0.1] as V3,
  lamp: [-0.06, 0, -0.1] as V3,
  klinostat: [0.28, 0, -0.16] as V3,
  corkjar: [0.66, 0, -0.08] as V3,
  protractor: [0.12, 0, 0.3] as V3,
  tape: [-0.62, 0, 0.26] as V3,
  pots: [-0.18, 0, 0.24] as V3,
};
/** Where tube k stands in the rack (or inside the refrigerator). */
export const tubeSpot = (k: number, fridge: boolean): V3 => (fridge ? [GSPOT.fridge[0], 0.05, GSPOT.fridge[2] + 0.02] : [GSPOT.rack[0] - 0.09 + k * 0.06, 0.012, GSPOT.rack[2]]);

const local = (p: V3, y: number): [number, number, number] => [p[0], y, p[2]];
export const GROWTH_VIEWS: CameraPresets = {
  tubes: { target: local(GSPOT.rack, 0.08), dist: 0.55, pitch: 0.25 },
  fridge: { target: local(GSPOT.fridge, 0.14), dist: 0.7, pitch: 0.2 },
  jar: { target: local(GSPOT.jar, 0.14), dist: 0.55, pitch: 0.18 },
  box: { target: local(GSPOT.box, 0.06), dist: 0.6, pitch: 0.5 },
  flasks: { target: local([(GSPOT.flaskA[0] + GSPOT.flaskB[0]) / 2, 0, GSPOT.flaskA[2]], 0.2), dist: 0.8, pitch: 0.2 },
  co2: { target: local([(GSPOT.conical[0] + GSPOT.limewater[0]) / 2, 0, GSPOT.conical[2]], 0.08), dist: 0.5, pitch: 0.35 },
  lightbox: { target: local(GSPOT.lightbox, 0.12), dist: 0.75, pitch: 0.3 },
  cork: { target: local(GSPOT.corkjar, 0.14), dist: 0.5, pitch: 0.15 },
  klino: { target: local(GSPOT.klinostat, 0.12), dist: 0.6, pitch: 0.3 },
};
export const VIEW_BUTTONS: Record<GrowthTask, { id: string; label: string }[]> = {
  GERM: [
    { id: 'bench', label: 'Whole bench' },
    { id: 'tubes', label: 'Tubes' },
    { id: 'fridge', label: 'Refrigerator' },
  ],
  SEEDLING: [
    { id: 'bench', label: 'Whole bench' },
    { id: 'jar', label: 'Seed jar' },
    { id: 'box', label: 'Sawdust box' },
  ],
  RESP: [
    { id: 'bench', label: 'Whole bench' },
    { id: 'flasks', label: 'Flasks' },
    { id: 'co2', label: 'CO₂ test' },
  ],
  TROPISM: [
    { id: 'bench', label: 'Whole bench' },
    { id: 'lightbox', label: 'Light box' },
    { id: 'klino', label: 'Clinostat' },
    { id: 'cork', label: 'Cork' },
  ],
};
export const spotOf = (p: V3, y: number, dist: number, pitch = 0.3, yaw?: number): Spot => ({ target: [p[0], y, p[2]], dist, pitch, ...(yaw !== undefined ? { yaw } : {}) });
export const world = (p: V3, y = 0): [number, number, number] => [STATION[0] + p[0], STATION[1] + p[1] + y, STATION[2] + p[2]];

interface GrowthBench {
  /** The tube being set up (germination). */
  tube: number;
  /** Where the ruler is laid from (seedlings). */
  ref: SeedRef;
  set: (p: Partial<Omit<GrowthBench, 'set'>>) => void;
}
export const BENCH_IDLE = { tube: 0, ref: 'SEED' as SeedRef };
export const useGrowthBench = create<GrowthBench>((set) => ({ ...BENCH_IDLE, set: (p) => set(p) }));

// ------------------------------------------------------------------ demo and sandbox variants

/** The demonstration's material: never the student's own (the demo would give their answers away). */
export function demoVariant(studentSeed: number, task: GrowthTask): BioGrowthVariant {
  const mine = bioGrowthVariant(studentSeed, task);
  for (let s = 9301; s < 9700; s++) {
    const v = bioGrowthVariant(s, task);
    if (Math.abs(v.germ.t50 - mine.germ.t50) >= 0.15 && Math.abs(v.resp.rA - mine.resp.rA) >= 0.12 && Math.abs(v.trop.thMax - mine.trop.thMax) >= 3 && Math.abs(v.seedling.grow.COWPEA.Lmax - mine.seedling.grow.COWPEA.Lmax) >= 5) return v;
  }
  return bioGrowthVariant(9301, task);
}

export const BATCHES = [
  { id: 'fresh', label: 'Fresh seed from this season (few dead)', dead: 0.03 },
  { id: 'normal', label: 'Ordinary market seed', dead: 0.08 },
  { id: 'old', label: 'Old seed, stored three years (many dead)', dead: 0.4 },
];
export const SEASONS = [
  { id: 'hot', label: 'Hot season (30 °C): fast growth', speed: 1.25 },
  { id: 'normal', label: 'Normal (27 °C)', speed: 1 },
  { id: 'cool', label: 'Harmattan mornings (22 °C): slow growth', speed: 0.7 },
];
/** A sandbox variant: a chosen seed batch and season. */
export function sandboxVariant(task: GrowthTask, o: { batch: string; season: string }, seed = 717_171): BioGrowthVariant {
  const v = bioGrowthVariant(seed, task);
  const b = BATCHES.find((x) => x.id === o.batch) ?? BATCHES[1]!;
  const sz = SEASONS.find((x) => x.id === o.season) ?? SEASONS[1]!;
  const grow = (g: BioGrowthVariant['seedling']['grow']['COWPEA']) => ({ ...g, k: roundDp(g.k * sz.speed, 3), t0: roundDp(g.t0 / sz.speed, 2), tR: roundDp(g.tR / sz.speed, 2) });
  return {
    ...v,
    germ: { ...v.germ, dead: b.dead, t50: roundDp(v.germ.t50 / sz.speed, 2) },
    seedling: { ...v.seedling, grow: { COWPEA: grow(v.seedling.grow.COWPEA), MAIZE: grow(v.seedling.grow.MAIZE) } },
    resp: { ...v.resp, rA: roundDp(v.resp.rA * sz.speed * (1 - b.dead), 2) },
    trop: { ...v.trop, tau: roundDp(v.trop.tau / sz.speed, 2) },
  };
}
