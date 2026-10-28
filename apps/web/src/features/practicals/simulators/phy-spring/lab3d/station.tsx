import { SPRING_SLOTS, SPRING_STEP, springReading, type PhySpringState } from '@aischool/shared';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { BoxGeometry, CatmullRomCurve3, CylinderGeometry, MeshStandardMaterial, TubeGeometry, Vector3, type Group, type Material, type Mesh } from 'three';
import { BlobShadow, GlowRing } from '../../../lab3d-kit/apparatus';
import { Interactive } from '../../../lab3d-kit/interact';
import { BENCH, STATION } from '../../../lab3d-kit/layout';
import { mat } from '../../../lab3d-kit/materials';
import { CardAndBook, CupboardItems, type CupboardSlot } from '../../phy-common/lab3d/common';
import { canvasTex, FONT, liveTex } from '../../phy-common/lab3d/tex';
import { motionOffset, type Spring } from '../actions';
import { useBench } from './bench-store';
import { dragFor } from './drag';
import { APPARATUS_LABEL, type ApparatusId, type SceneState } from './scene-state';
import { COIL, FIDUCIAL, HANGER, HOOK, pointerY, POINTER_GAP, RULE, SPOT, STAND, type V3 } from './views';

/**
 * The spring bench: the retort stand at the front edge of the bench, the
 * spiral spring hanging from its clamp in front of the bench (stretching and
 * oscillating by the shared physics), the pointer at its lower end reaching
 * across to the vertical metre rule (Hooke's law) or the fiducial pointer at
 * the hanger's rest position (oscillations), the hanger and its slotted
 * masses, the stack of spare masses, the stopwatch, the box on the floor
 * under the load, the task card and the notebook.
 */

const box = new BoxGeometry(1, 1, 1);
const cyl = new CylinderGeometry(1, 1, 1, 20);
const slotMat = new MeshStandardMaterial({ color: '#9ea4a9', roughness: 0.35, metalness: 0.75 });
const slotMat2 = new MeshStandardMaterial({ color: '#b5bbc0', roughness: 0.35, metalness: 0.75 });
const watchCase = new MeshStandardMaterial({ color: '#1e2a36', roughness: 0.4 });
const watchButton = new MeshStandardMaterial({ color: '#c62828', roughness: 0.4 });
const redMat = new MeshStandardMaterial({ color: '#c62828', roughness: 0.5 });
const cardboard = new MeshStandardMaterial({ color: '#b98b55', roughness: 0.95 });
const plasticine = new MeshStandardMaterial({ color: '#2e7d32', roughness: 0.9 });
/** The unit helix is built this long (m) and scaled to the spring's length. */
const HELIX_L = 0.4;

function B({ p, s, m, r }: { p: V3; s: V3; m: Material; r?: V3 }) {
  return <mesh geometry={box} material={m} position={p} scale={s} rotation={r} />;
}
function C({ p, r, h, m, rot }: { p: V3; r: number; h: number; m: Material; rot?: V3 }) {
  return <mesh geometry={cyl} material={m} position={p} scale={[r, h, r]} rotation={rot} />;
}

/** The metre rule's scale in four 25 cm strips (64 px per cm, a number at every cm, 0 at the top), ticks along the left edge. */
const ruleStrip = (from: number) =>
  canvasTex(`spring-rule-${from}`, 192, 1600, (g, w, h) => {
    g.fillStyle = '#f1d68a';
    g.fillRect(0, 0, w, h);
    const k = h / 25;
    g.fillStyle = '#161616';
    g.strokeStyle = '#161616';
    for (let mm = 0; mm <= 250; mm++) {
      const y = (mm / 10) * k;
      const cm = from + mm / 10;
      const len = mm % 10 === 0 ? 70 : mm % 5 === 0 ? 48 : 30;
      g.lineWidth = mm % 10 === 0 ? 3 : 1.6;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(len, y);
      g.stroke();
      if (mm % 10 === 0 && mm < 250) {
        g.font = `700 ${cm % 10 === 0 ? 46 : 34}px ${FONT}`;
        g.textBaseline = mm === 0 ? 'top' : 'middle';
        g.fillText(String(cm), 84, Math.max(4, y));
      }
    }
  });

function RuleModel({ glow }: { glow?: boolean }) {
  const strips = useMemo(() => [0, 25, 50, 75].map(ruleStrip), []);
  return (
    <group>
      <mesh geometry={box} material={mat.wood()} position={[RULE.w / 2, -0.5, -0.003]} scale={[RULE.w, 1.01, 0.006]} />
      {strips.map((t, i) => (
        <mesh key={i} position={[RULE.w / 2, -(0.125 + i * 0.25), 0.0002]}>
          <planeGeometry args={[RULE.w, 0.25]} />
          <meshStandardMaterial map={t} roughness={0.6} />
        </mesh>
      ))}
      {glow && (
        <mesh position={[RULE.w / 2, -0.5, 0.002]} material={mat.highlight()}>
          <planeGeometry args={[RULE.w + 0.02, 1.03]} />
        </mesh>
      )}
    </group>
  );
}

function StandModel() {
  return (
    <group>
      <B p={[0, 0.008, 0.02]} s={[0.2, 0.016, 0.28]} m={mat.darkMetal()} />
      <C p={[0, STAND.rodH / 2, -0.06]} r={0.0065} h={STAND.rodH} m={mat.steel()} />
      <BlobShadow r={0.18} />
    </group>
  );
}

/** A unit helix (HELIX_L long, hanging down from the origin), shared by every spring. */
function useHelix(turns = COIL.turns) {
  return useMemo(() => {
    const pts: Vector3[] = [];
    const n = turns * 12;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const a = 2 * Math.PI * turns * t;
      pts.push(new Vector3(COIL.r * Math.cos(a), -t * HELIX_L, COIL.r * Math.sin(a)));
    }
    return new TubeGeometry(new CatmullRomCurve3(pts), n, COIL.wire, 5, false);
  }, [turns]);
}
/** The spring as it lies in the cupboard or on the bench: unstretched, on its side. */
function SpringModel({ length = 0.2 }: { length?: number }) {
  const helix = useHelix();
  return (
    <group>
      <mesh geometry={helix} material={mat.steel()} scale={[1, length / HELIX_L, 1]} />
      <C p={[0, 0.006, 0]} r={0.0008} h={0.012} m={mat.steel()} />
      <C p={[0, -length - 0.006, 0]} r={0.0008} h={0.012} m={mat.steel()} />
    </group>
  );
}

/** The mass hanger with `slotted` masses on it, hanging from its hook at the origin. */
function HangerModel({ slotted, glow }: { slotted: number; glow?: boolean }) {
  const H = HANGER;
  const baseY = -H.hook - H.rod;
  return (
    <group>
      <mesh position={[0, -H.hook / 2, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[H.hook / 2.4, 0.0011, 6, 14, Math.PI * 1.5]} />
        <primitive object={mat.steel()} attach="material" />
      </mesh>
      <C p={[0, -H.hook - H.rod / 2, 0]} r={0.0022} h={H.rod} m={mat.steel()} />
      <C p={[0, baseY - H.base / 2, 0]} r={H.r} h={H.base} m={mat.darkMetal()} />
      {Array.from({ length: slotted }, (_, i) => (
        <C key={i} p={[0, baseY + H.slot / 2 + i * H.slot, 0]} r={H.r * 0.95} h={H.slot * 0.92} m={i % 2 ? slotMat : slotMat2} />
      ))}
      {glow && <GlowRing r={0.035} y={baseY - 0.004} />}
    </group>
  );
}

function SlottedStack({ count }: { count: number }) {
  return (
    <group>
      <C p={[0, 0.003, 0]} r={0.026} h={0.006} m={mat.wood()} />
      {Array.from({ length: count }, (_, i) => (
        <C key={i} p={[0, 0.006 + HANGER.slot / 2 + i * HANGER.slot, 0]} r={HANGER.r * 0.95} h={HANGER.slot * 0.92} m={i % 2 ? slotMat : slotMat2} />
      ))}
      <BlobShadow r={0.035} />
    </group>
  );
}

function StopwatchModel({ face }: { face?: React.ReactNode }) {
  return (
    <group>
      <mesh geometry={cyl} material={watchCase} position={[0, 0.012, 0]} scale={[0.035, 0.024, 0.035]} />
      <C p={[0, 0.012, -0.04]} r={0.006} h={0.012} m={mat.steel()} rot={[Math.PI / 2, 0, 0]} />
      <C p={[0, 0.012, -0.047]} r={0.009} h={0.006} m={watchButton} rot={[Math.PI / 2, 0, 0]} />
      {face}
      <BlobShadow r={0.05} />
    </group>
  );
}

/** The stopwatch's display, redrawn when its reading changes (at most 20 times a second). */
function WatchFace({ o }: { o: Spring | null }) {
  const live = useMemo(() => liveTex(256, 128), []);
  const last = useRef('');
  const lastAt = useRef(0);
  const draw = (text: string, running: boolean) =>
    live.redraw((g, w, h) => {
      g.fillStyle = '#c9d7b8';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#16200f';
      g.font = `700 64px ui-monospace, Menlo, Consolas, monospace`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + 4);
      g.font = `600 18px ${FONT}`;
      g.textAlign = 'left';
      g.fillText(running ? '● RUN' : 'STOP', 10, 18);
    });
  useEffect(() => () => live.texture.dispose(), [live]);
  useFrame(() => {
    const t = performance.now();
    if (t - lastAt.current < 50) return;
    lastAt.current = t;
    const w = o?.watchRef.current;
    const e = !o || !w || w.start === null ? 0 : ((w.stop ?? o.now()) - w.start) / 1000;
    const running = !!w && w.start !== null && w.stop === null;
    const text = e.toFixed(2).padStart(5, '0');
    const key = `${text}|${running}`;
    if (key === last.current) return;
    last.current = key;
    draw(text, running);
  });
  if (!last.current) draw('00.00', false);
  return (
    <mesh position={[0, 0.0245, 0.004]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[0.05, 0.025]} />
      <meshBasicMaterial map={live.texture} toneMapped={false} />
    </mesh>
  );
}

/**
 * The spring hanging from its clamp, its lower end at the live reading: the
 * rest reading for the load (and the spring's history) plus the damped
 * oscillation, or the hanger held down by a drag.
 */
function HangingSpring({ o, state, scene, interactive }: { o: Spring; state: PhySpringState; scene: SceneState; interactive: boolean }) {
  const helix = useHelix();
  const coil = useRef<Mesh>(null);
  const low = useRef<Group>(null);
  const fid = useRef<Group>(null);
  const live = useRef({ o, state });
  live.current = { o, state };
  const hookY = HOOK[1] - 0.012;
  useFrame(() => {
    const { o: sp, state: s } = live.current;
    const rest = springReading(sp.v, s.load, s.peak);
    const pull = useBench.getState().pull;
    const R = rest + (pull ?? motionOffset(sp.v, sp.motionRef.current, sp.now()));
    // a hugely overloaded spring (the sandbox) lets the hanger down into the box on the floor
    const y = Math.max(-0.7, pointerY(R));
    const L = Math.max(0.05, hookY - 0.006 - y);
    if (coil.current) coil.current.scale.y = L / HELIX_L;
    if (low.current) low.current.position.y = y;
    if (fid.current) fid.current.position.y = pointerY(rest) - HANGER.hook - HANGER.rod - HANGER.base;
  });
  const slotted = Math.max(0, state.load / SPRING_STEP - 1);
  const osc = scene.task === 'OSC';
  const drag = interactive ? dragFor : undefined;
  return (
    <group>
      <group position={[HOOK[0], hookY, HOOK[2]]}>
        <C p={[0, 0.006, 0]} r={0.0009} h={0.012} m={mat.steel()} />
        <Interactive id="spring" label="Spiral spring" bench labelY={0.02}>
          {(active) => (
            <group>
              <mesh ref={coil} geometry={helix} material={active ? mat.highlight() : mat.steel()} />
              <mesh position={[0, -0.15, 0]}>
                <boxGeometry args={[0.04, 0.3, 0.04]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
            </group>
          )}
        </Interactive>
      </group>
      {/* the spring's lower end: the pointer (Hooke's law) and the hanger */}
      <group ref={low} position={[HOOK[0], pointerY(springReading(o.v, state.load, state.peak)), HOOK[2]]}>
        <C p={[0, 0.003, 0]} r={0.0009} h={0.006} m={mat.steel()} />
        {scene.placed.has('pointer') && (
          <Interactive id="pointer" label="Pointer (its tip moves over the rule)" bench labelY={0.03}>
            {(active) => (
              <group>
                <mesh geometry={box} material={plasticine} position={[0, 0, 0.002]} scale={[0.008, 0.008, 0.008]} />
                {/* the pin: its tip, level with the spring's end, just in front of the rule's scale */}
                <mesh geometry={box} material={active ? mat.highlight() : redMat} position={[(RULE.x + 0.014 - HOOK[0]) / 2, 0, RULE.z + POINTER_GAP - HOOK[2]]} scale={[RULE.x + 0.014 - HOOK[0], 0.0012, 0.0012]} />
              </group>
            )}
          </Interactive>
        )}
        {state.load > 0 && (
          <Interactive id="hanger" label={interactive && osc ? 'Mass hanger — drag down and let go to set it oscillating' : 'Mass hanger and slotted masses'} bench labelY={0.02} drag={drag}>
            {(active) => (
              <group>
                <HangerModel slotted={slotted} glow={active} />
                <mesh position={[0, -0.06, 0]}>
                  <boxGeometry args={[0.06, 0.12, 0.06]} />
                  <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                </mesh>
              </group>
            )}
          </Interactive>
        )}
      </group>
      {/* the metre rule, clamped vertically with 0 at the top */}
      {scene.placed.has('rule') && (
        <group>
          {/* the rule's clamp: a boss on the rod, an arm out to the rule's top */}
          <B p={[(STAND.rod[0] + RULE.x + RULE.w / 2) / 2, RULE.top + 0.012, STAND.rod[2]]} s={[RULE.x + RULE.w / 2 - STAND.rod[0] + 0.02, 0.012, 0.02]} m={mat.darkMetal()} />
          <B p={[RULE.x + RULE.w / 2, RULE.top + 0.012, (STAND.rod[2] + RULE.z) / 2]} s={[0.012, 0.012, RULE.z - STAND.rod[2]]} m={mat.darkMetal()} />
          <group position={[RULE.x, RULE.top, RULE.z]}>
            <Interactive id="rule" label="Metre rule (0 at the top)" bench labelY={0.04}>
              {(active) => <RuleModel glow={active} />}
            </Interactive>
          </group>
        </group>
      )}
      {/* the fiducial pointer on its own rod, at the hanger's rest position */}
      {osc && scene.placed.has('fiducial') && (
        <group position={[FIDUCIAL.x, 0, FIDUCIAL.z]}>
          <C p={[0, 0.48, 0]} r={0.003} h={0.96} m={mat.steel()} />
          <B p={[-0.03, 0.95, -(FIDUCIAL.z - STAND.rod[2]) / 2]} s={[0.01, 0.01, FIDUCIAL.z - STAND.rod[2]]} m={mat.darkMetal()} />
          <group ref={fid} position={[0, 0.3, 0]}>
            <Interactive id="fiducial" label="Fiducial pointer (the rest position)" bench labelY={0.04}>
              {(active) => (
                <group>
                  <B p={[0, 0, 0]} s={[0.014, 0.014, 0.014]} m={mat.darkMetal()} />
                  <mesh geometry={box} material={active ? mat.highlight() : redMat} position={[-(FIDUCIAL.x - HOOK[0] - HANGER.r - 0.004) / 2, 0, 0]} scale={[FIDUCIAL.x - HOOK[0] - HANGER.r - 0.004, 0.0015, 0.003]} />
                </group>
              )}
            </Interactive>
          </group>
        </group>
      )}
    </group>
  );
}

function ExtraModel({ id }: { id: ApparatusId }) {
  if (id === 'stand') return <StandModel />;
  if (id === 'spring')
    return (
      <group rotation={[0, 0, Math.PI / 2]} position={[-0.1, 0.012, 0]}>
        <SpringModel />
      </group>
    );
  if (id === 'rule') return <B p={[0.5, 0.003, 0]} s={[1, 0.006, 0.03]} m={mat.wood()} />;
  if (id === 'pointer')
    return (
      <group>
        <mesh geometry={box} material={plasticine} position={[0, 0.008, 0]} scale={[0.02, 0.016, 0.02]} />
        <mesh geometry={box} material={redMat} position={[0.03, 0.003, 0]} scale={[0.06, 0.0015, 0.0015]} />
      </group>
    );
  if (id === 'hanger') return <group position={[0, HANGER.hook + HANGER.rod + HANGER.base, 0]}><HangerModel slotted={0} /></group>;
  if (id === 'masses') return <SlottedStack count={6} />;
  if (id === 'stopwatch') return <StopwatchModel />;
  if (id === 'fiducial')
    return (
      <group>
        <C p={[0, 0.004, 0]} r={0.02} h={0.008} m={mat.darkMetal()} />
        <mesh geometry={box} material={redMat} position={[0.03, 0.01, 0]} scale={[0.06, 0.002, 0.004]} />
      </group>
    );
  if (id === 'bob') return <mesh material={mat.steel()} position={[0, 0.012, 0]} scale={0.012}><sphereGeometry args={[1, 20, 14]} /></mesh>;
  if (id === 'edge') return <B p={[0, 0.02, 0]} s={[0.08, 0.04, 0.06]} m={mat.wood()} />;
  return null;
}

/** Everything on the student's bench. */
export function Station({ o, state, scene, interactive, card }: { o: Spring; state: PhySpringState; scene: SceneState; interactive: boolean; card: string[] }) {
  const osc = scene.task === 'OSC';
  const onHanger = Math.max(0, state.load / SPRING_STEP - 1);
  const hung = scene.placed.has('spring');
  // Collected but not set out yet: waiting at the back of the bench.
  const waiting = (['stand', 'spring', 'rule', 'pointer', 'fiducial'] as ApparatusId[]).filter((id) => scene.collected.has(id) && !scene.placed.has(id));
  const extras = (['bob', 'edge'] as ApparatusId[]).filter((id) => scene.collected.has(id));
  return (
    <group position={STATION}>
      <Interactive id="mybench" label="Your bench" labelY={0.5}>
        <mesh position={[0, 0.005, 0]}>
          <boxGeometry args={[BENCH.w, 0.01, BENCH.d]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>
      <CardAndBook cardAt={SPOT.card} bookAt={SPOT.book} title={osc ? 'Loaded spring' : 'Hooke’s law'} lines={card} bookTitle={osc ? 'Oscillations of a spring' : 'Hooke’s law'} heads={osc ? ['m/kg', 't₁/s', 't₂/s', 'T/s', 'T²/s²'] : ['m/g', 'W/N', 'R/cm', 'e/cm']} />
      {scene.placed.has('stand') && (
        <>
          <Interactive id="stand" label="Retort stand and clamp" bench position={STAND.base}>
            {(active) => (
              <group>
                <StandModel />
                {active && <GlowRing r={0.16} />}
              </group>
            )}
          </Interactive>
          {/* the clamp arm out over the bench edge, its boss on the rod */}
          <group position={[HOOK[0], HOOK[1] + 0.03, 0]}>
            <C p={[0, 0, (STAND.rod[2] + HOOK[2]) / 2]} r={0.005} h={HOOK[2] - STAND.rod[2]} m={mat.steel()} rot={[Math.PI / 2, 0, 0]} />
            <B p={[0, 0, STAND.rod[2]]} s={[0.03, 0.03, 0.03]} m={mat.darkMetal()} />
            {[-1, 1].map((k) => (
              <B key={k} p={[k * 0.012, -0.014, HOOK[2]]} s={[0.006, 0.03, 0.026]} m={mat.darkMetal()} />
            ))}
          </group>
        </>
      )}
      {hung && <HangingSpring o={o} state={state} scene={scene} interactive={interactive} />}
      {/* a box on the floor under the load, in case a mass falls */}
      {hung && (
        <Interactive id="tray" label="Box under the load (catches a falling mass)" bench position={[HOOK[0], -BENCH.h, HOOK[2] + 0.02]} labelY={0.2}>
          {() => (
            <group>
              <B p={[0, 0.003, 0]} s={[0.3, 0.006, 0.3]} m={cardboard} />
              {[-1, 1].map((k) => (
                <group key={k}>
                  <B p={[k * 0.15, 0.06, 0]} s={[0.006, 0.12, 0.3]} m={cardboard} />
                  <B p={[0, 0.06, k * 0.15]} s={[0.3, 0.12, 0.006]} m={cardboard} />
                </group>
              ))}
            </group>
          )}
        </Interactive>
      )}
      {scene.collected.has('masses') && (
        <Interactive id="masses" label={`Slotted masses (${SPRING_SLOTS - onHanger} spare)`} bench position={SPOT.masses} labelY={0.1}>
          {(active) => (
            <group>
              <SlottedStack count={SPRING_SLOTS - onHanger} />
              {active && <GlowRing r={0.045} />}
            </group>
          )}
        </Interactive>
      )}
      {scene.collected.has('hanger') && state.load === 0 && (
        <Interactive id="hanger-bench" label="Mass hanger (50 g)" bench position={[SPOT.masses[0] - 0.1, 0, SPOT.masses[2]]} labelY={0.12}>
          {(active) => (
            <group>
              <ExtraModel id="hanger" />
              <BlobShadow r={0.03} />
              {active && <GlowRing r={0.04} />}
            </group>
          )}
        </Interactive>
      )}
      {osc && scene.collected.has('stopwatch') && (
        <Interactive id="stopwatch" label="Stopwatch (tap: start / stop)" bench position={SPOT.stopwatch} rotation={[0, -0.3, 0]}>
          {(active) => (
            <group>
              <StopwatchModel face={<WatchFace o={o} />} />
              {active && <GlowRing r={0.06} />}
            </group>
          )}
        </Interactive>
      )}
      {!osc && scene.collected.has('stopwatch') && (
        <Interactive id="stopwatch" label="Stopwatch" bench position={SPOT.stopwatch}>
          {() => <StopwatchModel />}
        </Interactive>
      )}
      {waiting.map((id, k) => (
        <Interactive key={id} id={id} label={APPARATUS_LABEL[id]} bench position={id === 'rule' ? [-0.5, 0, -0.34] : [SPOT.waiting[0] + k * 0.16, 0, SPOT.waiting[2] + (id === 'stand' ? 0.05 : 0.12)]} labelY={0.1}>
          {(active) => (
            <group>
              <ExtraModel id={id} />
              {active && <GlowRing r={0.08} />}
            </group>
          )}
        </Interactive>
      ))}
      {extras.map((id, k) => (
        <Interactive key={id} id={id} label={APPARATUS_LABEL[id]} bench position={[SPOT.extras[0] + k * 0.14, 0, SPOT.extras[2]]} labelY={0.1}>
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
  { id: 'stand', label: APPARATUS_LABEL.stand, shelf: 0, x: -0.6, model: <group scale={0.6}><StandModel /></group>, grip: [[0.14, 0.62, 0.18], [0, 0.3, 0]] },
  { id: 'rule', label: APPARATUS_LABEL.rule, shelf: 0, x: -0.35, model: <group position={[-0.05, 0, 0]} scale={[0.85, 1, 1]}><ExtraModel id="rule" /></group>, grip: [[0.85, 0.04, 0.06], [0.37, 0.01, 0]] },
  { id: 'spring', label: APPARATUS_LABEL.spring, shelf: 1, x: -0.7, model: <ExtraModel id="spring" />, grip: [[0.24, 0.05, 0.05], [0, 0.012, 0]] },
  { id: 'pointer', label: APPARATUS_LABEL.pointer, shelf: 1, x: -0.4, model: <ExtraModel id="pointer" />, grip: [[0.08, 0.05, 0.05], [0.02, 0.01, 0]] },
  { id: 'hanger', label: APPARATUS_LABEL.hanger, shelf: 1, x: -0.22, model: <ExtraModel id="hanger" />, grip: [[0.05, 0.11, 0.05], [0, 0.05, 0]] },
  { id: 'masses', label: APPARATUS_LABEL.masses, shelf: 1, x: -0.05, model: <ExtraModel id="masses" />, grip: [[0.06, 0.06, 0.06], [0, 0.025, 0]] },
  { id: 'stopwatch', label: APPARATUS_LABEL.stopwatch, shelf: 2, x: -0.65, model: <StopwatchModel />, grip: [[0.1, 0.06, 0.1], [0, 0.02, 0]] },
  { id: 'fiducial', label: APPARATUS_LABEL.fiducial, shelf: 2, x: -0.4, model: <ExtraModel id="fiducial" />, grip: [[0.08, 0.04, 0.05], [0.02, 0.01, 0]] },
  { id: 'bob', label: APPARATUS_LABEL.bob, shelf: 2, x: -0.18, model: <ExtraModel id="bob" />, grip: [[0.05, 0.05, 0.05], [0, 0.02, 0]] },
  { id: 'edge', label: APPARATUS_LABEL.edge, shelf: 2, x: 0.05, model: <ExtraModel id="edge" />, grip: [[0.09, 0.06, 0.07], [0, 0.02, 0]] },
];
export function SpringCupboard({ scene }: { scene: SceneState }) {
  return <CupboardItems slots={SLOTS} collected={scene.collected} />;
}
