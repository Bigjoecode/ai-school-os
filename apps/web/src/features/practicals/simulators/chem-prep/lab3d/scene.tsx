import type { ChemPrepState, ChemPrepVariant } from '@aischool/shared';
import { useMemo, type ReactNode } from 'react';
import { KitScene } from '../../../lab3d-kit/scene';
import { PREP_VIEWS, PSPOT, prepRoom, world } from './bench';
import type { PrepScene } from './scene-state';
import { PrepCupboard, PrepStation } from './station';

const READ: Record<ChemPrepVariant['task'], [readonly [number, number, number], number]> = {
  STANDARD: [PSPOT.flask, 0.17],
  LECHAT: [PSPOT.tube, 0.08],
  DISTIL: [PSPOT.rig, 0.42],
  HALOGEN: [PSPOT.tube, 0.08],
  AMMONIA: [PSPOT.jar, 0.12],
};

/** The chem-prep bench in the kit's chemistry room. */
export function PrepLabScene({ v, state, scene, guided, onSlow, children }: { v: ChemPrepVariant; state: ChemPrepState; scene: PrepScene; guided: boolean; onSlow: () => void; children?: ReactNode }) {
  const task = state.task ?? v.task;
  const room = useMemo(() => prepRoom(task), [task]);
  const [p, y] = READ[task];
  return (
    <KitScene room={room} coatOn={scene.coat} gogglesOn={scene.goggles} presets={PREP_VIEWS} read={world(p, y)} guided={guided} onSlow={onSlow} assistantSpot={[1.3, -1.25]}>
      <PrepCupboard scene={scene} />
      <PrepStation v={v} state={state} scene={scene} />
      {children}
    </KitScene>
  );
}
