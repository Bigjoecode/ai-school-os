import { redoxReading, type ChemRedoxState, type ChemRedoxVariant } from '@aischool/shared';
import { useMemo } from 'react';
import { buretteY } from '../../../lab3d-kit/apparatus';
import { STATION } from '../../../lab3d-kit/layout';
import { KitScene } from '../../../lab3d-kit/scene';
import { useLabView } from '../../../lab3d-kit/store';
import type { Redox } from '../actions';
import { DragController } from './drag';
import type { SceneState } from './scene-state';
import { SPOT } from './spots';
import { CupboardContents, Held, Station } from './station';
import { REDOX_VIEWS, redoxRoom } from './views';

/** The redox lab in the kit's room: the cupboard's apparatus, the bench station, what is held, and its drags. */
export function LabScene({ state, scene, t, v, guided, interactive, onSlow }: { state: ChemRedoxState; scene: SceneState; t: Redox; v: ChemRedoxVariant; guided: boolean; interactive: boolean; onSlow: () => void }) {
  const quality = useLabView((s) => s.quality);
  const mode = useLabView((s) => s.mode);
  const room = useMemo(() => redoxRoom(v.task), [v.task]);
  // The eye-level view looks at what is read: the top of the meniscus for dark KMnO₄, its bottom otherwise.
  const meniscusY = STATION[1] + SPOT.jetHeight + buretteY(redoxReading(v, state.burette ?? 0));
  return (
    <KitScene room={room} coatOn={scene.coat} gogglesOn={scene.goggles} presets={REDOX_VIEWS} read={[STATION[0] + SPOT.buretteAxis[0], meniscusY, STATION[2] + SPOT.buretteAxis[2]]} guided={guided} onSlow={onSlow}>
      <CupboardContents scene={scene} />
      <Station state={state} scene={scene} t={t} v={v} detail={quality !== 'low' || mode !== 'walk'} />
      <Held />
      {interactive && <DragController t={t} s={state} scene={scene} />}
    </KitScene>
  );
}
