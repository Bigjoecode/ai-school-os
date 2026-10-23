import { bioMicroscopeVariant, type BioMicroscopeState } from '@aischool/shared';

/** What is still missing before hand-in (the lab can be handed in anyway). */
export function bioMicroscopeMissing(s: BioMicroscopeState, seed: number): string[] {
  if (!s.slide) return ['No slide has been chosen.'];
  const v = bioMicroscopeVariant(seed, s.slide);
  const out: string[] = [];
  if (!s.prep.medium || !s.prep.coverslip) out.push('The slide has not been prepared.');
  if (!s.prep.placed) out.push('The slide is not on the stage.');
  if (!s.captures.some((c) => c.objective === v.info.labelObjective)) out.push(`No view captured at ×${v.info.labelObjective} for labelling.`);
  if (v.info.measureObjective !== v.info.labelObjective && !s.captures.some((c) => c.objective === v.info.measureObjective)) out.push(`No view captured at ×${v.info.measureObjective} for measuring.`);
  const unlabelled = v.targets.filter((_, i) => !s.labels[i]).length;
  if (unlabelled) out.push(`${unlabelled} structure${unlabelled === 1 ? '' : 's'} not labelled.`);
  if (!s.identity) out.push('The identification question is not answered.');
  const blank = v.tasks.filter((t) => !s.answers[t.id].value.trim()).length;
  if (blank) out.push(`${blank} calculation${blank === 1 ? '' : 's'} not answered.`);
  if (!s.drawing.length) out.push('The drawing checklist is not done.');
  if (!s.written.observations.trim()) out.push('No observations written.');
  if (!s.written.precautions.trim()) out.push('No precautions written.');
  return out;
}
