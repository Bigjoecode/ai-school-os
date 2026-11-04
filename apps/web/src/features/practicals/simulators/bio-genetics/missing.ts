import { CROSS_N, FOOD_LEVELS, FOOD_MIN_CHAINS, FOOD_SPOTS, bioGeneticsVariant, type BioGeneticsState } from '@aischool/shared';

/** What is still missing before hand-in (the lab can be handed in anyway). */
export function bioGeneticsMissing(s: BioGeneticsState, seed: number): string[] {
  const out: string[] = [];
  if (!s.task) out.push('No experiment chosen.');
  const task = s.task ?? 'HEIGHT';
  const v = bioGeneticsVariant(seed, task);
  if (task === 'HEIGHT') {
    const w = s.height;
    const willing = v.height.people.filter((p) => !p.declines).length;
    const hs = new Set(w.measures.filter((m) => m.kind === 'H').map((m) => m.who)).size;
    const ss = new Set(w.measures.filter((m) => m.kind === 'S').map((m) => m.who)).size;
    if (hs < willing) out.push(`${willing - hs} classmate${willing - hs === 1 ? '' : 's'} not measured for height.`);
    if (ss < willing) out.push(`${willing - ss} hand span${willing - ss === 1 ? '' : 's'} not measured.`);
    const blank = w.measures.filter((m) => !(w.rows[m.who]?.[m.kind === 'H' ? 'h' : 's'] ?? '').trim()).length;
    if (blank) out.push('Some readings are not written in the record sheet.');
    if (!w.scheme || !w.freq.some((f) => f.trim())) out.push('The frequency table is not filled in.');
    if (!w.chart) out.push('No chart drawn.');
    if (!w.mean.trim() || w.modal === null || !w.range.trim() || !w.spanMean.trim()) out.push('The mean, modal class, range or hand-span results are missing.');
    if (!w.claims.length) out.push('No conclusions chosen.');
  } else if (task === 'DISCRETE') {
    const w = s.disc;
    const asked = w.tries.filter((t) => t > 0).length;
    if (asked < v.disc.n) out.push(`${v.disc.n - asked} classmates not asked to roll the tongue.`);
    if (w.cards.filter(Boolean).length < v.disc.n) out.push('Some health cards not read.');
    if (w.rows.filter((r) => r.roll && r.group).length < v.disc.n) out.push('The survey sheet is not complete.');
    if (!w.tot.pr.trim() || !w.tot.ar.trim() || !w.gpct.O.trim()) out.push('The percentages or pie-chart angles are missing.');
    if (!w.chartT || !w.chartB) out.push('A chart is missing.');
    if (!w.claims.length) out.push('No conclusions chosen.');
  } else if (task === 'CROSS') {
    const w = s.cross;
    if (w.draws.length < CROSS_N) out.push(`Only ${w.draws.length} of ${CROSS_N} draws made.`);
    if (w.rows.some((r) => !r.TT.trim() || !r.Tt.trim() || !r.tt.trim())) out.push('Some batches are not counted.');
    if (!w.dom.trim() || !w.ratio.trim()) out.push('The totals or the ratio are missing.');
    if (!w.expDom.trim() || !w.ptt.trim()) out.push('The expected numbers or P(tt) are missing.');
    if (!w.clsRatio.trim() || !w.closer) out.push('The class results are not finished.');
    if (!w.claims.length) out.push('No conclusions chosen.');
  } else {
    const w = s.food;
    if (w.visited.length < FOOD_SPOTS.length) out.push(`${FOOD_SPOTS.length - w.visited.length} field spots not surveyed.`);
    if (w.chains.length < FOOD_MIN_CHAINS) out.push(`Fewer than ${FOOD_MIN_CHAINS} food chains.`);
    if (!w.links.length) out.push('No food web drawn.');
    if (Object.values(w.levels).filter(Boolean).length < 9) out.push('Some trophic levels are missing.');
    if (!w.scaleN.trim() || !w.scaleE.trim() || FOOD_LEVELS.some((L) => !w.widthN[L].trim() || !w.widthE[L].trim())) out.push('A pyramid is not finished.');
    if (!w.eff.trim() || !w.invert) out.push('The efficiency or the inverted-pyramid question is missing.');
    if (!w.claims.length) out.push('No conclusions chosen.');
  }
  if (!s.written.precautions.trim()) out.push('No precautions written.');
  if (!s.written.explain.trim()) out.push('No explanation written.');
  return out;
}
