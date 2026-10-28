import { AMY_BATHS, FOOD_LETTERS, type FoodSample } from '@aischool/shared';
import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Vector3 } from 'three';
import { dragClock } from '../../../lab3d-kit/drag';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { BATH_TOP, FSPOT, amyBathSpot, sampleSpot, useFoodBench, world } from './bench';
import { heatTube, startTest, type FoodCtx } from './lab-actions';

/**
 * Hands-on drags at the food-tests bench, alongside the buttons: drag a
 * reagent bottle onto a sample (starts that test) or onto the tube in use
 * (adds it); drag the tube into the water bath (heats it for a minute); for
 * amylase, drag the iodine onto the spotting tile or Benedict's onto a bath's
 * tubes. Dropped anywhere else, it says where to drop it.
 */
const STARTS: Record<string, [import('@aischool/shared').FoodTestId, import('@aischool/shared').FoodStep | undefined]> = { IODINE: ['IODINE', undefined], BENEDICT: ['BENEDICT', undefined], HCL: ['NONREDUCING', 'ACID'], NAOH: ['BIURET', 'NAOH'], MILLON: ['MILLON', undefined], SUDAN: ['SUDAN', undefined], ETHANOL: ['EMULSION', 'ETHANOL'] };
const STEP_OF: Record<string, import('@aischool/shared').FoodStep> = { HCL: 'ACID', NAHCO3: 'NEUTRALISE', BENEDICT: 'BENEDICT', NAOH: 'NAOH', CUSO4: 'CUSO4', ETHANOL: 'ETHANOL' };

export function FoodDrags({ ctx }: { ctx: FoodCtx }) {
  const camera = useThree((st) => st.camera);
  const gl = useThree((st) => st.gl);
  const ref = useRef(ctx);
  ref.current = ctx;
  useEffect(() => {
    const isMine = (k?: string) => k === 'reagentdrag' || k === 'tubedrag';
    const move = (e: PointerEvent) => {
      const d = useLabView.getState().drag;
      if (!d || !isMine(d.kind)) return;
      useLabView.setState({ drag: { ...d, x: e.clientX, y: e.clientY, moved: d.moved + Math.hypot(e.clientX - d.x, e.clientY - d.y) } });
    };
    const up = (e: PointerEvent) => {
      const d = useLabView.getState().drag;
      if (!d || !isMine(d.kind)) return;
      useLabView.setState({ drag: null });
      if (d.moved < 8) return;
      dragClock.endedAt = performance.now();
      const c = ref.current;
      const r = gl.domElement.getBoundingClientRect();
      const near = (targets: { id: string; p: [number, number, number] }[]) => {
        let best: string | null = null;
        let bestD = 110;
        for (const t of targets) {
          const p = new Vector3(...t.p).project(camera);
          const dist = Math.hypot(e.clientX - (r.left + ((p.x + 1) / 2) * r.width), e.clientY - (r.top + ((1 - p.y) / 2) * r.height));
          if (dist < bestD) [best, bestD] = [t.id, dist];
        }
        return best;
      };
      const amy = (c.s.task ?? 'FOOD') === 'AMYLASE';
      const active = useFoodBench.getState().active;
      const t = c.s.tests[active];
      const tube = t ? [{ id: 'tube', p: world(FSPOT.tube, 0.1) }] : [];
      if (d.kind === 'tubedrag') {
        if (near([{ id: 'bath', p: world(FSPOT.bath, BATH_TOP + 0.05) }])) {
          if (!t) return;
          if (!c.scene.burnerOn) return notify('Light the burner under the water bath first.', 'warning');
          return heatTube(c, active, 60);
        }
        return notify('Drop the tube in the water bath to heat it.', 'info');
      }
      const bottle = d.id.replace(/^bottle:/, '');
      if (amy) {
        if (bottle === 'IODINE' && near([{ id: 'tile', p: world(FSPOT.tile, 0.01) }])) return c.f.setTile();
        if (bottle === 'BENEDICT') {
          const hit = near(AMY_BATHS.map((b) => ({ id: b, p: world(amyBathSpot(b), b === 'BOILING' ? BATH_TOP + 0.05 : 0.06) })));
          const k = hit ? c.s.tubes.findIndex((x) => x.bath === hit) : -1;
          if (k >= 0 && c.s.clock !== null) return startTest(c, String(k + 1) as FoodSample, 'BENEDICT');
        }
        return notify(bottle === 'IODINE' ? 'Drop the iodine on the spotting tile.' : "Drop Benedict's on a bath's tube once the mixtures are timing.", 'info');
      }
      const hit = near([...FOOD_LETTERS.map((l, k) => ({ id: l, p: world(sampleSpot(k), 0.05) })), ...tube]);
      if (hit === 'tube' && STEP_OF[bottle] && t && !t.steps.includes(STEP_OF[bottle]!)) return c.f.addStep(active, STEP_OF[bottle]!);
      if (hit && hit !== 'tube' && STARTS[bottle]) {
        if (!c.scene.collected.has('rack')) return notify('Get the test tubes from the apparatus cupboard first.', 'warning');
        return startTest(c, hit as FoodSample, STARTS[bottle]![0], STARTS[bottle]![1]);
      }
      notify(STARTS[bottle] ? 'Drop the bottle on a sample (P, Q or R) to start that test.' : 'Drop it on the test tube in use.', 'info');
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
