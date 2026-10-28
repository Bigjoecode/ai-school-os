import type { OpticsTask } from '@aischool/shared';
import type { CameraPresets } from '../../../lab3d-kit/controls';
import { STATION } from '../../../lab3d-kit/layout';
import type { Spot } from '../../../lab3d-kit/store';
import { physicsRoom } from '../../phy-common/lab3d/room';

/**
 * Where things are on the student's bench (station-local metres): the metre
 * rule lies along x with its 0 cm mark at RULE_X0 (the window side), the
 * holders stand on it and the optical axis runs AXIS_Y above the bench.
 */

type V3 = [number, number, number];
export const RULE_X0 = -0.5;
export const RULE_Z = 0.06;
/** The rule's width (m) and the height of its top face. */
export const RULE_W = 0.03;
export const RULE_TOP = 0.006;
export const AXIS_Y = 0.13;
/** MIRROR: the object stands just behind the axis and the screen just in front of it (side by side). */
export const OFF_AXIS = { object: -0.028, screen: 0.032 };
export const cmX = (cm: number) => RULE_X0 + cm / 100;
/** Where each holder stands (station-local z) for the task. */
export const holderZ = (task: OpticsTask, what: 'object' | 'optic' | 'screen') => RULE_Z + (task === 'MIRROR' && what !== 'optic' ? OFF_AXIS[what] : 0);

export const SPOT = {
  card: [-0.95, 0, -0.22] as V3,
  book: [0.88, 0, 0.27] as V3,
  /** Where collected apparatus waits before it is stood on the rule. */
  waiting: [-0.2, 0, -0.26] as V3,
  extras: [0.75, 0, -0.24] as V3,
};

/** The rough focus: where the hand-held screen is (cm along the rule's line; the mirror's is held off the 0 end, towards the window). */
export const roughScreenCm = (task: OpticsTask, u: number, roughS: number) => (task === 'MIRROR' ? -roughS : u + roughS);

/** The close look at the screen's face from the lens/mirror side (it faces back along the rule). */
export function screenSpot(task: OpticsTask, screenCm: number, facing: 1 | -1): Spot {
  const yaw = facing === -1 ? -1.0 : 1.0;
  const z = holderZ(task, 'screen');
  return { target: [cmX(screenCm), AXIS_Y, z], dist: 0.32, pitch: 0.12, yaw, limits: { yaw: [yaw - 0.35, yaw + 0.35], pitch: [0, 0.5] }, fov: 40 };
}

export const OPTICS_VIEWS: CameraPresets = {
  bench: { target: [0, 0.12, 0.02], dist: 1.45, pitch: 0.34 },
  rule: { target: [0, 0.09, RULE_Z], dist: 1.05, pitch: 0.16 },
};
export const OPTICS_VIEW_BUTTONS = [
  { id: 'bench', label: 'Whole bench' },
  { id: 'rule', label: 'Optical bench' },
];

/** The world point the eye-level view reads: a holder's index mark on the rule's scale. */
export const readPoint = (cm: number): [number, number, number] => [STATION[0] + cmX(cm), STATION[1] + RULE_TOP, STATION[2] + RULE_Z + RULE_W / 2 - 0.004];

/** The physics room as the optical bench has it. */
export const opticsRoom = (task: OpticsTask) =>
  physicsRoom(
    'light',
    task === 'MIRROR'
      ? ['Physics — SS3 Practical', 'Focal length of a concave mirror', 'u = 15, 20, 25, 30, 35 cm', 'Plot 1/v against 1/u: intercepts = 1/f']
      : ['Physics — SS3 Practical', 'Focal length of a converging lens', 'u = 20, 25, 30, 40, 50 cm', 'Plot 1/v against 1/u: intercepts = 1/f'],
    'Move the screen to and fro!',
    {
      title: task === 'MIRROR' ? 'Mirror formula' : 'Lens formula',
      band: '#00695c',
      lines: ['1/u + 1/v = 1/f (real is positive).', 'Rough focal length first: focus a distant window.', 'Centres on one axis; find the sharpest image.'],
    },
  );
