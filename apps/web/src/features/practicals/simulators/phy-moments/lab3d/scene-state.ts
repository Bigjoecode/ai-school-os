import type { MomentsTask, PhyMomentsState } from '@aischool/shared';
import { collectedFromLog, startedIn2d } from '../../phy-common/lab3d/common';

/**
 * What the 3D bench shows beyond the marked state (apparatus collected, the
 * knife edge stood on the bench and the rule laid on it, the lab coat) is read
 * back from the attempt's own action log, so a reload or a switch between the
 * 2D and 3D labs keeps the bench as it was. No marks.
 */

export type ApparatusId = 'rule' | 'edge' | 'm50' | 'm100' | 'unknown' | 'thread' | 'spring' | 'bob';
export const APPARATUS: { id: ApparatusId; label: string }[] = [
  { id: 'rule', label: 'Metre rule' },
  { id: 'edge', label: 'Knife edge (wedge on a block)' },
  { id: 'm50', label: '50 g slotted mass' },
  { id: 'm100', label: '100 g slotted mass' },
  { id: 'unknown', label: 'Unknown mass (labelled M)' },
  { id: 'thread', label: 'Thread (for loops)' },
  { id: 'spring', label: 'Spiral spring' },
  { id: 'bob', label: 'Pendulum bob' },
];
export const APPARATUS_LABEL = Object.fromEntries(APPARATUS.map((a) => [a.id, a.label])) as Record<ApparatusId, string>;
/** What each task needs on the bench. */
export const NEEDED: Record<MomentsTask, ApparatusId[]> = { MOMENTS: ['edge', 'rule', 'm50', 'unknown', 'thread'], MASS: ['edge', 'rule', 'm100', 'thread'] };
/** The things set out in order: the knife edge on the bench, then the rule on it. */
export const PLACEABLE: ApparatusId[] = ['edge', 'rule'];
export const knownId = (task: MomentsTask): ApparatusId => (task === 'MASS' ? 'm100' : 'm50');
export const PLACE_LABEL: Partial<Record<ApparatusId, string>> = { edge: 'Stand the knife edge on the bench', rule: 'Lay the metre rule on the knife edge' };

export interface SceneState {
  task: MomentsTask;
  coat: boolean;
  collected: Set<ApparatusId>;
  placed: Set<ApparatusId>;
  ready: boolean;
  missing: ApparatusId[];
  /** The rule is on the knife edge: the balance is set up. */
  set: boolean;
  nextPlace: ApparatusId | null;
}

export function sceneFromState(s: PhyMomentsState): SceneState {
  const task = s.task ?? 'MOMENTS';
  const { collected, coat } = collectedFromLog(s.log);
  const placed = new Set<ApparatusId>();
  for (const { a } of s.log) {
    const [verb, arg] = a.split(':') as [string, string | undefined];
    if (verb === 'place' && arg) placed.add(arg as ApparatusId);
    else if (verb === 'return' && arg) placed.delete(arg as ApparatusId);
  }
  // Work done in the 2D lab first: the 3D bench is then set up already.
  if (startedIn2d(s.log, /^(g:|hang|reading)/)) for (const id of NEEDED[task]) collected.add(id), placed.add(id);
  const missing = NEEDED[task].filter((id) => !collected.has(id));
  for (const id of [...placed]) if (!collected.has(id)) placed.delete(id);
  if (!placed.has('edge')) placed.delete('rule');
  const toPlace = PLACEABLE.filter((id) => !placed.has(id));
  return { task, coat, collected: collected as Set<ApparatusId>, placed, ready: !missing.length, missing, set: placed.has('edge') && placed.has('rule') && !missing.length, nextPlace: toPlace[0] ?? null };
}
