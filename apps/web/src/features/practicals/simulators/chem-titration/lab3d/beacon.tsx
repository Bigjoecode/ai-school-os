import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { CircleGeometry, ConeGeometry, Matrix4, MeshBasicMaterial, Quaternion, Vector3, type Group, type InstancedMesh } from 'three';
import { useLabView } from './store';
import { objectPosition } from './targets';

/**
 * Guided mode's pointers: a bobbing arrow with a glow above the object to use
 * next, and — while walking to something far away — a line of glowing dots on
 * the floor leading there along the aisle.
 */

const DOTS = 40;
const SPACING = 0.32;
/** Walkways: aisles across the room (z) and gaps between bench columns (x). */
const AISLES_Z = [-2.05, 0.5, 3.15];
const GAPS_X = [-6.05, -2.1, 2.1, 6.05];
const inRow = (z: number) => (z > -1.3 && z < -0.3) || (z > 1.4 && z < 2.4);
const nearest = (v: number, list: number[]) => list.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));

/** A path along the walkways from the player to a target (floor points). */
function route(px: number, pz: number, tx: number, tz: number): Vector3[] {
  const pts: [number, number][] = [[px, pz]];
  let z = pz;
  if (inRow(z) || Math.abs(px - tx) > 0.5) {
    z = nearest(pz, AISLES_Z);
    pts.push([px, z]);
  }
  const endZ = tz > 1.2 && tx > 5 ? tz : nearest(tz + 0.6, AISLES_Z);
  if (Math.abs(endZ - z) > 0.3) {
    const gx = nearest((px + tx) / 2, GAPS_X);
    pts.push([gx, z], [gx, endZ]);
  }
  pts.push([tx, endZ], [tx, tz]);
  return pts.map(([x, zz]) => new Vector3(x, 0.01, zz));
}
const arrowMat = new MeshBasicMaterial({ color: '#fbbf24', transparent: true, opacity: 0.92, depthTest: false });
const dotMat = new MeshBasicMaterial({ color: '#fbbf24', transparent: true, opacity: 0.75, depthWrite: false });

export function Beacon() {
  const target = useLabView((v) => v.target);
  const mode = useLabView((v) => v.mode);
  const arrow = useRef<Group>(null);
  const dots = useRef<InstancedMesh>(null);
  const camera = useThree((s) => s.camera);
  const tmp = useMemo(() => ({ p: new Vector3(), m: new Matrix4(), q: new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2), s: new Vector3(), b: new Vector3() }), []);
  const geo = useMemo(() => ({ cone: new ConeGeometry(1, 1.6, 16), dot: new CircleGeometry(0.06, 12) }), []);

  useFrame(({ clock }) => {
    const g = arrow.current;
    const d = dots.current;
    const pos = target ? objectPosition(target, tmp.p) : null;
    // Arrow: sized to the view (small at the bench, large across the room).
    if (g) {
      g.visible = !!pos && mode !== 'read';
      if (pos) {
        const far = camera.position.distanceTo(pos);
        const size = Math.max(0.012, Math.min(0.14, far * 0.035));
        g.position.set(pos.x, pos.y + (target === 'mybench' ? 0.4 : target === 'cupboard' ? 2.2 : 0.22) + size * 2 + Math.sin(clock.elapsedTime * 3) * size * 0.5, pos.z);
        g.scale.setScalar(size);
      }
    }
    // Floor path while walking: player -> aisle -> target.
    if (d) {
      d.count = 0;
      if (pos && mode === 'walk' && camera.position.distanceTo(pos) > 2.2) {
        const pts = route(camera.position.x, camera.position.z, pos.x, pos.z);
        let n = 0;
        let next = (clock.elapsedTime * 0.6) % SPACING;
        let acc = 0;
        for (let i = 0; i < pts.length - 1; i++) {
          const from = pts[i]!;
          const to = pts[i + 1]!;
          const len = from.distanceTo(to);
          for (; next <= acc + len && n < DOTS; next += SPACING) {
            tmp.b.copy(from).lerp(to, len ? (next - acc) / len : 0);
            if (tmp.b.distanceTo(camera.position) > 0.9) d.setMatrixAt(n++, tmp.m.compose(tmp.b, tmp.q, tmp.s.setScalar(1)));
          }
          acc += len;
        }
        d.count = n;
        d.instanceMatrix.needsUpdate = true;
      }
    }
  });

  return (
    <group>
      <group ref={arrow} visible={false} renderOrder={20}>
        <mesh geometry={geo.cone} material={arrowMat} rotation={[Math.PI, 0, 0]} renderOrder={20} />
      </group>
      <instancedMesh ref={dots} args={[geo.dot, dotMat, DOTS]} frustumCulled={false} />
    </group>
  );
}
