import { GLASS_BLOCK_LEFT, GLASS_BLOCK_RIGHT, GLASS_SHEET, glassImage, type GlassPoint, type GlassTrace, type PhyGlassVariant } from '@aischool/shared';
import type { CameraPresets } from '../../../lab3d-kit/controls';
import type { Spot } from '../../../lab3d-kit/store';
import { physicsRoom } from '../../phy-common/lab3d/room';
import { EYE_Y } from '../actions';

/**
 * Where things are on the student's bench (station-local metres) and how the
 * drawing board's sheet coordinates (cm: x to the right, y up the sheet, O at
 * the origin, face AB on y = 0) map onto it: the sheet's −y points at the
 * student (+z), 1 cm = 0.01 m.
 */

type V3 = [number, number, number];
/** O, the point of incidence, on the bench (station-local). */
export const O_AT = { x: -0.05, z: -0.02 };
/** Paper height above the bench top (the board is 12 mm thick). */
export const PAPER_Y = 0.0125;
/** The block's height (cm) and the eye's height above the paper (cm) when sighting. */
export const BLOCK_H = 2.5;
export const EYE_H = 1.0;
export const PIN_H = 3.6;

export const toLocal = (p: GlassPoint, hCm = 0): V3 => [O_AT.x + p.x / 100, PAPER_Y + hCm / 100, O_AT.z - p.y / 100];
export const fromLocal = (x: number, z: number): GlassPoint => ({ x: (x - O_AT.x) * 100, y: (O_AT.z - z) * 100 });
export const SHEET_CENTRE: GlassPoint = { x: (GLASS_SHEET.left + GLASS_SHEET.right) / 2, y: (GLASS_SHEET.top + GLASS_SHEET.bottom) / 2 };
export const SHEET_SIZE = { w: GLASS_SHEET.right - GLASS_SHEET.left, h: GLASS_SHEET.top - GLASS_SHEET.bottom };

export const SPOT = {
  board: toLocal(SHEET_CENTRE),
  blockHome: [0.3, 0, -0.24] as V3,
  pins: [0.27, 0, 0.06] as V3,
  protractor: [0.42, 0, 0.12] as V3,
  ruler: [0.22, 0, 0.3] as V3,
  pencil: [0.42, 0, 0.28] as V3,
  card: [-0.62, 0, -0.24] as V3,
  book: [0.75, 0, 0.18] as V3,
  extras: [-0.75, 0, 0.18] as V3,
};

const O3 = toLocal({ x: 0, y: 0 });
export const GLASS_VIEWS: CameraPresets = {
  board: { target: [SPOT.board[0], 0.01, SPOT.board[2]], dist: 0.62, pitch: 1.3, yaw: 0 },
  protractor: { target: [O3[0], 0.01, O3[2] + 0.055], dist: 0.34, pitch: 1.42, yaw: 0 },
};
export const GLASS_VIEW_BUTTONS = [
  { id: 'bench', label: 'Whole bench' },
  { id: 'board', label: 'Board' },
  { id: 'protractor', label: 'Protractor' },
];

/** The point the eye looks at while sighting: the image of P₂ (else P₁, else the middle of face CD). */
export function sightTarget(v: PhyGlassVariant, t: GlassTrace | null): GlassPoint {
  if (t?.p2 != null) return glassImage(v, t.i, t.p2);
  if (t?.p1 != null) return glassImage(v, t.i, t.p1);
  return { x: (GLASS_BLOCK_LEFT + GLASS_BLOCK_RIGHT) / 2, y: -v.thickness };
}
/** The low eye-level view through face CD from the eye at (eyeX, EYE_Y): looking at the image of P₂, orbit locked (the eye moves with the buttons). */
export function sightSpot(v: PhyGlassVariant, t: GlassTrace | null, eyeX: number): Spot {
  const T = toLocal(sightTarget(v, t), EYE_H);
  const E = toLocal({ x: eyeX, y: EYE_Y }, EYE_H);
  const dx = E[0] - T[0];
  const dz = E[2] - T[2];
  const yaw = Math.atan2(dx, dz);
  return { target: T, dist: Math.hypot(dx, dz), pitch: 0, yaw, limits: { yaw: [yaw, yaw], pitch: [0, 0] } };
}
/** The point on the line from the eye through the image of P₂ at depth `y` (cm) — where a pin "in line with what you see" goes. */
export function inLine(v: PhyGlassVariant, t: GlassTrace, eyeX: number, y: number): GlassPoint {
  const q = sightTarget(v, t);
  const k = (y - EYE_Y) / (q.y - EYE_Y);
  return { x: eyeX + (q.x - eyeX) * k, y };
}
/** Is the image at q seen through face CD from the eye (the 2D eye view's test)? */
export function throughBlock(v: PhyGlassVariant, eyeX: number, q: GlassPoint) {
  const k = (-v.thickness - EYE_Y) / (q.y - EYE_Y);
  const x = eyeX + (q.x - eyeX) * k;
  return x >= GLASS_BLOCK_LEFT && x <= GLASS_BLOCK_RIGHT;
}

/** The physics room as the glass-block practical has it. */
export const GLASS_ROOM = physicsRoom('light', ['Physics — SS3 Practical', 'Refraction through a glass block', 'i = 20°, 30°, 40°, 50°, 60°', 'Plot sin i against sin r: slope = n'], 'Look at the bases of the pins!', {
  title: 'Snell’s law',
  band: '#6a1b9a',
  lines: ['sin i / sin r = n (a constant).', 'Pins upright, at least 5 cm apart.', 'Line up the images, not the tops of the pins.'],
});
