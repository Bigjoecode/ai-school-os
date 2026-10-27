import type { PhyPendulumState, PhyPendulumVariant } from '@aischool/shared';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { BoxGeometry, CylinderGeometry, MeshStandardMaterial, SphereGeometry, type Group, type Material, type Mesh } from 'three';
import { BlobShadow, GlowRing } from '../../../lab3d-kit/apparatus';
import { Interactive } from '../../../lab3d-kit/interact';
import { HALF_W, STATION } from '../../../lab3d-kit/layout';
import { mat } from '../../../lab3d-kit/materials';
import { CardAndBook, CupboardItems, LabelledBox, Protractor, Rule, type CupboardSlot } from '../../phy-common/lab3d/common';
import { FONT, liveTex } from '../../phy-common/lab3d/tex';
import { swingAngle, type Pendulum } from '../actions';
import { dragFor } from './drag';
import { bobDrop, CARD, PIVOT, RULE, SPOT, STAND, useBench, type V3 } from './layout';
import { APPARATUS_LABEL, type ApparatusId, type SceneState } from './scene-state';

/**
 * The pendulum bench: the retort stand at the front edge of the bench with the
 * split cork in its clamp, the thread and bob hanging in front of the bench
 * (swinging for real on the pendulum's own period), the protractor behind the
 * cork, the white card with the fiducial line behind the bob, the metre rule
 * beside the thread, the stopwatch, and the open window that makes a draught.
 */

const box = new BoxGeometry(1, 1, 1);
const cyl = new CylinderGeometry(1, 1, 1, 18);
const sphere = new SphereGeometry(1, 24, 18);
const bobMat = new MeshStandardMaterial({ color: '#9aa3ab', roughness: 0.25, metalness: 0.9 });
const threadMat = new MeshStandardMaterial({ color: '#f2eee2', roughness: 0.8 });
const watchCase = new MeshStandardMaterial({ color: '#1e2a36', roughness: 0.4 });
const watchButton = new MeshStandardMaterial({ color: '#c62828', roughness: 0.4 });
const curtainMat = new MeshStandardMaterial({ color: '#2f6f8f', roughness: 0.9 });
const paneMat = new MeshStandardMaterial({ color: '#dfeef3', roughness: 0.05, transparent: true, opacity: 0.3, depthWrite: false });
const cardMat = new MeshStandardMaterial({ color: '#ece6d4', roughness: 0.95 });
const streamerMat = new MeshStandardMaterial({ color: '#ff7043', roughness: 0.8 });

function B({ p, s, m, r }: { p: V3; s: V3; m: Material; r?: V3 }) {
  return <mesh geometry={box} material={m} position={p} scale={s} rotation={r} />;
}
function C({ p, r, h, m, rot }: { p: V3; r: number; h: number; m: Material; rot?: V3 }) {
  return <mesh geometry={cyl} material={m} position={p} scale={[r, h, r]} rotation={rot} />;
}

/** Live stand + swing data the frame loop reads. */
export interface Live {
  p: Pendulum;
  v: PhyPendulumVariant;
  s: PhyPendulumState;
}

// ------------------------------------------------------------------ the apparatus models (also used in the cupboard)
function StandModel() {
  return (
    <group>
      <B p={[0, 0.008, 0.02]} s={[0.2, 0.016, 0.28]} m={mat.darkMetal()} />
      <C p={[0, STAND.rodH / 2, -0.06]} r={0.0065} h={STAND.rodH} m={mat.steel()} />
      <BlobShadow r={0.18} />
    </group>
  );
}
function CorkModel() {
  return (
    <group>
      {[-1, 1].map((s) => (
        <B key={s} p={[s * 0.007, 0.016, 0]} s={[0.012, 0.032, 0.028]} m={mat.cork()} />
      ))}
    </group>
  );
}
function BobModel({ r }: { r: number }) {
  return (
    <group>
      <mesh geometry={sphere} material={bobMat} position={[0, r, 0]} scale={r} />
      <mesh geometry={cyl} material={threadMat} position={[0.04, 0.004, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.003, 0.08, 0.003]} />
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

/** The stopwatch's display, redrawn when its reading changes. */
function WatchFace({ p, lab }: { p: Pendulum | null; lab: boolean }) {
  const live = useMemo(() => liveTex(256, 128), []);
  const last = useRef('');
  const draw = (text: string, running: boolean, count: string) => {
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
      if (count) {
        g.textAlign = 'right';
        g.fillText(count, w - 10, 18);
      }
    });
  };
  useEffect(() => () => live.texture.dispose(), [live]);
  const lastAt = useRef(0);
  useFrame(() => {
    // at most 20 redraws a second (the display reads to 0.01 s, as a real one does, but nobody can see faster)
    const t = performance.now();
    if (t - lastAt.current < 50) return;
    lastAt.current = t;
    const e = p ? p.elapsed() : 0;
    const running = !!p && p.watchRef.current.start !== null && p.watchRef.current.stop === null;
    const text = e.toFixed(2).padStart(5, '0');
    const key = `${text}|${running}`;
    if (key === last.current) return;
    last.current = key;
    draw(text, running, '');
  });
  if (!last.current) draw('00.00', false, '');
  void lab;
  return (
    <mesh position={[0, 0.0245, 0.004]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[0.05, 0.025]} />
      <meshBasicMaterial map={live.texture} toneMapped={false} />
    </mesh>
  );
}

// ------------------------------------------------------------------ the pendulum
function Pendulum({ live, scene, interactive }: { live: Live; scene: SceneState; interactive: boolean }) {
  const swingG = useRef<Group>(null);
  const thread = useRef<Mesh>(null);
  const bob = useRef<Group>(null);
  const rule = useRef<Group>(null);
  const streamer = useRef<Mesh>(null);
  const liveRef = useRef(live);
  liveRef.current = live;
  const r = live.v.bobRadius / 100;
  const ruleAt = useRef<number>(RULE.x);
  useFrame(({ clock }, dt) => {
    const { p, s } = liveRef.current;
    const sw = p.swingRef.current;
    const pull = useBench.getState().pull;
    const thetaDeg = pull ?? swingAngle(sw, p.now());
    const L = bobDrop(sw?.thread ?? s.thread, live.v.bobRadius);
    const th = (thetaDeg * Math.PI) / 180;
    // a draught (window open): the swing wobbles a little out of its plane
    const draught = !s.shielded && sw ? Math.sin(clock.elapsedTime * 1.7) * 0.06 + Math.sin(clock.elapsedTime * 4.1) * 0.02 : 0;
    if (swingG.current) {
      swingG.current.rotation.z = th;
      swingG.current.rotation.x = draught * 0.15;
    }
    const tl = L - r;
    if (thread.current) {
      thread.current.scale.set(0.0009, tl, 0.0009);
      thread.current.position.set(0, -tl / 2, 0);
    }
    if (bob.current) bob.current.position.set(0, -L, 0);
    // the rule stands beside the thread for measuring, and is moved aside while the bob swings
    const want = sw || pull !== null ? RULE.aside : RULE.x;
    ruleAt.current += (want - ruleAt.current) * Math.min(1, dt * 6);
    if (rule.current) rule.current.position.x = ruleAt.current;
    if (streamer.current) streamer.current.rotation.x = s.shielded ? 0.02 : 0.5 + Math.sin(clock.elapsedTime * 6) * 0.35;
  });
  const drag = interactive ? dragFor : undefined;
  return (
    <group>
      {/* the clamp arm out over the bench edge, the boss on the rod, the split cork in the jaws */}
      <group position={[PIVOT[0], PIVOT[1] + 0.03, 0]}>
        <C p={[0, 0, (STAND.rod[2] + PIVOT[2]) / 2]} r={0.005} h={PIVOT[2] - STAND.rod[2]} m={mat.steel()} rot={[Math.PI / 2, 0, 0]} />
        <B p={[0, 0, STAND.rod[2]]} s={[0.03, 0.03, 0.03]} m={mat.darkMetal()} />
        {[-1, 1].map((k) => (
          <B key={k} p={[k * 0.017, -0.012, PIVOT[2]]} s={[0.006, 0.04, 0.034]} m={mat.darkMetal()} />
        ))}
      </group>
      {/* a paper streamer on the clamp shows the draught */}
      <mesh ref={streamer} position={[PIVOT[0] - 0.05, PIVOT[1] + 0.03, PIVOT[2] - 0.05]}>
        <boxGeometry args={[0.012, 0.0005, 0.06]} />
        <primitive object={streamerMat} attach="material" />
      </mesh>
      <Interactive id="cork" label="Split cork (drag up or down: thread length)" bench position={[PIVOT[0], PIVOT[1] + 0.015, PIVOT[2]]} drag={drag}>
        {(active) => (
          <group>
            {[-1, 1].map((s) => (
              <B key={s} p={[s * 0.0065, 0, 0]} s={[0.012, 0.032, 0.026]} m={mat.cork()} />
            ))}
            <mesh>
              <boxGeometry args={[0.07, 0.07, 0.05]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            {active && <GlowRing r={0.04} y={-0.016} />}
          </group>
        )}
      </Interactive>
      {scene.collected.has('protractor') && (
        <Interactive id="protractor" label="Protractor (the angle of the thread)" bench position={[PIVOT[0], PIVOT[1], PIVOT[2] - 0.008]}>
          {(active) => <Protractor r={0.085} down glow={active} />}
        </Interactive>
      )}
      {/* the thread and the bob, swinging about the pivot */}
      <group position={PIVOT}>
        <group ref={swingG}>
          <mesh ref={thread} geometry={cyl} material={threadMat} />
          <group ref={bob}>
            <Interactive id="bob" label="Bob (drag sideways to displace, let go to release)" bench drag={drag}>
              {(active) => (
                <group>
                  <mesh geometry={sphere} material={bobMat} scale={r} />
                  <C p={[0, r - 0.001, 0]} r={0.0022} h={0.003} m={mat.steel()} />
                  <mesh>
                    <sphereGeometry args={[Math.max(0.03, r * 2), 10, 8]} />
                    <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                  </mesh>
                  {active && (
                    <mesh scale={r * 1.6} geometry={sphere} material={mat.highlight()} />
                  )}
                </group>
              )}
            </Interactive>
          </group>
        </group>
      </group>
      {/* the fiducial card behind the bob */}
      <Interactive id="fiducial" label="Fiducial mark (the mean position)" bench position={[CARD.x, 0, CARD.z]}>
        {(active) => (
          <group>
            <B p={[0, (CARD.top + CARD.bottom) / 2, 0]} s={[CARD.w, CARD.top - CARD.bottom, 0.003]} m={cardMat} />
            <B p={[0, (CARD.top + CARD.bottom) / 2, 0.0022]} s={[0.003, CARD.top - CARD.bottom - 0.02, 0.0015]} m={mat.black()} />
            <B p={[0, CARD.top + 0.01, -0.01]} s={[0.02, 0.03, 0.02]} m={mat.darkMetal()} />
            {active && (
              <mesh position={[0, (CARD.top + CARD.bottom) / 2, 0.004]} material={mat.highlight()}>
                <planeGeometry args={[CARD.w + 0.02, CARD.top - CARD.bottom + 0.02]} />
              </mesh>
            )}
          </group>
        )}
      </Interactive>
      {scene.collected.has('rule') && (
        <group ref={rule} position={[RULE.x, PIVOT[1], RULE.z]}>
          <Interactive id="rule" label="Metre rule (zero at the point of suspension)" bench>
            {(active) => <Rule cm={100} vertical width={0.03} glow={active} />}
          </Interactive>
        </group>
      )}
    </group>
  );
}

// ------------------------------------------------------------------ the bench
export function Station({ live, scene, interactive }: { live: Live; scene: SceneState; interactive: boolean }) {
  const extras = (['spring', 'masses', 'prism'] as ApparatusId[]).filter((id) => scene.collected.has(id));
  const lab = true;
  return (
    <group position={STATION}>
      <CardAndBook
        cardAt={SPOT.card}
        bookAt={SPOT.book}
        title="Pendulum"
        lines={[`Bob diameter: ${live.v.bobDiameter.toFixed(1)} cm.`, `Thread to top of bob: ${live.v.suggested.join(', ')} cm.`, 'Time 20 oscillations each time. Plot T² against l; g = 4π²/slope.']}
        bookTitle="Simple pendulum"
        heads={['l/cm', 't/s', 'T/s', 'T²/s²']}
      />
      {scene.collected.has('stand') && (
        <Interactive id="stand" label="Retort stand and clamp" bench position={STAND.base}>
          {(active) => (
            <group>
              <StandModel />
              {active && <GlowRing r={0.16} />}
            </group>
          )}
        </Interactive>
      )}
      {scene.hung && <Pendulum live={live} scene={scene} interactive={interactive} />}
      {!scene.hung && scene.collected.has('cork') && (
        <group position={[0.2, 0, 0.05]}>
          <CorkModel />
        </group>
      )}
      {!scene.hung && scene.collected.has('bob') && (
        <group position={[0.05, 0, 0.12]}>
          <BobModel r={live.v.bobRadius / 100} />
        </group>
      )}
      {!scene.hung && scene.collected.has('rule') && (
        <group position={[-0.5, 0, -0.32]}>
          <Rule cm={100} />
        </group>
      )}
      {!scene.hung && scene.collected.has('protractor') && (
        <group position={[0.3, 0.002, -0.1]} rotation={[-Math.PI / 2, 0, 0]}>
          <Protractor r={0.07} down={false} />
        </group>
      )}
      {scene.collected.has('stopwatch') && (
        <Interactive id="stopwatch" label="Stopwatch (tap: start / stop)" bench position={SPOT.stopwatch} rotation={[0, -0.3, 0]}>
          {(active) => (
            <group>
              <StopwatchModel face={<WatchFace p={live.p} lab={lab} />} />
              {active && <GlowRing r={0.06} />}
            </group>
          )}
        </Interactive>
      )}
      {extras.map((id, k) => (
        <group key={id} position={[SPOT.extras[0] + k * 0.14, 0, SPOT.extras[2]]}>
          <ExtraModel id={id} />
        </group>
      ))}
    </group>
  );
}

function ExtraModel({ id }: { id: ApparatusId }) {
  if (id === 'spring')
    return (
      <group>
        {Array.from({ length: 12 }, (_, i) => (
          <mesh key={i} position={[0, 0.01 + i * 0.008, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.015, 0.0015, 6, 16]} />
            <primitive object={mat.steel()} attach="material" />
          </mesh>
        ))}
      </group>
    );
  if (id === 'masses')
    return (
      <group>
        {[0, 1, 2, 3].map((i) => (
          <C key={i} p={[0, 0.006 + i * 0.012, 0]} r={0.025} h={0.011} m={mat.metal()} />
        ))}
        <C p={[0, 0.05, 0]} r={0.003} h={0.1} m={mat.steel()} />
      </group>
    );
  return (
    <mesh position={[0, 0.025, 0]} rotation={[0, 0, 0]}>
      <cylinderGeometry args={[0.035, 0.035, 0.05, 3]} />
      <primitive object={mat.glass()} attach="material" />
    </mesh>
  );
}

/** The west window nearest the bench: open (a draught, the fans running) or shut. */
export function DraughtWindow({ open }: { open: boolean }) {
  const left = useRef<Group>(null);
  const right = useRef<Group>(null);
  const curtain = useRef<Group>(null);
  useFrame(({ clock }, dt) => {
    const want = open ? 0.62 : 0;
    for (const [g, s] of [
      [left.current, -1],
      [right.current, 1],
    ] as const)
      if (g) g.position.z += (s * want - g.position.z) * Math.min(1, dt * 4);
    if (curtain.current) curtain.current.rotation.z = open ? -0.25 - Math.sin(clock.elapsedTime * 2.3) * 0.12 : 0;
  });
  const x = -HALF_W + 0.07;
  return (
    <Interactive id="window" label={open ? 'Window (open: a draught)' : 'Window (closed)'} labelY={0.95} position={[x, 1.72, 0]}>
      <group>
        <mesh>
          <boxGeometry args={[0.05, 1.5, 1.8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        {/* sliding glass panes on the inside of the louvres */}
        <group ref={left} position={[0, 0, 0]}>
          <B p={[0.02, 0, -0.42]} s={[0.012, 1.42, 0.84]} m={paneMat} />
          <B p={[0.02, 0, -0.84]} s={[0.03, 1.44, 0.03]} m={mat.windowFrame()} />
        </group>
        <group ref={right} position={[0, 0, 0]}>
          <B p={[0.035, 0, 0.42]} s={[0.012, 1.42, 0.84]} m={paneMat} />
          <B p={[0.035, 0, 0.84]} s={[0.03, 1.44, 0.03]} m={mat.windowFrame()} />
        </group>
        <B p={[0.03, 0.8, 0]} s={[0.04, 0.04, 2.0]} m={mat.windowFrame()} />
        {/* the curtain at the side lifts in the draught */}
        <group ref={curtain} position={[0.08, 0.78, 1.0]}>
          <B p={[0, -0.7, 0]} s={[0.01, 1.4, 0.36]} m={curtainMat} />
        </group>
      </group>
    </Interactive>
  );
}

// ------------------------------------------------------------------ the cupboard
const SLOTS: CupboardSlot[] = [
  { id: 'stand', label: APPARATUS_LABEL.stand, shelf: 0, x: 0.55, model: <group rotation={[0, 0, Math.PI / 2]} position={[0.5, 0.1, 0]}><StandModel /></group>, grip: [[1.0, 0.2, 0.3], [0, 0.1, 0]] },
  { id: 'rule', label: APPARATUS_LABEL.rule, shelf: 0, x: -1.0, z: 0.1, model: <Rule cm={100} />, grip: [[1.0, 0.06, 0.06], [0.5, 0.02, 0]] },
  { id: 'prism', label: APPARATUS_LABEL.prism, shelf: 0, x: -0.25, model: <ExtraModel id="prism" /> },
  { id: 'cork', label: APPARATUS_LABEL.cork, shelf: 1, x: -0.8, model: <CorkModel />, grip: [[0.08, 0.08, 0.08], [0, 0.03, 0]] },
  { id: 'bob', label: APPARATUS_LABEL.bob, shelf: 1, x: -0.45, model: <BobModel r={0.012} />, grip: [[0.12, 0.08, 0.08], [0.02, 0.03, 0]] },
  { id: 'stopwatch', label: APPARATUS_LABEL.stopwatch, shelf: 1, x: -0.1, model: <StopwatchModel />, grip: [[0.1, 0.08, 0.1], [0, 0.03, 0]] },
  { id: 'spring', label: APPARATUS_LABEL.spring, shelf: 1, x: 0.3, model: <ExtraModel id="spring" /> },
  { id: 'protractor', label: APPARATUS_LABEL.protractor, shelf: 2, x: -0.6, model: <group position={[0, 0.06, 0]}><Protractor r={0.06} down={false} /></group>, grip: [[0.14, 0.1, 0.04], [0, 0.04, 0]] },
  { id: 'masses', label: APPARATUS_LABEL.masses, shelf: 2, x: 0.2, model: <ExtraModel id="masses" /> },
];
export function Cupboard({ scene }: { scene: SceneState }) {
  return (
    <group>
      <CupboardItems slots={SLOTS} collected={scene.collected} />
      {/* spare stock (one of each is enough) */}
      <group position={[0, 0, 0]}>
        {[0.6, 0.85].map((x) => (
          <group key={x} position={[HALF_W - 0.3 - 0.02, 1.5, 1.6 + x - 0.3]}>
            <LabelledBox s={[0.16, 0.12, 0.2]} />
          </group>
        ))}
      </group>
    </group>
  );
}
