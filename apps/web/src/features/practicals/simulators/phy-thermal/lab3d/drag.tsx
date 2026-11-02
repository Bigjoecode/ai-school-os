import { useEffect, useRef } from 'react';
import { endDrag } from '../../../lab3d-kit/drag';
import { play } from '../../../lab3d-kit/sound';
import { useLabView, type DragKind, type DragState } from '../../../lab3d-kit/store';
import type { Thermal } from '../actions';
import { makeOps } from './lab-actions';

/**
 * The hands-on drags, alongside the buttons: turn the micrometer's thimble
 * (drag left screws it up to the rod by the ratchet, right backs it off),
 * stir the water bath by moving the stirrer up and down, and lower or raise
 * the capillary tube's ruler in the bath (down: fully immersed; up a little:
 * only partly).
 */

export function dragFor(id: string): DragKind | null {
  if (useLabView.getState().mode === 'walk') return null;
  if (id === 'micro') return 'thimble';
  if (id === 'stirrer') return 'stir';
  if (id === 'capillary') return 'hang';
  return null;
}

export function DragController({ o }: { o: Thermal }) {
  const ref = useRef(o);
  ref.current = o;
  useEffect(() => {
    let acc = 0;
    let done = false;
    const kinds = ['thimble', 'stir', 'hang'];
    const move = (e: PointerEvent) => {
      const d = useLabView.getState().drag;
      if (!d || !kinds.includes(d.kind)) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      const moved = d.moved + Math.hypot(dx, dy);
      useLabView.setState({ drag: { ...d, x: e.clientX, y: e.clientY, moved } });
      const ops = makeOps(ref.current);
      if (d.kind === 'thimble') {
        acc += dx;
        if (!done && acc < -40) (done = true), ops.ratchet();
        else if (!done && acc > 40) (done = true), ops.back();
      } else if (d.kind === 'stir') {
        acc += Math.abs(dy);
        if (acc > 60) {
          acc = 0;
          ops.stirOnce();
        }
      } else if (d.kind === 'hang') {
        acc += dy;
        if (!done && acc > 40) (done = true), ops.immerse(true);
        else if (!done && acc < -40) (done = true), ops.immerse(false);
      }
    };
    const up = () => {
      const d = useLabView.getState().drag;
      if (!d || !kinds.includes(d.kind)) return;
      endDrag(d.moved);
      acc = 0;
      done = false;
      play('tick');
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

export function ThermalDragFeedback({ drag }: { drag: DragState }) {
  const text = drag.kind === 'thimble' ? 'Drag left to screw the micrometer up to the rod (ratchet), right to back it off' : drag.kind === 'stir' ? 'Move up and down to stir the water' : drag.kind === 'hang' ? 'Drag down to lower the tube fully into the water, up to raise it' : null;
  if (!text) return null;
  return <span className="absolute left-1/2 top-24 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1.5 text-[12.5px] font-medium text-white shadow-lg">{text}</span>;
}
