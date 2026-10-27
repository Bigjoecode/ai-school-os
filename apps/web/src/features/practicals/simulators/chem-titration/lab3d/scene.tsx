import type { ChemTitrationState, ChemTitrationVariant } from '@aischool/shared';
import { STATION } from '../../../lab3d-kit/layout';
import { KitScene } from '../../../lab3d-kit/scene';
import { useLabView } from '../../../lab3d-kit/store';
import type { Titration } from '../actions';
import { buretteY } from '../../../lab3d-kit/apparatus';
import { DragController } from './drag';
import type { SceneState } from './scene-state';
import { SPOT } from './spots';
import { CupboardContents, Held, Station } from './station';
import { TITRATION_ROOM, TITRATION_VIEWS } from './views';

/** The titration lab in the kit's room: the cupboard's apparatus, the bench station, what is held, and its drags. */
export function LabScene({ state, scene, t, v, guided, interactive, onSlow }: { state: ChemTitrationState; scene: SceneState; t: Titration; v: ChemTitrationVariant; guided: boolean; interactive: boolean; onSlow: () => void }) {
  const quality = useLabView((s) => s.quality);
  const mode = useLabView((s) => s.mode);
  const meniscusY = STATION[1] + SPOT.jetHeight + buretteY(state.burette ?? 0);
  return (
    <KitScene room={TITRATION_ROOM} coatOn={scene.coat} gogglesOn={scene.goggles} presets={TITRATION_VIEWS} read={[STATION[0] + SPOT.buretteAxis[0], meniscusY, STATION[2] + SPOT.buretteAxis[2]]} guided={guided} onSlow={onSlow}>
      <CupboardContents scene={scene} />
      <Station state={state} scene={scene} t={t} v={v} detail={quality !== 'low' || mode !== 'walk'} />
      <Held />
      {interactive && <DragController t={t} s={state} scene={scene} />}
    </KitScene>
  );
}
