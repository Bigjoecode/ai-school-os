import type { MagTask, PhyMagnetismState } from '@aischool/shared';
import { collectedFromLog, startedIn2d } from '../../phy-common/lab3d/common';

/**
 * What the 3D bench shows beyond the marked state (apparatus collected, the
 * rig set out, the lab coat) is read back from the attempt's own action log,
 * so a reload or a switch between the 2D and 3D labs keeps the bench as it
 * was. No marks.
 */

export type ApparatusId =
  | 'board'
  | 'paper'
  | 'magnet'
  | 'compass'
  | 'pencil'
  | 'rule'
  | 'filings'
  | 'cells'
  | 'key'
  | 'rheostat'
  | 'ammeter'
  | 'nail'
  | 'steelrod'
  | 'clips'
  | 'coil200'
  | 'coil600'
  | 'galvo'
  | 'magnets'
  | 'leads'
  | 'pot'
  | 'resistor'
  | 'diode'
  | 'mamm'
  | 'vmeter'
  | 'spring'
  | 'pendulum';
export const APPARATUS: { id: ApparatusId; label: string }[] = [
  { id: 'board', label: 'Drawing board' },
  { id: 'paper', label: 'White paper and pins' },
  { id: 'magnet', label: 'Bar magnets (a pair)' },
  { id: 'compass', label: 'Plotting compasses (small and large)' },
  { id: 'pencil', label: 'Sharp pencil' },
  { id: 'rule', label: 'Ruler (30 cm)' },
  { id: 'filings', label: 'Iron filings shaker' },
  { id: 'cells', label: 'Dry cells in a holder' },
  { id: 'key', label: 'Plug key' },
  { id: 'rheostat', label: 'Rheostat' },
  { id: 'ammeter', label: 'Ammeter (0–3 A)' },
  { id: 'nail', label: 'Large iron nail and insulated wire' },
  { id: 'steelrod', label: 'Steel rod' },
  { id: 'clips', label: 'Steel paper clips (dish)' },
  { id: 'coil200', label: 'Coil of 200 turns' },
  { id: 'coil600', label: 'Coil of 600 turns' },
  { id: 'galvo', label: 'Centre-zero galvanometer' },
  { id: 'magnets', label: 'Two bar magnets' },
  { id: 'leads', label: 'Connecting wires' },
  { id: 'pot', label: 'Potentiometer' },
  { id: 'resistor', label: 'Protective resistor (100 Ω)' },
  { id: 'diode', label: 'Silicon diode (1N4001)' },
  { id: 'mamm', label: 'Milliammeter (0–50 mA)' },
  { id: 'vmeter', label: 'Voltmeter (0–1 V, 0–10 V)' },
  { id: 'spring', label: 'Spiral spring' },
  { id: 'pendulum', label: 'Pendulum bob' },
];
export const APPARATUS_LABEL = Object.fromEntries(APPARATUS.map((a) => [a.id, a.label])) as Record<ApparatusId, string>;
export const NEEDED: Record<MagTask, ApparatusId[]> = {
  FIELD: ['board', 'paper', 'magnet', 'compass', 'pencil', 'rule'],
  ELECTROMAGNET: ['cells', 'key', 'rheostat', 'ammeter', 'nail', 'clips'],
  INDUCTION: ['coil200', 'coil600', 'galvo', 'magnets', 'leads'],
  DIODE: ['cells', 'pot', 'key', 'resistor', 'diode', 'mamm', 'vmeter', 'leads'],
};
export const IN_CUPBOARD: Record<MagTask, ApparatusId[]> = {
  FIELD: [...NEEDED.FIELD, 'filings', 'spring'],
  ELECTROMAGNET: [...NEEDED.ELECTROMAGNET, 'steelrod', 'pendulum'],
  INDUCTION: [...NEEDED.INDUCTION, 'spring'],
  DIODE: [...NEEDED.DIODE, 'pendulum'],
};
export const PLACEABLE: Record<MagTask, ApparatusId[]> = {
  FIELD: ['board', 'paper', 'magnet'],
  ELECTROMAGNET: ['cells', 'key', 'rheostat', 'ammeter', 'nail'],
  INDUCTION: ['coil200', 'galvo', 'leads'],
  DIODE: ['cells', 'pot', 'resistor', 'diode', 'mamm', 'vmeter', 'leads'],
};
export const PLACE_LABEL: Partial<Record<ApparatusId, string>> = {
  board: 'Lay the drawing board flat',
  paper: 'Pin the paper to the board',
  magnet: 'Put the magnet in the middle of the paper',
  cells: 'Put the cells on the bench',
  key: 'Put the key beside them',
  rheostat: 'Put the rheostat in line',
  ammeter: 'Stand the ammeter in line',
  nail: 'Clamp the nail over the clips and connect the coil',
  coil200: 'Lay the 200-turn coil on the bench',
  galvo: 'Stand the galvanometer up',
  leads: 'Connect the circuit',
  pot: 'Put the potentiometer across the cells',
  resistor: 'Put in the protective resistor',
  diode: 'Put in the diode',
  mamm: 'Put the milliammeter in series',
  vmeter: 'Put the voltmeter across the diode',
};

export interface SceneState {
  task: MagTask;
  coat: boolean;
  collected: Set<ApparatusId>;
  placed: Set<ApparatusId>;
  ready: boolean;
  missing: ApparatusId[];
  set: boolean;
  nextPlace: ApparatusId | null;
}

const WORK = /^(meridian|clear-steel|line|dot|neutral|wind|lift|key|move|read)/;
export function sceneFromState(s: PhyMagnetismState): SceneState {
  const task = s.task ?? 'FIELD';
  const { collected, coat } = collectedFromLog(s.log);
  const placed = new Set<ApparatusId>();
  for (const { a } of s.log) {
    const [verb, arg] = a.split(':') as [string, string | undefined];
    if (verb === 'place' && arg) placed.add(arg as ApparatusId);
    else if (verb === 'return' && arg) placed.delete(arg as ApparatusId);
  }
  if (startedIn2d(s.log, WORK)) for (const id of NEEDED[task]) collected.add(id), placed.add(id);
  const missing = NEEDED[task].filter((id) => !collected.has(id));
  for (const id of [...placed]) if (!collected.has(id)) placed.delete(id);
  const order = PLACEABLE[task];
  for (let i = 1; i < order.length; i++) if (!placed.has(order[i - 1]!)) for (const later of order.slice(i)) placed.delete(later);
  const toPlace = order.filter((id) => !placed.has(id));
  return { task, coat, collected: collected as Set<ApparatusId>, placed, ready: !missing.length, missing, set: !missing.length && toPlace.length === 0, nextPlace: toPlace[0] ?? null };
}
