import { FOOD_TEST_INFO, foodObserve, type BioFoodState, type BioFoodVariant, type FoodTestId } from '@aischool/shared';
import type { Correction, GuideStep } from '../../../lab3d-kit/guide';
import type { CameraMode } from '../../../lab3d-kit/store';
import { FOOD_APPARATUS, neededFor, type FoodScene } from './scene-state';

/**
 * Guided mode (practice only): the WAEC routine as a checklist — each sample
 * tested for every food class, the non-reducing test where Benedict's was
 * negative, every row recorded, the food substances named; or, for amylase,
 * the tile, the baths, the control, the drops every 30 s and the end points —
 * without giving away the results. Corrections teach the safe habits.
 */

const rowsDone = (s: BioFoodState, pred: (i: number) => boolean) => {
  const idx = s.tests.map((_, i) => i).filter(pred);
  const noObs = idx.filter((i) => !s.table[i]?.observation.trim()).length;
  const noInf = idx.filter((i) => {
    const r = s.table[i];
    return !r || (!r.present.length && !r.absent.length && !r.note.trim());
  }).length;
  return { n: idx.length, left: Math.max(noObs, noInf) };
};

export function foodGuideSteps(v: BioFoodVariant, s: BioFoodState, scene: FoodScene, mode: CameraMode): GuideStep[] {
  const task = s.task ?? 'FOOD';
  const missing = neededFor(task).filter((a) => !scene.collected.has(a.id));
  const steps: GuideStep[] = [
    { id: 'safety', label: 'Put on your lab coat and goggles', target: !scene.coat ? 'coat' : !scene.goggles ? 'goggles' : null, why: task === 'AMYLASE' ? 'Boiling water and Benedict’s solution can splash.' : 'Hot water baths, sodium hydroxide and acid can splash into your eyes.', done: scene.coat && scene.goggles },
    { id: 'collect', label: `Collect your apparatus${missing.length ? ` (${missing.length} to go)` : ''}`, target: 'cupboard', why: task === 'AMYLASE' ? 'Test tubes, a holder, the water bath and burner, a measuring cylinder, the spotting tile, a thermometer and a stopwatch.' : 'Test tubes, a holder, the water bath and burner, filter paper and a measuring cylinder.', done: !missing.length },
    { id: 'bench', label: 'Go to your bench', target: 'mybench', why: 'Bench 2, at the front.', done: mode !== 'walk' || s.tests.length > 0 || s.tubes.length > 0 },
    { id: 'burner', label: 'Light the burner under the water bath', target: 'bath', why: 'Benedict’s tests are heated in boiling water, never directly in the flame.', done: scene.burnerOn || s.tests.some((t) => t.heat > 0) },
  ];
  if (task === 'AMYLASE') return [...steps, ...amySteps(s, scene)];
  const did = (letter: string, tests: FoodTestId[]) => s.tests.some((t) => t.sample === letter && tests.includes(t.test) && foodObserve(v, s, t).complete);
  for (const sm of v.samples) {
    const g = `Sample ${sm.letter}`;
    steps.push({ id: `starch-${sm.letter}`, label: `Starch: iodine on ${sm.letter}`, target: `sample:${sm.letter}`, why: 'Two or three drops of iodine solution. Blue-black means starch.', done: did(sm.letter, ['IODINE']), group: g });
    steps.push({ id: `ben-${sm.letter}`, label: `Reducing sugar: Benedict’s on ${sm.letter}, in the bath for 3–5 min`, target: 'bottle:BENEDICT', why: 'An equal volume of Benedict’s, then the boiling water bath. Watch the colour change while it heats.', done: s.tests.some((t) => t.sample === sm.letter && t.test === 'BENEDICT' && t.heat >= 180), group: g });
    const ben = s.tests.filter((t) => t.sample === sm.letter && t.test === 'BENEDICT' && t.heat > 0);
    if (ben.length && ben.every((t) => !foodObserve(v, s, t).positive))
      steps.push({ id: `nr-${sm.letter}`, label: `No reducing sugar in ${sm.letter}: test for a non-reducing sugar`, target: 'bottle:HCL', why: 'Boil with dilute HCl, cool, neutralise with NaHCO₃ until it stops fizzing, then Benedict’s in the bath.', done: did(sm.letter, ['NONREDUCING']), group: g });
    steps.push({ id: `prot-${sm.letter}`, label: `Protein: Biuret test on ${sm.letter}`, target: 'bottle:NAOH', why: '1 cm³ of NaOH, then just two drops of 1% CuSO₄: violet means protein.', done: did(sm.letter, ['BIURET', 'MILLON']), group: g });
    steps.push({ id: `fat-${sm.letter}`, label: `Fat: Sudan III (or the grease spot) on ${sm.letter}`, target: 'bottle:SUDAN', why: 'A red-stained oily layer, a translucent spot or a milky emulsion means fat or oil.', done: did(sm.letter, ['SUDAN', 'GREASE', 'EMULSION']), group: g });
  }
  const rec = rowsDone(s, (i) => ['P', 'Q', 'R'].includes(s.tests[i]!.sample));
  steps.push(
    { id: 'record', label: rec.left ? `Write the observation and inference for every test (${rec.left} to go)` : 'Write the observation and inference for every test', target: 'book', why: 'Write exactly what you saw (the colour, a precipitate…), and infer only what that test shows.', done: rec.n >= 12 && !rec.left },
    { id: 'conclude', label: 'Name the food substances in P, Q and R', target: 'book', why: 'Put the inferences together for each sample.', done: (['P', 'Q', 'R'] as const).every((l) => s.conclusion[l].length > 0) },
    { id: 'written', label: 'Write two precautions and answer the question', target: 'book', why: 'Precautions are things you did to get reliable results safely.', done: !!s.written.precautions.trim() && !!s.written.explain.trim() },
    { id: 'wash', label: 'Turn off the burner and wash your hands', target: 'handwash', why: 'Before you leave the laboratory.', done: scene.washedAtEnd && !scene.burnerOn },
    { id: 'handin', label: 'Hand in your lab', target: null, why: 'Open the menu and choose Hand in when everything is recorded.', done: false },
  );
  return steps;
}

function amySteps(s: BioFoodState, scene: FoodScene): GuideStep[] {
  const baths = new Set(s.tubes.filter((t) => !t.boiled).map((t) => t.bath));
  const steps: GuideStep[] = [
    { id: 'tile', label: 'Put a drop of iodine in each well of the spotting tile', target: 'tile', why: 'You will test a drop of each mixture on a fresh well every 30 seconds.', done: s.tile },
    { id: 'tubes', label: `Set up tubes: ice, 37 °C, boiling${baths.size ? ` (${[...baths].length} so far)` : ''}`, target: !baths.has('ICE') ? 'amybath:ICE' : !baths.has('BODY') ? 'amybath:BODY' : 'bath', why: 'Starch in one tube and saliva in another, in each bath. A range of temperatures shows the effect of temperature.', done: baths.has('ICE') && baths.has('BODY') && baths.size >= 3, group: 'Set up' },
    { id: 'control', label: 'Add a control: starch with boiled saliva', target: 'amybath:BODY', why: 'It shows that the change is caused by the enzyme in the saliva.', done: s.tubes.some((t) => t.boiled), group: 'Set up' },
    { id: 'eq', label: 'Leave the tubes 5 minutes in their baths', target: 'stopwatch', why: 'So the starch and saliva are at the bath’s temperature before they meet.', done: s.equilibrated || s.clock !== null, group: 'Set up' },
    { id: 'mix', label: 'Mix and start the stopwatch', target: 'stopwatch', why: 'Pour each saliva into its starch at the same moment and start timing.', done: s.clock !== null, group: 'Set up' },
    { id: 'drops', label: s.clock === null ? 'Test a drop of each mixture every 30 s' : `Test a drop of each mixture every 30 s (now ${s.clock} s)`, target: 'tile', why: 'Blue-black: starch is still there. When the iodine stays yellow-brown, the starch has gone: that is the end point.', done: s.clock !== null && s.clock >= 600 && s.spots.some((x) => x.t === s.clock), group: 'Timing' },
    { id: 'ben', label: "Test the 37 °C mixture with Benedict's in the water bath", target: 'bottle:BENEDICT', why: 'A coloured precipitate shows the starch was digested to a reducing sugar (maltose).', done: s.tests.some((t) => !['P', 'Q', 'R'].includes(t.sample) && t.heat >= 180), group: 'Timing' },
  ];
  const noRow = s.tubes.filter((_, i) => !s.amy[i]?.observation.trim() || !s.amy[i]?.end.trim() || !s.amy[i]?.claims.length).length;
  const ben = rowsDone(s, (i) => !['P', 'Q', 'R'].includes(s.tests[i]!.sample));
  steps.push(
    { id: 'record', label: noRow || ben.left ? `Record each tube and test (${noRow + ben.left} to go)` : 'Record each tube and test', target: 'book', why: 'What the iodine did, the end point, the rate 1000 ÷ t, and your inference.', done: s.tubes.length > 0 && !noRow && ben.n > 0 && !ben.left },
    { id: 'optimum', label: 'Name the optimum temperature', target: 'book', why: 'The temperature with the shortest time to the end point.', done: !!s.optimum },
    { id: 'written', label: 'Write two precautions and explain your results', target: 'book', why: 'Use kinetic energy, the optimum, and denaturation of the active site.', done: !!s.written.precautions.trim() && !!s.written.explain.trim() },
    { id: 'wash', label: 'Turn off the burner and wash your hands', target: 'handwash', why: 'Saliva carries germs: wash your hands before you leave.', done: scene.washedAtEnd && !scene.burnerOn },
    { id: 'handin', label: 'Hand in your lab', target: null, why: 'Open the menu and choose Hand in when everything is recorded.', done: false },
  );
  return steps;
}

/** A gentle correction for a step just recorded in the log (null: nothing wrong). */
export function foodCorrection(a: string, s: BioFoodState, scene: FoodScene): Correction | null {
  const [verb, arg] = a.split(':') as [string, string | undefined];
  if (verb === 'heat-direct') return { title: 'Heat it in the boiling water bath, not over the flame.', why: 'Straight over the flame the liquid boils suddenly and can spurt out of the tube onto someone. The water bath heats it evenly and safely: stand the tube in it with the holder, its mouth pointing away from people.', focus: 'bath' };
  if (verb.startsWith('heat') && !scene.goggles) return { title: 'Put your goggles on before heating.', why: 'Boiling water and Benedict’s solution can splash: protect your eyes.', focus: 'bath' };
  if (verb === 'flammable-near-flame') return { title: 'Ethanol and Sudan III are flammable.', why: 'Keep them well away from the lit burner — or turn the burner off while you use them.', focus: 'tube' };
  if (verb === 'collect' && arg && !FOOD_APPARATUS.find((x) => x.id === arg)?.for.includes(s.task ?? 'FOOD')) return { title: 'That is not needed for this practical.', why: 'Only take what the practical needs; you can put it back from your bench or from the cupboard list.' };
  if (verb === 'step' && arg?.startsWith('BENEDICT#')) {
    const t = s.tests[Number(arg.split('#')[1]) - 1];
    if (t?.test === 'NONREDUCING' && !t.steps.includes('NEUTRALISE')) return { title: 'Neutralise the acid first.', why: 'Benedict’s solution only works in alkaline conditions: in acid it stays blue whatever the sugar. Add sodium hydrogencarbonate until the fizzing stops, then Benedict’s.', focus: 'tube' };
  }
  if (verb === 'step' && arg?.startsWith('CUSO4#')) {
    const t = s.tests[Number(arg.split('#')[1]) - 1];
    if (t?.test === 'BIURET' && !t.steps.includes('NAOH')) return { title: 'Sodium hydroxide goes in first.', why: 'The Biuret test is alkaline copper: add 1 cm³ of NaOH, then two drops of CuSO₄.', focus: 'tube' };
  }
  if (verb === 'test' && arg && FOOD_TEST_INFO[arg.split('@')[0] as FoodTestId]?.heats && !scene.burnerOn && s.tests.length === 1) return { title: 'Light the water bath now.', why: 'It takes a few minutes to boil: get it going while you set up the tests.', focus: 'bath' };
  // amylase
  if (verb === 'mix' && !s.equilibrated) return { title: 'The tubes were not at their bath temperatures.', why: 'Starch and saliva should stand in their baths for about 5 minutes before mixing, otherwise every tube starts at room temperature and the results are mixed up.', focus: 'baths' };
  if (verb === 'wait' && s.clock !== null && s.tubes.length && s.clock > 0) {
    const prev = s.clock - Number(arg ?? 0);
    if (!s.spots.some((x) => x.t === prev)) return { title: 'Test a drop before you wait again.', why: 'A drop of each mixture on a fresh iodine well every 30 seconds: otherwise you can miss the end point.', focus: 'tile' };
  }
  return null;
}
