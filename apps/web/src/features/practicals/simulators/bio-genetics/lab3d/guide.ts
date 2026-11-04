import { CROSS_N, DISC_TRIES, FOOD_LEVELS, FOOD_MIN_CHAINS, FOOD_SPOTS, FOOD_SPOT_LABEL, type BioGeneticsState, type BioGeneticsVariant } from '@aischool/shared';
import type { Correction, GuideStep } from '../../../lab3d-kit/guide';
import type { CameraMode } from '../../../lab3d-kit/store';
import { neededFor, WORK, type GenScene } from './scene-state';

/**
 * Guided mode (practice only): the WAEC routine as a checklist, without
 * giving away the readings. Corrections teach the habits that matter: shoes
 * off and a set square; respect for anyone who declines; several attempts and
 * anonymous records; draw blind and return the beads; gloves and arrows from
 * the eaten to the eater.
 */

export function genGuideSteps(v: BioGeneticsVariant, s: BioGeneticsState, scene: GenScene, mode: CameraMode): GuideStep[] {
  const task = s.task ?? 'HEIGHT';
  const missing = neededFor(task).filter((a) => !scene.collected.has(a.id));
  const begun = s.log.some((e) => WORK.test(e.a));
  const steps: GuideStep[] = [
    { id: 'safety', label: 'Put on your lab coat', target: !scene.coat ? 'coat' : null, why: 'Lab coats are worn for every practical.', done: scene.coat },
    { id: 'collect', label: `Collect your apparatus${missing.length ? ` (${missing.length} to go)` : ''}`, target: 'cupboard', why: neededFor(task).map((a) => a.label).join(', ') + '.', done: !missing.length },
    { id: 'bench', label: 'Go to your bench', target: 'mybench', why: 'Bench 2, at the front.', done: mode !== 'walk' || begun },
  ];
  const tail = (): GuideStep[] => [
    { id: 'written', label: 'Write two precautions and your explanation', target: 'book', why: 'Precautions are things you did to make the results reliable or safe.', done: !!s.written.precautions.trim() && !!s.written.explain.trim() },
    { id: 'wash', label: 'Wash your hands', target: 'handwash', why: 'Before you leave the laboratory.', done: scene.washedAtEnd },
    { id: 'handin', label: 'Hand in your lab', target: null, why: 'Open the menu and choose Hand in when everything is recorded.', done: false },
  ];

  if (task === 'HEIGHT') {
    const w = s.height;
    const willing = v.height.people.filter((p) => !p.declines).length;
    const hs = new Set(w.measures.filter((m) => m.kind === 'H').map((m) => m.who)).size;
    const ss = new Set(w.measures.filter((m) => m.kind === 'S').map((m) => m.who)).size;
    const filled = w.rows.filter((r) => r.h.trim()).length;
    steps.push(
      { id: 'ready', label: 'Shoes off; set square on the head; fingers spread for the span', target: 'classmate', why: 'Everyone measured the same way: shoes add 2–3 cm, guessing the top of the head 1–2 cm.', done: w.shoesOff && w.square && w.spread, group: 'Measuring' },
      { id: 'heights', label: `Measure everyone who agrees (${hs} heights, ${ss} spans of ${willing})`, target: 'classmate', why: '“Call the next classmate” after each. If someone declines, thank them and move on.', done: hs >= willing && ss >= willing, group: 'Measuring' },
      { id: 'record', label: `Write every reading in the record sheet (${filled})`, target: 'book', why: 'Heights to 1 cm, spans to 0.5 cm, by number.', done: filled >= willing, group: 'Results' },
      { id: 'table', label: 'Equal classes; frequency of each; total', target: 'book', why: '150–154, 155–159 … cm.', done: !!w.scheme && w.freq.some((f) => f.trim()) && !!w.total.trim(), group: 'Results' },
      { id: 'chart', label: 'Histogram; mean, modal class, range; hand-span mean and range', target: 'book', why: 'A histogram has no gaps: height is continuous.', done: !!w.chart && !!w.mean.trim() && w.modal !== null && !!w.range.trim() && !!w.spanMean.trim() && w.claims.length > 0, group: 'Results' },
      ...tail(),
    );
    return steps;
  }
  if (task === 'DISCRETE') {
    const w = s.disc;
    const asked = w.tries.filter((t) => t > 0).length;
    const cards = w.cards.filter(Boolean).length;
    steps.push(
      { id: 'anon', label: 'Record anonymously, by number', target: 'sheet', why: 'Blood groups are private health information.', done: w.recordBy === 'NUMBER', group: 'Survey' },
      { id: 'roll', label: `Ask each classmate to roll the tongue (${asked} of ${v.disc.n})`, target: 'classmate', why: `If they cannot, let them try again — up to ${DISC_TRIES} attempts.`, done: asked >= v.disc.n, group: 'Survey' },
      { id: 'cards', label: `Read each health card (${cards} of ${v.disc.n})`, target: 'cards', why: 'No blood is taken in class.', done: cards >= v.disc.n, group: 'Survey' },
      { id: 'sheet', label: 'Fill in R/N and the blood group for everyone', target: 'book', why: 'As you saw it, by number.', done: w.rows.filter((r) => r.roll && r.group).length >= v.disc.n, group: 'Results' },
      { id: 'charts', label: 'Tallies, %, angles; pie chart and bar chart; conclusions', target: 'book', why: 'Angle = n ÷ total × 360°; bars with gaps for categories.', done: !!w.tot.ar.trim() && !!w.gpct.O.trim() && !!w.chartT && !!w.chartB && w.claims.length > 0, group: 'Results' },
      ...tail(),
    );
    return steps;
  }
  if (task === 'CROSS') {
    const w = s.cross;
    steps.push(
      { id: 'fill', label: '50 red and 50 white beads in each beaker', target: 'beads', why: 'Each beaker is a Tt parent: half its gametes carry T.', done: !!w.fill, group: 'Set up' },
      { id: 'how', label: 'Without looking; return and shake each time', target: 'beakerA', why: 'Keeps P(T) = P(t) = ½ for every draw.', done: w.blind && w.back, group: 'Set up' },
      { id: 'draw', label: `Draw a pair at a time (${w.draws.length} of ${CROSS_N})`, target: 'beakerA', why: 'One bead from each beaker = one offspring.', done: w.draws.length >= CROSS_N, group: 'Draws' },
      { id: 'tally', label: 'Count TT, Tt and tt in each batch of ten', target: 'book', why: 'From the tally sheet.', done: w.rows.length > 0 && w.rows.every((r) => r.TT.trim() && r.Tt.trim() && r.tt.trim()), group: 'Results' },
      { id: 'ratio', label: 'Totals, ratio, expected, class results; conclusions', target: 'book', why: 'Dominant ÷ recessive as x : 1.', done: !!w.ratio.trim() && !!w.expDom.trim() && !!w.clsRatio.trim() && !!w.closer && w.claims.length > 0, group: 'Results' },
      ...tail(),
    );
    return steps;
  }
  const w = s.food;
  const next = FOOD_SPOTS.find((x) => !w.visited.includes(x));
  steps.push(
    { id: 'gloves', label: 'Covered shoes and gloves on', target: 'gloves', why: 'Before collecting: stinging insects and thorns.', done: w.gloves, group: 'Field work' },
    { id: 'spots', label: `Survey every spot (${w.visited.length} of ${FOOD_SPOTS.length}${next ? `; next: ${FOOD_SPOT_LABEL[next].toLowerCase()}` : ''})`, target: next ? `spot:${next}` : 'notes', why: 'Count the organisms; note who eats what.', done: w.visited.length >= FOOD_SPOTS.length, group: 'Field work' },
    { id: 'counts', label: 'Record the count of each organism', target: 'book', why: 'From your field spots.', done: Object.values(w.counts).filter((c) => c.trim()).length >= 9, group: 'Results' },
    { id: 'chains', label: `At least ${FOOD_MIN_CHAINS} food chains and the food web`, target: 'book', why: 'Start with the grass; arrows from the eaten to the eater.', done: w.chains.length >= FOOD_MIN_CHAINS && w.links.length > 0 && !!w.arrow, group: 'Results' },
    { id: 'pyr', label: 'Trophic levels; both pyramids to scale; efficiency; conclusions', target: 'book', why: 'Bar width = value ÷ scale.', done: Object.values(w.levels).filter(Boolean).length >= 9 && FOOD_LEVELS.every((L) => w.widthN[L].trim() && w.widthE[L].trim()) && !!w.eff.trim() && w.claims.length > 0, group: 'Results' },
    ...tail(),
  );
  return steps;
}

/** A gentle correction for a step just recorded in the log (null: nothing wrong). */
export function genCorrection(a: string, s: BioGeneticsState, v: BioGeneticsVariant): Correction | null {
  const [verb, arg, who] = a.split(':') as [string, string | undefined, string | undefined];
  if (verb === 'measure' && arg === 'H' && !s.height.shoesOff) return { title: 'Shoes off first.', why: 'Shoes add 2–3 cm, and different shoes add different amounts: measure everyone without shoes.', focus: 'board' };
  if (verb === 'measure' && arg === 'H' && !s.height.square) return { title: 'Use the set square.', why: 'Guessing where the top of the head meets the board is out by 1–2 cm. Rest a set square flat on the head and read at eye level.', focus: 'board' };
  if (verb === 'measure' && arg === 'S' && !s.height.spread) return { title: 'Fingers spread fully.', why: 'The hand span is from the tip of the thumb to the tip of the little finger with the hand stretched wide.', focus: 'hand' };
  if (verb === 'declined') return { title: 'That is their choice.', why: 'Thank them, leave them out of the sample and call the next classmate. Never press anyone to be measured.', focus: 'board' };
  void who;
  if (verb === 'record' && arg === 'NAME') return { title: 'Record anonymously.', why: 'Blood groups are private health information: record by number, not by name.', focus: 'partner' };
  if (verb === 'call' && s.task === 'DISCRETE') {
    const prev = Number(arg) - 1;
    const t = s.disc.tries[prev] ?? 0;
    if (prev >= 0 && t > 0 && t < DISC_TRIES && !(v.disc.people[prev]!.roller && v.disc.people[prev]!.needs <= t)) return { title: 'Allow several attempts.', why: `Classmate ${prev + 1} tried only ${t === 1 ? 'once' : 'twice'}. Some people manage it at the second or third attempt — let them try ${DISC_TRIES} times before recording N.`, focus: 'partner' };
  }
  if (verb === 'fill' && arg !== 'EQUAL') return { title: 'Each beaker is a Tt parent.', why: 'Put 50 red (T) and 50 white (t) beads in each beaker, so half of each parent’s gametes carry T.', focus: 'beakers' };
  if (verb === 'blind' && arg === 'off') return { title: 'Draw without looking.', why: 'If you can see, you may choose one colour more often without meaning to.', focus: 'beakers' };
  if (verb === 'back' && arg === 'off') return { title: 'Return the beads.', why: 'Keeping beads out changes the proportion left in the beaker, and so the probability of the next draw.', focus: 'beakers' };
  if (verb === 'survey' && !s.food.gloves) return { title: 'Gloves and covered shoes.', why: 'Wear them before collecting: stinging insects and thorns live in the grass.', focus: 'field' };
  if (verb === 'arrow' && arg === 'EATER_EATEN') return { title: 'Arrows point to the eater.', why: 'The arrow shows energy flowing from the food to the feeder: grass → grasshopper.', focus: 'bench' };
  if (verb === 'collect' && arg && !neededFor(s.task ?? 'HEIGHT').some((x) => x.id === arg)) return { title: 'That is not needed for this practical.', why: 'Only take what the practical needs; you can put it back from your bench or from the cupboard list.' };
  return null;
}
