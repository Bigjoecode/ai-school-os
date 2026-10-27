import { QUAL_SAMPLE_LABEL, qualObserve, qualSamples, type ChemQualitativeState, type ChemQualitativeVariant, type QualReagent, type QualSample } from '@aischool/shared';
import type { Correction, GuideStep } from '../../../lab3d-kit/guide';
import type { CameraMode } from '../../../lab3d-kit/store';
import { QUAL_APPARATUS, isToxicTest, type QualScene } from './scene-state';

/**
 * Guided mode for qualitative analysis (practice only): the WAEC routine as a
 * checklist — dissolve, NaOH and NH₃ dropwise then in excess, heat the solid,
 * test every gas, a test for the anion, record every row, name the ions —
 * without giving away which ions are present. Corrections teach the safe
 * habits: waft, use the fume cupboard, test the gas you made.
 */

const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function qualGuideSteps(v: ChemQualitativeVariant, s: ChemQualitativeState, scene: QualScene, mode: CameraMode): GuideStep[] {
  const samples = qualSamples(v, s.tests);
  const did = (r: QualReagent, on?: QualSample, step?: string) => s.tests.some((t) => t.reagent === r && (!on || t.sample === on) && (!step || t.steps.includes(step as never)));
  const needed = QUAL_APPARATUS.filter((a) => a.needed && (a.id !== 'funnel' || v.kind === 'MIXTURE'));
  const missing = needed.filter((a) => !scene.collected.has(a.id));
  const steps: GuideStep[] = [
    { id: 'safety', label: 'Put on your lab coat and goggles', target: !scene.coat ? 'coat' : !scene.goggles ? 'goggles' : null, why: 'Hot liquids spurt and acids splash.', done: scene.coat && scene.goggles },
    { id: 'collect', label: `Collect your apparatus${missing.length ? ` (${missing.length} to go)` : ''}`, target: 'cupboard', why: 'Test tubes, a holder, a Bunsen burner, a spatula, the nichrome wire, the gas-test kit and a wash bottle.', done: !missing.length },
    { id: 'bench', label: 'Go to your bench', target: 'mybench', why: 'Bench 2, at the front: sample C and the reagents are there.', done: mode !== 'walk' || s.tests.length > 0 },
  ];
  // 1. a solution of C
  if (v.kind === 'MIXTURE') steps.push({ id: 'water', label: 'Add distilled water to C, shake and filter', target: 'sample:SOLID', why: 'The soluble salt goes into the filtrate; the insoluble one stays on the filter paper as the residue.', done: samples.includes('FILTRATE') });
  else
    steps.push({
      id: 'water',
      label: v.main.soluble || !did('WATER', 'SOLID') ? 'Add distilled water to C and shake' : 'C did not dissolve: dissolve it in dilute HNO₃',
      target: 'sample:SOLID',
      why: 'Does it dissolve? What colour is the solution? Both are observations.',
      done: samples.includes('SOLUTION'),
    });
  if (v.kind === 'MIXTURE') steps.push({ id: 'residue', label: 'Dissolve the residue in dilute HNO₃', target: 'sample:RESIDUE', why: 'Then its cation can be tested too. Watch for effervescence.', done: samples.includes('RESIDUE_SOLN') });
  // 2. cation tests on each solution
  const sols: QualSample[] = v.kind === 'SALT' ? ['SOLUTION'] : ['FILTRATE', 'RESIDUE_SOLN'];
  for (const x of sols) {
    const name = x === 'SOLUTION' ? 'the solution' : `the ${lc(QUAL_SAMPLE_LABEL[x])}`;
    steps.push({ id: `naoh-${x}`, label: `Add NaOH(aq) to ${name} in drops, then in excess`, target: 'bottle:NAOH', why: 'The colour of the precipitate, and whether it dissolves in excess, narrow down the cation.', done: did('NAOH', x, 'EXCESS'), group: 'Cation tests' });
    steps.push({ id: `nh3-${x}`, label: `Add NH₃(aq) to ${name} in drops, then in excess`, target: 'bottle:NH3', why: 'NH₃ tells apart cations that NaOH cannot (e.g. Zn²⁺ dissolves in excess NH₃; Al³⁺ and Pb²⁺ do not).', done: did('NH3', x, 'EXCESS'), group: 'Cation tests' });
  }
  // 3. heat, gases, anion
  steps.push({ id: 'heat', label: 'Heat a little of the solid C in a dry test tube', target: 'sample:SOLID', why: 'Gently, then strongly, with the tube pointing away from everyone. Note the residue hot and cold, and any gas or droplets.', done: did('HEAT'), group: 'Heat and gases' });
  const untested = s.tests.findIndex((t) => qualObserve(v, t).gases.length > 0 && !t.gasTests.length);
  steps.push({ id: 'gases', label: untested >= 0 ? `A gas came off in test ${untested + 1}: test it` : 'Test every gas given off', target: untested >= 0 ? 'tube' : null, why: 'Lime water, damp litmus, splints and test papers: each gas has its own test.', done: s.tests.length > 0 && untested < 0, group: 'Heat and gases' });
  const anionDone = s.tests.some((t) => sols.includes(t.sample) && ['AGNO3', 'BACL2', 'BROWN_RING'].includes(t.reagent)) || s.tests.some((t) => t.reagent === 'DIL_HCL');
  steps.push({ id: 'anion', label: 'Test for the anion', target: 'bottle:BACL2', why: 'AgNO₃ (Cl⁻), BaCl₂ then HCl (SO₄²⁻, SO₃²⁻), dilute acid and lime water (CO₃²⁻), the brown-ring test (NO₃⁻).', done: anionDone, group: 'Heat and gases' });
  // 4. the record
  const noObs = s.tests.filter((_, i) => !s.table[i]?.observation.trim()).length;
  const noInf = s.tests.filter((_, i) => {
    const r = s.table[i];
    return !r || (!r.present.length && !r.absent.length && !r.gases.length && !r.note.trim());
  }).length;
  steps.push(
    { id: 'record', label: noObs || noInf ? `Write the observation and inference for every test (${Math.max(noObs, noInf)} to go)` : 'Write the observation and inference for every test', target: 'book', why: 'Write exactly what you saw; infer every ion the observation allows, and rule out the ones it doesn’t.', done: s.tests.length >= v.minRows && !noObs && !noInf },
    {
      id: 'ions',
      label: v.kind === 'SALT' ? 'Name the cation and anion in C' : 'Name the ions of the filtrate and of the residue',
      target: 'book',
      why: 'Use the inferences together: each ion should be confirmed by at least one test.',
      done: (v.kind === 'SALT' ? (['A'] as const) : (['A', 'B'] as const)).every((k) => s.answer[k].cation && s.answer[k].anion),
    },
    { id: 'equation', label: 'Write an ionic equation for a confirmatory test', target: 'book', why: 'For example the precipitate the cation gives with OH⁻, or the anion’s test.', done: !!s.answer.equation.trim() },
    { id: 'handin', label: 'Hand in your lab', target: null, why: 'Open the menu and choose Hand in when everything is recorded.', done: false },
  );
  return steps;
}

/** A gentle correction for a step just recorded in the log (null: nothing wrong). */
export function qualCorrection(a: string, s: ChemQualitativeState, v: ChemQualitativeVariant, scene: QualScene): Correction | null {
  const [verb, arg] = a.split(':') as [string, string | undefined];
  if (verb === 'sniff-refused') return { title: 'Never smell a gas directly.', why: 'Gases such as SO₂, H₂S, NO₂ and HCl are toxic or burn the nose and lungs. Hold the tube away from your face and fan a little of the gas towards your nose with your hand (wafting).', focus: 'tube' };
  if (verb === 'collect' && arg && !QUAL_APPARATUS.find((x) => x.id === arg)?.needed) return { title: 'That is not needed for qualitative analysis.', why: 'Only take what the practical needs; you can put it back from your bench or from the cupboard list.' };
  // Testing a harmful gas at the open bench: that belongs in the fume cupboard.
  if (verb === 'gas' && arg) {
    const i = Number(arg.split('#')[1]) - 1;
    if (i >= 0 && isToxicTest(v, s, i) && !scene.fume.has(i))
      return { title: 'This test gives off a harmful gas: do it in the fume cupboard.', why: 'SO₂, H₂S, NO₂ and HCl are toxic or corrosive. Select the test tube and carry it to the fume cupboard first, test the gas there with the sash pulled down, and only ever waft it towards your nose.', focus: 'tube' };
  }
  if (verb === 'test' && arg?.startsWith('HEAT') && !scene.collected.has('holder'))
    return { title: 'Hold a heated tube with a test-tube holder.', why: 'The glass gets far too hot to touch. Grip the tube near its mouth with the holder and point it away from everyone.' };
  return null;
}
