import { emptyChemTitrationState, type SimulatorId } from '@aischool/shared';
import { emptyPhyGlassState, emptyPhyOhmsState, emptyPhyMomentsState, emptyPhyOpticsState, emptyPhyPendulumState, emptyPhySpringState } from '@aischool/shared';
import { emptyChemQualitativeState } from '@aischool/shared';
import { emptyBioMicroscopeState, emptyBioSpecimensState } from '@aischool/shared';
import { lazy } from 'react';
import { bioMicroscopeMissing } from './bio-microscope/missing';
import { bioSpecimensMissing } from './bio-specimens/missing';
import { emptyBioFoodState } from '@aischool/shared';
import { bioFoodMissing } from './bio-food-tests/missing';
import { emptyBioOsmosisState } from '@aischool/shared';
import { bioOsmosisMissing } from './bio-osmosis/missing';
import { emptyBioPlantState } from '@aischool/shared';
import { bioPlantMissing } from './bio-plant/missing';
import { emptyBioEcologyState } from '@aischool/shared';
import { bioEcologyMissing } from './bio-ecology/missing';
import { emptyBioHumanState } from '@aischool/shared';
import { bioHumanMissing } from './bio-human/missing';
import { emptyBioGrowthState } from '@aischool/shared';
import { bioGrowthMissing } from './bio-growth/missing';
import { chemTitrationMissing } from './chem-titration/missing';
import { chemQualitativeMissing } from './chem-qualitative/missing';
import { emptyChemRatesState } from '@aischool/shared';
import { chemRatesMissing } from './chem-rates/missing';
import { emptyChemRedoxState } from '@aischool/shared';
import { chemRedoxMissing } from './chem-redox/missing';
import { emptyChemEnergeticsState } from '@aischool/shared';
import { chemEnergeticsMissing } from './chem-energetics/missing';
import { emptyChemSaltsState } from '@aischool/shared';
import { chemSaltsMissing } from './chem-salts/missing';
import { emptyChemElectroState } from '@aischool/shared';
import { emptyChemAcidsState } from '@aischool/shared';
import { chemElectroMissing } from './chem-electro/missing';
import { chemAcidsMissing } from './chem-acids/missing';
import { phyGlassMissing } from './phy-glass-block/missing';
import { phyOhmsMissing } from './phy-ohms-law/missing';
import { phyMomentsMissing } from './phy-moments/missing';
import { phyOpticsMissing } from './phy-optics/missing';
import { phyPendulumMissing } from './phy-pendulum/missing';
import { phySpringMissing } from './phy-spring/missing';
import { emptyPhyCircuitsState } from '@aischool/shared';
import { phyCircuitsMissing } from './phy-circuits/missing';
import { emptyPhyHeatState } from '@aischool/shared';
import { phyHeatMissing } from './phy-heat/missing';
import { emptyPhySoundState } from '@aischool/shared';
import { phySoundMissing } from './phy-sound/missing';
import { emptyPhyDensityState } from '@aischool/shared';
import { phyDensityMissing } from './phy-density/missing';
import { emptyPhyPinsState } from '@aischool/shared';
import { phyPinsMissing } from './phy-pins/missing';
import { emptyPhyMechanicsState } from '@aischool/shared';
import { phyMechanicsMissing } from './phy-mechanics/missing';
import { emptyPhyThermalState } from '@aischool/shared';
import { phyThermalMissing } from './phy-thermal/missing';
import type { SimulatorEntry } from './types';

/** Every virtual lab's web side. A new simulator adds its entry here (the mapped type makes a missing one a compile error). */
export const SIMULATOR_UI: { [Id in SimulatorId]: SimulatorEntry<Id> } = {
  'bio-microscope': {
    id: 'bio-microscope',
    component: lazy(() => import('./bio-microscope')),
    component3d: lazy(() => import('./bio-microscope/lab3d')),
    empty: emptyBioMicroscopeState,
    missing: bioMicroscopeMissing,
  },
  'bio-food-tests': { id: 'bio-food-tests', component: lazy(() => import('./bio-food-tests')), component3d: lazy(() => import('./bio-food-tests/lab3d')), empty: emptyBioFoodState, missing: bioFoodMissing },
  'bio-osmosis': { id: 'bio-osmosis', component: lazy(() => import('./bio-osmosis')), component3d: lazy(() => import('./bio-osmosis/lab3d')), empty: emptyBioOsmosisState, missing: bioOsmosisMissing },
  'bio-plant': { id: 'bio-plant', component: lazy(() => import('./bio-plant')), component3d: lazy(() => import('./bio-plant/lab3d')), empty: emptyBioPlantState, missing: bioPlantMissing },
  'bio-ecology': { id: 'bio-ecology', component: lazy(() => import('./bio-ecology')), component3d: lazy(() => import('./bio-ecology/lab3d')), empty: emptyBioEcologyState, missing: bioEcologyMissing },
  'bio-human': { id: 'bio-human', component: lazy(() => import('./bio-human')), component3d: lazy(() => import('./bio-human/lab3d')), empty: emptyBioHumanState, missing: bioHumanMissing },
  'bio-growth': { id: 'bio-growth', component: lazy(() => import('./bio-growth')), component3d: lazy(() => import('./bio-growth/lab3d')), empty: emptyBioGrowthState, missing: bioGrowthMissing },
  'bio-specimens': {
    id: 'bio-specimens',
    component: lazy(() => import('./bio-specimens')),
    component3d: lazy(() => import('./bio-specimens/lab3d')),
    empty: emptyBioSpecimensState,
    missing: bioSpecimensMissing,
  },
  'chem-titration': {
    id: 'chem-titration',
    component: lazy(() => import('./chem-titration')),
    component3d: lazy(() => import('./chem-titration/lab3d')),
    empty: emptyChemTitrationState,
    missing: chemTitrationMissing,
  },
  'chem-qualitative': { id: 'chem-qualitative', component: lazy(() => import('./chem-qualitative')), component3d: lazy(() => import('./chem-qualitative/lab3d')), empty: emptyChemQualitativeState, missing: chemQualitativeMissing },
  'chem-rates': { id: 'chem-rates', component: lazy(() => import('./chem-rates')), component3d: lazy(() => import('./chem-rates/lab3d')), empty: emptyChemRatesState, missing: chemRatesMissing },
  'chem-redox': { id: 'chem-redox', component: lazy(() => import('./chem-redox')), component3d: lazy(() => import('./chem-redox/lab3d')), empty: emptyChemRedoxState, missing: chemRedoxMissing },
  'chem-energetics': { id: 'chem-energetics', component: lazy(() => import('./chem-energetics')), component3d: lazy(() => import('./chem-energetics/lab3d')), empty: emptyChemEnergeticsState, missing: chemEnergeticsMissing },
  'chem-salts': { id: 'chem-salts', component: lazy(() => import('./chem-salts')), component3d: lazy(() => import('./chem-salts/lab3d')), empty: emptyChemSaltsState, missing: chemSaltsMissing },
  'chem-electro': { id: 'chem-electro', component: lazy(() => import('./chem-electro')), component3d: lazy(() => import('./chem-electro/lab3d')), empty: emptyChemElectroState, missing: chemElectroMissing },
  'chem-acids': { id: 'chem-acids', component: lazy(() => import('./chem-acids')), component3d: lazy(() => import('./chem-acids/lab3d')), empty: emptyChemAcidsState, missing: chemAcidsMissing },
  'phy-pendulum': { id: 'phy-pendulum', component: lazy(() => import('./phy-pendulum')), component3d: lazy(() => import('./phy-pendulum/lab3d')), empty: emptyPhyPendulumState, missing: phyPendulumMissing },
  'phy-ohms-law': { id: 'phy-ohms-law', component: lazy(() => import('./phy-ohms-law')), component3d: lazy(() => import('./phy-ohms-law/lab3d')), empty: emptyPhyOhmsState, missing: phyOhmsMissing },
  'phy-glass-block': { id: 'phy-glass-block', component: lazy(() => import('./phy-glass-block')), component3d: lazy(() => import('./phy-glass-block/lab3d')), empty: emptyPhyGlassState, missing: phyGlassMissing },
  'phy-optics': { id: 'phy-optics', component: lazy(() => import('./phy-optics')), component3d: lazy(() => import('./phy-optics/lab3d')), empty: emptyPhyOpticsState, missing: phyOpticsMissing },
  'phy-moments': { id: 'phy-moments', component: lazy(() => import('./phy-moments')), component3d: lazy(() => import('./phy-moments/lab3d')), empty: emptyPhyMomentsState, missing: phyMomentsMissing },
  'phy-spring': { id: 'phy-spring', component: lazy(() => import('./phy-spring')), component3d: lazy(() => import('./phy-spring/lab3d')), empty: emptyPhySpringState, missing: phySpringMissing },
  'phy-circuits': { id: 'phy-circuits', component: lazy(() => import('./phy-circuits')), component3d: lazy(() => import('./phy-circuits/lab3d')), empty: emptyPhyCircuitsState, missing: phyCircuitsMissing },
  'phy-heat': { id: 'phy-heat', component: lazy(() => import('./phy-heat')), component3d: lazy(() => import('./phy-heat/lab3d')), empty: emptyPhyHeatState, missing: phyHeatMissing },
  'phy-sound': { id: 'phy-sound', component: lazy(() => import('./phy-sound')), component3d: lazy(() => import('./phy-sound/lab3d')), empty: emptyPhySoundState, missing: phySoundMissing },
  'phy-density': { id: 'phy-density', component: lazy(() => import('./phy-density')), component3d: lazy(() => import('./phy-density/lab3d')), empty: emptyPhyDensityState, missing: phyDensityMissing },
  'phy-pins': { id: 'phy-pins', component: lazy(() => import('./phy-pins')), component3d: lazy(() => import('./phy-pins/lab3d')), empty: emptyPhyPinsState, missing: phyPinsMissing },
  'phy-mechanics': { id: 'phy-mechanics', component: lazy(() => import('./phy-mechanics')), component3d: lazy(() => import('./phy-mechanics/lab3d')), empty: emptyPhyMechanicsState, missing: phyMechanicsMissing },
  'phy-thermal': { id: 'phy-thermal', component: lazy(() => import('./phy-thermal')), component3d: lazy(() => import('./phy-thermal/lab3d')), empty: emptyPhyThermalState, missing: phyThermalMissing },
};

export function simulatorUi<Id extends SimulatorId>(id: Id): SimulatorEntry<Id> {
  return SIMULATOR_UI[id] as SimulatorEntry<Id>;
}
