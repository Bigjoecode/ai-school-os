import { PREP_MCQ, PREP_READINGS, PREP_ROWS, chemPrepVariant, prepTubeTask, prepTubes, type ChemPrepState } from '@aischool/shared';
import { prepBenchSteps } from './steps';

/** What is still missing before hand-in (the lab can be handed in anyway). */
export function chemPrepMissing(s: ChemPrepState, seed: number): string[] {
  const task = s.task;
  if (!task) return ['No experiment chosen.'];
  const v = chemPrepVariant(seed, task);
  const out = prepBenchSteps(v, s)
    .filter((x) => !x.done)
    .slice(0, 4)
    .map((x) => `Not done: ${x.label.charAt(0).toLowerCase()}${x.label.slice(1)}.`);
  const rows = prepTubeTask(task) ? prepTubes(task, s.events).map((_, i) => `t${i}`) : PREP_ROWS[task];
  const noObs = rows.filter((r) => !s.records[r]?.observation.trim()).length;
  if (noObs) out.push(`${noObs} observation${noObs === 1 ? ' is' : 's are'} not written.`);
  const boxes = PREP_READINGS[task].filter((x) => !(s.readings[x.id] ?? '').trim()).length;
  if (boxes) out.push(`${boxes} reading or answer box${boxes === 1 ? ' is' : 'es are'} empty.`);
  const q = PREP_MCQ[task].filter((x) => !(s.choices[x.id] ?? []).length).length;
  if (q) out.push(`${q} deduction question${q === 1 ? ' is' : 's are'} not answered.`);
  if (!s.written.precautions.trim()) out.push('No precautions written.');
  if (!s.written.explain.trim()) out.push('No explanation written.');
  return out;
}
