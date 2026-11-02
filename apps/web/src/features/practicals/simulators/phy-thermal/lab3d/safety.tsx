import type { ThermTask } from '@aischool/shared';
import { Backpack, Cloud, FlaskConical, Flame, Thermometer, TriangleAlert, Zap } from 'lucide-react';
import type { SafetyContent } from '../../../lab3d-kit/safety';

/**
 * The thermal lab's door briefing: the Bunsen and hot water, then the
 * practical's own hazard (steam, the acid index, the electric heater), the
 * thermometer, the fire point, and a short check.
 */
export function thermalSafety(task: ThermTask): SafetyContent {
  const own =
    task === 'EXPANSION'
      ? { icon: <Cloud className="size-6" />, title: 'Steam scalds', lessonMatch: /steam|scald|cool|dismantl/i, lines: ['Steam scalds worse than boiling water: point the outlet into the beaker, away from everyone, and keep your hands away from it.', 'Let the jacket and rod cool before you take them apart.'] }
      : task === 'CHARLES'
        ? { icon: <FlaskConical className="size-6" />, title: 'The acid index', lessonMatch: /acid|corrosive|open the tube/i, lines: ['The thread in the tube is concentrated sulphuric acid: never open or break the tube.', 'If the tube breaks, step back and tell the teacher; acid on skin — rinse with plenty of water.'] }
        : { icon: <Zap className="size-6" />, title: 'The electric heater', lessonMatch: /heater|mains|immersed|voltage/i, lines: ['Use only the low-voltage (12 V) heater — never a mains heater in a calorimeter.', 'Switch on only when the heater is fully under the water; switch off before taking it out.', 'Keep water away from the supply and the meters.'] };
  return {
    cards: [
      { icon: <Backpack className="size-6" />, title: 'In the physics lab', lines: ['Bags under the bench, aisles clear. No running, no eating or drinking.', 'Report every breakage and every injury to the teacher at once.'] },
      {
        icon: <Flame className="size-6" />,
        title: task === 'ELECTRIC' ? 'Hot water' : 'Hot water and the Bunsen',
        lessonMatch: /hot|burner|scald|handle/i,
        lines: task === 'ELECTRIC' ? ['Hot water scalds: stir gently and keep the calorimeter steady.', 'A scald: cool it under cold running water for 10 minutes and tell the teacher.'] : ['Wear goggles while water boils. Light the Bunsen with the air hole closed, then open it for a blue flame; turn it off when you finish.', 'Tripod, gauze and can stay hot. A scald: cool it under cold running water for 10 minutes.'],
      },
      own,
      { icon: <Thermometer className="size-6" />, title: 'Thermometers', lessonMatch: /thermometer/i, lines: ['A thermometer is not a stirrer; its bulb breaks easily.', 'If one breaks, step back and tell the teacher; never touch the mercury or the glass.'] },
      { icon: <TriangleAlert className="size-6" />, title: 'The fire point', lines: ['The CO₂ extinguisher and the fire blanket are by the front wall, left of the board.'] },
    ],
    questions: [
      task === 'EXPANSION'
        ? {
            q: 'Where should the steam outlet point?',
            options: [
              { label: 'Into a beaker, away from people', aria: 'beaker', right: true, why: 'Right: steam scalds badly.' },
              { label: 'Towards me, so I can see the steam', aria: 'me', right: false, why: 'Steam scalds worse than boiling water. Point it into the beaker, away from everyone.' },
            ],
          }
        : task === 'CHARLES'
          ? {
              q: 'The capillary tube’s index is concentrated sulphuric acid. You…',
              options: [
                { label: 'Never open or break the tube', aria: 'never', right: true, why: 'Right: the acid is corrosive.' },
                { label: 'Open the end to see the air', aria: 'open', right: false, why: 'Never open it: the acid is corrosive and the trapped air would change.' },
              ],
            }
          : {
              q: 'When can you switch the immersion heater on?',
              options: [
                { label: 'Only when it is fully under the water', aria: 'immersed', right: true, why: 'Right: in air it overheats and burns out.' },
                { label: 'Any time, to warm it up first', aria: 'any', right: false, why: 'In air it overheats in seconds and burns out. Immerse it first.' },
              ],
            },
      {
        q: 'You scald your hand on hot water. What do you do?',
        options: [
          { label: 'Cool it under cold running water and tell the teacher', aria: 'cool', right: true, why: 'Right: 10 minutes under cold water.' },
          { label: 'Put butter or toothpaste on it', aria: 'butter', right: false, why: 'That keeps the heat in. Cold running water, and tell the teacher.' },
        ],
      },
      {
        q: 'A thermometer breaks. What do you do?',
        options: [
          { label: 'Step back and tell the teacher', aria: 'tell', right: true, why: 'Right: the teacher clears it up safely.' },
          { label: 'Pick up the pieces with my fingers', aria: 'touch', right: false, why: 'Never touch the glass or the mercury. Tell the teacher.' },
        ],
      },
    ],
  };
}
