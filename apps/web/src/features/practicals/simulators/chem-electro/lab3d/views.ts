import type { ElectroTask } from '@aischool/shared';
import type { CameraPresets } from '../../../lab3d-kit/controls';
import { STATION } from '../../../lab3d-kit/layout';
import { CHEM_SHELF, type RoomConfig } from '../../../lab3d-kit/room';

/**
 * Where things are on the student's bench (station-local metres: x along the
 * bench, y up from the bench top, z towards the student; the front edge is at
 * z = 0.45). Each task lays out its own apparatus around the middle.
 */
export type V3 = [number, number, number];
export const SPOT = {
  // ELEC
  voltameter: [0.0, 0, 0.04] as V3,
  supply: [-0.48, 0, -0.18] as V3,
  ammeter: [0.36, 0, -0.2] as V3,
  rheostat: [0.42, 0, 0.18] as V3,
  key: [-0.36, 0, 0.2] as V3,
  stopwatch: [0.12, 0, 0.32] as V3,
  platesOff: [-0.12, 0, 0.32] as V3,
  // CELL
  znBeaker: [-0.17, 0, 0.06] as V3,
  cuBeaker: [0.17, 0, 0.06] as V3,
  voltmeter: [0.0, 0, -0.2] as V3,
  mcVoltmeter: [0.42, 0, -0.2] as V3,
  kno3: [-0.46, 0, 0.22] as V3,
  strips: [0.36, 0, 0.3] as V3,
  // DISP
  beaker: [-0.08, 0, 0.06] as V3,
  cylinder: [-0.62, 0, 0.1] as V3,
  funnel: [0.3, 0, 0.04] as V3,
  filterPaper: [0.24, 0, 0.32] as V3,
  rod: [-0.3, 0, 0.32] as V3,
  thermometer: [0.04, 0, 0.34] as V3,
  // RUST
  rack: [-0.12, 0, 0.02] as V3,
  trough: [0.42, 0, 0.0] as V3,
  burner: [-0.62, 0, 0.08] as V3,
  // shared
  balance: [0.72, 0, -0.18] as V3,
  washBottle: [0.95, 0, 0.12] as V3,
  sandpaper: [-0.62, 0, 0.3] as V3,
  bottle1: [-0.9, 0, -0.27] as V3,
  bottle2: [-0.77, 0, -0.27] as V3,
  bottle3: [-0.64, 0, -0.27] as V3,
  bottle4: [-0.51, 0, -0.27] as V3,
  card: [-1.05, 0, 0.0] as V3,
  book: [0.98, 0, 0.32] as V3,
  extras: [-1.12, 0, 0.32] as V3,
};

export const ELECTRO_VIEWS: CameraPresets = {
  bench: { target: [0.0, 0.12, 0.02], dist: 1.55, pitch: 0.62 },
  cell: { target: [SPOT.voltameter[0], 0.1, SPOT.voltameter[2]], dist: 0.55, pitch: 0.35 },
  meters: { target: [0.36, 0.08, -0.05], dist: 0.6, pitch: 0.4 },
  balance: { target: [SPOT.balance[0], 0.05, SPOT.balance[2]], dist: 0.4, pitch: 0.45 },
  daniell: { target: [0, 0.1, 0.0], dist: 0.6, pitch: 0.35 },
  volts: { target: [SPOT.voltmeter[0], 0.06, SPOT.voltmeter[2]], dist: 0.38, pitch: 0.3 },
  beaker: { target: [SPOT.beaker[0], 0.07, SPOT.beaker[2]], dist: 0.45, pitch: 0.4 },
  funnel: { target: [SPOT.funnel[0], 0.12, SPOT.funnel[2]], dist: 0.5, pitch: 0.35 },
  rack: { target: [SPOT.rack[0], 0.1, SPOT.rack[2]], dist: 0.5, pitch: 0.25 },
  trough: { target: [SPOT.trough[0], 0.18, SPOT.trough[2]], dist: 0.55, pitch: 0.2 },
};
export const viewButtons = (task: ElectroTask) =>
  task === 'ELEC'
    ? [
        { id: 'bench', label: 'Whole bench' },
        { id: 'cell', label: 'Voltameter' },
        { id: 'meters', label: 'Ammeter' },
        { id: 'balance', label: 'Balance' },
      ]
    : task === 'CELL'
      ? [
          { id: 'bench', label: 'Whole bench' },
          { id: 'daniell', label: 'Cell' },
          { id: 'volts', label: 'Voltmeter' },
        ]
      : task === 'DISP'
        ? [
            { id: 'bench', label: 'Whole bench' },
            { id: 'beaker', label: 'Beaker' },
            { id: 'funnel', label: 'Funnel' },
            { id: 'balance', label: 'Balance' },
          ]
        : [
            { id: 'bench', label: 'Whole bench' },
            { id: 'rack', label: 'Tubes' },
            { id: 'trough', label: 'Graduated tube' },
          ];

/** The world point the eye-level view reads: the ammeter, the voltmeter, the thermometer, the graduated tube. */
export function readPoint(task: ElectroTask): V3 {
  const at = (p: V3, dy: number, dz = 0): V3 => [STATION[0] + p[0], STATION[1] + dy, STATION[2] + p[2] + dz];
  if (task === 'ELEC') return at(SPOT.ammeter, 0.07, 0.05);
  if (task === 'CELL') return at(SPOT.voltmeter, 0.05, 0.05);
  if (task === 'DISP') return at(SPOT.beaker, 0.14, 0.02);
  return at(SPOT.trough, 0.22, 0.02);
}

export function electroRoom(task: ElectroTask): RoomConfig {
  const board: Record<ElectroTask, string[]> = {
    ELEC: ['Chemistry — SS3 Practical', 'Electrolysis of CuSO₄(aq), Cu electrodes', 'Q = It (t in SECONDS)', 'm = QM ÷ nF; Cu²⁺ + 2e⁻ → Cu'],
    CELL: ['Chemistry — SS3 Practical', 'The Daniell cell', 'Zn | Zn²⁺ || Cu²⁺ | Cu', 'E°cell = E°(right) − E°(left)'],
    DISP: ['Chemistry — SS3 Practical', 'Displacement: Fe + CuSO₄', 'Fe + Cu²⁺ → Fe²⁺ + Cu', 'Moles Fe = moles Cu'],
    RUST: ['Chemistry — SS3 Practical', 'Conditions for rusting', 'Water AND oxygen needed', '% O₂ = used ÷ 50.0 × 100'],
  };
  return {
    whiteboard: board[task],
    whiteboardNote: task === 'ELEC' ? 'Keep the current constant!' : task === 'CELL' ? '+ to copper!' : task === 'DISP' ? 'Propanone: no flames!' : 'Level the water first!',
    frontPoster: {
      title: task === 'RUST' ? 'Corrosion' : 'Electrochemistry',
      band: '#5b3a8c',
      lines:
        task === 'RUST'
          ? ['Rust = Fe₂O₃·xH₂O', 'Needs water + oxygen', 'Salt speeds it up', 'Galvanise, paint, oil']
          : ['K Na Ca Mg Al Zn Fe Pb (H) Cu Ag Au', 'Higher displaces lower', 'F = 96 500 C mol⁻¹', 'Oxidation at the anode'],
    },
    shelfBottles: CHEM_SHELF,
    fumeBottle: { name: 'Propanone', band: '#e65100', sub: 'flammable', amber: false },
  };
}
