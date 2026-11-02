import { THERM_SCALE, type ThermInstrument, type ThermTask } from '@aischool/shared';
import type { CameraPresets } from '../../../lab3d-kit/controls';
import { STATION } from '../../../lab3d-kit/layout';
import { physicsRoom } from '../../phy-common/lab3d/room';

/**
 * Where things are on the student's bench (station-local metres: x along the
 * bench, y up from the bench top, z towards the student; the front edge is at
 * z = 0.45). Expansivity: the steam can on a tripod over the burner on the
 * left, the steam jacket on its wooden base across the middle with the
 * micrometer at its right-hand end, the thermometer standing in it, the
 * outlet beaker below, the metre rule in front. Charles's law: the tripod and
 * the large beaker in the middle, the ruler with the capillary tube and
 * thermometer hanging from a clamp stand into it. Electrical heating: the
 * lagged calorimeter in the middle, the supply and the ammeter on the left,
 * the voltmeter behind, the balance on the right.
 */
export type V3 = [number, number, number];

// ---- EXPANSION
export const CAN = { x: -0.78, z: 0.04, gauze: 0.2, r: 0.055, h: 0.13 };
export const JACKET = { x0: -0.3, x1: 0.24, y: 0.1, z: 0.1, r: 0.022 };
/** The rod: from the fixed stop to the micrometer's spindle (0.6 m). */
export const ROD = { x0: -0.33, len: 0.6, r: 0.0045 };
/** The micrometer's anvil end: the spindle's tip meets the rod's free end here. */
export const MICRO = { x: ROD.x0 + ROD.len, y: JACKET.y, z: JACKET.z };
export const JTHERMO = { x: -0.04, y: JACKET.y - 0.006, z: JACKET.z };
export const OUTLET = { x: 0.2, z: 0.27 };
export const RULE = { x: -0.42, z: 0.37 };
// ---- CHARLES
export const BATH = { x: -0.15, z: 0.08, gauze: 0.2, r: 0.065, h: 0.16, water: 0.13 };
/** The ruler with the tube and thermometer: its bottom (the tube's sealed end) when fully immersed, partly, or lifted out. */
export const HANG = { full: 0.216, part: 0.257, out: 0.4 };
export const CSTAND = { x: -0.15, z: -0.12 };
export const ICE = { x: -0.62, z: 0.22 };
/** Air column drawing scale: the ruler's cm are real-size. */
// ---- ELECTRIC
export const CAL = { x: 0.08, z: 0.12, r: 0.034, h: 0.085, base: 0.012, jacketR: 0.058, jacketH: 0.1 };
export const SUPPLY = { x: -0.62, z: 0.02 };
export const AMMETER = { x: -0.32, z: 0.02 };
export const VOLTMETER = { x: 0.08, z: -0.2 };
export const BALANCE = { x: 0.62, z: 0.08 };
export const SPOT = {
  stopwatch: [0.4, 0, 0.32] as V3,
  jug: [-0.42, 0, 0.3] as V3,
  card: [-0.98, 0, -0.22] as V3,
  book: [-0.98, 0, 0.24] as V3,
  waiting: [-0.6, 0, -0.32] as V3,
  extras: [1.12, 0, 0.32] as V3,
};
/** The thermometer: 0.3 m of glass, the scale −10 … 110 °C. */
export const THERMO = { len: 0.3, from: 0.035, to: 0.285 };
export const thermoY = (c: number) => THERMO.from + ((Math.max(THERM_SCALE.min, Math.min(THERM_SCALE.max, c)) - THERM_SCALE.min) / (THERM_SCALE.max - THERM_SCALE.min)) * (THERMO.to - THERMO.from);
/** Where the task's thermometer's bulb is (station-local). */
export const thermoBase = (task: ThermTask, hang: number): V3 => (task === 'EXPANSION' ? [JTHERMO.x, JTHERMO.y, JTHERMO.z] : task === 'CHARLES' ? [BATH.x - 0.022, hang, BATH.z + 0.006] : [CAL.x - 0.014, CAL.base + 0.008, CAL.z + 0.006]);

export const THERMAL_VIEWS: CameraPresets = {
  bench: { target: [0, 0.2, 0.12], dist: 1.9, pitch: 0.42 },
  // expansion
  jacket: { target: [(JACKET.x0 + JACKET.x1) / 2, 0.16, JACKET.z], dist: 1.0, pitch: 0.3 },
  can: { target: [CAN.x, 0.25, CAN.z], dist: 0.7, pitch: 0.25 },
  micro: { target: [MICRO.x + 0.03, MICRO.y, MICRO.z], dist: 0.32, pitch: 0.25 },
  rule: { target: [RULE.x + 0.45, 0.01, RULE.z], dist: 0.85, pitch: 0.75 },
  // Charles
  bath: { target: [BATH.x, 0.27, BATH.z], dist: 0.62, pitch: 0.12 },
  // electric
  cal: { target: [CAL.x, 0.14, CAL.z], dist: 0.6, pitch: 0.4 },
  meters: { target: [(AMMETER.x + VOLTMETER.x) / 2, 0.08, -0.05], dist: 0.85, pitch: 0.35 },
  balance: { target: [BALANCE.x, 0.06, BALANCE.z], dist: 0.5, pitch: 0.6 },
  stopwatch: { target: [SPOT.stopwatch[0], 0.02, SPOT.stopwatch[2]], dist: 0.28, pitch: 0.95 },
};
export const VIEW_BUTTONS = (task: ThermTask) =>
  task === 'EXPANSION'
    ? [
        { id: 'bench', label: 'Whole bench' },
        { id: 'jacket', label: 'Jacket' },
        { id: 'micro', label: 'Micrometer' },
        { id: 'can', label: 'Steam can' },
      ]
    : task === 'CHARLES'
      ? [
          { id: 'bench', label: 'Whole bench' },
          { id: 'bath', label: 'Water bath' },
        ]
      : [
          { id: 'bench', label: 'Whole bench' },
          { id: 'cal', label: 'Calorimeter' },
          { id: 'meters', label: 'Meters' },
          { id: 'balance', label: 'Balance' },
        ];

/** The world point the eye-level view reads for an instrument (its value `x`). */
export function readPoint(task: ThermTask, k: ThermInstrument, x: number, hang: number, rodPlaced: boolean): V3 {
  const w = (p: V3): V3 => [STATION[0] + p[0], STATION[1] + p[1], STATION[2] + p[2]];
  switch (k) {
    case 'thermo': {
      const b = thermoBase(task, hang);
      return w([b[0], b[1] + thermoY(x), b[2] + 0.004]);
    }
    case 'micro':
      return w([MICRO.x + 0.045, MICRO.y + 0.012, MICRO.z + 0.01]);
    case 'rule':
      return rodPlaced ? w([JACKET.x1, JACKET.y, JACKET.z + 0.03]) : w([RULE.x + x / 1000, 0.012, RULE.z]);
    case 'column':
      return w([BATH.x + 0.004, hang + x / 100, BATH.z + 0.01]);
    case 'ammeter':
      return w([AMMETER.x, 0.07, AMMETER.z + 0.04]);
    case 'voltmeter':
      return w([VOLTMETER.x, 0.07, VOLTMETER.z + 0.04]);
    case 'balance':
      return w([BALANCE.x, 0.03, BALANCE.z + 0.08]);
    case 'watch':
      return w([SPOT.stopwatch[0], 0.03, SPOT.stopwatch[2]]);
  }
}

/** The physics room as the thermal lab has it. */
export const thermalRoom = (task: ThermTask) =>
  physicsRoom(
    'pendulum',
    task === 'CHARLES'
      ? ['Physics — SS3 Practical', 'Charles’s law (capillary tube)', 'Flame OFF, stir, wait, then read', 'Plot l against θ; extend to l = 0']
      : task === 'ELECTRIC'
        ? ['Physics — SS3 Practical', 'c of water by electrical heating', 'Heater IN the water before switching on', 'E = VIt = mcΔθ']
        : ['Physics — SS3 Practical', 'Linear expansivity of a rod', 'Back the micrometer off before steaming', 'α = e / (l₀ Δθ)'],
    task === 'CHARLES' ? 'Never open the acid tube!' : task === 'ELECTRIC' ? 'Low-voltage heaters only!' : 'Steam scalds: outlet away from people!',
    {
      title: task === 'CHARLES' ? 'Charles’s law' : task === 'ELECTRIC' ? 'Electrical heating' : 'Linear expansivity',
      band: '#8c2f1b',
      lines:
        task === 'CHARLES'
          ? ['V ∝ T at constant pressure', 'V/T = constant', 'Absolute zero: −273 °C', 'T / K = θ / °C + 273']
          : task === 'ELECTRIC'
            ? ['E = VIt  (t in seconds)', 'P = IV = I²R = V²/R', 'Q = mcΔθ (m in kg)', '1 kWh = 3.6 × 10⁶ J']
            : ['e = α l₀ Δθ', 'α(brass) ≈ 1.9 × 10⁻⁵ K⁻¹', 'β ≈ 2α, γ ≈ 3α', 'Unit of α: K⁻¹'],
    },
  );
