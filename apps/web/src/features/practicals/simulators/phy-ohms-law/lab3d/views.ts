import { emptyPhyOhmsState, ohmsWireKey, type OhmsTask, type PhyOhmsState } from '@aischool/shared';
import type { CameraPresets } from '../../../lab3d-kit/controls';
import type { LearnConfig } from '../../../lab3d-kit/learn';
import type { Spot } from '../../../lab3d-kit/store';
import { physicsRoom } from '../../phy-common/lab3d/room';
import { explainer } from './explain-content';
import { BOARD, FACE, GOOD_WIRES, PART, WIRE_RULE } from './layout';
import { needed } from './scene-state';

/** Camera presets, the room, the Learn stage's bench and spots. */

const meterSpot = (p: readonly [number, number, number]): Spot => ({ target: [p[0], p[1] + FACE.cy, p[2] + 0.06], dist: 0.32, pitch: 0.06 });
export const OHMS_VIEWS: CameraPresets = {
  board: { target: [BOARD.x, 0.05, BOARD.z + 0.05], dist: 0.85, pitch: 0.8 },
  ammeter: meterSpot(PART.ammeter),
  voltmeter: meterSpot(PART.voltmeter),
  wire: { target: [WIRE_RULE.x0 + 0.5, 0.02, WIRE_RULE.z], dist: 0.8, pitch: 0.65 },
};
export const viewButtons = (task: OhmsTask) => [
  { id: 'bench', label: 'Whole bench' },
  { id: 'board', label: 'Board' },
  { id: 'ammeter', label: 'Ammeter' },
  { id: 'voltmeter', label: 'Voltmeter' },
  ...(task === 'WIRE' ? [{ id: 'wire', label: 'Wire' }] : []),
];

export const OHMS_ROOM = (task: OhmsTask) =>
  physicsRoom(
    'ohm',
    task === 'WIRE' ? ['Physics — SS3 Practical', 'Resistivity of a wire', 'R = V/I for L = 20 … 100 cm', 'ρ = slope × A,  A = πd²/4'] : ['Physics — SS3 Practical', "Verifying Ohm's law", 'Ammeter in series, voltmeter across R', 'Plot V against I: slope = R'],
    'Open the key between readings!',
    { title: 'Reading a meter', band: '#b23c17', lines: ['Look straight at the pointer.', 'Read to half a division.', 'I and V to 2 decimal places.', 'Check the zero first.'] },
  );

/** The bench as Mr Bayo sets it out for the introduction (display only). */
export function learnState(task: OhmsTask): PhyOhmsState {
  return {
    ...emptyPhyOhmsState(),
    task,
    rheostat: 0.5,
    wires: GOOD_WIRES[task].map(([a, b]) => ohmsWireKey(a, b)),
    log: needed(task).map((a) => ({ t: 0, a: `collect:${a.id}` })),
  };
}

const S: Record<string, Spot> = {
  cells: { target: [PART.cells[0], 0.04, PART.cells[2]], dist: 0.42, pitch: 0.5 },
  key: { target: [PART.key[0], 0.04, PART.key[2]], dist: 0.38, pitch: 0.55 },
  rheostat: { target: [PART.rheostat[0], 0.08, PART.rheostat[2]], dist: 0.45, pitch: 0.45 },
  ammeter: meterSpot(PART.ammeter),
  voltmeter: meterSpot(PART.voltmeter),
  resistor: { target: [PART.resistor[0], 0.04, PART.resistor[2]], dist: 0.36, pitch: 0.5 },
  wireRule: { target: [WIRE_RULE.x0 + 0.5, 0.02, WIRE_RULE.z], dist: 0.85, pitch: 0.6 },
  wires: { target: [BOARD.x, 0.05, BOARD.z], dist: 0.8, pitch: 0.85 },
  micrometer: { target: [-0.85, 0.03, 0.18], dist: 0.35, pitch: 0.6 },
  board: { target: [BOARD.x, 0.05, BOARD.z + 0.05], dist: 0.85, pitch: 0.8 },
};
const MATCH: [RegExp, string][] = [
  [/cell|supply|battery/i, 'cells'],
  [/standard resistor|resistor/i, 'resistor'],
  [/ammeter/i, 'ammeter'],
  [/voltmeter/i, 'voltmeter'],
  [/rheostat/i, 'rheostat'],
  [/key|switch/i, 'key'],
  [/constantan|wire on a metre|eureka/i, 'wireRule'],
  [/jockey|crocodile/i, 'wireRule'],
  [/micrometer/i, 'micrometer'],
  [/connecting wire/i, 'wires'],
];
export const LEARN_CONFIG: LearnConfig = {
  items: MATCH.map(([match, id]) => ({ match, id, spot: S[id]! })),
  explain: explainer,
  procedure: [
    { spot: S.board!, point: 'board' },
    { spot: S.ammeter!, point: 'ammeter' },
  ],
  observe: { spot: S.voltmeter!, point: 'voltmeter' },
  observeTitle: 'What the meters show',
};
