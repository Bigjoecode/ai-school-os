import { useEffect, useRef } from 'react';
import { endDrag } from '../../../lab3d-kit/drag';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView, type DragKind, type DragState } from '../../../lab3d-kit/store';
import type { Electro } from '../actions';
import { useBench } from './bench-store';

/**
 * The hands-on drags, alongside the buttons that do the same: the copper
 * plates lowered into the voltameter (connecting the circuit the right way),
 * the rheostat's slider pushed left or right, and circling over the beaker to
 * tip the iron in and stir it.
 */
const KINDS = ['plates', 'slide', 'stir'];
export function dragFor(id: string): DragKind | null {
  if (useLabView.getState().mode === 'walk') return null;
  return id === 'plates' ? 'plates' : id === 'rheostat' ? 'slide' : id === 'beaker' ? 'stir' : null;
}

export function DragController({ x }: { x: Electro }) {
  const ref = useRef(x);
  ref.current = x;
  useEffect(() => {
    let angle: number | null = null;
    let turned = 0;
    let slid = 0;
    const move = (e: PointerEvent) => {
      const d = useLabView.getState().drag;
      if (!d || !KINDS.includes(d.kind)) return;
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
      } else if (d.kind === 'slide') {
        slid += e.clientX - d.x;
        // every 14 px of travel moves the slider one step (0.25 Ω)
        while (Math.abs(slid) >= 14) {
          const step = slid > 0 ? 1 : -1;
          slid -= step * 14;
          const m = ref.current.ops.rheostat(step);
          if (m) {
            slid = 0;
            break;
          }
          play('tick');
        }
        value = 0.5;
      } else value = Math.min(1, moved / 160);
      useLabView.setState({ drag: { ...d, x: e.clientX, y: e.clientY, moved, value } });
    };
    const up = () => {
      const d = useLabView.getState().drag;
      if (!d || !KINDS.includes(d.kind)) return;
      endDrag(d.moved);
      const o = ref.current.ops;
      let m: string | undefined;
      if (d.kind === 'stir' && turned >= 2 * Math.PI) m = ref.current.ref.current.disp.added ? undefined : o.addIron('STIR');
      else if (d.kind === 'plates' && d.value >= 1) m = o.connect('NEG', 'APART');
      else if (d.kind === 'plates' && d.moved > 10) m = 'Drag further to lower the plates into the beaker (or use the menu).';
      if (m) notify(m, 'warning', 2800);
      else if (d.value >= 1) play('clink');
      angle = null;
      turned = 0;
      slid = 0;
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

export function ElectroDragFeedback({ drag, x }: { drag: DragState; x: Electro }) {
  const label = drag.kind === 'stir' ? 'Tip the iron in and stir — keep circling' : drag.kind === 'plates' ? 'Lower the plates into the CuSO₄ (cathode to −)' : drag.kind === 'slide' ? `Rheostat ${(x.ref.current.elec.rheo * 0.25).toFixed(2)} Ω · ${x.look.current.toFixed(2)} A` : null;
  if (!label) return null;
  return (
    <div className="rounded-xl bg-black/60 px-3 py-1.5 text-[12.5px] text-white">
      {label}
      {drag.kind !== 'slide' ? ` · ${Math.round(drag.value * 100)}%` : ''}
    </div>
  );
}
