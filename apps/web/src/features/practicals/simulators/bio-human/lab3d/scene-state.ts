import type { BioHumanState, HumanTask } from '@aischool/shared';

/**
 * What the 3D bench shows beyond the marked state (coat on, apparatus
 * collected, hands washed) is read back from the attempt's own action log, so
 * a reload or a switch between the 3D and the 2D lab keeps the bench as it
 * was. These log entries carry no marks.
 */

export type HumanApparatusId = 'clock' | 'step' | 'apparatus' | 'limewater' | 'mouthpiece' | 'mirror' | 'cobalt' | 'thermometer' | 'rule' | 'dividers' | 'mmrule' | 'blindfold' | 'wipes' | 'lens';
export interface HumanApparatusInfo {
  id: HumanApparatusId;
  label: string;
  for: HumanTask[];
}
export const HUMAN_APPARATUS: HumanApparatusInfo[] = [
  { id: 'clock', label: 'Stopwatch', for: ['PULSE', 'BREATH'] },
  { id: 'step', label: 'Step (a low wooden box)', for: ['PULSE'] },
  { id: 'apparatus', label: 'Inhaled/exhaled air apparatus (tubes A and B)', for: ['BREATH'] },
  { id: 'limewater', label: 'Lime water', for: ['BREATH'] },
  { id: 'mouthpiece', label: 'Clean mouthpieces (sealed pack)', for: ['BREATH'] },
  { id: 'mirror', label: 'Mirror', for: ['BREATH'] },
  { id: 'cobalt', label: 'Cobalt chloride paper', for: ['BREATH'] },
  { id: 'thermometer', label: 'Thermometer', for: ['BREATH'] },
  { id: 'rule', label: 'Metre rule', for: ['REACTION'] },
  { id: 'dividers', label: 'Blunt dividers (two points)', for: ['SKIN'] },
  { id: 'mmrule', label: 'Ruler (mm)', for: ['SKIN'] },
  { id: 'blindfold', label: 'Blindfold', for: ['SKIN'] },
  { id: 'wipes', label: 'Alcohol wipes', for: ['SKIN'] },
  { id: 'lens', label: 'Hand lens', for: [] },
];
export const HUMAN_APPARATUS_LABEL = Object.fromEntries(HUMAN_APPARATUS.map((a) => [a.id, a.label])) as Record<HumanApparatusId, string>;
export const neededFor = (task: HumanTask) => HUMAN_APPARATUS.filter((a) => a.for.includes(task));

export interface HumanScene {
  coat: boolean;
  goggles: boolean;
  collected: Set<HumanApparatusId>;
  washed: boolean;
  washedAtEnd: boolean;
}

const WORK = /^(screen|wait|count|exercise|mouthpiece|lime|breathe|wipe|mirror|cobalt|troom|tbreath|bcount|knee|arm|zero|drop|blind|clean|together|touch)/;

export function sceneFromState(s: BioHumanState): HumanScene {
  const out: HumanScene = { coat: false, goggles: false, collected: new Set(), washed: false, washedAtEnd: false };
  const task = s.task ?? 'PULSE';
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
    else if (verb === 'collect' && arg) out.collected.add(arg as HumanApparatusId);
    else if (verb === 'return' && arg) out.collected.delete(arg as HumanApparatusId);
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
