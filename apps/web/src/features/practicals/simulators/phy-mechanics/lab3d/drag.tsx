import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Plane, Raycaster, Vector2, Vector3 } from 'three';
import { endDrag } from '../../../lab3d-kit/drag';
import { STATION } from '../../../lab3d-kit/layout';
import { play } from '../../../lab3d-kit/sound';
import { useLabView } from '../../../lab3d-kit/store';
import type { Mechanics } from '../actions';
import type { Ops } from './lab-actions';
import { GLY_AT, RAMP, SURFACE } from './views';

/**
 * Hands-on dragging alongside the buttons: drag the spring balance to the
 * right to pull the block (the same pull as the button), a rubber band up or
 * down the cylinder, or the stopping block along the groove. The pointer is
 * read on a vertical plane through the apparatus.
 */
export function DragController({ o, ops }: { o: Mechanics; ops: Ops }) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const ref = useRef({ o, ops });
  ref.current = { o, ops };
  const tools = useRef({ ray: new Raycaster(), ndc: new Vector2(), hit: new Vector3(), pulled: false });

  useEffect(() => {
    const el = gl.domElement;
    const kinds = ['pull', 'band-top', 'band-bot', 'slide-stop'];
    const move = (e: PointerEvent) => {
      const d = useLabView.getState().drag;
      if (!d || !kinds.includes(d.kind)) return;
      const moved = d.moved + Math.hypot(e.clientX - d.x, e.clientY - d.y);
      const t = tools.current;
      const r = el.getBoundingClientRect();
      t.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      t.ray.setFromCamera(t.ndc, camera);
      const { o: op, ops: p } = ref.current;
      if (d.kind === 'pull') {
        const dx = d.value + (e.clientX - d.x);
        if (!t.pulled && dx > 60) {
          t.pulled = true;
          p.pull();
        }
        useLabView.setState({ drag: { ...d, x: e.clientX, y: e.clientY, moved, value: dx } });
        return;
      }
      const z = d.kind === 'slide-stop' ? STATION[2] + RAMP.z : STATION[2] + GLY_AT[2];
      const plane = new Plane(new Vector3(0, 0, 1), -z);
      if (moved > 6 && t.ray.ray.intersectPlane(plane, t.hit)) {
        if (d.kind === 'slide-stop') op.setStop((t.hit.x - STATION[0] - RAMP.x0) * 100);
        else op.setBand(d.kind === 'band-top' ? 'top' : 'bot', (STATION[1] + SURFACE - t.hit.y) * 100);
      }
      useLabView.setState({ drag: { ...d, x: e.clientX, y: e.clientY, moved } });
    };
    const up = () => {
      const d = useLabView.getState().drag;
      if (!d || !kinds.includes(d.kind)) return;
      tools.current.pulled = false;
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
