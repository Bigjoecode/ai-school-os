import type { MechTask, PhyMechanicsState } from '@aischool/shared';
import { collectedFromLog, startedIn2d } from '../../phy-common/lab3d/common';

/**
 * What the 3D bench shows beyond the marked state (apparatus collected, the
 * rig set out, the lab coat) is read back from the attempt's own action log,
 * so a reload or a switch between the 2D and 3D labs keeps the bench as it
 * was. No marks.
 */

export type ApparatusId =
  | 'block'
  | 'plank'
  | 'sbalance'
  | 'slotted'
  | 'protractor'
  | 'cloth'
  | 'cylinder'
  | 'oilcyl'
  | 'balls'
  | 'micrometer'
  | 'rule'
  | 'bands'
  | 'stopclock'
  | 'magnet'
  | 'ramp'
  | 'woodblocks'
  | 'stopblock'
  | 'steelball'
  | 'board'
  | 'hangers'
  | 'thread'
  | 'paper'
  | 'pencil'
  | 'pulleys'
  | 'pendulum'
  | 'spring';
export const APPARATUS: { id: ApparatusId; label: string }[] = [
  { id: 'block', label: 'Wooden block with hook' },
  { id: 'plank', label: 'Smooth wooden plank' },
  { id: 'sbalance', label: 'Spring balance (0–10 N)' },
  { id: 'slotted', label: 'Slotted masses (6 × 100 g)' },
  { id: 'protractor', label: 'Protractor' },
  { id: 'cloth', label: 'Dry cloth' },
  { id: 'cylinder', label: 'Tall cylinder of glycerine' },
  { id: 'oilcyl', label: 'Tall cylinder of palm oil' },
  { id: 'balls', label: 'Ball bearings (5 sizes)' },
  { id: 'micrometer', label: 'Micrometer screw gauge' },
  { id: 'rule', label: 'Metre rule' },
  { id: 'bands', label: 'Rubber bands' },
  { id: 'stopclock', label: 'Stop-clock' },
  { id: 'magnet', label: 'Magnet (to recover the balls)' },
  { id: 'ramp', label: 'Grooved plank (2 m)' },
  { id: 'woodblocks', label: 'Wooden blocks' },
  { id: 'stopblock', label: 'Stopping block' },
  { id: 'steelball', label: 'Steel ball' },
  { id: 'board', label: 'Drawing board with two pulleys' },
  { id: 'hangers', label: 'Three hangers and 50 g slotted masses' },
  { id: 'thread', label: 'Thread with a knot' },
  { id: 'paper', label: 'Drawing paper and pins' },
  { id: 'pencil', label: 'Sharp pencil, ruler and protractor' },
  { id: 'pulleys', label: 'Spare pulleys' },
  { id: 'pendulum', label: 'Pendulum bob' },
  { id: 'spring', label: 'Spiral spring' },
];
export const APPARATUS_LABEL = Object.fromEntries(APPARATUS.map((a) => [a.id, a.label])) as Record<ApparatusId, string>;
/** What each task needs on the bench. */
export const NEEDED: Record<MechTask, ApparatusId[]> = {
  FRICTION: ['block', 'plank', 'sbalance', 'slotted', 'protractor', 'cloth'],
  VISCOSITY: ['cylinder', 'oilcyl', 'balls', 'micrometer', 'rule', 'bands', 'stopclock', 'magnet'],
  INCLINE: ['ramp', 'woodblocks', 'stopblock', 'steelball', 'stopclock'],
  FORCES: ['board', 'hangers', 'thread', 'paper', 'pencil'],
};
/** What is in the cupboard for each task (the needed things and a few that are not). */
export const IN_CUPBOARD: Record<MechTask, ApparatusId[]> = {
  FRICTION: [...NEEDED.FRICTION, 'spring', 'pendulum'],
  VISCOSITY: [...NEEDED.VISCOSITY, 'spring'],
  INCLINE: [...NEEDED.INCLINE, 'rule', 'pendulum'],
  FORCES: [...NEEDED.FORCES, 'pulleys', 'spring'],
};
/** The things set out in order. */
export const PLACEABLE: Record<MechTask, ApparatusId[]> = { FRICTION: ['plank', 'block', 'sbalance'], VISCOSITY: ['cylinder', 'oilcyl', 'rule', 'bands'], INCLINE: ['ramp', 'woodblocks', 'stopblock'], FORCES: ['board', 'paper', 'thread', 'hangers'] };
export const PLACE_LABEL: Partial<Record<ApparatusId, string>> = {
  plank: 'Lay the plank on the bench',
  block: 'Put the block on the plank',
  sbalance: 'Hook the spring balance to the block',
  cylinder: 'Stand the glycerine cylinder up',
  oilcyl: 'Stand the palm-oil cylinder beside it',
  rule: 'Stand the metre rule beside the cylinder',
  bands: 'Put the rubber bands round the cylinder',
  ramp: 'Lay the grooved plank along the bench',
  woodblocks: 'Put the blocks under its left end',
  stopblock: 'Put the stopping block in the groove',
  board: 'Stand the drawing board up',
  paper: 'Pin the paper to the board',
  thread: 'Pass the threads over the pulleys',
  hangers: 'Hang the three hangers on the threads',
};

export interface SceneState {
  task: MechTask;
  coat: boolean;
  collected: Set<ApparatusId>;
  placed: Set<ApparatusId>;
  ready: boolean;
  missing: ApparatusId[];
  /** The rig is set out. */
  set: boolean;
  nextPlace: ApparatusId | null;
}

const WORK = /^(zero|wipe|weigh|pull|tilt|measure|drop|run|dot|tap|mass|paper-off|build)/;
export function sceneFromState(s: PhyMechanicsState): SceneState {
  const task = s.task ?? 'FRICTION';
  const { collected, coat } = collectedFromLog(s.log);
  const placed = new Set<ApparatusId>();
  for (const { a } of s.log) {
    const [verb, arg] = a.split(':') as [string, string | undefined];
    if (verb === 'place' && arg) placed.add(arg as ApparatusId);
    else if (verb === 'return' && arg) placed.delete(arg as ApparatusId);
  }
  // Work done in the 2D lab first: the 3D bench is then set up already.
  if (startedIn2d(s.log, WORK)) for (const id of NEEDED[task]) collected.add(id), placed.add(id);
  const missing = NEEDED[task].filter((id) => !collected.has(id));
  for (const id of [...placed]) if (!collected.has(id)) placed.delete(id);
  const order = PLACEABLE[task];
  // set out in order: a later thing counts as placed only when the earlier ones are
  for (let i = 1; i < order.length; i++) if (!placed.has(order[i - 1]!)) for (const later of order.slice(i)) placed.delete(later);
  const toPlace = order.filter((id) => !placed.has(id));
  return { task, coat, collected: collected as Set<ApparatusId>, placed, ready: !missing.length, missing, set: !missing.length && toPlace.length === 0, nextPlace: toPlace[0] ?? null };
}
