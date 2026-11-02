import type { BioHumanState, BioHumanVariant } from '@aischool/shared';
import { useMemo, type ReactNode } from 'react';
import { KitScene } from '../../../lab3d-kit/scene';
import { OKON_SPOT } from '../../bio-common/lab3d/common';
import { bioRoom } from '../../bio-common/lab3d/room';
import { HSPOT, HUMAN_VIEWS, SKIN_POINT, world } from './bench';
import type { HumanScene } from './scene-state';
import { HumanCupboard, HumanStation } from './station';

/** The human physiology bench in the biology room. */
export function HumanLabScene({ v, state, scene, guided, onSlow, children }: { v: BioHumanVariant; state: BioHumanState; scene: HumanScene; guided: boolean; onSlow: () => void; children?: ReactNode }) {
  const task = state.task ?? 'PULSE';
  const room = useMemo(
    () =>
      task === 'BREATH'
        ? bioRoom({
            whiteboard: ['Biology — SS3 Practical', 'Inhaled and exhaled air', 'CO₂: 0.04 % in, about 4 % out', 'Ventilation = rate × 500 cm³'],
            note: 'Breathe GENTLY — never suck lime water',
            poster: { title: 'Respiration', band: '#1565c0', lines: ['Glucose + oxygen →', 'carbon dioxide + water + energy.', 'CO₂ turns lime water milky.', 'Water turns cobalt chloride pink.'] },
          })
        : task === 'REACTION'
          ? bioRoom({
              whiteboard: ['Biology — SS3 Practical', 'Reflex and voluntary actions', 't = √(2d ÷ g), d in metres', 'g = 9.8 m/s²'],
              note: 'Drop WITHOUT warning',
              poster: { title: 'Reflex arc', band: '#6a1b9a', lines: ['Receptor → sensory neurone', '→ relay neurone (spinal cord)', '→ motor neurone → effector.', 'Voluntary actions use the brain.'] },
            })
          : task === 'SKIN'
            ? bioRoom({
                whiteboard: ['Biology — SS3 Practical', 'Sensitivity of the skin', 'Two-point threshold (mm)', 'Include single-point checks'],
                note: 'Blunt points — press GENTLY',
                poster: { title: 'The skin', band: '#ad1457', lines: ['Receptors: touch, pressure,', 'pain, heat and cold.', 'Close receptors → small threshold.', 'Fingertips are most sensitive.'] },
              })
            : bioRoom({
                whiteboard: ['Biology — SS3 Practical', 'Effect of exercise on pulse rate', 'Beats/min = 15 s count × 4', '% increase = (peak − rest) ÷ rest × 100'],
                note: 'Fingertips, NOT the thumb',
                poster: { title: 'Heart and pulse', band: '#c62828', lines: ['Each beat sends a surge of blood', 'along the arteries: the pulse.', 'Exercise: more O₂ and glucose', 'needed by the muscles.'] },
              }),
    [task],
  );
  const read = task === 'BREATH' ? world(HSPOT.apparatus, 0.14) : task === 'REACTION' ? world(HSPOT.rule, 0.25) : task === 'SKIN' ? world(SKIN_POINT.PALM, 0.02) : world(HSPOT.wrist, 0.02);
  return (
    <KitScene room={room} coatOn={scene.coat} gogglesOn={scene.goggles} presets={HUMAN_VIEWS} read={read} guided={guided} onSlow={onSlow} assistantSpot={OKON_SPOT}>
      <HumanCupboard scene={scene} />
      <HumanStation v={v} state={state} scene={scene} />
      {children}
    </KitScene>
  );
}
