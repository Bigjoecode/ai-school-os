import { Glasses, Hand, Utensils } from 'lucide-react';
import { HazardIcon, type Hazard, type SafetyCard, type SafetyContent, type SafetyQuestion } from './safety';

/** The chemistry lab's door briefing (goggles and coat, behaviour, pipettes and spills; hazard symbols, splashes, pipette filler). */
const CARDS: SafetyCard[] = [
  { icon: <Glasses className="size-6" />, title: 'Protect yourself', lines: ['Wear your safety goggles over your eyes the whole time.', 'Wear your lab coat, buttoned. Tie back long hair.'] },
  { icon: <Utensils className="size-6" />, title: 'Behave safely', lines: ['No eating or drinking in the lab.', 'Report every spill and every breakage to the teacher at once.', 'Wash your hands before you leave.'] },
  { icon: <Hand className="size-6" />, title: 'Pipettes and spills', lessonMatch: /pipette|spill|skin|goggles/i, lines: ['Never pipette by mouth: always use the pipette filler.', 'Acid or alkali on your skin: rinse with plenty of water and tell the teacher.'] },
];

const QUESTIONS: SafetyQuestion[] = [
  {
    q: 'Tap the symbol that means CORROSIVE (acids and alkalis carry it).',
    grid: true,
    options: (['flame', 'corrosive', 'toxic', 'harmful'] as Hazard[]).map((k) => ({
      label: <HazardIcon kind={k} />,
      aria: k,
      right: k === 'corrosive',
      why: k === 'corrosive' ? 'Right: liquid eating into a surface and a hand.' : k === 'flame' ? 'That is the flame: flammable. Corrosive shows liquid eating into a surface and a hand.' : k === 'toxic' ? 'That is the skull: toxic. Corrosive shows liquid eating into a surface and a hand.' : 'That is the exclamation mark: harmful or irritant. Corrosive shows liquid eating into a surface and a hand.',
    })),
  },
  {
    q: 'A little acid splashes onto your hand. What do you do first?',
    options: [
      { label: 'Wipe it on my lab coat and carry on', aria: 'wipe', right: false, why: 'The acid keeps burning your skin and soaks into the coat.' },
      { label: 'Rinse with plenty of running water, then tell the teacher', aria: 'rinse', right: true, why: 'Right: water dilutes and washes the acid away quickly.' },
      { label: 'Add some alkali to neutralise it', aria: 'alkali', right: false, why: 'Never: alkalis burn too, and the reaction gives out heat.' },
    ],
  },
  {
    q: 'How do you draw 25.0 cm³ of B into the pipette?',
    options: [
      { label: 'Suck it up gently by mouth', aria: 'mouth', right: false, why: 'Never pipette by mouth — B is corrosive.' },
      { label: 'Use the pipette filler', aria: 'filler', right: true, why: 'Right: the filler draws the liquid up safely.' },
    ],
  },
];


export const CHEM_SAFETY: SafetyContent = { cards: CARDS, questions: QUESTIONS };
