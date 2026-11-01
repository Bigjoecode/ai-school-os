import type { DensityRiders } from '@aischool/shared';
import { useEffect, useRef } from 'react';
import { endDrag } from '../../../lab3d-kit/drag';
import { play } from '../../../lab3d-kit/sound';
import { useLabView, type DragKind } from '../../../lab3d-kit/store';
import type { Density } from '../actions';

/**
 * The hands-on drags, alongside the buttons: slide a rider along its beam of
 * the balance (left–right), or lower the stone into the liquid below it by
 * dragging it down (up raises it out).
 */

export function dragFor(id: string): DragKind | null {
  if (useLabView.getState().mode === 'walk') return null;
  if (id.startsWith('rider-')) return 'rider';
  if (id === 'stone') return 'stone';
  return null;
}

/** Pixels per rider step: a notch of the 100 g and 10 g beams, 0.1 g of the front beam. */
const PX: Record<keyof DensityRiders, number> = { h: 60, t: 26, f: 6 };

export function DragController({ o, onStone }: { o: Density; onStone: (dir: 1 | -1) => void }) {
  const ref = useRef({ o, onStone });
  ref.current = { o, onStone };
  useEffect(() => {
    let acc = 0;
    let fired = false;
    const move = (e: PointerEvent) => {
      const d = useLabView.getState().drag;
      if (!d || (d.kind !== 'rider' && d.kind !== 'stone')) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      useLabView.setState({ drag: { ...d, x: e.clientX, y: e.clientY, moved: d.moved + Math.hypot(dx, dy) } });
      if (d.kind === 'rider') {
        const w = d.id.slice(6) as keyof DensityRiders;
        acc += dx;
        const steps = Math.trunc(acc / PX[w]);
        if (steps) {
          acc -= steps * PX[w];
          ref.current.o.nudgeRider(w, steps * (w === 'f' ? 0.1 : 1));
          play('tick');
        }
      } else {
        acc += dy;
        if (!fired && Math.abs(acc) > 40) {
          fired = true;
          ref.current.onStone(acc > 0 ? 1 : -1);
        }
      }
    };
    const up = () => {
      const d = useLabView.getState().drag;
      if (!d || (d.kind !== 'rider' && d.kind !== 'stone')) return;
      endDrag(d.moved);
      acc = 0;
      fired = false;
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
