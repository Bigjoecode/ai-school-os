import type { BioDissectionState, BioDissectionVariant } from '@aischool/shared';
import { useMemo, type ReactNode } from 'react';
import { KitScene } from '../../../lab3d-kit/scene';
import { OKON_SPOT } from '../../bio-common/lab3d/common';
import { bioRoom } from '../../bio-common/lab3d/room';
import { DISSECT_VIEWS, DSPOT, world } from './bench';
import type { DissectScene } from './scene-state';
import { DissectCupboard, DissectStation } from './station';

/** The dissection bench in the biology room. */
export function DissectLabScene({ v, state, scene, seed, guided, onSlow, children }: { v: BioDissectionVariant; state: BioDissectionState; scene: DissectScene; seed: number; guided: boolean; onSlow: () => void; children?: ReactNode }) {
  const task = state.task ?? 'EOSIN';
  const room = useMemo(
    () =>
      task === 'RAT'
        ? bioRoom({
            whiteboard: ['Biology — SS3 Practical', 'Dissection of a rat: the alimentary system', 'Ventral side up · lift, then cut', 'Gut : body = (SI + LI) ÷ body'],
            note: 'No gall bladder in the rat!',
            poster: { title: 'Alimentary canal', band: '#6d4c41', lines: ['Oesophagus → stomach → duodenum.', 'Ileum → caecum → colon → rectum.', 'Liver: bile duct to the duodenum.', 'Pancreas in the duodenal loop.'] },
          })
        : task === 'MICROBE'
          ? bioRoom({
              whiteboard: ['Biology — SS3 Practical', 'Growing microorganisms', 'Label the BASE · tape · invert', '% reduction = (U − W) ÷ U × 100'],
              note: 'NEVER open a plate after incubation',
              poster: { title: 'Microorganisms', band: '#00695c', lines: ['Bacteria: shiny, creamy colonies.', 'Fungi: fluffy colonies.', 'Rhizopus: hyphae, sporangia.', 'Incubate at no more than 30 °C.'] },
            })
          : bioRoom({
              whiteboard: ['Biology — SS3 Practical', 'Path of water in a plant (eosin)', 'Rate = Δheight ÷ Δtime', 'Shade ONLY the xylem'],
              note: 'Cut AWAY from your fingers',
              poster: { title: 'Transport in plants', band: '#2e7d32', lines: ['Xylem: water and mineral salts.', 'Phloem: food (sugars).', 'Transpiration pull draws water up.', 'Dicot stem: bundles in a ring.'] },
            }),
    [task],
  );
  const read = task === 'RAT' ? world(DSPOT.board, 0.05) : task === 'MICROBE' ? world(DSPOT.plates, 0.03) : world(DSPOT.eosin, 0.18);
  return (
    <KitScene room={room} coatOn={scene.coat} gogglesOn={scene.goggles} presets={DISSECT_VIEWS} read={read} guided={guided} onSlow={onSlow} assistantSpot={OKON_SPOT}>
      <DissectCupboard scene={scene} />
      <DissectStation v={v} state={state} scene={scene} seed={seed} />
      {children}
    </KitScene>
  );
}
