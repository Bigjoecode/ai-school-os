import { OHMS_AMMETER_FSD, OHMS_VOLTMETER_FSD, ohmsWireKey, type OhmsTerminal, type PhyOhmsState, type PhyOhmsVariant } from '@aischool/shared';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { BoxGeometry, CatmullRomCurve3, CylinderGeometry, MeshStandardMaterial, Quaternion, TubeGeometry, Vector3, type Group, type Material, type Mesh } from 'three';
import { BlobShadow, GlowRing } from '../../../lab3d-kit/apparatus';
import { Interactive } from '../../../lab3d-kit/interact';
import { STATION } from '../../../lab3d-kit/layout';
import { mat } from '../../../lab3d-kit/materials';
import { useLabView } from '../../../lab3d-kit/store';
import { CardAndBook, CupboardItems, Rule, type CupboardSlot } from '../../phy-common/lab3d/common';
import { canvasTex, FONT, meterFaceTexture } from '../../phy-common/lab3d/tex';
import { WIRE_COLOURS } from '../index';
import { useBench, wireDrag } from './bench-store';
import { dragFor } from './drag';
import { BOARD, FACE, METER, PART, RHEO, SPOT, WIRE_RULE, terminalPos, type V3 } from './layout';
import { APPARATUS_LABEL, TERMINAL_PART, type ApparatusId, type SceneState } from './scene-state';

/**
 * The circuit bench: the wooden circuit board with the battery, the plug key,
 * the rheostat, the two analogue meters and the standard resistor (or the
 * resistance wire on its metre rule with the jockey), brass terminal posts,
 * the wires the student has joined, and the apparatus cupboard's contents.
 */

const box = new BoxGeometry(1, 1, 1);
const cyl = new CylinderGeometry(1, 1, 1, 18);
const brass = new MeshStandardMaterial({ color: '#c9a23a', roughness: 0.3, metalness: 0.85 });
const ebonite = new MeshStandardMaterial({ color: '#1d1f22', roughness: 0.45 });
const ceramic = new MeshStandardMaterial({ color: '#efe9da', roughness: 0.5 });
const redCap = new MeshStandardMaterial({ color: '#c62828', roughness: 0.4 });
const blackCap = new MeshStandardMaterial({ color: '#202124', roughness: 0.4 });
const meterCase = new MeshStandardMaterial({ color: '#2b2f35', roughness: 0.45, metalness: 0.2 });
const cellRed = new MeshStandardMaterial({ color: '#b3261e', roughness: 0.35, metalness: 0.2 });
const cellBlack = new MeshStandardMaterial({ color: '#1b1b1b', roughness: 0.35, metalness: 0.3 });
const needleMat = new MeshStandardMaterial({ color: '#111', roughness: 0.4 });
const wireMats = WIRE_COLOURS.map((c) => new MeshStandardMaterial({ color: c, roughness: 0.55 }));
const highlightWire = new MeshStandardMaterial({ color: '#38bdf8', roughness: 0.4, emissive: '#0e7490', emissiveIntensity: 0.6 });
const bandColours = ['#7a4b2a', '#2b2b2b', '#d64545', '#c9a227'].map((c) => new MeshStandardMaterial({ color: c, roughness: 0.5 }));

function B({ p, s, m, r }: { p: V3; s: V3; m: Material; r?: V3 }) {
  return <mesh geometry={box} material={m} position={p} scale={s} rotation={r} />;
}
function C({ p, r, h, m, rot }: { p: V3; r: number; h: number; m: Material; rot?: V3 }) {
  return <mesh geometry={cyl} material={m} position={p} scale={[r, h, r]} rotation={rot} />;
}
/** A brass terminal post with a coloured screw cap (stand-on point at the origin). */
function Post({ cap = blackCap }: { cap?: MeshStandardMaterial }) {
  return (
    <group>
      <C p={[0, 0.009, 0]} r={0.008} h={0.018} m={brass} />
      <C p={[0, 0.022, 0]} r={0.011} h={0.01} m={cap} />
    </group>
  );
}

const coilTex = () =>
  canvasTex('ohm-coil', 512, 64, (g, w, h) => {
    g.fillStyle = '#8a5a2b';
    g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 6) {
      g.fillStyle = '#c4874a';
      g.fillRect(x, 0, 3, h);
    }
  });

// ------------------------------------------------------------------ parts (visual only; terminals are separate Interactives)

export function Cells() {
  return (
    <group>
      <B p={[0, 0.018, 0]} s={[0.28, 0.036, 0.07]} m={ebonite} />
      {[-0.06, 0.06].map((x) => (
        <group key={x} position={[x, 0.04, 0]}>
          <C p={[0, 0, 0]} r={0.016} h={0.1} m={cellRed} rot={[0, 0, Math.PI / 2]} />
          <C p={[0.048, 0, 0]} r={0.016} h={0.012} m={cellBlack} rot={[0, 0, Math.PI / 2]} />
          <C p={[0.055, 0, 0]} r={0.005} h={0.006} m={mat.steel()} rot={[0, 0, Math.PI / 2]} />
        </group>
      ))}
      <mesh position={[0, 0.0365, 0.036]}>
        <planeGeometry args={[0.12, 0.022]} />
        <meshBasicMaterial map={label('2 × 1.5 V')} />
      </mesh>
      <BlobShadow r={0.18} />
    </group>
  );
}
const label = (text: string) =>
  canvasTex(`ohm-label-${text}`, 256, 48, (g, w, h) => {
    g.fillStyle = '#fffdf3';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#16202a';
    g.font = `700 30px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });

/** Plug key: two brass blocks on an ebonite base; the brass plug sits in the gap when the key is closed. */
export function PlugKey({ closed }: { closed: boolean }) {
  const plug = useRef<Group>(null);
  useFrame((_, dt) => {
    const g = plug.current;
    if (!g) return;
    const ty = closed ? 0.045 : 0.03;
    const tx = closed ? 0 : 0.0;
    const tz = closed ? 0 : 0.07;
    const k = Math.min(1, dt * 10);
    g.position.y += (ty - g.position.y) * k;
    g.position.x += (tx - g.position.x) * k;
    g.position.z += (tz - g.position.z) * k;
    g.rotation.x += ((closed ? 0 : Math.PI / 2) - g.rotation.x) * k;
  });
  return (
    <group>
      <B p={[0, 0.008, 0]} s={[0.19, 0.016, 0.07]} m={ebonite} />
      {[-0.042, 0.042].map((x) => (
        <B key={x} p={[x, 0.026, 0]} s={[0.07, 0.022, 0.04]} m={brass} />
      ))}
      <group ref={plug} position={[0, closed ? 0.045 : 0.03, closed ? 0 : 0.07]}>
        <C p={[0, 0, 0]} r={0.007} h={0.03} m={brass} />
        <C p={[0, 0.022, 0]} r={0.012} h={0.016} m={ebonite} />
      </group>
      <BlobShadow r={0.13} />
    </group>
  );
}

/** Sliding rheostat: the coil between two end blocks, the rail above and the slider at `value` (0 = no resistance). */
export function Rheostat({ value }: { value: number }) {
  const tex = useMemo(coilTex, []);
  const slider = useRef<Group>(null);
  useFrame((_, dt) => {
    const g = slider.current;
    if (g) g.position.x += (RHEO.len * value - RHEO.len / 2 - g.position.x) * Math.min(1, dt * 14);
  });
  return (
    <group>
      {[-1, 1].map((s) => (
        <B key={s} p={[(s * (RHEO.len + 0.04)) / 2, 0.06, 0]} s={[0.035, 0.12, 0.07]} m={ceramic} />
      ))}
      <mesh position={[0, 0.05, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.028, RHEO.len, 0.028]} geometry={cyl}>
        <meshStandardMaterial map={tex} roughness={0.5} metalness={0.4} />
      </mesh>
      <C p={[0, RHEO.railY - BOARD.h, 0]} r={0.005} h={RHEO.len + 0.04} m={mat.steel()} rot={[0, 0, Math.PI / 2]} />
      <group ref={slider} position={[RHEO.len * value - RHEO.len / 2, 0, 0]}>
        <B p={[0, RHEO.railY - BOARD.h, 0]} s={[0.022, 0.024, 0.03]} m={ebonite} />
        <B p={[0, RHEO.railY - BOARD.h - 0.022, 0]} s={[0.012, 0.03, 0.01]} m={brass} />
        <group position={[0, RHEO.railY - BOARD.h + 0.008, 0]}>
          <Post cap={redCap} />
        </group>
      </group>
      <BlobShadow r={0.2} />
    </group>
  );
}

/** An analogue box meter with a vertical face; the needle sits 4 mm in front of the scale (so reading off-level shows parallax). */
export function Meter({ letter, value, fsd, minor, major, over, back }: { letter: 'A' | 'V'; value: number; fsd: number; minor: number; major: number; over?: boolean; back?: boolean }) {
  const face = useMemo(() => meterFaceTexture(letter, fsd, minor, major), [letter, fsd, minor, major]);
  const needle = useRef<Group>(null);
  const shown = over ? fsd * 1.04 : back ? -0.03 * fsd : Math.max(-0.03 * fsd, Math.min(1.04 * fsd, value));
  useFrame((_, dt) => {
    const g = needle.current;
    if (!g) return;
    const target = -((-50 + 100 * (shown / fsd)) * Math.PI) / 180;
    g.rotation.z += (target - g.rotation.z) * Math.min(1, dt * 6);
  });
  const pivotY = FACE.cy - FACE.h / 2 + (40 / 384) * FACE.h;
  return (
    <group>
      <B p={[0, METER.h / 2, 0]} s={[METER.w, METER.h, METER.d]} m={meterCase} />
      <mesh position={[0, FACE.cy, METER.d / 2 + 0.0008]}>
        <planeGeometry args={[FACE.w, FACE.h]} />
        <meshStandardMaterial map={face} roughness={0.5} />
      </mesh>
      <group ref={needle} position={[0, pivotY, METER.d / 2 + 0.0045]}>
        <B p={[0, 0.046, 0]} s={[0.0012, 0.092, 0.0006]} m={needleMat} />
        <C p={[0, 0, -0.001]} r={0.005} h={0.004} m={needleMat} rot={[Math.PI / 2, 0, 0]} />
      </group>
      {/* the glass over the face */}
      <mesh position={[0, FACE.cy, METER.d / 2 + 0.008]} material={mat.pane()}>
        <planeGeometry args={[FACE.w + 0.006, FACE.h + 0.006]} />
      </mesh>
      {/* zero-adjust screw */}
      <C p={[0, 0.012, METER.d / 2 + 0.002]} r={0.006} h={0.004} m={ebonite} rot={[Math.PI / 2, 0, 0]} />
      <BlobShadow r={0.16} />
    </group>
  );
}

/** The standard resistor on its mount. */
export function Resistor() {
  return (
    <group>
      <B p={[0, 0.008, 0]} s={[0.2, 0.016, 0.05]} m={ceramic} />
      {[-0.07, 0.07].map((x) => (
        <C key={x} p={[x, 0.025, 0]} r={0.0015} h={0.02} m={mat.steel()} />
      ))}
      <C p={[0, 0.034, 0]} r={0.0025} h={0.15} m={mat.steel()} rot={[0, 0, Math.PI / 2]} />
      <C p={[0, 0.034, 0]} r={0.009} h={0.06} m={ceramic} rot={[0, 0, Math.PI / 2]} />
      {[0, 1, 2, 3].map((i) => (
        <C key={i} p={[-0.02 + i * 0.012, 0.034, 0]} r={0.0095} h={0.005} m={bandColours[i]!} rot={[0, 0, Math.PI / 2]} />
      ))}
      <BlobShadow r={0.12} />
    </group>
  );
}

/** The resistance wire stretched along a metre rule; the jockey stands at `jockey` cm. */
export function WireOnRule({ jockey }: { jockey: number }) {
  const j = useRef<Group>(null);
  useFrame((_, dt) => {
    const g = j.current;
    if (g) g.position.x += (jockey / 100 - g.position.x) * Math.min(1, dt * 14);
  });
  return (
    <group>
      <Rule cm={100} />
      {[-0.03, 1.03].map((x) => (
        <B key={x} p={[x, 0.013, 0]} s={[0.04, 0.026, 0.05]} m={mat.woodDark()} />
      ))}
      <C p={[0.5, WIRE_RULE.y, 0.006]} r={0.0007} h={1.06} m={mat.steel()} rot={[0, 0, Math.PI / 2]} />
      <group ref={j} position={[jockey / 100, 0, 0]}>
        <B p={[0, WIRE_RULE.y + 0.01, 0.012]} s={[0.006, 0.02, 0.012]} m={brass} />
        <C p={[0, WIRE_RULE.y + 0.035, 0.012]} r={0.007} h={0.04} m={ebonite} />
      </group>
    </group>
  );
}

/** A micrometer screw gauge lying on the bench. */
export function Micrometer() {
  return (
    <group rotation={[0, 0.3, 0]}>
      <mesh position={[0, 0.03, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.035, 0.007, 8, 24, Math.PI]} />
        <meshStandardMaterial color="#2a6fb5" roughness={0.4} />
      </mesh>
      <C p={[0.05, 0.03, 0]} r={0.007} h={0.07} m={mat.steel()} rot={[0, 0, Math.PI / 2]} />
      <C p={[0.09, 0.03, 0]} r={0.009} h={0.04} m={mat.metal()} rot={[0, 0, Math.PI / 2]} />
      <BlobShadow r={0.08} />
    </group>
  );
}
export function Galvanometer() {
  return <Meter letter="V" value={0} fsd={3} minor={0.1} major={0.5} />;
}
export function Bulb() {
  return (
    <group>
      <B p={[0, 0.008, 0]} s={[0.06, 0.016, 0.06]} m={ebonite} />
      <C p={[0, 0.024, 0]} r={0.008} h={0.016} m={brass} />
      <mesh position={[0, 0.042, 0]}>
        <sphereGeometry args={[0.013, 16, 12]} />
        <meshStandardMaterial color="#fff8e0" transparent opacity={0.6} roughness={0.1} />
      </mesh>
    </group>
  );
}
export function SpringBalance() {
  return (
    <group rotation={[0, 0, Math.PI / 2]} position={[0.1, 0.012, 0]}>
      <C p={[0, 0, 0]} r={0.012} h={0.2} m={mat.metal()} />
      <C p={[0, -0.12, 0]} r={0.002} h={0.05} m={mat.steel()} />
    </group>
  );
}
function WireCoil() {
  return (
    <group>
      {WIRE_COLOURS.slice(0, 4).map((c, i) => (
        <mesh key={c} position={[i * 0.012 - 0.018, 0.006 + i * 0.002, 0]} rotation={[Math.PI / 2, 0, 0]} material={wireMats[i]}>
          <torusGeometry args={[0.04, 0.0025, 6, 24]} />
        </mesh>
      ))}
    </group>
  );
}

// ------------------------------------------------------------------ the cupboard
const sm = (s: number, node: React.ReactNode) => <group scale={s}>{node}</group>;
export const CUPBOARD_SLOTS: CupboardSlot[] = [
  { id: 'cells', label: APPARATUS_LABEL.cells, shelf: 0, x: -0.8, model: <Cells /> },
  { id: 'key', label: APPARATUS_LABEL.key, shelf: 0, x: -0.45, model: <PlugKey closed={false} /> },
  { id: 'rheostat', label: APPARATUS_LABEL.rheostat, shelf: 0, x: -0.05, model: <Rheostat value={1} /> },
  { id: 'wireRule', label: APPARATUS_LABEL.wireRule, shelf: 0, x: -0.5, z: 0.13, grip: [[1.0, 0.05, 0.06], [0.5, 0.02, 0]], model: sm(0.98, <WireOnRule jockey={50} />) },
  { id: 'ammeter', label: APPARATUS_LABEL.ammeter, shelf: 1, x: -0.8, model: sm(0.8, <Meter letter="A" value={0} fsd={OHMS_AMMETER_FSD} minor={0.02} major={0.1} />) },
  { id: 'voltmeter', label: APPARATUS_LABEL.voltmeter, shelf: 1, x: -0.55, model: sm(0.8, <Meter letter="V" value={0} fsd={OHMS_VOLTMETER_FSD} minor={0.1} major={0.5} />) },
  { id: 'resistor', label: APPARATUS_LABEL.resistor, shelf: 1, x: -0.3, model: <Resistor /> },
  { id: 'wires', label: APPARATUS_LABEL.wires, shelf: 1, x: -0.1, model: <WireCoil /> },
  { id: 'galvanometer', label: APPARATUS_LABEL.galvanometer, shelf: 1, x: 0.3, model: sm(0.7, <Galvanometer />) },
  { id: 'micrometer', label: APPARATUS_LABEL.micrometer, shelf: 2, x: -0.7, model: <Micrometer /> },
  { id: 'bulb', label: APPARATUS_LABEL.bulb, shelf: 2, x: -0.35, model: <Bulb /> },
  { id: 'springBalance', label: APPARATUS_LABEL.springBalance, shelf: 2, x: 0.0, model: <SpringBalance /> },
];

// ------------------------------------------------------------------ wires
const tmpA = new Vector3();
const tmpB = new Vector3();
function wireCurve(a: V3, b: V3) {
  tmpA.set(...a);
  tmpB.set(...b);
  const len = tmpA.distanceTo(tmpB);
  const lift = 0.03 + Math.min(0.09, len * 0.18);
  const mid = tmpA.clone().add(tmpB).multiplyScalar(0.5);
  mid.y = Math.max(a[1], b[1]) + lift;
  return new CatmullRomCurve3([new Vector3(...a), new Vector3(a[0], a[1] + 0.025, a[2]), mid, new Vector3(b[0], b[1] + 0.025, b[2]), new Vector3(...b)]);
}
function WireTube({ id, a, b, m, label }: { id: string; a: V3; b: V3; m: MeshStandardMaterial; label: string }) {
  const geo = useMemo(() => new TubeGeometry(wireCurve(a, b), 32, 0.0022, 6, false), [a, b]);
  return (
    <Interactive id={id} label={label} bench labelY={0.05} position={[0, 0, 0]}>
      {(active) => <mesh geometry={geo} material={active ? highlightWire : m} />}
    </Interactive>
  );
}

/** The rubber-band wire while a terminal is being dragged to another. */
function DragWire({ s }: { s: { rheostat: number; jockey: number } }) {
  const ref = useRef<Mesh>(null);
  const q = useMemo(() => new Quaternion(), []);
  const up = useMemo(() => new Vector3(0, 1, 0), []);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const d = useLabView.getState().drag;
    const from = d?.kind === 'wire' ? wireDrag.from : null;
    m.visible = !!from;
    if (!from) return;
    const a = new Vector3(...terminalPos(from, s));
    const b = new Vector3(...wireDrag.to);
    const dir = b.clone().sub(a);
    const len = Math.max(0.001, dir.length());
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.scale.set(0.0025, len, 0.0025);
    m.quaternion.copy(q.setFromUnitVectors(up, dir.normalize()));
  });
  return <mesh ref={ref} geometry={cyl} material={highlightWire} visible={false} />;
}

const TERMINAL_CAP: Partial<Record<OhmsTerminal, 'red'>> = { 'cell+': 'red', 'am+': 'red', 'vm+': 'red', 'rh-s': 'red' };

// ------------------------------------------------------------------ the bench
export interface Meters {
  I: number;
  V: number;
  overI: boolean;
  overV: boolean;
  backI: boolean;
  backV: boolean;
}

export function Station({ state, scene, meters, interactive, board }: { state: PhyOhmsState; scene: SceneState; meters: Meters; v: PhyOhmsVariant; interactive: boolean; board: OhmsTerminal[] }) {
  const picked = useBench((b) => b.picked);
  const hasAll = (id: ApparatusId) => scene.collected.has(id);
  const task = state.task ?? 'OHM';
  const pos = (t: OhmsTerminal) => terminalPos(t, state);
  const wires = state.wires
    .map((w, i) => ({ w, i, ends: w.split('|') as [OhmsTerminal, OhmsTerminal] }))
    .filter(({ ends }) => board.includes(ends[0]) && board.includes(ends[1]));
  const at = (p: readonly [number, number, number]): V3 => [p[0], p[1], p[2]];
  const termDrag = interactive ? (id: string) => dragFor(id) : undefined;
  const glow = (on: boolean, r: number) => on && <GlowRing r={r} y={BOARD.h + 0.002} />;
  return (
    <group position={STATION}>
      {/* bench-top hit area: selects the bench while walking */}
      <Interactive id="mybench" label="Your bench" labelY={0.5}>
        <mesh position={[0, 0.005, 0]}>
          <boxGeometry args={[2.6, 0.01, 0.9]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>
      {/* the wooden circuit board */}
      <Interactive id="board" label="Circuit board" bench position={[BOARD.x, 0, BOARD.z]}>
        {(active) => (
          <group>
            <B p={[0, BOARD.h / 2, 0]} s={[BOARD.w, BOARD.h, BOARD.d]} m={mat.wood()} />
            <BlobShadow r={0.6} opacity={0.6} />
            {active && <GlowRing r={0.5} y={BOARD.h + 0.001} />}
          </group>
        )}
      </Interactive>
      {hasAll('cells') && (
        <Interactive id="cells" label={APPARATUS_LABEL.cells} bench position={at(PART.cells)}>
          {(a) => (
            <group>
              <Cells />
              {glow(a, 0.16)}
            </group>
          )}
        </Interactive>
      )}
      {hasAll('key') && (
        <Interactive id="key" label={state.key ? 'Plug key (closed)' : 'Plug key (open)'} bench position={at(PART.key)}>
          {(a) => (
            <group>
              <PlugKey closed={state.key} />
              {glow(a, 0.12)}
            </group>
          )}
        </Interactive>
      )}
      {hasAll('rheostat') && (
        <Interactive id="rheostat" label={`Rheostat (slider at ${Math.round(state.rheostat * 100)} %)`} bench position={at(PART.rheostat)} drag={termDrag}>
          {(a) => (
            <group>
              <Rheostat value={state.rheostat} />
              {glow(a, 0.18)}
            </group>
          )}
        </Interactive>
      )}
      {hasAll('ammeter') && (
        <Interactive id="ammeter" label="Ammeter" bench labelY={0.2} position={at(PART.ammeter)}>
          {(a) => (
            <group>
              <Meter letter="A" value={meters.I} fsd={OHMS_AMMETER_FSD} minor={0.02} major={0.1} over={meters.overI} back={meters.backI} />
              {glow(a, 0.15)}
            </group>
          )}
        </Interactive>
      )}
      {hasAll('voltmeter') && (
        <Interactive id="voltmeter" label="Voltmeter" bench labelY={0.2} position={at(PART.voltmeter)}>
          {(a) => (
            <group>
              <Meter letter="V" value={meters.V} fsd={OHMS_VOLTMETER_FSD} minor={0.1} major={0.5} over={meters.overV} back={meters.backV} />
              {glow(a, 0.15)}
            </group>
          )}
        </Interactive>
      )}
      {task === 'OHM' && hasAll('resistor') && (
        <Interactive id="resistor" label="Standard resistor R" bench position={at(PART.resistor)}>
          {(a) => (
            <group>
              <Resistor />
              {glow(a, 0.12)}
            </group>
          )}
        </Interactive>
      )}
      {task === 'WIRE' && hasAll('wireRule') && (
        <Interactive id="wireRule" label={`Resistance wire (jockey at ${state.jockey.toFixed(1)} cm)`} bench position={[WIRE_RULE.x0, 0, WIRE_RULE.z]} drag={termDrag}>
          {(a) => (
            <group>
              <WireOnRule jockey={state.jockey} />
              {a && <GlowRing r={0.5} y={0.004} />}
            </group>
          )}
        </Interactive>
      )}
      {/* terminal posts (the slider's and the jockey's ride on their parts) */}
      {board
        .filter((t) => scene.collected.has(partOf(t)))
        .map((t) => {
          const p = pos(t);
          const moving = t === 'rh-s' || t === 'w-j';
          return (
            <Interactive key={t} id={`term:${t}`} label={TERM_LABEL[t]} bench labelY={0.04} position={[p[0], p[1] - 0.028, p[2]]} drag={termDrag}>
              {(a) => (
                <group>
                  {!moving && <Post cap={TERMINAL_CAP[t] ? redCap : blackCap} />}
                  {/* an easy-to-hit grip */}
                  <mesh position={[0, 0.02, 0]}>
                    <boxGeometry args={[0.035, 0.05, 0.035]} />
                    <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                  </mesh>
                  {(a || picked === t) && (
                    <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mat.highlight()}>
                      <ringGeometry args={[0.013, 0.02, 20]} />
                    </mesh>
                  )}
                </group>
              )}
            </Interactive>
          );
        })}
      {wires.map(({ w, i, ends }) => (
        <WireTube key={w} id={`wire:${w}`} a={pos(ends[0])} b={pos(ends[1])} m={wireMats[i % wireMats.length]!} label={`Wire: ${TERM_LABEL[ends[0]]} – ${TERM_LABEL[ends[1]]}`} />
      ))}
      {interactive && <DragWire s={state} />}
      {hasAll('micrometer') && (
        <Interactive id="micrometer" label={APPARATUS_LABEL.micrometer} bench position={SPOT.micrometer}>
          {(a) => (
            <group>
              <Micrometer />
              {a && <GlowRing r={0.08} />}
            </group>
          )}
        </Interactive>
      )}
      {(['galvanometer', 'bulb', 'springBalance'] as const)
        .filter((id) => scene.collected.has(id))
        .map((id, k) => (
          <Interactive key={id} id={id} label={APPARATUS_LABEL[id]} bench position={[SPOT.extras[0], 0, SPOT.extras[2] - 0.2 + k * 0.18]}>
            {(a) => (
              <group scale={id === 'galvanometer' ? 0.7 : 1}>
                {id === 'galvanometer' ? <Galvanometer /> : id === 'bulb' ? <Bulb /> : <SpringBalance />}
                {a && <GlowRing r={0.08} />}
              </group>
            )}
          </Interactive>
        ))}
      {hasAll('wires') && !state.wires.length && (
        <group position={[BOARD.x + 0.05, BOARD.h, BOARD.z + 0.02]}>
          <WireCoil />
        </group>
      )}
      <CardAndBook cardAt={SPOT.card} bookAt={SPOT.book} title={task === 'WIRE' ? 'Resistivity' : "Ohm's law"} lines={TASK_LINES[task]} bookTitle={task === 'WIRE' ? 'Resistivity of a wire' : "Ohm's law"} heads={task === 'WIRE' ? ['L/cm', 'I/A', 'V/V', 'R/Ω'] : ['I/A', 'V/V', 'V/I']} />
    </group>
  );
}
const TASK_LINES = {
  OHM: ['Battery, key, rheostat, ammeter and R in series; voltmeter across R.', 'Five readings of I and V; open the key between readings.', 'Plot V against I; slope = R.'],
  WIRE: ['A length L of wire in series with the ammeter; voltmeter across L.', 'L = 20, 40, 60, 80, 100 cm; R = V/I.', 'Plot R against L; ρ = slope × A.'],
};

const partOf = (t: OhmsTerminal) => TERMINAL_PART[t];
export const TERM_LABEL: Record<OhmsTerminal, string> = {
  'cell+': 'Battery + terminal',
  'cell-': 'Battery − terminal',
  'key-a': 'Key terminal (left)',
  'key-b': 'Key terminal (right)',
  'rh-a': 'Rheostat end terminal',
  'rh-s': 'Rheostat slider terminal',
  'am+': 'Ammeter + terminal',
  'am-': 'Ammeter − terminal',
  'vm+': 'Voltmeter + terminal',
  'vm-': 'Voltmeter − terminal',
  'res-a': 'Resistor terminal (left)',
  'res-b': 'Resistor terminal (right)',
  'w-0': 'Wire terminal, 0 cm end',
  'w-j': 'Jockey terminal',
  'w-100': 'Wire terminal, 100 cm end',
};
export const wireKey = ohmsWireKey;

export function Cupboard({ scene }: { scene: SceneState }) {
  return <CupboardItems slots={CUPBOARD_SLOTS} collected={scene.collected} />;
}
