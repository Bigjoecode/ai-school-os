import { emptyChemRedoxState, type ChemRedoxState, type RedoxTask } from '@aischool/shared';
import type { LearnConfig } from '../../../lab3d-kit/learn';
import type { Spot } from '../../../lab3d-kit/store';
import { explainer } from './explain-content';
import { apparatusFor } from './scene-state';
import { SPOT } from './spots';

/** The bench as Mrs Ada sets it out for the introduction (display only, never saved). */
export const learnState = (task: RedoxTask): ChemRedoxState => ({
  ...emptyChemRedoxState(),
  task,
  log: [...apparatusFor(task).filter((a) => a.needed).map((a) => ({ t: 0, a: `collect:${a.id}` })), { t: 0, a: 'clamp-burette' }, { t: 0, a: 'safety:goggles' }],
});

const ITEM_SPOT: Record<string, Spot> = {
  burette: { target: [SPOT.buretteAxis[0], 0.45, SPOT.buretteAxis[2]], dist: 0.85, pitch: 0.12 },
  pipette: { target: [SPOT.pipette[0], 0.02, SPOT.pipette[2]], dist: 0.55, pitch: 0.55 },
  filler: { target: [SPOT.pipette[0], 0.02, SPOT.pipette[2]], dist: 0.55, pitch: 0.55 },
  flask: { target: [SPOT.flaskHome[0], 0.07, SPOT.flaskHome[2]], dist: 0.42, pitch: 0.35 },
  stand: { target: [SPOT.standBase[0], 0.35, SPOT.standBase[2]], dist: 0.95, pitch: 0.2 },
  tile: { target: [SPOT.buretteAxis[0], 0.02, SPOT.buretteAxis[2]], dist: 0.42, pitch: 0.6 },
  funnel: { target: [SPOT.funnelHome[0], 0.05, SPOT.funnelHome[2]], dist: 0.4, pitch: 0.45 },
  washBottle: { target: [SPOT.washBottle[0], 0.08, SPOT.washBottle[2]], dist: 0.5, pitch: 0.3 },
  cylinder: { target: [SPOT.cylinder[0], 0.1, SPOT.cylinder[2]], dist: 0.5, pitch: 0.3 },
  tripod: { target: [SPOT.tripod[0], 0.15, SPOT.tripod[2]], dist: 0.6, pitch: 0.3 },
  thermometer: { target: [SPOT.tripod[0], 0.05, SPOT.tripod[2] + 0.12], dist: 0.45, pitch: 0.5 },
  acids: { target: [SPOT.acids[0] + 0.08, 0.06, SPOT.acids[2]], dist: 0.5, pitch: 0.35 },
  indicators: { target: [SPOT.indicators[0] + 0.06, 0.05, SPOT.indicators[2]], dist: 0.42, pitch: 0.4 },
};
/** Lesson apparatus and material lines → the object on the bench (first match wins). */
const MATCH: [RegExp, string][] = [
  [/burette/i, 'burette'],
  [/pipette filler|filler/i, 'filler'],
  [/pipette/i, 'pipette'],
  [/conical flask|flask/i, 'flask'],
  [/retort|stand|clamp/i, 'stand'],
  [/white tile|tile/i, 'tile'],
  [/funnel/i, 'funnel'],
  [/wash bottle|distilled water/i, 'washBottle'],
  [/thermometer/i, 'thermometer'],
  [/bunsen|burner|tripod|gauze|water bath/i, 'tripod'],
  [/measuring cylinder/i, 'cylinder'],
];

export function learnConfig(task: RedoxTask): LearnConfig {
  return {
    items: MATCH.map(([match, id]) => ({ match, id, spot: ITEM_SPOT[id]! })),
    explain: explainer,
    procedure: [
      { spot: ITEM_SPOT.burette!, point: 'burette' },
      task === 'OX' ? { spot: ITEM_SPOT.tripod!, point: 'tripod' } : task === 'IOD' ? { spot: ITEM_SPOT.indicators!, point: 'ind:STARCH' } : { spot: ITEM_SPOT.acids!, point: 'acid:H2SO4' },
    ],
    observe: { spot: ITEM_SPOT.tile!, point: 'flask' },
    observeTitle: 'At the end point',
  };
}
