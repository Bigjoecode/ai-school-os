import type { PhySpringState, SpringTask } from '@aischool/shared';
import { collectedFromLog, startedIn2d } from '../../phy-common/lab3d/common';

/**
 * What the 3D bench shows beyond the marked state (apparatus collected, the
 * stand set at the bench edge, the spring hung from its clamp, the rule and
 * pointer or the fiducial pointer fixed, the lab coat) is read back from the
 * attempt's own action log, so a reload or a switch between the 2D and 3D labs
 * keeps the bench as it was. No marks.
 */

export type ApparatusId = 'stand' | 'spring' | 'rule' | 'pointer' | 'hanger' | 'masses' | 'stopwatch' | 'fiducial' | 'bob' | 'edge';
export const APPARATUS: { id: ApparatusId; label: string }[] = [
  { id: 'stand', label: 'Retort stand and clamps' },
  { id: 'spring', label: 'Spiral (helical) spring' },
  { id: 'rule', label: 'Metre rule' },
  { id: 'pointer', label: 'Pointer (pin) and plasticine' },
  { id: 'hanger', label: 'Mass hanger (50 g)' },
  { id: 'masses', label: 'Slotted masses (50 g each)' },
  { id: 'stopwatch', label: 'Stopwatch' },
  { id: 'fiducial', label: 'Fiducial pointer' },
  { id: 'bob', label: 'Pendulum bob' },
  { id: 'edge', label: 'Knife edge' },
];
export const APPARATUS_LABEL = Object.fromEntries(APPARATUS.map((a) => [a.id, a.label])) as Record<ApparatusId, string>;
/** What each task needs on the bench. */
export const NEEDED: Record<SpringTask, ApparatusId[]> = {
  HOOKE: ['stand', 'spring', 'rule', 'pointer', 'hanger', 'masses'],
  OSC: ['stand', 'spring', 'hanger', 'masses', 'stopwatch', 'fiducial'],
};
/** The things set out in order. */
export const PLACEABLE: Record<SpringTask, ApparatusId[]> = { HOOKE: ['stand', 'spring', 'rule', 'pointer'], OSC: ['stand', 'spring', 'fiducial'] };
export const PLACE_LABEL: Partial<Record<ApparatusId, string>> = {
  stand: 'Stand the retort stand at the bench edge',
  spring: 'Hang the spring from the clamp',
  rule: 'Clamp the metre rule vertically beside the spring',
  pointer: 'Fix the pointer to the bottom of the spring',
  fiducial: 'Clamp the fiducial pointer beside the hanger',
};

export interface SceneState {
  task: SpringTask;
  coat: boolean;
  collected: Set<ApparatusId>;
  placed: Set<ApparatusId>;
  ready: boolean;
  missing: ApparatusId[];
  /** Everything is set out: loads can go on. */
  set: boolean;
  nextPlace: ApparatusId | null;
}

export function sceneFromState(s: PhySpringState): SceneState {
  const task = s.task ?? 'HOOKE';
  const { collected, coat } = collectedFromLog(s.log);
  const placed = new Set<ApparatusId>();
  for (const { a } of s.log) {
    const [verb, arg] = a.split(':') as [string, string | undefined];
    if (verb === 'place' && arg) placed.add(arg as ApparatusId);
    else if (verb === 'return' && arg) placed.delete(arg as ApparatusId);
  }
  // Work done in the 2D lab first: the 3D bench is then set up already.
  if (startedIn2d(s.log, /^(load:|reading:|release:|record:)/)) for (const id of NEEDED[task]) collected.add(id), placed.add(id);
  for (const id of [...placed]) if (!collected.has(id)) placed.delete(id);
  // In order: no spring without the stand, no rule, pointer or fiducial without the spring.
  if (!placed.has('stand')) placed.delete('spring');
  if (!placed.has('spring')) ['rule', 'pointer', 'fiducial'].forEach((id) => placed.delete(id as ApparatusId));
  const missing = NEEDED[task].filter((id) => !collected.has(id));
  const toPlace = PLACEABLE[task].filter((id) => !placed.has(id));
  return { task, coat, collected: collected as Set<ApparatusId>, placed, ready: !missing.length, missing, set: !toPlace.length && !missing.length, nextPlace: toPlace[0] ?? null };
}
