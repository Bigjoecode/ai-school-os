import { FOOD_LETTERS, FOOD_TEST_INFO, type BioFoodState } from '@aischool/shared';

/** What is still missing before hand-in (the lab can be handed in anyway). */
export function bioFoodMissing(s: BioFoodState, _seed: number): string[] {
  const out: string[] = [];
  if (!s.task) out.push('No experiment chosen.');
  const rows = s.tests.map((t, i) => ({ t, r: s.table[i] }));
  const noObs = rows.filter((x) => !x.r?.observation.trim()).length;
  const noInf = rows.filter((x) => !x.r || (!x.r.present.length && !x.r.absent.length && !x.r.note.trim())).length;
  const unheated = s.tests.filter((t) => FOOD_TEST_INFO[t.test].heats && t.heat === 0).length;
  if (s.task === 'AMYLASE') {
    if (!s.tile) out.push('The spotting tile has no iodine.');
    if (!s.tubes.length) out.push('No tubes of starch and saliva set up.');
    else if (s.clock === null) out.push('The saliva has not been mixed with the starch.');
    else if (!s.spots.length) out.push('No drops of the mixtures have been tested on the iodine.');
    const noRow = s.tubes.filter((_, i) => !s.amy[i]?.observation.trim() || !s.amy[i]?.end.trim()).length;
    if (noRow) out.push(`${noRow} tube${noRow === 1 ? ' has' : 's have'} no observation or end point written.`);
    if (s.tubes.some((_, i) => !s.amy[i]?.claims.length)) out.push('Some tubes have no inference.');
    if (!s.tests.length) out.push("No Benedict's test on a digested mixture.");
    if (!s.optimum) out.push('The optimum temperature is not named.');
  } else {
    if (!s.tests.length) out.push('No tests have been carried out.');
    if (FOOD_LETTERS.some((l) => !s.conclusion[l].length)) out.push('The food substances are not named for every sample.');
  }
  if (noObs) out.push(`${noObs} test${noObs === 1 ? ' has' : 's have'} no observation written.`);
  if (noInf) out.push(`${noInf} test${noInf === 1 ? ' has' : 's have'} no inference.`);
  if (unheated) out.push(`${unheated} tube${unheated === 1 ? ' has' : 's have'} not been heated in the water bath.`);
  if (!s.written.precautions.trim()) out.push('No precautions written.');
  if (!s.written.explain.trim()) out.push('No explanation written.');
  return out;
}
