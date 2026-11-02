import { QUAD_HERBS, type BioEcologyVariant, type QuadHerb, type QuadPlaced } from '@aischool/shared';
import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { BackSide, BoxGeometry, CircleGeometry, ConeGeometry, CylinderGeometry, DoubleSide, Object3D, RepeatWrapping, SphereGeometry, type InstancedMesh, type Material } from 'three';
import { Interactive } from '../../../lab3d-kit/interact';
import { BENCH, BENCHES, CUPBOARD, DESK, DOOR, FUME, HALF_D, HALF_W, MY_BENCH, SHELF } from '../../../lab3d-kit/layout';
import { colourMaterial, mat } from '../../../lab3d-kit/materials';
import { customPosterTexture } from '../../../lab3d-kit/textures';
import { bioCanvas, bioSignTexture } from '../../bio-common/lab3d/textures';
import { FIELD, plotWorld } from './bench';

/**
 * The school field, drawn procedurally in place of the indoor room (the kit's
 * `RoomConfig.custom`): the back wall of the biology block with its door, coat
 * hooks and an outside tap; an outdoor classroom of picnic tables (where the
 * room's benches stand, so the kit's floor plan still holds); the teacher's
 * table; the weather station (Stevenson screen, rain gauge, wind vane and
 * anemometer mast); the equipment shed; a low rope fence; and beyond it the
 * pegged 20 m × 20 m study plot with every plant of this attempt, a big shade
 * tree, the pond and a soil pit. Sky dome and sun; no image files.
 */

type V3 = [number, number, number];
const box = new BoxGeometry(1, 1, 1);
const cyl = new CylinderGeometry(1, 1, 1, 14);
const ball = new SphereGeometry(1, 14, 10);
const cone = new ConeGeometry(1, 1, 10);
function Box({ p, s, m, r }: { p: V3; s: V3; m: Material; r?: V3 }) {
  return <mesh geometry={box} material={m} position={p} scale={s} rotation={r} />;
}
function Rod({ p, s, m, r }: { p: V3; s: V3; m: Material; r?: V3 }) {
  return <mesh geometry={cyl} material={m} position={p} scale={s} rotation={r} />;
}
function Ball({ p, s, m }: { p: V3; s: V3; m: Material }) {
  return <mesh geometry={ball} material={m} position={p} scale={s} />;
}

const grassTexture = () => {
  const t = bioCanvas('eco-grass', 256, 256, (g, w, h) => {
    g.fillStyle = '#6f9a45';
    g.fillRect(0, 0, w, h);
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 2600; i++) {
      g.strokeStyle = ['#5d8a37', '#7fab52', '#86b35a', '#4f7b2e'][i % 4]!;
      g.lineWidth = 1;
      const x = rnd() * w;
      const y = rnd() * h;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (rnd() - 0.5) * 4, y - 3 - rnd() * 4);
      g.stroke();
    }
  });
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(24, 24);
  return t;
};
const skyTexture = () =>
  bioCanvas('eco-sky', 16, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#5f9ddb');
    gr.addColorStop(0.45, '#a9cdee');
    gr.addColorStop(0.52, '#e6eef2');
    gr.addColorStop(1, '#cfd8c4');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });

/** A rounded tree: trunk and a canopy of a few balls. */
export function Tree({ p, h = 4, r = 1.6, tone = '#3f7a2f' }: { p: V3; h?: number; r?: number; tone?: string }) {
  const leaf = colourMaterial(tone);
  const leaf2 = colourMaterial('#4d8a36');
  return (
    <group position={p}>
      <Rod p={[0, h * 0.35, 0]} s={[r * 0.12, h * 0.7, r * 0.12]} m={colourMaterial('#6b4f32')} />
      <Ball p={[0, h * 0.78, 0]} s={[r, r * 0.7, r]} m={leaf} />
      <Ball p={[r * 0.55, h * 0.7, r * 0.2]} s={[r * 0.6, r * 0.45, r * 0.6]} m={leaf2} />
      <Ball p={[-r * 0.5, h * 0.72, -r * 0.3]} s={[r * 0.65, r * 0.45, r * 0.6]} m={leaf2} />
    </group>
  );
}
function PicnicTable({ x, z }: { x: number; z: number }) {
  const w = mat.wood();
  return (
    <group position={[x, 0, z]}>
      <Box p={[0, BENCH.h - 0.03, 0]} s={[BENCH.w, 0.05, BENCH.d]} m={w} />
      {[-1, 1].map((s) => (
        <group key={s}>
          <Box p={[s * (BENCH.w / 2 - 0.2), BENCH.h / 2, 0]} s={[0.07, BENCH.h, BENCH.d * 0.85]} m={mat.woodDark()} />
          <Box p={[0, 0.45, s * (BENCH.d / 2 + 0.3)]} s={[BENCH.w, 0.04, 0.3]} m={w} />
          <Box p={[s * (BENCH.w / 2 - 0.2), 0.22, s * (BENCH.d / 2 + 0.3)]} s={[0.06, 0.45, 0.06]} m={mat.woodDark()} />
        </group>
      ))}
    </group>
  );
}

/** Instanced plants of one herb across the plot. */
function HerbField({ v, herb }: { v: BioEcologyVariant; herb: QuadHerb }) {
  const ref = useRef<InstancedMesh>(null);
  const plants = v.quad.plants[herb];
  const geo = useMemo(() => new CircleGeometry(1, herb === 'SIDA' ? 7 : 6), [herb]);
  const m = useMemo(() => colourMaterial(herb === 'TRIDAX' ? '#e9e2a4' : herb === 'SIDA' ? '#2f6b2a' : '#a8553e'), [herb]);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const o = new Object3D();
    plants.forEach((p, i) => {
      const [x, , z] = plotWorld(p.x, p.y);
      o.position.set(x, 0.012 + (herb === 'SIDA' ? 0.006 : 0), z);
      o.rotation.set(-Math.PI / 2, 0, i);
      const s = Math.max(0.035, p.r * 1.1);
      o.scale.set(s, s, s);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [plants, herb]);
  return <instancedMesh ref={ref} args={[geo, m, plants.length]} frustumCulled={false} />;
}

/** A few grasshoppers hopping about the plot (for life; the counts come from the shared model). */
function Hoppers() {
  const ref = useRef<InstancedMesh>(null);
  const n = 26;
  const seeds = useMemo(() => Array.from({ length: n }, (_, i) => ({ x: ((i * 7.31) % 19) + 0.5, y: ((i * 3.77) % 19) + 0.5, ph: i * 1.7 })), []);
  const geo = useMemo(() => new BoxGeometry(0.07, 0.025, 0.025), []);
  const m = useMemo(() => colourMaterial('#7fa23a'), []);
  const o = useMemo(() => new Object3D(), []);
  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = clock.elapsedTime;
    seeds.forEach((s, i) => {
      const k = Math.floor((t + s.ph) / 2.4);
      const f = ((t + s.ph) % 2.4) / 2.4;
      const jump = f < 0.18 ? Math.sin((f / 0.18) * Math.PI) * 0.22 : 0;
      const dx = Math.sin(k * 1.3 + i) * 0.4 * (f < 0.18 ? f / 0.18 : 1);
      const [x, , z] = plotWorld(Math.min(19.8, Math.max(0.2, s.x + Math.sin(k * 0.7 + i) * 1.5 + dx)), Math.min(19.8, Math.max(0.2, s.y + Math.cos(k * 0.9 + i) * 1.5)));
      o.position.set(x, 0.03 + jump, z);
      o.rotation.set(0, k + i, 0);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geo, m, n]} frustumCulled={false} />;
}

/** The pegged plot: tapes along two edges, corner pegs, the quadrats placed so far (white frames), a highlighted one. */
export function StudyPlot({ v, quads, pegged, focus, hoppers }: { v: BioEcologyVariant; quads: QuadPlaced[]; pegged: boolean; focus: number | null; hoppers: boolean }) {
  const [x0, , z0] = plotWorld(0, 0);
  const tape = colourMaterial('#f5d33a');
  return (
    <group>
      <Interactive id="plot" label="The study plot (20 m × 20 m)" labelY={0.6} position={plotWorld(10, 10)}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
          <planeGeometry args={[20, 20]} />
          <meshStandardMaterial color="#72a046" roughness={1} />
        </mesh>
      </Interactive>
      {QUAD_HERBS.map((h) => (
        <HerbField key={h} v={v} herb={h} />
      ))}
      {hoppers && <Hoppers />}
      {pegged && (
        <group>
          <Box p={[x0 + 10, 0.02, z0]} s={[20, 0.01, 0.06]} m={tape} />
          <Box p={[x0, 0.02, z0 - 10]} s={[0.06, 0.01, 20]} m={tape} />
          {[
            [0, 0],
            [20, 0],
            [0, 20],
            [20, 20],
          ].map(([a, b]) => (
            <Rod key={`${a}${b}`} p={[x0 + a!, 0.2, z0 - b!]} s={[0.03, 0.4, 0.03]} m={colourMaterial('#7a4a1f')} />
          ))}
        </group>
      )}
      {quads.map((q, i) => {
        const [x, , z] = plotWorld(q.x + 0.5, q.y + 0.5);
        const c = i === focus ? '#ffffff' : q.how === 'CHOSEN' ? '#ff7043' : '#f2ead0';
        return (
          <Interactive key={i} id={`quad:${i}`} label={`Quadrat ${i + 1} at (${q.x}, ${q.y})`} labelY={0.3} position={[x, 0.03, z]}>
            {(a) => (
              <group>
                {[
                  [0, -0.5, 1, 0.04],
                  [0, 0.5, 1, 0.04],
                  [-0.5, 0, 0.04, 1],
                  [0.5, 0, 0.04, 1],
                ].map(([px, pz, sx, sz], k) => (
                  <Box key={k} p={[px!, 0.01, pz!]} s={[sx!, 0.025, sz!]} m={a ? mat.highlight() : colourMaterial(c)} />
                ))}
              </group>
            )}
          </Interactive>
        );
      })}
    </group>
  );
}

function WeatherStation() {
  const white = mat.white();
  return (
    <group position={[FUME.x, 0, FUME.z]}>
      <Interactive id="screen" label="Stevenson screen (Six’s thermometer inside)" labelY={1.7} position={[0, 0, 0]}>
        {(a) => (
          <group>
            {[-0.3, 0.3].map((x) => [-0.2, 0.2].map((z) => <Box key={`${x}${z}`} p={[x, 0.55, z]} s={[0.05, 1.1, 0.05]} m={white} />))}
            <Box p={[0, 1.3, 0]} s={[0.75, 0.5, 0.5]} m={a ? mat.highlight() : white} />
            {Array.from({ length: 6 }, (_, k) => (
              <Box key={k} p={[0, 1.1 + k * 0.08, 0.255]} s={[0.7, 0.012, 0.02]} m={mat.louvre()} r={[0.5, 0, 0]} />
            ))}
            <Box p={[0, 1.58, 0]} s={[0.85, 0.05, 0.6]} m={white} />
          </group>
        )}
      </Interactive>
      <Interactive id="raingauge" label="Rain gauge" labelY={0.5} position={[-0.75, 0, 0.15]}>
        {(a) => (
          <group>
            <Rod p={[0, 0.2, 0]} s={[0.07, 0.4, 0.07]} m={a ? mat.highlight() : mat.steel()} />
            <mesh position={[0, 0.45, 0]} geometry={cone} material={mat.steel()} scale={[0.1, 0.1, 0.1]} rotation={[Math.PI, 0, 0]} />
          </group>
        )}
      </Interactive>
      <Interactive id="vane" label="Wind vane and anemometer" labelY={2.6} position={[0.7, 0, -0.1]}>
        {(a) => (
          <group>
            <Rod p={[0, 1.2, 0]} s={[0.025, 2.4, 0.025]} m={a ? mat.highlight() : mat.steel()} />
            <Box p={[0, 2.35, 0]} s={[0.5, 0.02, 0.02]} m={mat.darkMetal()} />
            <mesh position={[0.27, 2.35, 0]} rotation={[0, 0, -Math.PI / 2]} geometry={cone} material={colourMaterial('#c62828')} scale={[0.04, 0.08, 0.04]} />
            <Box p={[-0.24, 2.35, 0]} s={[0.02, 0.12, 0.1]} m={mat.darkMetal()} />
            {[0, 2.09, 4.19].map((r) => (
              <group key={r} rotation={[0, r, 0]} position={[0, 2.1, 0]}>
                <Box p={[0.12, 0, 0]} s={[0.24, 0.01, 0.01]} m={mat.darkMetal()} />
                <Ball p={[0.24, 0, 0]} s={[0.035, 0.035, 0.035]} m={colourMaterial('#eceff1')} />
              </group>
            ))}
          </group>
        )}
      </Interactive>
    </group>
  );
}

function Shed() {
  const w = colourMaterial('#8d6e4f');
  return (
    <group position={[CUPBOARD.x, 0, CUPBOARD.z]} rotation={[0, -Math.PI / 2, 0]}>
      <Box p={[0, 1.0, -0.22]} s={[CUPBOARD.w + 0.1, 2.0, 0.04]} m={w} />
      {[-1, 1].map((s) => (
        <Box key={s} p={[s * (CUPBOARD.w / 2 + 0.03), 1.0, 0]} s={[0.05, 2.0, 0.5]} m={w} />
      ))}
      <Box p={[0, 2.03, 0.02]} s={[CUPBOARD.w + 0.3, 0.06, 0.72]} m={colourMaterial('#5a6b4f')} />
      {[0.6, 1.03, 1.48].map((y) => (
        <Box key={y} p={[0, y, 0]} s={[CUPBOARD.w, 0.03, 0.45]} m={mat.wood()} />
      ))}
      <mesh position={[0, 2.25, 0.05]}>
        <planeGeometry args={[1.0, 0.24]} />
        <meshStandardMaterial map={bioSignTexture('FIELD EQUIPMENT', '#2e7d32')} />
      </mesh>
    </group>
  );
}

function Building() {
  const wall = colourMaterial('#e8dcc2');
  const poster = useMemo(() => customPosterTexture({ title: 'Field-work rules', band: '#2e7d32', lines: ['Covered shoes; hat and water.', 'Keep back from the pond.', 'Never throw a quadrat at anyone.', 'Wash your hands after soil.'] }), []);
  return (
    <group>
      <Box p={[0, 1.8, HALF_D + 0.15]} s={[40, 3.6, 0.3]} m={wall} />
      <Box p={[0, 3.75, HALF_D - 0.5]} s={[40, 0.08, 1.6]} m={colourMaterial('#8a8f94')} />
      <Box p={[DOOR.x, 1.05, HALF_D - 0.005]} s={[DOOR.w, 2.1, 0.04]} m={mat.woodDark()} />
      {[-5.5, -2.5, 0.5].map((x) => (
        <Box key={x} p={[x, 1.7, HALF_D - 0.005]} s={[1.6, 1.0, 0.03]} m={mat.pane()} />
      ))}
      <mesh position={[1.6, 1.55, HALF_D - 0.01]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[0.7, 0.95]} />
        <meshStandardMaterial map={poster} />
      </mesh>
      <Interactive id="handwash" label="Outside tap and soap (wash your hands)" labelY={1.2} position={[-1.2, 0, HALF_D - 0.2]}>
        {(a) => (
          <group>
            <Box p={[0, 0.8, 0]} s={[0.55, 0.12, 0.35]} m={a ? mat.highlight() : mat.white()} />
            <Rod p={[0, 0.45, 0.05]} s={[0.05, 0.75, 0.05]} m={mat.steel()} />
            <Rod p={[0, 1.05, 0.08]} s={[0.015, 0.2, 0.015]} m={mat.steel()} r={[0.9, 0, 0]} />
            <Box p={[0.2, 0.9, 0]} s={[0.08, 0.06, 0.06]} m={colourMaterial('#ffe082')} />
          </group>
        )}
      </Interactive>
      <Interactive id="firstaid" label="First-aid box" labelY={0.25} position={[-3.6, 1.4, HALF_D - 0.05]}>
        <Box p={[0, 0, 0]} s={[0.35, 0.28, 0.1]} m={colourMaterial('#2e7d32')} />
      </Interactive>
    </group>
  );
}

function Pond() {
  return (
    <group position={[FIELD.pond[0], 0, FIELD.pond[2]]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} scale={[4, 3, 1]}>
        <circleGeometry args={[1, 28]} />
        <meshStandardMaterial color="#8a7a55" roughness={1} />
      </mesh>
      <Interactive id="pond" label="The pond (keep back from the edge)" labelY={0.8}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} scale={[3.6, 2.6, 1]}>
          <circleGeometry args={[1, 28]} />
          <meshStandardMaterial color="#4d6f5a" roughness={0.15} metalness={0.1} />
        </mesh>
      </Interactive>
      {Array.from({ length: 10 }, (_, k) => (
        <Rod key={k} p={[Math.cos(k * 0.63) * 3.7, 0.3, Math.sin(k * 0.63) * 2.7]} s={[0.012, 0.6, 0.012]} m={colourMaterial('#6f8f3a')} />
      ))}
      <mesh position={[2.4, 0.5, -2.6]}>
        <planeGeometry args={[0.6, 0.3]} />
        <meshStandardMaterial map={bioSignTexture('DEEP WATER', '#c62828', 'keep back')} side={DoubleSide} />
      </mesh>
    </group>
  );
}

function SoilPit() {
  const layers = ['#3e2c1f', '#6d4c33', '#9a7346', '#b49a72'];
  return (
    <group position={[FIELD.pit[0], 0, FIELD.pit[2]]}>
      <Interactive id="pit" label="Soil pit (the soil profile)" labelY={0.6}>
        <group>
          {layers.map((c, k) => (
            <Box key={k} p={[0, -0.12 - k * 0.24, -0.6]} s={[1.6, 0.24, 0.04]} m={colourMaterial(c)} />
          ))}
          <Box p={[0, -0.95, 0]} s={[1.6, 0.04, 1.2]} m={colourMaterial('#5a4430')} />
        </group>
      </Interactive>
      <mesh position={[1.4, 0.2, 0.4]} scale={[0.6, 0.35, 0.5]} geometry={ball} material={colourMaterial('#6d4c33')} />
      <Rod p={[-1.1, 0.5, 0.4]} s={[0.02, 1.0, 0.02]} m={mat.woodDark()} r={[0, 0, 0.3]} />
    </group>
  );
}

/** Everything static outside, plus the attempt's plot. */
export function FieldScene({ v, quads, pegged, focusQuad, hoppers }: { v: BioEcologyVariant; quads: QuadPlaced[]; pegged: boolean; focusQuad: number | null; hoppers: boolean }) {
  const grass = useMemo(grassTexture, []);
  const sky = useMemo(skyTexture, []);
  const fence = mat.woodDark();
  const rope = colourMaterial('#d8c9a3');
  return (
    <group>
      <directionalLight position={[8, 14, 6]} intensity={1.2} color="#fff6e0" />
      <mesh renderOrder={-1}>
        <sphereGeometry args={[30, 24, 12]} />
        <meshBasicMaterial map={sky} side={BackSide} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -6]}>
        <planeGeometry args={[70, 70]} />
        <meshStandardMaterial map={grass} roughness={1} />
      </mesh>
      <Building />
      {BENCHES.filter(([x, z]) => x !== MY_BENCH[0] || z !== MY_BENCH[1]).map(([x, z]) => (
        <PicnicTable key={`${x}${z}`} x={x} z={z} />
      ))}
      <Interactive id="desk" label="Teacher’s table" labelY={1.0} position={[DESK.x, 0, DESK.z]}>
        <group>
          <Box p={[0, DESK.h, 0]} s={[DESK.w, 0.04, DESK.d]} m={mat.wood()} />
          {[-1, 1].map((a) => [-1, 1].map((b) => <Box key={`${a}${b}`} p={[a * (DESK.w / 2 - 0.06), DESK.h / 2, b * (DESK.d / 2 - 0.06)]} s={[0.04, DESK.h, 0.04]} m={mat.metal()} />))}
        </group>
      </Interactive>
      <WeatherStation />
      <Shed />
      <Box p={[SHELF.x, 0.45, SHELF.z]} s={[SHELF.d, 0.9, SHELF.w]} m={colourMaterial('#4a6b3a')} />
      <mesh position={[SHELF.x - 0.2, 0.75, SHELF.z]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[0.7, 0.2]} />
        <meshStandardMaterial map={bioSignTexture('COMPOST', '#5d4037')} />
      </mesh>
      {/* the rope fence round the outdoor classroom */}
      {Array.from({ length: 15 }, (_, k) => -HALF_W + k).map((x) => (
        <Rod key={`n${x}`} p={[x, 0.4, -HALF_D]} s={[0.03, 0.8, 0.03]} m={fence} />
      ))}
      <Box p={[0, 0.7, -HALF_D]} s={[HALF_W * 2, 0.015, 0.015]} m={rope} />
      {[-HALF_W, HALF_W].map((x) => (
        <group key={x}>
          {Array.from({ length: 10 }, (_, k) => -HALF_D + k).map((z) => (
            <Rod key={z} p={[x, 0.4, z]} s={[0.03, 0.8, 0.03]} m={fence} />
          ))}
          <Box p={[x, 0.7, 0]} s={[0.015, 0.015, HALF_D * 2]} m={rope} />
        </group>
      ))}
      <StudyPlot v={v} quads={quads} pegged={pegged} focus={focusQuad} hoppers={hoppers} />
      <Interactive id="tree" label="The shade tree (canopy site)" labelY={5} position={FIELD.tree}>
        <Tree p={[0, 0, 0]} h={5.6} r={3.0} />
      </Interactive>
      <Pond />
      <SoilPit />
      {[
        [-14, -12],
        [-16, -22],
        [14, -14],
        [15, -22],
        [-18, 6],
        [18, 4],
        [0, -27],
        [-8, -26],
        [9, -26],
      ].map(([x, z]) => (
        <Tree key={`${x}${z}`} p={[x!, 0, z!]} h={5 + ((x! * z!) % 3)} r={1.8 + ((x! + z!) % 2) * 0.4} />
      ))}
      <group position={[16, 0, -10]}>
        {[-1.2, 1.2].map((x) => (
          <Rod key={x} p={[0, 1.1, x]} s={[0.05, 2.2, 0.05]} m={mat.white()} />
        ))}
        <Rod p={[0, 2.2, 0]} s={[0.05, 2.4, 0.05]} m={mat.white()} r={[Math.PI / 2, 0, 0]} />
      </group>
    </group>
  );
}
