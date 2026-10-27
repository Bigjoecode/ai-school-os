import { useMemo } from 'react';
import { BoxGeometry, CylinderGeometry, SphereGeometry, type Material } from 'three';
import { BlobShadow, GlowRing } from '../../../lab3d-kit/apparatus';
import { colourMaterial, liquidMaterial, mat } from '../../../lab3d-kit/materials';
import { jarLabelTexture, rulerTexture } from './textures';

/**
 * Small biology apparatus, built procedurally in the kit's style (primitives
 * and shared materials; the origin is the point the object stands on):
 * forceps, scalpel, mounted needle, brush, slides and cover slips, watch
 * glass, blotting paper, lens tissue, cotton buds, tape, hand lens, ruler,
 * gloves, trays and Petri dishes, and the specimens' raw materials.
 */

type V3 = [number, number, number];
const box = new BoxGeometry(1, 1, 1);
const cyl = new CylinderGeometry(1, 1, 1, 16);
const ball = new SphereGeometry(1, 16, 12);
export function Box({ p, s, m, r }: { p: V3; s: V3; m: Material; r?: V3 }) {
  return <mesh geometry={box} material={m} position={p} scale={s} rotation={r} />;
}
export function Rod({ p, s, m, r }: { p: V3; s: V3; m: Material; r?: V3 }) {
  return <mesh geometry={cyl} material={m} position={p} scale={s} rotation={r} />;
}
export function Ball({ p, s, m }: { p: V3; s: V3; m: Material }) {
  return <mesh geometry={ball} material={m} position={p} scale={s} />;
}
/** A long thin thing lying along x on the bench (handle + tip), e.g. a needle or a scalpel. */
const along: V3 = [0, 0, Math.PI / 2];

export function Forceps({ glow }: { glow?: boolean }) {
  return (
    <group>
      {[-1, 1].map((s) => (
        <Box key={s} p={[0, 0.003, s * 0.004]} s={[0.12, 0.003, 0.004]} r={[0, s * 0.05, 0]} m={mat.steel()} />
      ))}
      <Box p={[-0.058, 0.003, 0]} s={[0.012, 0.004, 0.011]} m={mat.steel()} />
      {glow && <GlowRing r={0.07} />}
    </group>
  );
}
export function Scalpel({ glow }: { glow?: boolean }) {
  return (
    <group>
      <Box p={[-0.02, 0.004, 0]} s={[0.09, 0.006, 0.01]} m={mat.darkMetal()} />
      <Box p={[0.04, 0.004, 0.001]} s={[0.032, 0.002, 0.009]} r={[0, 0.15, 0]} m={mat.steel()} />
      {glow && <GlowRing r={0.07} />}
    </group>
  );
}
export function MountedNeedle({ glow }: { glow?: boolean }) {
  return (
    <group>
      <Rod p={[-0.02, 0.005, 0]} s={[0.005, 0.08, 0.005]} r={along} m={mat.wood()} />
      <Rod p={[0.04, 0.005, 0]} s={[0.0009, 0.045, 0.0009]} r={along} m={mat.steel()} />
      {glow && <GlowRing r={0.07} />}
    </group>
  );
}
export function Brush({ glow }: { glow?: boolean }) {
  return (
    <group>
      <Rod p={[-0.01, 0.004, 0]} s={[0.004, 0.1, 0.004]} r={along} m={colourMaterial('#c62828')} />
      <Rod p={[0.046, 0.004, 0]} s={[0.003, 0.015, 0.003]} r={along} m={mat.steel()} />
      <Ball p={[0.06, 0.004, 0]} s={[0.008, 0.0035, 0.0035]} m={colourMaterial('#3e2a1a')} />
      {glow && <GlowRing r={0.07} />}
    </group>
  );
}
/** A microscope slide (75 × 25 mm), optionally a cavity slide. */
export function Slide({ cavity = false }: { cavity?: boolean }) {
  return (
    <group>
      <Box p={[0, 0.0006, 0]} s={[0.075, 0.0012, 0.025]} m={mat.glass()} />
      <Box p={[-0.03, 0.00125, 0]} s={[0.014, 0.0002, 0.024]} m={mat.cabinet()} />
      {cavity && <Ball p={[0.004, 0.0012, 0]} s={[0.007, 0.0004, 0.007]} m={colourMaterial('#d9e6ea')} />}
    </group>
  );
}
export function CoverSlip() {
  return <Box p={[0, 0.0002, 0]} s={[0.022, 0.0003, 0.022]} m={mat.pane()} />;
}
/** A box of clean slides with a box of cover slips beside it. */
export function SlideBox({ glow }: { glow?: boolean }) {
  const label = useMemo(() => jarLabelTexture('Slides', '#37474f'), []);
  return (
    <group>
      <Box p={[0, 0.012, 0]} s={[0.085, 0.024, 0.035]} m={colourMaterial('#455a64')} />
      <mesh position={[0, 0.0245, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.06, 0.025]} />
        <meshStandardMaterial map={label} roughness={0.8} />
      </mesh>
      <Box p={[0.075, 0.006, 0.005]} s={[0.03, 0.012, 0.03]} m={colourMaterial('#90a4ae')} />
      <Box p={[0.075, 0.0125, 0.005]} s={[0.022, 0.0006, 0.022]} m={mat.pane()} />
      <BlobShadow r={0.07} />
      {glow && <GlowRing r={0.08} />}
    </group>
  );
}
export function WatchGlass({ liquid = true, glow }: { liquid?: boolean; glow?: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.008, 0]} scale={[0.04, 0.008, 0.04]} material={mat.glass()}>
        <sphereGeometry args={[1, 20, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
      </mesh>
      {liquid && <Rod p={[0, 0.004, 0]} s={[0.03, 0.002, 0.03]} m={liquidMaterial('#dfeef3', 0.45)} />}
      <BlobShadow r={0.045} />
      {glow && <GlowRing r={0.05} />}
    </group>
  );
}
export function FilterPaper({ glow }: { glow?: boolean }) {
  return (
    <group>
      {[0, 1, 2].map((k) => (
        <mesh key={k} position={[k * 0.006, 0.0005 + k * 0.0006, k * 0.004]} rotation={[-Math.PI / 2, 0, k * 0.3]} material={mat.white()}>
          <circleGeometry args={[0.045, 28]} />
        </mesh>
      ))}
      {glow && <GlowRing r={0.055} />}
    </group>
  );
}
export function LensTissue({ glow }: { glow?: boolean }) {
  return (
    <group>
      <Box p={[0, 0.006, 0]} s={[0.07, 0.012, 0.05]} m={colourMaterial('#f3f0e6')} />
      <Box p={[0, 0.0125, 0]} s={[0.05, 0.001, 0.03]} m={colourMaterial('#4f8a7a')} />
      <BlobShadow r={0.05} />
      {glow && <GlowRing r={0.055} />}
    </group>
  );
}
export function CottonBuds({ glow }: { glow?: boolean }) {
  return (
    <group>
      <Box p={[0, 0.008, 0]} s={[0.09, 0.016, 0.04]} m={colourMaterial('#e3f2fd')} />
      {[-0.008, 0, 0.008].map((z, k) => (
        <group key={z} position={[0, 0.018 + k * 0.001, z]}>
          <Rod p={[0, 0, 0]} s={[0.0015, 0.075, 0.0015]} r={along} m={mat.white()} />
          <Ball p={[0.04, 0, 0]} s={[0.006, 0.004, 0.004]} m={mat.white()} />
          <Ball p={[-0.04, 0, 0]} s={[0.006, 0.004, 0.004]} m={mat.white()} />
        </group>
      ))}
      {glow && <GlowRing r={0.06} />}
    </group>
  );
}
export function TapeRoll({ glow }: { glow?: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.009, 0]} rotation={[Math.PI / 2, 0, 0]} material={colourMaterial('#e6f0f3')}>
        <torusGeometry args={[0.022, 0.008, 8, 20]} />
      </mesh>
      {glow && <GlowRing r={0.04} />}
    </group>
  );
}
/** A beaker of disinfectant (pale pink) used for swabs and slides. */
export function DisinfectantBeaker({ glow, used = false }: { glow?: boolean; used?: boolean }) {
  const label = useMemo(() => jarLabelTexture('Disinfectant', '#6a1b9a'), []);
  return (
    <group>
      <Rod p={[0, 0.032, 0]} s={[0.031, 0.06, 0.031]} m={liquidMaterial('#f3c6d9', 0.45)} />
      <mesh position={[0, 0.042, 0]} scale={[0.034, 0.084, 0.034]} geometry={cyl} material={mat.glass()} />
      <mesh position={[0, 0.045, 0.0345]}>
        <planeGeometry args={[0.04, 0.02]} />
        <meshStandardMaterial map={label} roughness={0.8} />
      </mesh>
      {used && <Rod p={[0.008, 0.07, 0]} s={[0.0015, 0.07, 0.0015]} r={[0, 0, 0.25]} m={mat.white()} />}
      <BlobShadow r={0.045} />
      {glow && <GlowRing r={0.05} />}
    </group>
  );
}
/** A hand lens (magnifying glass). */
export function HandLens({ glow }: { glow?: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.006, 0]} rotation={[Math.PI / 2, 0, 0]} material={mat.darkMetal()}>
        <torusGeometry args={[0.03, 0.004, 8, 28]} />
      </mesh>
      <Rod p={[0, 0.006, 0]} s={[0.029, 0.003, 0.029]} m={mat.glass()} />
      <Box p={[0.075, 0.006, 0]} s={[0.08, 0.012, 0.016]} m={colourMaterial('#2b2b2b')} />
      <BlobShadow r={0.05} />
      {glow && <GlowRing r={0.08} />}
    </group>
  );
}
/** A 30 cm ruler lying flat (its zero `pad` metres in from the left end). */
// The face's marks span all but 10 px at each end of 64 px per cm: this length makes them true centimetres.
export const RULER = { cm: 30, len: 0.3 / (1 - 20 / (64 * 30)), w: 0.032 };
export const rulerZeroX = -RULER.len / 2 + (10 / (64 * RULER.cm)) * RULER.len;
export function Ruler({ glow }: { glow?: boolean }) {
  const face = useMemo(() => rulerTexture(RULER.cm), []);
  return (
    <group>
      <Box p={[0, 0.0015, 0]} s={[RULER.len, 0.003, RULER.w]} m={colourMaterial('#e8d79a')} />
      <mesh position={[0, 0.0031, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[RULER.len, RULER.w]} />
        <meshStandardMaterial map={face} roughness={0.6} />
      </mesh>
      {glow && <GlowRing r={0.17} />}
    </group>
  );
}
/** A box of disposable gloves. */
export function GlovesBox({ glow, open }: { glow?: boolean; open?: boolean }) {
  const label = useMemo(() => jarLabelTexture('Gloves  M', '#1e88e5'), []);
  return (
    <group>
      <Box p={[0, 0.035, 0]} s={[0.13, 0.07, 0.07]} m={colourMaterial('#e3f2fd')} />
      <mesh position={[0, 0.035, 0.0352]}>
        <planeGeometry args={[0.1, 0.05]} />
        <meshStandardMaterial map={label} roughness={0.8} />
      </mesh>
      <Ball p={[0, 0.072, 0]} s={[0.02, 0.008, 0.012]} m={colourMaterial('#90caf9')} />
      {open && <Ball p={[0.1, 0.006, 0.02]} s={[0.035, 0.005, 0.02]} m={colourMaterial('#90caf9')} />}
      <BlobShadow r={0.08} />
      {glow && <GlowRing r={0.09} />}
    </group>
  );
}
/** A white enamel specimen tray. */
export function Tray({ w = 0.24, d = 0.18, glow }: { w?: number; d?: number; glow?: boolean }) {
  return (
    <group>
      <Box p={[0, 0.003, 0]} s={[w, 0.006, d]} m={mat.tile()} />
      {[-1, 1].map((s) => (
        <group key={s}>
          <Box p={[(s * w) / 2, 0.011, 0]} s={[0.006, 0.016, d]} m={mat.tile()} />
          <Box p={[0, 0.011, (s * d) / 2]} s={[w, 0.016, 0.006]} m={mat.tile()} />
        </group>
      ))}
      <Box p={[0, 0.0185, -d / 2]} s={[w + 0.006, 0.002, 0.008]} m={colourMaterial('#3f51b5')} />
      <BlobShadow r={Math.max(w, d) * 0.62} />
      {glow && <GlowRing r={Math.max(w, d) * 0.62} />}
    </group>
  );
}
export function PetriDish({ r = 0.045, glow }: { r?: number; glow?: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.007, 0]} scale={[r, 0.014, r]} geometry={cyl} material={mat.glass()} />
      <Rod p={[0, 0.0008, 0]} s={[r * 0.98, 0.0012, r * 0.98]} m={colourMaterial('#f4f6f4')} />
      <BlobShadow r={r * 1.15} />
      {glow && <GlowRing r={r * 1.2} />}
    </group>
  );
}

// ------------------------------------------------------------------ raw materials for the slides
export function OnionBulb({ red = false, glow }: { red?: boolean; glow?: boolean }) {
  const skin = colourMaterial(red ? '#7b1f3a' : '#b8762e');
  const flesh = colourMaterial(red ? '#e8c7d3' : '#f3ecd2');
  return (
    <group>
      <Ball p={[0, 0.03, 0]} s={[0.036, 0.031, 0.036]} m={skin} />
      <mesh position={[0, 0.068, 0]} scale={[0.008, 0.02, 0.008]} material={skin}>
        <coneGeometry args={[1, 1, 10]} />
      </mesh>
      {/* a fleshy scale leaf snapped off beside it, its thin inner skin showing */}
      <group position={[0.062, 0.004, 0.012]} rotation={[0, 0.4, 0]}>
        <mesh scale={[0.028, 0.012, 0.016]} material={flesh}>
          <sphereGeometry args={[1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
        <Box p={[0, 0.0005, 0]} s={[0.046, 0.001, 0.024]} m={skin} />
      </group>
      <BlobShadow r={0.06} />
      {glow && <GlowRing r={0.07} />}
    </group>
  );
}
export function PondJar({ glow }: { glow?: boolean }) {
  const label = useMemo(() => jarLabelTexture('Pond water', '#2e7d32'), []);
  return (
    <group>
      <Rod p={[0, 0.04, 0]} s={[0.032, 0.07, 0.032]} m={liquidMaterial('#9fbf7a', 0.55)} />
      <Rod p={[0, 0.072, 0]} s={[0.031, 0.006, 0.031]} m={colourMaterial('#5f8f3a')} />
      <mesh position={[0, 0.048, 0]} scale={[0.035, 0.096, 0.035]} geometry={cyl} material={mat.glass()} />
      <mesh position={[0, 0.03, 0.0355]}>
        <planeGeometry args={[0.045, 0.022]} />
        <meshStandardMaterial map={label} roughness={0.8} />
      </mesh>
      <BlobShadow r={0.045} />
      {glow && <GlowRing r={0.05} />}
    </group>
  );
}
/** A young stem standing in a beaker of water. */
export function StemInWater({ glow }: { glow?: boolean }) {
  return (
    <group>
      <Rod p={[0, 0.03, 0]} s={[0.026, 0.05, 0.026]} m={liquidMaterial('#dfeef3', 0.4)} />
      <mesh position={[0, 0.035, 0]} scale={[0.029, 0.07, 0.029]} geometry={cyl} material={mat.glass()} />
      <Rod p={[0, 0.09, 0]} s={[0.004, 0.17, 0.004]} r={[0, 0, 0.05]} m={colourMaterial('#6a9a3a')} />
      {[0.12, 0.15].map((y, k) => (
        <mesh key={y} position={[k ? -0.02 : 0.02, y, 0]} rotation={[0, 0, k ? 0.9 : -0.9]} scale={[0.026, 0.002, 0.012]} geometry={ball} material={colourMaterial('#5f9a3a')} />
      ))}
      <BlobShadow r={0.04} />
      {glow && <GlowRing r={0.05} />}
    </group>
  );
}
export function Leaf({ glow }: { glow?: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.002, 0]} rotation={[0, 0.3, 0]} scale={[0.06, 0.002, 0.03]} geometry={ball} material={colourMaterial('#4f8f2e')} />
      <Rod p={[-0.07, 0.002, -0.02]} s={[0.0015, 0.03, 0.0015]} r={[0, 0.3, Math.PI / 2]} m={colourMaterial('#3d6f22')} />
      {glow && <GlowRing r={0.07} />}
    </group>
  );
}
