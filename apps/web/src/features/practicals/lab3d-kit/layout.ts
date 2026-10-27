/**
 * The lab's floor plan, in metres. x runs west → east, z north → south (the
 * whiteboard is on the north wall, the door in the south wall), y is up.
 */

export const ROOM = { w: 14, d: 10, h: 3.3 };
export const HALF_W = ROOM.w / 2;
export const HALF_D = ROOM.d / 2;
export const EYE = 1.58;

export const BENCH = { w: 2.6, d: 0.9, h: 0.9 };
/** Student benches: two rows of three, facing the whiteboard. */
export const BENCHES: [number, number][] = [
  [-4.2, -0.8],
  [0, -0.8],
  [4.2, -0.8],
  [-4.2, 1.9],
  [0, 1.9],
  [4.2, 1.9],
];
/** The student's own bench (front middle). */
export const MY_BENCH = BENCHES[1]!;
/** The student's station on that bench: world position of its working centre (bench-top height). */
export const STATION: [number, number, number] = [MY_BENCH[0], BENCH.h, MY_BENCH[1]];

/** Where the student stands at the bench (bench view orbits around here). */
export const BENCH_STAND: [number, number] = [STATION[0] + 0.2, STATION[2] + 0.95];

export const DOOR = { x: 5.1, w: 1.1 };
export const START: { x: number; z: number; yaw: number } = { x: 5.1, z: 4.2, yaw: 0.45 };

export const COAT_HOOKS: [number, number, number] = [3.2, 1.55, HALF_D - 0.06];
export const CUPBOARD = { x: HALF_W - 0.3, z: 1.6, w: 2.4, h: 2.0, d: 0.5 };
export const SHELF = { x: HALF_W - 0.2, z: -1.6, w: 2.2, h: 1.9, d: 0.36 };
export const FUME = { x: 4.6, z: -HALF_D + 0.45, w: 1.6, h: 2.35, d: 0.85 };
export const DESK = { x: -1.8, z: -3.5, w: 1.7, d: 0.8, h: 0.78 };
export const WINDOWS_Z = [-3, 0, 3];
/** Mrs Ada, the lab technician, stands beside the teacher's desk (out of the bench view's line of sight). */
export const ASSISTANT_POS: [number, number, number] = [DESK.x - DESK.w / 2 - 0.5, 0, DESK.z + 0.2];

/** Axis-aligned boxes the player cannot walk into (x0, x1, z0, z1). */
export const OBSTACLES: [number, number, number, number][] = [
  ...BENCHES.map(([x, z]): [number, number, number, number] => [x - BENCH.w / 2, x + BENCH.w / 2, z - BENCH.d / 2, z + BENCH.d / 2]),
  [DESK.x - DESK.w / 2, DESK.x + DESK.w / 2, DESK.z - DESK.d / 2, DESK.z + DESK.d / 2 + 0.4],
  [CUPBOARD.x - CUPBOARD.d / 2, HALF_W, CUPBOARD.z - CUPBOARD.w / 2, CUPBOARD.z + CUPBOARD.w / 2],
  [SHELF.x - SHELF.d / 2, HALF_W, SHELF.z - SHELF.w / 2, SHELF.z + SHELF.w / 2],
  [FUME.x - FUME.w / 2, FUME.x + FUME.w / 2, -HALF_D, FUME.z + FUME.d / 2],
  [ASSISTANT_POS[0] - 0.25, ASSISTANT_POS[0] + 0.25, ASSISTANT_POS[2] - 0.25, ASSISTANT_POS[2] + 0.25],
];
export const PLAYER_R = 0.28;

/** Moves (x, z) by (dx, dz) without entering a wall or an obstacle (each axis resolved on its own, so the player slides along). */
export function collide(x: number, z: number, dx: number, dz: number): [number, number] {
  const hit = (px: number, pz: number) => OBSTACLES.some(([x0, x1, z0, z1]) => px > x0 - PLAYER_R && px < x1 + PLAYER_R && pz > z0 - PLAYER_R && pz < z1 + PLAYER_R);
  const lim = (v: number, h: number) => Math.max(-h + PLAYER_R + 0.05, Math.min(h - PLAYER_R - 0.05, v));
  let nx = lim(x + dx, HALF_W);
  if (hit(nx, z)) nx = x;
  let nz = lim(z + dz, HALF_D);
  if (hit(nx, nz)) nz = z;
  return [nx, nz];
}
