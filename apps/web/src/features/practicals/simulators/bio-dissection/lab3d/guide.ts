import { AIR_MIN, EOSIN_MIN_READS, EOSIN_MIN_SPAN, type BioDissectionState } from '@aischool/shared';
import type { Correction, GuideStep } from '../../../lab3d-kit/guide';
import type { CameraMode } from '../../../lab3d-kit/store';
import { neededFor, type DissectScene } from './scene-state';

/**
 * Guided mode (practice only): the WAEC routine as a checklist — washed
 * roots in eosin, readings at intervals, thin sections on the tile; gloves,
 * lifted cuts and the seeker; labelled plates, aseptic touches, tape,
 * inversion and the incubator — without giving away the readings.
 * Corrections teach the habits that matter.
 */

export function dissectGuideSteps(s: BioDissectionState, scene: DissectScene, mode: CameraMode): GuideStep[] {
  const task = s.task ?? 'EOSIN';
  const missing = neededFor(task).filter((a) => !scene.collected.has(a.id));
  const begun = s.log.some((e) => /^(wash:|gloves|pin:|wipe|label#)/.test(e.a));
  const steps: GuideStep[] = [
    { id: 'safety', label: 'Put on your lab coat', target: !scene.coat ? 'coat' : null, why: task === 'EOSIN' ? 'Eosin stains clothes.' : task === 'RAT' ? 'It keeps the specimen off your clothes.' : 'It keeps microbes off your clothes.', done: scene.coat },
    { id: 'collect', label: `Collect your apparatus${missing.length ? ` (${missing.length} to go)` : ''}`, target: 'cupboard', why: neededFor(task).map((a) => a.label).join(', ') + '.', done: !missing.length },
    { id: 'bench', label: 'Go to your bench', target: 'mybench', why: 'Bench 2, at the front.', done: mode !== 'walk' || begun },
  ];
  const tail = (wash: string): GuideStep[] => [
    { id: 'written', label: 'Write two precautions and your explanation', target: 'book', why: 'Precautions are things you did to make the results reliable or safe.', done: !!s.written.precautions.trim() && !!s.written.explain.trim() },
    { id: 'wash', label: 'Wash your hands', target: 'handwash', why: wash, done: scene.washedAtEnd },
    { id: 'handin', label: 'Hand in your lab', target: null, why: 'Open the menu and choose Hand in when everything is recorded.', done: false },
  ];

  if (task === 'EOSIN') {
    const w = s.eosin;
    const span = w.reads.length ? Math.max(...w.reads) - Math.min(...w.reads) : 0;
    const ts = w.sections.filter((x) => x.kind === 'TS');
    steps.push(
      { id: 'wash', label: 'Wash the roots gently, free of soil', target: 'plant', why: 'Torn roots let the dye straight in.', done: w.wash === 'GENTLE', group: 'Set up' },
      { id: 'dye', label: 'Stand the roots in the eosin', target: 'plant', why: 'The dye travels wherever the water goes.', done: w.dye, group: 'Set up' },
      { id: 'place', label: 'Leave it in a well-lit, airy place', target: 'plant', why: 'Transpiration pulls the water up: faster in light and moving air.', done: w.place === 'BRIGHT', group: 'Set up' },
      { id: 'reads', label: `Read the red line at intervals (${w.reads.length} readings, ${span} min)`, target: 'ruler', why: `At least ${EOSIN_MIN_READS} readings over an hour or more: wait, then read.`, done: w.reads.length >= EOSIN_MIN_READS + 1 && span >= EOSIN_MIN_SPAN + 20, group: 'Readings' },
      { id: 'leaves', label: 'Look at the leaf veins', target: 'plant', why: 'Do they turn red once the dye has risen past them?', done: w.leafLook !== null && w.leafLook >= Math.max(0, ...w.reads), group: 'Readings' },
      { id: 'ts', label: 'Thin transverse sections at two heights, on the tile', target: 'razor', why: 'One low down, one above the red line. Cut away from your fingers.', done: ts.length >= 2 && Math.max(...ts.map((x) => x.at)) - Math.min(...ts.map((x) => x.at)) >= 3, group: 'Sections' },
      { id: 'ls', label: 'And a longitudinal section', target: 'razor', why: 'It shows the xylem vessels running up the stem.', done: w.sections.some((x) => x.kind === 'LS'), group: 'Sections' },
      { id: 'view', label: 'Examine each section (hand lens or microscope)', target: w.views.length < w.sections.length ? 'microscope' : 'lens', why: 'Where is the red dye?', done: w.sections.length > 0 && w.sections.every((_, n) => w.views.some((x) => x.n === n)), group: 'Sections' },
      { id: 'record', label: 'Heights, sections, rate, drawing and conclusions', target: 'book', why: 'Rate = (last height − first height) ÷ (time between them).', done: w.rows.every((r) => r.trim()) && w.secRows.every(Boolean) && !!w.rate && !!w.rateH && !!w.tissue && !!w.shade && w.claims.length >= 2, group: 'Results' },
      ...tail('Eosin stains: wash your hands before you leave.'),
    );
    return steps;
  }

  if (task === 'RAT') {
    const w = s.rat;
    steps.push(
      { id: 'gloves', label: 'Put on gloves', target: 'gloves', why: 'Wear gloves to handle any specimen.', done: w.gloves, group: 'Prepare' },
      { id: 'pin', label: 'Pin it on its back by the four limbs', target: 'rat', why: 'Ventral side up: the gut is on that side.', done: w.pinned === 'VENTRAL', group: 'Prepare' },
      { id: 'body', label: 'Measure the body, snout to anus', target: 'rat', why: 'For the gut : body ratio.', done: w.measures.some((m) => m.what === 'BODY'), group: 'Prepare' },
      { id: 'skin', label: 'Lift the skin with forceps; cut the midline; pin it back', target: 'rat', why: 'Lifting keeps the scissors from cutting too deep.', done: w.skin === 'LIFTED' && w.skinPinned, group: 'Open' },
      { id: 'wall', label: 'Lift and cut the body wall the same way', target: 'rat', why: 'The organs lie just under it.', done: w.wall === 'LIFTED', group: 'Open' },
      { id: 'moist', label: 'Keep the specimen moist', target: 'washbottle', why: 'Dry organs shrink and discolour.', done: w.moist, group: 'Open' },
      { id: 'display', label: 'Displace and unravel the gut with the seeker', target: 'rat', why: 'Gently, without tearing the mesentery.', done: w.display === 'SEEKER' && w.unravelled, group: 'Display' },
      { id: 'gut', label: 'Measure the small and large intestines (damp thread)', target: 'thread', why: 'A thread follows the curves without stretching the gut.', done: w.measures.some((m) => m.what === 'SI') && w.measures.some((m) => m.what === 'LI'), group: 'Display' },
      { id: 'clean', label: 'Disinfect the tools and the board', target: 'disinfectant', why: 'Specimens carry germs.', done: w.cleaned, group: 'Display' },
      { id: 'record', label: 'Lengths, ratio, labelled drawing, conclusions', target: 'book', why: 'Draw what you displayed; is there a gall bladder?', done: !!w.body && !!w.si && !!w.li && !!w.ratio && !!w.gall && w.labels.filter(Boolean).length >= 9 && w.claims.length >= 3, group: 'Results' },
      ...tail('Take off your gloves and wash your hands.'),
    );
    return steps;
  }

  const w = s.micro;
  const P = w.plates;
  steps.push(
    { id: 'wipe', label: 'Wipe the bench with disinfectant', target: 'disinfectant', why: 'Aseptic technique starts with a clean bench.', done: w.wiped, group: 'Plates' },
    { id: 'label', label: 'Label the four plates on the base', target: P.findIndex((p) => p.label !== 'BASE') >= 0 ? `plate:${P.findIndex((p) => p.label !== 'BASE')}` : 'marker', why: 'Control, air, unwashed finger, washed finger. Lids get swapped.', done: P.every((p) => p.label === 'BASE'), group: 'Plates' },
    { id: 'air', label: `Air plate: lid off for ${AIR_MIN} minutes`, target: 'plate:1', why: 'Microbes from the air land on the agar.', done: P[1]!.airMin === AIR_MIN, group: 'Plates' },
    { id: 'unw', label: 'Unwashed finger: lift the lid slightly, touch lightly', target: 'plate:2', why: 'Open the lid only a little, and briefly.', done: P[2]!.touch === 'UNWASHED', group: 'Plates' },
    { id: 'soap', label: 'Wash your hands with soap', target: 'handwash', why: 'Then the last plate shows what washing removes.', done: w.soaped, group: 'Plates' },
    { id: 'wsh', label: 'Washed finger on the last plate', target: 'plate:3', why: 'The same light touch.', done: P[3]!.touch === 'WASHED', group: 'Plates' },
    { id: 'tape', label: 'Tape the lids (two short strips) and invert the plates', target: 'tape', why: 'Never seal completely; inverted, condensation cannot drip.', done: P.every((p) => p.tape === 'STRIPS') && w.inverted, group: 'Plates' },
    { id: 'inc', label: 'Incubate at 25–30 °C', target: 'incubator', why: 'Not 37 °C: that suits human pathogens.', done: w.incAt !== null && w.temp !== 37, group: 'Plates' },
    { id: 'bread', label: 'Bread: exposed, A moist warm, B dry warm, C moist cold; bagged', target: 'slice:0', why: 'Which conditions does the mould need?', done: w.breadAt !== null && w.bagged && w.breadExposed, group: 'Bread' },
    { id: 'days', label: `Leave them (day ${w.day})`, target: 'incubator', why: 'Plates 2–3 days; bread 3 days or more.', done: w.incAt !== null && w.day - w.incAt >= 3, group: 'Results' },
    { id: 'count', label: 'Count the colonies — lids on', target: 'incubator', why: 'Never open a plate after incubation.', done: w.countAt !== null, group: 'Results' },
    { id: 'lens', label: 'Examine the bread (hand lens) and the slide (microscope)', target: w.lensAt === null ? 'lens' : 'microscope', why: 'White hyphae, black sporangia.', done: w.lensAt !== null && w.slide, group: 'Results' },
    { id: 'dispose', label: 'Soak the taped plates in disinfectant', target: 'disinfectant', why: 'Cultures may contain pathogens.', done: w.dispose === 'DISINFECT', group: 'Results' },
    { id: 'record', label: 'Counts, % reduction, bread, drawing, conclusions', target: 'book', why: '% reduction = (unwashed − washed) ÷ unwashed × 100.', done: w.counts.every((c) => c.trim()) && !!w.reduction && w.bread.every(Boolean) && w.claims.length >= 3, group: 'Results' },
    ...tail('After microbes: always wash your hands.'),
  );
  return steps;
}

/** A gentle correction for a step just recorded in the log (null: nothing wrong). */
export function dissectCorrection(a: string, s: BioDissectionState, _scene: DissectScene): Correction | null {
  const [verb, arg] = a.split(':') as [string, string | undefined];
  if (verb === 'wash' && arg === 'ROUGH') return { title: 'Gently with the roots.', why: 'Rough washing tears the roots and root hairs: the dye then floods in through the wounds and spreads sideways. Wash them gently in a bowl of water next time.', focus: 'plant' };
  if (verb === 'place' && arg === 'DARK') return { title: 'Somewhere bright and airy.', why: 'In a still, dark cupboard the plant hardly transpires, so the dye rises very slowly.', focus: 'plant' };
  if (verb === 'cut' && a.endsWith(':hand')) return { title: 'Cut on the tile, away from your fingers.', why: 'Never slice towards a hand holding the stem: lay it on the tile.', focus: 'tile' };
  if (verb === 'cut' && a.includes(':thick:')) return { title: 'Thinner, please.', why: 'A thick slice lets no light through: you cannot see the tissues. Cut several thin slices and choose the thinnest.', focus: 'tile' };
  if (verb === 'cut' && s.eosin.sections.length === 1 && s.eosin.reads.length < EOSIN_MIN_READS) return { title: 'That ended the readings.', why: `Once the stem is cut the dye stops rising. Take at least ${EOSIN_MIN_READS} readings first next time.`, focus: 'plant' };
  if (verb === 'pin' && arg === 'DORSAL') return { title: 'On its back.', why: 'Pin the rat ventral side up: you open the abdomen from the belly.', focus: 'board' };
  if (verb === 'pin' && !s.rat.gloves) return { title: 'Gloves first.', why: 'Wear gloves to handle the specimen.', focus: 'board' };
  if (verb === 'skin' && arg === 'DEEP') return { title: 'Lift the skin first.', why: 'Lift it with forceps so the scissors only cut the skin, not what lies beneath.', focus: 'board' };
  if (verb === 'wall' && arg === 'DEEP') return { title: 'You nicked the gut.', why: 'Lift the body wall with forceps before you cut, and cut away from the body.', focus: 'board' };
  if (verb === 'display' && arg === 'FORCEPS') return { title: 'Use the seeker.', why: 'Pulling with forceps tears the mesentery that holds the gut in place.', focus: 'board' };
  if (verb === 'measure' && a.endsWith(':STRETCH') && arg !== 'BODY') return { title: 'Do not stretch the gut.', why: 'Pulled straight, it stretches: lay a damp thread along it, then measure the thread.', focus: 'board' };
  if (verb.startsWith('label#') && arg === 'LID') return { title: 'Label the base.', why: 'Lids are easily swapped; the base stays with the agar.', focus: 'plates' };
  if (verb === 'expose#1' || verb === 'touch#1') return { title: 'That was the control.', why: 'The control plate must never be opened: it shows the agar was sterile.', focus: 'plates' };
  if (verb.startsWith('touch#') && a.endsWith(':WIDE')) return { title: 'Lift the lid only slightly.', why: 'With the lid right off, microbes from the air fall in too.', focus: 'plates' };
  if (verb === 'touch#4' && a.includes(':UNWASHED')) return { title: 'Wash with soap first.', why: 'The last plate is for the finger after washing with soap.', focus: 'plates' };
  if (verb === 'tape' && a.endsWith(':SEALED')) return { title: 'Two short strips only.', why: 'Sealed all round, the plate goes anaerobic, which favours pathogens.', focus: 'plates' };
  if (verb === 'incubate' && arg === '37') return { title: 'No more than 30 °C.', why: 'At body temperature you could be growing human pathogens.', focus: 'incubator' };
  if (verb === 'incubate' && !s.micro.inverted) return { title: 'Upside down next time.', why: 'Condensation on the lid would drip onto the colonies and spread them.', focus: 'incubator' };
  if (verb === 'open-plate') return { title: 'Never open the plates!', why: 'After incubation the cultures may contain pathogens. Count and describe them through the lid.', focus: 'plates' };
  if (verb === 'dispose' && arg === 'BIN') return { title: 'Not in the bin.', why: 'Soak the taped plates in strong disinfectant (or autoclave them) first.', focus: 'plates' };
  if (verb === 'bread' && arg === 'open') return { title: 'Bag the bread.', why: 'Uncovered, it dries out and the mould barely grows.', focus: 'bread' };
  if (verb === 'collect' && arg && !neededFor(s.task ?? 'EOSIN').some((x) => x.id === arg)) return { title: 'That is not needed for this practical.', why: 'Only take what the practical needs; you can put it back from your bench or from the cupboard list.' };
  return null;
}
