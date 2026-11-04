import { FOOD_SPOT_LABEL, FOOD_SPOT_SHOWS, type ClassmateLook, type FoodSpot } from '@aischool/shared';
import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { Color, DoubleSide, InstancedMesh, MeshStandardMaterial, Object3D, type Group } from 'three';
import { BlobShadow, GlowRing } from '../../../lab3d-kit/apparatus';
import { colourMaterial, mat } from '../../../lab3d-kit/materials';
import { Ball, Box, Rod } from '../../bio-common/lab3d/apparatus';
import { bioCanvas, FONT } from '../../bio-common/lab3d/textures';

/**
 * Procedural models for the genetics bench: the classmates (simple,
 * respectful stylised figures in school uniform, standing at the height board
 * or seated across the bench), the height board and set square, the hand on
 * the ruler, the health-card box and survey sheet, the beakers of beads, the
 * field-note cards, the sweep net, pooter and identification chart.
 */

type V3 = [number, number, number];
const TONES = ['#5a3826', '#6e4430', '#80523a', '#946446'].map((c) => new MeshStandardMaterial({ color: c, roughness: 0.6 }));
const hairMat = new MeshStandardMaterial({ color: '#161212', roughness: 0.9 });
const shirtMat = new MeshStandardMaterial({ color: '#dbe8f5', roughness: 0.7 });
const skirtMat = new MeshStandardMaterial({ color: '#1f3b73', roughness: 0.8 });
const trouserMat = new MeshStandardMaterial({ color: '#23314f', roughness: 0.8 });
const shoeMat = new MeshStandardMaterial({ color: '#1b1b1b', roughness: 0.5 });
const sockMat = new MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.8 });
const tongueMat = new MeshStandardMaterial({ color: '#d9737a', roughness: 0.5 });

/**
 * A classmate (origin on the floor under them, facing +z). `height` in metres;
 * seated: on a stool, hands on the bench. `tongue`: rolled into a U, flat, or hidden.
 */
export function Classmate({ height, look, seated, shoes = true, tongue = null, glow, wave }: { height: number; look: ClassmateLook; seated?: boolean; shoes?: boolean; tongue?: 'U' | 'flat' | null; glow?: boolean; wave?: boolean }) {
  const k = height / 1.65;
  const skin = TONES[look.tone % 4]!;
  const legs = 0.78 * k;
  const torso = 0.52 * k;
  const hipY = seated ? 0.47 : legs + (shoes ? 0.025 : 0);
  const shY = hipY + torso;
  const headR = 0.1 * Math.min(1.08, Math.max(0.95, k));
  const arm = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (arm.current) arm.current.rotation.z = wave ? -1.2 + Math.sin(clock.elapsedTime * 6) * 0.3 : 0;
  });
  return (
    <group>
      {/* legs */}
      {seated ? (
        <>
          {[-0.08, 0.08].map((x) => (
            <group key={x}>
              <Rod p={[x * k, hipY, 0.2]} s={[0.058 * k, 0.4, 0.058 * k]} r={[Math.PI / 2, 0, 0]} m={look.girl ? skirtMat : trouserMat} />
              <Rod p={[x * k, hipY / 2, 0.4]} s={[0.048 * k, hipY - 0.02, 0.048 * k]} m={look.girl ? skin : trouserMat} />
              <Box p={[x * k, 0.03, 0.44]} s={[0.09, 0.06, 0.2]} m={shoeMat} />
            </group>
          ))}
          <Rod p={[0, hipY - 0.06, 0.05]} s={[0.17, 0.04, 0.17]} m={mat.wood()} />
          {[0, 1, 2, 3].map((q) => (
            <Rod key={q} p={[Math.cos(q * 1.57 + 0.78) * 0.12, (hipY - 0.08) / 2, 0.05 + Math.sin(q * 1.57 + 0.78) * 0.12]} s={[0.012, hipY - 0.08, 0.012]} m={mat.metal()} />
          ))}
        </>
      ) : (
        [-0.075, 0.075].map((x) => (
          <group key={x}>
            {look.girl ? (
              <>
                <Rod p={[x * k, legs * 0.32 + (shoes ? 0.025 : 0), 0]} s={[0.045 * k, legs * 0.64, 0.045 * k]} m={skin} />
                <Rod p={[x * k, 0.06 + (shoes ? 0.025 : 0), 0]} s={[0.05 * k, 0.1, 0.05 * k]} m={sockMat} />
              </>
            ) : (
              <Rod p={[x * k, legs / 2 + (shoes ? 0.025 : 0), 0]} s={[0.055 * k, legs, 0.055 * k]} m={trouserMat} />
            )}
            {shoes ? <Box p={[x * k, 0.025, 0.04]} s={[0.09, 0.05, 0.22]} m={shoeMat} /> : <Box p={[x * k, 0.008, 0.035]} s={[0.075, 0.016, 0.2]} m={sockMat} />}
          </group>
        ))
      )}
      {look.girl && !seated && <Rod p={[0, hipY - 0.12 * k, 0]} s={[0.2 * k, 0.3 * k, 0.16 * k]} m={skirtMat} />}
      {/* torso */}
      <Rod p={[0, hipY + torso / 2, 0]} s={[0.13 * k, torso, 0.1 * k]} m={shirtMat} />
      {/* arms */}
      {[-1, 1].map((sd) => (
        <group key={sd} ref={sd === 1 ? arm : undefined} position={[sd * 0.165 * k, shY - 0.03, 0]}>
          {seated ? (
            <>
              <Rod p={[0, -0.13, 0.06]} s={[0.04 * k, 0.26, 0.04 * k]} r={[0.45, 0, 0]} m={shirtMat} />
              <Rod p={[0, -0.22, 0.27]} s={[0.032 * k, 0.26, 0.032 * k]} r={[Math.PI / 2, 0, 0]} m={skin} />
            </>
          ) : (
            <>
              <Rod p={[0, -0.14 * k, 0]} s={[0.04 * k, 0.28 * k, 0.04 * k]} m={shirtMat} />
              <Rod p={[0, -0.41 * k, 0.02]} s={[0.032 * k, 0.28 * k, 0.032 * k]} m={skin} />
              <Ball p={[0, -0.57 * k, 0.03]} s={[0.04, 0.05, 0.035]} m={skin} />
            </>
          )}
        </group>
      ))}
      {/* neck and head */}
      <Rod p={[0, shY + 0.04, 0]} s={[0.04, 0.08, 0.04]} m={skin} />
      <group position={[0, shY + 0.08 + headR * 1.05, 0]}>
        <Ball p={[0, 0, 0]} s={[headR, headR * 1.12, headR]} m={skin} />
        <mesh position={[0, headR * 0.3, -headR * 0.12]} scale={[1.06, 0.92, 1.06]} material={hairMat}>
          <sphereGeometry args={[headR, 18, 10, 0, Math.PI * 2, 0, look.hair === 2 ? Math.PI / 1.6 : Math.PI / 2]} />
        </mesh>
        {look.girl && look.hair === 1 && <Ball p={[0, headR * 0.95, -headR * 0.4]} s={[headR * 0.45, headR * 0.4, headR * 0.45]} m={hairMat} />}
        {[-1, 1].map((sd) => (
          <Ball key={sd} p={[sd * headR * 0.36, headR * 0.12, headR * 0.9]} s={[0.012, 0.014, 0.008]} m={hairMat} />
        ))}
        {tongue && (
          <group position={[0, -headR * 0.45, headR * 0.96]}>
            {tongue === 'U' ? (
              <mesh rotation={[Math.PI / 2, 0, Math.PI]} material={tongueMat}>
                <torusGeometry args={[0.014, 0.007, 8, 14, Math.PI]} />
              </mesh>
            ) : (
              <Ball p={[0, 0, 0.004]} s={[0.018, 0.006, 0.012]} m={tongueMat} />
            )}
          </group>
        )}
        {glow && (
          <mesh material={mat.highlight()}>
            <sphereGeometry args={[headR * 1.35, 12, 10]} />
          </mesh>
        )}
      </group>
    </group>
  );
}

const boardFace = () =>
  bioCanvas('gen-board-face', 128, 1024, (g, w, h) => {
    g.fillStyle = '#f7e9b8';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1c1f22';
    g.textBaseline = 'middle';
    // 120–200 cm over the face
    for (let cm = 120; cm <= 200; cm++) {
      const y = h - ((cm - 120) / 80) * h;
      const len = cm % 10 === 0 ? 60 : cm % 5 === 0 ? 40 : 24;
      g.fillRect(0, y - 1, len, 2);
      if (cm % 10 === 0) {
        g.font = `700 22px ${FONT}`;
        g.fillText(String(cm), 66, y);
      }
    }
  });
/** The height board: a 2 m post on a base, the scale from 120 to 200 cm on its face (origin on the floor). */
export function HeightBoard({ glow }: { glow?: boolean }) {
  const face = useMemo(() => boardFace(), []);
  return (
    <group>
      <Box p={[0, 0.01, 0.12]} s={[0.5, 0.02, 0.42]} m={mat.wood()} />
      <Box p={[0, 1.0, 0]} s={[0.12, 2.0, 0.03]} m={mat.wood()} />
      <mesh position={[0, 1.6, 0.0155]}>
        <planeGeometry args={[0.11, 0.8]} />
        <meshStandardMaterial map={face} roughness={0.7} />
      </mesh>
      <BlobShadow r={0.32} y={0.021} />
      {glow && <GlowRing r={0.34} y={0.022} />}
    </group>
  );
}
/** A set square (lying flat, or held on a head when `held`). */
export function SetSquare({ glow }: { glow?: boolean }) {
  return (
    <group>
      <Box p={[0.06, 0.002, 0]} s={[0.15, 0.004, 0.012]} m={colourMaterial('#9fb6c9')} />
      <Box p={[0, 0.002, 0.045]} s={[0.012, 0.004, 0.1]} m={colourMaterial('#9fb6c9')} />
      <Box p={[0.06, 0.002, 0.045]} s={[0.15, 0.004, 0.01]} r={[0, -0.6, 0]} m={colourMaterial('#9fb6c9')} />
      {glow && <GlowRing r={0.1} />}
    </group>
  );
}
/** A spread (or cupped) hand lying on the ruler for the span. */
export function HandOnRuler({ spread, tone }: { spread: boolean; tone: number }) {
  const m = TONES[tone % 4]!;
  const f = spread ? 1 : 0.6;
  return (
    <group>
      <Ball p={[0, 0.01, 0.035]} s={[0.034, 0.01, 0.04]} m={m} />
      {[-0.6, -0.25, 0, 0.25, 0.55].map((a, i) => (
        <Rod key={i} p={[Math.sin(a * f) * 0.075, 0.01, 0.03 - Math.cos(a * f) * 0.075 + (i === 0 ? 0.04 : 0)]} s={[0.0075, i === 0 ? 0.06 : 0.075, 0.0075]} r={[Math.PI / 2, 0, -a * f]} m={m} />
      ))}
    </group>
  );
}
/** A measuring tape case. */
export function MeasuringTape({ glow }: { glow?: boolean }) {
  return (
    <group>
      <Rod p={[0, 0.016, 0]} s={[0.035, 0.032, 0.035]} m={colourMaterial('#f9a825')} />
      <Box p={[0.04, 0.004, 0]} s={[0.04, 0.002, 0.016]} m={colourMaterial('#fff59d')} />
      {glow && <GlowRing r={0.06} />}
    </group>
  );
}
const gridTex = () =>
  bioCanvas('gen-graph', 256, 256, (g, w, h) => {
    g.fillStyle = '#fbfdf9';
    g.fillRect(0, 0, w, h);
    for (let x = 0; x <= w; x += 8) {
      g.fillStyle = x % 40 === 0 ? '#7fb38c' : '#cfe5d4';
      g.fillRect(x, 0, 1, h);
      g.fillRect(0, x, w, 1);
    }
  });
/** A pad of graph paper (or a sheet of paper with `lines`). */
export function PaperPad({ glow, w = 0.21, d = 0.28, ruled }: { glow?: boolean; w?: number; d?: number; ruled?: boolean }) {
  const tex = useMemo(() => (ruled ? sheetTex() : gridTex()), [ruled]);
  return (
    <group>
      <Box p={[0, 0.002, 0]} s={[w, 0.004, d]} m={mat.white()} />
      <mesh position={[0, 0.0042, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w * 0.96, d * 0.96]} />
        <meshStandardMaterial map={tex} roughness={0.9} />
      </mesh>
      {glow && <GlowRing r={Math.max(w, d) * 0.6} />}
    </group>
  );
}
const sheetTex = () =>
  bioCanvas('gen-sheet', 256, 340, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1c1f22';
    g.font = `700 18px ${FONT}`;
    g.fillText('No.   Result', 12, 26);
    g.fillStyle = '#9ec5e8';
    for (let y = 40; y < h; y += 14) g.fillRect(8, y, w - 16, 1);
    g.fillStyle = '#e57373';
    g.fillRect(44, 34, 1, h - 40);
  });
/** The box of school health cards (lid open). */
export function CardBox({ glow, pulled }: { glow?: boolean; pulled?: boolean }) {
  return (
    <group>
      <Box p={[0, 0.03, 0]} s={[0.16, 0.06, 0.11]} m={colourMaterial('#8d6e63')} />
      {Array.from({ length: 8 }, (_, i) => (
        <Box key={i} p={[-0.06 + i * 0.016, 0.065 + (pulled && i === 3 ? 0.03 : 0), 0]} s={[0.003, 0.05, 0.095]} m={colourMaterial(i % 2 ? '#fffde7' : '#e3f2fd')} />
      ))}
      <BlobShadow r={0.1} />
      {glow && <GlowRing r={0.11} />}
    </group>
  );
}
/** A protractor (half disc). */
export function Protractor({ glow }: { glow?: boolean }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <circleGeometry args={[0.05, 24, 0, Math.PI]} />
        <meshStandardMaterial color="#e1f5fe" transparent opacity={0.8} side={DoubleSide} />
      </mesh>
      {glow && <GlowRing r={0.06} />}
    </group>
  );
}
/** A hand mirror lying on the bench. */
export function HandMirror({ glow }: { glow?: boolean }) {
  return (
    <group>
      <Rod p={[0, 0.005, 0]} s={[0.05, 0.01, 0.05]} m={colourMaterial('#5d4037')} />
      <Rod p={[0, 0.0105, 0]} s={[0.044, 0.002, 0.044]} m={mat.steel()} />
      <Box p={[0, 0.005, 0.08]} s={[0.022, 0.01, 0.07]} m={colourMaterial('#5d4037')} />
      {glow && <GlowRing r={0.08} />}
    </group>
  );
}

const beadGeo = { r: 0.0045 };
/** A beaker of beads: `red` of `total` red (T), the rest white (t). The beads sit in a heap (instanced). */
export function BeadBeaker({ red, total, glow, shakeAt }: { red: number; total: number; glow?: boolean; shakeAt?: number }) {
  const ref = useRef<InstancedMesh>(null);
  const g = useRef<Group>(null);
  const n = Math.max(0, Math.min(100, total));
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new Object3D();
    const cR = new Color('#d32f2f');
    const cW = new Color('#f5f5f5');
    for (let i = 0; i < 100; i++) {
      const layer = Math.floor(i / 14);
      const a = i * 2.39996;
      const rr = 0.008 + ((i * 7) % 14) * 0.0018;
      o.position.set(Math.cos(a) * rr, 0.006 + layer * 0.0075, Math.sin(a) * rr);
      o.scale.setScalar(i < n ? 1 : 0.0001);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      // Spread the red ones through the heap.
      m.setColorAt(i, (i * 37) % 100 < (red / Math.max(1, n)) * 100 ? cR : cW);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [red, n]);
  useFrame(() => {
    if (!g.current) return;
    const t = shakeAt ? (performance.now() - shakeAt) / 1000 : 9;
    g.current.rotation.z = t < 0.6 ? Math.sin(t * 40) * 0.12 * (1 - t / 0.6) : 0;
  });
  return (
    <group ref={g}>
      <instancedMesh ref={ref} args={[undefined, undefined, 100]}>
        <sphereGeometry args={[beadGeo.r, 8, 6]} />
        <meshStandardMaterial roughness={0.35} />
      </instancedMesh>
      <mesh position={[0, 0.045, 0]} material={mat.glass()}>
        <cylinderGeometry args={[0.04, 0.038, 0.09, 24, 1, true]} />
      </mesh>
      <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mat.glass()}>
        <circleGeometry args={[0.038, 24]} />
      </mesh>
      <BlobShadow r={0.06} />
      {glow && <GlowRing r={0.065} />}
    </group>
  );
}
/** A bag of beads (cupboard). */
export function BeadBag({ glow }: { glow?: boolean }) {
  return (
    <group>
      <Ball p={[0, 0.035, 0]} s={[0.05, 0.035, 0.04]} m={colourMaterial('#c5cae9')} />
      <Ball p={[-0.015, 0.06, 0.02]} s={[0.006, 0.006, 0.006]} m={colourMaterial('#d32f2f')} />
      <Ball p={[0.012, 0.062, 0.018]} s={[0.006, 0.006, 0.006]} m={colourMaterial('#f5f5f5')} />
      {glow && <GlowRing r={0.06} />}
    </group>
  );
}
/** Two beads on the tray: the pair just drawn. */
export function PairOnTray({ a, b }: { a: boolean; b: boolean }) {
  return (
    <group>
      <Ball p={[-0.02, 0.012, 0]} s={[0.006, 0.006, 0.006]} m={colourMaterial(a ? '#d32f2f' : '#f5f5f5')} />
      <Ball p={[0.02, 0.012, 0]} s={[0.006, 0.006, 0.006]} m={colourMaterial(b ? '#d32f2f' : '#f5f5f5')} />
    </group>
  );
}

const spotTex = (spot: FoodSpot, seen: boolean, counts: string) =>
  bioCanvas(`gen-spot-${spot}-${seen ? counts : 'closed'}`, 256, 196, (g, w, h) => {
    g.fillStyle = seen ? '#fffdf3' : '#e8f0e0';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#33691e';
    g.fillRect(0, 0, w, 40);
    g.fillStyle = '#fff';
    g.font = `700 19px ${FONT}`;
    g.textBaseline = 'middle';
    g.fillText(FOOD_SPOT_LABEL[spot], 10, 21, w - 20);
    g.fillStyle = '#1c1f22';
    g.font = `500 16px ${FONT}`;
    if (!seen) {
      g.fillText('Tap: survey this spot', 12, 110);
      return;
    }
    const lines = [counts, ...FOOD_SPOT_SHOWS[spot].notes];
    let y = 62;
    for (const l of lines) {
      const words = l.split(' ');
      let line = '';
      for (const wd of words) {
        if (g.measureText(`${line} ${wd}`).width > w - 24) {
          g.fillText(line, 12, y);
          y += 20;
          line = wd;
        } else line = line ? `${line} ${wd}` : wd;
      }
      g.fillText(line, 12, y);
      y += 24;
    }
  });
/** A field-note card for one spot (face up on the bench). */
export function SpotCardModel({ spot, seen, counts, glow }: { spot: FoodSpot; seen: boolean; counts: string; glow?: boolean }) {
  const tex = useMemo(() => spotTex(spot, seen, counts), [spot, seen, counts]);
  return (
    <group>
      <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.24, 0.18]} />
        <meshStandardMaterial map={tex} roughness={0.85} />
      </mesh>
      {glow && <GlowRing r={0.15} />}
    </group>
  );
}
/** A stack of field-note cards (cupboard). */
export function NotesStack({ glow }: { glow?: boolean }) {
  return (
    <group>
      {[0, 1, 2].map((i) => (
        <Box key={i} p={[i * 0.004, 0.002 + i * 0.003, i * 0.003]} s={[0.15, 0.002, 0.11]} m={colourMaterial(i % 2 ? '#fffdf3' : '#e8f0e0')} />
      ))}
      {glow && <GlowRing r={0.1} />}
    </group>
  );
}
/** A sweep net leaning on the bench (handle, ring and bag). */
export function SweepNet({ glow, swingAt }: { glow?: boolean; swingAt?: number }) {
  const g = useRef<Group>(null);
  useFrame(() => {
    if (!g.current) return;
    const t = swingAt ? (performance.now() - swingAt) / 1000 : 9;
    g.current.rotation.y = t < 1.2 ? Math.sin(t * 8) * 0.5 * (1 - t / 1.2) : 0;
  });
  return (
    <group ref={g}>
      <Rod p={[0, 0.005, 0.2]} s={[0.008, 0.5, 0.008]} r={[Math.PI / 2, 0, 0]} m={mat.wood()} />
      <mesh position={[0, 0.005, -0.12]} rotation={[Math.PI / 2, 0, 0]} material={mat.metal()}>
        <torusGeometry args={[0.1, 0.004, 6, 24]} />
      </mesh>
      <mesh position={[0, -0.06, -0.12]} rotation={[0, 0, 0]}>
        <coneGeometry args={[0.1, 0.14, 16, 1, true]} />
        <meshStandardMaterial color="#f5f5f5" transparent opacity={0.55} side={DoubleSide} />
      </mesh>
      {glow && <GlowRing r={0.18} />}
    </group>
  );
}
/** A pooter: a small jar with two tubes. */
export function Pooter({ glow }: { glow?: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.03, 0]} material={mat.glass()}>
        <cylinderGeometry args={[0.022, 0.022, 0.06, 16]} />
      </mesh>
      <Rod p={[0, 0.064, 0]} s={[0.024, 0.008, 0.024]} m={mat.cork()} />
      <Rod p={[-0.008, 0.09, 0.02]} s={[0.003, 0.06, 0.003]} r={[0.7, 0, 0]} m={mat.rubber()} />
      <Rod p={[0.008, 0.09, -0.02]} s={[0.003, 0.06, 0.003]} r={[-0.7, 0, 0]} m={mat.plastic()} />
      {glow && <GlowRing r={0.05} />}
    </group>
  );
}
const chartTex = () =>
  bioCanvas('gen-idchart', 512, 360, (g, w, h) => {
    g.fillStyle = '#fffdf6';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#2e7d32';
    g.fillRect(0, 0, w, 48);
    g.fillStyle = '#fff';
    g.font = `800 24px ${FONT}`;
    g.textBaseline = 'middle';
    g.fillText('Identification chart — school field', 14, 25);
    const items: [string, string][] = [
      ['Grass', '#558b2f'],
      ['Grasshopper', '#7cb342'],
      ['Caterpillar', '#9ccc65'],
      ['Goat', '#8d6e63'],
      ['Agama lizard', '#ef6c00'],
      ['Weaver bird', '#fbc02d'],
      ['Toad', '#6d4c41'],
      ['Hawk', '#5d4037'],
    ];
    items.forEach(([name, col], i) => {
      const x = 20 + (i % 2) * 250;
      const y = 80 + Math.floor(i / 2) * 68;
      g.fillStyle = col;
      g.beginPath();
      g.ellipse(x + 26, y + 10, 24, 14, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#1c1f22';
      g.font = `600 22px ${FONT}`;
      g.fillText(name, x + 62, y + 10);
    });
  });
/** The identification chart propped up on the bench. */
export function IdChart({ glow }: { glow?: boolean }) {
  const tex = useMemo(() => chartTex(), []);
  return (
    <group>
      <mesh position={[0, 0.1, 0]} rotation={[-0.25, 0, 0]}>
        <planeGeometry args={[0.3, 0.21]} />
        <meshStandardMaterial map={tex} roughness={0.85} />
      </mesh>
      <Box p={[0, 0.1, -0.03]} s={[0.3, 0.21, 0.004]} r={[-0.25, 0, 0]} m={mat.cabinet()} />
      {glow && <GlowRing r={0.17} />}
    </group>
  );
}
export type { V3 };
