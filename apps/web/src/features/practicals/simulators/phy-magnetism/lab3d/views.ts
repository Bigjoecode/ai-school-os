import type { MagTask } from '@aischool/shared';
import type { CameraPresets } from '../../../lab3d-kit/controls';
import { STATION } from '../../../lab3d-kit/layout';
import { physicsRoom } from '../../phy-common/lab3d/room';

/**
 * Where things are on the student's bench (station-local metres: x along the
 * bench, y up from its top, z towards the student) for each task's rig.
 */

export type V3 = [number, number, number];
export const SPOT = {
  card: [-1.05, 0, 0.27] as V3,
  book: [0.95, 0, 0.27] as V3,
  waiting: [-0.62, 0, 0.2] as V3,
};

// ---- FIELD: the drawing board flat on the bench, the paper on it (42 × 32 cm), north away from the student (−z).
export const FBOARD = { x: -0.05, z: -0.06, w: 0.5, d: 0.4, t: 0.018 };
export const PAPER_Y = FBOARD.t + 0.001;
/** Station-local point of a paper point (cm; x east, y north). */
export const paperPt = (x: number, y: number, h = 0): V3 => [FBOARD.x + x / 100, PAPER_Y + h, FBOARD.z - y / 100];

// ---- ELECTROMAGNET: the circuit along the back; the nail in a clamp above the dish of clips.
export const EMP = {
  cells: [-0.5, 0, -0.24] as V3,
  key: [-0.2, 0, -0.24] as V3,
  rheostat: [0.16, 0, -0.26] as V3,
  ammeter: [0.48, 0, -0.08] as V3,
  stand: [-0.02, 0, 0.02] as V3,
  dish: [0.02, 0, 0.08] as V3,
};
/** The nail's tip above the bench: down in the clips, and lifted. */
export const NAIL = { down: 0.025, up: 0.1, len: 0.11 };

// ---- INDUCTION: the coil lying along x; the magnet comes in from +x; the galvanometer far (left) or near (beside the coil).
export const COIL = { at: [-0.02, 0, -0.04] as V3, len: 0.16, r: 0.04 };
export const MAG_OUT_X = COIL.at[0] + COIL.len / 2 + 0.2;
export const MAG_IN_X = COIL.at[0] + 0.02;
export const GALVO_FAR: V3 = [-0.55, 0, -0.16];
export const GALVO_NEAR: V3 = [0.3, 0, -0.24];

// ---- DIODE: the parts on the board.
export const DP = {
  cells: [-0.5, 0, -0.24] as V3,
  pot: [-0.12, 0, -0.26] as V3,
  key: [0.26, 0, -0.26] as V3,
  resistor: [-0.3, 0, 0.04] as V3,
  diode: [-0.04, 0, 0.06] as V3,
  mamm: [0.24, 0, -0.02] as V3,
  vmeter: [0.5, 0, 0.0] as V3,
};

export const MAG_VIEWS: CameraPresets = {
  bench: { target: [0, 0.12, -0.02], dist: 1.6, pitch: 0.42 },
  field: { target: [FBOARD.x, 0.02, FBOARD.z], dist: 0.75, pitch: 1.05 },
  em: { target: [0, 0.1, -0.06], dist: 1.05, pitch: 0.32 },
  ind: { target: [-0.08, 0.06, -0.08], dist: 0.95, pitch: 0.3 },
  diode: { target: [0, 0.07, -0.08], dist: 1.1, pitch: 0.45 },
};
export const RIG_VIEW: Record<MagTask, string> = { FIELD: 'field', ELECTROMAGNET: 'em', INDUCTION: 'ind', DIODE: 'diode' };
export const viewButtons = (task: MagTask) => [
  { id: 'bench', label: 'Whole bench' },
  { id: RIG_VIEW[task], label: task === 'FIELD' ? 'The paper' : task === 'ELECTROMAGNET' ? 'The electromagnet' : task === 'INDUCTION' ? 'Coil and galvanometer' : 'The circuit' },
];

/** The world point the eye-level view reads. */
export function readPoint(task: MagTask, at: { cx?: number; cy?: number; galvoFar?: boolean }): [number, number, number] {
  const w = (p: V3): [number, number, number] => [STATION[0] + p[0], STATION[1] + p[1], STATION[2] + p[2]];
  if (task === 'FIELD') return w(paperPt(at.cx ?? 0, at.cy ?? 0, 0.02));
  if (task === 'ELECTROMAGNET') return w([EMP.ammeter[0], 0.08, EMP.ammeter[2]]);
  if (task === 'INDUCTION') return w([(at.galvoFar ? GALVO_FAR : GALVO_NEAR)[0], 0.08, (at.galvoFar ? GALVO_FAR : GALVO_NEAR)[2]]);
  return w([DP.mamm[0] + 0.12, 0.08, DP.mamm[2]]);
}

const BOARD_TEXT: Record<MagTask, string[]> = {
  FIELD: ['Physics — SS3 Practical', 'Field lines and neutral points', 'Meridian first; no steel near the board', 'Tap the compass; dot to dot from N to S'],
  ELECTROMAGNET: ['Physics — SS3 Practical', 'Strength of an electromagnet', '30 turns: 0.5, 1.0, 1.5, 2.0 A', 'Then 60 turns at 1.0 A; no core'],
  INDUCTION: ['Physics — SS3 Practical', 'Electromagnetic induction', 'In, still, out; fast; S pole; 2 magnets', '600 turns. E = NΔΦ/Δt'],
  DIODE: ['Physics — SS3 Practical', 'I–V characteristic of a diode', 'Small steps near the knee', 'Reverse bias: I ≈ 0'],
};
const POSTER: Record<MagTask, { title: string; band: string; lines: string[] }> = {
  FIELD: { title: 'Magnetic fields', band: '#b91c1c', lines: ['Lines run from N to S outside a magnet.', 'Field lines never cross.', 'Neutral point: resultant flux density zero.', 'The Earth’s horizontal field points north.'] },
  ELECTROMAGNET: { title: 'Electromagnets', band: '#0f3d8c', lines: ['Strength rises with the current and the turns.', 'Soft iron: easily magnetised and demagnetised.', 'Uses: bell, relay, crane, loudspeaker.'] },
  INDUCTION: { title: 'Induction', band: '#0f6b5c', lines: ['Faraday: E = N ΔΦ/Δt.', 'Lenz: the induced current opposes the change.', 'Uses: generators, transformers.'] },
  DIODE: { title: 'The p–n junction', band: '#5b2a86', lines: ['Forward bias: conducts above ≈ 0.6 V (Si).', 'Reverse bias: almost no current.', 'Rectification: a.c. → d.c.', 'Always use a protective resistor.'] },
};
export const magRoom = (task: MagTask) => physicsRoom(task === 'FIELD' ? 'pendulum' : 'ohm', BOARD_TEXT[task], task === 'FIELD' ? 'Tap the compass!' : task === 'DIODE' ? 'Resistor in!' : task === 'INDUCTION' ? 'Along the axis!' : 'Open the key!', POSTER[task]);
