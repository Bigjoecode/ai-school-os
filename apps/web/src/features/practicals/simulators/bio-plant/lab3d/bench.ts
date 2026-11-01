import { bioPlantVariant, roundDp, type BioPlantVariant, type PlantTask } from '@aischool/shared';
import { create } from 'zustand';
import type { CameraPresets } from '../../../lab3d-kit/controls';
import { STATION } from '../../../lab3d-kit/layout';
import type { Spot } from '../../../lab3d-kit/store';

/**
 * The plant bench: where things stand (station-local metres: x along the
 * bench, y up from its top, z towards the student), the camera presets, the
 * bench's own view state (the leaf in hand, squares ticked, a fire flash) and
 * the demo / sandbox variants.
 */

type V3 = readonly [number, number, number];
export const PSPOT = {
  card: [-0.95, 0, -0.18] as V3,
  book: [-0.98, 0, 0.27] as V3,
  extras: [-1.14, 0, 0.0] as V3,
  // potometer
  shoot: [-0.3, 0, -0.08] as V3,
  potometer: [0.05, 0, -0.08] as V3,
  bowl: [-0.58, 0, 0.16] as V3,
  blade: [-0.36, 0, 0.3] as V3,
  vaseline: [-0.2, 0, 0.3] as V3,
  fan: [-0.66, 0, -0.22] as V3,
  lamp: [-0.12, 0, -0.34] as V3,
  bags: [0.5, 0, 0.26] as V3,
  clock: [0.66, 0, 0.06] as V3,
  // oxygen
  beaker: [-0.3, 0, -0.02] as V3,
  trough: [-0.17, 0, -0.02] as V3,
  rule: [0.25, 0, 0.16] as V3,
  bottle: [-0.62, 0, -0.26] as V3,
  weed: [-0.6, 0, 0.12] as V3,
  splint: [0.18, 0, 0.34] as V3,
  oclock: [0.66, 0, -0.3] as V3,
  // starch
  pot: [-0.5, 0, -0.12] as V3,
  bath: [0.14, 0, -0.14] as V3,
  ethanol: [0.46, 0, -0.3] as V3,
  rack: [0.44, 0, -0.06] as V3,
  warm: [0.64, 0, 0.12] as V3,
  tile: [-0.06, 0, 0.22] as V3,
  iodine: [0.24, 0, 0.3] as V3,
  grid: [-0.36, 0, 0.3] as V3,
  forceps: [0.06, 0, 0.38] as V3,
  foil: [-0.72, 0, 0.14] as V3,
  flask: [-0.3, 0, -0.3] as V3,
};
/** The lamp along the metre rule: d cm from the beaker. */
export const lampSpot = (d: number | null): V3 => [PSPOT.beaker[0] + 0.07 + (d ?? 105) / 100, 0, PSPOT.beaker[2]];
/** Picked leaves waiting in a row in front of the bath (the one on the tile lies on the tile). */
export const leafSpot = (k: number): V3 => [-0.26 + (k % 4) * 0.1, 0.004, 0.06];

const local = (p: V3, y: number): [number, number, number] => [p[0], y, p[2]];
export const PLANT_VIEWS: CameraPresets = {
  potometer: { target: local(PSPOT.potometer, 0.14), dist: 0.75, pitch: 0.3 },
  shoot: { target: local(PSPOT.shoot, 0.25), dist: 0.7, pitch: 0.2 },
  oxygen: { target: local(PSPOT.beaker, 0.1), dist: 0.7, pitch: 0.3 },
  rule: { target: local(PSPOT.rule, 0.05), dist: 1.1, pitch: 0.45 },
  plant: { target: local(PSPOT.pot, 0.2), dist: 0.7, pitch: 0.3 },
  bath: { target: local(PSPOT.bath, 0.25), dist: 0.7, pitch: 0.35 },
  tile: { target: local(PSPOT.tile, 0.02), dist: 0.42, pitch: 0.85 },
};
export const VIEW_BUTTONS: Record<PlantTask, { id: string; label: string }[]> = {
  POTOMETER: [
    { id: 'bench', label: 'Whole bench' },
    { id: 'shoot', label: 'Shoot' },
    { id: 'potometer', label: 'Potometer' },
  ],
  OXYGEN: [
    { id: 'bench', label: 'Whole bench' },
    { id: 'oxygen', label: 'Beaker' },
    { id: 'rule', label: 'Lamp and rule' },
  ],
  STARCH: [
    { id: 'bench', label: 'Whole bench' },
    { id: 'plant', label: 'Plant' },
    { id: 'bath', label: 'Water bath' },
    { id: 'tile', label: 'Tile' },
  ],
};
export const spotOf = (p: V3, y: number, dist: number, pitch = 0.3, yaw?: number): Spot => ({ target: [p[0], y, p[2]], dist, pitch, ...(yaw !== undefined ? { yaw } : {}) });
export const world = (p: V3, y = 0): [number, number, number] => [STATION[0] + p[0], STATION[1] + p[1] + y, STATION[2] + p[2]];

interface PlantBench {
  /** The leaf in hand (starch). */
  sel: number;
  /** Grid squares ticked while counting. */
  tally: number[];
  /** When the ethanol last caught fire (ms, performance clock). */
  fireAt: number;
  set: (p: Partial<Omit<PlantBench, 'set'>>) => void;
}
export const BENCH_IDLE = { sel: 0, tally: [] as number[], fireAt: 0 };
export const usePlantBench = create<PlantBench>((set) => ({ ...BENCH_IDLE, set: (p) => set(p) }));

// ------------------------------------------------------------------ demo and sandbox variants

/** The demonstration's material: never the student's own (the demo would give their answers away). */
export function demoVariant(studentSeed: number, task: PlantTask): BioPlantVariant {
  const mine = bioPlantVariant(studentSeed, task);
  for (let s = 9101; s < 9500; s++) {
    const v = bioPlantVariant(s, task);
    if (Math.abs(v.poto.base - mine.poto.base) >= 0.6 && Math.abs(v.oxy.dComp - mine.oxy.dComp) >= 6 && v.starch.foil0 !== mine.starch.foil0) return v;
  }
  return bioPlantVariant(9101, task);
}

export const SHOOTS = [
  { id: 'hibiscus', label: 'Hibiscus (many broad leaves)', base: 6.5 },
  { id: 'ixora', label: 'Ixora (fewer, leathery leaves)', base: 3.8 },
  { id: 'acalypha', label: 'Acalypha (large thin leaves)', base: 8.5 },
];
export const WEEDS = [
  { id: 'vigorous', label: 'Vigorous Elodea (fast, compensates far away)', pmax: 1.25, dComp: 90 },
  { id: 'typical', label: 'Typical Elodea', pmax: 1, dComp: 70 },
  { id: 'old', label: 'Old, pale Elodea (slow)', pmax: 0.6, dComp: 45 },
];
export const DAYS = [
  { id: 'sunny', label: 'A bright sunny day (starch builds fast)', perHour: 0.45 },
  { id: 'normal', label: 'A normal day', perHour: 0.31 },
  { id: 'dull', label: 'A dull, cloudy day (starch builds slowly)', perHour: 0.14 },
];
/** A sandbox variant: a chosen shoot, pondweed or day. */
export function sandboxVariant(task: PlantTask, o: { shoot: string; weed: string; day: string }, seed = 616_161): BioPlantVariant {
  const v = bioPlantVariant(seed, task);
  const sh = SHOOTS.find((x) => x.id === o.shoot) ?? SHOOTS[0]!;
  const wd = WEEDS.find((x) => x.id === o.weed) ?? WEEDS[1]!;
  const dy = DAYS.find((x) => x.id === o.day) ?? DAYS[1]!;
  const pmax = roundDp(v.oxy.pmax * wd.pmax, 1);
  const Ic = 10000 / (wd.dComp * wd.dComp);
  const R = roundDp((pmax * Ic) / (v.oxy.K + Ic), 3);
  return { ...v, poto: { ...v.poto, base: sh.base }, oxy: { ...v.oxy, pmax, dComp: wd.dComp, R, bg: roundDp(Ic * 1.3, 3) }, starch: { ...v.starch, perHour: dy.perHour } };
}
