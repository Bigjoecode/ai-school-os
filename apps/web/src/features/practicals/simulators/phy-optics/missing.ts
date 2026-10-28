import type { PhyOpticsState } from '@aischool/shared';

/** What is still missing before hand-in (the lab can be handed in anyway). */
export function phyOpticsMissing(s: PhyOpticsState, _seed: number): string[] {
  const out: string[] = [];
  if (!s.task) out.push('No experiment chosen.');
  if (s.rough === null) out.push('No rough focal length found (focus the distant window first).');
  else if (!s.answers.rough.value.trim()) out.push('The rough focal length is not written down.');
  if (s.readings.length < 5) out.push(`Only ${s.readings.length} reading${s.readings.length === 1 ? '' : 's'} taken (at least five values of u are needed).`);
  if (s.table.some((r, i) => i < s.readings.length && (!r.u.trim() || !r.v.trim() || !r.iu.trim() || !r.iv.trim()))) out.push('Some rows of the table are not filled in.');
  if (!s.line) out.push('No straight line drawn on the graph.');
  if (!s.answers.xint.value.trim() || !s.answers.yint.value.trim()) out.push('The intercepts are not given.');
  if (!s.answers.f.value.trim()) out.push('The focal length f is not worked out.');
  if (!s.written.precautions.trim()) out.push('No precautions written.');
  return out;
}
