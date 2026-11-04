import { FOOD_SPOTS } from '@aischool/shared';
import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Vector3 } from 'three';
import { dragClock } from '../../../lab3d-kit/drag';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { GSPOT, SPOT_AT, world } from './bench';
import { crossActs, foodActs, heightActs, type GenCtx } from './lab-actions';

/**
 * Hands-on drags at the bench, alongside the buttons: the set square onto the
 * classmate's head at the board (a height reading), a bead from a beaker onto
 * the tray (one draw) and the sweep net onto a field-spot card (survey it).
 * Dropped anywhere else, it says where to drop it.
 */
const MINE = ['squaredrag', 'beaddrag', 'netdrag'];
export const DRAG_HINT: Record<string, string> = { squaredrag: 'Drop the set square on the head of the classmate at the board', beaddrag: 'Drop it on the tray: one bead from each beaker', netdrag: 'Drop the net on a field-spot card to survey it' };

export function GenDrags({ ctx }: { ctx: GenCtx }) {
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
      if (d.kind === 'squaredrag') {
        const p = c.g.v.height.people[c.s.height.at]!;
        if (near([{ id: 'head', p: world(GSPOT.board, p.h / 100) }], 140)) {
          c.g.height.square(true);
          return heightActs.measure(c, 'H');
        }
        return notify(`${DRAG_HINT.squaredrag}.`, 'info');
      }
      if (d.kind === 'beaddrag') {
        if (near([{ id: 'tray', p: world(GSPOT.tray, 0.01) }])) return crossActs.draw(c, 1);
        return notify(`${DRAG_HINT.beaddrag}.`, 'info');
      }
      const hit = near(FOOD_SPOTS.map((s, k) => ({ id: s, p: world(SPOT_AT(k)) })), 90);
      if (hit) return foodActs.survey(c, hit as (typeof FOOD_SPOTS)[number]);
      notify(`${DRAG_HINT.netdrag}.`, 'info');
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
