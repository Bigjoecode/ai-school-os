import type { BioEcologyState, EcoTask } from '@aischool/shared';

/**
 * What the field shows beyond the marked state (hat and coat, apparatus taken
 * from the shed, hands washed) is read back from the attempt's own action log,
 * so a reload or a switch between the 3D and the 2D lab keeps it as it was.
 * These log entries carry no marks.
 */

export type EcoApparatusId =
  | 'quadrat'
  | 'tapes'
  | 'pegs'
  | 'randtable'
  | 'guide'
  | 'net'
  | 'box'
  | 'tray'
  | 'paint'
  | 'redpaint'
  | 'scissors'
  | 'watch'
  | 'thermo'
  | 'soilthermo'
  | 'hygro'
  | 'lightmeter'
  | 'anemo'
  | 'phkit'
  | 'secchi'
  | 'jars'
  | 'funnels'
  | 'cylinders'
  | 'rod'
  | 'crucibles'
  | 'burner'
  | 'tongs'
  | 'desiccator'
  | 'balance'
  | 'ruler';
export interface EcoApparatusInfo {
  id: EcoApparatusId;
  label: string;
  for: EcoTask[];
}
export const ECO_APPARATUS: EcoApparatusInfo[] = [
  { id: 'quadrat', label: '1 m quadrat with string grid', for: ['QUADRAT'] },
  { id: 'tapes', label: 'Two 30 m measuring tapes', for: ['QUADRAT'] },
  { id: 'pegs', label: 'Pegs and string', for: ['QUADRAT'] },
  { id: 'randtable', label: 'Random-number table', for: ['QUADRAT'] },
  { id: 'guide', label: 'Identification guide to weeds', for: ['QUADRAT'] },
  { id: 'net', label: 'Sweep net', for: ['CAPTURE'] },
  { id: 'box', label: 'Collecting box', for: ['CAPTURE'] },
  { id: 'tray', label: 'White tray', for: ['CAPTURE'] },
  { id: 'paint', label: 'Non-toxic paint and fine brush', for: ['CAPTURE'] },
  { id: 'redpaint', label: 'Red gloss paint', for: [] },
  { id: 'scissors', label: 'Scissors', for: [] },
  { id: 'watch', label: 'Stopwatch', for: ['CAPTURE', 'SOIL'] },
  { id: 'thermo', label: 'Thermometer and shade card', for: ['FACTORS'] },
  { id: 'soilthermo', label: 'Soil thermometer', for: ['FACTORS'] },
  { id: 'hygro', label: 'Wet-and-dry bulb hygrometer', for: ['FACTORS'] },
  { id: 'lightmeter', label: 'Light meter', for: ['FACTORS'] },
  { id: 'anemo', label: 'Hand anemometer', for: ['FACTORS'] },
  { id: 'phkit', label: 'Soil pH kit (universal indicator)', for: ['FACTORS'] },
  { id: 'secchi', label: 'Secchi disc on a marked rope', for: ['FACTORS'] },
  { id: 'jars', label: 'Screw-top jars', for: ['SOIL'] },
  { id: 'funnels', label: 'Funnels, cotton wool and stand', for: ['SOIL'] },
  { id: 'cylinders', label: '100 cm³ measuring cylinders', for: ['SOIL'] },
  { id: 'rod', label: 'Glass rod', for: ['SOIL'] },
  { id: 'crucibles', label: 'Crucibles', for: ['SOIL'] },
  { id: 'burner', label: 'Bunsen burner, tripod and pipe-clay triangle', for: ['SOIL'] },
  { id: 'tongs', label: 'Crucible tongs', for: ['SOIL'] },
  { id: 'desiccator', label: 'Desiccator', for: ['SOIL'] },
  { id: 'balance', label: 'Electronic balance (0.01 g)', for: ['SOIL'] },
  { id: 'ruler', label: 'Ruler (mm)', for: ['SOIL'] },
];
export const ECO_APPARATUS_LABEL = Object.fromEntries(ECO_APPARATUS.map((a) => [a.id, a.label])) as Record<EcoApparatusId, string>;
export const neededFor = (task: EcoTask) => ECO_APPARATUS.filter((a) => a.for.includes(task));
/** What each task's shed shows (its own apparatus and a few that are not needed). */
export const shedFor = (task: EcoTask) => ECO_APPARATUS.filter((a) => a.for.includes(task) || (task === 'CAPTURE' && (a.id === 'redpaint' || a.id === 'scissors')) || (task === 'QUADRAT' && a.id === 'net') || (task === 'FACTORS' && a.id === 'balance') || (task === 'SOIL' && a.id === 'thermo'));

export interface EcoScene {
  /** Sun hat on (field) — the kit's coat hook; goggles for heating soil. */
  coat: boolean;
  goggles: boolean;
  collected: Set<EcoApparatusId>;
  washedAtEnd: boolean;
}

const WORK = /^(peg|quad|look|sweep|tray|mark|release|wait|examine|free|go|read|station|reset|empty|secchi|next-day|jar|shake|measure|funnel|pour|air|stir|crucible|sample|weigh|heat|cool)/;

export function sceneFromState(s: BioEcologyState): EcoScene {
  const out: EcoScene = { coat: false, goggles: false, collected: new Set(), washedAtEnd: false };
  const task = s.task ?? 'QUADRAT';
  const firstCollect = s.log.findIndex((e) => e.a.startsWith('collect:'));
  const first2d = s.log.findIndex((e) => WORK.test(e.a));
  if (first2d >= 0 && (firstCollect < 0 || first2d < firstCollect)) for (const a of neededFor(task)) out.collected.add(a.id);
  let worked = false;
  for (const { a } of s.log) {
    const [verb, arg] = a.split(':') as [string, string | undefined];
    if (verb === 'safety' && arg === 'coat') out.coat = true;
    else if (verb === 'safety' && arg === 'goggles') out.goggles = true;
    else if (verb === 'safety-off' && arg === 'coat') out.coat = false;
    else if (verb === 'safety-off' && arg === 'goggles') out.goggles = false;
    else if (verb === 'collect' && arg) out.collected.add(arg as EcoApparatusId);
    else if (verb === 'return' && arg) out.collected.delete(arg as EcoApparatusId);
    else if (verb === 'wash-hands') out.washedAtEnd = worked;
    if (WORK.test(a)) {
      worked = true;
      out.washedAtEnd = false;
    }
  }
  return out;
}
