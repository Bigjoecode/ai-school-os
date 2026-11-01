import { chemSaltsVariant, type ChemSaltsState } from '@aischool/shared';

/** What is still missing before hand-in (the lab can be handed in anyway). */
export function chemSaltsMissing(s: ChemSaltsState, seed: number): string[] {
  const task = s.task ?? 'SOL';
  const v = chemSaltsVariant(seed, task);
  const out: string[] = [];
  const blank = (keys: (keyof ChemSaltsState['rec'])[]) => keys.filter((k) => !s.rec[k].trim()).length;
  if (task === 'SOL') {
    if (s.sol.filteredAt === null && !s.sol.dry) out.push('No crystals have been obtained yet.');
    else if (!s.sol.weighed) out.push('The crystals have not been weighed.');
    if (blank(['acidVol', 'mass'])) out.push('The volume of acid or the mass of crystals is not recorded.');
  } else if (task === 'PPT') {
    if (!s.ppt.filtered) out.push('The precipitate has not been filtered off.');
    else if (!s.ppt.weighings.length) out.push('The dry precipitate has not been weighed.');
    if (blank(['paper', 'total1', 'ppt'])) out.push('Some masses are not recorded.');
  } else if (task === 'CHROM') {
    if (s.chrom.developed === null) out.push(s.chrom.inTank ? 'The paper is still in the tank.' : 'The chromatogram has not been run.');
    if (blank(['solvent', 'spotA', 'spotB', 'ink1'])) out.push('Some distances are not recorded.');
    if (blank(['hasA', 'hasB', 'nComp'])) out.push('You have not said which dyes the ink contains.');
  } else {
    if (!s.mp.weighedPure) out.push('The recrystallised benzoic acid has not been weighed.');
    const done = new Set(s.mp.runs.filter((r) => r.done).map((r) => r.sample));
    if (done.size < 2) out.push(`The melting range of the ${done.has('IMPURE') ? 'recrystallised' : done.has('PURE') ? 'impure' : 'two'} sample${done.size ? '' : 's'} has not been measured.`);
    if (s.mp.runs.some((r) => !r.done)) out.push('A capillary is still in the oil bath.');
    if (blank(['impure', 'pure', 'iStart', 'iEnd', 'pStart', 'pEnd'])) out.push('Some masses or melting readings are not recorded.');
  }
  const unanswered = v.tasks.filter((t) => !s.answers[t.id].value.trim());
  if (unanswered.length) out.push(`${unanswered.length} calculation${unanswered.length === 1 ? '' : 's'} not answered.`);
  if (!s.written.observation.trim()) out.push('The observations are not written.');
  if (!s.written.explain.trim()) out.push('The explanation question is not answered.');
  if (!s.written.precautions.trim()) out.push('No precautions written.');
  return out;
}
