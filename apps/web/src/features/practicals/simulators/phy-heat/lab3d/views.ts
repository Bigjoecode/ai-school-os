import { HEAT_SCALE, type HeatTask, type HeatThermo } from '@aischool/shared';
import type { CameraPresets } from '../../../lab3d-kit/controls';
import { STATION } from '../../../lab3d-kit/layout';
import { physicsRoom } from '../../phy-common/lab3d/room';

/**
 * Where things are on the student's bench (station-local metres: x along the
 * bench, y up from the bench top, z towards the student; the front edge is at
 * z = 0.45). The Bunsen, tripod and beaker (the bath) on the left, the lagged
 * calorimeter in the middle with its thermometer standing in it, the beam
 * balance on the right; for the cooling curve a clamp stand holds the boiling
 * tube in the bath or out in the air beside it.
 */
export type V3 = [number, number, number];

export const BATH = { x: -0.35, z: 0.12, gauze: 0.2, r: 0.04, h: 0.11, water: 0.075 };
export const CAL = { x: 0.15, z: 0.14, r: 0.034, h: 0.085, base: 0.012, jacketR: 0.058, jacketH: 0.1 };
export const BALANCE = { x: 0.78, z: 0.02 };
export const STAND = { x: -0.08, z: -0.05 };
/** The boiling tube: in the bath (its bottom near the bath's floor) or clamped in air beside the stand. */
export const TUBE = { bath: [BATH.x, BATH.gauze + 0.012, BATH.z] as V3, air: [0.12, 0.2, -0.02] as V3, len: 0.15, r: 0.012 };
export const SPOT = {
  jug: [-0.66, 0, -0.08] as V3,
  ice: [-0.35, 0, 0.12] as V3,
  blotting: [-0.12, 0, 0.32] as V3,
  tongs: [-0.12, 0, 0.34] as V3,
  stopwatch: [0.42, 0, 0.3] as V3,
  room: [0.5, 0, -0.22] as V3,
  block: [-0.62, 0, 0.26] as V3,
  card: [-0.98, 0, -0.22] as V3,
  book: [-0.98, 0, 0.22] as V3,
  waiting: [-0.6, 0, -0.32] as V3,
  extras: [1.12, 0, 0.32] as V3,
};
/** The thermometer: 0.3 m of glass; the scale runs from −10 °C (bottom) to 110 °C. */
export const THERMO = { len: 0.3, bulb: 0.022, from: 0.035, to: 0.285 };
export const thermoY = (c: number) => THERMO.from + ((Math.max(HEAT_SCALE.min, Math.min(HEAT_SCALE.max, c)) - HEAT_SCALE.min) / (HEAT_SCALE.max - HEAT_SCALE.min)) * (THERMO.to - THERMO.from);
/** Where each thermometer's bulb is (station-local), when in use. */
export const thermoBase = (th: HeatThermo, tubeAt: V3): V3 =>
  th === 'bath' ? [BATH.x + 0.022, BATH.gauze + 0.012, BATH.z - 0.012] : th === 'cal' ? [CAL.x - 0.012, CAL.base + 0.008, CAL.z] : th === 'room' ? [SPOT.room[0], 0.03, SPOT.room[2]] : [tubeAt[0], tubeAt[1] + 0.012, tubeAt[2]];

export const HEAT_VIEWS: CameraPresets = {
  bench: { target: [0.1, 0.2, 0.15], dist: 1.9, pitch: 0.42 },
  heat: { target: [BATH.x, 0.25, BATH.z], dist: 0.75, pitch: 0.22 },
  cal: { target: [CAL.x, 0.16, CAL.z], dist: 0.6, pitch: 0.4 },
  balance: { target: [BALANCE.x, 0.08, BALANCE.z], dist: 0.62, pitch: 0.55 },
  tube: { target: [-0.1, 0.3, 0.05], dist: 0.8, pitch: 0.15 },
  stopwatch: { target: [SPOT.stopwatch[0], 0.02, SPOT.stopwatch[2]], dist: 0.28, pitch: 0.95 },
};
export const VIEW_BUTTONS = (task: HeatTask) =>
  task === 'COOL'
    ? [
        { id: 'bench', label: 'Whole bench' },
        { id: 'tube', label: 'Tube' },
        { id: 'heat', label: 'Water bath' },
        { id: 'stopwatch', label: 'Stopwatch' },
      ]
    : [{ id: 'bench', label: 'Whole bench' }, ...(task === 'MIX' ? [{ id: 'heat', label: 'Bath' }] : []), { id: 'cal', label: 'Calorimeter' }, { id: 'balance', label: 'Balance' }];

/** The world point the eye-level view reads: the top of the mercury in thermometer `th` (reading `c` °C). */
export const readPoint = (th: HeatThermo, c: number, tubeAt: V3): V3 => {
  const b = thermoBase(th, tubeAt);
  return [STATION[0] + b[0], STATION[1] + b[1] + thermoY(c), STATION[2] + b[2] + 0.004];
};

/** The physics room as the heat lab has it. */
export const heatRoom = (task: HeatTask) =>
  physicsRoom(
    'pendulum',
    task === 'COOL'
      ? ['Physics — SS3 Practical', 'Cooling curve of naphthalene', 'Heat in a WATER BATH only', 'Read θ every 30 s to 65 °C']
      : task === 'LATENT'
        ? ['Physics — SS3 Practical', 'Latent heat of fusion of ice', 'Dry the ice; stir; lowest θ₂', 'Start above room, finish below']
        : ['Physics — SS3 Practical', 'Specific heat capacity: mixtures', 'Transfer the block QUICKLY', 'Heat lost = heat gained'],
    task === 'COOL' ? 'Never heat naphthalene over a flame!' : 'A thermometer is not a stirrer!',
    {
      title: task === 'COOL' ? 'Cooling curve' : task === 'LATENT' ? 'Latent heat' : 'Method of mixtures',
      band: '#8c2f1b',
      lines:
        task === 'COOL'
          ? ['Liquid cools, then a plateau:', 'it freezes at constant θ.', 'Latent heat given out', 'balances the heat lost.']
          : task === 'LATENT'
            ? ['(m_w c_w + m_c c_c)(θ₁ − θ₂)', '= m_i L + m_i c_w θ₂', 'L(ice) = 3.34 × 10⁵ J kg⁻¹', 'Ice at 0 °C, dried.']
            : ['Q = m c Δθ', 'm c (θ₁ − θ₃) =', '(m_w c_w + m_c c_c)(θ₃ − θ₂)', 'c(water) = 4200 J kg⁻¹ K⁻¹'],
    },
  );
