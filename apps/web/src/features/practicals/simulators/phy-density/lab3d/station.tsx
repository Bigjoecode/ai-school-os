import { floatReading, floatUpright, sbReading, type CalObj, type PhyDensityState } from '@aischool/shared';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, type ReactNode } from 'react';
import { BoxGeometry, CylinderGeometry, DodecahedronGeometry, DoubleSide, LatheGeometry, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry, Vector2, type Group, type Material } from 'three';
import { Beaker, BlobShadow, GlowRing } from '../../../lab3d-kit/apparatus';
import { Interactive } from '../../../lab3d-kit/interact';
import { BENCH, STATION } from '../../../lab3d-kit/layout';
import { liquidMaterial, mat } from '../../../lab3d-kit/materials';
import { CardAndBook, CupboardItems, type CupboardSlot } from '../../phy-common/lab3d/common';
import { canvasTex, FONT } from '../../phy-common/lab3d/tex';
import { canDeficit, type Density } from '../actions';
import { calShown } from '../index';
import { dragFor } from './drag';
import { APPARATUS_LABEL, type ApparatusId, type SceneState } from './scene-state';
import { BALANCE, BEAKERS, BOTTLE, CALS, CAN, CATCH, CLOTH, CYL, hangX, SALT, SB, SHOT, SPOT, STAND, THERMO, TUBE3, type V3 } from './views';

/**
 * The density bench. Calipers: the vernier (its main scale and sliding vernier
 * plate drawn to scale, the jaw where the reading puts it) or the micrometer
 * (sleeve scale, the thimble turned to the reading) held up in a holder, the
 * object between the jaws, the others on a cloth. Archimedes: the stand and
 * spring balance (its pointer at the reading), the stone on its thread at the
 * depth chosen, the eureka can with its water level and spout, the catch
 * beaker, the salt solution, any spill. Flotation: the tall cylinder with the
 * loaded tube floating at its true depth (drifting to the wall, or sunk), the
 * lead shot. Density bottle: the bottle with its contents and stopper, the
 * beakers, dropper, tissue and thermometer. The triple-beam balance with its
 * riders, used by all but the calipers.
 */

const box = new BoxGeometry(1, 1, 1);
const cyl = new CylinderGeometry(1, 1, 1, 24);
const sph = new SphereGeometry(1, 12, 8);
const stoneGeo = new DodecahedronGeometry(1, 0);
const steel = new MeshStandardMaterial({ color: '#c9cfd4', roughness: 0.25, metalness: 0.9 });
const chrome = new MeshStandardMaterial({ color: '#dfe4e8', roughness: 0.15, metalness: 1 });
const frameMat = new MeshStandardMaterial({ color: '#2f4a6b', roughness: 0.5, metalness: 0.4 });
const stoneMat = new MeshStandardMaterial({ color: '#8d8a84', roughness: 0.95 });
const woodCyl = new MeshStandardMaterial({ color: '#c99a5b', roughness: 0.8 });
const copperMat = new MeshStandardMaterial({ color: '#c27a4a', roughness: 0.35, metalness: 0.8 });
const marbleMat = new MeshStandardMaterial({ color: '#7fc8e8', roughness: 0.05, transparent: true, opacity: 0.8 });
const clothMat = new MeshStandardMaterial({ color: '#e8e2d0', roughness: 1 });
const glass = new MeshStandardMaterial({ color: '#e3f4fb', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.3, depthWrite: false, side: DoubleSide });
const water = liquidMaterial('#5aa9e6', 0.42);
const saltMat = liquidMaterial('#d9cfc1', 0.5);
const leadMat = new MeshStandardMaterial({ color: '#56606a', roughness: 0.5, metalness: 0.6 });
const sandMat = new MeshStandardMaterial({ color: '#c8a165', roughness: 1 });
const threadMat = new MeshBasicMaterial({ color: '#d6c7a1' });
const riderMat = new MeshStandardMaterial({ color: '#c62828', roughness: 0.4 });
const zeroMat = new MeshBasicMaterial({ color: '#16a34a' });
const bubbleMat = new MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, roughness: 0.1 });

function B({ p, s, m, r }: { p: V3; s: V3; m: Material; r?: V3 }) {
  return <mesh geometry={box} material={m} position={p} scale={s} rotation={r} />;
}
function C({ p, r, h, m, rot }: { p: V3; r: number; h: number; m: Material; rot?: V3 }) {
  return <mesh geometry={cyl} material={m} position={p} scale={[r, h, r]} rotation={rot} />;
}
const tick = (g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, w: number) => {
  g.lineWidth = w;
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke();
};

// ------------------------------------------------------------------ textures

/** The vernier's main scale: −1 to 16 cm in mm (128 px/cm). */
const mainScaleTex = () =>
  canvasTex('dens-main', 2176, 96, (g, w, h) => {
    g.fillStyle = '#dfe3e6';
    g.fillRect(0, 0, w, h);
    g.fillStyle = g.strokeStyle = '#151515';
    for (let mm = 0; mm <= 160; mm++) {
      const x = 128 + mm * 12.8;
      tick(g, x, h, x, h - (mm % 10 === 0 ? 40 : mm % 5 === 0 ? 30 : 20), mm % 10 === 0 ? 2.6 : 1.4);
      if (mm % 10 === 0) {
        g.font = `700 30px ${FONT}`;
        g.textAlign = 'center';
        g.fillText(String(mm / 10), x, 34);
      }
    }
  });
/** The vernier plate: ten divisions over 9 mm (zero 24 px from the left; 12.8 px/mm). */
const vernierTex = () =>
  canvasTex('dens-vernier', 192, 64, (g, w, h) => {
    g.fillStyle = '#c9ced2';
    g.fillRect(0, 0, w, h);
    g.fillStyle = g.strokeStyle = '#151515';
    for (let i = 0; i <= 10; i++) {
      const x = 24 + i * 0.9 * 12.8;
      tick(g, x, 0, x, i % 5 === 0 ? 26 : 16, i % 5 === 0 ? 2 : 1.2);
      if (i % 5 === 0) {
        g.font = `700 18px ${FONT}`;
        g.textAlign = 'center';
        g.fillText(String(i), x, 46);
      }
    }
  });
/** The micrometer sleeve: 0–25 mm, whole mm above the datum, half mm below (40 px/mm). */
const sleeveTex = () =>
  canvasTex('dens-sleeve', 1040, 96, (g, w, h) => {
    g.fillStyle = '#d7dbde';
    g.fillRect(0, 0, w, h);
    g.fillStyle = g.strokeStyle = '#151515';
    tick(g, 0, h / 2, w, h / 2, 2);
    for (let hm = 0; hm <= 50; hm++) {
      const x = 20 + hm * 20;
      if (hm % 2 === 0) tick(g, x, h / 2, x, h / 2 - 22, 2);
      else tick(g, x, h / 2, x, h / 2 + 18, 1.6);
      if (hm % 10 === 0) {
        g.font = `700 20px ${FONT}`;
        g.textAlign = 'center';
        g.fillText(String(hm / 2), x, 18);
      }
    }
  });
/** The thimble: 50 divisions round it. */
const thimbleTex = () =>
  canvasTex('dens-thimble', 1000, 64, (g, w, h) => {
    g.fillStyle = '#c4c9cd';
    g.fillRect(0, 0, w, h);
    g.fillStyle = g.strokeStyle = '#151515';
    for (let d = 0; d < 50; d++) {
      const x = (d / 50) * w;
      tick(g, x, 0, x, d % 5 === 0 ? 30 : 18, d % 5 === 0 ? 2.4 : 1.4);
      if (d % 5 === 0) {
        g.font = `700 18px ${FONT}`;
        g.textAlign = 'center';
        g.fillText(String(d), x + 2, 52);
      }
    }
  });
/** The spring balance's scale 0–10 N (0.1 N divisions; 30 px per N). */
const sbScaleTex = () =>
  canvasTex('dens-sb', 96, 340, (g, w, h) => {
    g.fillStyle = '#f7f3e6';
    g.fillRect(0, 0, w, h);
    g.fillStyle = g.strokeStyle = '#151515';
    for (let d = 0; d <= 100; d++) {
      const y = 12 + d * 3.1;
      tick(g, 0, y, d % 10 === 0 ? 30 : d % 5 === 0 ? 22 : 13, y, d % 10 === 0 ? 2 : 1);
      if (d % 10 === 0) {
        g.font = `700 18px ${FONT}`;
        g.fillText(String(d / 10), 40, y + 6);
      }
    }
  });
/** The flotation tube's paper scale 0–20 cm (40 px/cm). */
const tubeScaleTex = () =>
  canvasTex('dens-tubescale', 64, 820, (g, w, h) => {
    g.fillStyle = '#fffef4';
    g.fillRect(0, 0, w, h);
    g.fillStyle = g.strokeStyle = '#151515';
    for (let mm = 0; mm <= 200; mm++) {
      const y = h - 10 - mm * 4;
      tick(g, 0, y, mm % 10 === 0 ? 26 : mm % 5 === 0 ? 18 : 10, y, mm % 10 === 0 ? 2 : 1);
      if (mm % 10 === 0) {
        g.font = `700 16px ${FONT}`;
        g.fillText(String(mm / 10), 30, y + 6);
      }
    }
  });
/** The thermometer's scale 0–50 °C (1 °C divisions, 14 px each). */
const thermoTex = () =>
  canvasTex('dens-thermo', 64, 740, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    g.fillStyle = g.strokeStyle = '#151515';
    for (let c = 0; c <= 50; c++) {
      const y = h - 20 - c * 14;
      tick(g, 0, y, c % 5 === 0 ? 24 : 12, y, c % 5 === 0 ? 2 : 1);
      if (c % 10 === 0) {
        g.font = `700 16px ${FONT}`;
        g.fillText(String(c), 28, y + 6);
      }
    }
  });

// ------------------------------------------------------------------ calipers

const OBJ_SIZE_M = (o: Density, obj: CalObj | null, inside: boolean) => (obj ? (obj === 'ball' || obj === 'wire' ? o.v[obj][0]! / 1000 : obj === 'tube' ? (inside ? o.v.tubeDi : o.v.tubeD) / 100 : o.v[obj][0]! / 100) : 0);
function ObjModel({ obj, d }: { obj: CalObj; d: number }) {
  if (obj === 'cyl') return <C p={[0, 0, 0]} r={d / 2} h={0.05} m={woodCyl} rot={[Math.PI / 2, 0, 0]} />;
  if (obj === 'wire') return <C p={[0, 0, 0]} r={d / 2} h={0.08} m={copperMat} rot={[Math.PI / 2, 0, 0]} />;
  if (obj === 'tube') return <C p={[0, 0, 0]} r={d / 2} h={0.06} m={glass} rot={[Math.PI / 2, 0, 0]} />;
  return <mesh geometry={sph} material={obj === 'ball' ? chrome : marbleMat} scale={d / 2} />;
}

/** The vernier calipers upright, the scale facing you: the beam along x (main scale 0 at x = 0), jaws pointing down. */
function VernierModel({ o, s, live }: { o: Density; s: PhyDensityState; live: boolean }) {
  const jaw = useRef<Group>(null);
  const ref = useRef({ o, s });
  ref.current = { o, s };
  useFrame(() => {
    const st = ref.current.s;
    const r = live && st.tool === 'V' ? (calShown(ref.current.o.v, st) ?? 0.4) : 2;
    if (jaw.current) jaw.current.position.x = r / 100;
  });
  const main = useMemo(mainScaleTex, []);
  const vern = useMemo(vernierTex, []);
  const held = live && s.tool === 'V' ? s.held : null;
  const d = held ? OBJ_SIZE_M(o, held, s.inside) : 0;
  return (
    <group>
      {/* beam with the main scale (−1 … 16 cm) */}
      <B p={[0.075, 0, -0.002]} s={[0.19, 0.016, 0.003]} m={steel} />
      <mesh position={[0.075, 0.001, 0.0001]}>
        <planeGeometry args={[0.17, 0.0075]} />
        <meshStandardMaterial map={main} roughness={0.5} />
      </mesh>
      {/* fixed jaw */}
      <B p={[-0.003, -0.022, -0.002]} s={[0.006, 0.03, 0.003]} m={steel} />
      {/* sliding jaw with the vernier plate */}
      <group ref={jaw}>
        <B p={[0.003, -0.022, -0.002]} s={[0.006, 0.03, 0.003]} m={steel} />
        <B p={[0.008, -0.004, -0.001]} s={[0.022, 0.009, 0.004]} m={steel} />
        <mesh position={[0.0075 - 0.003 + 0.0015, -0.0045, 0.0012]}>
          <planeGeometry args={[0.015, 0.005]} />
          <meshStandardMaterial map={vern} roughness={0.5} />
        </mesh>
      </group>
      {held && held !== 'tube' && (
        <group position={[d / 2, -0.03, 0]}>
          <ObjModel obj={held} d={d} />
        </group>
      )}
      {held === 'tube' && (
        <group position={[s.inside ? d / 2 : d / 2, -0.03, 0]}>
          <ObjModel obj="tube" d={o.v.tubeD / 100} />
        </group>
      )}
    </group>
  );
}

/** The micrometer upright, the sleeve facing you: anvil at x = 0, the spindle and thimble out along +x. */
function MicrometerModel({ o, s, live }: { o: Density; s: PhyDensityState; live: boolean }) {
  const spindle = useRef<Group>(null);
  const thimble = useRef<Group>(null);
  const ref = useRef({ o, s });
  ref.current = { o, s };
  useFrame(() => {
    const st = ref.current.s;
    const r = live && st.tool === 'M' ? (calShown(ref.current.o.v, st) ?? 0.8) : 4; // mm
    if (spindle.current) spindle.current.position.x = r / 1000;
    if (thimble.current) thimble.current.rotation.x = -(((r % 0.5) + 0.5) % 0.5) / 0.5 * Math.PI * 2;
  });
  const sleeve = useMemo(sleeveTex, []);
  const thim = useMemo(thimbleTex, []);
  const held = live && s.tool === 'M' ? s.held : null;
  const d = held ? OBJ_SIZE_M(o, held, false) : 0;
  return (
    <group>
      {/* the U frame */}
      <B p={[-0.008, -0.02, -0.001]} s={[0.008, 0.05, 0.008]} m={frameMat} />
      <B p={[0.016, -0.042, -0.001]} s={[0.05, 0.008, 0.008]} m={frameMat} />
      <B p={[0.038, -0.024, -0.001]} s={[0.01, 0.03, 0.008]} m={frameMat} />
      <C p={[-0.002, 0, 0]} r={0.003} h={0.006} m={chrome} rot={[0, 0, Math.PI / 2]} />
      {/* spindle, sleeve (fixed) and thimble (moves and turns with the reading) */}
      <group ref={spindle}>
        <C p={[0.02, 0, 0]} r={0.003} h={0.04} m={chrome} rot={[0, 0, Math.PI / 2]} />
        <group position={[0.068, 0, 0]}>
          <group ref={thimble}>
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.0065, 0.0065, 0.024, 40, 1, true]} />
              <meshStandardMaterial map={thim} roughness={0.5} metalness={0.3} />
            </mesh>
          </group>
          <C p={[0.016, 0, 0]} r={0.004} h={0.01} m={steel} rot={[0, 0, Math.PI / 2]} />
        </group>
      </group>
      <C p={[0.052, 0, 0]} r={0.0055} h={0.03} m={steel} rot={[0, 0, Math.PI / 2]} />
      <mesh position={[0.052, 0, 0.0058]}>
        <planeGeometry args={[0.03, 0.006]} />
        <meshStandardMaterial map={sleeve} roughness={0.5} />
      </mesh>
      {held && (
        <group position={[d / 2, 0, 0]}>
          <ObjModel obj={held} d={d} />
        </group>
      )}
    </group>
  );
}

// ------------------------------------------------------------------ the balance

function BalanceModel({ o, interactive }: { o: Density; interactive: boolean }) {
  const pointer = useRef<Group>(null);
  const beams = useRef<Group>(null);
  const live = useRef(o);
  live.current = o;
  useFrame(() => {
    const t = Math.max(-1, Math.min(1, (live.current.panMass() - (live.current.riders.h * 100 + live.current.riders.t * 10 + live.current.riders.f)) / 0.6));
    if (pointer.current) pointer.current.position.y = 0.072 + t * 0.012;
    if (beams.current) beams.current.rotation.z = -t * 0.035;
  });
  const r = o.riders;
  const L = 0.24;
  const at = (frac: number) => -0.02 + frac * (L - 0.04);
  const drag = interactive ? dragFor : undefined;
  const rider = (id: 'h' | 't' | 'f', y: number, frac: number) => (
    <Interactive key={id} id={`rider-${id}`} label={id === 'h' ? '100 g rider' : id === 't' ? '10 g rider' : 'Front rider (0–10 g)'} bench labelY={0.02} position={[at(frac), y, 0.012]} drag={drag}>
      {(active) => <B p={[0, 0, 0]} s={[0.008, 0.014, 0.012]} m={active ? mat.highlight() : riderMat} />}
    </Interactive>
  );
  return (
    <group position={[BALANCE.x, 0, BALANCE.z]}>
      <Interactive id="balance" label="Triple-beam balance" bench labelY={0.14}>
        {(active) => (
          <group>
            <B p={[0.06, 0.008, 0]} s={[0.36, 0.016, 0.12]} m={active ? mat.highlight() : mat.darkMetal()} />
            <C p={[-0.09, 0.03, 0]} r={0.006} h={0.04} m={mat.steel()} />
            <C p={[-0.09, 0.052, 0]} r={0.055} h={0.004} m={mat.steel()} />
            <B p={[0.01, 0.045, -0.03]} s={[0.02, 0.06, 0.02]} m={mat.darkMetal()} />
            <B p={[0.245, 0.06, 0]} s={[0.01, 0.06, 0.03]} m={mat.white()} />
            <B p={[0.251, 0.072, 0]} s={[0.002, 0.002, 0.03]} m={zeroMat} />
            <BlobShadow r={0.2} />
          </group>
        )}
      </Interactive>
      <group ref={beams} position={[0.01, 0.075, 0]}>
        {[0, 1, 2].map((k) => (
          <B key={k} p={[0.11, -k * 0.016, 0.006 - k * 0.002]} s={[L, 0.008, 0.006]} m={mat.steel()} />
        ))}
        {rider('h', 0.0, r.h / 5)}
        {rider('t', -0.016, r.t / 9)}
        {rider('f', -0.032, r.f / 10)}
      </group>
      <group ref={pointer} position={[0.238, 0.072, 0.012]}>
        <B p={[0, 0, 0]} s={[0.016, 0.0016, 0.002]} m={mat.black()} />
      </group>
      <group position={[-0.09, 0.054, 0]}>
        {o.pan === 'beaker' && <Beaker liquid={o.ref.current.caught > 0 ? Math.min(0.06, o.ref.current.caught / 3000) : 0} />}
        {o.pan === 'tube' && <C p={[0, 0.01, 0]} r={TUBE3.r} h={0.02} m={glass} rot={[0, 0, Math.PI / 2]} />}
        {o.pan === 'bottle' && <BottleModel s={o.ref.current} liquid={o.v.liquid} />}
      </group>
    </group>
  );
}

// ------------------------------------------------------------------ Archimedes

function ArchRig({ o, s, scene, interactive }: { o: Density; s: PhyDensityState; scene: SceneState; interactive: boolean }) {
  const pointer = useRef<Group>(null);
  const ref = useRef({ o, s });
  ref.current = { o, s };
  const sbTex = useMemo(sbScaleTex, []);
  useFrame(() => {
    const st = ref.current.s;
    const F = st.hung ? sbReading(ref.current.o.v, { where: st.where, depth: st.depth, bubbles: st.bubbles && st.where !== 'air', zeroed: st.zeroed }) : st.zeroed ? 0 : ref.current.o.v.sbZero;
    if (pointer.current) pointer.current.position.y = SB.len / 2 - 0.012 - (Math.max(-0.2, F) / 10) * (SB.len - 0.024) * 0.92;
  });
  const hx = hangX(s);
  const top = STAND.hook;
  const stoneR = Math.cbrt((3 * o.v.stoneV) / (4 * Math.PI)) / 100;
  const stoneY = !s.hung ? 0.03 : s.where === 'air' ? CAN.base + CAN.h + 0.08 : s.where === 'water' ? CAN.base + (s.depth === 'part' ? CAN.h - 0.012 : s.depth === 'touch' ? stoneR + 0.004 : CAN.h * 0.5) : s.depth === 'touch' ? stoneR + 0.004 : SALT.h * 0.45;
  const placed = scene.placed;
  const def = canDeficit(o.v, s);
  const level = CAN.base + CAN.h - 0.025 - Math.min(0.03, def / 2500);
  return (
    <group>
      {placed.has('sbalance') && (
        <group>
          <group position={[STAND.x, 0, STAND.z]}>
            <Interactive id="sbalance" label="Spring balance on its stand" bench labelY={top + 0.12}>
              {(active) => (
                <group>
                  <B p={[0, 0.01, 0]} s={[0.16, 0.02, 0.22]} m={mat.darkMetal()} />
                  <C p={[0, 0.4, -0.06]} r={0.007} h={0.8} m={mat.steel()} />
                  {active && <GlowRing r={0.16} />}
                </group>
              )}
            </Interactive>
          </group>
          <C p={[(STAND.x + hx) / 2 + 0.01, top + 0.07, STAND.z - 0.06]} r={0.005} h={Math.abs(hx - STAND.x) + 0.08} m={mat.steel()} rot={[0, 0, Math.PI / 2]} />
          {/* the spring balance: body, scale, pointer, hook */}
          <group position={[hx, top - SB.len / 2 + 0.06, STAND.z + 0.12]}>
            <B p={[0, 0, 0]} s={[0.024, SB.len, 0.014]} m={mat.white()} />
            <mesh position={[0.002, 0, 0.0072]}>
              <planeGeometry args={[0.014, SB.len - 0.01]} />
              <meshStandardMaterial map={sbTex} roughness={0.6} />
            </mesh>
            <group ref={pointer}>
              <B p={[-0.004, 0, 0.008]} s={[0.012, 0.0016, 0.002]} m={riderMat} />
            </group>
            <C p={[0, -SB.len / 2 - 0.015, 0]} r={0.0012} h={0.03} m={mat.steel()} />
          </group>
          <mesh material={threadMat} position={[hx, (top - SB.len + 0.03 + stoneY + stoneR) / 2, STAND.z + 0.12 + (CAN.z - STAND.z - 0.12) / 2]} scale={[0.0006, Math.max(0.01, top - SB.len + 0.03 - stoneY - stoneR), 0.0006]} geometry={cyl} />
        </group>
      )}
      {/* the stone */}
      <group position={[s.hung ? hx : -0.5, stoneY, s.hung ? CAN.z : 0.2]}>
        <Interactive id="stone" label={s.hung ? 'Stone on a thread (drag down to lower)' : 'Stone tied with thread'} bench labelY={stoneR + 0.03} drag={s.hung ? (interactive ? dragFor : undefined) : undefined}>
          {(active) => (
            <group>
              <mesh geometry={stoneGeo} material={active ? mat.highlight() : stoneMat} scale={[stoneR * 1.15, stoneR * 0.85, stoneR]} />
              {s.bubbles && s.where !== 'air' && [[0.6, 0.2, 0.7], [-0.5, -0.3, 0.8], [0.1, 0.7, 0.75]].map(([x, y, z], i) => <mesh key={i} geometry={sph} material={bubbleMat} position={[x! * stoneR, y! * stoneR, z! * stoneR]} scale={0.0025} />)}
              {!s.hung && <BlobShadow r={stoneR * 1.2} y={-stoneR + 0.001} />}
            </group>
          )}
        </Interactive>
      </group>
      {/* the eureka can on its block, its spout to the right */}
      {placed.has('eureka') && (
        <group position={[CAN.x, 0, CAN.z]}>
          <Interactive id="eureka" label="Eureka can" bench labelY={CAN.base + CAN.h + 0.04}>
            {(active) => (
              <group>
                <B p={[0, CAN.base / 2, 0]} s={[0.13, CAN.base, 0.13]} m={mat.wood()} />
                <mesh material={active ? mat.highlight() : glass} position={[0, CAN.base + CAN.h / 2, 0]} renderOrder={4}>
                  <cylinderGeometry args={[CAN.r, CAN.r, CAN.h, 28, 1, true]} />
                </mesh>
                <C p={[0, CAN.base + 0.001, 0]} r={CAN.r} h={0.002} m={glass} />
                <C p={[CAN.r + 0.022, CAN.base + CAN.h - 0.03, 0]} r={0.005} h={0.05} m={glass} rot={[0, 0, Math.PI / 2 + 0.4]} />
                <BlobShadow r={0.1} />
              </group>
            )}
          </Interactive>
          <C p={[0, (CAN.base + level) / 2, 0]} r={CAN.r - 0.002} h={level - CAN.base} m={water} />
        </group>
      )}
      {scene.collected.has('catch') && o.pan !== 'beaker' && (
        <group position={s.catchUnder ? [CATCH.x, 0, CATCH.z] : [0.32, 0, 0.12]}>
          <Interactive id="catch" label="Catch beaker" bench labelY={0.1}>
            {(active) => <Beaker glow={active} liquid={s.caught > 0 ? Math.min(0.06, s.caught / 3000) : 0} />}
          </Interactive>
        </group>
      )}
      {scene.collected.has('salt') && (
        <group position={[SALT.x, 0, SALT.z]}>
          <Interactive id="salt" label="Salt solution" bench labelY={SALT.h + 0.03}>
            {(active) => (
              <group>
                <mesh material={active ? mat.highlight() : glass} position={[0, SALT.h / 2, 0]} renderOrder={4}>
                  <cylinderGeometry args={[SALT.r, SALT.r, SALT.h, 24, 1, true]} />
                </mesh>
                <C p={[0, SALT.h * 0.4, 0]} r={SALT.r - 0.002} h={SALT.h * 0.8} m={saltMat} />
                <BlobShadow r={0.06} />
              </group>
            )}
          </Interactive>
        </group>
      )}
      {s.spill && (
        <Interactive id="spill" label="Water spilt on the bench" bench position={[CATCH.x + 0.02, 0.001, CATCH.z + 0.08]} labelY={0.02}>
          {() => (
            <mesh rotation={[-Math.PI / 2, 0, 0]} material={water}>
              <circleGeometry args={[0.06, 24]} />
            </mesh>
          )}
        </Interactive>
      )}
    </group>
  );
}

// ------------------------------------------------------------------ flotation

function FloatRig({ o, s, scene }: { o: Density; s: PhyDensityState; scene: SceneState }) {
  const scaleT = useMemo(tubeScaleTex, []);
  const placed = scene.placed.has('cylinder');
  const h = s.floating && !s.sunk ? floatReading(o.v, s.load, s.touching) / 100 : 0;
  const upright = floatUpright(s.load);
  const tubeX = s.touching ? CYL.x - CYL.r + TUBE3.r + 0.002 : CYL.x;
  const tube = (
    <group>
      <mesh material={glass} position={[0, TUBE3.len / 2, 0]} renderOrder={4}>
        <cylinderGeometry args={[TUBE3.r, TUBE3.r, TUBE3.len, 20, 1, true]} />
      </mesh>
      <C p={[0, 0.0015, 0]} r={TUBE3.r} h={0.003} m={glass} />
      <mesh position={[0, TUBE3.len / 2, 0.004]}>
        <planeGeometry args={[0.009, TUBE3.len]} />
        <meshStandardMaterial map={scaleT} roughness={0.8} side={DoubleSide} />
      </mesh>
      {Array.from({ length: s.load * 4 }, (_, i) => <mesh key={i} geometry={sph} material={leadMat} position={[((i % 4) - 1.5) * 0.004, 0.005 + Math.floor(i / 4) * 0.0028, ((i * 7) % 3 - 1) * 0.003]} scale={0.0022} />)}
    </group>
  );
  return (
    <group>
      {placed && (
        <group position={[CYL.x, 0, CYL.z]}>
          <Interactive id="cylinder" label="Tall cylinder of water" bench labelY={CYL.h + 0.03}>
            {(active) => (
              <group>
                <mesh material={active ? mat.highlight() : glass} position={[0, CYL.h / 2, 0]} renderOrder={4}>
                  <cylinderGeometry args={[CYL.r, CYL.r, CYL.h, 28, 1, true]} />
                </mesh>
                <C p={[0, 0.005, 0]} r={CYL.r + 0.012} h={0.01} m={glass} />
                <BlobShadow r={0.06} />
              </group>
            )}
          </Interactive>
          <C p={[0, CYL.water / 2, 0]} r={CYL.r - 0.0015} h={CYL.water - 0.01} m={water} />
          {/* the meniscus where the water meets the tube */}
          {s.floating && upright && !s.sunk && <C p={[tubeX - CYL.x, CYL.water + o.v.meniscus / 200, 0]} r={TUBE3.r + 0.0025} h={o.v.meniscus / 100} m={water} />}
        </group>
      )}
      <group position={s.floating ? (s.sunk ? [CYL.x, 0.012, CYL.z] : upright ? [tubeX, CYL.water - h, CYL.z] : [CYL.x, CYL.water, CYL.z]) : [0.22, 0, 0.15]} rotation={s.floating && (s.sunk || !upright) ? [0, 0, s.sunk ? 0.12 : 1.35] : s.floating ? [0, 0, 0] : [0, 0, Math.PI / 2]}>
        <Interactive id="testtube" label={`Flotation tube (${s.load * 10} g of lead shot)`} bench labelY={TUBE3.len + 0.02}>
          {(active) => (
            <group>
              {tube}
              {active && <GlowRing r={0.03} />}
            </group>
          )}
        </Interactive>
      </group>
      {scene.collected.has('shot') && (
        <group position={[SHOT.x, 0, SHOT.z]}>
          <Interactive id="shot" label="Lead shot (10 g scoops)" bench labelY={0.08}>
            {(active) => (
              <group>
                <mesh material={glass} position={[0, 0.03, 0]}>
                  <cylinderGeometry args={[0.03, 0.03, 0.06, 20, 1, true]} />
                </mesh>
                <C p={[0, 0.015, 0]} r={0.028} h={0.028} m={leadMat} />
                {active && <GlowRing r={0.05} />}
              </group>
            )}
          </Interactive>
        </group>
      )}
    </group>
  );
}

// ------------------------------------------------------------------ density bottle

const bottleGeo = new LatheGeometry([new Vector2(0, 0), new Vector2(0.026, 0.002), new Vector2(0.032, 0.02), new Vector2(0.03, 0.045), new Vector2(0.014, 0.062), new Vector2(0.008, 0.068), new Vector2(0.008, 0.078)], 28);
function BottleModel({ s, liquid }: { s: PhyDensityState; liquid: string }) {
  const b = s.bottle;
  const liq = b.fill === 'water' ? water : b.fill === 'liquid' ? (liquid === 'palm oil' ? liquidMaterial('#e76f51', 0.7) : liquidMaterial('#e9c46a', 0.55)) : null;
  const top = b.toCap || s.brim ? 0.072 : 0.06;
  return (
    <group>
      <mesh geometry={bottleGeo} material={glass} renderOrder={4} />
      {b.sand > 0 && <C p={[0, (b.sand * 0.006) / 2 + 0.001, 0]} r={0.027} h={b.sand * 0.006} m={sandMat} />}
      {liq && <C p={[0, Math.min(top, 0.044) / 2 + 0.001, 0]} r={0.028} h={Math.min(top, 0.044)} m={liq} />}
      {liq && top > 0.044 && <C p={[0, (0.044 + top) / 2, 0]} r={0.009} h={top - 0.044} m={liq} />}
      {b.bubble && <mesh geometry={sph} material={bubbleMat} position={[0.012, 0.04, 0.012]} scale={0.004} />}
      <group position={s.stoppered ? [0, 0.078, 0] : [0.05, 0.004, 0.02]} rotation={s.stoppered ? [0, 0, 0] : [0, 0, Math.PI / 2]}>
        <C p={[0, 0.006, 0]} r={0.009} h={0.012} m={glass} />
        <C p={[0, 0.006, 0]} r={0.0012} h={0.012} m={b.toCap && s.stoppered && liq ? liq : mat.white()} />
      </group>
      {b.outsideWet && [0, 2, 4].map((k) => <mesh key={k} geometry={sph} material={liq ?? water} position={[Math.cos(k) * 0.031, 0.015 + k * 0.004, Math.sin(k) * 0.031]} scale={0.0022} />)}
      <BlobShadow r={0.04} />
    </group>
  );
}

function BottleRig({ o, s, scene }: { o: Density; s: PhyDensityState; scene: SceneState }) {
  const tex = useMemo(thermoTex, []);
  const col = useRef<Group>(null);
  return (
    <group>
      {o.pan !== 'bottle' && (
        <group position={[BOTTLE.x, 0, BOTTLE.z]}>
          <Interactive id="bottle" label="Density bottle" bench labelY={0.1}>
            {(active) => (
              <group>
                <BottleModel s={s} liquid={o.v.liquid} />
                {active && <GlowRing r={0.05} />}
              </group>
            )}
          </Interactive>
        </group>
      )}
      {scene.collected.has('liquids') && (
        <>
          <group position={BEAKERS.water}>
            <Interactive id="liquids" label="Beaker of distilled water" bench labelY={0.1}>
              {(active) => <Beaker glow={active} liquid={0.05} scale={1.3} />}
            </Interactive>
          </group>
          <group position={BEAKERS.liquid}>
            <Interactive id="liquids" label={`Beaker of ${o.v.liquid}`} bench labelY={0.1}>
              {(active) => (
                <group>
                  <Beaker glow={active} scale={1.3} />
                  <C p={[0, 0.034, 0]} r={0.033} h={0.06} m={o.v.liquid === 'palm oil' ? liquidMaterial('#e76f51', 0.7) : liquidMaterial('#e9c46a', 0.55)} />
                </group>
              )}
            </Interactive>
          </group>
        </>
      )}
      {scene.collected.has('dropper') && (
        <Interactive id="dropper" label="Dropper" bench position={[-0.18, 0.006, 0.12]} labelY={0.03}>
          {() => (
            <group rotation={[0, 0.4, Math.PI / 2]}>
              <C p={[0, 0.03, 0]} r={0.004} h={0.06} m={glass} />
              <C p={[0, 0.068, 0]} r={0.006} h={0.018} m={mat.red()} />
            </group>
          )}
        </Interactive>
      )}
      {scene.collected.has('sand') && (
        <Interactive id="sand" label="Dish of dry sand" bench position={[-0.2, 0, -0.18]} labelY={0.05}>
          {() => (
            <group>
              <C p={[0, 0.008, 0]} r={0.05} h={0.016} m={glass} />
              <C p={[0, 0.008, 0]} r={0.045} h={0.012} m={sandMat} />
            </group>
          )}
        </Interactive>
      )}
      {scene.collected.has('thermometer') && (
        <group position={[THERMO.x, 0, THERMO.z]}>
          <Interactive id="thermometer" label="Thermometer" bench labelY={0.4}>
            {(active) => (
              <group>
                <B p={[0, 0.01, 0]} s={[0.1, 0.02, 0.1]} m={mat.darkMetal()} />
                <C p={[-0.03, 0.2, -0.02]} r={0.005} h={0.4} m={mat.steel()} />
                <group position={[0, 0.2, 0]}>
                  <mesh position={[0, 0, 0]}>
                    <planeGeometry args={[0.022, 0.3]} />
                    <meshStandardMaterial map={tex} roughness={0.6} />
                  </mesh>
                  <C p={[-0.007, -0.15 + 0.004, 0.002]} r={0.003} h={0.008} m={mat.red()} />
                  <group ref={col}>
                    <B p={[-0.007, -0.15 + 0.004 + ((20 + o.v.tempC * 14) / 740) * 0.3 / 2, 0.002]} s={[0.0016, ((20 + o.v.tempC * 14) / 740) * 0.3, 0.001]} m={mat.red()} />
                  </group>
                </group>
                {active && <GlowRing r={0.06} />}
              </group>
            )}
          </Interactive>
        </group>
      )}
    </group>
  );
}

// ------------------------------------------------------------------ the bench

function Extra({ id }: { id: ApparatusId }) {
  switch (id) {
    case 'vernier':
      return <B p={[0.08, 0.002, 0]} s={[0.19, 0.004, 0.03]} m={steel} />;
    case 'micrometer':
      return (
        <group>
          <B p={[0.02, 0.004, 0]} s={[0.06, 0.008, 0.04]} m={frameMat} />
          <C p={[0.06, 0.006, 0]} r={0.006} h={0.05} m={steel} rot={[0, 0, Math.PI / 2]} />
        </group>
      );
    case 'sbalance':
      return <B p={[0, 0.006, 0]} s={[0.16, 0.012, 0.03]} m={mat.white()} />;
    case 'eureka':
      return <C p={[0, 0.07, 0]} r={0.05} h={0.14} m={glass} />;
    case 'cylinder':
      return <C p={[0, 0.17, 0]} r={0.035} h={0.34} m={glass} />;
    case 'tissue':
      return <B p={[0, 0.006, 0]} s={[0.1, 0.012, 0.08]} m={mat.white()} />;
    case 'magnet':
      return (
        <group>
          <B p={[-0.025, 0.006, 0]} s={[0.05, 0.012, 0.015]} m={mat.red()} />
          <B p={[0.025, 0.006, 0]} s={[0.05, 0.012, 0.015]} m={mat.darkMetal()} />
        </group>
      );
    case 'prism':
      return <C p={[0, 0.02, 0]} r={0.025} h={0.04} m={glass} />;
    default:
      return <B p={[0, 0.01, 0]} s={[0.06, 0.02, 0.05]} m={mat.cabinet()} />;
  }
}

/** Everything on the student's bench. */
export function Station({ o, state: s, scene, interactive, card }: { o: Density; state: PhyDensityState; scene: SceneState; interactive: boolean; card: string[] }) {
  const task = scene.task;
  const has = (id: ApparatusId) => scene.collected.has(id);
  const calsX = task === 'FLOAT' ? CALS.x - 0.45 : CALS.x;
  const inHolder: 'V' | 'M' | null = s.tool;
  const waiting = (['sbalance', 'eureka', 'cylinder'] as ApparatusId[]).filter((id) => has(id) && !scene.placed.has(id));
  const extras = (['magnet', 'prism'] as ApparatusId[]).filter(has);
  const objs: CalObj[] = ['cyl', 'ball', 'marble', 'wire'];
  const lying = (id: 'vernier' | 'micrometer', at: V3, rot: V3, node: ReactNode) => (
    <Interactive key={id} id={id} label={APPARATUS_LABEL[id]} bench position={at} rotation={rot} labelY={0.04}>
      {(active) => (
        <group>
          {node}
          {active && <GlowRing r={0.08} />}
        </group>
      )}
    </Interactive>
  );
  return (
    <group position={STATION}>
      <Interactive id="mybench" label="Your bench" labelY={0.5}>
        <mesh position={[0, 0.005, 0]}>
          <boxGeometry args={[BENCH.w, 0.01, BENCH.d]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>
      <CardAndBook cardAt={SPOT.card} bookAt={SPOT.book} title={task === 'CAL' ? 'Vernier & micrometer' : task === 'ARCH' ? 'Archimedes' : task === 'FLOAT' ? 'Flotation' : 'Density bottle'} lines={card} bookTitle={task === 'CAL' ? 'Measurement' : task === 'ARCH' ? 'Relative density' : task === 'FLOAT' ? 'Law of flotation' : 'Density bottle'} heads={task === 'CAL' ? ['zero', 'd₁', 'd₂', 'd₃', 'mean'] : task === 'ARCH' ? ['W₁/N', 'W₂/N', 'W₃/N'] : task === 'FLOAT' ? ['m/g', 'h/cm'] : ['m₁/g', 'm₂/g', 'm₃/g']} />
      {/* the calipers: the one in use stands in its holder, facing you */}
      {(task === 'CAL' || task === 'FLOAT') && (
        <>
          {inHolder && (
            <group position={[calsX, 0, CALS.z]}>
              <B p={[0, 0.006, 0]} s={[0.08, 0.012, 0.06]} m={mat.darkMetal()} />
              <C p={[0, CALS.y / 2, -0.01]} r={0.004} h={CALS.y} m={mat.steel()} />
              <group position={[inHolder === 'V' ? -0.06 : -0.03, CALS.y, 0]}>
                <Interactive id={inHolder === 'V' ? 'vernier' : 'micrometer'} label={inHolder === 'V' ? 'Vernier calipers (in use)' : 'Micrometer screw gauge (in use)'} bench labelY={0.04}>
                  {() => (inHolder === 'V' ? <VernierModel o={o} s={s} live /> : <MicrometerModel o={o} s={s} live />)}
                </Interactive>
              </group>
            </group>
          )}
          {has('vernier') && inHolder !== 'V' && lying('vernier', [calsX - 0.12, 0, CALS.z + 0.18], [0, 0.1, 0], <Extra id="vernier" />)}
          {task === 'CAL' && has('micrometer') && inHolder !== 'M' && lying('micrometer', [calsX + 0.16, 0, CALS.z + 0.16], [0, -0.2, 0], <Extra id="micrometer" />)}
        </>
      )}
      {task === 'CAL' && has('objects') && (
        <group position={[CLOTH.x, 0, CLOTH.z]}>
          <Interactive id="objects" label="Cloth with the objects" bench labelY={0.04}>
            {() => <B p={[0, 0.002, 0]} s={[0.22, 0.004, 0.14]} m={clothMat} />}
          </Interactive>
          {objs
            .filter((x) => !(s.tool && s.held === x))
            .map((x, k) => {
              const d = OBJ_SIZE_M(o, x, false);
              return (
                <Interactive key={x} id={`obj-${x}`} label={x === 'cyl' ? 'Wooden cylinder' : x === 'ball' ? 'Ball bearing' : x === 'marble' ? 'Glass marble' : 'Copper wire'} bench position={[-0.07 + k * 0.05, 0.004 + (x === 'cyl' ? 0.025 : d / 2), 0]} labelY={0.04}>
                  {(active) => (
                    <group rotation={x === 'cyl' ? [Math.PI / 2, 0, 0] : [0, 0, 0]}>
                      {x === 'cyl' ? <C p={[0, 0, 0]} r={d / 2} h={0.05} m={woodCyl} /> : x === 'wire' ? <C p={[0, 0, 0]} r={Math.max(d / 2, 0.001)} h={0.08} m={copperMat} rot={[Math.PI / 2, 0, 0.6]} /> : <mesh geometry={sph} material={x === 'ball' ? chrome : marbleMat} scale={d / 2} />}
                      {active && <GlowRing r={0.025} />}
                    </group>
                  )}
                </Interactive>
              );
            })}
        </group>
      )}
      {task === 'ARCH' && <ArchRig o={o} s={s} scene={scene} interactive={interactive} />}
      {task === 'FLOAT' && <FloatRig o={o} s={s} scene={scene} />}
      {task === 'BOTTLE' && <BottleRig o={o} s={s} scene={scene} />}
      {task !== 'CAL' && has('balance') && <BalanceModel o={o} interactive={interactive} />}
      {has('tissue') && (
        <Interactive id="tissue" label="Tissue paper" bench position={[0.3, 0, 0.28]} labelY={0.04}>
          {() => <Extra id="tissue" />}
        </Interactive>
      )}
      {waiting.map((id, k) => (
        <Interactive key={id} id={id} label={APPARATUS_LABEL[id]} bench position={[SPOT.waiting[0] + k * 0.2, 0, SPOT.waiting[2]]} labelY={0.1}>
          {(active) => (
            <group>
              <Extra id={id} />
              {active && <GlowRing r={0.08} />}
            </group>
          )}
        </Interactive>
      ))}
      {extras.map((id, k) => (
        <Interactive key={id} id={id} label={APPARATUS_LABEL[id]} bench position={[SPOT.extras[0] + k * 0.14, 0, SPOT.extras[2]]} labelY={0.08}>
          {(active) => (
            <group>
              <Extra id={id} />
              {active && <GlowRing r={0.05} />}
            </group>
          )}
        </Interactive>
      ))}
    </group>
  );
}

const SLOT_POS: Partial<Record<ApparatusId, [0 | 1 | 2, number]>> = {
  vernier: [2, -0.95],
  micrometer: [2, -0.7],
  objects: [2, -0.48],
  thermometer: [2, -0.28],
  dropper: [2, -0.12],
  tissue: [2, 0.02],
  magnet: [2, 0.16],
  sbalance: [1, -0.95],
  stone: [1, -0.72],
  catch: [1, -0.55],
  salt: [1, -0.38],
  bottle: [1, -0.2],
  liquids: [1, 0.0],
  sand: [1, 0.16],
  balance: [0, -0.85],
  eureka: [0, -0.45],
  cylinder: [0, -0.25],
  testtube: [0, -0.08],
  shot: [0, 0.06],
  prism: [0, 0.18],
};
const slotModel = (id: ApparatusId): ReactNode => {
  if (id === 'balance') return <B p={[0, 0.03, 0]} s={[0.3, 0.06, 0.1]} m={mat.darkMetal()} />;
  if (id === 'stone') return <mesh geometry={stoneGeo} material={stoneMat} position={[0, 0.03, 0]} scale={0.03} />;
  if (id === 'catch' || id === 'salt' || id === 'liquids') return <Beaker liquid={id === 'catch' ? 0 : 0.04} />;
  if (id === 'bottle') return <mesh geometry={bottleGeo} material={glass} />;
  if (id === 'testtube') return <C p={[0, 0.1, 0]} r={TUBE3.r} h={0.2} m={glass} />;
  if (id === 'shot') return <C p={[0, 0.02, 0]} r={0.025} h={0.04} m={leadMat} />;
  if (id === 'objects') return <B p={[0, 0.004, 0]} s={[0.14, 0.008, 0.1]} m={clothMat} />;
  if (id === 'sand') return <C p={[0, 0.008, 0]} r={0.045} h={0.016} m={sandMat} />;
  if (id === 'thermometer') return <C p={[0, 0.006, 0]} r={0.004} h={0.2} m={glass} rot={[0, 0, Math.PI / 2]} />;
  if (id === 'dropper') return <C p={[0, 0.006, 0]} r={0.004} h={0.07} m={glass} rot={[0, 0, Math.PI / 2]} />;
  return <Extra id={id} />;
};
const SLOTS: CupboardSlot[] = (Object.keys(SLOT_POS) as ApparatusId[]).map((id) => ({ id, label: APPARATUS_LABEL[id], shelf: SLOT_POS[id]![0], x: SLOT_POS[id]![1], model: slotModel(id), grip: [[0.14, 0.12, 0.12], [0, 0.05, 0]] }));
export function DensityCupboard({ scene }: { scene: SceneState }) {
  return <CupboardItems slots={SLOTS} collected={scene.collected} />;
}
