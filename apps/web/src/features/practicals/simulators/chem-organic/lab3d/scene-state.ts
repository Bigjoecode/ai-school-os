import type { ChemOrganicState, OrgTask } from '@aischool/shared';

/**
 * What the 3D organic bench shows beyond the marked state (coat and goggles,
 * apparatus collected, the burner lit, smells wafted) is read back from the
 * attempt's own action log, so a reload or a switch between 3D and 2D keeps
 * the bench as it was. These log entries carry no marks.
 */

export type OrgApparatusId = 'rack' | 'holder' | 'bath' | 'gasKit' | 'cylinder' | 'burner' | 'beaker' | 'rod' | 'funnel' | 'balance' | 'burette' | 'thermometer';
export interface OrgApparatusInfo {
  id: OrgApparatusId;
  label: string;
  for: OrgTask[];
}
const TUBES: OrgTask[] = ['GROUPS', 'CARBS', 'PROTEINS'];
export const ORG_APPARATUS: OrgApparatusInfo[] = [
  { id: 'rack', label: 'Test tubes in a rack', for: TUBES },
  { id: 'holder', label: 'Test-tube holder', for: TUBES },
  { id: 'bath', label: 'Water bath: beaker of water, tripod, gauze and Bunsen burner', for: TUBES },
  { id: 'gasKit', label: 'Wooden splints and lime water', for: ['GROUPS'] },
  { id: 'cylinder', label: 'Measuring cylinder', for: ['CARBS', 'PROTEINS', 'SOAP'] },
  { id: 'burner', label: 'Bunsen burner, tripod and gauze', for: ['SOAP'] },
  { id: 'beaker', label: '250 cm³ beaker', for: ['SOAP'] },
  { id: 'rod', label: 'Glass stirring rod', for: ['SOAP'] },
  { id: 'funnel', label: 'Filter funnel and paper', for: ['SOAP'] },
  { id: 'balance', label: 'Top-pan balance', for: ['SOAP'] },
  { id: 'burette', label: 'Burette', for: [] },
  { id: 'thermometer', label: 'Thermometer', for: [] },
];
export const ORG_APPARATUS_LABEL = Object.fromEntries(ORG_APPARATUS.map((a) => [a.id, a.label])) as Record<OrgApparatusId, string>;
export const neededFor = (task: OrgTask) => ORG_APPARATUS.filter((a) => a.for.includes(task));

export interface OrgScene {
  coat: boolean;
  goggles: boolean;
  collected: Set<OrgApparatusId>;
  burnerOn: boolean;
  /** Tubes whose smell was wafted. */
  wafted: Set<number>;
}

export function orgSceneFromState(s: ChemOrganicState): OrgScene {
  const out: OrgScene = { coat: false, goggles: false, collected: new Set(), burnerOn: false, wafted: new Set() };
  const task = s.task ?? 'GROUPS';
  // Work started in the 2D lab (before anything was collected here): the apparatus is already on the bench and the burner lit.
  const firstCollect = s.log.findIndex((e) => e.a.startsWith('collect:'));
  const first2d = s.log.findIndex((e) => /^(test:|soap:)/.test(e.a));
  if (first2d >= 0 && (firstCollect < 0 || first2d < firstCollect)) {
    for (const a of neededFor(task)) out.collected.add(a.id);
    out.burnerOn = true;
  }
  for (const { a } of s.log) {
    const [verb, arg] = a.split(':') as [string, string | undefined];
    if (verb === 'safety' && arg === 'coat') out.coat = true;
    else if (verb === 'safety' && arg === 'goggles') out.goggles = true;
    else if (verb === 'safety-off' && arg === 'coat') out.coat = false;
    else if (verb === 'safety-off' && arg === 'goggles') out.goggles = false;
    else if (verb === 'collect' && arg) out.collected.add(arg as OrgApparatusId);
    else if (verb === 'return' && arg) {
      out.collected.delete(arg as OrgApparatusId);
      if (arg === 'bath' || arg === 'burner') out.burnerOn = false;
    } else if (verb === 'burner-on') out.burnerOn = true;
    else if (verb === 'burner-off') out.burnerOn = false;
    else if (verb === 'waft' && arg) out.wafted.add(Number(arg));
  }
  return out;
}
