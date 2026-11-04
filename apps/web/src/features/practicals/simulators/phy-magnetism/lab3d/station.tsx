import {
  DIODE_MA,
  DIODE_V,
  EM_AMMETER,
  FIELD_KEYS,
  FIELD_MAGNET,
  FIELD_PAPER,
  IND_DIVS,
  compassAt,
  diodeReading,
  emCurrent,
  emLift,
  fieldMagnets,
  indDeflection,
  indShown,
  sheetCfg,
  type MagTask,
  type PhyMagnetismState,
  type PhyMagnetismVariant,
} from '@aischool/shared';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { BoxGeometry, CylinderGeometry, MeshStandardMaterial, SphereGeometry, TorusGeometry, Vector3, type Group, type Material, type Mesh, type Texture } from 'three';
import { BlobShadow, GlowRing } from '../../../lab3d-kit/apparatus';
import { Interactive } from '../../../lab3d-kit/interact';
import { BENCH, STATION } from '../../../lab3d-kit/layout';
import { mat } from '../../../lab3d-kit/materials';
import { CardAndBook, CupboardItems, Rule, type CupboardSlot } from '../../phy-common/lab3d/common';
import { liveTex } from '../../phy-common/lab3d/tex';
import { diodeNow, fieldCfgNow, openSheet } from '../actions';
import { drawFieldSheet } from '../instruments';
import { runProgress, swing, useBench } from './bench-store';
import { APPARATUS_LABEL, IN_CUPBOARD, NEEDED, PLACEABLE, type ApparatusId, type SceneState } from './scene-state';
import { magLabel, magMeterFace, windingTex } from './tex';
import { COIL, DP, EMP, FBOARD, GALVO_FAR, GALVO_NEAR, MAG_IN_X, MAG_OUT_X, NAIL, PAPER_Y, SPOT, paperPt, type V3 } from './views';

const box = new BoxGeometry(1, 1, 1);
const cyl = new CylinderGeometry(1, 1, 1, 24);
const sphere = new SphereGeometry(1, 16, 12);
const torus = new TorusGeometry(1, 0.2, 8, 24);
const brass = new MeshStandardMaterial({ color: '#c9a23a', roughness: 0.3, metalness: 0.85 });
const ebonite = new MeshStandardMaterial({ color: '#1d1f22', roughness: 0.45 });
const ceramic = new MeshStandardMaterial({ color: '#efe9da', roughness: 0.5 });
const meterCase = new MeshStandardMaterial({ color: '#2b2f35', roughness: 0.45, metalness: 0.2 });
const galvoCase = new MeshStandardMaterial({ color: '#3a2f25', roughness: 0.5, metalness: 0.15 });
const needleMat = new MeshStandardMaterial({ color: '#111', roughness: 0.4 });
const redMag = new MeshStandardMaterial({ color: '#c62828', roughness: 0.45, metalness: 0.2 });
const whiteMag = new MeshStandardMaterial({ color: '#dfe5ea', roughness: 0.45, metalness: 0.2 });
const iron = new MeshStandardMaterial({ color: '#8f969c', roughness: 0.35, metalness: 0.8 });
const steelDark = new MeshStandardMaterial({ color: '#5d656d', roughness: 0.35, metalness: 0.8 });
const clipMat = new MeshStandardMaterial({ color: '#b8c0c8', roughness: 0.3, metalness: 0.9 });
const cellBody = new MeshStandardMaterial({ color: '#1f5fb5', roughness: 0.35, metalness: 0.2 });
const wireRed = new MeshStandardMaterial({ color: '#d64545', roughness: 0.55 });
const wireBlack = new MeshStandardMaterial({ color: '#2b2b2b', roughness: 0.55 });
const formerMat = new MeshStandardMaterial({ color: '#e2b47c', roughness: 0.7 });
const burnt = new MeshStandardMaterial({ color: '#2a1a12', roughness: 0.9 });
const silver = new MeshStandardMaterial({ color: '#d7dce0', roughness: 0.3, metalness: 0.8 });
const glass = new MeshStandardMaterial({ color: '#dbeafe', roughness: 0.05, transparent: true, opacity: 0.3, depthWrite: false });
const METER = { w: 0.19, h: 0.15, d: 0.11 };
const FACE = { w: 0.17, h: 0.1275, cy: METER.h * 0.5 + 0.005 };

function B({ p, s, m, r }: { p: V3; s: V3; m: Material; r?: V3 }) {
  return <mesh geometry={box} material={m} position={p} scale={s} rotation={r} />;
}
function C({ p, r, h, m, rot }: { p: V3; r: number; h: number; m: Material; rot?: V3 }) {
  return <mesh geometry={cyl} material={m} position={p} scale={[r, h, r]} rotation={rot} />;
}
const UP = new Vector3(0, 1, 0);
const DIR = new Vector3();
/** A wire (thin rod) between two station-local points. */
function Wire({ a, b, m = wireRed, r = 0.0025 }: { a: V3; b: V3; m?: Material; r?: number }) {
  const ref = useRef<Mesh>(null);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz) || 1e-6;
    mesh.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    mesh.scale.set(r, len, r);
    mesh.quaternion.setFromUnitVectors(UP, DIR.set(dx / len, dy / len, dz / len));
  });
  return <mesh ref={ref} geometry={cyl} material={m} />;
}
const add = (p: V3, q: V3): V3 => [p[0] + q[0], p[1] + q[1], p[2] + q[2]];

/** An analogue box meter; its needle follows `angle()` (radians, + clockwise). */
function FaceMeter({ face, angle, body = meterCase }: { face: Texture; angle: () => number; body?: Material }) {
  const needle = useRef<Group>(null);
  useFrame((_, dt) => {
    const g = needle.current;
    if (g) g.rotation.z += (-angle() - g.rotation.z) * Math.min(1, dt * 7);
  });
  const pivotY = FACE.cy - FACE.h / 2 + (40 / 384) * FACE.h;
  return (
    <group>
      <B p={[0, METER.h / 2, 0]} s={[METER.w, METER.h, METER.d]} m={body} />
      <mesh position={[0, FACE.cy, METER.d / 2 + 0.0008]}>
        <planeGeometry args={[FACE.w, FACE.h]} />
        <meshStandardMaterial map={face} roughness={0.5} />
      </mesh>
      <group ref={needle} position={[0, pivotY, METER.d / 2 + 0.0045]}>
        <B p={[0, 0.046, 0]} s={[0.0012, 0.092, 0.0006]} m={needleMat} />
      </group>
      <mesh position={[0, FACE.cy, METER.d / 2 + 0.008]} material={mat.pane()}>
        <planeGeometry args={[FACE.w + 0.006, FACE.h + 0.006]} />
      </mesh>
      <BlobShadow r={0.16} />
    </group>
  );
}
const angleOf = (x: number, from: number, to: number) => {
  const lim = (to - from) * 0.03;
  const v = Math.max(from - lim, Math.min(to + lim, x));
  return ((-50 + (100 * (v - from)) / (to - from)) * Math.PI) / 180;
};

export function CellsModel({ n = 2 }: { n?: number }) {
  return (
    <group>
      <B p={[0, 0.012, 0]} s={[0.08 + n * 0.09, 0.024, 0.06]} m={ebonite} />
      {Array.from({ length: n }, (_, i) => (
        <group key={i} position={[(i - (n - 1) / 2) * 0.09, 0.04, 0]}>
          <C p={[0, 0, 0]} r={0.017} h={0.085} m={cellBody} rot={[0, 0, Math.PI / 2]} />
          <C p={[0.046, 0, 0]} r={0.006} h={0.008} m={mat.steel()} rot={[0, 0, Math.PI / 2]} />
        </group>
      ))}
      <BlobShadow r={0.15} />
    </group>
  );
}
export function KeyModel({ closed }: { closed: boolean }) {
  return (
    <group>
      <B p={[0, 0.008, 0]} s={[0.16, 0.016, 0.06]} m={ebonite} />
      {[-0.036, 0.036].map((x) => (
        <B key={x} p={[x, 0.024, 0]} s={[0.06, 0.018, 0.036]} m={brass} />
      ))}
      <group position={[0, closed ? 0.04 : 0.028, closed ? 0 : 0.06]} rotation={[closed ? 0 : Math.PI / 2, 0, 0]}>
        <C p={[0, 0, 0]} r={0.006} h={0.026} m={brass} />
        <C p={[0, 0.02, 0]} r={0.011} h={0.014} m={ebonite} />
      </group>
      <BlobShadow r={0.11} />
    </group>
  );
}
const winding = () => windingTex();
export function SlideRheostat({ value, len = 0.26 }: { value: number; len?: number }) {
  const tex = useMemo(winding, []);
  return (
    <group>
      {[-1, 1].map((s) => (
        <B key={s} p={[(s * (len + 0.04)) / 2, 0.05, 0]} s={[0.03, 0.1, 0.06]} m={ceramic} />
      ))}
      <mesh position={[0, 0.045, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.024, len, 0.024]} geometry={cyl}>
        <meshStandardMaterial map={tex} roughness={0.5} metalness={0.4} />
      </mesh>
      <C p={[0, 0.09, 0]} r={0.004} h={len + 0.04} m={mat.steel()} rot={[0, 0, Math.PI / 2]} />
      <group position={[len * value - len / 2, 0, 0]}>
        <B p={[0, 0.09, 0]} s={[0.02, 0.02, 0.028]} m={ebonite} />
        <B p={[0, 0.072, 0]} s={[0.01, 0.026, 0.008]} m={brass} />
      </group>
      <BlobShadow r={0.18} />
    </group>
  );
}
function ResistorModel() {
  return (
    <group>
      <B p={[0, 0.008, 0]} s={[0.14, 0.016, 0.05]} m={ceramic} />
      <C p={[0, 0.03, 0]} r={0.0022} h={0.11} m={mat.steel()} rot={[0, 0, Math.PI / 2]} />
      <C p={[0, 0.03, 0]} r={0.008} h={0.045} m={ceramic} rot={[0, 0, Math.PI / 2]} />
      {['#7a4b2a', '#2b2b2b', '#7a4b2a', '#c9a227'].map((c, i) => (
        <mesh key={i} geometry={cyl} position={[-0.014 + i * 0.009, 0.03, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.0085, 0.004, 0.0085]}>
          <meshStandardMaterial color={c} roughness={0.5} />
        </mesh>
      ))}
      <BlobShadow r={0.09} />
    </group>
  );
}
function DiodeModel({ dead, reverse }: { dead: boolean; reverse: boolean }) {
  return (
    <group rotation={[0, reverse ? Math.PI : 0, 0]}>
      <B p={[0, 0.008, 0]} s={[0.12, 0.016, 0.05]} m={ceramic} />
      <C p={[0, 0.03, 0]} r={0.0018} h={0.1} m={mat.steel()} rot={[0, 0, Math.PI / 2]} />
      <C p={[0, 0.03, 0]} r={0.006} h={0.022} m={dead ? burnt : ebonite} rot={[0, 0, Math.PI / 2]} />
      <C p={[0.008, 0.03, 0]} r={0.0063} h={0.004} m={silver} rot={[0, 0, Math.PI / 2]} />
      <BlobShadow r={0.08} />
    </group>
  );
}
function Label({ text, p, w = 0.08, rot }: { text: string; p: V3; w?: number; rot?: V3 }) {
  const tex = useMemo(() => magLabel(text), [text]);
  return (
    <mesh position={p} rotation={rot ?? [-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[w, w / 4]} />
      <meshBasicMaterial map={tex} />
    </mesh>
  );
}
/** A bar magnet lying along +x (N end at +x), its centre at the origin. */
function BarMagnet({ len = FIELD_MAGNET.len / 100, w = FIELD_MAGNET.w / 100, h = 0.01 }: { len?: number; w?: number; h?: number }) {
  return (
    <group>
      <B p={[len / 4, h / 2, 0]} s={[len / 2, h, w]} m={redMag} />
      <B p={[-len / 4, h / 2, 0]} s={[len / 2, h, w]} m={whiteMag} />
    </group>
  );
}

// ================================================================== FIELD

function FieldSheetModel({ v, s }: { v: PhyMagnetismVariant; s: PhyMagnetismState }) {
  const live = useMemo(() => liveTex(840, 640), []);
  useEffect(() => () => live.texture.dispose(), [live]);
  const sh = openSheet(s);
  const ruler = useBench((b) => b.ruler);
  useEffect(() => {
    live.redraw((g, w, h) => drawFieldSheet(g, w, h, v, s, sh ? sh.i : null, { ruler: ruler !== null && sh ? (sh.sheet.neutrals[ruler] ?? null) : null }));
  }, [live, v, s, sh, ruler]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[(2 * FIELD_PAPER.w) / 100, (2 * FIELD_PAPER.h) / 100]} />
      <meshStandardMaterial map={live.texture} roughness={0.9} />
    </mesh>
  );
}
function CompassModel({ heading, size }: { heading: () => { a: number; loose: boolean }; size: 'small' | 'large' }) {
  const needle = useRef<Group>(null);
  const wob = useRef(0);
  useFrame((_, dt) => {
    const g = needle.current;
    if (!g) return;
    const h = heading();
    if (h.loose) {
      wob.current += dt * (0.6 + Math.sin(performance.now() / 700) * 0.5);
      g.rotation.y = -wob.current;
    } else {
      const target = -h.a;
      let d = target - g.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      g.rotation.y += d * Math.min(1, dt * 6);
      wob.current = -g.rotation.y;
    }
  });
  const R = size === 'small' ? 0.009 : 0.018;
  return (
    <group>
      <C p={[0, 0.004, 0]} r={R} h={0.008} m={brass} />
      <C p={[0, 0.0085, 0]} r={R * 0.92} h={0.001} m={ceramic} />
      <group ref={needle} position={[0, 0.0095, 0]}>
        <B p={[0, 0, -R * 0.42]} s={[0.0016, 0.0008, R * 0.84]} m={redMag} />
        <B p={[0, 0, R * 0.42]} s={[0.0016, 0.0008, R * 0.84]} m={ebonite} />
      </group>
      <mesh geometry={cyl} material={glass} position={[0, 0.0105, 0]} scale={[R * 0.95, 0.001, R * 0.95]} />
    </group>
  );
}
function FieldRig({ v, s, scene, interactive }: { v: PhyMagnetismVariant; s: PhyMagnetismState; scene: SceneState; interactive: boolean }) {
  const placed = (id: ApparatusId) => scene.placed.has(id);
  const o = openSheet(s);
  const cfg = o ? sheetCfg(o.sheet) : fieldCfgNow(s);
  const magnets = fieldMagnets(v, cfg);
  const cp = paperPt(s.cx, s.cy);
  const heading = () => {
    const c = compassAt(v, cfg, { x: s.cx, y: s.cy });
    return { a: c.heading, loose: c.loose };
  };
  return (
    <group>
      {placed('board') && (
        <Interactive id="board" label="Drawing board" bench labelY={0.06} position={[FBOARD.x, 0, FBOARD.z]}>
          {(active) => (
            <group>
              <B p={[0, FBOARD.t / 2, 0]} s={[FBOARD.w, FBOARD.t, FBOARD.d]} m={mat.wood()} />
              <BlobShadow r={0.35} />
              {active && <GlowRing r={0.3} />}
            </group>
          )}
        </Interactive>
      )}
      {placed('paper') && (
        <Interactive id="paper" label="The sheet" bench labelY={0.04} position={[FBOARD.x, PAPER_Y, FBOARD.z]}>
          {() => <FieldSheetModel v={v} s={s} />}
        </Interactive>
      )}
      {placed('magnet') &&
        magnets.map((m, i) => (
          <group key={i} position={paperPt(m.c.x, m.c.y, 0.0005)} rotation={[0, Math.atan2(m.u.y, m.u.x), 0]}>
            <Interactive id="magnet" label="Bar magnet" bench labelY={0.04}>
              {(active) => (
                <group>
                  <BarMagnet />
                  {active && <GlowRing r={0.06} />}
                </group>
              )}
            </Interactive>
          </group>
        ))}
      {scene.collected.has('compass') && placed('paper') && (
        <group position={[cp[0], cp[1] + 0.0005, cp[2]]}>
          <Interactive id="compass" label={interactive ? 'Plotting compass — drag it over the paper' : 'Plotting compass'} bench labelY={0.04} drag={interactive ? () => 'compass' : undefined}>
            {(active) => (
              <group>
                <CompassModel heading={heading} size={s.compass} />
                <mesh geometry={cyl} position={[0, 0.006, 0]} scale={[0.025, 0.012, 0.025]}>
                  <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                </mesh>
                {active && <GlowRing r={0.03} />}
              </group>
            )}
          </Interactive>
        </group>
      )}
      {!s.steelAway && (
        <group position={paperPt(FIELD_KEYS.x, FIELD_KEYS.y, 0.001)}>
          <Interactive id="keys" label="Keys and a phone (steel!)" bench labelY={0.05}>
            {(active) => (
              <group>
                <mesh geometry={torus} material={iron} rotation={[Math.PI / 2, 0, 0]} scale={0.012} position={[0, 0.003, 0]} />
                <B p={[0.02, 0.003, 0.006]} s={[0.04, 0.003, 0.01]} m={iron} />
                <B p={[-0.05, 0.005, 0.02]} s={[0.07, 0.009, 0.14]} m={ebonite} />
                {active && <GlowRing r={0.06} />}
              </group>
            )}
          </Interactive>
        </group>
      )}
    </group>
  );
}

// ================================================================== ELECTROMAGNET

function Clip({ p, r = 0 }: { p: V3; r?: number }) {
  return (
    <group position={p} rotation={[0, 0, r]}>
      <B p={[0, -0.008, 0]} s={[0.006, 0.016, 0.0015]} m={clipMat} />
    </group>
  );
}
function EmRig({ v, s, scene }: { v: PhyMagnetismVariant; s: PhyMagnetismState; scene: SceneState }) {
  const placed = (id: ApparatusId) => scene.placed.has(id);
  const nail = useRef<Group>(null);
  const tex = useMemo(winding, []);
  const face = useMemo(() => magMeterFace('A', '0 – 3 A  d.c.', 0, EM_AMMETER.fsd, EM_AMMETER.minor, EM_AMMETER.major), []);
  const k = s.lifts.length - 1;
  const lastIdx = (p: (a: string) => boolean) => s.log.reduce((m, e, i) => (p(e.a) ? i : m), -1);
  const holding = s.key && k >= 0 && lastIdx((a) => a.startsWith('lift')) > lastIdx((a) => a === 'key:on');
  const res = k >= 0 ? emLift(v, k, s.lifts[k]!) : null;
  const hang = holding ? (res?.clips ?? 0) : !s.key && res && k >= 0 && lastIdx((a) => a.startsWith('lift')) > lastIdx((a) => a === 'key:on') - 1 ? res.left : 0;
  useFrame(() => {
    const g = nail.current;
    if (!g) return;
    const run = useBench.getState().run;
    const { p, busy } = runProgress(run);
    const up = run && busy && run.kind === 'lift' ? (p < 0.4 ? -(p / 0.4) * 0.02 : -0.02 + ((p - 0.4) / 0.6) * (NAIL.up - NAIL.down + 0.02)) : holding || hang ? NAIL.up - NAIL.down : 0;
    g.position.y = NAIL.down + NAIL.len + up;
  });
  const I = s.key ? emCurrent(v, { turns: s.turns, rheo: s.rheo, heat: s.heat }) : 0;
  const post = (p: V3, dy = 0.03): V3 => [p[0], dy, p[2]];
  return (
    <group>
      {placed('cells') && (
        <group position={EMP.cells}>
          <Interactive id="cells" label="Two dry cells (3 V)" bench labelY={0.1}>
            {(a) => (
              <group>
                <CellsModel />
                {a && <GlowRing r={0.13} />}
              </group>
            )}
          </Interactive>
        </group>
      )}
      {placed('key') && (
        <group position={EMP.key}>
          <Interactive id="key" label={`Plug key (${s.key ? 'closed' : 'open'})`} bench labelY={0.08}>
            {(a) => (
              <group>
                <KeyModel closed={s.key} />
                {a && <GlowRing r={0.1} />}
              </group>
            )}
          </Interactive>
        </group>
      )}
      {placed('rheostat') && (
        <group position={EMP.rheostat}>
          <Interactive id="rheostat" label="Rheostat" bench labelY={0.14}>
            {(a) => (
              <group>
                <SlideRheostat value={s.rheo} />
                {a && <GlowRing r={0.18} />}
              </group>
            )}
          </Interactive>
        </group>
      )}
      {placed('ammeter') && (
        <group position={EMP.ammeter} rotation={[0, -0.35, 0]}>
          <Interactive id="ammeter" label="Ammeter (0–3 A)" bench labelY={0.2}>
            {(a) => (
              <group>
                <FaceMeter face={face} angle={() => angleOf(I, 0, EM_AMMETER.fsd)} />
                {a && <GlowRing r={0.14} />}
              </group>
            )}
          </Interactive>
        </group>
      )}
      {scene.collected.has('clips') && (
        <group position={EMP.dish}>
          <Interactive id="clips" label="Dish of steel paper clips" bench labelY={0.05}>
            {(a) => (
              <group>
                <C p={[0, 0.005, 0]} r={0.06} h={0.01} m={mat.glass()} />
                {Array.from({ length: 22 }, (_, n) => (
                  <Clip key={n} p={[Math.cos(n * 2.4) * 0.04 * ((n % 5) / 5 + 0.2), 0.02, Math.sin(n * 2.4) * 0.04 * ((n % 5) / 5 + 0.2)]} r={n} />
                ))}
                {a && <GlowRing r={0.07} />}
              </group>
            )}
          </Interactive>
        </group>
      )}
      {placed('nail') && (
        <group>
          <group position={EMP.stand}>
            <C p={[-0.1, 0.004, 0]} r={0.05} h={0.008} m={mat.darkMetal()} />
            <C p={[-0.1, 0.16, 0]} r={0.005} h={0.32} m={mat.steel()} />
          </group>
          <group ref={nail} position={[EMP.dish[0], NAIL.down + NAIL.len, EMP.dish[2]]}>
            <Interactive id="nail" label={`Electromagnet (${s.turns} turns)`} bench labelY={0.06}>
              {(a) => (
                <group>
                  <B p={[-0.06, 0, 0]} s={[0.12, 0.008, 0.012]} m={mat.darkMetal()} />
                  {s.core !== 'none' && <C p={[0, -NAIL.len / 2, 0]} r={0.0035} h={NAIL.len} m={s.core === 'steel' ? steelDark : iron} />}
                  <mesh geometry={cyl} position={[0, -NAIL.len * 0.42, 0]} scale={[0.008, NAIL.len * (s.turns >= 60 ? 0.7 : 0.45), 0.008]}>
                    <meshStandardMaterial map={tex} roughness={0.5} metalness={0.4} />
                  </mesh>
                  {Array.from({ length: hang }, (_, n) => (
                    <Clip key={n} p={[((n % 4) - 1.5) * 0.007, -NAIL.len - Math.floor(n / 4) * 0.015, ((n % 3) - 1) * 0.004]} r={(n % 3) * 0.3 - 0.3} />
                  ))}
                  {a && <GlowRing r={0.04} y={-NAIL.len} />}
                </group>
              )}
            </Interactive>
          </group>
          <Wire a={post(EMP.cells, 0.045)} b={post(EMP.key)} />
          <Wire a={post(EMP.key)} b={post(EMP.rheostat, 0.09)} />
          <Wire a={post(EMP.rheostat, 0.05)} b={add(EMP.ammeter, [0, 0.03, -0.04])} />
          <Wire a={add(EMP.ammeter, [-0.06, 0.03, 0])} b={[EMP.dish[0] - 0.06, 0.2, EMP.dish[2]]} m={wireBlack} />
          <Wire a={[EMP.dish[0] - 0.06, 0.2, EMP.dish[2]]} b={[EMP.dish[0], 0.19, EMP.dish[2]]} m={wireBlack} />
          <Wire a={post(EMP.cells, 0.045)} b={[EMP.dish[0] - 0.08, 0.18, EMP.dish[2]]} m={wireBlack} />
        </group>
      )}
    </group>
  );
}

// ================================================================== INDUCTION

function CoilModel({ turns }: { turns: 200 | 600 }) {
  const tex = useMemo(winding, []);
  return (
    <group>
      <C p={[0, COIL.r + 0.002, 0]} r={COIL.r * (turns === 600 ? 1.15 : 1)} h={COIL.len} m={formerMat} rot={[0, 0, Math.PI / 2]} />
      <mesh geometry={cyl} position={[0, COIL.r + 0.002, 0]} rotation={[0, 0, Math.PI / 2]} scale={[COIL.r * (turns === 600 ? 1.15 : 1) + 0.002, COIL.len * 0.86, COIL.r * (turns === 600 ? 1.15 : 1) + 0.002]}>
        <meshStandardMaterial map={tex} roughness={0.5} metalness={0.4} />
      </mesh>
      <mesh geometry={cyl} position={[COIL.len / 2 + 0.001, COIL.r + 0.002, 0]} rotation={[0, 0, Math.PI / 2]} scale={[COIL.r * 0.55, 0.002, COIL.r * 0.55]} material={ebonite} />
      <Label text={`${turns} turns`} p={[0, 2 * COIL.r + 0.012, 0]} w={0.07} />
      <BlobShadow r={0.12} />
    </group>
  );
}
function IndRig({ v, s, scene, interactive }: { v: PhyMagnetismVariant; s: PhyMagnetismState; scene: SceneState; interactive: boolean }) {
  const placed = (id: ApparatusId) => scene.placed.has(id);
  const mag = useRef<Group>(null);
  const face = useMemo(() => magMeterFace('G', 'centre zero', -IND_DIVS, IND_DIVS, 1, 10), []);
  const gp = s.galvoFar ? GALVO_FAR : GALVO_NEAR;
  const axisY = COIL.r + 0.002;
  const offset = () => (!s.galvoFar && s.magIn ? indDeflection(v, 0, { kind: 'still', coil: s.coil, pole: s.pole, magnets: s.magnets, speed: s.speed, axis: s.axis, galvoFar: false }) : 0);
  const needle = () => {
    const run = useBench.getState().run;
    const { p, busy } = runProgress(run);
    if (run && busy && run.kind === 'move') {
      const m = s.moves[run.k];
      if (m) return swing(indShown(indDeflection(v, run.k, m)), offset(), p, m.kind === 'still');
    }
    return offset();
  };
  useFrame(() => {
    const g = mag.current;
    if (!g) return;
    const run = useBench.getState().run;
    const { p, busy } = runProgress(run);
    let x = s.magIn ? MAG_IN_X : MAG_OUT_X;
    if (run && busy && run.kind === 'move') {
      const m = s.moves[run.k];
      const f = Math.min(1, p * (m?.speed === 'fast' ? 5 : 2.4));
      if (m?.kind === 'in') x = MAG_OUT_X + (MAG_IN_X - MAG_OUT_X) * f;
      else if (m?.kind === 'out') x = MAG_IN_X + (MAG_OUT_X - MAG_IN_X) * f;
    }
    g.position.x = x + COIL.len / 2;
    g.position.z = COIL.at[2] + (s.axis ? 0 : 0.06);
    g.rotation.y = s.axis ? 0 : 0.5;
  });
  const len = 0.12;
  return (
    <group>
      {placed('coil200') && (
        <group position={COIL.at}>
          <Interactive id={s.coil === 600 ? 'coil600' : 'coil200'} label={`Coil of ${s.coil} turns`} bench labelY={0.12}>
            {(a) => (
              <group>
                <CoilModel turns={s.coil} />
                {a && <GlowRing r={0.12} />}
              </group>
            )}
          </Interactive>
        </group>
      )}
      {placed('coil200') && (
        <group position={[COIL.at[0] - 0.05, 0, 0.18]} rotation={[0, 0.3, 0]}>
          <Interactive id={s.coil === 600 ? 'coil200' : 'coil600'} label={`Coil of ${s.coil === 600 ? 200 : 600} turns (spare)`} bench labelY={0.1}>
            {(a) => (
              <group scale={0.8}>
                <CoilModel turns={s.coil === 600 ? 200 : 600} />
                {a && <GlowRing r={0.12} />}
              </group>
            )}
          </Interactive>
        </group>
      )}
      {placed('galvo') && (
        <group position={gp} rotation={[0, s.galvoFar ? 0.3 : -0.3, 0]}>
          <Interactive id="galvo" label="Centre-zero galvanometer" bench labelY={0.2}>
            {(a) => (
              <group>
                <FaceMeter face={face} body={galvoCase} angle={() => angleOf(needle(), -IND_DIVS, IND_DIVS)} />
                {a && <GlowRing r={0.14} />}
              </group>
            )}
          </Interactive>
        </group>
      )}
      {placed('leads') && placed('galvo') && (
        <>
          <Wire a={[COIL.at[0] - COIL.len / 2, 0.01, COIL.at[2] + 0.02]} b={add(gp, [0.05, 0.02, 0.03])} />
          <Wire a={[COIL.at[0] - COIL.len / 2, 0.01, COIL.at[2] - 0.02]} b={add(gp, [-0.05, 0.02, 0.03])} m={wireBlack} />
        </>
      )}
      {scene.collected.has('magnets') && (
        <group ref={mag} position={[MAG_OUT_X + COIL.len / 2, axisY, COIL.at[2]]}>
          <Interactive id="magnets" label={interactive ? 'Bar magnet — drag it towards the coil to push it in' : 'Bar magnet'} bench labelY={0.04} drag={interactive ? () => 'magnet' : undefined}>
            {(a) => (
              <group>
                <group rotation={[0, s.pole === 'N' ? Math.PI : 0, 0]} position={[0, -0.006, 0]}>
                  <BarMagnet len={len} w={0.018} h={0.012} />
                </group>
                {s.magnets === 2 && (
                  <group rotation={[0, s.pole === 'N' ? Math.PI : 0, 0]} position={[0, 0.007, 0]}>
                    <BarMagnet len={len} w={0.018} h={0.012} />
                  </group>
                )}
                <mesh geometry={box} scale={[len, 0.03, 0.03]}>
                  <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                </mesh>
                {a && <GlowRing r={0.07} y={-axisY} />}
              </group>
            )}
          </Interactive>
        </group>
      )}
    </group>
  );
}

// ================================================================== DIODE

function DiodeRig({ v, s, scene }: { v: PhyMagnetismVariant; s: PhyMagnetismState; scene: SceneState }) {
  const placed = (id: ApparatusId) => scene.placed.has(id);
  const vFace = useMemo(() => magMeterFace('V', `0 – ${s.range} V  d.c.`, 0, DIODE_V[s.range].fsd, DIODE_V[s.range].minor, DIODE_V[s.range].major), [s.range]);
  const mFace = useMemo(() => magMeterFace('mA', '0 – 50 mA  d.c.', 0, DIODE_MA.fsd, DIODE_MA.minor, DIODE_MA.major), []);
  const r = s.key ? diodeReading(v, { ...diodeNow(s), range: s.range, open: s.burnt }) : null;
  const at = (p: V3, y = 0.03): V3 => [p[0], y, p[2]];
  const part = (id: ApparatusId, p: V3, label: string, model: ReactNode, glow = 0.1, rot?: V3) =>
    placed(id) && (
      <group position={p} rotation={rot}>
        <Interactive id={id} label={label} bench labelY={0.12}>
          {(a) => (
            <group>
              {model}
              {a && <GlowRing r={glow} />}
            </group>
          )}
        </Interactive>
      </group>
    );
  return (
    <group>
      {part('cells', DP.cells, 'Three dry cells (4.5 V)', <CellsModel n={3} />, 0.16)}
      {part('pot', DP.pot, 'Potentiometer', <SlideRheostat value={s.pot} />, 0.18)}
      {scene.collected.has('key') && placed('cells') && (
        <group position={DP.key}>
          <Interactive id="key" label={`Plug key (${s.key ? 'closed' : 'open'})`} bench labelY={0.08}>
            {(a) => (
              <group>
                <KeyModel closed={s.key} />
                {a && <GlowRing r={0.1} />}
              </group>
            )}
          </Interactive>
        </group>
      )}
      {part('resistor', DP.resistor, `Protective resistor (100 Ω)${s.resistor ? '' : ' — short-circuited'}`, <ResistorModel />)}
      {part('diode', DP.diode, `Silicon diode (${s.bias === 'fwd' ? 'forward' : 'reverse'} bias)${s.burnt ? ' — burnt out' : ''}`, <DiodeModel dead={s.burnt} reverse={s.bias === 'rev'} />)}
      {part('mamm', DP.mamm, 'Milliammeter (0–50 mA)', <FaceMeter face={mFace} angle={() => angleOf(r ? Math.abs(r.mAtrue) : 0, 0, DIODE_MA.fsd)} />, 0.14, [0, -0.2, 0])}
      {part('vmeter', DP.vmeter, `Voltmeter (0–${s.range} V)`, <FaceMeter face={vFace} angle={() => angleOf(r ? r.Vtrue : 0, 0, DIODE_V[s.range].fsd)} />, 0.14, [0, -0.4, 0])}
      {placed('leads') && (
        <>
          <Wire a={at(DP.cells, 0.045)} b={at(DP.pot, 0.05)} />
          <Wire a={at(DP.pot, 0.09)} b={at(DP.key)} />
          <Wire a={at(DP.key)} b={add(DP.mamm, [0, 0.02, 0.06])} />
          <Wire a={add(DP.mamm, [-0.06, 0.02, 0.06])} b={add(DP.diode, [0.05, 0.03, 0])} m={wireBlack} />
          <Wire a={add(DP.diode, [-0.05, 0.03, 0])} b={add(DP.resistor, [0.055, 0.03, 0])} m={wireBlack} />
          <Wire a={add(DP.resistor, [-0.055, 0.03, 0])} b={at(DP.cells, 0.045)} m={wireBlack} />
          {s.resistor ? null : <Wire a={add(DP.resistor, [-0.055, 0.04, 0.01])} b={add(DP.resistor, [0.055, 0.04, 0.01])} m={brass} r={0.0018} />}
          <Wire a={add(DP.vmeter, [-0.05, 0.02, 0.06])} b={s.vm === 'diode' ? add(DP.diode, [0.05, 0.035, 0.01]) : add(DP.diode, [0.05, 0.035, 0.01])} />
          <Wire a={add(DP.vmeter, [0.05, 0.02, 0.06])} b={s.vm === 'diode' ? add(DP.diode, [-0.05, 0.035, 0.012]) : add(DP.resistor, [-0.055, 0.035, 0.012])} m={wireBlack} />
        </>
      )}
    </group>
  );
}

// ================================================================== the bench

function ExtraModel({ id }: { id: ApparatusId }): ReactNode {
  switch (id) {
    case 'board':
      return <B p={[0, 0.009, 0]} s={[0.3, 0.018, 0.22]} m={mat.wood()} />;
    case 'paper':
      return <B p={[0, 0.002, 0]} s={[0.21, 0.004, 0.297]} m={ceramic} />;
    case 'magnet':
    case 'magnets':
      return (
        <group>
          <group position={[0, 0, -0.012]}>
            <BarMagnet />
          </group>
          <group position={[0, 0, 0.012]}>
            <BarMagnet />
          </group>
        </group>
      );
    case 'compass':
      return (
        <group>
          <CompassModel heading={() => ({ a: 0, loose: false })} size="small" />
          <group position={[0.05, 0, 0]}>
            <CompassModel heading={() => ({ a: 0, loose: false })} size="large" />
          </group>
        </group>
      );
    case 'pencil':
      return <C p={[0, 0.004, 0]} r={0.004} h={0.16} m={mat.green()} rot={[0, 0, Math.PI / 2]} />;
    case 'rule':
      return (
        <group position={[-0.15, 0, 0]}>
          <Rule cm={30} />
        </group>
      );
    case 'filings':
      return <C p={[0, 0.04, 0]} r={0.02} h={0.08} m={mat.plastic()} />;
    case 'cells':
      return <CellsModel />;
    case 'key':
      return <KeyModel closed={false} />;
    case 'rheostat':
    case 'pot':
      return (
        <group scale={0.7}>
          <SlideRheostat value={0.5} />
        </group>
      );
    case 'ammeter':
    case 'mamm':
    case 'vmeter':
    case 'galvo':
      return <B p={[0, 0.05, 0]} s={[0.12, 0.1, 0.08]} m={id === 'galvo' ? galvoCase : meterCase} />;
    case 'nail':
      return (
        <group>
          <C p={[0, 0.004, 0]} r={0.0035} h={0.11} m={iron} rot={[0, 0, Math.PI / 2]} />
          <mesh geometry={torus} material={wireRed} position={[0, 0.006, 0.04]} rotation={[Math.PI / 2, 0, 0]} scale={0.03} />
        </group>
      );
    case 'steelrod':
      return <C p={[0, 0.004, 0]} r={0.004} h={0.11} m={steelDark} rot={[0, 0, Math.PI / 2]} />;
    case 'clips':
      return <C p={[0, 0.005, 0]} r={0.05} h={0.01} m={mat.glass()} />;
    case 'coil200':
    case 'coil600':
      return (
        <group scale={0.7}>
          <CoilModel turns={id === 'coil600' ? 600 : 200} />
        </group>
      );
    case 'leads':
      return <mesh geometry={torus} material={wireRed} position={[0, 0.006, 0]} rotation={[Math.PI / 2, 0, 0]} scale={0.035} />;
    case 'resistor':
      return <ResistorModel />;
    case 'diode':
      return <DiodeModel dead={false} reverse={false} />;
    case 'spring':
      return (
        <group>
          {Array.from({ length: 10 }, (_, k) => (
            <mesh key={k} geometry={torus} material={mat.steel()} position={[0, 0.006 + k * 0.005, 0]} rotation={[Math.PI / 2, 0, 0]} scale={0.011} />
          ))}
        </group>
      );
    case 'pendulum':
      return <mesh geometry={sphere} material={brass} position={[0, 0.0125, 0]} scale={0.0125} />;
    default:
      return <B p={[0, 0.02, 0]} s={[0.1, 0.04, 0.08]} m={mat.wood()} />;
  }
}

/** Everything on the student's bench. */
export function Station({ v, state, scene, interactive, card }: { v: PhyMagnetismVariant; state: PhyMagnetismState; scene: SceneState; interactive: boolean; card: string[] }) {
  const t: MagTask = state.task ?? 'FIELD';
  const rig = new Set<ApparatusId>([...PLACEABLE[t], ...(t === 'FIELD' ? (['compass'] as ApparatusId[]) : t === 'ELECTROMAGNET' ? (['clips'] as ApparatusId[]) : t === 'INDUCTION' ? (['magnets', 'coil600'] as ApparatusId[]) : (['key'] as ApparatusId[]))]);
  const loose = [...scene.collected].filter((id) => !(rig.has(id) && (scene.placed.has(id) || !PLACEABLE[t].includes(id)) && !(id === 'coil600' && !scene.placed.has('coil200')) && !(id === 'compass' && !scene.placed.has('paper'))));
  const heads: Record<MagTask, string[]> = { FIELD: ['X/cm', 'Y/cm', 'axial/cm', 'mean'], ELECTROMAGNET: ['N', 'I/A', 'clips', 'mean'], INDUCTION: ['move', 'dir', 'size/div'], DIODE: ['V/V', 'I/mA'] };
  return (
    <group position={STATION}>
      <Interactive id="mybench" label="Your bench" labelY={0.5}>
        <mesh position={[0, 0.005, 0]}>
          <boxGeometry args={[BENCH.w, 0.01, BENCH.d]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>
      <CardAndBook cardAt={SPOT.card} bookAt={SPOT.book} title={t === 'FIELD' ? 'Neutral points' : t === 'ELECTROMAGNET' ? 'Electromagnet' : t === 'INDUCTION' ? 'Induction' : 'Diode I–V'} lines={card} bookTitle="Readings" heads={heads[t]} />
      {t === 'FIELD' && <FieldRig v={v} s={state} scene={scene} interactive={interactive} />}
      {t === 'ELECTROMAGNET' && <EmRig v={v} s={state} scene={scene} />}
      {t === 'INDUCTION' && <IndRig v={v} s={state} scene={scene} interactive={interactive} />}
      {t === 'DIODE' && <DiodeRig v={v} s={state} scene={scene} />}
      {loose.map((id, k) => (
        <Interactive key={id} id={id} label={APPARATUS_LABEL[id]} bench position={[SPOT.waiting[0] + (k % 6) * 0.16 + (NEEDED[t].includes(id) ? 0 : 1.0), 0, SPOT.waiting[2] + Math.floor(k / 6) * 0.12]} labelY={0.1}>
          {(active) => (
            <group>
              <ExtraModel id={id} />
              <BlobShadow r={0.05} />
              {active && <GlowRing r={0.07} />}
            </group>
          )}
        </Interactive>
      ))}
    </group>
  );
}

const SHELF_OF: Partial<Record<ApparatusId, 0 | 1 | 2>> = { board: 0, paper: 0, rheostat: 0, pot: 0, ammeter: 0, mamm: 0, vmeter: 0, galvo: 0 };
export function MagCupboard({ scene }: { scene: SceneState }) {
  const slots = useMemo<CupboardSlot[]>(() => {
    const ids = IN_CUPBOARD[scene.task];
    const rows: Record<number, number> = { 0: 0, 1: 0, 2: 0 };
    return ids.map((id) => {
      const shelf = SHELF_OF[id] ?? (rows[1]! <= rows[2]! ? 1 : 2);
      const x = -0.9 + rows[shelf]! * (shelf === 0 ? 0.3 : 0.24);
      rows[shelf]!++;
      return { id, label: APPARATUS_LABEL[id], shelf, x, model: <ExtraModel id={id} />, grip: [[0.2, 0.1, 0.1], [0, 0.04, 0]] as [V3, V3] };
    });
  }, [scene.task]);
  return <CupboardItems slots={slots} collected={scene.collected} />;
}
