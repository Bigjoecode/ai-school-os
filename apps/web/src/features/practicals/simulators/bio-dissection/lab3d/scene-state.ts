import type { BioDissectionState, DissectTask } from '@aischool/shared';

/**
 * What the 3D dissection bench shows beyond the marked state (coat and
 * goggles on, apparatus collected, hands washed) is read back from the
 * attempt's own action log, so a reload or a switch between the 3D and the 2D
 * lab keeps the bench as it was. These log entries carry no marks.
 */

export type DissectApparatusId =
  | 'eosin'
  | 'bowl'
  | 'tile'
  | 'razor'
  | 'lens'
  | 'microscope'
  | 'stopwatch'
  | 'ruler'
  | 'kit'
  | 'thread'
  | 'washbottle'
  | 'disinfectant'
  | 'plates'
  | 'marker'
  | 'tape'
  | 'incubator'
  | 'bread'
  | 'bags';
export interface DissectApparatusInfo {
  id: DissectApparatusId;
  label: string;
  for: DissectTask[];
}
export const DISSECT_APPARATUS: DissectApparatusInfo[] = [
  { id: 'eosin', label: 'Beaker of eosin solution', for: ['EOSIN'] },
  { id: 'bowl', label: 'Bowl of water (for washing the roots)', for: ['EOSIN'] },
  { id: 'tile', label: 'White tile', for: ['EOSIN'] },
  { id: 'razor', label: 'Razor blade', for: ['EOSIN'] },
  { id: 'lens', label: 'Hand lens', for: ['EOSIN', 'MICROBE'] },
  { id: 'microscope', label: 'Microscope', for: ['EOSIN', 'MICROBE'] },
  { id: 'stopwatch', label: 'Stopwatch', for: ['EOSIN'] },
  { id: 'ruler', label: '30 cm ruler', for: ['EOSIN', 'RAT'] },
  { id: 'kit', label: 'Dissecting kit (scalpel, scissors, forceps, seeker)', for: ['RAT'] },
  { id: 'thread', label: 'Reel of thread', for: ['RAT'] },
  { id: 'washbottle', label: 'Wash bottle of water', for: ['RAT'] },
  { id: 'disinfectant', label: 'Disinfectant', for: ['RAT', 'MICROBE'] },
  { id: 'plates', label: 'Four sterile nutrient agar plates', for: ['MICROBE'] },
  { id: 'marker', label: 'Marker pen', for: ['MICROBE'] },
  { id: 'tape', label: 'Adhesive tape', for: ['MICROBE'] },
  { id: 'incubator', label: 'Incubator', for: ['MICROBE'] },
  { id: 'bread', label: 'Bread (three slices)', for: ['MICROBE'] },
  { id: 'bags', label: 'Polythene bags', for: ['MICROBE'] },
];
export const DISSECT_APPARATUS_LABEL = Object.fromEntries(DISSECT_APPARATUS.map((a) => [a.id, a.label])) as Record<DissectApparatusId, string>;
export const neededFor = (task: DissectTask) => DISSECT_APPARATUS.filter((a) => a.for.includes(task));
export const usedBy = (task: DissectTask): DissectApparatusId[] => neededFor(task).map((a) => a.id);

export interface DissectScene {
  coat: boolean;
  goggles: boolean;
  collected: Set<DissectApparatusId>;
  washed: boolean;
  /** Hands washed after the last piece of work (the end of the practical). */
  washedAtEnd: boolean;
}

const WORK = /^(wash:|dye|place|wait|read|leaves|cut|view|gloves|pin|unpin|skin|pinskin|wall|ribs|moisten|display|unravel|measure|clean|wipe|label#|expose#|touch#|soap|tape|invert|incubate|bread|slice#|count|lens|slide|open-plate|dispose)/;

export function sceneFromState(s: BioDissectionState): DissectScene {
  const out: DissectScene = { coat: false, goggles: false, collected: new Set(), washed: false, washedAtEnd: false };
  const task = s.task ?? 'EOSIN';
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
    else if (verb === 'collect' && arg) out.collected.add(arg as DissectApparatusId);
    else if (verb === 'return' && arg) out.collected.delete(arg as DissectApparatusId);
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
