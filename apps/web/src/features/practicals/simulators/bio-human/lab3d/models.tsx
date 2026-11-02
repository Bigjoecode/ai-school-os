import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, type ReactNode } from 'react';
import { MeshStandardMaterial, Quaternion, Vector3, type Group, type Material } from 'three';
import { GlowRing } from '../../../lab3d-kit/apparatus';
import { mat } from '../../../lab3d-kit/materials';
import { bioCanvas, FONT } from '../../bio-common/lab3d/textures';

/**
 * Procedural models for the human physiology bench: the partner (a simple,
 * stylised classmate in school uniform, seated or stepping, whose arms are
 * placed by points), the step box, the inhaled/exhaled air apparatus, the
 * lime water bottle, mirror, cobalt chloride paper, the hanging metre rule,
 * the dividers, the blindfold and the alcohol wipes.
 */

type V3 = [number, number, number];
const skin = new MeshStandardMaterial({ color: '#6e4430', roughness: 0.6 });
const skinLight = new MeshStandardMaterial({ color: '#8a5a3c', roughness: 0.6 });
const hair = new MeshStandardMaterial({ color: '#161212', roughness: 0.9 });
const shirt = new MeshStandardMaterial({ color: '#dbe8f5', roughness: 0.7 });
const trousers = new MeshStandardMaterial({ color: '#23314f', roughness: 0.8 });
const shoes = new MeshStandardMaterial({ color: '#1b1b1b', roughness: 0.5 });
const band = new MeshStandardMaterial({ color: '#2b2b33', roughness: 0.8 });
const tubeMat = new MeshStandardMaterial({ color: '#c8a46a', roughness: 0.6, transparent: true, opacity: 0.85 });

const UP = new Vector3(0, 1, 0);
/** A cylinder from a to b (radius r). */
export function Limb({ a, b, r, m }: { a: V3; b: V3; r: number; m: Material }) {
  const { pos, q, len } = useMemo(() => {
    const va = new Vector3(...a);
    const vb = new Vector3(...b);
    const d = vb.clone().sub(va);
    const len = Math.max(1e-4, d.length());
    return { pos: va.add(vb).multiplyScalar(0.5).toArray() as V3, q: new Quaternion().setFromUnitVectors(UP, d.normalize()), len };
  }, [a, b]);
  return (
    <mesh position={pos} quaternion={q} material={m}>
      <cylinderGeometry args={[r, r * 0.92, len, 10]} />
    </mesh>
  );
}

export interface ArmPose {
  elbow: V3;
  hand: V3;
  /** Palm up (the pulse, the skin test) or down. */
  palmUp?: boolean;
}
export interface PartnerPose {
  /** Where the partner is (station-local x, z) and which way they face (yaw 0: towards the student, +z). */
  at: [number, number];
  yaw: number;
  /** Station-local arm points (null: resting on the lap). */
  right?: ArmPose | null;
  left?: ArmPose | null;
  standing?: boolean;
  /** Stepping up and down on the box (animated). */
  stepping?: boolean;
  /** Leaning the head forward to a mouthpiece at this station-local point. */
  mouth?: V3 | null;
  blind?: boolean;
  /** One leg crossed over the other; `kickAt`: when the knee was tapped (performance.now ms). */
  crossed?: boolean;
  kickAt?: number;
  /** Floor below the bench top (station-local y of the floor). */
  floor: number;
}

/** The partner: stylised, respectful, built from simple shapes. Station-local coordinates. */
export function Partner({ pose, glowOn, children }: { pose: PartnerPose; glowOn?: boolean; children?: ReactNode }) {
  const body = useRef<Group>(null);
  const shin = useRef<Group>(null);
  const { at, yaw, standing, floor } = pose;
  const hipY = standing ? floor + 0.86 : -0.24;
  const shY = hipY + 0.5;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const toStation = (lx: number, ly: number, lz: number): V3 => [at[0] + lx * cos + lz * sin, ly, at[1] - lx * sin + lz * cos];
  const shoulderR = toStation(-0.17, shY, 0);
  const shoulderL = toStation(0.17, shY, 0);
  const restR: ArmPose = standing ? { elbow: toStation(-0.21, shY - 0.27, 0.02), hand: toStation(-0.2, shY - 0.52, 0.06) } : { elbow: toStation(-0.2, hipY + 0.2, 0.12), hand: toStation(-0.12, hipY + 0.06, 0.3) };
  const restL: ArmPose = standing ? { elbow: toStation(0.21, shY - 0.27, 0.02), hand: toStation(0.2, shY - 0.52, 0.06) } : { elbow: toStation(0.2, hipY + 0.2, 0.12), hand: toStation(0.12, hipY + 0.06, 0.3) };
  const R = pose.right ?? restR;
  const L = pose.left ?? restL;
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (body.current) body.current.position.y = pose.stepping ? Math.max(0, Math.sin(t * 6)) * 0.2 : 0;
    if (shin.current) {
      const k = pose.kickAt ? (performance.now() - pose.kickAt) / 1000 : 9;
      shin.current.rotation.x = k < 0.8 ? -Math.sin(Math.min(1, k / 0.25) * Math.PI) * 0.9 * Math.max(0, 1 - k) : 0;
    }
  });
  const neckFwd = pose.mouth ? 0.08 : 0;
  return (
    <group ref={body}>
      <group>
        <group position={[at[0], 0, at[1]]} rotation={[0, yaw, 0]}>
          {/* legs */}
          {standing ? (
            [-0.08, 0.08].map((x) => (
              <group key={x}>
                <mesh position={[x, floor + 0.43, 0]} material={trousers}>
                  <cylinderGeometry args={[0.055, 0.05, 0.84, 10]} />
                </mesh>
                <mesh position={[x, floor + 0.03, 0.04]} material={shoes}>
                  <boxGeometry args={[0.09, 0.06, 0.2]} />
                </mesh>
              </group>
            ))
          ) : (
            <>
              {[-0.08, 0.08].map((x) => {
                const cross = pose.crossed && x > 0;
                return (
                  <group key={x}>
                    <mesh position={[x, hipY + (cross ? 0.08 : 0), 0.2]} rotation={[Math.PI / 2, 0, cross ? -0.25 : 0]} material={trousers}>
                      <cylinderGeometry args={[0.06, 0.055, 0.42, 10]} />
                    </mesh>
                    <group ref={cross ? shin : undefined} position={[x - (cross ? 0.04 : 0), hipY + (cross ? 0.08 : 0), 0.4]}>
                      <mesh position={[0, (floor - hipY) / 2 + (cross ? 0.12 : 0), 0]} material={trousers}>
                        <cylinderGeometry args={[0.05, 0.045, Math.abs(floor - hipY) - (cross ? 0.2 : 0.04), 10]} />
                      </mesh>
                      <mesh position={[0, floor - hipY + 0.03 + (cross ? 0.22 : 0), 0.05]} material={shoes}>
                        <boxGeometry args={[0.09, 0.06, 0.2]} />
                      </mesh>
                      {cross && (
                        <mesh position={[0, -0.02, 0.05]} material={mat.highlight()} visible={!!pose.kickAt && performance.now() - pose.kickAt < 1500}>
                          <sphereGeometry args={[0.03, 8, 6]} />
                        </mesh>
                      )}
                    </group>
                  </group>
                );
              })}
              {/* stool */}
              <mesh position={[0, hipY - 0.07, 0.05]} material={mat.wood()}>
                <cylinderGeometry args={[0.17, 0.17, 0.04, 16]} />
              </mesh>
              {[0, 1, 2, 3].map((k) => (
                <mesh key={k} position={[Math.cos(k * 1.57 + 0.78) * 0.12, (hipY - 0.09 + floor) / 2, 0.05 + Math.sin(k * 1.57 + 0.78) * 0.12]} material={mat.metal()}>
                  <cylinderGeometry args={[0.012, 0.012, hipY - 0.09 - floor, 6]} />
                </mesh>
              ))}
            </>
          )}
          {/* torso (shirt), neck and head */}
          <mesh position={[0, hipY + 0.26, 0]} material={shirt}>
            <cylinderGeometry args={[0.16, 0.17, 0.52, 14]} />
          </mesh>
          <group position={[0, shY + 0.06, neckFwd]} rotation={[pose.mouth ? 0.35 : 0, 0, 0]}>
            <mesh position={[0, 0.03, 0]} material={skin}>
              <cylinderGeometry args={[0.04, 0.045, 0.08, 10]} />
            </mesh>
            <mesh position={[0, 0.16, 0]} scale={[1, 1.12, 1]} material={skin}>
              <sphereGeometry args={[0.1, 18, 14]} />
            </mesh>
            <mesh position={[0, 0.2, -0.015]} scale={[1.05, 0.9, 1.05]} material={hair}>
              <sphereGeometry args={[0.1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
            </mesh>
            {pose.blind && (
              <mesh position={[0, 0.17, 0]} rotation={[Math.PI / 2, 0, 0]} material={band}>
                <torusGeometry args={[0.103, 0.018, 6, 24]} />
              </mesh>
            )}
            {glowOn && (
              <mesh position={[0, 0.16, 0]} material={mat.highlight()}>
                <sphereGeometry args={[0.13, 12, 10]} />
              </mesh>
            )}
          </group>
        </group>
      </group>
      {/* arms, in station coordinates */}
      {[
        [shoulderR, R],
        [shoulderL, L],
      ].map(([sh, arm], k) => {
        const a = arm as ArmPose;
        return (
          <group key={k}>
            <Limb a={sh as V3} b={a.elbow} r={0.045} m={shirt} />
            <Limb a={a.elbow} b={a.hand} r={0.035} m={skin} />
            <mesh position={a.hand} scale={[1, a.palmUp === undefined ? 1 : 0.55, 1.3]} material={skin}>
              <sphereGeometry args={[0.04, 10, 8]} />
            </mesh>
          </group>
        );
      })}
      {children}
    </group>
  );
}

/** The student's two fingertips on the partner's wrist (origin at the wrist). */
export function Fingertips() {
  return (
    <group>
      {[-0.012, 0.012].map((x) => (
        <Limb key={x} a={[x, 0.03, 0.16]} b={[x * 0.6, 0.012, 0.012]} r={0.009} m={skinLight} />
      ))}
      <mesh position={[0, 0.035, 0.2]} material={skinLight}>
        <sphereGeometry args={[0.03, 10, 8]} />
      </mesh>
    </group>
  );
}

/** A low wooden step for step-ups (origin on the floor). */
export function StepBox({ glow: g }: { glow?: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.11, 0]} material={mat.wood()}>
        <boxGeometry args={[0.55, 0.22, 0.38]} />
      </mesh>
      {g && <GlowRing r={0.295} />}
    </group>
  );
}

const milky = (t: number) => new MeshStandardMaterial({ color: '#f4f4ee', transparent: true, opacity: 0.12 + 0.8 * Math.min(1, t), roughness: 0.4, depthWrite: false });
/** The inhaled/exhaled air apparatus: tubes A and B in a stand, the bent glass tubes and the mouthpiece. */
export function AirApparatus({ turbA, turbB, lime, mouthpiece, bubbling, glow: g }: { turbA: number; turbB: number; lime: 'EQUAL' | 'UNEQUAL' | null; mouthpiece: boolean; bubbling: 'A' | 'B' | null; glow?: boolean }) {
  const mA = useMemo(() => milky(turbA), [turbA]);
  const mB = useMemo(() => milky(turbB), [turbB]);
  const bub = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (bub.current) bub.current.children.forEach((c, i) => (c.position.y = 0.02 + ((clock.elapsedTime * 0.12 + i * 0.023) % 0.07)));
  });
  const tube = (x: number, m: MeshStandardMaterial, h: number, label: string) => (
    <group position={[x, 0, 0]}>
      <mesh position={[0, 0.09, 0]} material={mat.glass()} renderOrder={5}>
        <cylinderGeometry args={[0.016, 0.016, 0.16, 16, 1, true]} />
      </mesh>
      {lime && (
        <mesh position={[0, 0.012 + h / 2, 0]} material={m} renderOrder={4}>
          <cylinderGeometry args={[0.0145, 0.0145, h, 14]} />
        </mesh>
      )}
      <mesh position={[0, 0.172, 0]} material={mat.rubber()}>
        <cylinderGeometry args={[0.018, 0.016, 0.02, 12]} />
      </mesh>
      <mesh position={[-0.006, 0.12, 0]} material={mat.glass()}>
        <cylinderGeometry args={[0.003, 0.003, 0.16, 6]} />
      </mesh>
      <mesh position={[0.006, 0.19, 0]} material={mat.glass()}>
        <cylinderGeometry args={[0.003, 0.003, 0.04, 6]} />
      </mesh>
      <mesh position={[0, 0.215, 0.002]} rotation={[0, 0, 0]}>
        <planeGeometry args={[0.03, 0.02]} />
        <meshBasicMaterial map={labelTex(label)} transparent />
      </mesh>
    </group>
  );
  return (
    <group>
      {/* stand */}
      <mesh position={[0, 0.005, 0]} material={mat.wood()}>
        <boxGeometry args={[0.2, 0.01, 0.07]} />
      </mesh>
      <mesh position={[0, 0.07, -0.03]} material={mat.wood()}>
        <boxGeometry args={[0.2, 0.12, 0.008]} />
      </mesh>
      {tube(-0.05, mA, lime === 'UNEQUAL' ? 0.05 : 0.07, 'A')}
      {tube(0.05, mB, 0.07, 'B')}
      {/* T-piece and rubber tubing up to the mouthpiece */}
      <Limb a={[-0.044, 0.21, 0]} b={[0.056, 0.21, 0]} r={0.004} m={tubeMat} />
      <Limb a={[0.006, 0.21, 0]} b={[0.006, 0.27, 0.02]} r={0.005} m={tubeMat} />
      {mouthpiece && (
        <mesh position={[0.006, 0.285, 0.03]} rotation={[0.6, 0, 0]} material={mat.plastic()}>
          <cylinderGeometry args={[0.009, 0.007, 0.04, 10]} />
        </mesh>
      )}
      {bubbling && (
        <group ref={bub} position={[bubbling === 'A' ? -0.056 : 0.044, 0, 0]}>
          {[0, 1, 2, 3].map((i) => (
            <mesh key={i} position={[0, 0.02, 0]} material={mat.white()}>
              <sphereGeometry args={[0.003, 6, 4]} />
            </mesh>
          ))}
        </group>
      )}
      {g && <GlowRing r={0.120} />}
    </group>
  );
}
const labelTex = (t: string) =>
  bioCanvas(`human-label-${t}`, 64, 40, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#111';
    g.font = `bold 28px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(t, w / 2, h / 2 + 1);
  });

/** A small bottle (lime water, alcohol). */
export function SmallBottle({ colour, cap = '#2e7d32', glow: g }: { colour: string; cap?: string; glow?: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.045, 0]} material={mat.glass()} renderOrder={5}>
        <cylinderGeometry args={[0.025, 0.025, 0.09, 16]} />
      </mesh>
      <mesh position={[0, 0.035, 0]}>
        <cylinderGeometry args={[0.022, 0.022, 0.065, 14]} />
        <meshStandardMaterial color={colour} transparent opacity={0.6} />
      </mesh>
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.02, 12]} />
        <meshStandardMaterial color={cap} />
      </mesh>
      {g && <GlowRing r={0.042} />}
    </group>
  );
}

/** A hand mirror on a little stand, misted after a breath. */
export function MirrorModel({ misted, glow: g }: { misted: boolean; glow?: boolean }) {
  return (
    <group rotation={[0, 0, 0]}>
      <mesh position={[0, 0.06, 0]} rotation={[-0.25, 0, 0]}>
        <boxGeometry args={[0.12, 0.09, 0.006]} />
        <meshStandardMaterial color="#d9e6ee" roughness={0.05} metalness={0.9} />
      </mesh>
      {misted && (
        <mesh position={[0, 0.062, 0.004]} rotation={[-0.25, 0, 0]}>
          <circleGeometry args={[0.035, 20]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.6} />
        </mesh>
      )}
      <mesh position={[0, 0.01, -0.02]} material={mat.black()}>
        <boxGeometry args={[0.06, 0.02, 0.04]} />
      </mesh>
      {g && <GlowRing r={0.080} />}
    </group>
  );
}

/** Cobalt chloride paper strips in a dish (blue; pink when wetted). */
export function CobaltPaper({ pink, glow: g }: { pink: boolean | null; glow?: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.006, 0]} material={mat.glass()}>
        <cylinderGeometry args={[0.04, 0.04, 0.012, 20]} />
      </mesh>
      {[0, 1, 2].map((k) => (
        <mesh key={k} position={[-0.015 + k * 0.015, 0.008, 0]} rotation={[-Math.PI / 2, 0, 0.2]}>
          <planeGeometry args={[0.01, 0.05]} />
          <meshStandardMaterial color={pink && k === 0 ? '#f2a3c0' : '#4f7fd9'} />
        </mesh>
      ))}
      {g && <GlowRing r={0.056} />}
    </group>
  );
}

/** A metre rule, vertical, its 0 cm end at the origin and the scale running up; `drop`: how far it has fallen (m). */
export function HangingRule({ drop, glow: g }: { drop: number; glow?: boolean }) {
  const tex = useMemo(
    () =>
      bioCanvas('human-metre-rule', 64, 1024, (c, w, h) => {
        c.fillStyle = '#e9d29a';
        c.fillRect(0, 0, w, h);
        c.fillStyle = '#3b2b0d';
        for (let k = 0; k <= 100; k++) {
          const y = h - (k / 100) * h;
          c.fillRect(0, y - 1, k % 10 === 0 ? 30 : k % 5 === 0 ? 20 : 12, 2);
          if (k % 10 === 0 && k > 0 && k < 100) {
            c.font = `bold 16px ${FONT}`;
            c.fillText(String(k), 34, y + 6);
          }
        }
      }),
    [],
  );
  return (
    <group position={[0, -drop, 0]}>
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[0.028, 1, 0.006]} />
        <meshStandardMaterial map={tex} roughness={0.7} />
      </mesh>
      {g && <GlowRing r={0.030} />}
    </group>
  );
}

/** A pair of dividers (blunt points) opened to `sep` mm (drawn ×1). */
export function Dividers({ sep, glow: g }: { sep: number; glow?: boolean }) {
  const half = Math.asin(Math.min(0.95, sep / 1000 / 2 / 0.09));
  return (
    <group rotation={[0, 0, 0]}>
      <mesh position={[0, 0.095, 0]} material={mat.steel()}>
        <cylinderGeometry args={[0.006, 0.006, 0.012, 10]} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s} position={[0, 0.09, 0]} rotation={[0, 0, s * half]}>
          <mesh position={[0, -0.045, 0]} material={mat.steel()}>
            <cylinderGeometry args={[0.0025, 0.0015, 0.09, 6]} />
          </mesh>
        </group>
      ))}
      {g && <GlowRing r={0.035} />}
    </group>
  );
}

/** A folded dark blindfold. */
export function BlindfoldModel({ glow: g }: { glow?: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.006, 0]} material={band}>
        <boxGeometry args={[0.14, 0.012, 0.05]} />
      </mesh>
      {g && <GlowRing r={0.090} />}
    </group>
  );
}

/** A packet of alcohol wipes, or a sealed pack of mouthpieces. */
export function PacketModel({ colour, glow: g }: { colour: string; glow?: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.01, 0]}>
        <boxGeometry args={[0.08, 0.02, 0.06]} />
        <meshStandardMaterial color={colour} roughness={0.6} />
      </mesh>
      {g && <GlowRing r={0.060} />}
    </group>
  );
}

/** A marker on the partner for a skin area (glows when chosen). */
export function AreaDot({ on, done }: { on: boolean; done: boolean }) {
  return (
    <mesh>
      <sphereGeometry args={[on ? 0.014 : 0.01, 10, 8]} />
      <meshBasicMaterial color={on ? '#38bdf8' : done ? '#22c55e' : '#ffffff'} transparent opacity={0.9} depthTest={false} />
    </mesh>
  );
}
