import { ELEC_STEPS, RUST_TUBES, RUST_V0, rustIndex, type ChemElectroState, type RustTube } from '@aischool/shared';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { BoxGeometry, CatmullRomCurve3, Color, CylinderGeometry, DoubleSide, MeshStandardMaterial, TubeGeometry, Vector3, type Group, type Material, type Mesh } from 'three';
import { BlobShadow, ConicalFlask, Funnel, GlowRing, MeasuringCylinder, ReagentBottle, WashBottle } from '../../../lab3d-kit/apparatus';
import { Interactive } from '../../../lab3d-kit/interact';
import { BENCH, STATION } from '../../../lab3d-kit/layout';
import { colourMaterial, liquidMaterial, mat } from '../../../lab3d-kit/materials';
import { Burner, Spatula } from '../../chem-qualitative/lab3d/models';
import { CardAndBook, CupboardItems, type CupboardSlot } from '../../phy-common/lab3d/common';
import { FONT, liveTex, meterFaceTexture } from '../../phy-common/lab3d/tex';
import { COPPER, FRESH_COPPER, IRON, RUST, ZINC, ZNSO4, copperColour, dispBalance, elecBalance, fmtClock, mixedColour, type Electro } from '../actions';
import { useBench } from './bench-store';
import { dragFor } from './drag';
import { APPARATUS_LABEL, type ApparatusId, type SceneState } from './scene-state';
import { SPOT, type V3 } from './views';

/**
 * The electrochemistry bench, built for the lesson's task. Electrolysis: the
 * voltameter (blue CuSO₄, two copper plates — the cathode turning pink with
 * fresh copper), the d.c. supply, the ammeter with its needle at the live
 * current, the rheostat, the plug key, the stopwatch and wires. The cell: two
 * beakers with the zinc and copper strips, the filter-paper salt bridge and
 * the voltmeters with their leads. Displacement: the beaker going from blue to
 * green as the grey filings turn brown, its thermometer, the balance and
 * boat, the funnel. Rusting: four tubes in a rack (the nails rusting day by
 * day), oil, stoppers, and the graduated tube of air over water in a trough.
 */

const box = new BoxGeometry(1, 1, 1);
const cyl = new CylinderGeometry(1, 1, 1, 20);
const cylOpen = new CylinderGeometry(1, 1, 1, 24, 1, true);
const glass = new MeshStandardMaterial({ color: '#dfeaf0', roughness: 0.05, transparent: true, opacity: 0.28, side: DoubleSide, depthWrite: false });
const paperMat = new MeshStandardMaterial({ color: '#f7f5ee', roughness: 0.9 });
const sandMat = new MeshStandardMaterial({ color: '#c9a56b', roughness: 1 });
const casing = new MeshStandardMaterial({ color: '#2b2f35', roughness: 0.45, metalness: 0.2 });
const ebonite = new MeshStandardMaterial({ color: '#1d1f22', roughness: 0.45 });
const brass = new MeshStandardMaterial({ color: '#c9a23a', roughness: 0.3, metalness: 0.85 });
const redCap = new MeshStandardMaterial({ color: '#c62828', roughness: 0.4 });
const blackCap = new MeshStandardMaterial({ color: '#202124', roughness: 0.4 });
const wireRed = new MeshStandardMaterial({ color: '#c62828', roughness: 0.55 });
const wireBlack = new MeshStandardMaterial({ color: '#25282c', roughness: 0.55 });
const coilMat = new MeshStandardMaterial({ color: '#a46a3b', roughness: 0.5, metalness: 0.5 });
const redMat = new MeshStandardMaterial({ color: '#c62828' });
const needleMat = new MeshStandardMaterial({ color: '#111', roughness: 0.4 });
const oilMat = new MeshStandardMaterial({ color: '#e8c86a', roughness: 0.1, transparent: true, opacity: 0.75 });
const corkMat = new MeshStandardMaterial({ color: '#7a5032', roughness: 0.8 });
const woolMat = new MeshStandardMaterial({ color: '#5f6267', roughness: 0.9, metalness: 0.4 });
const bubbleMat = new MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.7 });

function B({ p, s, m, r }: { p: V3; s: V3; m: Material; r?: V3 }) {
  return <mesh geometry={box} material={m} position={p} scale={s} rotation={r} />;
}
function C({ p, r, h, m, rot, open }: { p: V3; r: number; h: number; m: Material; rot?: V3; open?: boolean }) {
  return <mesh geometry={open ? cylOpen : cyl} material={m} position={p} scale={[r, h, r]} rotation={rot} renderOrder={open ? 4 : 0} />;
}
function Post({ cap }: { cap: Material }) {
  return (
    <group>
      <C p={[0, 0.006, 0]} r={0.006} h={0.012} m={brass} />
      <C p={[0, 0.015, 0]} r={0.008} h={0.007} m={cap} />
    </group>
  );
}
/** A wire through station-local points (raised a little between its ends). */
function Wire({ pts, m }: { pts: V3[]; m: Material }) {
  const geo = useMemo(() => {
    const v = pts.map((p) => new Vector3(...p));
    return new TubeGeometry(new CatmullRomCurve3(v), 40, 0.0022, 6, false);
  }, [pts]);
  useEffect(() => () => geo.dispose(), [geo]);
  return <mesh geometry={geo} material={m} />;
}
const arc = (a: V3, b: V3, lift = 0.05): V3[] => [a, [(a[0] * 3 + b[0]) / 4, Math.max(a[1], b[1]) + lift, (a[2] * 3 + b[2]) / 4], [(a[0] + b[0] * 3) / 4, Math.max(a[1], b[1]) + lift, (a[2] + b[2] * 3) / 4], b];
const add = (p: V3, d: V3): V3 => [p[0] + d[0], p[1] + d[1], p[2] + d[2]];

/** Wraps an object on the bench: selectable, with a glow ring when hovered. */
function Obj({ id, label, at, labelY = 0.15, r = 0.06, drag, children }: { id: string; label: string; at: V3; labelY?: number; r?: number; drag?: (id: string) => string | null; children: ReactNode }) {
  return (
    <Interactive id={id} label={label} bench position={at} labelY={labelY} drag={drag as never}>
      {(active) => (
        <group>
          {children}
          {active && <GlowRing r={r} />}
        </group>
      )}
    </Interactive>
  );
}

function BalanceModel({ shows }: { shows: string }) {
  const tex = useMemo(() => liveTex(256, 96), []);
  useEffect(() => {
    tex.redraw((g, w, h) => {
      g.fillStyle = '#9fc59a';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#10200d';
      g.font = '700 54px ui-monospace, Menlo, monospace';
      g.textAlign = 'right';
      g.textBaseline = 'middle';
      g.fillText(shows, w - 14, h / 2 + 2);
    });
  }, [shows, tex]);
  return (
    <group>
      <B p={[0, 0.025, 0]} s={[0.16, 0.05, 0.2]} m={mat.white()} />
      <C p={[0, 0.054, -0.02]} r={0.06} h={0.006} m={mat.steel()} />
      <mesh position={[0, 0.03, 0.1005]}>
        <planeGeometry args={[0.07, 0.026]} />
        <meshBasicMaterial map={tex.texture} toneMapped={false} />
      </mesh>
      <BlobShadow r={0.13} />
    </group>
  );
}
/** A small LCD box (stopwatch, digital voltmeter) redrawn from `text()` each frame it changes. */
function Lcd({ text, w = 0.1, h = 0.06, d = 0.04, bg = '#c7d3b4', fg = '#16200d', body = casing, label }: { text: () => string; w?: number; h?: number; d?: number; bg?: string; fg?: string; body?: Material; label?: string }) {
  const tex = useMemo(() => liveTex(256, 112), []);
  const last = useRef('');
  useFrame(() => {
    const t = text();
    if (t === last.current) return;
    last.current = t;
    tex.redraw((g, W, H) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);
      g.fillStyle = fg;
      g.font = '700 58px ui-monospace, Menlo, monospace';
      g.textAlign = 'right';
      g.textBaseline = 'middle';
      g.fillText(t, W - 14, H / 2 - (label ? 8 : 0));
      if (label) {
        g.font = `600 20px ${FONT}`;
        g.textAlign = 'left';
        g.fillText(label, 12, H - 14);
      }
    });
  });
  return (
    <group>
      <B p={[0, h / 2, 0]} s={[w, h, d]} m={body} />
      <mesh position={[0, h * 0.58, d / 2 + 0.0006]}>
        <planeGeometry args={[w * 0.78, h * 0.48]} />
        <meshBasicMaterial map={tex.texture} toneMapped={false} />
      </mesh>
      <BlobShadow r={Math.max(w, d) * 0.75} />
    </group>
  );
}
/** A moving-coil meter whose needle follows `value()` (0 … fsd). */
function AnalogMeter({ letter, fsd, minor, major, value }: { letter: 'A' | 'V'; fsd: number; minor: number; major: number; value: () => number }) {
  const face = useMemo(() => meterFaceTexture(letter, fsd, minor, major), [letter, fsd, minor, major]);
  const needle = useRef<Group>(null);
  useFrame((_, dt) => {
    const g = needle.current;
    if (!g) return;
    const shown = Math.max(-0.03 * fsd, Math.min(1.05 * fsd, value()));
    const target = -((-50 + 100 * (shown / fsd)) * Math.PI) / 180;
    g.rotation.z += (target - g.rotation.z) * Math.min(1, dt * 6);
  });
  const W = 0.13;
  const H = 0.1;
  const D = 0.06;
  return (
    <group>
      <B p={[0, H / 2, 0]} s={[W, H, D]} m={casing} />
      <mesh position={[0, H * 0.58, D / 2 + 0.0008]}>
        <planeGeometry args={[W * 0.88, H * 0.66]} />
        <meshStandardMaterial map={face} roughness={0.5} />
      </mesh>
      <group ref={needle} position={[0, H * 0.58 - H * 0.33 + 0.007, D / 2 + 0.003]}>
        <B p={[0, 0.026, 0]} s={[0.0012, 0.052, 0.0006]} m={needleMat} />
      </group>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.045, H, 0.012]}>
          <Post cap={s > 0 ? redCap : blackCap} />
        </group>
      ))}
      <BlobShadow r={0.1} />
    </group>
  );
}

// ------------------------------------------------------------------ ELEC

const VOLT = { r: 0.048, h: 0.11 };
const PLATE = { w: 0.034, h: 0.095, d: 0.0025 };
function Voltameter({ x, s }: { x: Electro; s: ChemElectroState }) {
  const e = s.elec;
  const carbon = x.v.elec.electrodes === 'C';
  const dep = Math.min(1, x.look.deposit / 0.5);
  const sep = e.gap === 'TOUCH' ? 0.003 : 0.024;
  const p1Cathode = e.cathodeTo !== 'POS';
  const bubbles = useRef<Group>(null);
  useFrame(() => {
    const g = bubbles.current;
    if (!g) return;
    g.visible = carbon && e.closed;
    const t = performance.now() / 600;
    g.children.forEach((c, i) => (c.position.y = 0.02 + ((t + i * 0.37) % 1) * 0.07));
  });
  const plate = (sx: number, cathode: boolean) => (
    <group position={[sx, 0, 0]}>
      {carbon ? <C p={[0, 0.06, 0]} r={0.006} h={0.11} m={colourMaterial('#2a2a2c')} /> : <mesh geometry={box} material={colourMaterial(cathode && dep > 0.03 ? FRESH_COPPER : COPPER)} position={[0, 0.06, 0]} scale={[PLATE.d + (cathode ? dep * 0.0015 : -dep * 0.0008), PLATE.h, PLATE.w]} renderOrder={6} />}
      <B p={[0, VOLT.h + 0.004, 0]} s={[0.008, 0.012, 0.012]} m={mat.steel()} />
    </group>
  );
  return (
    <group>
      <BlobShadow r={0.06} />
      {e.removed ? null : (
        <>
          {plate(-sep, p1Cathode)}
          {plate(sep, !p1Cathode)}
        </>
      )}
      <C p={[0, 0.045, 0]} r={VOLT.r - 0.003} h={0.085} m={liquidMaterial(copperColour(x.look.cuConc), 0.84)} />
      <C p={[0, VOLT.h / 2, 0]} r={VOLT.r} h={VOLT.h} m={glass} open />
      <C p={[0, 0.002, 0]} r={VOLT.r} h={0.004} m={glass} />
      <group ref={bubbles} position={[p1Cathode ? sep : -sep, 0, 0]} visible={false}>
        {[0, 1, 2, 3].map((k) => (
          <mesh key={k} geometry={cyl} material={bubbleMat} position={[0.004 * (k % 2), 0.03, 0.006 * (k - 1.5)]} scale={[0.0018, 0.0018, 0.0018]} />
        ))}
      </group>
    </group>
  );
}
function Supply() {
  return (
    <group>
      <B p={[0, 0.045, 0]} s={[0.16, 0.09, 0.11]} m={mat.cabinet()} />
      <B p={[0, 0.06, 0.0555]} s={[0.1, 0.03, 0.002]} m={ebonite} />
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.05, 0.09, 0.02]}>
          <Post cap={s > 0 ? redCap : blackCap} />
        </group>
      ))}
      <BlobShadow r={0.12} />
    </group>
  );
}
function RheostatModel({ step }: { step: number }) {
  const slider = useRef<Group>(null);
  const L = 0.2;
  useFrame((_, dt) => {
    const g = slider.current;
    if (g) g.position.x += (L * (step / ELEC_STEPS) - L / 2 - g.position.x) * Math.min(1, dt * 12);
  });
  return (
    <group>
      {[-1, 1].map((s) => (
        <B key={s} p={[(s * (L + 0.03)) / 2, 0.04, 0]} s={[0.025, 0.08, 0.05]} m={mat.cabinet()} />
      ))}
      <C p={[0, 0.035, 0]} r={0.02} h={L} m={coilMat} rot={[0, 0, Math.PI / 2]} />
      <C p={[0, 0.072, 0]} r={0.003} h={L + 0.02} m={mat.steel()} rot={[0, 0, Math.PI / 2]} />
      <group ref={slider} position={[L * (step / ELEC_STEPS) - L / 2, 0, 0]}>
        <B p={[0, 0.072, 0]} s={[0.018, 0.018, 0.024]} m={ebonite} />
        <B p={[0, 0.058, 0]} s={[0.008, 0.02, 0.006]} m={brass} />
      </group>
      <BlobShadow r={0.15} />
    </group>
  );
}
function KeyModel({ closed }: { closed: boolean }) {
  return (
    <group>
      <B p={[0, 0.008, 0]} s={[0.12, 0.016, 0.05]} m={ebonite} />
      {[-0.026, 0.026].map((x) => (
        <B key={x} p={[x, 0.024, 0]} s={[0.044, 0.016, 0.03]} m={brass} />
      ))}
      <group position={closed ? [0, 0.034, 0] : [0, 0.02, 0.05]} rotation={closed ? [0, 0, 0] : [Math.PI / 2, 0, 0]}>
        <C p={[0, 0, 0]} r={0.005} h={0.022} m={brass} />
        <C p={[0, 0.016, 0]} r={0.009} h={0.012} m={ebonite} />
      </group>
      <BlobShadow r={0.08} />
    </group>
  );
}
function LoosePlates({ sanded, sanding }: { sanded: boolean; sanding: boolean }) {
  const g = useRef<Group>(null);
  useFrame(() => {
    if (g.current) g.current.position.x = sanding && useBench.getState().sandUntil > performance.now() ? Math.sin(performance.now() / 40) * 0.006 : 0;
  });
  const m = colourMaterial(sanded ? '#d77a4f' : '#9a5a3a');
  return (
    <group ref={g}>
      {[-0.025, 0.025].map((x) => (
        <B key={x} p={[x, 0.002, 0]} s={[PLATE.w, PLATE.d, PLATE.h]} m={m} />
      ))}
    </group>
  );
}
function SandpaperModel() {
  return <B p={[0, 0.001, 0]} s={[0.07, 0.002, 0.05]} m={sandMat} />;
}

// ------------------------------------------------------------------ CELL

function HalfCell({ fill, metal, inPlace }: { fill: string; metal: string; inPlace: boolean }) {
  return (
    <group>
      <BlobShadow r={0.045} />
      {inPlace && <B p={[0, 0.07, -0.012]} s={[0.022, 0.12, 0.002]} m={colourMaterial(metal)} />}
      <C p={[0, 0.035, 0]} r={0.033} h={0.065} m={liquidMaterial(fill, 0.72)} />
      <C p={[0, 0.045, 0]} r={0.035} h={0.09} m={glass} open />
      <C p={[0, 0.002, 0]} r={0.035} h={0.004} m={glass} />
    </group>
  );
}
function BridgeArch({ soaked }: { soaked: boolean }) {
  const pts: V3[] = [
    [SPOT.znBeaker[0] + 0.012, 0.05, SPOT.znBeaker[2] + 0.012],
    [SPOT.znBeaker[0] + 0.02, 0.12, SPOT.znBeaker[2] + 0.012],
    [0, 0.14, SPOT.znBeaker[2] + 0.012],
    [SPOT.cuBeaker[0] - 0.02, 0.12, SPOT.cuBeaker[2] + 0.012],
    [SPOT.cuBeaker[0] - 0.012, 0.05, SPOT.cuBeaker[2] + 0.012],
  ];
  const geo = useMemo(() => new TubeGeometry(new CatmullRomCurve3(pts.map((p) => new Vector3(...p))), 30, 0.005, 4, false), []); // eslint-disable-line react-hooks/exhaustive-deps
  return <mesh geometry={geo} material={colourMaterial(soaked ? '#d8d0b2' : '#f7f5ee')} scale={[1, 1, 0.4]} position={[0, 0, (SPOT.znBeaker[2] + 0.012) * 0.6]} />;
}
function Kno3Dish({ soaked }: { soaked: boolean }) {
  return (
    <group>
      <C p={[0, 0.006, 0]} r={0.045} h={0.012} m={glass} open />
      <C p={[0, 0.004, 0]} r={0.043} h={0.006} m={liquidMaterial('#eef3f6', 0.7)} />
      {!soaked && <B p={[0.0, 0.009, 0]} s={[0.07, 0.001, 0.012]} m={paperMat} />}
      <BlobShadow r={0.05} />
    </group>
  );
}

// ------------------------------------------------------------------ DISP

function DispBeaker({ x, s }: { x: Electro; s: ChemElectroState }) {
  const d = s.disp;
  const rod = useRef<Group>(null);
  useFrame(() => {
    if (!rod.current) return;
    const stirring = (d.added && d.stir === 'STIR' && !d.filtered && x.look.extent < 0.97) || useBench.getState().stirUntil > performance.now();
    rod.current.visible = stirring;
    const a = performance.now() / 110;
    rod.current.position.set(Math.cos(a) * 0.012, 0, Math.sin(a) * 0.012);
  });
  const colour = d.cuso4 !== null && !d.filtered ? mixedColour(x.look.ions.cu, x.look.ions.fe) : null;
  const e = x.look.extent;
  const solid = e > 0.6 ? FRESH_COPPER : e > 0.15 ? COPPER : IRON;
  return (
    <group>
      <BlobShadow r={0.05} />
      {colour && <C p={[0, 0.003 + 0.032, 0]} r={0.031} h={0.064 * Math.min(1, (d.cuso4 ?? 0) / 50)} m={liquidMaterial(colour, 0.88)} />}
      {d.added && !d.filtered && <mesh geometry={cyl} material={colourMaterial(solid)} position={[0, 0.006, 0]} scale={[0.024, 0.005, 0.024]} renderOrder={6} />}
      <C p={[0, 0.045, 0]} r={0.033} h={0.09} m={glass} open />
      <C p={[0, 0.002, 0]} r={0.033} h={0.004} m={glass} />
      {d.thermo && (!d.added || d.watched) && !d.filtered && <ThermoModel temp={() => x.look.temp} at={[0.016, 0.005, -0.006]} />}
      <group ref={rod} visible={false}>
        <C p={[0, 0.07, 0]} r={0.0025} h={0.14} m={glass} rot={[0.15, 0, 0.1]} />
      </group>
    </group>
  );
}
/** A thermometer standing in a liquid: the red column at the live temperature (0–110 °C over 0.22 m). */
function ThermoModel({ temp, at }: { temp: () => number; at: V3 }) {
  const col = useRef<Mesh>(null);
  useFrame(() => {
    const h = 0.01 + Math.max(0, Math.min(1, temp() / 110)) * 0.2;
    if (col.current) {
      col.current.scale.set(0.0011, h, 0.0011);
      col.current.position.y = 0.012 + h / 2;
    }
  });
  return (
    <group position={at}>
      <C p={[0, 0.115, 0]} r={0.0032} h={0.23} m={glass} />
      <C p={[0, 0.008, 0]} r={0.0042} h={0.014} m={redMat} />
      <mesh ref={col} geometry={cyl} material={redMat} position={[0, 0.05, 0]} />
    </group>
  );
}
function Boat({ fe }: { fe: number }) {
  return (
    <group>
      <B p={[0, 0.004, 0]} s={[0.05, 0.006, 0.04]} m={mat.white()} />
      {fe > 0 && <C p={[0, 0.009, 0]} r={Math.min(0.016, 0.006 + fe * 0.016)} h={0.004 + Math.min(0.006, fe * 0.008)} m={colourMaterial(IRON)} />}
    </group>
  );
}
function FunnelFlask({ residue, filtrate }: { residue: string | null; filtrate: string | null }) {
  return (
    <group>
      <ConicalFlask volume={filtrate ? 40 : 0} colour={filtrate} />
      <group position={[0, 0.15, 0]}>
        <Funnel />
        <mesh position={[0, 0.045, 0]} rotation={[Math.PI, 0, 0]} material={paperMat}>
          <coneGeometry args={[0.03, 0.036, 16, 1, true]} />
        </mesh>
        {residue && <C p={[0, 0.032, 0]} r={0.012} h={0.006} m={colourMaterial(residue)} />}
      </group>
    </group>
  );
}

// ------------------------------------------------------------------ RUST

const TUBE = { r: 0.011, h: 0.15, gap: 0.05 };
const rustColour = (idx: number) => {
  const f = Math.min(1, idx / 1.2);
  return `#${new Color('#8d949b').lerp(new Color(RUST), f).getHexString()}`;
};
function RustRack({ x, s }: { x: Electro; s: ChemElectroState }) {
  const w = s.rust;
  return (
    <group>
      <B p={[0, 0.004, 0]} s={[0.24, 0.008, 0.06]} m={mat.wood()} />
      <B p={[0, 0.09, 0]} s={[0.24, 0.008, 0.06]} m={mat.wood()} />
      {RUST_TUBES.map((t, k) => (
        <group key={t} position={[(k - 1.5) * TUBE.gap, 0.012, 0]}>
          <Tube x={x} s={s} t={t} />
        </group>
      ))}
      <BlobShadow r={0.16} />
      {void w}
    </group>
  );
}
function Tube({ x, s, t }: { x: Electro; s: ChemElectroState; t: RustTube }) {
  const tw = s.rust.tubes[t];
  const idx = rustIndex(x.v, s.rust, t, x.look.day);
  const water = tw.content && tw.content !== 'CACL2';
  const lvl = 0.1;
  return (
    <group>
      {water && <C p={[0, lvl / 2, 0]} r={TUBE.r - 0.001} h={lvl} m={liquidMaterial(tw.content === 'SALT' ? '#d6e6ee' : idx > 0.3 ? '#d9b38a' : '#dcecf5', 0.6)} />}
      {tw.content === 'CACL2' && <C p={[0, 0.012, 0]} r={TUBE.r - 0.001} h={0.024} m={colourMaterial('#f3f1ea')} />}
      {tw.oil && <C p={[0, lvl + 0.006, 0]} r={TUBE.r - 0.001} h={0.012} m={oilMat} />}
      {tw.nail && (
        <group position={[0, tw.content === 'CACL2' ? 0.03 : 0.012, 0]} rotation={[0, 0, 0.12]}>
          <C p={[0, 0.04, 0]} r={0.0016} h={0.08} m={colourMaterial(rustColour(idx))} />
          <C p={[0, 0.081, 0]} r={0.0035} h={0.002} m={colourMaterial(rustColour(idx))} />
        </group>
      )}
      {idx > 1.2 && <C p={[0, 0.004, 0]} r={TUBE.r - 0.002} h={0.004} m={colourMaterial(RUST)} />}
      <C p={[0, TUBE.h / 2, 0]} r={TUBE.r} h={TUBE.h} m={glass} open />
      {tw.stopper && <C p={[0, TUBE.h + 0.006, 0]} r={TUBE.r + 0.0015} h={0.016} m={corkMat} />}
    </group>
  );
}
function TroughTube({ x, s }: { x: Electro; s: ChemElectroState }) {
  const w = s.rust;
  const level = useRef<Mesh>(null);
  const tubeH = 0.3;
  const bottom = 0.02;
  const yOf = (vol: number) => bottom + tubeH - 0.01 - (vol / (RUST_V0 * 1.2)) * (tubeH - 0.03);
  useFrame(() => {
    const m = level.current;
    if (!m) return;
    const y = yOf(x.look.volume);
    const h = Math.max(0.002, y - bottom);
    m.scale.set(0.0145, h, 0.0145);
    m.position.y = bottom + h / 2;
  });
  return (
    <group>
      <BlobShadow r={0.11} />
      <C p={[0, 0.03, 0]} r={0.095} h={0.06} m={glass} open />
      <C p={[0, 0.026, 0]} r={0.092} h={0.05} m={liquidMaterial('#cfe4f1', 0.55)} />
      {w.wool && (
        <>
          <mesh ref={level} geometry={cyl} material={liquidMaterial('#cfe4f1', 0.7)} position={[0, 0.05, 0]} />
          <C p={[0, bottom + tubeH - 0.03, 0]} r={0.013} h={0.035} m={w.wool === 'MOIST' ? woolMat : colourMaterial('#8d9196')} />
        </>
      )}
      <C p={[0, bottom + tubeH / 2, 0]} r={0.016} h={tubeH} m={glass} open />
      <C p={[0, bottom + tubeH, 0]} r={0.016} h={0.004} m={glass} />
      {/* clamp stand */}
      <B p={[0.1, 0.006, 0.06]} s={[0.12, 0.012, 0.16]} m={mat.darkMetal()} />
      <C p={[0.13, 0.2, 0.06]} r={0.005} h={0.4} m={mat.steel()} />
      <B p={[0.065, bottom + tubeH - 0.05, 0.03]} s={[0.13, 0.008, 0.008]} m={mat.darkMetal()} r={[0, -0.4, 0]} />
    </group>
  );
}
function BoilBeaker({ boiled }: { boiled: boolean }) {
  return (
    <group>
      <Burner lit={false} />
      {[0, 1, 2].map((k) => {
        const a = (k / 3) * Math.PI * 2;
        return <C key={k} p={[Math.cos(a) * 0.05, 0.075, Math.sin(a) * 0.05]} r={0.0035} h={0.15} m={mat.darkMetal()} />;
      })}
      <B p={[0, 0.15, 0]} s={[0.13, 0.003, 0.13]} m={mat.metal()} />
      <group position={[0, 0.152, 0]}>
        <C p={[0, 0.025, 0]} r={0.028} h={0.05} m={liquidMaterial('#e6f0f5', boiled ? 0.5 : 0.6)} />
        <C p={[0, 0.035, 0]} r={0.03} h={0.07} m={glass} open />
      </group>
    </group>
  );
}

// ------------------------------------------------------------------ cupboard and extras

function ExtraModel({ id }: { id: ApparatusId }) {
  switch (id) {
    case 'voltameter':
      return (
        <group>
          <C p={[0, VOLT.h / 2, 0]} r={VOLT.r} h={VOLT.h} m={glass} open />
          <C p={[0, 0.002, 0]} r={VOLT.r} h={0.004} m={glass} />
        </group>
      );
    case 'plates':
      return <LoosePlates sanded={false} sanding={false} />;
    case 'sandpaper':
      return <SandpaperModel />;
    case 'supply':
      return <Supply />;
    case 'ammeter':
      return <AnalogMeter letter="A" fsd={1} minor={0.02} major={0.2} value={() => 0} />;
    case 'rheostat':
      return <RheostatModel step={80} />;
    case 'key':
      return <KeyModel closed={false} />;
    case 'stopwatch':
      return <Lcd text={() => '0:00'} w={0.06} h={0.03} d={0.05} bg="#20262c" fg="#d6dee5" />;
    case 'balance':
      return <BalanceModel shows="0.00" />;
    case 'washBottle':
      return <WashBottle />;
    case 'beakers':
      return (
        <group>
          {[-0.04, 0.04].map((x) => (
            <C key={x} p={[x, 0.045, 0]} r={0.035} h={0.09} m={glass} open />
          ))}
        </group>
      );
    case 'strips':
      return (
        <group>
          <B p={[-0.015, 0.002, 0]} s={[0.022, 0.002, 0.12]} m={colourMaterial(ZINC)} />
          <B p={[0.015, 0.002, 0]} s={[0.022, 0.002, 0.12]} m={colourMaterial(COPPER)} />
        </group>
      );
    case 'bridge':
    case 'filterPaper':
      return <C p={[0, 0.003, 0]} r={0.05} h={0.005} m={paperMat} />;
    case 'voltmeter':
      return <Lcd text={() => '-.--'} w={0.11} h={0.06} d={0.05} label="V  hi-Z" />;
    case 'mcVoltmeter':
      return <AnalogMeter letter="V" fsd={2.5} minor={0.05} major={0.5} value={() => 0} />;
    case 'leads':
      return (
        <group>
          <C p={[0, 0.004, -0.01]} r={0.003} h={0.14} m={wireRed} rot={[0, 0, Math.PI / 2]} />
          <C p={[0, 0.004, 0.01]} r={0.003} h={0.14} m={wireBlack} rot={[0, 0, Math.PI / 2]} />
        </group>
      );
    case 'beaker':
      return <C p={[0, 0.045, 0]} r={0.033} h={0.09} m={glass} open />;
    case 'cylinder':
      return <MeasuringCylinder />;
    case 'thermometer':
      return <C p={[0, 0.004, 0]} r={0.0035} h={0.23} rot={[0, 0, Math.PI / 2]} m={glass} />;
    case 'rod':
      return <C p={[0, 0.003, 0]} r={0.0025} h={0.18} rot={[0, 0, Math.PI / 2]} m={glass} />;
    case 'funnel':
      return <FunnelFlask residue={null} filtrate={null} />;
    case 'boat':
      return (
        <group>
          <Boat fe={0} />
          <group position={[0, 0, 0.04]}>
            <Spatula />
          </group>
        </group>
      );
    case 'testTubes':
      return (
        <group>
          <B p={[0, 0.004, 0]} s={[0.24, 0.008, 0.06]} m={mat.wood()} />
          {[0, 1, 2, 3].map((k) => (
            <C key={k} p={[(k - 1.5) * TUBE.gap, 0.08, 0]} r={TUBE.r} h={TUBE.h} m={glass} open />
          ))}
        </group>
      );
    case 'stoppers':
      return (
        <group>
          {[-0.015, 0.015].map((x) => (
            <C key={x} p={[x, 0.008, 0]} r={0.012} h={0.016} m={corkMat} />
          ))}
        </group>
      );
    case 'burner':
      return <Burner lit={false} />;
    case 'gradTube':
      return <C p={[0, 0.016, 0]} r={0.016} h={0.3} rot={[0, 0, Math.PI / 2]} m={glass} />;
    case 'trough':
      return <C p={[0, 0.03, 0]} r={0.095} h={0.06} m={glass} open />;
    case 'oven':
      return <B p={[0, 0.08, 0]} s={[0.2, 0.16, 0.18]} m={mat.cabinet()} />;
    case 'burette':
      return <C p={[0, 0.006, 0]} r={0.006} h={0.6} rot={[0, 0, Math.PI / 2]} m={glass} />;
  }
}

export function Station({ x, s, scene, interactive, card }: { x: Electro; s: ChemElectroState; scene: SceneState; interactive: boolean; card: string[] }) {
  const task = scene.task;
  const has = (id: ApparatusId) => scene.collected.has(id);
  const drag = interactive ? dragFor : undefined;
  const extras = (Object.keys(APPARATUS_LABEL) as ApparatusId[]).filter((id) => has(id) && !USED[task].includes(id));
  const heads: Record<typeof task, string[]> = { ELEC: ['plate', 'before / g', 'after / g'], CELL: ['bridge', 'e.m.f. / V', ''], DISP: ['', 'mass / g', 'T / °C'], RUST: ['tube', 'rust?', 'V / cm³'] };
  let bench: ReactNode = null;
  if (task === 'ELEC') {
    const e = s.elec;
    const bal = elecBalance(x, s);
    const p = (o: V3, d: V3) => add(o, d);
    // terminals (station-local)
    const supN = p(SPOT.supply, [-0.05, 0.1, 0.02]);
    const supP = p(SPOT.supply, [0.05, 0.1, 0.02]);
    const keyA = p(SPOT.key, [-0.04, 0.035, 0]);
    const keyB = p(SPOT.key, [0.04, 0.035, 0]);
    const amN = p(SPOT.ammeter, [-0.045, 0.11, 0.012]);
    const amP = p(SPOT.ammeter, [0.045, 0.11, 0.012]);
    const rhA = p(SPOT.rheostat, [-0.115, 0.08, 0]);
    const rhS = p(SPOT.rheostat, [0.05, 0.085, 0]);
    const sep = e.gap === 'TOUCH' ? 0.003 : 0.024;
    const plateL = p(SPOT.voltameter, [-sep, VOLT.h + 0.012, 0]);
    const plateR = p(SPOT.voltameter, [sep, VOLT.h + 0.012, 0]);
    // the plate marked cathode (left) goes to −, through the key; + goes through the ammeter and rheostat to the anode
    const toNeg = e.cathodeTo === 'POS' ? plateR : plateL;
    const toPos = e.cathodeTo === 'POS' ? plateL : plateR;
    bench = (
      <>
        <Obj id="bottle:cuso4" label="Copper(II) sulphate solution, 1.0 mol dm⁻³" at={SPOT.bottle1} labelY={0.18}>
          <ReagentBottle name="CuSO₄" band="#1565c0" sub="1.0 M" liquid={copperColour(1)} />
        </Obj>
        <Obj id="bottle:propanone" label="Propanone (flammable)" at={SPOT.bottle2} labelY={0.18}>
          <ReagentBottle name="Propanone" band="#e65100" sub="flammable" />
        </Obj>
        {has('voltameter') && (
          <Obj id="voltameter" label={e.connected ? 'Voltameter (copper plates in CuSO₄)' : 'Beaker of CuSO₄ (voltameter)'} at={SPOT.voltameter} labelY={0.2} r={0.07}>
            <Voltameter x={x} s={s} />
          </Obj>
        )}
        {has('plates') && !e.connected && (
          <Obj id="plates" label={`Copper plates (${e.sanded ? 'clean' : 'dull'}) — left: cathode, right: anode`} at={SPOT.platesOff} labelY={0.05} r={0.07} drag={drag}>
            <LoosePlates sanded={e.sanded} sanding />
          </Obj>
        )}
        {has('supply') && (
          <Obj id="supply" label="d.c. supply, 6 V (+ red, − black)" at={SPOT.supply} labelY={0.16} r={0.1}>
            <Supply />
          </Obj>
        )}
        {has('ammeter') && (
          <Obj id="ammeter" label="Ammeter (0–1 A)" at={SPOT.ammeter} labelY={0.17} r={0.09}>
            <AnalogMeter letter="A" fsd={1} minor={0.02} major={0.2} value={() => x.look.current} />
          </Obj>
        )}
        {has('rheostat') && (
          <Obj id="rheostat" label="Rheostat — drag the slider" at={SPOT.rheostat} labelY={0.13} r={0.13} drag={drag}>
            <RheostatModel step={e.rheo} />
          </Obj>
        )}
        {has('key') && (
          <Obj id="key" label={e.closed ? 'Plug key (closed)' : 'Plug key (open)'} at={SPOT.key} labelY={0.08}>
            <KeyModel closed={e.closed} />
          </Obj>
        )}
        {has('stopwatch') && (
          <Obj id="stopwatch" label="Stopwatch" at={SPOT.stopwatch} labelY={0.07} r={0.05}>
            <Lcd text={() => fmtClock(x.look.run)} w={0.07} h={0.035} d={0.05} bg="#20262c" fg={e.closed ? '#7cf09a' : '#d6dee5'} />
          </Obj>
        )}
        {has('sandpaper') && (
          <Obj id="sandpaper" label="Sandpaper" at={SPOT.sandpaper} labelY={0.03} r={0.05}>
            <SandpaperModel />
          </Obj>
        )}
        {has('balance') && (
          <Obj id="balance" label="Top-pan balance" at={SPOT.balance} labelY={0.1} r={0.12}>
            <BalanceModel shows={bal ? bal.cath.toFixed(2) : '0.00'} />
          </Obj>
        )}
        {e.connected && (
          <group>
            <Wire pts={arc(supN, keyA, 0.04)} m={wireBlack} />
            <Wire pts={arc(keyB, toNeg, 0.06)} m={wireBlack} />
            <Wire pts={arc(supP, amP, 0.05)} m={wireRed} />
            <Wire pts={arc(amN, rhS, 0.05)} m={wireRed} />
            <Wire pts={arc(rhA, toPos, 0.06)} m={wireRed} />
          </group>
        )}
      </>
    );
  } else if (task === 'CELL') {
    const c = s.cell;
    const swapped = c.placed === 'SWAPPED';
    const vm = c.meter === 'LOW' ? SPOT.mcVoltmeter : SPOT.voltmeter;
    const termR = add(vm, c.meter === 'LOW' ? [0.045, 0.11, 0.012] : [0.035, 0.07, 0.01]);
    const termB = add(vm, c.meter === 'LOW' ? [-0.045, 0.11, 0.012] : [-0.035, 0.07, 0.01]);
    const zn = add(SPOT.znBeaker, [0, 0.13, -0.012]);
    const cu = add(SPOT.cuBeaker, [0, 0.13, -0.012]);
    const leadsOn = !!c.meter && !!c.leads && !!c.placed;
    bench = (
      <>
        <Obj id="bottle:znso4" label="Zinc sulphate, 1.0 mol dm⁻³" at={SPOT.bottle1} labelY={0.18}>
          <ReagentBottle name="ZnSO₄" band="#546e7a" sub="1.0 M" liquid={ZNSO4} />
        </Obj>
        <Obj id="bottle:cuso4" label="Copper(II) sulphate, 1.0 mol dm⁻³" at={SPOT.bottle2} labelY={0.18}>
          <ReagentBottle name="CuSO₄" band="#1565c0" sub="1.0 M" liquid={copperColour(1)} />
        </Obj>
        {has('beakers') && (
          <>
            <Obj id="beaker:zn" label="Beaker of ZnSO₄" at={SPOT.znBeaker} labelY={0.18}>
              <HalfCell fill={ZNSO4} metal={swapped ? COPPER : ZINC} inPlace={!!c.placed} />
            </Obj>
            <Obj id="beaker:cu" label="Beaker of CuSO₄" at={SPOT.cuBeaker} labelY={0.18}>
              <HalfCell fill={copperColour(1)} metal={swapped ? FRESH_COPPER : COPPER} inPlace={!!c.placed} />
            </Obj>
          </>
        )}
        {has('strips') && !c.placed && (
          <Obj id="strips" label={`Zinc and copper strips (${c.sanded ? 'clean' : 'dull'})`} at={SPOT.strips} labelY={0.04}>
            <ExtraModel id="strips" />
          </Obj>
        )}
        {has('bridge') && (
          <Obj id="dish:kno3" label="Saturated KNO₃ (salt bridge)" at={SPOT.kno3} labelY={0.05}>
            <Kno3Dish soaked={c.soaked} />
          </Obj>
        )}
        {has('bridge') && c.bridge && (
          <Interactive id="bridge" label={c.soaked ? 'Salt bridge (soaked in KNO₃)' : 'Salt bridge (dry paper!)'} bench>
            {() => <BridgeArch soaked={c.soaked} />}
          </Interactive>
        )}
        {has('voltmeter') && (
          <Obj id="voltmeter" label={c.meter === 'HIGH' ? 'High-resistance voltmeter (in use)' : 'High-resistance voltmeter'} at={SPOT.voltmeter} labelY={0.12} r={0.08}>
            <Lcd text={() => (c.meter === 'HIGH' && x.look.volts !== null ? x.look.volts.toFixed(2) : '-.--')} w={0.11} h={0.06} d={0.05} label="V  hi-Z" />
          </Obj>
        )}
        {has('mcVoltmeter') && (
          <Obj id="mcVoltmeter" label="Moving-coil voltmeter (0–2.5 V)" at={SPOT.mcVoltmeter} labelY={0.16} r={0.09}>
            <AnalogMeter letter="V" fsd={2.5} minor={0.05} major={0.5} value={() => (c.meter === 'LOW' ? (x.look.volts ?? 0) : 0)} />
          </Obj>
        )}
        {has('leads') && !leadsOn && (
          <Obj id="leads" label="Leads with crocodile clips" at={[0.3, 0, 0.3]} labelY={0.04}>
            <ExtraModel id="leads" />
          </Obj>
        )}
        {leadsOn && (
          <Interactive id="leads" label={c.leads === 'CORRECT' ? 'Leads: + to copper, − to zinc' : 'Leads: + to zinc, − to copper'} bench>
            {() => (
              <group>
                <Wire pts={arc(termR, c.leads === 'CORRECT' ? cu : zn, 0.08)} m={wireRed} />
                <Wire pts={arc(termB, c.leads === 'CORRECT' ? zn : cu, 0.08)} m={wireBlack} />
              </group>
            )}
          </Interactive>
        )}
        {has('sandpaper') && (
          <Obj id="sandpaper" label="Sandpaper" at={SPOT.sandpaper} labelY={0.03} r={0.05}>
            <SandpaperModel />
          </Obj>
        )}
      </>
    );
  } else if (task === 'DISP') {
    const d = s.disp;
    const shows = dispBalance(x, s);
    bench = (
      <>
        <Obj id="bottle:cuso4" label={`Copper(II) sulphate, ${x.v.disp.conc.toFixed(2)} mol dm⁻³`} at={SPOT.bottle1} labelY={0.18}>
          <ReagentBottle name="CuSO₄" band="#1565c0" sub={`${x.v.disp.conc.toFixed(2)} M`} liquid={copperColour(0.5)} />
        </Obj>
        <Obj id="jar:clean" label="Iron filings (clean)" at={SPOT.bottle2} labelY={0.15}>
          <ReagentBottle name="Fe filings" band="#455a64" sub="clean" liquid="#4d4f53" r={0.032} h={0.08} />
        </Obj>
        <Obj id="jar:rusty" label="Iron filings (old, rusty)" at={SPOT.bottle3} labelY={0.15}>
          <ReagentBottle name="Fe filings" band="#8a3b17" sub="old" liquid="#7a4a2c" r={0.032} h={0.08} />
        </Obj>
        <Obj id="bottle:propanone" label="Propanone (flammable)" at={SPOT.bottle4} labelY={0.18}>
          <ReagentBottle name="Propanone" band="#e65100" sub="flammable" />
        </Obj>
        {has('beaker') && (
          <Obj id="beaker" label="Beaker" at={SPOT.beaker} labelY={0.25} drag={drag}>
            <DispBeaker x={x} s={s} />
          </Obj>
        )}
        {has('cylinder') && (
          <Obj id="cylinder" label={APPARATUS_LABEL.cylinder} at={SPOT.cylinder} labelY={0.24}>
            <MeasuringCylinder />
          </Obj>
        )}
        {has('thermometer') && !d.thermo && (
          <Obj id="thermometer" label="Thermometer" at={SPOT.thermometer} labelY={0.03} r={0.05}>
            <ExtraModel id="thermometer" />
          </Obj>
        )}
        {has('thermometer') && d.thermo && (
          <Interactive id="thermometer" label={`Thermometer: ${x.look.temp.toFixed(1)} °C`} bench position={add(SPOT.beaker, [0.016, 0.2, -0.006])}>
            {() => (
              <mesh>
                <boxGeometry args={[0.02, 0.06, 0.02]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
            )}
          </Interactive>
        )}
        {has('rod') && (
          <Obj id="rod" label="Glass rod" at={SPOT.rod} labelY={0.03}>
            <ExtraModel id="rod" />
          </Obj>
        )}
        {has('funnel') && (
          <Obj id="funnel" label="Filter funnel and flask" at={SPOT.funnel} labelY={0.25}>
            <FunnelFlask residue={d.filtered && !d.weighed ? (x.look.extent > 0.95 ? FRESH_COPPER : COPPER) : null} filtrate={d.filtered ? mixedColour(x.look.ions.cu, x.look.ions.fe) : null} />
          </Obj>
        )}
        {has('filterPaper') && (
          <Obj id="filterPaper" label="Filter paper (for drying the copper)" at={SPOT.filterPaper} labelY={0.04}>
            <ExtraModel id="filterPaper" />
            {d.filtered && d.wash && <C p={[0, 0.007, 0]} r={0.018} h={0.004} m={colourMaterial(d.dry === 'FLAME' ? '#3b2a24' : FRESH_COPPER)} />}
          </Obj>
        )}
        {has('balance') && (
          <Obj id="balance" label="Top-pan balance with weighing boat" at={SPOT.balance} labelY={0.1} r={0.12}>
            <BalanceModel shows={(shows ?? 0).toFixed(2)} />
            {has('boat') && !d.added && (
              <group position={[0, 0.058, -0.02]}>
                <Boat fe={x.look.fe} />
              </group>
            )}
          </Obj>
        )}
      </>
    );
  } else {
    const w = s.rust;
    bench = (
      <>
        <Obj id="bottle:oil" label="Oil" at={SPOT.bottle1} labelY={0.18}>
          <ReagentBottle name="Oil" band="#c49a1a" sub="cooking oil" liquid="#e8c86a" />
        </Obj>
        <Obj id="bottle:salt" label="Salt water" at={SPOT.bottle2} labelY={0.18}>
          <ReagentBottle name="NaCl(aq)" band="#1565c0" sub="salt water" />
        </Obj>
        <Obj id="jar:cacl2" label="Anhydrous calcium chloride" at={SPOT.bottle3} labelY={0.15}>
          <ReagentBottle name="CaCl₂" band="#6d4c41" sub="anhydrous" liquid="#f3f1ea" r={0.032} h={0.08} />
        </Obj>
        {has('testTubes') && (
          <group position={SPOT.rack}>
            <Interactive id="rack" label="Test-tube rack (tubes A–D)" bench labelY={0.22}>
              {(active) => (
                <group>
                  <RustRack x={x} s={s} />
                  {active && <GlowRing r={0.15} />}
                </group>
              )}
            </Interactive>
            {RUST_TUBES.map((t, k) => (
              <Interactive key={t} id={`tube:${t}`} label={`Tube ${t}${w.tubes[t].content ? '' : ' (empty)'}`} bench position={[(k - 1.5) * TUBE.gap, 0.1, 0.02]}>
                {() => (
                  <mesh>
                    <boxGeometry args={[0.03, 0.12, 0.03]} />
                    <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                  </mesh>
                )}
              </Interactive>
            ))}
          </group>
        )}
        {has('stoppers') && (
          <Obj id="stoppers" label="Rubber stoppers" at={[0.12, 0, 0.32]} labelY={0.04} r={0.04}>
            <ExtraModel id="stoppers" />
          </Obj>
        )}
        {has('burner') && (
          <Obj id="burner" label="Bunsen burner, tripod and beaker of distilled water" at={SPOT.burner} labelY={0.25} r={0.09}>
            <BoilBeaker boiled={s.log.some((e) => e.a === 'boil-water')} />
          </Obj>
        )}
        {has('gradTube') && has('trough') && (
          <Obj id="gradTube" label="Graduated tube of air over water (iron wool)" at={SPOT.trough} labelY={0.36} r={0.11}>
            <TroughTube x={x} s={s} />
          </Obj>
        )}
        {has('sandpaper') && (
          <Obj id="sandpaper" label="Sandpaper" at={SPOT.sandpaper} labelY={0.03} r={0.05}>
            <SandpaperModel />
          </Obj>
        )}
      </>
    );
  }
  return (
    <group position={STATION}>
      <Interactive id="mybench" label="Your bench" labelY={0.5}>
        <mesh position={[0, 0.005, 0]}>
          <boxGeometry args={[BENCH.w, 0.01, BENCH.d]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>
      <CardAndBook cardAt={SPOT.card} bookAt={SPOT.book} title={TITLE[task]} lines={card} bookTitle={TITLE[task]} heads={heads[task]} />
      {bench}
      {has('washBottle') && USED[task].includes('washBottle') && (
        <Obj id="washBottle" label="Wash bottle (distilled water)" at={SPOT.washBottle} labelY={0.22}>
          <WashBottle />
        </Obj>
      )}
      {extras.map((id, k) => (
        <Obj key={id} id={id} label={APPARATUS_LABEL[id]} at={[SPOT.extras[0] + (k % 2) * 0.18, 0, SPOT.extras[2] - Math.floor(k / 2) * 0.18]} labelY={0.2}>
          <ExtraModel id={id} />
        </Obj>
      ))}
    </group>
  );
}
const TITLE = { ELEC: 'Electrolysis of CuSO₄', CELL: 'Daniell cell', DISP: 'Fe + CuSO₄', RUST: 'Rusting' } as const;
/** What each task's station draws itself (everything else collected goes to the end of the bench). */
const USED: Record<string, ApparatusId[]> = {
  ELEC: ['voltameter', 'plates', 'sandpaper', 'supply', 'ammeter', 'rheostat', 'key', 'stopwatch', 'balance', 'washBottle'],
  CELL: ['beakers', 'strips', 'sandpaper', 'bridge', 'voltmeter', 'mcVoltmeter', 'leads'],
  DISP: ['beaker', 'cylinder', 'thermometer', 'rod', 'boat', 'balance', 'funnel', 'filterPaper', 'washBottle'],
  RUST: ['testTubes', 'stoppers', 'sandpaper', 'burner', 'gradTube', 'trough'],
};

const SLOTS: CupboardSlot[] = [
  { id: 'voltameter', label: APPARATUS_LABEL.voltameter, shelf: 1, x: -0.95, model: <ExtraModel id="voltameter" /> },
  { id: 'beakers', label: APPARATUS_LABEL.beakers, shelf: 1, x: -0.72, model: <ExtraModel id="beakers" /> },
  { id: 'beaker', label: APPARATUS_LABEL.beaker, shelf: 1, x: -0.52, model: <ExtraModel id="beaker" /> },
  { id: 'cylinder', label: APPARATUS_LABEL.cylinder, shelf: 1, x: -0.36, model: <ExtraModel id="cylinder" />, grip: [[0.07, 0.22, 0.07], [0, 0.1, 0]] },
  { id: 'funnel', label: APPARATUS_LABEL.funnel, shelf: 1, x: -0.18, model: <ExtraModel id="funnel" />, grip: [[0.1, 0.22, 0.1], [0, 0.1, 0]] },
  { id: 'washBottle', label: APPARATUS_LABEL.washBottle, shelf: 1, x: 0.0, model: <ExtraModel id="washBottle" />, grip: [[0.08, 0.17, 0.08], [0, 0.08, 0]] },
  { id: 'testTubes', label: APPARATUS_LABEL.testTubes, shelf: 1, x: 0.24, model: <ExtraModel id="testTubes" />, grip: [[0.24, 0.16, 0.06], [0, 0.08, 0]] },
  { id: 'trough', label: APPARATUS_LABEL.trough, shelf: 1, x: 0.52, model: <ExtraModel id="trough" /> },
  { id: 'burner', label: APPARATUS_LABEL.burner, shelf: 1, x: 0.78, model: <ExtraModel id="burner" /> },
  { id: 'oven', label: APPARATUS_LABEL.oven, shelf: 1, x: 0.98, model: <ExtraModel id="oven" /> },
  { id: 'supply', label: APPARATUS_LABEL.supply, shelf: 0, x: -0.9, model: <ExtraModel id="supply" /> },
  { id: 'ammeter', label: APPARATUS_LABEL.ammeter, shelf: 0, x: -0.68, model: <ExtraModel id="ammeter" /> },
  { id: 'rheostat', label: APPARATUS_LABEL.rheostat, shelf: 0, x: -0.42, model: <ExtraModel id="rheostat" /> },
  { id: 'voltmeter', label: APPARATUS_LABEL.voltmeter, shelf: 0, x: -0.16, model: <ExtraModel id="voltmeter" /> },
  { id: 'mcVoltmeter', label: APPARATUS_LABEL.mcVoltmeter, shelf: 0, x: 0.04, model: <ExtraModel id="mcVoltmeter" /> },
  { id: 'gradTube', label: APPARATUS_LABEL.gradTube, shelf: 0, x: 0.36, z: 0.08, model: <ExtraModel id="gradTube" />, grip: [[0.3, 0.04, 0.04], [0, 0.016, 0]] },
  { id: 'burette', label: APPARATUS_LABEL.burette, shelf: 0, x: 0.7, z: 0.12, model: <ExtraModel id="burette" />, grip: [[0.6, 0.03, 0.03], [0, 0.006, 0]] },
  { id: 'balance', label: APPARATUS_LABEL.balance, shelf: 2, x: -0.9, model: <ExtraModel id="balance" />, grip: [[0.17, 0.08, 0.2], [0, 0.03, 0]] },
  { id: 'plates', label: APPARATUS_LABEL.plates, shelf: 2, x: -0.68, model: <ExtraModel id="plates" />, grip: [[0.1, 0.03, 0.1], [0, 0.01, 0]] },
  { id: 'strips', label: APPARATUS_LABEL.strips, shelf: 2, x: -0.52, model: <ExtraModel id="strips" />, grip: [[0.06, 0.03, 0.12], [0, 0.01, 0]] },
  { id: 'sandpaper', label: APPARATUS_LABEL.sandpaper, shelf: 2, x: -0.38, model: <ExtraModel id="sandpaper" />, grip: [[0.08, 0.03, 0.06], [0, 0.01, 0]] },
  { id: 'key', label: APPARATUS_LABEL.key, shelf: 2, x: -0.22, model: <ExtraModel id="key" /> },
  { id: 'stopwatch', label: APPARATUS_LABEL.stopwatch, shelf: 2, x: -0.06, model: <ExtraModel id="stopwatch" /> },
  { id: 'leads', label: APPARATUS_LABEL.leads, shelf: 2, x: 0.1, model: <ExtraModel id="leads" />, grip: [[0.14, 0.03, 0.05], [0, 0.01, 0]] },
  { id: 'bridge', label: APPARATUS_LABEL.bridge, shelf: 2, x: 0.26, model: <ExtraModel id="bridge" /> },
  { id: 'filterPaper', label: APPARATUS_LABEL.filterPaper, shelf: 2, x: 0.4, model: <ExtraModel id="filterPaper" /> },
  { id: 'thermometer', label: APPARATUS_LABEL.thermometer, shelf: 2, x: 0.56, z: 0.1, model: <ExtraModel id="thermometer" />, grip: [[0.24, 0.03, 0.04], [0, 0.01, 0]] },
  { id: 'rod', label: APPARATUS_LABEL.rod, shelf: 2, x: 0.72, z: 0.06, model: <ExtraModel id="rod" />, grip: [[0.18, 0.03, 0.04], [0, 0.01, 0]] },
  { id: 'boat', label: APPARATUS_LABEL.boat, shelf: 2, x: 0.86, model: <ExtraModel id="boat" />, grip: [[0.1, 0.04, 0.1], [0, 0.01, 0]] },
  { id: 'stoppers', label: APPARATUS_LABEL.stoppers, shelf: 2, x: 1.0, model: <ExtraModel id="stoppers" /> },
];
export function ElectroCupboard({ scene }: { scene: SceneState }) {
  return <CupboardItems slots={SLOTS} collected={scene.collected} />;
}
