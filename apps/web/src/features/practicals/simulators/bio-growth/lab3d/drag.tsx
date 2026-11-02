import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Vector3 } from 'three';
import { dragClock } from '../../../lab3d-kit/drag';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { GSPOT, useGrowthBench, world } from './bench';
import type { GrowthCtx } from './lab-actions';

/**
 * Hands-on drags at the growth bench, alongside the buttons: a tube into the
 * refrigerator (or back into the rack); a pot of seedlings into the light box
 * or onto the clinostat. Dropped anywhere else, it says where to drop it.
 */
const MINE = ['tubedrag', 'potdrag'];
export const DRAG_HINT: Record<string, string> = { tubedrag: 'Drop the tube in the refrigerator or back in the rack', potdrag: 'Drop the pot in the light box or on the clinostat' };

export function GrowthDrags({ ctx }: { ctx: GrowthCtx }) {
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
      const near = (targets: { id: string; p: [number, number, number] }[], max = 120) => {
        let best: string | null = null;
        let bestD = max;
        for (const t of targets) {
          const s = screen(t.p);
          const dist = Math.hypot(e.clientX - s.x, e.clientY - s.y);
          if (dist < bestD) [best, bestD] = [t.id, dist];
        }
        return best;
      };
      if (d.kind === 'tubedrag') {
        const k = d.id.startsWith('tube:') ? Number(d.id.slice(5)) : useGrowthBench.getState().tube;
        const hit = near([
          { id: 'fridge', p: world(GSPOT.fridge, 0.15) },
          { id: 'rack', p: world(GSPOT.rack, 0.06) },
        ]);
        if (c.s.germ.day > 0) return notify('The tubes are set up: leave them alone now.', 'info');
        if (hit === 'fridge' || hit === 'rack') {
          c.p.germ.fridge(k, hit === 'fridge');
          useGrowthBench.setState({ tube: k });
          return play('clink');
        }
        return notify(`${DRAG_HINT.tubedrag}.`, 'info');
      }
      const hit = near([
        { id: 'lightbox', p: world(GSPOT.lightbox, 0.12) },
        { id: 'klinostat', p: world(GSPOT.klinostat, 0.08) },
      ]);
      if (c.s.trop.day > 0) return notify('The experiments are running: leave them alone now.', 'info');
      if (hit === 'lightbox' && c.scene.collected.has('lightbox')) return void (c.p.trop.box(), play('clink'));
      if (hit === 'klinostat' && c.scene.collected.has('klinostat')) return void (c.p.trop.ctrl('KLINO'), play('clink'));
      notify(`${DRAG_HINT.potdrag}.`, 'info');
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
