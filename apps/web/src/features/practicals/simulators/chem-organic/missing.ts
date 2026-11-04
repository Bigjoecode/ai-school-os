import { ORG_TASK_SAMPLES, ORG_TEST_INFO, SOAP_ROWS, chemOrganicVariant, soapRun, type ChemOrganicState } from '@aischool/shared';

/** What is still missing before hand-in (the lab can be handed in anyway). */
export function chemOrganicMissing(s: ChemOrganicState, seed: number): string[] {
  const out: string[] = [];
  const task = s.task;
  if (!task) return ['No experiment chosen.'];
  if (task === 'SOAP') {
    const r = soapRun(chemOrganicVariant(seed, task), s.soap);
    if (!r.boiled) out.push('The palm oil has not been boiled with the NaOH.');
    if (!r.brine) out.push('The soap has not been salted out with brine.');
    if (!r.filtered) out.push('The soap has not been filtered off.');
    if (r.soapMass === null) out.push('The soap has not been weighed.');
    if (!r.soft || !r.hard) out.push('The lather test in soft and hard water is not done.');
    const noRow = SOAP_ROWS.filter((x) => !s.soapRows[x].observation.trim()).length;
    if (noRow) out.push(`${noRow} observation row${noRow === 1 ? ' is' : 's are'} empty.`);
    if (!s.readings.oil.trim() || !s.readings.soap.trim() || !s.readings.theory.trim() || !s.readings.yield.trim()) out.push('The masses, theoretical mass or % yield are not filled in.');
    if (!s.readings.byproduct) out.push('The by-product is not named.');
  } else {
    if (!s.tests.length) out.push('No tests have been carried out.');
    const noObs = s.tests.filter((_, i) => !s.table[i]?.observation.trim()).length;
    const noInf = s.tests.filter((_, i) => {
      const r = s.table[i];
      return !r || (!r.present.length && !r.absent.length && !r.note.trim());
    }).length;
    if (noObs) out.push(`${noObs} test${noObs === 1 ? ' has' : 's have'} no observation written.`);
    if (noInf) out.push(`${noInf} test${noInf === 1 ? ' has' : 's have'} no inference.`);
    const unheated = s.tests.filter((t) => ORG_TEST_INFO[t.test].heats && t.heat === 0 && t.test !== 'HYDROLYSIS').length;
    if (unheated) out.push(`${unheated} tube${unheated === 1 ? ' has' : 's have'} not been warmed in the water bath.`);
    if (ORG_TASK_SAMPLES[task].filter((x) => x !== 'H2O').some((l) => !(s.conclusion[l] ?? []).length)) out.push('Not every sample is identified.');
    if (!s.calc.a.trim() || !s.calc.b.trim()) out.push('The calculation is not finished.');
  }
  if (!s.written.precautions.trim()) out.push('No precautions written.');
  if (!s.written.explain.trim()) out.push('No explanation written.');
  return out;
}
