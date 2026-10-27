import type { ChemTitrationState } from '@aischool/shared';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Plane, Raycaster, Vector2, Vector3 } from 'three';
import type { Titration } from '../actions';
import { dragClock, dragInit } from '../../../lab3d-kit/drag';
import { STATION } from '../../../lab3d-kit/layout';
import { play, startPour, stopPour } from '../../../lab3d-kit/sound';
import { notify, useLabView, type DragKind } from '../../../lab3d-kit/store';
import { useBench } from './bench-store';
import { swirl } from './lab-actions';
import type { SceneState } from './scene-state';
import { SPOT } from './spots';

/**
 * Hands-on dragging, alongside the buttons (which stay for accessibility;
 * carrying from the cupboard is the kit's): slide the flask onto the
 * tile, turn the burette tap, swirl the flask in circles, tilt bottle A to
 * pour into the funnel, and press and hold to squeeze the pipette filler.
 * A drag that hardly moves is a tap (the object is selected as usual).
 */

/** Where the flask is while being dragged (station-local x, z), read by the station. */
export const flaskDrag = { active: false, x: 0, z: 0 };
const TILE: [number, number] = [SPOT.buretteAxis[0], SPOT.buretteAxis[2]];
const SQUEEZE_S = 1.2;
const POUR_S = 0.9;

// Turning the tap starts from where it is.
dragInit.value = (kind) => (kind === 'tap' ? useBench.getState().tap : 0);

/** Which drag (if any) a press on `id` starts, given what is on the bench. */
export function dragFor(id: string, s: ChemTitrationState, scene: SceneState, t: Titration): DragKind | null {
  const v = useLabView.getState();
  if (v.held) return null;
  if (v.mode === 'walk') return null;
  if (id === 'flask') return scene.flaskUnder && t.open ? 'swirl' : 'flask';
  if (id === 'tap') return 'tap';
  if (id === 'bottleA' && scene.clamped && s.funnelIn && !(t.open && t.open.initial !== null)) return 'pour';
  if ((id === 'pipette' || id === 'filler') && scene.fillerOn && useBench.getState().pip === 'idle' && !t.open && scene.collected.has('flask') && !scene.flaskUnder) return 'squeeze';
  return null;
}

export function DragController({ t, s, scene }: { t: Titration; s: ChemTitrationState; scene: SceneState }) {
  const camera = useThree((st) => st.camera);
  const gl = useThree((st) => st.gl);
  const ref = useRef({ t, s, scene });
  ref.current = { t, s, scene };
  const tools = useRef({ ray: new Raycaster(), ndc: new Vector2(), plane: new Plane(new Vector3(0, 1, 0), -STATION[1]), hit: new Vector3(), centre: new Vector3(), lastAngle: null as number | null, pourTime: 0 });

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = useLabView.getState().drag;
      if (!d || d.kind === 'carry') return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      const moved = d.moved + Math.hypot(dx, dy);
      const { ray, ndc, plane, hit, centre } = tools.current;
      if (d.kind === 'tap') {
        const value = Math.max(0, Math.min(1, d.value + dx / 140));
        const before = useBench.getState().tap;
        if (Math.abs(value - before) > 0.12 || (value === 0) !== (before === 0)) play('creak');
        useBench.setState({ tap: value });
        useLabView.setState({ drag: { ...d, x: e.clientX, y: e.clientY, moved, value } });
        return;
      }
      if (d.kind === 'flask') {
        const r = gl.domElement.getBoundingClientRect();
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        if (ray.ray.intersectPlane(plane, hit)) {
          flaskDrag.active = true;
          flaskDrag.x = Math.max(-1.2, Math.min(1.2, hit.x - STATION[0]));
          flaskDrag.z = Math.max(-0.4, Math.min(0.42, hit.z - STATION[2]));
        }
      } else if (d.kind === 'swirl') {
        // Angle of the pointer around the flask on screen; a full circle is one swirl.
        centre.set(STATION[0] + TILE[0], STATION[1] + 0.06, STATION[2] + TILE[1]).project(camera);
        const r = gl.domElement.getBoundingClientRect();
        const cx = r.left + ((centre.x + 1) / 2) * r.width;
        const cy = r.top + ((1 - centre.y) / 2) * r.height;
        const a = Math.atan2(e.clientY - cy, e.clientX - cx);
        const last = tools.current.lastAngle;
        tools.current.lastAngle = a;
        if (last !== null) {
          let da = a - last;
          if (da > Math.PI) da -= Math.PI * 2;
          if (da < -Math.PI) da += Math.PI * 2;
          let value = d.value + Math.abs(da);
          useBench.setState({ swirlUntil: performance.now() + 250 });
          if (value >= Math.PI * 2) {
            value -= Math.PI * 2;
            swirl(ref.current.t);
            play('clink');
          }
          useLabView.setState({ drag: { ...d, x: e.clientX, y: e.clientY, moved, value } });
          return;
        }
      } else if (d.kind === 'pour') {
        const value = Math.max(0, Math.min(1, d.value - dy / 160));
        useLabView.setState({ drag: { ...d, x: e.clientX, y: e.clientY, moved, value } });
        return;
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
      if (d.moved >= 8 || d.kind === 'squeeze' || d.kind === 'pour') dragClock.endedAt = performance.now();
      tools.current.lastAngle = null;
      tools.current.pourTime = 0;
      stopPour();
      const { t: tt, s: ss, scene: sc } = ref.current;
      const tap = d.moved < 8;
      if (d.kind === 'flask') {
        const was = flaskDrag.active;
        flaskDrag.active = false;
        if (!was || tap) return;
        const near = Math.hypot(flaskDrag.x - TILE[0], flaskDrag.z - TILE[1]) < 0.1;
        if (near && !sc.flaskUnder) {
          if (!sc.collected.has('tile')) notify('Get the white tile from the cupboard first.', 'warning');
          else if (!sc.clamped) notify('Clamp the burette on the stand first.', 'warning');
          else if (!tt.open) notify('Pipette 25.0 cm³ of B into the flask first.', 'warning');
          else {
            tt.note('flask-to-tile');
            play('clink');
          }
        } else if (!near && sc.flaskUnder) {
          if (useBench.getState().tap >= 0.15) notify('Close the tap first.', 'warning');
          else {
            tt.note('flask-off-tile');
            play('clink');
          }
        }
      } else if (d.kind === 'pour' && !tap && ss.burette === null) notify('Tilt the bottle further (drag up) and hold it to pour.', 'info');
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

  // Timed drags: holding the filler squeezed, holding the bottle tilted.
  useFrame((_, dt) => {
    const d = useLabView.getState().drag;
    if (!d) return;
    if (d.kind === 'squeeze') {
      const value = Math.min(1, d.value + dt / SQUEEZE_S);
      if (value >= 1) {
        dragClock.pendingRelease = true;
        useLabView.setState({ drag: null, focus: 'pipetting', selected: 'pipette' });
        useBench.setState({ pip: 'filled', pipRough: false });
        play('success');
      } else useLabView.setState({ drag: { ...d, value } });
    } else if (d.kind === 'pour') {
      if (d.value > 0.7) {
        startPour();
        tools.current.pourTime += dt;
        if (tools.current.pourTime > POUR_S) {
          tools.current.pourTime = 0;
          stopPour();
          dragClock.pendingRelease = true;
          useLabView.setState({ drag: null });
          const { t: tt, s: ss } = ref.current;
          if (ss.burette === null || ss.burette > 2) tt.fill();
          else notify('The burette is already full.', 'info');
          play('success');
        }
      } else {
        stopPour();
        tools.current.pourTime = 0;
      }
    }
  });
  return null;
}
