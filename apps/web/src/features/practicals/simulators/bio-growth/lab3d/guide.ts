import { GERM_MIN_DAY, GERM_SOWN, GERM_TUBES, germKind, type BioGrowthState } from '@aischool/shared';
import type { Correction, GuideStep } from '../../../lab3d-kit/guide';
import type { CameraMode } from '../../../lab3d-kit/store';
import { neededFor, type GrowthScene } from './scene-state';

/**
 * Guided mode (practice only): the WAEC routine as a checklist — sorted
 * seeds and the four tubes; soaking, sowing, daily watering and measuring;
 * disinfected seeds, a boiled control and loose plugs; the light-proof box,
 * clinostat controls and the moist cork — without giving away the readings.
 * Corrections teach the habits that matter.
 */

export function growthGuideSteps(s: BioGrowthState, scene: GrowthScene, mode: CameraMode): GuideStep[] {
  const task = s.task ?? 'GERM';
  const missing = neededFor(task).filter((a) => !scene.collected.has(a.id));
  const begun = s.log.some((e) => /^(batch|soak|box|pin|cotton#|sow)/.test(e.a));
  const steps: GuideStep[] = [
    { id: 'safety', label: task === 'RESP' ? 'Put on your lab coat and goggles' : 'Put on your lab coat', target: !scene.coat ? 'coat' : task === 'RESP' && !scene.goggles ? 'goggles' : null, why: task === 'RESP' ? 'Boiling water and disinfectant can splash.' : 'It keeps water, soil and stains off your clothes.', done: scene.coat && (task !== 'RESP' || scene.goggles) },
    { id: 'collect', label: `Collect your apparatus${missing.length ? ` (${missing.length} to go)` : ''}`, target: 'cupboard', why: neededFor(task).map((a) => a.label).join(', ') + '.', done: !missing.length },
    { id: 'bench', label: 'Go to your bench', target: 'mybench', why: 'Bench 2, at the front.', done: mode !== 'walk' || begun },
  ];
  const tail = (wash: string): GuideStep[] => [
    { id: 'written', label: 'Write two precautions and your explanation', target: 'book', why: 'Precautions are things you did to make the results reliable or safe.', done: !!s.written.precautions.trim() && !!s.written.explain.trim() },
    { id: 'wash', label: 'Wash your hands', target: 'handwash', why: wash, done: scene.washedAtEnd },
    { id: 'handin', label: 'Hand in your lab', target: null, why: 'Open the menu and choose Hand in when everything is recorded.', done: false },
  ];

  if (task === 'GERM') {
    const w = s.germ;
    const kinds = w.tubes.map(germKind);
    const tube = (k: number, kind: 'CONTROL' | 'DRY' | 'NOOXY' | 'COLD', label: string, why: string): GuideStep => ({ id: `t${k}`, label, target: `tube:${k}`, why, done: kinds[k] === kind && w.tubes[k]!.seeds === GERM_SOWN, group: 'Set up' });
    const counted = w.looks.filter((d) => w.rows.every((r, k) => !w.tubes[k]!.seeds || r.c[d]?.trim())).length;
    steps.push(
      { id: 'sort', label: 'Sort the seeds: same kind, size and age', target: 'seeds', why: 'So that differences come from the conditions, not the seeds.', done: w.batch === 'SORTED', group: 'Set up' },
      tube(0, 'CONTROL', 'Tube A: moist cotton wool and 10 seeds (control)', 'It has water, oxygen and warmth.'),
      tube(1, 'DRY', 'Tube B: dry cotton wool and 10 seeds', 'No water.'),
      tube(2, 'NOOXY', 'Tube C: boiled, cooled water, 10 seeds and a layer of oil', 'Boiling drives the oxygen out; the oil keeps air from dissolving back.'),
      tube(3, 'COLD', 'Tube D: moist cotton wool, 10 seeds, into the refrigerator', 'Cold: everything else as in A.'),
      { id: 'label', label: 'Label the four tubes', target: w.tubes.findIndex((t) => !t.label) >= 0 ? `tube:${w.tubes.findIndex((t) => !t.label)}` : 'labels', why: 'You must know which is which after a week.', done: w.tubes.every((t) => t.label), group: 'Set up' },
      { id: 'days', label: `Leave them, inspecting and counting each day (day ${w.day})`, target: 'rack', why: 'Count only seeds whose radicle shows — a swollen seed has not germinated.', done: w.day >= GERM_MIN_DAY + 1 && w.looks.length >= 3, group: 'Counting' },
      { id: 'table', label: `Write the counts each day (${counted} of ${w.looks.length} days)`, target: 'book', why: 'Record every count as you make it.', done: w.looks.length > 0 && counted === w.looks.length, group: 'Results' },
      { id: 'pct', label: 'Work out % germination and the condition missing', target: 'book', why: '% = germinated ÷ sown × 100.', done: w.rows.every((r, k) => !w.tubes[k]!.seeds || (r.pct.trim() && r.missing)), group: 'Results' },
      { id: 'claims', label: 'Choose your conclusions', target: 'book', why: 'What each tube shows compared with the control.', done: w.claims.length >= 3, group: 'Results' },
      ...tail('Before you leave the laboratory.'),
    );
    return steps;
  }

  if (task === 'SEEDLING') {
    const w = s.seedling;
    const both = [...new Set(w.measures.map((m) => m.day))].filter((d) => w.measures.filter((m) => m.day === d).length >= 2);
    const today = w.measures.filter((m) => m.day === w.day).length;
    steps.push(
      { id: 'soak', label: 'Soak the seeds overnight', target: 'seeds', why: 'Water softens the testa and starts germination.', done: w.soaked, group: 'Set up' },
      { id: 'box', label: 'Sow seeds in the box of moist sawdust', target: 'box', why: 'There you see what comes up through the soil.', done: w.box, group: 'Set up' },
      { id: 'jar', label: 'Seeds between the blotting paper and the jar', target: 'jar', why: 'There you see the radicle, the plumule and where the cotyledons go.', done: w.jar, group: 'Set up' },
      { id: 'water', label: `Water the medium (day ${w.day})`, target: 'washbottle', why: 'Moist but not waterlogged; dry for two days, growth stops.', done: w.waters.includes(w.day), group: 'Each day' },
      { id: 'measure', label: `Measure both shoots from the seed (${today} of 2 today)`, target: 'jar', why: 'From the same point every day.', done: w.day >= 1 && today >= 2, group: 'Each day' },
      { id: 'draw', label: 'Draw the seedlings at day 3 and day 7', target: 'jar', why: 'Labelled drawings show the stages.', done: w.draws.some((d) => Math.abs(d - 3) <= 1) && w.draws.some((d) => Math.abs(d - 7) <= 1), group: 'Each day' },
      { id: 'days', label: `Carry on to day 8 or later (${both.length} days measured)`, target: 'jar', why: 'You need day 4 and day 8 for the growth rate.', done: both.length >= 5 && both.includes(4) && both.includes(8), group: 'Each day' },
      { id: 'table', label: 'Write the lengths, plot the graph, work out the rates', target: 'book', why: 'Rate = (length on day 8 − length on day 4) ÷ 4.', done: w.rows.length > 0 && w.rows.every((r) => r.cow && r.maize) && w.graph && !!w.rateCow && !!w.rateMaize, group: 'Results' },
      { id: 'compare', label: 'Complete the comparison table and label the drawing', target: 'book', why: 'Which part elongates, and where the cotyledons stay.', done: Object.values(w.table).every((t) => t.type && t.cot && t.part) && w.labels.filter(Boolean).length >= 6, group: 'Results' },
      ...tail('Sawdust and soil: wash your hands.'),
    );
    return steps;
  }

  if (task === 'RESP') {
    const w = s.resp;
    const rel = w.startAt === null ? [] : w.reads.map((t) => t - w.startAt!);
    const filled = w.rows.filter((r) => r.a && r.b).length;
    steps.push(
      { id: 'soak', label: 'Soak the seeds for 24 hours', target: 'seeds', why: 'Germinating seeds respire fast.', done: w.soaked, group: 'Set up' },
      { id: 'boil', label: 'Boil half the seeds for 10 minutes', target: 'boiler', why: 'Boiled seeds are dead: they cannot respire (the control).', done: w.boiled, group: 'Set up' },
      { id: 'dis', label: 'Rinse both batches in disinfectant', target: 'disinfectant', why: 'Kills microorganisms, which would respire and give off heat.', done: w.disLive && w.disBoiled, group: 'Set up' },
      { id: 'fill', label: 'A: germinating seeds; B: the same amount of boiled seeds', target: !w.A.seeds ? 'flask:A' : 'flask:B', why: 'Equal quantities, so only being alive differs.', done: w.A.seeds === 'LIVE' && w.B.seeds === 'BOILED', group: 'Set up' },
      { id: 'plug', label: 'Thermometers in, loose cotton-wool plugs, invert', target: !(w.A.thermo && w.A.plug && w.A.inverted) ? 'flask:A' : 'flask:B', why: 'Loose so the seeds get oxygen; inverted so heat is not lost upwards and CO₂ can escape.', done: w.A.inverted && w.B.inverted && !!w.A.plug && !!w.B.plug, group: 'Set up' },
      { id: 'co2', label: 'Lime water test with a boiled-seed control', target: 'co2', why: 'Carbon dioxide turns lime water milky.', done: w.co2.at !== null && w.co2.ctrl && w.co2.look !== null, group: 'Set up' },
      { id: 'read', label: `Read both thermometers at the start and daily (${w.reads.length} readings)`, target: 'flask:A', why: 'At the start, then after 1, 2 and 3 days.', done: rel.some((x) => x <= 1) && [24, 48, 72].every((d) => rel.some((x) => Math.abs(x - d) <= 3)), group: 'Readings' },
      { id: 'table', label: `Write each reading (${filled} of ${w.reads.length})`, target: 'book', why: 'To 0.5 °C, as the thermometers show.', done: w.reads.length > 0 && filled === w.reads.length, group: 'Results' },
      { id: 'calc', label: 'Rises, mean rise per day, difference; conclusions', target: 'book', why: 'Mean rise per day = rise ÷ days.', done: !!w.riseA && !!w.perDay && !!w.diff && !!w.eq && w.claims.length >= 3, group: 'Results' },
      ...tail('Disinfectant: wash your hands before you leave.'),
    );
    return steps;
  }

  const w = s.trop;
  const today = w.measures.filter((m) => m.day === w.day).length;
  steps.push(
    { id: 'box', label: 'Test pot in the box, slit towards the lamp, gaps taped', target: 'lightbox', why: 'Light must reach the shoots from one side only.', done: w.box && w.slit === 'LAMP' && w.taped, group: 'Set up' },
    { id: 'lamp', label: 'Switch on the lamp', target: 'lamp', why: 'The one-sided light.', done: w.lamp, group: 'Set up' },
    { id: 'ctrl', label: 'Control pot on the clinostat', target: 'klinostat', why: 'Turning, it lights every side equally.', done: w.ctrl !== null, group: 'Set up' },
    { id: 'pin', label: 'Pin seedlings round the moist cork, radicles every way', target: 'corkjar', why: 'Whatever way they point, do they all turn down?', done: w.pinned && w.moist, group: 'Set up' },
    { id: 'klino', label: 'A similar set on the clinostat; switch it on', target: 'klinostat', why: 'The control for gravity: it turns slowly.', done: w.klinoSet && w.klinoOn, group: 'Set up' },
    { id: 'days', label: `Each day: water, then measure both shoots (${today} of 2 today)`, target: 'lightbox', why: 'Protractor: the angle between the shoot tip and the vertical.', done: w.day >= 1 && today >= 2 && w.waters.includes(w.day), group: 'Each day' },
    { id: 'three', label: `Carry on to day 3 or more (day ${w.day})`, target: 'lightbox', why: 'The bend grows day by day.', done: w.day >= 3, group: 'Each day' },
    { id: 'count', label: 'Count the radicles growing down', target: 'corkjar', why: 'Positive geotropism.', done: w.countAt !== null, group: 'Each day' },
    { id: 'table', label: 'Angles, rate, % of radicles down, sketches, conclusions', target: 'book', why: 'Rate = angle ÷ days.', done: w.rows.length > 0 && w.rows.every((r) => r.test && r.ctrl) && !!w.rate && !!w.pct && !!w.sketchCork && !!w.sketchKlino && w.claims.length >= 3, group: 'Results' },
    ...tail('Before you leave the laboratory.'),
  );
  return steps;
}

/** A gentle correction for a step just recorded in the log (null: nothing wrong). */
export function growthCorrection(a: string, s: BioGrowthState, scene: GrowthScene): Correction | null {
  const [verb, arg] = a.split(':') as [string, string | undefined];
  if (verb === 'batch' && arg === 'MIXED') return { title: 'Sort the seeds.', why: 'Seeds of different sizes and ages, some damaged, germinate unevenly: differences between the tubes would not be due to the conditions alone.', focus: 'tubes' };
  if (verb.startsWith('sow#') && arg === 'handful') return { title: 'Count the seeds.', why: `Put the same number (${GERM_SOWN}) in every tube so the percentages are fair.`, focus: 'tubes' };
  if (verb.startsWith('water#') && arg === 'TAP') return { title: 'Boil the water first.', why: 'Tap water still holds dissolved oxygen: boiled and cooled water, under oil, has none.', focus: 'tubes' };
  if (verb === 'wait' && s.task === 'GERM' && s.germ.day === 1) {
    const k = s.germ.tubes.findIndex((t) => t.water === 'BOILED' && !t.oil);
    if (k >= 0) return { title: `Tube ${GERM_TUBES[k]} has no oil layer.`, why: 'Air dissolves back into boiled water: the seeds get some oxygen after all. Pour oil on at once next time.', focus: 'tubes' };
    if (s.germ.tubes.some((t) => !t.label)) return { title: 'Label your tubes.', why: 'After a few days you will not remember which tube is which.', focus: 'tubes' };
  }
  if (verb === 'sow' && arg && !s.seedling.soaked) return { title: 'Soak the seeds first.', why: 'Dry seeds take a day longer to start: soak them overnight.', focus: 'box' };
  if (verb === 'wait' && s.task === 'SEEDLING' && s.seedling.day >= 2 && !s.seedling.waters.some((d) => d >= s.seedling.day - 2)) return { title: 'The medium is drying out.', why: 'Water the sawdust and the blotting paper every day — moist, not waterlogged.', focus: 'jar' };
  if (verb === 'measure' && s.task === 'SEEDLING') {
    const refs = new Set(s.seedling.measures.map((m) => m.ref));
    if (refs.size > 1) return { title: 'Measure from the same point.', why: 'Changing the reference point changes every length: always measure from the seed.', focus: 'jar' };
  }
  if (a.startsWith('fill:B:LIVE')) return { title: 'Flask B is the control.', why: 'It must hold boiled (killed) seeds: then any difference is due to the living seeds.', focus: 'flasks' };
  if (verb === 'fill' && a.endsWith(':HALF')) return { title: 'Use equal quantities.', why: 'Fill both flasks with the same amount of seeds.', focus: 'flasks' };
  if (verb === 'fill' && a.includes(':LIVE:') && !s.resp.disLive) return { title: 'Disinfect them first.', why: 'Microorganisms on the seeds respire too and give off heat.', focus: 'flasks' };
  if (verb === 'fill' && a.includes(':BOILED:') && !s.resp.disBoiled) return { title: 'Disinfect the boiled seeds first.', why: 'Microbes feed on dead seeds and warm the flask: the control would rise too.', focus: 'flasks' };
  if (verb === 'plug' && a.endsWith(':BUNG')) return { title: 'Not airtight.', why: 'Sealed in, the seeds use up their oxygen and stop respiring aerobically. Plug loosely with cotton wool.', focus: 'flasks' };
  if (verb.startsWith('read#') && s.resp.startAt !== null && (!s.resp.A.inverted || !s.resp.B.inverted) && s.resp.reads.length === 1) return { title: 'Invert the flasks.', why: 'Upside down, the heat is not lost upwards through the plug and the CO₂ (denser than air) can escape.', focus: 'flasks' };
  if (verb === 'slit' && arg === 'AWAY') return { title: 'Slit towards the lamp.', why: 'The light must come in from one side, from the lamp.', focus: 'lightbox' };
  if (verb === 'wait' && s.task === 'TROPISM' && s.trop.day === 1) {
    if (s.trop.box && !s.trop.taped) return { title: 'The box lets light in.', why: 'Light leaking through gaps weakens the one-sided effect. Tape the gaps next time.', focus: 'lightbox' };
    if ((s.trop.ctrl === 'KLINO' || s.trop.klinoSet) && !s.trop.klinoOn) return { title: 'The clinostat is off!', why: 'Standing still, the controls get one-sided light and gravity too.', focus: 'klino' };
    if (s.trop.pinned && !s.trop.moist) return { title: 'Wet the cotton wool.', why: 'The radicles dry out and stop growing.', focus: 'cork' };
  }
  if (verb === 'collect' && arg && !neededFor(s.task ?? 'GERM').some((x) => x.id === arg) && arg !== 'lens') return { title: 'That is not needed for this practical.', why: 'Only take what the practical needs; you can put it back from your bench or from the cupboard list.' };
  if (verb === 'boil' && s.task === 'RESP' && !scene.goggles) return { title: 'Goggles on.', why: 'Boiling water can spit.', focus: 'bench' };
  return null;
}
