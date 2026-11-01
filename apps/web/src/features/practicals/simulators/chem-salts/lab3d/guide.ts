import { MP_SLOW_MAX, PPT_INFO, SOL_WARM, chromAboveLine, chromRanOff, mpDissolved, mpTooMuch, pptExcess, solBaseExcess, solFiltrate, solRodResult, type ChemSaltsState, type ChemSaltsVariant } from '@aischool/shared';
import type { Correction, GuideStep } from '../../../lab3d-kit/guide';
import type { CameraMode } from '../../../lab3d-kit/store';
import type { Salts } from '../actions';
import { APPARATUS_LABEL, NEEDED, type ApparatusId, type SceneState } from './scene-state';

/**
 * Guided mode (practice only): the lesson's procedure as a checklist with the
 * object to use next, and gentle corrections — with the reason — when a step
 * is done the wrong way. Everything is worked out from the recorded state.
 */
export function guideSteps(s: ChemSaltsState, scene: SceneState, mode: CameraMode, x: Salts): GuideStep[] {
  const task = scene.task;
  const v = x.v;
  const b = x.bench;
  const heating = b.flame !== 'OFF';
  const steps: GuideStep[] = [
    { id: 'safety', label: 'Put on your lab coat and goggles', target: !scene.coat ? 'coat' : !scene.goggles ? 'goggles' : null, why: task === 'CHROM' ? 'Solvents splash, and ethanol is flammable.' : task === 'MP' ? 'Boiling water and hot oil can splash and scald.' : task === 'PPT' ? 'Solutions splash into eyes; some salts are toxic.' : 'Hot acid can spit into your eyes.', done: scene.coat && scene.goggles },
    { id: 'collect', label: `Collect your apparatus${scene.missing.length ? ` (${scene.missing.length} to go)` : ''}`, target: 'cupboard', why: `From the cupboard: ${NEEDED[task].map((id) => APPARATUS_LABEL[id].toLowerCase()).join(', ')}.`, done: scene.ready },
    { id: 'bench', label: 'Go to your bench', target: 'mybench', why: 'Bench 2, at the front. Your reagents are there.', done: mode !== 'walk' || s.log.some((e) => /^(acid|cat|line|weigh-impure)/.test(e.a)) },
  ];
  const book: GuideStep[] = [
    { id: 'record', label: 'Record your measurements in the notebook', target: 'book', why: task === 'CHROM' ? 'Distances in cm to 1 decimal place, from the baseline.' : 'Masses to 2 decimal places, as the balance shows them.', done: false },
    { id: 'calc', label: 'Work out the calculations, with units', target: 'book', why: task === 'CHROM' ? 'Rf = spot ÷ solvent; Rf has no unit.' : task === 'MP' ? 'Recovery = pure ÷ impure × 100; the widths of the two ranges.' : 'Moles → 1 : 1 → molar mass → theoretical mass → % yield.', done: v.tasks.every((t) => s.answers[t.id].value.trim()) },
    { id: 'written', label: 'Write your observations, the explanation and two precautions', target: 'book', why: 'Use what you saw on the bench.', done: !!s.written.observation.trim() && !!s.written.explain.trim() && !!s.written.precautions.trim() },
    { id: 'handin', label: 'Hand in your lab', target: null, why: 'Open the menu and choose Hand in when everything is recorded.', done: false },
  ];
  if (task === 'SOL') {
    const w = s.sol;
    const excess = solBaseExcess(v, w);
    const rodOk = w.rod.some((r) => solRodResult(solFiltrate(v, w).n, r) !== 'NONE');
    steps.push(
      { id: 'acid', label: 'Measure 50.0 cm³ of dilute H₂SO₄ into the beaker', target: 'bottle:acid', why: 'With the measuring cylinder, read at eye level.', done: w.acid !== null },
      { id: 'warm', label: 'Warm the acid gently on the gauze (about 60 °C)', target: b.gauze !== 'beaker' ? 'beaker' : 'burner', why: 'Warm acid dissolves the CuO quickly. Do not boil it — hot acid spits.', done: w.warmAtAdd !== null && w.warmAtAdd >= SOL_WARM.min },
      { id: 'cuo', label: 'Add CuO a spatula at a time, stirring, until some stays undissolved', target: !w.portions || excess ? 'jar:cuo' : w.stirs < w.portions ? 'rod' : 'jar:cuo', why: 'Excess base makes sure all the acid is used up; the excess is easily filtered off.', done: excess && w.stirs > 0 },
      { id: 'filter', label: 'Burner off; filter off the excess CuO into the dish', target: heating && b.gauze === 'beaker' ? 'burner' : 'beaker', why: 'The blue filtrate goes into the evaporating dish; the black excess stays on the paper.', done: w.filtered },
      { id: 'evap', label: 'Heat the dish to evaporate the water', target: b.gauze !== 'dish' ? 'dish' : 'burner', why: 'Evaporate to about a third of the volume.', done: w.water !== null || (b.gauze === 'dish' && heating) },
      { id: 'rod', label: 'Dip a cold glass rod in: crystals on it = crystallisation point', target: 'rod', why: 'Test every so often. Never evaporate to dryness — that drives off the water of crystallisation.', done: rodOk || w.filteredAt !== null },
      { id: 'stop', label: 'Stop heating and leave it to cool', target: 'burner', why: 'Crystals grow as it cools (use time-lapse).', done: w.filteredAt !== null || (rodOk && !(heating && b.gauze === 'dish')) },
      { id: 'collect-x', label: 'When cold, filter off the crystals', target: 'dish', why: 'More CuSO₄ crystallises the colder it gets.', done: w.filteredAt !== null || w.dry },
      { id: 'wash', label: 'Wash with a little cold distilled water', target: 'washBottle', why: 'Removes the solution on them; cold so they do not dissolve.', done: !!w.wash },
      { id: 'dry', label: 'Dry the crystals between filter papers', target: 'filterPaper', why: 'Never by heating: they would turn white.', done: !!w.drying },
      { id: 'weigh', label: 'Weigh the dry crystals', target: 'balance', why: 'Read the balance to 2 decimal places.', done: w.weighed },
    );
  } else if (task === 'PPT') {
    const w = s.ppt;
    const i = PPT_INFO[v.ppt.pair];
    steps.push(
      { id: 'cat', label: `Measure 25.0 cm³ of ${i.cation.formula} into the beaker`, target: 'bottle:cat', why: 'With the measuring cylinder.', done: w.cat !== null },
      { id: 'an', label: `Add 30 cm³ of ${i.anion.formula} (an excess)`, target: 'bottle:an', why: `Excess makes sure all the ${i.cation.formula} is precipitated.`, done: w.an !== null },
      { id: 'stir', label: 'Stir the mixture', target: 'rod', why: `A ${i.product.colourName} precipitate forms at once.`, done: w.stirred },
      { id: 'paper', label: 'Weigh a dry filter paper', target: 'balance', why: 'You need its mass to find the mass of the precipitate.', done: w.paper },
      { id: 'filter', label: 'Filter the precipitate', target: 'funnel', why: 'Pour the mixture through the weighed paper.', done: w.filtered },
      { id: 'rinse', label: 'Rinse the beaker into the funnel', target: 'washBottle', why: 'So no precipitate is left behind in the beaker.', done: w.rinsed },
      { id: 'wash', label: 'Wash the precipitate with distilled water', target: 'washBottle', why: `Removes the soluble ${i.spectator}, which would add mass.`, done: w.washes > 0 },
      { id: 'dry', label: 'Dry the paper and precipitate in the warm oven', target: 'oven', why: 'Never over a flame — the paper chars.', done: w.dried > 0 },
      { id: 'weigh', label: 'Weigh, dry again and weigh until two weighings agree', target: w.weighings.length && w.weighings.at(-1) === w.dried ? 'oven' : 'balance', why: 'Constant mass: all the water has gone.', done: w.weighings.length >= 2 && w.weighings.at(-1)! >= 2 && w.weighings.at(-2)! >= 2 },
    );
  } else if (task === 'CHROM') {
    const w = s.chrom;
    const lanes = (['INK', 'A', 'B'] as const).filter((l) => (w.spots.find((p) => p.lane === l)?.n ?? 0) >= 2);
    const nextLane = (['INK', 'A', 'B'] as const).find((l) => (w.spots.find((p) => p.lane === l)?.n ?? 0) < 2);
    steps.push(
      { id: 'line', label: 'Draw a baseline 1.5 cm from the bottom — in pencil', target: 'pencil', why: 'Graphite does not dissolve in the solvent; ink would run.', done: !!w.line },
      { id: 'spot', label: `Spot the ink, dye A and dye B on the baseline (twice each, drying between)`, target: w.spots.some((p) => !p.dry) ? 'paper' : nextLane ? `vial:${nextLane}` : 'paper', why: 'Small, concentrated spots give sharp separated spots.', done: lanes.length === 3 && w.spots.every((p) => p.dry) },
      { id: 'solvent', label: 'Pour solvent into the tank, BELOW the baseline', target: `solvent:${v.chrom.solvent}`, why: 'If the solvent covers the spots they dissolve into it.', done: !!w.solvent },
      { id: 'place', label: 'Stand the paper in the tank and put the lid on', target: 'tank', why: 'A covered tank stays saturated with solvent vapour, so the front rises evenly.', done: (w.inTank && w.covered) || w.developed !== null },
      { id: 'wait', label: 'Let the solvent rise near the top (time-lapse)', target: 'tank', why: 'Take it out before the front reaches the top.', done: w.developed !== null },
      { id: 'mark', label: 'Mark the solvent front in pencil at once', target: 'paper', why: 'It disappears as the paper dries.', done: w.frontMarked },
      { id: 'dry', label: 'Let the paper dry', target: 'paper', why: 'Then measure.', done: w.dried },
      { id: 'measure', label: 'Measure from the baseline to the front and to each spot centre', target: 'ruler', why: 'Use the ruler (Read the paper) to the nearest mm.', done: !!s.rec.solvent.trim() && !!s.rec.spotA.trim() },
    );
  } else {
    const w = s.mp;
    const done = new Set(w.runs.filter((r) => r.done).map((r) => r.sample));
    const open = x.openRun();
    steps.push(
      { id: 'weigh-i', label: 'Weigh the impure benzoic acid', target: 'balance', why: 'For the percentage recovery.', done: w.weighedImpure },
      { id: 'boil', label: 'Beaker on the gauze, burner lit: add boiling water 10 cm³ at a time', target: b.gauze !== 'beaker' && !w.hotFiltered ? 'beaker' : !heating && !w.hotFiltered ? 'burner' : 'hotWater', why: 'Use the minimum: stop as soon as the white solid has dissolved (sand and charcoal never dissolve).', done: mpDissolved(v, w) || w.hotFiltered },
      { id: 'funnel', label: 'Warm the funnel, then filter the hot solution', target: 'funnel', why: 'In a cold funnel the benzoic acid crystallises in the stem.', done: w.hotFiltered },
      { id: 'cool', label: 'Cool slowly, then in the ice bath', target: !w.cooling ? 'funnel' : 'iceBath', why: 'Slow cooling gives larger, purer crystals; ice leaves less dissolved.', done: w.cooling !== null && w.iced },
      { id: 'collect-x', label: 'Filter off the crystals; wash with ice-cold water; dry', target: !w.collected ? 'funnel' : !w.washed ? 'washBottle' : 'filterPaper', why: 'Ice-cold water washes away the soluble impurity without dissolving the crystals.', done: w.collected && w.washed && w.dried },
      { id: 'weigh-p', label: 'Weigh the dry crystals', target: 'balance', why: 'For the percentage recovery.', done: w.weighedPure },
      { id: 'pack', label: `Pack a capillary with the ${done.has('IMPURE') ? 'recrystallised' : 'impure'} sample; fasten it level with the thermometer bulb`, target: 'capillary', why: 'A 2–3 mm column of dry powder.', done: (!!open && open.attached) || done.size === 2 },
      { id: 'oil', label: 'Oil bath on the gauze: heat fast to about 110 °C, then 1–2 °C per minute', target: b.gauze !== 'oil' ? 'oilBath' : 'burner', why: 'Heating fast near the melting point makes the thermometer read high.', done: done.size === 2 || (!!open && x.look.bathT > 108 && b.flame === 'LOW') },
      { id: 'read', label: 'Read the thermometer when melting starts, and when it is all clear', target: 'oilBath', why: 'Two readings: the melting range.', done: done.size === 2 },
    );
  }
  return [...steps, ...book];
}

/** A gentle correction for a step just recorded in the log (null: nothing wrong). */
export function correctionFor(a: string, s: ChemSaltsState, v: ChemSaltsVariant): Correction | null {
  const [verb, arg, arg2] = a.split(':') as [string, string | undefined, string | undefined];
  if (verb === 'collect' && arg && !NEEDED[s.task ?? 'SOL'].includes(arg as ApparatusId)) return { title: `The ${APPARATUS_LABEL[arg as ApparatusId]?.toLowerCase() ?? arg} is not needed here.`, why: 'Only take what the practical needs; put it back from your bench or the cupboard list.' };
  if (verb === 'warm' && Number(arg) >= SOL_WARM.boil) return { title: 'The acid is boiling.', why: 'Hot acid spits and can burn you. Warm it gently, to about 60 °C, then turn the flame down or off.', focus: 'heat' };
  if (verb === 'filter-excess' && !solBaseExcess(v, s.sol)) return { title: 'All the CuO had dissolved — the base was not in excess.', why: 'Some acid is left over in your filtrate, and fewer crystals form. Next time keep adding CuO until a little black solid stays undissolved.', focus: 'beaker' };
  if (verb === 'evaporated-to-dryness') return { title: 'The dish has gone dry.', why: 'Heating to dryness drives off the water of crystallisation: the blue crystals become white anhydrous CuSO₄ powder. Stop heating as soon as crystals form on a cold glass rod.', focus: 'dish' };
  if (verb === 'rod' && arg === 'CRUST') return { title: 'Crystals are already crusting in the hot dish.', why: 'You have evaporated a little too far: stop heating now and let it cool.', focus: 'dish' };
  if (verb === 'wash' && arg === 'HOT') return { title: 'Hot water dissolves the crystals.', why: 'Wash with a little cold distilled water.', focus: 'dish' };
  if (verb === 'dry' && arg === 'HEAT') return { title: 'Heating drives off the water of crystallisation.', why: 'The blue crystals turn white. Dry them by pressing between filter papers.', focus: 'dish' };
  if (verb === 'an' && !pptExcess(v, s.ppt)) return { title: `That is not an excess of ${PPT_INFO[v.ppt.pair].anion.formula}.`, why: `Some ${PPT_INFO[v.ppt.pair].cation.formula} stays in solution and is lost. The lesson uses 30 cm³ — more than enough.`, focus: 'beaker' };
  if (verb === 'filter-ppt' && !s.ppt.paper) return { title: 'The filter paper was not weighed first.', why: 'Without its dry mass you cannot find the mass of the precipitate. Weigh a dry paper before you filter.', focus: 'balance' };
  if (verb === 'dry-flame') return { title: 'Never dry filter paper over a flame.', why: 'The paper chars and burns, and the mass is wrong. Use the warm oven (about 100 °C).', focus: 'bench' };
  if (verb === 'line' && arg === 'INK') return { title: 'The baseline is in ink.', why: 'Ink dissolves in the solvent and separates itself, mixing with your spots. Draw the baseline in pencil: graphite does not dissolve.', focus: 'paper' };
  if (verb === 'line' && arg2 && (Number(arg2) < 1 || Number(arg2) > 2)) return { title: `A baseline ${arg2} cm up is ${Number(arg2) < 1 ? 'too low' : 'high'}.`, why: 'About 1.5 cm keeps the spots above the solvent and leaves room for them to travel.', focus: 'paper' };
  if (verb === 'spot') {
    const p = s.chrom.spots.find((q) => q.lane === arg);
    if (p && p.wet > 0 && p.n >= 2 && !p.dry && p.wet === p.n - 1) return { title: 'That spot was still wet.', why: 'Re-spotting a wet spot makes it spread into a big blot. Let it dry between applications.', focus: 'paper' };
  }
  if (verb === 'solvent' && chromAboveLine(s.chrom)) return { title: 'The solvent is above the baseline.', why: 'The spots will dissolve straight into the solvent instead of being carried up the paper. Keep the solvent level below the baseline.', focus: 'tank' };
  if (verb === 'tank-uncovered') return { title: 'Cover the tank.', why: 'With the lid on, the air inside stays saturated with solvent vapour: the solvent does not evaporate from the paper and the front rises evenly.', focus: 'tank' };
  if (verb === 'remove-paper' && chromRanOff(v, s.chrom)) return { title: 'The solvent ran off the top of the paper.', why: 'You can no longer tell how far it moved, so the Rf values cannot be found exactly. Take the paper out when the front is near the top.', focus: 'paper' };
  if (verb === 'front-faded') return { title: 'The solvent front has dried and faded.', why: 'Mark it in pencil the moment you take the paper out.', focus: 'paper' };
  if (verb === 'add-water' && mpTooMuch(v, s.mp)) return { title: 'That is more water than needed.', why: 'The more water, the more benzoic acid stays dissolved when cold — a poor recovery. Use the minimum that just dissolves it at the boil.', focus: 'beaker' };
  if (verb === 'add-water' && arg === 'cold') return { title: 'The water is not boiling.', why: 'Benzoic acid dissolves well only near 100 °C: stand the beaker on the gauze and light the burner.', focus: 'heat' };
  if (verb === 'hot-filter' && !s.mp.funnelWarm) return { title: 'The funnel was cold.', why: 'The hot solution cooled in it and benzoic acid crystallised in the stem and paper — lost product. Warm the funnel first.', focus: 'funnel' };
  if (verb === 'cool' && arg === 'FAST') return { title: 'Cool it slowly first.', why: 'Plunged straight into ice it forms tiny crystals that trap impurities. Leave it to cool on the bench, then use the ice bath.', focus: 'funnel' };
  if (verb === 'melt-start') {
    const r = [...s.mp.runs].reverse().find((q) => q.start !== null);
    if (r && (r.rateStart ?? 0) > MP_SLOW_MAX) return { title: `The bath was heating at about ${Math.round(r.rateStart ?? 0)} °C a minute.`, why: 'Too fast: the thermometer runs ahead of the sample, so the reading is too high. Turn the flame low near the melting point (1–2 °C a minute).', focus: 'oil' };
    if (r && !r.attached) return { title: 'The capillary was hanging loose.', why: 'Fasten it to the thermometer with the sample level with the bulb, so both are at the same temperature.', focus: 'oil' };
  }
  return null;
}
