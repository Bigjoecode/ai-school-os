import type { HeatTask, PhyHeatState } from '@aischool/shared';
import { collectedFromLog, startedIn2d } from '../../phy-common/lab3d/common';

/**
 * What the 3D bench shows beyond the marked state (apparatus collected, the
 * tripod and gauze over the Bunsen, the beaker of water on it, the
 * thermometers in place, the clamp stand, the lab coat and goggles) is read
 * back from the attempt's own action log, so a reload or a switch between the
 * 2D and 3D labs keeps the bench as it was. No marks.
 */

export type ApparatusId =
  | 'calorimeter'
  | 'lagging'
  | 'thermometer'
  | 'balance'
  | 'beaker'
  | 'tripod'
  | 'bunsen'
  | 'block'
  | 'tongs'
  | 'jug'
  | 'kettle'
  | 'ice'
  | 'blotting'
  | 'tube'
  | 'stand'
  | 'stopwatch'
  | 'spring'
  | 'lens';
export const APPARATUS: { id: ApparatusId; label: string }[] = [
  { id: 'calorimeter', label: 'Copper calorimeter, stirrer and lid' },
  { id: 'lagging', label: 'Lagging jacket (cotton wool in a box)' },
  { id: 'thermometer', label: 'Thermometers (0–110 °C)' },
  { id: 'balance', label: 'Beam balance' },
  { id: 'beaker', label: 'Beaker of water (250 cm³)' },
  { id: 'tripod', label: 'Tripod and wire gauze' },
  { id: 'bunsen', label: 'Bunsen burner' },
  { id: 'block', label: 'Metal block on a thread' },
  { id: 'tongs', label: 'Tongs' },
  { id: 'jug', label: 'Jug of tap water' },
  { id: 'kettle', label: 'Flask of warm water' },
  { id: 'ice', label: 'Beaker of melting ice' },
  { id: 'blotting', label: 'Blotting paper' },
  { id: 'tube', label: 'Boiling tube of naphthalene' },
  { id: 'stand', label: 'Clamp and stand' },
  { id: 'stopwatch', label: 'Stopwatch' },
  { id: 'spring', label: 'Spiral spring' },
  { id: 'lens', label: 'Converging lens' },
];
export const APPARATUS_LABEL = Object.fromEntries(APPARATUS.map((a) => [a.id, a.label])) as Record<ApparatusId, string>;
/** What each task needs on the bench. */
export const NEEDED: Record<HeatTask, ApparatusId[]> = {
  MIX: ['calorimeter', 'lagging', 'thermometer', 'balance', 'beaker', 'tripod', 'bunsen', 'block', 'tongs', 'jug'],
  LATENT: ['calorimeter', 'lagging', 'thermometer', 'balance', 'kettle', 'ice', 'blotting'],
  COOL: ['beaker', 'tripod', 'bunsen', 'tube', 'stand', 'stopwatch'],
};
/** The things set out in order. */
export const PLACEABLE: Record<HeatTask, ApparatusId[]> = { MIX: ['tripod', 'beaker', 'thermometer'], LATENT: ['thermometer'], COOL: ['tripod', 'beaker', 'stand'] };
export const PLACE_LABEL: Partial<Record<ApparatusId, string>> = {
  tripod: 'Stand the tripod and gauze over the Bunsen burner',
  beaker: 'Put the beaker of water on the gauze',
  thermometer: 'Put the thermometers in place',
  stand: 'Clamp the boiling tube on the stand',
};

export interface SceneState {
  task: HeatTask;
  coat: boolean;
  goggles: boolean;
  collected: Set<ApparatusId>;
  placed: Set<ApparatusId>;
  ready: boolean;
  missing: ApparatusId[];
  /** Everything is set out: the experiment can start. */
  set: boolean;
  nextPlace: ApparatusId | null;
}

export function sceneFromState(s: PhyHeatState): SceneState {
  const task = s.task ?? 'MIX';
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
  // Work done in the 2D lab first: the 3D bench is then set up already.
  if (startedIn2d(s.log, /^(bunsen:|lag:|fill:|warm:|weigh:|read:|tube:|block:|ice:)/)) for (const id of NEEDED[task]) collected.add(id), placed.add(id);
  for (const id of [...placed]) if (!collected.has(id)) placed.delete(id);
  if (!placed.has('tripod')) placed.delete('beaker');
  const missing = NEEDED[task].filter((id) => !collected.has(id));
  const toPlace = PLACEABLE[task].filter((id) => !placed.has(id));
  return { task, coat, goggles, collected: collected as Set<ApparatusId>, placed, ready: !missing.length, missing, set: !toPlace.length && !missing.length, nextPlace: toPlace[0] ?? null };
}
