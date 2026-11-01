import type { DensityTask, PhyDensityState } from '@aischool/shared';
import type { CameraPresets } from '../../../lab3d-kit/controls';
import { STATION } from '../../../lab3d-kit/layout';
import { physicsRoom } from '../../phy-common/lab3d/room';

/**
 * Where things are at the student's bench (station-local metres: x along the
 * bench, y up from the bench top, z towards the student; the front edge is at
 * z = 0.45). The triple-beam balance stands at the right; the calipers are
 * held up to the eye in a small holder in the middle with the objects on a
 * cloth beside them; the Archimedes stand carries the spring balance over the
 * eureka can (its spout to the right, the catch beaker under it) with the salt
 * solution to the left; the tall cylinder of water for the flotation tube; the
 * density bottle with its beakers, dropper, tissue and thermometer.
 */
export type V3 = [number, number, number];

export const BALANCE = { x: 0.72, z: -0.08 };
/** The calipers in their holder (the scale faces the student). */
export const CALS = { x: -0.05, y: 0.2, z: 0.12 };
export const CLOTH = { x: -0.42, z: 0.22 };
/** Archimedes: the stand, the balance's hook height, the eureka can (on a block) and its spout, the catch beaker, the salt solution. */
export const STAND = { x: -0.02, z: -0.26, hook: 0.6 };
export const CAN = { x: 0.06, z: -0.12, r: 0.05, base: 0.08, h: 0.14 };
export const SPOUT = { x: CAN.x + CAN.r + 0.05, y: CAN.base + CAN.h - 0.03 };
export const CATCH = { x: CAN.x + CAN.r + 0.075, z: CAN.z };
export const SALT = { x: -0.24, z: -0.12, r: 0.045, h: 0.11 };
/** The stone's hanging point over the can or the salt solution. */
export const hangX = (s: PhyDensityState) => (s.where === 'salt' ? SALT.x : CAN.x);
export const SB = { len: 0.17 };
/** Flotation: the tall cylinder of water (its water surface at `water` above the bench). */
export const CYL = { x: 0.02, z: -0.08, r: 0.035, h: 0.34, water: 0.29 };
export const TUBE3 = { r: 0.012, len: 0.2 };
export const SHOT = { x: -0.28, z: 0.05 };
/** Density bottle: where it stands, the beakers, the thermometer. */
export const BOTTLE = { x: 0.02, z: 0.08 };
export const BEAKERS = { water: [-0.3, 0, -0.08] as V3, liquid: [-0.44, 0, -0.08] as V3 };
export const THERMO = { x: -0.72, z: -0.15 };
export const SPOT = { card: [-0.95, 0, -0.22] as V3, book: [-0.55, 0, 0.26] as V3, waiting: [-0.95, 0, 0.12] as V3, extras: [-1.15, 0, 0.3] as V3 };

const B = { x: BALANCE.x + 0.06, z: BALANCE.z };
export const DENSITY_VIEWS = (task: DensityTask): CameraPresets => {
  const balance = { target: [B.x, 0.08, B.z] as V3, dist: 0.62, pitch: 0.42 };
  if (task === 'CAL')
    return {
      bench: { target: [0.1, 0.12, 0.1], dist: 1.7, pitch: 0.35 },
      instrument: { target: [CALS.x, CALS.y, CALS.z], dist: 0.42, pitch: 0.12 },
      objects: { target: [CLOTH.x, 0.02, CLOTH.z], dist: 0.55, pitch: 0.75 },
    };
  if (task === 'ARCH')
    return {
      bench: { target: [0.2, 0.2, 0.0], dist: 1.8, pitch: 0.3 },
      stand: { target: [CAN.x - 0.05, 0.3, CAN.z], dist: 0.95, pitch: 0.15 },
      can: { target: [CAN.x + 0.04, 0.16, CAN.z], dist: 0.55, pitch: 0.25 },
      balance,
    };
  if (task === 'FLOAT')
    return {
      bench: { target: [0.2, 0.15, 0.0], dist: 1.7, pitch: 0.32 },
      cylinder: { target: [CYL.x, CYL.water - 0.05, CYL.z], dist: 0.6, pitch: 0.12 },
      instrument: { target: [CALS.x - 0.45, CALS.y, CALS.z], dist: 0.42, pitch: 0.12 },
      balance,
    };
  return {
    bench: { target: [0.1, 0.12, 0.0], dist: 1.7, pitch: 0.35 },
    bottle: { target: [BOTTLE.x, 0.08, BOTTLE.z], dist: 0.5, pitch: 0.3 },
    thermometer: { target: [THERMO.x, 0.2, THERMO.z], dist: 0.45, pitch: 0.1 },
    balance,
  };
};
export const VIEW_BUTTONS = (task: DensityTask) =>
  task === 'CAL'
    ? [
        { id: 'bench', label: 'Whole bench' },
        { id: 'instrument', label: 'Instrument' },
        { id: 'objects', label: 'Objects' },
      ]
    : task === 'ARCH'
      ? [
          { id: 'bench', label: 'Whole bench' },
          { id: 'stand', label: 'Spring balance' },
          { id: 'can', label: 'Eureka can' },
          { id: 'balance', label: 'Balance' },
        ]
      : task === 'FLOAT'
        ? [
            { id: 'bench', label: 'Whole bench' },
            { id: 'cylinder', label: 'Cylinder' },
            { id: 'instrument', label: 'Vernier' },
            { id: 'balance', label: 'Balance' },
          ]
        : [
            { id: 'bench', label: 'Whole bench' },
            { id: 'bottle', label: 'Bottle' },
            { id: 'thermometer', label: 'Thermometer' },
            { id: 'balance', label: 'Balance' },
          ];

/** The world point the eye-level view reads: the instrument's scale, the balance's pointer, the water at the tube, the thermometer. */
export function readPoint(task: DensityTask, s: PhyDensityState, _h = 0): V3 {
  const w = (x: number, y: number, z: number): V3 => [STATION[0] + x, STATION[1] + y, STATION[2] + z];
  if (task === 'ARCH') return w(hangX(s) + 0.012, STAND.hook - 0.09, STAND.z + 0.16);
  if (task === 'FLOAT') return s.floating ? w(CYL.x, CYL.water, CYL.z + TUBE3.r) : w(CALS.x - 0.45, CALS.y, CALS.z + 0.01);
  if (task === 'BOTTLE') return w(THERMO.x, 0.2, THERMO.z + 0.01);
  return w(CALS.x, CALS.y, CALS.z + 0.01);
}
export const canRead = (task: DensityTask, s: PhyDensityState) => (task === 'CAL' ? !!s.tool : task === 'ARCH' ? true : task === 'FLOAT' ? s.floating || !!s.tool : s.tempRead);

const BOARD: Record<DensityTask, string[]> = {
  CAL: ['Physics — SS3 Practical', 'Vernier calipers & micrometer', 'Zero error first! Mean of 3', 'V = (4/3)πr³'],
  ARCH: ['Physics — SS3 Practical', 'Archimedes’ principle', 'W₁ air, W₂ water, W₃ salt soln', 'RD = W₁/(W₁ − W₂)'],
  FLOAT: ['Physics — SS3 Practical', 'Law of flotation', 'Loads 10–50 g; read h', 'Plot h against m'],
  BOTTLE: ['Physics — SS3 Practical', 'The density bottle', 'm₁ empty, m₂ water, m₃ liquid', 'RD = (m₃ − m₁)/(m₂ − m₁)'],
};
const POSTER: Record<DensityTask, { title: string; band: string; lines: string[] }> = {
  CAL: { title: 'Reading instruments', band: '#00695c', lines: ['Vernier: 0.01 cm', 'Micrometer: 0.01 mm', 'Corrected = reading − zero error', 'Eye square on: no parallax'] },
  ARCH: { title: 'Archimedes', band: '#1565c0', lines: ['Upthrust = weight of fluid displaced', 'RD = W₁/(W₁ − W₂)', 'RD(liquid) = loss in liquid ÷ loss in water', 'RD has no unit'] },
  FLOAT: { title: 'Flotation', band: '#2e7d32', lines: ['A floating body displaces', 'its own weight of fluid.', 'ρAh = M + m', 'slope = 1/(ρA)'] },
  BOTTLE: { title: 'Relative density', band: '#6a1b9a', lines: ['RD = mass of substance ÷', 'mass of equal volume of water', 'ρ = RD × ρ(water)', 'Water: 997 kg m⁻³ at 25 °C'] },
};
/** The physics room as the density labs have it. */
export const densityRoom = (task: DensityTask) => physicsRoom('pendulum', BOARD[task], task === 'BOTTLE' ? 'Kerosene: no flames!' : task === 'ARCH' ? 'Wipe spills at once!' : 'Zero error first!', POSTER[task]);
