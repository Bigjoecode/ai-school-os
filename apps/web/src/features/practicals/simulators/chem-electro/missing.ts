import { chemElectroVariant, type ChemElectroState } from '@aischool/shared';

/** What is still missing before hand-in (the lab can be handed in anyway). */
export function chemElectroMissing(s: ChemElectroState, seed: number): string[] {
  const task = s.task ?? 'ELEC';
  const v = chemElectroVariant(seed, task);
  const out: string[] = [];
  const blank = (keys: (keyof ChemElectroState['rec'])[]) => keys.filter((k) => !s.rec[k].trim()).length;
  if (task === 'ELEC') {
    if (s.elec.closed) out.push('The key is still closed: switch off (open the key) first.');
    else if (s.elec.ran <= 0) out.push('No current has been passed yet.');
    else if (!s.elec.weighedAfter) out.push('The plates have not been reweighed.');
    if (blank(['cath1', 'cath2', 'an1', 'an2', 'current', 'time'])) out.push('Some masses, the current or the time are not recorded.');
  } else if (task === 'CELL') {
    if (!s.cell.readings.some((r) => r.bridge)) out.push('The e.m.f. has not been read with the salt bridge.');
    if (blank(['emf', 'emfNo', 'negative'])) out.push('Some readings, or the negative electrode, are not recorded.');
  } else if (task === 'DISP') {
    if (!s.disp.filtered) out.push(s.disp.added ? 'The copper has not been filtered off yet.' : 'The iron has not been added yet.');
    else if (!s.disp.weighed) out.push('The dry copper has not been weighed.');
    if (blank(['fe', 't1', 't2', 'paper', 'paperCu', 'cu'])) out.push('Some masses or temperatures are not recorded.');
  } else {
    if (!s.rust.started) out.push('The tubes have not been left for the week.');
    else if (!s.rust.observed.length) out.push('The tubes have not been observed.');
    if (!s.rust.readings.length) out.push('The graduated tube has not been read.');
    if (blank(['rustA', 'rustB', 'rustC', 'rustD', 'most', 'v0', 'vFinal'])) out.push('Some observations or volumes are not recorded.');
  }
  const unanswered = v.tasks.filter((t) => !s.answers[t.id].value.trim());
  if (unanswered.length) out.push(`${unanswered.length} calculation${unanswered.length === 1 ? '' : 's'} not answered.`);
  if (!s.written.observation.trim()) out.push('The observations are not written.');
  if (!s.written.explain.trim()) out.push('The explanation question is not answered.');
  if (!s.written.precautions.trim()) out.push('No precautions written.');
  return out;
}
