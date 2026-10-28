import type { OpticsTask, PhyOpticsState } from '@aischool/shared';
import { collectedFromLog, startedIn2d } from '../../phy-common/lab3d/common';

/**
 * What the 3D bench shows beyond the marked state (apparatus collected and
 * stood on the metre rule, the lab coat) is read back from the attempt's own
 * action log, so a reload or a switch between the 2D and 3D labs keeps the
 * bench as it was. No marks.
 */

export type ApparatusId = 'rule' | 'lamp' | 'lens' | 'mirror' | 'screen' | 'prism' | 'plane' | 'block';
export const APPARATUS: { id: ApparatusId; label: string }[] = [
  { id: 'rule', label: 'Metre rule' },
  { id: 'lamp', label: 'Illuminated object (lamp box and cross-wire)' },
  { id: 'lens', label: 'Converging lens in holder' },
  { id: 'mirror', label: 'Concave mirror in holder' },
  { id: 'screen', label: 'White screen in holder' },
  { id: 'prism', label: 'Triangular glass prism' },
  { id: 'plane', label: 'Plane mirror' },
  { id: 'block', label: 'Rectangular glass block' },
];
export const APPARATUS_LABEL = Object.fromEntries(APPARATUS.map((a) => [a.id, a.label])) as Record<ApparatusId, string>;
/** What each task needs on the bench, in the order it is stood on the rule (the rule first, lying on the bench). */
export const NEEDED: Record<OpticsTask, ApparatusId[]> = { LENS: ['rule', 'lamp', 'lens', 'screen'], MIRROR: ['rule', 'mirror', 'lamp', 'screen'] };
/** The things stood on the rule (in order). */
export const PLACEABLE: Record<OpticsTask, ApparatusId[]> = { LENS: ['lamp', 'lens', 'screen'], MIRROR: ['mirror', 'lamp', 'screen'] };
export const opticOf = (task: OpticsTask): ApparatusId => (task === 'MIRROR' ? 'mirror' : 'lens');
export const PLACE_LABEL: Record<OpticsTask, Partial<Record<ApparatusId, string>>> = {
  LENS: { lamp: 'Stand the object at the 0 cm mark', lens: 'Stand the lens on the rule', screen: 'Stand the screen beyond the lens' },
  MIRROR: { mirror: 'Stand the mirror at the 0 cm mark, facing along the rule', lamp: 'Stand the object on the rule, slightly off the axis', screen: 'Stand the screen beside the object' },
};

export interface SceneState {
  task: OpticsTask;
  coat: boolean;
  collected: Set<ApparatusId>;
  placed: Set<ApparatusId>;
  /** Everything needed is on the bench. */
  ready: boolean;
  missing: ApparatusId[];
  /** Everything is stood on the rule: the bench is set up. */
  set: boolean;
  /** The next thing to stand on the rule (null: all done). */
  nextPlace: ApparatusId | null;
}

export function sceneFromState(s: PhyOpticsState): SceneState {
  const task = s.task ?? 'LENS';
  const { collected, coat } = collectedFromLog(s.log);
  const placed = new Set<ApparatusId>();
  for (const { a } of s.log) {
    const [verb, arg] = a.split(':') as [string, string | undefined];
    if (verb === 'place' && arg) placed.add(arg as ApparatusId);
    else if (verb === 'return' && arg) placed.delete(arg as ApparatusId);
    else if (verb === 'task') placed.clear();
  }
  if (startedIn2d(s.log, /^(align|rough|reading)/)) for (const id of NEEDED[task]) collected.add(id), placed.add(id);
  // A reading or the rough focus needs the bench set up: an attempt that has them was set up (e.g. in the 2D lab).
  const missing = NEEDED[task].filter((id) => !collected.has(id));
  for (const id of [...placed]) if (!collected.has(id)) placed.delete(id);
  const toPlace = PLACEABLE[task].filter((id) => !placed.has(id));
  return { task, coat, collected: collected as Set<ApparatusId>, placed, ready: !missing.length, missing, set: !missing.length && !toPlace.length, nextPlace: toPlace[0] ?? null };
}
