import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Plane, Raycaster, Vector2, Vector3 } from 'three';
import { endDrag } from '../../../lab3d-kit/drag';
import { STATION } from '../../../lab3d-kit/layout';
import { play } from '../../../lab3d-kit/sound';
import { useLabView } from '../../../lab3d-kit/store';
import type { Optics } from '../actions';
import { followScreen } from './lab-actions';
import { RULE_X0, RULE_Z } from './views';

/**
 * Hands-on dragging alongside the buttons: slide the screen along the rule
 * (watching the image), or the lens (LENS) / the object (MIRROR) to set u.
 * Neither writes a log entry, as with the buttons. The pointer is read on
 * the vertical plane through the rule.
 */
export function DragController({ o }: { o: Optics }) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const ref = useRef(o);
  ref.current = o;
  const tools = useRef({ ray: new Raycaster(), ndc: new Vector2(), hit: new Vector3(), plane: new Plane(new Vector3(0, 0, 1), -(STATION[2] + RULE_Z)) });

  useEffect(() => {
    const el = gl.domElement;
    const move = (e: PointerEvent) => {
      const d = useLabView.getState().drag;
      if (!d || (d.kind !== 'slide-u' && d.kind !== 'slide-screen')) return;
      const moved = d.moved + Math.hypot(e.clientX - d.x, e.clientY - d.y);
      const { ray, ndc, hit, plane } = tools.current;
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      if (moved > 6 && ray.ray.intersectPlane(plane, hit)) {
        const cm = Math.round((hit.x - STATION[0] - RULE_X0) * 1000) / 10;
        const op = ref.current;
        if (d.kind === 'slide-screen') {
          op.setScreen(cm);
          if (useLabView.getState().focus === 'screen') followScreen(op.ref.current);
        } else op.setU(cm);
      }
      useLabView.setState({ drag: { ...d, x: e.clientX, y: e.clientY, moved } });
    };
    const up = () => {
      const d = useLabView.getState().drag;
      if (!d || (d.kind !== 'slide-u' && d.kind !== 'slide-screen')) return;
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
