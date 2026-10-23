import type { PhyOhmsState } from '@aischool/shared';

/** What is still missing before hand-in (the lab can be handed in anyway). */
export function phyOhmsMissing(s: PhyOhmsState, _seed: number): string[] {
  const out: string[] = [];
  const wire = s.task === 'WIRE';
  if (!s.task) out.push('No experiment chosen.');
  if (s.readings.length < 5) out.push(`Only ${s.readings.length} reading${s.readings.length === 1 ? '' : 's'} taken (at least five are needed).`);
  if (s.table.some((r, i) => i < s.readings.length && ((wire && !r.L.trim()) || !r.I.trim() || !r.V.trim() || !r.R.trim()))) out.push('Some rows of the table are not filled in.');
  if (!s.line) out.push('No straight line drawn on the graph.');
  if (wire && !s.answers.area.value.trim()) out.push('The cross-sectional area A is not worked out.');
  if (!s.answers.slope.value.trim()) out.push('The slope is not given.');
  if (!s.answers.result.value.trim()) out.push(wire ? 'The resistivity is not worked out.' : 'The resistance R is not stated.');
  if (!s.written.conclusion.trim()) out.push('No conclusion written.');
  if (!s.written.precautions.trim()) out.push('No precautions written.');
  return out;
}
