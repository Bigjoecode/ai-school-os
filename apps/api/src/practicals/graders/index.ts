import type { SimulatorId } from '@aischool/shared';
import { chemTitrationGrader } from './chem-titration';
import { bioMicroscopeGrader } from './bio-microscope';
import { bioSpecimensGrader } from './bio-specimens';
import { bioFoodGrader } from './bio-food-tests';
import { bioOsmosisGrader } from './bio-osmosis';
import { bioPlantGrader } from './bio-plant';
import { bioEcologyGrader } from './bio-ecology';
import { bioHumanGrader } from './bio-human';
import { bioGrowthGrader } from './bio-growth';
import { bioGeneticsGrader } from './bio-genetics';
import { chemQualitativeGrader } from './chem-qualitative';
import { chemRatesGrader } from './chem-rates';
import { chemRedoxGrader } from './chem-redox';
import { chemEnergeticsGrader } from './chem-energetics';
import { chemSaltsGrader } from './chem-salts';
import { chemElectroGrader } from './chem-electro';
import { chemAcidsGrader } from './chem-acids';
import { chemOrganicGrader } from './chem-organic';
import { chemPrepGrader } from './chem-prep';
import { phyGlassGrader } from './phy-glass-block';
import { phyOhmsGrader } from './phy-ohms-law';
import { phyMomentsGrader } from './phy-moments';
import { phyOpticsGrader } from './phy-optics';
import { phyPendulumGrader } from './phy-pendulum';
import { phySpringGrader } from './phy-spring';
import { phyCircuitsGrader } from './phy-circuits';
import { phyHeatGrader } from './phy-heat';
import { phySoundGrader } from './phy-sound';
import { phyDensityGrader } from './phy-density';
import { phyPinsGrader } from './phy-pins';
import { phyMechanicsGrader } from './phy-mechanics';
import { phyThermalGrader } from './phy-thermal';
import { phyMagnetismGrader } from './phy-magnetism';
import type { SimulatorGrader } from './types';

/** Every simulator's grader. A new virtual lab adds its grader here (the record type makes a missing one a compile error). */
export const GRADERS: { [Id in SimulatorId]: SimulatorGrader<Id> } = {
  'chem-titration': chemTitrationGrader,
  'bio-microscope': bioMicroscopeGrader,
  'bio-specimens': bioSpecimensGrader,
  'bio-food-tests': bioFoodGrader,
  'bio-osmosis': bioOsmosisGrader,
  'bio-plant': bioPlantGrader,
  'bio-ecology': bioEcologyGrader,
  'bio-human': bioHumanGrader,
  'bio-growth': bioGrowthGrader,
  'bio-genetics': bioGeneticsGrader,
  'chem-qualitative': chemQualitativeGrader,
  'chem-rates': chemRatesGrader,
  'chem-redox': chemRedoxGrader,
  'chem-energetics': chemEnergeticsGrader,
  'chem-salts': chemSaltsGrader,
  'chem-electro': chemElectroGrader,
  'chem-acids': chemAcidsGrader,
  'chem-organic': chemOrganicGrader,
  'chem-prep': chemPrepGrader,
  'phy-pendulum': phyPendulumGrader,
  'phy-ohms-law': phyOhmsGrader,
  'phy-glass-block': phyGlassGrader,
  'phy-optics': phyOpticsGrader,
  'phy-moments': phyMomentsGrader,
  'phy-spring': phySpringGrader,
  'phy-circuits': phyCircuitsGrader,
  'phy-heat': phyHeatGrader,
  'phy-sound': phySoundGrader,
  'phy-density': phyDensityGrader,
  'phy-pins': phyPinsGrader,
  'phy-mechanics': phyMechanicsGrader,
  'phy-thermal': phyThermalGrader,
  'phy-magnetism': phyMagnetismGrader,
};

export function graderFor<Id extends SimulatorId>(id: Id): SimulatorGrader<Id> {
  return GRADERS[id] as SimulatorGrader<Id>;
}

export type { AiItem, GraderOutput, SimulatorGrader } from './types';
