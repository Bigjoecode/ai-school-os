import type { ChemRatesState, RatesTask } from '@aischool/shared';
import { collectedFromLog, startedIn2d } from '../../phy-common/lab3d/common';

/**
 * What the 3D bench shows beyond the marked state (goggles and coat, the
 * apparatus collected, the gas syringe clamped and connected, the paper with
 * the cross set out, the water bath on) is read back from the attempt's own
 * action log, so a reload or a switch between the 2D and 3D labs keeps the
 * bench as it was. No marks.
 */

export type ApparatusId = 'flask' | 'syringe' | 'stand' | 'stopwatch' | 'cylinder' | 'ribbon' | 'sandpaper' | 'balance' | 'beaker' | 'paper' | 'smallCyl' | 'thermometer' | 'bath' | 'washBottle' | 'burette' | 'burner' | 'testTubes';
export const APPARATUS: { id: ApparatusId; label: string }[] = [
  { id: 'flask', label: '250 cm³ conical flask (with bung and delivery tube)' },
  { id: 'syringe', label: '100 cm³ gas syringe' },
  { id: 'stand', label: 'Retort stand and clamp' },
  { id: 'stopwatch', label: 'Stopwatch' },
  { id: 'cylinder', label: '50 cm³ measuring cylinder' },
  { id: 'smallCyl', label: '10 cm³ measuring cylinder' },
  { id: 'ribbon', label: 'Magnesium ribbon (on a watch glass)' },
  { id: 'sandpaper', label: 'Sandpaper' },
  { id: 'balance', label: 'Top-pan balance' },
  { id: 'beaker', label: 'Beaker (for waste)' },
  { id: 'paper', label: 'White paper with a bold cross' },
  { id: 'thermometer', label: 'Thermometer (0–110 °C)' },
  { id: 'bath', label: 'Water bath' },
  { id: 'washBottle', label: 'Wash bottle (distilled water)' },
  { id: 'burette', label: 'Burette' },
  { id: 'burner', label: 'Bunsen burner' },
  { id: 'testTubes', label: 'Test tubes in a rack' },
];
export const APPARATUS_LABEL = Object.fromEntries(APPARATUS.map((a) => [a.id, a.label])) as Record<ApparatusId, string>;
export const NEEDED: Record<RatesTask, ApparatusId[]> = {
  MG: ['flask', 'syringe', 'stand', 'stopwatch', 'cylinder', 'ribbon', 'sandpaper', 'balance', 'beaker'],
  CROSS: ['flask', 'cylinder', 'smallCyl', 'paper', 'thermometer', 'bath', 'stopwatch', 'washBottle'],
};
/** Set out in order before the work starts. */
export const PLACEABLE: Record<RatesTask, ApparatusId[]> = { MG: ['stand', 'syringe'], CROSS: ['paper', 'bath'] };
export const PLACE_LABEL: Partial<Record<ApparatusId, string>> = {
  stand: 'Stand the retort stand behind the flask',
  syringe: 'Clamp the gas syringe and connect the delivery tube',
  paper: 'Lay the paper with the cross under the flask',
  bath: 'Switch on the water bath',
};

export interface SceneState {
  task: RatesTask;
  coat: boolean;
  goggles: boolean;
  collected: Set<ApparatusId>;
  placed: Set<ApparatusId>;
  ready: boolean;
  missing: ApparatusId[];
  set: boolean;
  nextPlace: ApparatusId | null;
}

export function sceneFromState(s: ChemRatesState): SceneState {
  const task = s.task ?? 'MG';
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
  if (startedIn2d(s.log, /^(mg-acid:|measure:|drop-mg|add-acid)/)) for (const id of NEEDED[task]) collected.add(id), placed.add(id);
  for (const id of [...placed]) if (!collected.has(id)) placed.delete(id);
  if (!placed.has('stand')) placed.delete('syringe');
  const missing = NEEDED[task].filter((id) => !collected.has(id));
  const toPlace = PLACEABLE[task].filter((id) => !placed.has(id));
  return { task, coat, goggles, collected: collected as Set<ApparatusId>, placed, ready: !missing.length, missing, set: !toPlace.length && !missing.length, nextPlace: toPlace[0] ?? null };
}
