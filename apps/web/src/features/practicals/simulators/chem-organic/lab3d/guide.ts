import { ORG_TASK_SAMPLES, ORG_TEST_INFO, SOAP_ROWS, orgObserve, soapRun, type ChemOrganicState, type ChemOrganicVariant, type OrgSample, type OrgTestId } from '@aischool/shared';
import type { Correction, GuideStep } from '../../../lab3d-kit/guide';
import type { CameraMode } from '../../../lab3d-kit/store';
import { ORG_APPARATUS, neededFor, type OrgScene } from './scene-state';

/**
 * Guided mode (practice only): the WAEC routine as a checklist, without giving
 * away the results. Corrections teach the safe habits: no flames near organic
 * liquids, waft don't sniff, neutralise before Benedict's, CuSO₄ drop by drop,
 * stir and top up the soap.
 */

export function orgGuideSteps(v: ChemOrganicVariant, s: ChemOrganicState, scene: OrgScene, mode: CameraMode): GuideStep[] {
  const task = s.task ?? 'GROUPS';
  const missing = neededFor(task).filter((a) => !scene.collected.has(a.id));
  const steps: GuideStep[] = [
    { id: 'safety', label: 'Put on your lab coat and goggles', target: !scene.coat ? 'coat' : !scene.goggles ? 'goggles' : null, why: task === 'SOAP' ? 'Hot sodium hydroxide spits and is very corrosive.' : 'Reagents like bromine water, acids and alkalis can splash into your eyes.', done: scene.coat && scene.goggles },
    { id: 'collect', label: `Collect your apparatus${missing.length ? ` (${missing.length} to go)` : ''}`, target: 'cupboard', why: neededFor(task).map((a) => a.label).join('; ') + '.', done: !missing.length },
    { id: 'bench', label: 'Go to your bench', target: 'mybench', why: 'Bench 2, at the front.', done: mode !== 'walk' || s.tests.length > 0 || s.soap.length > 0 },
    { id: 'burner', label: task === 'SOAP' ? 'Light the burner under the tripod' : 'Light the burner under the water bath', target: task === 'SOAP' ? 'beaker' : 'bath', why: task === 'SOAP' ? 'The mixture is boiled gently over the burner.' : 'Organic liquids are warmed only in hot water, never in the flame.', done: scene.burnerOn || s.tests.some((t) => t.heat > 0) || s.soap.some((e) => e.a.startsWith('BOIL')) },
  ];
  if (task === 'SOAP') return [...steps, ...soapSteps(v, s)];
  const did = (x: OrgSample, tests: OrgTestId[]) => s.tests.some((t) => t.sample === x && tests.includes(t.test) && orgObserve(v, t).complete);
  for (const x of ORG_TASK_SAMPLES[task]) {
    const g = x === 'H2O' ? 'Water (control)' : `Sample ${x}`;
    if (task === 'GROUPS') {
      steps.push({ id: `cc-${x}`, label: `C=C: bromine water on ${x}`, target: 'bottle:BROMINE', why: 'A few drops, shake. Watch whether the orange colour goes at once.', done: did(x, ['BROMINE', 'KMNO4']), group: g });
      steps.push({ id: `oh-${x}`, label: `–OH: warm acidified K₂Cr₂O₇ with ${x}`, target: 'bottle:DICHROMATE', why: 'In the water bath for a minute or two: orange to green shows an alkanol.', done: did(x, ['DICHROMATE', 'SODIUM']), group: g });
      steps.push({ id: `cooh-${x}`, label: `–COOH: NaHCO₃ on ${x}, gas into lime water`, target: 'bottle:NAHCO3', why: 'Fizzing with a gas that turns lime water milky is CO₂ from an acid.', done: did(x, ['NAHCO3']) && s.tests.some((t) => t.sample === x && t.test === 'NAHCO3' && t.steps.includes('LIMEWATER')), group: g });
    } else if (task === 'CARBS') {
      steps.push({ id: `i-${x}`, label: `Starch: iodine on ${x}`, target: 'bottle:IODINE', why: 'Two drops, cold. Blue-black means starch.', done: did(x, ['IODINE']), group: g });
      steps.push({ id: `b-${x}`, label: `Reducing sugar: Benedict’s on ${x}, 5 min in the bath`, target: 'bottle:BENEDICT', why: 'Equal volumes, then the boiling water bath; watch the colour while it heats.', done: s.tests.some((t) => t.sample === x && (t.test === 'BENEDICT' || t.test === 'FEHLING') && t.heat >= 180), group: g });
      const neg = s.tests.filter((t) => t.sample === x && (t.test === 'BENEDICT' || t.test === 'FEHLING') && orgObserve(v, t).complete);
      if (neg.length && neg.every((t) => !orgObserve(v, t).positive)) steps.push({ id: `h-${x}`, label: `No reducing sugar in ${x}: acid hydrolysis`, target: 'bottle:HCL', why: 'Boil with dilute HCl (test portions with iodine if it is a starch), neutralise with NaHCO₃ until it stops fizzing, then Benedict’s in the bath.', done: did(x, ['HYDROLYSIS']), group: g });
    } else {
      steps.push({ id: `bi-${x}`, label: `Biuret on ${x === 'H2O' ? 'the water control' : x}`, target: 'bottle:NAOH', why: '2 cm³ NaOH, then 1% CuSO₄ one drop at a time (two or three drops), shaking.', done: did(x, ['BIURET']), group: g });
      if (x !== 'H2O') {
        steps.push({ id: `x-${x}`, label: `Xanthoproteic on ${x}: conc. HNO₃, warm, then NH₃`, target: 'bottle:HNO3', why: 'The teacher adds the acid. Yellow on warming, orange with ammonia, shows protein.', done: s.tests.some((t) => t.sample === x && t.test === 'XANTHO' && t.steps.includes('NH3') && orgObserve(v, t).complete), group: g });
        steps.push({ id: `c-${x}`, label: `Heat ${x} in the water bath (coagulation)`, target: 'sample:' + x, why: 'Does it set? Egg albumen coagulates when heated.', done: did(x, ['COAGULATE']), group: g });
      }
    }
  }
  if (task === 'GROUPS') steps.push({ id: 'ester', label: 'Make an ester from the alkanol', target: 'bottle:ETHANOIC', why: 'Ethanoic acid + the alkanol + 3 drops of conc. H₂SO₄; warm in the bath, pour into cold water, waft.', done: s.tests.some((t) => t.test === 'ESTER' && orgObserve(v, t).complete) });
  const rows = s.tests.map((_, i) => i);
  const left = rows.filter((i) => !s.table[i]?.observation.trim() || !(s.table[i]!.present.length || s.table[i]!.absent.length || s.table[i]!.note.trim())).length;
  steps.push(
    { id: 'record', label: left ? `Write the observation and inference for every test (${left} to go)` : 'Write the observation and inference for every test', target: 'book', why: 'Write exactly what you saw; infer only what that test shows.', done: rows.length >= v.minRows && !left },
    { id: 'conclude', label: 'Identify each sample', target: 'book', why: 'Put each sample’s rows together.', done: ORG_TASK_SAMPLES[task].filter((x) => x !== 'H2O').every((x) => (s.conclusion[x] ?? []).length > 0) },
    { id: 'calc', label: 'Do the calculation', target: 'book', why: 'Show the moles, the masses and the answer with its unit.', done: !!s.calc.a.trim() && !!s.calc.b.trim() },
    { id: 'written', label: 'Write two precautions and answer the question', target: 'book', why: 'Precautions are things you did to get reliable results safely.', done: !!s.written.precautions.trim() && !!s.written.explain.trim() },
    { id: 'handin', label: 'Hand in your lab', target: null, why: 'Open the menu and choose Hand in when everything is recorded.', done: false },
  );
  return steps;
}

function soapSteps(v: ChemOrganicVariant, s: ChemOrganicState): GuideStep[] {
  const r = soapRun(v, s.soap);
  const g = 'Making the soap';
  return [
    { id: 'oil', label: 'Measure 10 cm³ of palm oil into the beaker and weigh it', target: !r.oil ? 'soapbottle:OIL' : 'balance', why: 'The mass of oil is needed for the yield.', done: r.oil && r.oilWeighed, group: g },
    { id: 'naoh', label: 'Add 20 cm³ of 20% NaOH', target: 'soapbottle:NAOH', why: 'The alkali hydrolyses the fat.', done: r.naoh, group: g },
    { id: 'boil', label: `Boil gently, stirring, for 15–20 min (${Math.round(r.boiled / 60)} so far)`, target: 'beaker', why: `Stir all the time; add water when it gets low (${r.water.toFixed(0)} cm³ now).`, done: r.boiled >= 900, group: g },
    { id: 'brine', label: 'Add saturated brine and stir', target: 'soapbottle:BRINE', why: 'The soap separates and floats.', done: r.brine, group: g },
    { id: 'filter', label: 'Cool, filter, wash and dry the soap', target: 'funnel', why: 'Washing removes excess alkali.', done: r.filtered && r.washed && r.dried, group: g },
    { id: 'weigh', label: 'Weigh the soap', target: 'balance', why: 'For the % yield.', done: r.soapMass !== null, group: g },
    { id: 'lather', label: 'Lather test: distilled water and hard water', target: 'lather:soft', why: 'Compare the lather.', done: r.soft && r.hard, group: g },
    { id: 'record', label: 'Write the four observations and inferences', target: 'book', why: 'What you saw at each stage and what it shows.', done: SOAP_ROWS.every((x) => s.soapRows[x].observation.trim() && s.soapRows[x].claims.length) },
    { id: 'results', label: 'Masses, theoretical mass, % yield and the by-product', target: 'book', why: 'Theoretical = oil ÷ 806 × 3 × 278.', done: !!(s.readings.oil && s.readings.soap && s.readings.theory && s.readings.yield && s.readings.byproduct) },
    { id: 'written', label: 'Write two precautions and answer the question', target: 'book', why: 'Use salting out and the hydrophobic tail / hydrophilic head.', done: !!s.written.precautions.trim() && !!s.written.explain.trim() },
    { id: 'handin', label: 'Hand in your lab', target: null, why: 'Open the menu and choose Hand in when everything is recorded.', done: false },
  ];
}

/** A gentle correction for a step just recorded in the log (null: nothing wrong). */
export function orgCorrection(a: string, s: ChemOrganicState, scene: OrgScene): Correction | null {
  const [verb, arg] = a.split(':') as [string, string | undefined];
  const tube = (x?: string) => s.tests[Number((x ?? '').split('#')[1]) - 1];
  if (verb === 'heat-direct') {
    const t = tube(arg);
    return t && ORG_TEST_INFO[t.test].task === 'GROUPS'
      ? { title: 'No flames near organic liquids.', why: 'Hexene, hexane, ethanol and the acids are flammable: their vapour can catch fire. Warm them only in the hot water bath, with the tube held in a holder.', focus: 'bath' }
      : { title: 'Heat it in the boiling water bath, not over the flame.', why: 'Straight over the flame the liquid boils suddenly and can spurt out. The water bath heats it evenly and safely.', focus: 'bath' };
  }
  if (verb.startsWith('heat') && !scene.goggles) return { title: 'Put your goggles on before heating.', why: 'Hot liquids can splash: protect your eyes.', focus: 'bath' };
  if (verb === 'sniff-refused') return { title: 'Waft — never sniff.', why: 'Fan a little of the vapour towards your nose with your hand: some vapours burn the nose and lungs.', focus: 'tube' };
  if (verb === 'collect' && arg && !ORG_APPARATUS.find((x) => x.id === arg)?.for.includes(s.task ?? 'GROUPS')) return { title: 'That is not needed for this practical.', why: 'Only take what the practical needs; you can put it back from your bench.' };
  if (verb === 'step' && arg?.startsWith('BENEDICT#')) {
    const t = tube(arg);
    if (t?.test === 'HYDROLYSIS' && !t.steps.includes('NEUTRALISE')) return { title: 'Neutralise the acid first.', why: 'Benedict’s works only in alkaline conditions: add NaHCO₃ until the fizzing stops, then Benedict’s.', focus: 'tube' };
  }
  if (verb === 'step' && arg?.startsWith('CUSO4#')) {
    const t = tube(arg);
    if (t && !t.steps.includes('NAOH')) return { title: 'Sodium hydroxide goes in first.', why: 'The Biuret test is copper in alkali: 2 cm³ NaOH, then CuSO₄ drop by drop.', focus: 'tube' };
    if (t && t.drops === 6) return { title: 'That is too much copper(II) sulphate.', why: 'Its deep blue hides the violet. Two or three drops are enough: start again in a clean tube.', focus: 'tube' };
  }
  if (verb === 'heat' && arg) {
    const t = tube(arg);
    if (t?.test === 'IODINE') return { title: 'Do not heat the iodine test.', why: 'The blue-black starch–iodine colour disappears when hot: test it cold.', focus: 'tube' };
  }
  if (verb === 'soap' && arg === 'BOIL_NOSTIR') return { title: 'Stir all the time.', why: 'Unstirred, the oil floats on the alkali, reacts slowly and the hot mixture spits. Stir continuously with the glass rod.', focus: 'beaker' };
  if (verb === 'soap' && arg === 'BOIL') {
    if (!scene.goggles) return { title: 'Goggles on: hot NaOH spits.', why: 'Boiling sodium hydroxide is very corrosive: protect your eyes.', focus: 'beaker' };
  }
  if (verb === 'test' && arg && ORG_TEST_INFO[arg.split('@')[0] as OrgTestId]?.heats && !scene.burnerOn && s.tests.length === 1) return { title: 'Light the water bath now.', why: 'It takes a few minutes to boil: get it going while you set up the tests.', focus: 'bath' };
  return null;
}
