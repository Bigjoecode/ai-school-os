import { Backpack, Flame, Hand, Lamp, Sun } from 'lucide-react';
import type { SafetyContent } from '../../../lab3d-kit/safety';

/** The optical bench's door briefing: general rules, the lamp, sunlight through a lens or mirror, glass; then a short check. */
export const BENCH_SAFETY: SafetyContent = {
  cards: [
    { icon: <Backpack className="size-6" />, title: 'In the physics lab', lines: ['Bags under the bench, aisles clear. No running, no eating or drinking.', 'Report every breakage and every injury to the teacher at once.'] },
    { icon: <Lamp className="size-6" />, title: 'The lamp box', lessonMatch: /lamp|hot/i, lines: ['The lamp housing gets hot: move the object by its holder, never by the lamp box.', 'Switch the lamp off at the end, and tell the teacher about a damaged lead.'] },
    { icon: <Sun className="size-6" />, title: 'Sunlight and lenses', lessonMatch: /sun|focus/i, lines: ['Never focus sunlight on paper, skin or anyone’s eyes: a lens or concave mirror can burn.', 'Never look at the Sun through a lens or in a mirror. Use a window or a distant tree for the rough focus.'] },
    { icon: <Hand className="size-6" />, title: 'Lenses and mirrors', lines: ['Hold them by the edge or the holder: fingerprints on the surface blur the image.', 'Do not pick up broken glass: tell the teacher.'] },
    { icon: <Flame className="size-6" />, title: 'The fire point', lines: ['The CO₂ extinguisher and the fire blanket are by the front wall, left of the board.'] },
  ],
  questions: [
    {
      q: 'You want a rough focal length. What do you focus on the screen?',
      options: [
        { label: 'The Sun', aria: 'sun', right: false, why: 'Never: focused sunlight burns, and it can damage your eyes.' },
        { label: 'A distant window or tree', aria: 'window', right: true, why: 'Right: light from far away comes to a focus at about f.' },
        { label: 'The lamp, 10 cm away', aria: 'lamp', right: false, why: 'A near object is not focused at f; use something far away.' },
      ],
    },
    {
      q: 'The object has to move along the rule. How do you move it?',
      options: [
        { label: 'By the lamp box', aria: 'lamp box', right: false, why: 'The lamp housing gets hot: it can burn you.' },
        { label: 'By its holder, on the rule', aria: 'holder', right: true, why: 'Right: and keep the holder’s index line on the scale.' },
      ],
    },
    {
      q: 'How should you hold the lens?',
      options: [
        { label: 'By its edge or holder', aria: 'edge', right: true, why: 'Right: a clean lens gives a sharp image.' },
        { label: 'With a thumb on each face', aria: 'faces', right: false, why: 'Fingerprints and grease scatter the light and blur the image.' },
      ],
    },
  ],
};
