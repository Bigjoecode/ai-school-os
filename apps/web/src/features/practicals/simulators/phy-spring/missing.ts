import type { PhySpringState } from '@aischool/shared';

/** What is still missing before hand-in (the lab can be handed in anyway). */
export function phySpringMissing(s: PhySpringState, _seed: number): string[] {
  const out: string[] = [];
  if (!s.task) out.push('No experiment chosen.');
  if (s.task === 'OSC') {
    const masses = new Set(s.runs.map((r) => r.load)).size;
    if (masses < 5) out.push(`Only ${masses} mass${masses === 1 ? '' : 'es'} timed (at least five are needed).`);
    if (s.rows.some((L) => s.runs.filter((r) => r.load === L).length < 2)) out.push('Some masses are timed only once (time each twice).');
    if (s.osc.some((r) => !r.m.trim() || !r.t1.trim() || !r.t.trim() || !r.T.trim() || !r.T2.trim())) out.push('Some rows of the table are not filled in.');
  } else {
    if (!s.readings.some((r) => r.load === 0)) out.push('The pointer reading with no load (R₀) is not taken.');
    if (!s.answers.r0.value.trim()) out.push('R₀ is not written down.');
    const loads = new Set(s.readings.filter((r) => r.load > 0).map((r) => r.load)).size;
    if (loads < 5) out.push(`Only ${loads} load${loads === 1 ? '' : 's'} read (at least five are needed).`);
    if (s.rows.length > 1 && !s.readings.some((r) => r.load > 0 && r.peak > r.load)) out.push('No readings taken on unloading.');
    if (s.hooke.some((r) => !r.m.trim() || !r.W.trim() || !r.Rl.trim() || !r.e.trim())) out.push('Some rows of the table are not filled in.');
  }
  if (!s.line) out.push('No straight line drawn on the graph.');
  if (!s.answers.slope.value.trim()) out.push('The slope is not worked out.');
  if (!s.answers.k.value.trim()) out.push('k is not worked out.');
  if (!s.written.precautions.trim()) out.push('No precautions written.');
  return out;
}
