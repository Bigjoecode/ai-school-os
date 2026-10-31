import type { PhySoundState, SoundTask } from '@aischool/shared';
import { collectedFromLog, startedIn2d } from '../../phy-common/lab3d/common';

/**
 * What the 3D bench shows beyond the marked state (apparatus collected, the
 * jar and tube set up, the stand clamping it, the rule on the tube, the
 * sonometer set at the bench end, the lab coat) is read back from the
 * attempt's own action log, so a reload or a switch between the 2D and 3D labs
 * keeps the bench as it was. No marks.
 */

export type ApparatusId = 'tube' | 'stand' | 'rule' | 'forks' | 'pad' | 'sonometer' | 'masses' | 'rider' | 'bob' | 'lens';
export const APPARATUS: { id: ApparatusId; label: string }[] = [
  { id: 'tube', label: 'Resonance tube and tall jar of water' },
  { id: 'stand', label: 'Clamp and stand' },
  { id: 'rule', label: 'Metre rule' },
  { id: 'forks', label: 'Set of tuning forks (256–512 Hz)' },
  { id: 'pad', label: 'Rubber pad (to strike forks)' },
  { id: 'sonometer', label: 'Sonometer (wire, two bridges, pulley)' },
  { id: 'masses', label: 'Hanger (1 kg) and 0.5 kg slotted masses' },
  { id: 'rider', label: 'Paper riders (folded paper)' },
  { id: 'bob', label: 'Pendulum bob' },
  { id: 'lens', label: 'Converging lens' },
];
export const APPARATUS_LABEL = Object.fromEntries(APPARATUS.map((a) => [a.id, a.label])) as Record<ApparatusId, string>;
export const NEEDED: Record<SoundTask, ApparatusId[]> = {
  TUBE: ['tube', 'stand', 'rule', 'forks', 'pad'],
  SONO: ['sonometer', 'masses', 'forks', 'pad', 'rider'],
};
export const PLACEABLE: Record<SoundTask, ApparatusId[]> = { TUBE: ['tube', 'stand', 'rule'], SONO: ['sonometer'] };
export const PLACE_LABEL: Partial<Record<ApparatusId, string>> = {
  tube: 'Stand the jar of water on the floor and put the tube in it',
  stand: 'Clamp the tube vertically from the stand',
  rule: 'Fix the metre rule along the tube (0 at the top)',
  sonometer: 'Set the sonometer along the bench, pulley over the end',
};

export interface SceneState {
  task: SoundTask;
  coat: boolean;
  collected: Set<ApparatusId>;
  placed: Set<ApparatusId>;
  ready: boolean;
  missing: ApparatusId[];
  /** Everything is set out. */
  set: boolean;
  nextPlace: ApparatusId | null;
}

export function sceneFromState(s: PhySoundState): SceneState {
  const task = s.task ?? 'TUBE';
  const { collected, coat } = collectedFromLog(s.log);
  const placed = new Set<ApparatusId>();
  for (const { a } of s.log) {
    const [verb, arg] = a.split(':') as [string, string | undefined];
    if (verb === 'place' && arg) placed.add(arg as ApparatusId);
    else if (verb === 'return' && arg) placed.delete(arg as ApparatusId);
  }
  if (startedIn2d(s.log, /^(fork:|strike:|reading:|load:|rider:)/)) for (const id of NEEDED[task]) collected.add(id), placed.add(id);
  for (const id of [...placed]) if (!collected.has(id)) placed.delete(id);
  if (!placed.has('tube')) placed.delete('stand');
  if (!placed.has('stand')) placed.delete('rule');
  const missing = NEEDED[task].filter((id) => !collected.has(id));
  const toPlace = PLACEABLE[task].filter((id) => !placed.has(id));
  return { task, coat, collected: collected as Set<ApparatusId>, placed, ready: !missing.length, missing, set: !toPlace.length && !missing.length, nextPlace: toPlace[0] ?? null };
}
