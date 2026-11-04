import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Vector3 } from 'three';
import { dragClock } from '../../../lab3d-kit/drag';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { DSPOT, world } from './bench';
import type { DissectCtx } from './lab-actions';

/**
 * Hands-on drags at the dissection bench, alongside the buttons: the washed
 * plant into the eosin beaker; the ruler onto the rat (the body length); an
 * agar plate into the incubator (at 30 °C). Dropped anywhere else, it says
 * where to drop it.
 */
const MINE = ['plantdrag', 'rulerdrag', 'platedrag'];
export const DRAG_HINT: Record<string, string> = { plantdrag: 'Drop the plant in the beaker of eosin', rulerdrag: 'Drop the ruler along the rat', platedrag: 'Drop the plates in the incubator' };

export function DissectDrags({ ctx }: { ctx: DissectCtx }) {
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
      const near = (p: [number, number, number], max = 120) => {
        const v = new Vector3(...p).project(camera);
        return Math.hypot(e.clientX - (r.left + ((v.x + 1) / 2) * r.width), e.clientY - (r.top + ((1 - v.y) / 2) * r.height)) < max;
      };
      if (d.kind === 'plantdrag') {
        if (!near(world(DSPOT.eosin, 0.06))) return notify(`${DRAG_HINT.plantdrag}.`, 'info');
        if (!c.scene.collected.has('eosin')) return notify('Get the beaker of eosin from the cupboard first.', 'warning');
        if (!c.s.eosin.wash) return notify('Wash the soil off the roots first.', 'warning');
        if (c.p.eosin.dye()) play('drip');
        return;
      }
      if (d.kind === 'rulerdrag') {
        if (!near(world(DSPOT.board, 0.03), 140)) return notify(`${DRAG_HINT.rulerdrag}.`, 'info');
        if (c.p.rat.measure('BODY') >= 0) return play('tick');
        return notify('Pin the rat out first.', 'warning');
      }
      if (!near(world(DSPOT.incubator, 0.12), 140)) return notify(`${DRAG_HINT.platedrag}.`, 'info');
      if (!c.scene.collected.has('incubator')) return notify('Get the incubator from the cupboard first.', 'warning');
      if (c.p.micro.incubate(30)) return play('clink');
      notify('The plates are already in.', 'info');
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
