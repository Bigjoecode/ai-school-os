import { chemQualitativeVariant, type ChemQualitativeState } from '@aischool/shared';

/** What is still missing before hand-in (the lab can be handed in anyway). */
export function chemQualitativeMissing(s: ChemQualitativeState, seed: number): string[] {
  const v = chemQualitativeVariant(seed);
  const out: string[] = [];
  if (!s.tests.length) out.push('No tests have been carried out.');
  const noObs = s.tests.filter((_, i) => !s.table[i]?.observation.trim()).length;
  if (noObs) out.push(`${noObs} test${noObs === 1 ? ' has' : 's have'} no observation written.`);
  const noInf = s.tests.filter((_, i) => {
    const r = s.table[i];
    return !r || (!r.present.length && !r.absent.length && !r.gases.length && !r.note.trim());
  }).length;
  if (noInf) out.push(`${noInf} test${noInf === 1 ? ' has' : 's have'} no inference.`);
  if (s.tests.length && !s.tests.some((t) => t.reagent === 'HEAT')) out.push('The solid has not been heated.');
  const slots = v.kind === 'SALT' ? (['A'] as const) : (['A', 'B'] as const);
  if (slots.some((k) => !s.answer[k].cation || !s.answer[k].anion)) out.push(v.kind === 'SALT' ? 'The cation and anion of C are not both named.' : 'The ions of the filtrate and the residue are not all named.');
  if (!s.answer.equation.trim()) out.push('No ionic equation written.');
  return out;
}
