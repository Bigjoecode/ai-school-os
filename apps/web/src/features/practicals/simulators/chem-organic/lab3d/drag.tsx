import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Vector3 } from 'three';
import { dragClock } from '../../../lab3d-kit/drag';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { BATH_TOP, OSPOT, sampleSpot, useOrgBench, world } from './bench';
import { heatTube, startTest, type OrgCtx } from './lab-actions';
import { ORG_BOTTLES } from './station';

/**
 * Hands-on drags at the organic bench, alongside the buttons: drag a reagent
 * bottle onto a sample (starts that test) or onto the tube in use (adds it);
 * drag the tube into the water bath (warms it for a minute). Dropped anywhere
 * else, it says where to drop it.
 */
export function OrgDrags({ ctx }: { ctx: OrgCtx }) {
  const camera = useThree((st) => st.camera);
  const gl = useThree((st) => st.gl);
  const ref = useRef(ctx);
  ref.current = ctx;
  useEffect(() => {
    const isMine = (k?: string) => k === 'reagentdrag' || k === 'tubedrag';
    const move = (e: PointerEvent) => {
      const d = useLabView.getState().drag;
      if (!d || !isMine(d.kind)) return;
      useLabView.setState({ drag: { ...d, x: e.clientX, y: e.clientY, moved: d.moved + Math.hypot(e.clientX - d.x, e.clientY - d.y) } });
    };
    const up = (e: PointerEvent) => {
      const d = useLabView.getState().drag;
      if (!d || !isMine(d.kind)) return;
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
      const active = useOrgBench.getState().active;
      const t = c.s.tests[active];
      if (d.kind === 'tubedrag') {
        if (near([{ id: 'bath', p: world(OSPOT.bath, BATH_TOP + 0.05) }])) {
          if (!t) return;
          if (!c.scene.burnerOn) return notify('Light the burner under the water bath first.', 'warning');
          return heatTube(c, active, 60);
        }
        return notify('Drop the tube in the water bath to warm it.', 'info');
      }
      const b = ORG_BOTTLES.find((x) => x.id === d.id.replace(/^bottle:/, ''));
      if (!b) return;
      const hit = near([...c.o.v.samples.map((sm, k) => ({ id: sm.letter, p: world(sampleSpot(k), 0.05) })), ...(t ? [{ id: 'tube', p: world(OSPOT.tube, 0.1) }] : [])]);
      if (hit === 'tube' && b.step && t) return c.o.addStep(active, b.step);
      if (hit && hit !== 'tube' && b.start) {
        if (!c.scene.collected.has('rack')) return notify('Get the test tubes from the apparatus cupboard first.', 'warning');
        return startTest(c, hit as never, b.start[0], b.start[1]);
      }
      notify(b.start ? 'Drop the bottle on a sample beaker to start that test.' : 'Drop it on the test tube in use.', 'info');
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
