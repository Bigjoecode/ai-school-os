import { useMemo } from 'react';
import { BoxGeometry, CylinderGeometry, SphereGeometry, TorusGeometry, type Material } from 'three';
import { BlobShadow } from '../../../lab3d-kit/apparatus';
import { Interactive } from '../../../lab3d-kit/interact';
import { CUPBOARD, FUME, HALF_D, HALF_W, SHELF } from '../../../lab3d-kit/layout';
import { colourMaterial, liquidMaterial, mat } from '../../../lab3d-kit/materials';
import type { RoomConfig } from '../../../lab3d-kit/room';
import { customPosterTexture, type PosterSpec } from '../../../lab3d-kit/textures';
import { bioSignTexture, cellChartTexture, classificationTexture, foodChainTexture, jarLabelTexture } from './textures';

/**
 * The biology laboratory, on the kit's room: the same benches, sinks,
 * cupboard and safety corner, with the chemistry stock replaced by biology's —
 * a specimen shelf of preserved jars and models on the east wall, a skeleton
 * and a torso model in the front corner, wall charts (cells, a food chain,
 * classification), a hand-washing point where the fume cupboard was, and the
 * lab's safety signs (no eating, wash your hands, sharps and slides).
 */

type V3 = [number, number, number];
const box = new BoxGeometry(1, 1, 1);
const cyl = new CylinderGeometry(1, 1, 1, 18);
const ball = new SphereGeometry(1, 18, 14);
function Box({ p, s, m, r }: { p: V3; s: V3; m: Material; r?: V3 }) {
  return <mesh geometry={box} material={m} position={p} scale={s} rotation={r} />;
}
function Rod({ p, s, m, r }: { p: V3; s: V3; m: Material; r?: V3 }) {
  return <mesh geometry={cyl} material={m} position={p} scale={s} rotation={r} />;
}
function Ball({ p, s, m }: { p: V3; s: V3; m: Material }) {
  return <mesh geometry={ball} material={m} position={p} scale={s} />;
}
const bone = () => colourMaterial('#ece2c8');
const boneDark = () => colourMaterial('#cdbf9c');

/** A wall chart or poster (a plane just off the wall). */
function Chart({ p, r = [0, 0, 0], w, h, map, id, label }: { p: V3; r?: V3; w: number; h: number; map: ReturnType<typeof cellChartTexture>; id?: string; label?: string }) {
  const plane = (
    <mesh>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial map={map} roughness={0.65} />
    </mesh>
  );
  return id ? (
    <Interactive id={id} label={label ?? id} labelY={h / 2 + 0.08} position={p} rotation={r}>
      {plane}
    </Interactive>
  ) : (
    <group position={p} rotation={r}>
      {plane}
    </group>
  );
}

// ------------------------------------------------------------------ preserved specimens
/** What floats in a preserved-specimen jar (a simple silhouette in formalin). */
type JarKind = 'fish' | 'toad' | 'snake' | 'worm' | 'rat' | 'embryo' | 'crab' | 'heart';
function JarContents({ kind }: { kind: JarKind }) {
  const flesh = colourMaterial('#d8c7a2');
  const grey = colourMaterial('#9c9a8a');
  switch (kind) {
    case 'fish':
      return (
        <group>
          <Ball p={[0, 0.1, 0]} s={[0.022, 0.06, 0.01]} m={grey} />
          <Box p={[0, 0.045, 0]} s={[0.03, 0.018, 0.004]} r={[0, 0, 0.6]} m={grey} />
        </group>
      );
    case 'toad':
      return (
        <group>
          <Ball p={[0, 0.09, 0]} s={[0.035, 0.03, 0.02]} m={colourMaterial('#8a8a5a')} />
          <Ball p={[0, 0.125, 0]} s={[0.022, 0.016, 0.016]} m={colourMaterial('#8a8a5a')} />
          <Box p={[0.03, 0.06, 0]} s={[0.04, 0.008, 0.008]} r={[0, 0, -0.7]} m={colourMaterial('#8a8a5a')} />
          <Box p={[-0.03, 0.06, 0]} s={[0.04, 0.008, 0.008]} r={[0, 0, 0.7]} m={colourMaterial('#8a8a5a')} />
        </group>
      );
    case 'snake':
      return (
        <group position={[0, 0.06, 0]}>
          {[0, 1, 2].map((k) => (
            <mesh key={k} position={[0, k * 0.03, 0]} rotation={[Math.PI / 2, 0, k]} material={colourMaterial('#6f6a4a')}>
              <torusGeometry args={[0.025, 0.007, 8, 20]} />
            </mesh>
          ))}
        </group>
      );
    case 'worm':
      return (
        <mesh position={[0, 0.09, 0]} rotation={[0, 0, 0.3]} material={colourMaterial('#b07a6a')}>
          <torusGeometry args={[0.03, 0.005, 8, 24, Math.PI * 1.6]} />
        </mesh>
      );
    case 'rat':
      return (
        <group>
          <Ball p={[0, 0.09, 0]} s={[0.028, 0.05, 0.022]} m={flesh} />
          <Ball p={[0, 0.15, 0.005]} s={[0.016, 0.018, 0.016]} m={flesh} />
          <Rod p={[0, 0.03, 0]} s={[0.003, 0.05, 0.003]} r={[0, 0, 0.4]} m={flesh} />
        </group>
      );
    case 'embryo':
      return (
        <group>
          <Ball p={[0, 0.09, 0]} s={[0.03, 0.035, 0.026]} m={colourMaterial('#e2c9b8')} />
          <Ball p={[0.004, 0.135, 0.004]} s={[0.022, 0.022, 0.022]} m={colourMaterial('#e2c9b8')} />
        </group>
      );
    case 'crab':
      return (
        <group>
          <Ball p={[0, 0.09, 0]} s={[0.035, 0.022, 0.012]} m={colourMaterial('#b0623c')} />
          {[-1, 1].map((s) => (
            <Box key={s} p={[s * 0.04, 0.1, 0]} s={[0.03, 0.006, 0.006]} r={[0, 0, s * 0.5]} m={colourMaterial('#b0623c')} />
          ))}
        </group>
      );
    case 'heart':
      return <Ball p={[0, 0.09, 0]} s={[0.032, 0.042, 0.028]} m={colourMaterial('#8e3b36')} />;
  }
}
/** A glass specimen jar with a lid, formalin and a label. */
export function SpecimenJar({ kind, name, r = 0.05, h = 0.22, liquid = '#e9dca0' }: { kind: JarKind; name: string; r?: number; h?: number; liquid?: string }) {
  const label = useMemo(() => jarLabelTexture(name), [name]);
  return (
    <group>
      <mesh position={[0, h / 2, 0]} scale={[r, h, r]} geometry={cyl} material={mat.glass()} />
      <mesh position={[0, (h * 0.86) / 2, 0]} scale={[r * 0.95, h * 0.86, r * 0.95]} geometry={cyl} material={liquidMaterial(liquid, 0.38)} />
      <mesh position={[0, h + 0.012, 0]} scale={[r * 1.06, 0.024, r * 1.06]} geometry={cyl} material={mat.darkMetal()} />
      <group scale={(r / 0.05) * 0.9}>
        <JarContents kind={kind} />
      </group>
      <mesh position={[0, h * 0.28, r + 0.002]}>
        <planeGeometry args={[r * 1.5, r * 0.75]} />
        <meshStandardMaterial map={label} roughness={0.8} />
      </mesh>
    </group>
  );
}

const SHELF_JARS: { kind: JarKind; name: string; r?: number; h?: number }[] = [
  { kind: 'fish', name: 'Tilapia' },
  { kind: 'toad', name: 'Toad' },
  { kind: 'snake', name: 'Snake' },
  { kind: 'worm', name: 'Earthworm', r: 0.04, h: 0.18 },
  { kind: 'rat', name: 'Rat' },
  { kind: 'embryo', name: 'Embryo', r: 0.045, h: 0.2 },
  { kind: 'crab', name: 'Crab' },
  { kind: 'heart', name: 'Heart' },
  { kind: 'fish', name: 'Catfish', r: 0.055, h: 0.26 },
  { kind: 'worm', name: 'Tapeworm', r: 0.04, h: 0.18 },
];

/** A model skull (on the specimen shelf, or the skeleton's). */
function Skull({ s = 1, jaw = true }: { s?: number; jaw?: boolean }) {
  return (
    <group scale={s}>
      <Ball p={[0, 0.1, 0]} s={[0.075, 0.085, 0.09]} m={bone()} />
      <Box p={[0, 0.04, 0.045]} s={[0.07, 0.04, 0.06]} m={bone()} />
      {[-1, 1].map((k) => (
        <Ball key={k} p={[k * 0.028, 0.09, 0.078]} s={[0.019, 0.017, 0.012]} m={mat.black()} />
      ))}
      <Ball p={[0, 0.06, 0.088]} s={[0.008, 0.012, 0.006]} m={mat.black()} />
      {jaw && <Box p={[0, 0.012, 0.04]} s={[0.06, 0.018, 0.06]} m={boneDark()} />}
    </group>
  );
}

/** The specimen shelf on the east wall (where the chemistry room has its reagent shelf). */
export function SpecimenShelf() {
  const rows = [0.55, 1.05, 1.55];
  const sign = useMemo(() => bioSignTexture('SPECIMENS', '#5d4037', 'Do not open the jars'), []);
  return (
    <Interactive id="shelf" label="Specimen shelf" labelY={2.05} position={[SHELF.x, 0, SHELF.z]} rotation={[0, -Math.PI / 2, 0]}>
      <Box p={[0, SHELF.h / 2, -SHELF.d / 2 + 0.01]} s={[SHELF.w, SHELF.h, 0.02]} m={mat.woodDark()} />
      {[-1, 1].map((s) => (
        <Box key={s} p={[(s * SHELF.w) / 2, SHELF.h / 2, 0]} s={[0.03, SHELF.h, SHELF.d]} m={mat.woodDark()} />
      ))}
      <Box p={[0, 0.25, 0]} s={[SHELF.w, 0.5, SHELF.d]} m={mat.cabinet()} />
      {rows.map((y) => (
        <Box key={y} p={[0, y - 0.015, 0]} s={[SHELF.w, 0.03, SHELF.d]} m={mat.wood()} />
      ))}
      <Box p={[0, SHELF.h, 0]} s={[SHELF.w + 0.04, 0.03, SHELF.d + 0.02]} m={mat.woodDark()} />
      {SHELF_JARS.map((j, i) => {
        const row = i < 5 ? 0 : 1;
        const col = i % 5;
        return (
          <group key={j.name} position={[-0.84 + col * 0.42 + row * 0.08, rows[row]!, 0.03]}>
            <SpecimenJar kind={j.kind} name={j.name} r={j.r} h={j.h} />
          </group>
        );
      })}
      {/* top row: skulls, a model flower and a bone */}
      <group position={[-0.7, rows[2]!, 0]}>
        <Skull s={1.1} />
      </group>
      <group position={[-0.25, rows[2]!, 0]} rotation={[0, 0.6, 0]}>
        <Skull s={0.8} />
      </group>
      <group position={[0.25, rows[2]!, 0]}>
        <Rod p={[0, 0.13, 0]} s={[0.006, 0.26, 0.006]} m={mat.green()} />
        {[0, 1, 2, 3, 4].map((k) => (
          <mesh key={k} position={[Math.cos((k * Math.PI * 2) / 5) * 0.04, 0.27, Math.sin((k * Math.PI * 2) / 5) * 0.04]} scale={[0.04, 0.008, 0.026]} rotation={[0, -(k * Math.PI * 2) / 5, 0.3]} geometry={ball} material={colourMaterial('#d32f2f')} />
        ))}
        <Ball p={[0, 0.275, 0]} s={[0.015, 0.015, 0.015]} m={colourMaterial('#fbc02d')} />
        <Rod p={[0, 0.005, 0]} s={[0.05, 0.01, 0.05]} m={mat.darkMetal()} />
      </group>
      <group position={[0.75, rows[2]! + 0.02, 0]} rotation={[0, 0, Math.PI / 2]}>
        <Rod p={[0, 0, 0]} s={[0.012, 0.3, 0.012]} m={bone()} />
        <Ball p={[0, 0.16, 0]} s={[0.025, 0.022, 0.022]} m={bone()} />
        <Ball p={[0, -0.16, 0]} s={[0.028, 0.02, 0.024]} m={bone()} />
      </group>
      <mesh position={[0, 2.18, -SHELF.d / 2 + 0.03]}>
        <planeGeometry args={[0.7, 0.35]} />
        <meshBasicMaterial map={sign} />
      </mesh>
    </Interactive>
  );
}

// ------------------------------------------------------------------ models
/** The human skeleton model on its stand, in the front-left corner. */
export function SkeletonModel({ position }: { position: V3 }) {
  const ribs = useMemo(() => Array.from({ length: 9 }, (_, i) => ({ y: 1.42 - i * 0.035, r: 0.1 + Math.sin(((i + 1) / 10) * Math.PI) * 0.035 })), []);
  const rib = useMemo(() => new TorusGeometry(1, 0.06, 6, 24, Math.PI * 1.5), []);
  const b = bone();
  const limb = (from: V3, to: V3, r: number) => {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const len = Math.hypot(dx, dy);
    return <Rod p={[(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2]} s={[r, len, r]} r={[0, 0, -Math.atan2(dx, dy)]} m={b} />;
  };
  return (
    <Interactive id="skeleton" label="Human skeleton model" labelY={1.85} position={position} rotation={[0, 0.5, 0]}>
      {/* stand: a pole behind and a five-wheel base */}
      <Rod p={[0, 0.88, -0.12]} s={[0.012, 1.76, 0.012]} m={mat.darkMetal()} />
      <Box p={[0, 1.74, -0.06]} s={[0.012, 0.012, 0.12]} m={mat.darkMetal()} />
      {[0, 1, 2, 3, 4].map((k) => {
        const a = (k * Math.PI * 2) / 5;
        return (
          <group key={k}>
            <Box p={[Math.cos(a) * 0.14, 0.04, -0.12 + Math.sin(a) * 0.14]} s={[0.28, 0.02, 0.025]} r={[0, -a, 0]} m={mat.darkMetal()} />
            <Ball p={[Math.cos(a) * 0.27, 0.02, -0.12 + Math.sin(a) * 0.27]} s={[0.02, 0.02, 0.02]} m={mat.black()} />
          </group>
        );
      })}
      <group position={[0, 1.55, 0]}>
        <Skull />
      </group>
      {/* spine, ribs, sternum, collar bones */}
      {Array.from({ length: 22 }, (_, i) => (
        <Rod key={i} p={[0, 1.54 - i * 0.026, -0.02 + Math.sin((i / 22) * Math.PI) * 0.02]} s={[0.014, 0.02, 0.014]} m={i % 2 ? b : boneDark()} />
      ))}
      {ribs.map((rb) => (
        <mesh key={rb.y} geometry={rib} material={b} position={[0, rb.y, 0.04]} scale={[rb.r, rb.r * 0.75, rb.r]} rotation={[Math.PI / 2, 0, Math.PI * 0.25 + Math.PI]} />
      ))}
      <Box p={[0, 1.33, 0.115]} s={[0.025, 0.16, 0.01]} m={b} />
      {limb([-0.02, 1.47, 0.06], [-0.18, 1.47, 0.02], 0.008)}
      {limb([0.02, 1.47, 0.06], [0.18, 1.47, 0.02], 0.008)}
      {/* pelvis */}
      <mesh position={[0, 1.0, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[0.13, 0.09, 0.07]} material={b}>
        <torusGeometry args={[1, 0.28, 8, 20]} />
      </mesh>
      {/* arms */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <Ball p={[s * 0.19, 1.45, 0]} s={[0.022, 0.022, 0.022]} m={b} />
          {limb([s * 0.19, 1.45, 0], [s * 0.22, 1.17, 0], 0.013)}
          {limb([s * 0.22, 1.16, 0], [s * 0.24, 0.92, 0.02], 0.01)}
          <Box p={[s * 0.245, 0.87, 0.025]} s={[0.035, 0.07, 0.015]} m={b} />
          {/* legs */}
          <Ball p={[s * 0.09, 0.95, 0]} s={[0.024, 0.024, 0.024]} m={b} />
          {limb([s * 0.09, 0.95, 0], [s * 0.1, 0.52, 0], 0.016)}
          <Ball p={[s * 0.1, 0.51, 0.01]} s={[0.022, 0.02, 0.02]} m={boneDark()} />
          {limb([s * 0.1, 0.5, 0], [s * 0.1, 0.1, 0], 0.013)}
          <Box p={[s * 0.1, 0.075, 0.05]} s={[0.045, 0.025, 0.11]} m={b} />
        </group>
      ))}
      <BlobShadow r={0.32} opacity={0.6} />
    </Interactive>
  );
}

/** The human torso model (removable organs) on a plinth. */
export function TorsoModel({ position }: { position: V3 }) {
  const skin = colourMaterial('#d9a07f');
  return (
    <Interactive id="torso" label="Human torso model" labelY={1.6} position={position} rotation={[0, 0.35, 0]}>
      <Box p={[0, 0.45, 0]} s={[0.42, 0.9, 0.36]} m={mat.wood()} />
      <Box p={[0, 0.91, 0]} s={[0.46, 0.02, 0.4]} m={mat.woodDark()} />
      <group position={[0, 0.92, 0]}>
        <Rod p={[0, 0.03, 0]} s={[0.1, 0.06, 0.08]} m={mat.darkMetal()} />
        {/* the body shell, cut open at the front */}
        <Ball p={[0, 0.32, -0.02]} s={[0.17, 0.27, 0.1]} m={skin} />
        <Ball p={[0, 0.66, -0.01]} s={[0.075, 0.095, 0.085]} m={skin} />
        <Rod p={[0, 0.56, -0.01]} s={[0.04, 0.06, 0.04]} m={skin} />
        {/* organs at the front */}
        <Ball p={[-0.07, 0.43, 0.06]} s={[0.06, 0.1, 0.04]} m={colourMaterial('#e48a95')} />
        <Ball p={[0.07, 0.43, 0.06]} s={[0.06, 0.1, 0.04]} m={colourMaterial('#e48a95')} />
        <Ball p={[0.015, 0.4, 0.085]} s={[0.035, 0.045, 0.025]} m={colourMaterial('#b3262b')} />
        <Ball p={[-0.05, 0.27, 0.07]} s={[0.09, 0.045, 0.035]} m={colourMaterial('#7b3b2a')} />
        <Ball p={[0.06, 0.26, 0.07]} s={[0.05, 0.04, 0.03]} m={colourMaterial('#e8b3a0')} />
        <mesh position={[0, 0.14, 0.07]} scale={[0.06, 0.05, 0.03]} material={colourMaterial('#e7a895')}>
          <torusKnotGeometry args={[1, 0.3, 48, 8, 2, 5]} />
        </mesh>
      </group>
      <BlobShadow r={0.34} opacity={0.6} />
    </Interactive>
  );
}

// ------------------------------------------------------------------ hand-washing point
/** A hand-washing point (where the chemistry room has its fume cupboard): basin, elbow tap, soap, paper towels, a pedal bin. */
export function HandWashPoint() {
  const sign = useMemo(() => bioSignTexture('WASH YOUR HANDS', '#1565c0', 'before and after the practical'), []);
  const steps = useMemo(() => customPosterTexture({ title: 'Hand washing', band: '#1565c0', lines: ['1. Wet your hands.', '2. Soap: rub palms, backs, fingers and nails for 20 s.', '3. Rinse well.', '4. Dry with a paper towel; turn the tap off with your elbow.'] }), []);
  return (
    <Interactive id="handwash" label="Hand-washing point" labelY={1.6} position={[FUME.x, 0, -HALF_D + 0.32]}>
      {/* counter with cupboard doors */}
      <Box p={[0, 0.43, 0]} s={[1.4, 0.86, 0.6]} m={mat.cabinet()} />
      <Box p={[0, 0.88, 0]} s={[1.44, 0.04, 0.64]} m={mat.benchTop()} />
      {[-0.35, 0.35].map((x) => (
        <Box key={x} p={[x, 0.45, 0.302]} s={[0.62, 0.7, 0.02]} m={mat.wood()} />
      ))}
      {/* basin and the elbow-lever tap */}
      <Box p={[0, 0.901, 0.02]} s={[0.5, 0.004, 0.38]} m={mat.steel()} />
      <Box p={[0, 0.895, 0.02]} s={[0.44, 0.01, 0.32]} m={mat.darkMetal()} />
      <Rod p={[0, 1.08, -0.22]} s={[0.014, 0.36, 0.014]} m={mat.steel()} />
      <Rod p={[0, 1.25, -0.14]} s={[0.012, 0.18, 0.012]} r={[Math.PI / 2, 0, 0]} m={mat.steel()} />
      <Rod p={[0, 1.2, -0.06]} s={[0.011, 0.1, 0.011]} m={mat.steel()} />
      <Box p={[0.08, 1.02, -0.2]} s={[0.16, 0.014, 0.014]} r={[0, 0, -0.3]} m={mat.steel()} />
      {/* soap dispenser and paper towels on the wall */}
      <Box p={[-0.42, 1.25, -0.27]} s={[0.1, 0.18, 0.07]} m={mat.white()} />
      <Box p={[-0.42, 1.18, -0.23]} s={[0.03, 0.02, 0.03]} m={mat.darkMetal()} />
      <Box p={[0.48, 1.32, -0.26]} s={[0.28, 0.3, 0.09]} m={mat.white()} />
      <Box p={[0.48, 1.16, -0.22]} s={[0.2, 0.03, 0.01]} m={mat.cabinet()} />
      {/* pedal bin */}
      <group position={[0.85, 0, 0.1]}>
        <Rod p={[0, 0.2, 0]} s={[0.13, 0.4, 0.13]} m={mat.steel()} />
        <Box p={[0, 0.02, 0.14]} s={[0.08, 0.015, 0.06]} m={mat.darkMetal()} />
        <BlobShadow r={0.18} />
      </group>
      <mesh position={[0, 1.78, -0.29]}>
        <planeGeometry args={[0.8, 0.4]} />
        <meshBasicMaterial map={sign} />
      </mesh>
      <mesh position={[-0.75, 1.45, -0.29]}>
        <planeGeometry args={[0.45, 0.6]} />
        <meshStandardMaterial map={steps} roughness={0.6} />
      </mesh>
      <BlobShadow r={0.9} opacity={0.5} />
    </Interactive>
  );
}

/** A sign over the apparatus cupboard (the microscopes are kept there). */
export function CupboardSign() {
  const sign = useMemo(() => bioSignTexture('MICROSCOPES', '#37474f', 'and apparatus'), []);
  return (
    <mesh position={[CUPBOARD.x - CUPBOARD.d / 2 - 0.004, CUPBOARD.h - 0.09, CUPBOARD.z]} rotation={[0, -Math.PI / 2, 0]}>
      <planeGeometry args={[0.62, 0.16]} />
      <meshBasicMaterial map={sign} />
    </mesh>
  );
}

/** Everything the biology room adds: charts, signs, models, the shelf and the hand-washing point. */
function BioExtras() {
  const noEat = useMemo(() => customPosterTexture({ title: 'No eating', band: '#c62828', lines: ['No eating, drinking or chewing in the laboratory.', 'Keep your hands away from your mouth and eyes.'] }), []);
  const sharps = useMemo(() => customPosterTexture({ title: 'Sharps & slides', band: '#6a1b9a', lines: ['Cut away from your fingers.', 'Broken glass and used slides go in the sharps bin.', 'Cheek swabs go in the disinfectant.'] }), []);
  const specimens = useMemo(() => customPosterTexture({ title: 'Specimens', band: '#5d4037', lines: ['Wear gloves to handle preserved specimens.', 'Do not open the jars.', 'Wash your hands afterwards.'] }), []);
  return (
    <group>
      <Chart id="chart-cells" label="Wall chart: plant and animal cells" p={[-4.2, 1.75, -HALF_D + 0.012]} w={2.0} h={1.0} map={cellChartTexture()} />
      <Chart id="chart-food" label="Wall chart: a food chain" p={[-HALF_W + 0.012, 1.75, -1.5]} r={[0, Math.PI / 2, 0]} w={0.75} h={1.0} map={foodChainTexture()} />
      <Chart id="chart-class" label="Wall chart: classification" p={[-HALF_W + 0.012, 1.75, 1.5]} r={[0, Math.PI / 2, 0]} w={0.75} h={1.0} map={classificationTexture()} />
      <Chart p={[-1.0, 1.7, HALF_D - 0.012]} r={[0, Math.PI, 0]} w={0.6} h={0.8} map={noEat} />
      <Chart p={[-2.4, 1.7, HALF_D - 0.012]} r={[0, Math.PI, 0]} w={0.6} h={0.8} map={sharps} />
      <Chart p={[-3.8, 1.7, HALF_D - 0.012]} r={[0, Math.PI, 0]} w={0.6} h={0.8} map={specimens} />
      <SpecimenShelf />
      <HandWashPoint />
      <SkeletonModel position={[-6.25, 0, -4.25]} />
      <TorsoModel position={[-5.45, 0, -4.45]} />
      <CupboardSign />
    </group>
  );
}

/** The biology room: the lab's whiteboard and front poster, with the biology furniture. */
export function bioRoom({ whiteboard, note, poster }: { whiteboard: string[]; note: string; poster: PosterSpec }): RoomConfig {
  return {
    whiteboard,
    whiteboardNote: note,
    frontPoster: poster,
    reagentShelf: false,
    fumeCupboard: false,
    periodicTable: false,
    benchRacks: false,
    doorPoster: { title: 'Biology lab rules', band: '#2e7d32', lines: ['Lab coat on and buttoned.', 'No eating or drinking.', 'Handle specimens and sharps with care.', 'Wash your hands before you leave.'] },
    extras: <BioExtras />,
  };
}
