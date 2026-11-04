import { emptyBioDissectionState, type BioDissectionState, type DissectTask } from '@aischool/shared';
import { Bug, Hand, Scissors, Shirt } from 'lucide-react';
import type { AskSuggestions } from '../../../lab3d-kit/ask';
import { makeExplainer, type Explainer } from '../../../lab3d-kit/explain';
import type { LearnConfig } from '../../../lab3d-kit/learn';
import { HazardIcon, type Hazard, type SafetyContent } from '../../../lab3d-kit/safety';
import { BIO_ROOM_EXPLAIN, bioTour } from '../../bio-common/lab3d/common';
import { DSPOT, spotOf } from './bench';
import { neededFor } from './scene-state';

/** The dissection lab's texts: "What is this?" cards, safety briefing, Learn, tour and Ask suggestions. */

const E: Record<string, Explainer> = {
  ...BIO_ROOM_EXPLAIN,
  plant: { name: 'Young balsam plant', purpose: 'A herbaceous plant with a translucent stem: the red dye can be seen rising inside it.', how: 'Wash the roots gently, stand them in eosin, leave it in a bright, airy place.', mistake: 'Damaging the roots: the dye then enters directly.', keys: ['balsam', 'roots', 'translucent'] },
  pot: { name: 'Pot of soil', purpose: 'Where the seedling grew.', how: 'Ease the plant out and wash the soil off the roots.', mistake: 'Pulling it out roughly and tearing the roots.', keys: ['roots', 'wash'] },
  eosin: { name: 'Eosin solution', purpose: 'A red dye in water: it goes wherever the water goes.', how: 'Stand the roots in it; measure the red line from its surface.', mistake: 'Spilling it: it stains skin and clothes.', keys: ['eosin', 'stain', 'dye'] },
  bowl: { name: 'Bowl of water', purpose: 'For washing the soil off the roots gently.', how: 'Swirl the roots in it; do not rub them.', mistake: 'Rinsing hard under the tap.', keys: ['wash', 'gentl'] },
  ruler: { name: '30 cm ruler', purpose: 'Measures the height of the red line (EOSIN) or the body and gut (rat).', how: 'Read at eye level, to 0.1 cm for the dye, 0.5 cm for the rat.', mistake: 'Starting from the wrong zero.', keys: ['measure', 'ruler', 'same point'] },
  stopwatch: { name: 'Stopwatch', purpose: 'Times the rise of the dye.', how: 'Start it when the plant goes into the eosin.', mistake: 'Forgetting the time of a reading.', keys: ['time', 'interval'] },
  tile: { name: 'White tile', purpose: 'A firm surface to cut on, away from your fingers; sections show up well on it.', how: 'Lay the stem on it and slice across.', mistake: 'Holding the stem in your hand and cutting towards your thumb.', keys: ['cut away', 'fingers'] },
  razor: { name: 'Razor blade', purpose: 'Cuts thin sections of the stem.', how: 'Wet it; draw it across in one stroke; cut several and pick the thinnest.', mistake: 'Thick slices: light cannot pass through.', keys: ['thin', 'cut', 'razor'] },
  lens: { name: 'Hand lens', purpose: 'Magnifies a section, or the mould on the bread.', how: 'Hold it close to your eye and bring the object up to it.', mistake: 'Holding it at arm’s length.', keys: ['hand lens'] },
  microscope: { name: 'Microscope', purpose: 'Shows the cells of a section — or the teacher’s slide of bread mould.', how: 'Low power first; focus with the coarse knob, then the fine.', mistake: 'Starting on high power.', keys: ['microscope'] },
  rat: { name: 'The specimen', purpose: 'A rat killed humanely by the teacher (or preserved). Treat it with respect.', how: 'Pin it ventral side up; lift the skin before cutting; keep it moist.', mistake: 'Cutting too deeply and damaging the organs.', keys: ['rat', 'humanely', 'deep', 'moist'] },
  gloves: { name: 'Disposable gloves', purpose: 'Protect your hands from the specimen and the disinfectant.', how: 'Put them on first; take them off inside out at the end.', mistake: 'Touching your face with gloved hands.', keys: ['glove'] },
  kit: { name: 'Dissecting kit', purpose: 'Scalpel and scissors to cut, forceps to lift, a seeker to move organs.', how: 'Cut away from the body; handle the blades carefully.', mistake: 'Tearing organs with forceps instead of the seeker.', keys: ['scalpel', 'scissors', 'forceps', 'seeker', 'blade'] },
  thread: { name: 'Thread', purpose: 'Follows the curves of the gut so it can be measured without stretching.', how: 'Lay it damp along the gut, mark the ends, straighten it on the ruler.', mistake: 'Pulling the gut straight along the ruler.', keys: ['thread', 'measure'] },
  washbottle: { name: 'Wash bottle', purpose: 'Keeps the specimen moist.', how: 'A gentle squirt whenever it looks dry.', mistake: 'Letting the organs dry out.', keys: ['moist', 'water'] },
  disinfectant: { name: 'Disinfectant', purpose: 'Cleans the bench, tools and board; kills cultures before disposal.', how: 'Wipe the bench first; soak used plates and tools in it.', mistake: 'Throwing cultures in the bin.', keys: ['disinfect'] },
  plate: { name: 'Nutrient agar plate', purpose: 'Sterile food jelly: each microbe that lands grows into a visible colony.', how: 'Label the base; open the lid only slightly; tape with two strips; incubate upside down.', mistake: 'Opening it after incubation.', keys: ['agar', 'plate', 'lid', 'base', 'aseptic'] },
  marker: { name: 'Marker pen', purpose: 'Labels each plate.', how: 'On the base, round the edge, so you can still see the colonies.', mistake: 'Writing on the lid.', keys: ['label', 'base'] },
  tape: { name: 'Adhesive tape', purpose: 'Holds the lid on so no one can open the plate.', how: 'Two short strips across the edge — not all round.', mistake: 'Sealing the plate completely (it goes anaerobic).', keys: ['tape', 'strips', 'sealed'] },
  incubator: { name: 'Incubator', purpose: 'Keeps the plates warm (25–30 °C) so the colonies grow.', how: 'Plates in upside down; leave 2–3 days.', mistake: 'Setting 37 °C: it encourages human pathogens.', keys: ['incubat', '30', 'pathogen'] },
  slice: { name: 'Bread slice', purpose: 'Food for bread mould (Rhizopus).', how: 'Moisten, expose to the air 30 minutes, bag and keep warm and dark — beside dry and cold slices.', mistake: 'Leaving it uncovered: it dries out.', keys: ['bread', 'moist', 'polythene'] },
  bags: { name: 'Polythene bags', purpose: 'Keep the bread moist and the spores in.', how: 'One per slice; label them.', mistake: 'Opening the bags near your face: spores.', keys: ['polythene', 'bag'] },
  fridge: { name: 'Bench refrigerator', purpose: 'Keeps slice C cold: the test for warmth.', how: 'Moist bread, bagged, in here.', mistake: 'Forgetting it is the control for temperature.', keys: ['cold', 'refrigerator'] },
  card: { name: 'Task card', purpose: 'The question paper.', how: 'Read it first and again before you hand in.', mistake: 'Missing a part of the question.', keys: [] },
  book: { name: 'Practical notebook', purpose: 'Your tables, drawing and answers — this is what is marked.', how: 'Record every reading as you take it.', mistake: 'Writing readings on scrap paper.', keys: ['record', 'table', 'drawing'] },
};
export const dissectExplainer = makeExplainer(E, { 'plate:': 'plate', 'slice:': 'slice' });

// ------------------------------------------------------------------ Learn

/** The bench as Mrs Okon sets it out for Learn (display only, never saved). */
export function learnState(task: DissectTask): BioDissectionState {
  const s = emptyBioDissectionState();
  s.task = task;
  s.log = [{ t: 0, a: 'safety:coat' }, ...neededFor(task).map((a) => ({ t: 0, a: `collect:${a.id}` }))];
  if (task === 'EOSIN') Object.assign(s.eosin, { wash: 'GENTLE', dye: true, place: 'BRIGHT', clock: 60 });
  else if (task === 'RAT') Object.assign(s.rat, { gloves: true, pinned: 'VENTRAL', skin: 'LIFTED', skinPinned: true, wall: 'LIFTED', moist: true });
  else {
    Object.assign(s.micro, { wiped: true, inverted: true, temp: 30, incAt: 0, day: 2, breadExposed: true, bagged: true, breadAt: 0 });
    s.micro.plates = s.micro.plates.map((p, k) => ({ ...p, label: 'BASE', tape: 'STRIPS', airMin: k === 1 ? 20 : 0, touch: k === 2 ? 'UNWASHED' : k === 3 ? 'WASHED' : null, lid: k >= 2 ? 'SLIGHT' : null }));
    s.micro.slices = [
      { moist: true, place: 'WARM' },
      { moist: false, place: 'WARM' },
      { moist: true, place: 'COLD' },
    ];
  }
  return s;
}

export function learnConfig(task: DissectTask): LearnConfig {
  const items: LearnConfig['items'] =
    task === 'EOSIN'
      ? [
          { match: /beaker/i, id: 'eosin', spot: spotOf(DSPOT.eosin, 0.08, 0.5, 0.25) },
          { match: /razor/i, id: 'razor', spot: spotOf(DSPOT.razor, 0.01, 0.35, 0.8) },
          { match: /hand lens/i, id: 'lens', spot: spotOf(DSPOT.lens, 0.01, 0.35, 0.8) },
          { match: /microscope/i, id: 'microscope', spot: spotOf(DSPOT.microscope, 0.14, 0.55, 0.25) },
          { match: /ruler/i, id: 'ruler', spot: spotOf(DSPOT.eosin, 0.18, 0.6, 0.15) },
          { match: /stopwatch/i, id: 'stopwatch', spot: spotOf(DSPOT.stopwatch, 0.01, 0.35, 0.8) },
        ]
      : task === 'RAT'
        ? [
            { match: /board|pins/i, id: 'rat', spot: spotOf(DSPOT.board, 0.03, 0.6, 0.9) },
            { match: /scalpel|scissors|forceps|seeker/i, id: 'kit', spot: spotOf(DSPOT.kit, 0.01, 0.4, 0.85) },
            { match: /gloves/i, id: 'gloves', spot: spotOf(DSPOT.gloves, 0.04, 0.45, 0.5) },
            { match: /ruler/i, id: 'ruler', spot: spotOf(DSPOT.rruler, 0.01, 0.45, 0.8) },
          ]
        : [
            { match: /petri|agar/i, id: 'plate:0', spot: spotOf(DSPOT.plates, 0.02, 0.5, 0.85) },
            { match: /incubator/i, id: 'incubator', spot: spotOf(DSPOT.incubator, 0.12, 0.7, 0.2) },
            { match: /tape/i, id: 'tape', spot: spotOf(DSPOT.tape, 0.01, 0.4, 0.8) },
            { match: /hand lens/i, id: 'lens', spot: spotOf(DSPOT.mlens, 0.01, 0.35, 0.8) },
            { match: /microscope/i, id: 'microscope', spot: spotOf(DSPOT.mmicroscope, 0.14, 0.55, 0.25) },
            { match: /polythene/i, id: 'bags', spot: spotOf(DSPOT.bags, 0.01, 0.4, 0.8) },
          ];
  return {
    items,
    explain: dissectExplainer,
    procedure:
      task === 'EOSIN'
        ? [
            { spot: spotOf(DSPOT.eosin, 0.16, 0.7, 0.15), point: 'plant' },
            { spot: spotOf(DSPOT.tile, 0.02, 0.45, 0.7), point: 'tile' },
          ]
        : task === 'RAT'
          ? [
              { spot: spotOf(DSPOT.board, 0.03, 0.6, 0.95), point: 'rat' },
              { spot: spotOf(DSPOT.kit, 0.01, 0.45, 0.8), point: 'kit' },
            ]
          : [
              { spot: spotOf(DSPOT.plates, 0.02, 0.55, 0.85), point: 'plate:1' },
              { spot: spotOf(DSPOT.incubator, 0.12, 0.7, 0.2), point: 'incubator' },
            ],
    observe: task === 'EOSIN' ? { spot: spotOf(DSPOT.eosin, 0.16, 0.5, 0.12), point: 'plant' } : task === 'RAT' ? { spot: spotOf(DSPOT.board, 0.03, 0.5, 1.0), point: 'rat' } : { spot: spotOf(DSPOT.plates, 0.02, 0.45, 0.9), point: 'plate:2' },
    observeTitle: task === 'EOSIN' ? 'Red only in the xylem' : task === 'RAT' ? 'The gut displayed' : 'Colonies — but none on the control',
  };
}

// ------------------------------------------------------------------ safety

export function dissectSafety(task: DissectTask): SafetyContent {
  const sym = (right: Hazard, why: Record<Hazard, string>) => (['flame', 'corrosive', 'toxic', 'harmful'] as Hazard[]).map((k) => ({ label: <HazardIcon kind={k} />, aria: k, right: k === right, why: why[k] }));
  const harmful = sym('harmful', {
    harmful: 'Right: the exclamation mark — harmful or irritant. Strong disinfectant irritates skin and eyes.',
    flame: 'That is the flame: flammable. Harmful is the exclamation mark.',
    toxic: 'That is the skull: toxic. Harmful (irritant) is the exclamation mark.',
    corrosive: 'That is corrosive. Harmful (irritant) is the exclamation mark.',
  });
  return {
    cards: [
      { icon: <Shirt className="size-6" />, title: 'Protect yourself', lessonMatch: /coat|glove|wash|hand/i, lines: ['Wear your lab coat, buttoned.', task === 'RAT' ? 'Wear gloves; wash your hands at the end.' : task === 'MICROBE' ? 'Wash your hands before and after; never put anything in your mouth.' : 'Eosin stains skin and clothes: avoid spills.'] },
      task === 'MICROBE'
        ? { icon: <Bug className="size-6" />, title: 'Cultures', lessonMatch: /open|sealed|30|pathogen|dispose|autoclav/i, lines: ['Tape the lids with two short strips; never open a plate after incubation.', 'Incubate at no more than 30 °C; soak used plates in strong disinfectant.'] }
        : { icon: <Scissors className="size-6" />, title: 'Blades', lessonMatch: /cut|blade|scalpel|razor/i, lines: ['Cut away from your fingers and your body.', 'Carry blades point down; report any cut to the teacher.'] },
      task === 'RAT'
        ? { icon: <Hand className="size-6" />, title: 'Respect the specimen', lessonMatch: /humanely|teacher|disinfect/i, lines: ['The animal was killed humanely by the teacher; students do not kill animals.', 'Disinfect the tools and board; the specimen is wrapped for proper disposal.'] }
        : { icon: <Hand className="size-6" />, title: 'Clean up', lessonMatch: /disinfect|wash/i, lines: ['Wipe the bench with disinfectant.', 'Wash your hands with soap before you leave.'] },
    ],
    questions: [
      { q: 'Strong disinfectant carries this warning. Tap the symbol that means HARMFUL or IRRITANT.', grid: true, options: harmful },
      task === 'RAT'
        ? {
            q: 'How do you open the skin of the abdomen?',
            options: [
              { label: 'Lift it with forceps, then cut along the midline', aria: 'lift', right: true, why: 'Right: the scissors cut only the skin.' },
              { label: 'Push the scalpel straight in', aria: 'push', right: false, why: 'You would cut the organs beneath.' },
            ],
          }
        : task === 'MICROBE'
          ? {
              q: 'Your plates have been incubated for 3 days. What do you do?',
              options: [
                { label: 'Open them to smell and touch the colonies', aria: 'open', right: false, why: 'Never: the cultures may contain pathogens.' },
                { label: 'Count and describe the colonies through the lid', aria: 'count', right: true, why: 'Right: the plates stay taped shut.' },
              ],
            }
          : {
              q: 'How do you cut a section of the stem?',
              options: [
                { label: 'On the tile, the blade moving away from my fingers', aria: 'tile', right: true, why: 'Right: and cut several thin slices.' },
                { label: 'Holding the stem, slicing towards my thumb', aria: 'thumb', right: false, why: 'The blade can slip into your thumb.' },
              ],
            },
      {
        q: task === 'RAT' ? 'How do you move the gut to one side?' : task === 'MICROBE' ? 'Where do you write the label on a plate?' : 'How do you get the plant’s roots clean?',
        options:
          task === 'RAT'
            ? [
                { label: 'Gently, with the seeker', aria: 'seeker', right: true, why: 'Right: without tearing the mesentery.' },
                { label: 'Pull it with the forceps', aria: 'forceps', right: false, why: 'That tears the mesentery.' },
              ]
            : task === 'MICROBE'
              ? [
                  { label: 'On the base', aria: 'base', right: true, why: 'Right: lids get swapped.' },
                  { label: 'On the lid', aria: 'lid', right: false, why: 'Lids are easily swapped between plates.' },
                ]
              : [
                  { label: 'Wash them gently in a bowl of water', aria: 'gentle', right: true, why: 'Right: damaged roots let the dye in directly.' },
                  { label: 'Scrub them under the tap', aria: 'scrub', right: false, why: 'That tears the roots.' },
                ],
      },
    ],
  };
}

export const dissectTour = (task: DissectTask) =>
  bioTour({
    focusId: task === 'RAT' ? 'rat' : task === 'MICROBE' ? 'plate:0' : 'plant',
    focusLabel: task === 'RAT' ? 'The specimen' : task === 'MICROBE' ? 'Agar plates' : 'The plant',
    task: task === 'RAT' ? 'The task card lists the dissection steps.' : task === 'MICROBE' ? 'The task card lists the four plates and the bread.' : 'The task card lists the dye, the readings and the sections.',
  });

export const DISSECT_ASK: Record<DissectTask, AskSuggestions> = {
  EOSIN: {
    LEARN: ['Why use eosin?', 'Why a balsam plant?', 'What does the xylem do?', 'Why a bright, airy place?'],
    DEMO: ['Why is only the xylem red?', 'Why are the bundles in a ring?', 'Why do the leaf veins turn red?', 'How is the rate worked out?'],
    TRY: ['How do I work out the rate in cm per hour?', 'Which tissue is stained?', 'What precautions can I write?', 'Why is my top section not red?'],
    SANDBOX: ['What if I tear the roots?', 'What if the plant is in the dark?', 'What if it is windy?', 'What if the section is thick?'],
  },
  RAT: {
    LEARN: ['Why pin it ventral side up?', 'Why lift the skin before cutting?', 'What is the mesentery?', 'Why keep it moist?'],
    DEMO: ['Where is the pancreas?', 'Why is the caecum so large?', 'Does the rat have a gall bladder?', 'How do I measure the gut?'],
    TRY: ['How do I work out the gut : body ratio?', 'Which organs should I label?', 'What precautions can I write?', 'What does the liver do?'],
    SANDBOX: ['What if I cut too deep?', 'What if I pull the gut with forceps?', 'Is a bigger rat’s ratio different?', 'What if I stretch the gut to measure it?'],
  },
  MICROBE: {
    LEARN: ['Why have a control plate?', 'Why label the base?', 'Why incubate upside down?', 'Why not 37 °C?'],
    DEMO: ['Why does the air plate grow colonies?', 'Why fewer colonies after washing?', 'What are the black dots on the bread?', 'How do I count the colonies?'],
    TRY: ['How do I work out the % reduction?', 'How do I tell bacteria from fungi?', 'What precautions can I write?', 'Why did the dry bread not go mouldy?'],
    SANDBOX: ['What if I open the control?', 'What if I seal the plates?', 'What if the bread is not bagged?', 'What happens in the harmattan?'],
  },
};
