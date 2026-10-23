import type { PhyPendulumState } from '@aischool/shared';

/** What is still missing before hand-in (the lab can be handed in anyway). */
export function phyPendulumMissing(s: PhyPendulumState, _seed: number): string[] {
  const out: string[] = [];
  const lengths = new Set(s.runs.map((r) => Math.round(r.thread)));
  if (!s.runs.length) out.push('No timing has been recorded.');
  else if (lengths.size < 5) out.push(`Timings at only ${lengths.size} length${lengths.size === 1 ? '' : 's'} (at least five are needed).`);
  if (s.table.some((r, i) => i < s.runs.length && (!r.l.trim() || !r.t.trim() || !r.T.trim() || !r.T2.trim()))) out.push('Some rows of the table are not filled in.');
  if (!s.line) out.push('No straight line drawn on the graph.');
  if (!s.answers.slope.value.trim()) out.push('The slope is not given.');
  if (!s.answers.g.value.trim()) out.push('g is not worked out.');
  if (!s.written.precautions.trim()) out.push('No precautions written.');
  return out;
}
