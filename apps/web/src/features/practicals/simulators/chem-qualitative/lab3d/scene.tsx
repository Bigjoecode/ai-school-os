import type { ChemQualitativeState, ChemQualitativeVariant } from '@aischool/shared';
import { useMemo } from 'react';
import { STATION } from '../../../lab3d-kit/layout';
import { KitScene } from '../../../lab3d-kit/scene';
import { QSPOT, QUAL_ROOM, QUAL_VIEWS, useQualBench } from './bench';
import type { QualScene } from './scene-state';
import { QualCupboard, QualStation } from './station';

/** The qualitative-analysis lab in the kit's chemistry room: the cupboard's apparatus and the bench. */
export function QualLabScene({ v, state, scene, guided, onSlow }: { v: ChemQualitativeVariant; state: ChemQualitativeState; scene: QualScene; guided: boolean; onSlow: () => void }) {
  const active = useQualBench((b) => b.active);
  const reagent = state.tests[active]?.reagent;
  // A tube being heated (or a flame test) is at the burner: "Test tube" looks there.
  const atBurner = (reagent === 'HEAT' || reagent === 'FLAME') && scene.burnerOn;
  const presets = useMemo(() => (atBurner ? { ...QUAL_VIEWS, tube: QUAL_VIEWS.burner! } : QUAL_VIEWS), [atBurner]);
  return (
    <KitScene room={QUAL_ROOM} coatOn={scene.coat} gogglesOn={scene.goggles} presets={presets} read={[STATION[0] + QSPOT.tube[0], STATION[1] + 0.1, STATION[2] + QSPOT.tube[2]]} guided={guided} onSlow={onSlow} assistantSpot={[1.3, -1.25]}>
      <QualCupboard scene={scene} />
      <QualStation v={v} state={state} scene={scene} />
    </KitScene>
  );
}
