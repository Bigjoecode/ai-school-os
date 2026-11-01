import { chemEnergeticsVariant, type ChemEnergeticsState } from '@aischool/shared';

/** What is still missing before hand-in (the lab can be handed in anyway). */
export function chemEnergeticsMissing(s: ChemEnergeticsState, seed: number): string[] {
  const task = s.task ?? 'NEUT';
  const v = chemEnergeticsVariant(seed, task);
  const out: string[] = [];
  if (task === 'SOLY') {
    const done = s.soly.runs.filter((r) => r.done && r.seen !== null);
    if (!done.length) out.push('No saturation temperature has been found.');
    else if (done.length < 4) out.push(`Only ${done.length} saturation temperature${done.length === 1 ? '' : 's'}: find at least four.`);
    if (s.soly.runs.some((r) => !r.done)) out.push('A run is still open: let the tube cool until crystals appear, or pour it away.');
    if (done.some((r) => !s.solyTable[s.soly.runs.indexOf(r)]?.temp.trim() || !s.solyTable[s.soly.runs.indexOf(r)]?.sol.trim())) out.push('Some temperatures or solubilities are not recorded in the table.');
    if (!s.curve) out.push('The solubility curve is not drawn.');
  } else {
    const kind = task === 'NEUT' ? 'NEUT' : 'SALT';
    const main = s.runs.filter((r) => r.done && r.kind === kind);
    if (!main.length) out.push(task === 'NEUT' ? 'The neutralisation has not been done.' : 'NH₄NO₃ has not been dissolved.');
    if (task === 'SOLN' && !s.runs.some((r) => r.done && r.kind === 'NAOH')) out.push('The NaOH comparison has not been done.');
    if (s.runs.some((r) => !r.done && r.mixed)) out.push('A run is still open: finish it so its highest (lowest) temperature counts.');
    if (s.runs.some((r, i) => r.done && (!s.table[i]?.a.trim() || !s.table[i]?.extreme.trim() || !s.table[i]?.dT.trim()))) out.push('Some temperatures are not recorded in the table.');
    if (!s.nature.main) out.push(task === 'NEUT' ? 'You have not said whether the reaction is exothermic or endothermic.' : 'You have not said whether dissolving NH₄NO₃ is exothermic or endothermic.');
  }
  const blank = v.tasks.filter((t) => !s.answers[t.id].value.trim());
  if (blank.length) out.push(`${blank.length} calculation${blank.length === 1 ? '' : 's'} not answered.`);
  if (!s.written.explanation.trim()) out.push('The explanation question is not answered.');
  if (!s.written.precautions.trim()) out.push('No precautions written.');
  return out;
}
