import type { PhyGlassState } from '@aischool/shared';
import { collectedFromLog, startedIn2d } from '../../phy-common/lab3d/common';
import { nextAngle } from '../actions';

/**
 * What the 3D bench shows beyond the marked state (apparatus collected, the
 * lab coat) is read back from the attempt's own action log, so a reload or a
 * switch between the 2D and 3D labs keeps the bench as it was. No marks.
 */

export type ApparatusId = 'board' | 'paper' | 'block' | 'pins' | 'protractor' | 'ruler' | 'pencil' | 'prism' | 'lens' | 'mirror';
export const APPARATUS: { id: ApparatusId; label: string; needed: boolean }[] = [
  { id: 'board', label: 'Drawing board', needed: true },
  { id: 'paper', label: 'White paper and drawing pins', needed: true },
  { id: 'block', label: 'Rectangular glass block', needed: true },
  { id: 'pins', label: 'Optical pins (box of 4)', needed: true },
  { id: 'protractor', label: 'Protractor', needed: true },
  { id: 'ruler', label: '30 cm ruler', needed: true },
  { id: 'pencil', label: 'Sharp pencil', needed: true },
  { id: 'prism', label: 'Triangular glass prism', needed: false },
  { id: 'lens', label: 'Converging lens', needed: false },
  { id: 'mirror', label: 'Plane mirror', needed: false },
];
export const APPARATUS_LABEL = Object.fromEntries(APPARATUS.map((a) => [a.id, a.label])) as Record<ApparatusId, string>;
export const NEEDED = APPARATUS.filter((a) => a.needed).map((a) => a.id);

export interface SceneState {
  coat: boolean;
  collected: Set<ApparatusId>;
  /** Everything needed for a trace is on the bench. */
  ready: boolean;
  missing: ApparatusId[];
}

export function sceneFromState(s: PhyGlassState): SceneState {
  const { collected, coat } = collectedFromLog(s.log);
  if (startedIn2d(s.log, /^(trace|normal|pin-|join)/)) for (const id of NEEDED) collected.add(id);
  const missing = NEEDED.filter((id) => !collected.has(id));
  return { coat, collected: collected as Set<ApparatusId>, ready: !missing.length, missing };
}

/** The angle offered for the next trace. */
export const nextIFor = (s: PhyGlassState, chosen: number | null) => chosen ?? (s.traces.length ? nextAngle(s.traces.at(-1)!.i) : 20);
