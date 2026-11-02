import { THERM_HEAT_TIME, THERM_TIMES, thermExpansion, thermIdealExpansion, thermWatch, type PhyThermalState, type PhyThermalVariant, type ThermPhys } from '@aischool/shared';
import type { Correction, GuideStep } from '../../../lab3d-kit/guide';
import type { CameraMode } from '../../../lab3d-kit/store';
import { thermFlags } from '../actions';
import { APPARATUS_LABEL, NEEDED, PLACE_LABEL, PLACEABLE, type SceneState } from './scene-state';

/**
 * Guided mode (practice only): the practical as a checklist — collect, set
 * out, then each WAEC step in order — with gentle corrections and the reason.
 * Worked out from the recorded state and the bench's physics (is the steam
 * passing, has the rod stopped expanding, is the water steady); the guide
 * never says what an instrument reads.
 */

const readAt = (s: PhyThermalState, k: string, from = -Infinity, to = Infinity) => s.reads.some((r) => r.k === k && r.t >= from && r.t <= to);
const cellsDone = (s: PhyThermalState, ids: string[]) => ids.every((id) => (s.cells[id] ?? '').trim());

const PLACE_WHY: Record<string, string> = {
  tripod: 'The gauze spreads the flame’s heat.',
  can: 'The steam generator: water boils in it and the steam goes to the jacket.',
  jacket: 'The steam passes along it around the rod; its outlet goes into the beaker, away from people.',
  tubing: 'Rubber tubing from the can’s spout to the jacket’s inlet.',
  rod: 'One end firmly against the fixed stop, so all the expansion shows at the micrometer.',
  thermometer: 'Its bulb in the steam (or in the water), not touching the metal.',
  bigbeaker: 'Enough water to cover the whole air column.',
  stand: 'It holds the ruler with the tube and thermometer in the water.',
  capillary: 'The tube and thermometer are tied to the ruler with rubber bands, open end of the tube up.',
};

export function guideSteps(s: PhyThermalState, scene: SceneState, mode: CameraMode, p: ThermPhys, v: PhyThermalVariant): GuideStep[] {
  const task = s.task ?? 'EXPANSION';
  const f = thermFlags(s.events);
  const steps: GuideStep[] = [
    { id: 'collect', label: `Collect your apparatus${scene.missing.length ? ` (${scene.missing.length} to go)` : ''}`, target: 'cupboard', why: NEEDED[task].map((id) => APPARATUS_LABEL[id].toLowerCase()).join(', ') + '.', done: scene.ready },
    { id: 'bench', label: 'Go to your bench', target: 'mybench', why: 'Bench 2, at the front.', done: mode !== 'walk' || scene.placed.size > 0 },
  ];
  const ruleRead = readAt(s, 'rule');
  for (const id of PLACEABLE[task]) {
    if (id === 'rod') steps.push({ id: 'l0', label: 'Measure the rod’s length l₀ with the metre rule', target: 'rule', why: 'The rod lies on the rule with one end at the zero: read the other end to the nearest mm, square on. Write it down (l₀ / mm).', done: ruleRead, group: 'Set up' });
    steps.push({ id: `place-${id}`, label: PLACE_LABEL[id]!, target: id === 'thermometer' ? (task === 'ELECTRIC' ? 'cal' : task === 'EXPANSION' ? 'jacket' : 'capillary') : id, why: PLACE_WHY[id] ?? '', done: scene.placed.has(id), group: 'Set up' });
  }
  const end: GuideStep[] = [
    {
      id: 'written',
      label: 'Write two precautions',
      target: 'book',
      why: task === 'CHARLES' ? 'E.g. stirred and waited for a steady temperature before each reading; the whole air column immersed; eye level with the index.' : task === 'ELECTRIC' ? 'E.g. the calorimeter lagged and covered; stirred continuously; the heater fully immersed before switching on.' : 'E.g. waited until the readings were steady; used the ratchet to avoid over-tightening; the rod fixed firmly at one end.',
      done: !!s.written.precautions.trim(),
    },
    { id: 'handin', label: 'Hand in your lab', target: null, why: 'Open the menu and choose Hand in when everything is recorded.', done: false },
  ];
  if (task === 'EXPANSION') {
    const boilAt = s.events.find((e) => e.e === 'boiler:on')?.t ?? Infinity;
    const steam = p.boiler && p.can >= v.boil - 0.05;
    const steady = thermExpansion(v, p) >= 0.99 * thermIdealExpansion(v);
    const hotMicro = s.reads.filter((r) => r.k === 'micro' && r.t > boilAt).length;
    steps.push(
      { id: 'th1', label: 'Read the thermometer in the jacket (θ₁)', target: 'th-jacket', why: 'Before any steam: the rod is at room temperature.', done: readAt(s, 'thermo', 0, boilAt), group: 'Cold readings' },
      { id: 'touch1', label: 'Turn the micrometer’s ratchet until it just touches the rod', target: 'micro', why: 'The ratchet clicks when the spindle touches with the right pressure — never screw the thimble tight.', done: s.events.some((e) => e.e === 'micro:ratchet' && e.t < boilAt), group: 'Cold readings' },
      { id: 'r1', label: 'Read the micrometer (r₁)', target: 'micro', why: 'Sleeve (whole and half millimetres) plus the thimble division on the datum line × 0.01 mm.', done: readAt(s, 'micro', 0, boilAt), group: 'Cold readings' },
      { id: 'back', label: 'Back the micrometer off a few turns', target: 'micro', why: 'The rod must be free to expand, or it pushes on the gauge and bends.', done: !f.touching || f.boiler, group: 'Steam' },
      { id: 'steam', label: 'Light the burner under the steam can', target: 'can', why: 'Goggles on. Point the steam outlet into the beaker, away from everyone.', done: f.boiler || hotMicro > 0, group: 'Steam' },
      { id: 'wait', label: 'Wait for the steam to pass and the thermometer to steady (time-lapse helps)', target: 'th-jacket', why: 'Then wait several minutes more: the rod heats up more slowly than the thermometer.', done: steam && p.thJ >= v.boil - 0.3, group: 'Steam' },
      { id: 'th2', label: 'Read the thermometer (θ₂)', target: 'th-jacket', why: 'The steam’s temperature: a little under 100 °C here.', done: readAt(s, 'thermo', boilAt), group: 'Hot readings' },
      { id: 'r2', label: 'Ratchet the micrometer up to the rod again and read it (r₂)', target: 'micro', why: 'The rod has expanded towards the gauge, so r₂ is smaller than r₁.', done: hotMicro >= 1, group: 'Hot readings' },
      { id: 'repeat', label: 'Back off, wait a minute, ratchet in and read again until two readings agree', target: 'micro', why: steady ? 'The rod has (nearly) stopped expanding.' : 'The rod is still expanding: be patient.', done: hotMicro >= 2, group: 'Hot readings' },
      { id: 'table', label: 'Fill in the table', target: 'book', why: 'e = r₁ − r₂ and θ₂ − θ₁; l₀ in mm, like e.', done: cellsDone(s, ['l0', 'th1', 'r1', 'th2', 'r2', 'r2b', 'e', 'dth']) },
      { id: 'calc', label: 'Work out α = e ÷ (l₀ (θ₂ − θ₁))', target: 'book', why: 'Both lengths in mm (or both in m); α in K⁻¹.', done: !!s.answers.alpha.value.trim() },
    );
    return [...steps, ...end];
  }
  if (task === 'CHARLES') {
    const rows = s.rows.length;
    steps.push(
      { id: 'immerse', label: 'Lower the tube into the water: the whole air column under', target: 'capillary', why: 'Any part above the water stays cooler, so the column reads short.', done: f.immersed === 'full', group: 'Readings' },
      { id: 'first', label: 'Stir, wait, then read θ and l (the first pair)', target: 'th-bath', why: 'Read the thermometer, then the bottom of the acid index against the ruler, eye level with each.', done: rows >= 1, group: 'Readings' },
      { id: 'heat', label: `Heat about 15 °C, remove the flame, stir, wait and read θ and l again (${rows} of 5)`, target: f.bunsen ? 'bunsen' : 'bigbeaker', why: f.bunsen ? 'Remove the flame before you read: the gauze keeps heating for a short while, so stir and wait for a steady temperature.' : 'Light the Bunsen and heat gently; watch the thermometer.', done: rows >= 5, group: 'Readings' },
      { id: 'table', label: 'Fill in T = θ + 273 and l/T for each row', target: 'book', why: 'T in kelvin. l/T comes out about the same every time: Charles’s law.', done: rows >= 5 && s.rows.every((r) => (r.c.T ?? '').trim() && (r.c.lT ?? '').trim() && (r.c.th ?? '').trim() && (r.c.l ?? '').trim()) },
      { id: 'graph', label: 'Plot l against θ, draw the best line and extend it back to l = 0', target: 'book', why: 'The θ axis runs back to −300 °C so you can extend the line.', done: !!s.line },
      { id: 'calc', label: 'Write the slope, absolute zero and l/T', target: 'book', why: 'Absolute zero is where your line meets l = 0 — about −273 °C.', done: !!s.answers.slope.value.trim() && !!s.answers.zero.value.trim() && !!s.answers.ratio.value.trim() },
    );
    return [...steps, ...end];
  }
  const onAt = s.events.find((e) => e.e === 'switch:on')?.t ?? Infinity;
  const offAt = s.events.find((e) => e.e === 'switch:off' && e.t > onAt)?.t ?? Infinity;
  const bal = s.reads.filter((r) => r.k === 'balance').length;
  const w = thermWatch(p, p.t);
  const rowsDone = THERM_TIMES.filter((t) => s.rows.some((r) => r.key === t && (r.c.th ?? '').trim())).length;
  steps.push(
    { id: 'w1', label: 'Put the empty calorimeter on the balance and read it', target: f.pan ? 'balance' : 'cal', why: 'The mass of the calorimeter and stirrer.', done: bal >= 1 || f.poured, group: 'Mass of water' },
    { id: 'pour', label: 'Pour in about 200 g of water', target: 'jug', why: 'Enough to cover the heater’s coil.', done: f.poured, group: 'Mass of water' },
    { id: 'w2', label: 'Read the balance again (calorimeter + water)', target: 'balance', why: 'm = the difference of your two readings.', done: bal >= 2, group: 'Mass of water' },
    { id: 'off-pan', label: 'Take it off the balance and stand it in its lagging', target: f.pan ? 'cal' : 'lagging', why: 'Cotton wool cuts the heat lost to the room.', done: !f.pan && f.lagged, group: 'Set up' },
    { id: 'heater', label: 'Put the heater in, fully under the water, and the lid on', target: 'heater', why: 'Never switch a heater on in air: it overheats and burns out.', done: f.heaterIn && f.lid, group: 'Set up' },
    { id: 'wire', label: 'Connect the ammeter in series and the voltmeter across the heater', target: 'wires', why: 'The voltmeter measures the p.d. across the heater only.', done: f.wire !== 'none', group: 'Set up' },
    { id: 'stir', label: 'Stir, and read the starting temperature θ₀', target: 'th-cal', why: 'Eye level with the end of the mercury.', done: readAt(s, 'thermo', 0, onAt), group: 'Heating' },
    { id: 'on', label: 'Switch on and start the stopwatch together; keep stirring', target: 'supply', why: 'The heating time t starts at the moment you switch on.', done: f.switchedOn, group: 'Heating' },
    { id: 'vi', label: 'Read the voltmeter and the ammeter', target: 'voltmeter', why: 'Read them while the heater is on; they should stay steady.', done: readAt(s, 'voltmeter', onAt, offAt) && readAt(s, 'ammeter', onAt, offAt), group: 'Heating' },
    { id: 'every', label: `Read the thermometer every 60 s (${rowsDone} of ${THERM_TIMES.length} in the table)`, target: 'th-cal', why: 'At 0, 60, 120 … 300 s on the stopwatch. Write each in the table.', done: s.reads.filter((r) => r.k === 'thermo' && r.t >= onAt - 1).length >= THERM_TIMES.length, group: 'Heating' },
    { id: 'off', label: `Switch off at ${THERM_HEAT_TIME} s and note the time`, target: 'supply', why: `Read the stopwatch as you switch off${f.on ? ` (it reads ${Math.floor(w)} s)` : ''}.`, done: f.switchedOff && offAt > onAt, group: 'Heating' },
    { id: 'peak', label: 'Keep stirring: record the highest temperature', target: 'th-cal', why: 'The heater is hotter than the water, so the temperature goes on rising for a short while after switching off.', done: readAt(s, 'thermo', offAt + 5), group: 'Heating' },
    { id: 'table', label: 'Fill in the table and plot θ against t', target: 'book', why: 'm by difference; Δθ = θ_max − θ₀.', done: cellsDone(s, ['mc', 'mcw', 'm', 'V', 'I', 't', 'th0', 'thmax', 'dth']) && !!s.line },
    { id: 'calc', label: 'Work out E = VIt, P = VI and c = E ÷ (m Δθ)', target: 'book', why: 't in seconds; m in kilograms.', done: !!s.answers.energy.value.trim() && !!s.answers.power.value.trim() && !!s.answers.c.value.trim() },
  );
  return [...steps, ...end];
}

/** A gentle correction for a step just recorded (null: nothing wrong). */
export function correctionFor(a: string, s: PhyThermalState, p: ThermPhys, v: PhyThermalVariant, scene: SceneState): Correction | null {
  const [verb, arg] = a.split(':') as [string, string | undefined];
  const task = s.task ?? 'EXPANSION';
  const f = thermFlags(s.events);
  if (verb === 'collect' && arg && !NEEDED[task].includes(arg as never) && APPARATUS_LABEL[arg as keyof typeof APPARATUS_LABEL])
    return { title: `The ${APPARATUS_LABEL[arg as keyof typeof APPARATUS_LABEL].toLowerCase()} is not needed here.`, why: `This practical needs ${NEEDED[task].map((id) => APPARATUS_LABEL[id].toLowerCase()).join(', ')}. You can put it back from your bench or the cupboard list.` };
  if ((verb === 'boiler' || verb === 'bunsen') && arg === 'on' && !scene.goggles) return { title: 'Goggles on before you heat water.', why: task === 'EXPANSION' ? 'Steam scalds and boiling water can spit. The goggles hang by the door (or select them and put them on).' : 'Hot water can spit, and the tube holds concentrated acid. Put the goggles on.', focus: 'goggles' };
  if (verb === 'boiler' && arg === 'on' && f.touching) return { title: 'Back the micrometer off first.', why: 'Touching the rod, it stops the rod expanding freely: the rod pushes on the gauge and bends. Back it off a few turns, and screw it up again when the rod is hot.', focus: 'micro' };
  if (verb === 'micro' && arg === 'thimble') return { title: 'Use the ratchet.', why: 'Screwing the thimble tight presses the spindle on too hard, so the reading is too high (and each reading is pressed differently). Turn the ratchet until it clicks.', focus: 'micro' };
  if (a === 'read:micro' && task === 'EXPANSION' && f.boiler && thermExpansion(v, p) < 0.97 * thermIdealExpansion(v) && p.contact) return { title: 'The rod is still expanding.', why: 'The thermometer steadies quickly, but the thick rod takes several minutes to reach the steam’s temperature. Back off, wait, and read again until two readings agree.', focus: 'micro' };
  if (verb === 'immerse' && arg === 'part') return { title: 'Lower it further.', why: 'The whole air column must be under the water, or the part above it stays cooler and the length is too short.', focus: 'capillary' };
  if (a === 'read:column' && task === 'CHARLES') {
    if (f.bunsen) return { title: 'Remove the flame before reading.', why: 'While it heats, the water and the air in the tube are not at one temperature: the air lags behind the thermometer. Flame off, stir, wait, then read.', focus: 'bunsen' };
    if (Math.abs(p.air - p.thB) > 1.0) return { title: 'Wait for a steady temperature.', why: 'Stir and wait a little: the air in the thin tube takes some seconds to reach the water’s temperature.', focus: 'stirrer' };
  }
  if (verb === 'switch' && arg?.startsWith('on') && !(f.heaterIn && f.poured)) return { title: 'Switch it off — the heater is not in the water!', why: 'A heater switched on in air overheats in seconds and burns out (and can burn you). Put it fully under the water first.', focus: 'heater' };
  if (verb === 'switch' && arg?.startsWith('on') && !(f.lagged && f.lid)) return { title: 'Lag and cover the calorimeter.', why: 'Without the lagging and lid, heat escapes to the room and c comes out too large. (Next time, before switching on.)', focus: 'lagging' };
  if (verb === 'wire' && arg === 'wide') return { title: 'The voltmeter goes across the heater only.', why: 'Across the heater and the ammeter it also reads the small p.d. across the ammeter, so V (and E) come out a little too large.', focus: 'voltmeter' };
  if (verb === 'pan' && arg === 'on' && f.heaterIn) return { title: 'Take the heater out first.', why: 'Weigh only the calorimeter, its stirrer and the water.', focus: 'heater' };
  return null;
}
