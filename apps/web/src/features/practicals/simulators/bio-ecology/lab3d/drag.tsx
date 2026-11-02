import { SOIL_TYPES, type SoilType } from '@aischool/shared';
import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Plane, Raycaster, Vector2, Vector3 } from 'three';
import { dragClock } from '../../../lab3d-kit/drag';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { funnelSpot, plotWorld, world } from './bench';
import type { EcoCtx } from './lab-actions';

/**
 * Hands-on drags in the field, alongside the buttons: the quadrat frame
 * dropped onto the plot (put down where you choose — by eye, which the guide
 * points out is biased), and a soil bag dropped onto the funnel stand (100 g
 * of it into a funnel with cotton wool). Dropped anywhere else, it says where.
 */
const MINE = ['quaddrag', 'bagdrag'];
export const DRAG_HINT: Record<string, string> = { quaddrag: 'Drop it on the plot (by eye — the random-number table is better)', bagdrag: 'Drop it on the funnel stand' };

export function EcoDrags({ ctx }: { ctx: EcoCtx }) {
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
      const ndc = new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      if (d.kind === 'quaddrag') {
        const ray = new Raycaster();
        ray.setFromCamera(ndc, camera);
        const hit = new Vector3();
        if (!ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), 0), hit)) return notify(`${DRAG_HINT.quaddrag}.`, 'info');
        const [x0, , z0] = plotWorld(0, 0);
        const px = hit.x - x0;
        const py = z0 - hit.z;
        if (px < 0 || px >= 20 || py < 0 || py >= 20) return notify(`${DRAG_HINT.quaddrag}.`, 'info');
        if (!c.s.quad.pegged) return notify('Peg out the plot first.', 'warning');
        c.o.quad.placeAt(px, py);
        return;
      }
      const t = d.id.slice(4) as SoilType;
      if (!SOIL_TYPES.includes(t)) return;
      const p = new Vector3(...world(funnelSpot(1), 0.2)).project(camera);
      const dist = Math.hypot(e.clientX - (r.left + ((p.x + 1) / 2) * r.width), e.clientY - (r.top + ((1 - p.y) / 2) * r.height));
      if (dist > 140) return notify(`${DRAG_HINT.bagdrag}.`, 'info');
      if (!c.scene.collected.has('funnels')) return notify('Get the funnels from the shed first.', 'warning');
      if (c.s.soil.pouredAt !== null || c.s.soil.funnels.some((f) => f.soil === t)) return notify('Not now.', 'info');
      c.o.soil.funnel(t, 100, true);
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
