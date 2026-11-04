import { ORG_COL, type OrgVisual, type QualVisual, type SoapRun } from '@aischool/shared';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { Group } from 'three';
import { BlobShadow, GlowRing } from '../../../lab3d-kit/apparatus';
import { colourMaterial, liquidMaterial, mat } from '../../../lab3d-kit/materials';
import { bioCanvas, FONT } from '../../bio-common/lab3d/textures';
import { Burner, FilterFunnel, GasProbe, TestTube, TUBE } from '../../chem-qualitative/lab3d/models';
import { TRIPOD_H } from '../../bio-food-tests/lab3d/models';

/**
 * The organic apparatus, at true size (metres), drawn from the shared outcome
 * of each test (`orgObserve(...).visual`): the tube's colour, an organic layer
 * on top, a precipitate or coagulum, a lump of sodium, fizzing, and the gas
 * tests at its mouth; the soap beaker on its tripod, the balance, the filter
 * funnel and the lather tubes. The test tube, burner and probes are the
 * chemistry bench's own models.
 */

const asQual = (v: OrgVisual): QualVisual => ({ liquid: v.liquid, ppt: v.ppt, solid: null, bubbles: v.bubbles, fumes: null, ring: null, flame: null, deposit: v.solid, droplets: false, sublimate: false, probes: [] });

/** A test tube from an organic test's outcome (origin at its bottom). */
export function OrgTube({ vis, glow, small }: { vis: OrgVisual | null; glow?: boolean; small?: boolean }) {
  const q = useMemo(() => (vis ? asQual(vis) : null), [vis]);
  const r = TUBE.r - 0.0009;
  return (
    <group scale={small ? 0.9 : 1}>
      <TestTube vis={q} glow={glow} small={small} />
      {vis?.layer && (
        <mesh position={[0, 0.064, 0]} material={liquidMaterial(vis.layer, vis.layer === ORG_COL.organic ? 0.35 : 0.9)} renderOrder={3}>
          <cylinderGeometry args={[r, r, 0.014, 16]} />
        </mesh>
      )}
      {vis?.coag && (
        <mesh position={[0, 0.03, 0]} material={colourMaterial('#f7f5ee')} renderOrder={3}>
          <cylinderGeometry args={[r - 0.0005, r - 0.0015, 0.045, 14]} />
        </mesh>
      )}
      {vis?.solid && (
        <mesh position={[0.002, 0.006, 0]} material={colourMaterial(vis.solid)}>
          <boxGeometry args={[0.005, 0.004, 0.005]} />
        </mesh>
      )}
      {!small && vis?.probes.map((p, k) => <GasProbe key={k} test={p.test} colour={p.colour} k={k} />)}
    </group>
  );
}

/** The soap beaker on a tripod and gauze over the burner: the mixture's level and look, the rod, the soap layer after brine. */
export function SoapBeaker({ r, lit, glow }: { r: SoapRun | null; lit: boolean; glow?: boolean }) {
  const bubbles = useRef<Group>(null);
  const boiling = lit && !!r && r.naoh && !r.brine && r.water > 0;
  useFrame(({ clock }) => {
    const g = bubbles.current;
    if (!g) return;
    g.visible = boiling;
    g.children.forEach((c, k) => {
      const f = (clock.elapsedTime * (0.7 + (k % 3) * 0.25) + k / 6) % 1;
      c.position.set(Math.cos(k * 2.3) * 0.03, 0.006 + f * 0.04, Math.sin(k * 2.3) * 0.03);
    });
  });
  const vol = r ? (r.oil ? 10 : 0) + r.water + (r.brine ? 20 : 0) : 0;
  const h = Math.min(0.085, (vol / 60) * 0.085);
  const mix = !r ? ORG_COL.water : !r.naoh ? ORG_COL.palmOil : r.charred ? '#5a3a1e' : r.extent > 0.6 ? '#ead9a8' : mixHex(r.extent);
  const showLiquid = !!r && vol > 0 && !r.filtered;
  return (
    <group>
      <BlobShadow r={0.1} />
      <Burner lit={lit} />
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
      <group position={[0, TRIPOD_H + 0.006, 0]}>
        {showLiquid && (
          <mesh position={[0, h / 2 + 0.002, 0]} material={liquidMaterial(r!.brine ? ORG_COL.brine : mix, 0.88)} renderOrder={2}>
            <cylinderGeometry args={[0.04, 0.04, h, 24]} />
          </mesh>
        )}
        {showLiquid && r!.naoh && r!.extent < 0.6 && !r!.brine && (
          <mesh position={[0, h + 0.002, 0]} material={liquidMaterial(ORG_COL.palmOil, 0.92)} renderOrder={3}>
            <cylinderGeometry args={[0.04, 0.04, 0.006, 24]} />
          </mesh>
        )}
        {showLiquid && r!.separated && (
          <mesh position={[0, h - 0.004, 0]} material={colourMaterial(ORG_COL.soap)} renderOrder={3}>
            <cylinderGeometry args={[0.0395, 0.0395, 0.012, 24]} />
          </mesh>
        )}
        <group ref={bubbles}>
          {Array.from({ length: 10 }, (_, k) => (
            <mesh key={k} material={mat.glass()}>
              <sphereGeometry args={[0.0025, 6, 5]} />
            </mesh>
          ))}
        </group>
        <mesh position={[0, 0.055, 0]} material={mat.glass()} renderOrder={5}>
          <cylinderGeometry args={[0.043, 0.042, 0.11, 26, 1, true]} />
        </mesh>
        {/* the glass rod resting in it */}
        <mesh position={[0.018, 0.07, 0]} rotation={[0, 0, -0.35]} material={mat.glass()}>
          <cylinderGeometry args={[0.003, 0.003, 0.17, 8]} />
        </mesh>
      </group>
      {glow && <GlowRing r={0.1} />}
    </group>
  );
}
const mixHex = (x: number) => (x < 0.3 ? '#e58a3a' : '#e9b070');

/** A top-pan balance showing `grams` (null: 0.00). */
export function Balance({ grams, glow }: { grams: number | null; glow?: boolean }) {
  const shown = (grams ?? 0).toFixed(2);
  const tex = useMemo(
    () =>
      bioCanvas(`org-balance-${shown}`, 256, 96, (g, w, h) => {
        g.fillStyle = '#b8d4b0';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#132013';
        g.textAlign = 'right';
        g.textBaseline = 'middle';
        g.font = `700 60px ui-monospace, Consolas, monospace`;
        g.fillText(`${shown} g`, w - 14, h / 2 + 3);
      }),
    [shown],
  );
  return (
    <group>
      <BlobShadow r={0.09} />
      <mesh position={[0, 0.02, 0]} material={mat.white()}>
        <boxGeometry args={[0.15, 0.04, 0.18]} />
      </mesh>
      <mesh position={[0, 0.043, -0.01]} material={mat.steel()}>
        <cylinderGeometry args={[0.055, 0.055, 0.004, 28]} />
      </mesh>
      <mesh position={[0, 0.03, 0.0905]}>
        <planeGeometry args={[0.1, 0.035]} />
        <meshBasicMaterial map={tex} />
      </mesh>
      {glow && <GlowRing r={0.1} />}
    </group>
  );
}

/** The filter funnel over a beaker, with the soap on the paper once filtered. */
export function SoapFunnel({ soap, glow }: { soap: boolean; glow?: boolean }) {
  return (
    <group>
      <BlobShadow r={0.05} />
      <mesh position={[0, 0.03, 0]} material={mat.glass()} renderOrder={4}>
        <cylinderGeometry args={[0.032, 0.031, 0.06, 22, 1, true]} />
      </mesh>
      <group position={[0, 0.0, 0]}>
        <FilterFunnel residue={soap ? ORG_COL.soap : null} />
      </group>
      {glow && <GlowRing r={0.05} />}
    </group>
  );
}

/** A test tube of water shaken with soap: a tall foam (soft water) or a little foam over a cloudy scum (hard water). */
export function LatherTube({ kind, label, glow }: { kind: 'soft' | 'hard' | null; label: string; glow?: boolean }) {
  const tex = useMemo(
    () =>
      bioCanvas(`org-lather-${label}`, 192, 64, (g, w, h) => {
        g.fillStyle = '#fffdf4';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#1c1f22';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = `800 34px ${FONT}`;
        g.fillText(label, w / 2, h / 2 + 2);
      }),
    [label],
  );
  const r = TUBE.r - 0.0009;
  return (
    <group>
      <TestTube vis={{ liquid: kind === 'hard' ? '#e9e8e0' : ORG_COL.water, ppt: kind === 'hard' ? '#f4f2ea' : null, solid: null, bubbles: false, fumes: null, ring: null, flame: null, deposit: null, droplets: false, sublimate: false, probes: [] }} glow={glow} />
      {kind && (
        <mesh position={[0, 0.057 + (kind === 'soft' ? 0.025 : 0.004), 0]} material={colourMaterial('#ffffff')} renderOrder={3}>
          <cylinderGeometry args={[r, r, kind === 'soft' ? 0.05 : 0.008, 14]} />
        </mesh>
      )}
      <mesh position={[0, 0.11, TUBE.r + 0.0012]}>
        <planeGeometry args={[0.026, 0.009]} />
        <meshBasicMaterial map={tex} />
      </mesh>
    </group>
  );
}

/** The splints and lime water kit. */
export function SplintKit({ glow }: { glow?: boolean }) {
  return (
    <group>
      <BlobShadow r={0.05} />
      {[0, 1, 2, 3].map((k) => (
        <mesh key={k} position={[-0.02 + k * 0.006, 0.002, 0]} rotation={[0, 0, Math.PI / 2]} material={mat.wood()}>
          <boxGeometry args={[0.003, 0.1, 0.003]} />
        </mesh>
      ))}
      <group position={[0.04, 0, 0]}>
        <mesh position={[0, 0.03, 0]} material={liquidMaterial(ORG_COL.limeClear, 0.5)}>
          <cylinderGeometry args={[0.012, 0.012, 0.05, 14]} />
        </mesh>
        <mesh position={[0, 0.035, 0]} material={mat.glass()}>
          <cylinderGeometry args={[0.014, 0.014, 0.07, 14, 1, true]} />
        </mesh>
      </group>
      {glow && <GlowRing r={0.06} />}
    </group>
  );
}

/** A beaker of cold water with the poured-out ester floating as an oily layer. */
export function EsterBeaker({ ester, glow }: { ester: boolean; glow?: boolean }) {
  return (
    <group>
      <BlobShadow r={0.045} />
      <mesh position={[0, 0.024, 0]} material={liquidMaterial(ORG_COL.water, 0.3)} renderOrder={2}>
        <cylinderGeometry args={[0.03, 0.03, 0.044, 20]} />
      </mesh>
      {ester && (
        <mesh position={[0, 0.047, 0]} material={liquidMaterial('#f4ecc8', 0.85)} renderOrder={3}>
          <cylinderGeometry args={[0.0298, 0.0298, 0.004, 20]} />
        </mesh>
      )}
      <mesh position={[0, 0.04, 0]} material={mat.glass()} renderOrder={4}>
        <cylinderGeometry args={[0.033, 0.032, 0.08, 22, 1, true]} />
      </mesh>
      {glow && <GlowRing r={0.045} />}
    </group>
  );
}
