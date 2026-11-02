import { useEffect, useRef } from 'react';
import { endDrag } from '../../../lab3d-kit/drag';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView, type DragKind, type DragState } from '../../../lab3d-kit/store';
import type { Acids } from '../actions';
import { useBench } from './bench-store';

/**
 * The hands-on drags, alongside the buttons that do the same: shaking a pH
 * tube from side to side, and turning the burette tap — every 24 px of travel
 * lets out one drop of acid (0.05 cm³) or 0.5 cm³ of soap.
 */
const KINDS = ['shake', 'tap'];
export function dragFor(id: string): DragKind | null {
  if (useLabView.getState().mode === 'walk') return null;
  return id.startsWith('tube:') ? 'shake' : id === 'tap' ? 'tap' : null;
}

export function DragController({ x }: { x: Acids }) {
  const ref = useRef(x);
  ref.current = x;
  useEffect(() => {
    let travel = 0;
    let swings = 0;
    let lastDir = 0;
    const move = (e: PointerEvent) => {
      const d = useLabView.getState().drag;
      if (!d || !KINDS.includes(d.kind)) return;
      const dx = e.clientX - d.x;
      const moved = d.moved + Math.hypot(dx, e.clientY - d.y);
      let value = d.value;
      if (d.kind === 'shake') {
        const dir = Math.sign(dx);
        if (dir && dir !== lastDir) {
          swings++;
          lastDir = dir;
        }
        useBench.setState({ shakeUntil: performance.now() + 250, shakeId: d.id });
        value = Math.min(1, swings / 6);
      } else {
        travel += Math.abs(dx);
        while (travel >= 24) {
          travel -= 24;
          const X = ref.current;
          const m = X.task === 'HARD' ? X.ops.addSoap(0.5, 'SHAKE') : X.ops.addAcid(0.05);
          if (m) {
            travel = 0;
            notify(m, 'warning', 2400);
            break;
          }
          play('drip');
        }
        value = 0.5;
      }
      useLabView.setState({ drag: { ...d, x: e.clientX, y: e.clientY, moved, value } });
    };
    const up = () => {
      const d = useLabView.getState().drag;
      if (!d || !KINDS.includes(d.kind)) return;
      endDrag(d.moved);
      if (d.kind === 'shake' && swings >= 6) {
        const m = ref.current.ops.shake(d.id.slice(5) as never);
        if (m) notify(m, 'warning', 2600);
        else play('clink');
      } else if (d.kind === 'shake' && d.moved > 10) notify('Shake it from side to side a few more times (or use the menu).', 'info', 2200);
      travel = 0;
      swings = 0;
      lastDir = 0;
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

export function AcidsDragFeedback({ drag, x }: { drag: DragState; x: Acids }) {
  const label = drag.kind === 'shake' ? 'Shake the tube from side to side' : drag.kind === 'tap' ? (x.task === 'HARD' ? `Soap: ${x.ref.current.hard.burette?.toFixed(1) ?? '—'} cm³ on the burette` : `Burette ${x.ref.current.ind.burette?.toFixed(2) ?? '—'} cm³`) : null;
  if (!label) return null;
  return (
    <div className="rounded-xl bg-black/60 px-3 py-1.5 text-[12.5px] text-white">
      {label}
      {drag.kind === 'shake' ? ` · ${Math.round(drag.value * 100)}%` : ''}
    </div>
  );
}
