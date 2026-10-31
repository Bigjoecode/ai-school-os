import type { PhyHeatState } from '@aischool/shared';

/** What is still missing before hand-in (the lab can be handed in anyway). */
export function phyHeatMissing(s: PhyHeatState, _seed: number): string[] {
  const out: string[] = [];
  if (!s.task) return ['No experiment chosen.'];
  const t = s.table;
  if (s.task === 'COOL') {
    if (s.cool.length < 15) out.push(`Only ${s.cool.length} reading${s.cool.length === 1 ? '' : 's'} on the cooling curve (at least 15 are needed).`);
    if (s.cool.some((r) => !r.t.trim() || !r.th.trim())) out.push('Some rows of the table are not filled in.');
    if (!s.curve) out.push('No smooth curve drawn through the points.');
    if (!s.line) out.push('The plateau is not marked on the graph.');
    if (!s.answers.result.value.trim()) out.push('The melting point is not written down.');
    if (!s.answers.q1.value.trim()) out.push('The cooling rate is not worked out.');
  } else {
    const fields = s.task === 'MIX' ? (['mc', 'm1', 'mw', 'mb', 'th1', 'th2', 'th3'] as const) : (['mc', 'm1', 'mw', 'room', 'th1', 'th2', 'm2', 'mi'] as const);
    const empty = fields.filter((f) => !t[f].trim()).length;
    if (empty) out.push(`${empty} entr${empty === 1 ? 'y' : 'ies'} of the table not filled in.`);
    if (s.weighs.length < 3) out.push(`Only ${s.weighs.length} weighing${s.weighs.length === 1 ? '' : 's'} recorded.`);
    if (!s.answers.q1.value.trim() || !s.answers.q2.value.trim()) out.push('The heat terms are not worked out.');
    if (!s.answers.result.value.trim()) out.push(s.task === 'MIX' ? 'c is not worked out.' : 'L is not worked out.');
  }
  if (!s.written.precautions.trim()) out.push('No precautions written.');
  return out;
}
