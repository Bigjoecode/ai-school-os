import type { BioSpecimensState, BioSpecimensVariant } from '@aischool/shared';
import { useMemo } from 'react';
import { KitScene } from '../../../lab3d-kit/scene';
import { bioRoom } from '../../bio-common/lab3d/room';
import { SPEC_VIEWS, useBench, type SceneState } from './scene-state';
import { CupboardContents, Station, specimenWorld } from './station';

/** The specimen bench in the biology room. */
export function LabScene({ v, state, scene, guided, interactive, onSlow }: { v: BioSpecimensVariant; state: BioSpecimensState; scene: SceneState; guided: boolean; interactive: boolean; onSlow: () => void }) {
  const current = useBench((b) => b.current);
  const title = v.info.title;
  const room = useMemo(
    () =>
      bioRoom({
        whiteboard: ['Biology — SS3 Practical', `Specimens: ${title}`, 'Examine each with the hand lens', 'Name · classify · label · compare'],
        note: 'Features you can SEE!',
        poster: { title: 'Classifying', band: '#5d4037', lines: ['Look for the features you can see.', 'Name: one name only.', 'Group: kingdom, phylum, class…', 'Magnification has no unit.'] },
      }),
    [title],
  );
  return (
    <KitScene room={room} coatOn={scene.coat} gogglesOn={scene.goggles} presets={SPEC_VIEWS} read={specimenWorld(Math.min(current, v.specimens.length - 1), v.specimens.length)} guided={guided} onSlow={onSlow}>
      <CupboardContents scene={scene} />
      <Station v={v} state={state} scene={scene} interactive={interactive} />
    </KitScene>
  );
}
