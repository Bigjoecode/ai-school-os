import { RATES_SYRINGE, type RatesTask } from '@aischool/shared';
import type { CameraPresets } from '../../../lab3d-kit/controls';
import { STATION } from '../../../lab3d-kit/layout';
import { CHEM_SHELF, type RoomConfig } from '../../../lab3d-kit/room';

/**
 * Where things are on the student's bench (station-local metres: x along the
 * bench, y up from the bench top, z towards the student; the front edge is
 * at z = 0.45). Magnesium: the conical flask in front, its bung's delivery
 * tube rising to a horizontal gas syringe clamped on a retort stand behind
 * and to the right; the plunger slides out to the right as hydrogen comes in.
 * Thiosulphate: the flask stands on the paper cross, the water bath to the
 * right, the cylinders and bottles to the left.
 */
export type V3 = [number, number, number];

export const FLASK: V3 = [0, 0, 0.12];
export const FLASK_TOP = 0.138;
export const STAND = { base: [0.36, 0, -0.14] as V3, rod: [0.36, 0, -0.24] as V3, h: 0.55 };
/** The syringe: its axis along +x at height y, depth z; the nozzle at x0; the barrel from x1 (0 cm³) to x1 + L (100 cm³). */
export const SYR = { y: 0.3, z: -0.06, x0: 0.1, x1: 0.13, L: 0.28, r: 0.017 };
export const plungerX = (cm3: number) => SYR.x1 + (Math.max(0, Math.min(RATES_SYRINGE, cm3)) / RATES_SYRINGE) * SYR.L;
export const BATH: V3 = [0.48, 0, -0.1];
export const SPOT = {
  stopwatch: [-0.12, 0, 0.32] as V3,
  stopwatchX: [0.26, 0, 0.32] as V3,
  ribbon: [-0.3, 0, 0.2] as V3,
  sandpaper: [-0.46, 0, 0.24] as V3,
  balance: [-0.6, 0, -0.08] as V3,
  acid1: [-0.32, 0, -0.28] as V3,
  acid2: [-0.18, 0, -0.28] as V3,
  thio: [-0.34, 0, -0.28] as V3,
  hcl2: [-0.2, 0, -0.28] as V3,
  washBottle: [-0.5, 0, -0.24] as V3,
  cylinder: [0.62, 0, 0.18] as V3,
  cylinderX: [-0.3, 0, 0.14] as V3,
  smallCyl: [-0.17, 0, 0.22] as V3,
  beaker: [0.78, 0, -0.16] as V3,
  card: [-0.9, 0, -0.22] as V3,
  book: [0.86, 0, 0.27] as V3,
  waiting: [-0.75, 0, 0.12] as V3,
  extras: [-1.05, 0, 0.2] as V3,
};

export const RATES_VIEWS: CameraPresets = {
  bench: { target: [0.08, 0.14, 0.02], dist: 1.55, pitch: 0.62 },
  flask: { target: [FLASK[0], 0.07, FLASK[2]], dist: 0.45, pitch: 0.3 },
  syringe: { target: [SYR.x1 + SYR.L / 2, SYR.y, SYR.z], dist: 0.55, pitch: 0.12 },
  top: { target: [FLASK[0], 0.02, FLASK[2]], dist: 0.42, pitch: 1.38, limits: { pitch: [0.9, 1.5] } },
  bath: { target: [BATH[0], 0.08, BATH[2]], dist: 0.6, pitch: 0.45 },
  stopwatch: { target: [SPOT.stopwatch[0], 0.02, SPOT.stopwatch[2]], dist: 0.3, pitch: 0.95 },
  stopwatchX: { target: [SPOT.stopwatchX[0], 0.02, SPOT.stopwatchX[2]], dist: 0.3, pitch: 0.95 },
};
export const VIEW_BUTTONS = (task: RatesTask) =>
  task === 'MG'
    ? [
        { id: 'bench', label: 'Whole bench' },
        { id: 'flask', label: 'Flask' },
        { id: 'syringe', label: 'Syringe' },
        { id: 'stopwatch', label: 'Stopwatch' },
      ]
    : [
        { id: 'bench', label: 'Whole bench' },
        { id: 'top', label: 'Look down' },
        { id: 'flask', label: 'Flask' },
        { id: 'stopwatchX', label: 'Stopwatch' },
      ];

/** The thermometer in the flask: its 0 °C mark's height and metres per °C. */
export const THERMO = { x: FLASK[0] + 0.012, z: FLASK[2] + 0.004, y0: 0.03, perC: 0.0016 };
/** The world point the eye-level view reads: the syringe scale at the plunger (magnesium), the thermometer's column (thiosulphate). */
export const readPoint = (task: RatesTask, value: number): V3 =>
  task === 'MG' ? [STATION[0] + plungerX(value), STATION[1] + SYR.y + SYR.r * 0.6, STATION[2] + SYR.z + SYR.r] : [STATION[0] + THERMO.x, STATION[1] + THERMO.y0 + value * THERMO.perC, STATION[2] + THERMO.z + 0.004];

export const ratesRoom = (task: RatesTask): RoomConfig => ({
  whiteboard:
    task === 'MG'
      ? ['Chemistry — SS3 Practical', 'Rate of reaction: Mg + HCl', 'Read the gas syringe every 30 s', 'Plot V against t: tangent at t = 0']
      : ['Chemistry — SS3 Practical', 'Rate: the disappearing cross', 'Total volume 50 cm³ every time', 'Plot 1/t against volume'],
  whiteboardNote: task === 'MG' ? 'No flames — hydrogen!' : 'Ventilate: SO₂!',
  frontPoster: {
    title: task === 'MG' ? 'Rates of reaction' : 'Collision theory',
    band: '#7a1f6b',
    lines: task === 'MG' ? ['Rate = gradient of V–t', 'Tangent at t = 0: initial rate', 'Mg + 2HCl → MgCl₂ + H₂', '1 mol gas = 24 000 cm³'] : ['Rate ∝ 1/t', 'More concentrated: more collisions', 'Hotter: more particles ≥ Eₐ', '+10 °C ≈ twice as fast'],
  },
  shelfBottles: CHEM_SHELF,
  fumeBottle: { name: 'Conc. HCl', band: '#c62828', sub: 'fuming — use here', amber: true },
});
