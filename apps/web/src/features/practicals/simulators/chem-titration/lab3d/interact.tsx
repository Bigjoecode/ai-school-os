import { Html } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import type { ReactNode } from 'react';
import { beginDrag, justDragged } from './drag';
import { notify, useLabView, type DragKind } from './store';
import { registerObject } from './targets';

/** How far away (m) something can be used from while walking. */
const REACH = 3.2;

/**
 * Wraps a pickable object: hover shows its name, click/tap selects it (the HUD
 * then offers its actions). A drag that starts on it looks around instead.
 * `bench` objects are only handled one by one at the bench; while walking they
 * select the bench itself.
 */
export function Interactive({
  id,
  label,
  children,
  labelY = 0.12,
  bench = false,
  position,
  rotation,
  drag,
}: {
  id: string;
  label: string;
  children: ReactNode | ((active: boolean) => ReactNode);
  labelY?: number;
  bench?: boolean;
  position?: [number, number, number];
  rotation?: [number, number, number];
  /** Which drag a press on this object starts (none: presses only select it). */
  drag?: (id: string) => DragKind | null;
}) {
  const set = useLabView((s) => s.set);
  const mode = useLabView((s) => s.mode);
  const walking = mode === 'walk';
  const target = bench && walking ? 'mybench' : id;
  const active = useLabView((s) => s.hover === target || s.selected === target) && !(bench && walking);
  const showLabel = useLabView((s) => s.hover === id) && !(bench && walking);
  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    set({ hover: target });
    document.body.style.cursor = 'pointer';
  };
  const out = () => {
    if (useLabView.getState().hover === target) set({ hover: null });
    document.body.style.cursor = '';
  };
  const down = (e: ThreeEvent<PointerEvent>) => {
    const kind = drag?.(id);
    if (!kind || (bench && walking)) return;
    e.stopPropagation();
    beginDrag(kind, id, e.nativeEvent.clientX, e.nativeEvent.clientY);
  };
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 8 || justDragged()) return;
    if (walking && e.distance > REACH) {
      notify(`${bench ? 'Your bench' : label}: walk closer to use it.`, 'info', 1800);
      return;
    }
    set({ selected: target, picked: useLabView.getState().picked + 1 });
  };
  return (
    <group ref={(g) => registerObject(id, g)} position={position} rotation={rotation} onPointerOver={over} onPointerOut={out} onPointerDown={down} onClick={click}>
      {typeof children === 'function' ? children(active) : children}
      {showLabel && (
        <Html position={[0, labelY, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <span className="whitespace-nowrap rounded-full bg-black/75 px-2.5 py-1 text-[12px] font-medium text-white shadow-lg">{label}</span>
        </Html>
      )}
    </group>
  );
}
