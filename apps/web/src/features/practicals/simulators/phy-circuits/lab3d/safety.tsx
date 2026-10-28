import { Hand } from 'lucide-react';
import type { SafetyContent } from '../../../lab3d-kit/safety';
import { ELECTRIC_SAFETY } from '../../phy-common/lab3d/safety';

/** The door briefing: the physics lab's electrical rules, plus the jockey and the cell for these practicals. */
export const CIRCUITS_SAFETY: SafetyContent = {
  cards: [
    ...ELECTRIC_SAFETY.cards.slice(0, -1),
    { icon: <Hand className="size-6" />, title: 'The jockey and the cell', lessonMatch: /jockey|scrape|cell/i, lines: ['Tap the jockey lightly on the bridge wire; dragging it scrapes the wire.', 'Never leave the key closed: the dry cell runs down and gets warm.'] },
    ...ELECTRIC_SAFETY.cards.slice(-1),
  ],
  questions: [
    ...ELECTRIC_SAFETY.questions,
    {
      q: 'How do you find the balance point on a metre bridge?',
      options: [
        { label: 'Tap the jockey at points along the wire', aria: 'tap', right: true, why: 'Right: tap, look at the galvanometer, lift and move, tap again.' },
        { label: 'Press the jockey down and slide it along', aria: 'slide', right: false, why: 'Sliding it while pressed scrapes the wire, so it is no longer uniform.' },
      ],
    },
  ],
};
