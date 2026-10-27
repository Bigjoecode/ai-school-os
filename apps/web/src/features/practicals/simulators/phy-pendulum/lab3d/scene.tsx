import type { PhyPendulumState } from '@aischool/shared';
import { useMemo } from 'react';
import { STATION } from '../../../lab3d-kit/layout';
import { KitScene } from '../../../lab3d-kit/scene';
import { BAYO_SPOT } from '../../phy-common/lab3d/common';
import type { Pendulum } from '../actions';
import { DragController } from './drag';
import { PIVOT, RULE } from './layout';
import type { SceneState } from './scene-state';
import { Cupboard, DraughtWindow, Station } from './station';
import { PENDULUM_VIEWS, pendulumRoom } from './views';

/** The pendulum lab in the physics room: the cupboard's apparatus, the bench, the window and the drags. */
export function LabScene({ state, scene, p, guided, interactive, onSlow }: { state: PhyPendulumState; scene: SceneState; p: Pendulum; guided: boolean; interactive: boolean; onSlow: () => void }) {
  const draught = !state.shielded;
  const room = useMemo(() => pendulumRoom(draught), [draught]);
  // The eye-level view reads the metre rule where the top of the bob is.
  const read: [number, number, number] = [STATION[0] + RULE.x + 0.012, STATION[1] + PIVOT[1] - state.thread / 100, STATION[2] + RULE.z + 0.001];
  return (
    <KitScene room={room} coatOn={scene.coat} gogglesOn={false} presets={PENDULUM_VIEWS} read={read} guided={guided} onSlow={onSlow} assistantSpot={BAYO_SPOT}>
      <Cupboard scene={scene} />
      <Station live={{ p, v: p.v, s: state }} scene={scene} interactive={interactive} />
      <DraughtWindow open={draught} />
      {interactive && <DragController p={p} />}
    </KitScene>
  );
}
