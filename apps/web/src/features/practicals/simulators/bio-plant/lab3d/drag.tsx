import { OXY_DISTS } from '@aischool/shared';
import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Vector3 } from 'three';
import { dragClock } from '../../../lab3d-kit/drag';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { PSPOT, lampSpot, world } from './bench';
import { oxyActs, starchActs, type PlantCtx } from './lab-actions';

/**
 * Hands-on drags at the plant bench, alongside the buttons: the lamp slid
 * along the metre rule (it snaps to the nearest marked distance); a leaf onto
 * the water bath (boil, or ethanol with the flame off), the warm water, the
 * tile, or the grid. Dropped anywhere else, it says where to drop it.
 */
const MINE = ['lampdrag', 'leafdrag'];
export const DRAG_HINT: Record<string, string> = { lampdrag: 'Slide the lamp along the metre rule', leafdrag: 'Drop it on the water bath, the warm water, the tile or the grid' };

export function PlantDrags({ ctx }: { ctx: PlantCtx }) {
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
      const screen = (p: [number, number, number]) => {
        const v = new Vector3(...p).project(camera);
        return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
      };
      const near = (targets: { id: string; p: [number, number, number] }[], max = 110) => {
        let best: string | null = null;
        let bestD = max;
        for (const t of targets) {
          const s = screen(t.p);
          const dist = Math.hypot(e.clientX - s.x, e.clientY - s.y);
          if (dist < bestD) [best, bestD] = [t.id, dist];
        }
        return best;
      };
      if (d.kind === 'lampdrag') {
        if (!c.s.oxy.plant) return notify('Set up the pondweed first.', 'warning');
        const hit = near(OXY_DISTS.map((x) => ({ id: String(x), p: world(lampSpot(x), 0.02) })), 160);
        if (hit) return oxyActs.lamp(c, Number(hit));
        return notify(`${DRAG_HINT.lampdrag}.`, 'info');
      }
      const i = Number(d.id.split(':')[1]);
      const l = c.s.starch.leaves[i];
      if (!l) return;
      const hit = near([
        { id: 'bath', p: world(PSPOT.bath, 0.3) },
        { id: 'warm', p: world(PSPOT.warm, 0.05) },
        { id: 'tile', p: world(PSPOT.tile, 0.01) },
        { id: 'grid', p: world(PSPOT.grid, 0.01) },
      ]);
      const has = (id: Parameters<PlantCtx['scene']['collected']['has']>[0]) => c.scene.collected.has(id);
      if (hit === 'bath' && has('bath')) {
        if (c.s.starch.flame) return c.p.starch.boil(i);
        if (c.s.starch.hot) return starchActs.ethanol(c, i);
        return notify('Light the Bunsen to heat the water bath first.', 'info');
      }
      if (hit === 'warm') return c.p.starch.soften(i);
      if (hit === 'tile' && has('tile')) return c.p.starch.tile(i);
      if (hit === 'grid' && has('grid')) return l.iodine ? c.p.starch.grid(i) : notify('Test it with iodine before laying it on the grid.', 'info');
      notify(`${DRAG_HINT.leafdrag}.`, 'info');
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
