import type { BioFoodState, FoodTask } from '@aischool/shared';

/**
 * What the 3D food-tests bench shows beyond the marked state (coat and
 * goggles on, apparatus collected, the Bunsen burner lit, hands washed) is
 * read back from the attempt's own action log, so a reload or a switch
 * between the 3D and the 2D lab keeps the bench as it was. These log entries
 * carry no marks.
 */

export type FoodApparatusId = 'rack' | 'holder' | 'burner' | 'paper' | 'cylinder' | 'tile' | 'thermometer' | 'stopwatch' | 'lens' | 'slides' | 'scalpel';
export interface FoodApparatusInfo {
  id: FoodApparatusId;
  label: string;
  /** Needed for these tasks. */
  for: FoodTask[];
}
export const FOOD_APPARATUS: FoodApparatusInfo[] = [
  { id: 'rack', label: 'Test tubes in a rack', for: ['FOOD', 'AMYLASE'] },
  { id: 'holder', label: 'Test-tube holder', for: ['FOOD', 'AMYLASE'] },
  { id: 'burner', label: 'Water bath: beaker, tripod, gauze and Bunsen burner', for: ['FOOD', 'AMYLASE'] },
  { id: 'paper', label: 'Filter paper', for: ['FOOD'] },
  { id: 'cylinder', label: '10 cm³ measuring cylinder', for: ['FOOD', 'AMYLASE'] },
  { id: 'tile', label: 'Spotting tile', for: ['AMYLASE'] },
  { id: 'thermometer', label: 'Thermometer', for: ['AMYLASE'] },
  { id: 'stopwatch', label: 'Stopwatch', for: ['AMYLASE'] },
  { id: 'lens', label: 'Hand lens', for: [] },
  { id: 'slides', label: 'Microscope slides', for: [] },
  { id: 'scalpel', label: 'Scalpel', for: [] },
];
export const FOOD_APPARATUS_LABEL = Object.fromEntries(FOOD_APPARATUS.map((a) => [a.id, a.label])) as Record<FoodApparatusId, string>;
export const neededFor = (task: FoodTask) => FOOD_APPARATUS.filter((a) => a.for.includes(task));

export interface FoodScene {
  coat: boolean;
  goggles: boolean;
  collected: Set<FoodApparatusId>;
  burnerOn: boolean;
  washed: boolean;
  /** Hands washed after the last test (the end of the practical). */
  washedAtEnd: boolean;
}

export function sceneFromState(s: BioFoodState): FoodScene {
  const out: FoodScene = { coat: false, goggles: false, collected: new Set(), burnerOn: false, washed: false, washedAtEnd: false };
  const task = s.task ?? 'FOOD';
  // Work started in the 2D lab (before anything was collected here): the apparatus is already on the bench and the burner lit.
  const firstCollect = s.log.findIndex((e) => e.a.startsWith('collect:'));
  const first2d = s.log.findIndex((e) => /^(test:|tile$|tube:)/.test(e.a));
  if (first2d >= 0 && (firstCollect < 0 || first2d < firstCollect)) {
    for (const a of neededFor(task)) out.collected.add(a.id);
    out.burnerOn = true;
  }
  let lastWork = -1;
  s.log.forEach(({ a }, i) => {
    const [verb, arg] = a.split(':') as [string, string | undefined];
    if (verb === 'safety' && arg === 'coat') out.coat = true;
    else if (verb === 'safety' && arg === 'goggles') out.goggles = true;
    else if (verb === 'safety-off' && arg === 'coat') out.coat = false;
    else if (verb === 'safety-off' && arg === 'goggles') out.goggles = false;
    else if (verb === 'collect' && arg) out.collected.add(arg as FoodApparatusId);
    else if (verb === 'return' && arg) {
      out.collected.delete(arg as FoodApparatusId);
      if (arg === 'burner') out.burnerOn = false;
    } else if (verb === 'burner-on') out.burnerOn = true;
    else if (verb === 'burner-off') out.burnerOn = false;
    else if (verb === 'wash-hands') {
      out.washed = true;
      out.washedAtEnd = lastWork >= 0;
    } else if (verb === 'task') Object.assign(out, { washedAtEnd: false });
    if (/^(test|step|heat|spot|mix|wait)/.test(verb)) {
      lastWork = i;
      out.washedAtEnd = false;
    }
  });
  return out;
}
