import type { SpringTask } from '@aischool/shared';
import type { CameraPresets } from '../../../lab3d-kit/controls';
import { STATION } from '../../../lab3d-kit/layout';
import { physicsRoom } from '../../phy-common/lab3d/room';

/**
 * Where things are on the student's bench (station-local metres: x along the
 * bench, y up from the bench top, z towards the student; the bench's front
 * edge is at z = 0.45). The retort stand stands near the front edge with its
 * clamps reaching out past it, so the spring and its load hang in front of the
 * bench, with the metre rule (0 at the top) clamped vertically just to the
 * right of the spring and the pointer reaching across to it.
 */
export type V3 = [number, number, number];

export const STAND = { base: [0.55, 0, 0.3] as V3, rod: [0.55, 0, 0.24] as V3, rodH: 1.06 };
/** The hook the spring hangs from (bottom of the clamp). */
export const HOOK: V3 = [0.55, 0.985, 0.6];
/** The vertical rule: its scale's left edge at x, its face at z, the 0 cm mark at y (it reads downwards). */
export const RULE = { x: HOOK[0] + 0.03, z: HOOK[2] - 0.004, top: 0.96, w: 0.03 };
/** The pointer's tip stands this far in front of the rule's face (so a badly placed eye sees parallax). */
export const POINTER_GAP = 0.008;
/** The fiducial pointer (oscillations): a pin on its own rod, just right of the hanger. */
export const FIDUCIAL = { x: HOOK[0] + 0.065, z: HOOK[2] };
export const COIL = { r: 0.011, wire: 0.0011, turns: 30 };
export const HANGER = { hook: 0.014, rod: 0.085, r: 0.021, base: 0.004, slot: 0.0052 };
export const SPOT = {
  stopwatch: [0.2, 0, 0.3] as V3,
  masses: [0.3, 0, 0.12] as V3,
  card: [-0.86, 0, -0.2] as V3,
  book: [-0.3, 0, 0.25] as V3,
  waiting: [-0.62, 0, -0.26] as V3,
  extras: [-1.05, 0, 0.18] as V3,
};
/** The pointer's height above the bench (m) for a rule reading (cm). */
export const pointerY = (readingCm: number) => RULE.top - readingCm / 100;

export const SPRING_VIEWS: CameraPresets = {
  bench: { target: [0.3, 0.3, 0.3], dist: 2.1, pitch: 0.32 },
  spring: { target: [HOOK[0] + 0.02, 0.6, HOOK[2]], dist: 1.0, pitch: 0.05 },
  load: { target: [HOOK[0] + 0.02, 0.55, HOOK[2]], dist: 0.75, pitch: 0.06 },
  stopwatch: { target: [SPOT.stopwatch[0], 0.02, SPOT.stopwatch[2]], dist: 0.28, pitch: 0.95 },
};
export const VIEW_BUTTONS = (task: SpringTask) => [
  { id: 'bench', label: 'Whole bench' },
  { id: 'spring', label: 'Spring' },
  { id: 'load', label: task === 'OSC' ? 'Hanger' : 'Pointer' },
  ...(task === 'OSC' ? [{ id: 'stopwatch', label: 'Stopwatch' }] : []),
];

/** The world point the eye-level view reads: the rule's scale level with the pointer's rest position. */
export const readPoint = (readingCm: number): V3 => [STATION[0] + RULE.x + 0.008, STATION[1] + pointerY(readingCm), STATION[2] + RULE.z + 0.001];

/** The physics room as the spring has it. */
export const springRoom = (task: SpringTask) =>
  physicsRoom(
    'pendulum',
    task === 'OSC'
      ? ['Physics — SS3 Practical', 'Oscillations of a loaded spring', 'm = 0.10, 0.15, 0.20, 0.30, 0.40 kg', 'Plot T² against m: k = 4π²/slope']
      : ['Physics — SS3 Practical', 'Hooke’s law: the spring constant', 'Load 50 g to 300 g, then unload', 'Plot e against W: k = 1/slope'],
    task === 'OSC' ? 'Small displacements!' : 'Eye level with the pointer!',
    {
      title: task === 'OSC' ? 'The loaded spring' : 'Hooke’s law',
      band: '#37474f',
      lines:
        task === 'OSC'
          ? ['T = 2π√(m/k)', 'T² = (4π²/k) m', 'Time 20 oscillations, twice.', 'Start at the fiducial mark.']
          : ['F = ke, within the elastic limit.', 'e = R − R₀', 'W = mg (m in kg).', 'Check the readings on unloading.'],
    },
  );
