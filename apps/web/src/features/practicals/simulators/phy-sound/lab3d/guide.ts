import { SONO_CARD_LOAD, SOUND_CARD, tubeHalfWidth, tubeResonance, sonoBand, sonoResonance, type PhySoundState, type PhySoundVariant } from '@aischool/shared';
import type { Correction, GuideStep } from '../../../lab3d-kit/guide';
import type { CameraMode } from '../../../lab3d-kit/store';
import type { Strike } from '../actions';
import { APPARATUS_LABEL, NEEDED, PLACE_LABEL, PLACEABLE, type SceneState } from './scene-state';

/**
 * Guided mode (practice only): the resonance labs as a checklist — collect,
 * set up, then for each fork on the card: take it, strike it on the pad, find
 * the resonance (the loudest sound, or the rider thrown off) and take the
 * length; then the table, the graph and the deductions — with gentle
 * corrections and the reason. Worked out from the recorded state: the guide
 * never says where the resonance is.
 */

/** The tube's forks in the lesson's order: 512 Hz first (with its second resonance), then down the set. */
export const TUBE_ORDER = [512, 384, 320, 288, 256];

export function guideSteps(s: PhySoundState, scene: SceneState, mode: CameraMode, strike: Strike | null): GuideStep[] {
  const sono = (s.task ?? 'TUBE') === 'SONO';
  const steps: GuideStep[] = [
    { id: 'collect', label: `Collect your apparatus${scene.missing.length ? ` (${scene.missing.length} to go)` : ''}`, target: 'cupboard', why: sono ? 'The sonometer, the hanger and masses, the forks, the rubber pad and paper riders.' : 'The resonance tube and its jar of water, a clamp and stand, a metre rule, the forks and the rubber pad.', done: scene.ready },
    { id: 'bench', label: 'Go to your bench', target: 'mybench', why: 'Bench 2, at the front.', done: mode !== 'walk' || scene.placed.size > 0 },
  ];
  for (const id of PLACEABLE[sono ? 'SONO' : 'TUBE'])
    steps.push({
      id: `place-${id}`,
      label: PLACE_LABEL[id]!,
      target: id,
      why: id === 'tube' ? 'The jar on the floor, so a long air column is possible; the tube upright in the water.' : id === 'stand' ? 'The tube must be vertical; the clamp lets you slide it up and down.' : id === 'rule' ? 'Its zero at the open top of the tube, so it reads l at the water surface.' : 'Its pulley just past the bench end, so the load hangs freely.',
      done: scene.placed.has(id),
      group: 'Set up',
    });
  // struck on the pad with this fork in hand (still ringing, or since: it dies away while you search)
  const ringing = (f: number) => (!!strike && strike.fork === f) || s.log.slice(s.log.map((e) => e.a).lastIndexOf(`fork:${f}`)).some((e) => e.a === `strike:${f}:pad`);
  if (!sono) {
    const reads = (f: number) => s.readings.filter((r) => r.fork === f);
    const next = TUBE_ORDER.find((f) => !reads(f).length || (f === 512 && reads(f).length < 2)) ?? null;
    if (next !== null) {
      const first = !reads(next).length;
      const group = `Fork ${TUBE_ORDER.indexOf(next) + 1}: ${next} Hz${first ? '' : ' — second resonance'}`;
      steps.push(
        { id: 'fork', label: `Take the ${next} Hz fork from the set`, target: 'forks', why: 'Its frequency is stamped on it.', done: s.fork === next, group },
        { id: 'strike', label: 'Strike it on the rubber pad and hold it over the mouth', target: 'pad', why: 'On the pad it rings with a pure note; a hard surface damages it and adds overtones. Hold it just above the mouth, not touching.', done: s.fork === next && ringing(next), group },
        first
          ? { id: 'find', label: 'Raise the tube slowly from a short column until the sound is loudest', target: 'tube', why: 'Watch the loudness meter (or listen). Go a little past the loudest point and back to find it exactly. Strike again if the fork dies away.', done: false, group }
          : { id: 'find2', label: 'Raise the tube on (about three times as far) to the second loud sound', target: 'tube', why: 'The second resonance is at 3λ/4 − e. l₂ − l₁ = λ/2, with no end correction.', done: false, group },
        { id: 'take', label: first ? 'Read l at eye level, take the length and write it as l₁' : 'Take this length and write it as l₂', target: 'rule', why: 'Eye level with the water surface, to 0.1 cm.', done: false, group },
      );
    }
    steps.push({ id: 'rows', label: 'Fill in f, 1/f and l₁ (and l₂ for 512 Hz)', target: 'book', why: '1/f in s: 1/256 = 0.00391 s.', done: s.tube.length >= 5 && s.tube.every((r) => r.f.trim() && r.inv.trim() && r.l1.trim()) });
    steps.push(
      { id: 'graph', label: 'Plot l against 1/f and draw your best line', target: 'book', why: 'l = (v/4)(1/f) − e: a straight line, cutting the l-axis just below the origin.', done: !!s.line },
      { id: 'slope', label: 'Find the slope and v = 4 × slope', target: 'book', why: 'Slope in cm s⁻¹; ÷ 100 for m s⁻¹, then × 4.', done: !!s.answers.slope.value.trim() && !!s.answers.v.value.trim() },
      { id: 'e', label: 'Find the intercept on the l-axis and e = −intercept', target: 'book', why: 'Intercept = l − slope × (1/f) for a point on your line.', done: !!s.answers.e.value.trim() },
      { id: 'v2', label: 'Work out v = 2f(l₂ − l₁) for 512 Hz', target: 'book', why: 'The end correction cancels out.', done: !!s.answers.v2.value.trim() },
    );
  } else {
    steps.push({ id: 'load', label: `Hang the hanger and masses: ${SONO_CARD_LOAD.toFixed(1)} kg in all`, target: s.load === 0 ? 'masses' : 'hanger', why: 'The tension T = Mg must stay the same for every fork.', done: s.load === SONO_CARD_LOAD || s.readings.length > 0, group: 'Tension' });
    const reads = (f: number) => s.readings.filter((r) => r.fork === f);
    const next = SOUND_CARD.SONO.find((f) => !reads(f).length) ?? null;
    if (next !== null) {
      const group = `Fork ${SOUND_CARD.SONO.indexOf(next) + 1}: ${next} Hz`;
      const thrown = !!s.jump && s.jump.fork === next && !s.rider;
      steps.push(
        { id: 'fork', label: `Take the ${next} Hz fork from the set`, target: 'forks', why: 'Start with the lowest fork: it needs the longest wire.', done: s.fork === next, group },
        { id: 'rider', label: 'Place a paper rider on the middle of the wire', target: 'rider', why: 'The middle moves most in the fundamental: the rider is thrown off at resonance.', done: s.rider || thrown, group },
        { id: 'strike', label: 'Strike the fork on the pad and press its stem on the box', target: 'pad', why: 'The box carries the vibration to the wire. Do not touch the wire with the fork.', done: ringing(next) || thrown, group },
        { id: 'find', label: 'Move the bridge slowly until the rider is thrown off', target: 'bridge', why: 'Start with the bridges close together and move them apart: the first time the rider jumps is the fundamental. Strike again if the fork dies away.', done: thrown, group },
        { id: 'take', label: 'Take the length between the bridges and write it in the table', target: 'bridge', why: 'Read the moving bridge’s edge on the scale to 0.1 cm (0.001 m).', done: false, group },
      );
    }
    steps.push({ id: 'rows', label: 'Fill in f, l (m) and 1/l for every fork', target: 'book', why: 'l = 0.602 m gives 1/l = 1.66 m⁻¹.', done: s.sono.length >= 4 && s.sono.every((r) => r.f.trim() && r.l.trim() && r.inv.trim()) });
    steps.push(
      { id: 'graph', label: 'Plot f against 1/l and draw your best line', target: 'book', why: 'f = (v/2)(1/l): a straight line through the origin.', done: !!s.line },
      { id: 'slope', label: 'Find the slope and v = 2 × slope', target: 'book', why: 'The slope is f × l in Hz m (= m s⁻¹).', done: !!s.answers.slope.value.trim() && !!s.answers.v.value.trim() },
      { id: 'mu', label: 'Work out T = Mg and μ = T/v²', target: 'book', why: 'M in kg, g = 10 m s⁻² (or 9.8): μ in kg m⁻¹.', done: !!s.answers.T.value.trim() && !!s.answers.mu.value.trim() },
    );
  }
  steps.push(
    { id: 'written', label: 'Write two precautions', target: 'book', why: sono ? 'E.g. the tension kept constant; the rider at the middle of the vibrating length; the fork’s stem on the box, not touching the wire.' : 'E.g. the fork struck on a rubber pad and held just above the mouth; resonance approached from short lengths and checked back and forth; the tube vertical.', done: !!s.written.precautions.trim() },
    { id: 'handin', label: 'Hand in your lab', target: null, why: 'Open the menu and choose Hand in when everything is recorded.', done: false },
  );
  return steps;
}

/** A gentle correction for a step just recorded (null: nothing wrong). */
export function correctionFor(a: string, s: PhySoundState, v: PhySoundVariant): Correction | null {
  const parts = a.split(':');
  const [verb, arg, extra] = parts as [string, string | undefined, string | undefined];
  const task = s.task ?? 'TUBE';
  if (verb === 'collect' && arg && !NEEDED[task].includes(arg as never) && APPARATUS_LABEL[arg as keyof typeof APPARATUS_LABEL])
    return { title: `The ${APPARATUS_LABEL[arg as keyof typeof APPARATUS_LABEL].toLowerCase()} is not needed here.`, why: `This practical needs ${NEEDED[task].map((id) => APPARATUS_LABEL[id].toLowerCase()).join(', ')}. You can put it back from your bench or the cupboard list.` };
  if (verb === 'strike' && extra === 'bench') return { title: 'Strike the fork on the rubber pad.', why: 'A fork struck on the bench (or the glass) rings with harsh overtones, can be damaged, and can crack the tube. Use the rubber pad every time.', focus: 'pad' };
  if (verb === 'load' && s.readings.length && task === 'SONO') return { title: 'Keep the tension the same.', why: `You have already taken lengths with one load. The experiment compares f and l at constant tension: put the load back to ${s.readings[0]!.load.toFixed(1)} kg.`, focus: 'hanger' };
  if (verb === 'reading' && arg && extra) {
    const f = Number(arg);
    const len = Number(extra);
    const silent = parts.includes('silent');
    if (task === 'TUBE') {
      if (silent) return { title: 'The fork had stopped ringing.', why: 'With no sound you cannot judge resonance. Strike the fork again on the pad, then find the loudest point.', focus: 'pad' };
      const L1 = tubeResonance(v, f, 1);
      const L2 = tubeResonance(v, f, 2);
      const first = s.readings.filter((r) => r.fork === f).length === 1;
      if (first && len > (L1 + L2) / 2) return { title: 'Was that the first loud sound?', why: 'You may have gone past the first resonance to the second. Lower the tube to a short column and raise it slowly: the first loud sound is l₁. Delete this row (×) and take it again.', focus: 'tube' };
      const near = Math.abs(len - L1) < Math.abs(len - L2) ? { L: L1, hw: tubeHalfWidth(v, f, 1) } : { L: L2, hw: tubeHalfWidth(v, f, 2) };
      if (Math.abs(len - near.L) > near.hw + 0.3) return { title: 'That was not quite the loudest point.', why: 'The sound grows to a sharp maximum and then falls again. Move the tube back and forth through the loud region in small steps and stop where it is loudest.', focus: 'tube' };
    } else {
      if (!parts.includes('jumped')) return { title: 'The rider was not thrown off.', why: 'Take the length only when the rider jumps off the wire: that is resonance. Put the rider back, strike the fork and move the bridge slowly.', focus: 'rider' };
      const L = sonoResonance(v, f, s.load);
      if (len > 1.5 * L) return { title: 'That is not the fundamental.', why: 'Start with the bridges close together and move them apart: the first resonance is the fundamental.', focus: 'bridge' };
      if (Math.abs(len - L) > sonoBand(v, f, s.load) + 0.3) return { title: 'Check the length.', why: 'Take the length just where the rider was thrown off.', focus: 'bridge' };
    }
  }
  return null;
}
