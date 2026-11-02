import type { BioGrowthState, BioGrowthVariant } from '@aischool/shared';
import { useMemo, type ReactNode } from 'react';
import { KitScene } from '../../../lab3d-kit/scene';
import { OKON_SPOT } from '../../bio-common/lab3d/common';
import { bioRoom } from '../../bio-common/lab3d/room';
import { GROWTH_VIEWS, GSPOT, world } from './bench';
import type { GrowthScene } from './scene-state';
import { GrowthCupboard, GrowthStation } from './station';

/** The germination and plant-response bench in the biology room. */
export function GrowthLabScene({ v, state, scene, guided, onSlow, children }: { v: BioGrowthVariant; state: BioGrowthState; scene: GrowthScene; guided: boolean; onSlow: () => void; children?: ReactNode }) {
  const task = state.task ?? 'GERM';
  const room = useMemo(
    () =>
      task === 'SEEDLING'
        ? bioRoom({
            whiteboard: ['Biology — SS3 Practical', 'Epigeal and hypogeal germination', 'Cowpea: hypocotyl lifts the cotyledons', 'Rate = (L₈ − L₄) ÷ 4 mm/day'],
            note: 'Measure from the SAME point daily',
            poster: { title: 'Germination', band: '#2e7d32', lines: ['Radicle first, then plumule.', 'Epigeal: cotyledons above soil.', 'Hypogeal: cotyledons below soil.', 'Water, oxygen, warmth.'] },
          })
        : task === 'RESP'
          ? bioRoom({
              whiteboard: ['Biology — SS3 Practical', 'Respiration in germinating seeds', 'glucose + O₂ → CO₂ + water + energy', 'Rise ÷ days = mean rise per day'],
              note: 'Disinfect BOTH batches',
              poster: { title: 'Respiration', band: '#ad1457', lines: ['Living cells release energy.', 'Some energy escapes as heat.', 'CO₂ turns lime water milky.', 'Boiled seeds: the control.'] },
            })
          : task === 'TROPISM'
            ? bioRoom({
                whiteboard: ['Biology — SS3 Practical', 'Phototropism and geotropism', 'Clinostat = the control', 'Rate = angle ÷ days'],
                note: 'Keep the seedlings MOIST',
                poster: { title: 'Tropisms', band: '#6a1b9a', lines: ['Shoots: towards light (+).', 'Roots: towards gravity (+).', 'Auxin gathers on the shaded side.', 'The clinostat cancels one-sided stimuli.'] },
              })
            : bioRoom({
                whiteboard: ['Biology — SS3 Practical', 'Conditions for germination', 'A control · B dry · C no O₂ · D cold', '% = germinated ÷ sown × 100'],
                note: 'Count RADICLES, not swollen seeds',
                poster: { title: 'Germination', band: '#2e7d32', lines: ['Water activates the enzymes.', 'Oxygen for respiration.', 'Warmth for enzyme activity.', 'Light is not needed.'] },
              }),
    [task],
  );
  const read = task === 'SEEDLING' ? world(GSPOT.jar, 0.12) : task === 'RESP' ? world([(GSPOT.flaskA[0] + GSPOT.flaskB[0]) / 2, 0, GSPOT.flaskA[2]], 0.2) : task === 'TROPISM' ? world(GSPOT.lightbox, 0.12) : world(GSPOT.rack, 0.07);
  return (
    <KitScene room={room} coatOn={scene.coat} gogglesOn={scene.goggles} presets={GROWTH_VIEWS} read={read} guided={guided} onSlow={onSlow} assistantSpot={OKON_SPOT}>
      <GrowthCupboard scene={scene} />
      <GrowthStation v={v} state={state} scene={scene} />
      {children}
    </KitScene>
  );
}
