import { QUAL_REAGENT_INFO, qualObserve, type ChemQualitativeState, type ChemQualitativeVariant, type QualGas } from '@aischool/shared';

/**
 * What the 3D qualitative-analysis bench shows beyond the marked state (coat
 * and goggles, apparatus collected, the Bunsen burner lit, which tests were
 * done in the fume cupboard, gases wafted) is read back from the attempt's
 * own action log, so a reload or a switch between the 3D and the 2D lab keeps
 * the bench as it was. These log entries carry no marks.
 */

export type QualApparatusId = 'rack' | 'holder' | 'burner' | 'spatula' | 'wire' | 'gasKit' | 'funnel' | 'washBottle' | 'burette' | 'pipette' | 'thermometer';
export interface QualApparatusInfo {
  id: QualApparatusId;
  label: string;
  needed: boolean;
}
export const QUAL_APPARATUS: QualApparatusInfo[] = [
  { id: 'rack', label: 'Test tubes in a rack', needed: true },
  { id: 'holder', label: 'Test-tube holder', needed: true },
  { id: 'burner', label: 'Bunsen burner', needed: true },
  { id: 'spatula', label: 'Spatula', needed: true },
  { id: 'wire', label: 'Nichrome wire (flame tests)', needed: true },
  { id: 'gasKit', label: 'Gas-test kit (litmus, splints, lime water, test papers)', needed: true },
  { id: 'funnel', label: 'Filter funnel and filter paper', needed: true },
  { id: 'washBottle', label: 'Wash bottle (distilled water)', needed: true },
  { id: 'burette', label: '50 cm³ burette', needed: false },
  { id: 'pipette', label: '25.0 cm³ pipette', needed: false },
  { id: 'thermometer', label: 'Thermometer', needed: false },
];
export const QUAL_APPARATUS_LABEL = Object.fromEntries(QUAL_APPARATUS.map((a) => [a.id, a.label])) as Record<QualApparatusId, string>;

/** Gases that must be handled in the fume cupboard (and smelt only by wafting). */
export const TOXIC_GASES: QualGas[] = ['SO2', 'H2S', 'NO2', 'HCL'];
/** Can this test give off a harmful gas — now, or with its remaining steps (e.g. BaCl₂ then dilute HCl on a sulphite)? */
export const isToxicTest = (v: ChemQualitativeVariant, s: ChemQualitativeState, i: number) => {
  const t = s.tests[i];
  if (!t) return false;
  const full = { ...t, steps: QUAL_REAGENT_INFO[t.reagent].steps.map((x) => x.id) };
  return [t, full].some((x) => qualObserve(v, x).gases.some((g) => TOXIC_GASES.includes(g)));
};

export interface QualScene {
  coat: boolean;
  goggles: boolean;
  collected: Set<QualApparatusId>;
  burnerOn: boolean;
  /** Tests (by index) carried out in the fume cupboard. */
  fume: Set<number>;
  /** Tests (by index) whose gas was smelt by wafting. */
  wafted: Set<number>;
}

export function qualSceneFromState(s: ChemQualitativeState): QualScene {
  const out: QualScene = { coat: false, goggles: false, collected: new Set(), burnerOn: false, fume: new Set(), wafted: new Set() };
  // Work started in the 2D lab (before anything was collected here): the apparatus is already on the bench.
  const firstCollect = s.log.findIndex((e) => e.a.startsWith('collect:'));
  const first2d = s.log.findIndex((e) => e.a.startsWith('test:'));
  if (first2d >= 0 && (firstCollect < 0 || first2d < firstCollect)) for (const a of QUAL_APPARATUS) if (a.needed) out.collected.add(a.id);
  for (const { a } of s.log) {
    const [verb, arg] = a.split(':') as [string, string | undefined];
    if (verb === 'safety' && arg === 'coat') out.coat = true;
    else if (verb === 'safety' && arg === 'goggles') out.goggles = true;
    else if (verb === 'safety-off' && arg === 'coat') out.coat = false;
    else if (verb === 'safety-off' && arg === 'goggles') out.goggles = false;
    else if (verb === 'collect' && arg) out.collected.add(arg as QualApparatusId);
    else if (verb === 'return' && arg) {
      out.collected.delete(arg as QualApparatusId);
      if (arg === 'burner') out.burnerOn = false;
    } else if (verb === 'burner-on') out.burnerOn = true;
    else if (verb === 'burner-off') out.burnerOn = false;
    else if (verb === 'fume-cupboard' && arg) out.fume.add(Number(arg));
    else if (verb === 'waft' && arg) out.wafted.add(Number(arg));
    else if (a.startsWith('discard#')) {
      // Later tests move up one place.
      const k = Number(a.slice(8)) - 1;
      const shift = (set: Set<number>) => new Set([...set].filter((x) => x !== k).map((x) => (x > k ? x - 1 : x)));
      out.fume = shift(out.fume);
      out.wafted = shift(out.wafted);
    }
  }
  return out;
}
