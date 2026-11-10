import { SHEET_H, SHEET_W, type GeoMapsState, type GeoVariant } from '@aischool/shared';
import { useEffect, useMemo, type ReactNode } from 'react';
import { CanvasTexture, DoubleSide, SRGBColorSpace } from 'three';
import { Interactive } from '../../../lab3d-kit/interact';
import { BENCH, CUPBOARD, STATION } from '../../../lab3d-kit/layout';
import { mat } from '../../../lab3d-kit/materials';
import { CUPBOARD_SHELVES } from '../../../lab3d-kit/room';
import { KitScene } from '../../../lab3d-kit/scene';
import { protractorTexture, ruleTexture, canvasTex, phyBookTexture, phyTaskCardTexture } from '../../phy-common/lab3d/tex';
import { drawSheetCanvas, flipY } from '../base-map';
import { isMapTask } from '../actions';
import { GEO_APPARATUS, GEO_APPARATUS_LABEL, GEO_VIEWS, GSPOT, geoRoom, neededFor, worldOf, type GeoApparatusId, type GeoScene } from './bench';

/** The geography room: the student's bench with the printed sheet on it, and the instruments, all procedural. */

type V3 = [number, number, number];
const at = (s: readonly [number, number, number], dy = 0): V3 => [s[0], s[1] + dy, s[2]];
const MAP_W = 0.8;
const MAP_D = (MAP_W * SHEET_H) / SHEET_W;

/** The sheet as a texture, with the student's pencil work drawn on it. */
function useSheetTexture(v: GeoVariant, state: GeoMapsState) {
  const work = `${state.rulers.length}|${state.runs.map((r) => r.pts.length).join()}|${state.pins.length}|${state.protractors.length}|${Object.keys(state.squares).length}|${state.ticks.length}`;
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    const px = 51.2;
    c.width = 1024;
    c.height = Math.round(SHEET_H * px);
    const g = c.getContext('2d')!;
    drawSheetCanvas(g, v, px);
    if (!v.sheet) {
      g.strokeStyle = '#cfe3cf';
      for (let i = 0; i < 40; i++) {
        g.beginPath();
        g.moveTo(i * 26, 0);
        g.lineTo(i * 26, c.height);
        g.moveTo(0, i * 26);
        g.lineTo(c.width, i * 26);
        g.stroke();
      }
      g.fillStyle = '#333';
      g.font = '600 34px system-ui, sans-serif';
      g.fillText(v.def.title, 40, 60);
    }
    const X = (x: number) => x * px;
    const Y = (y: number) => flipY(y) * px;
    g.strokeStyle = '#37474f';
    g.lineWidth = 2;
    for (const r of state.rulers) {
      g.beginPath();
      g.moveTo(X(r.a[0]), Y(r.a[1]));
      g.lineTo(X(r.b[0]), Y(r.b[1]));
      g.stroke();
    }
    for (const q of state.protractors) {
      g.beginPath();
      g.moveTo(X(q.c[0]), Y(q.c[1]));
      g.lineTo(X(q.t[0]), Y(q.t[1]));
      g.stroke();
    }
    g.strokeStyle = '#d81b60';
    g.lineWidth = 3;
    for (const r of state.runs) {
      g.beginPath();
      r.pts.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1]))));
      g.stroke();
    }
    g.fillStyle = '#c62828';
    for (const p of state.pins) {
      if (v.sheet) {
        g.beginPath();
        g.arc(X(p.p[0]), Y(p.p[1]), 5, 0, 7);
        g.fill();
      }
    }
    for (const [id, p] of Object.entries(v.marks)) {
      g.fillStyle = '#b71c1c';
      g.font = '700 22px system-ui, sans-serif';
      g.fillText(id, X(p[0]) + 6, Y(p[1]) - 6);
    }
    for (const r of v.rects) {
      g.strokeStyle = '#d32f2f';
      g.setLineDash([12, 8]);
      g.lineWidth = 3;
      g.strokeRect(X(r.x), Y(r.y + r.h), r.w * px, r.h * px);
      g.setLineDash([]);
    }
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 8;
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, work]);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

function Stick({ p, s, r, m }: { p: V3; s: V3; r?: V3; m: unknown }) {
  return (
    <mesh position={p} rotation={r} material={m as never}>
      <boxGeometry args={s} />
    </mesh>
  );
}
function RulerModel() {
  const tex = useMemo(() => ruleTexture(30, false), []);
  return (
    <group>
      <mesh position={[0, 0.004, 0]} material={mat.plastic()}>
        <boxGeometry args={[0.32, 0.006, 0.04]} />
      </mesh>
      <mesh position={[0, 0.0075, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.31, 0.036]} />
        <meshStandardMaterial map={tex} roughness={0.5} />
      </mesh>
    </group>
  );
}
function ProtractorModel() {
  const tex = useMemo(() => protractorTexture(false), []);
  return (
    <mesh position={[0, 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[0.09, 40]} />
      <meshStandardMaterial map={tex} transparent opacity={0.92} roughness={0.3} side={DoubleSide} />
    </mesh>
  );
}
function ReelModel() {
  return (
    <group>
      <mesh position={[0, 0.03, 0]} material={mat.red()}>
        <cylinderGeometry args={[0.02, 0.02, 0.05, 18]} />
      </mesh>
      {[0.004, 0.056].map((y) => (
        <mesh key={y} position={[0, y, 0]} material={mat.wood()}>
          <cylinderGeometry args={[0.027, 0.027, 0.006, 18]} />
        </mesh>
      ))}
    </group>
  );
}
function DividersModel() {
  return (
    <group rotation={[0, 0.5, 0]}>
      <Stick p={[-0.018, 0.006, 0]} s={[0.006, 0.006, 0.12]} r={[0, 0.16, 0]} m={mat.steel()} />
      <Stick p={[0.018, 0.006, 0]} s={[0.006, 0.006, 0.12]} r={[0, -0.16, 0]} m={mat.steel()} />
      <mesh position={[0, 0.008, -0.058]} material={mat.darkMetal()}>
        <cylinderGeometry args={[0.009, 0.009, 0.01, 14]} />
      </mesh>
    </group>
  );
}
function CalculatorModel() {
  return (
    <group>
      <Stick p={[0, 0.007, 0]} s={[0.075, 0.012, 0.14]} m={mat.darkMetal()} />
      <mesh position={[0, 0.0135, -0.042]} material={mat.light()}>
        <boxGeometry args={[0.06, 0.002, 0.03]} />
      </mesh>
    </group>
  );
}
function PencilModel({ colour }: { colour?: boolean }) {
  return (
    <group rotation={[0, 0.3, Math.PI / 2]}>
      <mesh position={[0.006, 0, 0]} material={colour ? mat.green() : mat.black()}>
        <cylinderGeometry args={[0.004, 0.004, 0.17, 8]} />
      </mesh>
    </group>
  );
}
function PotModel() {
  return (
    <group>
      <mesh position={[0, 0.045, 0]} material={mat.cork()}>
        <cylinderGeometry args={[0.035, 0.03, 0.09, 16]} />
      </mesh>
      {[mat.red(), mat.green(), mat.plastic(), mat.black()].map((m, i) => (
        <mesh key={i} position={[Math.cos(i * 1.6) * 0.016, 0.105, Math.sin(i * 1.6) * 0.016]} rotation={[0.08 * Math.sin(i), 0, 0.08 * Math.cos(i)]} material={m}>
          <cylinderGeometry args={[0.004, 0.004, 0.13, 8]} />
        </mesh>
      ))}
    </group>
  );
}
function GlobeModel() {
  const tex = useMemo(
    () =>
      canvasTex('geo-globe', 512, 256, (g, w, h) => {
        g.fillStyle = '#7ab6dd';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#b9c98a';
        const blob = (x: number, y: number, rx: number, ry: number) => {
          g.beginPath();
          g.ellipse(x, y, rx, ry, 0.2, 0, 7);
          g.fill();
        };
        blob(270, 130, 30, 48);
        blob(275, 85, 44, 16);
        blob(370, 80, 70, 30);
        blob(110, 75, 50, 32);
        blob(150, 165, 22, 42);
        blob(430, 170, 22, 14);
        g.strokeStyle = 'rgba(255,255,255,.5)';
        for (let i = 0; i < 12; i++) {
          g.beginPath();
          g.moveTo((i * w) / 12, 0);
          g.lineTo((i * w) / 12, h);
          g.stroke();
        }
        g.strokeStyle = '#c62828';
        g.beginPath();
        g.moveTo(0, h / 2);
        g.lineTo(w, h / 2);
        g.stroke();
      }),
    [],
  );
  return (
    <group>
      <mesh position={[0, 0.008, 0]} material={mat.darkMetal()}>
        <cylinderGeometry args={[0.05, 0.06, 0.016, 20]} />
      </mesh>
      <mesh position={[0, 0.03, 0]} material={mat.darkMetal()}>
        <cylinderGeometry args={[0.006, 0.006, 0.04, 8]} />
      </mesh>
      <mesh position={[0, 0.125, 0]} rotation={[0.41, 0, 0]}>
        <sphereGeometry args={[0.095, 28, 20]} />
        <meshStandardMaterial map={tex} roughness={0.5} />
      </mesh>
    </group>
  );
}
function AtlasModel() {
  return <Stick p={[0, 0.012, 0]} s={[0.15, 0.022, 0.2]} m={mat.green()} />;
}
function PinsModel() {
  return (
    <group>
      <mesh position={[0, 0.012, 0]} material={mat.cork()}>
        <cylinderGeometry args={[0.03, 0.03, 0.02, 14]} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[Math.cos(i * 2.1) * 0.015, 0.03, Math.sin(i * 2.1) * 0.015]} material={mat.red()}>
          <sphereGeometry args={[0.006, 8, 8]} />
        </mesh>
      ))}
    </group>
  );
}
function StripModel() {
  return <Stick p={[0, 0.001, 0]} s={[0.26, 0.001, 0.035]} m={mat.white()} />;
}
function RomerModel() {
  return (
    <mesh position={[0, 0.002, 0]} material={mat.glass()}>
      <boxGeometry args={[0.07, 0.002, 0.07]} />
    </mesh>
  );
}

export function ApparatusModel({ id }: { id: GeoApparatusId }) {
  switch (id) {
    case 'ruler':
      return <RulerModel />;
    case 'protractor':
      return <ProtractorModel />;
    case 'thread':
      return <ReelModel />;
    case 'dividers':
    case 'compasses':
      return <DividersModel />;
    case 'calculator':
      return <CalculatorModel />;
    case 'pencil':
      return <PencilModel />;
    case 'colours':
      return <PotModel />;
    case 'globe':
      return <GlobeModel />;
    case 'atlas':
      return <AtlasModel />;
    case 'pins':
      return <PinsModel />;
    case 'strip':
      return <StripModel />;
    default:
      return <RomerModel />;
  }
}

const S0 = CUPBOARD_SHELVES[0]! + 0.01;
const S1 = CUPBOARD_SHELVES[1]!;
const S2 = CUPBOARD_SHELVES[2]!;
const SLOT: Record<GeoApparatusId, V3> = {
  globe: [-0.6, S0, 0.03],
  atlas: [0.3, S0, 0.03],
  calculator: [0.75, S0, 0.04],
  ruler: [-0.6, S1, 0.06],
  protractor: [-0.05, S1, 0.05],
  dividers: [0.3, S1, 0.05],
  compasses: [0.6, S1, 0.05],
  colours: [0.85, S1, 0.05],
  thread: [-0.8, S2, 0.06],
  pins: [-0.5, S2, 0.06],
  romer: [-0.2, S2, 0.06],
  strip: [0.15, S2, 0.06],
  pencil: [0.6, S2, 0.06],
};
function GeoCupboard({ scene }: { scene: GeoScene }) {
  return (
    <group position={[CUPBOARD.x, 0, CUPBOARD.z]}>
      {GEO_APPARATUS.filter((a) => !scene.collected.has(a.id)).map((a) => (
        <Interactive key={a.id} id={`cup:${a.id}`} label={a.label} position={SLOT[a.id]} labelY={0.14} drag={() => 'carry'}>
          <ApparatusModel id={a.id} />
        </Interactive>
      ))}
    </group>
  );
}

function GeoStation({ v, state, scene }: { v: GeoVariant; state: GeoMapsState; scene: GeoScene }) {
  const tex = useSheetTexture(v, state);
  const card = useMemo(() => phyTaskCardTexture(v.def.title, v.def.steps.slice(0, 4).map((s) => s.label.slice(0, 38))), [v]);
  const book = useMemo(() => phyBookTexture('Geography notebook', ['Readings', 'Working', 'Answers']), []);
  const needed = neededFor(v);
  const has = (id: GeoApparatusId) => scene.collected.has(id) || scene.from2d;
  const map = isMapTask(v.task);
  return (
    <group position={STATION}>
      <Interactive id="mybench" label="Your desk" labelY={0.5}>
        <mesh position={[0, 0.005, 0]}>
          <boxGeometry args={[BENCH.w, 0.01, BENCH.d]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>
      <Interactive id="map" label={map ? 'The map sheet' : 'Your graph paper'} bench position={at(GSPOT.map)} labelY={0.1}>
        {(a) => (
          <group>
            <mesh position={[0, 0.0015, 0]} material={mat.white()}>
              <boxGeometry args={[MAP_W + 0.05, 0.002, MAP_D + 0.09]} />
            </mesh>
            <mesh position={[0, 0.0032, -0.02]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[MAP_W, MAP_D]} />
              <meshStandardMaterial map={tex} roughness={0.85} emissive={a ? '#335533' : '#000'} emissiveIntensity={a ? 0.25 : 0} />
            </mesh>
          </group>
        )}
      </Interactive>
      {GEO_APPARATUS.filter((a) => has(a.id) || (needed.includes(a.id) && scene.from2d)).map((a) => (
        <Interactive key={a.id} id={a.id} label={GEO_APPARATUS_LABEL[a.id]} bench position={at(GSPOT[a.id === 'thread' ? 'thread' : a.id])} labelY={0.1}>
          <ApparatusModel id={a.id} />
        </Interactive>
      ))}
      <Interactive id="card" label="Question paper" bench position={at(GSPOT.card)} rotation={[0, 0.35, 0]} labelY={0.2}>
        <mesh position={[0, 0.065, 0.02]} rotation={[-0.32, 0, 0]}>
          <planeGeometry args={[0.2, 0.14]} />
          <meshStandardMaterial map={card} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.065, -0.02]} rotation={[0.32, 0, 0]} material={mat.white()}>
          <planeGeometry args={[0.2, 0.14]} />
        </mesh>
      </Interactive>
      <Interactive id="book" label="Your notebook" bench position={at(GSPOT.book)} rotation={[0, 0.25, 0]} labelY={0.08}>
        <mesh position={[0, 0.006, 0]} material={mat.green()}>
          <boxGeometry args={[0.3, 0.008, 0.2]} />
        </mesh>
        <mesh position={[0, 0.0105, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.29, 0.19]} />
          <meshStandardMaterial map={book} roughness={0.85} />
        </mesh>
      </Interactive>
    </group>
  );
}

export function GeoLabScene({ v, state, scene, guided, onSlow, children }: { v: GeoVariant; state: GeoMapsState; scene: GeoScene; guided: boolean; onSlow: () => void; children?: ReactNode }) {
  const room = useMemo(() => geoRoom(v.task), [v.task]);
  return (
    <KitScene room={room} coatOn={false} gogglesOn={false} presets={GEO_VIEWS} read={worldOf(GSPOT.map, 0.02)} guided={guided} onSlow={onSlow} assistantSpot={[-1.9, 0.2]}>
      <GeoCupboard scene={scene} />
      <GeoStation v={v} state={state} scene={scene} />
      {children}
    </KitScene>
  );
}
