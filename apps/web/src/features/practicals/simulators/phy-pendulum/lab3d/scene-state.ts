import type { PhyPendulumState } from '@aischool/shared';
import { collectedFromLog, startedIn2d } from '../../phy-common/lab3d/common';

/**
 * What the 3D lab shows beyond the marked state — the apparatus collected
 * from the cupboard — read back from the attempt's own action log (no marks),
 * so a reload or a switch to the 2D lab and back keeps the bench as it was.
 */

export type ApparatusId = 'stand' | 'cork' | 'bob' | 'rule' | 'stopwatch' | 'protractor' | 'spring' | 'masses' | 'prism';
export interface ApparatusInfo {
  id: ApparatusId;
  label: string;
  needed: boolean;
}
export const APPARATUS: ApparatusInfo[] = [
  { id: 'stand', label: 'Retort stand with clamp', needed: true },
  { id: 'cork', label: 'Split cork', needed: true },
  { id: 'bob', label: 'Pendulum bob on a thread', needed: true },
  { id: 'rule', label: 'Metre rule', needed: true },
  { id: 'stopwatch', label: 'Stopwatch', needed: true },
  { id: 'protractor', label: 'Protractor', needed: true },
  { id: 'spring', label: 'Helical spring', needed: false },
  { id: 'masses', label: 'Slotted masses', needed: false },
  { id: 'prism', label: 'Glass prism', needed: false },
];
export const APPARATUS_LABEL = Object.fromEntries(APPARATUS.map((a) => [a.id, a.label])) as Record<ApparatusId, string>;
export const NEEDED = APPARATUS.filter((a) => a.needed);

export interface SceneState {
  collected: Set<ApparatusId>;
  coat: boolean;
  /** The pendulum can swing: stand, cork and bob are on the bench. */
  hung: boolean;
  from2d: boolean;
}

export function sceneFromState(s: PhyPendulumState): SceneState {
  const { collected, coat } = collectedFromLog(s.log);
  const set = collected as Set<ApparatusId>;
  const from2d = startedIn2d(s.log, /^(release:|record:|close-window|open-window)/);
  if (from2d) for (const a of NEEDED) set.add(a.id);
  return { collected: set, coat, hung: set.has('stand') && set.has('cork') && set.has('bob'), from2d };
}
