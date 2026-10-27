import type { OhmsTask, OhmsTerminal } from '@aischool/shared';

/**
 * The circuit board on the student's bench (station-local metres: x along the
 * bench, y up from the bench top, z towards the student) and where every
 * terminal post is.
 */

export const BOARD = { x: 0.06, z: -0.04, w: 1.0, d: 0.46, h: 0.022 } as const;
const TOP = BOARD.h;
/** Components on the board (their stand-on points). */
export const PART = {
  cells: [-0.27, TOP, -0.17],
  key: [0.04, TOP, -0.17],
  rheostat: [0.36, TOP, -0.17],
  ammeter: [0.4, TOP, 0.07],
  voltmeter: [-0.26, TOP, 0.07],
  resistor: [0.07, TOP, 0.1],
} as const satisfies Record<string, readonly [number, number, number]>;
/** The resistance wire on its metre rule, in front of the board (WIRE). */
export const WIRE_RULE = { x0: -0.47, z: 0.33, y: 0.026 } as const;
export const RHEO = { x0: PART.rheostat[0] - 0.13, len: 0.26, railY: TOP + 0.105 } as const;
export const METER = { w: 0.19, h: 0.15, d: 0.11 } as const;
/** Height of the needle pivot above the meter's base, and the face's centre (meter-local). */
export const FACE = { w: 0.17, h: 0.1275, cy: METER.h * 0.5 + 0.005 } as const;

export type V3 = [number, number, number];
const post = 0.028;

/** World-free position (station-local) of the top of a terminal post now. */
export function terminalPos(t: OhmsTerminal, s: { rheostat: number; jockey: number }): V3 {
  const [cx, , cz] = PART.cells;
  const [kx, , kz] = PART.key;
  const [ax, , az] = PART.ammeter;
  const [vx, , vz] = PART.voltmeter;
  const [rx, , rz] = PART.resistor;
  const mt = TOP + METER.h + post;
  switch (t) {
    case 'cell-': return [cx - 0.13, TOP + post, cz];
    case 'cell+': return [cx + 0.13, TOP + post, cz];
    case 'key-a': return [kx - 0.07, TOP + 0.03 + post, kz];
    case 'key-b': return [kx + 0.07, TOP + 0.03 + post, kz];
    case 'rh-a': return [RHEO.x0 - 0.03, TOP + 0.04 + post, PART.rheostat[2] + 0.05];
    case 'rh-s': return [RHEO.x0 + RHEO.len * s.rheostat, RHEO.railY + 0.03, PART.rheostat[2]];
    case 'am+': return [ax - 0.055, mt, az - 0.02];
    case 'am-': return [ax + 0.055, mt, az - 0.02];
    case 'vm+': return [vx - 0.055, mt, vz - 0.02];
    case 'vm-': return [vx + 0.055, mt, vz - 0.02];
    case 'res-a': return [rx - 0.09, TOP + post, rz];
    case 'res-b': return [rx + 0.09, TOP + post, rz];
    case 'w-0': return [WIRE_RULE.x0 - 0.03, WIRE_RULE.y + post, WIRE_RULE.z];
    case 'w-100': return [WIRE_RULE.x0 + 1.03, WIRE_RULE.y + post, WIRE_RULE.z];
    case 'w-j': return [WIRE_RULE.x0 + s.jockey / 100, WIRE_RULE.y + 0.07, WIRE_RULE.z + 0.012];
  }
}

/** A tidy working circuit (the demo wires it; the guide suggests the next missing wire from it). */
export const GOOD_WIRES: Record<OhmsTask, [OhmsTerminal, OhmsTerminal][]> = {
  OHM: [
    ['cell+', 'key-a'],
    ['key-b', 'rh-a'],
    ['rh-s', 'am+'],
    ['am-', 'res-a'],
    ['res-b', 'cell-'],
    ['vm+', 'res-a'],
    ['vm-', 'res-b'],
  ],
  WIRE: [
    ['cell+', 'key-a'],
    ['key-b', 'rh-a'],
    ['rh-s', 'am+'],
    ['am-', 'w-0'],
    ['w-j', 'cell-'],
    ['vm+', 'w-0'],
    ['vm-', 'w-j'],
  ],
};

/** Other things on the bench (station-local). */
export const SPOT = {
  card: [-0.92, 0, -0.18] as V3,
  book: [0.92, 0, 0.22] as V3,
  micrometer: [-0.85, 0, 0.18] as V3,
  extras: [-1.12, 0, 0.02] as V3,
};
