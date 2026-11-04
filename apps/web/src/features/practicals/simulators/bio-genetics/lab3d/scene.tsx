import type { BioGeneticsState, BioGeneticsVariant } from '@aischool/shared';
import { useMemo, type ReactNode } from 'react';
import { KitScene } from '../../../lab3d-kit/scene';
import { OKON_SPOT } from '../../bio-common/lab3d/common';
import { bioRoom } from '../../bio-common/lab3d/room';
import { GEN_VIEWS, GSPOT, SEAT, world } from './bench';
import type { GenScene } from './scene-state';
import { GenCupboard, GenStation } from './station';

/** The genetics bench in the biology room. */
export function GenLabScene({ v, state, scene, guided, onSlow, children }: { v: BioGeneticsVariant; state: BioGeneticsState; scene: GenScene; guided: boolean; onSlow: () => void; children?: ReactNode }) {
  const task = state.task ?? 'HEIGHT';
  const room = useMemo(
    () =>
      task === 'DISCRETE'
        ? bioRoom({
            whiteboard: ['Biology — SS2 Practical', 'Discontinuous variation', 'Tongue rolling; ABO blood groups', 'Angle = n ÷ total × 360°'],
            note: 'NO blood samples — use the health records',
            poster: { title: 'Variation', band: '#6a1b9a', lines: ['Discontinuous: distinct groups,', 'one or a few genes.', 'Continuous: a range of values,', 'many genes + environment.'] },
          })
        : task === 'CROSS'
          ? bioRoom({
              whiteboard: ['Biology — SS3 Practical', 'A model monohybrid cross', 'Tt × Tt → 1 TT : 2 Tt : 1 tt', 'P(tt) = ½ × ½ = ¼'],
              note: 'Draw WITHOUT looking; return and shake',
              poster: { title: 'Mendel’s first law', band: '#1565c0', lines: ['Each gamete carries one allele', 'of each gene.', 'T dominant (tall), t recessive.', 'Tall : short = 3 : 1.'] },
            })
          : task === 'FOOD'
            ? bioRoom({
                whiteboard: ['Biology — SS2 Practical', 'Food chains, webs and pyramids', 'Arrows: eaten → eater', 'Efficiency = E₂ ÷ E₁ × 100'],
                note: 'Gloves and covered shoes in the field',
                poster: { title: 'Energy flow', band: '#2e7d32', lines: ['Producer → primary → secondary', '→ tertiary consumer.', 'About 10 % passes on;', 'the rest is lost as heat.'] },
              })
            : bioRoom({
                whiteboard: ['Biology — SS2 Practical', 'Continuous variation', 'Height to the nearest cm', 'Mean = Σfx ÷ Σf'],
                note: 'Shoes OFF; set square on the head',
                poster: { title: 'Variation', band: '#ad1457', lines: ['Height, mass and hand span', 'vary continuously.', 'Histogram: no gaps between bars.', 'Most people are near the mean.'] },
              }),
    [task],
  );
  const read = task === 'HEIGHT' ? world(GSPOT.board, 0.7) : task === 'DISCRETE' ? world([SEAT[0], 0, SEAT[1]], 0.35) : task === 'CROSS' ? world([0, 0, -0.05], 0.05) : world(GSPOT.notes, 0.02);
  return (
    <KitScene room={room} coatOn={scene.coat} gogglesOn={scene.goggles} presets={GEN_VIEWS} read={read} guided={guided} onSlow={onSlow} assistantSpot={OKON_SPOT}>
      <GenCupboard scene={scene} />
      <GenStation v={v} state={state} scene={scene} />
      {children}
    </KitScene>
  );
}
