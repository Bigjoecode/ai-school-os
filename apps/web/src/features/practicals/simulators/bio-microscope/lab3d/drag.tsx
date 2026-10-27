import { MICRO_OBJECTIVES, type BioMicroscopeState, type MicroMedium } from '@aischool/shared';
import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Vector3 } from 'three';
import { dragClock } from '../../../lab3d-kit/drag';
import { STATION } from '../../../lab3d-kit/layout';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView, type DragKind } from '../../../lab3d-kit/store';
import { placeSlide, type Microscope } from '../actions';
import { scopeActions } from './lab-actions';
import type { SceneState } from './scene-state';
import { MS, SPOT, stageY, useBench } from './spots';

/**
 * Hands-on dragging at the microscope, alongside the buttons (which stay for
 * accessibility): turn the coarse and fine knobs (drag up / down), slide the
 * diaphragm lever and the lamp dial, turn the nosepiece (drag sideways), carry
 * the finished slide onto the stage and squeeze a dropper over the slide.
 * A drag that hardly moves is a tap (the object is selected as usual).
 */

/** Pixels of pointer travel per step of each control. */
const PX = { coarse: 5, fine: 4, diaphragm: 3, lamp: 3, turret: 70 };

/** Which drag a press on a microscope part starts. */
export function partDrag(id: string, readOnly: boolean): DragKind | null {
  if (readOnly || useLabView.getState().mode === 'walk') return null;
  return id === 'coarse' || id === 'fine' || id === 'diaphragm' || id === 'lamp' || id === 'turret' ? id : null;
}

export function DragController({ m, s, scene }: { m: Microscope; s: BioMicroscopeState; scene: SceneState }) {
  const camera = useThree((st) => st.camera);
  const gl = useThree((st) => st.gl);
  const ref = useRef({ m, s, scene });
  ref.current = { m, s, scene };

  useEffect(() => {
    const screenOf = (local: [number, number, number]) => {
      const p = new Vector3(STATION[0] + local[0], STATION[1] + local[1], STATION[2] + local[2]).project(camera);
      const r = gl.domElement.getBoundingClientRect();
      return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
    };
    const move = (e: PointerEvent) => {
      const d = useLabView.getState().drag;
      if (!d || d.kind === 'carry') return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      const moved = d.moved + Math.hypot(dx, dy);
      const { m: mm, s: ss } = ref.current;
      const act = scopeActions(mm, ss);
      let value = d.value;
      if (d.kind === 'coarse' || d.kind === 'fine' || d.kind === 'lamp') {
        value -= dy;
        const steps = Math.trunc(value / PX[d.kind]);
        if (steps) {
          value -= steps * PX[d.kind];
          if (d.kind === 'coarse') act.coarse(steps * 0.5);
          else if (d.kind === 'fine') act.fine(steps * 0.02);
          else act.lamp(steps);
          if (d.kind !== 'lamp' && Math.abs(steps) > 0) play('tick');
        }
      } else if (d.kind === 'diaphragm') {
        value += dx;
        const steps = Math.trunc(value / PX.diaphragm);
        if (steps) {
          value -= steps * PX.diaphragm;
          act.diaphragm(steps);
        }
      } else if (d.kind === 'turret') {
        value += dx;
        if (Math.abs(value) >= PX.turret) {
          const i = MICRO_OBJECTIVES.indexOf(mm.ref.current.scope.objective);
          const next = MICRO_OBJECTIVES[(i + (value > 0 ? 1 : MICRO_OBJECTIVES.length - 1)) % MICRO_OBJECTIVES.length]!;
          value = 0;
          act.objective(next);
        }
      }
      useLabView.setState({ drag: { ...d, x: e.clientX, y: e.clientY, moved, value } });
    };
    const up = (e: PointerEvent) => {
      if (dragClock.pendingRelease) {
        dragClock.pendingRelease = false;
        dragClock.endedAt = performance.now();
      }
      const d = useLabView.getState().drag;
      if (!d || d.kind === 'carry') return;
      useLabView.setState({ drag: null });
      if (d.moved >= 8) dragClock.endedAt = performance.now();
      if (d.moved < 8) return;
      const { m: mm, s: ss, scene: sc } = ref.current;
      if (d.kind === 'slide') {
        const st = screenOf([SPOT.scope[0], stageY(ss.scope.coarse + ss.scope.fine), SPOT.scope[2] + MS.axisZ]);
        if (Math.hypot(e.clientX - st.x, e.clientY - st.y) > 90) return notify('Drop the slide on the microscope stage (or use “Place it on the stage”).', 'info');
        if (!sc.collected.has('microscope')) return notify('Get a microscope from the cupboard first.', 'warning');
        if (!ss.prep.coverslip) return notify('Finish the slide first: the cover slip goes on before it goes on the stage.', 'warning');
        play('clink');
        mm.update(placeSlide, 'place-slide');
        useLabView.setState({ focus: 'stage', selected: null });
      } else if (d.kind === 'drop') {
        const at = screenOf([SPOT.tile[0], 0.01, SPOT.tile[2]]);
        if (Math.hypot(e.clientX - at.x, e.clientY - at.y) > 80) return notify('Let go over your slide on the white tile.', 'info');
        const medium = d.id.slice(6) as Exclude<MicroMedium, 'NONE'>;
        if (sc.slide !== 'tile') return notify('Take a clean slide out onto the tile first.', 'warning');
        if (ss.prep.coverslip) return notify('The cover slip is on: it is too late to change the liquid.', 'warning');
        play('drip');
        useBench.setState({ dropAt: performance.now() });
        mm.update((x) => ({ ...x, prep: { ...x.prep, medium } }), `medium:${medium}`);
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
  }, [camera, gl]);
  return null;
}
