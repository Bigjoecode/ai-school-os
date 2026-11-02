import { GERM_TUBES, SEED_LABELS, type BioGrowthState } from '@aischool/shared';

/** What is still missing before hand-in (the lab can be handed in anyway). */
export function bioGrowthMissing(s: BioGrowthState, _seed: number): string[] {
  const out: string[] = [];
  if (!s.task) out.push('No experiment chosen.');
  const task = s.task ?? 'GERM';
  if (task === 'GERM') {
    const w = s.germ;
    const sown = w.tubes.filter((t) => t.seeds > 0).length;
    if (sown < GERM_TUBES.length) out.push(`${GERM_TUBES.length - sown} tube${GERM_TUBES.length - sown === 1 ? ' has' : 's have'} no seeds.`);
    if (!w.looks.length) out.push('The tubes have not been inspected.');
    const blank = w.rows.filter((r, k) => w.tubes[k]!.seeds > 0 && (!r.sown.trim() || !r.germ.trim() || !r.pct.trim() || !r.missing)).length;
    if (blank) out.push(`${blank} tube${blank === 1 ? ' has' : 's have'} the number sown, germinated, % or missing condition blank.`);
    const counts = w.looks.filter((d) => w.rows.some((r, k) => w.tubes[k]!.seeds > 0 && !r.c[d]?.trim())).length;
    if (counts) out.push(`${counts} inspection day${counts === 1 ? ' has' : 's have'} counts missing.`);
    if (!w.claims.length) out.push('No conclusions chosen.');
  } else if (task === 'SEEDLING') {
    const w = s.seedling;
    if (!w.box && !w.jar) out.push('No seeds sown.');
    if (w.rows.length < 5) out.push('Fewer than five days measured.');
    const blank = w.rows.filter((r) => !r.cow.trim() || !r.maize.trim()).length;
    if (blank) out.push(`${blank} row${blank === 1 ? ' has' : 's have'} a length missing.`);
    if (!w.graph || !w.curve) out.push('The graph is not finished.');
    if (!w.rateCow.trim() || !w.rateMaize.trim()) out.push('A growth rate is not worked out.');
    if (Object.values(w.table).some((t) => !t.type || !t.cot || !t.part)) out.push('The comparison table is not complete.');
    if (!w.first) out.push('The part that appeared first is not given.');
    if (w.labels.filter(Boolean).length < SEED_LABELS.length) out.push('The drawing is not fully labelled.');
    if (!w.drawing.length) out.push('The drawing checklist is not done.');
    if (!w.claims.length) out.push('No conclusions chosen.');
  } else if (task === 'RESP') {
    const w = s.resp;
    if (w.startAt === null) out.push('The flasks are not set up.');
    if (w.reads.length < 4) out.push('Fewer than four thermometer readings (the start and three days).');
    const blank = w.rows.filter((r) => !r.a.trim() || !r.b.trim()).length;
    if (blank) out.push(`${blank} reading${blank === 1 ? ' is' : 's are'} not written.`);
    if (!w.riseA.trim() || !w.riseB.trim() || !w.perDay.trim() || !w.diff.trim()) out.push('The rises, the mean rise per day or the difference are not worked out.');
    if (w.co2.look === null) out.push('The CO₂ test has not been observed.');
    else if (!w.obsLive.trim()) out.push('The CO₂ observation is not written.');
    if (!w.eq) out.push('The word equation is not chosen.');
    if (!w.claims.length) out.push('No conclusions chosen.');
  } else {
    const w = s.trop;
    if (!w.box) out.push('The phototropism box is not set up.');
    if (!w.pinned) out.push('The geotropism seedlings are not pinned.');
    if (w.rows.length < 3) out.push('Fewer than three days of angles.');
    const blank = w.rows.filter((r) => !r.test.trim() || !r.ctrl.trim()).length;
    if (blank) out.push(`${blank} row${blank === 1 ? ' has' : 's have'} an angle missing.`);
    if (!w.rate.trim()) out.push('The rate of curvature is not worked out.');
    if (!w.down.trim() || !w.pct.trim()) out.push('The radicle count or its percentage is missing.');
    if (!w.sketchCork || !w.sketchKlino) out.push('The sketches are not chosen.');
    if (!w.claims.length) out.push('No conclusions chosen.');
  }
  if (!s.written.precautions.trim()) out.push('No precautions written.');
  if (!s.written.explain.trim()) out.push('No explanation written.');
  return out;
}
