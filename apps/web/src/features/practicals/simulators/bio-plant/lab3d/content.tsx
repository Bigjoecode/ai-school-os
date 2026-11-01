import { emptyBioPlantState, emptyOxyRow, type BioPlantState, type PlantTask } from '@aischool/shared';
import { Flame, Lightbulb, Scissors, Shirt } from 'lucide-react';
import type { AskSuggestions } from '../../../lab3d-kit/ask';
import { makeExplainer, type Explainer } from '../../../lab3d-kit/explain';
import type { LearnConfig } from '../../../lab3d-kit/learn';
import { HazardIcon, type Hazard, type SafetyContent } from '../../../lab3d-kit/safety';
import { BIO_ROOM_EXPLAIN, bioTour } from '../../bio-common/lab3d/common';
import { PSPOT, lampSpot, spotOf } from './bench';
import { neededFor } from './scene-state';

/** The plant lab's texts: "What is this?" cards, safety briefing, Learn, tour and Ask suggestions. */

const E: Record<string, Explainer> = {
  ...BIO_ROOM_EXPLAIN,
  goggles: { name: 'Safety goggles', purpose: 'Protect your eyes from boiling water, ethanol and iodine.', how: 'Wear them while the water bath is hot.', mistake: 'Pushing them up onto your forehead.', keys: ['eye', 'goggles'] },
  shoot: { name: 'Leafy shoot', purpose: 'Its leaves lose water vapour through the stomata; the stem draws water up to replace it.', how: 'Cut it with a slanting cut under water and fit it under water.', mistake: 'Cutting it in air: an air lock in the xylem.', keys: ['shoot', 'under water', 'xylem'] },
  potometer: { name: 'Bubble potometer', purpose: 'Measures how fast the shoot takes up water: the bubble moves along the capillary.', how: 'Reset the bubble to zero with the reservoir tap, then time it over 30 mm.', mistake: 'Saying it measures transpiration directly — it measures uptake.', keys: ['potometer', 'bubble', 'capillary', 'scale'] },
  bowl: { name: 'Bowl of water', purpose: 'The shoot is cut and fitted under water so no air enters the xylem.', how: 'Hold the stem and the potometer tube under the water.', mistake: 'Lifting the stem out between cutting and fitting.', keys: ['water', 'bowl'] },
  blade: { name: 'Razor blade', purpose: 'Cuts the stem cleanly at a slant.', how: 'Cut away from your fingers, under the water.', mistake: 'Cutting towards your hand.', keys: ['blade', 'cut'] },
  vaseline: { name: 'Vaseline', purpose: 'Makes the joint airtight.', how: 'Smear it all round the joint between the stem and the tubing.', mistake: 'A leaking joint: the bubble moves erratically.', keys: ['vaseline', 'airtight', 'leak'] },
  fan: { name: 'Electric fan', purpose: 'Moving air carries water vapour away from the leaves, keeping the diffusion gradient steep.', how: 'Point it at the shoot, keep it and its lead away from the water.', mistake: 'Splashing water near the fan.', keys: ['fan', 'wind', 'electrical'] },
  lamp: { name: 'Bench lamp', purpose: 'Bright light opens the stomata (potometer) or drives photosynthesis (pondweed).', how: 'Measure its distance from the plant; it gets hot.', mistake: 'Letting its heat warm the water.', keys: ['lamp', 'light', 'distance'] },
  bags: { name: 'Black and clear bags', purpose: 'A black bag keeps the shoot dark; a clear polythene bag keeps the air round it humid.', how: 'Slip it over the leaves without touching the bubble.', mistake: 'Tying it so tight it bends the shoot.', keys: ['dark', 'humid'] },
  clock: { name: 'Stopwatch', purpose: 'Times the bubble, or the minute while you count bubbles.', how: 'Start and stop it exactly as you see the event.', mistake: 'Reacting late.', keys: ['stopwatch', 'time'] },
  bottle: { name: 'Sodium hydrogencarbonate', purpose: 'Releases carbon dioxide into the water for photosynthesis.', how: 'A pinch in the beaker before you start.', mistake: 'Forgetting it: CO₂ then limits the rate.', keys: ['hydrogencarbonate', 'carbon dioxide'] },
  weed: { name: 'Pondweed (Elodea)', purpose: 'A water plant: the oxygen it makes leaves its cut stem as bubbles.', how: 'Freshly cut, cut end upwards under the funnel.', mistake: 'Using a different piece at each distance.', keys: ['plant', 'elodea', 'same piece'] },
  rig: { name: 'Beaker, funnel and test tube', purpose: 'The funnel guides the bubbles into the test tube, which collects the gas.', how: 'Keep the tube full of water to start with.', mistake: 'Letting air into the tube.', keys: ['funnel', 'test tube', 'beaker'] },
  trough: { name: 'Water trough (heat filter)', purpose: 'Absorbs the lamp’s heat so the water’s temperature stays constant.', how: 'Stand it between the lamp and the beaker.', mistake: 'Leaving it out: the lamp warms the water and the rate changes for that reason too.', keys: ['temperature', 'heat'] },
  thermometer: { name: 'Thermometer', purpose: 'Checks that the water’s temperature stays constant.', how: 'Read it at each distance.', mistake: 'Not checking it.', keys: ['temperature', 'thermometer'] },
  rule: { name: 'Metre rule', purpose: 'Measures the distance from the lamp to the plant.', how: 'Measure from the bulb to the middle of the beaker.', mistake: 'Measuring to the edge of the bench.', keys: ['distance', 'metre rule'] },
  splint: { name: 'Wooden splint', purpose: 'Tests the gas: a glowing splint relights in oxygen.', how: 'Light it, blow it out and push the glowing end into the tube.', mistake: 'Testing before enough gas has collected.', keys: ['splint', 'glowing'] },
  pot: { name: 'Potted plants', purpose: 'A destarched plant shows only the starch made during the experiment.', how: 'Keep it in the dark 48 hours, set up the leaves, then give it 4–6 hours of light.', mistake: 'Using a plant straight from the window.', keys: ['destarch', 'dark', 'plant'] },
  foil: { name: 'Aluminium foil', purpose: 'Keeps light off part of a leaf.', how: 'A strip across both sides of the leaf, before the light.', mistake: 'Covering one side only: light leaks in.', keys: ['foil', 'cover'] },
  flask: { name: 'Flask with potassium hydroxide', purpose: 'KOH absorbs carbon dioxide: the leaf inside has none.', how: 'Seal one leaf (still on the plant) inside it, before the light.', mistake: 'A leaky seal lets CO₂ in.', keys: ['potassium hydroxide', 'carbon dioxide'] },
  bath: { name: 'Water bath', purpose: 'Boils the leaves; then (flame off) keeps the ethanol tube hot.', how: 'Boil, turn the flame OFF, then stand the ethanol tube in the hot water.', mistake: 'Ethanol near a lit Bunsen: it catches fire.', keys: ['water bath', 'flame', 'boil'] },
  ethanol: { name: 'Ethanol', purpose: 'Dissolves the chlorophyll so the iodine colour can be seen.', how: 'Only in a tube standing in hot water, flame off.', mistake: 'Heating it over a flame, or saying it removes starch.', keys: ['ethanol', 'flammable', 'chlorophyll'] },
  tubes: { name: 'Boiling tubes', purpose: 'Hold the ethanol and the leaf in the water bath.', how: 'One tube for each leaf.', mistake: 'Filling them too full.', keys: ['tube'] },
  warm: { name: 'Warm water', purpose: 'Softens the leaf after the ethanol makes it brittle.', how: 'Dip the leaf for a few seconds.', mistake: 'Spreading a brittle leaf: it cracks.', keys: ['warm water', 'soften', 'brittle'] },
  iodine: { name: 'Iodine solution', purpose: 'Tests for starch: blue-black where there is starch, yellow-brown where there is none.', how: 'Cover the spread leaf with a few drops.', mistake: 'Saying it tests for glucose.', keys: ['iodine'] },
  tile: { name: 'White tile', purpose: 'A white background to judge the colours.', how: 'Spread the softened leaf flat on it.', mistake: 'Leaving the leaf folded.', keys: ['tile'] },
  grid: { name: '1 cm² grid paper', purpose: 'Estimates the area of the leaf that made starch.', how: 'Count squares more than half covered, and the blue-black ones.', mistake: 'Counting half-covered squares twice.', keys: ['grid', 'square'] },
  leaf: { name: 'A test leaf', purpose: 'Its colours with iodine show where starch was made.', how: 'Boil, decolourise (flame off), soften, spread, iodine.', mistake: 'Skipping the boiling: the iodine cannot get in.', keys: ['leaf', 'starch'] },
  forceps: { name: 'Forceps', purpose: 'Handle hot leaves.', how: 'Lift leaves out of the hot water with them.', mistake: 'Using your fingers in hot water.', keys: ['forceps'] },
  card: { name: 'Task card', purpose: 'The question paper.', how: 'Read it first and again before you hand in.', mistake: 'Missing a part of the question.', keys: [] },
  book: { name: 'Practical notebook', purpose: 'Your table, graph or drawing and answers — this is what is marked.', how: 'Record every reading as you take it.', mistake: 'Writing readings on scrap paper.', keys: ['record', 'table'] },
  lens: { name: 'Hand lens', purpose: 'Magnifies specimens.', how: 'Not needed here.', mistake: 'Cluttering the bench.', keys: [] },
};
export const plantExplainer = makeExplainer(E, { 'leaf:': 'leaf' });

// ------------------------------------------------------------------ Learn

/** The bench as Mrs Okon sets it out for Learn (display only, never saved). */
export function learnState(task: PlantTask): BioPlantState {
  const s = emptyBioPlantState();
  s.task = task;
  s.log = [{ t: 0, a: 'safety:coat' }, { t: 0, a: 'safety:goggles' }, ...neededFor(task).map((a) => ({ t: 0, a: `collect:${a.id}` }))];
  if (task === 'POTOMETER') Object.assign(s.poto, { cut: 'WATER', fit: 'WATER', sealed: true, bubble: true, zeroAt: 0, conds: [{ cond: 'STILL', at: 0 }] });
  else if (task === 'OXYGEN') {
    Object.assign(s.oxy, { nahco3: true, plant: true, tubeAt: 0, shield: true, moves: [{ d: 20, at: 0 }], clock: 6 });
    s.oxy.rows = [emptyOxyRow(20)];
  } else Object.assign(s.starch, { plant: 'DESTARCHED', foil: true, koh: true });
  return s;
}

export function learnConfig(task: PlantTask): LearnConfig {
  const items: LearnConfig['items'] =
    task === 'POTOMETER'
      ? [
          { match: /potometer|capillary/i, id: 'potometer', spot: spotOf(PSPOT.potometer, 0.13, 0.6, 0.3) },
          { match: /retort|clamp/i, id: 'potometer', spot: spotOf(PSPOT.potometer, 0.1, 0.7, 0.3) },
          { match: /bowl/i, id: 'bowl', spot: spotOf(PSPOT.bowl, 0.04, 0.5, 0.5) },
          { match: /stopwatch/i, id: 'clock', spot: spotOf(PSPOT.clock, 0.01, 0.4, 0.8) },
          { match: /fan/i, id: 'fan', spot: spotOf(PSPOT.fan, 0.15, 0.6, 0.3) },
          { match: /vaseline/i, id: 'vaseline', spot: spotOf(PSPOT.vaseline, 0.02, 0.4, 0.6) },
          { match: /ruler/i, id: 'potometer', spot: spotOf(PSPOT.potometer, 0.12, 0.45, 0.4) },
        ]
      : task === 'OXYGEN'
        ? [
            { match: /beaker/i, id: 'rig', spot: spotOf(PSPOT.beaker, 0.1, 0.6, 0.3) },
            { match: /funnel|test tube/i, id: 'rig', spot: spotOf(PSPOT.beaker, 0.16, 0.5, 0.25) },
            { match: /lamp/i, id: 'lamp', spot: spotOf(lampSpot(20), 0.15, 0.7, 0.3) },
            { match: /metre rule/i, id: 'rule', spot: spotOf(PSPOT.rule, 0.02, 1.0, 0.5) },
            { match: /stopwatch/i, id: 'clock', spot: spotOf(PSPOT.oclock, 0.01, 0.4, 0.8) },
            { match: /thermometer/i, id: 'thermometer', spot: spotOf(PSPOT.beaker, 0.12, 0.45, 0.3) },
          ]
        : [
            { match: /beaker|water bath/i, id: 'bath', spot: spotOf(PSPOT.bath, 0.25, 0.7, 0.3) },
            { match: /bunsen|hot plate|tripod/i, id: 'bath', spot: spotOf(PSPOT.bath, 0.12, 0.7, 0.25) },
            { match: /boiling tube/i, id: 'tubes', spot: spotOf(PSPOT.rack, 0.08, 0.5, 0.3) },
            { match: /forceps/i, id: 'forceps', spot: spotOf(PSPOT.forceps, 0.01, 0.4, 0.7) },
            { match: /tile/i, id: 'tile', spot: spotOf(PSPOT.tile, 0.01, 0.42, 0.8) },
            { match: /foil|black paper/i, id: 'foil', spot: spotOf(PSPOT.foil, 0.02, 0.45, 0.5) },
          ];
  return {
    items,
    explain: plantExplainer,
    procedure:
      task === 'POTOMETER'
        ? [
            { spot: spotOf(PSPOT.bowl, 0.08, 0.7, 0.4), point: 'bowl' },
            { spot: spotOf(PSPOT.potometer, 0.13, 0.65, 0.3), point: 'potometer' },
          ]
        : task === 'OXYGEN'
          ? [
              { spot: spotOf(PSPOT.beaker, 0.1, 0.6, 0.3), point: 'rig' },
              { spot: spotOf(PSPOT.rule, 0.05, 1.0, 0.45), point: 'lamp' },
            ]
          : [
              { spot: spotOf(PSPOT.pot, 0.2, 0.7, 0.3), point: 'pot' },
              { spot: spotOf(PSPOT.bath, 0.25, 0.7, 0.3), point: 'bath' },
            ],
    observe: task === 'POTOMETER' ? { spot: spotOf(PSPOT.potometer, 0.13, 0.5, 0.35), point: 'potometer' } : task === 'OXYGEN' ? { spot: spotOf(PSPOT.beaker, 0.16, 0.45, 0.25), point: 'rig' } : { spot: spotOf(PSPOT.tile, 0.02, 0.45, 0.75), point: 'tile' },
    observeTitle: task === 'POTOMETER' ? 'The bubble moves towards the shoot' : task === 'OXYGEN' ? 'Bubbles from the cut stem' : 'Blue-black and yellow-brown',
    ...(task === 'STARCH' ? { dataCard: { kicker: 'Data', title: 'Area that made starch (sample data)', speech: 'On grid paper, a leaf covers 48 squares and 12 were under the foil: 36 squares made starch, 75 percent.' } } : {}),
  };
}

// ------------------------------------------------------------------ safety

export function plantSafety(task: PlantTask): SafetyContent {
  const sym = (right: Hazard, why: Record<Hazard, string>) => (['flame', 'corrosive', 'toxic', 'harmful'] as Hazard[]).map((k) => ({ label: <HazardIcon kind={k} />, aria: k, right: k === right, why: why[k] }));
  const flammable = sym('flame', {
    flame: 'Right: the flame means highly flammable. Ethanol vapour catches fire from a Bunsen flame — never heat it over a flame.',
    corrosive: 'That is corrosive (it eats into skin and surfaces). Flammable is the flame.',
    toxic: 'That is the skull: toxic. Flammable is the flame.',
    harmful: 'That is the exclamation mark: harmful or irritant. Flammable is the flame.',
  });
  return {
    cards: [
      { icon: <Shirt className="size-6" />, title: 'Protect yourself', lessonMatch: /coat|eye|goggle/i, lines: ['Wear your lab coat, buttoned.', task === 'STARCH' ? 'Goggles on: boiling water and ethanol can splash; iodine stains.' : 'Wipe up spilt water at once: wet floors are slippery.'] },
      task === 'STARCH'
        ? { icon: <Flame className="size-6" />, title: 'Ethanol and hot water', lessonMatch: /ethanol|flammable|flame|hot/i, lines: ['Ethanol is highly flammable: turn the Bunsen OFF before ethanol comes near the water bath. Never heat it over a flame.', 'Boiling water scalds: handle hot leaves with forceps and keep the bath steady on its tripod.'] }
        : { icon: <Lightbulb className="size-6" />, title: 'Lamp, fan and water', lessonMatch: /lamp|fan|electric|lead|water/i, lines: ['Keep the lamp, the fan and their leads away from water; dry hands before touching switches.', 'The lamp gets hot: do not touch the shade, and stand it on the bench, not near paper.'] },
      { icon: <Scissors className="size-6" />, title: task === 'POTOMETER' ? 'Blades and glass' : task === 'OXYGEN' ? 'Glass and splints' : 'Hot apparatus', lessonMatch: /blade|glass|capillary|splint|cut/i, lines: task === 'POTOMETER' ? ['Cut the stem away from your fingers with the blade.', 'The capillary tube is thin glass: handle it gently; report any breakage.'] : task === 'OXYGEN' ? ['Handle the glowing splint carefully and put it out in water afterwards.', 'Report broken glass; never pick it up with your fingers.'] : ['The tripod and gauze stay hot after the flame goes out.', 'Iodine stains skin and clothes: wipe spills at once.'] },
    ],
    questions: [
      task === 'STARCH'
        ? { q: 'The ethanol bottle carries this warning. Tap the symbol that means HIGHLY FLAMMABLE.', grid: true, options: flammable }
        : {
            q: task === 'POTOMETER' ? 'Water has spilt next to the fan’s plug. What do you do?' : 'The lamp’s lead is trailing across the wet bench. What do you do?',
            options: [
              { label: 'Carry on — it is only a little water', aria: 'carry', right: false, why: 'Water and mains electricity together can give a shock.' },
              { label: 'Switch off at the socket, dry the bench, and keep the lead away from the water', aria: 'safe', right: true, why: 'Right: electricity and water must be kept apart.' },
              { label: 'Mop it up with my hand while the lamp is on', aria: 'hand', right: false, why: 'Never touch electrical equipment with wet hands.' },
            ],
          },
      {
        q: task === 'STARCH' ? 'The leaf has been boiled. How do you decolourise it in ethanol?' : task === 'OXYGEN' ? 'Why put a water trough between the lamp and the beaker?' : 'How do you cut the shoot?',
        options:
          task === 'STARCH'
            ? [
                { label: 'Heat the tube of ethanol over the Bunsen flame', aria: 'flame', right: false, why: 'Ethanol catches fire: never heat it over a flame.' },
                { label: 'Turn the flame off, then stand the tube of ethanol in the hot water bath', aria: 'bath', right: true, why: 'Right: the hot water warms the ethanol safely.' },
              ]
            : task === 'OXYGEN'
              ? [
                  { label: 'To absorb the lamp’s heat and keep the temperature constant', aria: 'heat', right: true, why: 'Right: otherwise the warming changes the rate too.' },
                  { label: 'To make the light brighter', aria: 'bright', right: false, why: 'It does not brighten the light; it absorbs heat.' },
                ]
              : [
                  { label: 'Under water, cutting away from my fingers', aria: 'water', right: true, why: 'Right: no air enters the xylem, and the blade points away from you.' },
                  { label: 'In the air, towards my thumb', aria: 'air', right: false, why: 'Air enters the xylem, and the blade can slip into your thumb.' },
                ],
      },
    ],
  };
}

export const plantTour = (task: PlantTask) =>
  bioTour({
    focusId: task === 'OXYGEN' ? 'rig' : task === 'STARCH' ? 'bath' : 'potometer',
    focusLabel: task === 'OXYGEN' ? 'Pondweed' : task === 'STARCH' ? 'Water bath' : 'Potometer',
    task: task === 'OXYGEN' ? 'The task card lists the distances and what to count.' : task === 'STARCH' ? 'The task card lists the leaves and the steps of the test.' : 'The task card lists the conditions and what to time.',
  });

export const PLANT_ASK: Record<PlantTask, AskSuggestions> = {
  POTOMETER: {
    LEARN: ['What is transpiration?', 'Why cut the shoot under water?', 'What does a potometer measure?', 'Why seal the joint with Vaseline?'],
    DEMO: ['Why wait 5 minutes after each change?', 'Why does the fan speed it up?', 'How is the volume worked out?', 'Why does the dark slow it down?'],
    TRY: ['How do I work out the rate?', 'What goes on the bar chart?', 'What precautions can I write?', 'Is uptake the same as transpiration?'],
    SANDBOX: ['Why does Ixora take up water slowly?', 'What if I cut the shoot in air?', 'What if the joint leaks?', 'Why is humid air slower?'],
  },
  OXYGEN: {
    LEARN: ['Why add sodium hydrogencarbonate?', 'Why is light intensity 1/d²?', 'What is a limiting factor?', 'Why use a heat filter?'],
    DEMO: ['Why does the rate level off?', 'Why does bubbling stop far away?', 'How do I know the gas is oxygen?', 'Why count three times?'],
    TRY: ['How do I work out light intensity?', 'Should I join the points dot to dot?', 'What is the compensation point?', 'What precautions can I write?'],
    SANDBOX: ['What if there is no NaHCO₃?', 'What if the room is not dark?', 'Why does an old plant bubble slowly?', 'What limits the rate near the lamp?'],
  },
  STARCH: {
    LEARN: ['Why destarch the plant?', 'Why boil the leaf first?', 'Why must the flame be off for ethanol?', 'What does iodine show?'],
    DEMO: ['Why do the white parts stay brown?', 'Why soften the leaf?', 'What does the KOH do?', 'Why use foil on both sides?'],
    TRY: ['How do I count the grid squares?', 'What should my inference say?', 'Does ethanol remove starch?', 'What precautions can I write?'],
    SANDBOX: ['What if the plant was not destarched?', 'What if I skip the boiling?', 'Why does a dull day give less starch?', 'What if the foil lets light in?'],
  },
};
