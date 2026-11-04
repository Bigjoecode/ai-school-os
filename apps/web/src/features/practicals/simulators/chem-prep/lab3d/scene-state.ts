import type { ChemPrepState, PrepTask } from '@aischool/shared';

/**
 * What the 3D bench shows beyond the marked state (coat and goggles, the
 * apparatus collected) is read back from the attempt's own action log, so a
 * reload or a switch between 3D and 2D keeps the bench as it was. These log
 * entries carry no marks.
 */

export type PrepApparatusId = 'balance' | 'bottle' | 'beaker' | 'funnel' | 'washBottle' | 'flasks' | 'pipette' | 'rack' | 'tile' | 'baths' | 'dishKit' | 'still' | 'gasKit' | 'dryers' | 'jars' | 'fountainKit' | 'burette' | 'cylinder';
export interface PrepApparatusInfo {
  id: PrepApparatusId;
  label: string;
  for: PrepTask[];
}
export const PREP_APPARATUS: PrepApparatusInfo[] = [
  { id: 'balance', label: 'Electronic balance (0.01 g)', for: ['STANDARD', 'DISTIL', 'AMMONIA'] },
  { id: 'bottle', label: 'Weighing bottle and spatula', for: ['STANDARD'] },
  { id: 'beaker', label: '100 cm³ beaker and glass rod', for: ['STANDARD'] },
  { id: 'funnel', label: 'Filter funnel (and filter paper)', for: ['STANDARD', 'DISTIL'] },
  { id: 'washBottle', label: 'Wash bottle and dropper', for: ['STANDARD'] },
  { id: 'flasks', label: 'Two 250 cm³ volumetric flasks with stoppers', for: ['STANDARD'] },
  { id: 'pipette', label: '25.0 cm³ pipette with filler', for: ['STANDARD'] },
  { id: 'rack', label: 'Test tubes in a rack', for: ['LECHAT', 'HALOGEN'] },
  { id: 'tile', label: 'White tile', for: ['LECHAT', 'HALOGEN'] },
  { id: 'baths', label: 'Beakers of hot water and iced water', for: ['LECHAT'] },
  { id: 'dishKit', label: 'Evaporating dish, tripod, gauze, burner and water bath', for: ['DISTIL'] },
  { id: 'still', label: 'Distillation flask, thermometer, Liebig condenser and receiver', for: ['DISTIL'] },
  { id: 'gasKit', label: 'Hard-glass tube with bung and delivery tube, clamp stand and burner', for: ['AMMONIA'] },
  { id: 'dryers', label: 'Drying agents: quicklime tower, conc. H₂SO₄, CaCl₂', for: ['AMMONIA'] },
  { id: 'jars', label: 'Gas jars, litmus paper and conc. HCl rod', for: ['AMMONIA'] },
  { id: 'fountainKit', label: 'Fountain flask, jet tube and trough', for: ['AMMONIA'] },
  { id: 'burette', label: 'Burette', for: [] },
  { id: 'cylinder', label: 'Measuring cylinder', for: [] },
];
export const PREP_APPARATUS_LABEL = Object.fromEntries(PREP_APPARATUS.map((a) => [a.id, a.label])) as Record<PrepApparatusId, string>;
export const neededFor = (task: PrepTask) => PREP_APPARATUS.filter((a) => a.for.includes(task));

/** The apparatus an object on the bench needs (objects not listed are always on the bench). */
export const OBJ_NEEDS: Record<string, PrepApparatusId> = {
  bottle: 'bottle',
  balance: 'balance',
  beaker: 'beaker',
  flask: 'flasks',
  flask2: 'flasks',
  pipette: 'pipette',
  rack: 'rack',
  tube: 'rack',
  hot: 'baths',
  ice: 'baths',
  funnel: 'funnel',
  dish: 'dishKit',
  dflask: 'still',
  thermometer: 'still',
  condenser: 'still',
  receiver: 'still',
  gtube: 'gasKit',
  dryer: 'dryers',
  jar: 'jars',
  trough: 'fountainKit',
};

export interface PrepScene {
  coat: boolean;
  goggles: boolean;
  collected: Set<PrepApparatusId>;
}

export function prepSceneFromState(s: ChemPrepState): PrepScene {
  const out: PrepScene = { coat: false, goggles: false, collected: new Set() };
  const task = s.task ?? 'STANDARD';
  // Work started in the 2D lab (before anything was collected here): the apparatus is already on the bench.
  const firstCollect = s.log.findIndex((e) => e.a.startsWith('collect:'));
  const first2d = s.log.findIndex((e) => e.a.startsWith('ev:'));
  if (first2d >= 0 && (firstCollect < 0 || first2d < firstCollect)) for (const a of neededFor(task)) out.collected.add(a.id);
  for (const { a } of s.log) {
    const [verb, arg] = a.split(':') as [string, string | undefined];
    if (verb === 'safety' && arg === 'coat') out.coat = true;
    else if (verb === 'safety' && arg === 'goggles') out.goggles = true;
    else if (verb === 'safety-off' && arg === 'coat') out.coat = false;
    else if (verb === 'safety-off' && arg === 'goggles') out.goggles = false;
    else if (verb === 'collect' && arg) out.collected.add(arg as PrepApparatusId);
    else if (verb === 'return' && arg) out.collected.delete(arg as PrepApparatusId);
  }
  return out;
}
