import { bioEcologyVariant, type BioEcologyVariant, type EcoTask } from '@aischool/shared';
import { create } from 'zustand';
import type { CameraPresets } from '../../../lab3d-kit/controls';
import { STATION } from '../../../lab3d-kit/layout';
import type { Spot } from '../../../lab3d-kit/store';

/**
 * The field lab's layout: where the field's features are (world metres), where
 * things stand on the student's field table (station-local: x along the
 * table, y up from its top, z towards the student), the camera presets, the
 * small view store and the demo / sandbox variants.
 */

type V3 = readonly [number, number, number];
/** World positions of the field's features. */
export const FIELD = {
  pond: [-11.5, 0, -0.5] as [number, number, number],
  pit: [9.8, 0, -3.6] as [number, number, number],
  tree: [-6.4, 0, -4.4] as [number, number, number],
  open: [2.2, 0, -3.5] as [number, number, number],
  shade: [-5.0, 0, -3.1] as [number, number, number],
};
/** A point of the study plot (plot metres, x east, y north from the pegged corner) in world metres. */
export const plotWorld = (x: number, y: number): [number, number, number] => [-10 + x, 0, -6.5 - y];
const toLocal = (p: readonly [number, number, number], y = 0): [number, number, number] => [p[0] - STATION[0], p[1] - STATION[1] + y, p[2] - STATION[2]];

export const ESPOT = {
  card: [-1.05, 0, -0.2] as V3,
  book: [-1.05, 0, 0.25] as V3,
  extras: [-1.2, 0, 0.0] as V3,
  // quadrat
  quadrat: [0.2, 0, 0.05] as V3,
  tapes: [0.8, 0, -0.2] as V3,
  pegs: [0.85, 0, 0.18] as V3,
  table: [-0.5, 0, 0.15] as V3,
  guide: [-0.5, 0, -0.2] as V3,
  // capture
  net: [1.15, 0, 0.0] as V3,
  box: [0.6, 0, -0.18] as V3,
  tray: [0.05, 0, 0.1] as V3,
  paint: [-0.45, 0, -0.2] as V3,
  redpaint: [-0.3, 0, -0.26] as V3,
  scissors: [-0.5, 0, 0.16] as V3,
  watch: [0.85, 0, 0.22] as V3,
  // factors
  thermo: [-0.55, 0, 0.1] as V3,
  soilthermo: [-0.38, 0, 0.18] as V3,
  hygro: [-0.18, 0, -0.12] as V3,
  lightmeter: [0.12, 0, 0.16] as V3,
  anemo: [0.34, 0, -0.1] as V3,
  phkit: [0.6, 0, 0.12] as V3,
  secchi: [0.95, 0, -0.15] as V3,
  card2: [-0.72, 0, -0.22] as V3,
  // soil
  bags: [-0.62, 0, -0.26] as V3,
  jars: [-0.18, 0, 0.12] as V3,
  rack: [0.32, 0, -0.22] as V3,
  aircyl: [0.3, 0, 0.22] as V3,
  burner: [0.98, 0, -0.14] as V3,
  balance: [0.98, 0, 0.24] as V3,
  desiccator: [0.68, 0, 0.26] as V3,
  ruler: [-0.55, 0, 0.3] as V3,
};
export const bagSpot = (k: number): V3 => [ESPOT.bags[0] + k * 0.15, 0, ESPOT.bags[2]];
export const jarSpot = (k: number): V3 => [ESPOT.jars[0] + k * 0.12, 0, ESPOT.jars[2]];
export const funnelSpot = (k: number): V3 => [ESPOT.rack[0] - 0.12 + k * 0.12, 0, ESPOT.rack[2]];
export const airSpot = (k: number): V3 => [ESPOT.aircyl[0] - 0.1 + k * 0.1, 0, ESPOT.aircyl[2]];
export const crucibleSpot = (k: number): V3 => [ESPOT.burner[0] - 0.16 + k * 0.16, 0, ESPOT.burner[2]];

const local = (p: V3, y: number): [number, number, number] => [p[0], y, p[2]];
export const ECO_VIEWS: CameraPresets = {
  table: { target: [0, 0.05, 0], dist: 1.25, pitch: 0.55 },
  plot: { target: toLocal(plotWorld(10, 8)), dist: 23, pitch: 1.0 },
  open: { target: toLocal(FIELD.open, 0.1), dist: 2.4, pitch: 0.28, yaw: 0.3 },
  shade: { target: toLocal(FIELD.shade, 0.4), dist: 2.0, pitch: 0.55, yaw: -0.2 },
  station: { target: toLocal([4.6, 0, -4.5], 0.6), dist: 2.8, pitch: 0.18 },
  pond: { target: toLocal(FIELD.pond, -0.6), dist: 6, pitch: 0.55, yaw: -0.6 },
  pit: { target: toLocal(FIELD.pit, -0.9), dist: 3.4, pitch: 0.55, yaw: 0.5 },
  jars: { target: local(ESPOT.jars, 0.08), dist: 0.55, pitch: 0.3 },
  rack: { target: local(ESPOT.rack, 0.12), dist: 0.7, pitch: 0.3 },
  heat: { target: local(ESPOT.burner, 0.1), dist: 0.7, pitch: 0.35 },
  tray: { target: local(ESPOT.tray, 0.02), dist: 0.55, pitch: 0.9 },
};
export const VIEW_BUTTONS: Record<EcoTask, { id: string; label: string }[]> = {
  QUADRAT: [
    { id: 'bench', label: 'Field table' },
    { id: 'plot', label: 'The plot' },
  ],
  CAPTURE: [
    { id: 'bench', label: 'Field table' },
    { id: 'tray', label: 'Tray' },
    { id: 'plot', label: 'The plot' },
  ],
  FACTORS: [
    { id: 'station', label: 'Weather station' },
    { id: 'open', label: 'Open field' },
    { id: 'shade', label: 'Canopy' },
    { id: 'pond', label: 'Pond' },
  ],
  SOIL: [
    { id: 'bench', label: 'Field table' },
    { id: 'jars', label: 'Jars' },
    { id: 'rack', label: 'Funnels' },
    { id: 'heat', label: 'Heating' },
  ],
};
export const spotOf = (p: V3, y: number, dist: number, pitch = 0.3, yaw?: number): Spot => ({ target: [p[0], y, p[2]], dist, pitch, ...(yaw !== undefined ? { yaw } : {}) });
export const world = (p: V3, y = 0): [number, number, number] => [STATION[0] + p[0], STATION[1] + p[1] + y, STATION[2] + p[2]];
export const presetSpot = (id: keyof typeof ECO_VIEWS & string): Spot => ECO_VIEWS[id]!;

/** The bench's view state: the quadrat in focus, plants or grasshoppers ticked while counting. */
interface EcoBench {
  sel: number;
  set: (p: Partial<Omit<EcoBench, 'set'>>) => void;
}
export const BENCH_IDLE = { sel: 0 };
export const useEcoBench = create<EcoBench>((set) => ({ ...BENCH_IDLE, set: (p) => set(p) }));

// ------------------------------------------------------------------ demo and sandbox variants

/** The demonstration's field: never the student's own (the demo would give their answers away). */
export function demoVariant(studentSeed: number, task: EcoTask): BioEcologyVariant {
  const mine = bioEcologyVariant(studentSeed, task);
  for (let s = 9101; s < 9500; s++) {
    const v = bioEcologyVariant(s, task);
    if (v.cap.N !== mine.cap.N && v.quad.plants.TRIDAX.length !== mine.quad.plants.TRIDAX.length && v.fac.secchi !== mine.fac.secchi) return v;
  }
  return bioEcologyVariant(9101, task);
}

export const POPS = [
  { id: 'small', label: 'A small population (about 100)', N: 100 },
  { id: 'medium', label: 'A medium population (about 250)', N: 250 },
  { id: 'large', label: 'A large population (about 450)', N: 450 },
];
export const WEATHER = [
  { id: 'sunny', label: 'Clear, sunny days', cloud: 0.05 },
  { id: 'mixed', label: 'Mixed sun and cloud', cloud: 0.4 },
  { id: 'cloudy', label: 'Overcast days', cloud: 0.85 },
];
/** A sandbox field: a new field (seed), with a chosen grasshopper population or weather. */
export function sandboxVariant(task: EcoTask, o: { pop: string; weather: string }, seed = 616_161): BioEcologyVariant {
  const v = bioEcologyVariant(seed, task);
  const N = POPS.find((p) => p.id === o.pop)?.N ?? 250;
  const cloud = WEATHER.find((w) => w.id === o.weather)?.cloud ?? 0.4;
  return { ...v, cap: { ...v.cap, N }, fac: { ...v.fac, days: v.fac.days.map((d) => ({ ...d, cloud })) } };
}
