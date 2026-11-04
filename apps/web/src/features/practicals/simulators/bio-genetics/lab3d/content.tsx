import { emptyBioGeneticsState, type BioGeneticsState, type GenTask } from '@aischool/shared';
import { Dna, Footprints, Ruler as RulerIcon, Shirt, ShieldCheck } from 'lucide-react';
import type { AskSuggestions } from '../../../lab3d-kit/ask';
import { makeExplainer, type Explainer } from '../../../lab3d-kit/explain';
import type { LearnConfig } from '../../../lab3d-kit/learn';
import type { SafetyContent } from '../../../lab3d-kit/safety';
import { BIO_ROOM_EXPLAIN, bioTour } from '../../bio-common/lab3d/common';
import { FOCUS_OF, GSPOT, SEAT, spotOf } from './bench';
import { neededFor } from './scene-state';

/** The genetics lab's texts: "What is this?" cards, safety briefing, Learn, tour and Ask suggestions. */

const E: Record<string, Explainer> = {
  ...BIO_ROOM_EXPLAIN,
  classmate: { name: 'A classmate', purpose: 'Each classmate is one member of the sample: you measure or survey every one.', how: 'Explain what you will do and ask politely; anyone may decline. Record by number, not by name.', mistake: 'Measuring or recording someone who would rather not take part.', keys: ['respect', 'decline', 'anonym', 'privacy', 'consent'] },
  board: { name: 'Height board', purpose: 'A metre rule fixed upright on a stand, read in cm.', how: 'Shoes off, heels and back against it; a set square flat on the head; read at eye level.', mistake: 'Shoes on, or guessing where the top of the head is.', keys: ['height', 'shoes', 'metre rule', 'eye level', 'posture'] },
  setsquare: { name: 'Set square', purpose: 'Makes a right angle between the board and the top of the head, so the reading is exact.', how: 'One edge flat against the board, the other flat on the head.', mistake: 'Tilting it, or not using one.', keys: ['set square', 'flat'] },
  ruler: { name: 'Ruler', purpose: 'Measures the hand span to the nearest 0.5 cm.', how: 'From the tip of the thumb to the tip of the little finger, fingers spread fully.', mistake: 'Fingers not fully spread.', keys: ['hand span', 'ruler'] },
  graph: { name: 'Graph paper', purpose: 'For the histogram, bar chart or pyramids.', how: 'Label the axes with units; give a title and a scale.', mistake: 'Gaps between histogram bars; no scale.', keys: ['graph', 'histogram', 'scale', 'axes'] },
  mirror: { name: 'Hand mirror', purpose: 'Lets a classmate see whether the tongue rolls into a U.', how: 'Hold it in front of the mouth.', mistake: 'Recording a non-roller after one try.', keys: ['mirror', 'tongue', 'attempts'] },
  cards: { name: 'School health cards', purpose: 'The ABO blood groups recorded by the school clinic.', how: 'Read with consent and record by number only.', mistake: 'Taking blood samples in class, or recording names.', keys: ['blood', 'record', 'health', 'consent'] },
  sheet: { name: 'Survey / tally sheet', purpose: 'Where each result is written as it is seen.', how: 'One line per person (or per batch of ten draws).', mistake: 'Writing results from memory later.', keys: ['tally', 'record'] },
  protractor: { name: 'Protractor', purpose: 'Draws the pie-chart angles.', how: 'Angle = number ÷ total × 360°.', mistake: 'Angles that do not add up to 360°.', keys: ['pie', '360'] },
  beakerA: { name: 'Beaker A (parent 1)', purpose: 'The gametes of one Tt parent: half carry T (red), half t (white).', how: 'Pick one bead without looking; return it and shake.', mistake: 'Not returning the bead, which changes the probability.', keys: ['beaker', 'bead', 'return', 'without looking'] },
  beakerB: { name: 'Beaker B (parent 2)', purpose: 'The gametes of the other Tt parent.', how: 'One bead from each beaker = one offspring.', mistake: 'Taking both beads from one beaker.', keys: ['beaker', 'bead', 'shake'] },
  beads: { name: 'Red and white beads', purpose: 'Red = dominant allele T (tall); white = recessive allele t (short). All the same size.', how: '50 of each colour in each beaker.', mistake: 'Beads of different sizes (you could tell them apart by touch).', keys: ['bead', 'same size', 'equal'] },
  tray: { name: 'Tray', purpose: 'Holds the pair just drawn while you record it.', how: 'Record the genotype, then return the beads.', mistake: 'Losing beads on the floor.', keys: ['floor', 'slip'] },
  notes: { name: 'Field notes', purpose: 'What was counted at each spot of the school field and who was seen eating what.', how: 'Survey every spot; record the counts and the feeding.', mistake: 'Assuming feeding relationships instead of observing them.', keys: ['observ', 'field', 'record'] },
  spot: { name: 'A field spot', purpose: 'One part of the habitat with its own organisms.', how: 'Count the organisms and note what each was feeding on.', mistake: 'Skipping spots and missing organisms.', keys: ['sampl', 'habitat'] },
  net: { name: 'Sweep net', purpose: 'Swept through the grass to catch insects for counting.', how: 'Sweep in a figure of eight; empty into a tray; release after counting.', mistake: 'Leaving the insects to die.', keys: ['sweep', 'net', 'collect'] },
  pooter: { name: 'Pooter', purpose: 'Sucks small insects into a jar without harming them.', how: 'Suck through the tube with the gauze.', mistake: 'Using the wrong tube.', keys: ['pooter'] },
  lens: { name: 'Hand lens', purpose: 'Magnifies small organisms to identify them.', how: 'Hold it near the eye and bring the specimen closer.', mistake: 'Holding it far from the eye.', keys: ['lens', 'identif'] },
  gloves: { name: 'Gloves', purpose: 'Protect your hands from stinging insects, thorns and soil.', how: 'Put them on (and covered shoes) before collecting.', mistake: 'Collecting with bare hands or in sandals.', keys: ['gloves', 'shoes', 'sting'] },
  idchart: { name: 'Identification chart', purpose: 'Names the organisms you find.', how: 'Match what you see to the drawings.', mistake: 'Guessing names.', keys: ['identif', 'chart'] },
  card: { name: 'Task card', purpose: 'The question paper.', how: 'Read it first and again before you hand in.', mistake: 'Missing a part of the question.', keys: [] },
  book: { name: 'Practical notebook', purpose: 'Your tables, charts and answers — this is what is marked.', how: 'Record every reading as you take it.', mistake: 'Writing readings on scrap paper.', keys: ['record', 'table'] },
  tape: { name: 'Measuring tape', purpose: 'A flexible scale (for girths and long lengths).', how: 'Not needed for heights on the board.', mistake: 'Letting it sag.', keys: [] },
};
export const genExplainer = makeExplainer(E, { 'spot:': 'spot' });

// ------------------------------------------------------------------ Learn

/** The bench as Mrs Okon sets it out for Learn (display only, never saved). */
export function learnState(task: GenTask): BioGeneticsState {
  const s = emptyBioGeneticsState();
  s.task = task;
  s.log = [{ t: 0, a: 'safety:coat' }, ...neededFor(task).map((a) => ({ t: 0, a: `collect:${a.id}` }))];
  if (task === 'HEIGHT') Object.assign(s.height, { shoesOff: true, square: true, spread: true });
  if (task === 'CROSS') Object.assign(s.cross, { fill: 'EQUAL', blind: true, back: true });
  if (task === 'FOOD') Object.assign(s.food, { gloves: true });
  return s;
}

export function learnConfig(task: GenTask): LearnConfig {
  const book = { match: /graph|sheet|record/i, id: 'book', spot: spotOf(GSPOT.book, 0.01, 0.5, 0.8) };
  const items: LearnConfig['items'] =
    task === 'HEIGHT'
      ? [
          { match: /metre rule|height chart/i, id: 'board', spot: { target: [GSPOT.board[0], 0.4, GSPOT.board[2]], dist: 2.2, pitch: 0.05 } },
          { match: /tape/i, id: 'ruler', spot: spotOf(GSPOT.ruler, 0.01, 0.45, 0.7) },
          { match: /^ruler/i, id: 'ruler', spot: spotOf(GSPOT.ruler, 0.01, 0.45, 0.7) },
          book,
        ]
      : task === 'DISCRETE'
        ? [
            { match: /mirror/i, id: 'mirror', spot: spotOf(GSPOT.mirror, 0.02, 0.45, 0.6) },
            { match: /protractor|pie/i, id: 'protractor', spot: spotOf(GSPOT.protractor, 0.01, 0.45, 0.7) },
            { match: /blood|health/i, id: 'cards', spot: spotOf(GSPOT.cards, 0.03, 0.45, 0.6) },
            book,
          ]
        : task === 'CROSS'
          ? [
              { match: /beaker|bag/i, id: 'beakerA', spot: { target: [0, 0.06, -0.05], dist: 0.6, pitch: 0.45 } },
              { match: /bead|coin/i, id: 'beakerB', spot: { target: [0, 0.05, -0.05], dist: 0.5, pitch: 0.5 } },
              { match: /tally/i, id: 'tray', spot: spotOf(GSPOT.tray, 0.01, 0.45, 0.7) },
            ]
          : [
              { match: /sweep|pooter/i, id: 'net', spot: spotOf(GSPOT.net, 0.1, 0.8, 0.3) },
              { match: /lens/i, id: 'lens', spot: spotOf(GSPOT.lens, 0.02, 0.4, 0.7) },
              { match: /field notes|data/i, id: 'notes', spot: { target: [-0.1, 0.02, -0.02], dist: 0.9, pitch: 0.95 } },
              { match: /identification/i, id: 'idchart', spot: spotOf(GSPOT.idchart, 0.1, 0.6, 0.25) },
              book,
            ];
  const board = { target: [GSPOT.board[0], 0.5, GSPOT.board[2]] as [number, number, number], dist: 2.0, pitch: 0.05 };
  const partner = { target: [SEAT[0], 0.3, SEAT[1] + 0.2] as [number, number, number], dist: 1.0, pitch: 0.15 };
  const beakers = { target: [0, 0.06, -0.05] as [number, number, number], dist: 0.6, pitch: 0.45 };
  const field = { target: [-0.1, 0.02, -0.02] as [number, number, number], dist: 0.9, pitch: 0.95 };
  return {
    items,
    explain: genExplainer,
    procedure:
      task === 'HEIGHT'
        ? [
            { spot: board, point: 'board' },
            { spot: spotOf(GSPOT.ruler, 0.02, 0.5, 0.7), point: 'ruler' },
          ]
        : task === 'DISCRETE'
          ? [
              { spot: partner, point: 'classmate' },
              { spot: spotOf(GSPOT.cards, 0.03, 0.5, 0.6), point: 'cards' },
            ]
          : task === 'CROSS'
            ? [
                { spot: beakers, point: 'beakerA' },
                { spot: spotOf(GSPOT.tray, 0.02, 0.5, 0.6), point: 'tray' },
              ]
            : [
                { spot: field, point: 'notes' },
                { spot: spotOf(GSPOT.net, 0.1, 0.8, 0.3), point: 'net' },
              ],
    observe: task === 'HEIGHT' ? { spot: board, point: 'board' } : task === 'DISCRETE' ? { spot: partner, point: 'classmate' } : task === 'CROSS' ? { spot: beakers, point: 'tray' } : { spot: field, point: 'notes' },
    observeTitle: task === 'HEIGHT' ? 'A bell-shaped histogram' : task === 'DISCRETE' ? 'Distinct groups, no in-betweens' : task === 'CROSS' ? 'About 3 tall : 1 short' : 'Fewer at each level up',
    ...(task === 'DISCRETE' ? { dataCard: { kicker: 'Data', title: 'A class of 40 (sample data)', speech: 'Twenty-six rollers out of forty is sixty-five percent, and twenty-six over forty times three hundred and sixty is two hundred and thirty-four degrees.' } } : {}),
  };
}

// ------------------------------------------------------------------ safety

export function genSafety(task: GenTask): SafetyContent {
  return {
    cards: [
      { icon: <Shirt className="size-6" />, title: 'Lab coat and good habits', lessonMatch: /coat|floor|slip/i, lines: ['Wear your lab coat, buttoned.', task === 'CROSS' ? 'Keep the beads in the beakers and on the tray: beads on the floor are a slipping hazard.' : 'Keep bags and stools out of the walkway.'] },
      task === 'HEIGHT'
        ? { icon: <RulerIcon className="size-6" />, title: 'Measuring classmates', lessonMatch: /respect|decline|shoes|floor/i, lines: ['Measure respectfully: anyone may decline to be measured, and that is fine.', 'Stand on a flat floor without shoes; record by number, never comment on anyone’s size.'] }
        : task === 'DISCRETE'
          ? { icon: <ShieldCheck className="size-6" />, title: 'Privacy and blood', lessonMatch: /blood|privacy|anonym|record/i, lines: ['Never take blood samples in a class practical: use the school health records, with permission.', 'Record anonymously, by number.'] }
          : task === 'CROSS'
            ? { icon: <Dna className="size-6" />, title: 'A fair model', lessonMatch: /bead|look|return/i, lines: ['All beads the same size, so they cannot be told apart by touch.', 'Draw without looking and return the beads every time.'] }
            : { icon: <Footprints className="size-6" />, title: 'In the field', lessonMatch: /glove|shoes|sting/i, lines: ['Wear covered shoes and gloves when collecting; avoid stinging insects and thorns.', 'Release the animals you catch; wash your hands afterwards.'] },
    ],
    questions: [
      task === 'HEIGHT'
        ? {
            q: 'A classmate says they would rather not be measured. What do you do?',
            options: [
              { label: 'Persuade them — the sample must be complete', aria: 'persuade', right: false, why: 'No: taking part is their choice. A sample with one fewer person is still a good sample.' },
              { label: 'Thank them, leave them out and call the next person', aria: 'respect', right: true, why: 'Right: measure respectfully — anyone may decline.' },
            ],
          }
        : task === 'DISCRETE'
          ? {
              q: 'How do you find each classmate’s blood group in this practical?',
              options: [
                { label: 'Prick a finger and test the blood with antisera', aria: 'prick', right: false, why: 'Never in a class practical: blood carries infection risks. Use the records.' },
                { label: 'From the school health records, with permission, recorded by number', aria: 'records', right: true, why: 'Right: existing records, with consent, kept anonymous.' },
              ],
            }
          : task === 'CROSS'
            ? {
                q: 'A bead rolls onto the floor. What do you do?',
                options: [
                  { label: 'Leave it — there are plenty', aria: 'leave', right: false, why: 'Someone could slip on it, and the beaker now has one bead too few.' },
                  { label: 'Pick it up at once and return it to its beaker', aria: 'pick', right: true, why: 'Right: keep the floor clear and the numbers equal.' },
                ],
              }
            : {
                q: 'What do you wear when you collect insects on the field?',
                options: [
                  { label: 'Sandals — it is hot', aria: 'sandals', right: false, why: 'Covered shoes protect you from stings, thorns and bites.' },
                  { label: 'Covered shoes and gloves', aria: 'covered', right: true, why: 'Right: and avoid stinging insects.' },
                ],
              },
      {
        q: 'You have finished. What do you do before you leave the lab?',
        options: [
          { label: 'Wash my hands and put the apparatus back', aria: 'wash', right: true, why: 'Right: hands washed, apparatus returned.' },
          { label: 'Leave everything on the bench for the next class', aria: 'leave', right: false, why: 'Clean up and return the apparatus.' },
        ],
      },
    ],
  };
}

export const genTour = (task: GenTask) =>
  bioTour({
    focusId: FOCUS_OF[task],
    focusLabel: task === 'HEIGHT' ? 'Height board' : task === 'DISCRETE' ? 'Classmate' : task === 'CROSS' ? 'Beakers' : 'Field notes',
    task: task === 'HEIGHT' ? 'The task card lists how to measure and what to calculate.' : task === 'DISCRETE' ? 'The task card lists the survey and the charts.' : task === 'CROSS' ? 'The task card lists the beads and the draws.' : 'The task card lists the chains, web and pyramids.',
  });

export const GEN_ASK: Record<GenTask, AskSuggestions> = {
  HEIGHT: {
    LEARN: ['Why take shoes off?', 'What is continuous variation?', 'Why use a set square?', 'Why equal class widths?'],
    DEMO: ['Why no gaps in a histogram?', 'How do I find the modal class?', 'How is the mean found from classes?', 'Why is it bell-shaped?'],
    TRY: ['How do I work out the mean?', 'What is the range?', 'What precautions can I write?', 'Is hand span continuous too?'],
    SANDBOX: ['What if everyone wears shoes?', 'What if I guess the top of the head?', 'Why does a younger class differ?', 'What if the classes are unequal?'],
  },
  DISCRETE: {
    LEARN: ['What is discontinuous variation?', 'Why not take blood samples?', 'Why allow several attempts?', 'Why record anonymously?'],
    DEMO: ['How is a pie-chart angle found?', 'Why a bar chart with gaps?', 'Why is group O common?', 'Can a non-roller learn it?'],
    TRY: ['How do I work out the percentage?', 'Do the angles add to 360°?', 'What precautions can I write?', 'Which genes control blood groups?'],
    SANDBOX: ['What if I allow only one attempt?', 'What if I record names?', 'Why might a small class differ?', 'What are the uses of blood groups?'],
  },
  CROSS: {
    LEARN: ['Why does each beaker stand for a parent?', 'Why return the beads?', 'What is a heterozygote?', 'Why draw without looking?'],
    DEMO: ['Why is it not exactly 3 : 1?', 'What is P(tt)?', 'Why are the genotypes 1 : 2 : 1?', 'Why combine class results?'],
    TRY: ['How do I write the ratio as x : 1?', 'What are the expected numbers?', 'What precautions can I write?', 'Which is closer to 3 : 1?'],
    SANDBOX: ['What if I look while picking?', 'What if I keep the beads out?', 'What does a test cross give?', 'What if one beaker is all red?'],
  },
  FOOD: {
    LEARN: ['Which way do the arrows point?', 'What is a trophic level?', 'What is a food web?', 'Why wear gloves?'],
    DEMO: ['Why is energy lost?', 'Can a pyramid be inverted?', 'Why use a scale?', 'Is man a secondary consumer?'],
    TRY: ['How do I find the efficiency?', 'How wide is each bar?', 'What precautions can I write?', 'Why are chains short?'],
    SANDBOX: ['What happens in the dry season?', 'What if the hawks disappear?', 'Why are there so many grasshoppers?', 'Why is the energy pyramid upright?'],
  },
};
