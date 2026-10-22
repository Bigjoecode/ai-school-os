import { chemTitrationVariant, type ChemTitrationState } from '@aischool/shared';

/** What is still missing before hand-in (the lab can be handed in anyway). */
export function chemTitrationMissing(s: ChemTitrationState, seed: number): string[] {
  const v = chemTitrationVariant(seed);
  const out: string[] = [];
  const done = s.runs.filter((r) => r.done);
  if (!done.length) out.push('No titration has been completed.');
  else if (done.filter((r) => r.kind === 'ACCURATE').length < 2) out.push('Fewer than two accurate titrations.');
  if (s.runs.some((r) => !r.done && r.initial !== null)) out.push('A titration is still open: finish it so its final reading counts.');
  if (done.some((r) => { const row = s.table[s.runs.indexOf(r)]; return !row?.initial.trim() || !row.final.trim() || !row.titre.trim(); })) out.push('Some readings or titres are not recorded in the table.');
  const blank = v.tasks.filter((t) => !s.answers[t.id].value.trim());
  if (blank.length) out.push(`${blank.length} calculation${blank.length === 1 ? '' : 's'} not answered.`);
  if (!s.written.endpoint.trim()) out.push('The end-point colour change is not written.');
  if (!s.written.precautions.trim()) out.push('No precautions written.');
  return out;
}
