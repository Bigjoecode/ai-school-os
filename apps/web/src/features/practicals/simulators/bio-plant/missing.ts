import { POTO_CONDS, type BioPlantState } from '@aischool/shared';

/** What is still missing before hand-in (the lab can be handed in anyway). */
export function bioPlantMissing(s: BioPlantState, _seed: number): string[] {
  const out: string[] = [];
  if (!s.task) out.push('No experiment chosen.');
  if (s.task === 'POTOMETER' || !s.task) {
    const w = s.poto;
    if (!w.bubble) out.push('The potometer is not set up with a bubble.');
    const used = POTO_CONDS.filter((c) => w.runs.some((r) => r.cond === c));
    if (used.length < 3) out.push('Fewer than three conditions timed.');
    const few = used.filter((c) => w.runs.filter((r) => r.cond === c).length < 3);
    if (few.length) out.push(`${few.length} condition${few.length === 1 ? ' was' : 's were'} timed fewer than three times.`);
    const blank = used.filter((c) => {
      const r = w.rows[POTO_CONDS.indexOf(c)];
      return !r || !r.t1.trim() || !r.mean.trim() || !r.rate.trim() || !r.vol.trim();
    }).length;
    if (blank) out.push(`${blank} row${blank === 1 ? ' has' : 's have'} a time, mean, rate or volume missing.`);
    if (!w.bars.length) out.push('No bar chart plotted.');
    if (!w.fastest) out.push('The fastest condition is not named.');
    if (!w.claims.length) out.push('No conclusions chosen.');
  } else if (s.task === 'OXYGEN') {
    const w = s.oxy;
    if (!w.plant) out.push('The pondweed is not set up.');
    if (w.rows.length < 5) out.push('Fewer than five lamp distances used.');
    const blank = w.rows.filter((r) => !r.c1.trim() || !r.c2.trim() || !r.c3.trim() || !r.mean.trim() || !r.li.trim()).length;
    if (blank) out.push(`${blank} row${blank === 1 ? ' has' : 's have'} a count, mean or light intensity missing.`);
    if (!w.axis || !w.curve) out.push('The graph is not finished.');
    if (!w.compD.trim()) out.push('The distance at which bubbling stopped is not recorded.');
    if (w.splintAt === null) out.push('The gas has not been tested with a glowing splint.');
    else if (!w.splintObs.trim()) out.push('The splint observation is not written.');
    if (!w.claims.length) out.push('No conclusions chosen.');
  } else {
    const w = s.starch;
    if (!w.leaves.length) out.push('No leaves picked.');
    const untested = w.leaves.filter((l) => !l.iodine).length;
    if (untested) out.push(`${untested} leaf${untested === 1 ? ' has' : 's have'} not been tested with iodine.`);
    const blank = w.leaves.filter((l, i) => l.iodine && (!w.rows[i]?.observation.trim() || !w.rows[i]?.claims.length)).length;
    if (blank) out.push(`${blank} leaf${blank === 1 ? ' has' : 's have'} no observation or inference.`);
    if (!w.grid.total.trim() || !w.grid.blue.trim() || !w.grid.pct.trim()) out.push('The grid count is not complete.');
    if (w.labels.filter(Boolean).length < 4) out.push('The drawing is not fully labelled.');
    if (!w.drawing.length) out.push('The drawing checklist is not done.');
  }
  if (!s.written.precautions.trim()) out.push('No precautions written.');
  if (!s.written.explain.trim()) out.push('No explanation written.');
  return out;
}
