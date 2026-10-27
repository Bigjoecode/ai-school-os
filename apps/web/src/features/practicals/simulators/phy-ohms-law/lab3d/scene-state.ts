import type { OhmsTask, OhmsTerminal, PhyOhmsState } from '@aischool/shared';
import { collectedFromLog, startedIn2d } from '../../phy-common/lab3d/common';

/**
 * What the 3D lab shows beyond the marked state — the apparatus collected
 * from the cupboard — read back from the attempt's own action log (no marks),
 * so a reload or a switch to the 2D lab and back keeps the bench as it was.
 */

export type ApparatusId = 'cells' | 'key' | 'rheostat' | 'ammeter' | 'voltmeter' | 'resistor' | 'wireRule' | 'wires' | 'micrometer' | 'galvanometer' | 'bulb' | 'springBalance';
export interface ApparatusInfo {
  id: ApparatusId;
  label: string;
  /** Needed for which experiment (none: a distractor). */
  for: OhmsTask[];
}
export const APPARATUS: ApparatusInfo[] = [
  { id: 'cells', label: 'Two 1.5 V cells in a holder', for: ['OHM', 'WIRE'] },
  { id: 'key', label: 'Plug key', for: ['OHM', 'WIRE'] },
  { id: 'rheostat', label: 'Rheostat (0–20 Ω)', for: ['OHM', 'WIRE'] },
  { id: 'ammeter', label: 'Ammeter (0–1 A)', for: ['OHM', 'WIRE'] },
  { id: 'voltmeter', label: 'Voltmeter (0–3 V)', for: ['OHM', 'WIRE'] },
  { id: 'wires', label: 'Connecting wires', for: ['OHM', 'WIRE'] },
  { id: 'resistor', label: 'Standard resistor R', for: ['OHM'] },
  { id: 'wireRule', label: 'Resistance wire on a metre rule, with jockey', for: ['WIRE'] },
  { id: 'micrometer', label: 'Micrometer screw gauge', for: ['WIRE'] },
  { id: 'galvanometer', label: 'Centre-zero galvanometer', for: [] },
  { id: 'bulb', label: 'Torch bulb in a holder', for: [] },
  { id: 'springBalance', label: 'Spring balance', for: [] },
];
export const APPARATUS_LABEL = Object.fromEntries(APPARATUS.map((a) => [a.id, a.label])) as Record<ApparatusId, string>;
export const needed = (task: OhmsTask) => APPARATUS.filter((a) => a.for.includes(task));

/** The apparatus each terminal belongs to. */
export const TERMINAL_PART: Record<OhmsTerminal, ApparatusId> = {
  'cell+': 'cells',
  'cell-': 'cells',
  'key-a': 'key',
  'key-b': 'key',
  'rh-a': 'rheostat',
  'rh-s': 'rheostat',
  'am+': 'ammeter',
  'am-': 'ammeter',
  'vm+': 'voltmeter',
  'vm-': 'voltmeter',
  'res-a': 'resistor',
  'res-b': 'resistor',
  'w-0': 'wireRule',
  'w-j': 'wireRule',
  'w-100': 'wireRule',
};

export interface SceneState {
  collected: Set<ApparatusId>;
  coat: boolean;
  /** Work started in the 2D lab: its apparatus is already on the board. */
  from2d: boolean;
}

export function sceneFromState(s: PhyOhmsState): SceneState {
  const { collected, coat } = collectedFromLog(s.log);
  const from2d = startedIn2d(s.log, /^(wire:|close-key|reading:)/);
  const set = collected as Set<ApparatusId>;
  if (from2d) for (const a of needed(s.task ?? 'OHM')) set.add(a.id);
  return { collected: set, coat, from2d };
}

/** Can this terminal be used (its apparatus is on the bench)? */
export const terminalReady = (t: OhmsTerminal, scene: SceneState) => scene.collected.has(TERMINAL_PART[t]);
