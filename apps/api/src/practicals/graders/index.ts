import type { SimulatorId } from '@aischool/shared';
import { chemTitrationGrader } from './chem-titration';
import { bioMicroscopeGrader } from './bio-microscope';
import { bioSpecimensGrader } from './bio-specimens';
import { bioFoodGrader } from './bio-food-tests';
import { chemQualitativeGrader } from './chem-qualitative';
import { chemRatesGrader } from './chem-rates';
import { phyGlassGrader } from './phy-glass-block';
import { phyOhmsGrader } from './phy-ohms-law';
import { phyMomentsGrader } from './phy-moments';
import { phyOpticsGrader } from './phy-optics';
import { phyPendulumGrader } from './phy-pendulum';
import { phySpringGrader } from './phy-spring';
import type { SimulatorGrader } from './types';

/** Every simulator's grader. A new virtual lab adds its grader here (the record type makes a missing one a compile error). */
export const GRADERS: { [Id in SimulatorId]: SimulatorGrader<Id> } = {
  'chem-titration': chemTitrationGrader,
  'bio-microscope': bioMicroscopeGrader,
  'bio-specimens': bioSpecimensGrader,
  'bio-food-tests': bioFoodGrader,
  'chem-qualitative': chemQualitativeGrader,
  'chem-rates': chemRatesGrader,
  'phy-pendulum': phyPendulumGrader,
  'phy-ohms-law': phyOhmsGrader,
  'phy-glass-block': phyGlassGrader,
  'phy-optics': phyOpticsGrader,
  'phy-moments': phyMomentsGrader,
  'phy-spring': phySpringGrader,
};

export function graderFor<Id extends SimulatorId>(id: Id): SimulatorGrader<Id> {
  return GRADERS[id] as SimulatorGrader<Id>;
}

export type { AiItem, GraderOutput, SimulatorGrader } from './types';
