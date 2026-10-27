import type { OhmsTerminal } from '@aischool/shared';
import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Plane, Raycaster, Vector2, Vector3 } from 'three';
import { dragClock } from '../../../lab3d-kit/drag';
import { STATION } from '../../../lab3d-kit/layout';
import { play } from '../../../lab3d-kit/sound';
import { useLabView, type DragKind } from '../../../lab3d-kit/store';
import { wireDrag } from './bench-store';
import { RHEO, WIRE_RULE, terminalPos } from './layout';

/**
 * Hands-on dragging beside the buttons: pull a wire from one terminal to
 * another, slide the rheostat's contact, slide the jockey along the wire.
 * A drag that hardly moves is a tap (the object is selected as usual).
 */

export function dragFor(id: string): DragKind | null {
  const v = useLabView.getState();
  if (v.mode === 'walk' || v.held) return null;
  if (id.startsWith('term:')) return 'wire';
  if (id === 'rheostat') return 'rheo';
  if (id === 'wireRule') return 'jockey';
  return null;
}

export interface DragCtx {
  board: OhmsTerminal[];
  state: { rheostat: number; jockey: number };
  join: (a: OhmsTerminal, b: OhmsTerminal) => void;
  setRheostat: (x: number) => void;
  setJockey: (x: number) => void;
}

export function DragController(ctx: DragCtx) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const ref = useRef(ctx);
  ref.current = ctx;
  const tools = useRef({ ray: new Raycaster(), ndc: new Vector2(), plane: new Plane(new Vector3(0, 1, 0), 0), hit: new Vector3(), p: new Vector3() });

  useEffect(() => {
    const hitAt = (x: number, y: number, height: number) => {
      const { ray, ndc, plane, hit } = tools.current;
      const r = gl.domElement.getBoundingClientRect();
      ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      plane.constant = -(STATION[1] + height);
      return ray.ray.intersectPlane(plane, hit) ? hit : null;
    };
    /** The terminal nearest the pointer on screen (within 34 px), if any. */
    const nearest = (x: number, y: number, except: OhmsTerminal | null) => {
      const r = gl.domElement.getBoundingClientRect();
      let best: OhmsTerminal | null = null;
      let bd = 34;
      for (const t of ref.current.board) {
        if (t === except) continue;
        const q = terminalPos(t, ref.current.state);
        const p = tools.current.p.set(STATION[0] + q[0], STATION[1] + q[1], STATION[2] + q[2]).project(camera);
        const d = Math.hypot(r.left + ((p.x + 1) / 2) * r.width - x, r.top + ((1 - p.y) / 2) * r.height - y);
        if (d < bd) {
          bd = d;
          best = t;
        }
      }
      return best;
    };
    const move = (e: PointerEvent) => {
      const d = useLabView.getState().drag;
      if (!d || d.kind === 'carry') return;
      const moved = d.moved + Math.hypot(e.clientX - d.x, e.clientY - d.y);
      if (d.kind === 'wire') {
        const from = d.id.slice(5) as OhmsTerminal;
        wireDrag.from = from;
        const over = nearest(e.clientX, e.clientY, from);
        wireDrag.over = over;
        if (over) wireDrag.to = terminalPos(over, ref.current.state);
        else {
          const h = hitAt(e.clientX, e.clientY, 0.06);
          if (h) wireDrag.to = [h.x - STATION[0], 0.06, h.z - STATION[2]];
        }
      } else if (d.kind === 'rheo') {
        const h = hitAt(e.clientX, e.clientY, RHEO.railY);
        if (h && moved > 4) ref.current.setRheostat((h.x - STATION[0] - RHEO.x0) / RHEO.len);
      } else if (d.kind === 'jockey') {
        const h = hitAt(e.clientX, e.clientY, WIRE_RULE.y);
        if (h && moved > 4) ref.current.setJockey((h.x - STATION[0] - WIRE_RULE.x0) * 100);
      }
      useLabView.setState({ drag: { ...d, x: e.clientX, y: e.clientY, moved } });
    };
    const up = () => {
      const d = useLabView.getState().drag;
      if (dragClock.pendingRelease) {
        dragClock.pendingRelease = false;
        dragClock.endedAt = performance.now();
      }
      if (!d || d.kind === 'carry') return;
      useLabView.setState({ drag: null });
      if (d.moved >= 8) dragClock.endedAt = performance.now();
      if (d.kind === 'wire') {
        const from = wireDrag.from;
        const over = wireDrag.over;
        wireDrag.from = null;
        wireDrag.over = null;
        if (d.moved >= 8 && from && over) ref.current.join(from, over);
        else if (d.moved >= 8) play('tick');
      } else if (d.moved >= 8) play('creak');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [camera, gl]);
  return null;
}
