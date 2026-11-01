import type { DensityTask, PhyDensityState } from '@aischool/shared';
import { collectedFromLog, startedIn2d } from '../../phy-common/lab3d/common';

/**
 * What the 3D bench shows beyond the marked state (apparatus collected and set
 * out, the lab coat) is read back from the attempt's own action log, so a
 * reload or a switch between the 2D and 3D labs keeps the bench as it was.
 */

export type ApparatusId = 'vernier' | 'micrometer' | 'objects' | 'sbalance' | 'stone' | 'eureka' | 'catch' | 'salt' | 'tissue' | 'balance' | 'cylinder' | 'testtube' | 'shot' | 'bottle' | 'liquids' | 'dropper' | 'thermometer' | 'sand' | 'magnet' | 'prism';
export const APPARATUS: { id: ApparatusId; label: string }[] = [
  { id: 'vernier', label: 'Vernier calipers' },
  { id: 'micrometer', label: 'Micrometer screw gauge' },
  { id: 'objects', label: 'Objects to measure (cylinder, ball bearing, marble, wire) and a cloth' },
  { id: 'sbalance', label: 'Spring balance (0–10 N) and retort stand' },
  { id: 'stone', label: 'Stone tied with thread' },
  { id: 'eureka', label: 'Eureka (displacement) can' },
  { id: 'catch', label: 'Catch beaker' },
  { id: 'salt', label: 'Beaker of salt solution' },
  { id: 'tissue', label: 'Tissue paper' },
  { id: 'balance', label: 'Triple-beam balance' },
  { id: 'cylinder', label: 'Tall cylinder of water' },
  { id: 'testtube', label: 'Flat-bottomed tube with paper scale' },
  { id: 'shot', label: 'Lead shot (10 g scoops)' },
  { id: 'bottle', label: 'Density bottle (50 cm³) with stopper' },
  { id: 'liquids', label: 'Beakers of water and of the liquid (or sand)' },
  { id: 'dropper', label: 'Dropper' },
  { id: 'thermometer', label: 'Thermometer' },
  { id: 'sand', label: 'Dish of dry sand' },
  { id: 'magnet', label: 'Bar magnet' },
  { id: 'prism', label: 'Glass prism' },
];
export const APPARATUS_LABEL = Object.fromEntries(APPARATUS.map((a) => [a.id, a.label])) as Record<ApparatusId, string>;
export const NEEDED: Record<DensityTask, ApparatusId[]> = {
  CAL: ['vernier', 'micrometer', 'objects'],
  ARCH: ['sbalance', 'stone', 'eureka', 'catch', 'salt', 'tissue', 'balance'],
  FLOAT: ['vernier', 'balance', 'cylinder', 'testtube', 'shot'],
  BOTTLE: ['bottle', 'liquids', 'dropper', 'tissue', 'thermometer', 'balance'],
};
/** Grains also need the sand. */
export const neededFor = (s: PhyDensityState): ApparatusId[] => {
  const t = s.task ?? 'CAL';
  return t === 'BOTTLE' && s.sample === 'grains' ? [...NEEDED.BOTTLE, 'sand'] : NEEDED[t];
};
export const PLACEABLE: Record<DensityTask, ApparatusId[]> = { CAL: [], ARCH: ['sbalance', 'eureka'], FLOAT: ['cylinder'], BOTTLE: [] };
export const PLACE_LABEL: Partial<Record<ApparatusId, string>> = {
  sbalance: 'Clamp the spring balance to the stand',
  eureka: 'Stand the eureka can on its block, spout over the edge',
  cylinder: 'Stand the cylinder of water upright',
};

export interface SceneState {
  task: DensityTask;
  coat: boolean;
  collected: Set<ApparatusId>;
  placed: Set<ApparatusId>;
  ready: boolean;
  missing: ApparatusId[];
  set: boolean;
  nextPlace: ApparatusId | null;
}

export function sceneFromState(s: PhyDensityState): SceneState {
  const task = s.task ?? 'CAL';
  const { collected, coat } = collectedFromLog(s.log);
  const placed = new Set<ApparatusId>();
  for (const { a } of s.log) {
    const [verb, arg] = a.split(':') as [string, string | undefined];
    if (verb === 'place' && arg) placed.add(arg as ApparatusId);
    else if (verb === 'return' && arg) placed.delete(arg as ApparatusId);
  }
  const need = neededFor(s);
  if (startedIn2d(s.log, /^(tool:|hold:|read:|sb:|can:|float:|bottle:|weigh:|thermo:|pan:)/)) for (const id of need) collected.add(id), placed.add(id);
  for (const id of [...placed]) if (!collected.has(id as ApparatusId)) placed.delete(id);
  const missing = need.filter((id) => !collected.has(id));
  const toPlace = PLACEABLE[task].filter((id) => !placed.has(id));
  return { task, coat, collected: collected as Set<ApparatusId>, placed, ready: !missing.length, missing, set: !toPlace.length && !missing.length, nextPlace: toPlace[0] ?? null };
}
