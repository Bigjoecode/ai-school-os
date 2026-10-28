import { AMY_SPOT_HEX, FOOD_COL, type FoodVisual, type QualVisual } from '@aischool/shared';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { Group } from 'three';
import { BlobShadow, GlowRing } from '../../../lab3d-kit/apparatus';
import { colourMaterial, liquidMaterial, mat } from '../../../lab3d-kit/materials';
import { bioCanvas, FONT, letterCardTexture } from '../../bio-common/lab3d/textures';
import { Burner, liquidOpacity, SampleBeaker, TestTube, TUBE } from '../../chem-qualitative/lab3d/models';

/**
 * The food-tests apparatus, at true size (metres), drawn from the shared
 * outcome of each test (`foodObserve(...).visual`): the tube's colour, a
 * precipitate, an oily layer, an emulsion, fizzing; the boiling water bath on
 * its tripod, the amylase baths, the spotting tile and the stopwatch. The
 * test tube, burner and beakers are the chemistry bench's own models.
 */

/** A FoodVisual as the chemistry tube model draws it. */
const asQual = (v: FoodVisual): QualVisual => ({ liquid: v.liquid, ppt: v.ppt, solid: null, bubbles: v.bubbles, fumes: null, ring: null, flame: null, deposit: null, droplets: false, sublimate: false, probes: [] });

/** A test tube from a food test's outcome (origin at its bottom). */
export function FoodTube({ vis, glow, small }: { vis: FoodVisual | null; glow?: boolean; small?: boolean }) {
  const q = useMemo(() => (vis ? asQual(vis) : null), [vis]);
  const r = TUBE.r - 0.0009;
  return (
    <group scale={small ? 0.9 : 1}>
      <TestTube vis={q} glow={glow} small={small} />
      {vis?.layer && (
        <mesh position={[0, 0.061, 0]} material={liquidMaterial(vis.layer, 0.9)} renderOrder={3}>
          <cylinderGeometry args={[r, r, 0.008, 16]} />
        </mesh>
      )}
      {vis?.emulsion &&
        [0, 1, 2, 3, 4, 5, 6, 7].map((k) => (
          <mesh key={k} position={[Math.cos(k * 1.9) * r * 0.55, 0.012 + ((k * 7) % 9) * 0.005, Math.sin(k * 1.9) * r * 0.55]} material={colourMaterial('#ffffff')}>
            <sphereGeometry args={[0.0013, 6, 5]} />
          </mesh>
        ))}
    </group>
  );
}

/** Height of the tripod's ring and gauze above the bench (the burner's flame stays under the gauze). */
export const TRIPOD_H = 0.225;

/** The boiling water bath: a beaker of water on a tripod and gauze over the Bunsen burner (bubbling when lit). Tubes stand in it at `slots`. */
export function WaterBath({ lit, glow, children }: { lit: boolean; glow?: boolean; children?: React.ReactNode }) {
  const bubbles = useRef<Group>(null);
  useFrame(({ clock }) => {
    const g = bubbles.current;
    if (!g) return;
    g.visible = lit;
    g.children.forEach((c, k) => {
      const f = (clock.elapsedTime * (0.9 + (k % 3) * 0.3) + k / 7) % 1;
      c.position.set(Math.cos(k * 2.1) * 0.035, 0.006 + f * 0.062, Math.sin(k * 2.1) * 0.035);
    });
  });
  return (
    <group>
      <BlobShadow r={0.1} />
      <group position={[0, 0, 0]}>
        <Burner lit={lit} />
      </group>
      {/* tripod */}
      {[0, 1, 2].map((k) => {
        const a = (k * Math.PI * 2) / 3 + 0.3;
        return (
          <mesh key={k} position={[Math.cos(a) * 0.08, TRIPOD_H / 2, Math.sin(a) * 0.08]} rotation={[Math.sin(a) * 0.1, 0, -Math.cos(a) * 0.1]} material={mat.darkMetal()}>
            <cylinderGeometry args={[0.003, 0.003, TRIPOD_H, 6]} />
          </mesh>
        );
      })}
      <mesh position={[0, TRIPOD_H + 0.001, 0]} rotation={[Math.PI / 2, 0, 0]} material={mat.darkMetal()}>
        <torusGeometry args={[0.07, 0.0035, 6, 24]} />
      </mesh>
      <mesh position={[0, TRIPOD_H + 0.005, 0]} material={mat.metal()}>
        <boxGeometry args={[0.15, 0.002, 0.15]} />
      </mesh>
      {/* the beaker of water */}
      <group position={[0, TRIPOD_H + 0.006, 0]}>
        <mesh position={[0, 0.036, 0]} material={liquidMaterial('#d6e8f5', 0.35)} renderOrder={2}>
          <cylinderGeometry args={[0.05, 0.05, 0.07, 24]} />
        </mesh>
        <mesh position={[0, 0.05, 0]} material={mat.glass()} renderOrder={5}>
          <cylinderGeometry args={[0.053, 0.052, 0.1, 26, 1, true]} />
        </mesh>
        <group ref={bubbles}>
          {Array.from({ length: 12 }, (_, k) => (
            <mesh key={k} material={mat.glass()}>
              <sphereGeometry args={[0.0022, 6, 5]} />
            </mesh>
          ))}
        </group>
        {children}
      </group>
      {glow && <GlowRing r={0.1} />}
    </group>
  );
}

/** One of the amylase baths: a beaker of water (with ice cubes for the ice bath) and a thermometer, labelled. */
export function AmyBathModel({ kind, label, glow, children }: { kind: 'ice' | 'water'; label: string; glow?: boolean; children?: React.ReactNode }) {
  const tex = useMemo(() => bathLabelTexture(label), [label]);
  return (
    <group>
      <BlobShadow r={0.07} />
      <mesh position={[0, 0.036, 0]} material={liquidMaterial(kind === 'ice' ? '#e3f1fb' : '#d6e8f5', 0.35)} renderOrder={2}>
        <cylinderGeometry args={[0.05, 0.05, 0.07, 24]} />
      </mesh>
      {kind === 'ice' &&
        [0, 1, 2, 3, 4].map((k) => (
          <mesh key={k} position={[Math.cos(k * 1.3) * 0.03, 0.066 + (k % 2) * 0.003, Math.sin(k * 1.3) * 0.03]} rotation={[k, k * 0.5, 0]} material={liquidMaterial('#f4fbff', 0.75)} renderOrder={3}>
            <boxGeometry args={[0.016, 0.012, 0.016]} />
          </mesh>
        ))}
      <mesh position={[0, 0.05, 0]} material={mat.glass()} renderOrder={5}>
        <cylinderGeometry args={[0.053, 0.052, 0.1, 26, 1, true]} />
      </mesh>
      {/* thermometer leaning on the rim */}
      <mesh position={[0.035, 0.075, -0.02]} rotation={[0.12, 0, -0.18]} material={mat.glass()}>
        <cylinderGeometry args={[0.0025, 0.0025, 0.16, 8]} />
      </mesh>
      <mesh position={[0.031, 0.02, -0.026]} material={colourMaterial('#c8242b')}>
        <sphereGeometry args={[0.0035, 8, 6]} />
      </mesh>
      <mesh position={[0, 0.05, 0.054]}>
        <planeGeometry args={[0.07, 0.026]} />
        <meshBasicMaterial map={tex} />
      </mesh>
      {children}
      {glow && <GlowRing r={0.07} />}
    </group>
  );
}

const bathLabelTexture = (text: string) =>
  bioCanvas(`food-bath-${text}`, 256, 96, (g, w, h) => {
    g.fillStyle = '#fffdf4';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#2d5d8a';
    g.lineWidth = 6;
    g.strokeRect(3, 3, w - 6, h - 6);
    g.fillStyle = '#1c1f22';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `800 ${text.length > 8 ? 40 : 52}px ${FONT}`;
    g.fillText(text, w / 2, h / 2 + 3);
  });

/** A test tube of starch + saliva standing in a bath (cloudy). */
export function AmyTubeModel({ glow, n }: { glow?: boolean; n: number }) {
  const tex = useMemo(() => bathLabelTexture(String(n)), [n]);
  return (
    <group>
      <TestTube vis={{ liquid: '#eceae2', ppt: null, solid: null, bubbles: false, fumes: null, ring: null, flame: null, deposit: null, droplets: false, sublimate: false, probes: [] }} glow={glow} />
      <mesh position={[0, TUBE.h - 0.02, TUBE.r + 0.0012]}>
        <planeGeometry args={[0.014, 0.008]} />
        <meshBasicMaterial map={tex} />
      </mesh>
    </group>
  );
}

/** A labelled sample beaker (P, Q, R). */
export function LetterBeaker({ letter, colour, glow }: { letter: string; colour: string; glow?: boolean }) {
  const card = letterCardTexture(letter);
  return (
    <group>
      <SampleBeaker colour={colour} glow={glow} />
      <group position={[0, 0, 0.05]}>
        <mesh position={[0, 0.018, 0.006]} rotation={[-0.35, 0, 0]}>
          <planeGeometry args={[0.034, 0.034]} />
          <meshStandardMaterial map={card} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.018, -0.006]} rotation={[0.35, 0, 0]} material={mat.white()}>
          <planeGeometry args={[0.034, 0.034]} />
        </mesh>
      </group>
    </group>
  );
}

export const TILE = { cols: 12, rows: 6, pitch: 0.018 };
/** The spotting tile: a white glazed tile with rows of wells (one row per tube); each well shows its iodine drop's colour. */
export function SpottingTile({ wells, iodine, glow }: { wells: (number | null)[][]; iodine: boolean; glow?: boolean }) {
  const w = TILE.cols * TILE.pitch + 0.02;
  const d = TILE.rows * TILE.pitch + 0.02;
  return (
    <group>
      <BlobShadow r={0.14} />
      <mesh position={[0, 0.005, 0]} material={mat.tile()}>
        <boxGeometry args={[w, 0.01, d]} />
      </mesh>
      {Array.from({ length: TILE.rows }, (_, r) =>
        Array.from({ length: TILE.cols }, (_, c) => {
          const st = wells[r]?.[c];
          const colour = !iodine ? null : st === null || st === undefined ? FOOD_COL.iodine : AMY_SPOT_HEX[st]!;
          return (
            <group key={`${r}-${c}`} position={[-w / 2 + 0.01 + TILE.pitch * (c + 0.5), 0.0102, -d / 2 + 0.01 + TILE.pitch * (r + 0.5)]}>
              <mesh rotation={[-Math.PI / 2, 0, 0]} material={colourMaterial('#e4e2dc')}>
                <circleGeometry args={[0.0068, 16]} />
              </mesh>
              {colour && (
                <mesh position={[0, 0.0004, 0]} rotation={[-Math.PI / 2, 0, 0]} material={liquidMaterial(colour, 0.92)}>
                  <circleGeometry args={[0.0055, 16]} />
                </mesh>
              )}
            </group>
          );
        }),
      )}
      {glow && <GlowRing r={0.14} />}
    </group>
  );
}

/** A digital stopwatch lying on the bench, its display showing `sec` (null: 0:00 and stopped). */
export function StopwatchModel({ sec, glow }: { sec: number | null; glow?: boolean }) {
  const shown = sec ?? 0;
  const tex = useMemo(
    () =>
      bioCanvas(`food-stopwatch-${shown}`, 192, 96, (g, w, h) => {
        g.fillStyle = '#c9d6c0';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#1b2318';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = `700 54px ui-monospace, Consolas, monospace`;
        g.fillText(`${Math.floor(shown / 60)}:${String(Math.round(shown % 60)).padStart(2, '0')}`, w / 2, h / 2 + 3);
      }),
    [shown],
  );
  return (
    <group>
      <BlobShadow r={0.05} />
      <mesh position={[0, 0.008, 0]} material={mat.black()}>
        <cylinderGeometry args={[0.032, 0.034, 0.016, 24]} />
      </mesh>
      <mesh position={[0, 0.0165, 0.002]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.04, 0.02]} />
        <meshBasicMaterial map={tex} />
      </mesh>
      <mesh position={[0, 0.016, -0.038]} material={mat.metal()}>
        <cylinderGeometry args={[0.005, 0.005, 0.01, 10]} />
      </mesh>
      {glow && <GlowRing r={0.05} />}
    </group>
  );
}

/** The filter paper of the grease-spot test (flat on the bench). */
export function FilterPaperModel({ spot, glow }: { spot: FoodVisual['paper']; glow?: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.0012, 0]} rotation={[-Math.PI / 2, 0, 0]} material={colourMaterial('#fbfaf5')}>
        <circleGeometry args={[0.055, 28]} />
      </mesh>
      {spot && spot !== 'dry' && (
        <mesh position={[0, 0.0016, 0]} rotation={[-Math.PI / 2, 0, 0]} material={liquidMaterial(spot === 'translucent' ? '#e6dfbc' : '#dfe5ea', spot === 'translucent' ? 0.92 : 0.7)}>
          <circleGeometry args={[0.016, 20]} />
        </mesh>
      )}
      {glow && <GlowRing r={0.06} />}
    </group>
  );
}

/** A small beaker of a reagent or solution, coloured (starch solution, saliva). */
export function SolutionBeaker({ colour, glow }: { colour: string; glow?: boolean }) {
  return (
    <group>
      <BlobShadow r={0.045} />
      <mesh position={[0, 0.026, 0]} material={liquidMaterial(colour, liquidOpacity(colour))} renderOrder={2}>
        <cylinderGeometry args={[0.03, 0.03, 0.048, 20]} />
      </mesh>
      <mesh position={[0, 0.04, 0]} material={mat.glass()} renderOrder={4}>
        <cylinderGeometry args={[0.033, 0.032, 0.08, 22, 1, true]} />
      </mesh>
      {glow && <GlowRing r={0.045} />}
    </group>
  );
}
