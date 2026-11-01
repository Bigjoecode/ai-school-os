import type { PhyPinsState, PinsTask } from '@aischool/shared';
import { collectedFromLog, startedIn2d } from '../../phy-common/lab3d/common';

/**
 * What the 3D bench shows beyond the marked state (apparatus collected, the
 * lab coat) is read back from the attempt's own action log, so a reload or a
 * switch between the 2D and 3D labs keeps the bench as it was. No marks.
 */

export type ApparatusId = 'board' | 'paper' | 'mirror' | 'prism' | 'pins' | 'protractor' | 'ruler' | 'pencil' | 'blocks' | 'stand' | 'rule' | 'raybox' | 'turntable' | 'screen' | 'filters' | 'lens';
export const APPARATUS_LABEL: Record<ApparatusId, string> = {
  board: 'Drawing board',
  paper: 'White paper and drawing pins',
  mirror: 'Plane mirror in a holder',
  prism: 'Triangular glass prism',
  pins: 'Optical pins (box of 4)',
  protractor: 'Protractor',
  ruler: '30 cm ruler',
  pencil: 'Sharp pencil',
  blocks: 'Glass blocks (4) and paper with a cross',
  stand: 'Retort stand, cork and search pin',
  rule: 'Half-metre rule (vertical)',
  raybox: 'Ray box with slits',
  turntable: 'Turntable for the prism',
  screen: 'White screen with a degree scale',
  filters: 'Colour filters (red, green, blue)',
  lens: 'Converging lens',
};
const ALL: ApparatusId[] = ['board', 'paper', 'mirror', 'prism', 'pins', 'protractor', 'ruler', 'pencil', 'blocks', 'stand', 'rule', 'raybox', 'turntable', 'screen', 'filters', 'lens'];
export const NEEDED_FOR: Record<PinsTask, ApparatusId[]> = {
  MIRROR: ['board', 'paper', 'mirror', 'pins', 'protractor', 'ruler', 'pencil'],
  PRISM: ['board', 'paper', 'prism', 'pins', 'protractor', 'ruler', 'pencil'],
  DEPTH: ['blocks', 'stand', 'rule'],
  DISP: ['raybox', 'prism', 'turntable', 'screen', 'filters'],
};
export const apparatusFor = (task: PinsTask) => ALL.map((id) => ({ id, label: APPARATUS_LABEL[id], needed: NEEDED_FOR[task].includes(id) }));
const WORK: Record<PinsTask, RegExp> = { MIRROR: /^(trace|normal|pin-|join)/, PRISM: /^(trace|normal|pin-|join)/, DEPTH: /^(blocks|depth-read)/, DISP: /^(look|lights|slit|filter)/ };

export interface SceneState {
  coat: boolean;
  collected: Set<ApparatusId>;
  ready: boolean;
  missing: ApparatusId[];
}
export function sceneFromState(s: PhyPinsState, task: PinsTask): SceneState {
  const { collected, coat } = collectedFromLog(s.log);
  if (startedIn2d(s.log, WORK[task])) for (const id of NEEDED_FOR[task]) collected.add(id);
  const missing = NEEDED_FOR[task].filter((id) => !collected.has(id));
  return { coat, collected: collected as Set<ApparatusId>, ready: !missing.length, missing };
}
