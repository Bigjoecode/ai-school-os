import type { MicroObjective } from '@aischool/shared';
import { create } from 'zustand';
import type { CameraPresets } from '../../../lab3d-kit/controls';
import type { Spot } from '../../../lab3d-kit/store';

/** The microscope station: where everything stands on the student's bench (station-local metres: x along the bench, z towards the student). */
export const SPOT = {
  scope: [0.22, 0, -0.1] as const,
  tile: [-0.3, 0, 0.1] as const,
  slideBox: [-0.05, 0, 0.27] as const,
  stains: [-0.56, 0, -0.24] as const,
  source: [-0.74, 0, 0.1] as const,
  tools: [-0.52, 0, 0.3] as const,
  filter: [-0.1, 0, 0.07] as const,
  lensTissue: [0.56, 0, 0.2] as const,
  bin: [0.66, 0, -0.2] as const,
  swabs: [-0.2, 0, -0.16] as const,
  watchGlass: [-0.68, 0, -0.06] as const,
  card: [-0.88, 0, -0.24] as const,
  book: [0.86, 0, 0.27] as const,
  extras: [-0.98, 0, 0.27] as const,
};

/** The microscope's own geometry (scope-local, metres): stage height from the focus, the optical axis, the eyepiece. */
export const MS = {
  /** Stage top at stage height 0 and its travel over 0–100 (coarse + fine). */
  stage0: 0.12,
  travel: 0.05,
  axisZ: 0.012,
  eyepiece: [0, 0.4, 0.08] as const,
};
export const stageY = (h: number) => MS.stage0 + (Math.max(0, Math.min(102, h)) / 100) * MS.travel;
export const OBJ_COLOUR: Record<MicroObjective, string> = { 4: '#d32f2f', 10: '#f9a825', 40: '#1e88e5' };

const sc = (dx: number, y: number, dz: number): [number, number, number] => [SPOT.scope[0] + dx, y, SPOT.scope[2] + dz];
export const MICRO_VIEWS: CameraPresets = {
  scope: { target: sc(0, 0.2, 0), dist: 0.75, pitch: 0.2 },
  stage: { target: sc(0, 0.16, 0.02), dist: 0.42, pitch: 0.18 },
  prep: { target: [SPOT.tile[0] - 0.08, 0.04, SPOT.tile[2] - 0.05], dist: 0.7, pitch: 0.75 },
  knobs: { target: sc(0.05, 0.13, -0.07), dist: 0.36, pitch: 0.12 },
};
export const MICRO_VIEW_BUTTONS = [
  { id: 'bench', label: 'Whole bench' },
  { id: 'prep', label: 'Slide prep' },
  { id: 'scope', label: 'Microscope' },
  { id: 'stage', label: 'Stage' },
];
export const SPOTS: Record<string, Spot> = {
  scope: { target: sc(0, 0.2, 0), dist: 0.7, pitch: 0.22, yaw: -0.45 },
  stage: { target: sc(0, 0.16, 0.02), dist: 0.42, pitch: 0.2, yaw: 0.4 },
  knobs: { target: sc(0.05, 0.13, -0.07), dist: 0.38, pitch: 0.15, yaw: 0.9 },
  prep: { target: [SPOT.tile[0] - 0.1, 0.04, SPOT.tile[2] - 0.06], dist: 0.65, pitch: 0.75, yaw: 0.05 },
  tile: { target: [SPOT.tile[0], 0.02, SPOT.tile[2]], dist: 0.38, pitch: 0.85, yaw: 0.05 },
  stains: { target: [SPOT.stains[0], 0.05, SPOT.stains[2]], dist: 0.5, pitch: 0.45, yaw: 0.1 },
  tools: { target: [SPOT.tools[0], 0.01, SPOT.tools[2]], dist: 0.45, pitch: 0.8, yaw: 0.05 },
  source: { target: [SPOT.source[0], 0.04, SPOT.source[2]], dist: 0.45, pitch: 0.55, yaw: 0.15 },
  bench: { target: [0.05, 0.12, -0.02], dist: 1.1, pitch: 0.58 },
  bin: { target: [SPOT.bin[0], 0.05, SPOT.bin[2]], dist: 0.5, pitch: 0.45, yaw: -0.2 },
};

/** The microscope bench's own view state: eyepiece overlays, the cover slip being lowered, animations. */
interface Bench {
  graticule: boolean;
  pointer: boolean;
  /** Lowering the cover slip with the needle: 0 (held at 45°) … 1 (down). */
  lowering: number;
  /** A drop was just squeezed from a dropper (ms timestamp, for the drop animation). */
  dropAt: number;
  set: (patch: Partial<Omit<Bench, 'set'>>) => void;
}
export const BENCH_IDLE = { graticule: false, pointer: false, lowering: 0, dropAt: 0 };
export const useBench = create<Bench>((set) => ({ ...BENCH_IDLE, set: (patch) => set(patch) }));
