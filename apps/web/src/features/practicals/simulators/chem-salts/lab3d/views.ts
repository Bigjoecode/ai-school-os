import type { SaltsTask } from '@aischool/shared';
import type { CameraPresets } from '../../../lab3d-kit/controls';
import { STATION } from '../../../lab3d-kit/layout';
import { CHEM_SHELF, type RoomConfig } from '../../../lab3d-kit/room';

/**
 * Where things are on the student's bench (station-local metres: x along the
 * bench, y up from the bench top, z towards the student; the front edge is at
 * z = 0.45). The tripod and burner stand in the middle; what is heated moves
 * onto its gauze. Chromatography uses a tall glass tank in the middle instead.
 */
export type V3 = [number, number, number];
export const GAUZE_Y = 0.16;
export const SPOT = {
  tripod: [0.02, 0, -0.06] as V3,
  beaker: [-0.3, 0, 0.1] as V3,
  dish: [0.3, 0, 0.14] as V3,
  oil: [0.32, 0, 0.12] as V3,
  bottle1: [-0.56, 0, -0.27] as V3,
  bottle2: [-0.42, 0, -0.27] as V3,
  jar: [-0.28, 0, -0.27] as V3,
  cylinder: [-0.66, 0, 0.1] as V3,
  spatula: [-0.46, 0, 0.28] as V3,
  rod: [-0.18, 0, 0.32] as V3,
  funnel: [0.36, 0, -0.16] as V3,
  filterPaper: [0.12, 0, 0.32] as V3,
  balance: [0.62, 0, -0.2] as V3,
  washBottle: [0.86, 0, -0.08] as V3,
  oven: [-0.86, 0, 0.16] as V3,
  iceBath: [0.58, 0, 0.22] as V3,
  capillary: [-0.02, 0, 0.3] as V3,
  hotWater: [-0.14, 0, -0.27] as V3,
  tank: [0.08, 0, -0.02] as V3,
  paper: [-0.32, 0, 0.16] as V3,
  vials: [-0.62, 0, -0.24] as V3,
  solvents: [0.42, 0, -0.27] as V3,
  pens: [-0.4, 0, 0.33] as V3,
  ruler: [-0.12, 0, 0.36] as V3,
  card: [-0.95, 0, -0.22] as V3,
  book: [0.9, 0, 0.28] as V3,
  extras: [-1.08, 0, 0.32] as V3,
};
/** The paper strip (6 × 15 cm) and the tank. */
export const PAPER = { w: 0.06, h: 0.15 };
export const TANK = { r: 0.055, h: 0.2 };

export const SALTS_VIEWS: CameraPresets = {
  bench: { target: [0.0, 0.12, 0.02], dist: 1.55, pitch: 0.62 },
  heat: { target: [SPOT.tripod[0], 0.2, SPOT.tripod[2]], dist: 0.6, pitch: 0.35 },
  beaker: { target: [SPOT.beaker[0], 0.06, SPOT.beaker[2]], dist: 0.45, pitch: 0.45 },
  dish: { target: [SPOT.dish[0], 0.03, SPOT.dish[2]], dist: 0.4, pitch: 0.7 },
  funnel: { target: [SPOT.funnel[0], 0.12, SPOT.funnel[2]], dist: 0.5, pitch: 0.35 },
  balance: { target: [SPOT.balance[0], 0.05, SPOT.balance[2]], dist: 0.4, pitch: 0.45 },
  tank: { target: [SPOT.tank[0], 0.12, SPOT.tank[2]], dist: 0.5, pitch: 0.2 },
  paper: { target: [SPOT.paper[0], 0.01, SPOT.paper[2]], dist: 0.38, pitch: 1.2 },
  oil: { target: [SPOT.tripod[0], 0.24, SPOT.tripod[2]], dist: 0.45, pitch: 0.15 },
};
export const viewButtons = (task: SaltsTask) =>
  task === 'CHROM'
    ? [
        { id: 'bench', label: 'Whole bench' },
        { id: 'paper', label: 'Paper' },
        { id: 'tank', label: 'Tank' },
      ]
    : task === 'PPT'
      ? [
          { id: 'bench', label: 'Whole bench' },
          { id: 'beaker', label: 'Beaker' },
          { id: 'funnel', label: 'Funnel' },
          { id: 'balance', label: 'Balance' },
        ]
      : [
          { id: 'bench', label: 'Whole bench' },
          { id: 'heat', label: task === 'MP' ? 'Burner' : 'Gauze' },
          ...(task === 'SOL' ? [{ id: 'dish', label: 'Dish' }] : [{ id: 'oil', label: 'Oil bath' }]),
          { id: 'balance', label: 'Balance' },
        ];

/** The world point the eye-level view reads: the balance display, the paper, the thermometer. */
export function readPoint(task: SaltsTask): V3 {
  const at = (p: V3, dy: number, dz = 0): V3 => [STATION[0] + p[0], STATION[1] + dy, STATION[2] + p[2] + dz];
  if (task === 'CHROM') return at(SPOT.paper, 0.01);
  if (task === 'MP') return at(SPOT.tripod, GAUZE_Y + 0.12, 0.03);
  return at(SPOT.balance, 0.03, 0.1);
}

export function saltsRoom(task: SaltsTask): RoomConfig {
  const board: Record<SaltsTask, string[]> = {
    SOL: ['Chemistry — SS3 Practical', 'Soluble salt: CuO + H₂SO₄', 'Excess base → filter → evaporate', 'Crystals on a cold rod: STOP heating'],
    PPT: ['Chemistry — SS3 Practical', 'Insoluble salt: precipitation', 'Mix → filter → wash → dry', 'Dry to constant mass'],
    CHROM: ['Chemistry — SS3 Practical', 'Paper chromatography', 'Pencil baseline; solvent BELOW it', 'Rf = spot ÷ solvent (from baseline)'],
    MP: ['Chemistry — SS3 Practical', 'Recrystallisation, melting point', 'Minimum hot solvent; cool slowly', 'Near the m.p.: 1–2 °C per minute'],
  };
  return {
    whiteboard: board[task],
    whiteboardNote: task === 'SOL' ? 'Never to dryness!' : task === 'PPT' ? 'Wash your hands!' : task === 'CHROM' ? 'Ethanol: no flames!' : 'Hot oil burns!',
    frontPoster: {
      title: task === 'CHROM' ? 'Chromatography' : task === 'MP' ? 'Purity' : 'Making salts',
      band: '#1f6b7a',
      lines:
        task === 'CHROM'
          ? ['Rf = distance of spot ÷ distance of solvent', 'Rf < 1, no unit', 'Same Rf + colour = same dye']
          : task === 'MP'
            ? ['Pure: sharp m.p.', 'Impure: lower, wider range', 'Benzoic acid m.p. 122 °C']
            : ['Insoluble base + acid → filter → crystallise', 'Na, K, NH₄ salts: titration', 'Insoluble salts: precipitation'],
    },
    shelfBottles: CHEM_SHELF,
    fumeBottle: { name: 'Conc. H₂SO₄', band: '#c62828', sub: 'use here', amber: true },
  };
}
