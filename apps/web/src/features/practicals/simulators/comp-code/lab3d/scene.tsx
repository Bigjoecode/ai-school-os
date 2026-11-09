import type { CompCodeState, CompCodeVariant } from '@aischool/shared';
import { useMemo, type ReactNode } from 'react';
import { KitScene } from '../../../lab3d-kit/scene';
import { COMP_VIEWS, CSPOT, compRoom, useCompBench, world } from './bench';
import { RoomComputers } from './models';
import type { CompScene } from './scene-state';
import { CompCupboard, CompStation } from './station';

/** The computer bench in the kit's room, with the sinks, reagents and fume cupboard taken out and a computer on every bench. */
export function CompLabScene({ v, state, scene, guided, onSlow, children }: { v: CompCodeVariant; state: CompCodeState; scene: CompScene; guided: boolean; onSlow: () => void; children?: ReactNode }) {
  const task = state.task ?? v.task;
  const room = useMemo(() => compRoom(task, <RoomComputers />), [task]);
  const tab = useCompBench((b) => b.tab);
  return (
    <KitScene room={room} coatOn gogglesOn presets={COMP_VIEWS} read={world(CSPOT.monitor, 0.27)} guided={guided} onSlow={onSlow} assistantSpot={[-1.2, -1.15]}>
      <CompCupboard scene={scene} />
      <CompStation v={v} state={state} scene={scene} tab={tab} />
      {children}
    </KitScene>
  );
}
