import type { AcidsTask } from '@aischool/shared';
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
  // PH
  rack9: [0.0, 0, 0.06] as V3,
  samples: [-0.6, 0, -0.28] as V3,
  uiBottle: [0.42, 0, 0.26] as V3,
  chart: [0.5, 0, 0.0] as V3,
  tileFlat: [-0.42, 0, 0.28] as V3,
  // IND
  mortar: [-0.5, 0, 0.26] as V3,
  bath: [-0.72, 0, -0.06] as V3,
  extract: [-0.36, 0, -0.04] as V3,
  rack10: [-0.05, 0, 0.18] as V3,
  sols: [-0.4, 0, -0.3] as V3,
  standBase: [0.45, 0, -0.2] as V3,
  buretteAxis: [0.45, 0, -0.16] as V3,
  jetHeight: 0.15,
  pipette: [0.25, 0, 0.34] as V3,
  indicators: [0.12, 0, -0.06] as V3,
  titrants: [0.72, 0, -0.3] as V3,
  flaskHome: [0.7, 0, 0.12] as V3,
  // ACID
  rack5: [-0.25, 0, 0.12] as V3,
  burner: [-0.6, 0, 0.05] as V3,
  splints: [-0.62, 0, 0.3] as V3,
  limewater: [0.0, 0, 0.25] as V3,
  reagents: [-0.55, 0, -0.28] as V3,
  balance: [0.55, 0, -0.12] as V3,
  cylinder: [0.3, 0, 0.3] as V3,
  cotton: [0.75, 0, 0.26] as V3,
  acidFlask: [0.25, 0, 0.0] as V3,
  // HARD
  samples5: [-0.62, 0, -0.28] as V3,
  boil: [-0.62, 0, 0.06] as V3,
  funnelH: [-0.32, 0, -0.02] as V3,
  // shared
  washBottle: [0.8, 0, -0.05] as V3,
  card: [-1.05, 0, 0.0] as V3,
  book: [0.98, 0, 0.32] as V3,
  extras: [-1.12, 0, 0.32] as V3,
};

export const ACIDS_VIEWS: CameraPresets = {
  bench: { target: [0.0, 0.12, 0.02], dist: 1.55, pitch: 0.62 },
  rack: { target: [SPOT.rack9[0], 0.07, SPOT.rack9[2]], dist: 0.5, pitch: 0.3 },
  chart: { target: [SPOT.chart[0] - 0.12, 0.07, SPOT.chart[2] + 0.05], dist: 0.45, pitch: 0.2 },
  samples: { target: [SPOT.samples[0] + 0.55, 0.06, SPOT.samples[2]], dist: 0.75, pitch: 0.35 },
  extract: { target: [-0.5, 0.08, 0.08], dist: 0.6, pitch: 0.4 },
  tubes: { target: [SPOT.rack10[0], 0.07, SPOT.rack10[2]], dist: 0.5, pitch: 0.3 },
  titration: { target: [SPOT.buretteAxis[0], 0.3, SPOT.buretteAxis[2] + 0.05], dist: 0.95, pitch: 0.15 },
  flask: { target: [SPOT.buretteAxis[0], 0.1, SPOT.buretteAxis[2]], dist: 0.42, pitch: 0.25 },
  acidTubes: { target: [SPOT.rack5[0], 0.08, SPOT.rack5[2]], dist: 0.5, pitch: 0.3 },
  balance: { target: [SPOT.balance[0], 0.08, SPOT.balance[2]], dist: 0.45, pitch: 0.4 },
  boil: { target: [SPOT.boil[0], 0.15, SPOT.boil[2]], dist: 0.6, pitch: 0.3 },
};
export const viewButtons = (task: AcidsTask) =>
  task === 'PH'
    ? [
        { id: 'bench', label: 'Whole bench' },
        { id: 'rack', label: 'Tubes' },
        { id: 'chart', label: 'Colour chart' },
      ]
    : task === 'IND'
      ? [
          { id: 'bench', label: 'Whole bench' },
          { id: 'extract', label: 'Extract' },
          { id: 'tubes', label: 'Tubes' },
          { id: 'titration', label: 'Burette' },
        ]
      : task === 'ACID'
        ? [
            { id: 'bench', label: 'Whole bench' },
            { id: 'acidTubes', label: 'Tubes' },
            { id: 'balance', label: 'Balance' },
          ]
        : [
            { id: 'bench', label: 'Whole bench' },
            { id: 'titration', label: 'Burette' },
            { id: 'flask', label: 'Flask' },
            { id: 'boil', label: 'Boiling' },
          ];

/** The world point the eye-level view reads: the tubes against the chart, the burette's meniscus, the balance. */
export function readPoint(task: AcidsTask, level = 10): V3 {
  const at = (p: V3, dy: number, dz = 0): V3 => [STATION[0] + p[0], STATION[1] + dy, STATION[2] + p[2] + dz];
  if (task === 'PH') return at(SPOT.rack9, 0.08, 0.02);
  if (task === 'ACID') return at(SPOT.balance, 0.04, 0.1);
  // the burette's meniscus (1 cm³ = 1 cm of tube; 0 at 0.61 m above the jet)
  return at(SPOT.buretteAxis, SPOT.jetHeight + 0.61 - (level / 50) * 0.5, 0.01);
}

export function acidsRoom(task: AcidsTask): RoomConfig {
  const board: Record<AcidsTask, string[]> = {
    PH: ['Chemistry — SS2 Practical', 'pH with universal indicator', 'pH = −log[H⁺]; pH + pOH = 14', '0–3 strong acid · 7 neutral · 11–14 strong alkali'],
    IND: ['Chemistry — SS2 Practical', 'An indicator from zobo', 'Red in acid · green in alkali', '% difference = diff ÷ MO titre × 100'],
    ACID: ['Chemistry — SS2 Practical', 'Reactions of dilute acids', 'acid + metal → salt + H₂', 'acid + carbonate → salt + H₂O + CO₂'],
    HARD: ['Chemistry — SS2 Practical', 'Hardness of water (soap)', 'temporary = before − after boiling', 'permanent = after − blank'],
  };
  return {
    whiteboard: board[task],
    whiteboardNote: task === 'PH' ? 'Never taste a sample!' : task === 'IND' ? 'No flames near ethanol!' : task === 'ACID' ? 'Test small volumes of H₂!' : 'Shake the same way!',
    frontPoster: {
      title: task === 'HARD' ? 'Hard water' : 'Acids & bases',
      band: '#1f6f5c',
      lines: task === 'HARD' ? ['Temporary: Ca(HCO₃)₂', 'Ca(HCO₃)₂ → CaCO₃ + H₂O + CO₂', 'Permanent: CaSO₄, MgSO₄', 'Remove: washing soda, distillation'] : ['pH 0–6 acid · 7 neutral · 8–14 alkali', 'Strong acids ionise fully', 'Indicators: weak acids', 'K Na Ca Mg Al Zn Fe Pb (H) Cu'],
    },
    shelfBottles: CHEM_SHELF,
    fumeBottle: task === 'IND' ? { name: 'Ethanol', band: '#e65100', sub: 'flammable', amber: false } : null,
  };
}
