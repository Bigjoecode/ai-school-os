import type { PhyGlassState } from '@aischool/shared';

/** What is still missing before hand-in (the lab can be handed in anyway). */
export function phyGlassMissing(s: PhyGlassState, _seed: number): string[] {
  const out: string[] = [];
  const done = s.traces.filter((t) => t.joined);
  if (done.length < 5) out.push(`Only ${done.length} ray${done.length === 1 ? '' : 's'} traced (at least five angles are needed).`);
  if (s.traces.some((t) => !t.joined)) out.push('A trace is not finished: remove the block and join the points.');
  if (s.table.some((r, i) => s.traces[i]?.joined && (!r.i.trim() || !r.r.trim() || !r.sini.trim() || !r.sinr.trim()))) out.push('Some rows of the table are not filled in.');
  if (!s.line) out.push('No straight line drawn on the graph.');
  if (!s.answers.slope.value.trim()) out.push('The slope is not given.');
  if (!s.answers.n.value.trim()) out.push('The refractive index is not stated.');
  if (!s.written.precautions.trim()) out.push('No precautions written.');
  return out;
}
