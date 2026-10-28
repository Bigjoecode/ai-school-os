import type { ChemRatesState } from '@aischool/shared';

/** What is still missing before hand-in (the lab can be handed in anyway). */
export function chemRatesMissing(s: ChemRatesState, _seed: number): string[] {
  const out: string[] = [];
  if (!s.task) out.push('No experiment chosen.');
  if (s.task === 'CROSS') {
    const conc = s.crossRuns.filter((r) => r.done && r.kind === 'CONC').length;
    const temp = s.crossRuns.filter((r) => r.done && r.kind === 'TEMP').length;
    if (conc < 5) out.push(`Only ${conc} concentration run${conc === 1 ? '' : 's'} timed (five are needed).`);
    if (temp < 3) out.push(`Only ${temp} temperature run${temp === 1 ? '' : 's'} timed (at least three).`);
    if (s.crossRuns.some((r) => !r.done)) out.push('A run is still in the flask: record or pour it away.');
    if (s.cross.some((r, i) => s.crossRuns[i]?.done && (!r.t.trim() || !r.inv.trim() || (s.crossRuns[i]!.kind === 'CONC' ? !r.v.trim() : !r.th.trim())))) out.push('Some rows of the table are not filled in.');
    if (!s.line) out.push('No straight line drawn on the graph.');
    if (!s.answers.slope.value.trim()) out.push('The slope is not worked out.');
    if (!s.answers.tQuery.value.trim()) out.push('The time read from the graph is not given.');
    if (!s.answers.factor.value.trim()) out.push('The effect of a 10 °C rise is not worked out.');
  } else {
    const done = s.mgRuns.filter((r) => r?.done).length;
    if (done < 2) out.push(`Only ${done} of the two runs finished.`);
    if (s.mgRuns.some((r) => r && !r.done && r.dropped)) out.push('A run is still going: finish it so its readings count.');
    if (s.mg.some((r) => !r.t.trim())) out.push('Some times are missing from the table.');
    if (s.readings.length && s.mg.every((r) => !r.v1.trim())) out.push('The volumes are not written in the table.');
    if (!s.curves.a) out.push('The points are not joined on the graph.');
    if (!s.tangents.a) out.push('No tangent drawn at t = 0.');
    if (!s.answers.rateA.value.trim() || !s.answers.rateB.value.trim()) out.push('The initial rates are not worked out.');
    if (!s.answers.vTheory.value.trim()) out.push('The theoretical volume of hydrogen is not worked out.');
  }
  if (!s.written.explanation.trim()) out.push('The explanation is not written.');
  if (!s.written.precautions.trim()) out.push('No precautions written.');
  return out;
}
