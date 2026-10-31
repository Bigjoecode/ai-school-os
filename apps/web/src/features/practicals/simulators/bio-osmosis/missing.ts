import { PLAS_STAGES, PLAS_STAGE_LABEL, plasCaptureOf, potatoPhase, type BioOsmosisState } from '@aischool/shared';

/** What is still missing before hand-in (the lab can be handed in anyway). */
export function bioOsmosisMissing(s: BioOsmosisState, _seed: number): string[] {
  const out: string[] = [];
  if (!s.task) out.push('No experiment chosen.');
  if (s.task === 'POTATO' || !s.task) {
    const w = s.potato;
    if (!w.cyl.length) out.push('No potato cylinders prepared.');
    else {
      if (w.cyl.some((c) => c.placedAt === null)) out.push('Some cylinders have not been put into their solutions.');
      if (w.cyl.some((c) => potatoPhase(c) === 'SOAK')) out.push('Some cylinders are still soaking.');
      const blank = w.rows.filter((r) => !r.l0.trim() || !r.l1.trim() || !r.m0.trim() || !r.m1.trim()).length;
      if (blank) out.push(`${blank} row${blank === 1 ? ' has' : 's have'} a length or mass missing.`);
      const noPct = w.rows.filter((r) => !r.pm.trim() || !r.pl.trim()).length;
      if (noPct) out.push(`${noPct} row${noPct === 1 ? ' has' : 's have'} no % change worked out.`);
      if (w.rows.some((r) => !r.firm)) out.push('Firm or soft is not recorded for every cylinder.');
    }
    if (!w.line) out.push('No line drawn on the graph.');
    if (!w.iso.trim()) out.push('The isotonic concentration is not read from the graph.');
  } else if (s.task === 'PLASMOLYSIS') {
    const w = s.plas;
    if (!w.mount) out.push('No epidermis mounted.');
    for (const [k, st] of PLAS_STAGES.entries()) {
      if (plasCaptureOf(w, st) < 0) out.push(`No view recorded: ${PLAS_STAGE_LABEL[st].toLowerCase()}.`);
      else if (!w.rows[k]?.observation.trim() || !w.rows[k]?.claims.length) out.push(`${PLAS_STAGE_LABEL[st]}: observation or inference missing.`);
    }
    if (!w.count.total.trim() || !w.count.plasmolysed.trim() || !w.count.pct.trim()) out.push('The cell count is not complete.');
    if (w.labels.filter(Boolean).length < 6) out.push('The drawing is not fully labelled.');
    if (!w.drawing.length) out.push('The drawing checklist is not done.');
  } else {
    const w = s.agar;
    if (w.cubes.length < 3) out.push('Fewer than three cubes cut.');
    if (w.cubes.some((c) => c.placedAt === null)) out.push('Some cubes are not in the acid.');
    const blank = w.rows.filter((r) => !r.side.trim() || !r.sa.trim() || !r.vol.trim() || !r.ratio.trim()).length;
    if (blank) out.push(`${blank} cube${blank === 1 ? ' has' : 's have'} the side, area, volume or ratio missing.`);
    if (w.cubes.some((c, i) => c.cutAt === null && !w.rows[i]?.time.trim())) out.push('Not every cube has a time to become colourless.');
    if (!w.depth.depth.trim() || !w.depth.rate.trim()) out.push('The depth of the colourless zone and the rate are not recorded.');
    if (w.first === null) out.push('The cube that went colourless first is not named.');
    if (!w.claims.length) out.push('No conclusion chosen.');
  }
  if (!s.written.precautions.trim()) out.push('No precautions written.');
  if (!s.written.explain.trim()) out.push('No explanation written.');
  return out;
}
