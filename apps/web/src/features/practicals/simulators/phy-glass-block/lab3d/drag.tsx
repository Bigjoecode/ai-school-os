import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Plane, Raycaster, Vector2, Vector3 } from 'three';
import { beginDrag, endDrag } from '../../../lab3d-kit/drag';
import { STATION } from '../../../lab3d-kit/layout';
import { play } from '../../../lab3d-kit/sound';
import { useLabView } from '../../../lab3d-kit/store';
import type { Glass } from '../actions';
import { useBench } from './bench-store';
import type { Ops } from './lab-actions';
import { fromLocal, PAPER_Y } from './views';

/**
 * Hands-on dragging alongside the buttons: drag P₃ or P₄ across the paper
 * (it moves without a log entry, as in the 2D lab), and while sighting
 * through face CD drag sideways anywhere to move your eye.
 */
export function DragController({ g, ops }: { g: Glass; ops: Ops }) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const ref = useRef({ g, ops });
  ref.current = { g, ops };
  const tools = useRef({ ray: new Raycaster(), ndc: new Vector2(), plane: new Plane(new Vector3(0, 1, 0), -(STATION[1] + PAPER_Y)), hit: new Vector3() });

  useEffect(() => {
    const el = gl.domElement;
    // While sighting, a press on the view (not on a pin) moves the eye.
    const down = (e: PointerEvent) => {
      if (!useBench.getState().sight || useLabView.getState().drag || useLabView.getState().mode !== 'bench') return;
      beginDrag('eye', 'eye', e.clientX, e.clientY);
    };
    const move = (e: PointerEvent) => {
      const d = useLabView.getState().drag;
      if (!d || (d.kind !== 'pin' && d.kind !== 'eye')) return;
      const dx = e.clientX - d.x;
      const moved = d.moved + Math.hypot(dx, e.clientY - d.y);
      if (d.kind === 'eye') {
        ref.current.ops.moveEye(-dx * 0.02);
      } else {
        const { ray, ndc, plane, hit } = tools.current;
        const r = el.getBoundingClientRect();
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        if (moved > 6 && ray.ray.intersectPlane(plane, hit)) {
          const p = fromLocal(hit.x - STATION[0], hit.z - STATION[2]);
          const pin = d.id.slice(4) as 'p3' | 'p4';
          ref.current.g.dragPin(pin, p);
        }
      }
      useLabView.setState({ drag: { ...d, x: e.clientX, y: e.clientY, moved } });
    };
    const up = () => {
      const d = useLabView.getState().drag;
      if (!d || (d.kind !== 'pin' && d.kind !== 'eye')) return;
      endDrag(d.moved);
      if (d.kind === 'pin' && d.moved > 6) play('tick');
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [camera, gl]);
  return null;
}
