import type { ChemEnergeticsState, EnergeticsTask } from '@aischool/shared';
import { collectedFromLog, startedIn2d } from '../../phy-common/lab3d/common';

/**
 * What the 3D bench shows beyond the marked state (goggles and coat, the
 * apparatus collected, the burette clamped, the water bath on) is read back
 * from the attempt's own action log, so a reload or a switch between the 2D
 * and 3D labs keeps the bench as it was. No marks.
 */

export type ApparatusId = 'cup' | 'glassBeaker' | 'beaker' | 'cylinder' | 'cylinder2' | 'thermometer' | 'stopwatch' | 'balance' | 'spatula' | 'tube' | 'rack' | 'bath' | 'burette' | 'burner' | 'washBottle';
export const APPARATUS: { id: ApparatusId; label: string }[] = [
  { id: 'cup', label: 'Polystyrene cup with lid' },
  { id: 'glassBeaker', label: 'Glass beaker (100 cm³)' },
  { id: 'beaker', label: '250 cm³ beaker (to support the cup)' },
  { id: 'cylinder', label: '50 cm³ measuring cylinder' },
  { id: 'cylinder2', label: 'Second 50 cm³ measuring cylinder' },
  { id: 'thermometer', label: 'Thermometer (−10 to 110 °C)' },
  { id: 'stopwatch', label: 'Stopwatch' },
  { id: 'balance', label: 'Top-pan balance' },
  { id: 'spatula', label: 'Spatula' },
  { id: 'tube', label: 'Boiling tube and holder' },
  { id: 'rack', label: 'Test-tube rack' },
  { id: 'bath', label: 'Water bath (hot water)' },
  { id: 'burette', label: 'Burette on a stand (distilled water)' },
  { id: 'burner', label: 'Bunsen burner, tripod and gauze' },
  { id: 'washBottle', label: 'Wash bottle (distilled water)' },
];
export const APPARATUS_LABEL = Object.fromEntries(APPARATUS.map((a) => [a.id, a.label])) as Record<ApparatusId, string>;
export const NEEDED: Record<EnergeticsTask, ApparatusId[]> = {
  NEUT: ['cup', 'beaker', 'cylinder', 'cylinder2', 'thermometer', 'stopwatch'],
  SOLN: ['cup', 'beaker', 'cylinder', 'thermometer', 'balance', 'spatula', 'stopwatch'],
  SOLY: ['tube', 'rack', 'thermometer', 'bath', 'burette', 'balance', 'spatula'],
};
/** Set out in order before the work starts (SOLY); the cup tasks set up through the marked state (vessel, support). */
export const PLACEABLE: Record<EnergeticsTask, ApparatusId[]> = { NEUT: [], SOLN: [], SOLY: ['burette', 'bath'] };
export const PLACE_LABEL: Partial<Record<ApparatusId, string>> = {
  burette: 'Clamp the burette and fill it with distilled water',
  bath: 'Fill the water bath and switch it on (about 80 °C)',
};

export interface SceneState {
  task: EnergeticsTask;
  coat: boolean;
  goggles: boolean;
  collected: Set<ApparatusId>;
  placed: Set<ApparatusId>;
  ready: boolean;
  missing: ApparatusId[];
  /** Everything collected and set out: the dock shows the work. */
  set: boolean;
  nextPlace: ApparatusId | null;
}

export function sceneFromState(s: ChemEnergeticsState): SceneState {
  const task = s.task ?? 'NEUT';
  const { collected, coat } = collectedFromLog(s.log);
  let goggles = false;
  const placed = new Set<ApparatusId>();
  for (const { a } of s.log) {
    const [verb, arg] = a.split(':') as [string, string | undefined];
    if (verb === 'place' && arg) placed.add(arg as ApparatusId);
    else if (verb === 'return' && arg) placed.delete(arg as ApparatusId);
    else if (verb === 'safety' && arg === 'goggles') goggles = true;
    else if (verb === 'safety-off' && arg === 'goggles') goggles = false;
  }
  if (startedIn2d(s.log, /^(vessel:|measure-a:|kno3:|water:)/)) for (const id of NEEDED[task]) collected.add(id), placed.add(id);
  for (const id of [...placed]) if (!collected.has(id)) placed.delete(id);
  const missing = NEEDED[task].filter((id) => !collected.has(id));
  const toPlace = PLACEABLE[task].filter((id) => !placed.has(id));
  const cupReady = task === 'SOLY' || !!s.setup.vessel;
  return { task, coat, goggles, collected: collected as Set<ApparatusId>, placed, ready: !missing.length, missing, set: !toPlace.length && !missing.length && cupReady, nextPlace: toPlace[0] ?? null };
}
