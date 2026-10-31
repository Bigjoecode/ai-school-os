import { HEAT_SCALE, heatMetal, heatReading, type HeatThermo, type PhyHeatState } from '@aischool/shared';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { BoxGeometry, CylinderGeometry, MeshStandardMaterial, SphereGeometry, type Group, type Material, type Mesh } from 'three';
import { BlobShadow, BunsenBurner, GlowRing } from '../../../lab3d-kit/apparatus';
import { Interactive } from '../../../lab3d-kit/interact';
import { BENCH, STATION } from '../../../lab3d-kit/layout';
import { liquidMaterial, mat } from '../../../lab3d-kit/materials';
import { CardAndBook, CupboardItems, type CupboardSlot } from '../../phy-common/lab3d/common';
import { canvasTex, FONT, liveTex } from '../../phy-common/lab3d/tex';
import { beamTilt, clockText, heatFlags, type Heat } from '../actions';
import { dragFor } from './drag';
import { APPARATUS_LABEL, type ApparatusId, type SceneState } from './scene-state';
import { BALANCE, BATH, CAL, SPOT, STAND, THERMO, thermoBase, thermoY, TUBE, type V3 } from './views';

/**
 * The heat bench: the Bunsen burner under a tripod and gauze with the beaker
 * of water (the bath), the metal block hanging in it by its thread, the
 * copper calorimeter standing in its lagging with its lid, stirrer and
 * thermometer, the triple-beam balance with its riders, the jug and the flask
 * of warm water, the beaker of melting ice and the blotting paper, the clamp
 * stand with the boiling tube of naphthalene, the stopwatch, the task card and
 * the notebook. Temperatures, water levels, ice and the freezing naphthalene
 * follow the shared simulation frame by frame.
 */

const box = new BoxGeometry(1, 1, 1);
const cyl = new CylinderGeometry(1, 1, 1, 24);
const sph = new SphereGeometry(1, 14, 10);
const copper = new MeshStandardMaterial({ color: '#c27a4a', roughness: 0.35, metalness: 0.8 });
const copperDark = new MeshStandardMaterial({ color: '#8f4f26', roughness: 0.4, metalness: 0.7 });
const cotton = new MeshStandardMaterial({ color: '#f4f1e8', roughness: 1 });
const jacket = new MeshStandardMaterial({ color: '#5d6b78', roughness: 0.7 });
const thread = new MeshStandardMaterial({ color: '#efe6d0', roughness: 1 });
const mercury = new MeshStandardMaterial({ color: '#b9c2c9', roughness: 0.15, metalness: 0.95 });
const gauzeMat = new MeshStandardMaterial({ color: '#8b8f94', roughness: 0.8, metalness: 0.5 });
const flameMat = new MeshStandardMaterial({ color: '#4f8ef7', emissive: '#3b82f6', emissiveIntensity: 1.6, transparent: true, opacity: 0.75 });
const iceMat = new MeshStandardMaterial({ color: '#f2f8ff', roughness: 0.1, transparent: true, opacity: 0.85 });
const naphLiquid = liquidMaterial('#fffde8', 0.45);
const naphSolid = new MeshStandardMaterial({ color: '#f1f0ea', roughness: 0.9 });
const blotMat = new MeshStandardMaterial({ color: '#f3c6d6', roughness: 1 });
const riderMat = new MeshStandardMaterial({ color: '#c62828', roughness: 0.5 });
const flaskMat = new MeshStandardMaterial({ color: '#2f6db5', roughness: 0.5 });
const water = liquidMaterial('#cfe4f2', 0.5);
const zeroMat = new MeshStandardMaterial({ color: '#16a34a', roughness: 0.5 });

function B({ p, s, m, r }: { p: V3; s: V3; m: Material; r?: V3 }) {
  return <mesh geometry={box} material={m} position={p} scale={s} rotation={r} />;
}
function C({ p, r, h, m, rot }: { p: V3; r: number; h: number; m: Material; rot?: V3 }) {
  return <mesh geometry={cyl} material={m} position={p} scale={[r, h, r]} rotation={rot} />;
}

/** The thermometer's printed scale: −10 to 110 °C in 1 °C marks, a number every 10. */
const scaleTex = () =>
  canvasTex('heat-thermo-scale', 96, 2400, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.0)';
    g.fillRect(0, 0, w, h);
    const span = HEAT_SCALE.max - HEAT_SCALE.min;
    g.strokeStyle = '#111';
    g.fillStyle = '#111';
    for (let c = HEAT_SCALE.min; c <= HEAT_SCALE.max; c++) {
      const y = h - ((c - HEAT_SCALE.min) / span) * h;
      const len = c % 10 === 0 ? 46 : c % 5 === 0 ? 34 : 22;
      g.lineWidth = c % 5 === 0 ? 3.2 : 2;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(len, y);
      g.stroke();
      if (c % 10 === 0) {
        g.font = `700 26px ${FONT}`;
        g.textBaseline = 'middle';
        g.fillText(String(c), 50, Math.min(h - 12, Math.max(12, y)));
      }
    }
  });

/** A mercury-in-glass thermometer, its bulb at the origin; the mercury follows `reading()` (°C) each frame. */
function ThermometerModel({ reading, glow }: { reading: () => number; glow?: boolean }) {
  const tex = useMemo(scaleTex, []);
  const col = useRef<Mesh>(null);
  useFrame(() => {
    const y = thermoY(reading());
    if (col.current) {
      col.current.scale.y = Math.max(0.001, y - 0.004);
      col.current.position.y = 0.004 + (y - 0.004) / 2;
    }
  });
  const scaleH = THERMO.to - THERMO.from;
  return (
    <group>
      <mesh geometry={sph} material={mercury} position={[0, 0.006, 0]} scale={[0.0034, 0.007, 0.0034]} />
      <mesh ref={col} geometry={cyl} material={mercury} position={[0, 0.1, -0.0006]} scale={[0.0008, 0.1, 0.0008]} />
      <C p={[0, THERMO.len / 2, 0]} r={0.0032} h={THERMO.len} m={glow ? mat.highlight() : mat.glass()} />
      <mesh position={[0.0022, THERMO.from + scaleH / 2, 0.0034]} renderOrder={6}>
        <planeGeometry args={[0.0045, scaleH]} />
        <meshBasicMaterial map={tex} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <C p={[0, THERMO.len + 0.003, 0]} r={0.0034} h={0.006} m={mat.darkMetal()} />
    </group>
  );
}

function Tripod() {
  const legs = [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3];
  return (
    <group>
      {legs.map((a) => (
        <C key={a} p={[Math.cos(a) * 0.05, BATH.gauze / 2, Math.sin(a) * 0.05]} r={0.003} h={BATH.gauze} m={mat.darkMetal()} rot={[Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12]} />
      ))}
      <mesh position={[0, BATH.gauze - 0.004, 0]} rotation={[Math.PI / 2, 0, 0]} material={mat.darkMetal()}>
        <torusGeometry args={[0.055, 0.003, 6, 24]} />
      </mesh>
      <B p={[0, BATH.gauze, 0]} s={[0.13, 0.002, 0.13]} m={gauzeMat} />
      <C p={[0, BATH.gauze + 0.0012, 0]} r={0.03} h={0.0006} m={mat.white()} />
    </group>
  );
}

function Flame({ on }: { on: boolean }) {
  const ref = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.scale.set(0.012, 0.05 + Math.sin(clock.elapsedTime * 23) * 0.004, 0.012);
  });
  if (!on) return null;
  return (
    <mesh ref={ref} position={[0, 0.175, 0]} material={flameMat}>
      <coneGeometry args={[1, 1, 14]} />
    </mesh>
  );
}

/** The beaker of water on the gauze; it bubbles once it boils. */
function BathModel({ o, glow }: { o: Heat; glow?: boolean }) {
  const bubbles = useRef<Group>(null);
  useFrame(({ clock }) => {
    const p = o.phys();
    const boiling = p.bunsen && p.bath >= o.v.boil - 0.3;
    if (!bubbles.current) return;
    bubbles.current.visible = boiling || p.bath > 85;
    bubbles.current.children.forEach((c, i) => {
      const t = (clock.elapsedTime * (boiling ? 0.9 : 0.3) + i * 0.137) % 1;
      c.position.set(Math.sin(i * 2.1) * 0.025, 0.006 + t * BATH.water, Math.cos(i * 1.7) * 0.025);
      c.scale.setScalar(boiling ? 0.0022 : 0.0012);
    });
  });
  return (
    <group>
      <mesh position={[0, BATH.water / 2 + 0.003, 0]} material={water} scale={[BATH.r - 0.0015, BATH.water, BATH.r - 0.0015]} geometry={cyl} />
      <group ref={bubbles}>
        {Array.from({ length: 12 }, (_, i) => (
          <mesh key={i} geometry={sph} material={mat.white()} />
        ))}
      </group>
      <mesh material={mat.glass()} renderOrder={4}>
        <cylinderGeometry args={[BATH.r, BATH.r, BATH.h, 28, 1, true]} />
      </mesh>
      <C p={[0, 0.001, 0]} r={BATH.r} h={0.002} m={mat.glass()} />
      {glow && <GlowRing r={0.06} />}
    </group>
  );
}

/** The block's size (m) from its mass and metal. */
const blockSize = (o: Heat) => Math.cbrt(o.v.blockMass / heatMetal(o.v).rho) * 1.0;

/** The copper calorimeter in its lagging: water rising with what is in it, floating ice, the lid, the stirrer. */
function Calorimeter({ o, state }: { o: Heat; state: PhyHeatState }) {
  const f = heatFlags(state.events);
  const waterRef = useRef<Mesh>(null);
  const stirRef = useRef<Group>(null);
  const iceRef = useRef<Group>(null);
  useFrame(({ clock }) => {
    const p = o.phys();
    const full = o.v.twoThirds * 1.5;
    const level = p.mw > 0 ? Math.min(CAL.h - 0.004, ((p.mw + (p.block === 'cal' ? o.v.blockMass / heatMetal(o.v).rho * 1000 : 0)) / full) * (CAL.h - 0.006)) : 0;
    if (waterRef.current) {
      waterRef.current.visible = level > 0.001;
      waterRef.current.scale.set(CAL.r - 0.002, Math.max(0.001, level), CAL.r - 0.002);
      waterRef.current.position.y = CAL.base + level / 2;
    }
    if (stirRef.current) stirRef.current.position.y = p.stirring || p.t < p.thStirUntil ? Math.sin(clock.elapsedTime * 5) * 0.012 : 0;
    if (iceRef.current)
      iceRef.current.children.forEach((c, i) => {
        const piece = p.ice[i];
        c.visible = !!piece && piece.m > 0;
        if (piece && piece.m > 0) {
          const s = 0.016 * Math.cbrt(piece.m / 0.0045);
          c.scale.set(s, s * 0.8, s);
          c.position.set(Math.cos(i * 2.4) * 0.016, CAL.base + level - s * 0.25, Math.sin(i * 2.4) * 0.016);
        }
      });
  });
  return (
    <group position={[CAL.x, 0, CAL.z]}>
      {f.lagged && (
        <Interactive id="lagging" label="Lagging jacket (cotton wool)" bench labelY={0.14}>
          {(active) => (
            <group>
              <C p={[0, CAL.jacketH / 2, 0]} r={CAL.jacketR} h={CAL.jacketH} m={active ? mat.highlight() : jacket} />
              <mesh position={[0, CAL.jacketH + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]} material={cotton}>
                <ringGeometry args={[CAL.r + 0.002, CAL.jacketR, 28]} />
              </mesh>
            </group>
          )}
        </Interactive>
      )}
      <Interactive id="cal" label="Copper calorimeter" bench labelY={0.16}>
        {(active) => (
          <group>
            <mesh material={active ? mat.highlight() : copper} position={[0, CAL.base + CAL.h / 2, 0]}>
              <cylinderGeometry args={[CAL.r, CAL.r, CAL.h, 28, 1, true]} />
            </mesh>
            <C p={[0, CAL.base + 0.001, 0]} r={CAL.r} h={0.002} m={copperDark} />
            {!f.lagged && <BlobShadow r={0.05} />}
          </group>
        )}
      </Interactive>
      <mesh ref={waterRef} geometry={cyl} material={water} />
      <group ref={iceRef}>
        {Array.from({ length: 8 }, (_, i) => (
          <mesh key={i} geometry={box} material={iceMat} visible={false} />
        ))}
      </group>
      {f.lid && <C p={[0, CAL.base + CAL.h + 0.002, 0]} r={CAL.r + 0.003} h={0.003} m={copperDark} />}
      {/* stirrer: a ring in the water on a rod that comes up through the lid */}
      <group ref={stirRef}>
        <Interactive id="stirrer" label="Stirrer" bench labelY={0.2}>
          {(active) => (
            <group>
              <mesh position={[0, CAL.base + 0.012, 0]} rotation={[Math.PI / 2, 0, 0]} material={active ? mat.highlight() : copper}>
                <torusGeometry args={[CAL.r - 0.008, 0.0012, 6, 20]} />
              </mesh>
              <C p={[CAL.r - 0.008, CAL.base + 0.075, 0]} r={0.0012} h={0.13} m={active ? mat.highlight() : copper} />
            </group>
          )}
        </Interactive>
      </group>
    </group>
  );
}

/** The metal block on its thread: on the bench, hanging in the bath, held above the calorimeter, or in it. */
function BlockModel({ o, state, interactive }: { o: Heat; state: PhyHeatState; interactive: boolean }) {
  const f = heatFlags(state.events);
  const s = blockSize(o);
  const m = heatMetal(o.v);
  const metalMat = useMemo(() => new MeshStandardMaterial({ color: m.colour, roughness: 0.35, metalness: 0.85 }), [m.colour]);
  useEffect(() => () => metalMat.dispose(), [metalMat]);
  const pos: V3 = f.block === 'bath' ? [BATH.x, BATH.gauze + 0.012 + s / 2, BATH.z] : f.block === 'air' ? [CAL.x, 0.3, CAL.z] : f.block === 'cal' ? [CAL.x + 0.006, CAL.base + s / 2 + 0.002, CAL.z] : [SPOT.block[0], s / 2, SPOT.block[2]];
  const hang = f.block === 'bench' ? 0 : f.block === 'air' ? 0.12 : 0.2;
  return (
    <group position={pos}>
      <Interactive id="block" label={`Metal block on a thread (${m.name})`} bench labelY={s + 0.03} drag={interactive ? dragFor : undefined}>
        {(active) => (
          <group>
            <mesh geometry={box} material={active ? mat.highlight() : metalMat} scale={[s, s, s]} />
            {hang > 0 && <C p={[0, s / 2 + hang / 2, 0]} r={0.0005} h={hang} m={thread} />}
            {f.block === 'bench' && (
              <>
                <C p={[0.02, s / 2 + 0.002, 0]} r={0.0005} h={0.004} m={thread} />
                <BlobShadow r={s} y={-s / 2 + 0.0008} />
              </>
            )}
          </group>
        )}
      </Interactive>
      {/* a glass rod across the beaker holds the thread */}
      {f.block === 'bath' && <C p={[0, hang + s / 2, 0]} r={0.0025} h={0.12} m={mat.glass()} rot={[0, 0, Math.PI / 2]} />}
    </group>
  );
}

/** The triple-beam balance: the pan (with what is on it), three beams with their riders, the pointer against the zero mark. */
function BalanceModel({ o, state, interactive }: { o: Heat; state: PhyHeatState; interactive: boolean }) {
  const pointer = useRef<Group>(null);
  const beams = useRef<Group>(null);
  const live = useRef(o);
  live.current = o;
  useFrame(() => {
    const t = beamTilt(live.current.panMass(), live.current.riders);
    if (pointer.current) pointer.current.position.y = 0.072 + t * 0.012;
    if (beams.current) beams.current.rotation.z = -t * 0.035;
  });
  const r = o.riders;
  const L = 0.24;
  const at = (frac: number) => -0.02 + frac * (L - 0.04);
  const f = heatFlags(state.events);
  const drag = interactive ? dragFor : undefined;
  const rider = (id: 'h' | 't' | 'f', y: number, frac: number) => (
    <Interactive key={id} id={`rider-${id}`} label={id === 'h' ? '100 g rider' : id === 't' ? '10 g rider' : 'Front rider (0–10 g)'} bench labelY={0.02} position={[at(frac), y, 0.012]} drag={drag}>
      {(active) => <B p={[0, 0, 0]} s={[0.008, 0.014, 0.012]} m={active ? mat.highlight() : riderMat} />}
    </Interactive>
  );
  return (
    <group position={[BALANCE.x, 0, BALANCE.z]}>
      <Interactive id="balance" label="Beam balance" bench labelY={0.14}>
        {(active) => (
          <group>
            <B p={[0.06, 0.008, 0]} s={[0.36, 0.016, 0.12]} m={active ? mat.highlight() : mat.darkMetal()} />
            <C p={[-0.09, 0.03, 0]} r={0.006} h={0.04} m={mat.steel()} />
            <C p={[-0.09, 0.052, 0]} r={0.055} h={0.004} m={mat.steel()} />
            <B p={[0.01, 0.045, -0.03]} s={[0.02, 0.06, 0.02]} m={mat.darkMetal()} />
            {/* zero mark at the end */}
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
        {rider('h', 0.0, r.h / 2)}
        {rider('t', -0.016, r.t / 9)}
        {rider('f', -0.032, r.f / 10)}
      </group>
      <group ref={pointer} position={[0.238, 0.072, 0.012]}>
        <B p={[0, 0, 0]} s={[0.016, 0.0016, 0.002]} m={mat.black()} />
      </group>
      {/* what is on the pan */}
      {o.pan === 'cal' && (
        <group position={[-0.09, 0.054, 0]}>
          <mesh material={copper} position={[0, CAL.h / 2, 0]}>
            <cylinderGeometry args={[CAL.r, CAL.r, CAL.h, 24, 1, true]} />
          </mesh>
          <C p={[0, 0.001, 0]} r={CAL.r} h={0.002} m={copperDark} />
          {f.filled && <C p={[0, CAL.h * 0.33, 0]} r={CAL.r - 0.002} h={CAL.h * 0.62} m={water} />}
        </group>
      )}
      {o.pan === 'block' && <B p={[-0.09, 0.054 + blockSize(o) / 2, 0]} s={[blockSize(o), blockSize(o), blockSize(o)]} m={mat.steel()} />}
    </group>
  );
}

/** The boiling tube of naphthalene: clear liquid, white crystals growing from the bottom as it freezes. */
function TubeModel({ o, glow }: { o: Heat; glow?: boolean }) {
  const solid = useRef<Mesh>(null);
  const liquid = useRef<Mesh>(null);
  const H = 0.06;
  useFrame(() => {
    const fs = o.phys().fs;
    if (solid.current) {
      solid.current.scale.set(TUBE.r - 0.0015, Math.max(0.0005, H * fs), TUBE.r - 0.0015);
      solid.current.position.y = 0.004 + (H * fs) / 2;
    }
    if (liquid.current) {
      liquid.current.visible = fs < 0.999;
      liquid.current.scale.set(TUBE.r - 0.0016, Math.max(0.0005, H * (1 - fs)), TUBE.r - 0.0016);
      liquid.current.position.y = 0.004 + H * fs + (H * (1 - fs)) / 2;
    }
  });
  return (
    <group>
      <mesh ref={solid} geometry={cyl} material={naphSolid} />
      <mesh ref={liquid} geometry={cyl} material={naphLiquid} />
      <mesh material={glow ? mat.highlight() : mat.glass()} position={[0, TUBE.len / 2, 0]} renderOrder={4}>
        <cylinderGeometry args={[TUBE.r, TUBE.r, TUBE.len, 20, 1, true]} />
      </mesh>
      <mesh material={mat.glass()} position={[0, 0.002, 0]}>
        <sphereGeometry args={[TUBE.r, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
      </mesh>
    </group>
  );
}

function StandModel({ tubeAt }: { tubeAt: V3 }) {
  return (
    <group>
      <B p={[STAND.x, 0.007, STAND.z]} s={[0.16, 0.014, 0.22]} m={mat.darkMetal()} />
      <C p={[STAND.x, 0.3, STAND.z - 0.06]} r={0.0065} h={0.6} m={mat.steel()} />
      {/* the boss and arm to the tube's clamp, at the tube's height */}
      <B p={[STAND.x, tubeAt[1] + 0.12, STAND.z - 0.06]} s={[0.028, 0.028, 0.028]} m={mat.darkMetal()} />
      <mesh material={mat.steel()} position={[(STAND.x + tubeAt[0]) / 2, tubeAt[1] + 0.12, (STAND.z - 0.06 + tubeAt[2]) / 2]} rotation={[0, -Math.atan2(tubeAt[2] - (STAND.z - 0.06), tubeAt[0] - STAND.x), Math.PI / 2]}>
        <cylinderGeometry args={[0.004, 0.004, Math.hypot(tubeAt[0] - STAND.x, tubeAt[2] - (STAND.z - 0.06)), 8]} />
      </mesh>
      <B p={[tubeAt[0], tubeAt[1] + 0.12, tubeAt[2]]} s={[0.03, 0.02, 0.03]} m={mat.cork()} />
      <BlobShadow r={0.14} />
    </group>
  );
}

function StopwatchModel({ face }: { face?: React.ReactNode }) {
  return (
    <group>
      <mesh geometry={cyl} material={mat.black()} position={[0, 0.012, 0]} scale={[0.035, 0.024, 0.035]} />
      <C p={[0, 0.012, -0.04]} r={0.006} h={0.012} m={mat.steel()} rot={[Math.PI / 2, 0, 0]} />
      {face}
      <BlobShadow r={0.05} />
    </group>
  );
}
function WatchFace({ o }: { o: Heat }) {
  const live = useMemo(() => liveTex(256, 128), []);
  const last = useRef('');
  useEffect(() => () => live.texture.dispose(), [live]);
  useFrame(() => {
    const text = clockText(o.watchTime());
    if (text === last.current) return;
    last.current = text;
    live.redraw((g, w, h) => {
      g.fillStyle = '#c9d7b8';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#16200f';
      g.font = '700 66px ui-monospace, Menlo, Consolas, monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + 4);
    });
  });
  return (
    <mesh position={[0, 0.0245, 0.004]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[0.05, 0.025]} />
      <meshBasicMaterial map={live.texture} toneMapped={false} />
    </mesh>
  );
}

function ExtraModel({ id }: { id: ApparatusId }) {
  switch (id) {
    case 'calorimeter':
      return (
        <group>
          <mesh material={copper} position={[0, CAL.h / 2, 0]}>
            <cylinderGeometry args={[CAL.r, CAL.r, CAL.h, 24, 1, true]} />
          </mesh>
          <C p={[0, 0.001, 0]} r={CAL.r} h={0.002} m={copperDark} />
        </group>
      );
    case 'lagging':
      return <C p={[0, CAL.jacketH / 2, 0]} r={CAL.jacketR} h={CAL.jacketH} m={jacket} />;
    case 'thermometer':
      return (
        <group rotation={[0, 0, Math.PI / 2]} position={[0.15, 0.004, 0]}>
          <C p={[0, 0.15, 0]} r={0.0032} h={0.3} m={mat.glass()} />
        </group>
      );
    case 'balance':
      return <B p={[0, 0.01, 0]} s={[0.3, 0.02, 0.1]} m={mat.darkMetal()} />;
    case 'beaker':
      return (
        <group>
          <C p={[0, BATH.water / 2, 0]} r={BATH.r - 0.002} h={BATH.water} m={water} />
          <mesh material={mat.glass()} position={[0, BATH.h / 2, 0]}>
            <cylinderGeometry args={[BATH.r, BATH.r, BATH.h, 24, 1, true]} />
          </mesh>
        </group>
      );
    case 'tripod':
      return <Tripod />;
    case 'bunsen':
      return <BunsenBurner />;
    case 'block':
      return <B p={[0, 0.02, 0]} s={[0.04, 0.04, 0.04]} m={mat.steel()} />;
    case 'tongs':
      return (
        <group rotation={[0, 0.4, 0]}>
          <B p={[0.06, 0.004, 0.006]} s={[0.13, 0.004, 0.005]} m={mat.steel()} r={[0, 0.06, 0]} />
          <B p={[0.06, 0.004, -0.006]} s={[0.13, 0.004, 0.005]} m={mat.steel()} r={[0, -0.06, 0]} />
        </group>
      );
    case 'jug':
      return (
        <group>
          <C p={[0, 0.06, 0]} r={0.045} h={0.12} m={mat.plastic()} />
          <C p={[0, 0.05, 0]} r={0.041} h={0.09} m={water} />
          <B p={[0.052, 0.07, 0]} s={[0.012, 0.07, 0.01]} m={mat.plastic()} />
        </group>
      );
    case 'kettle':
      return (
        <group>
          <C p={[0, 0.09, 0]} r={0.04} h={0.18} m={flaskMat} />
          <C p={[0, 0.19, 0]} r={0.025} h={0.02} m={mat.black()} />
        </group>
      );
    case 'ice':
      return (
        <group>
          <C p={[0, 0.03, 0]} r={0.035} h={0.06} m={liquidMaterial('#e3f1fa', 0.5)} />
          {[0, 1, 2, 3, 4].map((i) => (
            <B key={i} p={[Math.cos(i * 1.3) * 0.016, 0.05 + (i % 2) * 0.008, Math.sin(i * 1.3) * 0.016]} s={[0.014, 0.012, 0.014]} m={iceMat} r={[0.2 * i, 0.5 * i, 0]} />
          ))}
          <mesh material={mat.glass()} position={[0, 0.04, 0]}>
            <cylinderGeometry args={[0.037, 0.037, 0.08, 24, 1, true]} />
          </mesh>
        </group>
      );
    case 'blotting':
      return <B p={[0, 0.001, 0]} s={[0.12, 0.002, 0.09]} m={blotMat} />;
    case 'tube':
      return (
        <group rotation={[0, 0, Math.PI / 2]} position={[0.08, TUBE.r, 0]}>
          <C p={[0, 0.075, 0]} r={TUBE.r} h={0.15} m={mat.glass()} />
          <C p={[0, 0.03, 0]} r={TUBE.r - 0.0015} h={0.06} m={naphSolid} />
        </group>
      );
    case 'stand':
      return (
        <group>
          <B p={[0, 0.007, 0]} s={[0.16, 0.014, 0.22]} m={mat.darkMetal()} />
          <C p={[0, 0.3, -0.06]} r={0.0065} h={0.6} m={mat.steel()} />
        </group>
      );
    case 'stopwatch':
      return <StopwatchModel />;
    case 'spring':
      return <C p={[0, 0.012, 0]} r={0.012} h={0.024} m={mat.steel()} rot={[0, 0, Math.PI / 2]} />;
    case 'lens':
      return <mesh material={mat.glass()} position={[0, 0.03, 0]} scale={[0.03, 0.03, 0.006]} geometry={sph} />;
  }
  return null;
}

/** Everything on the student's bench. */
export function Station({ o, state, scene, interactive, card }: { o: Heat; state: PhyHeatState; scene: SceneState; interactive: boolean; card: string[] }) {
  const task = scene.task;
  const f = heatFlags(state.events);
  const has = (id: ApparatusId) => scene.collected.has(id);
  const placed = (id: ApparatusId) => scene.placed.has(id);
  const heat = task !== 'LATENT';
  const tubeAt = f.tube === 'bath' ? TUBE.bath : TUBE.air;
  const live = useRef(o);
  live.current = o;
  const reading = (th: HeatThermo) => () => heatReading(live.current.v, live.current.phys(), th);
  const thermos: HeatThermo[] = !placed('thermometer') && task !== 'COOL' ? [] : task === 'MIX' ? ['bath', 'cal'] : task === 'LATENT' ? ['cal', 'room'] : f.tube !== 'rack' || placed('stand') ? ['tube'] : [];
  // collected but not yet set out: waiting at the back of the bench
  const waiting = (['tripod', 'beaker', 'thermometer', 'stand'] as ApparatusId[]).filter((id) => has(id) && !placed(id) && (task !== 'COOL' || id !== 'thermometer'));
  const extras = (['spring', 'lens', ...(task === 'COOL' ? [] : (['tube', 'stand', 'stopwatch'] as ApparatusId[])), ...(task === 'COOL' ? (['calorimeter', 'lagging', 'balance', 'block', 'ice'] as ApparatusId[]) : []), ...(task === 'LATENT' ? (['bunsen', 'tripod', 'beaker', 'block', 'tongs', 'jug'] as ApparatusId[]) : []), ...(task === 'MIX' ? (['kettle', 'ice', 'blotting'] as ApparatusId[]) : [])] as ApparatusId[]).filter(has);
  return (
    <group position={STATION}>
      <Interactive id="mybench" label="Your bench" labelY={0.5}>
        <mesh position={[0, 0.005, 0]}>
          <boxGeometry args={[BENCH.w, 0.01, BENCH.d]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>
      <CardAndBook cardAt={SPOT.card} bookAt={SPOT.book} title={task === 'COOL' ? 'Cooling curve' : task === 'LATENT' ? 'Latent heat of ice' : 'Method of mixtures'} lines={card} bookTitle={task === 'COOL' ? 'Cooling curve' : task === 'LATENT' ? 'Latent heat' : 'Specific heat capacity'} heads={task === 'COOL' ? ['t/s', 'θ/°C'] : task === 'LATENT' ? ['m/g', 'θ/°C', 'L'] : ['m/g', 'θ/°C', 'c']} />
      {/* heating: Bunsen, tripod and gauze, the bath */}
      {heat && has('bunsen') && (
        <Interactive id="bunsen" label={`Bunsen burner (${f.bunsen ? 'lit' : 'off'})`} bench position={[BATH.x, 0, BATH.z]} labelY={0.17}>
          {(active) => (
            <group>
              <BunsenBurner glow={active} />
              <Flame on={f.bunsen} />
            </group>
          )}
        </Interactive>
      )}
      {heat && placed('tripod') && (
        <Interactive id="tripod" label="Tripod and gauze" bench position={[BATH.x, 0, BATH.z]} labelY={BATH.gauze + 0.02}>
          {() => <Tripod />}
        </Interactive>
      )}
      {heat && placed('beaker') && (
        <Interactive id="bath" label={task === 'COOL' ? 'Water bath' : 'Beaker of water'} bench position={[BATH.x, BATH.gauze + 0.0015, BATH.z]} labelY={0.14}>
          {(active) => <BathModel o={o} glow={active} />}
        </Interactive>
      )}
      {task === 'MIX' && has('block') && <BlockModel o={o} state={state} interactive={interactive} />}
      {task !== 'COOL' && has('calorimeter') && o.pan !== 'cal' && <Calorimeter o={o} state={state} />}
      {task !== 'COOL' && has('lagging') && (!f.lagged || o.pan === 'cal') && (
        <Interactive id="lagging" label="Lagging jacket (cotton wool)" bench position={o.pan === 'cal' ? [CAL.x, 0, CAL.z] : [CAL.x + 0.16, 0, CAL.z - 0.2]} labelY={0.14}>
          {(active) => (
            <group>
              <C p={[0, CAL.jacketH / 2, 0]} r={CAL.jacketR} h={CAL.jacketH} m={active ? mat.highlight() : jacket} />
              <mesh position={[0, CAL.jacketH + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]} material={cotton}>
                <circleGeometry args={[CAL.jacketR, 28]} />
              </mesh>
            </group>
          )}
        </Interactive>
      )}
      {task !== 'COOL' && has('balance') && <BalanceModel o={o} state={state} interactive={interactive} />}
      {/* thermometers in place */}
      {thermos.map((th) => {
        const b = thermoBase(th, tubeAt);
        if (th === 'cal' && o.pan === 'cal') return null;
        return (
          <group key={th} position={b}>
            {th === 'room' && (
              <group position={[0, -0.03, 0]}>
                <B p={[0, 0.005, 0]} s={[0.05, 0.01, 0.05]} m={mat.wood()} />
                <C p={[0, 0.12, -0.008]} r={0.003} h={0.24} m={mat.steel()} />
              </group>
            )}
            <Interactive id={`th-${th}`} label={th === 'bath' ? 'Thermometer in the boiling water' : th === 'cal' ? 'Thermometer in the calorimeter' : th === 'room' ? 'Room thermometer' : 'Thermometer in the naphthalene'} bench labelY={THERMO.len + 0.02}>
              {(active) => (
                <group>
                  <ThermometerModel reading={reading(th)} glow={active} />
                  <mesh position={[0, THERMO.len / 2, 0]}>
                    <boxGeometry args={[0.02, THERMO.len, 0.02]} />
                    <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                  </mesh>
                </group>
              )}
            </Interactive>
          </group>
        );
      })}
      {task === 'MIX' && has('jug') && (
        <Interactive id="jug" label="Jug of tap water" bench position={SPOT.jug} labelY={0.15}>
          {(active) => (
            <group>
              <ExtraModel id="jug" />
              <BlobShadow r={0.06} />
              {active && <GlowRing r={0.07} />}
            </group>
          )}
        </Interactive>
      )}
      {task === 'MIX' && has('tongs') && (
        <Interactive id="tongs" label="Tongs" bench position={SPOT.tongs} labelY={0.04}>
          {(active) => (
            <group>
              <ExtraModel id="tongs" />
              {active && <GlowRing r={0.08} />}
            </group>
          )}
        </Interactive>
      )}
      {task === 'LATENT' && (
        <>
          {has('kettle') && (
            <Interactive id="kettle" label="Flask of warm water" bench position={SPOT.jug} labelY={0.22}>
              {(active) => (
                <group>
                  <ExtraModel id="kettle" />
                  <BlobShadow r={0.05} />
                  {active && <GlowRing r={0.06} />}
                </group>
              )}
            </Interactive>
          )}
          {has('ice') && (
            <Interactive id="ice" label="Beaker of melting ice (0 °C)" bench position={SPOT.ice} labelY={0.11}>
              {(active) => (
                <group>
                  <ExtraModel id="ice" />
                  <BlobShadow r={0.045} />
                  {active && <GlowRing r={0.05} />}
                </group>
              )}
            </Interactive>
          )}
          {has('blotting') && (
            <Interactive id="blotting" label="Blotting paper" bench position={SPOT.blotting} labelY={0.03}>
              {(active) => (
                <group>
                  <ExtraModel id="blotting" />
                  {active && <GlowRing r={0.08} />}
                </group>
              )}
            </Interactive>
          )}
        </>
      )}
      {task === 'COOL' && (
        <>
          {placed('stand') && <StandModel tubeAt={tubeAt} />}
          {placed('stand') && (
            <Interactive id="stand" label="Clamp and stand" bench position={[STAND.x, 0, STAND.z]} labelY={0.62}>
              {() => (
                <mesh position={[0, 0.3, -0.06]}>
                  <boxGeometry args={[0.03, 0.6, 0.03]} />
                  <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                </mesh>
              )}
            </Interactive>
          )}
          {has('tube') && (placed('stand') || f.tube !== 'rack') ? (
            <Interactive id="tube" label="Boiling tube of naphthalene" bench position={tubeAt} labelY={TUBE.len + 0.02}>
              {(active) => <TubeModel o={o} glow={active} />}
            </Interactive>
          ) : (
            has('tube') && (
              <Interactive id="tube" label="Boiling tube of naphthalene" bench position={[0.25, 0, 0.25]} labelY={0.05}>
                {() => <ExtraModel id="tube" />}
              </Interactive>
            )
          )}
          {has('stopwatch') && (
            <Interactive id="stopwatch" label="Stopwatch" bench position={SPOT.stopwatch} rotation={[0, -0.3, 0]}>
              {(active) => (
                <group>
                  <StopwatchModel face={<WatchFace o={o} />} />
                  {active && <GlowRing r={0.06} />}
                </group>
              )}
            </Interactive>
          )}
        </>
      )}
      {waiting.map((id, k) => (
        <Interactive key={id} id={id} label={APPARATUS_LABEL[id]} bench position={[SPOT.waiting[0] + k * 0.18, 0, SPOT.waiting[2]]} labelY={0.12}>
          {(active) => (
            <group>
              <ExtraModel id={id} />
              {active && <GlowRing r={0.08} />}
            </group>
          )}
        </Interactive>
      ))}
      {extras.map((id, k) => (
        <Interactive key={id} id={id} label={APPARATUS_LABEL[id]} bench position={[SPOT.extras[0] - (k % 3) * 0.12, 0, SPOT.extras[2] - Math.floor(k / 3) * 0.14]} labelY={0.1}>
          {(active) => (
            <group>
              <ExtraModel id={id} />
              <BlobShadow r={0.04} />
              {active && <GlowRing r={0.05} />}
            </group>
          )}
        </Interactive>
      ))}
    </group>
  );
}

/** The cupboard's shelves: what is still there. */
const SLOTS: CupboardSlot[] = [
  { id: 'calorimeter', label: APPARATUS_LABEL.calorimeter, shelf: 0, x: -0.75, model: <ExtraModel id="calorimeter" />, grip: [[0.08, 0.1, 0.08], [0, 0.045, 0]] },
  { id: 'lagging', label: APPARATUS_LABEL.lagging, shelf: 0, x: -0.55, model: <ExtraModel id="lagging" />, grip: [[0.12, 0.11, 0.12], [0, 0.05, 0]] },
  { id: 'balance', label: APPARATUS_LABEL.balance, shelf: 0, x: -0.25, model: <ExtraModel id="balance" />, grip: [[0.3, 0.05, 0.1], [0, 0.02, 0]] },
  { id: 'bunsen', label: APPARATUS_LABEL.bunsen, shelf: 0, x: 0.05, model: <BunsenBurner />, grip: [[0.08, 0.16, 0.08], [0, 0.07, 0]] },
  { id: 'tripod', label: APPARATUS_LABEL.tripod, shelf: 0, x: 0.25, model: <group scale={0.8}><Tripod /></group>, grip: [[0.14, 0.18, 0.14], [0, 0.08, 0]] },
  { id: 'beaker', label: APPARATUS_LABEL.beaker, shelf: 1, x: -0.75, model: <ExtraModel id="beaker" />, grip: [[0.09, 0.12, 0.09], [0, 0.05, 0]] },
  { id: 'thermometer', label: APPARATUS_LABEL.thermometer, shelf: 1, x: -0.55, model: <ExtraModel id="thermometer" />, grip: [[0.3, 0.03, 0.04], [0.15, 0.01, 0]] },
  { id: 'block', label: APPARATUS_LABEL.block, shelf: 1, x: -0.22, model: <ExtraModel id="block" />, grip: [[0.05, 0.05, 0.05], [0, 0.02, 0]] },
  { id: 'tongs', label: APPARATUS_LABEL.tongs, shelf: 1, x: -0.08, model: <ExtraModel id="tongs" />, grip: [[0.14, 0.03, 0.05], [0.06, 0.01, 0]] },
  { id: 'jug', label: APPARATUS_LABEL.jug, shelf: 1, x: 0.1, model: <ExtraModel id="jug" />, grip: [[0.1, 0.13, 0.1], [0, 0.06, 0]] },
  { id: 'kettle', label: APPARATUS_LABEL.kettle, shelf: 1, x: 0.27, model: <ExtraModel id="kettle" />, grip: [[0.09, 0.2, 0.09], [0, 0.1, 0]] },
  { id: 'ice', label: APPARATUS_LABEL.ice, shelf: 2, x: -0.75, model: <ExtraModel id="ice" />, grip: [[0.08, 0.09, 0.08], [0, 0.04, 0]] },
  { id: 'blotting', label: APPARATUS_LABEL.blotting, shelf: 2, x: -0.6, model: <ExtraModel id="blotting" />, grip: [[0.12, 0.03, 0.09], [0, 0.01, 0]] },
  { id: 'tube', label: APPARATUS_LABEL.tube, shelf: 2, x: -0.42, model: <ExtraModel id="tube" />, grip: [[0.16, 0.04, 0.04], [0.08, 0.012, 0]] },
  { id: 'stand', label: APPARATUS_LABEL.stand, shelf: 2, x: -0.18, model: <group scale={0.5}><ExtraModel id="stand" /></group>, grip: [[0.1, 0.32, 0.12], [0, 0.15, 0]] },
  { id: 'stopwatch', label: APPARATUS_LABEL.stopwatch, shelf: 2, x: 0.0, model: <StopwatchModel />, grip: [[0.1, 0.06, 0.1], [0, 0.02, 0]] },
  { id: 'spring', label: APPARATUS_LABEL.spring, shelf: 2, x: 0.15, model: <ExtraModel id="spring" />, grip: [[0.05, 0.04, 0.04], [0, 0.012, 0]] },
  { id: 'lens', label: APPARATUS_LABEL.lens, shelf: 2, x: 0.28, model: <ExtraModel id="lens" />, grip: [[0.07, 0.07, 0.04], [0, 0.03, 0]] },
];
export function HeatCupboard({ scene }: { scene: SceneState }) {
  return <CupboardItems slots={SLOTS} collected={scene.collected} />;
}
