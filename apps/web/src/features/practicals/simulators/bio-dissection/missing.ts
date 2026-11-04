import { EOSIN_LABELS, EOSIN_MIN_READS, MOULD_LABELS, RAT_LABELS, type BioDissectionState } from '@aischool/shared';

/** What is still missing before hand-in (the lab can be handed in anyway). */
export function bioDissectionMissing(s: BioDissectionState, _seed: number): string[] {
  const out: string[] = [];
  if (!s.task) out.push('No practical chosen.');
  const task = s.task ?? 'EOSIN';
  if (task === 'EOSIN') {
    const w = s.eosin;
    if (!w.dye) out.push('The plant is not in the eosin yet.');
    if (w.reads.length < EOSIN_MIN_READS) out.push(`Fewer than ${EOSIN_MIN_READS} heights read.`);
    const blank = w.rows.filter((r) => !r.trim()).length;
    if (blank) out.push(`${blank} height${blank === 1 ? ' is' : 's are'} not written.`);
    if (!w.sections.length) out.push('No sections cut.');
    if (w.secRows.some((r) => !r)) out.push('What a section showed is not recorded.');
    if (!w.rate.trim() || !w.rateH.trim()) out.push('The rate of rise is not worked out.');
    if (!w.tissue || !w.arrange) out.push('The stained tissue or the bundle arrangement is not given.');
    if (!w.veins) out.push('The leaf veins are not recorded.');
    if (w.labels.filter(Boolean).length < EOSIN_LABELS.length || !w.shade) out.push('The section drawing is not finished (labels and shading).');
    if (!w.drawing.length) out.push('The drawing checklist is not done.');
    if (!w.claims.length) out.push('No conclusions chosen.');
  } else if (task === 'RAT') {
    const w = s.rat;
    if (!w.pinned) out.push('The rat is not pinned out.');
    if (!w.unravelled) out.push('The gut is not displayed.');
    if (!w.body.trim() || !w.si.trim() || !w.li.trim()) out.push('A length is not written.');
    if (!w.ratio.trim()) out.push('The gut : body ratio is not worked out.');
    if (!w.gall) out.push('The gall bladder question is not answered.');
    if (w.labels.filter(Boolean).length < RAT_LABELS.length) out.push('The drawing is not fully labelled.');
    if (!w.style || !w.drawing.length) out.push('The drawing checklist is not done.');
    if (!w.cleaned) out.push('The tools and board are not disinfected.');
    if (!w.claims.length) out.push('No conclusions chosen.');
  } else {
    const w = s.micro;
    if (w.incAt === null) out.push('The plates are not in the incubator.');
    if (w.breadAt === null) out.push('The bread is not set up.');
    if (w.countAt === null) out.push('The colonies are not counted.');
    else if (w.counts.some((c) => !c.trim()) || w.kinds.some((k) => !k)) out.push('A count or colony description is blank.');
    if (w.lensAt === null) out.push('The bread has not been examined.');
    else if (w.bread.some((b) => !b)) out.push('The mould on a slice is not recorded.');
    if (!w.reduction.trim()) out.push('The % reduction is not worked out.');
    if (w.labels.filter(Boolean).length < MOULD_LABELS.length) out.push('The Rhizopus drawing is not fully labelled.');
    if (!w.drawing.length) out.push('The drawing checklist is not done.');
    if (!w.dispose) out.push('The plates are not disposed of.');
    if (!w.claims.length) out.push('No conclusions chosen.');
  }
  if (!s.written.precautions.trim()) out.push('No precautions written.');
  if (!s.written.explain.trim()) out.push('No explanation written.');
  return out;
}
