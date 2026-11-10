import { geoMapsVariant, type GeoMapsState } from '@aischool/shared';

/** What is still missing before hand-in (the lab can be handed in anyway). */
export function geoMapsMissing(s: GeoMapsState, seed: number): string[] {
  if (!s.task) return ['No exercise chosen.'];
  const { def } = geoMapsVariant(seed, s.task);
  const out = def.steps
    .filter((x) => !x.done(s))
    .slice(0, 4)
    .map((x) => `Not done: ${x.label.charAt(0).toLowerCase()}${x.label.slice(1)}.`);
  const blank = def.fields.filter((f) => !(s.entries[f.id] ?? '').trim()).length;
  if (blank) out.push(`${blank} answer box${blank === 1 ? ' is' : 'es are'} empty.`);
  const q = def.choices.filter((c) => !s.choices[c.id]).length;
  if (q) out.push(`${q} question${q === 1 ? ' is' : 's are'} not answered.`);
  if (!s.written.precautions.trim()) out.push('No precautions written.');
  if (!s.written.explain.trim()) out.push('No explanation written.');
  return out;
}
