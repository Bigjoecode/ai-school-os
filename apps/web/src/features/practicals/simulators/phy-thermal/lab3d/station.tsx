import { THERM_SCALE, thermColumn, thermMetal, thermThermo, thermWatch, type PhyThermalState, type ThermTask } from '@aischool/shared';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { BoxGeometry, CatmullRomCurve3, CylinderGeometry, MeshStandardMaterial, SphereGeometry, Vector3, type Group, type Material, type Mesh } from 'three';
import { BlobShadow, BunsenBurner, GlowRing } from '../../../lab3d-kit/apparatus';
import { Interactive } from '../../../lab3d-kit/interact';
import { BENCH, STATION } from '../../../lab3d-kit/layout';
import { liquidMaterial, mat } from '../../../lab3d-kit/materials';
import { CardAndBook, CupboardItems, Rule, type CupboardSlot } from '../../phy-common/lab3d/common';
import { canvasTex, FONT, liveTex, meterFaceTexture } from '../../phy-common/lab3d/tex';
import { clockText, thermFlags, type Thermal } from '../actions';
import { dragFor } from './drag';
import { APPARATUS_LABEL, type ApparatusId, type SceneState } from './scene-state';
import { AMMETER, BALANCE, BATH, CAL, CAN, CSTAND, HANG, ICE, JACKET, JTHERMO, MICRO, OUTLET, ROD, RULE, SPOT, SUPPLY, THERMO, thermoBase, thermoY, VOLTMETER, type V3 } from './views';

/**
 * The thermal bench. Expansivity: the steam can on a tripod over the Bunsen,
 * rubber tubing to the brass steam jacket on its wooden base, the rod inside
 * against the fixed stop, the micrometer screw gauge at the free end (its
 * thimble turns with the reading, its spindle backs off), the thermometer
 * through a cork in the jacket, the outlet pipe into a beaker, the metre rule.
 * Charles's law: the large beaker of water on the tripod, the ruler with the
 * capillary tube (its acid index rising with the air's temperature) and the
 * thermometer tied on with rubber bands, hanging from a clamp stand, the
 * stirrer. Electrical heating: the copper calorimeter in its lagging with the
 * lid, the immersion heater (its coil glows when on), the stirrer and
 * thermometer, the 12 V supply, the ammeter and voltmeter with live needles,
 * the wires, the electronic balance and the stopwatch. Everything follows the
 * shared simulation frame by frame.
 */

const box = new BoxGeometry(1, 1, 1);
const cyl = new CylinderGeometry(1, 1, 1, 24);
const sph = new SphereGeometry(1, 14, 10);
const brass = new MeshStandardMaterial({ color: '#c9a640', roughness: 0.35, metalness: 0.8 });
const copper = new MeshStandardMaterial({ color: '#c27a4a', roughness: 0.35, metalness: 0.8 });
const copperDark = new MeshStandardMaterial({ color: '#8f4f26', roughness: 0.4, metalness: 0.7 });
const tin = new MeshStandardMaterial({ color: '#a9b1b8', roughness: 0.4, metalness: 0.75 });
const blue = new MeshStandardMaterial({ color: '#2a6fb5', roughness: 0.4 });
const rubber = new MeshStandardMaterial({ color: '#7a3b22', roughness: 0.7 });
const band = new MeshStandardMaterial({ color: '#2b2b2b', roughness: 0.8 });
const acid = new MeshStandardMaterial({ color: '#8f2d1b', roughness: 0.3, transparent: true, opacity: 0.9 });
const cotton = new MeshStandardMaterial({ color: '#f4f1e8', roughness: 1 });
const jacketMat = new MeshStandardMaterial({ color: '#5d6b78', roughness: 0.7 });
const mercury = new MeshStandardMaterial({ color: '#b9c2c9', roughness: 0.15, metalness: 0.95 });
const gauzeMat = new MeshStandardMaterial({ color: '#8b8f94', roughness: 0.8, metalness: 0.5 });
const flameMat = new MeshStandardMaterial({ color: '#4f8ef7', emissive: '#3b82f6', emissiveIntensity: 1.6, transparent: true, opacity: 0.75 });
const steamMat = new MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, depthWrite: false, roughness: 1 });
const coilMat = new MeshStandardMaterial({ color: '#6b7280', roughness: 0.4, metalness: 0.7, emissive: '#f97316', emissiveIntensity: 0 });
const caseMat = new MeshStandardMaterial({ color: '#2b2f35', roughness: 0.45, metalness: 0.2 });
const needleMat = new MeshStandardMaterial({ color: '#111', roughness: 0.4 });
const redW = new MeshStandardMaterial({ color: '#c62828', roughness: 0.55 });
const blackW = new MeshStandardMaterial({ color: '#1f2124', roughness: 0.55 });
const blueW = new MeshStandardMaterial({ color: '#1d4ed8', roughness: 0.55 });
const water = liquidMaterial('#cfe4f2', 0.5);
const lampOn = new MeshStandardMaterial({ color: '#22c55e', emissive: '#16a34a', emissiveIntensity: 0.8 });
const iceMat = new MeshStandardMaterial({ color: '#f2f8ff', roughness: 0.1, transparent: true, opacity: 0.85 });

function B({ p, s, m, r }: { p: V3; s: V3; m: Material; r?: V3 }) {
  return <mesh geometry={box} material={m} position={p} scale={s} rotation={r} />;
}
function C({ p, r, h, m, rot }: { p: V3; r: number; h: number; m: Material; rot?: V3 }) {
  return <mesh geometry={cyl} material={m} position={p} scale={[r, h, r]} rotation={rot} />;
}
/** A cylinder lying along x from x0 to x1 at (y, z). */
function XRod({ x0, x1, y, z, r, m }: { x0: number; x1: number; y: number; z: number; r: number; m: Material }) {
  return <C p={[(x0 + x1) / 2, y, z]} r={r} h={x1 - x0} m={m} rot={[0, 0, Math.PI / 2]} />;
}
/** A tube along the points (a wire, the rubber tubing). */
function Tube({ pts, r, m }: { pts: V3[]; r: number; m: Material }) {
  const geo = useMemo(() => {
    const curve = new CatmullRomCurve3(pts.map((p) => new Vector3(...p)));
    return curve;
  }, [pts]);
  return (
    <mesh material={m}>
      <tubeGeometry args={[geo, 32, r, 8, false]} />
    </mesh>
  );
}

// ------------------------------------------------------------------ common parts

const scaleTex = () =>
  canvasTex('therm-thermo-scale', 96, 2400, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const span = THERM_SCALE.max - THERM_SCALE.min;
    g.strokeStyle = '#111';
    g.fillStyle = '#111';
    for (let c = THERM_SCALE.min; c <= THERM_SCALE.max; c++) {
      const y = h - ((c - THERM_SCALE.min) / span) * h;
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

/** A mercury-in-glass thermometer, its bulb at the origin; the mercury follows `reading()` (°C). */
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
      {/* an invisible grip */}
      <mesh position={[0, THERMO.len / 2, 0]}>
        <boxGeometry args={[0.02, THERMO.len, 0.02]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Tripod({ h = 0.2 }: { h?: number }) {
  const legs = [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3];
  return (
    <group>
      {legs.map((a) => (
        <C key={a} p={[Math.cos(a) * 0.05, h / 2, Math.sin(a) * 0.05]} r={0.003} h={h} m={mat.darkMetal()} rot={[Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12]} />
      ))}
      <mesh position={[0, h - 0.004, 0]} rotation={[Math.PI / 2, 0, 0]} material={mat.darkMetal()}>
        <torusGeometry args={[0.055, 0.003, 6, 24]} />
      </mesh>
      <B p={[0, h, 0]} s={[0.14, 0.002, 0.14]} m={gauzeMat} />
      <C p={[0, h + 0.0012, 0]} r={0.03} h={0.0006} m={mat.white()} />
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
/** Puffs of steam rising from a point while `on()`. */
function Steam({ on, spread = 0.02 }: { on: () => boolean; spread?: number }) {
  const g = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!g.current) return;
    const v = on();
    g.current.visible = v;
    if (!v) return;
    g.current.children.forEach((c, i) => {
      const t = (clock.elapsedTime * 0.6 + i * 0.17) % 1;
      c.position.set(Math.sin(i * 2.3 + t * 3) * spread * t, t * 0.12, Math.cos(i * 1.7) * spread * t);
      c.scale.setScalar(0.006 + t * 0.018);
      (c as Mesh).visible = true;
    });
  });
  return (
    <group ref={g}>
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} geometry={sph} material={steamMat} />
      ))}
    </group>
  );
}

// ------------------------------------------------------------------ EXPANSION

function SteamCan() {
  return (
    <group>
      <mesh material={tin} position={[0, CAN.h / 2, 0]}>
        <cylinderGeometry args={[CAN.r, CAN.r, CAN.h, 28]} />
      </mesh>
      <C p={[0, CAN.h + 0.004, 0]} r={CAN.r * 0.98} h={0.008} m={mat.darkMetal()} />
      <C p={[0, CAN.h + 0.025, 0]} r={0.006} h={0.04} m={brass} />
      <C p={[0.03, CAN.h + 0.015, 0.02]} r={0.008} h={0.02} m={mat.cork()} />
    </group>
  );
}

/** The micrometer screw gauge fixed at the jacket's free end: frame, sleeve, thimble (turning with the reading) and ratchet; the spindle's tip at x = gap. */
function MicrometerModel({ o, glow }: { o: Thermal; glow?: boolean }) {
  const moving = useRef<Group>(null);
  const thimble = useRef<Group>(null);
  const live = useRef(o);
  live.current = o;
  useFrame(() => {
    const p = live.current.phys();
    const x = live.current.v.G - p.spindle; // 0 when touching the cold rod, more when backed off
    const gap = p.contact ? 0 : Math.max(0, x) * 0.004;
    if (moving.current) moving.current.position.x = gap;
    if (thimble.current) thimble.current.rotation.x = (p.spindle / 0.5) * Math.PI * 2;
  });
  const m = glow ? mat.highlight() : blue;
  return (
    <group>
      {/* the U-frame, anvil side facing the rod */}
      <B p={[0.05, -0.035, 0]} s={[0.1, 0.012, 0.014]} m={m} />
      <B p={[0.003, -0.018, 0]} s={[0.012, 0.03, 0.014]} m={m} />
      <B p={[0.097, -0.012, 0]} s={[0.012, 0.042, 0.014]} m={m} />
      <group ref={moving}>
        {/* spindle from the rod's end through the frame */}
        <XRod x0={0} x1={0.1} y={0} z={0} r={0.003} m={mat.steel()} />
        <XRod x0={0.1} x1={0.135} y={0} z={0} r={0.0065} m={mat.steel()} />
        <group ref={thimble} position={[0.15, 0, 0]}>
          <XRod x0={-0.015} x1={0.025} y={0} z={0} r={0.009} m={mat.metal()} />
          {Array.from({ length: 10 }, (_, i) => (
            <B key={i} p={[-0.012, Math.cos((i / 10) * Math.PI * 2) * 0.0092, Math.sin((i / 10) * Math.PI * 2) * 0.0092]} s={[0.005, 0.0008, 0.0008]} m={mat.black()} />
          ))}
        </group>
        <XRod x0={0.175} x1={0.19} y={0} z={0} r={0.006} m={mat.darkMetal()} />
      </group>
      {/* the datum line on the sleeve */}
      <B p={[0.118, 0.0066, 0]} s={[0.034, 0.0005, 0.0012]} m={mat.black()} />
    </group>
  );
}

function JacketModel({ o, rodIn, interactive }: { o: Thermal; rodIn: boolean; interactive: boolean }) {
  const metal = thermMetal(o.v);
  const rodMat = useMemo(() => new MeshStandardMaterial({ color: metal.colour, roughness: 0.3, metalness: 0.85 }), [metal.colour]);
  useEffect(() => () => rodMat.dispose(), [rodMat]);
  const live = useRef(o);
  live.current = o;
  const steaming = () => {
    const p = live.current.phys();
    return p.boiler && p.can >= live.current.v.boil - 0.05;
  };
  return (
    <group>
      <Interactive id="jacket" label="Steam jacket" bench labelY={JACKET.y + 0.06} position={[0, 0, 0]}>
        {(active) => (
          <group>
            {/* wooden base and the two supports */}
            <B p={[(JACKET.x0 + MICRO.x + 0.2) / 2 - 0.02, 0.008, JACKET.z]} s={[MICRO.x + 0.2 - JACKET.x0 + 0.08, 0.016, 0.09]} m={mat.wood()} />
            {[JACKET.x0 + 0.06, JACKET.x1 - 0.06].map((x) => (
              <B key={x} p={[x, (JACKET.y - JACKET.r) / 2 + 0.008, JACKET.z]} s={[0.02, JACKET.y - JACKET.r - 0.004, 0.05]} m={mat.woodDark()} />
            ))}
            <mesh material={active ? mat.highlight() : brass} position={[(JACKET.x0 + JACKET.x1) / 2, JACKET.y, JACKET.z]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[JACKET.r, JACKET.r, JACKET.x1 - JACKET.x0, 28, 1, true]} />
            </mesh>
            {[JACKET.x0, JACKET.x1].map((x) => (
              <C key={x} p={[x, JACKET.y, JACKET.z]} r={JACKET.r} h={0.012} m={mat.cork()} rot={[0, 0, Math.PI / 2]} />
            ))}
            {/* inlet (left, top) and outlet (right, bottom) */}
            <C p={[JACKET.x0 + 0.03, JACKET.y + JACKET.r + 0.012, JACKET.z]} r={0.004} h={0.024} m={brass} />
            <C p={[OUTLET.x, JACKET.y - JACKET.r - 0.01, JACKET.z]} r={0.004} h={0.02} m={brass} />
            {/* the fixed stop at the left */}
            <B p={[ROD.x0 - 0.008, JACKET.y - 0.02, JACKET.z]} s={[0.012, 0.07, 0.03]} m={mat.darkMetal()} />
            <BlobShadow r={0.4} />
          </group>
        )}
      </Interactive>
      {/* the outlet pipe into the beaker */}
      <Tube pts={[[OUTLET.x, JACKET.y - JACKET.r - 0.02, JACKET.z], [OUTLET.x, 0.05, JACKET.z + 0.04], [OUTLET.x, 0.06, OUTLET.z - 0.02], [OUTLET.x, 0.04, OUTLET.z]]} r={0.0035} m={rubber} />
      <group position={[OUTLET.x, 0.07, OUTLET.z]}>
        <Steam on={steaming} />
      </group>
      {rodIn && (
        <Interactive id="rod" label={`Metal rod (${metal.name})`} bench labelY={JACKET.y + 0.04}>
          {(active) => <XRod x0={ROD.x0} x1={ROD.x0 + ROD.len} y={JACKET.y} z={JACKET.z} r={ROD.r} m={active ? mat.highlight() : rodMat} />}
        </Interactive>
      )}
      <Interactive id="micro" label="Micrometer screw gauge" bench position={[MICRO.x, MICRO.y, MICRO.z]} labelY={0.05} drag={interactive ? dragFor : undefined}>
        {(active) => (
          <group>
            <MicrometerModel o={o} glow={active} />
            <mesh position={[0.1, 0, 0]}>
              <boxGeometry args={[0.2, 0.06, 0.04]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          </group>
        )}
      </Interactive>
      {/* bracket holding the micrometer */}
      <B p={[MICRO.x + 0.1, (MICRO.y - 0.047) / 2 + 0.016, MICRO.z]} s={[0.02, MICRO.y - 0.047 - 0.016, 0.03]} m={mat.darkMetal()} />
    </group>
  );
}

/** The rod lying on the metre rule, one end at its zero. */
function RodOnRule({ o, glow }: { o: Thermal; glow?: boolean }) {
  const metal = thermMetal(o.v);
  const rodMat = useMemo(() => new MeshStandardMaterial({ color: metal.colour, roughness: 0.3, metalness: 0.85 }), [metal.colour]);
  useEffect(() => () => rodMat.dispose(), [rodMat]);
  return <XRod x0={0} x1={o.v.L0 / 1000} y={0.0065 + ROD.r} z={0.006} r={ROD.r} m={glow ? mat.highlight() : rodMat} />;
}

// ------------------------------------------------------------------ CHARLES

const capRuleTex = () =>
  canvasTex('therm-cap-rule', 128, 2048, (g, w, h) => {
    g.fillStyle = '#f3ead2';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#111';
    g.strokeStyle = '#111';
    // 0 … 15 cm from the bottom; each px row = 15/2048 cm
    for (let mm = 0; mm <= 150; mm++) {
      const y = h - (mm / 150) * h;
      const len = mm % 10 === 0 ? 44 : mm % 5 === 0 ? 30 : 18;
      g.lineWidth = mm % 10 === 0 ? 3 : 1.6;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(len, y);
      g.stroke();
      if (mm % 10 === 0 && mm > 0 && mm < 150) {
        g.font = `700 34px ${FONT}`;
        g.textBaseline = 'middle';
        g.fillText(String(mm / 10), 54, y);
      }
    }
  });

/** The ruler with the capillary tube and thermometer tied on, its bottom (the tube's sealed end) at the origin. */
function CapillaryAssembly({ o, glowTube }: { o: Thermal; glowTube?: boolean }) {
  const tex = useMemo(capRuleTex, []);
  const index = useRef<Mesh>(null);
  const live = useRef(o);
  live.current = o;
  useFrame(() => {
    const l = thermColumn(live.current.v, live.current.phys()) / 100;
    if (index.current) index.current.position.y = l + 0.005;
  });
  return (
    <group>
      {/* ruler, 15 cm */}
      <B p={[0, 0.075, -0.004]} s={[0.026, 0.155, 0.004]} m={mat.wood()} />
      <mesh position={[0, 0.075, -0.0018]}>
        <planeGeometry args={[0.024, 0.15]} />
        <meshStandardMaterial map={tex} roughness={0.6} />
      </mesh>
      {/* capillary in front of the scale */}
      <group position={[0.004, 0, 0.003]}>
        <mesh material={glowTube ? mat.highlight() : mat.glass()} position={[0, 0.07, 0]}>
          <cylinderGeometry args={[0.0028, 0.0028, 0.14, 12, 1, true]} />
        </mesh>
        <mesh material={mat.glass()} geometry={sph} scale={[0.0028, 0.0028, 0.0028]} />
        <mesh ref={index} material={acid} geometry={cyl} scale={[0.0013, 0.01, 0.0013]} />
      </group>
      {/* rubber bands */}
      {[0.035, 0.115].map((y) => (
        <B key={y} p={[-0.006, y, 0]} s={[0.05, 0.003, 0.014]} m={band} />
      ))}
    </group>
  );
}

function BigBeaker({ o, glow }: { o: Thermal; glow?: boolean }) {
  const waterRef = useRef<Mesh>(null);
  const bubbles = useRef<Group>(null);
  const live = useRef(o);
  live.current = o;
  const wmat = useMemo(() => new MeshStandardMaterial({ color: '#bcdcf0', transparent: true, opacity: 0.55, roughness: 0.1, depthWrite: false }), []);
  useEffect(() => () => wmat.dispose(), [wmat]);
  useFrame(({ clock }) => {
    const p = live.current.phys();
    const f = Math.max(0, Math.min(1, (p.tw - 20) / 80));
    wmat.color.setRGB((190 + 50 * f) / 255, (220 - 30 * f) / 255, (242 - 70 * f) / 255);
    if (bubbles.current) {
      bubbles.current.visible = p.bunsen && p.tw > 70;
      bubbles.current.children.forEach((c, i) => {
        const t = (clock.elapsedTime * 0.5 + i * 0.137) % 1;
        c.position.set(Math.sin(i * 2.1) * 0.04, 0.006 + t * BATH.water, Math.cos(i * 1.7) * 0.04);
        c.scale.setScalar(0.0016);
      });
    }
  });
  return (
    <group>
      <mesh ref={waterRef} position={[0, BATH.water / 2 + 0.003, 0]} material={wmat} scale={[BATH.r - 0.0015, BATH.water, BATH.r - 0.0015]} geometry={cyl} />
      <group ref={bubbles}>
        {Array.from({ length: 10 }, (_, i) => (
          <mesh key={i} geometry={sph} material={mat.white()} />
        ))}
      </group>
      <mesh material={glow ? mat.highlight() : mat.glass()} renderOrder={4} position={[0, BATH.h / 2, 0]}>
        <cylinderGeometry args={[BATH.r, BATH.r, BATH.h, 32, 1, true]} />
      </mesh>
      <C p={[0, 0.001, 0]} r={BATH.r} h={0.002} m={mat.glass()} />
    </group>
  );
}

function ClampStand({ armTo, armY }: { armTo: V3; armY: number }) {
  return (
    <group>
      <B p={[CSTAND.x, 0.007, CSTAND.z]} s={[0.16, 0.014, 0.14]} m={mat.darkMetal()} />
      <C p={[CSTAND.x, 0.3, CSTAND.z - 0.04]} r={0.0065} h={0.6} m={mat.steel()} />
      <B p={[CSTAND.x, armY, CSTAND.z - 0.04]} s={[0.028, 0.028, 0.028]} m={mat.darkMetal()} />
      <mesh material={mat.steel()} position={[(CSTAND.x + armTo[0]) / 2, armY, (CSTAND.z - 0.04 + armTo[2]) / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.004, 0.004, Math.abs(armTo[2] - (CSTAND.z - 0.04)), 8]} />
      </mesh>
      <B p={[armTo[0], armY, armTo[2] - 0.006]} s={[0.04, 0.02, 0.016]} m={mat.cork()} />
      <BlobShadow r={0.12} />
    </group>
  );
}

// ------------------------------------------------------------------ ELECTRIC

const MET = { w: 0.15, h: 0.12, d: 0.09, fw: 0.135, fh: 0.1 };
/** An analogue box meter; the needle follows `value()` each frame. */
function MeterModel({ letter, fsd, minor, major, value, glow }: { letter: 'A' | 'V'; fsd: number; minor: number; major: number; value: () => number; glow?: boolean }) {
  const face = useMemo(() => meterFaceTexture(letter, fsd, minor, major), [letter, fsd, minor, major]);
  const needle = useRef<Group>(null);
  useFrame((_, dt) => {
    const g = needle.current;
    if (!g) return;
    const x = Math.max(-0.03 * fsd, Math.min(1.04 * fsd, value()));
    const target = -((-50 + 100 * (x / fsd)) * Math.PI) / 180;
    g.rotation.z += (target - g.rotation.z) * Math.min(1, dt * 6);
  });
  const cy = MET.h * 0.5 + 0.004;
  const pivotY = cy - MET.fh / 2 + (40 / 384) * MET.fh;
  return (
    <group>
      <B p={[0, MET.h / 2, 0]} s={[MET.w, MET.h, MET.d]} m={glow ? mat.highlight() : caseMat} />
      <mesh position={[0, cy, MET.d / 2 + 0.0008]}>
        <planeGeometry args={[MET.fw, MET.fh]} />
        <meshStandardMaterial map={face} roughness={0.5} />
      </mesh>
      <group ref={needle} position={[0, pivotY, MET.d / 2 + 0.004]}>
        <B p={[0, 0.036, 0]} s={[0.001, 0.072, 0.0006]} m={needleMat} />
      </group>
      <mesh position={[0, cy, MET.d / 2 + 0.007]} material={mat.pane()}>
        <planeGeometry args={[MET.fw + 0.005, MET.fh + 0.005]} />
      </mesh>
      {[-0.04, 0.04].map((x, i) => (
        <C key={x} p={[x, MET.h + 0.006, MET.d / 2 - 0.02]} r={0.007} h={0.012} m={i ? redW : blackW} />
      ))}
      <BlobShadow r={0.12} />
    </group>
  );
}

function Supply({ on, glow }: { on: boolean; glow?: boolean }) {
  return (
    <group>
      <B p={[0, 0.05, 0]} s={[0.18, 0.1, 0.12]} m={glow ? mat.highlight() : mat.black()} />
      <B p={[0, 0.055, 0.061]} s={[0.12, 0.05, 0.002]} m={mat.darkMetal()} />
      <C p={[-0.05, 0.106, 0.03]} r={0.008} h={0.012} m={redW} />
      <C p={[0.05, 0.106, 0.03]} r={0.008} h={0.012} m={blackW} />
      <B p={[0.0, 0.05, 0.063]} s={[0.025, 0.014, 0.006]} m={on ? lampOn : mat.white()} />
      <BlobShadow r={0.13} />
    </group>
  );
}

function HeaterModel({ o, glow }: { o: Thermal; glow?: boolean }) {
  const live = useRef(o);
  live.current = o;
  useFrame(() => {
    const p = live.current.phys();
    coilMat.emissiveIntensity = Math.max(0, Math.min(2.5, (p.th - 60) / 60));
  });
  return (
    <group>
      <C p={[0, 0.1, 0]} r={0.004} h={0.16} m={glow ? mat.highlight() : mat.steel()} />
      <C p={[0, 0.19, 0]} r={0.009} h={0.03} m={mat.black()} />
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} material={coilMat} position={[0, 0.012 + i * 0.006, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.012, 0.0022, 6, 18]} />
        </mesh>
      ))}
    </group>
  );
}

function BalanceModel({ o, glow }: { o: Thermal; glow?: boolean }) {
  const live = useMemo(() => liveTex(256, 96), []);
  const last = useRef('');
  const ref = useRef(o);
  ref.current = o;
  useEffect(() => () => live.texture.dispose(), [live]);
  useFrame(() => {
    const text = `${ref.current.shows('balance').toFixed(1)} g`;
    if (text === last.current) return;
    last.current = text;
    live.redraw((g, w, h) => {
      g.fillStyle = '#0b2733';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#7dd3fc';
      g.font = '700 58px ui-monospace, Menlo, Consolas, monospace';
      g.textAlign = 'right';
      g.textBaseline = 'middle';
      g.fillText(text, w - 14, h / 2 + 3);
    });
  });
  return (
    <group>
      <B p={[0, 0.02, 0]} s={[0.2, 0.04, 0.22]} m={glow ? mat.highlight() : mat.white()} />
      <C p={[0, 0.045, -0.015]} r={0.075} h={0.006} m={mat.steel()} />
      <mesh position={[0, 0.03, 0.111]}>
        <planeGeometry args={[0.1, 0.035]} />
        <meshBasicMaterial map={live.texture} toneMapped={false} />
      </mesh>
      <BlobShadow r={0.17} />
    </group>
  );
}

function CalorimeterModel({ o, state, onPan }: { o: Thermal; state: PhyThermalState; onPan: boolean }) {
  const f = thermFlags(state.events);
  const waterRef = useRef<Mesh>(null);
  const stirRef = useRef<Group>(null);
  const live = useRef(o);
  live.current = o;
  useFrame(({ clock }) => {
    const p = live.current.phys();
    const level = p.mw > 0 ? Math.min(CAL.h - 0.006, (p.mw / 0.3) * CAL.h) : 0;
    if (waterRef.current) {
      waterRef.current.visible = level > 0.001;
      waterRef.current.scale.set(CAL.r - 0.002, Math.max(0.001, level), CAL.r - 0.002);
      waterRef.current.position.y = CAL.base + level / 2;
    }
    if (stirRef.current) stirRef.current.position.y = p.stirring ? Math.sin(clock.elapsedTime * 5) * 0.012 : 0;
  });
  return (
    <group>
      <Interactive id="cal" label="Copper calorimeter" bench labelY={0.16}>
        {(active) => (
          <group>
            <mesh material={active ? mat.highlight() : copper} position={[0, CAL.base + CAL.h / 2, 0]}>
              <cylinderGeometry args={[CAL.r, CAL.r, CAL.h, 28, 1, true]} />
            </mesh>
            <C p={[0, CAL.base + 0.001, 0]} r={CAL.r} h={0.002} m={copperDark} />
          </group>
        )}
      </Interactive>
      <mesh ref={waterRef} geometry={cyl} material={water} />
      {f.lid && !onPan && <C p={[0, CAL.base + CAL.h + 0.002, 0]} r={CAL.r + 0.003} h={0.003} m={copperDark} />}
      {!onPan && (
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
      )}
    </group>
  );
}

// ------------------------------------------------------------------ cupboard models

function ExtraModel({ id }: { id: ApparatusId }) {
  switch (id) {
    case 'jacket':
      return (
        <group>
          <B p={[0, 0.008, 0]} s={[0.3, 0.016, 0.06]} m={mat.wood()} />
          <XRod x0={-0.13} x1={0.13} y={0.04} z={0} r={0.016} m={brass} />
        </group>
      );
    case 'rod':
      return <XRod x0={0} x1={0.3} y={0.006} z={0} r={0.0045} m={brass} />;
    case 'can':
      return <SteamCan />;
    case 'bunsen':
      return <BunsenBurner />;
    case 'tripod':
      return (
        <group scale={0.8}>
          <Tripod />
        </group>
      );
    case 'tubing':
      return <Tube pts={[[0, 0.01, 0], [0.04, 0.03, 0.03], [0.08, 0.01, 0], [0.12, 0.02, -0.03]]} r={0.004} m={rubber} />;
    case 'thermometer':
      return (
        <group rotation={[0, 0, Math.PI / 2]} position={[0.15, 0.004, 0]}>
          <C p={[0, 0.15, 0]} r={0.0032} h={0.3} m={mat.glass()} />
        </group>
      );
    case 'rule':
      return <B p={[0.2, 0.003, 0]} s={[0.4, 0.006, 0.028]} m={mat.wood()} />;
    case 'beaker':
    case 'ice':
      return (
        <group>
          {id === 'ice' && [0, 1, 2].map((i) => <B key={i} p={[Math.cos(i * 2) * 0.012, 0.03 + i * 0.006, Math.sin(i * 2) * 0.012]} s={[0.014, 0.012, 0.014]} m={iceMat} />)}
          <mesh material={mat.glass()} position={[0, 0.04, 0]}>
            <cylinderGeometry args={[0.035, 0.035, 0.08, 24, 1, true]} />
          </mesh>
          <C p={[0, 0.001, 0]} r={0.035} h={0.002} m={mat.glass()} />
        </group>
      );
    case 'bigbeaker':
      return (
        <group scale={0.7}>
          <C p={[0, BATH.water / 2, 0]} r={BATH.r - 0.002} h={BATH.water} m={water} />
          <mesh material={mat.glass()} position={[0, BATH.h / 2, 0]}>
            <cylinderGeometry args={[BATH.r, BATH.r, BATH.h, 24, 1, true]} />
          </mesh>
        </group>
      );
    case 'capillary':
      return (
        <group rotation={[0, 0, Math.PI / 2]} position={[0.08, 0.014, 0]}>
          <B p={[0, 0.075, 0]} s={[0.026, 0.155, 0.004]} m={mat.wood()} />
        </group>
      );
    case 'stand':
      return (
        <group>
          <B p={[0, 0.007, 0]} s={[0.16, 0.014, 0.14]} m={mat.darkMetal()} />
          <C p={[0, 0.3, -0.04]} r={0.0065} h={0.6} m={mat.steel()} />
        </group>
      );
    case 'stirrer':
      return <C p={[0.07, 0.004, 0]} r={0.003} h={0.15} m={mat.glass()} rot={[0, 0, Math.PI / 2]} />;
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
      return <C p={[0, CAL.jacketH / 2, 0]} r={CAL.jacketR} h={CAL.jacketH} m={jacketMat} />;
    case 'heater':
      return (
        <group rotation={[0, 0, Math.PI / 2]} position={[0.1, 0.012, 0]}>
          <C p={[0, 0.1, 0]} r={0.004} h={0.16} m={mat.steel()} />
          <C p={[0, 0.012, 0]} r={0.012} h={0.03} m={coilMat} />
        </group>
      );
    case 'supply':
      return <Supply on={false} />;
    case 'ammeter':
    case 'voltmeter':
      return <B p={[0, 0.06, 0]} s={[MET.w, MET.h, MET.d]} m={caseMat} />;
    case 'wires':
      return (
        <group>
          {[redW, blackW, blueW].map((m, i) => (
            <mesh key={i} material={m} position={[0, 0.006 + i * 0.006, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.03 - i * 0.005, 0.002, 6, 20]} />
            </mesh>
          ))}
        </group>
      );
    case 'balance':
      return <B p={[0, 0.02, 0]} s={[0.2, 0.04, 0.22]} m={mat.white()} />;
    case 'stopwatch':
      return <StopwatchModel />;
    case 'jug':
      return (
        <group>
          <C p={[0, 0.06, 0]} r={0.045} h={0.12} m={mat.plastic()} />
          <C p={[0, 0.05, 0]} r={0.041} h={0.09} m={water} />
        </group>
      );
    case 'spring':
      return <C p={[0, 0.012, 0]} r={0.012} h={0.024} m={mat.steel()} rot={[0, 0, Math.PI / 2]} />;
    case 'lens':
      return <mesh material={mat.glass()} position={[0, 0.03, 0]} scale={[0.03, 0.03, 0.006]} geometry={sph} />;
  }
  return null;
}

function StopwatchModel({ face }: { face?: ReactNode }) {
  return (
    <group>
      <mesh geometry={cyl} material={mat.black()} position={[0, 0.012, 0]} scale={[0.035, 0.024, 0.035]} />
      <C p={[0, 0.012, -0.04]} r={0.006} h={0.012} m={mat.steel()} rot={[Math.PI / 2, 0, 0]} />
      {face}
      <BlobShadow r={0.05} />
    </group>
  );
}
function WatchFace({ o }: { o: Thermal }) {
  const live = useMemo(() => liveTex(256, 128), []);
  const last = useRef('');
  const ref = useRef(o);
  ref.current = o;
  useEffect(() => () => live.texture.dispose(), [live]);
  useFrame(() => {
    const t = ref.current.now();
    const text = clockText(thermWatch(ref.current.phys(t), t));
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

// ------------------------------------------------------------------ the bench

export function Station({ o, state, scene, interactive, card }: { o: Thermal; state: PhyThermalState; scene: SceneState; interactive: boolean; card: string[] }) {
  const task: ThermTask = scene.task;
  const f = thermFlags(state.events);
  const has = (id: ApparatusId) => scene.collected.has(id);
  const placed = (id: ApparatusId) => scene.placed.has(id);
  const live = useRef(o);
  live.current = o;
  const thermo = () => thermThermo(live.current.v, live.current.phys(), task);
  const hang = f.immersed === 'full' ? HANG.full : f.immersed === 'part' ? HANG.part : HANG.out;
  const drag = interactive ? dragFor : undefined;
  const waiting = (['tripod', 'can', 'jacket', 'tubing', 'thermometer', 'bigbeaker', 'stand', 'capillary'] as ApparatusId[]).filter((id) => has(id) && !placed(id) && (task !== 'ELECTRIC' || id !== 'thermometer'));
  const NEEDS: Record<ThermTask, ApparatusId[]> = {
    EXPANSION: ['jacket', 'rod', 'can', 'bunsen', 'tripod', 'tubing', 'thermometer', 'rule', 'beaker'],
    CHARLES: ['bigbeaker', 'bunsen', 'tripod', 'capillary', 'stand', 'stirrer', 'ice'],
    ELECTRIC: ['calorimeter', 'lagging', 'heater', 'supply', 'ammeter', 'voltmeter', 'wires', 'thermometer', 'balance', 'stopwatch', 'jug'],
  };
  const extras = (Object.keys(APPARATUS_LABEL) as ApparatusId[]).filter((id) => has(id) && !NEEDS[task].includes(id));
  const heaterAt: V3 = f.heaterIn && !f.pan ? [CAL.x + 0.014, CAL.base + 0.004, CAL.z - 0.008] : [CAL.x + 0.13, 0, CAL.z + 0.12];
  return (
    <group position={STATION}>
      <Interactive id="mybench" label="Your bench" labelY={0.5}>
        <mesh position={[0, 0.005, 0]}>
          <boxGeometry args={[BENCH.w, 0.01, BENCH.d]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>
      <CardAndBook
        cardAt={SPOT.card}
        bookAt={SPOT.book}
        title={task === 'CHARLES' ? 'Charles’s law' : task === 'ELECTRIC' ? 'Electrical heating' : 'Linear expansivity'}
        lines={card}
        bookTitle={task === 'CHARLES' ? 'Charles’s law' : task === 'ELECTRIC' ? 'c of water' : 'Expansivity'}
        heads={task === 'CHARLES' ? ['θ/°C', 'l/cm', 'T/K', 'l/T'] : task === 'ELECTRIC' ? ['t/s', 'θ/°C', 'V, I'] : ['l₀', 'θ', 'r']}
      />

      {/* ---------------- EXPANSION */}
      {task === 'EXPANSION' && (
        <>
          {has('bunsen') && (
            <Interactive id="bunsen" label={`Bunsen burner (${f.boiler ? 'lit' : 'off'})`} bench position={[CAN.x, 0, CAN.z]} labelY={0.17}>
              {(active) => (
                <group>
                  <BunsenBurner glow={active} />
                  <Flame on={f.boiler} />
                </group>
              )}
            </Interactive>
          )}
          {placed('tripod') && (
            <Interactive id="tripod" label="Tripod and gauze" bench position={[CAN.x, 0, CAN.z]} labelY={CAN.gauze + 0.02}>
              {() => <Tripod />}
            </Interactive>
          )}
          {placed('can') && (
            <Interactive id="can" label="Steam generator" bench position={[CAN.x, CAN.gauze + 0.0015, CAN.z]} labelY={CAN.h + 0.06}>
              {(active) => (
                <group>
                  <SteamCan />
                  {active && <GlowRing r={0.07} />}
                </group>
              )}
            </Interactive>
          )}
          {placed('jacket') && <JacketModel o={o} rodIn={placed('rod')} interactive={interactive} />}
          {placed('tubing') && placed('can') && placed('jacket') && (
            <Interactive id="tubing" label="Rubber tubing" bench labelY={0.4}>
              {() => <Tube pts={[[CAN.x, CAN.gauze + CAN.h + 0.045, CAN.z], [CAN.x + 0.05, CAN.gauze + CAN.h + 0.1, CAN.z + 0.02], [JACKET.x0 - 0.05, JACKET.y + 0.12, JACKET.z], [JACKET.x0 + 0.03, JACKET.y + JACKET.r + 0.024, JACKET.z]]} r={0.005} m={rubber} />}
            </Interactive>
          )}
          {has('beaker') && (
            <Interactive id="beaker" label="Beaker under the steam outlet" bench position={[OUTLET.x, 0, OUTLET.z]} labelY={0.1}>
              {() => <ExtraModel id="beaker" />}
            </Interactive>
          )}
          {placed('thermometer') && placed('jacket') && (
            <group position={[JTHERMO.x, JTHERMO.y, JTHERMO.z]}>
              <Interactive id="th-jacket" label="Thermometer in the jacket" bench labelY={THERMO.len + 0.02}>
                {(active) => <ThermometerModel reading={thermo} glow={active} />}
              </Interactive>
              <C p={[0, JACKET.r + 0.004, 0]} r={0.007} h={0.012} m={mat.cork()} />
            </group>
          )}
          {has('rule') && (
            <Interactive id="rule" label="Metre rule" bench position={[RULE.x, 0, RULE.z]} labelY={0.04}>
              {(active) => (
                <group>
                  <Rule cm={100} glow={active} />
                  {has('rod') && !placed('rod') && <RodOnRule o={o} />}
                </group>
              )}
            </Interactive>
          )}
          {has('rod') && !placed('rod') && !has('rule') && (
            <Interactive id="rod" label="Metal rod" bench position={[RULE.x, 0, RULE.z - 0.05]}>
              {() => <RodOnRule o={o} />}
            </Interactive>
          )}
        </>
      )}

      {/* ---------------- CHARLES */}
      {task === 'CHARLES' && (
        <>
          {has('bunsen') && (
            <Interactive id="bunsen" label={`Bunsen burner (${f.bunsen ? 'lit' : 'off'})`} bench position={[BATH.x, 0, BATH.z]} labelY={0.17}>
              {(active) => (
                <group>
                  <BunsenBurner glow={active} />
                  <Flame on={f.bunsen} />
                </group>
              )}
            </Interactive>
          )}
          {placed('tripod') && (
            <Interactive id="tripod" label="Tripod and gauze" bench position={[BATH.x, 0, BATH.z]} labelY={BATH.gauze + 0.02}>
              {() => <Tripod />}
            </Interactive>
          )}
          {placed('bigbeaker') && (
            <Interactive id="bigbeaker" label="Large beaker of water" bench position={[BATH.x, BATH.gauze + 0.0015, BATH.z]} labelY={BATH.h + 0.02}>
              {(active) => <BigBeaker o={o} glow={active} />}
            </Interactive>
          )}
          {placed('stand') && (
            <Interactive id="stand" label="Clamp and stand" bench labelY={0.62}>
              {() => <ClampStand armTo={[BATH.x, 0, BATH.z - 0.004]} armY={hang + 0.14} />}
            </Interactive>
          )}
          {placed('capillary') && placed('stand') && (
            <group position={[BATH.x, hang, BATH.z]}>
              <Interactive id="capillary" label="Capillary tube on the ruler" bench labelY={0.17} drag={drag}>
                {(active) => (
                  <group>
                    <CapillaryAssembly o={o} glowTube={active} />
                    <mesh position={[0, 0.075, 0]}>
                      <boxGeometry args={[0.03, 0.15, 0.02]} />
                      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                    </mesh>
                  </group>
                )}
              </Interactive>
              <group position={[-0.022, 0, 0.006]}>
                <Interactive id="th-bath" label="Thermometer (tied to the ruler)" bench labelY={THERMO.len + 0.02}>
                  {(active) => <ThermometerModel reading={thermo} glow={active} />}
                </Interactive>
              </group>
            </group>
          )}
          {has('stirrer') && placed('bigbeaker') && <BathStirrer o={o} interactive={interactive} />}
          {has('ice') && (
            <Interactive id="ice" label="Beaker of ice" bench position={[ICE.x, 0, ICE.z]} labelY={0.1}>
              {(active) => (
                <group>
                  <ExtraModel id="ice" />
                  {active && <GlowRing r={0.05} />}
                </group>
              )}
            </Interactive>
          )}
        </>
      )}

      {/* ---------------- ELECTRIC */}
      {task === 'ELECTRIC' && (
        <>
          {has('lagging') && (
            <Interactive id="lagging" label="Lagging jacket (cotton wool)" bench position={f.lagged && !f.pan ? [CAL.x, 0, CAL.z] : [CAL.x - 0.16, 0, CAL.z + 0.16]} labelY={0.14}>
              {(active) => (
                <group>
                  <C p={[0, CAL.jacketH / 2, 0]} r={CAL.jacketR} h={CAL.jacketH} m={active ? mat.highlight() : jacketMat} />
                  <mesh position={[0, CAL.jacketH + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]} material={cotton}>
                    <ringGeometry args={[f.lagged && !f.pan ? CAL.r + 0.002 : 0, CAL.jacketR, 28]} />
                  </mesh>
                </group>
              )}
            </Interactive>
          )}
          {has('calorimeter') && (
            <group position={f.pan ? [BALANCE.x, 0.048 - CAL.base + 0.0, BALANCE.z - 0.015] : [CAL.x, 0, CAL.z]}>
              <CalorimeterModel o={o} state={state} onPan={f.pan} />
            </group>
          )}
          {has('heater') && (
            <Interactive id="heater" label={`Immersion heater (${f.on ? 'on' : 'off'})`} bench position={heaterAt} rotation={f.heaterIn && !f.pan ? undefined : [0, 0, 0]} labelY={0.22}>
              {(active) => (f.heaterIn && !f.pan ? <HeaterModel o={o} glow={active} /> : <group rotation={[0, 0, Math.PI / 2]} position={[0.1, 0.012, 0]}><HeaterModel o={o} glow={active} /></group>)}
            </Interactive>
          )}
          {has('thermometer') && placed('thermometer') && !f.pan && (
            <group position={thermoBase('ELECTRIC', 0)}>
              <Interactive id="th-cal" label="Thermometer in the calorimeter" bench labelY={THERMO.len + 0.02}>
                {(active) => <ThermometerModel reading={thermo} glow={active} />}
              </Interactive>
            </group>
          )}
          {has('supply') && (
            <Interactive id="supply" label="12 V d.c. supply" bench position={[SUPPLY.x, 0, SUPPLY.z]} labelY={0.14}>
              {(active) => <Supply on={f.on} glow={active} />}
            </Interactive>
          )}
          {has('ammeter') && (
            <Interactive id="ammeter" label="Ammeter (0–3 A)" bench position={[AMMETER.x, 0, AMMETER.z]} labelY={0.15}>
              {(active) => <MeterModel letter="A" fsd={3} minor={0.05} major={0.5} value={() => live.current.shows('ammeter')} glow={active} />}
            </Interactive>
          )}
          {has('voltmeter') && (
            <Interactive id="voltmeter" label="Voltmeter (0–15 V)" bench position={[VOLTMETER.x, 0, VOLTMETER.z]} labelY={0.15}>
              {(active) => <MeterModel letter="V" fsd={15} minor={0.2} major={1} value={() => live.current.shows('voltmeter')} glow={active} />}
            </Interactive>
          )}
          {has('wires') && f.wire !== 'none' && <Wires wide={f.wire === 'wide'} heaterIn={f.heaterIn && !f.pan} />}
          {has('wires') && f.wire === 'none' && (
            <Interactive id="wires" label="Connecting wires" bench position={[-0.15, 0, 0.3]} labelY={0.05}>
              {() => <ExtraModel id="wires" />}
            </Interactive>
          )}
          {has('balance') && (
            <Interactive id="balance" label="Electronic balance" bench position={[BALANCE.x, 0, BALANCE.z]} labelY={0.1}>
              {(active) => <BalanceModel o={o} glow={active} />}
            </Interactive>
          )}
          {has('jug') && (
            <Interactive id="jug" label="Jug of water" bench position={SPOT.jug} labelY={0.15}>
              {(active) => (
                <group>
                  <ExtraModel id="jug" />
                  <BlobShadow r={0.06} />
                  {active && <GlowRing r={0.07} />}
                </group>
              )}
            </Interactive>
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
        <Interactive key={id} id={id} label={APPARATUS_LABEL[id]} bench position={[SPOT.waiting[0] + k * 0.2, 0, SPOT.waiting[2]]} labelY={0.12}>
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

/** The glass stirrer in the bath; it moves while stirring. */
function BathStirrer({ o, interactive }: { o: Thermal; interactive: boolean }) {
  const g = useRef<Group>(null);
  const live = useRef(o);
  live.current = o;
  useFrame(({ clock }) => {
    const p = live.current.phys();
    if (g.current) g.current.position.y = p.t < p.stirUntil ? Math.sin(clock.elapsedTime * 7) * 0.02 : 0;
  });
  return (
    <group position={[BATH.x + 0.038, BATH.gauze + 0.01, BATH.z + 0.02]}>
      <group ref={g}>
        <Interactive id="stirrer" label="Stirrer" bench labelY={0.25} drag={interactive ? dragFor : undefined}>
          {(active) => (
            <group>
              <C p={[0, 0.11, 0]} r={0.0025} h={0.22} m={active ? mat.highlight() : mat.glass()} />
              <mesh position={[0, 0.006, 0]} rotation={[Math.PI / 2, 0, 0]} material={active ? mat.highlight() : mat.glass()}>
                <torusGeometry args={[0.014, 0.002, 6, 16]} />
              </mesh>
            </group>
          )}
        </Interactive>
      </group>
    </group>
  );
}

/** The circuit's wires: supply → ammeter → heater → supply, the voltmeter across the heater (or across the heater and the ammeter). */
function Wires({ wide, heaterIn }: { wide: boolean; heaterIn: boolean }) {
  const hx = heaterIn ? CAL.x + 0.014 : CAL.x + 0.13;
  const hy = heaterIn ? CAL.base + 0.21 : 0.02;
  const hz = heaterIn ? CAL.z - 0.008 : CAL.z + 0.12;
  const top = MET.h + 0.012;
  return (
    <Interactive id="wires" label="Connecting wires" bench labelY={0.3}>
      {() => (
        <group>
          <Tube pts={[[SUPPLY.x - 0.05, 0.112, SUPPLY.z + 0.03], [SUPPLY.x - 0.02, 0.2, SUPPLY.z + 0.05], [AMMETER.x - 0.06, 0.2, AMMETER.z + 0.03], [AMMETER.x - 0.04, top, AMMETER.z + MET.d / 2 - 0.02]]} r={0.0025} m={redW} />
          <Tube pts={[[AMMETER.x + 0.04, top, AMMETER.z + MET.d / 2 - 0.02], [AMMETER.x + 0.1, 0.22, AMMETER.z + 0.04], [hx - 0.05, hy + 0.08, hz], [hx - 0.003, hy, hz]]} r={0.0025} m={redW} />
          <Tube pts={[[SUPPLY.x + 0.05, 0.112, SUPPLY.z + 0.03], [SUPPLY.x + 0.15, 0.06, SUPPLY.z + 0.2], [hx - 0.02, 0.05, hz + 0.12], [hx + 0.003, hy, hz]]} r={0.0025} m={blackW} />
          <Tube pts={[[VOLTMETER.x + 0.04, top, VOLTMETER.z + MET.d / 2 - 0.02], [VOLTMETER.x + 0.06, 0.25, VOLTMETER.z + 0.1], [hx + 0.02, hy + 0.06, hz], [hx + 0.003, hy + 0.004, hz]]} r={0.002} m={blueW} />
          {wide ? (
            <Tube pts={[[VOLTMETER.x - 0.04, top, VOLTMETER.z + MET.d / 2 - 0.02], [VOLTMETER.x - 0.2, 0.26, VOLTMETER.z + 0.05], [AMMETER.x - 0.06, 0.22, AMMETER.z], [AMMETER.x - 0.04, top + 0.004, AMMETER.z + MET.d / 2 - 0.02]]} r={0.002} m={blueW} />
          ) : (
            <Tube pts={[[VOLTMETER.x - 0.04, top, VOLTMETER.z + MET.d / 2 - 0.02], [VOLTMETER.x - 0.05, 0.26, VOLTMETER.z + 0.1], [hx - 0.03, hy + 0.06, hz], [hx - 0.003, hy + 0.004, hz]]} r={0.002} m={blueW} />
          )}
        </group>
      )}
    </Interactive>
  );
}

/** The cupboard's shelves: what is still there. */
const SLOTS: CupboardSlot[] = [
  { id: 'jacket', label: APPARATUS_LABEL.jacket, shelf: 0, x: -0.7, model: <group scale={0.8}><ExtraModel id="jacket" /></group>, grip: [[0.3, 0.06, 0.07], [0, 0.03, 0]] },
  { id: 'can', label: APPARATUS_LABEL.can, shelf: 0, x: -0.4, model: <SteamCan />, grip: [[0.12, 0.16, 0.12], [0, 0.07, 0]] },
  { id: 'bunsen', label: APPARATUS_LABEL.bunsen, shelf: 0, x: -0.22, model: <BunsenBurner />, grip: [[0.08, 0.16, 0.08], [0, 0.07, 0]] },
  { id: 'tripod', label: APPARATUS_LABEL.tripod, shelf: 0, x: -0.04, model: <group scale={0.8}><Tripod /></group>, grip: [[0.14, 0.18, 0.14], [0, 0.08, 0]] },
  { id: 'bigbeaker', label: APPARATUS_LABEL.bigbeaker, shelf: 0, x: 0.14, model: <ExtraModel id="bigbeaker" />, grip: [[0.1, 0.12, 0.1], [0, 0.05, 0]] },
  { id: 'stand', label: APPARATUS_LABEL.stand, shelf: 0, x: 0.3, model: <group scale={0.45}><ExtraModel id="stand" /></group>, grip: [[0.08, 0.28, 0.08], [0, 0.13, 0]] },
  { id: 'rod', label: APPARATUS_LABEL.rod, shelf: 1, x: -0.78, model: <ExtraModel id="rod" />, grip: [[0.3, 0.03, 0.04], [0.15, 0.01, 0]] },
  { id: 'tubing', label: APPARATUS_LABEL.tubing, shelf: 1, x: -0.42, model: <ExtraModel id="tubing" />, grip: [[0.14, 0.05, 0.08], [0.06, 0.02, 0]] },
  { id: 'thermometer', label: APPARATUS_LABEL.thermometer, shelf: 1, x: -0.26, model: <group scale={0.7}><ExtraModel id="thermometer" /></group>, grip: [[0.22, 0.03, 0.04], [0.1, 0.01, 0]] },
  { id: 'rule', label: APPARATUS_LABEL.rule, shelf: 1, x: -0.02, model: <group scale={0.6}><ExtraModel id="rule" /></group>, grip: [[0.25, 0.02, 0.04], [0.12, 0.005, 0]] },
  { id: 'beaker', label: APPARATUS_LABEL.beaker, shelf: 1, x: 0.2, model: <ExtraModel id="beaker" />, grip: [[0.08, 0.09, 0.08], [0, 0.04, 0]] },
  { id: 'capillary', label: APPARATUS_LABEL.capillary, shelf: 1, x: 0.3, model: <group scale={0.6}><ExtraModel id="capillary" /></group>, grip: [[0.1, 0.03, 0.04], [0.05, 0.01, 0]] },
  { id: 'calorimeter', label: APPARATUS_LABEL.calorimeter, shelf: 2, x: -0.78, model: <ExtraModel id="calorimeter" />, grip: [[0.08, 0.1, 0.08], [0, 0.045, 0]] },
  { id: 'lagging', label: APPARATUS_LABEL.lagging, shelf: 2, x: -0.64, model: <ExtraModel id="lagging" />, grip: [[0.12, 0.11, 0.12], [0, 0.05, 0]] },
  { id: 'heater', label: APPARATUS_LABEL.heater, shelf: 2, x: -0.5, model: <group scale={0.7}><ExtraModel id="heater" /></group>, grip: [[0.16, 0.04, 0.04], [0.07, 0.01, 0]] },
  { id: 'supply', label: APPARATUS_LABEL.supply, shelf: 2, x: -0.3, model: <group scale={0.7}><Supply on={false} /></group>, grip: [[0.14, 0.08, 0.1], [0, 0.035, 0]] },
  { id: 'ammeter', label: APPARATUS_LABEL.ammeter, shelf: 2, x: -0.15, model: <group scale={0.7}><ExtraModel id="ammeter" /></group>, grip: [[0.12, 0.09, 0.07], [0, 0.04, 0]] },
  { id: 'voltmeter', label: APPARATUS_LABEL.voltmeter, shelf: 2, x: -0.03, model: <group scale={0.7}><ExtraModel id="voltmeter" /></group>, grip: [[0.12, 0.09, 0.07], [0, 0.04, 0]] },
  { id: 'wires', label: APPARATUS_LABEL.wires, shelf: 2, x: 0.08, model: <ExtraModel id="wires" />, grip: [[0.07, 0.03, 0.07], [0, 0.01, 0]] },
  { id: 'balance', label: APPARATUS_LABEL.balance, shelf: 2, x: 0.2, model: <group scale={0.55}><ExtraModel id="balance" /></group>, grip: [[0.12, 0.03, 0.13], [0, 0.012, 0]] },
  { id: 'stopwatch', label: APPARATUS_LABEL.stopwatch, shelf: 2, x: 0.3, model: <StopwatchModel />, grip: [[0.08, 0.05, 0.08], [0, 0.02, 0]] },
  { id: 'stirrer', label: APPARATUS_LABEL.stirrer, shelf: 1, x: 0.1, z: 0.1, model: <group scale={0.6}><ExtraModel id="stirrer" /></group>, grip: [[0.1, 0.02, 0.03], [0.04, 0.005, 0]] },
  { id: 'ice', label: APPARATUS_LABEL.ice, shelf: 0, x: 0.22, z: 0.12, model: <ExtraModel id="ice" />, grip: [[0.08, 0.09, 0.08], [0, 0.04, 0]] },
  { id: 'jug', label: APPARATUS_LABEL.jug, shelf: 0, x: -0.55, z: 0.1, model: <group scale={0.8}><ExtraModel id="jug" /></group>, grip: [[0.09, 0.11, 0.09], [0, 0.05, 0]] },
  { id: 'spring', label: APPARATUS_LABEL.spring, shelf: 1, x: -0.58, z: 0.12, model: <ExtraModel id="spring" />, grip: [[0.05, 0.04, 0.04], [0, 0.012, 0]] },
  { id: 'lens', label: APPARATUS_LABEL.lens, shelf: 2, x: 0.12, z: 0.12, model: <ExtraModel id="lens" />, grip: [[0.07, 0.07, 0.04], [0, 0.03, 0]] },
];
export function ThermalCupboard({ scene }: { scene: SceneState }) {
  return <CupboardItems slots={SLOTS} collected={scene.collected} />;
}
