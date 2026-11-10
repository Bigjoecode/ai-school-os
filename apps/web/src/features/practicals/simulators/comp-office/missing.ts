import { coChecks, compOfficeVariant, type CompOfficeState } from '@aischool/shared';

/** What is still missing before hand-in (the lab can be handed in anyway). */
export function compOfficeMissing(s: CompOfficeState, seed: number): string[] {
  if (!s.task) return ['No practical chosen.'];
  const checks = coChecks(compOfficeVariant(seed, s.task), s);
  const out = checks
    .filter((c) => !c.done && c.crit !== 'calculation')
    .slice(0, 4)
    .map((c) => `Not done: ${c.label.charAt(0).toLowerCase()}${c.label.slice(1)}.`);
  const boxes = checks.filter((c) => c.crit === 'calculation' && !(s.answers[c.id.slice(2)] ?? '').trim()).length;
  if (boxes) out.push(`${boxes} answer box${boxes === 1 ? ' is' : 'es are'} empty.`);
  if (!s.written.precautions.trim()) out.push('No precautions written.');
  if (!s.written.explain.trim()) out.push('No explanation written.');
  return out;
}
