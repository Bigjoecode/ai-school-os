import type { BioEcologyState, BioEcologyVariant } from '@aischool/shared';
import { useMemo, type ReactNode } from 'react';
import { KitScene } from '../../../lab3d-kit/scene';
import type { RoomConfig } from '../../../lab3d-kit/room';
import { OKON_SPOT } from '../../bio-common/lab3d/common';
import { ECO_VIEWS, ESPOT, FIELD, useEcoBench, world } from './bench';
import { FieldScene } from './field';
import type { EcoScene } from './scene-state';
import { EcoShed, EcoStation } from './station';

/** The school field (in place of the room), the student's table and the shed. */
export function EcoLabScene({ v, state, scene, guided, onSlow, children }: { v: BioEcologyVariant; state: BioEcologyState; scene: EcoScene; guided: boolean; onSlow: () => void; children?: ReactNode }) {
  const task = state.task ?? 'QUADRAT';
  const sel = useEcoBench((b) => b.sel);
  const showPlot = task === 'QUADRAT' || task === 'CAPTURE';
  const room = useMemo<RoomConfig>(
    () => ({
      whiteboard: ['Biology — field work'],
      doorPoster: { title: 'Field-work safety', band: '#2e7d32', lines: ['Covered shoes, hat, water.', 'Stings and bites: tell the teacher.', 'Keep back from the pond.', 'Wash your hands after.'] },
      custom: <FieldScene v={v} quads={showPlot ? state.quad.quads : []} pegged={showPlot && (task === 'CAPTURE' || state.quad.pegged)} focusQuad={task === 'QUADRAT' ? sel : null} hoppers={task === 'CAPTURE'} />,
    }),
    [v, state.quad.quads, state.quad.pegged, task, sel, showPlot],
  );
  const read: [number, number, number] = task === 'FACTORS' ? (state.fac.at === 'SHADE' ? [FIELD.shade[0], 1, FIELD.shade[2]] : state.fac.at === 'OPEN' ? [FIELD.open[0], 1, FIELD.open[2]] : [4.6, 1.2, -4.5]) : world(task === 'SOIL' ? ESPOT.rack : ESPOT.tray, 0.05);
  return (
    <KitScene room={room} coatOn={scene.coat} gogglesOn={scene.goggles} presets={ECO_VIEWS} read={read} guided={guided} onSlow={onSlow} assistantSpot={OKON_SPOT}>
      <EcoShed scene={scene} task={state.task} />
      <EcoStation v={v} state={state} scene={scene} />
      {children}
    </KitScene>
  );
}
