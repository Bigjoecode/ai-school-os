import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Plane, Raycaster, Vector2, Vector3 } from 'three';
import { endDrag } from '../../../lab3d-kit/drag';
import { STATION } from '../../../lab3d-kit/layout';
import { play } from '../../../lab3d-kit/sound';
import { useLabView } from '../../../lab3d-kit/store';
import type { Magnetism } from '../actions';
import type { Ops } from './lab-actions';
import { FBOARD, PAPER_Y } from './views';

/**
 * Hands-on dragging alongside the buttons: slide the plotting compass over
 * the paper (the pointer read on the paper's plane), or drag the magnet
 * towards the coil to push it in (away to pull it out).
 */
export function DragController({ o, ops }: { o: Magnetism; ops: Ops }) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const ref = useRef({ o, ops });
  ref.current = { o, ops };
  const tools = useRef({ ray: new Raycaster(), ndc: new Vector2(), hit: new Vector3(), done: false });
  useEffect(() => {
    const el = gl.domElement;
    const kinds = ['compass', 'magnet'];
    const plane = new Plane(new Vector3(0, 1, 0), -(STATION[1] + PAPER_Y));
    const move = (e: PointerEvent) => {
      const d = useLabView.getState().drag;
      if (!d || !kinds.includes(d.kind)) return;
      const moved = d.moved + Math.hypot(e.clientX - d.x, e.clientY - d.y);
      const t = tools.current;
      const { o: op, ops: p } = ref.current;
      if (d.kind === 'magnet') {
        const dx = d.value + (e.clientX - d.x);
        if (!t.done && Math.abs(dx) > 60) {
          t.done = true;
          const inside = op.ref.current.magIn;
          if (dx < 0 && !inside) p.move('in');
          else if (dx > 0 && inside) p.move('out');
        }
        useLabView.setState({ drag: { ...d, x: e.clientX, y: e.clientY, moved, value: dx } });
        return;
      }
      const r = el.getBoundingClientRect();
      t.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      t.ray.setFromCamera(t.ndc, camera);
      if (moved > 4 && t.ray.ray.intersectPlane(plane, t.hit)) {
        const x = (t.hit.x - STATION[0] - FBOARD.x) * 100;
        const y = -(t.hit.z - STATION[2] - FBOARD.z) * 100;
        op.setCompassAt(x, y);
      }
      useLabView.setState({ drag: { ...d, x: e.clientX, y: e.clientY, moved } });
    };
    const up = () => {
      const d = useLabView.getState().drag;
      if (!d || !kinds.includes(d.kind)) return;
      tools.current.done = false;
      endDrag(d.moved);
      if (d.moved > 6) play('tick');
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
