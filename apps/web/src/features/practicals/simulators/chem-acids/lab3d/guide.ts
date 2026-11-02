import { HARD_LABEL, IND_SOLS, IND_SOL_LABEL, PH_INFO, PH_LETTER, PH_SAMPLES, acidExcess, hardOpenRun, indOpenRun, type ChemAcidsState, type ChemAcidsVariant } from '@aischool/shared';
import type { Correction, GuideStep } from '../../../lab3d-kit/guide';
import type { CameraMode } from '../../../lab3d-kit/store';
import type { Acids } from '../actions';
import { APPARATUS_LABEL, NEEDED, type ApparatusId, type SceneState } from './scene-state';

/**
 * Guided mode (practice only): the lesson's procedure as a checklist with the
 * object to use next, and gentle corrections — with the reason — when a step
 * is done the wrong way. Everything is worked out from the recorded state.
 */
export function guideSteps(s: ChemAcidsState, scene: SceneState, mode: CameraMode, x: Acids): GuideStep[] {
  const task = scene.task;
  const v = x.v;
  const steps: GuideStep[] = [
    { id: 'safety', label: 'Put on your lab coat and goggles', target: !scene.coat ? 'coat' : !scene.goggles ? 'goggles' : null, why: task === 'HARD' ? 'Boiling water scalds; soap solution stings the eyes.' : task === 'ACID' ? 'Acid splashes; hydrogen pops near flames.' : 'Acids and alkalis splash into eyes. Never taste a sample.', done: scene.coat && scene.goggles },
    { id: 'collect', label: `Collect your apparatus${scene.missing.length ? ` (${scene.missing.length} to go)` : ''}`, target: 'cupboard', why: `From the cupboard: ${NEEDED[task].map((id) => APPARATUS_LABEL[id].toLowerCase()).join(', ')}.`, done: scene.ready },
    { id: 'bench', label: 'Go to your bench', target: 'mybench', why: 'Bench 2, at the front. Your reagents are there.', done: mode !== 'walk' || s.log.some((e) => /^(rinse-|white-tile|pour:|crush:|tube-acid:|zero-balance|fill-)/.test(e.a)) },
  ];
  const book: GuideStep[] = [
    { id: 'record', label: 'Record your results in the notebook', target: 'book', why: task === 'PH' ? 'The pH (a whole number from the chart) and the class of each sample.' : task === 'IND' ? 'The colours, the pH values and every burette reading to 2 d.p.' : task === 'ACID' ? 'The gases, the colour, and each mass to 2 d.p.' : 'The volume of soap for each sample, to 1 d.p.', done: false },
    { id: 'calc', label: 'Work out the calculations, with units', target: 'book', why: task === 'PH' ? 'pH = −log[H⁺]; pH = 14 − pOH; each pH unit is ×10.' : task === 'IND' ? 'Means of concordant titres; difference ÷ methyl-orange titre × 100.' : task === 'ACID' ? 'Moles = mass ÷ 100; CO₂ = moles × 44; lost ÷ expected × 100.' : 'Temporary = before − after; permanent = after − blank.', done: v.tasks.every((t) => s.answers[t.id].value.trim()) },
    { id: 'written', label: 'Write your observations, the explanation and two precautions', target: 'book', why: 'Use what you saw on the bench.', done: !!s.written.observation.trim() && !!s.written.explain.trim() && !!s.written.precautions.trim() },
    { id: 'handin', label: 'Hand in your lab', target: null, why: 'Open the menu and choose Hand in when everything is recorded.', done: false },
  ];
  if (task === 'PH') {
    const w = s.ph;
    steps.push(
      { id: 'rinse', label: 'Rinse the test tubes with distilled water', target: 'washBottle', why: 'Traces left in a tube change the colour.', done: w.rinsed },
      { id: 'tile', label: 'Stand the white tile behind the rack', target: 'tile', why: 'Colours are compared against white, in good light.', done: w.tile },
    );
    for (const k of PH_SAMPLES) {
      const t = w.tubes[k];
      const L = PH_LETTER[k];
      steps.push({ id: `s${k}`, group: 'samples', label: `Sample ${L} (${PH_INFO[k].label.toLowerCase()}): 2 cm³, 2 drops, shake, compare`, target: `tube:${k}`, why: !t.vol ? 'About 2 cm³ — a quarter of the tube.' : !t.drops ? 'Two drops of universal indicator, the same in every tube.' : !t.shaken ? 'Shake gently so the colour is even.' : 'Hold it against the chart and note the pH.', done: t.compared && t.shaken && !!t.drops });
    }
  } else if (task === 'IND') {
    const w = s.ind;
    const run = indOpenRun(w);
    const mo = w.runs.filter((r) => r.done && r.ind === 'MO').length;
    const z = w.runs.filter((r) => r.done && r.ind === 'ZOBO').length;
    steps.push(
      { id: 'crush', label: 'Crush the zobo calyces with warm water (or ethanol in a water bath)', target: 'mortar', why: 'Crushing breaks the cells and lets the red colour dissolve.', done: !!w.solvent },
      { id: 'filter', label: 'Filter: the filtrate is the indicator', target: 'funnel', why: 'Bits of calyx would cloud the colours.', done: w.filtered },
    );
    for (const k of IND_SOLS) steps.push({ id: `t${k}`, group: 'tests', label: `${IND_SOL_LABEL[k]}: a few drops of extract, and universal indicator in a second tube`, target: `sol:${k}`, why: 'Universal indicator tells you the pH of each solution.', done: w.tests[k].ext && w.tests[k].ui });
    steps.push(
      { id: 'burette', label: 'Rinse the burette with the HCl, then fill it', target: 'burette', why: 'Water left inside would dilute the acid.', done: w.burRinsed && w.burette !== null },
      { id: 'pipette', label: 'Rinse the pipette with NaOH; pipette 25.0 cm³ into the flask', target: 'pipette', why: 'Rinsing with the solution itself keeps its concentration.', done: w.pipRinsed && (w.flask || w.runs.length > 0) },
      { id: 'mo', label: `Titrate with 2–3 drops of methyl orange (${Math.min(mo, 2)}/2)`, target: run?.ind === 'MO' ? 'flask' : !w.flask && !run ? 'pipette' : mo < 2 ? 'ind:MO' : 'flask', why: run?.ind === 'MO' ? 'Run in the acid, swirling; drop by drop near the end. Stop at the first orange.' : 'Yellow in the alkali; orange at the end point.', done: mo >= 2 },
      { id: 'zobo', label: `Titrate with 2–3 drops of the zobo extract (${Math.min(z, 2)}/2)`, target: run?.ind === 'ZOBO' ? 'flask' : !w.flask && !run ? 'pipette' : 'ind:ZOBO', why: run?.ind === 'ZOBO' ? 'Green in the alkali, through purple, to red at the end point.' : 'The same titration with your own indicator.', done: z >= 2 },
    );
  } else if (task === 'ACID') {
    const w = s.acid;
    const t = w.tubes;
    steps.push(
      { id: 'metals', label: 'Dilute HCl on the magnesium, zinc and copper', target: !t.MG.acid ? 'tube:MG' : !t.ZN.acid ? 'tube:ZN' : 'tube:CU', why: 'Which metals fizz?', done: t.MG.acid && t.ZN.acid && t.CU.acid },
      { id: 'pop', label: 'A burning splint at the mouth of the Mg and Zn tubes', target: !t.MG.tests.includes('BURNING') ? 'tube:MG' : 'tube:ZN', why: 'Hydrogen burns with a squeaky pop. Test only the small volume in the tube.', done: t.MG.tests.includes('BURNING') && t.ZN.tests.includes('BURNING') },
      { id: 'cuo', label: 'Warm a little CuO gently with dilute HCl', target: !t.CUO.acid ? 'tube:CUO' : 'burner', why: 'A base: it dissolves only when warm.', done: t.CUO.acid && !!t.CUO.warmed },
      { id: 'marble', label: 'HCl on marble; pass the gas into limewater', target: 'tube:CACO3', why: 'Carbon dioxide turns limewater milky.', done: t.CACO3.acid && t.CACO3.tests.includes('LIME') },
      { id: 'zero', label: 'Zero the balance with the pan empty', target: 'balance', why: 'Otherwise every mass includes the balance’s error.', done: w.zeroed || w.chips > 0 },
      { id: 'chips', label: 'Weigh about 2.00 g of marble chips', target: 'balance', why: 'Tap chips on until it reads close to 2.00 g; record the exact mass.', done: x.look.chips >= 1.8 && x.look.chips <= 2.2 },
      { id: 'acid', label: 'Measure 50 cm³ of HCl into the flask; plug it with cotton wool', target: w.acidVol === null ? 'cylinder' : 'cotton', why: 'Excess acid; the plug keeps spray in but lets CO₂ out.', done: w.acidVol !== null && (w.plug || w.flaskWeighed) && acidExcess(v, w) },
      { id: 'weigh1', label: 'Weigh the flask, acid and plug', target: 'balance', why: 'Record to 2 d.p.', done: w.flaskWeighed },
      { id: 'add', label: 'Tip in the marble and replace the plug', target: 'acidFlask', why: 'Watch the balance reading fall as CO₂ escapes.', done: w.added },
      { id: 'weigh2', label: 'When the fizzing stops, weigh until two readings agree', target: 'balance', why: 'Use time-lapse; the mass stops changing when the reaction is over.', done: w.weighings.length >= 2 && x.look.extent >= 0.99 },
    );
  } else {
    const w = s.hard;
    const run = hardOpenRun(w);
    steps.push({ id: 'burette', label: 'Rinse the burette with soap solution; fill it', target: 'burette', why: 'Water left inside would dilute the soap.', done: w.burRinsed && w.burette !== null });
    const order: [typeof w.runs[number]['sample'], boolean][] = [['DIST', false], ['RAIN', false], ['TAP', false], ['X', false], ['Y', false], ['TAP', true], ['X', true], ['Y', true]];
    let boilAdded = false;
    for (const [k, b] of order) {
      if (b && !boilAdded) {
        boilAdded = true;
        steps.push({ id: 'boil', label: 'Boil 50 cm³ of tap water, X and Y for 5 minutes; cool, make up to 50 cm³, filter', target: 'boil', why: 'Boiling removes temporary hardness (Ca(HCO₃)₂ → CaCO₃).', done: (['TAP', 'X', 'Y'] as const).every((q) => !!w.boiled[q]) });
      }
      const doneRun = w.runs.some((r) => r.done && r.sample === k && r.boiled === b);
      const open = run && run.sample === k && run.boiled === b;
      steps.push({ id: `h${k}${b ? 'b' : ''}`, group: 'soap', label: `${b ? 'Boiled ' : ''}${b ? HARD_LABEL[k].toLowerCase() : HARD_LABEL[k]}: soap 0.5 cm³ at a time, shake, until the lather lasts 2 min`, target: open ? 'flask' : run ? 'flask' : `sample:${k}`, why: open ? (x.look.lather === 'LASTING' ? 'Leave it for 2 minutes: does the lather last? Then read the burette.' : 'Stopper and shake after each 0.5 cm³.') : '50.0 cm³ in the measuring cylinder, then into the flask.', done: doneRun });
    }
  }
  return [...steps, ...book];
}

/** A gentle correction for a step just recorded in the log (null: nothing wrong). */
export function correctionFor(a: string, s: ChemAcidsState, v: ChemAcidsVariant): Correction | null {
  const [verb, arg, arg2] = a.split(':') as [string, string | undefined, string | undefined];
  if (verb === 'collect' && arg && !NEEDED[s.task ?? 'PH'].includes(arg as ApparatusId)) return { title: `The ${APPARATUS_LABEL[arg as ApparatusId]?.toLowerCase() ?? arg} is not needed here.`, why: 'Only take what the practical needs; put it back from your bench or the cupboard list.' };
  if (verb === 'pour' && !s.ph.rinsed && PH_SAMPLES.filter((k) => s.ph.tubes[k].vol).length === 1) return { title: 'The tubes were not rinsed.', why: 'A trace of whatever was in them before (soap, here) changes the colour — distilled water would show blue-green instead of green. Rinse with distilled water first.', focus: 'rack' };
  if (verb === 'pour' && arg2 === 'FULL') return { title: 'Too much sample.', why: 'Two drops of indicator in a full tube give a pale colour that is hard to match. About 2 cm³ is enough.', focus: 'rack' };
  if (verb === 'ui-drops' && arg && s.ph.tubes[arg as 'HCL']?.drops > 3) return { title: 'Keep to 2 drops.', why: 'Use the same number of drops in every tube so the colours can be compared fairly; too much indicator deepens the colour.', focus: 'rack' };
  if (verb === 'compare' && arg2 === 'streaky') return { title: 'Shake the tube first.', why: 'Unmixed, the indicator sits in a streak and the colour is wrong.', focus: 'rack' };
  if (verb === 'crush' && arg === 'ETHANOL' && arg2 === 'FLAME') return { title: 'Never heat ethanol over a flame.', why: 'Ethanol vapour catches fire. Warm it in a water bath (a beaker of hot water), with the burner turned off.', focus: 'extract' };
  if (verb === 'extract' && !s.ind.filtered) return { title: 'The extract was not filtered.', why: 'Bits of calyx make the colours cloudy and hard to see. Filter it first.', focus: 'extract' };
  if (verb === 'fill-burette' && !s.ind.burRinsed && s.ind.fills === 1) return { title: 'The burette was not rinsed with the acid.', why: 'Water left inside dilutes the acid, so the titre comes out too big. Rinse with a little HCl before filling.', focus: 'titration' };
  if (verb === 'pipette-naoh' && !s.ind.pipRinsed) return { title: 'The pipette was not rinsed with the NaOH.', why: 'Water left inside dilutes the 25.0 cm³ of alkali. Rinse with a little NaOH first.', focus: 'titration' };
  if (verb === 'indicator' && Number(arg2) > 3) return { title: 'Too much indicator.', why: 'Use 2–3 drops: more extract colours the whole flask so the change is hard to see — and its own acids react with the alkali.', focus: 'flask' };
  if (verb === 'end-point') {
    const r = s.ind.runs.filter((q) => q.done).at(-1);
    if (r) {
      const prev = s.ind.runs.filter((q) => q.done && q.ind === r.ind).slice(-2, -1)[0];
      if (prev && Math.abs(prev.added - r.added) > 0.1) return { title: 'This titre does not agree with the last one.', why: `They differ by ${Math.abs(prev.added - r.added).toFixed(2)} cm³. Repeat: run in quickly to 1 cm³ before the end point, then drop by drop, swirling.`, focus: 'titration' };
    }
  }
  if (verb === 'acid-vol' && !acidExcess(v, { acidVol: Number(arg), chips: Math.max(s.acid.chips, 8) })) return { title: `${arg} cm³ is not an excess.`, why: 'There is not enough acid for all the marble: some CaCO₃ stays unreacted and less CO₂ is lost. Use 50 cm³.', focus: 'balance' };
  if (verb === 'tap-marble' && !s.acid.zeroed && s.acid.chips === 1) return { title: 'The balance was not zeroed.', why: 'It reads a little with nothing on it, and that error goes into every mass. Zero it with the pan empty.', focus: 'balance' };
  if (verb === 'weigh-flask' && !s.acid.plug) return { title: 'No cotton-wool plug.', why: 'Acid spray escapes with the CO₂, so too much mass is lost. The plug lets the gas out but keeps the spray in — and it is weighed with the flask.', focus: 'balance' };
  if (verb === 'warm-cuo' && arg === 'STRONG') return { title: 'Warm gently.', why: 'Boiling acid hard makes it spit out of the tube. Point the tube away from people and warm it gently.', focus: 'acidTubes' };
  if (verb === 'test' && arg === 'CACO3' && arg2 === 'BURNING') return { title: 'The splint went out — but many gases do that.', why: 'Carbon dioxide is confirmed only by limewater turning milky.', focus: 'acidTubes' };
  if (verb === 'weigh-total' && s.acid.added) {
    const t = Number(arg);
    const ext = 1 - Math.exp(-t / (v.acid.tau * (acidExcess(v, s.acid) ? 1 : 1.8)));
    if (ext < 0.99) return { title: 'It is still fizzing.', why: 'The mass is still falling. Wait until the bubbles stop, then weigh until two readings agree.', focus: 'balance' };
  }
  if (verb === 'measure' && arg2 === 'ROUGH') return { title: 'Measure 50.0 cm³ exactly.', why: 'The soap needed depends on how much water is in the flask: every sample must have the same volume.', focus: 'flask' };
  if (verb === 'fill-soap' && !s.hard.burRinsed && s.hard.fills === 1) return { title: 'Rinse the burette with soap solution first.', why: 'Water left inside dilutes the soap, so more is needed.', focus: 'titration' };
  if (verb === 'soap' && arg2 === 'SWIRL') return { title: 'Stopper and shake.', why: 'A gentle swirl makes less lather than a good shake, so more soap seems to be needed. Shake the same way every time.', focus: 'flask' };
  if (verb === 'soap' && Number(arg) > 0.5) return { title: 'Add 0.5 cm³ at a time.', why: 'A big portion can run past the end point; the reading is then too high.', focus: 'flask' };
  if (verb === 'boil' && arg2 === 'SHORT') return { title: 'Boil for the full 5 minutes.', why: 'Ca(HCO₃)₂ decomposes slowly: after a minute much of the temporary hardness is still there.', focus: 'boil' };
  if (verb === 'boil' && arg2 === 'NOMAKEUP') return { title: 'Make the volume back up to 50 cm³.', why: 'Water boils away, so the hardness left is concentrated in less water. Cool, make up with distilled water, then filter.', focus: 'boil' };
  if (verb === 'soap-end') {
    const r = s.hard.runs.filter((q) => q.done).at(-1);
    if (r && !r.watched) return { title: 'Did the lather last 2 minutes?', why: 'In hard water the first froth soon collapses. Leave the stoppered flask for 2 minutes; if the lather goes, add more soap.', focus: 'flask' };
  }
  return null;
}
