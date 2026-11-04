import type { MagTask } from '@aischool/shared';
import { Backpack, Eye, Flame, Magnet, Zap } from 'lucide-react';
import type { SafetyCard, SafetyContent } from '../../../lab3d-kit/safety';

/** The magnetism bench's door briefings: general rules, the practical's own hazards (from the lesson), then a short check. */

const GENERAL: SafetyCard = { icon: <Backpack className="size-6" />, title: 'In the physics lab', lines: ['Bags under the bench, aisles clear. No running, no eating or drinking.', 'Report every breakage and every injury to the teacher at once.'] };
const FIRE: SafetyCard = { icon: <Flame className="size-6" />, title: 'The fire point', lines: ['The CO₂ extinguisher (for electrical fires) and the fire blanket are by the front wall.'] };
const CELLS: SafetyCard = { icon: <Zap className="size-6" />, title: 'Cells and wires', lessonMatch: /short|warm|current|resistor/i, lines: ['Never join the terminals of a cell with a bare wire: a short circuit makes the wire and the cell hot.', 'Close the key only while you take a reading.'] };

export const MAG_SAFETY: Record<MagTask, SafetyContent> = {
  FIELD: {
    cards: [
      GENERAL,
      { icon: <Eye className="size-6" />, title: 'Iron filings', lessonMatch: /filings|eyes/i, lines: ['Keep iron filings away from your eyes; never blow them.', 'Tip them back into the shaker over a sheet of paper.'] },
      { icon: <Magnet className="size-6" />, title: 'Magnets and steel', lessonMatch: /phones|keys|steel/i, lines: ['Keep phones, keys and steel objects away from the board.', 'Do not drop the magnets: they lose strength and chip.'] },
      FIRE,
    ],
    questions: [
      { q: 'Your keys are on the bench next to the paper. What do you do?', options: [{ label: 'Put them away in my bag', aria: 'away', right: true, why: 'Right: steel near the board bends the field you are plotting.' }, { label: 'Leave them: they are small', aria: 'leave', right: false, why: 'Even small steel objects distort the field and move the neutral points.' }] },
      { q: 'Some iron filings spill. What do you do?', options: [{ label: 'Collect them on paper, without blowing', aria: 'collect', right: true, why: 'Right: blown filings get into eyes.' }, { label: 'Blow them off the bench', aria: 'blow', right: false, why: 'Never blow filings — they can get into your eyes.' }] },
    ],
  },
  ELECTROMAGNET: {
    cards: [GENERAL, { ...CELLS, lines: ['The coil and the cells get warm — close the key only briefly.', 'Do not short-circuit the cells.'] }, FIRE],
    questions: [{ q: 'Between readings, the key should be…', options: [{ label: 'Open', aria: 'open', right: true, why: 'Right: the coil and cells stay cool and the current steady.' }, { label: 'Closed, to save time', aria: 'closed', right: false, why: 'The coil warms, the cells run down and the current falls.' }] }],
  },
  INDUCTION: {
    cards: [GENERAL, { icon: <Magnet className="size-6" />, title: 'The magnets', lessonMatch: /drop|magnets/i, lines: ['Do not drop the magnets — they lose strength and may chip.', 'Keep them away from the galvanometer, watches and phones.'] }, FIRE],
    questions: [{ q: 'You put a magnet down. Where?', options: [{ label: 'Flat on the bench, away from the edge', aria: 'flat', right: true, why: 'Right: it cannot roll off and drop.' }, { label: 'On top of the galvanometer', aria: 'galvanometer', right: false, why: 'It pulls the needle and could fall.' }] }],
  },
  DIODE: {
    cards: [GENERAL, { icon: <Zap className="size-6" />, title: 'The protective resistor', lessonMatch: /protective|rated/i, lines: ['Always include the protective resistor: a forward-biased diode without one can draw a damaging current.', 'Do not exceed the diode’s rated current; turn the potentiometer up slowly.'] }, CELLS, FIRE],
    questions: [{ q: 'Before you turn the potentiometer up in forward bias, you check…', options: [{ label: 'That the protective resistor is in series', aria: 'resistor', right: true, why: 'Right: it limits the current.' }, { label: 'Nothing: the cells are only 4.5 V', aria: 'nothing', right: false, why: 'Without the resistor even 1–2 V across a diode drives a huge current.' }] }],
  },
};
