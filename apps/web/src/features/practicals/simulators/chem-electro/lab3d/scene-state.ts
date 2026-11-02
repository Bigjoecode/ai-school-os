import type { ChemElectroState, ElectroTask } from '@aischool/shared';
import { collectedFromLog, startedIn2d } from '../../phy-common/lab3d/common';

/**
 * What the 3D bench shows beyond the marked state (goggles and coat, the
 * apparatus collected) is read back from the attempt's own action log, so a
 * reload or a switch between the 2D and 3D labs keeps the bench as it was.
 * No marks.
 */

export type ApparatusId =
  | 'voltameter'
  | 'plates'
  | 'sandpaper'
  | 'supply'
  | 'ammeter'
  | 'rheostat'
  | 'key'
  | 'stopwatch'
  | 'balance'
  | 'washBottle'
  | 'beakers'
  | 'strips'
  | 'bridge'
  | 'voltmeter'
  | 'mcVoltmeter'
  | 'leads'
  | 'beaker'
  | 'cylinder'
  | 'thermometer'
  | 'rod'
  | 'funnel'
  | 'filterPaper'
  | 'boat'
  | 'testTubes'
  | 'stoppers'
  | 'burner'
  | 'gradTube'
  | 'trough'
  | 'oven'
  | 'burette';
export const APPARATUS: { id: ApparatusId; label: string }[] = [
  { id: 'voltameter', label: 'Beaker (voltameter, 250 cm³)' },
  { id: 'plates', label: 'Two copper plates with clips' },
  { id: 'sandpaper', label: 'Sandpaper' },
  { id: 'supply', label: 'd.c. supply (6 V)' },
  { id: 'ammeter', label: 'Ammeter (0–1 A)' },
  { id: 'rheostat', label: 'Rheostat' },
  { id: 'key', label: 'Plug key' },
  { id: 'stopwatch', label: 'Stopwatch' },
  { id: 'balance', label: 'Top-pan balance (0.01 g)' },
  { id: 'washBottle', label: 'Wash bottle (distilled water)' },
  { id: 'beakers', label: 'Two 100 cm³ beakers' },
  { id: 'strips', label: 'Zinc and copper strips' },
  { id: 'bridge', label: 'Filter-paper strip (salt bridge)' },
  { id: 'voltmeter', label: 'High-resistance voltmeter' },
  { id: 'mcVoltmeter', label: 'Moving-coil voltmeter (ordinary)' },
  { id: 'leads', label: 'Leads with crocodile clips' },
  { id: 'beaker', label: 'Beaker (100 cm³)' },
  { id: 'cylinder', label: 'Measuring cylinder (50 cm³)' },
  { id: 'thermometer', label: 'Thermometer (0–110 °C)' },
  { id: 'rod', label: 'Glass rod' },
  { id: 'funnel', label: 'Filter funnel, paper and flask' },
  { id: 'filterPaper', label: 'Filter papers' },
  { id: 'boat', label: 'Weighing boat and spatula' },
  { id: 'testTubes', label: 'Four test tubes in a rack' },
  { id: 'stoppers', label: 'Rubber stoppers' },
  { id: 'burner', label: 'Bunsen burner, tripod and beaker' },
  { id: 'gradTube', label: 'Graduated tube (100 cm³)' },
  { id: 'trough', label: 'Trough of water' },
  { id: 'oven', label: 'Drying oven' },
  { id: 'burette', label: 'Burette' },
];
export const APPARATUS_LABEL = Object.fromEntries(APPARATUS.map((a) => [a.id, a.label])) as Record<ApparatusId, string>;
export const NEEDED: Record<ElectroTask, ApparatusId[]> = {
  ELEC: ['voltameter', 'plates', 'sandpaper', 'supply', 'ammeter', 'rheostat', 'key', 'stopwatch', 'balance', 'washBottle'],
  CELL: ['beakers', 'strips', 'sandpaper', 'bridge', 'voltmeter', 'leads'],
  DISP: ['beaker', 'cylinder', 'thermometer', 'rod', 'boat', 'balance', 'funnel', 'filterPaper', 'washBottle'],
  RUST: ['testTubes', 'stoppers', 'sandpaper', 'burner', 'gradTube', 'trough'],
};

export interface SceneState {
  task: ElectroTask;
  coat: boolean;
  goggles: boolean;
  collected: Set<ApparatusId>;
  ready: boolean;
  missing: ApparatusId[];
}

const WORK_2D = /^(sand-plates|weigh-plates|connect:|sand-strips|strips:|filings:|cuso4:|sand-nails|tube:|wool:)/;

export function sceneFromState(s: ChemElectroState): SceneState {
  const task = s.task ?? 'ELEC';
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
