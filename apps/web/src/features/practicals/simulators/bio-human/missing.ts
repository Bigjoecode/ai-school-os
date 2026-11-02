import { REACT_CONDS, SKIN_AREAS, pulseExEnd, type BioHumanState } from '@aischool/shared';

/** What is still missing before hand-in (the lab can be handed in anyway). */
export function bioHumanMissing(s: BioHumanState, _seed: number): string[] {
  const out: string[] = [];
  if (!s.task) out.push('No experiment chosen.');
  const task = s.task ?? 'PULSE';
  if (task === 'PULSE') {
    const w = s.pulse;
    const end = pulseExEnd(w);
    const rest = w.counts.filter((c) => !w.exercise || c.at < w.exercise.at).length;
    if (rest < 3) out.push('Fewer than three resting counts.');
    if (!w.exercise) out.push('Your partner has not exercised.');
    else if (w.counts.filter((c) => end !== null && c.at >= end - 1e-9).length < 5) out.push('Fewer than five counts after the exercise.');
    const blank = w.rows.filter((r) => !r.beats.trim() || !r.bpm.trim()).length;
    if (blank) out.push(`${blank} count${blank === 1 ? ' has' : 's have'} no beats or beats/min written.`);
    if (!w.axis || !w.curve) out.push('The graph is not finished.');
    if (!w.restMean.trim() || !w.increase.trim() || !w.recovery.trim()) out.push('The resting mean, % increase or recovery time is missing.');
    if (!w.claims.length) out.push('No conclusions chosen.');
  } else if (task === 'BREATH') {
    const w = s.breath;
    if (!w.breaths.length) out.push('No breaths through the lime water yet.');
    if (!w.firstMilky) out.push('Which tube turned milky first is not recorded.');
    if (!w.obsA.trim() || !w.obsB.trim()) out.push('The lime water observations are not written.');
    if (!w.cobalt || !w.mirrorObs.trim()) out.push('The mirror and cobalt chloride test is not recorded.');
    if (!w.roomT.trim() || !w.breathT.trim()) out.push('A temperature is missing.');
    if (w.counts < 3) out.push('Fewer than three breathing counts.');
    if (!w.meanRate.trim() || !w.vent.trim() || !w.ratio.trim()) out.push('The mean, ventilation or CO₂ ratio is missing.');
    if (!w.claims.length) out.push('No conclusions chosen.');
  } else if (task === 'REACTION') {
    const w = s.react;
    if (!w.knee) out.push('The knee-jerk has not been tested.');
    else if (!w.kneeObs.trim()) out.push('The knee-jerk observation is not written.');
    const blank = REACT_CONDS.filter((c, i) => w.drops.some((d) => d.cond === c) && (w.rows[i]!.ds.some((d) => !d.trim()) || !w.rows[i]!.mean.trim() || !w.rows[i]!.t.trim())).length;
    if (blank) out.push(`${blank} row${blank === 1 ? ' has' : 's have'} a distance, mean or time missing.`);
    if (!w.faster || !w.trend) out.push('The comparisons (hands, practice) are not answered.');
    if (!w.claims.length) out.push('No conclusions chosen.');
  } else {
    const w = s.skin;
    const tested = SKIN_AREAS.filter((a) => w.trials.some((t) => t.area === a));
    if (tested.length < SKIN_AREAS.length) out.push(`${SKIN_AREAS.length - tested.length} area${SKIN_AREAS.length - tested.length === 1 ? '' : 's'} not tested.`);
    const blank = tested.filter((a) => {
      const r = w.rows[SKIN_AREAS.indexOf(a)]!;
      return !r.thr.trim() || !r.n.trim() || !r.ok.trim() || !r.pct.trim();
    }).length;
    if (blank) out.push(`${blank} row${blank === 1 ? ' has' : 's have'} something missing.`);
    if (!w.bars.length) out.push('No bar chart plotted.');
    if (!w.rank.length || !w.ratio.trim() || !w.most) out.push('The ranking, ratio or most sensitive area is missing.');
    if (!w.claims.length) out.push('No conclusions chosen.');
  }
  if (!s.written.precautions.trim()) out.push('No precautions written.');
  if (!s.written.explain.trim()) out.push('No explanation written.');
  return out;
}
