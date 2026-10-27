import { useEffect } from 'react';
import { play } from './sound';
import { notify, useLabView, type DragKind, type LabViewState } from './store';

/**
 * Drag helpers. A press on an Interactive whose `drag` returns a kind starts
 * a drag (the camera then ignores the pointer). The kit handles 'carry'
 * (apparatus from the cupboard dropped on the tray at the bottom of the
 * screen); a lab handles its own kinds with window pointer listeners that read
 * `useLabView.getState().drag`, and ends them with `endDrag`.
 */

/** When the last drag ended: the click that ends a drag must not select something else. */
export const dragClock = { endedAt: 0, /** a timed drag finished while the pointer is still down */ pendingRelease: false };
export const justDragged = () => performance.now() - dragClock.endedAt < 350;

/** The starting `value` of a drag (a lab may set it, e.g. the tap's current angle). */
export const dragInit: { value: (kind: DragKind, id: string) => number } = { value: () => 0 };

export function beginDrag(kind: DragKind, id: string, x: number, y: number) {
  useLabView.setState({ drag: { kind, id, x, y, moved: 0, value: dragInit.value(kind, id) } });
}

/** Ends the drag in progress (a drag that moved 8 px or more swallows the click that follows). */
export function endDrag(moved: number) {
  useLabView.setState({ drag: null });
  if (moved >= 8) dragClock.endedAt = performance.now();
}

/** A timed drag that finished by itself (e.g. a squeeze held long enough): the pointer-up that follows is not a click. */
export function finishTimedDrag(patch: Partial<LabViewState> = {}) {
  dragClock.pendingRelease = true;
  useLabView.setState({ ...patch, drag: null });
}

/**
 * The cupboard → tray carry, shared by every lab. Cupboard items are
 * Interactives with ids `cup:<apparatusId>` and `drag={() => 'carry'}`;
 * dropping one on the tray (DragOverlay) calls `onCarry(apparatusId)`.
 */
export function useCarryDrag(onCarry: (apparatusId: string) => void) {
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = useLabView.getState().drag;
      if (d?.kind !== 'carry') return;
      useLabView.setState({ drag: { ...d, x: e.clientX, y: e.clientY, moved: d.moved + Math.hypot(e.clientX - d.x, e.clientY - d.y) } });
    };
    const up = (e: PointerEvent) => {
      if (dragClock.pendingRelease) {
        dragClock.pendingRelease = false;
        dragClock.endedAt = performance.now();
      }
      const d = useLabView.getState().drag;
      if (d?.kind !== 'carry') return;
      endDrag(d.moved);
      if (d.moved < 8) return;
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-drop="tray"]');
      if (over) {
        onCarry(d.id.replace(/^cup:/, ''));
        play('clink');
      } else notify('Drop it on the tray at the bottom of the screen to carry it to your bench.', 'info', 2200);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [onCarry]);
}
