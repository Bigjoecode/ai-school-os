import { OPTICS_RULE, type OpticsTask, type PhyOpticsState, type PhyOpticsVariant } from '@aischool/shared';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { BoxGeometry, CylinderGeometry, DoubleSide, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry, type Group } from 'three';
import { BlobShadow, GlowRing } from '../../../lab3d-kit/apparatus';
import { Interactive } from '../../../lab3d-kit/interact';
import { BENCH, STATION } from '../../../lab3d-kit/layout';
import { mat } from '../../../lab3d-kit/materials';
import { CardAndBook, CupboardItems, type CupboardSlot } from '../../phy-common/lab3d/common';
import { canvasTex, FONT, liveTex } from '../../phy-common/lab3d/tex';
import { drawScreen, objectView, SCREEN_CM, windowView } from '../image';
import { useBench } from './bench-store';
import { APPARATUS_LABEL, opticOf, type ApparatusId, type SceneState } from './scene-state';
import { AXIS_Y, cmX, holderZ, roughScreenCm, RULE_TOP, RULE_W, RULE_X0, RULE_Z, SPOT } from './views';

const box = new BoxGeometry(1, 1, 1);
const cyl = new CylinderGeometry(1, 1, 1, 20);
const sphere = new SphereGeometry(1, 24, 16);
const lensMat = new MeshStandardMaterial({ color: '#d8f3f7', roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.38, depthWrite: false, side: DoubleSide });
const silver = new MeshStandardMaterial({ color: '#eef3f6', roughness: 0.08, metalness: 1, side: DoubleSide });
const lampOn = new MeshBasicMaterial({ color: '#fff1c4' });
const lampOff = new MeshStandardMaterial({ color: '#5b5f63', roughness: 0.4 });
const housing = new MeshStandardMaterial({ color: '#37474f', roughness: 0.5, metalness: 0.3 });
const indexRed = new MeshBasicMaterial({ color: '#c62828' });
const SCREEN_PX = { w: 288, h: Math.round((288 * SCREEN_CM.h) / SCREEN_CM.w) };

/** The metre rule's scale in four 25 cm strips (64 px per cm, so the mm marks stay sharp at eye level). */
const ruleStrip = (from: number) =>
  canvasTex(`optics-rule-${from}`, 1600, 192, (g, w, h) => {
    g.fillStyle = '#f1d68a';
    g.fillRect(0, 0, w, h);
    const k = w / 25;
    g.fillStyle = '#161616';
    g.strokeStyle = '#161616';
    for (let mm = 0; mm <= 250; mm++) {
      const x = (mm / 10) * k;
      const cm = from + mm / 10;
      const len = mm % 10 === 0 ? 70 : mm % 5 === 0 ? 48 : 30;
      g.lineWidth = mm % 10 === 0 ? 3 : 1.6;
      // marks along the edge nearest the student (the bottom of the strip)
      g.beginPath();
      g.moveTo(x, h);
      g.lineTo(x, h - len);
      g.stroke();
      if (mm % 10 === 0 && mm < 250) {
        g.font = `700 ${cm % 10 === 0 ? 44 : 32}px ${FONT}`;
        g.textAlign = mm === 0 ? 'left' : 'center';
        g.fillText(String(cm), Math.max(6, x), h - 84);
      }
    }
    g.textAlign = 'left';
    if (from === 0) {
      g.font = `600 22px ${FONT}`;
      g.fillText('cm', 8, 30);
    }
  });

function MetreRule({ glow }: { glow?: boolean }) {
  const strips = useMemo(() => [0, 25, 50, 75].map(ruleStrip), []);
  return (
    <group>
      <mesh geometry={box} material={mat.wood()} position={[0.5, RULE_TOP / 2, 0]} scale={[1.01, RULE_TOP, RULE_W]} />
      {strips.map((t, i) => (
        <mesh key={i} position={[0.125 + i * 0.25, RULE_TOP + 0.0002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.25, RULE_W]} />
          <meshStandardMaterial map={t} roughness={0.6} />
        </mesh>
      ))}
      <BlobShadow r={0.5} y={0.0006} opacity={0.4} />
      {glow && <GlowRing r={0.5} />}
    </group>
  );
}

/**
 * A holder standing on the rule: its base (a saddle over the rule, or beside
 * it for the mirror task's off-axis object and screen), a pointer to the
 * rule's front edge carrying the red index line, and the rod up to `top` (m).
 * `dz`: how far the holder stands off the rule's centre line.
 */
function Holder({ top, dz = 0, children, glow }: { top: number; dz?: number; children?: React.ReactNode; glow?: boolean }) {
  const baseH = RULE_TOP + 0.014;
  const front = RULE_W / 2;
  // A holder in front of the rule (the mirror task's screen) has its base in front and points back onto the scale.
  const ahead = dz > 0.01;
  const baseZ = ahead ? dz + 0.004 : dz - 0.011;
  const arm = ahead ? [front - 0.009, dz - 0.01] : [dz + 0.003, front];
  return (
    <group>
      {/* the base stands behind the scale (the marks are along the rule's front edge), so they stay readable */}
      <mesh geometry={box} material={mat.darkMetal()} position={[0, baseH / 2, baseZ]} scale={[0.04, baseH, 0.028]} />
      {/* a thin pointer out to the front edge, its red index line lying on the scale */}
      <mesh geometry={box} material={mat.metal()} position={[0, RULE_TOP + 0.0004, (arm[0]! + arm[1]!) / 2]} scale={[0.0035, 0.0008, Math.max(0.002, arm[1]! - arm[0]!)]} />
      <mesh geometry={box} material={indexRed} position={[0, RULE_TOP + 0.0009, front - 0.004]} scale={[0.0008, 0.0002, 0.008]} />
      <mesh geometry={cyl} material={mat.metal()} position={[0, (baseH + top) / 2, dz]} scale={[0.004, Math.max(0.001, top - baseH), 0.004]} />
      <group position={[0, 0, dz]}>{children}</group>
      {glow && <GlowRing r={0.05} y={baseH + 0.002} />}
    </group>
  );
}

/** The cross-wire plate's face: the illuminated hole with its tab and wires. */
const plateTexture = () =>
  canvasTex('optics-plate', 256, 256, (g, w) => {
    g.fillStyle = '#20262b';
    g.fillRect(0, 0, w, w);
    const c = w / 2;
    const R = 50;
    g.fillStyle = '#fff1c4';
    g.beginPath();
    g.arc(c, c, R, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(c - 13, c - R + 2);
    g.lineTo(c + 13, c - R + 2);
    g.lineTo(c, c - R - 18);
    g.closePath();
    g.fill();
    g.strokeStyle = '#111';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(c - R, c);
    g.lineTo(c + R, c);
    g.moveTo(c, c - R);
    g.lineTo(c, c + R);
    g.stroke();
  });
const plateOff = () =>
  canvasTex('optics-plate-off', 64, 64, (g, w) => {
    g.fillStyle = '#20262b';
    g.fillRect(0, 0, w, w);
    g.fillStyle = '#4a4f54';
    g.beginPath();
    g.arc(w / 2, w / 2, 12, 0, Math.PI * 2);
    g.fill();
  });

/** The illuminated object: lamp box behind a plate with the cross-wire; the plate faces +x (`facing` 1) or −x. */
function ObjectModel({ lit, facing }: { lit: boolean; facing: 1 | -1 }) {
  const tex = useMemo(() => (lit ? plateTexture() : plateOff()), [lit]);
  return (
    <group rotation={[0, facing === 1 ? 0 : Math.PI, 0]}>
      {/* lamp housing behind the plate */}
      <mesh geometry={box} material={housing} position={[-0.055, AXIS_Y - 0.01, 0]} scale={[0.09, 0.09, 0.08]} />
      <mesh geometry={box} material={housing} position={[-0.055, AXIS_Y + 0.04, 0]} scale={[0.05, 0.012, 0.05]} />
      <mesh geometry={cyl} material={housing} position={[-0.055, AXIS_Y - 0.065, 0]} scale={[0.02, 0.04, 0.02]} />
      <mesh geometry={box} material={mat.black()} position={[-0.1, 0.005, 0.03]} scale={[0.02, 0.01, 0.01]} />
      {/* the plate and its lit hole */}
      <mesh geometry={box} material={housing} position={[-0.005, AXIS_Y, 0]} scale={[0.006, 0.08, 0.08]} />
      <mesh position={[-0.0015, AXIS_Y, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[0.07, 0.07]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
      {lit && <mesh geometry={sphere} material={lampOn} position={[-0.04, AXIS_Y, 0]} scale={0.012} />}
      {!lit && <mesh geometry={sphere} material={lampOff} position={[-0.04, AXIS_Y, 0]} scale={0.012} />}
    </group>
  );
}

function LensModel() {
  return (
    <group position={[0, AXIS_Y, 0]}>
      <mesh geometry={sphere} material={lensMat} scale={[0.0045, 0.025, 0.025]} />
      <mesh material={mat.darkMetal()} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[0.026, 0.0022, 8, 32]} />
      </mesh>
    </group>
  );
}

/** A concave mirror facing +x (`facing` 1) or −x: a silvered spherical cap in a ring. */
function MirrorModel({ facing }: { facing: 1 | -1 }) {
  return (
    <group position={[0, AXIS_Y, 0]} rotation={[0, facing === 1 ? 0 : Math.PI, 0]}>
      {/* the cap of a sphere of radius 0.2 m (2f ≈ 20 cm), opening towards +x */}
      <mesh material={silver} position={[0.2 - 0.0016, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <sphereGeometry args={[0.2, 32, 6, 0, Math.PI * 2, Math.PI - 0.13, 0.13]} />
      </mesh>
      <mesh material={mat.darkMetal()} rotation={[0, Math.PI / 2, 0]} position={[-0.002, 0, 0]}>
        <torusGeometry args={[0.026, 0.0025, 8, 32]} />
      </mesh>
      <mesh geometry={cyl} material={mat.darkMetal()} position={[-0.004, 0, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.026, 0.004, 0.026]} />
    </group>
  );
}

/** The white screen; its face (with what lands on it) towards −x (`facing` −1) or +x. */
function ScreenModel({ facing, paint, paintKey }: { facing: 1 | -1; paint: (g: CanvasRenderingContext2D, w: number, h: number) => void; /** Redraw only when this changes. */ paintKey: string }) {
  const tex = useMemo(() => liveTex(SCREEN_PX.w, SCREEN_PX.h), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => tex.redraw(paint), [paintKey, tex]);
  const w = SCREEN_CM.w / 100;
  const h = SCREEN_CM.h / 100;
  return (
    <group position={[0, AXIS_Y, 0]} rotation={[0, facing === -1 ? -Math.PI / 2 : Math.PI / 2, 0]}>
      <mesh geometry={box} material={mat.cabinet()} position={[0, 0, -0.003]} scale={[w + 0.01, h + 0.01, 0.004]} />
      <mesh position={[0, 0, 0.0002]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={tex.texture} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Glides a holder to its x and y (the lens/mirror drops to the axis when the centres are lined up). */
function Glide({ x, y = 0, z, rotY = 0, children }: { x: number; y?: number; z: number; rotY?: number; children: React.ReactNode }) {
  const ref = useRef<Group>(null);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const k = Math.min(1, dt * 7);
    g.position.x += (x - g.position.x) * k;
    g.position.y += (y - g.position.y) * Math.min(1, dt * 3);
    g.position.z += (z - g.position.z) * k;
    g.rotation.y += (rotY - g.rotation.y) * Math.min(1, dt * 4);
  });
  return (
    <group ref={ref} position={[x, y, z]} rotation={[0, rotY, 0]}>
      {children}
    </group>
  );
}

/** Everything on the optical bench: the rule, the object, the lens or mirror and the screen. */
function Bench({ v, state, scene, interactive }: { v: PhyOpticsVariant; state: PhyOpticsState; scene: SceneState; interactive: boolean }) {
  const task: OpticsTask = state.task ?? 'LENS';
  const rough = useBench((b) => b.rough);
  const roughS = useBench((b) => b.roughS);
  const optic = opticOf(task);
  const on = (id: ApparatusId) => scene.placed.has(id) && scene.collected.has(id);
  const mirror = task === 'MIRROR';
  const objectCm = mirror ? state.u : 0;
  const opticCm = mirror ? 0 : state.u;
  const screenCm = rough ? roughScreenCm(task, state.u, roughS) : state.screen;
  const screenFacing: 1 | -1 = rough && mirror ? 1 : -1;
  const lift = state.aligned ? 0 : v.misalign / 100;
  const lit = on('lamp') && !rough;
  // What lands on the screen: the window (rough focus), the cross-wire (bench set up), or nothing.
  const view = rough ? windowView(v, task, roughS) : lit && on(optic) ? objectView(v, task, state.u, state.screen, state.aligned) : null;
  const paint = (g: CanvasRenderingContext2D, w: number, h: number) => drawScreen(g, w, h, view);
  const dragU = interactive && !rough ? () => 'slide-u' : undefined;
  const dragS = interactive && !rough ? () => 'slide-screen' : undefined;
  // Waiting places (collected, not yet on the rule), left to right.
  const waiting = (['lamp', optic, 'screen'] as ApparatusId[]).filter((id) => scene.collected.has(id) && !on(id));
  const waitX = (id: ApparatusId) => SPOT.waiting[0] + Math.max(0, waiting.indexOf(id)) * 0.2;
  // The lamp is lifted off the rule (beside it) while the lens faces the window.
  const lampAside = rough && !mirror;
  const placedAt = (id: ApparatusId, cm: number, what: 'object' | 'optic' | 'screen', lift = 0) =>
    on(id) ? { x: cmX(cm), y: lift, z: RULE_Z, dz: holderZ(task, what) - RULE_Z } : { x: waitX(id), y: -RULE_TOP, z: SPOT.waiting[2], dz: 0 };
  const L = lampAside ? { x: SPOT.waiting[0] + 0.25, y: -RULE_TOP, z: SPOT.waiting[2], dz: 0 } : placedAt('lamp', objectCm, 'object');
  const O = placedAt(optic, opticCm, 'optic', lift);
  const S = rough ? { x: cmX(screenCm), y: 0, z: RULE_Z, dz: holderZ(task, 'screen') - RULE_Z } : placedAt('screen', screenCm, 'screen');
  return (
    <group>
      {scene.collected.has('rule') && (
        <Interactive id="rule" label="Metre rule" bench position={[RULE_X0, 0, RULE_Z]} labelY={0.03}>
          {(active) => <MetreRule glow={active} />}
        </Interactive>
      )}
      {scene.collected.has('lamp') && (
        <Glide x={L.x} y={L.y} z={L.z}>
          <Interactive id="lamp" label={dragU && mirror && on('lamp') ? 'Illuminated object — drag along the rule to set u' : 'Illuminated object (cross-wire and lamp)'} bench labelY={0.22} drag={mirror && on('lamp') ? dragU : undefined}>
            {(active) => (
              <Holder top={AXIS_Y - 0.04} dz={L.dz} glow={active}>
                <ObjectModel lit={lit} facing={mirror ? -1 : 1} />
              </Holder>
            )}
          </Interactive>
        </Glide>
      )}
      {scene.collected.has(optic) && (
        <Glide x={O.x} y={O.y} z={O.z} rotY={rough && mirror ? Math.PI : 0}>
          <Interactive id={optic} label={!mirror && dragU && on(optic) ? 'Converging lens — drag along the rule to set u' : APPARATUS_LABEL[optic]} bench labelY={0.2} drag={!mirror && on(optic) ? dragU : undefined}>
            {(active) => (
              <Holder top={AXIS_Y - 0.026} dz={O.dz} glow={active}>
                {mirror ? <MirrorModel facing={1} /> : <LensModel />}
              </Holder>
            )}
          </Interactive>
        </Glide>
      )}
      {scene.collected.has('screen') && (
        <Glide x={S.x} y={S.y} z={S.z}>
          <Interactive id="screen" label={dragS && on('screen') ? 'White screen — drag along the rule to focus' : 'White screen'} bench labelY={0.22} drag={on('screen') ? dragS : undefined}>
            {(active) => (
              <Holder top={AXIS_Y - SCREEN_CM.h / 200} dz={S.dz} glow={active}>
                <ScreenModel facing={screenFacing} paint={paint} paintKey={JSON.stringify(view)} />
              </Holder>
            )}
          </Interactive>
        </Glide>
      )}
    </group>
  );
}

function ExtraModel({ id }: { id: ApparatusId }) {
  if (id === 'prism')
    return (
      <mesh material={lensMat} position={[0, 0.012, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 0.025, 3]} />
      </mesh>
    );
  if (id === 'plane')
    return (
      <group>
        <mesh geometry={box} material={mat.steel()} position={[0, 0.025, 0]} scale={[0.1, 0.05, 0.003]} />
        <mesh geometry={box} material={mat.wood()} position={[0, 0.004, 0.004]} scale={[0.1, 0.008, 0.02]} />
      </group>
    );
  if (id === 'block') return <mesh geometry={box} material={lensMat} position={[0, 0.0125, 0]} scale={[0.11, 0.025, 0.065]} />;
  if (id === 'lens') return <group position={[0, -AXIS_Y + 0.04, 0]}><LensModel /></group>;
  if (id === 'mirror') return <group position={[0, -AXIS_Y + 0.04, 0]}><MirrorModel facing={1} /></group>;
  return null;
}

/** Everything on the student's bench. */
export function Station({ v, state, scene, interactive, task }: { v: PhyOpticsVariant; state: PhyOpticsState; scene: SceneState; interactive: boolean; task: string[] }) {
  const t: OpticsTask = state.task ?? 'LENS';
  // The lens or mirror this task does not use, and the distractors, stand at the far end.
  const other: ApparatusId = t === 'MIRROR' ? 'lens' : 'mirror';
  const extras = ([other, 'prism', 'plane', 'block'] as ApparatusId[]).filter((id) => scene.collected.has(id));
  return (
    <group position={STATION}>
      <Interactive id="mybench" label="Your bench" labelY={0.5}>
        <mesh position={[0, 0.005, 0]}>
          <boxGeometry args={[BENCH.w, 0.01, BENCH.d]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>
      <CardAndBook cardAt={SPOT.card} bookAt={SPOT.book} title={t === 'MIRROR' ? 'Concave mirror' : 'Converging lens'} lines={task} bookTitle={t === 'MIRROR' ? 'Focal length — mirror' : 'Focal length — lens'} heads={['u/cm', 'v/cm', '1/u', '1/v']} />
      <Bench v={v} state={state} scene={scene} interactive={interactive} />
      {extras.map((id, k) => (
        <Interactive key={id} id={id} label={APPARATUS_LABEL[id]} bench position={[SPOT.extras[0] + (k % 2) * 0.16, 0, SPOT.extras[2] - Math.floor(k / 2) * 0.14]} labelY={0.1}>
          {(active) => (
            <group>
              <ExtraModel id={id} />
              <BlobShadow r={0.06} />
              {active && <GlowRing r={0.07} />}
            </group>
          )}
        </Interactive>
      ))}
    </group>
  );
}

/** The cupboard's shelves: what is still there. */
const SLOTS: CupboardSlot[] = [
  { id: 'rule', label: APPARATUS_LABEL.rule, shelf: 0, x: -0.55, model: <group position={[-0.45, 0, 0]} scale={[0.9, 1, 1]}><mesh geometry={box} material={mat.wood()} position={[0.5, 0.003, 0]} scale={[1, 0.006, 0.03]} /></group>, grip: [[0.9, 0.04, 0.06], [0, 0.01, 0]] },
  { id: 'lamp', label: APPARATUS_LABEL.lamp, shelf: 1, x: -0.75, model: <group position={[0.05, -AXIS_Y + 0.05, 0]}><ObjectModel lit={false} facing={1} /></group>, grip: [[0.14, 0.12, 0.1], [0, 0.05, 0]] },
  { id: 'lens', label: APPARATUS_LABEL.lens, shelf: 1, x: -0.45, model: <ExtraModel id="lens" />, grip: [[0.07, 0.1, 0.07], [0, 0.04, 0]] },
  { id: 'mirror', label: APPARATUS_LABEL.mirror, shelf: 1, x: -0.2, model: <ExtraModel id="mirror" />, grip: [[0.07, 0.1, 0.07], [0, 0.04, 0]] },
  { id: 'screen', label: APPARATUS_LABEL.screen, shelf: 2, x: -0.6, model: <group position={[0, -AXIS_Y + 0.06, 0]}><ScreenModel facing={-1} paint={(g, w, h) => drawScreen(g, w, h, null)} paintKey="blank" /></group>, grip: [[0.05, 0.12, 0.14], [0, 0.06, 0]] },
  { id: 'prism', label: APPARATUS_LABEL.prism, shelf: 1, x: 0.3, model: <ExtraModel id="prism" />, grip: [[0.08, 0.05, 0.08], [0, 0.02, 0]] },
  { id: 'plane', label: APPARATUS_LABEL.plane, shelf: 2, x: -0.15, model: <ExtraModel id="plane" />, grip: [[0.12, 0.07, 0.04], [0, 0.03, 0]] },
  { id: 'block', label: APPARATUS_LABEL.block, shelf: 2, x: 0.3, model: <ExtraModel id="block" />, grip: [[0.12, 0.04, 0.08], [0, 0.02, 0]] },
];
export function OpticsCupboard({ scene }: { scene: SceneState }) {
  return <CupboardItems slots={SLOTS} collected={scene.collected} />;
}

export { OPTICS_RULE };
