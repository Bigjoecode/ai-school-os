import { useEffect, useRef } from 'react';
import { endDrag } from '../../../lab3d-kit/drag';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView, type DragKind, type DragState } from '../../../lab3d-kit/store';
import type { Salts } from '../actions';
import { useBench } from './bench-store';

/**
 * The hands-on drags, alongside the buttons that do the same: a spatula of
 * CuO dragged from the jar up and across to the beaker, stirring by moving in
 * circles over a beaker, and the paper strip dragged up into the tank.
 */
export function dragFor(id: string): DragKind | null {
  if (useLabView.getState().mode === 'walk') return null;
  return id === 'jar:cuo' ? 'scoop' : id === 'beaker' ? 'stir' : id === 'paper' ? 'paper' : null;
}

export function DragController({ x }: { x: Salts }) {
  const ref = useRef(x);
  ref.current = x;
  useEffect(() => {
    let angle: number | null = null;
    let turned = 0;
    const move = (e: PointerEvent) => {
      const d = useLabView.getState().drag;
      if (!d || !['scoop', 'stir', 'paper'].includes(d.kind)) return;
      const moved = d.moved + Math.hypot(e.clientX - d.x, e.clientY - d.y);
      let value = d.value;
      if (d.kind === 'stir') {
        const a = Math.atan2(e.clientY - window.innerHeight / 2, e.clientX - window.innerWidth / 2);
        if (angle !== null) {
          let da = a - angle;
          if (da > Math.PI) da -= 2 * Math.PI;
          if (da < -Math.PI) da += 2 * Math.PI;
          turned += Math.abs(da);
        }
        angle = a;
        useBench.setState({ stirUntil: performance.now() + 250 });
        value = Math.min(1, turned / (2 * Math.PI));
      } else value = Math.min(1, moved / 160);
      useLabView.setState({ drag: { ...d, x: e.clientX, y: e.clientY, moved, value } });
    };
    const up = () => {
      const d = useLabView.getState().drag;
      if (!d || !['scoop', 'stir', 'paper'].includes(d.kind)) return;
      endDrag(d.moved);
      const o = ref.current.ops;
      let m: string | undefined;
      if (d.kind === 'stir' && turned >= 2 * Math.PI) m = ref.current.task === 'PPT' ? o.stirPpt() : o.stir();
      else if (d.kind === 'scoop' && d.value >= 1) m = o.addCuO();
      else if (d.kind === 'paper' && d.value >= 1) m = o.placePaper();
      else if (d.kind !== 'stir' && d.moved > 10) m = 'Drag further to finish the move (or use the menu).';
      if (m) notify(m, 'warning', 2600);
      else if (d.value >= 1) play('clink');
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

export function SaltsDragFeedback({ drag }: { drag: DragState }) {
  const label = drag.kind === 'stir' ? 'Stirring — keep circling' : drag.kind === 'scoop' ? 'Carry a spatula of CuO to the beaker' : drag.kind === 'paper' ? 'Lower the paper into the tank' : null;
  if (!label) return null;
  return (
    <div className="rounded-xl bg-black/60 px-3 py-1.5 text-[12.5px] text-white">
      {label} · {Math.round(drag.value * 100)}%
    </div>
  );
}
