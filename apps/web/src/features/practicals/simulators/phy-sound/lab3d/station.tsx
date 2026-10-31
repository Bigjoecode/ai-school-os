import { SONO_HANGER, SONO_STEP, SOUND_FORKS, type PhySoundState } from '@aischool/shared';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { BoxGeometry, BufferGeometry, CylinderGeometry, DoubleSide, Float32BufferAttribute, MeshBasicMaterial, MeshStandardMaterial, type Group, type Material, type Mesh } from 'three';
import { BlobShadow, GlowRing } from '../../../lab3d-kit/apparatus';
import { Interactive } from '../../../lab3d-kit/interact';
import { BENCH, STATION } from '../../../lab3d-kit/layout';
import { mat } from '../../../lab3d-kit/materials';
import { CardAndBook, CupboardItems, Rule, type CupboardSlot } from '../../phy-common/lab3d/common';
import { canvasTex, FONT } from '../../phy-common/lab3d/tex';
import { meterLevel, type Sound } from '../actions';
import { dragFor } from './drag';
import { APPARATUS_LABEL, type ApparatusId, type SceneState } from './scene-state';
import { bridgeX, JAR, SONO, SPOT, STAND, TUBE, tubeTopY, type V3 } from './views';

/**
 * The resonance bench. Resonance tube: the tall jar of water on the floor in
 * front of the bench, the glass tube clamped in it from a stand (raised or
 * lowered by the shared state's length), the metre rule along it, the fork
 * held over the mouth while it rings (its prongs shimmer) and rings of sound
 * from the mouth whose brightness follows the loudness. Sonometer: the box
 * with its scale, the fixed and moving bridges, the wire (a blur between the
 * bridges as it vibrates), the paper rider at the middle (it trembles and is
 * thrown off at resonance), the pulley and the hanger with its masses. Both:
 * the set of forks, the rubber pad, the task card and the notebook.
 */

const box = new BoxGeometry(1, 1, 1);
const cyl = new CylinderGeometry(1, 1, 1, 24);
const glassMat = new MeshStandardMaterial({ color: '#dff1fa', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.28, depthWrite: false, side: DoubleSide });
const waterMat = new MeshStandardMaterial({ color: '#3d8fd1', roughness: 0.1, transparent: true, opacity: 0.5, depthWrite: false });
const waterTop = new MeshBasicMaterial({ color: '#2f7fc4', transparent: true, opacity: 0.18, side: DoubleSide, depthWrite: false });
const tubeWater = new MeshStandardMaterial({ color: '#1f78c8', roughness: 0.1, transparent: true, opacity: 0.55, depthWrite: false });
const meniscus = new MeshBasicMaterial({ color: '#0d47a1', transparent: true, opacity: 0.85, depthWrite: false });
const forkMat = new MeshStandardMaterial({ color: '#c3cad1', roughness: 0.25, metalness: 0.9 });
const padMat = new MeshStandardMaterial({ color: '#1f2326', roughness: 0.9 });
const paperMat = new MeshStandardMaterial({ color: '#fafafa', roughness: 0.9, side: DoubleSide });
const wireMat = new MeshStandardMaterial({ color: '#b0b8bf', roughness: 0.3, metalness: 0.9 });
const blurMat = new MeshBasicMaterial({ color: '#9aa6b0', transparent: true, opacity: 0.35, side: DoubleSide, depthWrite: false });
const soundMat = new MeshBasicMaterial({ color: '#ff8a3d', transparent: true, opacity: 0, side: DoubleSide, depthWrite: false });
const slotMat = new MeshStandardMaterial({ color: '#9ea4a9', roughness: 0.35, metalness: 0.75 });
const boxWood = new MeshStandardMaterial({ color: '#c79a62', roughness: 0.7 });

function B({ p, s, m, r }: { p: V3; s: V3; m: Material; r?: V3 }) {
  return <mesh geometry={box} material={m} position={p} scale={s} rotation={r} />;
}
function C({ p, r, h, m, rot }: { p: V3; r: number; h: number; m: Material; rot?: V3 }) {
  return <mesh geometry={cyl} material={m} position={p} scale={[r, h, r]} rotation={rot} />;
}


/** The tube's metre rule in four 25 cm strips (a number at every cm, 0 at the top), ticks along the left edge (next to the tube). */
const tubeRuleStrip = (from: number) =>
  canvasTex(`sound-rule-${from}`, 192, 1600, (g, w, h) => {
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
function TubeRule({ glow }: { glow?: boolean }) {
  const strips = useMemo(() => [0, 25, 50, 75].map(tubeRuleStrip), []);
  const w = 0.028;
  return (
    <group>
      <mesh geometry={box} material={mat.wood()} position={[w / 2, -0.5, -0.003]} scale={[w, 1.01, 0.006]} />
      {strips.map((t, i) => (
        <mesh key={i} position={[w / 2, -(0.125 + i * 0.25), 0.0002]}>
          <planeGeometry args={[w, 0.25]} />
          <meshStandardMaterial map={t} roughness={0.6} />
        </mesh>
      ))}
      {glow && (
        <mesh position={[w / 2, -0.5, 0.002]} material={mat.highlight()}>
          <planeGeometry args={[w + 0.02, 1.03]} />
        </mesh>
      )}
    </group>
  );
}

/** A tuning fork lying along +x from its stem's end (origin), prongs flat in the x–z plane; lower forks are longer. */
export function ForkModel({ f, prong }: { f: number; prong?: React.Ref<Group> }) {
  const L = 0.06 + (0.11 * 256) / f; // prong length (m)
  return (
    <group>
      <C p={[0.03, 0, 0]} r={0.0035} h={0.06} m={forkMat} rot={[0, 0, Math.PI / 2]} />
      <B p={[0.063, 0, 0]} s={[0.008, 0.006, 0.02]} m={forkMat} />
      <group ref={prong}>
        {[-1, 1].map((k) => (
          <B key={k} p={[0.067 + L / 2, 0, k * 0.0075]} s={[L, 0.0055, 0.004]} m={forkMat} />
        ))}
      </group>
    </group>
  );
}

/** Expanding rings of sound (brightness = loudness): at the tube's mouth or above the sonometer box. */
function SoundRings({ o, horizontal }: { o: Sound; horizontal: boolean }) {
  const rings = useRef<(Mesh | null)[]>([]);
  const mats = useMemo(() => [0, 1, 2].map(() => soundMat.clone()), []);
  useFrame(() => {
    const t = o.now();
    const lvl = o.ringing ? meterLevel(o.level(t), t) : 0;
    rings.current.forEach((m, i) => {
      if (!m) return;
      const ph = (((t / 700 + i / 3) % 1) + 1) % 1;
      m.scale.setScalar(0.02 + ph * 0.16);
      mats[i]!.opacity = Math.min(0.85, lvl * 1.1) * (1 - ph);
    });
  });
  return (
    <group rotation={horizontal ? [-Math.PI / 2, 0, 0] : [0, 0, 0]}>
      {mats.map((m, i) => (
        <mesh key={i} ref={(x) => void (rings.current[i] = x)} material={m}>
          <ringGeometry args={[0.92, 1, 40]} />
        </mesh>
      ))}
    </group>
  );
}

/** The fork in the student's hand while it rings: over the tube's mouth, or its stem on the sonometer box. */
function RingingFork({ o, s }: { o: Sound; s: PhySoundState }) {
  const g = useRef<Group>(null);
  const prong = useRef<Group>(null);
  const live = useRef({ o, s });
  live.current = { o, s };
  useFrame(() => {
    const { o: so, s: st } = live.current;
    const on = so.ringing && !!so.struck;
    if (g.current) {
      g.current.visible = on;
      if (st.task === 'SONO') g.current.position.set(Math.min(SONO.x1 - 0.12, bridgeX(st.len) + 0.12), SONO.h, SONO.z + SONO.w / 2 - 0.02);
      else g.current.position.set(JAR.x - 0.16, tubeTopY(st.len) + 0.025, JAR.z - 0.003);
    }
    if (prong.current && on) {
      const a = 0.0012 * Math.exp(-(so.now() - so.struck!.at) / 8000);
      prong.current.scale.z = 1 + Math.sin(so.now() / 3) * a * 40;
    }
  });
  return (
    <group ref={g} visible={false}>
      <Interactive id="fork" label={`Tuning fork (${s.fork ?? ''} Hz), ringing`} bench labelY={0.05}>
        {() => (
          <group rotation={s.task === 'SONO' ? [0, 0, Math.PI / 2] : [0, 0, 0]}>
            <ForkModel f={s.fork ?? 384} prong={prong} />
          </group>
        )}
      </Interactive>
      {s.task === 'SONO' && (
        <group position={[0, 0.2, 0]}>
          <SoundRings o={o} horizontal={false} />
        </group>
      )}
    </group>
  );
}

/** The jar, the tube in it at the state's length, the stand and clamp, the rule on the tube and the sound from the mouth. */
function TubeRig({ o, s, scene, interactive }: { o: Sound; s: PhySoundState; scene: SceneState; interactive: boolean }) {
  const tube = useRef<Group>(null);
  const clamp = useRef<Group>(null);
  const mouth = useRef<Group>(null);
  const live = useRef(s);
  live.current = s;
  useFrame(() => {
    const top = tubeTopY(live.current.len);
    if (tube.current) tube.current.position.y = top;
    if (clamp.current) clamp.current.position.y = top - 0.18;
    if (mouth.current) mouth.current.position.y = top + 0.01;
  });
  const drag = interactive ? dragFor : undefined;
  const wy = JAR.water;
  return (
    <group>
      {/* the jar of water on the floor */}
      <group position={[JAR.x, JAR.floor, JAR.z]}>
        <Interactive id="jar" label="Tall jar of water" bench labelY={JAR.h + 0.02}>
          {() => (
            <group>
              <mesh geometry={cyl} material={glassMat} position={[0, JAR.h / 2, 0]} scale={[JAR.r, JAR.h, JAR.r]} />
              <mesh geometry={cyl} material={waterMat} position={[0, (wy - JAR.floor) / 2, 0]} scale={[JAR.r - 0.003, wy - JAR.floor, JAR.r - 0.003]} />
              <mesh material={waterTop} position={[0, wy - JAR.floor, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[TUBE.r + 0.002, JAR.r - 0.003, 32]} />
              </mesh>
              <C p={[0, 0.01, 0]} r={JAR.r + 0.01} h={0.02} m={mat.darkMetal()} />
              <BlobShadow r={0.12} />
            </group>
          )}
        </Interactive>
      </group>
      {/* the tube: its top at the water level + l; the water inside stands level with the jar's */}
      <group ref={tube} position={[JAR.x, tubeTopY(s.len), JAR.z]}>
        <Interactive id="tube" label={interactive ? 'Resonance tube — drag up or down' : 'Resonance tube'} bench labelY={0.06} drag={drag}>
          {(active) => (
            <group>
              <mesh geometry={cyl} material={active ? mat.highlight() : glassMat} position={[0, -TUBE.length / 2, 0]} scale={[TUBE.r, TUBE.length, TUBE.r]} />
              <mesh position={[0, -0.25, 0]}>
                <boxGeometry args={[0.07, 0.5, 0.07]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
            </group>
          )}
        </Interactive>
        {scene.placed.has('rule') && (
          <group position={[TUBE.r + 0.003, 0, 0.002]}>
            <Interactive id="rule" label="Metre rule (0 at the top of the tube)" bench labelY={0.04}>
              {(active) => <TubeRule glow={active} />}
            </Interactive>
          </group>
        )}
      </group>
      {/* the water inside the tube: fixed at the jar's level */}
      <mesh geometry={cyl} material={tubeWater} position={[JAR.x, (wy + JAR.floor + 0.1) / 2, JAR.z]} scale={[TUBE.r - 0.0015, wy - JAR.floor - 0.1, TUBE.r - 0.0015]} />
      <mesh geometry={cyl} material={meniscus} position={[JAR.x, wy, JAR.z]} scale={[TUBE.r + 0.0004, 0.0012, TUBE.r + 0.0004]} />
      {/* the stand and its clamp on the tube */}
      {scene.placed.has('stand') && (
        <group>
          <group position={[STAND.x, JAR.floor, STAND.z]}>
            <Interactive id="stand" label="Clamp and stand" bench labelY={STAND.rodH + 0.02}>
              {(active) => (
                <group>
                  <B p={[0, 0.01, 0]} s={[0.22, 0.02, 0.3]} m={mat.darkMetal()} />
                  <C p={[0, STAND.rodH / 2, 0]} r={0.008} h={STAND.rodH} m={mat.steel()} />
                  <BlobShadow r={0.2} />
                  {active && <GlowRing r={0.18} />}
                </group>
              )}
            </Interactive>
          </group>
          <group ref={clamp} position={[0, tubeTopY(s.len) - 0.18, 0]}>
            <C p={[(STAND.x + JAR.x) / 2, 0, JAR.z]} r={0.005} h={STAND.x - JAR.x} m={mat.steel()} rot={[0, 0, Math.PI / 2]} />
            <B p={[STAND.x, 0, STAND.z]} s={[0.03, 0.03, 0.03]} m={mat.darkMetal()} />
            {[-1, 1].map((k) => (
              <B key={k} p={[JAR.x, 0, JAR.z + k * (TUBE.r + 0.004)]} s={[0.03, 0.024, 0.006]} m={mat.darkMetal()} />
            ))}
          </group>
        </group>
      )}
      <group ref={mouth} position={[JAR.x, tubeTopY(s.len) + 0.01, JAR.z]}>
        <SoundRings o={o} horizontal />
      </group>
    </group>
  );
}

/** A lens-shaped unit band (length 1 along x from 0, half-height 1): the blur of the vibrating wire. */
function useBlur() {
  return useMemo(() => {
    const g = new BufferGeometry();
    const n = 24;
    const pos: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = i / n;
      const b = (i + 1) / n;
      const ya = Math.sin(Math.PI * a);
      const yb = Math.sin(Math.PI * b);
      pos.push(a, -ya, 0, b, -yb, 0, b, yb, 0, a, -ya, 0, b, yb, 0, a, ya, 0);
    }
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    return g;
  }, []);
}

/** The sonometer: box, scale, bridges, wire, rider, pulley and load. */
function Sonometer({ o, s, interactive }: { o: Sound; s: PhySoundState; interactive: boolean }) {
  const blur = useBlur();
  const bridge = useRef<Group>(null);
  const span = useRef<Group>(null);
  const blurRef = useRef<Mesh>(null);
  const rider = useRef<Group>(null);
  const live = useRef({ o, s });
  live.current = { o, s };
  const wy = SONO.wire;
  useFrame(() => {
    const { o: so, s: st } = live.current;
    const xb = bridgeX(st.len);
    if (bridge.current) bridge.current.position.x = xb;
    if (span.current) {
      span.current.position.x = SONO.fixed;
      span.current.scale.x = xb - SONO.fixed;
    }
    const t = so.now();
    const drive = so.ringing ? so.riderDrive(t) : 0;
    const amp = so.ringing ? Math.max(drive, so.level(t) * 0.4) * 0.004 : 0;
    if (blurRef.current) {
      blurRef.current.visible = amp > 0.0003;
      blurRef.current.scale.set(xb - SONO.fixed, amp, 1);
    }
    if (rider.current) {
      rider.current.position.x = (SONO.fixed + xb) / 2;
      rider.current.position.y = wy + 0.0008 + (drive > 0.2 ? Math.abs(Math.sin(t / 25)) * drive * 0.003 : 0);
    }
  });
  const drag = interactive ? dragFor : undefined;
  const slotted = s.load > 0 ? Math.round((s.load - SONO_HANGER) / SONO_STEP) : 0;
  const len = SONO.x1 - SONO.x0;
  const slack = s.load === 0;
  return (
    <group position={[0, 0, SONO.z]}>
      <Interactive id="sonometer" label="Sonometer" bench position={[SONO.x0, 0, 0]} labelY={0.2}>
        {(active) => (
          <group>
            <mesh geometry={box} material={boxWood} position={[len / 2, SONO.h / 2, 0]} scale={[len, SONO.h, SONO.w]} />
            <mesh position={[len * 0.45, SONO.h + 0.0005, -0.02]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.025, 24]} />
              <meshBasicMaterial color="#3b2a1a" />
            </mesh>
            <BlobShadow r={0.5} opacity={0.6} />
            {active && <GlowRing r={0.3} />}
          </group>
        )}
      </Interactive>
      {/* the scale along the front of the box top, 0 at the fixed bridge */}
      <group position={[SONO.fixed, SONO.h, SONO.w / 2 - 0.016]}>
        <Rule cm={100} width={0.024} />
      </group>
      {/* the pegs and the fixed bridge */}
      <C p={[SONO.x0 + 0.03, SONO.h + 0.012, -0.01]} r={0.005} h={0.024} m={mat.steel()} />
      <B p={[SONO.fixed, SONO.h + (wy - SONO.h) / 2, -0.01]} s={[0.008, wy - SONO.h, SONO.w * 0.7]} m={mat.woodDark()} />
      <C p={[(SONO.x0 + 0.03 + SONO.fixed) / 2, wy - 0.002, -0.01]} r={0.0006} h={SONO.fixed - SONO.x0 - 0.03} m={wireMat} rot={[0, 0, Math.PI / 2 - 0.08]} />
      {/* the moving bridge */}
      <group ref={bridge} position={[bridgeX(s.len), 0, 0]}>
        <Interactive id="bridge" label={interactive ? 'Moving bridge — drag along the wire' : 'Moving bridge'} bench labelY={0.06} drag={drag}>
          {(active) => (
            <group>
              <B p={[0, SONO.h + (wy - SONO.h) / 2, -0.01]} s={[0.008, wy - SONO.h, SONO.w * 0.7]} m={active ? mat.highlight() : mat.wood()} />
              <B p={[0, SONO.h + 0.002, SONO.w / 2 - 0.02]} s={[0.003, 0.004, 0.012]} m={mat.red()} />
              <mesh position={[0, SONO.h + 0.03, 0]}>
                <boxGeometry args={[0.05, 0.06, SONO.w]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
            </group>
          )}
        </Interactive>
      </group>
      {/* the vibrating length: the wire and its blur */}
      <group ref={span} position={[SONO.fixed, wy, -0.01]} scale={[bridgeX(s.len) - SONO.fixed, 1, 1]}>
        <mesh geometry={cyl} material={wireMat} position={[0.5, slack ? -0.003 : 0, 0]} scale={[0.0006, 1, 0.0006]} rotation={[0, 0, Math.PI / 2]} />
      </group>
      <mesh ref={blurRef} geometry={blur} material={blurMat} position={[SONO.fixed, wy, -0.01]} visible={false} />
      {/* the rest of the wire to the pulley, and down to the hanger */}
      <group>
        <WireTo from={bridgeX(s.len)} />
      </group>
      <mesh geometry={cyl} material={mat.metal()} position={[SONO.pulleyX, SONO.pulleyY, -0.01]} scale={[0.026, 0.012, 0.026]} rotation={[Math.PI / 2, 0, 0]} />
      <B p={[SONO.x1 - 0.005, SONO.pulleyY - 0.01, -0.01]} s={[0.05, 0.012, 0.02]} m={mat.darkMetal()} />
      {s.load > 0 ? (
        <group position={[SONO.pulleyX + 0.026, 0, -0.01]}>
          <C p={[0, (SONO.pulleyY - 0.3) / 2, 0]} r={0.0006} h={SONO.pulleyY + 0.3} m={wireMat} />
          <Interactive id="hanger" label={`Hanger and masses (${s.load.toFixed(1)} kg)`} bench position={[0, -0.3, 0]} labelY={0.05}>
            {(active) => (
              <group>
                <C p={[0, -0.05, 0]} r={0.003} h={0.1} m={mat.steel()} />
                <C p={[0, -0.1, 0]} r={0.04} h={0.008} m={mat.darkMetal()} />
                {Array.from({ length: slotted }, (_, i) => (
                  <C key={i} p={[0, -0.093 + i * 0.012, 0]} r={0.038} h={0.011} m={i % 2 ? slotMat : mat.metal()} />
                ))}
                {active && <GlowRing r={0.06} y={-0.1} />}
              </group>
            )}
          </Interactive>
        </group>
      ) : (
        <C p={[SONO.pulleyX + 0.026, SONO.pulleyY - 0.05, -0.01]} r={0.0006} h={0.1} m={wireMat} />
      )}
      {/* the rider at the middle, or thrown off onto the box */}
      {s.rider ? (
        <group ref={rider} position={[(SONO.fixed + bridgeX(s.len)) / 2, wy, -0.01]}>
          <Interactive id="rider" label="Paper rider (on the middle of the wire)" bench labelY={0.03}>
            {() => <Rider />}
          </Interactive>
        </group>
      ) : (
        s.jump && (
          <group position={[(SONO.fixed + bridgeX(s.jump.len)) / 2 + 0.05, SONO.h + 0.001, 0.03]} rotation={[0, 0.6, Math.PI / 2.2]}>
            <Rider />
          </group>
        )
      )}
    </group>
  );
}
function WireTo({ from }: { from: number }) {
  const L = SONO.pulleyX - from;
  return <mesh geometry={cyl} material={wireMat} position={[from + L / 2, SONO.wire + 0.002, -0.01]} scale={[0.0006, L, 0.0006]} rotation={[0, 0, Math.PI / 2]} />;
}
function Rider() {
  return (
    <group>
      {[-1, 1].map((k) => (
        <mesh key={k} material={paperMat} position={[k * 0.0045, 0.004, 0]} rotation={[0, 0, k * 0.75]}>
          <planeGeometry args={[0.012, 0.004]} />
        </mesh>
      ))}
    </group>
  );
}

/** The forks in their wooden block (the one in your hand is missing from it). */
function ForkSet({ inHand }: { inHand: number | null }) {
  return (
    <group>
      <B p={[0, 0.015, 0]} s={[0.36, 0.03, 0.14]} m={mat.wood()} />
      {SOUND_FORKS.map((f, i) =>
        f === inHand ? null : (
          <group key={f} position={[-0.155 + i * 0.044, 0.031, 0.05]} rotation={[0, Math.PI / 2, 0]}>
            <ForkModel f={f} />
          </group>
        ),
      )}
      <BlobShadow r={0.2} />
    </group>
  );
}

function ExtraModel({ id }: { id: ApparatusId }) {
  switch (id) {
    case 'tube':
      return (
        <group>
          <mesh geometry={cyl} material={glassMat} position={[0, 0.02, 0]} scale={[0.018, 0.5, 0.018]} rotation={[0, 0, Math.PI / 2]} />
          <mesh geometry={cyl} material={glassMat} position={[0, 0.1, -0.08]} scale={[0.05, 0.2, 0.05]} />
        </group>
      );
    case 'stand':
      return (
        <group>
          <B p={[0, 0.008, 0]} s={[0.16, 0.016, 0.22]} m={mat.darkMetal()} />
          <C p={[0, 0.25, -0.06]} r={0.0065} h={0.5} m={mat.steel()} />
        </group>
      );
    case 'rule':
      return <B p={[0.5, 0.003, 0]} s={[1, 0.006, 0.03]} m={mat.wood()} />;
    case 'forks':
      return <ForkSet inHand={null} />;
    case 'pad':
      return <B p={[0, 0.008, 0]} s={[0.11, 0.016, 0.08]} m={padMat} />;
    case 'sonometer':
      return <mesh geometry={box} material={boxWood} position={[0.3, 0.03, 0]} scale={[0.6, 0.06, 0.1]} />;
    case 'masses':
      return (
        <group>
          {Array.from({ length: 6 }, (_, i) => (
            <C key={i} p={[0, 0.006 + i * 0.012, 0]} r={0.038} h={0.011} m={i % 2 ? slotMat : mat.metal()} />
          ))}
          <BlobShadow r={0.05} />
        </group>
      );
    case 'rider':
      return (
        <group>
          <B p={[0, 0.002, 0]} s={[0.06, 0.004, 0.04]} m={paperMat} />
          <group position={[0, 0.006, 0]}>
            <Rider />
          </group>
        </group>
      );
    case 'bob':
      return (
        <mesh material={mat.steel()} position={[0, 0.012, 0]} scale={0.012}>
          <sphereGeometry args={[1, 20, 14]} />
        </mesh>
      );
    case 'lens':
      return (
        <mesh material={glassMat} position={[0, 0.03, 0]} scale={[0.03, 0.03, 0.006]}>
          <sphereGeometry args={[1, 20, 14]} />
        </mesh>
      );
  }
  return null;
}

/** Everything on the student's bench. */
export function Station({ o, state, scene, interactive, card }: { o: Sound; state: PhySoundState; scene: SceneState; interactive: boolean; card: string[] }) {
  const sono = scene.task === 'SONO';
  const waiting = (['tube', 'stand', 'rule', 'sonometer'] as ApparatusId[]).filter((id) => scene.collected.has(id) && !scene.placed.has(id));
  const extras = (['bob', 'lens'] as ApparatusId[]).filter((id) => scene.collected.has(id));
  const forkDown = state.fork && !o.ringing;
  return (
    <group position={STATION}>
      <Interactive id="mybench" label="Your bench" labelY={0.5}>
        <mesh position={[0, 0.005, 0]}>
          <boxGeometry args={[BENCH.w, 0.01, BENCH.d]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>
      <CardAndBook cardAt={SPOT.card} bookAt={SPOT.book} title={sono ? 'Sonometer' : 'Resonance tube'} lines={card} bookTitle={sono ? 'The sonometer' : 'Speed of sound'} heads={sono ? ['f/Hz', 'l/m', '1/l /m⁻¹'] : ['f/Hz', '1/f /s', 'l₁/cm', 'l₂/cm']} />
      {!sono && scene.placed.has('tube') && <TubeRig o={o} s={state} scene={scene} interactive={interactive} />}
      {sono && scene.placed.has('sonometer') && <Sonometer o={o} s={state} interactive={interactive} />}
      <RingingFork o={o} s={state} />
      {scene.collected.has('forks') && (
        <Interactive id="forks" label="Set of tuning forks" bench position={SPOT.forks} labelY={0.1}>
          {(active) => (
            <group>
              <ForkSet inHand={state.fork} />
              {active && <GlowRing r={0.2} />}
            </group>
          )}
        </Interactive>
      )}
      {scene.collected.has('pad') && (
        <Interactive id="pad" label="Rubber pad (strike the forks here)" bench position={SPOT.pad} labelY={0.06}>
          {(active) => (
            <group>
              <ExtraModel id="pad" />
              <BlobShadow r={0.07} />
              {forkDown && (
                <group position={[-0.07, 0.022, 0.06]} rotation={[0, 0.3, 0]}>
                  <ForkModel f={state.fork!} />
                </group>
              )}
              {active && <GlowRing r={0.08} />}
            </group>
          )}
        </Interactive>
      )}
      {sono && scene.collected.has('masses') && state.load === 0 && (
        <Interactive id="masses" label="Hanger and slotted masses" bench position={SPOT.masses} labelY={0.1}>
          {(active) => (
            <group>
              <ExtraModel id="masses" />
              {active && <GlowRing r={0.06} />}
            </group>
          )}
        </Interactive>
      )}
      {sono && scene.collected.has('rider') && !state.rider && (
        <Interactive id="rider" label="Paper riders" bench position={[SPOT.masses[0] + 0.18, 0, SPOT.masses[2] + 0.06]} labelY={0.05}>
          {(active) => (
            <group>
              <ExtraModel id="rider" />
              {active && <GlowRing r={0.05} />}
            </group>
          )}
        </Interactive>
      )}
      {waiting.map((id, k) => (
        <Interactive key={id} id={id} label={APPARATUS_LABEL[id]} bench position={id === 'sonometer' ? [-1.2, 0, -0.3] : [SPOT.waiting[0] + k * 0.22, 0, SPOT.waiting[2] + 0.1]} labelY={0.12}>
          {(active) => (
            <group>
              <ExtraModel id={id} />
              {active && <GlowRing r={0.1} />}
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

const SLOTS: CupboardSlot[] = [
  { id: 'tube', label: APPARATUS_LABEL.tube, shelf: 0, x: -0.6, model: <group scale={0.8}><ExtraModel id="tube" /></group>, grip: [[0.45, 0.2, 0.12], [0, 0.08, -0.04]] },
  { id: 'stand', label: APPARATUS_LABEL.stand, shelf: 0, x: -0.2, model: <ExtraModel id="stand" />, grip: [[0.16, 0.5, 0.2], [0, 0.25, 0]] },
  { id: 'rule', label: APPARATUS_LABEL.rule, shelf: 0, x: 0.05, model: <group scale={[0.5, 1, 1]}><ExtraModel id="rule" /></group>, grip: [[0.5, 0.04, 0.06], [0.25, 0.01, 0]] },
  { id: 'sonometer', label: APPARATUS_LABEL.sonometer, shelf: 1, x: -0.75, model: <ExtraModel id="sonometer" />, grip: [[0.6, 0.08, 0.1], [0.3, 0.03, 0]] },
  { id: 'masses', label: APPARATUS_LABEL.masses, shelf: 1, x: 0.05, model: <ExtraModel id="masses" />, grip: [[0.08, 0.08, 0.08], [0, 0.035, 0]] },
  { id: 'forks', label: APPARATUS_LABEL.forks, shelf: 2, x: -0.6, model: <group scale={0.8}><ExtraModel id="forks" /></group>, grip: [[0.3, 0.06, 0.12], [0, 0.02, 0]] },
  { id: 'pad', label: APPARATUS_LABEL.pad, shelf: 2, x: -0.3, model: <ExtraModel id="pad" />, grip: [[0.11, 0.04, 0.08], [0, 0.01, 0]] },
  { id: 'rider', label: APPARATUS_LABEL.rider, shelf: 2, x: -0.12, model: <ExtraModel id="rider" />, grip: [[0.07, 0.03, 0.05], [0, 0.01, 0]] },
  { id: 'bob', label: APPARATUS_LABEL.bob, shelf: 2, x: 0.02, model: <ExtraModel id="bob" />, grip: [[0.05, 0.05, 0.05], [0, 0.02, 0]] },
  { id: 'lens', label: APPARATUS_LABEL.lens, shelf: 2, x: 0.14, model: <ExtraModel id="lens" />, grip: [[0.07, 0.07, 0.04], [0, 0.03, 0]] },
];
export function SoundCupboard({ scene }: { scene: SceneState }) {
  return <CupboardItems slots={SLOTS} collected={scene.collected} />;
}
