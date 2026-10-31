import { type HeatItem, type HeatPhys, type PhyHeatState, type PhyHeatVariant } from '@aischool/shared';
import type { Correction, GuideStep } from '../../../lab3d-kit/guide';
import type { CameraMode } from '../../../lab3d-kit/store';
import { heatFlags } from '../actions';
import { APPARATUS_LABEL, NEEDED, PLACE_LABEL, type SceneState } from './scene-state';

/**
 * Guided mode (practice only): the practical as a checklist — collect, set
 * out, then each WAEC step in order — with gentle corrections and the reason.
 * Worked out from the recorded state and the bench's physics (is the water
 * boiling, has the ice melted, is the naphthalene solid); the guide never says
 * what an instrument reads.
 */

const weighs = (s: PhyHeatState, kind: 'empty' | 'water' | 'block' | 'final') => {
  const firstFill = s.events.find((e) => e.e.startsWith('fill:') || e.e.startsWith('warm:'))?.t ?? Infinity;
  const firstIce = s.events.find((e) => e.e.startsWith('ice:'))?.t ?? Infinity;
  const inAt = s.events.find((e) => e.e === 'block:gentle' || e.e === 'block:drop')?.t ?? Infinity;
  return s.weighs.some((w) => (kind === 'block' ? w.item === 'block' : w.item === 'cal' && (kind === 'empty' ? w.t < firstFill : kind === 'water' ? w.t >= firstFill && w.t < Math.min(firstIce, inAt) : w.t >= firstIce)));
};
const readAfter = (s: PhyHeatState, th: string, t0: number, t1 = Infinity) => s.reads.some((r) => r.th === th && r.t >= t0 && r.t <= t1);

export function guideSteps(s: PhyHeatState, scene: SceneState, mode: CameraMode, p: HeatPhys, v: PhyHeatVariant, pan: HeatItem | null): GuideStep[] {
  const task = s.task ?? 'MIX';
  const f = heatFlags(s.events);
  const steps: GuideStep[] = [
    {
      id: 'collect',
      label: `Collect your apparatus${scene.missing.length ? ` (${scene.missing.length} to go)` : ''}`,
      target: 'cupboard',
      why: NEEDED[task].map((id) => APPARATUS_LABEL[id].toLowerCase()).join(', ') + '.',
      done: scene.ready,
    },
    { id: 'bench', label: 'Go to your bench', target: 'mybench', why: 'Bench 2, at the front.', done: mode !== 'walk' || scene.placed.size > 0 },
  ];
  for (const id of task === 'COOL' ? (['tripod', 'beaker', 'stand'] as const) : task === 'MIX' ? (['tripod', 'beaker', 'thermometer'] as const) : (['thermometer'] as const))
    steps.push({
      id: `place-${id}`,
      label: PLACE_LABEL[id]!,
      target: id,
      why: id === 'tripod' ? 'The gauze spreads the flame under the beaker.' : id === 'beaker' ? (task === 'COOL' ? 'The water bath: it heats the tube evenly, below 100 °C.' : 'The block is heated in this water until it boils.') : id === 'stand' ? 'The clamp holds the boiling tube in the bath, then up in the air to cool.' : 'One in the bath, one in the calorimeter (or on the bench for the room temperature), bulbs fully immersed.',
      done: scene.placed.has(id),
      group: 'Set up',
    });
  const end: GuideStep[] = [
    { id: 'written', label: 'Write two precautions', target: 'book', why: task === 'COOL' ? 'E.g. heated in a water bath; the bulb fully immersed and not touching the glass; readings at regular intervals.' : task === 'LATENT' ? 'E.g. the ice was dried before adding; stirred continuously; started above and finished below room temperature.' : 'E.g. the calorimeter lagged and covered; the block transferred quickly without splashing; stirred before reading θ₃.', done: !!s.written.precautions.trim() },
    { id: 'handin', label: 'Hand in your lab', target: null, why: 'Open the menu and choose Hand in when everything is recorded.', done: false },
  ];
  if (task === 'MIX') {
    const inAt = s.events.find((e) => e.e === 'block:gentle' || e.e === 'block:drop')?.t ?? null;
    const boiling = p.bath >= v.boil - 0.3;
    const W = 'Balance';
    steps.push(
      { id: 'w-empty', label: 'Weigh the empty calorimeter and stirrer (m_c)', target: pan === 'cal' ? 'balance' : 'cal', why: 'Put it on the pan, slide the riders until the pointer is on zero, add up the beams and record the weighing. Write m_c in your table.', done: weighs(s, 'empty'), group: W },
      { id: 'fill', label: 'Fill the calorimeter about two-thirds with water', target: 'jug', why: 'Enough to cover the block; not so full that it overflows when the block goes in.', done: f.filled, group: W },
      { id: 'w-water', label: 'Weigh it again with the water (m₁)', target: pan === 'cal' ? 'balance' : 'cal', why: 'm_w = m₁ − m_c.', done: weighs(s, 'water'), group: W },
      { id: 'w-block', label: 'Weigh the metal block (m)', target: pan === 'block' ? 'balance' : 'block', why: 'Weigh it dry, before it is heated.', done: weighs(s, 'block'), group: W },
      { id: 'pan-off', label: 'Take the calorimeter off the balance and stand it in its lagging', target: f.lagged && pan !== 'cal' ? 'cal' : 'lagging', why: 'Cotton wool cuts the heat lost to the room.', done: f.lagged && pan !== 'cal', group: 'Calorimeter' },
      { id: 'bunsen', label: 'Light the Bunsen burner under the beaker', target: 'bunsen', why: 'Goggles on: boiling water can spit.', done: f.bunsen || f.block === 'cal', group: 'Heat the block' },
      { id: 'hang', label: 'Hang the block by its thread in the water', target: 'block', why: 'It must be completely covered by the water.', done: f.block !== 'bench', group: 'Heat the block' },
      { id: 'boil', label: 'Wait for the water to boil (time-lapse helps)', target: 'bath', why: 'Then leave the block in the boiling water for several minutes so that it reaches the water’s temperature.', done: boiling || f.block === 'cal' || f.block === 'air', group: 'Heat the block' },
      { id: 'th2', label: 'Read the calorimeter water temperature (θ₂)', target: 'th-cal', why: 'Just before the transfer: stir first, eye level with the mercury.', done: readAfter(s, 'cal', 0, inAt ?? Infinity), group: 'Heat the block' },
      { id: 'th1', label: 'Read the thermometer in the boiling water (θ₁)', target: 'th-bath', why: 'The block is at this temperature after several minutes in boiling water.', done: readAfter(s, 'bath', 0, inAt ?? Infinity), group: 'Heat the block' },
      { id: 'transfer', label: 'Lift the block out and lower it GENTLY into the calorimeter — quickly', target: 'block', why: 'Quickly, so it loses little heat in the air; gently, so no water splashes out.', done: inAt !== null, group: 'Mix' },
      { id: 'lid', label: 'Cover the calorimeter', target: 'cal', why: 'The lid stops heat escaping from the water’s surface.', done: f.lid && inAt !== null, group: 'Mix' },
      { id: 'stir', label: 'Stir gently with the stirrer', target: 'stirrer', why: 'So the heat spreads evenly and the thermometer reads the whole mixture. Never stir with the thermometer.', done: f.stirring && inAt !== null, group: 'Mix' },
      { id: 'th3', label: 'Read the thermometer as it rises: record the highest steady temperature (θ₃)', target: 'th-cal', why: 'Take a reading every half minute or so; the highest steady one is θ₃.', done: inAt !== null && s.reads.filter((r) => r.th === 'cal' && r.t > inAt + 20).length >= 3, group: 'Mix' },
      { id: 'table', label: 'Fill in the table', target: 'book', why: 'Masses to 0.1 g, temperatures to 1 decimal place; m_w = m₁ − m_c.', done: ['mc', 'm1', 'mw', 'mb', 'th1', 'th2', 'th3'].every((k) => s.table[k as 'mc'].trim()) },
      { id: 'calc', label: 'Work out the heat gained by the water and the calorimeter, then c', target: 'book', why: 'Masses in kg: Q = m c Δθ. Heat lost by the block = heat gained, so c = (Q_w + Q_c) ÷ (m (θ₁ − θ₃)).', done: !!s.answers.q1.value.trim() && !!s.answers.q2.value.trim() && !!s.answers.result.value.trim() },
    );
    return [...steps, ...end];
  }
  if (task === 'LATENT') {
    const firstIce = s.events.find((e) => e.e.startsWith('ice:'))?.t ?? null;
    const t1 = s.reads.find((r) => r.th === 'cal' && (firstIce === null || r.t < firstIce));
    const W = 'Warm water';
    steps.push(
      { id: 'w-empty', label: 'Weigh the empty calorimeter and stirrer (m_c)', target: pan === 'cal' ? 'balance' : 'cal', why: 'Balance the riders, add up the beams, record the weighing and write it down.', done: weighs(s, 'empty'), group: W },
      { id: 'warm', label: 'Pour in warm water (about 10 °C above room temperature), two-thirds full', target: 'kettle', why: 'Starting about as far above room temperature as you will finish below it makes the heat exchanged with the room cancel.', done: f.filled, group: W },
      { id: 'w-water', label: 'Weigh it with the warm water (m₁)', target: pan === 'cal' ? 'balance' : 'cal', why: 'm_w = m₁ − m_c.', done: weighs(s, 'water'), group: W },
      { id: 'lag', label: 'Stand it in its lagging and stir', target: 'cal', why: 'Lagged and stirred continuously.', done: f.lagged && pan !== 'cal' && f.stirring, group: W },
      { id: 'room', label: 'Read the room thermometer (θ_r)', target: 'th-room', why: 'You need it to judge where to stop adding ice.', done: s.reads.some((r) => r.th === 'room'), group: W },
      { id: 'th1', label: 'Read the warm water’s temperature (θ₁)', target: 'th-cal', why: 'Just before the first piece of ice goes in.', done: !!t1, group: W },
      { id: 'ice', label: 'Dry a piece of melting ice with blotting paper and add it; keep stirring', target: 'ice', why: 'Melting ice is at 0 °C. Water clinging to it would be counted as ice but needs no latent heat.', done: f.ice > 0, group: 'Ice' },
      { id: 'more', label: 'Add more pieces, one at a time, until it will finish about as far below room temperature as it started above', target: 'ice', why: 'Compare with your room-temperature reading. Each piece takes a little while to melt: watch the thermometer between pieces.', done: p.meltedAt !== null && f.ice >= 2, group: 'Ice' },
      { id: 'melted', label: 'Wait until every piece has melted, stirring', target: 'cal', why: 'θ₂ is the lowest steady temperature once all the ice has melted.', done: p.meltedAt !== null, group: 'Ice' },
      { id: 'th2', label: 'Read the lowest steady temperature (θ₂)', target: 'th-cal', why: 'Read it a few times: it falls, steadies, then starts to creep up.', done: p.meltedAt !== null && readAfter(s, 'cal', p.meltedAt), group: 'Ice' },
      { id: 'w-final', label: 'Weigh the calorimeter and contents again (m₂)', target: pan === 'cal' ? 'balance' : 'cal', why: 'The mass of ice m_i = m₂ − m₁.', done: weighs(s, 'final'), group: 'Ice' },
      { id: 'table', label: 'Fill in the table', target: 'book', why: 'Masses to 0.1 g, temperatures to 1 decimal place.', done: ['mc', 'm1', 'mw', 'room', 'th1', 'th2', 'm2', 'mi'].every((k) => s.table[k as 'mc'].trim()) },
      { id: 'calc', label: 'Work out the heat lost, the heat to warm the melted ice, then L', target: 'book', why: 'Heat lost = m_i L + m_i c_w θ₂, so L = (heat lost − m_i c_w θ₂) ÷ m_i, masses in kg.', done: !!s.answers.q1.value.trim() && !!s.answers.q2.value.trim() && !!s.answers.result.value.trim() },
    );
    return [...steps, ...end];
  }
  // COOL
  const air = f.tube === 'air';
  const solid = p.fs >= 0.999;
  steps.push(
    { id: 'bunsen', label: 'Light the Bunsen under the water bath', target: 'bunsen', why: 'Goggles on. Never heat the naphthalene directly over the flame.', done: f.bunsen || air, group: 'Melt' },
    { id: 'tube', label: 'Stand the boiling tube in the water bath', target: 'tube', why: 'Its vapour is flammable: the water bath keeps it away from the flame and below 100 °C.', done: f.tube !== 'rack', group: 'Melt' },
    { id: 'melt', label: 'Heat until it has all melted and the thermometer reads about 90 °C', target: 'th-tube', why: 'Use the time-lapse while it heats. Read the thermometer to check.', done: air || (f.tube === 'bath' && p.fs <= 0.001 && p.tn >= 88), group: 'Melt' },
    { id: 'air', label: 'Take the tube out and clamp it in air', target: 'tube', why: 'It cools in still air; keep it out of draughts.', done: air, group: 'Cool' },
    { id: 'watch', label: 'Start the stopwatch and read the thermometer at once (0 s)', target: 'stopwatch', why: 'Then every 30 s on the stopwatch.', done: f.watch !== 'idle' && s.cool.length > 0, group: 'Cool' },
    { id: 'stir', label: 'Stir gently with the thermometer while it is liquid', target: 'th-tube', why: 'It keeps the temperature even and stops the liquid supercooling.', done: f.stirring || p.fs > 0.05, group: 'Cool' },
    { id: 'stop-stir', label: 'Crystals are forming: stop stirring', target: 'th-tube', why: 'Leave the thermometer still in the setting naphthalene; never force or pull it out.', done: !f.stirring || p.fs < 0.05, group: 'Cool' },
    { id: 'every', label: 'Read the thermometer every 30 s and write each reading in the table', target: 'th-tube', why: 'At 0, 30, 60 … s; the temperature stays almost constant while it freezes (the plateau).', done: solid && s.cool.length >= 15, group: 'Cool' },
    { id: 'below', label: 'Carry on until it is solid and below 65 °C', target: 'th-tube', why: 'The curve then shows the solid cooling too.', done: solid && p.th.tube + v.off.tube < 65.5 && s.cool.length >= 15, group: 'Cool' },
    { id: 'table', label: 'Fill in t and θ for every reading', target: 'book', why: 't as the stopwatch showed it; θ to 1 decimal place.', done: s.cool.length >= 15 && s.cool.every((r) => r.t.trim() && r.th.trim()) },
    { id: 'graph', label: 'Draw a smooth curve and mark the plateau with a level line', target: 'book', why: 'Label the three parts: liquid cooling, freezing, solid cooling.', done: s.curve && !!s.line },
    { id: 'calc', label: 'Read the melting point and work out the cooling rate before the plateau', target: 'book', why: 'Rate = (first temperature − plateau) ÷ time to reach the plateau, in °C per minute.', done: !!s.answers.result.value.trim() && !!s.answers.q1.value.trim() },
  );
  return [...steps, ...end];
}

/** A gentle correction for a step just recorded (null: nothing wrong). */
export function correctionFor(a: string, s: PhyHeatState, p: HeatPhys, v: PhyHeatVariant, scene: SceneState): Correction | null {
  const [verb, arg, extra] = a.split(':') as [string, string | undefined, string | undefined];
  const task = s.task ?? 'MIX';
  if (verb === 'collect' && arg && !NEEDED[task].includes(arg as never) && APPARATUS_LABEL[arg as keyof typeof APPARATUS_LABEL])
    return { title: `The ${APPARATUS_LABEL[arg as keyof typeof APPARATUS_LABEL].toLowerCase()} is not needed here.`, why: `This practical needs ${NEEDED[task].map((id) => APPARATUS_LABEL[id].toLowerCase()).join(', ')}. You can put it back from your bench or the cupboard list.` };
  if (verb === 'bunsen' && arg === 'on' && !scene.goggles) return { title: 'Goggles on before you heat water.', why: 'Boiling water can spit. The goggles hang by the door (or select them and put them on).', focus: 'goggles' };
  if (verb === 'thstir') return { title: 'A thermometer is not a stirrer.', why: 'Its thin glass bulb breaks easily, and mercury is poisonous. Use the copper stirrer. (If a thermometer breaks, tell the teacher; never touch the mercury.)', focus: 'stirrer' };
  if (verb === 'block' && arg === 'drop') return { title: 'Lower the block in gently.', why: 'Dropped in, it splashes water (and some heat) out of the calorimeter, and hot water can scald. Lower it gently by its thread.', focus: 'cal' };
  if (verb === 'block' && arg === 'gentle') {
    const lift = [...s.events].reverse().find((e) => e.e === 'block:lift');
    const inn = [...s.events].reverse().find((e) => e.e === 'block:gentle');
    if (p.bath < v.boil - 0.3 || (lift && p.tb < p.bath - 3)) return { title: 'The block was not at the boiling point yet.', why: 'It should hang in boiling water for several minutes first, or its temperature is lower than θ₁ and c comes out wrong.', focus: 'bath' };
    if (lift && inn && inn.t - lift.t > 6) return { title: 'That transfer was slow.', why: 'Every second in the air the block loses heat. Lift it and lower it straight in.', focus: 'cal' };
    if (!heatFlags(s.events).lagged) return { title: 'The calorimeter is not lagged.', why: 'Without its cotton-wool lagging it loses more heat to the room. Stand it in the lagging (next time before the transfer).', focus: 'lagging' };
  }
  if (verb === 'fill' && arg === '3') return { title: 'Full to the brim will overflow.', why: 'When the block goes in it pushes water over the top, and that water is lost from m_w. Two-thirds full is right.', focus: 'cal' };
  if (verb === 'ice' && arg === 'wet') return { title: 'Dry the ice first.', why: 'Water at 0 °C clinging to the ice is weighed as ice but needs no latent heat, so L comes out too low. Dab each piece with blotting paper.', focus: 'blotting' };
  if (verb === 'ice' && extra === 'freezer') return { title: 'Use melting ice.', why: 'Ice straight from the freezer is below 0 °C: it takes extra heat to warm up to 0 °C before it melts. Melting ice is at exactly 0 °C.', focus: 'ice' };
  if (verb === 'tube' && arg === 'flame') return { title: 'Never heat naphthalene over a flame.', why: 'Its vapour is flammable. Heat it only in the boiling-water bath.', focus: 'bath' };
  if (verb === 'tube' && arg === 'air' && (p.fs > 0.001 || p.tn < 85)) return { title: 'It was not ready.', why: p.fs > 0.001 ? 'Some naphthalene was still solid: melt it all first, or the curve has no liquid part.' : 'Heat it to about 90 °C first, so the curve starts well above the plateau.', focus: 'tube' };
  if (verb === 'th' && arg === 'pull' && p.fs > 0.3) return { title: 'Leave the thermometer in the solid.', why: 'Pulling it out of setting naphthalene can snap it. Leave it until the naphthalene is melted again.', focus: 'tube' };
  if (verb === 'stir' && arg === 'on' && task === 'COOL' && p.fs > 0.3) return { title: 'Too late to stir.', why: 'Once crystals have formed, stirring forces the thermometer through the solid and can break it. Stop stirring.', focus: 'tube' };
  if (verb === 'read' && arg === 'tube' && task === 'COOL') {
    const w0 = s.events.find((e) => e.e === 'watch:start');
    const last = s.reads[s.reads.length - 1];
    if (w0 && last) {
      const t = last.t - w0.t;
      const off = Math.abs(t - Math.round(t / 30) * 30);
      if (off > 3) return { title: 'Read on the 30 s marks.', why: `That reading was at ${t.toFixed(0)} s on the stopwatch. Read at 0, 30, 60 … s so the readings are at regular intervals. Delete it (×) if you like.`, focus: 'stopwatch' };
    }
  }
  return null;
}
