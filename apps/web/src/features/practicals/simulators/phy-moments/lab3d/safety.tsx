import { Backpack, Eye, Flame, Footprints, Wind } from 'lucide-react';
import type { SafetyContent } from '../../../lab3d-kit/safety';

/** The knife edge's door briefing: general rules, falling masses, the rule's ends, draughts; then a short check. */
export const BALANCE_SAFETY: SafetyContent = {
  cards: [
    { icon: <Backpack className="size-6" />, title: 'In the physics lab', lines: ['Bags under the bench, aisles clear. No running, no eating or drinking.', 'Report every breakage and every injury to the teacher at once.'] },
    { icon: <Footprints className="size-6" />, title: 'Hanging masses', lessonMatch: /mass|bench/i, lines: ['Keep the masses low over the bench, so they cannot fall far or onto your feet.', 'Tie the thread loops firmly; check a loop before you hang a mass on it.'] },
    { icon: <Eye className="size-6" />, title: 'The rule’s ends', lines: ['A tipping rule swings its ends quickly: keep your face away from them when you let go.', 'Never lean on the rule or the knife edge.'] },
    { icon: <Wind className="size-6" />, title: 'Draughts', lessonMatch: /draught/i, lines: ['Switch off the fan over your bench and close nearby windows: a draught moves the balance.'] },
    { icon: <Flame className="size-6" />, title: 'The fire point', lines: ['The CO₂ extinguisher and the fire blanket are by the front wall, left of the board.'] },
  ],
  questions: [
    {
      q: 'Where should the hanging masses be?',
      options: [
        { label: 'Low over the bench', aria: 'low', right: true, why: 'Right: if a loop slips the mass falls only a little way.' },
        { label: 'Out over the edge of the bench', aria: 'over the edge', right: false, why: 'A falling mass would drop onto your feet.' },
        { label: 'As high as possible', aria: 'high', right: false, why: 'The further it can fall, the more damage it does.' },
      ],
    },
    {
      q: 'The fan over your bench is on. What do you do?',
      options: [
        { label: 'Ask to switch it off', aria: 'switch off', right: true, why: 'Right: a draught pushes on the rule and moves the balance point.' },
        { label: 'Leave it: it is hot', aria: 'leave it', right: false, why: 'The draught gives false balance points.' },
      ],
    },
    {
      q: 'You let go of the rule and it tips. Where is your face?',
      options: [
        { label: 'Well back from the rule', aria: 'back', right: true, why: 'Right: the ends swing quickly.' },
        { label: 'Close to the end, to watch it', aria: 'close', right: false, why: 'The end can hit you: watch from a little way back, level with the pointer.' },
      ],
    },
  ],
};
