import { MOMENTS_CARD_X, momentsBalanced, type PhyMomentsState, type PhyMomentsVariant } from '@aischool/shared';
import type { Correction, GuideStep } from '../../../lab3d-kit/guide';
import type { CameraMode } from '../../../lab3d-kit/store';
import { KNOWN_NAME } from '../actions';
import { APPARATUS_LABEL, NEEDED, PLACE_LABEL, type ApparatusId, type SceneState } from './scene-state';

/**
 * Guided mode (practice only): the knife edge as a checklist, one group per
 * reading, with the object to use next and gentle corrections with the reason.
 * Worked out from the recorded state only — the guide never says where the
 * balance point is.
 */

const rowDone = (s: PhyMomentsState, k: number) => {
  const r = s.table[k];
  return !!r && !!r.x1.trim() && !!r.x2.trim() && !!r.d1.trim() && !!r.d2.trim() && !!r.m.trim();
};
/** The next mark on the task card for the known mass not yet used (null: the card is done). */
export function nextX(s: PhyMomentsState): number | null {
  const task = s.task ?? 'MOMENTS';
  return MOMENTS_CARD_X[task].find((x) => !s.readings.some((r) => r.known !== null && Math.abs(r.known - x) < 0.5)) ?? null;
}

export function guideSteps(s: PhyMomentsState, scene: SceneState, mode: CameraMode): GuideStep[] {
  const task = s.task ?? 'MOMENTS';
  const known = KNOWN_NAME[task];
  const steps: GuideStep[] = [
    { id: 'collect', label: `Collect your apparatus${scene.missing.length ? ` (${scene.missing.length} to go)` : ''}`, target: 'cupboard', why: task === 'MASS' ? 'A metre rule, the knife edge, the 100 g mass and thread for the loop.' : 'A metre rule, the knife edge, the 50 g mass, the unknown mass M and thread for the loops.', done: scene.ready },
    { id: 'bench', label: 'Go to your bench', target: 'mybench', why: 'Bench 2, at the front.', done: mode !== 'walk' || scene.placed.size > 0 },
    { id: 'place-edge', label: PLACE_LABEL.edge!, target: 'edge', why: 'The knife edge is the pivot: a sharp edge has little friction, so the balance point is definite.', done: scene.placed.has('edge'), group: 'Set up' },
    { id: 'place-rule', label: PLACE_LABEL.rule!, target: 'rule', why: 'Scale up, the marks towards you.', done: scene.placed.has('rule'), group: 'Set up' },
    { id: 'balance', label: 'Balance the rule alone: slide it over the edge until it stays level when you let go', target: 'rule', why: 'Its whole weight acts at the centre of gravity G: it balances when G is over the edge. A real rule is not exactly uniform, so G need not be at 50.0 cm. Judge it against the red pointers.', done: s.g !== null, group: 'G, the centre of gravity' },
    { id: 'g-note', label: 'Read the mark over the edge and write G in your notebook', target: 'book', why: 'To 0.1 cm, reading at eye level.', done: !!s.answers.g.value.trim(), group: 'G, the centre of gravity' },
  ];
  s.readings.forEach((r, k) => {
    const group = `Reading ${k + 1}`;
    steps.push(
      { id: `hang-${k}`, label: task === 'MASS' ? `The 100 g at ${r.known?.toFixed(1)} cm, balanced` : `The 50 g at ${r.known?.toFixed(1)} cm, M balanced`, target: 'known', why: 'Done.', done: true, group },
      { id: `row-${k}`, label: 'Fill in the row', target: 'book', why: task === 'MASS' ? 'x and P to 0.1 cm; d₁ = P − x, d₂ = G − P; M = 100 d₁/d₂.' : 'Both marks to 0.1 cm; d₁ = G − x₁, d₂ = x₂ − G; M = 50 d₁/d₂.', done: rowDone(s, k), group },
    );
  });
  const nx = nextX(s);
  if (s.readings.length < 5 || nx !== null) {
    const x = nx ?? Math.max(...s.readings.map((r) => r.known ?? 0), 0) + 5;
    const group = `Reading ${s.readings.length + 1}`;
    if (task === 'MOMENTS') {
      steps.push(
        { id: 'at-g', label: `Keep the knife edge at G${s.g !== null ? ` (${s.g.toFixed(1)} cm)` : ''}`, target: 'rule', why: 'With the pivot at G the rule’s own weight has no moment: only the two masses’ moments count.', done: s.g !== null && Math.abs(s.pivot - s.g) <= 0.05, group },
        { id: 'next-known', label: `Hang the ${known} at the ${x.toFixed(1)} cm mark`, target: s.known === null ? 'm50' : 'known', why: 'Slide its thread loop until the loop’s centre line is on the mark.', done: s.known !== null && Math.abs(s.known - x) < 0.05, group },
        { id: 'next-other', label: 'Hang M on the other side of G', target: s.other === null ? 'unknown' : 'other', why: 'Its moment turns the rule the other way.', done: s.other !== null, group },
        { id: 'next-bal', label: 'Slide M until the rule stays level when you let go', target: 'other', why: 'Too far out and its end drops; too near and the 50 g side drops. Move it in small steps, steadying the rule each time.', done: false, group },
        { id: 'next-take', label: 'Read both loops at eye level, then take the reading', target: 'rule', why: 'Read each loop’s centre line against the scale to 0.1 cm.', done: false, group },
      );
    } else {
      steps.push(
        { id: 'next-known', label: `Hang the 100 g mass at the ${x.toFixed(1)} cm mark`, target: s.known === null ? 'm100' : 'known', why: 'Slide its thread loop until the loop’s centre line is on the mark.', done: s.known !== null && Math.abs(s.known - x) < 0.05, group },
        { id: 'next-bal', label: 'Slide the rule over the knife edge until it stays level when you let go', target: 'rule', why: 'The balance point P moves towards the mass. Take moments about P: 100 × (P − x) = M × (G − P).', done: false, group },
        { id: 'next-take', label: 'Read P (over the edge) and the loop at eye level, then take the reading', target: 'edge', why: 'To 0.1 cm, eye straight in front of each mark.', done: false, group },
      );
    }
  }
  steps.push(
    { id: 'graph', label: 'Plot d₁ against d₂ and draw your best line', target: 'book', why: `${task === 'MASS' ? '100 d₁ = M d₂' : '50 d₁ = M d₂'}: a straight line through the origin.`, done: !!s.line },
    { id: 'slope', label: 'Find the slope and M = m × slope', target: 'book', why: 'Slope = d₁/d₂ = M/m, from two points far apart on your line.', done: !!s.answers.slope.value.trim() && !!s.answers.mass.value.trim() },
    { id: 'mean', label: 'Average M from your rows', target: 'book', why: 'The mean of M = m d₁/d₂ for each row: a check on the graph.', done: !!s.answers.mean.value.trim() },
    { id: 'written', label: 'Write two precautions', target: 'book', why: 'E.g. the rule balanced horizontally before each reading; thin vertical thread loops; distances measured from the pivot; no draughts.', done: !!s.written.precautions.trim() },
    { id: 'handin', label: 'Hand in your lab', target: null, why: 'Open the menu and choose Hand in when everything is recorded.', done: false },
  );
  return steps;
}

/** A gentle correction for a step just recorded (null: nothing wrong). */
export function correctionFor(a: string, s: PhyMomentsState, v: PhyMomentsVariant): Correction | null {
  const [verb, arg] = a.split(':') as [string, string | undefined];
  const task = s.task ?? 'MOMENTS';
  if (verb === 'collect' && arg && !NEEDED[task].includes(arg as ApparatusId) && APPARATUS_LABEL[arg as ApparatusId])
    return { title: `The ${APPARATUS_LABEL[arg as ApparatusId].toLowerCase()} is not needed here.`, why: `This practical needs ${task === 'MASS' ? 'the metre rule, the knife edge, the 100 g mass and thread' : 'the metre rule, the knife edge, the 50 g mass, the unknown mass M and thread'}. You can put it back from your bench or the cupboard list.` };
  if (verb === 'g' && arg) {
    if (!momentsBalanced(v, task, { pivot: Number(arg), known: null, other: null }))
      return { title: 'The rule was not balanced there.', why: 'Let go of the rule and watch its ends against the red pointers: it tipped. Slide it a millimetre at a time towards the end that rose, let go again, and record G only when it stays level.', focus: 'rule' };
  }
  if (verb === 'hang' && s.g === null) return { title: 'Find G first.', why: 'Balance the rule alone and record G before you hang a mass: the rule’s weight acts at G, and you need it for every moment.', focus: 'rule' };
  if (verb === 'reading') {
    const r = s.readings[s.readings.length - 1];
    if (!r) return null;
    if (s.g === null) return { title: 'Find G first.', why: 'Balance the rule alone and record its balance point before you take readings.' };
    if (task === 'MOMENTS' && Math.abs(r.pivot - s.g) > 0.05) return { title: 'The knife edge was not at G.', why: `Put the edge back under ${s.g.toFixed(1)} cm: away from G the rule’s own weight adds a moment you are not counting. Delete this reading (×) and take it again.`, focus: 'rule' };
    if (!momentsBalanced(v, task, r)) return { title: 'The rule was not balanced.', why: `It tipped when you let go. ${task === 'MASS' ? 'Slide the rule over the edge' : 'Slide M'} a little towards the end that rose, steady it, let go, and read only when it stays level. Delete this reading (×) and take it again.`, focus: 'rule' };
    if (s.readings.slice(0, -1).some((x) => x.known !== null && r.known !== null && Math.abs(x.known - r.known) < 0.5)) return { title: `You have already used the ${r.known?.toFixed(1)} cm mark.`, why: 'Each reading should use a different position, spread out as on the task card, so the graph has well-spaced points.' };
  }
  return null;
}
