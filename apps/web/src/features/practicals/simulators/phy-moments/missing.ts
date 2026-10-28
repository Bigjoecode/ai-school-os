import type { PhyMomentsState } from '@aischool/shared';

/** What is still missing before hand-in (the lab can be handed in anyway). */
export function phyMomentsMissing(s: PhyMomentsState, _seed: number): string[] {
  const out: string[] = [];
  if (!s.task) out.push('No experiment chosen.');
  if (s.g === null) out.push('The balance point G of the rule alone is not found.');
  else if (!s.answers.g.value.trim()) out.push('G is not written down.');
  if (s.readings.length < 5) out.push(`Only ${s.readings.length} reading${s.readings.length === 1 ? '' : 's'} taken (at least five are needed).`);
  if (s.table.some((r, i) => i < s.readings.length && (!r.x1.trim() || !r.x2.trim() || !r.d1.trim() || !r.d2.trim() || !r.m.trim()))) out.push('Some rows of the table are not filled in.');
  if (!s.line) out.push('No straight line drawn on the graph.');
  if (!s.answers.slope.value.trim()) out.push('The slope is not worked out.');
  if (!s.answers.mass.value.trim()) out.push('M from the slope is not worked out.');
  if (!s.answers.mean.value.trim()) out.push('The mean of M from the rows is not worked out.');
  if (!s.written.precautions.trim()) out.push('No precautions written.');
  return out;
}
