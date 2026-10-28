import type { CircuitsTask, CircuitsTerminal, PhyCircuitsState } from '@aischool/shared';
import { collectedFromLog, startedIn2d } from '../../phy-common/lab3d/common';

/**
 * What the 3D lab shows beyond the marked state — the apparatus collected
 * from the cupboard — read back from the attempt's own action log (no marks),
 * so a reload or a switch to the 2D lab and back keeps the bench as it was.
 */

export type ApparatusId = 'cell' | 'key' | 'rheostat' | 'ammeter' | 'voltmeter' | 'galvanometer' | 'bridge' | 'rbox' | 'unknown' | 'r1' | 'r2' | 'wires' | 'battery' | 'bulb' | 'micrometer';
export interface ApparatusInfo {
  id: ApparatusId;
  label: string;
  /** Needed for which experiment (none: a distractor). */
  for: CircuitsTask[];
}
export const APPARATUS: ApparatusInfo[] = [
  { id: 'cell', label: 'Dry cell (1.5 V) in a holder', for: ['BRIDGE', 'EMF', 'SERIES'] },
  { id: 'key', label: 'Plug key', for: ['BRIDGE', 'EMF', 'SERIES'] },
  { id: 'wires', label: 'Connecting wires', for: ['BRIDGE', 'EMF', 'SERIES'] },
  { id: 'bridge', label: 'Metre bridge with jockey', for: ['BRIDGE'] },
  { id: 'galvanometer', label: 'Centre-zero galvanometer', for: ['BRIDGE'] },
  { id: 'rbox', label: 'Resistance box (0–20 Ω)', for: ['BRIDGE'] },
  { id: 'unknown', label: 'Unknown resistor X', for: ['BRIDGE'] },
  { id: 'ammeter', label: 'Ammeter (0–1 A)', for: ['EMF', 'SERIES'] },
  { id: 'voltmeter', label: 'Voltmeter (0–3 V)', for: ['EMF', 'SERIES'] },
  { id: 'rheostat', label: 'Rheostat (0–10 Ω)', for: ['EMF'] },
  { id: 'r1', label: 'Resistor R₁', for: ['SERIES'] },
  { id: 'r2', label: 'Resistor R₂', for: ['SERIES'] },
  { id: 'battery', label: 'Two 1.5 V cells in a holder', for: [] },
  { id: 'bulb', label: 'Torch bulb in a holder', for: [] },
  { id: 'micrometer', label: 'Micrometer screw gauge', for: [] },
];
export const APPARATUS_LABEL = Object.fromEntries(APPARATUS.map((a) => [a.id, a.label])) as Record<ApparatusId, string>;
export const needed = (task: CircuitsTask) => APPARATUS.filter((a) => a.for.includes(task));

/** The apparatus each terminal belongs to. */
export const TERMINAL_PART: Record<CircuitsTerminal, ApparatusId> = {
  'cell+': 'cell',
  'cell-': 'cell',
  'key-a': 'key',
  'key-b': 'key',
  'rh-a': 'rheostat',
  'rh-s': 'rheostat',
  'am+': 'ammeter',
  'am-': 'ammeter',
  'vm+': 'voltmeter',
  'vm-': 'voltmeter',
  'g-a': 'galvanometer',
  'g-b': 'galvanometer',
  'mb-a': 'bridge',
  'mb-d': 'bridge',
  'mb-c': 'bridge',
  'mb-j': 'bridge',
  'r1-a': 'r1',
  'r1-b': 'r1',
  'r2-a': 'r2',
  'r2-b': 'r2',
};

export interface SceneState {
  collected: Set<ApparatusId>;
  coat: boolean;
  /** Work started in the 2D lab: its apparatus is already on the board. */
  from2d: boolean;
  /** BRIDGE: X and the resistance box are in the bridge's gaps (both on the bench). */
  gapsFilled: boolean;
}

export function sceneFromState(s: PhyCircuitsState): SceneState {
  const { collected, coat } = collectedFromLog(s.log);
  const from2d = startedIn2d(s.log, /^(wire:|close-key|reading:)/);
  const set = collected as Set<ApparatusId>;
  if (from2d) for (const a of needed(s.task ?? 'BRIDGE')) set.add(a.id);
  return { collected: set, coat, from2d, gapsFilled: set.has('bridge') && set.has('unknown') && set.has('rbox') };
}

/** Can this terminal be used (its apparatus is on the bench)? */
export const terminalReady = (t: CircuitsTerminal, scene: SceneState) => scene.collected.has(TERMINAL_PART[t]);
