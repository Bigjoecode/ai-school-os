import type { BioFoodState, BioFoodVariant } from '@aischool/shared';
import { useMemo, type ReactNode } from 'react';
import { KitScene } from '../../../lab3d-kit/scene';
import { OKON_SPOT } from '../../bio-common/lab3d/common';
import { bioRoom } from '../../bio-common/lab3d/room';
import { BATH_TOP, FOOD_VIEWS, FSPOT, useFoodBench, world } from './bench';
import type { FoodScene } from './scene-state';
import { FoodCupboard, FoodStation } from './station';

/** The food-tests bench in the biology room. */
export function FoodLabScene({ v, state, scene, guided, onSlow, children }: { v: BioFoodVariant; state: BioFoodState; scene: FoodScene; guided: boolean; onSlow: () => void; children?: ReactNode }) {
  const task = state.task ?? 'FOOD';
  const active = useFoodBench((b) => b.active);
  const t = state.tests[active];
  const inBath = !!t && t.heat > 0 && !t.direct;
  const room = useMemo(
    () =>
      task === 'AMYLASE'
        ? bioRoom({
            whiteboard: ['Biology — SS3 Practical', 'Action of salivary amylase on starch', 'A drop on iodine every 30 s', 'End point: iodine stays yellow-brown'],
            note: 'Rate = 1000 ÷ t',
            poster: { title: 'Enzymes', band: '#2e7d32', lines: ['Amylase: starch → maltose.', 'Optimum about 37 °C.', 'Cold: slow, not denatured.', 'Boiling: denatured for good.'] },
          })
        : bioRoom({
            whiteboard: ['Biology — SS3 Practical', 'Food tests on P, Q and R', 'Starch · sugars · protein · fat', 'Record TEST | OBSERVATION | INFERENCE'],
            note: 'Water bath — never the flame!',
            poster: { title: 'Food tests', band: '#5d4037', lines: ['Starch: iodine → blue-black', "Reducing sugar: Benedict's → brick-red ppt", 'Protein: Biuret → violet', 'Fat: Sudan III → red oily layer'] },
          }),
    [task],
  );
  // "Test tube" looks at the tube where it is: in its stand, or in the water bath.
  const presets = useMemo(() => (inBath ? { ...FOOD_VIEWS, tube: { ...FOOD_VIEWS.bath!, dist: 0.42 } } : FOOD_VIEWS), [inBath]);
  const read = inBath ? world(FSPOT.bath, BATH_TOP + 0.06) : world(FSPOT.tube, 0.08);
  return (
    <KitScene room={room} coatOn={scene.coat} gogglesOn={scene.goggles} presets={presets} read={read} guided={guided} onSlow={onSlow} assistantSpot={OKON_SPOT}>
      <FoodCupboard scene={scene} />
      <FoodStation v={v} state={state} scene={scene} />
      {children}
    </KitScene>
  );
}
