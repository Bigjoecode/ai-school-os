import { emptyBioHumanState, type BioHumanState, type HumanTask } from '@aischool/shared';
import { Activity, HeartPulse, Shirt, Wind } from 'lucide-react';
import type { AskSuggestions } from '../../../lab3d-kit/ask';
import { makeExplainer, type Explainer } from '../../../lab3d-kit/explain';
import type { LearnConfig } from '../../../lab3d-kit/learn';
import type { SafetyContent } from '../../../lab3d-kit/safety';
import { BIO_ROOM_EXPLAIN, bioTour } from '../../bio-common/lab3d/common';
import { HSPOT, SKIN_POINT, spotOf } from './bench';
import { neededFor } from './scene-state';

/** The human physiology lab's texts: "What is this?" cards, safety briefing, Learn, tour and Ask suggestions. */

const E: Record<string, Explainer> = {
  ...BIO_ROOM_EXPLAIN,
  partner: { name: 'Your partner', purpose: 'A classmate who is the subject: you take their pulse, watch them breathe, time their catch or test their skin.', how: 'Explain each step before you do it and be gentle; they can stop at any time.', mistake: 'Letting your partner see or anticipate what you will do.', keys: ['partner', 'subject'] },
  wrist: { name: 'Radial pulse', purpose: 'Each heartbeat sends a surge of blood along the radial artery, felt on the thumb side of the wrist.', how: 'Press lightly with two fingertips; count the beats for a timed 15 s and multiply by 4.', mistake: 'Using the thumb (it has its own pulse) or forgetting to multiply by 4.', keys: ['pulse', 'wrist', 'thumb', 'fingertip'] },
  step: { name: 'Step', purpose: 'Step-ups give everyone the same exercise.', how: 'Up, up, down, down at a steady rhythm for 2 minutes.', mistake: 'A different speed for different students.', keys: ['exercise', 'step', 'intensity', 'dry'] },
  clock: { name: 'Stopwatch', purpose: 'Times the counts (15 s for the pulse, 1 minute for breaths) and the minutes of recovery.', how: 'Start counting as you start the watch; stop exactly on time.', mistake: 'Counting for longer or shorter than you think.', keys: ['stopwatch', 'time', 'minute'] },
  apparatus: { name: 'Inhaled/exhaled air apparatus', purpose: 'Breathing in draws room air through tube A; breathing out bubbles exhaled air through tube B.', how: 'Breathe gently in and out through the mouthpiece about 10 times and compare the lime water.', mistake: 'Mixing up which tube receives the exhaled air.', keys: ['lime water', 'tube', 'mouthpiece', 'gently'] },
  limewater: { name: 'Lime water', purpose: 'Calcium hydroxide solution: carbon dioxide makes a white precipitate of calcium carbonate (milky).', how: 'Equal volumes in both tubes.', mistake: 'Unequal volumes: an unfair test.', keys: ['lime water', 'equal volume'] },
  mouthpiece: { name: 'Clean mouthpieces', purpose: 'Each student uses their own clean mouthpiece.', how: 'Take a fresh one from the sealed pack; disinfect it afterwards.', mistake: 'Sharing a mouthpiece.', keys: ['mouthpiece', 'disinfect'] },
  mirror: { name: 'Mirror', purpose: 'A cool, dry mirror mists over with the water vapour in breath.', how: 'Wipe it dry first, then breathe on it.', mistake: 'Moisture already on it before breathing.', keys: ['mirror', 'moisture'] },
  cobalt: { name: 'Cobalt chloride paper', purpose: 'Tests for water: blue when dry, pink with water.', how: 'Touch the mist on the mirror with a strip.', mistake: 'Handling it with wet fingers.', keys: ['cobalt'] },
  thermometer: { name: 'Thermometer', purpose: 'Shows that exhaled air is warmer than room air.', how: 'Read it in the room first, then with breath on the bulb.', mistake: 'Reading the room straight after breathing on it.', keys: ['temperature', 'thermometer'] },
  rule: { name: 'Metre rule', purpose: 'Falls freely when released: the distance before it is caught gives the reaction time, t = √(2d ÷ g).', how: 'Hold it vertically with the 0 cm mark level with the top of the catcher’s thumb; drop without warning.', mistake: 'Warning the catcher, or reading at different parts of the thumb.', keys: ['rule', 'ruler', 'drop', 'thumb', 'warning'] },
  knee: { name: 'Knee-jerk', purpose: 'Tapping the tendon below the kneecap stretches the thigh muscle: the leg kicks automatically — a spinal reflex.', how: 'Partner crosses one leg loosely; tap gently with the side of the hand.', mistake: 'Tapping with a hard object.', keys: ['knee', 'tap', 'reflex'] },
  dividers: { name: 'Blunt dividers', purpose: 'Two points at a measured separation.', how: 'Set the gap against the mm ruler; press both points together, gently.', mistake: 'One point landing before the other, or pressing hard.', keys: ['points', 'separation', 'pressure', 'blunt'] },
  mmrule: { name: 'Ruler (mm)', purpose: 'Sets the gap between the points.', how: 'Open the dividers against its mm scale.', mistake: 'Guessing the gap.', keys: ['ruler', 'mm'] },
  blindfold: { name: 'Blindfold', purpose: 'The subject must not see whether one or two points are used.', how: 'Tie it comfortably before the first touch.', mistake: 'Letting the subject peek.', keys: ['blindfold', 'see'] },
  wipes: { name: 'Alcohol wipes', purpose: 'Clean the points between subjects.', how: 'Wipe both points and let them dry.', mistake: 'Skipping it between students.', keys: ['alcohol', 'clean'] },
  area: { name: 'An area of skin', purpose: 'Each area has touch receptors at a different spacing.', how: 'Choose it, then touch it with one or two points at random.', mistake: 'Only ever touching with two points.', keys: ['fingertip', 'forearm', 'neck', 'palm'] },
  card: { name: 'Task card', purpose: 'The question paper.', how: 'Read it first and again before you hand in.', mistake: 'Missing a part of the question.', keys: [] },
  book: { name: 'Practical notebook', purpose: 'Your table, graph and answers — this is what is marked.', how: 'Record every reading as you take it.', mistake: 'Writing readings on scrap paper.', keys: ['record', 'table'] },
  lens: { name: 'Hand lens', purpose: 'Magnifies specimens.', how: 'Not needed here.', mistake: 'Cluttering the bench.', keys: [] },
};
export const humanExplainer = makeExplainer(E, { 'area:': 'area' });

// ------------------------------------------------------------------ Learn

/** The bench as Mrs Okon sets it out for Learn (display only, never saved). */
export function learnState(task: HumanTask): BioHumanState {
  const s = emptyBioHumanState();
  s.task = task;
  s.log = [{ t: 0, a: 'safety:coat' }, ...neededFor(task).map((a) => ({ t: 0, a: `collect:${a.id}` }))];
  if (task === 'BREATH') Object.assign(s.breath, { mouthpiece: true, lime: 'EQUAL' });
  if (task === 'REACTION') Object.assign(s.react, { arm: true, zero: true });
  if (task === 'SKIN') Object.assign(s.skin, { blind: true });
  return s;
}

export function learnConfig(task: HumanTask): LearnConfig {
  const items: LearnConfig['items'] =
    task === 'PULSE'
      ? [
          { match: /stopwatch|watch/i, id: 'clock', spot: spotOf(HSPOT.clock, 0.01, 0.4, 0.8) },
          { match: /graph/i, id: 'book', spot: spotOf(HSPOT.book, 0.01, 0.5, 0.8) },
          { match: /table/i, id: 'book', spot: spotOf(HSPOT.book, 0.01, 0.5, 0.8) },
        ]
      : task === 'BREATH'
        ? [
            { match: /boiling tubes|apparatus/i, id: 'apparatus', spot: spotOf(HSPOT.apparatus, 0.14, 0.55, 0.25) },
            { match: /rubber/i, id: 'apparatus', spot: spotOf(HSPOT.apparatus, 0.2, 0.5, 0.25) },
            { match: /thermometer/i, id: 'thermometer', spot: spotOf(HSPOT.thermometer, 0.01, 0.4, 0.7) },
            { match: /mirror/i, id: 'mirror', spot: spotOf(HSPOT.mirror, 0.05, 0.45, 0.4) },
            { match: /stopwatch/i, id: 'clock', spot: spotOf(HSPOT.clock, 0.01, 0.4, 0.8) },
            { match: /lime/i, id: 'limewater', spot: spotOf(HSPOT.limewater, 0.05, 0.45, 0.4) },
            { match: /cobalt/i, id: 'cobalt', spot: spotOf(HSPOT.cobalt, 0.01, 0.4, 0.7) },
          ]
        : task === 'REACTION'
          ? [
              { match: /metre rule|ruler/i, id: 'rule', spot: spotOf(HSPOT.rule, 0.3, 1.0, 0.1, -0.6) },
              { match: /chair/i, id: 'partner', spot: { target: [1.5, -0.3, 0.3], dist: 1.4, pitch: 0.2, yaw: -0.8 } },
              { match: /table|formula/i, id: 'book', spot: spotOf(HSPOT.book, 0.01, 0.5, 0.8) },
            ]
          : [
              { match: /pins|compass|hairpin/i, id: 'dividers', spot: spotOf(HSPOT.dividers, 0.02, 0.45, 0.6) },
              { match: /ruler/i, id: 'mmrule', spot: spotOf(HSPOT.mmrule, 0.01, 0.45, 0.7) },
              { match: /blindfold/i, id: 'partner', spot: { target: [0.2, 0.4, -0.72], dist: 0.9, pitch: 0.15 } },
              { match: /table/i, id: 'book', spot: spotOf(HSPOT.book, 0.01, 0.5, 0.8) },
            ];
  const partner = { target: [0.25, 0.2, -0.5] as [number, number, number], dist: 1.2, pitch: 0.25 };
  return {
    items,
    explain: humanExplainer,
    procedure:
      task === 'PULSE'
        ? [
            { spot: spotOf(HSPOT.wrist, 0.03, 0.55, 0.5), point: 'wrist' },
            { spot: { target: [1.6, -0.3, -0.45], dist: 2.0, pitch: 0.15, yaw: -0.4 }, point: 'partner' },
          ]
        : task === 'BREATH'
          ? [
              { spot: spotOf(HSPOT.apparatus, 0.14, 0.6, 0.25), point: 'apparatus' },
              { spot: spotOf(HSPOT.mirror, 0.05, 0.6, 0.35), point: 'mirror' },
            ]
          : task === 'REACTION'
            ? [
                { spot: { target: [1.45, -0.35, 0.4], dist: 1.2, pitch: 0.2, yaw: -0.9 }, point: 'partner' },
                { spot: spotOf(HSPOT.rule, 0.3, 1.0, 0.1, -0.6), point: 'rule' },
              ]
            : [
                { spot: partner, point: 'partner' },
                { spot: spotOf(SKIN_POINT.PALM, 0.05, 0.6, 0.55), point: 'dividers' },
              ],
    observe: task === 'PULSE' ? { spot: spotOf(HSPOT.wrist, 0.03, 0.5, 0.5), point: 'wrist' } : task === 'BREATH' ? { spot: spotOf(HSPOT.apparatus, 0.12, 0.5, 0.2), point: 'apparatus' } : task === 'REACTION' ? { spot: spotOf(HSPOT.rule, 0.25, 0.9, 0.1, -0.6), point: 'rule' } : { spot: spotOf(SKIN_POINT.PALM, 0.05, 0.55, 0.55), point: 'partner' },
    observeTitle: task === 'PULSE' ? 'Up sharply, down gradually' : task === 'BREATH' ? 'Tube B turns milky first' : task === 'REACTION' ? 'Shorter with practice' : 'Small gaps on the fingertip',
    ...(task === 'SKIN' ? { dataCard: { kicker: 'Data', title: 'Thresholds (sample data)', speech: 'Fingertip 2 millimetres, palm 10, forearm 40: the fingertip is 40 divided by 2, twenty times as sensitive. 18 correct out of 20 is 90 percent.' } } : {}),
  };
}

// ------------------------------------------------------------------ safety

export function humanSafety(task: HumanTask): SafetyContent {
  return {
    cards: [
      { icon: <Shirt className="size-6" />, title: 'Protect yourself and your partner', lessonMatch: /coat|partner|gentle|gently/i, lines: ['Wear your lab coat, buttoned.', 'Your partner is a person, not apparatus: explain each step, be gentle, and stop if they are uncomfortable.'] },
      task === 'PULSE'
        ? { icon: <HeartPulse className="size-6" />, title: 'Before exercise', lessonMatch: /asthma|heart|sickle|dizzy|dry|flat/i, lines: ['Anyone with asthma, a heart problem or sickle-cell disease records instead of exercising.', 'Exercise on a dry, flat floor; stop at once if your partner feels dizzy or unwell.'] }
        : task === 'BREATH'
          ? { icon: <Wind className="size-6" />, title: 'Mouthpieces and lime water', lessonMatch: /mouthpiece|lime|disinfect|suck/i, lines: ['A clean mouthpiece for each student; disinfect them afterwards.', 'Breathe gently: never suck lime water into the mouth. If any gets in, rinse with water and tell the teacher.'] }
          : task === 'REACTION'
            ? { icon: <Activity className="size-6" />, title: 'Tapping and dropping', lessonMatch: /tap|knee|ruler|toe/i, lines: ['Tap the knee gently with the side of your hand — never a hard object.', 'Keep feet clear of the falling rule.'] }
            : { icon: <Activity className="size-6" />, title: 'Points on skin', lessonMatch: /blunt|skin|alcohol|clean/i, lines: ['Blunt points, pressed gently: never break the skin.', 'Clean the points with alcohol between students.'] },
    ],
    questions: [
      task === 'PULSE'
        ? {
            q: 'Your partner says they have asthma. What do you do?',
            options: [
              { label: 'They do gentle step-ups anyway', aria: 'anyway', right: false, why: 'Exercise can bring on an asthma attack. Someone else exercises.' },
              { label: 'They record the results and someone else exercises', aria: 'swap', right: true, why: 'Right: no one with asthma, a heart problem or sickle-cell disease should do this exercise.' },
              { label: 'They exercise for longer but slower', aria: 'longer', right: false, why: 'Still exercise: they should not do it.' },
            ],
          }
        : task === 'BREATH'
          ? {
              q: 'Lime water starts to rise up the tube towards the mouthpiece. What do you do?',
              options: [
                { label: 'Suck harder to get it moving', aria: 'suck', right: false, why: 'Never: lime water must not be drawn into the mouth.' },
                { label: 'Stop, take the mouth away and breathe more gently', aria: 'stop', right: true, why: 'Right: breathe gently so it is not sucked in or blown out.' },
              ],
            }
          : task === 'REACTION'
            ? {
                q: 'How do you test the knee-jerk?',
                options: [
                  { label: 'Hit the knee with the metre rule', aria: 'rule', right: false, why: 'A hard object can hurt. Use the side of your hand.' },
                  { label: 'Tap just below the kneecap gently with the side of the hand', aria: 'hand', right: true, why: 'Right: gently, on the tendon below the kneecap.' },
                ],
              }
            : {
                q: 'How hard do you press the points?',
                options: [
                  { label: 'Firmly, so the subject is sure to feel them', aria: 'firm', right: false, why: 'Pressing hard can break the skin and turns touch into pressure or pain.' },
                  { label: 'Gently, both points at the same time and pressure', aria: 'gentle', right: true, why: 'Right: gentle, equal pressure — and blunt points only.' },
                ],
              },
      {
        q: 'You have finished. What do you do before you leave the lab?',
        options: [
          { label: 'Wash my hands and put the apparatus back', aria: 'wash', right: true, why: 'Right: hands washed, mouthpieces and points cleaned, apparatus returned.' },
          { label: 'Leave everything on the bench for the next class', aria: 'leave', right: false, why: 'Clean up and return the apparatus.' },
        ],
      },
    ],
  };
}

export const humanTour = (task: HumanTask) =>
  bioTour({
    focusId: task === 'BREATH' ? 'apparatus' : task === 'REACTION' ? 'rule' : task === 'SKIN' ? 'arm' : 'wrist',
    focusLabel: task === 'BREATH' ? 'Lime water' : task === 'REACTION' ? 'Rule' : task === 'SKIN' ? 'Arm and hand' : 'Wrist',
    task: task === 'BREATH' ? 'The task card lists the tests on inhaled and exhaled air.' : task === 'REACTION' ? 'The task card lists the drops and the formula.' : task === 'SKIN' ? 'The task card lists the five areas.' : 'The task card lists the counts and the exercise.',
  });

export const HUMAN_ASK: Record<HumanTask, AskSuggestions> = {
  PULSE: {
    LEARN: ['Why not use the thumb?', 'Why rest for 5 minutes first?', 'Why multiply by 4?', 'What is the radial pulse?'],
    DEMO: ['Why count straight after the exercise?', 'Why does the pulse rise?', 'What is the recovery time?', 'Why a smooth curve?'],
    TRY: ['How do I work out the % increase?', 'Which axis does time go on?', 'What precautions can I write?', 'When is the pulse back to rest?'],
    SANDBOX: ['Why does an athlete recover faster?', 'What if I use my thumb?', 'What if I count before resting?', 'What if the exercise is longer?'],
  },
  BREATH: {
    LEARN: ['Why does lime water turn milky?', 'Which tube gets exhaled air?', 'What does cobalt chloride show?', 'Why use a clean mouthpiece?'],
    DEMO: ['Why does tube A stay clear?', 'Why wipe the mirror first?', 'How is ventilation worked out?', 'Does exhaled air have oxygen?'],
    TRY: ['How many times more CO₂ is exhaled?', 'What should I write for tube A?', 'What precautions can I write?', 'Where does the extra CO₂ come from?'],
    SANDBOX: ['What if I breathe hard?', 'What if the volumes are unequal?', 'Why is breath warmer?', 'What if the mirror was wet?'],
  },
  REACTION: {
    LEARN: ['What is a reflex action?', 'Why drop without warning?', 'How does t = √(2d/g) work?', 'Why read at the top of the thumb?'],
    DEMO: ['Why convert cm to metres?', 'Why does practice help?', 'Is catching a reflex?', 'What is the reflex arc?'],
    TRY: ['How do I work out the reaction time?', 'Which hand should be faster?', 'What precautions can I write?', 'Why is the knee-jerk faster?'],
    SANDBOX: ['What if I warn the catcher?', 'What if the arm is not on the bench?', 'Why are eyes-closed catches slower?', 'Why are athletes quicker?'],
  },
  SKIN: {
    LEARN: ['Why blindfold the subject?', 'Why include single-point touches?', 'What is a two-point threshold?', 'Which skin receptors are there?'],
    DEMO: ['Why is the fingertip so sensitive?', 'Does the forearm have receptors?', 'Why reduce in 1 mm steps?', 'Why press both points together?'],
    TRY: ['How do I find the threshold?', 'How do I work out % correct?', 'What precautions can I write?', 'How many times more sensitive is the fingertip?'],
    SANDBOX: ['What if the subject can see?', 'What if one point lands first?', 'Why do people differ?', 'What does guessing look like?'],
  },
};
