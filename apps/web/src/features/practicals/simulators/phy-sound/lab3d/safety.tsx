import { Backpack, Ear, Flame, Music, Weight } from 'lucide-react';
import type { SafetyContent } from '../../../lab3d-kit/safety';

/** The resonance labs' door briefing: general rules, striking forks, the wire under tension, the masses on the hanger; then a short check. */
export const SOUND_SAFETY: SafetyContent = {
  cards: [
    { icon: <Backpack className="size-6" />, title: 'In the physics lab', lines: ['Bags under the bench, aisles clear. No running, no eating or drinking.', 'Report every breakage and every injury to the teacher at once.'] },
    { icon: <Music className="size-6" />, title: 'Striking the forks', lessonMatch: /fork|pad|bench|glass/i, lines: ['Strike a fork only on the rubber pad — never on the bench, a stool or the glass tube.', 'A hard knock damages the fork, adds harsh overtones and can crack the glass. Hold it by the stem, not the prongs.'] },
    { icon: <Weight className="size-6" />, title: 'The wire under tension', lessonMatch: /wire|snap|whip|tension|load/i, lines: ['Load the sonometer wire gradually: a snapping wire can whip and injure your eyes. Keep your face back from it.', 'Do not pluck or lean on the stretched wire; move the bridge with your fingers on the bridge only.'] },
    { icon: <Ear className="size-6" />, title: 'Masses on the hanger', lessonMatch: /mass|hanger|feet/i, lines: ['Add the slotted masses gently, one at a time, with the hanger hanging free of the bench.', 'Keep your feet clear under the hanger, and never let the load drop.'] },
    { icon: <Flame className="size-6" />, title: 'The fire point', lines: ['The CO₂ extinguisher and the fire blanket are by the front wall, left of the board.'] },
  ],
  questions: [
    {
      q: 'Where do you strike a tuning fork?',
      options: [
        { label: 'On the rubber pad', aria: 'pad', right: true, why: 'Right: it rings with a pure note and is not damaged.' },
        { label: 'On the edge of the bench', aria: 'bench', right: false, why: 'A hard surface damages the fork and gives harsh overtones.' },
      ],
    },
    {
      q: 'How do you load the sonometer wire?',
      options: [
        { label: 'Gradually, with my face back from the wire', aria: 'gradual', right: true, why: 'Right: a snapping wire can whip.' },
        { label: 'Drop all the masses on at once', aria: 'drop', right: false, why: 'A sudden jerk can snap the wire.' },
      ],
    },
    {
      q: 'The hanger is loaded. Where are your feet?',
      options: [
        { label: 'Clear of the space under the hanger', aria: 'clear', right: true, why: 'Right: a slipping mass falls straight down.' },
        { label: 'Under it, ready to catch a mass', aria: 'under', right: false, why: 'A falling 0.5 kg mass hurts: keep clear.' },
      ],
    },
  ],
};
