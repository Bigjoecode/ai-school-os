import { Backpack, Eye, Flame, Footprints, Weight } from 'lucide-react';
import type { SafetyContent } from '../../../lab3d-kit/safety';

/** The spring's door briefing: general rules, falling masses, the elastic limit, a stable stand; then a short check. */
export const SPRING_SAFETY: SafetyContent = {
  cards: [
    { icon: <Backpack className="size-6" />, title: 'In the physics lab', lines: ['Bags under the bench, aisles clear. No running, no eating or drinking.', 'Report every breakage and every injury to the teacher at once.'] },
    { icon: <Footprints className="size-6" />, title: 'Falling masses', lessonMatch: /fall|feet|box|tray/i, lines: ['A box sits on the floor under the load to catch a mass that slips off. Keep your feet clear of it.', 'Add masses gently, one at a time; never drop them onto the hanger.'] },
    { icon: <Weight className="size-6" />, title: 'The elastic limit', lessonMatch: /elastic|displacement|fly/i, lines: ['Do not stretch the spring beyond its elastic limit: it stays stretched and is spoilt.', 'For oscillations, pull the hanger down only 1–2 cm, so the masses do not jump off.'] },
    { icon: <Eye className="size-6" />, title: 'The stand', lessonMatch: /stable|stand/i, lines: ['Clamp the stand firmly near the bench edge, with its base on the bench, so it cannot tip over with the load.', 'Keep your face back from a stretched spring.'] },
    { icon: <Flame className="size-6" />, title: 'The fire point', lines: ['The CO₂ extinguisher and the fire blanket are by the front wall, left of the board.'] },
  ],
  questions: [
    {
      q: 'Where should your feet be?',
      options: [
        { label: 'Clear of the box under the load', aria: 'clear', right: true, why: 'Right: if a mass slips off it lands in the box.' },
        { label: 'Under the hanger, to catch a mass', aria: 'under', right: false, why: 'A falling 50 g mass hurts: keep your feet clear.' },
      ],
    },
    {
      q: 'The extensions stop going up in equal steps. What do you do?',
      options: [
        { label: 'Stop adding masses and take them off', aria: 'stop', right: true, why: 'Right: you are near the elastic limit. Beyond it the spring is spoilt.' },
        { label: 'Add more to see what happens', aria: 'more', right: false, why: 'Past the elastic limit the spring stays stretched for good.' },
      ],
    },
    {
      q: 'How far should you pull the hanger down to set it oscillating?',
      options: [
        { label: 'About 1–2 cm', aria: 'small', right: true, why: 'Right: small oscillations are simple harmonic and the masses stay on.' },
        { label: 'As far as it will go', aria: 'far', right: false, why: 'The masses would fly off at the top, and the spring may be overstretched.' },
      ],
    },
  ],
};
