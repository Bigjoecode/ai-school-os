import type { PhyCircuitsState } from '@aischool/shared';

/** What is still missing before hand-in (the lab can be handed in anyway). */
export function phyCircuitsMissing(s: PhyCircuitsState, _seed: number): string[] {
  const out: string[] = [];
  const n = s.readings.length;
  const blank = (id: keyof PhyCircuitsState['answers']) => !s.answers[id].value.trim();
  if (!s.task) out.push('No experiment chosen.');
  if (s.task === 'BRIDGE') {
    if (n < 5) out.push(`Only ${n} balance point${n === 1 ? '' : 's'} recorded (four values of R, then X and R interchanged).`);
    if (!s.readings.some((r) => r.swap)) out.push('X and R have not been interchanged for a check.');
    if (s.bridge.some((r, i) => i < n && (!r.l.trim() || !r.m.trim() || !r.X.trim() || (!s.readings[i]!.swap && !r.q.trim())))) out.push('Some rows of the table are not filled in.');
    if (!s.line) out.push('No straight line drawn on the graph.');
    if (blank('mean')) out.push('The mean value of X is not worked out.');
    if (blank('slope')) out.push('The slope of the graph is not given.');
  } else if (s.task === 'EMF') {
    if (blank('e0')) out.push('The voltmeter reading with the key open is not recorded.');
    if (n < 4) out.push(`Only ${n} reading${n === 1 ? '' : 's'} taken (at least four are needed).`);
    if (s.emf.some((r, i) => i < n && (!r.I.trim() || !r.V.trim()))) out.push('Some rows of the table are not filled in.');
    if (!s.line) out.push('No straight line drawn on the graph.');
    if (blank('slope') || blank('emf') || blank('r')) out.push('The slope, E or r is not worked out.');
  } else if (s.task === 'SERIES') {
    const has = (a: string) => s.series.some((r) => r.arr === a);
    const gone = (['R1', 'R2', 'S', 'P'] as const).filter((a) => !has(a));
    if (gone.length) out.push(`No reading labelled for: ${gone.map((a) => ({ R1: 'R₁ alone', R2: 'R₂ alone', S: 'series', P: 'parallel' })[a]).join(', ')}.`);
    if (s.series.some((r, i) => i < n && (!r.arr || !r.V.trim() || !r.I.trim() || !r.R.trim()))) out.push('Some rows of the table are not filled in.');
    if ((['r1', 'r2', 'rs', 'rp', 'rsCalc', 'rpCalc'] as const).some(blank)) out.push('Some of the results and calculated values are not filled in.');
  }
  if (!s.written.conclusion.trim()) out.push('No conclusion written.');
  if (!s.written.precautions.trim()) out.push('No precautions written.');
  return out;
}
