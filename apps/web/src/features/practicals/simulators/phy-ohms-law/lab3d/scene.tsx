import { OHMS_AMMETER_FSD, OHMS_VOLTMETER_FSD, type OhmsTerminal, type PhyOhmsState, type PhyOhmsVariant } from '@aischool/shared';
import { useMemo } from 'react';
import { STATION } from '../../../lab3d-kit/layout';
import { KitScene } from '../../../lab3d-kit/scene';
import { useBench } from './bench-store';
import { DragController, type DragCtx } from './drag';
import { FACE, METER, PART } from './layout';
import type { SceneState } from './scene-state';
import { Cupboard, Station, type Meters } from './station';
import { OHMS_ROOM, OHMS_VIEWS } from './views';

/** Where the eye-level view looks: the tip of the chosen meter's pointer. */
function readPoint(meter: 'A' | 'V', m: Meters): [number, number, number] {
  const p = meter === 'A' ? PART.ammeter : PART.voltmeter;
  const fsd = meter === 'A' ? OHMS_AMMETER_FSD : OHMS_VOLTMETER_FSD;
  const val = meter === 'A' ? (m.overI ? fsd * 1.04 : m.backI ? -0.03 * fsd : m.I) : m.overV ? fsd * 1.04 : m.backV ? -0.03 * fsd : m.V;
  const a = ((-50 + 100 * Math.max(-0.03, Math.min(1.04, val / fsd))) * Math.PI) / 180;
  const pivotY = FACE.cy - FACE.h / 2 + (40 / 384) * FACE.h;
  const r = 0.085;
  return [STATION[0] + p[0] + r * Math.sin(a), STATION[1] + p[1] + pivotY + r * Math.cos(a), STATION[2] + p[2] + METER.d / 2 + 0.001];
}

export function LabScene({ state, scene, meters, v, board, guided, interactive, onSlow, drag }: { state: PhyOhmsState; scene: SceneState; meters: Meters; v: PhyOhmsVariant; board: OhmsTerminal[]; guided: boolean; interactive: boolean; onSlow: () => void; drag: DragCtx }) {
  const meter = useBench((b) => b.meter);
  const task = state.task ?? 'OHM';
  const room = useMemo(() => OHMS_ROOM(task), [task]);
  return (
    <KitScene room={room} coatOn={scene.coat} gogglesOn={false} presets={OHMS_VIEWS} read={readPoint(meter, meters)} guided={guided} onSlow={onSlow}>
      <Cupboard scene={scene} />
      <Station state={state} scene={scene} meters={meters} v={v} interactive={interactive} board={board} />
      {interactive && <DragController {...drag} />}
    </KitScene>
  );
}
