import { PENDULUM_THREAD_MAX, PENDULUM_THREAD_MIN } from '@aischool/shared';
import { useEffect, useRef } from 'react';
import { endDrag } from '../../../lab3d-kit/drag';
import { play } from '../../../lab3d-kit/sound';
import { useLabView, type DragKind } from '../../../lab3d-kit/store';
import type { Pendulum } from '../actions';
import { useBench } from './layout';

/**
 * Hands-on drags, alongside the dock's buttons: pull the bob sideways and let
 * go to release it (the angle you pulled it through is the amplitude), and
 * slide the thread up or down through the split cork to change its length.
 */

export function dragFor(id: string): DragKind | null {
  const v = useLabView.getState();
  if (v.mode === 'walk') return null;
  if (id === 'bob') return 'displace';
  if (id === 'cork') return 'thread';
  return null;
}

/** Degrees of displacement per pixel dragged, and centimetres of thread per pixel. */
const DEG_PER_PX = 0.2;
const CM_PER_PX = 0.1;
export const AMPLITUDE_MAX = 40;

export function DragController({ p }: { p: Pendulum }) {
  const ref = useRef({ p });
  ref.current = { p };
  useEffect(() => {
    let base: { x: number; y: number; thread: number } | null = null;
    const move = (e: PointerEvent) => {
      const d = useLabView.getState().drag;
      if (!d || (d.kind !== 'displace' && d.kind !== 'thread')) return;
      if (!base) base = { x: d.x, y: d.y, thread: ref.current.p.ref.current.thread };
      const moved = d.moved + Math.hypot(e.clientX - d.x, e.clientY - d.y);
      useLabView.setState({ drag: { ...d, x: e.clientX, y: e.clientY, moved } });
      if (d.kind === 'displace') {
        if (ref.current.p.swingRef.current) ref.current.p.stopSwing();
        const pull = Math.max(-AMPLITUDE_MAX, Math.min(AMPLITUDE_MAX, (e.clientX - base.x) * DEG_PER_PX));
        useBench.setState({ pull });
      } else {
        const t = Math.round((base.thread - (e.clientY - base.y) * CM_PER_PX) * 2) / 2;
        const thread = Math.max(PENDULUM_THREAD_MIN, Math.min(PENDULUM_THREAD_MAX, t));
        if (thread !== ref.current.p.ref.current.thread) {
          ref.current.p.set({ thread });
          if (Math.round(thread) !== Math.round(ref.current.p.ref.current.thread)) play('creak');
        }
      }
    };
    const up = () => {
      const d = useLabView.getState().drag;
      if (!d || (d.kind !== 'displace' && d.kind !== 'thread')) return;
      endDrag(d.moved);
      base = null;
      if (d.kind === 'displace') {
        const pull = useBench.getState().pull;
        useBench.setState({ pull: null });
        if (pull !== null && Math.abs(pull) >= 1) {
          const amplitude = Math.round(Math.abs(pull));
          const { p: pend } = ref.current;
          if (amplitude !== pend.ref.current.amplitude) pend.set({ amplitude });
          pend.release();
          play('clink');
        }
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
