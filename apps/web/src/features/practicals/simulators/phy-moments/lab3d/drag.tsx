import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Plane, Raycaster, Vector2, Vector3 } from 'three';
import { endDrag } from '../../../lab3d-kit/drag';
import { STATION } from '../../../lab3d-kit/layout';
import { play } from '../../../lab3d-kit/sound';
import { useLabView } from '../../../lab3d-kit/store';
import type { Moments } from '../actions';
import { useBench } from './bench-store';
import { EDGE_X, RULE_Z } from './views';

/**
 * Hands-on dragging alongside the buttons: slide a thread loop along the rule,
 * or the rule itself over the knife edge (the pivot mark changes). Neither
 * writes a log entry, as with the buttons. The pointer is read on the
 * vertical plane through the rule.
 */
export function DragController({ o }: { o: Moments }) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const ref = useRef(o);
  ref.current = o;
  const tools = useRef({ ray: new Raycaster(), ndc: new Vector2(), hit: new Vector3(), plane: new Plane(new Vector3(0, 0, 1), -(STATION[2] + RULE_Z)) });

  useEffect(() => {
    const el = gl.domElement;
    const kinds = ['slide-rule', 'slide-known', 'slide-other'];
    const move = (e: PointerEvent) => {
      const d = useLabView.getState().drag;
      if (!d || !kinds.includes(d.kind)) return;
      const moved = d.moved + Math.hypot(e.clientX - d.x, e.clientY - d.y);
      const { ray, ndc, hit, plane } = tools.current;
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      if (moved > 6 && ray.ray.intersectPlane(plane, hit)) {
        const x = hit.x - STATION[0];
        const op = ref.current;
        const s = op.ref.current;
        if (d.kind === 'slide-rule') {
          const from = useBench.getState().dragFrom ?? { x, pivot: s.pivot };
          if (!useBench.getState().dragFrom) useBench.setState({ dragFrom: from });
          op.setPivot(from.pivot - (x - from.x) * 100);
        } else op.setLoop(d.kind === 'slide-known' ? 'known' : 'other', s.pivot + (x - EDGE_X) * 100);
      }
      useLabView.setState({ drag: { ...d, x: e.clientX, y: e.clientY, moved } });
    };
    const up = () => {
      const d = useLabView.getState().drag;
      if (!d || !kinds.includes(d.kind)) return;
      useBench.setState({ dragFrom: null });
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
