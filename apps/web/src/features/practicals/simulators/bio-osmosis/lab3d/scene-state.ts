import type { BioOsmosisState, OsmoTask } from '@aischool/shared';

/**
 * What the 3D osmosis bench shows beyond the marked state (coat and goggles
 * on, apparatus collected, hands washed) is read back from the attempt's own
 * action log, so a reload or a switch between the 3D and the 2D lab keeps the
 * bench as it was. These log entries carry no marks.
 */

export type OsmoApparatusId = 'borer' | 'scalpel' | 'tile' | 'ruler' | 'balance' | 'paper' | 'forceps' | 'beakers' | 'clock' | 'microscope' | 'slides' | 'needle' | 'beaker' | 'lens' | 'thermometer';
export interface OsmoApparatusInfo {
  id: OsmoApparatusId;
  label: string;
  for: OsmoTask[];
}
export const OSMO_APPARATUS: OsmoApparatusInfo[] = [
  { id: 'borer', label: 'Cork borer', for: ['POTATO'] },
  { id: 'scalpel', label: 'Scalpel', for: ['POTATO', 'AGAR'] },
  { id: 'tile', label: 'White tile', for: ['POTATO', 'PLASMOLYSIS', 'AGAR'] },
  { id: 'ruler', label: 'Ruler (mm)', for: ['POTATO', 'AGAR'] },
  { id: 'balance', label: 'Electronic balance (0.01 g)', for: ['POTATO'] },
  { id: 'paper', label: 'Filter paper', for: ['POTATO', 'PLASMOLYSIS'] },
  { id: 'forceps', label: 'Forceps', for: ['POTATO', 'PLASMOLYSIS', 'AGAR'] },
  { id: 'beakers', label: 'Labelled beakers for the solutions', for: ['POTATO'] },
  { id: 'clock', label: 'Stopwatch (or clock)', for: ['POTATO', 'AGAR'] },
  { id: 'microscope', label: 'Microscope', for: ['PLASMOLYSIS'] },
  { id: 'slides', label: 'Slides and cover slips', for: ['PLASMOLYSIS'] },
  { id: 'needle', label: 'Mounted needle', for: ['PLASMOLYSIS'] },
  { id: 'beaker', label: '400 cm³ beaker', for: ['AGAR'] },
  { id: 'lens', label: 'Hand lens', for: [] },
  { id: 'thermometer', label: 'Thermometer', for: [] },
];
export const OSMO_APPARATUS_LABEL = Object.fromEntries(OSMO_APPARATUS.map((a) => [a.id, a.label])) as Record<OsmoApparatusId, string>;
export const neededFor = (task: OsmoTask) => OSMO_APPARATUS.filter((a) => a.for.includes(task));

export interface OsmoScene {
  coat: boolean;
  goggles: boolean;
  collected: Set<OsmoApparatusId>;
  washed: boolean;
  /** Hands washed after the last piece of work (the end of the practical). */
  washedAtEnd: boolean;
  /** Potato cylinders felt after soaking (index). */
  felt: Set<number>;
}

const WORK = /^(bore|trim|blot|measure|weigh|place|wait|remove|peel|mount|coverslip|stage|obj|drop|draw|capture|cube|acid|cutopen|depth|measure-cube|away|place-cube)/;

export function sceneFromState(s: BioOsmosisState): OsmoScene {
  const out: OsmoScene = { coat: false, goggles: false, collected: new Set(), washed: false, washedAtEnd: false, felt: new Set() };
  const task = s.task ?? 'POTATO';
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
    else if (verb === 'collect' && arg) out.collected.add(arg as OsmoApparatusId);
    else if (verb === 'return' && arg) out.collected.delete(arg as OsmoApparatusId);
    else if (verb === 'wash-hands') {
      out.washed = true;
      out.washedAtEnd = lastWork >= 0;
    } else if (verb.startsWith('feel#')) out.felt.add(Number(verb.slice(5)) - 1);
    if (WORK.test(a)) {
      lastWork = i;
      out.washedAtEnd = false;
    }
  });
  return out;
}
