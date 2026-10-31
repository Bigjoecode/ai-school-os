import { useEffect, useRef } from 'react';
import { endDrag } from '../../../lab3d-kit/drag';
import { useLabView, type DragKind } from '../../../lab3d-kit/store';
import type { Sound } from '../actions';

/**
 * The hands-on drags, alongside the buttons: slide the resonance tube up or
 * down in its jar (drag up: a longer air column), or slide the sonometer's
 * moving bridge along the wire. Slow drags give fine control (0.02 cm a pixel
 * for the tube, 0.04 cm for the bridge).
 */

export function dragFor(id: string): DragKind | null {
  if (useLabView.getState().mode === 'walk') return null;
  return id === 'tube' ? 'tube' : id === 'bridge' ? 'bridge' : null;
}

const TUBE_CM_PER_PX = 0.02;
const BRIDGE_CM_PER_PX = 0.04;

export function DragController({ o }: { o: Sound }) {
  const ref = useRef(o);
  ref.current = o;
  useEffect(() => {
    let last: { x: number; y: number } | null = null;
    const move = (e: PointerEvent) => {
      const d = useLabView.getState().drag;
      if (!d || (d.kind !== 'tube' && d.kind !== 'bridge')) return;
      const moved = d.moved + Math.hypot(e.clientX - d.x, e.clientY - d.y);
      useLabView.setState({ drag: { ...d, x: e.clientX, y: e.clientY, moved } });
      if (last) {
        const sp = ref.current;
        if (d.kind === 'tube') sp.nudge(-(e.clientY - last.y) * TUBE_CM_PER_PX);
        else sp.nudge((e.clientX - last.x) * BRIDGE_CM_PER_PX);
      }
      last = { x: e.clientX, y: e.clientY };
    };
    const up = () => {
      const d = useLabView.getState().drag;
      if (!d || (d.kind !== 'tube' && d.kind !== 'bridge')) return;
      endDrag(d.moved);
      last = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);
  return null;
}
