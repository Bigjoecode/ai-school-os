import type { ChemSaltsState, SaltsTask } from '@aischool/shared';
import { collectedFromLog, startedIn2d } from '../../phy-common/lab3d/common';

/**
 * What the 3D bench shows beyond the marked state (goggles and coat, the
 * apparatus collected) is read back from the attempt's own action log, so a
 * reload or a switch between the 2D and 3D labs keeps the bench as it was.
 * What stands on the gauze and the burner are log notes too (the shared
 * actions read them: they drive the heating). No marks.
 */

export type ApparatusId =
  | 'burner'
  | 'tripod'
  | 'beaker'
  | 'cylinder'
  | 'spatula'
  | 'rod'
  | 'funnel'
  | 'dish'
  | 'filterPaper'
  | 'balance'
  | 'washBottle'
  | 'oven'
  | 'tank'
  | 'paper'
  | 'ruler'
  | 'capillary'
  | 'iceBath'
  | 'thermometer'
  | 'oilBath'
  | 'testTubes'
  | 'burette';
export const APPARATUS: { id: ApparatusId; label: string }[] = [
  { id: 'beaker', label: 'Beaker (100 cm³)' },
  { id: 'cylinder', label: 'Measuring cylinder (50 cm³)' },
  { id: 'rod', label: 'Glass rod' },
  { id: 'spatula', label: 'Spatula' },
  { id: 'funnel', label: 'Filter funnel, paper and conical flask' },
  { id: 'dish', label: 'Evaporating dish' },
  { id: 'filterPaper', label: 'Filter papers (for drying)' },
  { id: 'burner', label: 'Bunsen burner' },
  { id: 'tripod', label: 'Tripod and gauze' },
  { id: 'balance', label: 'Top-pan balance (0.01 g)' },
  { id: 'washBottle', label: 'Wash bottle (distilled water)' },
  { id: 'oven', label: 'Drying oven (warm place)' },
  { id: 'tank', label: 'Chromatography tank with lid' },
  { id: 'paper', label: 'Chromatography paper strip' },
  { id: 'ruler', label: '30 cm ruler' },
  { id: 'capillary', label: 'Capillary tubes' },
  { id: 'iceBath', label: 'Ice bath' },
  { id: 'thermometer', label: 'Thermometer (0–200 °C)' },
  { id: 'oilBath', label: 'Oil bath (melting point)' },
  { id: 'testTubes', label: 'Test tubes in a rack' },
  { id: 'burette', label: 'Burette' },
];
export const APPARATUS_LABEL = Object.fromEntries(APPARATUS.map((a) => [a.id, a.label])) as Record<ApparatusId, string>;
export const NEEDED: Record<SaltsTask, ApparatusId[]> = {
  SOL: ['beaker', 'cylinder', 'spatula', 'rod', 'burner', 'tripod', 'funnel', 'dish', 'filterPaper', 'balance', 'washBottle'],
  PPT: ['beaker', 'cylinder', 'rod', 'funnel', 'balance', 'washBottle', 'oven'],
  CHROM: ['tank', 'paper', 'ruler', 'capillary'],
  MP: ['beaker', 'burner', 'tripod', 'balance', 'funnel', 'rod', 'iceBath', 'filterPaper', 'capillary', 'thermometer', 'oilBath', 'washBottle'],
};

export interface SceneState {
  task: SaltsTask;
  coat: boolean;
  goggles: boolean;
  collected: Set<ApparatusId>;
  ready: boolean;
  missing: ApparatusId[];
}

const WORK_2D = /^(acid:|add-cuo|cat:|an:|line:|spot:|solvent:|weigh-impure|add-water|pack:)/;

export function sceneFromState(s: ChemSaltsState): SceneState {
  const task = s.task ?? 'SOL';
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
