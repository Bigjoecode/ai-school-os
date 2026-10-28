import { useEffect, useRef } from 'react';
import { endDrag } from '../../../lab3d-kit/drag';
import { useLabView, type DragKind } from '../../../lab3d-kit/store';
import { openMg, type Rates } from '../actions';
import { useBench } from './bench-store';
import { makeOps } from './lab-actions';

/**
 * The hands-on drags, alongside the buttons: the gas syringe's plunger (drag
 * it in to zero; drag it out and let go — it springs back if the apparatus
 * is airtight) and swirling the thiosulphate flask (move in circles).
 */

export function dragFor(id: string): DragKind | null {
  if (useLabView.getState().mode === 'walk') return null;
  return id === 'syringe' ? 'plunger' : id === 'flask' ? 'swirl' : null;
}

const CM3_PER_PX = 0.25;

export function DragController({ o }: { o: Rates }) {
  const ref = useRef(o);
  ref.current = o;
  useEffect(() => {
    let start: number | null = null;
    let base = 0;
    let angle: number | null = null;
    let turned = 0;
    const move = (e: PointerEvent) => {
      const d = useLabView.getState().drag;
      if (!d || (d.kind !== 'plunger' && d.kind !== 'swirl')) return;
      const moved = d.moved + Math.hypot(e.clientX - d.x, e.clientY - d.y);
      if (d.kind === 'plunger') {
        if (start === null) {
          start = d.x;
          base = ref.current.syringeNow();
        }
        const m = openMg(ref.current.ref.current);
        if (!m || m.r.dropped) return useLabView.setState({ drag: { ...d, x: e.clientX, y: e.clientY, moved } });
        useBench.setState({ pull: Math.max(0, Math.min(60, base + (e.clientX - start) * CM3_PER_PX)) });
      } else {
        const a = Math.atan2(e.clientY - window.innerHeight / 2, e.clientX - window.innerWidth / 2);
        if (angle !== null) {
          let da = a - angle;
          if (da > Math.PI) da -= 2 * Math.PI;
          if (da < -Math.PI) da += 2 * Math.PI;
          turned += Math.abs(da);
        }
        angle = a;
        useBench.setState({ swirlUntil: performance.now() + 200 });
      }
      useLabView.setState({ drag: { ...d, x: e.clientX, y: e.clientY, moved, value: d.kind === 'swirl' ? Math.min(1, turned / (2 * Math.PI)) : d.value } });
    };
    const up = () => {
      const d = useLabView.getState().drag;
      if (!d || (d.kind !== 'plunger' && d.kind !== 'swirl')) return;
      endDrag(d.moved);
      const ops = makeOps(ref.current);
      if (d.kind === 'plunger') {
        const pull = useBench.getState().pull;
        useBench.setState({ pull: null });
        if (pull !== null) {
          if (pull < 0.5) ops.zero();
          else if (pull > base + 5) ops.check();
        }
        start = null;
      } else {
        if (turned >= 2 * Math.PI) ops.swirl();
        angle = null;
        turned = 0;
      }
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
