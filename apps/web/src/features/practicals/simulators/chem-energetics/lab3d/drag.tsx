import { useEffect, useRef } from 'react';
import { endDrag } from '../../../lab3d-kit/drag';
import { useLabView, type DragKind } from '../../../lab3d-kit/store';
import type { Energetics } from '../actions';
import { useBench } from './bench-store';
import { makeOps } from './lab-actions';

/**
 * The hands-on drag, alongside the buttons: stirring — move in circles over
 * the cup (it stirs the reacting mixture) or the boiling tube (it starts the
 * thermometer stirring as the solution cools).
 */
export function dragFor(id: string): DragKind | null {
  if (useLabView.getState().mode === 'walk') return null;
  return id === 'cup' || id === 'tube' ? 'swirl' : null;
}

export function DragController({ o }: { o: Energetics }) {
  const ref = useRef(o);
  ref.current = o;
  useEffect(() => {
    let angle: number | null = null;
    let turned = 0;
    const move = (e: PointerEvent) => {
      const d = useLabView.getState().drag;
      if (!d || d.kind !== 'swirl') return;
      const moved = d.moved + Math.hypot(e.clientX - d.x, e.clientY - d.y);
      const a = Math.atan2(e.clientY - window.innerHeight / 2, e.clientX - window.innerWidth / 2);
      if (angle !== null) {
        let da = a - angle;
        if (da > Math.PI) da -= 2 * Math.PI;
        if (da < -Math.PI) da += 2 * Math.PI;
        turned += Math.abs(da);
      }
      angle = a;
      useBench.setState({ stirUntil: performance.now() + 250 });
      useLabView.setState({ drag: { ...d, x: e.clientX, y: e.clientY, moved, value: Math.min(1, turned / (2 * Math.PI)) } });
    };
    const up = () => {
      const d = useLabView.getState().drag;
      if (!d || d.kind !== 'swirl') return;
      endDrag(d.moved);
      if (turned >= 2 * Math.PI) {
        const ops = makeOps(ref.current);
        if (ref.current.task === 'SOLY') ops.tubeStir(true);
        else ops.stir();
      }
      angle = null;
      turned = 0;
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
