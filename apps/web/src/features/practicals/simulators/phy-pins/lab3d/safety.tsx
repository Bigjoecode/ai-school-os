import type { PinsTask } from '@aischool/shared';
import { Backpack, Flame, Glasses, Hand, Pin, Sun, Triangle } from 'lucide-react';
import type { SafetyContent } from '../../../lab3d-kit/safety';

/** The pin labs' door briefing: pins are sharp, glass has sharp edges, never look at the Sun through a prism; then a short check. */
export function pinsSafety(task: PinsTask): SafetyContent {
  const glass =
    task === 'MIRROR'
      ? { icon: <Glasses className="size-6" />, title: 'The mirror', lessonMatch: /mirror|glass|edge/i, lines: ['The mirror’s glass edges can be sharp: hold it by its holder, and report a chipped or cracked mirror.'] }
      : task === 'DEPTH'
        ? { icon: <Glasses className="size-6" />, title: 'Glass blocks', lessonMatch: /block|glass|edge/i, lines: ['Glass blocks have sharp edges and corners: check for chips, carry them with both hands and stack them gently.'] }
        : { icon: <Triangle className="size-6" />, title: 'The glass prism', lessonMatch: /prism|edge|glass/i, lines: ['A prism has sharp edges: handle it by its triangular ends, check for chips, and never let it roll off the bench.'] };
  return {
    cards: [
      { icon: <Backpack className="size-6" />, title: 'In the physics lab', lines: ['Bags under the bench, aisles clear. No running, no eating or drinking.', 'Report every breakage and every injury to the teacher at once.'] },
      { icon: <Pin className="size-6" />, title: 'Optical pins are sharp', lessonMatch: /pin/i, lines: ['Push pins in upright with your thumb on the head; never leave them lying flat.', 'Keep them in the pin box when you are not using them.'] },
      glass,
      { icon: <Sun className="size-6" />, title: 'Never look at the Sun', lessonMatch: /sun|lamp|bright/i, lines: ['Never look at the Sun — or a bright lamp — through a prism, lens or block: it can damage your eyes permanently.', task === 'DISP' ? 'The ray box lamp gets hot: do not touch it, and switch it off when you finish.' : 'Use the room light only.'] },
      { icon: <Hand className="size-6" />, title: 'Broken glass', lines: ['Do not pick up broken glass: stay clear and tell the teacher, who sweeps it into the glass bin.'] },
      { icon: <Flame className="size-6" />, title: 'The fire point', lines: ['The CO₂ extinguisher and the fire blanket are by the front wall, left of the board.'] },
    ],
    questions: [
      {
        q: 'You have finished with an optical pin. Where does it go?',
        options: [
          { label: 'Back in the pin box', aria: 'pin box', right: true, why: 'Right: a loose pin can stab someone.' },
          { label: 'Flat on the bench', aria: 'bench', right: false, why: 'It is easy to put a hand on it: back in the box.' },
        ],
      },
      {
        q: 'Can you look at the Sun through the prism to see the colours?',
        options: [
          { label: 'No — never look at the Sun through a prism or lens', aria: 'no', right: true, why: 'Right: it can blind you. Use the ray box in a darkened room.' },
          { label: 'Yes, for a short moment', aria: 'yes', right: false, why: 'Even a moment can damage your eyes permanently.' },
        ],
      },
      {
        q: task === 'DEPTH' ? 'A glass block has a chipped corner. What do you do?' : 'The prism slips and breaks on the floor. What do you do?',
        options: [
          { label: 'Tell the teacher and keep clear', aria: 'tell', right: true, why: 'Right: glass edges cut. The teacher deals with it.' },
          { label: task === 'DEPTH' ? 'Use it anyway, carefully' : 'Pick up the pieces quickly', aria: 'carry on', right: false, why: 'Sharp glass cuts: tell the teacher.' },
        ],
      },
    ],
  };
}
