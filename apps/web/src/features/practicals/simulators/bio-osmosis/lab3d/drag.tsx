import { potatoPhase, type PlasMedium } from '@aischool/shared';
import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Vector3 } from 'three';
import { dragClock } from '../../../lab3d-kit/drag';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { OSPOT, beakerSpot, world } from './bench';
import { agarActs, plasActs, potatoActs, type OsmoCtx } from './lab-actions';

/**
 * Hands-on drags at the osmosis bench, alongside the buttons: a cylinder onto
 * the ruler (measure), the balance (weigh), the filter paper (blot) or its
 * beaker (into the solution); a dropper bottle onto the slide (a drop at the
 * edge of the cover slip); a cube onto the ruler or into the acid. Dropped
 * anywhere else, it says where to drop it.
 */
const MINE = ['cyldrag', 'dropperdrag', 'cubedrag'];
export const DRAG_HINT: Record<string, string> = { cyldrag: 'Drop it on the ruler, the balance, the filter paper or its beaker', dropperdrag: 'Drop it on your slide (at the edge of the cover slip)', cubedrag: 'Drop it on the ruler or in the beaker of acid' };

export function OsmoDrags({ ctx }: { ctx: OsmoCtx }) {
  const camera = useThree((st) => st.camera);
  const gl = useThree((st) => st.gl);
  const ref = useRef(ctx);
  ref.current = ctx;
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = useLabView.getState().drag;
      if (!d || !MINE.includes(d.kind)) return;
      useLabView.setState({ drag: { ...d, x: e.clientX, y: e.clientY, moved: d.moved + Math.hypot(e.clientX - d.x, e.clientY - d.y) } });
    };
    const up = (e: PointerEvent) => {
      const d = useLabView.getState().drag;
      if (!d || !MINE.includes(d.kind)) return;
      useLabView.setState({ drag: null });
      if (d.moved < 8) return;
      dragClock.endedAt = performance.now();
      const c = ref.current;
      const r = gl.domElement.getBoundingClientRect();
      const near = (targets: { id: string; p: [number, number, number] }[]) => {
        let best: string | null = null;
        let bestD = 110;
        for (const t of targets) {
          const p = new Vector3(...t.p).project(camera);
          const dist = Math.hypot(e.clientX - (r.left + ((p.x + 1) / 2) * r.width), e.clientY - (r.top + ((1 - p.y) / 2) * r.height));
          if (dist < bestD) [best, bestD] = [t.id, dist];
        }
        return best;
      };
      const has = (id: Parameters<OsmoCtx['scene']['collected']['has']>[0]) => c.scene.collected.has(id);
      if (d.kind === 'cyldrag') {
        const i = Number(d.id.split(':')[1]);
        const cy = c.s.potato.cyl[i];
        if (!cy || potatoPhase(cy) === 'SOAK') return;
        const hit = near([
          { id: 'ruler', p: world(OSPOT.ruler, 0.01) },
          { id: 'balance', p: world(OSPOT.balance, 0.05) },
          { id: 'paper', p: world(OSPOT.paper, 0.005) },
          { id: 'beaker', p: world(beakerSpot(i), 0.05) },
        ]);
        if (hit === 'ruler' && has('ruler')) return potatoActs.measure(c, i);
        if (hit === 'balance' && has('balance')) return potatoActs.weigh(c, i);
        if (hit === 'paper' && has('paper')) return c.o.potato.blot(i);
        if (hit === 'beaker' && has('beakers') && potatoPhase(cy) === 'B') return c.o.potato.place(i);
        return notify(`${DRAG_HINT.cyldrag}.`, 'info');
      }
      if (d.kind === 'dropperdrag') {
        const m = d.id.slice(8) as PlasMedium;
        if (near([{ id: 'slide', p: world(c.s.plas.onStage ? OSPOT.scope : OSPOT.slideTile, c.s.plas.onStage ? 0.12 : 0.01) }])) {
          if (!c.s.plas.mount) return c.s.plas.peeled ? c.o.plasmolysis.mount(m) : notify('Peel a strip of epidermis from the onion first.', 'warning');
          if (c.s.plas.coverslip) return plasActs.drop(c, m);
          return notify('Lower the cover slip first.', 'info');
        }
        return notify(`${DRAG_HINT.dropperdrag}.`, 'info');
      }
      const i = Number(d.id.split(':')[1]);
      const cu = c.s.agar.cubes[i];
      if (!cu) return;
      const hit = near([
        { id: 'ruler', p: world(OSPOT.ruler, 0.01) },
        { id: 'acid', p: world(OSPOT.acidBeaker, 0.05) },
      ]);
      if (hit === 'ruler' && has('ruler')) return cu.cutAt !== null ? agarActs.depth(c, i) : agarActs.measure(c, i);
      if (hit === 'acid' && cu.placedAt === null) {
        if (!c.s.agar.acid) return notify('Pour the acid into the beaker first.', 'warning');
        return c.o.agar.placeAll();
      }
      notify(`${DRAG_HINT.cubedrag}.`, 'info');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [camera, gl]);
  return null;
}
