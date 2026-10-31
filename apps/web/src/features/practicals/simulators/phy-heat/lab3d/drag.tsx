import { useEffect, useRef } from 'react';
import { endDrag } from '../../../lab3d-kit/drag';
import { play } from '../../../lab3d-kit/sound';
import { useLabView, type DragKind, type DragState } from '../../../lab3d-kit/store';
import { heatFlags, type Heat, type Riders } from '../actions';
import { makeOps } from './lab-actions';

/**
 * The hands-on drags, alongside the buttons: slide a rider along its beam of
 * the balance (left–right), or carry the hot block from the bath to the
 * calorimeter by its thread (press lifts it out, letting go lowers it in
 * gently).
 */

export function dragFor(id: string): DragKind | null {
  if (useLabView.getState().mode === 'walk') return null;
  if (id.startsWith('rider-')) return 'rider';
  if (id === 'block') return 'block';
  return null;
}

/** Pixels per rider step: a notch of the 100 g and 10 g beams, 0.1 g of the front beam. */
const PX: Record<keyof Riders, number> = { h: 60, t: 26, f: 6 };

export function DragController({ o }: { o: Heat }) {
  const ref = useRef(o);
  ref.current = o;
  useEffect(() => {
    let acc = 0;
    let started = false;
    const move = (e: PointerEvent) => {
      const d = useLabView.getState().drag;
      if (!d || (d.kind !== 'rider' && d.kind !== 'block')) return;
      const dx = e.clientX - d.x;
      const moved = d.moved + Math.hypot(dx, e.clientY - d.y);
      useLabView.setState({ drag: { ...d, x: e.clientX, y: e.clientY, moved } });
      if (d.kind === 'rider') {
        const w = d.id.slice(6) as keyof Riders;
        acc += dx;
        const steps = Math.trunc(acc / PX[w]);
        if (steps) {
          acc -= steps * PX[w];
          ref.current.nudgeRider(w, w === 'f' ? steps * 0.1 : steps);
          play('tick');
        }
      } else if (!started && moved > 8) {
        started = true;
        const f = heatFlags(ref.current.ref.current.events);
        if (f.block === 'bath') makeOps(ref.current).lift();
      }
    };
    const up = () => {
      const d = useLabView.getState().drag;
      if (!d || (d.kind !== 'rider' && d.kind !== 'block')) return;
      endDrag(d.moved);
      acc = 0;
      if (d.kind === 'block' && started) {
        const f = heatFlags(ref.current.ref.current.events);
        if (f.block === 'air') makeOps(ref.current).lower(true);
      }
      started = false;
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

export function HeatDragFeedback({ drag }: { drag: DragState }) {
  if (drag.kind !== 'rider' && drag.kind !== 'block') return null;
  return (
    <span className="absolute left-1/2 top-24 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1.5 text-[12.5px] font-medium text-white shadow-lg">
      {drag.kind === 'rider' ? 'Slide left or right to move the rider' : 'Carrying the hot block by its thread — let go to lower it gently into the calorimeter'}
    </span>
  );
}
