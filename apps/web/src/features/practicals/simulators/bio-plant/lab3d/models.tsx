import { LEAF_H, LEAF_W, POTO_DIST, POTO_SCALE, STARCH_COL, leafCellColour, type BioPlantState, type BioPlantVariant, type PotoCond, type StarchLeaf } from '@aischool/shared';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { DoubleSide, type Group, type Mesh } from 'three';
import { BlobShadow, GlowRing } from '../../../lab3d-kit/apparatus';
import { colourMaterial, liquidMaterial, mat } from '../../../lab3d-kit/materials';
import { bioCanvas, FONT } from '../../bio-common/lab3d/textures';

/**
 * The plant lab's procedural apparatus, at true size (metres; the origin is
 * the point it stands on): the leafy shoot and the bubble potometer, the fan,
 * the bench lamp and the bags; the pondweed under its funnel with bubbles
 * rising at the shared rate, the water trough and the metre rule; the potted
 * plant with its foil strip and KOH flask, a leaf drawn square by square from
 * the shared colours, the boiling tube of ethanol and the grid paper.
 */

type V3 = [number, number, number];
const LEAF_GREEN = '#4f9a3f';

// ------------------------------------------------------------------ potometer

/** A leafy shoot (origin at the cut end), with a black or clear bag over it in the dark or humid conditions. */
export function LeafyShoot({ cond, glow }: { cond: PotoCond | null; glow?: boolean }) {
  const leaves = useMemo(() => Array.from({ length: 9 }, (_, k) => ({ y: 0.08 + k * 0.03, a: k * 2.4, s: 0.9 - k * 0.04 })), []);
  return (
    <group>
      <mesh position={[0, 0.17, 0]} material={colourMaterial('#5d7f3a')}>
        <cylinderGeometry args={[0.0035, 0.004, 0.34, 8]} />
      </mesh>
      {leaves.map((l, k) => (
        <group key={k} position={[0, l.y, 0]} rotation={[0, l.a, 0]}>
          <mesh position={[0.035 * l.s, 0.004, 0]} rotation={[0.25, 0, -0.35]} scale={[l.s, 0.28, l.s]} material={colourMaterial(glow ? '#6bbf55' : LEAF_GREEN)}>
            <sphereGeometry args={[0.035, 10, 6, 0, Math.PI * 2, 0, Math.PI]} />
          </mesh>
        </group>
      ))}
      {(cond === 'HUMID' || cond === 'DARK') && (
        <mesh position={[0, 0.22, 0]} renderOrder={6}>
          <sphereGeometry args={[0.1, 18, 12]} />
          <meshStandardMaterial color={cond === 'DARK' ? '#151517' : '#e8f4fb'} transparent opacity={cond === 'DARK' ? 0.94 : 0.32} roughness={0.3} depthWrite={false} side={DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

const scaleTexture = () =>
  bioCanvas('plant-poto-scale', 1024, 96, (g, w, h) => {
    g.fillStyle = '#f4e7b8';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#3b3320';
    g.fillStyle = '#3b3320';
    g.font = `600 22px ${FONT}`;
    g.textAlign = 'center';
    const x0 = 24;
    const px = (w - 48) / POTO_SCALE;
    for (let mm = 0; mm <= POTO_SCALE; mm++) {
      const x = x0 + mm * px;
      g.lineWidth = mm % 10 === 0 ? 2.4 : 1.2;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, mm % 10 === 0 ? 40 : mm % 5 === 0 ? 28 : 18);
      g.stroke();
      if (mm % 10 === 0) g.fillText(String(mm), x, 70);
    }
    g.fillStyle = '#c62828';
    g.fillRect(x0 + POTO_DIST * px - 2, 0, 4, 46);
  });
/** The capillary's length on the bench (m) and where the scale's zero is (x, local). */
export const CAP = { x0: -0.16, len: 0.42, y: 0.13 };

/** The bubble potometer on its stand: the vertical tube holding the shoot, the reservoir and tap, the capillary over its mm scale, the bubble at `bubble` mm. */
export function PotometerModel({ bubble, sealed, fitted, glow, children }: { bubble: number | null; sealed: boolean; fitted: boolean; glow?: boolean; children?: React.ReactNode }) {
  const tex = useMemo(scaleTexture, []);
  const px = CAP.len / POTO_SCALE / 1.04;
  return (
    <group>
      <BlobShadow r={0.22} />
      {/* stand */}
      <mesh position={[0.05, 0.006, 0]} material={mat.darkMetal()}>
        <boxGeometry args={[0.6, 0.012, 0.12]} />
      </mesh>
      {[-0.22, 0.3].map((x) => (
        <mesh key={x} position={[x, CAP.y / 2, -0.03]} material={mat.metal()}>
          <cylinderGeometry args={[0.004, 0.004, CAP.y, 8]} />
        </mesh>
      ))}
      {/* capillary and water */}
      <mesh position={[CAP.x0 + CAP.len / 2, CAP.y, 0]} rotation={[0, 0, Math.PI / 2]} material={mat.glass()} renderOrder={5}>
        <cylinderGeometry args={[0.004, 0.004, CAP.len + 0.06, 12, 1, true]} />
      </mesh>
      <mesh position={[CAP.x0 + CAP.len / 2, CAP.y, 0]} rotation={[0, 0, Math.PI / 2]} material={liquidMaterial('#d6e8f5', 0.45)} renderOrder={3}>
        <cylinderGeometry args={[0.0025, 0.0025, CAP.len + 0.05, 10]} />
      </mesh>
      {bubble !== null && (
        <mesh position={[CAP.x0 + 0.01 + bubble * px, CAP.y, 0]} rotation={[0, 0, Math.PI / 2]} material={mat.white()} renderOrder={6}>
          <capsuleGeometry args={[0.0028, 0.006, 4, 8]} />
        </mesh>
      )}
      {/* the scale */}
      <mesh position={[CAP.x0 + CAP.len / 2, CAP.y - 0.012, 0.004]} rotation={[-0.35, 0, 0]}>
        <planeGeometry args={[CAP.len, 0.04]} />
        <meshStandardMaterial map={tex} roughness={0.7} />
      </mesh>
      {/* vertical tube, rubber joint and the shoot */}
      <mesh position={[-0.35, 0.1, 0]} material={mat.glass()} renderOrder={5}>
        <cylinderGeometry args={[0.008, 0.008, 0.14, 12, 1, true]} />
      </mesh>
      <mesh position={[-0.35, 0.1, 0]} material={liquidMaterial('#d6e8f5', 0.45)} renderOrder={3}>
        <cylinderGeometry args={[0.006, 0.006, 0.13, 10]} />
      </mesh>
      <mesh position={[-0.27, CAP.y, 0]} rotation={[0, 0, Math.PI / 2]} material={mat.glass()} renderOrder={5}>
        <cylinderGeometry args={[0.004, 0.004, 0.16, 10, 1, true]} />
      </mesh>
      <mesh position={[-0.35, 0.18, 0]} material={sealed ? colourMaterial('#d8c88a') : mat.black()}>
        <cylinderGeometry args={[0.011, 0.011, 0.025, 12]} />
      </mesh>
      {fitted && <group position={[-0.35, 0.17, 0]}>{children}</group>}
      {/* reservoir and tap */}
      <group position={[-0.22, CAP.y, 0]}>
        <mesh position={[0, 0.06, 0]} material={mat.glass()} renderOrder={5}>
          <cylinderGeometry args={[0.022, 0.006, 0.06, 16, 1, true]} />
        </mesh>
        <mesh position={[0, 0.055, 0]} material={liquidMaterial('#d6e8f5', 0.45)} renderOrder={3}>
          <cylinderGeometry args={[0.018, 0.006, 0.04, 14]} />
        </mesh>
        <mesh position={[0, 0.02, 0]} rotation={[0, 0, Math.PI / 2]} material={mat.ptfe()}>
          <cylinderGeometry args={[0.004, 0.004, 0.03, 8]} />
        </mesh>
        <mesh position={[0, 0.01, 0]} material={mat.glass()}>
          <cylinderGeometry args={[0.004, 0.004, 0.03, 8]} />
        </mesh>
      </group>
      {glow && <GlowRing r={0.24} />}
    </group>
  );
}

/** A basin of water (the shoot is cut and fitted under water in it). */
export function BowlModel({ glow }: { glow?: boolean }) {
  return (
    <group>
      <BlobShadow r={0.14} />
      <mesh position={[0, 0.035, 0]} material={colourMaterial('#e8e3d8')}>
        <cylinderGeometry args={[0.14, 0.1, 0.07, 28, 1, true]} />
      </mesh>
      <mesh position={[0, 0.004, 0]} material={colourMaterial('#e8e3d8')}>
        <cylinderGeometry args={[0.1, 0.1, 0.008, 24]} />
      </mesh>
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} material={liquidMaterial('#bcd9ea', 0.6)}>
        <circleGeometry args={[0.128, 28]} />
      </mesh>
      {glow && <GlowRing r={0.15} />}
    </group>
  );
}

/** An electric desk fan (blades spin when on). */
export function FanModel({ on, glow }: { on: boolean; glow?: boolean }) {
  const blades = useRef<Group>(null);
  useFrame((_, dt) => {
    if (blades.current && on) blades.current.rotation.z += dt * 18;
  });
  return (
    <group rotation={[0, 0.7, 0]}>
      <BlobShadow r={0.08} />
      <mesh position={[0, 0.01, 0]} material={mat.black()}>
        <cylinderGeometry args={[0.06, 0.07, 0.02, 20]} />
      </mesh>
      <mesh position={[0, 0.09, 0]} material={mat.darkMetal()}>
        <cylinderGeometry args={[0.008, 0.008, 0.16, 8]} />
      </mesh>
      <group position={[0, 0.2, 0]}>
        <mesh material={mat.metal()}>
          <torusGeometry args={[0.07, 0.003, 6, 30]} />
        </mesh>
        <group ref={blades}>
          {[0, 1, 2].map((k) => (
            <mesh key={k} rotation={[0, 0, (k * Math.PI * 2) / 3]} position={[0, 0, 0.004]} material={colourMaterial('#7aa7c9')}>
              <boxGeometry args={[0.022, 0.12, 0.002]} />
            </mesh>
          ))}
        </group>
        <mesh position={[0, 0, -0.02]} rotation={[Math.PI / 2, 0, 0]} material={mat.black()}>
          <cylinderGeometry args={[0.018, 0.018, 0.03, 12]} />
        </mesh>
      </group>
      {glow && <GlowRing r={0.09} />}
    </group>
  );
}

/** A bench lamp with its shade facing −x (the bulb glows when on). */
export function BenchLampModel({ on, glow }: { on: boolean; glow?: boolean }) {
  return (
    <group>
      <BlobShadow r={0.07} />
      <mesh position={[0, 0.008, 0]} material={mat.black()}>
        <cylinderGeometry args={[0.055, 0.06, 0.016, 18]} />
      </mesh>
      <mesh position={[0, 0.1, 0]} material={mat.metal()}>
        <cylinderGeometry args={[0.005, 0.005, 0.18, 8]} />
      </mesh>
      <mesh position={[-0.02, 0.19, 0]} rotation={[0, 0, -0.9]} material={mat.metal()}>
        <cylinderGeometry args={[0.004, 0.004, 0.06, 8]} />
      </mesh>
      <group position={[-0.05, 0.21, 0]} rotation={[0, 0, Math.PI / 2 - 0.2]}>
        <mesh material={colourMaterial('#2f6e4a')}>
          <cylinderGeometry args={[0.042, 0.018, 0.06, 18, 1, true]} />
        </mesh>
        <mesh position={[0, -0.03, 0]} material={colourMaterial('#2f6e4a')}>
          <cylinderGeometry args={[0.018, 0.018, 0.004, 14]} />
        </mesh>
        <mesh position={[0, 0.006, 0]}>
          <sphereGeometry args={[0.014, 12, 10]} />
          <meshBasicMaterial color={on ? '#fff3c2' : '#9a9a8c'} toneMapped={!on} />
        </mesh>
      </group>
      {on && <pointLight position={[-0.06, 0.2, 0]} intensity={0.35} distance={0.9} decay={2} color="#fff1c8" />}
      {glow && <GlowRing r={0.08} />}
    </group>
  );
}

/** A small tub of Vaseline. */
export function VaselineModel({ glow }: { glow?: boolean }) {
  return (
    <group>
      <BlobShadow r={0.035} />
      <mesh position={[0, 0.015, 0]} material={colourMaterial('#e9e2c3')}>
        <cylinderGeometry args={[0.026, 0.026, 0.03, 18]} />
      </mesh>
      <mesh position={[0, 0.033, 0]} material={colourMaterial('#3a6fb5')}>
        <cylinderGeometry args={[0.027, 0.027, 0.008, 18]} />
      </mesh>
      {glow && <GlowRing r={0.04} />}
    </group>
  );
}

/** A folded black bag and a clear polythene bag. */
export function BagsModel({ glow }: { glow?: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.004, 0]} material={mat.black()}>
        <boxGeometry args={[0.12, 0.008, 0.09]} />
      </mesh>
      <mesh position={[0.02, 0.011, 0.01]}>
        <boxGeometry args={[0.12, 0.006, 0.09]} />
        <meshStandardMaterial color="#eef6fa" transparent opacity={0.5} roughness={0.2} />
      </mesh>
      {glow && <GlowRing r={0.09} />}
    </group>
  );
}

// ------------------------------------------------------------------ oxygen

/** The large beaker with the pondweed under an inverted funnel and (if set up) the test tube over its stem; bubbles rise at `rate` per minute (shown sped up); `gas` fills the top of the tube (0–1). */
export function OxyRigModel({ funnel, plant, tube, rate, gas, nahco3, glow }: { funnel: boolean; plant: boolean; tube: boolean; rate: number; gas: number; nahco3: boolean; glow?: boolean }) {
  const bubbles = useRef<Group>(null);
  const n = 10;
  useFrame(({ clock }) => {
    const g = bubbles.current;
    if (!g) return;
    g.visible = plant && rate > 0.3;
    const speed = Math.min(1.6, 0.15 + rate / 30);
    g.children.forEach((c, k) => {
      const f = (clock.elapsedTime * speed + k / n) % 1;
      c.position.set(Math.sin(k * 2.3) * 0.002, 0.05 + f * (tube ? 0.15 : 0.08), Math.cos(k * 1.7) * 0.002);
      c.visible = k < Math.max(1, Math.round(rate / 4));
    });
  });
  return (
    <group>
      <BlobShadow r={0.09} />
      <mesh position={[0, 0.07, 0]} material={liquidMaterial(nahco3 ? '#d3e7ef' : '#d6e8f5', 0.4)} renderOrder={2}>
        <cylinderGeometry args={[0.068, 0.068, 0.13, 26]} />
      </mesh>
      <mesh position={[0, 0.08, 0]} material={mat.glass()} renderOrder={5}>
        <cylinderGeometry args={[0.072, 0.07, 0.16, 28, 1, true]} />
      </mesh>
      {funnel && (
        <group>
          <mesh position={[0, 0.035, 0]} material={mat.glass()} renderOrder={5}>
            <cylinderGeometry args={[0.012, 0.055, 0.05, 22, 1, true]} />
          </mesh>
          <mesh position={[0, 0.09, 0]} material={mat.glass()} renderOrder={5}>
            <cylinderGeometry args={[0.006, 0.006, 0.07, 12, 1, true]} />
          </mesh>
        </group>
      )}
      {plant && (
        <group position={[0, 0.012, 0]} scale={1.6}>
          {[0, 1, 2].map((k) => (
            <group key={k} rotation={[0, k * 2.1, 0.15 * (k - 1)]}>
              <mesh position={[0, 0.03, 0]} material={colourMaterial('#3f7f2f')}>
                <cylinderGeometry args={[0.0015, 0.0015, 0.06, 6]} />
              </mesh>
              {[0.01, 0.02, 0.03, 0.04, 0.05].map((y) => (
                <mesh key={y} position={[0.004, y, 0]} rotation={[0, y * 60, 0.9]} material={colourMaterial('#4e9a3a')}>
                  <boxGeometry args={[0.012, 0.0008, 0.003]} />
                </mesh>
              ))}
            </group>
          ))}
        </group>
      )}
      {tube && (
        <group position={[0, 0.125, 0]}>
          <mesh position={[0, 0.075, 0]} material={mat.glass()} renderOrder={5}>
            <cylinderGeometry args={[0.0095, 0.0095, 0.15, 14, 1, true]} />
          </mesh>
          <mesh position={[0, 0.075 - (0.15 * gas) / 2, 0]} material={liquidMaterial('#d6e8f5', 0.45)} renderOrder={3}>
            <cylinderGeometry args={[0.0085, 0.0085, 0.15 * (1 - gas), 12]} />
          </mesh>
        </group>
      )}
      <group ref={bubbles}>
        {Array.from({ length: n }, (_, k) => (
          <mesh key={k} material={mat.white()}>
            <sphereGeometry args={[0.0018, 6, 5]} />
          </mesh>
        ))}
      </group>
      {glow && <GlowRing r={0.09} />}
    </group>
  );
}

/** A glass trough of water (the heat filter). */
export function TroughModel({ glow }: { glow?: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.055, 0]} material={liquidMaterial('#cfe6f3', 0.35)} renderOrder={2}>
        <boxGeometry args={[0.036, 0.1, 0.16]} />
      </mesh>
      <mesh position={[0, 0.06, 0]} material={mat.glass()} renderOrder={5}>
        <boxGeometry args={[0.04, 0.12, 0.17]} />
      </mesh>
      {glow && <GlowRing r={0.1} />}
    </group>
  );
}

const ruleTexture = () =>
  bioCanvas('plant-metre-rule', 1024, 64, (g, w, h) => {
    g.fillStyle = '#e9d9a4';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#3b3320';
    g.fillStyle = '#3b3320';
    g.font = `600 18px ${FONT}`;
    g.textAlign = 'center';
    for (let cm = 0; cm <= 100; cm++) {
      const x = 8 + (cm / 100) * (w - 16);
      g.lineWidth = cm % 10 === 0 ? 2 : 1;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, cm % 10 === 0 ? 28 : cm % 5 === 0 ? 20 : 12);
      g.stroke();
      if (cm % 10 === 0) g.fillText(String(cm), x, 52);
    }
  });
/** A metre rule lying along x (origin at its 0 cm end). */
export function MetreRuleModel({ glow }: { glow?: boolean }) {
  const tex = useMemo(ruleTexture, []);
  return (
    <group>
      <mesh position={[0.5, 0.003, 0]} material={colourMaterial('#e9d9a4')}>
        <boxGeometry args={[1.0, 0.006, 0.03]} />
      </mesh>
      <mesh position={[0.5, 0.0062, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.0, 0.03]} />
        <meshStandardMaterial map={tex} roughness={0.8} />
      </mesh>
      {glow && (
        <group position={[0.5, 0, 0]}>
          <GlowRing r={0.1} />
        </group>
      )}
    </group>
  );
}

/** Wooden splints (the first one glows at its tip while testing). */
export function SplintsModel({ glowing, relit, glow }: { glowing: boolean; relit: boolean; glow?: boolean }) {
  return (
    <group>
      {[0, 1, 2].map((k) => (
        <mesh key={k} position={[0, 0.003, k * 0.008]} rotation={[0, 0, Math.PI / 2]} material={colourMaterial('#d8b67a')}>
          <boxGeometry args={[0.004, 0.14, 0.004]} />
        </mesh>
      ))}
      {glowing && (
        <mesh position={[0.072, 0.003, 0]}>
          <sphereGeometry args={[relit ? 0.008 : 0.004, 8, 6]} />
          <meshBasicMaterial color={relit ? '#ffb02e' : '#ff5a1f'} toneMapped={false} />
        </mesh>
      )}
      {glow && <GlowRing r={0.08} />}
    </group>
  );
}

// ------------------------------------------------------------------ starch

/** The canvas texture of a leaf drawn square by square from the shared colours (transparent outside the leaf). */
export function leafTexture(v: BioPlantVariant, w: Pick<BioPlantState['starch'], 'plant'>, leaf: StarchLeaf) {
  const key = `plant-leaf-${v.seed}-${v.starch.foil0}-${w.plant}-${JSON.stringify(leaf)}`;
  return bioCanvas(key, LEAF_W * 16, LEAF_H * 16, (g) => {
    g.clearRect(0, 0, LEAF_W * 16, LEAF_H * 16);
    for (const c of v.starch.cells[leaf.kind]) {
      g.fillStyle = leafCellColour(v.starch, w, leaf, c);
      g.fillRect(c.i * 16, c.j * 16, 17, 17);
    }
    if (leaf.kind === 'FOIL' && leaf.boiled === 0 && leaf.eth === 0 && !leaf.iodine) {
      g.fillStyle = 'rgba(200,204,210,0.95)';
      g.fillRect(v.starch.foil0 * 16, 0, 48, LEAF_H * 16);
    }
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, LEAF_H * 8);
    g.lineTo(LEAF_W * 16, LEAF_H * 8);
    g.stroke();
  });
}
/** A leaf lying flat (12 × 8 cm), its colours from the shared maths. */
export function LeafModel({ v, w, leaf, glow, grid }: { v: BioPlantVariant; w: Pick<BioPlantState['starch'], 'plant'>; leaf: StarchLeaf; glow?: boolean; grid?: boolean }) {
  const tex = leafTexture(v, w, leaf);
  return (
    <group>
      {grid && (
        <mesh position={[0, 0.0008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.13, 0.09]} />
          <meshStandardMaterial map={gridTexture()} roughness={0.9} />
        </mesh>
      )}
      <mesh position={[0, 0.0016, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.12, 0.08]} />
        <meshStandardMaterial map={tex} transparent alphaTest={0.4} roughness={0.7} side={DoubleSide} />
      </mesh>
      {glow && <GlowRing r={0.075} />}
    </group>
  );
}

const gridTexture = () =>
  bioCanvas('plant-grid-paper', 260, 180, (g, w, h) => {
    g.fillStyle = '#fbfbf6';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#7fa8d6';
    g.lineWidth = 1.4;
    for (let x = 10; x <= w; x += 20) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, h);
      g.stroke();
    }
    for (let y = 10; y <= h; y += 20) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
  });
/** A sheet of 1 cm² grid paper. */
export function GridPaperModel({ glow }: { glow?: boolean }) {
  const tex = useMemo(gridTexture, []);
  return (
    <group>
      <mesh position={[0, 0.0008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.15, 0.1]} />
        <meshStandardMaterial map={tex} roughness={0.9} />
      </mesh>
      {glow && <GlowRing r={0.09} />}
    </group>
  );
}

const variegatedTexture = () =>
  bioCanvas('plant-variegated', 128, 96, (g, w, h) => {
    g.fillStyle = STARCH_COL.white;
    g.beginPath();
    g.ellipse(w / 2, h / 2, w / 2 - 2, h / 2 - 2, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = STARCH_COL.green;
    g.beginPath();
    g.ellipse(w / 2, h / 2, w / 2 - 18, h / 2 - 16, 0, 0, Math.PI * 2);
    g.fill();
  });
/** The potted plant: green leaves, one variegated, a foil strip on one leaf, one leaf inside a flask with KOH; picked leaves are gone. */
export function PottedPlantModel({ foil, koh, picked, dark, glow }: { foil: boolean; koh: boolean; picked: string[]; dark: boolean; glow?: boolean }) {
  const vtex = useMemo(variegatedTexture, []);
  const L = (kind: string, p: V3, rot: number, children?: React.ReactNode) =>
    picked.includes(kind) ? null : (
      <group key={kind} position={p} rotation={[0, rot, 0]}>
        <mesh position={[0.045, 0, 0]} rotation={[-Math.PI / 2 + 0.3, 0, 0]}>
          <planeGeometry args={[0.09, 0.06]} />
          {kind === 'VARIEGATED' ? <meshStandardMaterial map={vtex} transparent alphaTest={0.3} side={DoubleSide} /> : <meshStandardMaterial color={LEAF_GREEN} side={DoubleSide} />}
        </mesh>
        {children}
      </group>
    );
  return (
    <group>
      <BlobShadow r={0.1} />
      <mesh position={[0, 0.06, 0]} material={colourMaterial('#b5653a')}>
        <cylinderGeometry args={[0.075, 0.055, 0.12, 20]} />
      </mesh>
      <mesh position={[0, 0.118, 0]} material={colourMaterial('#4a3424')}>
        <cylinderGeometry args={[0.07, 0.07, 0.008, 20]} />
      </mesh>
      <mesh position={[0, 0.22, 0]} material={colourMaterial('#5d7f3a')}>
        <cylinderGeometry args={[0.005, 0.006, 0.2, 8]} />
      </mesh>
      {L('LIGHT', [0, 0.27, 0], 0.4)}
      {L('VARIEGATED', [0, 0.23, 0], 2.6)}
      {L(
        'FOIL',
        [0, 0.19, 0],
        -1.4,
        foil ? (
          <mesh position={[0.045, 0.002, 0]} rotation={[-Math.PI / 2 + 0.3, 0, 0]} material={mat.steel()}>
            <boxGeometry args={[0.022, 0.064, 0.002]} />
          </mesh>
        ) : null,
      )}
      {L('NOCO2', [0, 0.3, 0], -2.4)}
      {koh && !picked.includes('NOCO2') && (
        <group position={[-0.04, 0.24, 0.04]}>
          <mesh material={mat.glass()} renderOrder={5}>
            <sphereGeometry args={[0.05, 18, 14]} />
          </mesh>
          <mesh position={[0, -0.03, 0]} material={liquidMaterial('#eef2f4', 0.5)}>
            <sphereGeometry args={[0.035, 14, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
          </mesh>
        </group>
      )}
      {[1.2, 3.6, 5.0].map((r, k) => (
        <group key={k} position={[0, 0.2 + k * 0.04, 0]} rotation={[0, r, 0]}>
          <mesh position={[0.04, 0, 0]} rotation={[-Math.PI / 2 + 0.35, 0, 0]}>
            <planeGeometry args={[0.07, 0.045]} />
            <meshStandardMaterial color={dark ? '#3d6b33' : LEAF_GREEN} side={DoubleSide} />
          </mesh>
        </group>
      ))}
      {glow && <GlowRing r={0.12} />}
    </group>
  );
}

/** A boiling tube of ethanol (green once a leaf has been in it), standing upright; a flame on top when it has caught fire. */
export function EthanolTubeModel({ green, fire }: { green: number; fire: boolean }) {
  const flame = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (flame.current) flame.current.scale.set(1, 1 + Math.sin(clock.elapsedTime * 22) * 0.15, 1);
  });
  return (
    <group>
      <mesh position={[0, 0.07, 0]} material={mat.glass()} renderOrder={5}>
        <cylinderGeometry args={[0.012, 0.012, 0.14, 14, 1, true]} />
      </mesh>
      <mesh position={[0, 0.04, 0]} material={liquidMaterial(green > 0 ? (green > 0.6 ? '#3f8a3a' : '#8fbf5a') : '#eef4f2', green > 0 ? 0.75 : 0.3)} renderOrder={3}>
        <cylinderGeometry args={[0.011, 0.011, 0.07, 12]} />
      </mesh>
      {fire && (
        <mesh ref={flame} position={[0, 0.17, 0]} renderOrder={8}>
          <coneGeometry args={[0.02, 0.07, 14]} />
          <meshBasicMaterial color="#ff8a1e" transparent opacity={0.85} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

/** A rack of boiling tubes. */
export function TubeRackModel({ glow }: { glow?: boolean }) {
  return (
    <group>
      <BlobShadow r={0.08} />
      <mesh position={[0, 0.05, 0]} material={mat.wood()}>
        <boxGeometry args={[0.14, 0.012, 0.05]} />
      </mesh>
      {[-0.06, 0.06].map((x) => (
        <mesh key={x} position={[x, 0.025, 0]} material={mat.wood()}>
          <boxGeometry args={[0.012, 0.05, 0.05]} />
        </mesh>
      ))}
      {[-0.03, 0, 0.03].map((x) => (
        <mesh key={x} position={[x, 0.08, 0]} material={mat.glass()} renderOrder={5}>
          <cylinderGeometry args={[0.011, 0.011, 0.13, 12, 1, true]} />
        </mesh>
      ))}
      {glow && <GlowRing r={0.09} />}
    </group>
  );
}

/** A roll of aluminium foil. */
export function FoilModel({ glow }: { glow?: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.016, 0]} rotation={[0, 0, Math.PI / 2]} material={mat.steel()}>
        <cylinderGeometry args={[0.015, 0.015, 0.14, 16]} />
      </mesh>
      {glow && <GlowRing r={0.08} />}
    </group>
  );
}

/** A conical flask with potassium hydroxide solution and a split bung (before the leaf goes in). */
export function KohFlaskModel({ glow }: { glow?: boolean }) {
  return (
    <group>
      <BlobShadow r={0.05} />
      <mesh position={[0, 0.05, 0]} material={mat.glass()} renderOrder={5}>
        <cylinderGeometry args={[0.016, 0.045, 0.1, 20, 1, true]} />
      </mesh>
      <mesh position={[0, 0.015, 0]} material={liquidMaterial('#eef2f4', 0.5)} renderOrder={3}>
        <cylinderGeometry args={[0.037, 0.043, 0.026, 18]} />
      </mesh>
      <mesh position={[0, 0.108, 0]} material={mat.cork()}>
        <cylinderGeometry args={[0.018, 0.015, 0.02, 14]} />
      </mesh>
      {glow && <GlowRing r={0.055} />}
    </group>
  );
}
