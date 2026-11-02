import { INCLINE_LEN, type MechTask } from '@aischool/shared';
import type { CameraPresets } from '../../../lab3d-kit/controls';
import { STATION } from '../../../lab3d-kit/layout';
import { physicsRoom } from '../../phy-common/lab3d/room';

/**
 * Where things are on the student's bench (station-local metres: x along the
 * bench, y up from its top, z towards the student) for each task's rig.
 */

type V3 = [number, number, number];
export const SPOT = {
  card: [-1.05, 0, 0.27] as V3,
  book: [0.95, 0, 0.27] as V3,
  /** Where collected apparatus waits before it is set out, and the things not in use. */
  waiting: [-0.62, 0, 0.16] as V3,
  extras: [0.5, 0, 0.3] as V3,
};

// ---- FRICTION: the plank along x, hinged at its left end; the block on it; the balance to its right.
export const PLANK = { x0: -0.6, len: 1.0, w: 0.13, t: 0.02, z: -0.06 };
/** The block's rest position along the plank (m from the hinge) and its size. */
export const BLOCK = { at: 0.3, l: 0.1, h: 0.05, w: 0.07 };
/** The spring balance: its body's length; the slack thread from the block's hook to it. */
export const SB = { len: 0.2, gap: 0.1 };

// ---- VISCOSITY: the two tall cylinders, the rule beside the glycerine.
export const CYL = { r: 0.034, h: 0.44, liquid: 0.37, base: 0.012 };
export const GLY_AT: V3 = [-0.12, 0, -0.12];
export const OIL_AT: V3 = [0.14, 0, -0.14];
/** The liquid's surface height above the bench (m). */
export const SURFACE = CYL.base + CYL.liquid;

// ---- INCLINE: the 2 m plank along x, the raised end (start line) on the left.
export const RAMP = { x0: -1.0, z: -0.16, w: 0.08, t: 0.022 };
export const RAMP_LEN = INCLINE_LEN / 100;

// ---- FORCES: the vertical board at the back; board points in cm from the paper's bottom-middle.
export const BOARD = { z: -0.3, w: 0.62, h: 0.5, y0: 0.06, t: 0.018 };
export const PAPER_Y0 = BOARD.y0 + 0.04;
/** Station-local point of a board point (cm, paper coordinates). */
export const boardPt = (x: number, y: number): V3 => [x / 100, PAPER_Y0 + y / 100, BOARD.z + BOARD.t / 2 + 0.003];
export const PULLEY_R = 0.022;

export const MECH_VIEWS: CameraPresets = {
  bench: { target: [0, 0.14, -0.02], dist: 1.6, pitch: 0.36 },
  friction: { target: [-0.12, 0.1, PLANK.z], dist: 1.05, pitch: 0.22 },
  visc: { target: [0.01, 0.2, -0.13], dist: 1.25, pitch: 0.12 },
  incline: { target: [-0.1, 0.06, RAMP.z], dist: 1.3, pitch: 0.25 },
  forces: { target: [0, 0.3, BOARD.z], dist: 0.95, pitch: 0.05 },
};
export const RIG_VIEW: Record<MechTask, string> = { FRICTION: 'friction', VISCOSITY: 'visc', INCLINE: 'incline', FORCES: 'forces' };
export const viewButtons = (task: MechTask) => [
  { id: 'bench', label: 'Whole bench' },
  { id: RIG_VIEW[task], label: task === 'FRICTION' ? 'Block and plank' : task === 'VISCOSITY' ? 'The cylinders' : task === 'INCLINE' ? 'The incline' : 'The board' },
];

/** The world point the eye-level view reads for each task. */
export function readPoint(task: MechTask, at: { band?: number; stop?: number; knot?: [number, number] }): [number, number, number] {
  const w = (p: V3): [number, number, number] => [STATION[0] + p[0], STATION[1] + p[1], STATION[2] + p[2]];
  if (task === 'VISCOSITY') return w([GLY_AT[0], SURFACE - (at.band ?? 8) / 100, GLY_AT[2] + CYL.r]);
  if (task === 'INCLINE') return w([RAMP.x0 + (at.stop ?? 40) / 100, 0.06, RAMP.z + 0.04]);
  if (task === 'FORCES') return w(boardPt(at.knot?.[0] ?? 0, at.knot?.[1] ?? 15));
  return w([PLANK.x0 + BLOCK.at + BLOCK.l + SB.gap + SB.len / 2, 0.05, PLANK.z]);
}

const BOARD_TEXT: Record<MechTask, string[]> = {
  FRICTION: ['Physics — SS3 Practical', 'Coefficient of static friction', 'F just as it starts to move; R = weight', 'Plot F against R: μ = slope; μ = tan θ'],
  VISCOSITY: ['Physics — SS3 Practical', 'Terminal velocity in glycerine', 'Upper band ~8 cm down; bands 20.0 cm apart', 'Plot v against r²: η = 2(ρs − ρl)g/(9 × slope)'],
  INCLINE: ['Physics — SS3 Practical', 'Uniform acceleration', 's = 0.40, 0.80, 1.20, 1.60 m; time ×3', 'Plot s against t²: a = 2 × slope'],
  FORCES: ['Physics — SS3 Practical', 'Parallelogram of forces', 'P = 300 g, Q = 400 g, W = 500 g (g = 10 N/kg)', 'Diagonal R: equal and opposite to W'],
};
const POSTER: Record<MechTask, { title: string; band: string; lines: string[] }> = {
  FRICTION: { title: 'Laws of solid friction', band: '#6d4c41', lines: ['Friction opposes relative motion.', 'Limiting friction F ∝ normal reaction R: F = μR.', 'μ does not depend on the area in contact.', 'On an incline: μ = tan θ at slipping.'] },
  VISCOSITY: { title: 'Viscosity', band: '#0f6b5c', lines: ['At terminal velocity: weight = upthrust + drag.', 'Stokes: F = 6πηrv.', 'v = 2r²(ρs − ρl)g/(9η).', 'Heating lowers the viscosity.'] },
  INCLINE: { title: 'Equations of motion', band: '#0f3d8c', lines: ['v = u + at', 's = ut + ½at²', 'v² = u² + 2as', 'From rest: s = ½at².'] },
  FORCES: { title: 'Vectors', band: '#5b2a86', lines: ['Parallelogram law: the diagonal from the common point is the resultant.', 'The equilibrant is equal and opposite to the resultant.', 'R² = P² + Q² + 2PQ cos θ.'] },
};
export const mechRoom = (task: MechTask) => physicsRoom('pendulum', BOARD_TEXT[task], task === 'FORCES' ? 'Tap the board!' : task === 'FRICTION' ? 'Pull slowly!' : 'Reset the stop-clock!', POSTER[task]);
