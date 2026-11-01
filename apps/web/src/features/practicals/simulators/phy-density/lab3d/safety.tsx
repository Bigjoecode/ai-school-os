import { Backpack, Droplets, Flame, FlaskConical, Weight } from 'lucide-react';
import type { SafetyContent } from '../../../lab3d-kit/safety';

/** The density labs' door briefing: general rules, glassware, heavy masses and lead, spills and kerosene; then a short check. */
export const DENSITY_SAFETY: SafetyContent = {
  cards: [
    { icon: <Backpack className="size-6" />, title: 'In the physics lab', lines: ['Bags under the bench, aisles clear. No running, no eating or drinking.', 'Report every breakage and every injury to the teacher at once.'] },
    { icon: <FlaskConical className="size-6" />, title: 'Glassware', lessonMatch: /glass|bottle|tube|beaker|break/i, lines: ['Carry the density bottle, the tube and beakers with both hands; stand them away from the bench edge.', 'Never pick up broken glass: tell the teacher, who sweeps it into the glass bin. Push stoppers in gently.'] },
    { icon: <Weight className="size-6" />, title: 'Heavy masses and lead shot', lessonMatch: /lead|mass|stone|ball|drop/i, lines: ['Do not drop the stone, ball bearings or lead shot: they break glass and roll underfoot. Keep feet clear of a hanging load.', 'Lead is poisonous: handle the shot with the scoop and wash your hands afterwards. Never overload the tube so that it sinks and breaks.'] },
    { icon: <Droplets className="size-6" />, title: 'Spills', lessonMatch: /spill|wet|slippery|wipe/i, lines: ['Wipe up water at once: wet benches and floors are slippery. Keep water away from the balance.', 'Kerosene and palm oil go into the residue bottle, not the sink.'] },
    { icon: <Flame className="size-6" />, title: 'Kerosene is flammable', lessonMatch: /kerosene|flame/i, lines: ['No naked flames anywhere near the kerosene.', 'The CO₂ extinguisher and the fire blanket are by the front wall, left of the board.'] },
  ],
  questions: [
    {
      q: 'You knock a beaker of water over on the bench. What do you do?',
      options: [
        { label: 'Wipe it up at once with tissue or a cloth', aria: 'wipe', right: true, why: 'Right: wet benches and floors are slippery, and water damages the balance.' },
        { label: 'Leave it to dry', aria: 'leave', right: false, why: 'Someone could slip, and water may reach the balance. Wipe it up.' },
      ],
    },
    {
      q: 'You have finished with the lead shot. What next?',
      options: [
        { label: 'Put it back in its pot and wash my hands', aria: 'wash', right: true, why: 'Right: lead is poisonous.' },
        { label: 'Leave the spilt shot on the floor', aria: 'floor', right: false, why: 'It rolls underfoot and is toxic: pick it up with the scoop, then wash your hands.' },
      ],
    },
    {
      q: 'The density bottle slips and breaks. What do you do?',
      options: [
        { label: 'Pick up the pieces quickly', aria: 'pick up', right: false, why: 'Broken glass cuts. Leave it and tell the teacher.' },
        { label: 'Stay clear and tell the teacher', aria: 'tell', right: true, why: 'Right: the teacher sweeps it into the glass bin.' },
      ],
    },
  ],
};
