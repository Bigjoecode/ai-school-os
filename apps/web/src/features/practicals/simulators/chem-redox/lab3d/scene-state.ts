import type { ChemRedoxState, RedoxTask } from '@aischool/shared';

/**
 * What the 3D lab shows beyond the marked state (lab coat on, apparatus
 * collected, burette clamped, air bubble cleared, flask on the tile or on the
 * tripod, the burner lit) is read back from the attempt's own action log, so a
 * reload, or switching between the 3D and the 2D lab mid-attempt, keeps the
 * bench exactly as the student left it. These log entries carry no marks.
 */

export type ApparatusId = 'burette' | 'stand' | 'funnel' | 'pipette' | 'filler' | 'flask' | 'tile' | 'beaker' | 'washBottle' | 'cylinder' | 'testTubes' | 'thermometer' | 'burner' | 'tripod';
export interface ApparatusInfo {
  id: ApparatusId;
  label: string;
  /** Needed for this task (the others are in the cupboard too: picking them is the student's choice). */
  needed: boolean;
}
const ALL: { id: ApparatusId; label: string; tasks: RedoxTask[] }[] = [
  { id: 'burette', label: '50 cm³ burette', tasks: ['FE', 'OX', 'IOD'] },
  { id: 'stand', label: 'Retort stand and clamp', tasks: ['FE', 'OX', 'IOD'] },
  { id: 'funnel', label: 'Filter funnel', tasks: ['FE', 'OX', 'IOD'] },
  { id: 'pipette', label: '25.0 cm³ pipette', tasks: ['FE', 'OX', 'IOD'] },
  { id: 'filler', label: 'Pipette filler', tasks: ['FE', 'OX', 'IOD'] },
  { id: 'flask', label: '250 cm³ conical flask', tasks: ['FE', 'OX', 'IOD'] },
  { id: 'tile', label: 'White tile', tasks: ['FE', 'OX', 'IOD'] },
  { id: 'beaker', label: 'Beaker (for waste)', tasks: ['FE', 'OX', 'IOD'] },
  { id: 'washBottle', label: 'Wash bottle (distilled water)', tasks: ['FE', 'OX', 'IOD'] },
  { id: 'cylinder', label: 'Measuring cylinder (for the acid)', tasks: ['FE', 'OX'] },
  { id: 'thermometer', label: 'Thermometer', tasks: ['OX'] },
  { id: 'burner', label: 'Bunsen burner', tasks: ['OX'] },
  { id: 'tripod', label: 'Tripod and gauze', tasks: ['OX'] },
  { id: 'testTubes', label: 'Test tubes in a rack', tasks: [] },
];
export const apparatusFor = (task: RedoxTask): ApparatusInfo[] => ALL.map((a) => ({ id: a.id, label: a.label, needed: a.tasks.includes(task) }));
export const APPARATUS_LABEL = Object.fromEntries(ALL.map((a) => [a.id, a.label])) as Record<ApparatusId, string>;

export interface SceneState {
  coat: boolean;
  goggles: boolean;
  collected: Set<ApparatusId>;
  clamped: boolean;
  /** An air bubble is trapped in the jet (filled since it was last cleared). */
  bubble: boolean;
  /** The flask stands on the white tile under the burette. */
  flaskUnder: boolean;
  /** OX: the flask stands on the gauze over the burner; the burner is lit. */
  onTripod: boolean;
  burnerLit: boolean;
  fillerOn: boolean;
}

/** Replays the log entries the 3D lab writes (and the 2D ones that move apparatus). */
export function sceneFromState(s: ChemRedoxState): SceneState {
  const task = s.task ?? 'FE';
  const out: SceneState = { coat: false, goggles: false, collected: new Set(), clamped: false, bubble: false, flaskUnder: false, onTripod: false, burnerLit: false, fillerOn: false };
  const firstCollect = s.log.findIndex((e) => e.a.startsWith('collect:'));
  const first2d = s.log.findIndex((e) => e.a.startsWith('rinse-') || e.a === 'fill-burette' || e.a.startsWith('pipette:'));
  const from2d = first2d >= 0 && (firstCollect < 0 || first2d < firstCollect);
  if (from2d) {
    for (const x of apparatusFor(task)) if (x.needed) out.collected.add(x.id);
    out.clamped = true;
    out.fillerOn = true;
  }
  for (const { a } of s.log) {
    const [verb, arg] = a.split(':') as [string, string | undefined];
    if (verb === 'safety' && arg === 'coat') out.coat = true;
    else if (verb === 'safety' && arg === 'goggles') out.goggles = true;
    else if (verb === 'safety-off' && arg === 'coat') out.coat = false;
    else if (verb === 'safety-off' && arg === 'goggles') out.goggles = false;
    else if (verb === 'collect' && arg) out.collected.add(arg as ApparatusId);
    else if (verb === 'return' && arg) {
      out.collected.delete(arg as ApparatusId);
      if (arg === 'burette' || arg === 'stand') out.clamped = false;
      if (arg === 'flask' || arg === 'tile') out.flaskUnder = false;
      if (arg === 'flask' || arg === 'tripod') out.onTripod = false;
      if (arg === 'burner') out.burnerLit = false;
      if (arg === 'filler' || arg === 'pipette') out.fillerOn = false;
    } else if (verb === 'clamp-burette') out.clamped = true;
    else if (verb === 'unclamp-burette') out.clamped = false;
    else if (verb === 'fill-burette') out.bubble = true;
    else if (verb === 'clear-jet') out.bubble = false;
    else if (verb === 'flask-to-tile') {
      out.flaskUnder = true;
      out.onTripod = false;
    } else if (verb === 'flask-to-tripod') {
      out.onTripod = true;
      out.flaskUnder = false;
    } else if (verb === 'flask-off-tripod') out.onTripod = false;
    else if (verb === 'light-burner') out.burnerLit = true;
    else if (verb === 'burner-off') out.burnerLit = false;
    else if (verb === 'flask-off-tile' || verb === 'pipette' || verb === 'pour-away' || verb === 'rinse-flask') {
      out.flaskUnder = false;
      out.onTripod = false;
    } else if (verb === 'filler-on') out.fillerOn = true;
    else if (verb === 'filler-off') out.fillerOn = false;
  }
  if (from2d && !s.log.some((e) => e.a === 'flask-to-tile') && s.runs.some((r) => !r.done && r.initial !== null)) out.flaskUnder = true;
  return out;
}
