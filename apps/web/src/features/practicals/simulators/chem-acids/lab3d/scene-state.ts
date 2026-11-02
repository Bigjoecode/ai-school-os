import type { AcidsTask, ChemAcidsState } from '@aischool/shared';
import { collectedFromLog, startedIn2d } from '../../phy-common/lab3d/common';

/**
 * What the 3D bench shows beyond the marked state (goggles and coat, the
 * apparatus collected) is read back from the attempt's own action log, so a
 * reload or a switch between the 2D and 3D labs keeps the bench as it was.
 * No marks.
 */

export type ApparatusId =
  | 'testTubes'
  | 'uiBottle'
  | 'chart'
  | 'tile'
  | 'washBottle'
  | 'mortar'
  | 'waterBath'
  | 'funnel'
  | 'burette'
  | 'stand'
  | 'pipette'
  | 'flask'
  | 'burner'
  | 'splints'
  | 'balance'
  | 'cylinder'
  | 'cotton'
  | 'thermometer'
  | 'evapDish';
export const APPARATUS: { id: ApparatusId; label: string }[] = [
  { id: 'testTubes', label: 'Test tubes in a rack' },
  { id: 'uiBottle', label: 'Universal indicator (dropper bottle)' },
  { id: 'chart', label: 'Universal indicator colour chart' },
  { id: 'tile', label: 'White tile' },
  { id: 'washBottle', label: 'Wash bottle (distilled water)' },
  { id: 'mortar', label: 'Mortar and pestle' },
  { id: 'waterBath', label: 'Water bath (beaker on a tripod, burner)' },
  { id: 'funnel', label: 'Filter funnel, paper and beaker' },
  { id: 'burette', label: 'Burette (50 cm³)' },
  { id: 'stand', label: 'Retort stand and clamp' },
  { id: 'pipette', label: 'Pipette (25.0 cm³) and filler' },
  { id: 'flask', label: 'Conical flask (with stopper)' },
  { id: 'burner', label: 'Bunsen burner, tripod and gauze' },
  { id: 'splints', label: 'Wooden splints' },
  { id: 'balance', label: 'Top-pan balance (0.01 g)' },
  { id: 'cylinder', label: 'Measuring cylinder (50 cm³)' },
  { id: 'cotton', label: 'Cotton wool' },
  { id: 'thermometer', label: 'Thermometer (0–110 °C)' },
  { id: 'evapDish', label: 'Evaporating dish' },
];
export const APPARATUS_LABEL = Object.fromEntries(APPARATUS.map((a) => [a.id, a.label])) as Record<ApparatusId, string>;
export const NEEDED: Record<AcidsTask, ApparatusId[]> = {
  PH: ['testTubes', 'uiBottle', 'chart', 'tile', 'washBottle'],
  IND: ['mortar', 'waterBath', 'funnel', 'testTubes', 'uiBottle', 'burette', 'stand', 'pipette', 'flask', 'tile'],
  ACID: ['testTubes', 'burner', 'splints', 'balance', 'flask', 'cylinder', 'cotton'],
  HARD: ['burette', 'stand', 'flask', 'cylinder', 'burner', 'funnel', 'washBottle'],
};

export interface SceneState {
  task: AcidsTask;
  coat: boolean;
  goggles: boolean;
  collected: Set<ApparatusId>;
  ready: boolean;
  missing: ApparatusId[];
}

const WORK_2D = /^(rinse-tubes|white-tile|pour:|crush:|tube-acid:|zero-balance|tap-marble|rinse-soap-burette|fill-soap|rinse-burette|fill-burette)/;

export function sceneFromState(s: ChemAcidsState): SceneState {
  const task = s.task ?? 'PH';
  const { collected, coat } = collectedFromLog(s.log);
  let goggles = false;
  for (const { a } of s.log) {
    if (a === 'safety:goggles') goggles = true;
    else if (a === 'safety-off:goggles') goggles = false;
  }
  if (startedIn2d(s.log, WORK_2D)) for (const id of NEEDED[task]) collected.add(id);
  const missing = NEEDED[task].filter((id) => !collected.has(id));
  return { task, coat, goggles, collected: collected as Set<ApparatusId>, ready: !missing.length, missing };
}
