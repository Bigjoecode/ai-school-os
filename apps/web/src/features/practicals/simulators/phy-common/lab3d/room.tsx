import { useMemo } from 'react';
import { BoxGeometry, CylinderGeometry, MeshStandardMaterial, SphereGeometry, type Material, type Texture } from 'three';
import { BlobShadow } from '../../../lab3d-kit/apparatus';
import { Interactive } from '../../../lab3d-kit/interact';
import { BENCH, BENCHES, CUPBOARD, FUME, HALF_D, HALF_W, MY_BENCH, SHELF } from '../../../lab3d-kit/layout';
import { mat } from '../../../lab3d-kit/materials';
import type { RoomConfig } from '../../../lab3d-kit/room';
import type { PosterSpec } from '../../../lab3d-kit/textures';
import { canvasTex, electricalPosterTexture, FONT, noticeBoardTexture, ohmPosterTexture, pendulumPosterTexture, phySignTexture, refractionPosterTexture, siPosterTexture } from './tex';

/**
 * The physics laboratory, on the kit's room: the same shell, benches and
 * apparatus cupboard, but benches with low-voltage power points instead of
 * sinks, a physics equipment shelf, a Van de Graaff generator where the fume
 * cupboard would be, the SI-units poster, light and electrical-safety
 * posters, the department notice board and the fire point (CO₂ extinguisher
 * and fire blanket) — all procedural.
 */

type V3 = [number, number, number];
const box = new BoxGeometry(1, 1, 1);
const cyl = new CylinderGeometry(1, 1, 1, 18);
const sphere = new SphereGeometry(1, 24, 16);
const socketFace = new MeshStandardMaterial({ color: '#f5f5f0', roughness: 0.4 });
const orange = new MeshStandardMaterial({ color: '#d9661f', roughness: 0.5 });
const blue = new MeshStandardMaterial({ color: '#2556a8', roughness: 0.5 });
const grey = new MeshStandardMaterial({ color: '#7d8790', roughness: 0.5 });

function B({ p, s, m, r }: { p: V3; s: V3; m: Material; r?: V3 }) {
  return <mesh geometry={box} material={m} position={p} scale={s} rotation={r} />;
}

const socketTexture = () =>
  canvasTex('phy-socket', 256, 96, (g, w, h) => {
    g.fillStyle = '#f4f4ef';
    g.fillRect(0, 0, w, h);
    for (const cx of [64, 192]) {
      g.fillStyle = '#e4e4de';
      g.fillRect(cx - 50, 10, 100, 76);
      g.fillStyle = '#26292c';
      g.fillRect(cx - 6, 22, 12, 22);
      g.fillRect(cx - 28, 54, 12, 18);
      g.fillRect(cx + 16, 54, 12, 18);
      g.fillStyle = '#c62828';
      g.fillRect(cx + 30, 18, 12, 8);
    }
    g.fillStyle = '#5b6672';
    g.font = `600 12px ${FONT}`;
    g.fillText('12 V a.c./d.c.', 8, h - 4);
  });

/** A low-voltage power point at the back of a bench (bench-top centre x, z). */
function PowerPoint({ x, z }: { x: number; z: number }) {
  const tex = useMemo(socketTexture, []);
  return (
    <group position={[x, BENCH.h, z - BENCH.d / 2 + 0.06]}>
      <B p={[0, 0.045, 0]} s={[0.34, 0.09, 0.07]} m={socketFace} />
      <mesh position={[0, 0.045, 0.0352]}>
        <planeGeometry args={[0.32, 0.08]} />
        <meshStandardMaterial map={tex} roughness={0.4} />
      </mesh>
      {/* conduit down the back of the bench */}
      <B p={[0.12, -0.42, -0.02]} s={[0.03, 0.84, 0.03]} m={grey} />
    </group>
  );
}

/** A power pack and a meter box or two on the other benches (the student's own bench is kept clear). */
function BenchClutter({ x, z, k }: { x: number; z: number; k: number }) {
  return (
    <group position={[x, BENCH.h, z]}>
      <group position={[0.55, 0, -0.18]} rotation={[0, (k % 3) * 0.2 - 0.2, 0]}>
        <B p={[0, 0.06, 0]} s={[0.24, 0.12, 0.16]} m={k % 2 ? orange : blue} />
        <B p={[0, 0.07, 0.081]} s={[0.18, 0.06, 0.004]} m={mat.black()} />
        <BlobShadow r={0.18} />
      </group>
      <group position={[-0.5, 0, -0.1]} rotation={[0, 0.3 - (k % 2) * 0.5, 0]}>
        <B p={[0, 0.05, 0]} s={[0.14, 0.1, 0.1]} m={mat.black()} />
        <mesh position={[0, 0.06, 0.051]}>
          <circleGeometry args={[0.04, 20]} />
          <meshStandardMaterial color="#f6f6ef" />
        </mesh>
        <BlobShadow r={0.11} />
      </group>
      {k % 2 === 0 && (
        <group position={[-0.05, 0, -0.25]}>
          <mesh geometry={cyl} material={mat.darkMetal()} position={[0, 0.006, 0]} scale={[0.08, 0.012, 0.08]} />
          <mesh geometry={cyl} material={mat.steel()} position={[0, 0.3, 0]} scale={[0.006, 0.6, 0.006]} />
        </group>
      )}
    </group>
  );
}

/** The physics equipment shelf (in the reagent shelf's place on the east wall). */
function EquipmentShelf() {
  const rows = [0.55, 1.05, 1.55];
  return (
    <Interactive id="shelf" label="Physics equipment shelf" labelY={2.05} position={[SHELF.x, 0, SHELF.z]} rotation={[0, -Math.PI / 2, 0]}>
      <B p={[0, SHELF.h / 2, -SHELF.d / 2 + 0.01]} s={[SHELF.w, SHELF.h, 0.02]} m={mat.woodDark()} />
      {[-1, 1].map((s) => (
        <B key={s} p={[(s * SHELF.w) / 2, SHELF.h / 2, 0]} s={[0.03, SHELF.h, SHELF.d]} m={mat.woodDark()} />
      ))}
      <B p={[0, 0.25, 0]} s={[SHELF.w, 0.5, SHELF.d]} m={mat.cabinet()} />
      {rows.map((y) => (
        <B key={y} p={[0, y - 0.015, 0]} s={[SHELF.w, 0.03, SHELF.d]} m={mat.wood()} />
      ))}
      <B p={[0, SHELF.h, 0]} s={[SHELF.w + 0.04, 0.03, SHELF.d + 0.02]} m={mat.woodDark()} />
      {/* meters, power packs, magnets, lenses, springs and masses */}
      {[-0.8, -0.45, -0.1].map((x, i) => (
        <group key={x} position={[x, rows[0]!, 0]}>
          <B p={[0, 0.07, 0]} s={[0.22, 0.14, 0.18]} m={i === 1 ? blue : orange} />
          <B p={[0, 0.08, 0.091]} s={[0.16, 0.06, 0.004]} m={mat.black()} />
        </group>
      ))}
      {[0.3, 0.55, 0.8].map((x) => (
        <group key={x} position={[x, rows[0]!, 0.02]}>
          <B p={[0, 0.06, 0]} s={[0.14, 0.12, 0.09]} m={mat.black()} />
          <mesh position={[0, 0.07, 0.046]}>
            <circleGeometry args={[0.04, 20]} />
            <meshStandardMaterial color="#f6f6ef" />
          </mesh>
        </group>
      ))}
      {[-0.85, -0.6, -0.35, -0.1].map((x) => (
        <group key={x} position={[x, rows[1]!, 0]}>
          <mesh geometry={cyl} material={mat.darkMetal()} position={[0, 0.005, 0]} scale={[0.035, 0.01, 0.035]} />
          <mesh geometry={cyl} material={mat.metal()} position={[0, 0.07, 0]} scale={[0.004, 0.13, 0.004]} />
          <mesh geometry={cyl} material={mat.glass()} position={[0, 0.16, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[0.04, 0.006, 0.04]} />
        </group>
      ))}
      {[0.25, 0.45, 0.65, 0.85].map((x, i) => (
        <group key={x} position={[x, rows[1]!, 0]}>
          <mesh geometry={cyl} material={i % 2 ? mat.metal() : mat.steel()} position={[0, 0.03 + i * 0.006, 0]} scale={[0.03 + i * 0.004, 0.06 + i * 0.012, 0.03 + i * 0.004]} />
        </group>
      ))}
      {[-0.7, -0.2, 0.3, 0.75].map((x, i) => (
        <group key={x} position={[x, rows[2]!, 0]}>
          <B p={[0, 0.06, 0]} s={[0.3, 0.12, 0.2]} m={i % 2 ? mat.cabinet() : mat.wood()} />
          <mesh position={[0, 0.07, 0.101]}>
            <planeGeometry args={[0.22, 0.06]} />
            <meshBasicMaterial map={labelTex(['Magnets', 'Springs', 'Lenses', 'Masses'][i]!)} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 2.3, -SHELF.d / 2 + 0.03]}>
        <planeGeometry args={[0.7, 0.35]} />
        <meshBasicMaterial map={phySignTexture('physics')} />
      </mesh>
    </Interactive>
  );
}
const labelTex = (text: string) =>
  canvasTex(`phy-box-label-${text}`, 256, 64, (g, w, h) => {
    g.fillStyle = '#fffdf3';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#16202a';
    g.font = `700 30px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });

/** A Van de Graaff generator on its cabinet, in the fume cupboard's corner. */
function VanDeGraaff() {
  return (
    <Interactive id="vdg" label="Van de Graaff generator (teacher only)" labelY={2.25} position={[FUME.x, 0, FUME.z]}>
      <B p={[0, 0.45, 0]} s={[FUME.w, 0.9, FUME.d]} m={mat.cabinet()} />
      <B p={[0, 0.91, 0]} s={[FUME.w, 0.03, FUME.d]} m={mat.benchTop()} />
      <group position={[-0.25, 0.925, 0]}>
        <B p={[0, 0.05, 0]} s={[0.3, 0.1, 0.24]} m={mat.darkMetal()} />
        <mesh geometry={cyl} material={mat.plastic()} position={[0, 0.42, 0]} scale={[0.045, 0.66, 0.045]} />
        <mesh geometry={sphere} material={mat.steel()} position={[0, 0.85, 0]} scale={0.16} />
      </group>
      <group position={[0.4, 0.925, 0.05]}>
        <mesh geometry={cyl} material={mat.plastic()} position={[0, 0.2, 0]} scale={[0.012, 0.4, 0.012]} />
        <mesh geometry={sphere} material={mat.steel()} position={[0, 0.42, 0]} scale={0.06} />
        <mesh geometry={cyl} material={mat.darkMetal()} position={[0, 0.005, 0]} scale={[0.07, 0.01, 0.07]} />
      </group>
      <BlobShadow r={1.1} opacity={0.5} />
    </Interactive>
  );
}

/** The fire point by the front-left corner: a CO₂ extinguisher (for electrical fires) and a fire blanket. */
function FirePoint() {
  return (
    <group>
      <Interactive id="co2" label="CO₂ fire extinguisher" labelY={0.95} position={[-6.35, 0, -HALF_D + 0.22]}>
        <mesh geometry={cyl} material={mat.red()} position={[0, 0.42, 0]} scale={[0.075, 0.7, 0.075]} />
        <B p={[0, 0.57, 0.0]} s={[0.16, 0.06, 0.155]} m={mat.black()} />
        <mesh geometry={cyl} material={mat.black()} position={[0, 0.83, 0]} scale={[0.03, 0.08, 0.03]} />
        <mesh geometry={cyl} material={mat.black()} position={[0.09, 0.6, 0.02]} rotation={[0, 0, 0.5]} scale={[0.03, 0.16, 0.03]} />
        <mesh position={[0, 1.25, -0.2]}>
          <planeGeometry args={[0.4, 0.2]} />
          <meshBasicMaterial map={phySignTexture('co2')} />
        </mesh>
        <BlobShadow r={0.14} />
      </Interactive>
      <Interactive id="blanket" label="Fire blanket" labelY={0.32} position={[-5.7, 1.45, -HALF_D + 0.05]}>
        <B p={[0, 0, 0]} s={[0.3, 0.34, 0.07]} m={mat.red()} />
        <B p={[-0.06, -0.2, 0.03]} s={[0.025, 0.09, 0.01]} m={mat.black()} />
        <B p={[0.06, -0.2, 0.03]} s={[0.025, 0.09, 0.01]} m={mat.black()} />
        <mesh position={[0, 0.3, 0.0]}>
          <planeGeometry args={[0.4, 0.2]} />
          <meshBasicMaterial map={phySignTexture('blanket')} />
        </mesh>
      </Interactive>
    </group>
  );
}

const NOTICES = [
  { title: 'SS3 practical timetable', lines: ['Mon: mechanics', 'Wed: light', 'Fri: electricity'], colour: '#fff7c2' },
  { title: 'Lab rules', lines: ['No running.', 'Bags under the bench.', 'Report breakages at once.'], colour: '#ffffff' },
  { title: 'WAEC tips', lines: ['Units in every column head.', 'Large triangle for the slope.'], colour: '#d9f2ff' },
  { title: 'Physics club', lines: ['Thursday 3 pm', 'Build a solar oven!'], colour: '#ffe1e1' },
  { title: 'Electrical safety', lines: ['Low voltage only on benches.', 'Ask before you plug in.'], colour: '#fff2d1' },
  { title: 'Lost & found', lines: ['Blue calculator', 'Metre rule (bench 4)'], colour: '#e7ffe0' },
];

/** The lab's own room pieces (passed to the kit's Room as `extras`). */
export function PhysicsExtras({ topic }: { topic: Topic }) {
  const notice = useMemo(() => noticeBoardTexture(NOTICES), []);
  const topical = useMemo<Texture[]>(() => (topic === 'pendulum' ? [pendulumPosterTexture(), ohmPosterTexture()] : topic === 'ohm' ? [ohmPosterTexture(), pendulumPosterTexture()] : [refractionPosterTexture(), pendulumPosterTexture()]), [topic]);
  return (
    <group>
      {BENCHES.map(([x, z], k) => (
        <group key={`${x}${z}`}>
          <PowerPoint x={x} z={z} />
          {(x !== MY_BENCH[0] || z !== MY_BENCH[1]) && <BenchClutter x={x} z={z} k={k} />}
        </group>
      ))}
      {/* SI units where the periodic table hangs in the chemistry lab */}
      <Interactive id="poster-si" label="Poster: SI base units" labelY={0.6} position={[-4.2, 1.75, -HALF_D + 0.012]}>
        <mesh>
          <planeGeometry args={[2.0, 1.0]} />
          <meshStandardMaterial map={siPosterTexture()} roughness={0.6} />
        </mesh>
      </Interactive>
      {/* light and electrical safety on the west wall, between the windows */}
      <Interactive id="poster-light" label="Poster: refraction of light" labelY={0.5} position={[-HALF_W + 0.012, 1.7, -1.5]} rotation={[0, Math.PI / 2, 0]}>
        <mesh>
          <planeGeometry args={[0.6, 0.8]} />
          <meshStandardMaterial map={refractionPosterTexture()} roughness={0.6} />
        </mesh>
      </Interactive>
      <Interactive id="poster-electric" label="Poster: electrical safety" labelY={0.5} position={[-HALF_W + 0.012, 1.7, 1.5]} rotation={[0, Math.PI / 2, 0]}>
        <mesh>
          <planeGeometry args={[0.6, 0.8]} />
          <meshStandardMaterial map={electricalPosterTexture()} roughness={0.6} />
        </mesh>
      </Interactive>
      {/* the department notice board on the back wall */}
      <Interactive id="notice" label="Notice board" labelY={0.75} position={[-2.6, 1.6, HALF_D - 0.03]} rotation={[0, Math.PI, 0]}>
        <B p={[0, 0, 0.012]} s={[2.1, 1.32, 0.03]} m={mat.woodDark()} />
        <mesh position={[0, 0, -0.006]}>
          <planeGeometry args={[2.0, 1.25]} />
          <meshStandardMaterial map={notice} roughness={0.9} />
        </mesh>
      </Interactive>
      {/* the low-voltage sign over the student's bench end */}
      <mesh position={[MY_BENCH[0] - 1.6, 2.35, -HALF_D + 0.012]}>
        <planeGeometry args={[0.4, 0.2]} />
        <meshBasicMaterial map={phySignTexture('sockets')} />
      </mesh>
      {/* the topic posters over the apparatus cupboard */}
      {topical.map((t, i) => (
        <mesh key={i} position={[HALF_W - 0.012, 2.5, CUPBOARD.z + (i ? 0.45 : -0.45)]} rotation={[0, -Math.PI / 2, 0]}>
          <planeGeometry args={[0.54, 0.72]} />
          <meshStandardMaterial map={t} roughness={0.6} />
        </mesh>
      ))}
      <EquipmentShelf />
      <VanDeGraaff />
      <FirePoint />
    </group>
  );
}

type Topic = 'pendulum' | 'ohm' | 'light';
/** The physics room for a practical: its whiteboard, the poster beside it and the topic posters. */
export function physicsRoom(topic: Topic, whiteboard: string[], note: string, frontPoster: PosterSpec): RoomConfig {
  return {
    whiteboard,
    whiteboardNote: note,
    frontPoster,
    sinks: false,
    benchRacks: false,
    reagentShelf: false,
    fumeCupboard: false,
    periodicTable: false,
    fans: true,
    doorPoster: { title: 'Lab safety', band: '#0f3d8c', lines: ['Bags under the bench, aisles clear.', 'Low-voltage supplies only.', 'Sharp pins back in the box.', 'Report every breakage.'] },
    extras: <PhysicsExtras topic={topic} />,
  };
}
