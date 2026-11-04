import type { BioGeneticsState, GenTask } from '@aischool/shared';

/**
 * What the 3D bench shows beyond the marked state (coat on, apparatus
 * collected, hands washed) is read back from the attempt's own action log, so
 * a reload or a switch between the 3D and the 2D lab keeps the bench as it
 * was. These log entries carry no marks.
 */

export type GenApparatusId = 'board' | 'setsquare' | 'ruler' | 'tape' | 'graph' | 'mirror' | 'cards' | 'sheet' | 'protractor' | 'beakers' | 'beads' | 'tray' | 'notes' | 'net' | 'pooter' | 'lens' | 'gloves' | 'idchart';
export interface GenApparatusInfo {
  id: GenApparatusId;
  label: string;
  for: GenTask[];
}
export const GEN_APPARATUS: GenApparatusInfo[] = [
  { id: 'board', label: 'Height board (metre rule on a stand)', for: ['HEIGHT'] },
  { id: 'setsquare', label: 'Set square', for: ['HEIGHT'] },
  { id: 'ruler', label: 'Ruler (30 cm)', for: ['HEIGHT'] },
  { id: 'tape', label: 'Measuring tape', for: [] },
  { id: 'graph', label: 'Graph paper', for: ['HEIGHT', 'DISCRETE', 'FOOD'] },
  { id: 'mirror', label: 'Hand mirror', for: ['DISCRETE'] },
  { id: 'cards', label: 'Box of school health cards', for: ['DISCRETE'] },
  { id: 'sheet', label: 'Survey / tally sheet', for: ['DISCRETE', 'CROSS'] },
  { id: 'protractor', label: 'Protractor', for: ['DISCRETE'] },
  { id: 'beakers', label: 'Two beakers', for: ['CROSS'] },
  { id: 'beads', label: 'Red and white beads (100 of each)', for: ['CROSS'] },
  { id: 'tray', label: 'Small tray', for: ['CROSS'] },
  { id: 'notes', label: 'Field notes (seven spots)', for: ['FOOD'] },
  { id: 'net', label: 'Sweep net', for: ['FOOD'] },
  { id: 'pooter', label: 'Pooter', for: [] },
  { id: 'lens', label: 'Hand lens', for: ['FOOD'] },
  { id: 'gloves', label: 'Gloves', for: ['FOOD'] },
  { id: 'idchart', label: 'Identification chart', for: ['FOOD'] },
];
export const GEN_APPARATUS_LABEL = Object.fromEntries(GEN_APPARATUS.map((a) => [a.id, a.label])) as Record<GenApparatusId, string>;
export const neededFor = (task: GenTask) => GEN_APPARATUS.filter((a) => a.for.includes(task));

export interface GenScene {
  coat: boolean;
  goggles: boolean;
  collected: Set<GenApparatusId>;
  washed: boolean;
  washedAtEnd: boolean;
}

export const WORK = /^(call|shoes|square|spread|measure|declined|record|roll|card|fill|blind|back|draw|gloves|survey)/;

export function sceneFromState(s: BioGeneticsState): GenScene {
  const out: GenScene = { coat: false, goggles: false, collected: new Set(), washed: false, washedAtEnd: false };
  const task = s.task ?? 'HEIGHT';
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
    else if (verb === 'collect' && arg) out.collected.add(arg as GenApparatusId);
    else if (verb === 'return' && arg) out.collected.delete(arg as GenApparatusId);
    else if (verb === 'wash-hands') {
      out.washed = true;
      out.washedAtEnd = lastWork >= 0;
    }
    if (WORK.test(a)) {
      lastWork = i;
      out.washedAtEnd = false;
    }
  });
  return out;
}
