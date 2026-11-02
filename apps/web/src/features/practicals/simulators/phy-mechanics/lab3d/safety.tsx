import type { MechTask } from '@aischool/shared';
import { Backpack, Droplets, Flame, Footprints, Hand, Weight } from 'lucide-react';
import type { SafetyCard, SafetyContent } from '../../../lab3d-kit/safety';

/** The mechanics bench's door briefings: general rules, the practical's own hazards (from the lesson), then a short check. */

const GENERAL: SafetyCard = { icon: <Backpack className="size-6" />, title: 'In the physics lab', lines: ['Bags under the bench, aisles clear. No running, no eating or drinking.', 'Report every breakage and every injury to the teacher at once.'] };
const FIRE: SafetyCard = { icon: <Flame className="size-6" />, title: 'The fire point', lines: ['The CO₂ extinguisher and the fire blanket are by the front wall, left of the board.'] };

export const MECH_SAFETY: Record<MechTask, SafetyContent> = {
  FRICTION: {
    cards: [
      GENERAL,
      { icon: <Hand className="size-6" />, title: 'The slipping block', lessonMatch: /fingers|slips/i, lines: ['Keep your fingers clear of the front of the block: it can slip suddenly.', 'Do not pull the spring balance past 10 N: the spring is damaged.'] },
      { icon: <Footprints className="size-6" />, title: 'The raised plank', lessonMatch: /plank|support/i, lines: ['Support the raised plank firmly with one hand; lower it gently.', 'Keep the slotted masses on the bench, not near its edge.'] },
      FIRE,
    ],
    questions: [
      { q: 'You raise the plank. What do you do with your other hand?', options: [{ label: 'Support the plank firmly', aria: 'support', right: true, why: 'Right: a falling plank can trap fingers or knock the masses off.' }, { label: 'Hold the block still', aria: 'hold the block', right: false, why: 'Then you cannot see when it would slip — and the plank is unsupported.' }] },
      { q: 'Where should your fingers be when you pull?', options: [{ label: 'On the balance’s ring, behind the block', aria: 'behind', right: true, why: 'Right: clear of the block when it slips.' }, { label: 'In front of the block', aria: 'in front', right: false, why: 'The block can jerk forward onto them.' }] },
    ],
  },
  VISCOSITY: {
    cards: [
      GENERAL,
      { icon: <Droplets className="size-6" />, title: 'Spilt glycerine and oil', lessonMatch: /glycerine|slippery/i, lines: ['Wipe up any spilt glycerine or oil at once — it is very slippery on the floor.', 'Stand the tall cylinders well back from the edge of the bench.'] },
      { icon: <Weight className="size-6" />, title: 'The ball bearings', lines: ['Keep the balls in their dish; a ball on the floor is a slipping hazard.', 'Recover them with the magnet up the outside of the cylinder — never reach in.'] },
      FIRE,
    ],
    questions: [
      { q: 'A drop of glycerine falls on the floor. What do you do?', options: [{ label: 'Wipe it up at once', aria: 'wipe', right: true, why: 'Right: glycerine is very slippery.' }, { label: 'Leave it for later', aria: 'leave', right: false, why: 'Someone could slip on it.' }] },
      { q: 'How do you get a ball back out of the cylinder?', options: [{ label: 'With the magnet, up the outside', aria: 'magnet', right: true, why: 'Right: no spills, no sticky hands.' }, { label: 'Pour the glycerine out', aria: 'pour', right: false, why: 'That spills it and wastes it.' }] },
    ],
  },
  INCLINE: {
    cards: [
      GENERAL,
      { icon: <Hand className="size-6" />, title: 'The rolling ball', lessonMatch: /catch|roll/i, lines: ['Catch the ball at the bottom so it does not roll off the bench onto the floor.', 'Keep the stopping block in the groove.'] },
      { icon: <Footprints className="size-6" />, title: 'The long plank', lines: ['The 2 m plank sticks out: walk round it, do not lean on it.', 'Stack the wooden blocks squarely so the plank cannot slide off.'] },
      FIRE,
    ],
    questions: [{ q: 'The ball misses the stopping block. What stops it?', options: [{ label: 'My hand, at the bottom of the plank', aria: 'hand', right: true, why: 'Right: catch it before it reaches the floor.' }, { label: 'It will stop by itself', aria: 'itself', right: false, why: 'It rolls off the bench: a steel ball on the floor is a slipping hazard.' }] }],
  },
  FORCES: {
    cards: [
      GENERAL,
      { icon: <Weight className="size-6" />, title: 'Hanging masses', lessonMatch: /board|snap|fall/i, lines: ['Make sure the board is secure: if a thread snaps, the masses fall.', 'Keep your feet clear of the hangers; add masses gently.'] },
      { icon: <Hand className="size-6" />, title: 'Pins', lines: ['Push the drawing pins fully in; put spare pins back in the box.'] },
      FIRE,
    ],
    questions: [{ q: 'Before you hang the masses, you check…', options: [{ label: 'That the board is fixed firmly', aria: 'board fixed', right: true, why: 'Right: a falling board and masses can injure.' }, { label: 'Nothing: it is only thread', aria: 'nothing', right: false, why: 'Threads snap and boards slip: check first.' }] }],
  },
};
