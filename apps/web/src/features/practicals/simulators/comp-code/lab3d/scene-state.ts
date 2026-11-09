import type { CompCodeState, CompTask } from '@aischool/shared';

/**
 * What the 3D bench shows beyond the marked state (the computer switched on,
 * the tools collected) is read back from the attempt's own action log, so a
 * reload or a switch between 3D and 2D keeps the bench as it was. These log
 * entries carry no marks.
 */

export type CompApparatusId = 'cable' | 'plugs' | 'crimper' | 'tester' | 'cloth' | 'brush' | 'alcohol' | 'blower' | 'lensDisc' | 'pendrive';
export interface CompApparatusInfo {
  id: CompApparatusId;
  label: string;
  for: CompTask[];
}
export const COMP_APPARATUS: CompApparatusInfo[] = [
  { id: 'cable', label: 'Box of Cat 6 UTP cable', for: ['CRIMP'] },
  { id: 'plugs', label: 'RJ45 plugs and boots', for: ['CRIMP'] },
  { id: 'crimper', label: 'Crimping tool and cable stripper', for: ['CRIMP'] },
  { id: 'tester', label: 'Network cable tester', for: ['CRIMP'] },
  { id: 'cloth', label: 'Microfibre cloths', for: ['MAINT'] },
  { id: 'brush', label: 'Soft brush', for: ['MAINT'] },
  { id: 'alcohol', label: 'Isopropyl alcohol', for: ['MAINT'] },
  { id: 'blower', label: 'Air blower', for: ['MAINT'] },
  { id: 'lensDisc', label: 'Lens-cleaning disc', for: ['MAINT'] },
  { id: 'pendrive', label: 'USB flash drive', for: [] },
];
export const COMP_APPARATUS_LABEL = Object.fromEntries(COMP_APPARATUS.map((a) => [a.id, a.label])) as Record<CompApparatusId, string>;
export const neededFor = (task: CompTask) => COMP_APPARATUS.filter((a) => a.for.includes(task));

export interface CompScene {
  /** The computer is on and at the desktop (the practical's own power state for maintenance). */
  power: boolean;
  collected: Set<CompApparatusId>;
}

export function compSceneFromState(s: CompCodeState): CompScene {
  const out: CompScene = { power: false, collected: new Set() };
  const task = s.task ?? 'BASIC_IO';
  // Work started in the 2D lab: the bench is ready.
  const firstCollect = s.log.findIndex((e) => e.a.startsWith('collect:'));
  const first2d = s.log.findIndex((e) => e.a.startsWith('ev:') || e.a.startsWith('run:') || e.a.startsWith('flow:') || e.a.startsWith('save:'));
  if (first2d >= 0 && (firstCollect < 0 || first2d < firstCollect)) {
    out.power = true;
    for (const a of neededFor(task)) out.collected.add(a.id);
  }
  if (Object.values(s.programs).some((p) => p.trim())) out.power = true;
  for (const { a } of s.log) {
    const [verb, arg] = a.split(':') as [string, string | undefined];
    if (verb === 'power') out.power = arg === 'on';
    else if (verb === 'collect' && arg) out.collected.add(arg as CompApparatusId);
    else if (verb === 'return' && arg) out.collected.delete(arg as CompApparatusId);
  }
  return out;
}
