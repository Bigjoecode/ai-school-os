import {
  DEPTH_PIN_MAX,
  DISP_COLOURS,
  DISP_SLIT_WIDTH,
  depthImage,
  depthStack,
  dispDeviation,
  dispIndex,
  dispPasses,
  pinsEye,
  pinsImage,
  pinsPrism,
  pinsRot,
  prismInDir,
  prismRay,
  prismShape,
  type DispState,
  type PhyPinsState,
  type PhyPinsVariant,
  type PinsPoint,
  type PinsTask,
  type PinsTrace,
} from '@aischool/shared';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { BackSide, BoxGeometry, CylinderGeometry, DoubleSide, ExtrudeGeometry, MeshBasicMaterial, MeshStandardMaterial, Shape, SphereGeometry, type Group } from 'three';
import { BlobShadow, GlowRing } from '../../../lab3d-kit/apparatus';
import { Interactive } from '../../../lab3d-kit/interact';
import { BENCH, STATION } from '../../../lab3d-kit/layout';
import { mat } from '../../../lab3d-kit/materials';
import { useLabView } from '../../../lab3d-kit/store';
import { CardAndBook, CupboardItems, Protractor, Rule, type CupboardSlot } from '../../phy-common/lab3d/common';
import { liveTex } from '../../phy-common/lab3d/tex';
import { PIN_LABEL, type PinId } from '../actions';
import { drawPaper, paperSize, type DrawProgress } from '../paper';
import { imageSeen, pinPoint } from '../views2d';
import { useBench } from './bench-store';
import { eyePhiOf, measurePoint } from './measure';
import { APPARATUS_LABEL, type ApparatusId, type SceneState } from './scene-state';
import { DEPTH_AT, DEPTH_RULE_AT, DISP_BOX_AT, DISP_PRISM_AT, OBJ_H, O_AT, PAPER_Y, PIN_H, SPOT, fromLocal, screenX, sheetCentre, sheetSize, toLocal } from './views';

type V3 = [number, number, number];
const box = new BoxGeometry(1, 1, 1);
const cyl = new CylinderGeometry(1, 1, 1, 10);
const sphere = new SphereGeometry(1, 14, 10);
const steel = new MeshStandardMaterial({ color: '#c9d0d6', roughness: 0.25, metalness: 0.9 });
const HEADS: Record<PinId, MeshStandardMaterial> = {
  p1: new MeshStandardMaterial({ color: '#d62828', roughness: 0.35 }),
  p2: new MeshStandardMaterial({ color: '#e8820c', roughness: 0.35 }),
  p3: new MeshStandardMaterial({ color: '#1d4ed8', roughness: 0.35 }),
  p4: new MeshStandardMaterial({ color: '#0f8a5f', roughness: 0.35 }),
};
const glassMat = new MeshStandardMaterial({ color: '#cfeff2', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.3, depthWrite: false, side: DoubleSide });
const mirrorMat = new MeshStandardMaterial({ color: '#dfe6ea', roughness: 0.05, metalness: 0.95, transparent: true, opacity: 0.32, depthWrite: false, side: DoubleSide });
const backMat = new MeshStandardMaterial({ color: '#9aa5ad', roughness: 0.4, metalness: 0.6, transparent: true, opacity: 0.45, depthWrite: false });
const beamMat = new MeshBasicMaterial({ color: '#fffbe6', toneMapped: false, transparent: true, opacity: 0.9 });
const darkMat = new MeshBasicMaterial({ color: '#05070b', side: BackSide, transparent: true, opacity: 0.86, depthWrite: false });
const ANIM_MS = { normal: 1400, ray: 1600, join: 1600, pin: 500 };

/** An optical pin standing on the paper (origin at its point). */
function PinModel({ pin, from = 0, to = PIN_H, head = true, ghost = false, thick = 1 }: { pin: PinId; from?: number; to?: number; head?: boolean; ghost?: boolean; thick?: number }) {
  const h = (to - from) / 100;
  const r = (ghost ? 0.0007 : 0.0005) * thick;
  return (
    <group>
      {h > 0 && <mesh geometry={cyl} material={ghost ? HEADS[pin] : steel} position={[0, (from + to) / 200, 0]} scale={[r, h, r]} />}
      {head && <mesh geometry={sphere} material={HEADS[pin]} position={[0, PIN_H / 100 + 0.0015 * thick, 0]} scale={0.0024 * Math.min(thick, 1.5)} />}
    </group>
  );
}
/** Far pins drawn thicker in the eye-level view so they stay visible (only how they are drawn). */
const sightThick = (p: PinsPoint, E: PinsPoint) => Math.max(1, Math.min(4, Math.hypot(p.x - E.x, p.y - E.y) / 6));

export function shownTrace(s: PhyPinsState, viewing: number | null) {
  const open = s.traces.findIndex((t) => !t.joined);
  const k = viewing !== null && viewing < s.traces.length ? viewing : open >= 0 ? open : s.traces.length - 1;
  return { k, t: k >= 0 ? s.traces[k]! : null, editable: open >= 0 && k === open };
}

/** The prism's triangular prism mesh (sheet triangle B, T, C extruded upwards). */
function prismGeometry(pts: PinsPoint[], hCm: number) {
  const sh = new Shape();
  sh.moveTo(pts[0]!.x / 100, pts[0]!.y / 100);
  for (const p of pts.slice(1)) sh.lineTo(p.x / 100, p.y / 100);
  sh.closePath();
  return new ExtrudeGeometry(sh, { depth: hCm / 100, bevelEnabled: false });
}

// ------------------------------------------------------------------ the drawing board

function BoardStation({ v, task, state, scene, interactive, onPaper }: { v: PhyPinsVariant; task: 'MIRROR' | 'PRISM'; state: PhyPinsState; scene: SceneState; interactive: boolean; onPaper: (p: PinsPoint) => void }) {
  const viewing = useBench((b) => b.viewing);
  const anim = useBench((b) => b.anim);
  const sight = useBench((b) => b.sight);
  const phi = useBench((b) => b.phi);
  const tool = useBench((b) => b.tool);
  const { t, editable } = shownTrace(state, viewing);
  const size = paperSize(task);
  const paper = useMemo(() => liveTex(size.w, size.h), [size.w, size.h]);
  const prog = useRef<DrawProgress>({ normal: 1, ray: 1, join: 1 });
  const objectOn = !!t && !t.joined && editable;
  const key = JSON.stringify([t, objectOn]);
  const redraw = () => paper.redraw((g) => drawPaper(g, v, task, t, prog.current, { objectOn: false }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(redraw, [key, v, task]);
  useFrame(() => {
    const a = useBench.getState().anim;
    if (!a || a.kind === 'pin') return;
    const f = Math.min(1, (performance.now() - a.at) / ANIM_MS[a.kind]);
    if (f !== prog.current[a.kind]) {
      prog.current = { ...prog.current, [a.kind]: f };
      redraw();
    }
    if (f >= 1) useBench.setState({ anim: null });
  });
  useEffect(() => {
    if (anim && anim.kind !== 'pin') prog.current = { ...prog.current, [anim.kind]: 0 };
    else if (!anim) prog.current = { normal: 1, ray: 1, join: 1 };
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anim]);
  const S = sheetSize(task);
  const c = toLocal(sheetCentre(task));
  const click = (e: ThreeEvent<MouseEvent>) => {
    if (!useBench.getState().tool || !interactive) return;
    e.stopPropagation();
    onPaper(fromLocal(e.point.x - STATION[0], e.point.z - STATION[2]));
  };
  const sh = pinsPrism(v);
  const eyePhi = phi ?? (t ? eyePhiOf(v, task, t) : 30);
  const E = pinsEye(v, task, eyePhi);
  const prismGeo = useMemo(() => prismGeometry([sh.B, sh.T, sh.C], OBJ_H), [sh.B, sh.T, sh.C]);
  return (
    <group>
      <Interactive id="board" label={tool ? `Drawing board — tap where ${PIN_LABEL[tool]} goes` : 'Drawing board and paper'} bench position={[c[0], 0, c[2]]} labelY={0.06}>
        {(active) => (
          <group>
            <mesh geometry={box} material={mat.wood()} position={[0, 0.006, 0]} scale={[S.w / 100 + 0.06, 0.012, S.h / 100 + 0.05]} />
            {scene.collected.has('paper') && (
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, PAPER_Y + 0.0004, 0]} onClick={click}>
                <planeGeometry args={[S.w / 100, S.h / 100]} />
                <meshStandardMaterial map={paper.texture} roughness={0.85} />
              </mesh>
            )}
            <BlobShadow r={0.28} opacity={0.6} />
            {active && <GlowRing r={0.26} y={PAPER_Y + 0.002} />}
          </group>
        )}
      </Interactive>
      {t &&
        (['p1', 'p2', 'p3', 'p4'] as PinId[]).map((id) => {
          const p = pinPoint(v, task, t, id);
          if (!p) return null;
          const img = (id === 'p1' || id === 'p2') && sight && objectOn ? pinsImage(v, task, t.i, t[id]!) : null;
          const seen = img && imageSeen(v, task, E, img);
          const dk = (id === 'p3' || id === 'p4') && editable && interactive ? () => 'pin' : undefined;
          return (
            <group key={id}>
              <Interactive id={`pin:${id}`} label={`${PIN_LABEL[id]}${dk ? ' — drag to move it' : ''}`} bench position={toLocal(p)} labelY={0.05} drag={dk}>
                {(active) => (
                  <group>
                    <PinModel pin={id} thick={sight ? sightThick(p, E) : 1} />
                    <mesh position={[0, 0.02, 0]}>
                      <cylinderGeometry args={[0.006, 0.006, 0.04, 6]} />
                      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                    </mesh>
                    {active && <GlowRing r={0.012} y={0.001} />}
                  </group>
                )}
              </Interactive>
              {img && seen && (
                <group position={toLocal(img)}>
                  <PinModel pin={id} to={task === 'MIRROR' ? PIN_H : OBJ_H - 0.05} head={task === 'MIRROR'} ghost thick={sightThick(img, E)} />
                </group>
              )}
            </group>
          );
        })}
      {task === 'MIRROR' && scene.collected.has('mirror') && <MovingThing on={objectOn} at={toLocal({ x: 0, y: -0.3 })} id="mirror" label={APPARATUS_LABEL.mirror}>
        <mesh geometry={box} material={mirrorMat} position={[0, OBJ_H / 200, 0]} scale={[0.14, OBJ_H / 100, 0.004]} />
        <mesh geometry={box} material={backMat} position={[0, OBJ_H / 200, 0.0035]} scale={[0.14, OBJ_H / 100, 0.002]} />
        <mesh geometry={box} material={mat.wood()} position={[0, 0.004, 0.012]} scale={[0.12, 0.008, 0.02]} />
      </MovingThing>}
      {task === 'PRISM' && scene.collected.has('prism') && (
        <MovingThing on={objectOn} at={[O_AT.x, 0, O_AT.z]} id="prism" label={APPARATUS_LABEL.prism}>
          <mesh geometry={prismGeo} material={glassMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, PAPER_Y, 0]} />
        </MovingThing>
      )}
      <Tools task={task} v={v} t={t} />
    </group>
  );
}

/** The mirror or prism: on its line/outline while a trace is open, otherwise beside the board. */
function MovingThing({ on, at, id, label, children }: { on: boolean; at: V3; id: string; label: string; children: React.ReactNode }) {
  const ref = useRef<Group>(null);
  const want: V3 = on ? [at[0], 0, at[2]] : SPOT.objHome;
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const k = Math.min(1, dt * 6);
    g.position.x += (want[0] - g.position.x) * k;
    g.position.z += (want[2] - g.position.z) * k;
    g.position.y = Math.min(0.05, Math.hypot(want[0] - g.position.x, want[2] - g.position.z) * 0.4);
  });
  return (
    <group ref={ref} position={want}>
      <Interactive id={id} label={label} bench labelY={0.06}>
        {(active) => (
          <group>
            {children}
            {active && <GlowRing r={0.08} />}
          </group>
        )}
      </Interactive>
    </group>
  );
}

function Tools({ task, v, t }: { task: 'MIRROR' | 'PRISM'; v: PhyPinsVariant; t: PinsTrace | null }) {
  const focus = useLabView((s) => s.focus);
  const m = t?.joined ? measurePoint(v, task, t) : null;
  const measuring = !!m && focus === 'protractor';
  const at = m ? toLocal(m) : null;
  // 0° along the normal (mirror: up the sheet) or the incident ray produced (prism).
  const ref = task === 'MIRROR' ? { x: 0, y: 1 } : t ? prismInDir(pinsPrism(v), t.i) : { x: 1, y: 0 };
  const yaw = Math.atan2(ref.y, ref.x) - Math.PI / 2;
  return (
    <group>
      <Interactive id="ruler" label="30 cm ruler" bench position={SPOT.ruler} rotation={[0, 0.1, 0]} labelY={0.03}>
        {(active) => <Rule cm={30} width={0.03} glow={active} />}
      </Interactive>
      {measuring && at ? (
        <group position={[at[0], PAPER_Y + 0.0008, at[2]]} rotation={[-Math.PI / 2, 0, yaw]}>
          <Protractor r={0.08} down={false} />
        </group>
      ) : (
        <Interactive id="protractor" label="Protractor" bench position={SPOT.protractor} labelY={0.03}>
          {(active) => (
            <group rotation={[-Math.PI / 2, 0, 0.3]} position={[0, 0.001, 0]}>
              <Protractor r={0.07} down glow={active} />
            </group>
          )}
        </Interactive>
      )}
      <Interactive id="pencil" label="Sharp pencil" bench position={SPOT.pencil} rotation={[0, 0.6, 0]} labelY={0.03}>
        {(active) => (
          <group rotation={[0, 0, Math.PI / 2]} position={[0, 0.004, 0]}>
            <mesh geometry={cyl} material={mat.wood()} scale={[0.0035, 0.15, 0.0035]} />
            {active && <GlowRing r={0.08} />}
          </group>
        )}
      </Interactive>
    </group>
  );
}

function PinBox({ left }: { left: PinId[] }) {
  return (
    <Interactive id="pins" label="Optical pins" bench position={SPOT.pins} labelY={0.06}>
      {(active) => (
        <group>
          <mesh geometry={box} material={mat.cabinet()} position={[0, 0.008, 0]} scale={[0.07, 0.016, 0.05]} />
          <mesh geometry={box} material={mat.red()} position={[0, 0.0165, 0]} scale={[0.066, 0.001, 0.046]} />
          {left.map((id, k) => (
            <group key={id} position={[-0.024 + k * 0.016, 0.018, 0]} rotation={[0, 0, Math.PI / 2 - 0.05]}>
              <PinModel pin={id} />
            </group>
          ))}
          <BlobShadow r={0.06} />
          {active && <GlowRing r={0.06} />}
        </group>
      )}
    </Interactive>
  );
}

// ------------------------------------------------------------------ real and apparent depth

const BLOCK_W = 0.1;
const BLOCK_D = 0.065;
/** The cross sits near the far edge of the stack, so the search pin beside it points to just over it. */
const CROSS_Z = -BLOCK_D / 2 + 0.008;
function DepthStation({ v, state, scene }: { v: PhyPinsVariant; state: PhyPinsState; scene: SceneState }) {
  const look = useBench((b) => b.look);
  const d = state.depth;
  const T = depthStack(v, d.blocks);
  const img = d.blocks ? T - depthImage(v, d.blocks, d.eyeX).depth : 0;
  const crossX = DEPTH_AT[0] - 0.035;
  return (
    <group>
      {scene.collected.has('blocks') && (
        <Interactive id="blocks" label={`Glass blocks (${d.blocks} on the cross)`} bench position={DEPTH_AT} labelY={0.14}>
          {(active) => (
            <group>
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0008, 0]}>
                <planeGeometry args={[0.18, 0.13]} />
                <meshStandardMaterial color="#fbfbf7" roughness={0.9} />
              </mesh>
              <mesh geometry={box} material={mat.black()} position={[crossX - DEPTH_AT[0], 0.0012, CROSS_Z]} scale={[0.012, 0.0004, 0.0016]} />
              <mesh geometry={box} material={mat.black()} position={[crossX - DEPTH_AT[0], 0.0012, CROSS_Z]} scale={[0.0016, 0.0004, 0.012]} />
              {v.blocks.slice(0, d.blocks).map((t, k) => (
                <mesh key={k} geometry={box} material={glassMat} position={[0, (depthStack(v, k) + t / 2) / 100, 0]} scale={[BLOCK_W, t / 100 - 0.0004, BLOCK_D]} />
              ))}
              {/* blocks not in use, beside */}
              {v.blocks.slice(d.blocks).map((t, k) => (
                <mesh key={`s${k}`} geometry={box} material={glassMat} position={[0.17, (k * 2.6 + t / 2) / 100, 0.02]} scale={[BLOCK_W, t / 100 - 0.0004, BLOCK_D]} />
              ))}
              {look && d.blocks > 0 && (
                <group position={[crossX - DEPTH_AT[0], img / 100, CROSS_Z]}>
                  <mesh geometry={box} material={mat.black()} scale={[0.012, 0.0003, 0.0016]} />
                  <mesh geometry={box} material={mat.black()} scale={[0.0016, 0.0003, 0.012]} />
                </group>
              )}
              <BlobShadow r={0.1} />
              {active && <GlowRing r={0.1} />}
            </group>
          )}
        </Interactive>
      )}
      {scene.collected.has('rule') && (
        <Interactive id="rule" label="Vertical rule (0 at the bench)" bench position={[DEPTH_RULE_AT[0], (DEPTH_PIN_MAX + 1) / 100, DEPTH_RULE_AT[2] + 0.04]} labelY={0.02}>
          {(active) => (
            <group position={[0, 0, 0]}>
              <group position={[0, 0.01, 0]}>
                <Rule cm={DEPTH_PIN_MAX + 1} vertical width={0.025} glow={active} />
              </group>
            </group>
          )}
        </Interactive>
      )}
      {scene.collected.has('stand') && (
        <Interactive id="stand" label={`Search pin at ${d.h.toFixed(2)} cm`} bench position={[DEPTH_RULE_AT[0] - 0.06, 0, DEPTH_RULE_AT[2]]} labelY={0.2}>
          {(active) => (
            <group>
              <mesh geometry={box} material={mat.darkMetal()} position={[0, 0.005, 0]} scale={[0.1, 0.01, 0.14]} />
              <mesh geometry={cyl} material={mat.metal()} position={[0, 0.1, 0]} scale={[0.005, 0.2, 0.005]} />
              <group position={[0, d.h / 100, 0]}>
                <mesh geometry={box} material={mat.darkMetal()} position={[0.02, 0, 0]} scale={[0.04, 0.008, 0.008]} />
                <mesh geometry={cyl} material={mat.cork()} position={[0.045, 0, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.006, 0.014, 0.006]} />
                {/* the pin points along +x to just above the cross, beside the stack */}
                <mesh geometry={cyl} material={steel} position={[(0.052 + (crossX - (DEPTH_RULE_AT[0] - 0.06))) / 2, 0, -BLOCK_D / 2 - 0.004]} rotation={[0, 0, Math.PI / 2]} scale={[0.0005, crossX - (DEPTH_RULE_AT[0] - 0.06) - 0.052, 0.0005]} />
              </group>
              {active && <GlowRing r={0.08} />}
            </group>
          )}
        </Interactive>
      )}
    </group>
  );
}

// ------------------------------------------------------------------ dispersion

/** The spectrum on the screen (canvas): bands at their deviations, blurred by a wide slit, washed out in a lit room. */
export function drawSpectrum(g: CanvasRenderingContext2D, v: PhyPinsVariant, d: DispState, W: number, H: number) {
  g.fillStyle = d.dark ? '#16181c' : '#f2f1ea';
  g.fillRect(0, 0, W, H);
  const green = dispDeviation(v, 'green', d.i) ?? 40;
  const lo = Math.floor(green) - 5;
  const pxDeg = W / 11;
  const X = (D: number) => (D - lo) * pxDeg;
  const width = (DISP_SLIT_WIDTH[d.slit] * 60) / Math.max(20, d.dist);
  g.globalCompositeOperation = d.dark ? 'lighter' : 'multiply';
  for (const c of DISP_COLOURS) {
    if (!dispPasses(d.filter, c.id)) continue;
    const D = dispDeviation(v, c.id, d.i);
    if (D === null) continue;
    const x = X(D);
    const w = width * pxDeg;
    const grad = g.createLinearGradient(x - w, 0, x + w, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.5, c.css);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = d.dark ? 1 : 0.3;
    g.fillStyle = grad;
    g.fillRect(x - w, H * 0.08, 2 * w, H * 0.55);
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = '#fff';
  g.fillRect(0, H * 0.66, W, H * 0.34);
  g.strokeStyle = '#222';
  g.fillStyle = '#222';
  g.font = `600 ${Math.round(H * 0.09)}px system-ui, sans-serif`;
  g.textAlign = 'center';
  for (let k = 0; k <= 110; k++) {
    const x = X(lo + k / 10);
    const big = k % 10 === 0;
    g.lineWidth = big ? 2 : 1;
    g.beginPath();
    g.moveTo(x, H * 0.66);
    g.lineTo(x, H * (0.66 + (big ? 0.12 : k % 5 === 0 ? 0.08 : 0.04)));
    g.stroke();
    if (big) g.fillText(`${lo + k / 10}°`, x, H * 0.92);
  }
}

function DispStation({ v, state, scene }: { v: PhyPinsVariant; state: PhyPinsState; scene: SceneState }) {
  const d = state.disp;
  const screenOn = useBench((b) => b.screen);
  const sh = useMemo(() => prismShape(v.dispA, 6), [v.dispA]);
  const geo = useMemo(() => prismGeometry([sh.B, sh.T, sh.C], 4), [sh]);
  const dIn = prismInDir(sh, d.i);
  const rot = Math.atan2(dIn.y, dIn.x);
  // Sheet (cm, prism centre at the turntable) → station-local metres, rotated so the beam runs along +x.
  const L = (p: PinsPoint, y = 0.02): V3 => {
    const q = pinsRot(p, (-rot * 180) / Math.PI);
    return [DISP_PRISM_AT[0] + q.x / 100, y, DISP_PRISM_AT[2] - q.y / 100];
  };
  const O = L(sh.O);
  const sx = screenX(d.dist);
  const tex = useMemo(() => liveTex(512, 160), []);
  const key = `${d.i}|${d.slit}|${d.dark}|${d.filter}|${d.dist}|${v.seed}|${v.n}`;
  useEffect(() => tex.redraw((g, w, h) => drawSpectrum(g, v, d, w, h)), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const fans = DISP_COLOURS.filter((c) => dispPasses(d.filter, c.id)).map((c) => {
    const ray = prismRay(sh, dispIndex(v, c.lambda), d.i);
    if (!ray.Q || !ray.dOut) return null;
    const Q = L(ray.Q);
    const dir = pinsRot(ray.dOut, (-rot * 180) / Math.PI);
    const t = (sx - Q[0]) / Math.max(1e-3, dir.x / 100);
    const end: V3 = [sx, 0.02, Q[2] - (dir.y / 100) * t];
    return { c, Q, end };
  });
  const seg = (a: V3, b: V3) => {
    const dx = b[0] - a[0];
    const dz = b[2] - a[2];
    const len = Math.hypot(dx, dz);
    return { pos: [(a[0] + b[0]) / 2, a[1], (a[2] + b[2]) / 2] as V3, len, yaw: Math.atan2(-dz, dx) };
  };
  const beam = seg([DISP_BOX_AT[0] + 0.07, 0.02, DISP_BOX_AT[2]], O);
  const w = d.slit === 'narrow' ? 0.0015 : 0.006;
  return (
    <group>
      {d.dark && (
        <mesh geometry={box} material={darkMat} position={[0, 0.6, 0.3]} scale={[BENCH.w + 0.4, 1.6, BENCH.d + 1.6]} renderOrder={-1} />
      )}
      {scene.collected.has('raybox') && (
        <Interactive id="raybox" label={`Ray box (${d.slit} slit)`} bench position={DISP_BOX_AT} labelY={0.1}>
          {(active) => (
            <group>
              <mesh geometry={box} material={mat.darkMetal()} position={[0, 0.03, 0]} scale={[0.12, 0.06, 0.08]} />
              <mesh geometry={box} material={mat.black()} position={[0.061, 0.03, 0]} scale={[0.002, 0.05, 0.06]} />
              <mesh geometry={box} material={beamMat} position={[0.0625, 0.02, 0]} scale={[0.001, 0.03, d.slit === 'narrow' ? 0.002 : 0.008]} />
              <BlobShadow r={0.08} />
              {active && <GlowRing r={0.08} />}
            </group>
          )}
        </Interactive>
      )}
      {scene.collected.has('raybox') && scene.collected.has('prism') && (
        <mesh geometry={box} material={beamMat} position={beam.pos} rotation={[0, beam.yaw, 0]} scale={[beam.len, 0.002, w]} />
      )}
      {scene.collected.has('filters') && d.filter !== 'none' && (
        <mesh geometry={box} position={[DISP_BOX_AT[0] + 0.12, 0.025, DISP_BOX_AT[2]]} scale={[0.003, 0.05, 0.05]}>
          <meshStandardMaterial color={d.filter === 'red' ? '#e53935' : d.filter === 'green' ? '#43a047' : '#1e88e5'} transparent opacity={0.6} />
        </mesh>
      )}
      {scene.collected.has('filters') && (
        <Interactive id="filters" label="Colour filters" bench position={[DISP_BOX_AT[0], 0, DISP_BOX_AT[2] + 0.16]} labelY={0.05}>
          {(active) => (
            <group>
              {['#e53935', '#43a047', '#1e88e5'].map((c, k) => (
                <mesh key={c} geometry={box} position={[-0.04 + k * 0.04, 0.003, 0]} scale={[0.035, 0.004, 0.035]}>
                  <meshStandardMaterial color={c} transparent opacity={0.7} />
                </mesh>
              ))}
              {active && <GlowRing r={0.07} />}
            </group>
          )}
        </Interactive>
      )}
      {scene.collected.has('turntable') && (
        <Interactive id="turntable" label="Turntable" bench position={[DISP_PRISM_AT[0], 0, DISP_PRISM_AT[2]]} labelY={0.08}>
          {(active) => (
            <group>
              <mesh geometry={cyl} material={mat.darkMetal()} position={[0, 0.006, 0]} scale={[0.07, 0.012, 0.07]} />
              {active && <GlowRing r={0.08} />}
            </group>
          )}
        </Interactive>
      )}
      {scene.collected.has('prism') && (
        <group position={[DISP_PRISM_AT[0], 0.012, DISP_PRISM_AT[2]]} rotation={[0, -rot, 0]}>
          <Interactive id="prism" label="Triangular prism on the turntable" bench labelY={0.08}>
            {(active) => (
              <group>
                <mesh geometry={geo} material={glassMat} rotation={[-Math.PI / 2, 0, 0]} />
                {active && <GlowRing r={0.05} />}
              </group>
            )}
          </Interactive>
        </group>
      )}
      {scene.collected.has('prism') &&
        scene.collected.has('raybox') &&
        fans.map((f) => {
          if (!f) return null;
          const sgm = seg(f.Q, f.end);
          return (
            <mesh key={f.c.id} geometry={box} position={sgm.pos} rotation={[0, sgm.yaw, 0]} scale={[sgm.len, 0.0015, d.slit === 'narrow' ? 0.001 : 0.004]}>
              <meshBasicMaterial color={f.c.css} toneMapped={false} transparent opacity={d.dark ? 0.85 : 0.35} />
            </mesh>
          );
        })}
      {scene.collected.has('screen') && (
        <Interactive id="screen" label={`White screen (${d.dist} cm away)`} bench position={[sx + 0.01, 0, DISP_PRISM_AT[2] - 0.02]} labelY={0.2}>
          {(active) => (
            <group rotation={[0, -Math.PI / 2, 0]}>
              <mesh geometry={box} material={mat.darkMetal()} position={[0, 0.005, 0.005]} scale={[0.1, 0.01, 0.04]} />
              <mesh position={[0, 0.09, 0]}>
                <planeGeometry args={[0.32, 0.1]} />
                <meshBasicMaterial map={tex.texture} toneMapped={false} side={DoubleSide} />
              </mesh>
              {screenOn && active && <GlowRing r={0.12} />}
              {active && <GlowRing r={0.1} />}
            </group>
          )}
        </Interactive>
      )}
      <Interactive id="curtain" label={d.dark ? 'Lights (the room is dark)' : 'Curtains and lights'} bench position={[-1.05, 0, -0.3]} labelY={0.25}>
        {(active) => (
          <group>
            <mesh geometry={box} material={mat.white()} position={[0, 0.06, 0]} scale={[0.06, 0.12, 0.02]} />
            <mesh geometry={box} material={d.dark ? mat.black() : mat.red()} position={[0, 0.07, 0.012]} scale={[0.02, 0.04, 0.006]} />
            {active && <GlowRing r={0.06} />}
          </group>
        )}
      </Interactive>
    </group>
  );
}

// ------------------------------------------------------------------ the bench and cupboard

const EXTRA_MODELS: Partial<Record<ApparatusId, React.ReactNode>> = {
  prism: (
    <mesh material={glassMat} position={[0, 0.012, 0]}>
      <cylinderGeometry args={[0.035, 0.035, 0.025, 3]} />
    </mesh>
  ),
  mirror: (
    <group>
      <mesh geometry={box} material={mat.steel()} position={[0, 0.025, 0]} scale={[0.1, 0.05, 0.003]} />
      <mesh geometry={box} material={mat.wood()} position={[0, 0.004, 0.004]} scale={[0.1, 0.008, 0.02]} />
    </group>
  ),
  lens: (
    <mesh material={glassMat} position={[0, 0.04, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.25, 1]}>
      <sphereGeometry args={[0.03, 20, 12]} />
    </mesh>
  ),
};

export function Station({ v, task, state, scene, interactive, onPaper, card }: { v: PhyPinsVariant; task: PinsTask; state: PhyPinsState; scene: SceneState; interactive: boolean; onPaper: (p: PinsPoint) => void; card: string[] }) {
  const viewing = useBench((b) => b.viewing);
  const board = task === 'MIRROR' || task === 'PRISM';
  const { t } = shownTrace(state, viewing);
  const used = t && board ? (['p1', 'p2', 'p3', 'p4'] as PinId[]).filter((id) => pinPoint(v, task, t, id)) : [];
  const left = (['p1', 'p2', 'p3', 'p4'] as PinId[]).filter((p) => !used.includes(p));
  const usedHere = new Set<ApparatusId>(board ? ['board', 'paper', 'pins', 'protractor', 'ruler', 'pencil', task === 'MIRROR' ? 'mirror' : 'prism'] : task === 'DEPTH' ? ['blocks', 'stand', 'rule'] : ['raybox', 'prism', 'turntable', 'screen', 'filters']);
  const extras = [...scene.collected].filter((id) => !usedHere.has(id));
  const heads = task === 'MIRROR' ? ['i/°', 'r/°'] : task === 'PRISM' ? ['i/°', 'D/°'] : task === 'DEPTH' ? ['real/cm', 'apparent/cm'] : ['colour', 'D/°'];
  return (
    <group position={STATION}>
      <Interactive id="mybench" label="Your bench" labelY={0.5}>
        <mesh position={[0, 0.005, 0]}>
          <boxGeometry args={[BENCH.w, 0.01, BENCH.d]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>
      <CardAndBook cardAt={SPOT.card} bookAt={SPOT.book} title={task === 'MIRROR' ? 'Plane mirror' : task === 'PRISM' ? 'Prism' : task === 'DEPTH' ? 'Real & apparent depth' : 'Dispersion'} lines={card} bookTitle="Light — pin method" heads={heads} />
      {board && scene.collected.has('board') && <BoardStation v={v} task={task} state={state} scene={scene} interactive={interactive} onPaper={onPaper} />}
      {board && scene.collected.has('pins') && <PinBox left={left} />}
      {task === 'DEPTH' && <DepthStation v={v} state={state} scene={scene} />}
      {task === 'DISP' && <DispStation v={v} state={state} scene={scene} />}
      {extras.map((id, k) => (
        <Interactive key={id} id={id} label={APPARATUS_LABEL[id]} bench position={[SPOT.extras[0] + (k % 2) * 0.16, 0, SPOT.extras[2] - Math.floor(k / 2) * 0.16]} labelY={0.08}>
          {(active) => (
            <group>
              {EXTRA_MODELS[id] ?? <mesh geometry={box} material={mat.cabinet()} position={[0, 0.02, 0]} scale={[0.08, 0.04, 0.06]} />}
              <BlobShadow r={0.06} />
              {active && <GlowRing r={0.07} />}
            </group>
          )}
        </Interactive>
      ))}
    </group>
  );
}

const SLOTS: CupboardSlot[] = [
  { id: 'board', label: APPARATUS_LABEL.board, shelf: 0, x: -0.75, z: 0.02, model: <mesh geometry={box} material={mat.wood()} position={[0, 0.19, -0.1]} rotation={[0.08, 0, 0]} scale={[0.34, 0.38, 0.014]} /> },
  { id: 'paper', label: APPARATUS_LABEL.paper, shelf: 0, x: -0.35, model: <mesh geometry={box} material={mat.white()} position={[0, 0.02, 0]} scale={[0.22, 0.04, 0.3]} /> },
  { id: 'blocks', label: APPARATUS_LABEL.blocks, shelf: 0, x: 0.05, model: <mesh geometry={box} material={glassMat} position={[0, 0.05, 0]} scale={[0.1, 0.1, 0.065]} />, grip: [[0.12, 0.12, 0.08], [0, 0.05, 0]] },
  { id: 'stand', label: APPARATUS_LABEL.stand, shelf: 0, x: 0.4, model: <group><mesh geometry={box} material={mat.darkMetal()} position={[0, 0.005, 0]} scale={[0.1, 0.01, 0.12]} /><mesh geometry={cyl} material={mat.metal()} position={[0, 0.15, 0]} scale={[0.005, 0.3, 0.005]} /></group>, grip: [[0.12, 0.3, 0.12], [0, 0.15, 0]] },
  { id: 'raybox', label: APPARATUS_LABEL.raybox, shelf: 0, x: 0.75, model: <mesh geometry={box} material={mat.darkMetal()} position={[0, 0.03, 0]} scale={[0.12, 0.06, 0.08]} /> },
  { id: 'mirror', label: APPARATUS_LABEL.mirror, shelf: 1, x: -0.75, model: EXTRA_MODELS.mirror, grip: [[0.12, 0.07, 0.04], [0, 0.03, 0]] },
  { id: 'prism', label: APPARATUS_LABEL.prism, shelf: 1, x: -0.5, model: EXTRA_MODELS.prism, grip: [[0.08, 0.05, 0.08], [0, 0.02, 0]] },
  { id: 'pins', label: APPARATUS_LABEL.pins, shelf: 1, x: -0.25, model: <mesh geometry={box} material={mat.red()} position={[0, 0.01, 0]} scale={[0.07, 0.02, 0.05]} />, grip: [[0.09, 0.05, 0.07], [0, 0.02, 0]] },
  { id: 'protractor', label: APPARATUS_LABEL.protractor, shelf: 1, x: 0.02, model: <Protractor r={0.07} down={false} />, grip: [[0.15, 0.08, 0.03], [0, 0.04, 0]] },
  { id: 'turntable', label: APPARATUS_LABEL.turntable, shelf: 1, x: 0.3, model: <mesh geometry={cyl} material={mat.darkMetal()} position={[0, 0.006, 0]} scale={[0.06, 0.012, 0.06]} /> },
  { id: 'filters', label: APPARATUS_LABEL.filters, shelf: 1, x: 0.55, model: <mesh geometry={box} position={[0, 0.003, 0]} scale={[0.1, 0.006, 0.04]}><meshStandardMaterial color="#e53935" transparent opacity={0.7} /></mesh>, grip: [[0.12, 0.04, 0.06], [0, 0.01, 0]] },
  { id: 'lens', label: APPARATUS_LABEL.lens, shelf: 1, x: 0.8, model: EXTRA_MODELS.lens, grip: [[0.07, 0.09, 0.05], [0, 0.04, 0]] },
  { id: 'ruler', label: APPARATUS_LABEL.ruler, shelf: 2, x: -0.7, model: <Rule cm={30} width={0.03} />, grip: [[0.32, 0.03, 0.05], [0.15, 0.01, 0]] },
  { id: 'pencil', label: APPARATUS_LABEL.pencil, shelf: 2, x: -0.3, model: <mesh geometry={cyl} material={mat.wood()} rotation={[0, 0, Math.PI / 2]} position={[0, 0.004, 0]} scale={[0.004, 0.15, 0.004]} />, grip: [[0.16, 0.03, 0.04], [0, 0.01, 0]] },
  { id: 'rule', label: APPARATUS_LABEL.rule, shelf: 2, x: 0.05, model: <Rule cm={50} width={0.028} />, grip: [[0.5, 0.03, 0.05], [0.25, 0.01, 0]] },
  { id: 'screen', label: APPARATUS_LABEL.screen, shelf: 2, x: 0.7, model: <mesh geometry={box} material={mat.white()} position={[0, 0.06, 0]} scale={[0.2, 0.12, 0.01]} /> },
];
export function PinsCupboard({ scene }: { scene: SceneState }) {
  return <CupboardItems slots={SLOTS} collected={scene.collected} />;
}
