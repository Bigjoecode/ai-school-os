import { DEPTH_EYE_H, PINS_SHEET, depthStack, pinsEye, pinsImage, pinsPrism, type PhyPinsVariant, type PinsPoint, type PinsTask, type PinsTrace } from '@aischool/shared';
import type { CameraPresets } from '../../../lab3d-kit/controls';
import type { Spot } from '../../../lab3d-kit/store';
import { physicsRoom } from '../../phy-common/lab3d/room';
import { pushCentre } from '../actions';

/**
 * Where things are on the student's bench (station-local metres: x along the
 * bench, y up, z towards the student). The drawing board's sheet (cm: x to the
 * right, y up the sheet) maps with −y towards the student, 1 cm = 0.01 m.
 */

type V3 = [number, number, number];
export const O_AT = { x: -0.05, z: 0.0 };
export const PAPER_Y = 0.0125;
/** The eye's height above the paper when sighting (cm), pins' height (cm), the mirror's and the prism's height (cm). */
export const EYE_H = 1.0;
export const PIN_H = 3.6;
export const OBJ_H = 2.5;

export const toLocal = (p: PinsPoint, hCm = 0): V3 => [O_AT.x + p.x / 100, PAPER_Y + hCm / 100, O_AT.z - p.y / 100];
export const fromLocal = (x: number, z: number): PinsPoint => ({ x: (x - O_AT.x) * 100, y: (O_AT.z - z) * 100 });
export const sheetCentre = (task: 'MIRROR' | 'PRISM'): PinsPoint => {
  const S = PINS_SHEET[task];
  return { x: (S.left + S.right) / 2, y: (S.top + S.bottom) / 2 };
};
export const sheetSize = (task: 'MIRROR' | 'PRISM') => {
  const S = PINS_SHEET[task];
  return { w: S.right - S.left, h: S.top - S.bottom };
};

/** Depth: the cross on its paper; the stand with the rule and the search pin to its left. Dispersion: ray box, turntable, screen. */
export const DEPTH_AT: V3 = [0.02, 0, -0.02];
export const DEPTH_RULE_AT: V3 = [-0.1, 0, -0.02];
export const DISP_BOX_AT: V3 = [-0.42, 0, -0.04];
export const DISP_PRISM_AT: V3 = [-0.08, 0, -0.04];

export const SPOT = {
  pins: [0.34, 0, 0.1] as V3,
  protractor: [0.46, 0, 0.2] as V3,
  ruler: [0.26, 0, 0.32] as V3,
  pencil: [0.48, 0, 0.3] as V3,
  objHome: [0.36, 0, -0.22] as V3,
  card: [-0.66, 0, -0.26] as V3,
  book: [0.8, 0, 0.2] as V3,
  extras: [-0.8, 0, 0.2] as V3,
};

/** The screen's distance from the prism on the bench (m) for d cm. */
export const screenX = (dist: number) => DISP_PRISM_AT[0] + dist / 100;

export function pinsPresets(task: PinsTask, s: { depthBlocks: number; dist: number; measure: PinsPoint | null }, v: PhyPinsVariant): CameraPresets {
  if (task === 'MIRROR' || task === 'PRISM') {
    const c = toLocal(sheetCentre(task));
    const m = toLocal(s.measure ?? (task === 'MIRROR' ? { x: 0, y: 0 } : pinsPrism(v).O));
    return {
      board: { target: [c[0], 0.01, c[2]], dist: task === 'PRISM' ? 0.72 : 0.6, pitch: 1.3, yaw: 0 },
      protractor: { target: [m[0], 0.01, m[2]], dist: 0.3, pitch: 1.42, yaw: 0 },
    };
  }
  if (task === 'DEPTH') {
    const top = depthStack(v, s.depthBlocks) / 100;
    return {
      stack: { target: [DEPTH_AT[0] - 0.04, 0.05, DEPTH_AT[2]], dist: 0.42, pitch: 0.2, yaw: 0 },
      rule: { target: [DEPTH_RULE_AT[0], 0.06 + top / 2, DEPTH_RULE_AT[2]], dist: 0.24, pitch: 0.05, yaw: 0 },
    };
  }
  return {
    screen: { target: [screenX(s.dist), 0.08, DISP_PRISM_AT[2]], dist: 0.34, pitch: 0.12, yaw: -1.45 },
    turntable: { target: [DISP_PRISM_AT[0], 0.03, DISP_PRISM_AT[2]], dist: 0.4, pitch: 1.1, yaw: 0 },
  };
}
export function viewButtons(task: PinsTask) {
  if (task === 'MIRROR' || task === 'PRISM')
    return [
      { id: 'bench', label: 'Whole bench' },
      { id: 'board', label: 'Board' },
      { id: 'protractor', label: 'Protractor' },
    ];
  if (task === 'DEPTH')
    return [
      { id: 'bench', label: 'Whole bench' },
      { id: 'stack', label: 'Stack & pin' },
      { id: 'rule', label: 'Rule' },
    ];
  return [
    { id: 'bench', label: 'Whole bench' },
    { id: 'turntable', label: 'Prism' },
    { id: 'screen', label: 'Screen' },
  ];
}

/** The eye-level view across the paper from the eye at φ, aimed at the image of P₂ (orbit locked: the eye moves with the buttons). */
export function sightSpot(v: PhyPinsVariant, task: 'MIRROR' | 'PRISM', t: PinsTrace | null, phi: number): Spot {
  const q = (t && (t.p2 !== null || t.p1 !== null) ? pinsImage(v, task, t.i, (t.p2 ?? t.p1)!) : null) ?? pushCentre(v, task);
  const T = toLocal(q, EYE_H);
  const E = toLocal(pinsEye(v, task, phi), EYE_H);
  const dx = E[0] - T[0];
  const dz = E[2] - T[2];
  const yaw = Math.atan2(dx, dz);
  return { target: T, dist: Math.hypot(dx, dz), pitch: 0, yaw, limits: { yaw: [yaw, yaw], pitch: [0, 0] }, fov: 34 };
}
/** Looking vertically down on the cross from DEPTH_EYE_H above the top face, eye moved sideways by eyeX (cm). */
export function depthLookSpot(v: PhyPinsVariant, blocks: number, eyeX: number): Spot {
  const top = depthStack(v, blocks) / 100;
  // Orbit locked straight down; the target moves with the eye so the camera moves sideways over the cross.
  return { target: [DEPTH_AT[0] - 0.035 + eyeX / 100, top, DEPTH_AT[2]], dist: DEPTH_EYE_H / 100, pitch: 1.5707, yaw: 0, limits: { yaw: [0, 0], pitch: [1.5707, 1.5707] }, fov: 30 };
}
/** The world point read in eye-level mode (depth: the search pin on the rule). */
export const readPoint = (h: number): V3 => [DEPTH_RULE_AT[0], h / 100, DEPTH_RULE_AT[2]];

const BOARDS: Record<PinsTask, [string[], string, { title: string; band: string; lines: string[] }]> = {
  MIRROR: [['Physics — SS3 Practical', 'Laws of reflection (pin method)', 'i = 20°, 30°, 40°, 50°, 60°', 'Plot r against i'], 'Measure from the NORMAL!', { title: 'Reflection', band: '#1565c0', lines: ['Angle of reflection = angle of incidence.', 'Incident ray, reflected ray and normal in one plane.', 'Line MM′ along the silvered surface.'] }],
  PRISM: [['Physics — SS3 Practical', 'Deviation through a prism', 'i = 35° to 65° in 5° steps', 'n = sin((A+Dₘ)/2) / sin(A/2)'], 'Smooth curve, not a straight line!', { title: 'Minimum deviation', band: '#6a1b9a', lines: ['D = i + e − A.', 'At Dₘ the ray passes symmetrically: i = e.', 'Pins upright, at least 5 cm apart.'] }],
  DEPTH: [['Physics — SS3 Practical', 'Real and apparent depth', '1, 2, 3, 4 glass blocks', 'n = real ÷ apparent'], 'No parallax: move your eye!', { title: 'Apparent depth', band: '#00695c', lines: ['Objects under glass look raised.', 'n = real depth ÷ apparent depth.', 'Apparent depth from the TOP face.'] }],
  DISP: [['Physics — SS3 Practical', 'Dispersion of white light', 'Dark room, narrow slit', 'ROYGBIV — violet deviated most'], 'Never look at the Sun through a prism!', { title: 'Dispersion', band: '#b71c1c', lines: ['White light is a mixture of colours.', 'Each colour: a different n in glass.', 'Red least deviated, violet most.'] }],
};
export const pinsRoom = (task: PinsTask) => physicsRoom('light', BOARDS[task][0], BOARDS[task][1], BOARDS[task][2]);
