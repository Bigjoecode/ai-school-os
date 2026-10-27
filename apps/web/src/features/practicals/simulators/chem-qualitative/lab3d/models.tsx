import type { QualGasTest, QualVisual } from '@aischool/shared';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { LatheGeometry, Vector2, type Group, type Mesh } from 'three';
import { BlobShadow, GlowRing } from '../../../lab3d-kit/apparatus';
import { colourMaterial, liquidMaterial, mat } from '../../../lab3d-kit/materials';

/**
 * The qualitative-analysis apparatus, at true size (metres), drawn from the
 * shared outcome of each test (`qualObserve(v, test).visual`): liquid colour,
 * precipitate, solid (hot and cold), effervescence, fumes, the brown ring,
 * deposits, droplets, sublimate, the flame-test colour and the gas-test
 * papers, splints and lime water at the mouth of the tube.
 */

export const TUBE = { r: 0.0085, h: 0.15 };
/** A colourless (very pale) solution should look like water, not milk; coloured ones show their colour. */
export function liquidOpacity(hex: string) {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return lum > 0.86 ? 0.28 : 0.78;
}
const v2 = (x: number, y: number) => new Vector2(x, y);

/** A test tube standing on its rounded bottom (origin at the bottom). `hot`: the solid shows its hot colour. */
export function TestTube({ vis, hot = false, small = false, glow }: { vis: QualVisual | null; hot?: boolean; small?: boolean; glow?: boolean }) {
  const glass = useMemo(() => {
    const pts = [v2(0, 0)];
    for (let i = 1; i <= 6; i++) {
      const a = (i / 6) * (Math.PI / 2);
      pts.push(v2(Math.sin(a) * TUBE.r, TUBE.r - Math.cos(a) * TUBE.r));
    }
    pts.push(v2(TUBE.r, TUBE.h - 0.003), v2(TUBE.r + 0.0012, TUBE.h));
    return new LatheGeometry(pts, 20);
  }, []);
  const r = TUBE.r - 0.0008;
  const liquidH = 0.055;
  const solidColour = vis ? (hot ? vis.solid : (vis.solidCold ?? vis.solid)) : null;
  return (
    <group scale={small ? 0.9 : 1}>
      {vis?.liquid && (
        <mesh position={[0, liquidH / 2 + 0.002, 0]} material={liquidMaterial(vis.liquid, liquidOpacity(vis.liquid))} renderOrder={2}>
          <cylinderGeometry args={[r, r, liquidH, 16]} />
        </mesh>
      )}
      {vis?.ppt && (
        <mesh position={[0, 0.012, 0]} material={colourMaterial(vis.ppt)} renderOrder={3}>
          <cylinderGeometry args={[r - 0.0003, r - 0.0012, 0.02, 14]} />
        </mesh>
      )}
      {!vis?.liquid && solidColour && (
        <mesh position={[0, 0.007, 0]} material={colourMaterial(solidColour)}>
          <cylinderGeometry args={[r - 0.0004, r - 0.0016, 0.012, 14]} />
        </mesh>
      )}
      {vis?.ring && vis.liquid && (
        <mesh position={[0, liquidH * 0.6, 0]} material={colourMaterial(vis.ring)} renderOrder={4}>
          <cylinderGeometry args={[r + 0.0001, r + 0.0001, 0.004, 16]} />
        </mesh>
      )}
      {vis?.deposit &&
        [0, 1, 2, 3, 4, 5].map((k) => (
          <mesh key={k} position={[Math.cos(k * 1.1) * r * 0.6, 0.006 + (k % 3) * 0.004, Math.sin(k * 1.1) * r * 0.6]} material={colourMaterial(vis.deposit!)}>
            <sphereGeometry args={[0.0012, 6, 5]} />
          </mesh>
        ))}
      {vis?.sublimate && (
        <mesh position={[0, TUBE.h * 0.72, 0]} material={colourMaterial('#f4f4ee')}>
          <cylinderGeometry args={[r + 0.00005, r + 0.00005, 0.012, 16, 1, true]} />
        </mesh>
      )}
      {vis?.droplets &&
        [0, 1, 2, 3].map((k) => (
          <mesh key={k} position={[Math.cos(k * 1.7) * (r - 0.0002), TUBE.h * 0.8 - k * 0.006, Math.sin(k * 1.7) * (r - 0.0002)]} material={liquidMaterial('#bcd6ef', 0.9)}>
            <sphereGeometry args={[0.0011, 6, 5]} />
          </mesh>
        ))}
      {vis?.bubbles && vis.liquid && !small && <Bubbles r={r} top={liquidH} />}
      {vis?.fumes && !small && <Fumes colour={vis.fumes} />}
      <mesh geometry={glass} material={mat.glass()} renderOrder={5} />
      {glow && <GlowRing r={0.03} />}
    </group>
  );
}

/** Effervescence: small bubbles rising through the liquid. */
function Bubbles({ r, top }: { r: number; top: number }) {
  const ref = useRef<Group>(null);
  const seeds = useMemo(() => Array.from({ length: 10 }, (_, k) => ({ a: k * 2.3, d: (k % 3) / 3, s: 0.6 + (k % 4) * 0.15 })), []);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    g.children.forEach((c, k) => {
      const s = seeds[k]!;
      const f = (clock.elapsedTime * s.s + s.d) % 1;
      c.position.set(Math.cos(s.a) * r * 0.55, 0.004 + f * (top - 0.004), Math.sin(s.a) * r * 0.55);
    });
  });
  return (
    <group ref={ref}>
      {seeds.map((_, k) => (
        <mesh key={k} material={mat.glass()}>
          <sphereGeometry args={[0.0009, 6, 5]} />
        </mesh>
      ))}
    </group>
  );
}

/** Fumes or a coloured gas drifting out of the mouth of the tube. */
function Fumes({ colour }: { colour: string }) {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    g.children.forEach((c, k) => {
      const f = (clock.elapsedTime * 0.35 + k / 5) % 1;
      c.position.set(Math.sin(k * 2 + f * 2) * 0.008, TUBE.h + f * 0.07, Math.cos(k * 1.3) * 0.006);
      c.scale.setScalar(0.5 + f * 1.4);
      ((c as Mesh).material as { opacity: number }).opacity = 0.5 * (1 - f);
    });
  });
  return (
    <group ref={ref}>
      {[0, 1, 2, 3, 4].map((k) => (
        <mesh key={k} renderOrder={6}>
          <sphereGeometry args={[0.008, 10, 8]} />
          <meshBasicMaterial color={colour} transparent opacity={0.4} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/** The gas test held at the mouth of the tube: a paper strip, a splint, a rod, or a tube of lime water. */
export function GasProbe({ test, colour, k }: { test: QualGasTest; colour: string; k: number }) {
  const x = 0.012 + k * 0.012;
  const y = TUBE.h + 0.012;
  if (test === 'LIME_WATER')
    return (
      <group position={[0.03 + k * 0.012, 0, 0]}>
        <mesh position={[0, 0.03, 0]} material={liquidMaterial(colour, 0.85)}>
          <cylinderGeometry args={[0.007, 0.007, 0.05, 12]} />
        </mesh>
        <mesh position={[0, 0.05, 0]} material={mat.glass()}>
          <cylinderGeometry args={[0.008, 0.008, 0.1, 12, 1, true]} />
        </mesh>
        <mesh position={[-0.015, TUBE.h + 0.01, 0]} rotation={[0, 0, 0.6]} material={mat.glass()}>
          <cylinderGeometry args={[0.0018, 0.0018, 0.06, 6]} />
        </mesh>
      </group>
    );
  if (test === 'GLOWING_SPLINT' || test === 'BURNING_SPLINT')
    return (
      <group position={[x, y, 0]} rotation={[0, 0, 0.5]}>
        <mesh position={[0, 0.05, 0]} material={mat.wood()}>
          <boxGeometry args={[0.003, 0.1, 0.003]} />
        </mesh>
        <mesh position={[0, 0.0, 0]}>
          <sphereGeometry args={[test === 'BURNING_SPLINT' ? 0.006 : 0.0035, 10, 8]} />
          <meshBasicMaterial color={colour} toneMapped={false} />
        </mesh>
      </group>
    );
  if (test === 'HCL_ROD' || test === 'NH3_ROD')
    return (
      <group position={[x, y, 0]} rotation={[0, 0, 0.4]}>
        <mesh position={[0, 0.05, 0]} material={mat.glass()}>
          <cylinderGeometry args={[0.0018, 0.0018, 0.1, 6]} />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.009, 10, 8]} />
          <meshBasicMaterial color={colour} transparent opacity={0.55} depthWrite={false} />
        </mesh>
      </group>
    );
  // Test papers and litmus: a damp strip held over the mouth.
  return (
    <mesh position={[x, y + 0.012, 0]} rotation={[0, 0, 0.3]} material={colourMaterial(colour)}>
      <boxGeometry args={[0.008, 0.035, 0.0008]} />
    </mesh>
  );
}

/** The Bunsen burner, with its flame when lit (`colour`: a flame-test colour; else the blue roaring flame). */
export function Burner({ lit, colour, glow }: { lit: boolean; colour?: string | null; glow?: boolean }) {
  const flame = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (flame.current) flame.current.scale.set(1, 1 + Math.sin(clock.elapsedTime * 18) * 0.05, 1);
  });
  return (
    <group>
      <BlobShadow r={0.06} />
      <mesh position={[0, 0.006, 0]} material={mat.darkMetal()}>
        <cylinderGeometry args={[0.04, 0.045, 0.012, 20]} />
      </mesh>
      <mesh position={[0, 0.08, 0]} material={mat.metal()}>
        <cylinderGeometry args={[0.008, 0.009, 0.14, 14]} />
      </mesh>
      <mesh position={[0, 0.035, 0]} material={mat.metal()}>
        <cylinderGeometry args={[0.012, 0.012, 0.02, 14]} />
      </mesh>
      <mesh position={[0.03, 0.02, 0]} rotation={[0, 0, Math.PI / 2]} material={mat.rubber()}>
        <cylinderGeometry args={[0.004, 0.004, 0.05, 8]} />
      </mesh>
      {lit && (
        <group ref={flame} position={[0, 0.15, 0]}>
          <mesh position={[0, 0.03, 0]} renderOrder={7}>
            <coneGeometry args={[0.009, 0.065, 14]} />
            <meshBasicMaterial color={colour ?? '#5b8cff'} transparent opacity={0.6} depthWrite={false} toneMapped={false} />
          </mesh>
          <mesh position={[0, 0.015, 0]} renderOrder={8}>
            <coneGeometry args={[0.005, 0.03, 12]} />
            <meshBasicMaterial color={colour ? '#ffffff' : '#9fd0ff'} transparent opacity={0.7} depthWrite={false} toneMapped={false} />
          </mesh>
        </group>
      )}
      {glow && <GlowRing r={0.06} />}
    </group>
  );
}

/** A wooden rack holding up to six test tubes (the earlier tests). */
export function TubeRack({ tubes, glow }: { tubes: (QualVisual | null)[]; glow?: boolean }) {
  return (
    <group>
      <BlobShadow r={0.13} />
      <mesh position={[0, 0.05, 0]} material={mat.wood()}>
        <boxGeometry args={[0.22, 0.012, 0.06]} />
      </mesh>
      <mesh position={[0, 0.006, 0]} material={mat.wood()}>
        <boxGeometry args={[0.22, 0.012, 0.06]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.105, 0.028, 0]} material={mat.wood()}>
          <boxGeometry args={[0.01, 0.045, 0.06]} />
        </mesh>
      ))}
      {Array.from({ length: 6 }, (_, k) => (
        <group key={k} position={[-0.085 + k * 0.034, 0.012, 0]}>
          <TestTube vis={tubes[k] ?? null} small />
        </group>
      ))}
      {glow && <GlowRing r={0.13} />}
    </group>
  );
}

/** A wooden test-tube holder (a peg clamp). */
export function Holder({ glow }: { glow?: boolean }) {
  return (
    <group rotation={[0, 0.4, Math.PI / 2]} position={[0.09, 0.006, 0]}>
      <mesh position={[0, 0.07, 0]} material={mat.wood()}>
        <boxGeometry args={[0.012, 0.14, 0.008]} />
      </mesh>
      <mesh position={[0.006, 0.15, 0]} material={mat.metal()}>
        <boxGeometry args={[0.004, 0.03, 0.01]} />
      </mesh>
      {glow && <GlowRing r={0.05} />}
    </group>
  );
}

/** A beaker of a prepared sample (solution, filtrate), coloured like it. */
export function SampleBeaker({ colour, glow }: { colour: string; glow?: boolean }) {
  return (
    <group>
      <BlobShadow r={0.04} />
      <mesh position={[0, 0.022, 0]} material={liquidMaterial(colour, liquidOpacity(colour))} renderOrder={2}>
        <cylinderGeometry args={[0.024, 0.024, 0.04, 20]} />
      </mesh>
      <mesh position={[0, 0.035, 0]} material={mat.glass()} renderOrder={4}>
        <cylinderGeometry args={[0.027, 0.026, 0.07, 22, 1, true]} />
      </mesh>
      <mesh position={[0, 0.05, 0.0275]}>
        <planeGeometry args={[0.04, 0.014]} />
        <meshBasicMaterial color="#fbfaf5" />
      </mesh>
      {glow && <GlowRing r={0.04} />}
    </group>
  );
}

/** The residue on a filter paper in a funnel (mixtures). */
export function FilterFunnel({ residue, glow }: { residue: string | null; glow?: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.09, 0]} rotation={[Math.PI, 0, 0]} material={mat.glass()}>
        <coneGeometry args={[0.035, 0.045, 20, 1, true]} />
      </mesh>
      <mesh position={[0, 0.06, 0]} material={mat.glass()}>
        <cylinderGeometry args={[0.003, 0.003, 0.03, 8]} />
      </mesh>
      <mesh position={[0, 0.092, 0]} rotation={[Math.PI, 0, 0]} material={colourMaterial('#f7f5ee')}>
        <coneGeometry args={[0.03, 0.035, 16, 1, true]} />
      </mesh>
      {residue && (
        <mesh position={[0, 0.082, 0]} material={colourMaterial(residue)}>
          <sphereGeometry args={[0.009, 10, 8]} />
        </mesh>
      )}
      {glow && <GlowRing r={0.04} />}
    </group>
  );
}

/** The holder gripping a tube near its mouth while it is heated (in the tube's own frame). */
export function HeldInHolder() {
  const y = TUBE.h * 0.8;
  return (
    <group position={[0, y, 0]}>
      <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]} material={mat.metal()}>
        <torusGeometry args={[TUBE.r + 0.0015, 0.0018, 6, 18]} />
      </mesh>
      <mesh position={[-0.016, 0, 0]} material={mat.metal()}>
        <boxGeometry args={[0.016, 0.004, 0.006]} />
      </mesh>
      <mesh position={[-0.085, -0.003, 0]} material={mat.wood()}>
        <boxGeometry args={[0.13, 0.012, 0.009]} />
      </mesh>
    </group>
  );
}

/** The nichrome wire held in the edge of the flame (origin: the loop at the tip). */
export function FlameWire({ glow }: { glow?: boolean }) {
  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]} material={mat.steel()}>
        <torusGeometry args={[0.0025, 0.0007, 4, 12]} />
      </mesh>
      <mesh position={[-0.042, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={mat.steel()}>
        <cylinderGeometry args={[0.0007, 0.0007, 0.08, 4]} />
      </mesh>
      <mesh position={[-0.11, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={mat.cork()}>
        <cylinderGeometry args={[0.005, 0.005, 0.06, 8]} />
      </mesh>
      {glow && <GlowRing r={0.04} />}
    </group>
  );
}

/** The nichrome wire in its cork handle. */
export function NichromeWire({ glow }: { glow?: boolean }) {
  return (
    <group rotation={[0, 0.3, Math.PI / 2]} position={[0.08, 0.006, 0]}>
      <mesh position={[0, 0.03, 0]} material={mat.cork()}>
        <cylinderGeometry args={[0.005, 0.005, 0.06, 8]} />
      </mesh>
      <mesh position={[0, 0.1, 0]} material={mat.steel()}>
        <cylinderGeometry args={[0.0007, 0.0007, 0.08, 4]} />
      </mesh>
      {glow && <GlowRing r={0.05} />}
    </group>
  );
}

/** A spatula lying on the bench. */
export function Spatula({ glow }: { glow?: boolean }) {
  return (
    <group rotation={[0, 0.2, 0]}>
      <mesh position={[0, 0.003, 0]} material={mat.steel()}>
        <boxGeometry args={[0.15, 0.002, 0.008]} />
      </mesh>
      {glow && <GlowRing r={0.05} />}
    </group>
  );
}

/** The gas-test kit on a tray: litmus papers, splints, a tube of lime water, test papers. */
export function GasKit({ glow }: { glow?: boolean }) {
  return (
    <group>
      <BlobShadow r={0.09} />
      <mesh position={[0, 0.004, 0]} material={mat.white()}>
        <boxGeometry args={[0.16, 0.008, 0.1]} />
      </mesh>
      {[['#c8343c', -0.06], ['#4a63c9', -0.045], ['#f08a24', -0.03], ['#8a2f9e', -0.015], ['#f4f1e8', 0]].map(([c, x]) => (
        <mesh key={String(x)} position={[x as number, 0.01, -0.02]} material={colourMaterial(c as string)}>
          <boxGeometry args={[0.01, 0.002, 0.04]} />
        </mesh>
      ))}
      {[0.02, 0.026, 0.032].map((x) => (
        <mesh key={x} position={[x, 0.011, 0.02]} rotation={[Math.PI / 2, 0, 0.1]} material={mat.wood()}>
          <boxGeometry args={[0.003, 0.08, 0.003]} />
        </mesh>
      ))}
      <mesh position={[0.06, 0.035, -0.02]} material={liquidMaterial('#e6eff8', 0.6)}>
        <cylinderGeometry args={[0.008, 0.008, 0.05, 12]} />
      </mesh>
      <mesh position={[0.06, 0.05, -0.02]} material={mat.glass()}>
        <cylinderGeometry args={[0.009, 0.009, 0.09, 12, 1, true]} />
      </mesh>
      {glow && <GlowRing r={0.1} />}
    </group>
  );
}
