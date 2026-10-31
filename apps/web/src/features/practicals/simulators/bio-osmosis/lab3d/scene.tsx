import type { BioOsmosisState, BioOsmosisVariant } from '@aischool/shared';
import { useMemo, type ReactNode } from 'react';
import { KitScene } from '../../../lab3d-kit/scene';
import { OKON_SPOT } from '../../bio-common/lab3d/common';
import { bioRoom } from '../../bio-common/lab3d/room';
import { rulerZeroX } from '../../bio-common/lab3d/apparatus';
import { OSMO_VIEWS, OSPOT, useOsmoBench, world } from './bench';
import type { OsmoScene } from './scene-state';
import { OsmoCupboard, OsmoStation } from './station';

/** The osmosis bench in the biology room. */
export function OsmoLabScene({ v, state, scene, guided, onSlow, children }: { v: BioOsmosisVariant; state: BioOsmosisState; scene: OsmoScene; guided: boolean; onSlow: () => void; children?: ReactNode }) {
  const task = state.task ?? 'POTATO';
  const lying = useOsmoBench((b) => b.lying);
  const room = useMemo(
    () =>
      task === 'PLASMOLYSIS'
        ? bioRoom({
            whiteboard: ['Biology — SS3 Practical', 'Plasmolysis in epidermal cells', 'Water → strong solution → water', 'Count the plasmolysed cells at ×40'],
            note: 'Draw it under with filter paper',
            poster: { title: 'Plasmolysis', band: '#6a1b9a', lines: ['Water leaves by osmosis.', 'Cytoplasm pulls from the wall.', 'The wall keeps its shape.', 'In water: deplasmolysis.'] },
          })
        : task === 'AGAR'
          ? bioRoom({
              whiteboard: ['Biology — SS3 Practical', 'Diffusion into agar cubes', 'SA : V = 6 ÷ side', 'Time each cube until colourless'],
              note: 'Goggles on: acid and alkali',
              poster: { title: 'Diffusion', band: '#00695c', lines: ['High → low concentration.', 'No membrane, no energy.', 'Depth grows as √time.', 'Small cube: large SA : V.'] },
            })
          : bioRoom({
              whiteboard: ['Biology — SS3 Practical', 'Osmosis in potato cylinders', '% change = (final − initial) ÷ initial × 100', 'Graph: % change against concentration'],
              note: 'Blot before every weighing!',
              poster: { title: 'Osmosis', band: '#1565c0', lines: ['Water: high → low water potential.', 'Through a partially permeable membrane.', 'Dilute: turgid. Strong: flaccid.', '0 % change: isotonic.'] },
            }),
    [task],
  );
  const read = task === 'PLASMOLYSIS' ? world(OSPOT.scope, 0.36) : task === 'POTATO' && lying === 'balance' ? world([OSPOT.balance[0], 0, OSPOT.balance[2] + 0.1], 0.03) : world([OSPOT.ruler[0] + rulerZeroX + 0.03, 0, OSPOT.ruler[2]], 0.005);
  return (
    <KitScene room={room} coatOn={scene.coat} gogglesOn={scene.goggles} presets={OSMO_VIEWS} read={read} guided={guided} onSlow={onSlow} assistantSpot={OKON_SPOT}>
      <OsmoCupboard scene={scene} />
      <OsmoStation v={v} state={state} scene={scene} />
      {children}
    </KitScene>
  );
}
