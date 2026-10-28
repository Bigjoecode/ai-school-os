import { MOMENTS_EDGE_H, MOMENTS_RULE_T, type MomentsTask } from '@aischool/shared';
import type { CameraPresets } from '../../../lab3d-kit/controls';
import { STATION } from '../../../lab3d-kit/layout';
import { physicsRoom } from '../../phy-common/lab3d/room';

/**
 * Where things are on the student's bench (station-local metres): the knife
 * edge stands at EDGE_X with its edge EDGE_TOP above the bench; the rule lies
 * across it along x, its scale on the top face with the marks along the edge
 * nearest the student. The rule slides over the edge: the mark resting on the
 * edge is the pivot.
 */

type V3 = [number, number, number];
export const EDGE_X = 0;
export const RULE_Z = 0.04;
export const RULE_W = 0.028;
export const RULE_T = MOMENTS_RULE_T / 100;
export const EDGE_TOP = MOMENTS_EDGE_H / 100;
/** Station-local x of a mark on the rule when the pivot mark is over the edge. */
export const markX = (cm: number, pivot: number) => EDGE_X + (cm - pivot) / 100;

export const SPOT = {
  card: [-0.95, 0, -0.22] as V3,
  book: [0.88, 0, 0.27] as V3,
  /** Where collected apparatus waits before it is set out. */
  waiting: [-0.62, 0, -0.26] as V3,
  extras: [0.75, 0, -0.24] as V3,
};

export const MOMENTS_VIEWS: CameraPresets = {
  bench: { target: [0, 0.12, 0.02], dist: 1.45, pitch: 0.34 },
  balance: { target: [0, 0.08, RULE_Z], dist: 1.05, pitch: 0.08 },
};
export const MOMENTS_VIEW_BUTTONS = [
  { id: 'bench', label: 'Whole bench' },
  { id: 'balance', label: 'The balance' },
];

/** The world point the eye-level view reads: a mark on the rule's front edge (rule level). */
export const readPoint = (cm: number, pivot: number): [number, number, number] => [STATION[0] + markX(cm, pivot), STATION[1] + EDGE_TOP + RULE_T, STATION[2] + RULE_Z + RULE_W / 2 - 0.004];

/** The physics room as the knife edge has it. */
export const momentsRoom = (task: MomentsTask) =>
  physicsRoom(
    'pendulum',
    task === 'MASS'
      ? ['Physics — SS3 Practical', 'Centre of gravity and mass of a metre rule', '100 g at x = 5, 10, 15, 20, 25 cm', 'Plot d₁ against d₂: M = 100 g × slope']
      : ['Physics — SS3 Practical', 'Principle of moments', '50 g at 26, 30, 34, 38, 42 cm', 'Plot d₁ against d₂: M = 50 g × slope'],
    'Balance it level!',
    {
      title: 'Principle of moments',
      band: '#5d4037',
      lines: ['Sum of clockwise moments = sum of anticlockwise moments.', 'Moment = force × perpendicular distance from the pivot.', 'The weight of the rule acts at G.'],
    },
  );
