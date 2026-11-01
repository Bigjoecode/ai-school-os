import { EN_LID_OK, EN_STIR_OK, SOLY_PROMPT, SOLY_WATER0, enExtreme, type ChemEnergeticsState, type ChemEnergeticsVariant } from '@aischool/shared';
import type { Correction, GuideStep } from '../../../lab3d-kit/guide';
import type { CameraMode } from '../../../lab3d-kit/store';
import { curveRun, nextKind, openRun, openTube, type Energetics } from '../actions';
import { APPARATUS_LABEL, NEEDED, PLACE_LABEL, type ApparatusId, type SceneState } from './scene-state';

/**
 * Guided mode (practice only): the practical as a checklist with the reason
 * for each step, and gentle corrections for what was just done. Worked out
 * from the recorded state: the guide never says what the thermometer reads.
 */

export function guideSteps(s: ChemEnergeticsState, scene: SceneState, mode: CameraMode, o: Energetics): GuideStep[] {
  const task = s.task ?? 'NEUT';
  const steps: GuideStep[] = [
    { id: 'goggles', label: 'Put on your goggles (and lab coat)', target: 'goggles', why: task === 'SOLY' ? 'Hot solutions can spit.' : 'Acid and alkali are corrosive and can splash as you pour.', done: scene.goggles },
    { id: 'collect', label: `Collect your apparatus${scene.missing.length ? ` (${scene.missing.length} to go)` : ''}`, target: 'cupboard', why: NEEDED[task].map((id) => APPARATUS_LABEL[id].toLowerCase()).join(', ') + '.', done: scene.ready },
    { id: 'bench', label: 'Go to your bench', target: 'mybench', why: 'Bench 2, at the front.', done: mode !== 'walk' || scene.placed.size > 0 || !!s.setup.vessel || s.soly.mass !== null },
  ];
  if (task === 'SOLY') {
    for (const id of ['burette', 'bath'] as ApparatusId[]) steps.push({ id: `place-${id}`, label: PLACE_LABEL[id]!, target: id, why: id === 'burette' ? 'A burette measures the water to 0.1 cm³.' : 'A water bath warms the tube gently, so little water evaporates.', done: scene.placed.has(id), group: 'Set up' });
    steps.push({ id: 'weigh', label: 'Weigh 4.0 g of KNO₃ into the boiling tube', target: 'balance', why: 'The same mass is used all the way through.', done: s.soly.mass !== null, group: 'Set up' });
    const done = s.soly.runs.filter((r) => r.done).length;
    const t = openTube(s);
    if (done < 4 || t) {
      const group = `Run ${s.soly.runs.length + (t ? 0 : 1)}: ${(t ? t.r.water : s.soly.runs.length ? s.soly.water + 1 : SOLY_WATER0).toFixed(1)} cm³ of water`;
      const ph = o.phase();
      steps.push(
        { id: 'water', label: s.soly.runs.length === 0 && !t ? 'Run 5.0 cm³ of water from the burette into the tube' : 'Add 1.0 cm³ more water from the burette', target: 'burette', why: 'Each volume of water gives one point on the curve.', done: !!t, group },
        { id: 'heat', label: 'Warm the tube in the water bath until all the solid dissolves', target: 'bath', why: 'Not over a flame: the solution would boil and lose water.', done: !!t && (ph === 'cool' || t.r.dissolved), group },
        { id: 'cool', label: 'Take it out, and stir gently with the thermometer as it cools', target: 'tube', why: 'Stirring stops it supercooling, so crystals appear at the right temperature.', done: !!t && ph === 'cool' && o.stirring(), group },
        { id: 'crystals', label: 'Read the thermometer the moment the first crystals appear', target: 'tube', why: 'That is the saturation temperature for this volume of water.', done: false, group },
        { id: 'row', label: 'Write the volume and the temperature in your table', target: 'book', why: 'Temperature to one decimal place (nearest 0.5 °C).', done: false, group },
      );
    }
    steps.push(
      { id: 'table', label: 'Work out the solubility for every row', target: 'book', why: 'Solubility = 4.0 × 100 ÷ volume of water (g per 100 g of water).', done: s.solyTable.length >= 4 && s.solyTable.every((r) => r.temp.trim() && r.sol.trim()) },
      { id: 'graph', label: 'Plot solubility against temperature and draw a smooth curve', target: 'book', why: 'The solubility of KNO₃ rises more and more steeply: a curve, not a straight line.', done: s.curve === 'SMOOTH' },
      { id: 'answers', label: 'Read the two solubilities from your curve and do the calculations', target: 'book', why: 'Crystals deposited = the difference; mol kg⁻¹ = g per 100 g × 10 ÷ 101.', done: ['sHi', 'sLo', 'mass', 'molal'].every((k) => !!s.answers[k as 'sHi'].value.trim()) },
    );
  } else {
    const neut = task === 'NEUT';
    steps.push(
      { id: 'vessel', label: 'Use the polystyrene cup', target: 'cup', why: 'Polystyrene is a poor conductor of heat and takes in very little heat itself.', done: s.setup.vessel === 'CUP', group: 'Set up' },
      { id: 'support', label: 'Stand the cup in the 250 cm³ beaker', target: 'beaker', why: 'The light cup tips over easily.', done: s.setup.support, group: 'Set up' },
    );
    const kinds = neut ? (['NEUT'] as const) : (['SALT', 'NAOH'] as const);
    for (const kind of kinds) {
      if (s.runs.some((r) => r.done && r.kind === kind)) continue;
      if (kind === 'NAOH' && !s.runs.some((r) => r.done && r.kind === 'SALT')) break;
      const r = openRun(s);
      const mine = !!r && (nextKind(s) === kind || r.r.kind === kind);
      const group = kind === 'NEUT' ? 'The neutralisation' : kind === 'SALT' ? 'NH₄NO₃' : 'Comparison: NaOH';
      steps.push({ id: `a-${kind}`, label: neut ? 'Measure 50.0 cm³ of the acid (A) into the cup' : `Measure 50.0 cm³ of ${kind === 'NAOH' ? 'fresh ' : ''}distilled water into the cup`, target: 'cylinder', why: 'The card’s volume: the mass heated is what Q = mcΔT uses.', done: mine, group });
      steps.push({ id: `ra-${kind}`, label: neut ? 'Put the thermometer in the acid and record its steady temperature' : 'Put the thermometer in the water and record its steady temperature', target: 'thermometer', why: 'Wait a few seconds for it to settle; read at eye level to the nearest 0.5 °C.', done: mine && !!r?.r.readA, group });
      if (neut) {
        steps.push({ id: 'b', label: 'Measure 50.0 cm³ of the alkali (B) in the second cylinder', target: 'cylinder2', why: 'Equal amounts: 0.0500 mol of each.', done: mine && (r?.r.volB ?? 0) > 0, group });
        steps.push({ id: 'rb', label: 'Read the temperature of the alkali too', target: 'cylinder2', why: 'The initial temperature is the mean of the two.', done: mine && !!r?.r.readB, group });
      } else steps.push({ id: `w-${kind}`, label: kind === 'SALT' ? 'Weigh 4.00 g of NH₄NO₃' : 'Weigh 2.00 g of NaOH pellets (spatula only)', target: 'balance', why: kind === 'SALT' ? '4.00 ÷ 80 = 0.0500 mol.' : 'NaOH is corrosive: never touch the pellets.', done: mine && (r?.r.solid ?? 0) > 0, group });
      steps.push(
        { id: `mix-${kind}`, label: neut ? 'Pour the alkali quickly into the acid' : 'Tip the solid into the water', target: 'cup', why: 'Quickly, so that little heat is exchanged before the reading.', done: mine && !!r?.r.mixed, group },
        { id: `lid-${kind}`, label: 'Cover the cup with the lid at once', target: 'cup', why: 'Most heat would escape from the open surface.', done: mine && r?.r.lidAt !== null && r?.r.lidAt !== undefined, group },
        { id: `stir-${kind}`, label: 'Stir with the thermometer', target: 'thermometer', why: neut ? 'It mixes the solutions and keeps the thermometer reading the whole liquid.' : 'Until every crystal has dissolved.', done: mine && r?.r.stirAt !== null && r?.r.stirAt !== undefined, group },
        { id: `watch-${kind}`, label: `Watch the thermometer: record the ${kind === 'SALT' ? 'lowest' : 'highest'} temperature it reaches`, target: 'thermometer', why: 'It changes quickly, stops, then slowly drifts back towards room temperature. Finish once it has turned.', done: false, group },
      );
      break;
    }
    steps.push(
      { id: 'table', label: neut ? 'Fill in the table: initial (mean), highest and ΔT' : 'Fill in the table: initial, lowest (highest for NaOH) and ΔT', target: 'book', why: 'Temperatures to one decimal place.', done: s.table.length > 0 && s.table.every((r) => r.a.trim() && r.extreme.trim() && r.dT.trim()) },
      { id: 'nature', label: neut ? 'Say whether neutralisation is exothermic or endothermic' : 'Say which dissolving is exothermic and which endothermic', target: 'book', why: 'A temperature rise means heat given out.', done: neut ? !!s.nature.main : !!s.nature.main && !!s.nature.other },
      { id: 'answers', label: 'Work out Q, the moles and ΔH (with its sign)', target: 'book', why: neut ? 'Q = 100 × 4.2 × ΔT; n = 0.0500; ΔH = −Q ÷ n ÷ 1000 kJ mol⁻¹.' : 'Q = 50.0 × 4.2 × ΔT; n = 4.00 ÷ 80; ΔH = +Q ÷ n ÷ 1000 kJ mol⁻¹.', done: !!s.answers.q.value.trim() && !!s.answers.n.value.trim() && !!s.answers.dH.value.trim() },
    );
  }
  steps.push(
    { id: 'explain', label: 'Write the explanation and two precautions', target: 'book', why: task === 'NEUT' ? 'H⁺ + OH⁻ → H₂O; weak acids use energy to ionise.' : task === 'SOLN' ? 'Heat absorbed (endothermic) or given out (exothermic).' : 'Define solubility; explain the crystals.', done: !!s.written.explanation.trim() && !!s.written.precautions.trim() },
    { id: 'handin', label: 'Hand in your lab', target: null, why: 'Open the menu and choose Hand in when everything is recorded.', done: false },
  );
  return steps;
}

/** A gentle correction for a step just recorded (null: nothing wrong). */
export function correctionFor(a: string, s: ChemEnergeticsState, v: ChemEnergeticsVariant, scene: SceneState): Correction | null {
  const [verb, arg, extra] = a.split(':') as [string, string | undefined, string | undefined];
  const task = s.task ?? 'NEUT';
  if (verb === 'collect' && arg === 'burner' && task === 'SOLY') return { title: 'A water bath is safer and better.', why: 'A naked flame makes the solution boil and spit, and water evaporates — the solution becomes more concentrated than you think.' };
  if (verb === 'collect' && arg === 'glassBeaker' && task !== 'SOLY') return { title: 'Glass is a poor choice here.', why: 'Glass conducts heat away and absorbs some itself: use the polystyrene cup.' };
  if (verb === 'collect' && arg && !NEEDED[task].includes(arg as ApparatusId) && APPARATUS_LABEL[arg as ApparatusId]) return { title: `The ${APPARATUS_LABEL[arg as ApparatusId].toLowerCase()} is not needed here.`, why: `This practical needs ${NEEDED[task].map((id) => APPARATUS_LABEL[id].toLowerCase()).join(', ')}.` };
  if ((verb === 'measure-a' || verb === 'weigh' || verb === 'kno3') && !scene.goggles) return { title: 'Goggles first.', why: task === 'SOLY' ? 'Hot solutions can spit into your eyes.' : 'Acid and alkali are corrosive: put on the goggles from the hooks by the door.' };
  if (verb === 'vessel' && arg === 'BEAKER') return { title: 'Use the polystyrene cup.', why: 'The glass beaker loses heat quickly and soaks some up: your temperature change will be too small.', focus: 'cup' };
  if (verb === 'measure-a' && arg && Number(arg) !== 50) return { title: 'Measure 50.0 cm³.', why: `You measured ${arg} cm³. The calculation assumes 50.0 cm³: pour it away and measure again.`, focus: 'cup' };
  if (verb === 'measure-b' && arg && Number(arg) !== 50) return { title: 'Measure 50.0 cm³ of the alkali.', why: `${arg} cm³ is not what the card says: the amounts would not match.`, focus: 'cup' };
  if (verb === 'weigh' && arg && extra) {
    const want = arg === 'NAOH' ? 2 : 4;
    if (Number(extra) !== want) return { title: `Weigh ${want.toFixed(2)} g.`, why: `You weighed ${Number(extra).toFixed(2)} g of ${arg === 'NAOH' ? 'NaOH' : 'NH₄NO₃'}. Pour it away and start again with the right mass.`, focus: 'cup' };
    if (arg === 'NAOH' && nextKind(s) !== 'NAOH' && !s.runs.some((r) => r.done && r.kind === 'SALT')) return { title: 'NH₄NO₃ first.', why: 'The marked part is NH₄NO₃; NaOH is the comparison afterwards.', focus: 'cup' };
  }
  if (verb === 'mix') {
    const r = openRun(s);
    if (r && !r.r.readA) return { title: 'You did not read the starting temperature.', why: 'Without it there is no ΔT. Pour away and start again, reading it first.', focus: 'cup' };
    if (r && task === 'NEUT' && !r.r.readB) return { title: 'The alkali temperature was not read.', why: 'The initial temperature is the mean of the acid and alkali temperatures.', focus: 'cup' };
  }
  if (verb === 'lid' && arg && Number(arg) > EN_LID_OK) return { title: 'Cover the cup at once.', why: `The lid went on ${Math.round(Number(arg))} s after mixing: heat escaped meanwhile.`, focus: 'cup' };
  if (verb === 'stir' && arg && Number(arg) > EN_STIR_OK) return { title: 'Start stirring straight away.', why: `You began ${Math.round(Number(arg))} s after mixing: unstirred, the thermometer lags behind the liquid.`, focus: 'cup' };
  if (verb === 'finish') {
    const i = s.runs.findLastIndex((r) => r.done);
    const r = s.runs[i];
    if (r) {
      const full = enExtreme(v, curveRun(r, i));
      if ((r.elapsed ?? 0) < full.at + 5) return { title: 'You finished too soon.', why: `The temperature was still ${r.kind === 'SALT' ? 'falling' : 'rising'}. Keep watching until it stops and starts to turn back. Repeat the run.`, focus: 'cup' };
    }
  }
  if (verb === 'heat' && arg === 'FLAME') return { title: 'Use the water bath.', why: 'Over a flame the solution boils, spits and loses water: your saturation temperatures will be too high.', focus: 'tube' };
  if (verb === 'heat-off') {
    const t = s.soly.runs.at(-1);
    if (t && !t.dissolved) return { title: 'Not all the solid had dissolved.', why: 'Put it back in the bath until every crystal has gone: left-over crystals make it crystallise early.', focus: 'tube' };
  }
  if (verb === 'crystals' && extra && Number(extra) > SOLY_PROMPT) return { title: 'Read it as soon as the crystals appear.', why: `That was ${Math.round(Number(extra))} s after they first appeared: the solution had cooled further.`, focus: 'tube' };
  if (verb === 'crystals') {
    const t = s.soly.runs.at(-1);
    if (t && !t.stirred) return { title: 'Stir while it cools.', why: 'Unstirred, the solution supercools: crystals appear late, at too low a temperature.', focus: 'tube' };
  }
  if (verb === 'crystals-early') return { title: 'No crystals yet.', why: 'Look closely: wait for the first tiny crystals to appear in the clear solution.', focus: 'tube' };
  if (verb === 'water' && arg && s.soly.runs.length === 1 && Number(arg) !== SOLY_WATER0) return { title: 'Start with 5.0 cm³ of water.', why: 'The card says 4.0 g of KNO₃ in 5.0 cm³ of water to begin.', focus: 'burette' };
  return null;
}
