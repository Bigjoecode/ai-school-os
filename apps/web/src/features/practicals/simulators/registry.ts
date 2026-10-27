import { emptyChemTitrationState, type SimulatorId } from '@aischool/shared';
import { emptyPhyGlassState, emptyPhyOhmsState, emptyPhyPendulumState } from '@aischool/shared';
import { emptyChemQualitativeState } from '@aischool/shared';
import { emptyBioMicroscopeState, emptyBioSpecimensState } from '@aischool/shared';
import { lazy } from 'react';
import { bioMicroscopeMissing } from './bio-microscope/missing';
import { bioSpecimensMissing } from './bio-specimens/missing';
import { chemTitrationMissing } from './chem-titration/missing';
import { chemQualitativeMissing } from './chem-qualitative/missing';
import { phyGlassMissing } from './phy-glass-block/missing';
import { phyOhmsMissing } from './phy-ohms-law/missing';
import { phyPendulumMissing } from './phy-pendulum/missing';
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
  'phy-pendulum': { id: 'phy-pendulum', component: lazy(() => import('./phy-pendulum')), component3d: lazy(() => import('./phy-pendulum/lab3d')), empty: emptyPhyPendulumState, missing: phyPendulumMissing },
  'phy-ohms-law': { id: 'phy-ohms-law', component: lazy(() => import('./phy-ohms-law')), component3d: lazy(() => import('./phy-ohms-law/lab3d')), empty: emptyPhyOhmsState, missing: phyOhmsMissing },
  'phy-glass-block': { id: 'phy-glass-block', component: lazy(() => import('./phy-glass-block')), component3d: lazy(() => import('./phy-glass-block/lab3d')), empty: emptyPhyGlassState, missing: phyGlassMissing },
};

export function simulatorUi<Id extends SimulatorId>(id: Id): SimulatorEntry<Id> {
  return SIMULATOR_UI[id] as SimulatorEntry<Id>;
}
