import type { SimulatorId } from '@aischool/shared';
import { chemTitrationGrader } from './chem-titration';
import type { SimulatorGrader } from './types';

/** Every simulator's grader. A new virtual lab adds its grader here (the record type makes a missing one a compile error). */
export const GRADERS: { [Id in SimulatorId]: SimulatorGrader<Id> } = {
  'chem-titration': chemTitrationGrader,
};

export function graderFor<Id extends SimulatorId>(id: Id): SimulatorGrader<Id> {
  return GRADERS[id] as SimulatorGrader<Id>;
}

export type { AiItem, GraderOutput, SimulatorGrader } from './types';
