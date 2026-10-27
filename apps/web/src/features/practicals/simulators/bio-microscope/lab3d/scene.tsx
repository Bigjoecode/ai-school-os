import { MICRO_SLIDE_INFO, type BioMicroscopeState } from '@aischool/shared';
import { useMemo, type ReactNode } from 'react';
import { Interactive } from '../../../lab3d-kit/interact';
import { KitScene } from '../../../lab3d-kit/scene';
import { OKON_SPOT } from '../../bio-common/lab3d/common';
import { useLabView } from '../../../lab3d-kit/store';
import { bioRoom } from '../../bio-common/lab3d/room';
import type { Microscope } from '../actions';
import { DragController, partDrag } from './drag';
import type { ScopePart, SlideLook } from './microscope';
import type { SceneState } from './scene-state';
import { MICRO_VIEWS } from './spots';
import { CupboardContents, Station, eyepieceWorld } from './station';

const PART_LABEL: Record<ScopePart, string> = {
  turret: 'Nosepiece (objectives) — drag sideways to turn',
  coarse: 'Coarse focus knob — drag up / down',
  fine: 'Fine focus knob — drag up / down',
  diaphragm: 'Diaphragm lever — drag sideways',
  lamp: 'Lamp dial — drag up / down',
  stage: 'Stage and clips',
  eyepiece: 'Eyepiece — look through it',
};
/** Where each part is (scope-local; stage and diaphragm relative to the moving stage): the Interactive sits there, so the guide's arrow points at it. */
const PART_POS: Record<ScopePart, [number, number, number]> = { turret: [0, 0.2, 0.012], coarse: [0.032, 0.115, -0.085], fine: [0.046, 0.115, -0.085], diaphragm: [0.03, -0.025, 0.012], lamp: [0.078, 0.018, 0.05], stage: [0, 0, 0.012], eyepiece: [0, 0.37, 0.06] };
const PART_Y: Record<ScopePart, number> = { turret: 0.03, coarse: 0.04, fine: 0.04, diaphragm: 0.03, lamp: 0.04, stage: 0.04, eyepiece: 0.05 };

/** The microscope lab in the biology room: the cupboard's apparatus, the bench station, and its drags. */
export function LabScene({ state, scene, m, guided, interactive, readOnly, onSlow }: { state: BioMicroscopeState; scene: SceneState; m: Microscope; guided: boolean; interactive: boolean; readOnly: boolean; onSlow: () => void }) {
  const quality = useLabView((s) => s.quality);
  const mode = useLabView((s) => s.mode);
  const title = state.slide ? MICRO_SLIDE_INFO[state.slide].title : 'Choose a slide';
  const room = useMemo(
    () =>
      bioRoom({
        whiteboard: ['Biology — SS3 Practical', `Light microscope: ${title}`, 'Low power first, then high power', 'At ×40: fine focus only'],
        note: 'Draw what you see!',
        poster: { title: 'The microscope', band: '#2e7d32', lines: ['Carry it with two hands.', 'Low power first.', 'Fine focus only at ×40.', 'Total magnification = eyepiece × objective.'] },
      }),
    [title],
  );
  const look: SlideLook = { medium: state.prep.medium, specimen: scene.specimen, coverslip: state.prep.coverslip, cavity: state.slide === 'POND', crashed: state.flags.crashed };
  const part = (p: ScopePart, node: ReactNode) => (
    <Interactive id={p} label={PART_LABEL[p]} bench labelY={PART_Y[p]} position={PART_POS[p]} drag={(id) => (interactive ? partDrag(id, readOnly) : null)}>
      <group position={[-PART_POS[p][0], -PART_POS[p][1], -PART_POS[p][2]]}>{node}</group>
    </Interactive>
  );
  return (
    <KitScene room={room} coatOn={scene.coat} gogglesOn={scene.goggles} presets={MICRO_VIEWS} read={eyepieceWorld()} guided={guided} onSlow={onSlow} assistantSpot={OKON_SPOT}>
      <CupboardContents scene={scene} slide={state.slide} />
      <Station state={state} scene={scene} look={look} detail={quality !== 'low' || mode !== 'walk'} part={part} interactive={interactive} />
      {interactive && <DragController m={m} s={state} scene={scene} />}
    </KitScene>
  );
}
