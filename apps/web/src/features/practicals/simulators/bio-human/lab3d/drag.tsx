import { SKIN_AREAS } from '@aischool/shared';
import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Vector3 } from 'three';
import { dragClock } from '../../../lab3d-kit/drag';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { HSPOT, SKIN_POINT, useHumanBench, world } from './bench';
import { pulseActs, reactActs, skinActs, type HumanCtx } from './lab-actions';

/**
 * Hands-on drags at the bench, alongside the buttons: the dividers onto an
 * area of the partner's skin (a two-point touch at the gap set), the
 * stopwatch onto the partner's wrist (a 15 s count) and the rule released
 * (a drop, dominant hand). Dropped anywhere else, it says where to drop it.
 */
const MINE = ['dividersdrag', 'clockdrag', 'ruledrag'];
export const DRAG_HINT: Record<string, string> = { dividersdrag: 'Drop the points on an area of your partner’s skin', clockdrag: 'Drop the stopwatch on your partner’s wrist to count 15 s', ruledrag: 'Pull the rule down to release it' };

export function HumanDrags({ ctx }: { ctx: HumanCtx }) {
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
      if (d.kind === 'ruledrag') return reactActs.drop(c, 'DOM');
      if (d.kind === 'clockdrag') {
        if (near([{ id: 'wrist', p: world(HSPOT.wrist, 0.01) }])) return pulseActs.count(c, 15);
        return notify(`${DRAG_HINT.clockdrag}.`, 'info');
      }
      const hit = near(SKIN_AREAS.map((a) => ({ id: a, p: world(SKIN_POINT[a]) })), 90);
      if (hit) return skinActs.touch(c, hit as (typeof SKIN_AREAS)[number], useHumanBench.getState().sep);
      notify(`${DRAG_HINT.dividersdrag}.`, 'info');
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
