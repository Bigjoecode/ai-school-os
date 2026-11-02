import { ELEC_RUN, ELEC_TARGET, ELEC_TOL, RUST_MIN_DAYS, cellReading, dispExcess, type ChemElectroState, type ChemElectroVariant } from '@aischool/shared';
import type { Correction, GuideStep } from '../../../lab3d-kit/guide';
import type { CameraMode } from '../../../lab3d-kit/store';
import type { Electro } from '../actions';
import { APPARATUS_LABEL, NEEDED, type ApparatusId, type SceneState } from './scene-state';

/**
 * Guided mode (practice only): the lesson's procedure as a checklist with the
 * object to use next, and gentle corrections — with the reason — when a step
 * is done the wrong way. Everything is worked out from the recorded state.
 */
export function guideSteps(s: ChemElectroState, scene: SceneState, mode: CameraMode, x: Electro): GuideStep[] {
  const task = scene.task;
  const v = x.v;
  const steps: GuideStep[] = [
    { id: 'safety', label: 'Put on your lab coat and goggles', target: !scene.coat ? 'coat' : !scene.goggles ? 'goggles' : null, why: task === 'RUST' ? 'Boiling water splashes; salt water stings the eyes.' : 'Copper(II) sulphate is harmful; propanone and solutions splash.', done: scene.coat && scene.goggles },
    { id: 'collect', label: `Collect your apparatus${scene.missing.length ? ` (${scene.missing.length} to go)` : ''}`, target: 'cupboard', why: `From the cupboard: ${NEEDED[task].map((id) => APPARATUS_LABEL[id].toLowerCase()).join(', ')}.`, done: scene.ready },
    { id: 'bench', label: 'Go to your bench', target: 'mybench', why: 'Bench 2, at the front. Your reagents are there.', done: mode !== 'walk' || s.log.some((e) => /^(sand-|weigh-plates|strips:|filings:|tube:)/.test(e.a)) },
  ];
  const book: GuideStep[] = [
    { id: 'record', label: 'Record your readings in the notebook', target: 'book', why: task === 'RUST' ? 'Volumes to 1 decimal place; which nails rusted.' : task === 'CELL' ? 'The e.m.f. to 2 decimal places, as the voltmeter shows it.' : 'Masses to 2 decimal places, as the balance shows them.', done: false },
    { id: 'calc', label: 'Work out the calculations, with units', target: 'book', why: task === 'ELEC' ? 'Q = It (seconds) → moles = Q ÷ 2F → mass = moles × 63.5.' : task === 'CELL' ? 'E°cell = 0.34 − (−0.76); then the percentage difference.' : task === 'DISP' ? 'Moles Fe = mass ÷ 56 = moles Cu; × 63.5; percentage.' : 'Oxygen used = 50.0 − final; ÷ 50.0 × 100.', done: v.tasks.every((t) => s.answers[t.id].value.trim()) },
    { id: 'written', label: 'Write your observations, the explanation and two precautions', target: 'book', why: 'Use what you saw on the bench.', done: !!s.written.observation.trim() && !!s.written.explain.trim() && !!s.written.precautions.trim() },
    { id: 'handin', label: 'Hand in your lab', target: null, why: 'Open the menu and choose Hand in when everything is recorded.', done: false },
  ];
  if (task === 'ELEC') {
    const w = s.elec;
    const I = x.look.current;
    steps.push(
      { id: 'sand', label: 'Clean both copper plates with sandpaper', target: 'sandpaper', why: 'A bright surface: the copper deposit sticks firmly.', done: w.sanded },
      { id: 'weigh', label: 'Weigh the cathode and the anode', target: 'balance', why: 'After cleaning. Record both masses to 2 d.p.', done: w.weighedBefore && !w.sandedAfterWeigh },
      { id: 'connect', label: 'Connect: cathode to −, anode to +, ammeter in series, plates apart', target: 'voltameter', why: 'Touching plates short-circuit the supply.', done: w.connected && w.gap === 'APART' },
      { id: 'close', label: 'Close the key (the stopwatch starts)', target: 'key', why: 'The current flows only while the key is closed.', done: w.closed || w.ran > 0 },
      { id: 'set', label: 'Adjust the rheostat until the ammeter reads 0.50 A', target: 'rheostat', why: 'Less resistance → more current.', done: w.ran > 0 && !w.closed ? true : w.closed && Math.abs(I - ELEC_TARGET) <= ELEC_TOL * 0.7 },
      { id: 'hold', label: 'Keep it at 0.50 A for 40 minutes (time-lapse)', target: w.closed && Math.abs(I - ELEC_TARGET) > ELEC_TOL * 0.7 ? 'rheostat' : 'stopwatch', why: 'The solution warms and its resistance falls, so the current creeps up: nudge the rheostat back.', done: w.ran >= ELEC_RUN - 10 && !w.closed },
      { id: 'stop', label: 'At 40:00 open the key', target: 'key', why: 'Note the time on the stopwatch in seconds.', done: !w.closed && w.ran >= ELEC_RUN - 10 },
      { id: 'out', label: 'Take the plates out; rinse gently with water, then propanone', target: 'washBottle', why: 'Do not rub: the new copper is soft and comes off.', done: w.removed && !!w.rinse },
      { id: 'dry', label: 'Let them dry in the air (no flames)', target: 'voltameter', why: 'Propanone is flammable and evaporates quickly.', done: !!w.dry },
      { id: 'reweigh', label: 'Reweigh both plates', target: 'balance', why: 'The cathode gains copper; the anode loses about the same.', done: w.weighedAfter },
    );
  } else if (task === 'CELL') {
    const w = s.cell;
    const neg = x.look.volts !== null && x.look.volts < 0;
    steps.push(
      { id: 'sand', label: 'Clean the zinc and copper strips with sandpaper', target: 'sandpaper', why: 'Oxide films lower the e.m.f.', done: w.sanded },
      { id: 'place', label: 'Zinc into ZnSO₄, copper into CuSO₄', target: 'strips', why: 'Each metal in a solution of its own ions.', done: !!w.placed },
      { id: 'soak', label: 'Soak the filter-paper strip in saturated KNO₃', target: 'dish:kno3', why: 'A dry paper does not conduct.', done: w.soaked },
      { id: 'bridge', label: 'Join the beakers with the salt bridge', target: 'dish:kno3', why: 'It completes the circuit and keeps the solutions neutral.', done: w.bridge || w.readings.some((r) => r.bridge) },
      { id: 'meter', label: 'Use the high-resistance voltmeter: + to copper, − to zinc', target: !w.meter ? 'voltmeter' : 'leads', why: 'It draws almost no current, so it reads the e.m.f.', done: w.meter === 'HIGH' && w.leads === 'CORRECT' && !neg },
      { id: 'read', label: 'Read the voltmeter', target: 'voltmeter', why: 'To 2 decimal places.', done: w.readings.some((r) => r.bridge && r.soaked) },
      { id: 'remove', label: 'Remove the salt bridge and read again', target: w.bridge ? 'bridge' : 'voltmeter', why: 'Watch what happens to the reading.', done: w.readings.some((r, i) => !r.bridge && i > w.readings.findIndex((q) => q.bridge)) },
      { id: 'replace', label: 'Replace the bridge and read once more', target: !w.bridge ? 'dish:kno3' : 'voltmeter', why: 'Two readings that agree.', done: w.replaced && w.readings.filter((r) => r.bridge && r.soaked).length >= 2 },
    );
  } else if (task === 'DISP') {
    const w = s.disp;
    steps.push(
      { id: 'filings', label: 'Weigh about 0.56 g of clean iron filings', target: !w.filings ? 'jar:clean' : 'balance', why: 'Free of rust, so all of it reacts.', done: x.look.fe >= 0.5 && x.look.fe <= 0.62 },
      { id: 'cuso4', label: 'Measure 50 cm³ of CuSO₄ into the beaker', target: 'bottle:cuso4', why: 'An excess, so all the iron reacts.', done: w.cuso4 !== null },
      { id: 'thermo', label: 'Thermometer in: read the initial temperature', target: 'thermometer', why: 'To find the temperature rise.', done: w.thermo },
      { id: 'add', label: 'Tip in the iron and stir', target: 'beaker', why: 'Watch the colour and the thermometer.', done: w.added },
      { id: 'paper', label: 'Weigh a dry filter paper', target: 'balance', why: 'You need its mass to find the mass of copper.', done: w.paper },
      { id: 'wait', label: 'Note the highest temperature; wait until the reaction is complete', target: 'beaker', why: 'Then all the iron has reacted (use time-lapse).', done: w.filtered || x.look.extent >= 0.99 },
      { id: 'filter', label: 'Filter off the solid onto the weighed paper', target: 'funnel', why: 'The copper stays on the paper.', done: w.filtered },
      { id: 'wash', label: 'Wash with water, then propanone; dry in a warm place', target: 'washBottle', why: 'No flames: propanone is flammable.', done: !!w.wash && !!w.dry },
      { id: 'weigh', label: 'Weigh the paper and copper', target: 'balance', why: 'Record to 2 d.p.', done: w.weighed },
    );
  } else {
    const w = s.rust;
    const t = w.tubes;
    steps.push(
      { id: 'sand', label: 'Clean the nails with sandpaper', target: 'sandpaper', why: 'A clean surface: a fair test.', done: w.sanded },
      { id: 'A', label: 'Tube A: a nail in tap water (air and water)', target: 'tube:A', why: 'The control.', done: !!t.A.content },
      { id: 'B', label: 'Tube B: boil water, pour it over a nail, add a layer of oil', target: !t.B.content ? (s.log.some((e) => e.a === 'boil-water') ? 'tube:B' : 'burner') : 'bottle:oil', why: 'Boiling drives out the air; the oil stops it dissolving back.', done: !!t.B.content && t.B.oil },
      { id: 'C', label: 'Tube C: anhydrous CaCl₂ and a nail; stopper it', target: !t.C.content ? 'tube:C' : 'tube:C', why: 'CaCl₂ keeps the air dry.', done: t.C.content === 'CACL2' && t.C.stopper },
      { id: 'D', label: 'Tube D: a nail in salt water', target: 'tube:D', why: 'Does salt speed up rusting?', done: !!t.D.content },
      { id: 'wool', label: 'Moist iron wool in the graduated tube (50.0 cm³ of air), in the trough', target: 'gradTube', why: 'The iron uses up the oxygen as it rusts.', done: !!w.wool },
      { id: 'start', label: 'Leave everything for a week (time-lapse)', target: 'rack', why: 'Read the graduated tube each day.', done: w.started },
      { id: 'read', label: 'When the level stops rising: level it and read the volume', target: 'gradTube', why: 'Water level inside = outside, so the air is at atmospheric pressure.', done: w.readings.some((r) => r.levelled && r.day >= RUST_MIN_DAYS) },
      { id: 'observe', label: 'After a week, look at tubes A–D', target: 'rack', why: 'Which nails rusted? Which most?', done: w.observed.some((d) => d >= RUST_MIN_DAYS) },
    );
  }
  return [...steps, ...book];
}

/** A gentle correction for a step just recorded in the log (null: nothing wrong). */
export function correctionFor(a: string, s: ChemElectroState, v: ChemElectroVariant): Correction | null {
  const [verb, arg, arg2] = a.split(':') as [string, string | undefined, string | undefined];
  if (verb === 'collect' && arg && !NEEDED[s.task ?? 'ELEC'].includes(arg as ApparatusId)) return { title: `The ${APPARATUS_LABEL[arg as ApparatusId]?.toLowerCase() ?? arg} is not needed here.`, why: 'Only take what the practical needs; put it back from your bench or the cupboard list.' };
  if (verb === 'sand-plates' && s.elec.sandedAfterWeigh) return { title: 'You weighed the plates before cleaning them.', why: 'Sanding rubs off a little copper, so those masses are now wrong. Weigh them again.', focus: 'balance' };
  if (verb === 'connect' && arg === 'POS') return { title: 'The cathode is joined to the + terminal.', why: 'The cathode is the electrode joined to the NEGATIVE terminal: Cu²⁺ ions gain electrons there. As it is, your "cathode" will dissolve.', focus: 'cell' };
  if (verb === 'connect' && arg2 === 'TOUCH') return { title: 'The plates are touching.', why: 'Touching plates short-circuit the supply: the current flows straight through the metal and nothing is deposited. Keep them apart.', focus: 'cell' };
  if (verb === 'short-circuit') return { title: 'Short circuit!', why: 'The plates touch. Separate them, then close the key again.', focus: 'cell' };
  if (verb === 'rinse' && arg === 'RUB') return { title: 'Rubbing wipes off the new copper.', why: 'The deposit is soft and loose. Rinse gently with water and then propanone, and let it dry.', focus: 'cell' };
  if (verb === 'dry-plates' && arg === 'FLAME') return { title: 'Never heat propanone near a flame.', why: 'It is very flammable, and hot copper oxidises (gains mass). Let it evaporate in the air.', focus: 'cell' };
  if (verb === 'key-open' && Number(arg) > 0 && Number(arg) < 1800) return { title: `The current flowed for only ${Math.round(Number(arg) / 60)} minutes.`, why: 'The lesson runs it for 40 minutes, so that the change in mass is large enough to weigh accurately. Close the key again to carry on.', focus: 'meters' };
  if (verb === 'strips' && arg === 'SWAPPED') return { title: 'Each metal must stand in a solution of its own ions.', why: 'Zinc in CuSO₄ is coated with copper at once — that is a displacement, not a cell. Zinc into ZnSO₄, copper into CuSO₄.', focus: 'daniell' };
  if (verb === 'meter' && arg === 'LOW') return { title: 'An ordinary voltmeter draws current.', why: 'Current through the cell drops volts across its internal resistance, so it reads less than the e.m.f. Use the high-resistance voltmeter.', focus: 'volts' };
  if (verb === 'leads' && arg === 'REVERSED') return { title: 'The voltmeter is the wrong way round.', why: 'Copper is the positive electrode: red (+) lead to copper, black (−) to zinc. A reversed meter reads negative.', focus: 'volts' };
  if (verb === 'bridge-in' && !s.cell.soaked) return { title: 'The paper is dry.', why: 'A dry paper does not conduct, so the voltmeter will read zero. Soak it in saturated KNO₃ first.', focus: 'daniell' };
  if (verb === 'read-voltmeter') {
    const r = s.cell.readings.at(-1);
    if (r && r.bridge && r.soaked && cellReading(v, r, s.cell.readings.length - 1) < 0) return { title: 'A negative reading.', why: 'The leads are reversed: swap them so + goes to copper.', focus: 'volts' };
  }
  if (verb === 'filings' && arg === 'RUSTY') return { title: 'Those filings are rusty.', why: 'A rust coat slows the reaction and part of the mass is rust, not iron. Use clean filings.', focus: 'balance' };
  if (verb === 'cuso4' && !dispExcess(v, { cuso4: Number(arg), taps: s.disp.taps })) return { title: `${arg} cm³ is not an excess.`, why: 'There is not enough Cu²⁺ for all the iron, so some iron is left mixed with the copper. The lesson uses 50 cm³.', focus: 'beaker' };
  if (verb === 'add-iron' && !s.disp.thermo) return { title: 'You did not read the starting temperature.', why: 'Stand the thermometer in the solution before adding the iron, so you can find the rise.', focus: 'beaker' };
  if (verb === 'add-iron' && arg === 'NONE') return { title: 'Stir it.', why: 'The filings settle at the bottom and react slowly unless they are kept moving.', focus: 'beaker' };
  if (verb === 'filter' && s.disp.elapsed !== null) {
    const done = 1 - Math.exp(-(s.disp.stir === 'STIR' ? 1 / 45 : 1 / 420) * (s.disp.filings === 'RUSTY' ? 0.6 : 1) * s.disp.elapsed);
    if (done < 0.99) return { title: 'The reaction had not finished.', why: 'Grey iron was still there: it ends up in your "copper". Wait until the solid is all reddish-brown and the temperature has started to fall.', focus: 'funnel' };
  }
  if (verb === 'dry' && arg === 'FLAME') return { title: 'Never dry propanone over a flame.', why: 'Propanone is flammable, and hot copper turns to black copper(II) oxide. Dry it in a warm place.', focus: 'funnel' };
  if (verb === 'weigh-copper' && !s.disp.paper) return { title: 'The filter paper was not weighed first.', why: 'Without its dry mass you cannot find the mass of copper.', focus: 'balance' };
  if (verb === 'tube' && arg === 'B' && arg2 === 'UNBOILED') return { title: 'Tube B needs BOILED water.', why: 'Tap or distilled water has air dissolved in it; boiling drives it out.', focus: 'rack' };
  if (verb === 'wool' && arg === 'DRY') return { title: 'Dry iron wool hardly rusts.', why: 'Rusting needs water as well as oxygen: moisten the iron wool.', focus: 'trough' };
  if (verb === 'start-week') {
    const t = s.rust.tubes;
    if (t.B.content && !t.B.oil) return { title: 'Tube B has no oil layer.', why: 'Air dissolves back into the boiled water. Pour a layer of oil on top.', focus: 'rack' };
    if (t.C.content && !t.C.stopper) return { title: 'Tube C is not stoppered.', why: 'Moist air gets in and the CaCl₂ cannot keep it dry.', focus: 'rack' };
  }
  if (verb === 'read-volume' && arg2 === 'unlevel') return { title: 'The levels are not equal.', why: 'With the water higher inside than outside, the air in the tube is below atmospheric pressure and reads too large. Raise or lower the tube until the levels match, then read.', focus: 'trough' };
  return null;
}
