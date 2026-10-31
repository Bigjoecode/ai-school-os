import type { HeatTask } from '@aischool/shared';
import { Backpack, Flame, Hand, Snowflake, Thermometer, TriangleAlert } from 'lucide-react';
import type { SafetyContent } from '../../../lab3d-kit/safety';

/**
 * The heat lab's door briefing: hot water and the Bunsen, hot solids with
 * tongs, a thermometer is not a stirrer (and mercury), then the practical's own
 * hazard (naphthalene's flammable vapour, or cold wet ice), and a short check.
 */
export function heatSafety(task: HeatTask): SafetyContent {
  const own =
    task === 'COOL'
      ? { icon: <TriangleAlert className="size-6" />, title: 'Naphthalene', lessonMatch: /naphthalene|vapour|ventilat|water bath|solidified/i, lines: ['Heat naphthalene only in a water bath, never directly over the flame: its vapour is flammable.', 'Work in a well-ventilated room and do not breathe the fumes.', 'Never pull the thermometer out of the solid naphthalene.'] }
      : task === 'LATENT'
        ? { icon: <Snowflake className="size-6" />, title: 'Ice and spills', lessonMatch: /ice|cold|spill|mop/i, lines: ['Handle ice with a dry cloth: very cold ice can stick to wet skin.', 'Mop up any spilt water at once: a wet floor is slippery.'] }
        : { icon: <Hand className="size-6" />, title: 'Hot solids: use tongs', lessonMatch: /tongs|block|thread|scald|paper/i, lines: ['The block comes out of boiling water at almost 100 °C: hold it by its thread or with tongs, never with your fingers.', 'Keep the burner away from the thread and from paper.'] };
  return {
    cards: [
      { icon: <Backpack className="size-6" />, title: 'In the physics lab', lines: ['Bags under the bench, aisles clear. No running, no eating or drinking.', 'Report every breakage and every injury to the teacher at once.'] },
      {
        icon: <Flame className="size-6" />,
        title: 'Hot water and the Bunsen',
        lessonMatch: /boiling|burner|scald|hot/i,
        lines: ['Boiling water scalds: wear goggles, keep the beaker in the middle of the gauze and never lean over it.', 'Light the Bunsen with the air hole closed, then open it for a blue flame. Turn it off when you finish. Tripod and gauze stay hot.', 'A scald: cool it under cold running water for 10 minutes and tell the teacher.'],
      },
      own,
      { icon: <Thermometer className="size-6" />, title: 'A thermometer is not a stirrer', lessonMatch: /thermometer|mercury|stir/i, lines: ['Stir with the stirrer. A thermometer’s thin bulb breaks easily.', 'Mercury is poisonous: if a thermometer breaks, step back, tell the teacher and never touch the mercury or the glass.'] },
      { icon: <TriangleAlert className="size-6" />, title: 'The fire point', lines: ['The CO₂ extinguisher and the fire blanket are by the front wall, left of the board.'] },
    ],
    questions: [
      {
        q: 'How do you stir the water in the calorimeter?',
        options: [
          { label: 'With the stirrer', aria: 'stirrer', right: true, why: 'Right: the thermometer is not a stirrer — its bulb breaks and mercury is poisonous.' },
          { label: 'With the thermometer', aria: 'thermometer', right: false, why: 'Its thin glass bulb breaks easily, and mercury is poisonous. Use the stirrer.' },
        ],
      },
      task === 'COOL'
        ? {
            q: 'How do you melt the naphthalene?',
            options: [
              { label: 'In the boiling tube, in a water bath', aria: 'bath', right: true, why: 'Right: its vapour is flammable, so it never goes near the flame.' },
              { label: 'In the boiling tube, straight over the flame', aria: 'flame', right: false, why: 'Naphthalene vapour catches fire. Use the water bath.' },
            ],
          }
        : {
            q: task === 'LATENT' ? 'A piece of ice drips on the floor. What do you do?' : 'How do you move the hot block?',
            options:
              task === 'LATENT'
                ? [
                    { label: 'Mop it up at once', aria: 'mop', right: true, why: 'Right: a wet floor is slippery.' },
                    { label: 'Leave it to dry', aria: 'leave', right: false, why: 'Someone could slip: mop it up.' },
                  ]
                : [
                    { label: 'By its thread (or with tongs), quickly and gently', aria: 'thread', right: true, why: 'Right: it is nearly 100 °C — never with fingers.' },
                    { label: 'Pick it up with my fingers', aria: 'fingers', right: false, why: 'It would burn you. Use the thread or tongs.' },
                  ],
          },
      {
        q: 'A thermometer breaks and mercury spills. What do you do?',
        options: [
          { label: 'Step back and tell the teacher', aria: 'tell', right: true, why: 'Right: mercury and its vapour are poisonous; the teacher clears it up safely.' },
          { label: 'Pick up the drops with my fingers', aria: 'touch', right: false, why: 'Never touch mercury or the broken glass. Tell the teacher.' },
        ],
      },
    ],
  };
}
