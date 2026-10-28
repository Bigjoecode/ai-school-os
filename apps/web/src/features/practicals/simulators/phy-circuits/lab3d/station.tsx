import { CIRCUITS_AMMETER_FSD, CIRCUITS_AMMETER_MINOR, CIRCUITS_VOLTMETER_FSD, CIRCUITS_VOLTMETER_MINOR, GALVO_DIVS, RBOX_PLUGS, rboxPlugs, type CircuitsMeters, type CircuitsTerminal, type PhyCircuitsState } from '@aischool/shared';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { BoxGeometry, CatmullRomCurve3, CylinderGeometry, MeshStandardMaterial, Quaternion, TubeGeometry, Vector3, type Group, type Material, type Mesh, type Texture } from 'three';
import { BlobShadow, GlowRing } from '../../../lab3d-kit/apparatus';
import { Interactive } from '../../../lab3d-kit/interact';
import { STATION } from '../../../lab3d-kit/layout';
import { mat } from '../../../lab3d-kit/materials';
import { useLabView } from '../../../lab3d-kit/store';
import { CardAndBook, CupboardItems, Rule, type CupboardSlot } from '../../phy-common/lab3d/common';
import { WIRE_COLOURS } from '../../phy-ohms-law';
import { Bulb, Cells, Micrometer, PlugKey, Resistor, Rheostat } from '../../phy-ohms-law/lab3d/station';
import { useBench, wireDrag } from './bench-store';
import { dragFor } from './drag';
import { BOARD, BRIDGE, FACE, GAP, METER, PART, SPOT, rboxAt, terminalPos, type V3 } from './layout';
import { APPARATUS_LABEL, TERMINAL_PART, type ApparatusId, type SceneState } from './scene-state';
import { circuitsMeterFace, galvoFace, plate } from './tex';

/**
 * The circuits bench: the wooden circuit board (from the Ohm's-law lab) with
 * a dry cell, the plug key, the rheostat, the analogue meters or the
 * centre-zero galvanometer, the resistors R₁ and R₂, or the metre bridge in
 * front with X and the resistance box in its gaps and the jockey on its wire;
 * brass terminal posts, the wires the student has joined, and the cupboard.
 */

const box = new BoxGeometry(1, 1, 1);
const cyl = new CylinderGeometry(1, 1, 1, 18);
const brass = new MeshStandardMaterial({ color: '#c9a23a', roughness: 0.3, metalness: 0.85 });
const copper = new MeshStandardMaterial({ color: '#c06a3a', roughness: 0.35, metalness: 0.8 });
const ebonite = new MeshStandardMaterial({ color: '#1d1f22', roughness: 0.45 });
const redCap = new MeshStandardMaterial({ color: '#c62828', roughness: 0.4 });
const blackCap = new MeshStandardMaterial({ color: '#202124', roughness: 0.4 });
const meterCase = new MeshStandardMaterial({ color: '#2b2f35', roughness: 0.45, metalness: 0.2 });
const galvoCase = new MeshStandardMaterial({ color: '#3a2f25', roughness: 0.5, metalness: 0.15 });
const cellBody = new MeshStandardMaterial({ color: '#1f5fb5', roughness: 0.35, metalness: 0.2 });
const needleMat = new MeshStandardMaterial({ color: '#111', roughness: 0.4 });
const coilMat = new MeshStandardMaterial({ color: '#b5651d', roughness: 0.4, metalness: 0.6 });
const boxWood = new MeshStandardMaterial({ color: '#6b4329', roughness: 0.55 });
const wireMats = WIRE_COLOURS.map((c) => new MeshStandardMaterial({ color: c, roughness: 0.55 }));
const leadMat = new MeshStandardMaterial({ color: '#7a1f1f', roughness: 0.5 });
const highlightWire = new MeshStandardMaterial({ color: '#38bdf8', roughness: 0.4, emissive: '#0e7490', emissiveIntensity: 0.6 });

function B({ p, s, m, r }: { p: V3; s: V3; m: Material; r?: V3 }) {
  return <mesh geometry={box} material={m} position={p} scale={s} rotation={r} />;
}
function C({ p, r, h, m, rot }: { p: V3; r: number; h: number; m: Material; rot?: V3 }) {
  return <mesh geometry={cyl} material={m} position={p} scale={[r, h, r]} rotation={rot} />;
}
function Post({ cap = blackCap }: { cap?: MeshStandardMaterial }) {
  return (
    <group>
      <C p={[0, 0.009, 0]} r={0.008} h={0.018} m={brass} />
      <C p={[0, 0.022, 0]} r={0.011} h={0.01} m={cap} />
    </group>
  );
}
function Plate({ text, p, w = 0.1, r }: { text: string; p: V3; w?: number; r?: V3 }) {
  const tex = useMemo(() => plate(text), [text]);
  return (
    <mesh position={p} rotation={r ?? [-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[w, w / 4]} />
      <meshBasicMaterial map={tex} />
    </mesh>
  );
}

// ------------------------------------------------------------------ parts

/** One 1.5 V dry cell lying in a holder. */
export function DryCell() {
  return (
    <group>
      <B p={[0, 0.012, 0]} s={[0.2, 0.024, 0.06]} m={ebonite} />
      <C p={[0, 0.04, 0]} r={0.017} h={0.12} m={cellBody} rot={[0, 0, Math.PI / 2]} />
      <C p={[0.064, 0.04, 0]} r={0.006} h={0.008} m={mat.steel()} rot={[0, 0, Math.PI / 2]} />
      <Plate text="1.5 V" p={[0, 0.0575, 0]} w={0.06} />
      <BlobShadow r={0.13} />
    </group>
  );
}

/** A box meter with a vertical face whose needle turns to `angle` (radians, + = clockwise from upright). */
function FaceMeter({ face, angle, body = meterCase }: { face: Texture; angle: number; body?: Material }) {
  const needle = useRef<Group>(null);
  useFrame((_, dt) => {
    const g = needle.current;
    if (g) g.rotation.z += (-angle - g.rotation.z) * Math.min(1, dt * 6);
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
        <C p={[0, 0, -0.001]} r={0.005} h={0.004} m={needleMat} rot={[Math.PI / 2, 0, 0]} />
      </group>
      <mesh position={[0, FACE.cy, METER.d / 2 + 0.008]} material={mat.pane()}>
        <planeGeometry args={[FACE.w + 0.006, FACE.h + 0.006]} />
      </mesh>
      <C p={[0, 0.012, METER.d / 2 + 0.002]} r={0.006} h={0.004} m={ebonite} rot={[Math.PI / 2, 0, 0]} />
      <BlobShadow r={0.16} />
    </group>
  );
}
const meterAngle = (value: number, fsd: number, over?: boolean, back?: boolean) => {
  const shown = over ? fsd * 1.04 : back ? -0.03 * fsd : Math.max(-0.03 * fsd, Math.min(1.04 * fsd, value));
  return ((-50 + 100 * (shown / fsd)) * Math.PI) / 180;
};
export function CircuitMeter({ letter, value, over, back }: { letter: 'A' | 'V'; value: number; over?: boolean; back?: boolean }) {
  const fsd = letter === 'A' ? CIRCUITS_AMMETER_FSD : CIRCUITS_VOLTMETER_FSD;
  const face = useMemo(() => (letter === 'A' ? circuitsMeterFace('A', CIRCUITS_AMMETER_FSD, CIRCUITS_AMMETER_MINOR, 0.1) : circuitsMeterFace('V', CIRCUITS_VOLTMETER_FSD, CIRCUITS_VOLTMETER_MINOR, 0.5)), [letter]);
  return <FaceMeter face={face} angle={meterAngle(value, fsd, over, back)} />;
}
/** The centre-zero galvanometer: `div` divisions (+ right). */
export function Galvanometer({ div }: { div: number }) {
  const face = useMemo(galvoFace, []);
  const d = Math.max(-GALVO_DIVS * 1.06, Math.min(GALVO_DIVS * 1.06, div));
  return <FaceMeter face={face} angle={((d / GALVO_DIVS) * 50 * Math.PI) / 180} body={galvoCase} />;
}

/** The unknown resistor X: a coil of wire on a small ebonite former with two brass tags. */
export function UnknownX() {
  return (
    <group>
      <B p={[0, 0.008, 0]} s={[0.1, 0.016, 0.045]} m={ebonite} />
      <C p={[0, 0.03, 0]} r={0.013} h={0.06} m={coilMat} rot={[0, 0, Math.PI / 2]} />
      {[-0.035, 0.035].map((x) => (
        <B key={x} p={[x, 0.02, 0]} s={[0.006, 0.03, 0.02]} m={brass} />
      ))}
      <Plate text="X" p={[0, 0.0175, 0.023]} w={0.03} r={[0, 0, 0]} />
    </group>
  );
}

/** The resistance box: a hardwood box with five brass plugs; a pulled-out plug lies beside its hole. */
export function ResistanceBox({ value }: { value: number }) {
  const out = rboxPlugs(value);
  return (
    <group>
      <B p={[0, 0.03, 0]} s={[0.24, 0.06, 0.1]} m={boxWood} />
      <B p={[0, 0.061, 0]} s={[0.22, 0.003, 0.05]} m={ebonite} />
      {RBOX_PLUGS.map((p, i) => {
        const x = -0.08 + i * 0.04;
        return (
          <group key={i} position={[x, 0.062, 0]}>
            <B p={[0, 0.004, 0]} s={[0.034, 0.008, 0.04]} m={brass} />
            {out[i] ? (
              <group position={[0, 0.006, 0.035]} rotation={[Math.PI / 2, 0, 0]}>
                <C p={[0, 0, 0]} r={0.005} h={0.02} m={brass} />
                <C p={[0, 0.016, 0]} r={0.008} h={0.014} m={ebonite} />
              </group>
            ) : (
              <group position={[0, 0.02, 0]}>
                <C p={[0, -0.006, 0]} r={0.005} h={0.016} m={brass} />
                <C p={[0, 0.008, 0]} r={0.008} h={0.014} m={ebonite} />
              </group>
            )}
            <Plate text={`${p}`} p={[0, -0.001, -0.033]} w={0.03} r={[-Math.PI / 2, 0, 0]} />
          </group>
        );
      })}
      <Plate text={`R = ${value} Ω`} p={[0, 0.03, 0.0505]} w={0.12} r={[0, 0, 0]} />
      <BlobShadow r={0.16} />
    </group>
  );
}

/** The metre bridge: base, metre scale, copper strips with the two gaps, the wire, and the jockey at `jockey` cm (down when touching). */
export function MetreBridge({ jockey, down }: { jockey: number; down: boolean }) {
  const j = useRef<Group>(null);
  useFrame((_, dt) => {
    const g = j.current;
    if (!g) return;
    const k = Math.min(1, dt * 14);
    g.position.x += (jockey / 100 - g.position.x) * k;
    g.position.y += ((down ? -0.01 : 0) - g.position.y) * Math.min(1, dt * 20);
  });
  const z0 = BRIDGE.stripZ;
  const zw = BRIDGE.wireZ;
  const y = BRIDGE.y;
  return (
    <group>
      <B p={[0.5, y / 2, (z0 + zw) / 2 - 0.01]} s={[1.12, y, BRIDGE.baseD]} m={mat.woodDark()} />
      <group position={[0, y + 0.0005, zw + 0.018]}>
        <Rule cm={100} />
      </group>
      {/* the copper strips: L-shaped ends A and C, the centre strip D */}
      <B p={[-0.035, y + 0.002, (z0 + zw) / 2]} s={[0.03, 0.004, zw - z0 + 0.03]} m={copper} />
      <B p={[0.08, y + 0.002, z0]} s={[0.26, 0.004, 0.03]} m={copper} />
      <B p={[1.035, y + 0.002, (z0 + zw) / 2]} s={[0.03, 0.004, zw - z0 + 0.03]} m={copper} />
      <B p={[0.92, y + 0.002, z0]} s={[0.26, 0.004, 0.03]} m={copper} />
      <B p={[0.5, y + 0.002, z0]} s={[0.36, 0.004, 0.03]} m={copper} />
      {/* the wire, stretched over the scale between A and C */}
      <C p={[0.5, y + 0.006, zw]} r={0.0008} h={1.07} m={mat.steel()} rot={[0, 0, Math.PI / 2]} />
      <Plate text="A" p={[-0.035, y + 0.0045, z0 - 0.03]} w={0.03} />
      <Plate text="C" p={[1.035, y + 0.0045, z0 - 0.03]} w={0.03} />
      <Plate text="D" p={[0.5, y + 0.0045, z0 - 0.03]} w={0.03} />
      <group ref={j} position={[jockey / 100, down ? -0.01 : 0, 0]}>
        {/* knife edge and ebonite handle */}
        <B p={[0, y + 0.018, zw]} s={[0.004, 0.018, 0.012]} m={brass} />
        <C p={[0, y + 0.045, zw]} r={0.008} h={0.04} m={ebonite} />
      </group>
      <BlobShadow r={0.6} opacity={0.5} />
    </group>
  );
}

export function WireCoil() {
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
  { id: 'cell', label: APPARATUS_LABEL.cell, shelf: 0, x: -0.85, model: <DryCell /> },
  { id: 'key', label: APPARATUS_LABEL.key, shelf: 0, x: -0.6, model: <PlugKey closed={false} /> },
  { id: 'rheostat', label: APPARATUS_LABEL.rheostat, shelf: 0, x: -0.28, model: <Rheostat value={1} /> },
  { id: 'bridge', label: APPARATUS_LABEL.bridge, shelf: 0, x: -0.6, z: 0.1, grip: [[1.1, 0.06, 0.2], [0.5, 0.03, 0.3]], model: sm(0.7, <group position={[0, 0, -0.3]}><MetreBridge jockey={50} down={false} /></group>) },
  { id: 'ammeter', label: APPARATUS_LABEL.ammeter, shelf: 1, x: -0.85, model: sm(0.75, <CircuitMeter letter="A" value={0} />) },
  { id: 'voltmeter', label: APPARATUS_LABEL.voltmeter, shelf: 1, x: -0.62, model: sm(0.75, <CircuitMeter letter="V" value={0} />) },
  { id: 'galvanometer', label: APPARATUS_LABEL.galvanometer, shelf: 1, x: -0.39, model: sm(0.75, <Galvanometer div={0} />) },
  { id: 'rbox', label: APPARATUS_LABEL.rbox, shelf: 1, x: -0.12, model: sm(0.8, <ResistanceBox value={0} />) },
  { id: 'wires', label: APPARATUS_LABEL.wires, shelf: 1, x: 0.12, model: <WireCoil /> },
  { id: 'unknown', label: APPARATUS_LABEL.unknown, shelf: 2, x: -0.85, model: <UnknownX /> },
  { id: 'r1', label: APPARATUS_LABEL.r1, shelf: 2, x: -0.62, model: <Resistor /> },
  { id: 'r2', label: APPARATUS_LABEL.r2, shelf: 2, x: -0.36, model: <Resistor /> },
  { id: 'battery', label: APPARATUS_LABEL.battery, shelf: 2, x: -0.08, model: sm(0.8, <Cells />) },
  { id: 'bulb', label: APPARATUS_LABEL.bulb, shelf: 2, x: 0.16, model: <Bulb /> },
  { id: 'micrometer', label: APPARATUS_LABEL.micrometer, shelf: 2, x: 0.34, model: <Micrometer /> },
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
/** A fixed lead (the resistance box into its gap): not a student wire. */
function Lead({ a, b }: { a: V3; b: V3 }) {
  const geo = useMemo(() => new TubeGeometry(wireCurve(a, b), 24, 0.002, 6, false), [a, b]);
  return <mesh geometry={geo} material={leadMat} />;
}

function DragWire({ s }: { s: { rheostat: number; jockey: number; pressed: boolean } }) {
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

const RED: Partial<Record<CircuitsTerminal, true>> = { 'cell+': true, 'am+': true, 'vm+': true, 'rh-s': true };

export const TERM_LABEL: Record<CircuitsTerminal, string> = {
  'cell+': 'Cell + terminal',
  'cell-': 'Cell − terminal',
  'key-a': 'Key terminal (left)',
  'key-b': 'Key terminal (right)',
  'rh-a': 'Rheostat end terminal',
  'rh-s': 'Rheostat slider terminal',
  'am+': 'Ammeter + terminal',
  'am-': 'Ammeter − terminal',
  'vm+': 'Voltmeter + terminal',
  'vm-': 'Voltmeter − terminal',
  'g-a': 'Galvanometer terminal (left)',
  'g-b': 'Galvanometer terminal (right)',
  'mb-a': 'Bridge terminal A (0 cm end)',
  'mb-d': 'Bridge centre strip D terminal',
  'mb-c': 'Bridge terminal C (100 cm end)',
  'mb-j': 'Jockey terminal',
  'r1-a': 'R₁ terminal (left)',
  'r1-b': 'R₁ terminal (right)',
  'r2-a': 'R₂ terminal (left)',
  'r2-b': 'R₂ terminal (right)',
};

// ------------------------------------------------------------------ the bench
export function Station({ state, scene, meters, touching, interactive, board }: { state: PhyCircuitsState; scene: SceneState; meters: CircuitsMeters; touching: boolean; interactive: boolean; board: CircuitsTerminal[] }) {
  const picked = useBench((b) => b.picked);
  const has = (id: ApparatusId) => scene.collected.has(id);
  const task = state.task ?? 'BRIDGE';
  const pos = (t: CircuitsTerminal) => terminalPos(t, { ...state, pressed: touching });
  const wires = state.wires
    .map((w, i) => ({ w, i, ends: w.split('|') as [CircuitsTerminal, CircuitsTerminal] }))
    .filter(({ ends }) => board.includes(ends[0]) && board.includes(ends[1]));
  const at = (p: readonly [number, number, number]): V3 => [p[0], p[1], p[2]];
  const drag = interactive ? (id: string) => dragFor(id) : undefined;
  const glow = (on: boolean, r: number) => on && <GlowRing r={r} y={BOARD.h + 0.002} />;
  const bridgeOn = task === 'BRIDGE' && has('bridge');
  const boxAt = rboxAt(state.swap);
  // The gap the resistance box is joined into, and the one X sits in.
  const rGap = state.swap ? GAP.left : GAP.right;
  const xGap = state.swap ? GAP.right : GAP.left;
  const part = (id: ApparatusId, label: string, p: V3, node: React.ReactNode, r = 0.14, labelY?: number) =>
    has(id) && (
      <Interactive id={id} label={label} bench labelY={labelY} position={p} drag={drag}>
        {(a) => (
          <group>
            {node}
            {glow(a, r)}
          </group>
        )}
      </Interactive>
    );
  return (
    <group position={STATION}>
      <Interactive id="mybench" label="Your bench" labelY={0.5}>
        <mesh position={[0, 0.005, 0]}>
          <boxGeometry args={[2.6, 0.01, 0.9]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>
      <Interactive id="board" label="Circuit board" bench position={[BOARD.x, 0, BOARD.z]}>
        {(active) => (
          <group>
            <B p={[0, BOARD.h / 2, 0]} s={[BOARD.w, BOARD.h, BOARD.d]} m={mat.wood()} />
            <BlobShadow r={0.6} opacity={0.6} />
            {active && <GlowRing r={0.5} y={BOARD.h + 0.001} />}
          </group>
        )}
      </Interactive>
      {part('cell', APPARATUS_LABEL.cell, at(PART.cell), <DryCell />, 0.12)}
      {part('key', state.key ? 'Plug key (closed)' : 'Plug key (open)', at(PART.key), <PlugKey closed={state.key} />, 0.12)}
      {task === 'EMF' && part('rheostat', `Rheostat (${(state.rheostat * 10).toFixed(2)} Ω in use)`, at(PART.rheostat), <Rheostat value={state.rheostat} />, 0.18)}
      {task !== 'BRIDGE' && part('ammeter', 'Ammeter', at(PART.ammeter), <CircuitMeter letter="A" value={meters.I} over={meters.overI} back={meters.backI} />, 0.15, 0.2)}
      {task !== 'BRIDGE' && part('voltmeter', 'Voltmeter', at(PART.voltmeter), <CircuitMeter letter="V" value={meters.V} over={meters.overV} back={meters.backV} />, 0.15, 0.2)}
      {task === 'BRIDGE' && part('galvanometer', 'Centre-zero galvanometer', at(PART.galvanometer), <Galvanometer div={touching ? meters.galvo : 0} />, 0.15, 0.2)}
      {task === 'SERIES' && part('r1', 'Resistor R₁', at(PART.r1), <><Resistor /><Plate text="R₁" p={[0, 0.0165, 0.026]} w={0.03} r={[0, 0, 0]} /></>, 0.12)}
      {task === 'SERIES' && part('r2', 'Resistor R₂', at(PART.r2), <><Resistor /><Plate text="R₂" p={[0, 0.0165, 0.026]} w={0.03} r={[0, 0, 0]} /></>, 0.12)}
      {bridgeOn && (
        <Interactive id="bridge" label={`Metre bridge (jockey at ${state.jockey.toFixed(1)} cm${touching ? ', touching the wire' : ''})`} bench position={[BRIDGE.x0, 0, 0]} drag={drag}>
          {(a) => (
            <group>
              <MetreBridge jockey={state.jockey} down={touching} />
              {a && <GlowRing r={0.55} y={0.004} />}
            </group>
          )}
        </Interactive>
      )}
      {bridgeOn && has('unknown') && (
        <Interactive id="unknown" label={`Unknown resistor X (in the ${state.swap ? 'right' : 'left'} gap)`} bench position={[xGap, BRIDGE.y + 0.004, BRIDGE.stripZ]}>
          {(a) => (
            <group>
              <UnknownX />
              {a && <GlowRing r={0.07} />}
            </group>
          )}
        </Interactive>
      )}
      {task === 'BRIDGE' && has('rbox') && (
        <>
          {part('rbox', `Resistance box (R = ${state.rbox} Ω, in the ${state.swap ? 'left' : 'right'} gap)`, boxAt, <ResistanceBox value={state.rbox} />, 0.16)}
          {bridgeOn && (
            <>
              <Lead a={[boxAt[0] - 0.1, BOARD.h + 0.066, boxAt[2]]} b={[rGap - 0.04, BRIDGE.y + 0.006, BRIDGE.stripZ]} />
              <Lead a={[boxAt[0] + 0.1, BOARD.h + 0.066, boxAt[2]]} b={[rGap + 0.04, BRIDGE.y + 0.006, BRIDGE.stripZ]} />
            </>
          )}
        </>
      )}
      {board
        .filter((t) => has(TERMINAL_PART[t]))
        .map((t) => {
          const p = pos(t);
          const moving = t === 'rh-s' || t === 'mb-j';
          return (
            <Interactive key={t} id={`term:${t}`} label={TERM_LABEL[t]} bench labelY={0.04} position={[p[0], p[1] - 0.028, p[2]]} drag={drag}>
              {(a) => (
                <group>
                  {!moving && <Post cap={RED[t] ? redCap : blackCap} />}
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
      {interactive && <DragWire s={{ ...state, pressed: touching }} />}
      {(['battery', 'bulb', 'micrometer', ...(task === 'BRIDGE' ? (['ammeter', 'voltmeter', 'rheostat', 'r1', 'r2'] as const) : task === 'EMF' ? (['galvanometer', 'rbox', 'unknown', 'bridge', 'r1', 'r2'] as const) : (['galvanometer', 'rbox', 'unknown', 'bridge', 'rheostat'] as const))] as ApparatusId[])
        .filter((id) => has(id))
        .map((id, k) => (
          <Interactive key={id} id={id} label={`${APPARATUS_LABEL[id]} (not needed)`} bench position={[SPOT.extras[0], 0, SPOT.extras[2] - 0.25 + k * 0.16]}>
            {(a) => (
              <group scale={0.6}>
                {id === 'battery' ? <Cells /> : id === 'bulb' ? <Bulb /> : id === 'micrometer' ? <Micrometer /> : id === 'ammeter' || id === 'voltmeter' ? <CircuitMeter letter={id === 'ammeter' ? 'A' : 'V'} value={0} /> : id === 'galvanometer' ? <Galvanometer div={0} /> : id === 'rbox' ? <ResistanceBox value={0} /> : id === 'unknown' ? <UnknownX /> : id === 'rheostat' ? <Rheostat value={1} /> : id === 'bridge' ? <B p={[0, 0.015, 0]} s={[0.3, 0.03, 0.12]} m={mat.woodDark()} /> : <Resistor />}
                {a && <GlowRing r={0.12} />}
              </group>
            )}
          </Interactive>
        ))}
      {has('wires') && !state.wires.length && (
        <group position={[BOARD.x + 0.2, BOARD.h, BOARD.z - 0.02]}>
          <WireCoil />
        </group>
      )}
      <CardAndBook cardAt={SPOT.card} bookAt={SPOT.book} title={CARD_TITLE[task]} lines={TASK_LINES[task]} bookTitle={CARD_TITLE[task]} heads={HEADS[task]} />
    </group>
  );
}
const CARD_TITLE = { BRIDGE: 'Metre bridge', EMF: 'E.m.f. and r', SERIES: 'Series and parallel' };
const TASK_LINES = {
  BRIDGE: ['X in the left gap, R in the right; cell and key across A–C.', 'Galvanometer from D to the jockey. Tap to find balance.', 'X = R l/(100 − l). Interchange X and R to check.'],
  EMF: ['Cell, key, ammeter and rheostat in series.', 'Voltmeter straight across the cell. Read it with the key open.', 'Plot V against I: intercept E, slope −r.'],
  SERIES: ['V and I for R₁, R₂, series, parallel.', 'Voltmeter across the arrangement only.', 'Compare with R₁ + R₂ and R₁R₂/(R₁ + R₂).'],
};
const HEADS = { BRIDGE: ['R/Ω', 'l/cm', '100−l', 'X/Ω'], EMF: ['I/A', 'V/V'], SERIES: ['', 'V/V', 'I/A', 'R/Ω'] };

export function Cupboard({ scene }: { scene: SceneState }) {
  return <CupboardItems slots={CUPBOARD_SLOTS} collected={scene.collected} />;
}
