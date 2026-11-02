import { HARD_SAMPLES, IND_SOLS, PH_SAMPLES, chemAcidsVariant, hardOpenRun, indOpenRun, type ChemAcidsState } from '@aischool/shared';

/** What is still missing before hand-in (the lab can be handed in anyway). */
export function chemAcidsMissing(s: ChemAcidsState, seed: number): string[] {
  const task = s.task ?? 'PH';
  const v = chemAcidsVariant(seed, task);
  const out: string[] = [];
  const blank = (keys: string[]) => keys.filter((k) => !(s.rec[k] ?? '').trim()).length;
  if (task === 'PH') {
    const untested = PH_SAMPLES.filter((k) => !s.ph.tubes[k].drops).length;
    if (untested) out.push(`${untested} sample${untested === 1 ? ' has' : 's have'} not been tested with the indicator.`);
    if (blank(PH_SAMPLES.flatMap((k) => [`ph${k}`, `cl${k}`]))) out.push('Some pH values or classes are not recorded.');
  } else if (task === 'IND') {
    if (IND_SOLS.some((k) => !s.ind.tests[k].ext || !s.ind.tests[k].ui)) out.push('The extract or universal indicator has not been tried in all five solutions.');
    if (indOpenRun(s.ind)) out.push('A titration is still in progress: finish it at the end point.');
    if (s.ind.runs.filter((r) => r.done).length < 4) out.push('Fewer than two titrations with each indicator.');
    if (blank([...IND_SOLS.flatMap((k) => [`ex${k}`, `ui${k}`]), 'rangeLo', 'rangeHi', 'mo1f', 'mo2f', 'z1f', 'z2f'])) out.push('Some colours, pH values or burette readings are not recorded.');
  } else if (task === 'ACID') {
    if (!s.acid.added) out.push('The marble has not been added to the acid in the flask.');
    else if (!s.acid.weighings.length) out.push('The flask has not been weighed after the reaction.');
    if (blank(['gasMG', 'gasZN', 'gasCU', 'gasCACO3', 'cuo', 'm1', 'm2', 'm3'])) out.push('Some gases, colours or masses are not recorded.');
  } else {
    if (hardOpenRun(s.hard)) out.push('A sample is still in the flask: finish it when the lather lasts.');
    const done = HARD_SAMPLES.filter((k) => s.hard.runs.some((r) => r.done && r.sample === k && !r.boiled)).length;
    if (done < 5) out.push(`${5 - done} sample${5 - done === 1 ? '' : 's'} not tested with soap.`);
    if (blank(['vDIST', 'vRAIN', 'vTAP', 'vX', 'vY', 'bTAP', 'bX', 'bY', 'hardest', 'permSample'])) out.push('Some volumes of soap or answers are not recorded.');
  }
  const unanswered = v.tasks.filter((t) => !s.answers[t.id].value.trim());
  if (unanswered.length) out.push(`${unanswered.length} calculation${unanswered.length === 1 ? '' : 's'} not answered.`);
  if (!s.written.observation.trim()) out.push('The observations are not written.');
  if (!s.written.explain.trim()) out.push('The explanation question is not answered.');
  if (!s.written.precautions.trim()) out.push('No precautions written.');
  return out;
}
