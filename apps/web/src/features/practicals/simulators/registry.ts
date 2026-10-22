import { emptyChemTitrationState, type SimulatorId } from '@aischool/shared';
import { lazy } from 'react';
import { chemTitrationMissing } from './chem-titration/missing';
import type { SimulatorEntry } from './types';

/** Every virtual lab's web side. A new simulator adds its entry here (the mapped type makes a missing one a compile error). */
export const SIMULATOR_UI: { [Id in SimulatorId]: SimulatorEntry<Id> } = {
  'chem-titration': { id: 'chem-titration', component: lazy(() => import('./chem-titration')), empty: emptyChemTitrationState, missing: chemTitrationMissing },
};

export function simulatorUi<Id extends SimulatorId>(id: Id): SimulatorEntry<Id> {
  return SIMULATOR_UI[id] as SimulatorEntry<Id>;
}
