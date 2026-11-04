import { ORG_TEST_INFO, type ChemOrganicState, type ChemOrganicVariant } from '@aischool/shared';
import { useMemo, type ReactNode } from 'react';
import { KitScene } from '../../../lab3d-kit/scene';
import { BATH_TOP, ORG_VIEWS, OSPOT, orgRoom, useOrgBench, world } from './bench';
import type { OrgScene } from './scene-state';
import { OrgCupboard, OrgStation } from './station';

/** The organic bench in the kit's chemistry room. */
export function OrgLabScene({ v, state, scene, guided, onSlow, children }: { v: ChemOrganicVariant; state: ChemOrganicState; scene: OrgScene; guided: boolean; onSlow: () => void; children?: ReactNode }) {
  const task = state.task ?? 'GROUPS';
  const active = useOrgBench((b) => b.active);
  const t = state.tests[active];
  const inBath = !!t && (ORG_TEST_INFO[t.test].heats || t.test === 'IODINE') && (t.heat > 0 || t.boil > 0) && !t.direct;
  const room = useMemo(() => orgRoom(task), [task]);
  const presets = useMemo(() => (inBath ? { ...ORG_VIEWS, tube: { ...ORG_VIEWS.bath!, dist: 0.42 } } : ORG_VIEWS), [inBath]);
  const read = task === 'SOAP' ? world(OSPOT.balance, 0.04) : inBath ? world(OSPOT.bath, BATH_TOP + 0.06) : world(OSPOT.tube, 0.08);
  return (
    <KitScene room={room} coatOn={scene.coat} gogglesOn={scene.goggles} presets={presets} read={read} guided={guided} onSlow={onSlow} assistantSpot={[1.3, -1.25]}>
      <OrgCupboard scene={scene} />
      <OrgStation v={v} state={state} scene={scene} />
      {children}
    </KitScene>
  );
}
