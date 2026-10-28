import { useEffect, useRef } from 'react';
import { endDrag } from '../../../lab3d-kit/drag';
import { play } from '../../../lab3d-kit/sound';
import { useLabView, type DragKind } from '../../../lab3d-kit/store';
import type { Spring } from '../actions';
import { useBench } from './bench-store';
import { makeOps } from './lab-actions';

/**
 * The hands-on drag, alongside the buttons: pull the hanger down and let go —
 * the distance you pulled it is the displacement it oscillates with
 * (oscillations); in Hooke's law letting go just leaves it to settle.
 */

export function dragFor(id: string): DragKind | null {
  if (useLabView.getState().mode === 'walk') return null;
  return id === 'hanger' ? 'pull' : null;
}

/** Centimetres of pull per pixel dragged, and the most it can be pulled. */
const CM_PER_PX = 0.04;
export const PULL_MAX = 6;

export function DragController({ o }: { o: Spring }) {
  const ref = useRef(o);
  ref.current = o;
  useEffect(() => {
    let base: number | null = null;
    const move = (e: PointerEvent) => {
      const d = useLabView.getState().drag;
      if (!d || d.kind !== 'pull') return;
      if (base === null) {
        base = d.y;
        ref.current.steady();
      }
      const moved = d.moved + Math.hypot(e.clientX - d.x, e.clientY - d.y);
      useLabView.setState({ drag: { ...d, x: e.clientX, y: e.clientY, moved } });
      const pull = Math.max(0, Math.min(PULL_MAX, (e.clientY - base) * CM_PER_PX));
      useBench.setState({ pull });
    };
    const up = () => {
      const d = useLabView.getState().drag;
      if (!d || d.kind !== 'pull') return;
      endDrag(d.moved);
      base = null;
      const pull = useBench.getState().pull;
      useBench.setState({ pull: null });
      if (pull === null || pull < 0.5) return;
      const sp = ref.current;
      if ((sp.ref.current.task ?? 'HOOKE') === 'OSC') makeOps(sp).release(Math.round(pull * 2) / 2);
      else play('tick');
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
