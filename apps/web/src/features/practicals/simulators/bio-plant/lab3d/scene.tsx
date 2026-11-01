import type { BioPlantState, BioPlantVariant } from '@aischool/shared';
import { useMemo, type ReactNode } from 'react';
import { KitScene } from '../../../lab3d-kit/scene';
import { OKON_SPOT } from '../../bio-common/lab3d/common';
import { bioRoom } from '../../bio-common/lab3d/room';
import { PLANT_VIEWS, PSPOT, world } from './bench';
import type { PlantScene } from './scene-state';
import { PlantCupboard, PlantStation } from './station';

/** The plant physiology bench in the biology room. */
export function PlantLabScene({ v, state, scene, guided, onSlow, children }: { v: BioPlantVariant; state: BioPlantState; scene: PlantScene; guided: boolean; onSlow: () => void; children?: ReactNode }) {
  const task = state.task ?? 'POTOMETER';
  const room = useMemo(
    () =>
      task === 'OXYGEN'
        ? bioRoom({
            whiteboard: ['Biology — SS3 Practical', 'Light intensity and photosynthesis', 'Intensity ∝ 1/d²  (10 000 ÷ d²)', 'Count bubbles for 1 min, three times'],
            note: 'Heat filter! Wait 5 min each time',
            poster: { title: 'Photosynthesis', band: '#2e7d32', lines: ['CO₂ + water → glucose + O₂', 'Needs light and chlorophyll.', 'Limiting factors: light, CO₂, temp.', 'O₂ relights a glowing splint.'] },
          })
        : task === 'STARCH'
          ? bioRoom({
              whiteboard: ['Biology — SS3 Practical', 'Testing a leaf for starch', 'Boil → ethanol (FLAME OFF) → soften → iodine', 'Blue-black = starch'],
              note: 'Ethanol is FLAMMABLE: flame off!',
              poster: { title: 'Starch test', band: '#5d4037', lines: ['Boil: kills cells, lets iodine in.', 'Ethanol: removes chlorophyll.', 'Iodine: blue-black with starch.', 'Needs light, chlorophyll, CO₂.'] },
            })
          : bioRoom({
              whiteboard: ['Biology — SS3 Practical', 'Rate of transpiration: the potometer', 'Rate = 30 mm ÷ mean time (min)', 'Volume = rate × πr²'],
              note: 'Cut the shoot UNDER WATER',
              poster: { title: 'Transpiration', band: '#00838f', lines: ['Water evaporates from the leaves.', 'Wind and light: faster.', 'Humid air and dark: slower.', 'A potometer measures uptake.'] },
            }),
    [task],
  );
  const read = task === 'OXYGEN' ? world(PSPOT.beaker, 0.12) : task === 'STARCH' ? world(PSPOT.tile, 0.01) : world([PSPOT.potometer[0] - 0.05, 0, PSPOT.potometer[2]], 0.13);
  return (
    <KitScene room={room} coatOn={scene.coat} gogglesOn={scene.goggles} presets={PLANT_VIEWS} read={read} guided={guided} onSlow={onSlow} assistantSpot={OKON_SPOT}>
      <PlantCupboard scene={scene} />
      <PlantStation v={v} state={state} scene={scene} />
      {children}
    </KitScene>
  );
}
