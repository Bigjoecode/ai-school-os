import { FAC_MIN_DAYS, FAC_SITES, QUAD_HERBS, QUAD_MIN, SOIL_JAR_LABELS, type BioEcologyState } from '@aischool/shared';

/** What is still missing before hand-in (the lab can be handed in anyway). */
export function bioEcologyMissing(s: BioEcologyState, _seed: number): string[] {
  const out: string[] = [];
  const task = s.task ?? 'QUADRAT';
  if (!s.task) out.push('No investigation chosen.');
  if (task === 'QUADRAT') {
    const w = s.quad;
    if (w.quads.length < QUAD_MIN) out.push(`Only ${w.quads.length} quadrat${w.quads.length === 1 ? '' : 's'} placed (at least ${QUAD_MIN}).`);
    const unseen = w.quads.filter((_, i) => !w.looked.includes(i)).length;
    if (unseen) out.push(`${unseen} quadrat${unseen === 1 ? ' has' : 's have'} not been examined.`);
    const blank = w.rows.filter((r) => !r.TRIDAX.trim() || !r.SIDA.trim() || !r.EUPH.trim() || !r.grass.trim()).length;
    if (blank) out.push(`${blank} quadrat row${blank === 1 ? ' is' : 's are'} not filled in.`);
    if (QUAD_HERBS.some((h) => !w.res[h].density.trim() || !w.res[h].freq.trim() || !w.res[h].pop.trim())) out.push('Density, frequency or population is missing for a herb.');
    if (QUAD_HERBS.some((h) => w.bars[h] === null)) out.push('The bar chart of density is not drawn.');
    if (!w.mostFreq || !w.mostDense) out.push('The most frequent and most dense herbs are not named.');
  } else if (task === 'CAPTURE') {
    const w = s.cap;
    if (!w.first) out.push('No first sample caught.');
    else if (!w.release) out.push('The first sample has not been marked and released.');
    if (!w.second) out.push('No second sample caught.');
    if (!w.n1.trim() || !w.n2.trim() || !w.m.trim()) out.push('n₁, n₂ or m is not recorded.');
    if (!w.formula || !w.N.trim()) out.push('The population is not worked out.');
    if (!w.pct.trim() || !w.density.trim()) out.push('The % marked or the density is missing.');
    if (!w.assume.length || !w.errors.length) out.push('Assumptions or sources of error not chosen.');
  } else if (task === 'FACTORS') {
    const w = s.fac;
    const days = new Set(w.reads.map((r) => r.day));
    if (days.size < FAC_MIN_DAYS) out.push(`Site readings on ${days.size} day${days.size === 1 ? '' : 's'} (three are needed).`);
    for (const site of FAC_SITES) if (w.rows[site].slice(0, FAC_MIN_DAYS).some((r) => !r.air.trim() || !r.rh.trim() || !r.light.trim())) out.push(`Some ${site === 'OPEN' ? 'open-field' : 'canopy'} readings are not recorded.`);
    if (FAC_SITES.some((site) => !w.means[site].air.trim())) out.push('The means are not worked out.');
    if (w.six.filter((r) => r.max.trim()).length < FAC_MIN_DAYS) out.push('Six’s thermometer readings missing.');
    if (!w.rainTotal.trim() || !w.rainMean.trim()) out.push('Rainfall total or mean missing.');
    if (!w.secchi.trim()) out.push('No Secchi disc depth.');
    if (!w.obs.trim() || !w.claims.length) out.push('The comparison of the sites or the organisms is missing.');
  } else {
    const w = s.soil;
    if (!w.jarReads.length) out.push('No sedimentation jar measured.');
    if (w.funnels.length < 3) out.push('Fewer than three funnels set up.');
    if (w.dRows.some((r) => r.some((x) => !x.trim()))) out.push('The drainage table has gaps.');
    if (w.retained.some((x) => !x.trim())) out.push('Water retained is not worked out for every soil.');
    if (w.airs.length < 3 || w.airRows.some((r) => !r.pct.trim())) out.push('Air content is not done for every soil.');
    if (w.crucibles.length < 3 || w.hRows.some((r) => !r.pct.trim())) out.push('Humus is not done for every soil.');
    if (w.labels.filter(Boolean).length < SOIL_JAR_LABELS.length) out.push('The jar drawing is not fully labelled.');
    if (!w.plotted) out.push('The drainage graph is not plotted.');
    if (!w.obs.trim() || !w.claims.length) out.push('The jar observation or the conclusions are missing.');
  }
  if (!s.written.precautions.trim()) out.push('No precautions written.');
  if (!s.written.explain.trim()) out.push('No explanation written.');
  return out;
}
