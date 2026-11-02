import type { PhyThermalState, ThermTask } from '@aischool/shared';
import { collectedFromLog, startedIn2d } from '../../phy-common/lab3d/common';

/**
 * What the 3D bench shows beyond the marked state (apparatus collected and set
 * out, the lab coat and goggles) is read back from the attempt's own action
 * log, so a reload or a switch between the 2D and 3D labs keeps the bench as
 * it was. No marks.
 */

export type ApparatusId =
  | 'jacket'
  | 'rod'
  | 'can'
  | 'bunsen'
  | 'tripod'
  | 'tubing'
  | 'thermometer'
  | 'rule'
  | 'beaker'
  | 'bigbeaker'
  | 'capillary'
  | 'stand'
  | 'stirrer'
  | 'ice'
  | 'calorimeter'
  | 'lagging'
  | 'heater'
  | 'supply'
  | 'ammeter'
  | 'voltmeter'
  | 'wires'
  | 'balance'
  | 'stopwatch'
  | 'jug'
  | 'spring'
  | 'lens';
export const APPARATUS: { id: ApparatusId; label: string }[] = [
  { id: 'jacket', label: 'Steam jacket with micrometer screw gauge' },
  { id: 'rod', label: 'Metal rod (about 60 cm)' },
  { id: 'can', label: 'Steam generator (can of water)' },
  { id: 'bunsen', label: 'Bunsen burner' },
  { id: 'tripod', label: 'Tripod and wire gauze' },
  { id: 'tubing', label: 'Rubber tubing' },
  { id: 'thermometer', label: 'Thermometer (0–110 °C)' },
  { id: 'rule', label: 'Metre rule' },
  { id: 'beaker', label: 'Beaker (for the steam outlet)' },
  { id: 'bigbeaker', label: 'Large beaker of water' },
  { id: 'capillary', label: 'Capillary tube (acid index) on a ruler' },
  { id: 'stand', label: 'Clamp and stand' },
  { id: 'stirrer', label: 'Stirrer' },
  { id: 'ice', label: 'Beaker of ice' },
  { id: 'calorimeter', label: 'Copper calorimeter, stirrer and lid' },
  { id: 'lagging', label: 'Lagging jacket (cotton wool)' },
  { id: 'heater', label: 'Immersion heater (12 V)' },
  { id: 'supply', label: '12 V d.c. supply' },
  { id: 'ammeter', label: 'Ammeter (0–3 A)' },
  { id: 'voltmeter', label: 'Voltmeter (0–15 V)' },
  { id: 'wires', label: 'Connecting wires' },
  { id: 'balance', label: 'Electronic balance' },
  { id: 'stopwatch', label: 'Stopwatch' },
  { id: 'jug', label: 'Jug of water' },
  { id: 'spring', label: 'Spiral spring' },
  { id: 'lens', label: 'Converging lens' },
];
export const APPARATUS_LABEL = Object.fromEntries(APPARATUS.map((a) => [a.id, a.label])) as Record<ApparatusId, string>;
/** What each task needs on the bench. */
export const NEEDED: Record<ThermTask, ApparatusId[]> = {
  EXPANSION: ['jacket', 'rod', 'can', 'bunsen', 'tripod', 'tubing', 'thermometer', 'rule', 'beaker'],
  CHARLES: ['bigbeaker', 'bunsen', 'tripod', 'capillary', 'stand', 'stirrer'],
  ELECTRIC: ['calorimeter', 'lagging', 'heater', 'supply', 'ammeter', 'voltmeter', 'wires', 'thermometer', 'balance', 'stopwatch', 'jug'],
};
/** The things set out, in order. */
export const PLACEABLE: Record<ThermTask, ApparatusId[]> = { EXPANSION: ['tripod', 'can', 'jacket', 'tubing', 'rod', 'thermometer'], CHARLES: ['tripod', 'bigbeaker', 'stand', 'capillary'], ELECTRIC: ['thermometer'] };
export const PLACE_LABEL: Partial<Record<ApparatusId, string>> = {
  tripod: 'Stand the tripod and gauze over the Bunsen burner',
  can: 'Put the steam can on the gauze',
  jacket: 'Set the steam jacket on the bench, outlet over the beaker',
  tubing: 'Join the can to the jacket with the rubber tubing',
  rod: 'Slide the rod into the jacket, one end against the stop',
  thermometer: 'Put the thermometer in place',
  bigbeaker: 'Put the large beaker of water on the gauze',
  stand: 'Stand the clamp stand behind the beaker',
  capillary: 'Clamp the ruler with the tube and thermometer above the water',
};

export interface SceneState {
  task: ThermTask;
  coat: boolean;
  goggles: boolean;
  collected: Set<ApparatusId>;
  placed: Set<ApparatusId>;
  ready: boolean;
  missing: ApparatusId[];
  set: boolean;
  nextPlace: ApparatusId | null;
}

export function sceneFromState(s: PhyThermalState): SceneState {
  const task = s.task ?? 'EXPANSION';
  const { collected, coat } = collectedFromLog(s.log);
  let goggles = false;
  const placed = new Set<ApparatusId>();
  for (const { a } of s.log) {
    const [verb, arg] = a.split(':') as [string, string | undefined];
    if (verb === 'place' && arg) placed.add(arg as ApparatusId);
    else if (verb === 'return' && arg) placed.delete(arg as ApparatusId);
    else if (verb === 'safety' && arg === 'goggles') goggles = true;
    else if (verb === 'safety-off' && arg === 'goggles') goggles = false;
  }
  if (startedIn2d(s.log, /^(boiler:|micro:|bunsen:|immerse:|pour|pan:|lag:|heater:|wire:|switch|read:)/)) for (const id of NEEDED[task]) collected.add(id), placed.add(id);
  for (const id of [...placed]) if (!collected.has(id)) placed.delete(id);
  if (!placed.has('tripod')) placed.delete('can'), placed.delete('bigbeaker');
  const missing = NEEDED[task].filter((id) => !collected.has(id));
  const toPlace = PLACEABLE[task].filter((id) => !placed.has(id));
  return { task, coat, goggles, collected: collected as Set<ApparatusId>, placed, ready: !missing.length, missing, set: !toPlace.length && !missing.length, nextPlace: toPlace[0] ?? null };
}
