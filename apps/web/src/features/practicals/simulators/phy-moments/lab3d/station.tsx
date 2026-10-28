import { MOMENTS_HANG, type MomentsTask, type PhyMomentsState, type PhyMomentsVariant } from '@aischool/shared';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { BoxGeometry, CylinderGeometry, MeshStandardMaterial, TorusGeometry, type Group } from 'three';
import { BlobShadow, GlowRing } from '../../../lab3d-kit/apparatus';
import { Interactive } from '../../../lab3d-kit/interact';
import { BENCH, STATION } from '../../../lab3d-kit/layout';
import { mat } from '../../../lab3d-kit/materials';
import { play } from '../../../lab3d-kit/sound';
import { CardAndBook, CupboardItems, type CupboardSlot } from '../../phy-common/lab3d/common';
import { canvasTex, FONT } from '../../phy-common/lab3d/tex';
import { loadOf, Tilt } from '../actions';
import { useBench } from './bench-store';
import { APPARATUS_LABEL, knownId, type ApparatusId, type SceneState } from './scene-state';
import { EDGE_TOP, EDGE_X, markX, RULE_T, RULE_W, RULE_Z, SPOT } from './views';

const box = new BoxGeometry(1, 1, 1);
const cyl = new CylinderGeometry(1, 1, 1, 24);
const prism = new CylinderGeometry(1, 1, 1, 3);
const loop = new TorusGeometry(1, 0.12, 6, 18);
const iron = new MeshStandardMaterial({ color: '#8f969c', roughness: 0.35, metalness: 0.8 });
const brass = new MeshStandardMaterial({ color: '#b8893a', roughness: 0.3, metalness: 0.85 });
const threadMat = new MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.9 });
const redMat = new MeshStandardMaterial({ color: '#c62828', roughness: 0.5 });
const THREAD = MOMENTS_HANG.thread / 100;
const BODY = MOMENTS_HANG.body / 100;

/** The metre rule's scale in four 25 cm strips (64 px per cm; a number at every cm so a mark can be read at eye level). */
const ruleStrip = (from: number) =>
  canvasTex(`moments-rule-${from}`, 1600, 192, (g, w, h) => {
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
const labelTex = (text: string, bg: string, fg = '#111') =>
  canvasTex(`moments-label-${text}`, 128, 64, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = fg;
    g.font = `800 40px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });

/** The rule itself, its 0 cm end at the origin, lying along +x with its bottom face at y = 0. */
function RuleModel({ glow }: { glow?: boolean }) {
  const strips = useMemo(() => [0, 25, 50, 75].map(ruleStrip), []);
  return (
    <group>
      <mesh geometry={box} material={mat.wood()} position={[0.5, RULE_T / 2, 0]} scale={[1.01, RULE_T, RULE_W]} />
      {strips.map((t, i) => (
        <mesh key={i} position={[0.125 + i * 0.25, RULE_T + 0.0002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.25, RULE_W]} />
          <meshStandardMaterial map={t} roughness={0.6} />
        </mesh>
      ))}
      {glow && (
        <mesh position={[0.5, RULE_T + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mat.highlight()}>
          <planeGeometry args={[1.03, RULE_W + 0.02]} />
        </mesh>
      )}
    </group>
  );
}

/** The knife edge: a hardwood wedge, edge up along z, on a wooden block; its edge at EDGE_TOP. */
function EdgeModel({ glow }: { glow?: boolean }) {
  const wedgeH = 0.035;
  return (
    <group>
      <mesh geometry={box} material={mat.woodDark()} position={[0, (EDGE_TOP - wedgeH) / 2, 0]} scale={[0.09, EDGE_TOP - wedgeH, 0.07]} />
      {/* a triangular prism with one edge up: radius r gives height 1.5 r */}
      <mesh geometry={prism} material={mat.wood()} position={[0, EDGE_TOP - wedgeH / 3, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[wedgeH / 1.5, 0.07, wedgeH / 1.5]} />
      <BlobShadow r={0.07} />
      {glow && <GlowRing r={0.08} />}
    </group>
  );
}

/** A slotted mass on its hanger (`grams` 50 or 100), hanging from the origin by its thread. */
function KnownMass({ grams, thread = true }: { grams: 50 | 100; thread?: boolean }) {
  const label = useMemo(() => labelTex(`${grams} g`, '#cfd8dc'), [grams]);
  const h = grams === 100 ? BODY : BODY * 0.75;
  const r = grams === 100 ? 0.016 : 0.013;
  const top = thread ? -THREAD : 0;
  return (
    <group>
      {thread && <mesh geometry={cyl} material={threadMat} position={[0, -THREAD / 2, 0]} scale={[0.0006, THREAD, 0.0006]} />}
      <mesh geometry={cyl} material={iron} position={[0, top - 0.004, 0]} scale={[0.0015, 0.008, 0.0015]} />
      <mesh geometry={cyl} material={iron} position={[0, top - 0.008 - h / 2, 0]} scale={[r, h, r]} />
      <mesh position={[0, top - 0.008 - h / 2, r + 0.0005]}>
        <planeGeometry args={[r * 1.6, r * 0.8]} />
        <meshBasicMaterial map={label} toneMapped={false} />
      </mesh>
    </group>
  );
}
/** The unknown mass M: a brass cylinder with a hook. */
function UnknownMass({ thread = true }: { thread?: boolean }) {
  const label = useMemo(() => labelTex('M', '#f3e2b3'), []);
  const top = thread ? -THREAD : 0;
  return (
    <group>
      {thread && <mesh geometry={cyl} material={threadMat} position={[0, -THREAD / 2, 0]} scale={[0.0006, THREAD, 0.0006]} />}
      <mesh geometry={loop} material={brass} position={[0, top - 0.004, 0]} scale={0.004} />
      <mesh geometry={cyl} material={brass} position={[0, top - 0.008 - BODY * 0.4, 0]} scale={[0.012, BODY * 0.8, 0.012]} />
      <mesh position={[0, top - 0.008 - BODY * 0.4, 0.0125]}>
        <planeGeometry args={[0.014, 0.01]} />
        <meshBasicMaterial map={label} toneMapped={false} />
      </mesh>
    </group>
  );
}
/** The thread loop round the rule (drawn at the origin, around a level rule). */
function Loop() {
  return <mesh geometry={loop} material={threadMat} rotation={[0, Math.PI / 2, 0]} position={[0, -RULE_T / 2, 0]} scale={[RULE_W / 2 + 0.0015, RULE_T / 2 + 0.0012, 0.006]} />;
}

/** A reference pointer on a small stand: its red tip at the height of the level rule's end. */
function Pointer({ side }: { side: 1 | -1 }) {
  return (
    <group>
      <mesh geometry={box} material={mat.darkMetal()} position={[0, 0.004, 0]} scale={[0.05, 0.008, 0.05]} />
      <mesh geometry={cyl} material={mat.metal()} position={[0, (EDGE_TOP + 0.03) / 2, 0]} scale={[0.003, EDGE_TOP + 0.03, 0.003]} />
      <mesh geometry={box} material={redMat} position={[-side * 0.012, EDGE_TOP + RULE_T / 2, 0]} scale={[0.024, 0.0015, 0.004]} />
    </group>
  );
}

/** Glides a group to its x (the rule's ends and the waiting apparatus). */
function Glide({ x, y = 0, z, children }: { x: number; y?: number; z: number; children: React.ReactNode }) {
  const ref = useRef<Group>(null);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const k = Math.min(1, dt * 8);
    g.position.x += (x - g.position.x) * k;
    g.position.y += (y - g.position.y) * k;
    g.position.z += (z - g.position.z) * k;
  });
  return (
    <group ref={ref} position={[x, y, z]}>
      {children}
    </group>
  );
}

/**
 * The balance: the knife edge, the rule resting on it at its pivot mark (it
 * tips by the shared physics, released level after every change), the thread
 * loops and the hanging masses (they hang straight down from the loops).
 */
function Balance({ v, state, scene, interactive }: { v: PhyMomentsVariant; state: PhyMomentsState; scene: SceneState; interactive: boolean }) {
  const task: MomentsTask = state.task ?? 'MOMENTS';
  const release = useBench((b) => b.release);
  const tilt = useRef(new Tilt());
  const ruleRef = useRef<Group>(null);
  const knownRef = useRef<Group>(null);
  const otherRef = useRef<Group>(null);
  const load = loadOf(state);
  const lastRelease = useRef(release);
  const onEdge = scene.placed.has('rule') && scene.placed.has('edge');
  useFrame((_, dt) => {
    const t = tilt.current;
    const forced = lastRelease.current !== release;
    lastRelease.current = release;
    if (onEdge) {
      t.sync(v, task, load, forced);
      const was = t.resting;
      t.step(v, task, load, dt);
      if (!was && t.resting && Math.abs(t.th) > 0.001) play('clink');
    } else t.th = 0;
    const phi = -t.th;
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    if (ruleRef.current) ruleRef.current.rotation.z = phi;
    const place = (g: Group | null, at: number | null) => {
      if (!g) return;
      g.visible = at !== null && onEdge;
      if (at === null) return;
      const dx = (at - state.pivot) / 100;
      g.position.set(EDGE_X + dx * c - RULE_T * s, EDGE_TOP + dx * s + RULE_T * c, RULE_Z);
      g.rotation.z = 0;
    };
    place(knownRef.current, state.known);
    place(otherRef.current, task === 'MOMENTS' ? state.other : null);
    const loopK = knownRef.current?.children[0];
    const loopO = otherRef.current?.children[0];
    if (loopK) loopK.rotation.z = phi;
    if (loopO) loopO.rotation.z = phi;
  });
  const drag = (kind: string) => (interactive && onEdge ? () => kind : undefined);
  const known = knownId(task);
  const ruleWaiting = !onEdge;
  return (
    <group>
      {scene.collected.has('edge') && (
        <group position={scene.placed.has('edge') ? [EDGE_X, 0, RULE_Z] : [SPOT.waiting[0], 0, SPOT.waiting[2]]}>
          <Interactive id="edge" label="Knife edge" bench labelY={0.16}>
            {(active) => <EdgeModel glow={active} />}
          </Interactive>
        </group>
      )}
      {scene.collected.has('rule') &&
        (ruleWaiting ? (
          <group position={[-0.5, 0, -0.33]}>
            <Interactive id="rule" label="Metre rule" bench labelY={0.04}>
              {(active) => <RuleModel glow={active} />}
            </Interactive>
          </group>
        ) : (
          <group ref={ruleRef} position={[EDGE_X, EDGE_TOP, RULE_Z]}>
            <group position={[-state.pivot / 100, 0, 0]}>
              <Interactive id="rule" label={interactive ? 'Metre rule — drag it along the knife edge' : 'Metre rule'} bench labelY={0.05} drag={drag('slide-rule')}>
                {(active) => (
                  <group>
                    <RuleModel glow={active} />
                    {/* a wide invisible grip so the rule is easy to pick */}
                    <mesh geometry={box} position={[0.5, RULE_T / 2, 0]} scale={[1.0, 0.02, 0.05]}>
                      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                    </mesh>
                  </group>
                )}
              </Interactive>
            </group>
          </group>
        ))}
      {onEdge && (
        <>
          <Glide x={markX(0, state.pivot) - 0.03} z={RULE_Z}>
            <Interactive id="pointer" label="Reference pointer (level mark)" bench labelY={0.16}>
              {() => <Pointer side={-1} />}
            </Interactive>
          </Glide>
          <Glide x={markX(100, state.pivot) + 0.03} z={RULE_Z}>
            <Interactive id="pointer-r" label="Reference pointer (level mark)" bench labelY={0.16}>
              {() => <Pointer side={1} />}
            </Interactive>
          </Glide>
        </>
      )}
      <group ref={knownRef} visible={false}>
        <Loop />
        <Interactive id="known" label={interactive ? `${APPARATUS_LABEL[known]} — drag its loop along the rule` : APPARATUS_LABEL[known]} bench labelY={0.02} drag={drag('slide-known')}>
          {(active) => (
            <group>
              <KnownMass grams={task === 'MASS' ? 100 : 50} />
              <mesh geometry={box} position={[0, -0.04, 0]} scale={[0.04, 0.09, 0.04]}>
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
              {active && <GlowRing r={0.03} y={-THREAD - BODY - 0.01} />}
            </group>
          )}
        </Interactive>
      </group>
      <group ref={otherRef} visible={false}>
        <Loop />
        <Interactive id="other" label={interactive ? 'Unknown mass M — drag its loop along the rule' : 'Unknown mass M'} bench labelY={0.02} drag={drag('slide-other')}>
          {(active) => (
            <group>
              <UnknownMass />
              <mesh geometry={box} position={[0, -0.04, 0]} scale={[0.04, 0.09, 0.04]}>
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
              {active && <GlowRing r={0.03} y={-THREAD - BODY - 0.01} />}
            </group>
          )}
        </Interactive>
      </group>
    </group>
  );
}

function ExtraModel({ id }: { id: ApparatusId }) {
  if (id === 'm50') return <group position={[0, BODY * 0.75 + 0.012, 0]}><KnownMass grams={50} thread={false} /></group>;
  if (id === 'm100') return <group position={[0, BODY + 0.012, 0]}><KnownMass grams={100} thread={false} /></group>;
  if (id === 'unknown') return <group position={[0, BODY * 0.8 + 0.012, 0]}><UnknownMass thread={false} /></group>;
  if (id === 'thread')
    return (
      <group>
        <mesh geometry={cyl} material={mat.wood()} position={[0, 0.015, 0]} scale={[0.006, 0.03, 0.006]} />
        <mesh geometry={cyl} material={threadMat} position={[0, 0.015, 0]} scale={[0.012, 0.02, 0.012]} />
      </group>
    );
  if (id === 'spring')
    return (
      <group>
        {Array.from({ length: 10 }, (_, k) => (
          <mesh key={k} geometry={loop} material={mat.steel()} position={[0, 0.006 + k * 0.005, 0]} rotation={[Math.PI / 2, 0, 0]} scale={0.011} />
        ))}
      </group>
    );
  if (id === 'bob') return <mesh material={brass} position={[0, 0.012, 0]} scale={0.012}><sphereGeometry args={[1, 20, 14]} /></mesh>;
  return null;
}

/** Everything on the student's bench. */
export function Station({ v, state, scene, interactive, task }: { v: PhyMomentsVariant; state: PhyMomentsState; scene: SceneState; interactive: boolean; task: string[] }) {
  const t: MomentsTask = state.task ?? 'MOMENTS';
  const known = knownId(t);
  // On the bench but not hanging: the masses and the thread wait by the book; the rest at the far end.
  const loose = (['m50', 'm100', 'unknown', 'thread', 'spring', 'bob'] as ApparatusId[]).filter((id) => scene.collected.has(id) && !(id === known && state.known !== null) && !(id === 'unknown' && t === 'MOMENTS' && state.other !== null));
  return (
    <group position={STATION}>
      <Interactive id="mybench" label="Your bench" labelY={0.5}>
        <mesh position={[0, 0.005, 0]}>
          <boxGeometry args={[BENCH.w, 0.01, BENCH.d]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>
      <CardAndBook cardAt={SPOT.card} bookAt={SPOT.book} title={t === 'MASS' ? 'Mass of a metre rule' : 'Principle of moments'} lines={task} bookTitle={t === 'MASS' ? 'Mass of the rule' : 'Principle of moments'} heads={t === 'MASS' ? ['x/cm', 'P/cm', 'd₁/cm', 'd₂/cm', 'M/g'] : ['x₁/cm', 'x₂/cm', 'd₁/cm', 'd₂/cm', 'M/g']} />
      <Balance v={v} state={state} scene={scene} interactive={interactive} />
      {loose.map((id, k) => (
        <Interactive key={id} id={id} label={APPARATUS_LABEL[id]} bench position={[SPOT.extras[0] - 0.3 + (k % 3) * 0.13, 0, SPOT.extras[2] - Math.floor(k / 3) * 0.12]} labelY={0.1}>
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
  { id: 'rule', label: APPARATUS_LABEL.rule, shelf: 0, x: -0.55, model: <group position={[-0.45, 0, 0]} scale={[0.9, 1, 1]}><mesh geometry={box} material={mat.wood()} position={[0.5, 0.003, 0]} scale={[1, 0.006, 0.03]} /></group>, grip: [[0.9, 0.04, 0.06], [0, 0.01, 0]] },
  { id: 'edge', label: APPARATUS_LABEL.edge, shelf: 1, x: -0.7, model: <group scale={0.8}><EdgeModel /></group>, grip: [[0.09, 0.1, 0.08], [0, 0.04, 0]] },
  { id: 'm50', label: APPARATUS_LABEL.m50, shelf: 1, x: -0.4, model: <ExtraModel id="m50" />, grip: [[0.05, 0.07, 0.05], [0, 0.03, 0]] },
  { id: 'm100', label: APPARATUS_LABEL.m100, shelf: 1, x: -0.25, model: <ExtraModel id="m100" />, grip: [[0.05, 0.07, 0.05], [0, 0.03, 0]] },
  { id: 'unknown', label: APPARATUS_LABEL.unknown, shelf: 1, x: -0.1, model: <ExtraModel id="unknown" />, grip: [[0.05, 0.07, 0.05], [0, 0.03, 0]] },
  { id: 'thread', label: APPARATUS_LABEL.thread, shelf: 2, x: -0.6, model: <ExtraModel id="thread" />, grip: [[0.05, 0.05, 0.05], [0, 0.02, 0]] },
  { id: 'spring', label: APPARATUS_LABEL.spring, shelf: 2, x: -0.3, model: <ExtraModel id="spring" />, grip: [[0.05, 0.07, 0.05], [0, 0.03, 0]] },
  { id: 'bob', label: APPARATUS_LABEL.bob, shelf: 2, x: 0.1, model: <ExtraModel id="bob" />, grip: [[0.05, 0.05, 0.05], [0, 0.02, 0]] },
];
export function MomentsCupboard({ scene }: { scene: SceneState }) {
  return <CupboardItems slots={SLOTS} collected={scene.collected} />;
}
