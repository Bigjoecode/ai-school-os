import { bioDissectionVariant, roundDp, type BioDissectionVariant, type DissectTask, type RatHow } from '@aischool/shared';
import { create } from 'zustand';
import type { CameraPresets } from '../../../lab3d-kit/controls';
import { STATION } from '../../../lab3d-kit/layout';
import type { Spot } from '../../../lab3d-kit/store';

/**
 * The dissection bench: where things stand (station-local metres: x along
 * the bench, y up from its top, z towards the student), the camera presets,
 * the bench's own view state (the height to cut at, the plate in hand, how to
 * measure the gut, the section on the stage) and the demo / sandbox variants.
 */

type V3 = readonly [number, number, number];
export const DSPOT = {
  card: [-0.95, 0, -0.18] as V3,
  book: [-0.98, 0, 0.27] as V3,
  extras: [-1.14, 0, 0.0] as V3,
  // eosin
  plant: [-0.5, 0, -0.12] as V3,
  eosin: [-0.18, 0, -0.14] as V3,
  bowl: [-0.62, 0, 0.18] as V3,
  tile: [0.16, 0, 0.16] as V3,
  razor: [0.32, 0, 0.24] as V3,
  lens: [0.46, 0, 0.26] as V3,
  microscope: [0.62, 0, -0.14] as V3,
  stopwatch: [-0.3, 0, 0.26] as V3,
  eruler: [-0.02, 0, 0.26] as V3,
  // rat
  board: [-0.08, 0, -0.02] as V3,
  kit: [0.4, 0, 0.2] as V3,
  gloves: [-0.6, 0, -0.2] as V3,
  thread: [0.52, 0, -0.18] as V3,
  rruler: [0.36, 0, -0.04] as V3,
  washbottle: [-0.56, 0, 0.16] as V3,
  disinfectant: [0.68, 0, 0.06] as V3,
  // microorganisms
  plates: [-0.28, 0, -0.02] as V3,
  incubator: [0.62, 0, -0.16] as V3,
  bread: [0.12, 0, -0.16] as V3,
  bags: [0.14, 0, 0.22] as V3,
  fridge: [0.98, 0, -0.08] as V3,
  marker: [-0.6, 0, 0.24] as V3,
  tape: [-0.46, 0, 0.28] as V3,
  mdisinfectant: [-0.66, 0, -0.18] as V3,
  mlens: [0.38, 0, 0.26] as V3,
  mmicroscope: [0.34, 0, -0.2] as V3,
};
/** Where plate k sits on the bench (or inside the incubator). */
export const plateSpot = (k: number, inside: boolean): V3 => (inside ? [DSPOT.incubator[0] - 0.05 + (k % 2) * 0.1, 0.06 + Math.floor(k / 2) * 0.07, DSPOT.incubator[2]] : [DSPOT.plates[0] - 0.15 + k * 0.1, 0, DSPOT.plates[2]]);

const local = (p: V3, y: number): [number, number, number] => [p[0], y, p[2]];
export const DISSECT_VIEWS: CameraPresets = {
  plant: { target: local([(DSPOT.plant[0] + DSPOT.eosin[0]) / 2, 0, DSPOT.plant[2]], 0.16), dist: 0.75, pitch: 0.12 },
  tile: { target: local(DSPOT.tile, 0.02), dist: 0.5, pitch: 0.7 },
  scope: { target: local(DSPOT.microscope, 0.15), dist: 0.6, pitch: 0.25 },
  board: { target: local(DSPOT.board, 0.03), dist: 0.62, pitch: 0.95 },
  tools: { target: local(DSPOT.kit, 0.01), dist: 0.5, pitch: 0.8 },
  plates: { target: local(DSPOT.plates, 0.02), dist: 0.55, pitch: 0.85 },
  incubator: { target: local(DSPOT.incubator, 0.12), dist: 0.7, pitch: 0.2 },
  bread: { target: local(DSPOT.bread, 0.02), dist: 0.5, pitch: 0.75 },
};
export const VIEW_BUTTONS: Record<DissectTask, { id: string; label: string }[]> = {
  EOSIN: [
    { id: 'bench', label: 'Whole bench' },
    { id: 'plant', label: 'Plant' },
    { id: 'tile', label: 'Tile' },
    { id: 'scope', label: 'Microscope' },
  ],
  RAT: [
    { id: 'bench', label: 'Whole bench' },
    { id: 'board', label: 'Board' },
    { id: 'tools', label: 'Tools' },
  ],
  MICROBE: [
    { id: 'bench', label: 'Whole bench' },
    { id: 'plates', label: 'Plates' },
    { id: 'incubator', label: 'Incubator' },
    { id: 'bread', label: 'Bread' },
  ],
};
export const spotOf = (p: V3, y: number, dist: number, pitch = 0.3, yaw?: number): Spot => ({ target: [p[0], y, p[2]], dist, pitch, ...(yaw !== undefined ? { yaw } : {}) });
export const world = (p: V3, y = 0): [number, number, number] => [STATION[0] + p[0], STATION[1] + p[1] + y, STATION[2] + p[2]];

interface DissectBench {
  /** Height to cut the next section at (cm above the dye). */
  cutAt: number;
  /** The plate being worked on. */
  plate: number;
  /** How the gut will be measured. */
  how: RatHow;
  /** The section on the microscope stage / under the lens (index, tool). */
  look: { n: number; tool: 'LENS' | 'MICRO' } | null;
  set: (p: Partial<Omit<DissectBench, 'set'>>) => void;
}
export const BENCH_IDLE = { cutAt: 3, plate: 0, how: 'THREAD' as RatHow, look: null };
export const useDissectBench = create<DissectBench>((set) => ({ ...BENCH_IDLE, set: (p) => set(p) }));

// ------------------------------------------------------------------ demo and sandbox variants

/** The demonstration's material: never the student's own (the demo would give their answers away). */
export function demoVariant(studentSeed: number, task: DissectTask): BioDissectionVariant {
  const mine = bioDissectionVariant(studentSeed, task);
  for (let s = 9301; s < 9700; s++) {
    const v = bioDissectionVariant(s, task);
    if (Math.abs(v.eosin.rate - mine.eosin.rate) >= 0.012 && Math.abs(v.rat.si - mine.rat.si) >= 4 && Math.abs(v.micro.finger - mine.micro.finger) >= 6 && Math.abs(v.micro.airRate - mine.micro.airRate) >= 0.15) return v;
  }
  return bioDissectionVariant(9301, task);
}

export const CLIMATES = [
  { id: 'harmattan', label: 'Harmattan: dry, windy, sunny', speed: 1.35, mould: 0.6 },
  { id: 'normal', label: 'A normal school day', speed: 1, mould: 1 },
  { id: 'humid', label: 'Rainy season: humid and still', speed: 0.7, mould: 1.3 },
];
export const SPECIMENS = [
  { id: 'small', label: 'A small young rat', scale: 0.85 },
  { id: 'normal', label: 'An ordinary adult rat', scale: 1 },
  { id: 'large', label: 'A large old rat', scale: 1.15 },
];
/** A sandbox variant: a chosen climate (transpiration and mould) and specimen size. */
export function sandboxVariant(task: DissectTask, o: { climate: string; specimen: string }, seed = 717_171): BioDissectionVariant {
  const v = bioDissectionVariant(seed, task);
  const c = CLIMATES.find((x) => x.id === o.climate) ?? CLIMATES[1]!;
  const sp = SPECIMENS.find((x) => x.id === o.specimen) ?? SPECIMENS[1]!;
  return {
    ...v,
    eosin: { ...v.eosin, rate: roundDp(v.eosin.rate * c.speed, 3) },
    rat: { ...v.rat, body: roundDp(v.rat.body * sp.scale, 1), si: roundDp(v.rat.si * sp.scale, 1), li: roundDp(v.rat.li * sp.scale, 1) },
    micro: { ...v.micro, mouldT: roundDp(v.micro.mouldT / c.mould, 2), airRate: roundDp(v.micro.airRate * (c.id === 'harmattan' ? 1.6 : 1), 2) },
  };
}
