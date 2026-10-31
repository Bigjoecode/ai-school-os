import type { SoundTask } from '@aischool/shared';
import type { CameraPresets } from '../../../lab3d-kit/controls';
import { BENCH, STATION } from '../../../lab3d-kit/layout';
import { physicsRoom } from '../../phy-common/lab3d/room';

/**
 * Where things are at the student's bench (station-local metres: x along the
 * bench, y up from the bench top, z towards the student; the bench's front
 * edge is at z = 0.45, its right end at x = 1.3). The resonance tube's tall
 * jar of water stands on the floor in front of the bench's right half, the
 * tube clamped in it from a stand beside it, its metre rule on the tube (0 at
 * the top). The sonometer lies along the back half of the bench, its pulley
 * just past the bench's right end so the hanger hangs clear.
 */
export type V3 = [number, number, number];

const FLOOR = -BENCH.h;
/** The jar (on the floor): its centre, radius and height; the water surface (station-local y, m). */
export const JAR = { x: 0.62, z: 0.66, r: 0.075, h: 1.1, water: FLOOR + 0.98, floor: FLOOR };
export const TUBE = { r: 0.017, length: 1.0 };
/** The tube's top (station-local y) for an air column of l cm. */
export const tubeTopY = (lCm: number) => JAR.water + lCm / 100;
/** The clamp stand beside the jar (on the floor). */
export const STAND = { x: JAR.x + 0.24, z: JAR.z - 0.02, rodH: 1.75 };
/** The sonometer: the box along x, the fixed bridge (0 of the scale), the wire's height over the bridges, the pulley. */
export const SONO = { x0: 0.08, x1: 1.3, z: -0.12, w: 0.13, h: 0.09, fixed: 0.16, wire: 0.122, pulleyX: 1.335, pulleyY: 0.1 };
export const bridgeX = (lCm: number) => SONO.fixed + lCm / 100;
export const SPOT = {
  forks: [0.05, 0, 0.27] as V3,
  pad: [0.3, 0, 0.3] as V3,
  card: [-0.86, 0, -0.2] as V3,
  book: [-0.4, 0, 0.25] as V3,
  waiting: [-0.75, 0, -0.26] as V3,
  extras: [-1.1, 0, 0.18] as V3,
  masses: [-0.2, 0, -0.3] as V3,
};

export const SOUND_VIEWS = (task: SoundTask, lCm: number): CameraPresets =>
  task === 'SONO'
    ? {
        bench: { target: [0.4, 0.15, 0.1], dist: 2.0, pitch: 0.4 },
        wire: { target: [(SONO.x0 + SONO.x1) / 2, 0.1, SONO.z], dist: 1.25, pitch: 0.5 },
        bridge: { target: [bridgeX(lCm), 0.1, SONO.z], dist: 0.42, pitch: 0.75 },
        rider: { target: [(SONO.fixed + bridgeX(lCm)) / 2, 0.12, SONO.z], dist: 0.38, pitch: 0.35 },
      }
    : {
        bench: { target: [0.35, 0.2, 0.35], dist: 2.2, pitch: 0.3 },
        tube: { target: [JAR.x, tubeTopY(lCm) - 0.12, JAR.z], dist: 1.0, pitch: 0.12 },
        mouth: { target: [JAR.x, tubeTopY(lCm), JAR.z], dist: 0.45, pitch: 0.25 },
        forks: { target: [SPOT.forks[0], 0.03, SPOT.forks[2]], dist: 0.55, pitch: 0.8 },
      };
export const VIEW_BUTTONS = (task: SoundTask) =>
  task === 'SONO'
    ? [
        { id: 'bench', label: 'Whole bench' },
        { id: 'wire', label: 'Sonometer' },
        { id: 'bridge', label: 'Bridge & scale' },
        { id: 'rider', label: 'Rider' },
      ]
    : [
        { id: 'bench', label: 'Whole bench' },
        { id: 'tube', label: 'Tube' },
        { id: 'mouth', label: 'Mouth & fork' },
        { id: 'forks', label: 'Forks' },
      ];

/** The world point the eye-level view reads: the rule on the tube at the water surface. */
export const readPoint = (): V3 => [STATION[0] + JAR.x + TUBE.r + 0.012, STATION[1] + JAR.water, STATION[2] + JAR.z + 0.004];

const BOARD: Record<SoundTask, string[]> = {
  TUBE: ['Physics — SS3 Practical', 'Speed of sound: resonance tube', 'Forks 256, 288, 320, 384, 512 Hz', 'Plot l against 1/f: slope v/4'],
  SONO: ['Physics — SS3 Practical', 'The sonometer: f and l', 'Forks 256, 320, 384, 512 Hz; M = 4.0 kg', 'Plot f against 1/l: slope v/2'],
};
/** The physics room as the resonance labs have it. */
export const soundRoom = (task: SoundTask) =>
  physicsRoom('pendulum', BOARD[task], 'Strike forks on the rubber pad only!', {
    title: task === 'SONO' ? 'Vibrating strings' : 'Closed pipes',
    band: '#4a148c',
    lines: task === 'SONO' ? ['f = (1/2l)√(T/μ)', 'f × l = v/2 (fixed T)', 'Rider at the middle.', 'μ = T/v²'] : ['l + e = λ/4 = v/(4f)', 'e ≈ 0.3 d', 'v = 331√(T/273) m/s', 'l₂ − l₁ = λ/2'],
  });
