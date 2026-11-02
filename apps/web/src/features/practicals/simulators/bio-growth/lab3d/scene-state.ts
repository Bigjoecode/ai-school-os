import type { BioGrowthState, GrowthTask } from '@aischool/shared';

/**
 * What the 3D growth bench shows beyond the marked state (coat and goggles
 * on, apparatus collected, hands washed) is read back from the attempt's own
 * action log, so a reload or a switch between the 3D and the 2D lab keeps the
 * bench as it was. These log entries carry no marks.
 */

export type GrowthApparatusId =
  | 'rack'
  | 'cotton'
  | 'oil'
  | 'boiled'
  | 'labels'
  | 'washbottle'
  | 'box'
  | 'jar'
  | 'ruler'
  | 'lens'
  | 'flasks'
  | 'thermometers'
  | 'disinfectant'
  | 'boiler'
  | 'conical'
  | 'limewater'
  | 'lightbox'
  | 'lamp'
  | 'klinostat'
  | 'corkjar'
  | 'protractor'
  | 'tape';
export interface GrowthApparatusInfo {
  id: GrowthApparatusId;
  label: string;
  for: GrowthTask[];
}
export const GROWTH_APPARATUS: GrowthApparatusInfo[] = [
  { id: 'rack', label: 'Four test tubes with stoppers in a rack', for: ['GERM'] },
  { id: 'cotton', label: 'Cotton wool', for: ['GERM', 'RESP'] },
  { id: 'boiled', label: 'Flask of boiled, cooled water', for: ['GERM'] },
  { id: 'oil', label: 'Bottle of oil', for: ['GERM'] },
  { id: 'labels', label: 'Labels and a marker', for: ['GERM'] },
  { id: 'washbottle', label: 'Wash bottle of water', for: ['GERM', 'SEEDLING', 'TROPISM'] },
  { id: 'box', label: 'Box of moist sawdust', for: ['SEEDLING'] },
  { id: 'jar', label: 'Gas jar lined with blotting paper (seed jar)', for: ['SEEDLING'] },
  { id: 'ruler', label: '30 cm ruler', for: ['SEEDLING'] },
  { id: 'lens', label: 'Hand lens', for: ['SEEDLING'] },
  { id: 'flasks', label: 'Two vacuum flasks in clamps (A and B)', for: ['RESP'] },
  { id: 'thermometers', label: 'Two thermometers', for: ['RESP'] },
  { id: 'disinfectant', label: 'Dilute disinfectant (1% hypochlorite)', for: ['RESP'] },
  { id: 'boiler', label: 'Beaker of water on a tripod with a Bunsen burner', for: ['RESP'] },
  { id: 'conical', label: 'Conical flask with stopper and delivery tube', for: ['RESP'] },
  { id: 'limewater', label: 'Test tubes of lime water and hydrogencarbonate indicator', for: ['RESP'] },
  { id: 'lightbox', label: 'Light-proof box with a slit', for: ['TROPISM'] },
  { id: 'lamp', label: 'Bench lamp', for: ['TROPISM'] },
  { id: 'klinostat', label: 'Clinostat (two spindles)', for: ['TROPISM'] },
  { id: 'corkjar', label: 'Cork in a gas jar, pins and cotton wool', for: ['TROPISM'] },
  { id: 'protractor', label: 'Protractor', for: ['TROPISM'] },
  { id: 'tape', label: 'Black tape', for: ['TROPISM'] },
];
export const GROWTH_APPARATUS_LABEL = Object.fromEntries(GROWTH_APPARATUS.map((a) => [a.id, a.label])) as Record<GrowthApparatusId, string>;
export const neededFor = (task: GrowthTask) => GROWTH_APPARATUS.filter((a) => a.for.includes(task) && a.id !== 'lens');
/** The apparatus each task works with on the bench (the rest go to the side). */
export const usedBy = (task: GrowthTask): GrowthApparatusId[] => GROWTH_APPARATUS.filter((a) => a.for.includes(task)).map((a) => a.id);

export interface GrowthScene {
  coat: boolean;
  goggles: boolean;
  collected: Set<GrowthApparatusId>;
  washed: boolean;
  /** Hands washed after the last piece of work (the end of the practical). */
  washedAtEnd: boolean;
}

const WORK = /^(batch|cotton#|water#|oil#|fridge#|sow|empty#|label#|wait|look|soak|measure|draw|boil|disinfect|fill|thermo|plug|invert|read#|co2|box|slit|tape|lamp|ctrl|pin|moisten|klino|count)/;

export function sceneFromState(s: BioGrowthState): GrowthScene {
  const out: GrowthScene = { coat: false, goggles: false, collected: new Set(), washed: false, washedAtEnd: false };
  const task = s.task ?? 'GERM';
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
    else if (verb === 'collect' && arg) out.collected.add(arg as GrowthApparatusId);
    else if (verb === 'return' && arg) out.collected.delete(arg as GrowthApparatusId);
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
