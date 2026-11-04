import { ORG_SAMPLE_BY_ID, ORG_TASK_SAMPLES, chemOrganicVariant, type ChemOrganicVariant, type OrgTask } from '@aischool/shared';
import { create } from 'zustand';
import type { CameraPresets } from '../../../lab3d-kit/controls';
import { STATION } from '../../../lab3d-kit/layout';
import { DEFAULT_ROOM, type RoomConfig } from '../../../lab3d-kit/room';
import type { Spot } from '../../../lab3d-kit/store';

/**
 * The organic bench: where things stand (station-local metres: x along the
 * bench, y up from its top, z towards the student), the camera presets, the
 * bench's own view state and the demo / sandbox variants.
 */

type V3 = readonly [number, number, number];
export const OSPOT = {
  samples: [-0.74, 0, -0.24] as V3,
  rack: [-0.3, 0, -0.27] as V3,
  tube: [0.02, 0, 0.04] as V3,
  bath: [0.4, 0, 0.0] as V3,
  reagents: [0.56, 0, -0.33] as V3,
  holder: [0.0, 0, 0.27] as V3,
  gasKit: [-0.3, 0, 0.18] as V3,
  cylinder: [-0.56, 0, 0.18] as V3,
  card: [-0.95, 0, -0.18] as V3,
  book: [-0.98, 0, 0.27] as V3,
  extras: [-1.12, 0, 0.0] as V3,
  waterBeaker: [0.2, 0, -0.26] as V3,
  // soap
  soap: [0.3, 0, -0.02] as V3,
  balance: [-0.42, 0, -0.18] as V3,
  funnel: [-0.06, 0, -0.2] as V3,
  soapBottles: [-0.8, 0, -0.26] as V3,
  lather: [-0.3, 0, 0.18] as V3,
  rod: [0.08, 0, 0.22] as V3,
};
/** The sample beakers. */
export const sampleSpot = (k: number): V3 => [OSPOT.samples[0] + k * 0.12, 0, OSPOT.samples[2]];
export const BATH_TOP = 0.235;

const local = (p: V3, y: number): [number, number, number] => [p[0], y, p[2]];
export const ORG_VIEWS: CameraPresets = {
  tube: { target: local(OSPOT.tube, 0.09), dist: 0.42, pitch: 0.16 },
  bath: { target: local(OSPOT.bath, 0.27), dist: 0.62, pitch: 0.25 },
  samples: { target: [OSPOT.samples[0] + 0.18, 0.06, OSPOT.samples[2]], dist: 0.66, pitch: 0.4 },
  reagents: { target: [OSPOT.reagents[0] + 0.16, 0.05, OSPOT.reagents[2] + 0.04], dist: 0.72, pitch: 0.42 },
  beaker: { target: local(OSPOT.soap, 0.29), dist: 0.55, pitch: 0.35 },
  balance: { target: local(OSPOT.balance, 0.04), dist: 0.42, pitch: 0.55 },
  funnel: { target: local(OSPOT.funnel, 0.12), dist: 0.5, pitch: 0.3 },
  lather: { target: local(OSPOT.lather, 0.08), dist: 0.42, pitch: 0.2 },
};
export const TUBE_VIEW_BUTTONS = [
  { id: 'bench', label: 'Whole bench' },
  { id: 'tube', label: 'Test tube' },
  { id: 'bath', label: 'Water bath' },
  { id: 'samples', label: 'Samples' },
];
export const SOAP_VIEW_BUTTONS = [
  { id: 'bench', label: 'Whole bench' },
  { id: 'beaker', label: 'Beaker' },
  { id: 'balance', label: 'Balance' },
  { id: 'lather', label: 'Lather tubes' },
];
export const spotOf = (p: V3, y: number, dist: number, pitch = 0.3, yaw?: number): Spot => ({ target: [p[0], y, p[2]], dist, pitch, ...(yaw !== undefined ? { yaw } : {}) });
export const world = (p: V3, y = 0): [number, number, number] => [STATION[0] + p[0], STATION[1] + p[1] + y, STATION[2] + p[2]];

export const orgRoom = (task: OrgTask): RoomConfig => ({
  ...DEFAULT_ROOM,
  whiteboard:
    task === 'SOAP'
      ? ['Chemistry — SS3 Practical', 'Saponification: soap from palm oil', 'Boil 15–20 min, stirring; top up water', 'Brine salts out the soap']
      : task === 'CARBS'
        ? ['Chemistry — SS3 Practical', 'Tests for sugars and starch', "Benedict's: boiling water bath, 5 min", 'Neutralise before Benedict’s!']
        : task === 'PROTEINS'
          ? ['Chemistry — SS3 Practical', 'Tests for proteins', 'Biuret: CuSO₄ drop by drop', 'Water is the control']
          : ['Chemistry — SS3 Practical', 'Functional groups: A, B, C, D', 'C=C · –OH · –COOH · ester', 'Record TEST | OBSERVATION | INFERENCE'],
  whiteboardNote: task === 'SOAP' ? 'Never leave it unattended!' : 'No flames near organic liquids!',
  frontPoster:
    task === 'SOAP'
      ? { title: 'Soap', band: '#b45309', lines: ['Fat + 3NaOH → glycerol + 3 soap', 'Soap: sodium salt of a fatty acid', 'Hydrophobic tail, hydrophilic head', 'Hard water: Ca²⁺/Mg²⁺ form scum'] }
      : task === 'CARBS'
        ? { title: 'Carbohydrates', band: '#2e7d32', lines: ['Reducing sugar: brick-red ppt', 'Starch + iodine: blue-black', 'Sucrose: hydrolyse first', 'C₁₂H₂₂O₁₁ + H₂O → 2C₆H₁₂O₆'] }
        : task === 'PROTEINS'
          ? { title: 'Proteins', band: '#6a1b9a', lines: ['Biuret: violet (peptide links)', "Millon's: white → brick-red", 'Xanthoproteic: yellow → orange', 'Ninhydrin: blue-violet'] }
          : { title: 'Functional groups', band: '#0f3d8c', lines: ['C=C: decolourises Br₂ water', '–OH: Cr₂O₇²⁻ orange → green', '–COOH: NaHCO₃ fizzes (CO₂)', 'Ester: fruity smell'] },
});

interface OrgBench {
  active: number;
  /** A tube was just heated: its colour runs on (animation start, performance.now()). */
  anim: { i: number; from: number; at: number } | null;
  set: (p: Partial<Omit<OrgBench, 'set'>>) => void;
}
export const BENCH_IDLE = { active: -1, anim: null };
export const useOrgBench = create<OrgBench>((set) => ({ ...BENCH_IDLE, set: (p) => set(p) }));
export const HEAT_ANIM_MS = 1800;

// ------------------------------------------------------------------ demo and sandbox variants

/** The demonstration's bench: a seed whose unknowns are in a different order from the student's (the demo must not give answers away). */
export function demoVariant(studentSeed: number, task: OrgTask): ChemOrganicVariant {
  const mine = chemOrganicVariant(studentSeed, task);
  const sig = (v: ChemOrganicVariant) => v.samples.map((s) => s.def.id).join();
  for (let s = 7001; s < 7400; s++) {
    const v = chemOrganicVariant(s, task);
    if (task === 'SOAP' ? Math.abs(v.soap.oilMass - mine.soap.oilMass) >= 0.05 : v.samples.every((x, k) => x.def.id !== mine.samples[k]?.def.id) && sig(v) !== sig(mine)) return v;
  }
  return chemOrganicVariant(7001, task);
}

/** A variant with chosen samples (the sandbox). */
export function samplesVariant(task: OrgTask, ids: string[], seed = 424_242): ChemOrganicVariant {
  const base = chemOrganicVariant(seed, task);
  if (task === 'SOAP') return base;
  const letters = ORG_TASK_SAMPLES[task];
  const r = () => 0.5;
  const samples = base.samples.map((s, k) => {
    const def = ORG_SAMPLE_BY_ID[ids[k] ?? ''] ?? s.def;
    return { letter: letters[k]!, def, content: def.content(r) };
  });
  return { ...base, samples };
}
