import { Backpack, Flame, Glasses, Hand, Pin, Plug, TriangleAlert, Zap } from 'lucide-react';
import type { SafetyCard, SafetyContent, SafetyQuestion } from '../../../lab3d-kit/safety';

/** The physics lab's door briefings: general rules, then the practical's own hazards, then a short check. */

const GENERAL: SafetyCard = {
  icon: <Backpack className="size-6" />,
  title: 'In the physics lab',
  lines: ['Bags under the bench, aisles clear. No running, no eating or drinking.', 'Report every breakage and every injury to the teacher at once.'],
};
const FIRE: SafetyCard = {
  icon: <Flame className="size-6" />,
  title: 'The fire point',
  lines: ['The CO₂ extinguisher and the fire blanket are by the front wall, left of the board.', 'Never use water on an electrical fire: switch off, then use CO₂.'],
};

function Sign({ kind }: { kind: 'electric' | 'fire' | 'eye' | 'exit' }) {
  return (
    <svg viewBox="0 0 100 100" className="size-full" aria-hidden>
      {kind === 'electric' && (
        <>
          <path d="M50 10 L92 86 H8 Z" fill="#ffd400" stroke="#111" strokeWidth="6" strokeLinejoin="round" />
          <path d="M54 32 L38 60 H50 L44 78 L64 50 H52 Z" fill="#111" />
        </>
      )}
      {kind === 'fire' && (
        <>
          <rect x="10" y="10" width="80" height="80" rx="6" fill="#c62828" />
          <path d="M50 24 C66 42 64 52 60 64 L40 64 C36 52 34 42 50 24 Z M34 70 H66 V76 H34 Z" fill="#fff" />
        </>
      )}
      {kind === 'eye' && (
        <>
          <circle cx="50" cy="50" r="40" fill="#1565c0" />
          <path d="M20 50 Q50 24 80 50 Q50 76 20 50 Z" fill="#fff" />
          <circle cx="50" cy="50" r="10" fill="#1565c0" />
        </>
      )}
      {kind === 'exit' && (
        <>
          <rect x="10" y="10" width="80" height="80" rx="6" fill="#14853b" />
          <path d="M30 70 L46 40 L58 48 L70 34" stroke="#fff" strokeWidth="8" fill="none" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

const signQuestion = (q: string, right: 'electric' | 'fire' | 'eye' | 'exit', why: Record<string, string>): SafetyQuestion => ({
  q,
  grid: true,
  options: (['electric', 'fire', 'eye', 'exit'] as const).map((k) => ({ label: <Sign kind={k} />, aria: k, right: k === right, why: why[k] ?? '' })),
});
const SIGN_WHY = {
  electric: 'The yellow triangle with a lightning flash: danger of electric shock.',
  fire: 'The red sign with a flame: fire-fighting equipment.',
  eye: 'The blue circle with an eye: eye protection must be worn.',
  exit: 'The green sign: the way out.',
};

export const PENDULUM_SAFETY: SafetyContent = {
  cards: [
    GENERAL,
    { icon: <TriangleAlert className="size-6" />, title: 'The retort stand and the bob', lessonMatch: /stand|topple|bob|swing/i, lines: ['Clamp the stand firmly, its base on the bench, so it cannot topple.', 'Keep a clear space around the swinging bob. Nobody stands in its path.'] },
    FIRE,
  ],
  questions: [
    {
      q: 'The retort stand wobbles when the bob swings. What do you do?',
      options: [
        { label: 'Carry on timing quickly', aria: 'carry on', right: false, why: 'It could topple onto someone, and a moving support also spoils the timing.' },
        { label: 'Stop, put the base square on the bench (weight it if needed) and tighten the clamp', aria: 'secure', right: true, why: 'Right: a rigid support is safe and keeps the period steady.' },
        { label: 'Hold the rod with one hand while timing', aria: 'hold', right: false, why: 'Your hand moves the support; secure the stand instead.' },
      ],
    },
    signQuestion('Tap the sign that shows where the FIRE-FIGHTING equipment is.', 'fire', SIGN_WHY),
  ],
};

export const ELECTRIC_SAFETY: SafetyContent = {
  cards: [
    GENERAL,
    { icon: <Zap className="size-6" />, title: 'Electricity', lessonMatch: /key|ammeter|mains|voltage/i, lines: ['Low-voltage cells only. The mains sockets are not for practicals.', 'Have your circuit checked before you close the key, and open the key between readings.'] },
    { icon: <Plug className="size-6" />, title: 'Wires and meters', lines: ['Never connect an ammeter straight across the cell: that is a short circuit.', 'Dry hands. Report warm, damaged or bare wires.'] },
    FIRE,
  ],
  questions: [
    signQuestion('Tap the sign that warns of ELECTRIC SHOCK.', 'electric', SIGN_WHY),
    {
      q: 'A connecting wire is getting hot and smells of burning. What do you do first?',
      options: [
        { label: 'Open the key (switch off), then tell the teacher', aria: 'switch off', right: true, why: 'Right: stop the current first. Never touch a hot wire.' },
        { label: 'Pour water on it', aria: 'water', right: false, why: 'Never use water on anything electrical: switch off, then a CO₂ extinguisher if it burns.' },
        { label: 'Pull the wire out with your fingers', aria: 'pull', right: false, why: 'It may burn you. Open the key first.' },
      ],
    },
    {
      q: 'Where does the ammeter go?',
      options: [
        { label: 'In series with the resistor', aria: 'series', right: true, why: 'Right: the same current flows through the ammeter and the resistor.' },
        { label: 'Across (in parallel with) the cell', aria: 'across cell', right: false, why: 'An ammeter has almost no resistance: across the cell it is a short circuit.' },
      ],
    },
  ],
};

export const OPTICS_SAFETY: SafetyContent = {
  cards: [
    GENERAL,
    { icon: <Pin className="size-6" />, title: 'Optical pins', lessonMatch: /pin/i, lines: ['Pins are sharp: push them in upright with your thumb on the head, and keep them in the pin box.', 'Never leave pins lying flat on the bench.'] },
    { icon: <Glasses className="size-6" />, title: 'The glass block', lessonMatch: /block|lamp|sun/i, lines: ['Check the block for chipped edges before you handle it, and carry it with both hands.', 'Never look at the Sun or a bright lamp through a block, lens or prism.'] },
    { icon: <Hand className="size-6" />, title: 'Broken glass', lines: ['Do not pick up broken glass: tell the teacher, who sweeps it into the glass bin.'] },
  ],
  questions: [
    {
      q: 'You have finished with an optical pin. Where does it go?',
      options: [
        { label: 'Back in the pin box', aria: 'pin box', right: true, why: 'Right: a loose pin can stab someone.' },
        { label: 'Flat on the bench', aria: 'bench', right: false, why: 'It is easy to put a hand on it: back in the box.' },
        { label: 'In my pocket', aria: 'pocket', right: false, why: 'It could stab you: back in the pin box.' },
      ],
    },
    {
      q: 'The glass block slips and breaks on the floor. What do you do?',
      options: [
        { label: 'Pick up the pieces quickly', aria: 'pick up', right: false, why: 'Broken glass cuts. Leave it and tell the teacher.' },
        { label: 'Stay clear and tell the teacher', aria: 'tell', right: true, why: 'Right: the teacher sweeps it up into the glass bin.' },
      ],
    },
    signQuestion('Tap the sign that means EYE PROTECTION must be worn.', 'eye', SIGN_WHY),
  ],
};
