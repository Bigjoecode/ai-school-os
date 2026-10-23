import { bioSpecimensVariant, type BioSpecimensState } from '@aischool/shared';

/** What is still missing before hand-in (the lab can be handed in anyway). */
export function bioSpecimensMissing(s: BioSpecimensState, seed: number): string[] {
  if (!s.set) return ['No specimens have been chosen.'];
  const v = bioSpecimensVariant(seed, s.set);
  const out: string[] = [];
  const e = (i: number) => s.entries[i];
  const names = v.specimens.filter((_, i) => !e(i)?.name.trim()).map((x) => x.letter);
  if (names.length) out.push(`Not named: ${names.join(', ')}.`);
  const cls = v.specimens.filter((_, i) => !e(i)?.classification).map((x) => x.letter);
  if (cls.length) out.push(`Not classified: ${cls.join(', ')}.`);
  const lab = v.specimens.filter((x, i) => x.def.parts.some((_, k) => !e(i)?.labels[k])).map((x) => x.letter);
  if (lab.length) out.push(`Labels missing on: ${lab.join(', ')}.`);
  const feat = v.specimens.filter((_, i) => !e(i)?.features.trim()).map((x) => x.letter);
  if (feat.length) out.push(`No features written for: ${feat.join(', ')}.`);
  const fn = v.specimens.filter((_, i) => !e(i)?.functions.trim()).map((x) => x.letter);
  if (fn.length) out.push(`No function or adaptation for: ${fn.join(', ')}.`);
  if (!s.measure.length.value.trim()) out.push('The measurement is not recorded.');
  if (!s.measure.magnification.value.trim()) out.push('The magnification is not worked out.');
  if (!s.compare.similarities.trim() || !s.compare.differences.trim()) out.push('The comparison is not complete.');
  if (!s.drawing.length) out.push('The drawing checklist is not done.');
  return out;
}
