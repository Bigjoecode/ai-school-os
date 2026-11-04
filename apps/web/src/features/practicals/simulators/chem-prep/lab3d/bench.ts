import { chemPrepVariant, type ChemPrepVariant, type PrepTask } from '@aischool/shared';
import { create } from 'zustand';
import type { CameraPresets } from '../../../lab3d-kit/controls';
import { STATION } from '../../../lab3d-kit/layout';
import { DEFAULT_ROOM, type RoomConfig } from '../../../lab3d-kit/room';
import type { Spot } from '../../../lab3d-kit/store';

/**
 * The chem-prep bench: where things stand (station-local metres: x along the
 * bench, y up from its top, z towards the student), the camera presets, the
 * bench's own view state and the demo / sandbox variants.
 */

type V3 = readonly [number, number, number];
export const PSPOT = {
  card: [-1.05, 0, -0.2] as V3,
  book: [-1.05, 0, 0.27] as V3,
  extras: [-1.2, 0, 0.05] as V3,
  // STANDARD
  stockJar: [-0.78, 0, -0.26] as V3,
  bottle: [-0.62, 0, -0.14] as V3,
  balance: [-0.42, 0, -0.2] as V3,
  beaker: [-0.16, 0, -0.06] as V3,
  washBottle: [-0.3, 0, 0.18] as V3,
  flask: [0.1, 0, -0.1] as V3,
  pipette: [0.3, 0, 0.2] as V3,
  flask2: [0.42, 0, -0.1] as V3,
  // LECHAT / HALOGEN
  stock: [-0.62, 0, -0.22] as V3,
  halides: [-0.8, 0, -0.26] as V3,
  rack: [-0.3, 0, -0.27] as V3,
  tube: [0.0, 0, 0.04] as V3,
  tile: [0.0, 0, 0.13] as V3,
  reagents: [0.22, 0, -0.33] as V3,
  hot: [0.5, 0, 0.08] as V3,
  ice: [0.68, 0, 0.1] as V3,
  // DISTIL
  funnel: [-0.75, 0, -0.18] as V3,
  dbalance: [-0.6, 0, 0.18] as V3,
  dish: [-0.4, 0, -0.12] as V3,
  rig: [-0.05, 0, -0.14] as V3,
  // AMMONIA
  abalance: [-0.78, 0, 0.12] as V3,
  mortar: [-0.62, 0, -0.22] as V3,
  gasRig: [-0.3, 0, -0.14] as V3,
  dryer: [-0.02, 0, -0.14] as V3,
  jar: [0.22, 0, -0.14] as V3,
  trough: [0.55, 0, -0.05] as V3,
  testKit: [0.22, 0, 0.18] as V3,
};
export const reagentSpot = (k: number): V3 => [PSPOT.reagents[0] + (k % 4) * 0.11, 0, PSPOT.reagents[2] + Math.floor(k / 4) * 0.07];
export const halideSpot = (k: number): V3 => [PSPOT.halides[0] + k * 0.09, 0, PSPOT.halides[2]];

const local = (p: V3, y: number): [number, number, number] => [p[0], y, p[2]];
export const PREP_VIEWS: CameraPresets = {
  balance: { target: local(PSPOT.balance, 0.05), dist: 0.42, pitch: 0.5 },
  bottle: { target: local(PSPOT.bottle, 0.04), dist: 0.4, pitch: 0.45 },
  beaker: { target: local(PSPOT.beaker, 0.06), dist: 0.45, pitch: 0.35 },
  flask: { target: local(PSPOT.flask, 0.17), dist: 0.36, pitch: 0.05 },
  flask2: { target: local(PSPOT.flask2, 0.17), dist: 0.36, pitch: 0.05 },
  pipette: { target: local(PSPOT.pipette, 0.03), dist: 0.5, pitch: 0.5 },
  tube: { target: local(PSPOT.tube, 0.09), dist: 0.42, pitch: 0.16 },
  rack: { target: local(PSPOT.rack, 0.08), dist: 0.55, pitch: 0.3 },
  baths: { target: [(PSPOT.hot[0] + PSPOT.ice[0]) / 2, 0.08, PSPOT.hot[2]], dist: 0.55, pitch: 0.3 },
  reagents: { target: [PSPOT.reagents[0] + 0.16, 0.05, PSPOT.reagents[2] + 0.04], dist: 0.72, pitch: 0.42 },
  dish: { target: local(PSPOT.dish, 0.2), dist: 0.5, pitch: 0.4 },
  dbalance: { target: local(PSPOT.dbalance, 0.05), dist: 0.42, pitch: 0.5 },
  rig: { target: [PSPOT.rig[0] + 0.17, 0.25, PSPOT.rig[2]], dist: 0.85, pitch: 0.15 },
  thermometer: { target: [PSPOT.rig[0], 0.42, PSPOT.rig[2]], dist: 0.3, pitch: 0.02 },
  receiver: { target: [PSPOT.rig[0] + 0.4, 0.07, PSPOT.rig[2]], dist: 0.4, pitch: 0.3 },
  gasRig: { target: [PSPOT.gasRig[0] + 0.25, 0.18, PSPOT.gasRig[2]], dist: 0.9, pitch: 0.2 },
  jar: { target: local(PSPOT.jar, 0.12), dist: 0.45, pitch: 0.2 },
  trough: { target: local(PSPOT.trough, 0.2), dist: 0.6, pitch: 0.2 },
  abalance: { target: local(PSPOT.abalance, 0.05), dist: 0.42, pitch: 0.5 },
};
export const VIEW_BUTTONS: Record<PrepTask, { id: string; label: string }[]> = {
  STANDARD: [
    { id: 'bench', label: 'Whole bench' },
    { id: 'balance', label: 'Balance' },
    { id: 'flask', label: 'Flask 1 (eye level)' },
    { id: 'flask2', label: 'Flask 2 (eye level)' },
  ],
  LECHAT: [
    { id: 'bench', label: 'Whole bench' },
    { id: 'tube', label: 'Test tube' },
    { id: 'rack', label: 'Rack' },
    { id: 'baths', label: 'Hot / iced water' },
  ],
  DISTIL: [
    { id: 'bench', label: 'Whole bench' },
    { id: 'dish', label: 'Dish' },
    { id: 'rig', label: 'Distillation' },
    { id: 'thermometer', label: 'Thermometer' },
  ],
  HALOGEN: [
    { id: 'bench', label: 'Whole bench' },
    { id: 'tube', label: 'Test tube' },
    { id: 'rack', label: 'Rack' },
    { id: 'reagents', label: 'Reagents' },
  ],
  AMMONIA: [
    { id: 'bench', label: 'Whole bench' },
    { id: 'gasRig', label: 'Apparatus' },
    { id: 'jar', label: 'Gas jar' },
    { id: 'trough', label: 'Fountain' },
  ],
};
/** The 3D object each action group is framed by. */
export const FOCUS_OF: Record<string, string> = { bottle: 'bottle', balance: 'balance', beaker: 'beaker', flask: 'flask', flask2: 'flask2', pipette: 'pipette', stock: 'rack', rack: 'rack', tube: 'tube', hot: 'baths', ice: 'baths', funnel: 'bench', dish: 'dish', dflask: 'rig', thermometer: 'thermometer', condenser: 'rig', receiver: 'receiver', mortar: 'gasRig', gtube: 'gasRig', dryer: 'gasRig', jar: 'jar', trough: 'trough' };

export const spotOf = (p: V3, y: number, dist: number, pitch = 0.3, yaw?: number): Spot => ({ target: [p[0], y, p[2]], dist, pitch, ...(yaw !== undefined ? { yaw } : {}) });
export const world = (p: V3, y = 0): [number, number, number] => [STATION[0] + p[0], STATION[1] + p[1] + y, STATION[2] + p[2]];

const BOARD: Record<PrepTask, { lines: string[]; note: string; poster: RoomConfig['frontPoster'] }> = {
  STANDARD: { lines: ['Chemistry — SS3 Practical', 'Standard solution: 250 cm³ of 0.100 M Na₂CO₃', 'Mass = 0.100 × 0.250 × 106 = 2.65 g', 'C₁V₁ = C₂V₂'], note: 'Meniscus ON the mark, at eye level!', poster: { title: 'Standard solutions', band: '#0f3d8c', lines: ['Weigh by difference', 'Dissolve, transfer, rinse', 'Make up dropwise to the mark', 'Stopper and invert'] } },
  LECHAT: { lines: ['Chemistry — SS3 Practical', 'Le Chatelier: Fe³⁺ + SCN⁻ ⇌ FeSCN²⁺', '2CrO₄²⁻ + 2H⁺ ⇌ Cr₂O₇²⁻ + H₂O', 'Compare with the CONTROL'], note: 'A system shifts to oppose a change', poster: { title: 'Equilibrium', band: '#7c2d12', lines: ['More reactant → shifts right', 'Exothermic: heat → shifts left', 'Catalyst: no shift', 'Kc = [C]/[A][B]'] } },
  DISTIL: { lines: ['Chemistry — SS3 Practical', 'Salt and water from sea water', 'Evaporate to dryness · distil', 'Thermometer at the side arm'], note: 'Water IN at the bottom of the condenser', poster: { title: 'Separation', band: '#0e7490', lines: ['Filtration: insoluble solid', 'Evaporation: dissolved solid', 'Distillation: pure solvent', 'Fractional: miscible liquids'] } },
  HALOGEN: { lines: ['Chemistry — SS3 Practical', 'Halogens: Cl₂, Br₂, I₂ with KCl, KBr, KI', 'Hexane layer: Br₂ orange-red, I₂ violet', 'Cl₂ + 2Br⁻ → 2Cl⁻ + Br₂'], note: 'Fresh chlorine water! No flames near hexane', poster: { title: 'Group 17', band: '#3f6212', lines: ['F₂ > Cl₂ > Br₂ > I₂', 'Oxidising power decreases', 'Atomic radius increases', 'A halogen displaces those below'] } },
  AMMONIA: { lines: ['Chemistry — SS3 Practical', 'Ammonia: 2NH₄Cl + Ca(OH)₂ → CaCl₂ + 2H₂O + 2NH₃', 'Dry over CaO · upward delivery', 'Tests: litmus, HCl, fountain'], note: 'Tube mouth sloping DOWN', poster: { title: 'Ammonia', band: '#5b21b6', lines: ['Colourless, pungent', 'Less dense than air', 'Very soluble: fountain', 'Turns damp red litmus blue'] } },
};
export const prepRoom = (task: PrepTask): RoomConfig => ({ ...DEFAULT_ROOM, whiteboard: BOARD[task].lines, whiteboardNote: BOARD[task].note, frontPoster: BOARD[task].poster });

interface PrepBench {
  /** The tube in use (tube tasks). */
  active: number;
  set: (p: Partial<Omit<PrepBench, 'set'>>) => void;
}
export const BENCH_IDLE = { active: -1 };
export const usePrepBench = create<PrepBench>((set) => ({ ...BENCH_IDLE, set: (p) => set(p) }));

/** The demonstration's bench: a seed with different readings from the student's (the demo must not give answers away). */
export function demoVariant(studentSeed: number, task: PrepTask): ChemPrepVariant {
  const mine = chemPrepVariant(studentSeed, task);
  const sig = (v: ChemPrepVariant) => JSON.stringify([v.std.bottle, v.std.q, v.lc, v.ds.salt, v.ds.dish, v.hl, v.am]);
  for (let s = 7001; s < 7400; s++) {
    const v = chemPrepVariant(s, task);
    if (task === 'STANDARD' ? v.std.q.vt !== mine.std.q.vt || v.std.q.ct !== mine.std.q.ct : task === 'LECHAT' ? v.lc.cx !== mine.lc.cx : task === 'DISTIL' ? Math.abs(v.ds.salt - mine.ds.salt) >= 1 : task === 'HALOGEN' ? v.hl.c !== mine.hl.c : Math.abs(v.am.nh4 - mine.am.nh4) >= 0.1) if (sig(v) !== sig(mine)) return v;
  }
  return chemPrepVariant(7001, task);
}
