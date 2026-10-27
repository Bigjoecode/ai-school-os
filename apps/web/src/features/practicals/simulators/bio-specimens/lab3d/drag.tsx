import type { BioSpecimensVariant } from '@aischool/shared';
import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Vector3 } from 'three';
import { dragClock } from '../../../lab3d-kit/drag';
import { notify, useLabView } from '../../../lab3d-kit/store';
import type { SceneState } from './scene-state';
import { specimenWorld } from './station';

/**
 * Hands-on drags at the specimen bench, alongside the buttons: drag the hand
 * lens onto a specimen to examine it, or the ruler onto the specimen to be
 * measured. Dropped anywhere else, it says where to drop it.
 */
export function SpecimenDrags({ v, scene, onLens, onRuler }: { v: BioSpecimensVariant; scene: SceneState; onLens: (i: number) => void; onRuler: () => void }) {
  const camera = useThree((st) => st.camera);
  const gl = useThree((st) => st.gl);
  const ref = useRef({ v, scene, onLens, onRuler });
  ref.current = { v, scene, onLens, onRuler };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = useLabView.getState().drag;
      if (!d || (d.kind !== 'lensdrag' && d.kind !== 'rulerdrag')) return;
      useLabView.setState({ drag: { ...d, x: e.clientX, y: e.clientY, moved: d.moved + Math.hypot(e.clientX - d.x, e.clientY - d.y) } });
    };
    const up = (e: PointerEvent) => {
      const d = useLabView.getState().drag;
      if (!d || (d.kind !== 'lensdrag' && d.kind !== 'rulerdrag')) return;
      useLabView.setState({ drag: null });
      if (d.moved < 8) return;
      dragClock.endedAt = performance.now();
      const { v: vv, onLens: lens, onRuler: ruler } = ref.current;
      const r = gl.domElement.getBoundingClientRect();
      let best = -1;
      let bestD = 110;
      vv.specimens.forEach((_, i) => {
        const p = new Vector3(...specimenWorld(i, vv.specimens.length)).project(camera);
        const dist = Math.hypot(e.clientX - (r.left + ((p.x + 1) / 2) * r.width), e.clientY - (r.top + ((1 - p.y) / 2) * r.height));
        if (dist < bestD) [best, bestD] = [i, dist];
      });
      if (best < 0) return notify(d.kind === 'lensdrag' ? 'Drop the hand lens on a specimen to examine it.' : 'Drop the ruler beside the specimen you must measure.', 'info');
      if (d.kind === 'lensdrag') lens(best);
      else if (best === vv.measured) ruler();
      else notify(`Measure specimen ${vv.specimens[vv.measured]!.letter} — that is the one the task asks for.`, 'info');
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
