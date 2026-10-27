import { emptyChemTitrationState, type ChemTitrationState } from '@aischool/shared';
import type { LearnConfig } from '../../../lab3d-kit/learn';
import type { Spot } from '../../../lab3d-kit/store';
import { explainer } from './explain-content';
import { APPARATUS } from './scene-state';
import { SPOT } from './spots';

/** The bench as Mrs Ada sets it out for the introduction (display only, never saved). */
export const LEARN_STATE: ChemTitrationState = {
  ...emptyChemTitrationState(),
  log: [...APPARATUS.filter((a) => a.needed).map((a) => ({ t: 0, a: `collect:${a.id}` })), { t: 0, a: 'clamp-burette' }, { t: 0, a: 'safety:goggles' }],
};

const ITEM_SPOT: Record<string, Spot> = {
  burette: { target: [SPOT.buretteAxis[0], 0.45, SPOT.buretteAxis[2]], dist: 0.85, pitch: 0.12 },
  pipette: { target: [SPOT.pipette[0], 0.02, SPOT.pipette[2]], dist: 0.55, pitch: 0.55 },
  filler: { target: [SPOT.pipette[0], 0.02, SPOT.pipette[2]], dist: 0.55, pitch: 0.55 },
  flask: { target: [SPOT.flaskHome[0], 0.07, SPOT.flaskHome[2]], dist: 0.42, pitch: 0.35 },
  stand: { target: [SPOT.standBase[0], 0.35, SPOT.standBase[2]], dist: 0.95, pitch: 0.2 },
  tile: { target: [SPOT.buretteAxis[0], 0.02, SPOT.buretteAxis[2]], dist: 0.42, pitch: 0.6 },
  funnel: { target: [SPOT.funnelHome[0], 0.05, SPOT.funnelHome[2]], dist: 0.4, pitch: 0.45 },
  washBottle: { target: [SPOT.washBottle[0], 0.08, SPOT.washBottle[2]], dist: 0.5, pitch: 0.3 },
  beaker: { target: [SPOT.beaker[0], 0.04, SPOT.beaker[2]], dist: 0.42, pitch: 0.4 },
};
/** Lesson apparatus lines → the object on the bench (first match wins). */
const MATCH: [RegExp, string][] = [
  [/burette/i, 'burette'],
  [/pipette filler|filler/i, 'filler'],
  [/pipette/i, 'pipette'],
  [/conical flask|flask/i, 'flask'],
  [/retort|stand|clamp/i, 'stand'],
  [/white tile|tile/i, 'tile'],
  [/funnel/i, 'funnel'],
  [/wash bottle|distilled water/i, 'washBottle'],
  [/beaker/i, 'beaker'],
];

export const LEARN_CONFIG: LearnConfig = {
  items: MATCH.map(([match, id]) => ({ match, id, spot: ITEM_SPOT[id]! })),
  explain: explainer,
  procedure: [
    { spot: ITEM_SPOT.burette!, point: 'burette' },
    { spot: ITEM_SPOT.flask!, point: 'flask' },
  ],
  observe: { spot: ITEM_SPOT.tile!, point: 'flask' },
  observeTitle: 'At the end point',
};
