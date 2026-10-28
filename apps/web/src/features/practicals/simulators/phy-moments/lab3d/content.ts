import { emptyPhyMomentsState, MOMENTS_CARD_X, type MomentsTask, type PhyMomentsState, type PhyMomentsVariant } from '@aischool/shared';
import type { AskSuggestions } from '../../../lab3d-kit/ask';
import { makeExplainer, type Explainer } from '../../../lab3d-kit/explain';
import type { LearnConfig } from '../../../lab3d-kit/learn';
import type { Spot } from '../../../lab3d-kit/store';
import { balanceFor, gAt } from './demo';
import { NEEDED } from './scene-state';
import { EDGE_TOP, markX, RULE_Z, SPOT } from './views';

/** The knife edge's "What is this?" cards, Learn stage and Ask suggestions. */

const E: Record<string, Explainer> = {
  rule: {
    name: 'Metre rule',
    purpose: 'The beam of the balance: it pivots on the knife edge, and its scale gives every position.',
    how: 'Lay it scale up on the edge. Read marks at eye level, to 0.1 cm; distances are from the pivot.',
    mistake: 'Measuring distances from the zero end instead of from the pivot; assuming G is at 50.0 cm.',
    keys: ['horizontal', 'balanced', 'parallax', 'eye', 'pivot', 'uniform'],
  },
  edge: {
    name: 'Knife edge',
    purpose: 'The pivot: a sharp edge has little friction, so the rule balances at a definite point.',
    how: 'Stand it firmly on the bench, edge across the rule. The mark directly over it is the pivot.',
    mistake: 'A blunt or rough edge: friction lets the rule rest over a range of positions.',
    keys: ['friction', 'knife', 'pivot'],
  },
  known: { name: 'The known mass', purpose: 'A known weight whose moment you can calculate.', how: 'Hang it from a thin thread loop; read the loop’s centre line.', mistake: 'A thick or slanting loop: the distance is then uncertain.', keys: ['thread', 'loop', 'mass', 'low'] },
  m50: { name: '50 g slotted mass', purpose: 'The known mass m for the principle of moments.', how: 'Hang it from a thin thread loop on one side of G.', mistake: 'Leaving it hanging high above the bench.', keys: ['mass', 'low'] },
  m100: { name: '100 g slotted mass', purpose: 'The known mass for finding the mass of the rule.', how: 'Hang it near one end; then move the rule over the edge to balance.', mistake: 'Hanging it so the loop slants.', keys: ['mass', 'low'] },
  unknown: { name: 'Unknown mass M', purpose: 'The mass you find from the moments.', how: 'Hang it on the other side of G from the 50 g and slide it until the rule balances.', mistake: 'Putting it on the same side as the 50 g.', keys: ['unknown', 'mass'] },
  other: { name: 'Unknown mass M', purpose: 'Its moment balances the 50 g’s moment.', how: 'Slide its loop in small steps; let go each time and watch the rule.', mistake: 'Reading while the rule is still tipping.', keys: ['balanced', 'horizontal'] },
  thread: { name: 'Thread', purpose: 'Thin loops to hang the masses: the line where the weight acts.', how: 'Keep loops thin and vertical.', mistake: 'Thick loops make the distance uncertain.', keys: ['thread', 'loop', 'vertical'] },
  pointer: { name: 'Reference pointer', purpose: 'Marks where the end of the rule is when it is level.', how: 'Let go of the rule: balanced, its end stays level with the red tip.', mistake: 'Judging “level” by eye from above instead of side-on.', keys: ['horizontal', 'level'] },
  'pointer-r': { name: 'Reference pointer', purpose: 'Marks where the end of the rule is when it is level.', how: 'Let go of the rule: balanced, its end stays level with the red tip.', mistake: 'Judging “level” by eye from above instead of side-on.', keys: ['horizontal', 'level'] },
  book: { name: 'Practical notebook', purpose: 'Your table, the graph of d₁ against d₂, the slope and M — this is what is marked.', how: 'Marks and distances to 0.1 cm; M in g.', mistake: 'Distances from the zero end.', keys: ['graph', 'slope'] },
  card: { name: 'Task card', purpose: 'The question paper: the marks to use and what to plot.', how: 'Read it before you start.', mistake: 'Skipping G.', keys: [] },
  spring: { name: 'Spiral spring', purpose: 'For Hooke’s law, not this practical.', how: 'Not needed here.', mistake: 'Cluttering the bench.', keys: [] },
  bob: { name: 'Pendulum bob', purpose: 'For the simple pendulum, not this practical.', how: 'Not needed here.', mistake: 'Cluttering the bench.', keys: [] },
  coat: { name: 'Lab coat', purpose: 'Keeps your clothes clean in the lab.', how: 'Optional in this practical.', mistake: '—', keys: [] },
  goggles: { name: 'Safety goggles', purpose: 'Eye protection for chemical work.', how: 'Not needed here.', mistake: '—', keys: [] },
  co2: { name: 'CO₂ fire extinguisher', purpose: 'For electrical fires: it does not conduct.', how: 'Pull the pin, aim at the base, squeeze. Tell the teacher first.', mistake: 'Using water on electrical equipment.', keys: [] },
  blanket: { name: 'Fire blanket', purpose: 'Smothers a small fire or burning clothing.', how: 'Pull both tapes down sharply and lay it over the fire.', mistake: 'Throwing it.', keys: [] },
  extinguisher: { name: 'Fire extinguisher', purpose: 'Puts out small fires.', how: 'Tell the teacher; pull the pin, aim at the base, squeeze, sweep.', mistake: 'Not knowing where it is.', keys: [] },
  firstaid: { name: 'First-aid box', purpose: 'Plasters, dressings and cold packs.', how: 'Tell the teacher about every injury.', mistake: 'Hiding an injury.', keys: [] },
  eyewash: { name: 'Eye-wash station', purpose: 'Rinses dust out of the eyes.', how: 'Rinse for 10 minutes and tell the teacher.', mistake: 'Rubbing the eye.', keys: [] },
  notice: { name: 'Notice board', purpose: 'Department notices: timetable, rules, WAEC tips.', how: 'Read it before the practical.', mistake: '—', keys: [] },
  shelf: { name: 'Physics equipment shelf', purpose: 'Meters, power packs, springs and masses for other practicals.', how: 'Take only what the teacher gives out.', mistake: '—', keys: [] },
  vdg: { name: 'Van de Graaff generator', purpose: 'Makes high-voltage static electricity for demonstrations.', how: 'Teacher only.', mistake: 'Touching the dome.', keys: [] },
  whiteboard: { name: 'Whiteboard', purpose: 'Today’s practical and the marks to use.', how: 'Read it as you come in.', mistake: '—', keys: [] },
  'poster-si': { name: 'Poster: SI base units', purpose: 'The seven base units.', how: 'Here distances are in cm and masses in g.', mistake: '—', keys: [] },
  'poster-light': { name: 'Poster: refraction of light', purpose: 'How light bends at a surface.', how: 'For the optics practicals.', mistake: '—', keys: [] },
  'poster-electric': { name: 'Poster: electrical safety', purpose: 'Rules for circuits and supplies.', how: 'Nothing electrical here.', mistake: '—', keys: [] },
  desk: { name: 'Teacher’s desk', purpose: 'Where the teacher checks your work.', how: '—', mistake: '—', keys: [] },
};
export const explainer = makeExplainer(E);

export const ASK_SUGGESTIONS: AskSuggestions = {
  LEARN: ['What is the centre of gravity?', 'Why is G not exactly at 50 cm?', 'What is the principle of moments?', 'Why use a knife edge?'],
  DEMO: ['How do I know the rule is balanced?', 'Why must the pivot stay at G?', 'Why is the graph a straight line through the origin?', 'Why does friction give a range of balance points?'],
  TRY: ['Where do I measure the distances from?', 'Which way should I move the mass?', 'How do I find the slope?', 'Why does my rule keep tipping?'],
  SANDBOX: ['What happens if the pivot is not at G?', 'How does a heavier rule change the balance point?', 'Where does a heavier unknown mass balance?', 'What is a couple?'],
};

/** The balance as Mr Bayo sets it out for the introduction, balanced, on his own rule `v` (display only, never saved). */
export function learnState(task: MomentsTask, v: PhyMomentsVariant): PhyMomentsState {
  const x = MOMENTS_CARD_X[task][1]!;
  const g = gAt(v);
  return {
    ...emptyPhyMomentsState(),
    task,
    pivot: task === 'MASS' ? balanceFor(v, task, g, x) : g,
    known: x,
    other: task === 'MOMENTS' ? balanceFor(v, task, g, x) : null,
    log: [{ t: 0, a: `task:${task}` }, ...NEEDED[task].map((id) => ({ t: 0, a: `collect:${id}` })), { t: 0, a: 'place:edge' }, { t: 0, a: 'place:rule' }],
  };
}

/** Learn's camera spots, aimed at where `shown` (the Learn bench) has the masses. */
export function learnConfig(shown: PhyMomentsState): LearnConfig {
  const x1 = markX(shown.known ?? 30, shown.pivot);
  const x2 = markX(shown.other ?? 75, shown.pivot);
  const S: Record<string, Spot> = {
    rule: { target: [0, EDGE_TOP, RULE_Z], dist: 1.1, pitch: 0.2 },
    edge: { target: [0, EDGE_TOP - 0.03, RULE_Z], dist: 0.38, pitch: 0.15, yaw: 0.35 },
    known: { target: [x1, EDGE_TOP - 0.04, RULE_Z], dist: 0.4, pitch: 0.12, yaw: -0.3 },
    other: { target: [x2, EDGE_TOP - 0.04, RULE_Z], dist: 0.4, pitch: 0.12, yaw: 0.3 },
    thread: { target: [x1, EDGE_TOP, RULE_Z], dist: 0.3, pitch: 0.2 },
    bench: { target: [0, 0.08, RULE_Z], dist: 1.2, pitch: 0.15 },
  };
  const MATCH: [RegExp, string, Spot][] = [
    [/knife edge|prism/i, 'edge', S.edge!],
    [/unknown/i, 'other', S.other!],
    [/known mass|\d+ ?g mass/i, 'known', S.known!],
    [/thread/i, 'thread', S.thread!],
    [/metre rule/i, 'rule', S.rule!],
  ];
  return {
    items: MATCH.map(([match, item, spot]) => ({ match, id: item, spot })),
    explain: explainer,
    procedure: [
      { spot: S.bench!, point: 'rule' },
      { spot: S.edge!, point: 'edge' },
    ],
    observe: { spot: S.bench!, point: 'rule' },
    observeTitle: 'What you will see',
  };
}

export const CARD_SPOT: Spot = { target: [SPOT.card[0], 0.01, SPOT.card[2]], dist: 0.35, pitch: 1.0 };
