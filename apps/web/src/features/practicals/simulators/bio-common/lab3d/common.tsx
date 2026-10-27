import { Hand, Shirt, Utensils } from 'lucide-react';
import { setAssistant } from '../../../lab3d-kit/assistant-profile';
import type { Explainer } from '../../../lab3d-kit/explain';
import type { LabAction, ObjectPanel } from '../../../lab3d-kit/hud';
import { HazardIcon, type Hazard, type SafetyContent } from '../../../lab3d-kit/safety';
import { play, startPour, stopPour } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { defaultTourSteps, type TourOptions, type TourStep } from '../../../lab3d-kit/tour';

/**
 * Shared by the two biology 3D labs (microscope, specimen bench): the
 * assistant, the door briefing, the room objects' menus and "What is this?"
 * cards, hand washing, and the controls tour worded for the biology room.
 */

/** Mrs Okon, the biology lab technician (set on every render: another lab may have set its own assistant since). */
export const useBioAssistant = () => setAssistant({ name: 'Mrs Okon', role: 'biology lab technician', look: 'ada', pronoun: 'her' });

/** The biology door briefing: coat and hands, behaviour, sharps / slides / specimens. */
export function bioSafety(extra: 'microscope' | 'specimens'): SafetyContent {
  const toxic = (['flame', 'corrosive', 'toxic', 'harmful'] as Hazard[]).map((k) => ({
    label: <HazardIcon kind={k} />,
    aria: k,
    right: k === 'toxic',
    why: k === 'toxic' ? 'Right: the skull and crossbones means toxic. Formalin can harm you if you breathe it, swallow it or get it on your skin.' : k === 'flame' ? 'That is the flame: flammable. Toxic is the skull and crossbones.' : k === 'corrosive' ? 'That is corrosive (it eats into surfaces and skin). Toxic is the skull and crossbones.' : 'That is the exclamation mark: harmful or irritant. Toxic is the skull and crossbones.',
  }));
  return {
    cards: [
      { icon: <Shirt className="size-6" />, title: 'Protect yourself', lessonMatch: /coat|glove|microscope|carry/i, lines: ['Wear your lab coat, buttoned. Tie back long hair.', extra === 'specimens' ? 'Wear disposable gloves to handle preserved specimens.' : 'Keep stains off your skin and clothes: iodine and methylene blue stain for days.'] },
      { icon: <Utensils className="size-6" />, title: 'Behave safely', lines: ['No eating, drinking or chewing in the laboratory.', 'Wash your hands at the hand-washing point before you leave.', 'Report every cut and every breakage to the teacher at once.'] },
      {
        icon: <Hand className="size-6" />,
        title: extra === 'specimens' ? 'Specimens and sharps' : 'Sharps and slides',
        lessonMatch: /scalpel|razor|blade|sharp|swab|disinfect|slide|specimen/i,
        lines:
          extra === 'specimens'
            ? ['Preserved specimens are kept in formalin: do not open the jars, and keep your hands away from your face.', 'Cut away from your fingers with a scalpel; broken glass goes in the sharps bin.']
            : ['Cut away from your fingers with a scalpel or razor blade.', 'Cover slips and slides break easily: used and broken ones go in the sharps bin; cheek swabs go in the disinfectant.'],
      },
    ],
    questions: [
      { q: 'Preserved specimens are kept in formalin. Tap the symbol that means TOXIC.', grid: true, options: toxic },
      extra === 'specimens'
        ? {
            q: 'You have finished handling the preserved specimens. What do you do before you leave?',
            options: [
              { label: 'Wipe my hands on my lab coat', aria: 'wipe', right: false, why: 'Formalin and germs stay on the coat and your skin.' },
              { label: 'Take off my gloves, then wash my hands with soap and water', aria: 'wash', right: true, why: 'Right: the gloves go in the bin and soap and water remove anything left on your skin.' },
              { label: 'Nothing — I wore gloves', aria: 'nothing', right: false, why: 'Gloves can tear and you touch them when you take them off: always wash your hands.' },
            ],
          }
        : {
            q: 'You have used a cotton bud to take cheek cells. Where does it go?',
            options: [
              { label: 'In the waste bin', aria: 'bin', right: false, why: 'It carries saliva and cells: it must be disinfected first.' },
              { label: 'Into the beaker of disinfectant', aria: 'disinfectant', right: true, why: 'Right: the disinfectant kills any microbes on it.' },
              { label: 'Back in its packet for later', aria: 'packet', right: false, why: 'Never reuse a swab: use a fresh, sterile one every time.' },
            ],
          },
      {
        q: 'How do you carry a microscope?',
        options: [
          { label: 'By the arm, with one hand', aria: 'arm', right: false, why: 'It can swing and the base can hit something. Use two hands.' },
          { label: 'One hand under the base, the other holding the arm', aria: 'two', right: true, why: 'Right: it is heavy and its lenses are fragile.' },
          { label: 'By the eyepiece tube', aria: 'tube', right: false, why: 'The eyepiece can slide out, and the microscope falls.' },
        ],
      },
    ],
  };
}

/** "What is this?" cards for the biology room's own objects. */
export const BIO_ROOM_EXPLAIN: Record<string, Explainer> = {
  coat: { name: 'Lab coat', purpose: 'Protects your skin and clothes from stains, specimens and spills.', how: 'Wear it buttoned for the whole practical.', mistake: 'Leaving it on the hook.', keys: ['coat'] },
  goggles: { name: 'Safety goggles', purpose: 'Protect your eyes from splashes.', how: 'Wear them when you pour or squirt liquids that could splash.', mistake: 'Rubbing your eyes with a gloved or dirty hand.', keys: ['eyes'] },
  handwash: { name: 'Hand-washing point', purpose: 'Soap, water and paper towels for washing your hands.', how: 'Wet, soap and rub for 20 seconds, rinse, dry with a paper towel and turn the tap off with your elbow.', mistake: 'Leaving the lab without washing your hands.', keys: ['wash'] },
  shelf: { name: 'Specimen shelf', purpose: 'Preserved specimens in formalin, skulls and models for study.', how: 'Look but do not open the jars; ask the teacher before taking anything down.', mistake: 'Opening a jar: formalin fumes are toxic.', keys: ['formalin', 'preserved'] },
  skeleton: { name: 'Human skeleton model', purpose: 'Shows the bones of the body: skull, vertebral column, ribs, girdles and limbs.', how: 'Compare the vertebrae, girdles and limb bones on your tray with it.', mistake: 'Confusing the humerus (upper arm) with the femur (thigh).', keys: ['skeleton', 'bone'] },
  torso: { name: 'Human torso model', purpose: 'Shows the organs in the chest and abdomen: lungs, heart, liver, stomach and intestines.', how: 'Look at where each organ lies and what it is next to.', mistake: 'Placing the heart on the right: it lies slightly to the left.', keys: ['heart', 'kidney'] },
  'chart-cells': { name: 'Chart: plant and animal cells', purpose: 'Compares a plant cell (cell wall, large vacuole, chloroplasts) with an animal cell (no wall, small vacuoles).', how: 'Use it to check what you can see under the microscope.', mistake: 'Labelling chloroplasts in onion or cheek cells.', keys: ['cell'] },
  'chart-food': { name: 'Chart: a food chain', purpose: 'Energy passes from the producer to the consumers along the arrows.', how: 'The arrow points from the food to the feeder.', mistake: 'Drawing the arrows the wrong way round.', keys: [] },
  'chart-class': { name: 'Chart: classification', purpose: 'The ranks from kingdom to species, and the five kingdoms.', how: 'Use it to classify the specimens on your bench.', mistake: 'Mixing up a kingdom with a phylum.', keys: ['classif', 'kingdom'] },
  extinguisher: { name: 'Fire extinguisher', purpose: 'Puts out small fires.', how: 'Tell the teacher first. Pull the pin, aim at the base of the fire, squeeze and sweep.', mistake: 'Not knowing where it is before you start.', keys: [] },
  firstaid: { name: 'First-aid box', purpose: 'Plasters and dressings for small cuts.', how: 'Tell the teacher about every cut, however small.', mistake: 'Hiding a cut from a slide or a blade.', keys: ['cut'] },
  eyewash: { name: 'Eye-wash station', purpose: 'Rinses stains or chemicals out of the eyes.', how: 'Rinse the eye with plenty of water for at least 10 minutes and tell the teacher.', mistake: 'Rubbing the eye instead of rinsing it.', keys: ['eyes'] },
};

const view = () => useLabView.getState();

/** Washes the hands at the hand-washing point (with the sound of the tap). */
export function washHands(note: (a: string) => void) {
  startPour();
  play('tick');
  setTimeout(stopPour, 1300);
  note('wash-hands');
  view().set({ selected: null });
  notify('Hands washed with soap and water, and dried with a paper towel.', 'success', 2200);
}

/** The biology room objects' menus (null: not a room object). */
export function bioRoomPanel(id: string, o: { coat: boolean; goggles: boolean; note: (a: string) => void; open: (w: 'cupboard') => void; benchInfo: string; whiteboard: string }): ObjectPanel | null {
  const wear = (what: 'coat' | 'goggles'): LabAction =>
    (what === 'coat' ? o.coat : o.goggles)
      ? { key: 'off', label: what === 'coat' ? 'Take off the lab coat' : 'Take off the goggles', run: () => o.note(`safety-off:${what}`) }
      : {
          key: 'on',
          label: what === 'coat' ? 'Put on the lab coat' : 'Put on the goggles',
          tone: 'brand',
          run: () => {
            o.note(`safety:${what}`);
            view().set({ selected: null });
            notify(what === 'coat' ? 'Lab coat on.' : 'Goggles on.', 'success', 1400);
          },
        };
  switch (id) {
    case 'coat':
      return { title: 'Lab coat', info: 'Wear a buttoned lab coat in the laboratory.', actions: [wear('coat')] };
    case 'goggles':
      return { title: 'Safety goggles', info: 'Not needed at the microscope or the specimen bench, but wear them whenever liquids could splash.', actions: [wear('goggles')] };
    case 'handwash':
      return { title: 'Hand-washing point', info: 'Soap, running water and paper towels.', actions: [{ key: 'wash', label: 'Wash my hands', tone: 'brand', run: () => washHands(o.note) }] };
    case 'cupboard':
      return { title: 'Microscope and apparatus cupboard', info: 'Microscopes and the small apparatus for today’s practical.', actions: [{ key: 'list', label: 'Choose apparatus…', tone: 'brand', run: () => o.open('cupboard') }] };
    case 'mybench':
      return {
        title: 'Your bench',
        info: o.benchInfo,
        actions:
          view().mode === 'walk'
            ? [{ key: 'sit', label: 'Work at my bench', tone: 'brand', run: () => view().set({ mode: 'bench', focus: 'bench', selected: null }) }]
            : [{ key: 'stand', label: 'Stand up and walk', run: () => view().set({ mode: 'walk', selected: null, held: null }) }],
      };
    case 'shelf':
      return { title: 'Specimen shelf', info: 'Preserved specimens in formalin, skulls and models. Your own specimens are on your bench.', actions: [] };
    case 'skeleton':
      return { title: 'Human skeleton model', info: 'Skull, vertebral column, rib cage, the pectoral and pelvic girdles, and the limb bones.', actions: [] };
    case 'torso':
      return { title: 'Human torso model', info: 'Lungs, heart, liver, stomach and intestines in their places.', actions: [] };
    case 'chart-cells':
      return { title: 'Plant and animal cells', info: 'Plant cells have a cell wall, a large vacuole and (in green parts) chloroplasts; animal cells have only a membrane.', actions: [] };
    case 'chart-food':
      return { title: 'A food chain', info: 'Sun → grass → grasshopper → lizard → hawk. The arrows show the flow of energy.', actions: [] };
    case 'chart-class':
      return { title: 'Classification', info: 'Kingdom, phylum, class, order, family, genus, species — and the five kingdoms.', actions: [] };
    case 'extinguisher':
      return { title: 'Fire extinguisher', info: 'Know where it is before you start.', actions: [] };
    case 'firstaid':
      return { title: 'First-aid box', info: 'Report every cut to the teacher.', actions: [] };
    case 'eyewash':
      return { title: 'Eye-wash station', info: 'If anything splashes in your eyes, rinse them here for 10 minutes and tell the teacher.', actions: [] };
    case 'whiteboard':
      return { title: 'Whiteboard', info: o.whiteboard, actions: [] };
    case 'desk':
      return { title: 'Teacher’s desk', info: 'Ask the teacher if you are unsure — the hint bar at the top shows the next step in practice mode.', actions: [] };
  }
  return null;
}

/** The kit's controls tour, worded for the biology room. */
export function bioTour(o: TourOptions & { task: string }): TourStep[] {
  return defaultTourSteps(o).map((s) =>
    s.id === 'welcome'
      ? { ...s, title: 'Welcome to the biology lab', body: () => 'This is a school biology lab in 3D. A one-minute tour shows you how to move and work. You can skip it and replay it any time from Help.' }
      : s.id === 'task'
        ? { ...s, body: () => `${o.task} Open it now.` }
        : s.id === 'tap'
          ? { ...s, body: (c) => `${c.touch ? 'Tap' : 'Click'} anything to see what it is and what you can do with it — try Mrs Okon by the teacher’s desk, the skeleton or a wall chart.` }
          : s,
  );
}

/** Where Mrs Okon stands at the student's bench during Learn and the demo: beside its left end on your side, clear of the microscope and the specimens (station-local x, z). */
export const OKON_SPOT: [number, number] = [-1.9, 0.2];
