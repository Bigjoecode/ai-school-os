import type { PhySoundState } from '@aischool/shared';

/** What is still missing before hand-in (the lab can be handed in anyway). */
export function phySoundMissing(s: PhySoundState, _seed: number): string[] {
  const out: string[] = [];
  if (!s.task) out.push('No experiment chosen.');
  const forks = new Set(s.readings.map((r) => r.fork)).size;
  if (s.task === 'SONO') {
    if (forks < 4) out.push(`Only ${forks} fork${forks === 1 ? '' : 's'} used (at least four are needed).`);
    if (s.sono.some((r) => !r.f.trim() || !r.l.trim() || !r.inv.trim())) out.push('Some rows of the table are not filled in.');
    if (!s.answers.v.value.trim()) out.push('v is not worked out.');
    if (!s.answers.T.value.trim()) out.push('The tension T is not worked out.');
    if (!s.answers.mu.value.trim()) out.push('μ is not worked out.');
  } else {
    if (forks < 5) out.push(`Only ${forks} fork${forks === 1 ? '' : 's'} used (at least five are needed).`);
    if (s.tube.some((r) => !r.f.trim() || !r.inv.trim() || !r.l1.trim())) out.push('Some rows of the table are not filled in.');
    const i512 = s.rows.indexOf(512);
    if (i512 < 0 || !s.tube[i512]?.l2.trim()) out.push('The second resonance l₂ for 512 Hz is not recorded.');
    if (!s.answers.v.value.trim()) out.push('v is not worked out.');
    if (!s.answers.e.value.trim()) out.push('The end correction e is not worked out.');
  }
  if (!s.line) out.push('No straight line drawn on the graph.');
  if (!s.answers.slope.value.trim()) out.push('The slope is not worked out.');
  if (!s.written.precautions.trim()) out.push('No precautions written.');
  return out;
}
