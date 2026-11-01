import type { EnergeticsTask } from '@aischool/shared';
import type { CameraPresets } from '../../../lab3d-kit/controls';
import { STATION } from '../../../lab3d-kit/layout';
import { CHEM_SHELF, type RoomConfig } from '../../../lab3d-kit/room';

/**
 * Where things are on the student's bench (station-local metres: x along the
 * bench, y up from the bench top, z towards the student; the front edge is at
 * z = 0.45). Cup tasks: the polystyrene cup in its support beaker in front,
 * the measuring cylinders either side, the reagents behind, the balance to
 * the left, the stopwatch at the front. Solubility: the boiling tube in a
 * rack in front, the water bath to the right, the burette on its stand
 * behind, the balance and the KNO₃ to the left.
 */
export type V3 = [number, number, number];

export const CUP: V3 = [0, 0, 0.1];
/** The cup: bottom radius, top radius, height (m); its base stands this high inside the support beaker. */
export const CUP_DIM = { r0: 0.03, r1: 0.042, h: 0.1, lift: 0.004 };
export const TUBE_RACK: V3 = [0, 0, 0.12];
export const BATH: V3 = [0.36, 0, -0.02];
export const BURETTE: V3 = [-0.28, 0, -0.16];
export const SPOT = {
  cylA: [-0.26, 0, 0.14] as V3,
  cylB: [0.26, 0, 0.14] as V3,
  acid: [-0.34, 0, -0.26] as V3,
  alkali: [-0.2, 0, -0.26] as V3,
  water: [-0.52, 0, -0.2] as V3,
  salt: [-0.34, 0, -0.26] as V3,
  naoh: [-0.2, 0, -0.26] as V3,
  kno3: [-0.46, 0, 0.0] as V3,
  balance: [-0.62, 0, -0.06] as V3,
  spatula: [-0.46, 0, 0.18] as V3,
  stopwatch: [0.16, 0, 0.33] as V3,
  thermoRest: [0.08, 0, 0.3] as V3,
  burner: [0.66, 0, 0.12] as V3,
  card: [-0.9, 0, -0.22] as V3,
  book: [0.86, 0, 0.27] as V3,
  extras: [-1.05, 0, 0.2] as V3,
};
/** The thermometer: 0 °C mark's height above its bulb and metres per °C (−10 … 110 °C on a 0.26 m stem). */
export const THERMO = { y0: 0.03, perC: 0.0018, len: 0.26 };
/** Where the thermometer's bulb stands: in the cup, in cylinder B, in the tube. */
export const BULB = {
  cup: [CUP[0] + 0.012, CUP_DIM.lift + 0.006, CUP[2] + 0.006] as V3,
  cylA: [SPOT.cylA[0], 0.015, SPOT.cylA[2]] as V3,
  cylB: [SPOT.cylB[0], 0.015, SPOT.cylB[2]] as V3,
  tubeRack: [TUBE_RACK[0], 0.02, TUBE_RACK[2]] as V3,
  tubeBath: [BATH[0], 0.05, BATH[2]] as V3,
};

export const EN_VIEWS: CameraPresets = {
  bench: { target: [0.0, 0.12, 0.02], dist: 1.45, pitch: 0.6 },
  cup: { target: [CUP[0], 0.08, CUP[2]], dist: 0.5, pitch: 0.35 },
  thermo: { target: [CUP[0], 0.17, CUP[2]], dist: 0.38, pitch: 0.12 },
  tube: { target: [TUBE_RACK[0], 0.12, TUBE_RACK[2]], dist: 0.42, pitch: 0.2 },
  bath: { target: [BATH[0], 0.1, BATH[2]], dist: 0.55, pitch: 0.4 },
  burette: { target: [BURETTE[0], 0.35, BURETTE[2]], dist: 0.8, pitch: 0.15 },
};
export const VIEW_BUTTONS = (task: EnergeticsTask) =>
  task === 'SOLY'
    ? [
        { id: 'bench', label: 'Whole bench' },
        { id: 'tube', label: 'Tube' },
        { id: 'bath', label: 'Water bath' },
        { id: 'burette', label: 'Burette' },
      ]
    : [
        { id: 'bench', label: 'Whole bench' },
        { id: 'cup', label: 'Cup' },
        { id: 'thermo', label: 'Thermometer' },
      ];

/** The world point the eye-level view reads: the top of the thermometer's column where it stands now. */
export const readPoint = (bulb: V3, temp: number): V3 => [STATION[0] + bulb[0], STATION[1] + bulb[1] + THERMO.y0 + Math.max(-10, temp) * THERMO.perC, STATION[2] + bulb[2] + 0.004];

export const enRoom = (task: EnergeticsTask): RoomConfig => ({
  whiteboard:
    task === 'NEUT'
      ? ['Chemistry — SS3 Practical', 'Heat of neutralisation', 'Q = mcΔT  (m = 100 g, c = 4.2)', 'ΔH = −Q ÷ n(H₂O)']
      : task === 'SOLN'
        ? ['Chemistry — SS3 Practical', 'Heat of solution: NH₄NO₃', 'Q = mcΔT  (m = 50.0 g of water)', 'Temperature falls → ΔH positive']
        : ['Chemistry — SS3 Practical', 'Solubility curve of KNO₃', 'Solubility = mass × 100 ÷ water', 'Note the FIRST crystals'],
  whiteboardNote: task === 'SOLY' ? 'Hot tubes: use the holder!' : 'Goggles on: NaOH is corrosive',
  frontPoster: {
    title: task === 'SOLY' ? 'Solubility' : 'Energy changes',
    band: '#7a1f6b',
    lines: task === 'SOLY' ? ['g of solute per 100 g of water', 'Saturated: no more dissolves', 'KNO₃: 32 g at 20 °C, 110 g at 60 °C', 'Cooling → crystals'] : ['Exothermic: ΔH negative', 'Endothermic: ΔH positive', 'H⁺ + OH⁻ → H₂O: −57 kJ mol⁻¹', 'Polystyrene + lid: less heat loss'],
  },
  shelfBottles: CHEM_SHELF,
  fumeBottle: null,
});
