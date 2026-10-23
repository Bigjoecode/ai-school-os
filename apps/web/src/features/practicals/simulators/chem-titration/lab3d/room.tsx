import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { BoxGeometry, Color, CylinderGeometry, Euler, Matrix4, Quaternion, Vector3, type BufferGeometry, type Group, type InstancedMesh, type Material } from 'three';
import { BlobShadow, ReagentBottle } from './apparatus';
import { Interactive } from './interact';
import { BENCH, BENCHES, COAT_HOOKS, CUPBOARD, DESK, DOOR, FUME, HALF_D, HALF_W, MY_BENCH, ROOM, SHELF, WINDOWS_Z } from './layout';
import { mat } from './materials';
import { boxShadowTexture, floorTexture, periodicTexture, posterTexture, signTexture, whiteboardTexture, windowTexture } from './textures';

/**
 * The chemistry laboratory itself, all procedural: tiled floor, two-tone
 * painted walls, louvre windows with daylight, ceiling lights and fans, six
 * student benches with sinks and stools, the teacher's desk and whiteboard,
 * reagent shelves, the fume cupboard and the safety corner by the door.
 * Repeated parts are instanced.
 */

type V3 = [number, number, number];
interface Item {
  p: V3;
  r?: V3;
  s?: V3;
  c?: string;
}

/** One instanced mesh for many copies of a part. */
function Repeat({ geometry, material, items }: { geometry: BufferGeometry; material: Material; items: Item[] }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const mx = new Matrix4();
    const q = new Quaternion();
    const e = new Euler();
    const col = new Color();
    items.forEach((it, i) => {
      q.setFromEuler(e.set(...(it.r ?? [0, 0, 0])));
      mx.compose(new Vector3(...it.p), q, new Vector3(...(it.s ?? [1, 1, 1])));
      m.setMatrixAt(i, mx);
      if (it.c) m.setColorAt(i, col.set(it.c));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [items]);
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} />;
}

const box = new BoxGeometry(1, 1, 1);
const cyl = new CylinderGeometry(1, 1, 1, 16);
const cylLow = new CylinderGeometry(1, 1, 1, 8);

function Box({ p, s, m, r }: { p: V3; s: V3; m: Material; r?: V3 }) {
  return <mesh geometry={box} material={m} position={p} scale={s} rotation={r} />;
}

// ------------------------------------------------------------------ shell
function Shell() {
  const floor = useMemo(() => floorTexture([ROOM.w / 2.4, ROOM.d / 2.4]), []);
  const t = 0.15;
  const winH: [number, number] = [1.0, 2.45];
  const winW = 1.7;
  // West wall pieces between the windows.
  const westPieces = useMemo(() => {
    const out: { z0: number; z1: number }[] = [];
    let z = -HALF_D;
    for (const wz of WINDOWS_Z) {
      out.push({ z0: z, z1: wz - winW / 2 });
      z = wz + winW / 2;
    }
    out.push({ z0: z, z1: HALF_D });
    return out;
  }, []);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[ROOM.w, ROOM.d]} />
        <meshStandardMaterial map={floor} roughness={0.32} metalness={0} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, ROOM.h, 0]} material={mat.ceiling()}>
        <planeGeometry args={[ROOM.w, ROOM.d]} />
      </mesh>
      {/* north (whiteboard) and east walls */}
      <Box p={[0, ROOM.h / 2, -HALF_D - t / 2]} s={[ROOM.w, ROOM.h, t]} m={mat.wall()} />
      <Box p={[HALF_W + t / 2, ROOM.h / 2, 0]} s={[t, ROOM.h, ROOM.d]} m={mat.wall()} />
      {/* south wall with the door opening */}
      <Box p={[(-HALF_W + DOOR.x - DOOR.w / 2) / 2, ROOM.h / 2, HALF_D + t / 2]} s={[DOOR.x - DOOR.w / 2 + HALF_W, ROOM.h, t]} m={mat.wall()} />
      <Box p={[(HALF_W + DOOR.x + DOOR.w / 2) / 2, ROOM.h / 2, HALF_D + t / 2]} s={[HALF_W - DOOR.x - DOOR.w / 2, ROOM.h, t]} m={mat.wall()} />
      <Box p={[DOOR.x, (ROOM.h + 2.15) / 2, HALF_D + t / 2]} s={[DOOR.w, ROOM.h - 2.15, t]} m={mat.wall()} />
      {/* the door, ajar */}
      <Box p={[DOOR.x - DOOR.w / 2 + 0.03, 1.07, HALF_D + 0.02]} s={[0.05, 2.14, 0.06]} m={mat.windowFrame()} />
      <Box p={[DOOR.x + DOOR.w / 2 - 0.03, 1.07, HALF_D + 0.02]} s={[0.05, 2.14, 0.06]} m={mat.windowFrame()} />
      <group position={[DOOR.x + DOOR.w / 2 - 0.04, 0, HALF_D + 0.05]} rotation={[0, -0.35, 0]}>
        <Box p={[-DOOR.w / 2 + 0.04, 1.06, 0.02]} s={[DOOR.w - 0.08, 2.1, 0.04]} m={mat.woodDark()} />
        <Box p={[-DOOR.w + 0.18, 1.02, -0.02]} s={[0.12, 0.03, 0.03]} m={mat.steel()} />
      </group>
      <mesh position={[DOOR.x, 2.32, HALF_D - 0.01]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[0.42, 0.21]} />
        <meshBasicMaterial map={signTexture('exit')} />
      </mesh>
      {/* west wall with three louvre windows */}
      {westPieces.map(({ z0, z1 }) => (
        <Box key={z0} p={[-HALF_W - t / 2, ROOM.h / 2, (z0 + z1) / 2]} s={[t, ROOM.h, z1 - z0]} m={mat.wall()} />
      ))}
      {WINDOWS_Z.map((z) => (
        <group key={z}>
          <Box p={[-HALF_W - t / 2, winH[0] / 2, z]} s={[t, winH[0], winW]} m={mat.wall()} />
          <Box p={[-HALF_W - t / 2, (ROOM.h + winH[1]) / 2, z]} s={[t, ROOM.h - winH[1], winW]} m={mat.wall()} />
        </group>
      ))}
      <Windows winH={winH} winW={winW} />
      {/* painted dado band and skirting */}
      <Box p={[0, 0.55, -HALF_D + 0.004]} s={[ROOM.w, 1.1, 0.01]} m={mat.dado()} />
      <Box p={[HALF_W - 0.004, 0.55, 0]} s={[0.01, 1.1, ROOM.d]} m={mat.dado()} />
      <Box p={[-HALF_W + 0.004, 0.5, 0]} s={[0.01, 1.0, ROOM.d]} m={mat.dado()} />
      <Box p={[(-HALF_W + DOOR.x - DOOR.w / 2) / 2, 0.55, HALF_D - 0.004]} s={[DOOR.x - DOOR.w / 2 + HALF_W, 1.1, 0.01]} m={mat.dado()} />
      <Box p={[(HALF_W + DOOR.x + DOOR.w / 2) / 2, 0.55, HALF_D - 0.004]} s={[HALF_W - DOOR.x - DOOR.w / 2, 1.1, 0.01]} m={mat.dado()} />
      <Box p={[0, 1.11, -HALF_D + 0.006]} s={[ROOM.w, 0.025, 0.014]} m={mat.skirting()} />
      <Box p={[HALF_W - 0.006, 1.11, 0]} s={[0.014, 0.025, ROOM.d]} m={mat.skirting()} />
    </group>
  );
}

function Windows({ winH, winW }: { winH: [number, number]; winW: number }) {
  const sky = useMemo(() => windowTexture(), []);
  const blades = useMemo(() => {
    const out: Item[] = [];
    for (const z of WINDOWS_Z)
      for (const half of [-1, 1])
        for (let y = winH[0] + 0.08; y < winH[1] - 0.04; y += 0.1) out.push({ p: [-HALF_W - 0.06, y, z + (half * winW) / 4], r: [0, 0, 0.5], s: [0.1, 0.004, winW / 2 - 0.05] });
    return out;
  }, [winH, winW]);
  return (
    <group>
      {WINDOWS_Z.map((z) => (
        <group key={z}>
          <mesh position={[-HALF_W - 0.4, (winH[0] + winH[1]) / 2, z]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[winW + 0.6, winH[1] - winH[0] + 0.5]} />
            <meshBasicMaterial map={sky} toneMapped={false} />
          </mesh>
          {/* frame and mullion */}
          <Box p={[-HALF_W - 0.02, winH[0] - 0.03, z]} s={[0.2, 0.06, winW + 0.08]} m={mat.windowFrame()} />
          <Box p={[-HALF_W - 0.05, winH[1] + 0.02, z]} s={[0.12, 0.05, winW + 0.08]} m={mat.windowFrame()} />
          {[-1, 0, 1].map((k) => (
            <Box key={k} p={[-HALF_W - 0.05, (winH[0] + winH[1]) / 2, z + (k * winW) / 2]} s={[0.12, winH[1] - winH[0], 0.05]} m={mat.windowFrame()} />
          ))}
          {/* burglar-proof bars outside */}
          {[-0.6, -0.3, 0, 0.3, 0.6].map((k) => (
            <mesh key={k} position={[-HALF_W - 0.13, (winH[0] + winH[1]) / 2, z + k * (winW / 1.5)]} scale={[0.008, winH[1] - winH[0], 0.008]} geometry={cylLow} material={mat.darkMetal()} />
          ))}
        </group>
      ))}
      <Repeat geometry={box} material={mat.louvre()} items={blades} />
    </group>
  );
}

// ------------------------------------------------------------------ lights and fans
function CeilingFittings() {
  const panels = useMemo<Item[]>(() => [-4.2, 0, 4.2].flatMap((x) => [-2.2, 1.2].map((z): Item => ({ p: [x, ROOM.h - 0.03, z], s: [1.25, 0.05, 0.22] }))), []);
  const housings = useMemo<Item[]>(() => panels.map((p) => ({ p: [p.p[0], ROOM.h - 0.015, p.p[2]], s: [1.32, 0.03, 0.3] })), [panels]);
  return (
    <group>
      <Repeat geometry={box} material={mat.windowFrame()} items={housings} />
      <Repeat geometry={box} material={mat.light()} items={panels} />
      <Fan x={-2.1} z={0.5} />
      <Fan x={2.1} z={0.5} />
    </group>
  );
}
function Fan({ x, z }: { x: number; z: number }) {
  const ref = useRef<Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 3.2;
  });
  return (
    <group position={[x, ROOM.h, z]}>
      <mesh position={[0, -0.2, 0]} scale={[0.012, 0.4, 0.012]} geometry={cylLow} material={mat.white()} />
      <group ref={ref} position={[0, -0.42, 0]}>
        <mesh scale={[0.09, 0.07, 0.09]} geometry={cyl} material={mat.white()} />
        {[0, 1, 2].map((k) => (
          <mesh key={k} rotation={[0, (k * Math.PI * 2) / 3, 0]} position={[Math.cos((k * Math.PI * 2) / 3) * 0.42, 0, -Math.sin((k * Math.PI * 2) / 3) * 0.42]} scale={[0.68, 0.008, 0.12]} geometry={box} material={mat.white()} />
        ))}
      </group>
    </group>
  );
}

// ------------------------------------------------------------------ benches and stools
function Benches() {
  const shadow = useMemo(() => boxShadowTexture(), []);
  const parts = useMemo(() => {
    const tops: Item[] = [];
    const bodies: Item[] = [];
    const doors: Item[] = [];
    const handles: Item[] = [];
    const sinks: Item[] = [];
    const taps: Item[] = [];
    const seats: Item[] = [];
    const posts: Item[] = [];
    const feet: Item[] = [];
    const racks: Item[] = [];
    for (const [x, z] of BENCHES) {
      tops.push({ p: [x, BENCH.h - 0.02, z], s: [BENCH.w, 0.04, BENCH.d] });
      bodies.push({ p: [x, (BENCH.h - 0.04) / 2 + 0.05, z], s: [BENCH.w - 0.1, BENCH.h - 0.14, BENCH.d - 0.12] });
      bodies.push({ p: [x, 0.04, z], s: [BENCH.w - 0.16, 0.08, BENCH.d - 0.2] });
      for (let k = 0; k < 4; k++) {
        const dx = x - BENCH.w / 2 + 0.36 + k * ((BENCH.w - 0.72) / 3);
        doors.push({ p: [dx, 0.5, z + BENCH.d / 2 - 0.055], s: [0.56, 0.62, 0.02] });
        handles.push({ p: [dx + 0.2, 0.72, z + BENCH.d / 2 - 0.04], s: [0.012, 0.09, 0.012] });
      }
      // sink at the west end, gooseneck tap behind it
      sinks.push({ p: [x - BENCH.w / 2 + 0.24, BENCH.h + 0.001, z + 0.02], s: [0.34, 0.004, 0.36] });
      taps.push({ p: [x - BENCH.w / 2 + 0.24, BENCH.h + 0.15, z - 0.22], s: [0.012, 0.3, 0.012] });
      taps.push({ p: [x - BENCH.w / 2 + 0.24, BENCH.h + 0.3, z - 0.15], r: [Math.PI / 2, 0, 0], s: [0.011, 0.15, 0.011] });
      taps.push({ p: [x - BENCH.w / 2 + 0.24, BENCH.h + 0.26, z - 0.075], s: [0.01, 0.08, 0.01] });
      // shelf rack down the middle of the other benches (the student's own bench is kept clear)
      if (x !== MY_BENCH[0] || z !== MY_BENCH[1]) racks.push({ p: [x + 0.3, BENCH.h + 0.16, z - 0.3], s: [1.2, 0.02, 0.2] });
      // two stools on the student side
      for (const sx of [-0.55, 0.55]) {
        const px = x + sx;
        const pz = z + BENCH.d / 2 + 0.42;
        seats.push({ p: [px, 0.66, pz], s: [0.17, 0.04, 0.17] });
        posts.push({ p: [px, 0.33, pz], s: [0.022, 0.64, 0.022] });
        feet.push({ p: [px, 0.015, pz], s: [0.2, 0.03, 0.2] });
      }
    }
    return { tops, bodies, doors, handles, sinks, taps, seats, posts, feet, racks };
  }, []);
  const rackBottles = useMemo<Item[]>(() => {
    const colours = ['#e7eef2', '#d0e2ea', '#6b3a12', '#e7eef2', '#f3e6b0', '#6b3a12'];
    const out: Item[] = [];
    for (const r of parts.racks)
      for (let i = 0; i < 6; i++) out.push({ p: [r.p[0] - 0.5 + i * 0.2, r.p[1] + 0.07, r.p[2]], s: [0.035, 0.12, 0.035], c: colours[i] });
    return out;
  }, [parts.racks]);
  const bottleMat = useMemo(() => mat.white().clone(), []);
  return (
    <group>
      <Repeat geometry={box} material={mat.benchTop()} items={parts.tops} />
      <Repeat geometry={box} material={mat.cabinet()} items={parts.bodies} />
      <Repeat geometry={box} material={mat.wood()} items={parts.doors} />
      <Repeat geometry={box} material={mat.steel()} items={parts.handles} />
      <Repeat geometry={box} material={mat.darkMetal()} items={parts.sinks} />
      <Repeat geometry={cylLow} material={mat.steel()} items={parts.taps} />
      <Repeat geometry={cyl} material={mat.wood()} items={parts.seats} />
      <Repeat geometry={cylLow} material={mat.darkMetal()} items={parts.posts} />
      <Repeat geometry={cyl} material={mat.darkMetal()} items={parts.feet} />
      <Repeat geometry={box} material={mat.wood()} items={parts.racks} />
      <Repeat geometry={cyl} material={bottleMat} items={rackBottles} />
      {BENCHES.map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, 0.002, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[BENCH.w + 0.5, BENCH.d + 0.5]} />
          <meshBasicMaterial map={shadow} transparent opacity={0.55} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

// ------------------------------------------------------------------ front of the room
function FrontWall() {
  const board = useMemo(() => whiteboardTexture(['Chemistry — SS3 Practical', 'Volumetric analysis: acid–base titration', 'Rough titration first, then accurate ones', 'Record burette readings to 2 d.p.']), []);
  return (
    <group>
      <Interactive id="whiteboard" label="Whiteboard" labelY={0.8} position={[0, 1.55, -HALF_D + 0.03]}>
        <mesh position={[0, 0, 0.01]}>
          <planeGeometry args={[3.2, 1.4]} />
          <meshStandardMaterial map={board} roughness={0.25} />
        </mesh>
        <Box p={[0, 0, -0.02]} s={[3.28, 1.48, 0.03]} m={mat.metal()} />
        <Box p={[0, -0.74, 0.04]} s={[1.6, 0.03, 0.07]} m={mat.metal()} />
      </Interactive>
      <mesh position={[-4.2, 1.75, -HALF_D + 0.012]}>
        <planeGeometry args={[2.0, 1.0]} />
        <meshStandardMaterial map={periodicTexture()} roughness={0.6} />
      </mesh>
      <mesh position={[2.55, 1.75, -HALF_D + 0.012]}>
        <planeGeometry args={[0.6, 0.8]} />
        <meshStandardMaterial map={posterTexture('titration')} roughness={0.6} />
      </mesh>
      {/* teacher's desk and chair */}
      <Interactive id="desk" label="Teacher’s desk" labelY={1.0} position={[DESK.x, 0, DESK.z]}>
        <Box p={[0, DESK.h - 0.02, 0]} s={[DESK.w, 0.04, DESK.d]} m={mat.wood()} />
        <Box p={[-DESK.w / 2 + 0.25, DESK.h / 2 - 0.02, 0]} s={[0.46, DESK.h - 0.04, DESK.d - 0.06]} m={mat.woodDark()} />
        <Box p={[DESK.w / 2 - 0.04, DESK.h / 2 - 0.02, 0]} s={[0.04, DESK.h - 0.04, DESK.d - 0.06]} m={mat.woodDark()} />
        <Box p={[0.2, DESK.h / 2, -DESK.d / 2 + 0.03]} s={[DESK.w - 0.6, DESK.h * 0.6, 0.02]} m={mat.woodDark()} />
        <Box p={[-0.4, DESK.h + 0.02, 0.05]} s={[0.3, 0.04, 0.22]} m={mat.red()} />
        <Box p={[-0.42, DESK.h + 0.055, 0.06]} s={[0.28, 0.03, 0.2]} m={mat.green()} />
        <group position={[0.4, DESK.h, -0.1]}>
          <ReagentBottle name="NaOH" band="#2a7fc9" />
        </group>
        <group position={[0, 0, -0.7]}>
          <Box p={[0, 0.46, 0]} s={[0.46, 0.05, 0.44]} m={mat.darkMetal()} />
          <Box p={[0, 0.8, -0.2]} s={[0.44, 0.5, 0.04]} m={mat.darkMetal()} />
          <mesh position={[0, 0.22, 0]} scale={[0.03, 0.44, 0.03]} geometry={cylLow} material={mat.metal()} />
        </group>
        <BlobShadow r={1.0} opacity={0.5} />
      </Interactive>
    </group>
  );
}

// ------------------------------------------------------------------ east wall: reagent shelf, apparatus cupboard, fume cupboard
const SHELF_BOTTLES: { name: string; band: string; sub?: string; amber?: boolean; liquid?: string }[] = [
  { name: 'HCl', band: '#c62828', sub: '2.0 mol dm⁻³' },
  { name: 'H₂SO₄', band: '#c62828', sub: 'dilute' },
  { name: 'HNO₃', band: '#c62828', sub: 'dilute', amber: true },
  { name: 'CH₃COOH', band: '#c62828', sub: 'ethanoic' },
  { name: 'NaOH', band: '#2a7fc9', sub: '1.0 mol dm⁻³' },
  { name: 'KOH', band: '#2a7fc9', sub: 'solution' },
  { name: 'Na₂CO₃', band: '#2a7fc9', sub: 'solution' },
  { name: 'NH₃(aq)', band: '#2a7fc9', sub: 'ammonia' },
  { name: 'AgNO₃', band: '#6d4c41', sub: 'solution', amber: true },
  { name: 'BaCl₂', band: '#6d4c41', sub: 'solution' },
  { name: 'Methyl orange', band: '#ef8a17', liquid: '#f08a24' },
  { name: 'Phenolphthalein', band: '#d63384', liquid: '#f6f0f5' },
];
function ReagentShelf() {
  const rows = [0.55, 1.05, 1.55];
  return (
    <Interactive id="shelf" label="Reagent shelf" labelY={2.05} position={[SHELF.x, 0, SHELF.z]} rotation={[0, -Math.PI / 2, 0]}>
      <Box p={[0, SHELF.h / 2, -SHELF.d / 2 + 0.01]} s={[SHELF.w, SHELF.h, 0.02]} m={mat.woodDark()} />
      {[-1, 1].map((s) => (
        <Box key={s} p={[(s * SHELF.w) / 2, SHELF.h / 2, 0]} s={[0.03, SHELF.h, SHELF.d]} m={mat.woodDark()} />
      ))}
      <Box p={[0, 0.25, 0]} s={[SHELF.w, 0.5, SHELF.d]} m={mat.cabinet()} />
      {rows.map((y) => (
        <Box key={y} p={[0, y - 0.015, 0]} s={[SHELF.w, 0.03, SHELF.d]} m={mat.wood()} />
      ))}
      <Box p={[0, SHELF.h, 0]} s={[SHELF.w + 0.04, 0.03, SHELF.d + 0.02]} m={mat.woodDark()} />
      {SHELF_BOTTLES.map((b, i) => {
        const row = Math.floor(i / 4);
        const col = i % 4;
        return (
          <group key={b.name} position={[-0.8 + col * 0.52 + (row % 2) * 0.1, rows[row]!, 0.04]}>
            <ReagentBottle name={b.name} band={b.band} sub={b.sub} amber={b.amber} liquid={b.liquid} r={0.055} h={0.2} />
          </group>
        );
      })}
      <mesh position={[0, 2.25, -SHELF.d / 2 + 0.03]}>
        <planeGeometry args={[0.6, 0.8]} />
        <meshStandardMaterial map={posterTexture('hazards')} roughness={0.6} />
      </mesh>
    </Interactive>
  );
}

/** The apparatus cupboard's body (its contents are the station's collectible apparatus). */
export function CupboardBody() {
  return (
    <group position={[CUPBOARD.x, 0, CUPBOARD.z]} rotation={[0, -Math.PI / 2, 0]}>
      <Box p={[0, CUPBOARD.h / 2, -CUPBOARD.d / 2 + 0.01]} s={[CUPBOARD.w, CUPBOARD.h, 0.02]} m={mat.cabinet()} />
      {[-1, 1].map((s) => (
        <Box key={s} p={[(s * CUPBOARD.w) / 2, CUPBOARD.h / 2, 0]} s={[0.04, CUPBOARD.h, CUPBOARD.d]} m={mat.wood()} />
      ))}
      <Box p={[0, CUPBOARD.h, 0]} s={[CUPBOARD.w + 0.06, 0.04, CUPBOARD.d + 0.02]} m={mat.wood()} />
      <Box p={[0, 0.3, 0]} s={[CUPBOARD.w, 0.6, CUPBOARD.d]} m={mat.wood()} />
      {CUPBOARD_SHELVES.map((y) => (
        <Box key={y} p={[0, y - 0.012, 0]} s={[CUPBOARD.w - 0.06, 0.024, CUPBOARD.d - 0.04]} m={mat.cabinet()} />
      ))}
      {/* sliding glass doors, both pushed to the left so the right side is open */}
      {[0, 1].map((k) => (
        <group key={k} position={[-CUPBOARD.w / 4 - 0.02, 1.3, CUPBOARD.d / 2 - 0.02 - k * 0.025]}>
          <mesh material={mat.pane()}>
            <planeGeometry args={[CUPBOARD.w / 2, 1.36]} />
          </mesh>
          {[-1, 1].map((s) => (
            <Box key={s} p={[(s * CUPBOARD.w) / 4, 0, 0]} s={[0.025, 1.38, 0.02]} m={mat.wood()} />
          ))}
        </group>
      ))}
      <Box p={[0, 0.61, CUPBOARD.d / 2 - 0.03]} s={[CUPBOARD.w, 0.02, 0.06]} m={mat.wood()} />
      <mesh position={[0, CUPBOARD.h - 0.09, CUPBOARD.d / 2 + 0.002]}>
        <planeGeometry args={[0.6, 0.15]} />
        <meshBasicMaterial map={signTexture('apparatus')} />
      </mesh>
    </group>
  );
}
export const CUPBOARD_SHELVES = [0.62, 1.05, 1.5];

function FumeCupboard() {
  return (
    <Interactive id="fume" label="Fume cupboard" labelY={2.5} position={[FUME.x, 0, FUME.z]}>
      <Box p={[0, 0.45, 0]} s={[FUME.w, 0.9, FUME.d]} m={mat.cabinet()} />
      <Box p={[0, 0.91, 0]} s={[FUME.w, 0.03, FUME.d]} m={mat.benchTop()} />
      <Box p={[0, 1.62, -FUME.d / 2 + 0.03]} s={[FUME.w - 0.04, 1.4, 0.04]} m={mat.white()} />
      {[-1, 1].map((s) => (
        <Box key={s} p={[(s * (FUME.w - 0.04)) / 2, 1.62, 0]} s={[0.05, 1.42, FUME.d]} m={mat.cabinet()} />
      ))}
      <Box p={[0, FUME.h - 0.08, 0]} s={[FUME.w, 0.16, FUME.d]} m={mat.cabinet()} />
      <Box p={[0, 1.46, FUME.d / 2 - 0.03]} s={[FUME.w - 0.1, 0.9, 0.01]} m={mat.pane()} />
      <Box p={[0, 1.02, FUME.d / 2 - 0.03]} s={[FUME.w - 0.1, 0.03, 0.03]} m={mat.darkMetal()} />
      <mesh position={[0.3, FUME.h + 0.4, -0.1]} scale={[0.14, 0.8, 0.14]} geometry={cyl} material={mat.metal()} />
      <mesh position={[0, FUME.h - 0.08, FUME.d / 2 + 0.002]}>
        <planeGeometry args={[0.5, 0.14]} />
        <meshBasicMaterial map={signTexture('fume')} />
      </mesh>
      <mesh position={[0, 2.0, -FUME.d / 2 + 0.06]} material={mat.light()}>
        <boxGeometry args={[FUME.w - 0.3, 0.03, 0.05]} />
      </mesh>
      <group position={[-0.4, 0.925, 0]}>
        <ReagentBottle name="Conc. HCl" band="#c62828" sub="fuming — use here" amber r={0.05} h={0.18} />
      </group>
      <BlobShadow r={1.1} opacity={0.5} />
    </Interactive>
  );
}

// ------------------------------------------------------------------ safety corner by the door
function LabCoat({ x }: { x: number }) {
  return (
    <group position={[x, 0, 0]}>
      <Box p={[0, -0.42, 0.05]} s={[0.46, 0.82, 0.05]} m={mat.white()} />
      <Box p={[-0.26, -0.36, 0.05]} s={[0.1, 0.6, 0.05]} r={[0, 0, 0.12]} m={mat.white()} />
      <Box p={[0.26, -0.36, 0.05]} s={[0.1, 0.6, 0.05]} r={[0, 0, -0.12]} m={mat.white()} />
      <Box p={[0, -0.05, 0.06]} s={[0.2, 0.08, 0.06]} m={mat.white()} />
    </group>
  );
}
export function SafetyCorner({ coatOn, gogglesOn }: { coatOn: boolean; gogglesOn: boolean }) {
  const [hx, hy, hz] = COAT_HOOKS;
  return (
    <group>
      {/* coat hooks: one coat (and one pair of goggles) is the student's */}
      <group position={[hx, hy, hz]} rotation={[0, Math.PI, 0]}>
        <Box p={[0, 0.08, 0.01]} s={[1.3, 0.06, 0.02]} m={mat.wood()} />
        {[-0.45, -0.15, 0.15, 0.45].map((x) => (
          <mesh key={x} position={[x, 0.06, 0.05]} rotation={[Math.PI / 2, 0, 0]} scale={[0.008, 0.08, 0.008]} geometry={cylLow} material={mat.steel()} />
        ))}
        <LabCoat x={-0.45} />
        <LabCoat x={0.45} />
        <Interactive id="coat" label={coatOn ? 'Coat hook (you are wearing your coat)' : 'Your lab coat'} labelY={0.15} position={[-0.15, 0, 0.02]}>
          {(active) => (
            <group>
              {!coatOn && <LabCoat x={0} />}
              {active && (
                <mesh position={[0, -0.4, 0.09]} material={mat.highlight()}>
                  <planeGeometry args={[0.6, 0.95]} />
                </mesh>
              )}
            </group>
          )}
        </Interactive>
        <Interactive id="goggles" label={gogglesOn ? 'Goggle hook' : 'Safety goggles'} labelY={0.12} position={[0.15, 0, 0.02]}>
          {(active) => (
            <group>
              {!gogglesOn && (
                <group position={[0, -0.06, 0.03]}>
                  {[-0.045, 0.045].map((x) => (
                    <mesh key={x} position={[x, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
                      <cylinderGeometry args={[0.04, 0.04, 0.03, 16]} />
                      <meshStandardMaterial color="#cfe9f7" transparent opacity={0.6} roughness={0.1} />
                    </mesh>
                  ))}
                  <Box p={[0, 0.02, 0]} s={[0.2, 0.015, 0.012]} m={mat.black()} />
                </group>
              )}
              {active && (
                <mesh position={[0, -0.06, 0.06]} material={mat.highlight()}>
                  <planeGeometry args={[0.26, 0.14]} />
                </mesh>
              )}
            </group>
          )}
        </Interactive>
      </group>
      <mesh position={[hx, hy + 0.55, hz]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[0.6, 0.8]} />
        <meshStandardMaterial map={posterTexture('goggles')} roughness={0.6} />
      </mesh>
      <mesh position={[1.4, 1.7, HALF_D - 0.012]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[0.6, 0.8]} />
        <meshStandardMaterial map={posterTexture('rules')} roughness={0.6} />
      </mesh>
      {/* first aid box */}
      <Interactive id="firstaid" label="First-aid box" labelY={0.32} position={[6.3, 1.5, HALF_D - 0.08]}>
        <Box p={[0, 0, 0]} s={[0.4, 0.3, 0.12]} m={mat.green()} />
        <Box p={[0, 0, -0.062]} s={[0.2, 0.06, 0.005]} m={mat.white()} />
        <Box p={[0, 0, -0.062]} s={[0.06, 0.2, 0.005]} m={mat.white()} />
      </Interactive>
      {/* fire extinguisher on its bracket, by the door */}
      <Interactive id="extinguisher" label="Fire extinguisher" labelY={0.8} position={[3.9, 0, HALF_D - 0.16]}>
        <mesh position={[0, 0.5, 0]} scale={[0.08, 0.56, 0.08]} geometry={cyl} material={mat.red()} />
        <mesh position={[0, 0.8, 0]} scale={[0.06, 0.06, 0.06]} geometry={cyl} material={mat.black()} />
        <mesh position={[0, 0.86, 0.02]} rotation={[0.3, 0, 0]} scale={[0.02, 0.1, 0.02]} geometry={cylLow} material={mat.black()} />
        <mesh position={[0.08, 0.55, 0]} scale={[0.012, 0.5, 0.012]} geometry={cylLow} material={mat.black()} />
        <mesh position={[0, 1.25, 0.14]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[0.36, 0.18]} />
          <meshBasicMaterial map={signTexture('fire')} />
        </mesh>
        <BlobShadow r={0.14} />
      </Interactive>
      {/* eye-wash station on the east wall near the sink corner */}
      <Interactive id="eyewash" label="Eye-wash station" labelY={0.4} position={[HALF_W - 0.08, 1.35, 3.6]} rotation={[0, -Math.PI / 2, 0]}>
        <Box p={[0, 0, -0.02]} s={[0.36, 0.5, 0.03]} m={mat.green()} />
        {[-0.08, 0.08].map((x) => (
          <group key={x} position={[x, -0.07, 0.04]}>
            <mesh scale={[0.04, 0.2, 0.04]} geometry={cyl} material={mat.plastic()} />
            <mesh position={[0, 0.13, 0]} scale={[0.018, 0.06, 0.018]} geometry={cyl} material={mat.green()} />
          </group>
        ))}
        <mesh position={[0, 0.3, 0]}>
          <planeGeometry args={[0.36, 0.18]} />
          <meshBasicMaterial map={signTexture('eyeWash')} />
        </mesh>
      </Interactive>
      {/* a waste bin */}
      <group position={[6.4, 0, 3.8]}>
        <mesh position={[0, 0.22, 0]} scale={[0.16, 0.44, 0.16]} geometry={cyl} material={mat.darkMetal()} />
        <BlobShadow r={0.22} />
      </group>
    </group>
  );
}

/** Everything static in the room. */
export function Room() {
  return (
    <group>
      <Shell />
      <CeilingFittings />
      <Benches />
      <FrontWall />
      <ReagentShelf />
      <CupboardBody />
      <FumeCupboard />
    </group>
  );
}
