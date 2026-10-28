import type { CircuitsTask, CircuitsTerminal } from '@aischool/shared';
import { BOARD, FACE, METER, RHEO } from '../../phy-ohms-law/lab3d/layout';

/**
 * The circuit bench (station-local metres: x along the bench, y up from the
 * bench top, z towards the student): the Ohm's-law lab's circuit board, plus
 * the metre bridge in front of it (BRIDGE), and where every terminal post is.
 */

export { BOARD, FACE, METER, RHEO };
export type V3 = [number, number, number];
const TOP = BOARD.h;
const post = 0.028;

/** Components on the board (their stand-on points). */
export const PART = {
  cell: [-0.3, TOP, -0.17],
  key: [0.04, TOP, -0.17],
  rheostat: [0.36, TOP, -0.17],
  ammeter: [0.4, TOP, 0.07],
  voltmeter: [-0.26, TOP, 0.07],
  galvanometer: [0.02, TOP, -0.05],
  r1: [0.07, TOP, 0.0],
  r2: [0.07, TOP, 0.13],
} as const satisfies Record<string, readonly [number, number, number]>;

/** The metre bridge in front of the board: the wire from x0 (0 cm) to x0 + 1 m. */
export const BRIDGE = { x0: -0.47, wireZ: 0.36, stripZ: 0.27, y: 0.03, baseD: 0.2 } as const;
/** The two gaps' centres (x, station-local) and the centre strip. */
export const GAP = { left: BRIDGE.x0 + 0.265, right: BRIDGE.x0 + 0.735, centre: BRIDGE.x0 + 0.5 } as const;
/** The resistance box stands on the board behind the gap it is joined into (the right gap, or the left with X and R interchanged). */
export const rboxAt = (swap: boolean): V3 => [swap ? GAP.left : GAP.right, TOP, 0.09];

/** Position (station-local) of the top of a terminal post now. */
export function terminalPos(t: CircuitsTerminal, s: { rheostat: number; jockey: number; pressed?: boolean }): V3 {
  const [cx, , cz] = PART.cell;
  const [kx, , kz] = PART.key;
  const [ax, , az] = PART.ammeter;
  const [vx, , vz] = PART.voltmeter;
  const [gx, , gz] = PART.galvanometer;
  const mt = TOP + METER.h + post;
  switch (t) {
    case 'cell-': return [cx - 0.1, TOP + post, cz];
    case 'cell+': return [cx + 0.1, TOP + post, cz];
    case 'key-a': return [kx - 0.07, TOP + 0.03 + post, kz];
    case 'key-b': return [kx + 0.07, TOP + 0.03 + post, kz];
    case 'rh-a': return [RHEO.x0 - 0.03, TOP + 0.04 + post, PART.rheostat[2] + 0.05];
    case 'rh-s': return [RHEO.x0 + RHEO.len * s.rheostat, RHEO.railY + 0.03, PART.rheostat[2]];
    case 'am+': return [ax - 0.055, mt, az - 0.02];
    case 'am-': return [ax + 0.055, mt, az - 0.02];
    case 'vm+': return [vx - 0.055, mt, vz - 0.02];
    case 'vm-': return [vx + 0.055, mt, vz - 0.02];
    case 'g-a': return [gx - 0.055, mt, gz - 0.02];
    case 'g-b': return [gx + 0.055, mt, gz - 0.02];
    case 'r1-a': return [PART.r1[0] - 0.09, TOP + post, PART.r1[2]];
    case 'r1-b': return [PART.r1[0] + 0.09, TOP + post, PART.r1[2]];
    case 'r2-a': return [PART.r2[0] - 0.09, TOP + post, PART.r2[2]];
    case 'r2-b': return [PART.r2[0] + 0.09, TOP + post, PART.r2[2]];
    case 'mb-a': return [BRIDGE.x0 - 0.035, BRIDGE.y + post, BRIDGE.stripZ];
    case 'mb-c': return [BRIDGE.x0 + 1.035, BRIDGE.y + post, BRIDGE.stripZ];
    case 'mb-d': return [GAP.centre, BRIDGE.y + post, BRIDGE.stripZ - 0.02];
    case 'mb-j': return [BRIDGE.x0 + s.jockey / 100, BRIDGE.y + (s.pressed ? 0.062 : 0.072), BRIDGE.wireZ - 0.012];
  }
}

/** A tidy working circuit for each task (the demo wires it; the guide suggests the next missing wire from it). */
const LOOP: [CircuitsTerminal, CircuitsTerminal][] = [['cell+', 'key-a']];
export const GOOD_WIRES: Record<CircuitsTask, [CircuitsTerminal, CircuitsTerminal][]> = {
  BRIDGE: [...LOOP, ['key-b', 'mb-a'], ['mb-c', 'cell-'], ['mb-d', 'g-a'], ['g-b', 'mb-j']],
  EMF: [...LOOP, ['key-b', 'am+'], ['am-', 'rh-a'], ['rh-s', 'cell-'], ['vm+', 'cell+'], ['vm-', 'cell-']],
  SERIES: [...LOOP, ['key-b', 'am+'], ['am-', 'r1-a'], ['r1-b', 'cell-'], ['vm+', 'r1-a'], ['vm-', 'r1-b']],
};
/** SERIES: the wiring of each arrangement (the demo rewires between them). */
export const SERIES_WIRING: Record<'R1' | 'R2' | 'S' | 'P', [CircuitsTerminal, CircuitsTerminal][]> = {
  R1: GOOD_WIRES.SERIES,
  R2: [...LOOP, ['key-b', 'am+'], ['am-', 'r2-a'], ['r2-b', 'cell-'], ['vm+', 'r2-a'], ['vm-', 'r2-b']],
  S: [...LOOP, ['key-b', 'am+'], ['am-', 'r1-a'], ['r1-b', 'r2-a'], ['r2-b', 'cell-'], ['vm+', 'r1-a'], ['vm-', 'r2-b']],
  P: [...LOOP, ['key-b', 'am+'], ['am-', 'r1-a'], ['r1-a', 'r2-a'], ['r1-b', 'r2-b'], ['r2-b', 'cell-'], ['vm+', 'r1-a'], ['vm-', 'r1-b']],
};

/** Other things on the bench (station-local). */
export const SPOT = {
  card: [-0.92, 0, -0.18] as V3,
  book: [0.92, 0, 0.22] as V3,
  extras: [-1.12, 0, 0.02] as V3,
};
export { FACE as METER_FACE };
