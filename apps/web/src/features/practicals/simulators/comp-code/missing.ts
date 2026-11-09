import { compCodeVariant, type CompCodeState } from '@aischool/shared';
import { compRecordSteps, compWorkSteps } from './steps';

/** What is still missing before hand-in (the lab can be handed in anyway). */
export function compCodeMissing(s: CompCodeState, seed: number): string[] {
  if (!s.task) return ['Nothing done yet.'];
  const v = compCodeVariant(seed, s.task);
  return [...compWorkSteps(v, s).filter((x) => !x.done).slice(0, 5), ...compRecordSteps(v, s).filter((x) => !x.done)].map((x) => `Not done: ${x.label.charAt(0).toLowerCase()}${x.label.slice(1)}.`);
}
