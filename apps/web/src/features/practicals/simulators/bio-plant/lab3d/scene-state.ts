import type { BioPlantState, PlantTask } from '@aischool/shared';

/**
 * What the 3D plant bench shows beyond the marked state (coat and goggles on,
 * apparatus collected, hands washed) is read back from the attempt's own
 * action log, so a reload or a switch between the 3D and the 2D lab keeps the
 * bench as it was. These log entries carry no marks.
 */

export type PlantApparatusId = 'potometer' | 'bowl' | 'blade' | 'vaseline' | 'fan' | 'lamp' | 'bags' | 'clock' | 'beaker' | 'funnel' | 'tube' | 'rule' | 'trough' | 'thermometer' | 'splint' | 'bath' | 'tubes' | 'forceps' | 'tile' | 'foil' | 'flask' | 'grid' | 'lens';
export interface PlantApparatusInfo {
  id: PlantApparatusId;
  label: string;
  for: PlantTask[];
}
export const PLANT_APPARATUS: PlantApparatusInfo[] = [
  { id: 'potometer', label: 'Bubble potometer (capillary, scale, reservoir)', for: ['POTOMETER'] },
  { id: 'bowl', label: 'Bowl of water', for: ['POTOMETER'] },
  { id: 'blade', label: 'Razor blade (scalpel)', for: ['POTOMETER'] },
  { id: 'vaseline', label: 'Vaseline', for: ['POTOMETER'] },
  { id: 'fan', label: 'Electric fan', for: ['POTOMETER'] },
  { id: 'lamp', label: 'Bench lamp', for: ['POTOMETER', 'OXYGEN'] },
  { id: 'bags', label: 'Black bag and clear polythene bag', for: ['POTOMETER'] },
  { id: 'clock', label: 'Stopwatch', for: ['POTOMETER', 'OXYGEN'] },
  { id: 'beaker', label: 'Large beaker of water', for: ['OXYGEN'] },
  { id: 'funnel', label: 'Glass funnel', for: ['OXYGEN'] },
  { id: 'tube', label: 'Test tube', for: ['OXYGEN'] },
  { id: 'rule', label: 'Metre rule', for: ['OXYGEN'] },
  { id: 'trough', label: 'Water trough (heat filter)', for: ['OXYGEN'] },
  { id: 'thermometer', label: 'Thermometer', for: ['OXYGEN'] },
  { id: 'splint', label: 'Wooden splints', for: ['OXYGEN'] },
  { id: 'bath', label: 'Water bath: beaker, tripod, gauze and Bunsen burner', for: ['STARCH'] },
  { id: 'tubes', label: 'Boiling tubes in a rack', for: ['STARCH'] },
  { id: 'forceps', label: 'Forceps', for: ['STARCH'] },
  { id: 'tile', label: 'White tile', for: ['STARCH'] },
  { id: 'foil', label: 'Aluminium foil', for: ['STARCH'] },
  { id: 'flask', label: 'Flask with potassium hydroxide', for: ['STARCH'] },
  { id: 'grid', label: '1 cm² grid paper', for: ['STARCH'] },
  { id: 'lens', label: 'Hand lens', for: [] },
];
export const PLANT_APPARATUS_LABEL = Object.fromEntries(PLANT_APPARATUS.map((a) => [a.id, a.label])) as Record<PlantApparatusId, string>;
export const neededFor = (task: PlantTask) => PLANT_APPARATUS.filter((a) => a.for.includes(task));
/** The apparatus each task works with on the bench (the rest go to the side). */
export const usedBy = (task: PlantTask): PlantApparatusId[] => neededFor(task).map((a) => a.id);

export interface PlantScene {
  coat: boolean;
  goggles: boolean;
  collected: Set<PlantApparatusId>;
  washed: boolean;
  /** Hands washed after the last piece of work (the end of the practical). */
  washedAtEnd: boolean;
}

const WORK = /^(cut|fit|seal|bubble|cond|wait|reset|time|nahco3|plant|tube|shield|dark|lamp|count|temp|splint|foil|koh|light|pick|draw|flame|boil|ethanol|eth-direct|soften|tile|iodine|grid)/;

export function sceneFromState(s: BioPlantState): PlantScene {
  const out: PlantScene = { coat: false, goggles: false, collected: new Set(), washed: false, washedAtEnd: false };
  const task = s.task ?? 'POTOMETER';
  // Work started in the 2D lab (before anything was collected here): the apparatus is already on the bench.
  const firstCollect = s.log.findIndex((e) => e.a.startsWith('collect:'));
  const first2d = s.log.findIndex((e) => WORK.test(e.a));
  if (first2d >= 0 && (firstCollect < 0 || first2d < firstCollect)) for (const a of neededFor(task)) out.collected.add(a.id);
  let lastWork = -1;
  s.log.forEach(({ a }, i) => {
    const [verb, arg] = a.split(':') as [string, string | undefined];
    if (verb === 'safety' && arg === 'coat') out.coat = true;
    else if (verb === 'safety' && arg === 'goggles') out.goggles = true;
    else if (verb === 'safety-off' && arg === 'coat') out.coat = false;
    else if (verb === 'safety-off' && arg === 'goggles') out.goggles = false;
    else if (verb === 'collect' && arg) out.collected.add(arg as PlantApparatusId);
    else if (verb === 'return' && arg) out.collected.delete(arg as PlantApparatusId);
    else if (verb === 'wash-hands') {
      out.washed = true;
      out.washedAtEnd = lastWork >= 0;
    }
    if (WORK.test(a) && !a.startsWith('task:')) {
      lastWork = i;
      out.washedAtEnd = false;
    }
  });
  return out;
}
