import { emptyPhyPendulumState, type PhyPendulumState } from '@aischool/shared';
import type { CameraPresets } from '../../../lab3d-kit/controls';
import type { LearnConfig } from '../../../lab3d-kit/learn';
import type { Spot } from '../../../lab3d-kit/store';
import { physicsRoom } from '../../phy-common/lab3d/room';
import { explainer } from './content';
import { CARD, PIVOT, SPOT, STAND } from './layout';
import { NEEDED } from './scene-state';

/** Camera presets, the room, the Learn stage's bench and spots. */

export const PENDULUM_VIEWS: CameraPresets = {
  /** The whole bench, the pendulum over its front edge included. */
  bench: { target: [0.3, 0.3, 0.3], dist: 2.1, pitch: 0.32 },
  pendulum: { target: [PIVOT[0] - 0.03, 0.55, PIVOT[2]], dist: 1.1, pitch: 0.08 },
  cork: { target: [PIVOT[0], PIVOT[1] - 0.04, PIVOT[2]], dist: 0.34, pitch: 0.06 },
  bob: { target: [PIVOT[0], 0.05, PIVOT[2]], dist: 0.7, pitch: 0.12 },
  stopwatch: { target: [SPOT.stopwatch[0], 0.02, SPOT.stopwatch[2]], dist: 0.28, pitch: 0.95 },
};
export const VIEW_BUTTONS = [
  { id: 'bench', label: 'Whole bench' },
  { id: 'pendulum', label: 'Pendulum' },
  { id: 'cork', label: 'Cork' },
  { id: 'bob', label: 'Bob' },
  { id: 'stopwatch', label: 'Stopwatch' },
];

export const pendulumRoom = (draught: boolean) => ({
  ...physicsRoom('pendulum', ['Physics — SS3 Practical', 'Simple pendulum: g from T² against l', 'l = thread + radius of the bob', 'Time 20 oscillations, small angle'], 'Close the windows!', {
    title: 'Timing tips',
    band: '#0b6e4f',
    lines: ['Start at the fiducial mark.', 'Count "0" as you start.', 'Stop after 20 complete oscillations.', 'T = t ÷ 20, then T².'],
  }),
  // the ceiling fans are part of the draught: they stop when the student shuts the window
  fans: draught,
});

/** The bench as Mr Bayo sets it out for the introduction (display only). */
export const LEARN_STATE: PhyPendulumState = { ...emptyPhyPendulumState(), shielded: true, amplitude: 8, log: NEEDED.map((a) => ({ t: 0, a: `collect:${a.id}` })) };

const S: Record<string, Spot> = {
  stand: { target: [STAND.base[0], 0.45, STAND.base[2]], dist: 1.25, pitch: 0.15 },
  cork: { target: [PIVOT[0], PIVOT[1] - 0.03, PIVOT[2]], dist: 0.38, pitch: 0.08 },
  rule: { target: [PIVOT[0], 0.55, PIVOT[2]], dist: 0.85, pitch: 0.1 },
  stopwatch: { target: [SPOT.stopwatch[0], 0.02, SPOT.stopwatch[2]], dist: 0.3, pitch: 0.9 },
  bob: { target: [PIVOT[0], 0.12, PIVOT[2]], dist: 0.6, pitch: 0.1 },
  fiducial: { target: [CARD.x, 0.15, CARD.z], dist: 0.7, pitch: 0.1 },
  pendulum: { target: [PIVOT[0] - 0.03, 0.55, PIVOT[2]], dist: 1.1, pitch: 0.08 },
};
const MATCH: [RegExp, string][] = [
  [/split cork|wooden blocks/i, 'cork'],
  [/retort|clamp|stand/i, 'stand'],
  [/metre rule/i, 'rule'],
  [/stopwatch/i, 'stopwatch'],
  [/bob/i, 'bob'],
  [/fiducial|plasticine|masking/i, 'fiducial'],
];
export const LEARN_CONFIG: LearnConfig = {
  items: MATCH.map(([match, id]) => ({ match, id, spot: S[id]! })),
  explain: explainer,
  procedure: [
    { spot: S.rule!, point: 'rule' },
    { spot: S.pendulum!, point: 'bob' },
  ],
  observe: { spot: S.pendulum!, point: 'bob' },
  observeTitle: 'What you should find',
};
