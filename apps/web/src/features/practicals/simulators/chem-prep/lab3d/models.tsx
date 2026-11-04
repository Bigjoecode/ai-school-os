import type { AmRun, DsRun, OrgVisual, PrepTubeVisual, StdFlask } from '@aischool/shared';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, type ReactNode } from 'react';
import type { Group } from 'three';
import { BlobShadow, ConicalFlask, GlowRing } from '../../../lab3d-kit/apparatus';
import { colourMaterial, liquidMaterial, mat } from '../../../lab3d-kit/materials';
import { bioCanvas, FONT } from '../../bio-common/lab3d/textures';
import { Burner } from '../../chem-qualitative/lab3d/models';
import { OrgTube } from '../../chem-organic/lab3d/models';

/**
 * The chem-prep apparatus, procedural and at true size (metres; origin where
 * each stands): the volumetric flask with its graduation mark and meniscus,
 * the weighing bottle, the evaporating dish on its tripod, the distillation
 * rig (flask, thermometer, Liebig condenser and its hoses, receiver), the
 * ammonia rig (sloping tube, drying tower, gas jar) and the fountain.
 */

const WATER = '#dbe9f3';
export const asOrgVisual = (v: PrepTubeVisual): OrgVisual => ({ liquid: v.liquid, layer: v.layer, ppt: null, solid: null, bubbles: false, coag: false, probes: [], benedict: null, poured: false });
export function PrepTube({ vis, glow }: { vis: PrepTubeVisual | null; glow?: boolean }) {
  const o = useMemo(() => (vis ? asOrgVisual(vis) : null), [vis]);
  return <OrgTube vis={o} glow={glow} />;
}

function Label({ text, w = 0.05, h = 0.02, position }: { text: string; w?: number; h?: number; position: [number, number, number] }) {
  const tex = useMemo(
    () =>
      bioCanvas(`prep-label-${text}`, 256, 100, (g, cw, ch) => {
        g.fillStyle = '#fffdf4';
        g.fillRect(0, 0, cw, ch);
        g.fillStyle = '#1c1f22';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = `700 ${text.length > 10 ? 30 : 42}px ${FONT}`;
        g.fillText(text, cw / 2, ch / 2 + 2);
      }),
    [text],
  );
  return (
    <mesh position={position}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={tex} />
    </mesh>
  );
}

// ------------------------------------------------------------------ STANDARD

const VF = { r: 0.048, neckR: 0.0068, neckH: 0.13, mark: 0.075 };
/** A 250 cm³ volumetric flask: the liquid fills the bulb, then rises up the neck (1 cm³ ≈ 9 mm); a ring marks 250 cm³. */
export function VolFlask({ f, label, funnel, stopper, glow }: { f: StdFlask | null; label: string; funnel?: boolean; stopper?: boolean; glow?: boolean }) {
  const bulbTop = VF.r * 1.9;
  const vol = f?.started ? f.vol : 0;
  const neckLevel = vol >= 248 ? Math.max(0.002, Math.min(VF.neckH - 0.004, VF.mark + (vol - 250) * 0.0091)) : 0;
  const bulbFill = Math.min(1, vol / 248);
  return (
    <group>
      <BlobShadow r={0.05} />
      <mesh position={[0, VF.r * 0.95, 0]} material={mat.glass()} renderOrder={5}>
        <sphereGeometry args={[VF.r, 28, 20]} />
      </mesh>
      {bulbFill > 0 && (
        <mesh position={[0, (VF.r * 0.95 * 2 * bulbFill) / 2 + 0.002, 0]} material={liquidMaterial(WATER, 0.45)} renderOrder={3} scale={[1, Math.max(0.05, bulbFill), 1]}>
          <sphereGeometry args={[VF.r - 0.002, 24, 16]} />
        </mesh>
      )}
      <mesh position={[0, bulbTop + VF.neckH / 2, 0]} material={mat.glass()} renderOrder={5}>
        <cylinderGeometry args={[VF.neckR, VF.neckR, VF.neckH, 14, 1, true]} />
      </mesh>
      <mesh position={[0, bulbTop + VF.mark, 0]} rotation={[Math.PI / 2, 0, 0]} material={mat.tickBlack()}>
        <torusGeometry args={[VF.neckR + 0.0004, 0.0005, 6, 24]} />
      </mesh>
      {neckLevel > 0 && (
        <mesh position={[0, bulbTop + neckLevel / 2, 0]} material={liquidMaterial(WATER, 0.6)} renderOrder={3}>
          <cylinderGeometry args={[VF.neckR - 0.0008, VF.neckR - 0.0008, neckLevel, 12]} />
        </mesh>
      )}
      {stopper && (
        <mesh position={[0, bulbTop + VF.neckH + 0.006, 0]} material={mat.ptfe()}>
          <cylinderGeometry args={[VF.neckR + 0.002, VF.neckR - 0.001, 0.014, 12]} />
        </mesh>
      )}
      {funnel && (
        <group position={[0, bulbTop + VF.neckH - 0.01, 0]}>
          <mesh position={[0, 0.03, 0]} material={mat.glass()} renderOrder={5}>
            <cylinderGeometry args={[0.03, 0.004, 0.04, 20, 1, true]} />
          </mesh>
        </group>
      )}
      <Label text={label} position={[0, VF.r * 0.95, VF.r + 0.001]} w={0.045} h={0.018} />
      {glow && <GlowRing r={0.06} />}
    </group>
  );
}

/** A squat glass weighing bottle with its lid and the white powder in it. */
export function WeighBottle({ grams, glow }: { grams: number; glow?: boolean }) {
  const h = Math.min(0.03, grams * 0.008);
  return (
    <group>
      <BlobShadow r={0.025} />
      <mesh position={[0, 0.022, 0]} material={mat.glass()} renderOrder={5}>
        <cylinderGeometry args={[0.018, 0.018, 0.044, 18, 1, true]} />
      </mesh>
      {h > 0.0005 && (
        <mesh position={[0, h / 2 + 0.001, 0]} material={colourMaterial('#f7f7f2')}>
          <cylinderGeometry args={[0.016, 0.016, h, 16]} />
        </mesh>
      )}
      <mesh position={[0.026, 0.004, 0]} rotation={[0, 0, 0.2]} material={mat.glass()}>
        <cylinderGeometry args={[0.02, 0.02, 0.006, 16]} />
      </mesh>
      {glow && <GlowRing r={0.035} />}
    </group>
  );
}

/** A 100 cm³ beaker: powder, water, a clear solution; the glass rod in it. */
export function SolBeaker({ powder, water, rod, glow }: { powder: boolean; water: boolean; rod?: boolean; glow?: boolean }) {
  return (
    <group>
      <BlobShadow r={0.04} />
      <mesh position={[0, 0.035, 0]} material={mat.glass()} renderOrder={5}>
        <cylinderGeometry args={[0.032, 0.03, 0.07, 22, 1, true]} />
      </mesh>
      {water && (
        <mesh position={[0, 0.021, 0]} material={liquidMaterial(WATER, 0.45)} renderOrder={3}>
          <cylinderGeometry args={[0.029, 0.029, 0.04, 20]} />
        </mesh>
      )}
      {powder && (
        <mesh position={[0, 0.004, 0]} material={colourMaterial('#f6f5ef')}>
          <cylinderGeometry args={[0.018, 0.024, 0.005, 16]} />
        </mesh>
      )}
      {rod && (
        <mesh position={[0.01, 0.06, 0]} rotation={[0, 0, 0.25]} material={mat.glass()}>
          <cylinderGeometry args={[0.0025, 0.0025, 0.13, 8]} />
        </mesh>
      )}
      {glow && <GlowRing r={0.045} />}
    </group>
  );
}

// ------------------------------------------------------------------ DISTIL

const TRIPOD = 0.16;
function Tripod() {
  return (
    <group>
      {[0, 1, 2].map((k) => (
        <mesh key={k} position={[Math.cos((k * 2 * Math.PI) / 3) * 0.05, TRIPOD / 2, Math.sin((k * 2 * Math.PI) / 3) * 0.05]} rotation={[Math.sin((k * 2 * Math.PI) / 3) * 0.15, 0, -Math.cos((k * 2 * Math.PI) / 3) * 0.15]} material={mat.darkMetal()}>
          <cylinderGeometry args={[0.003, 0.003, TRIPOD, 6]} />
        </mesh>
      ))}
      <mesh position={[0, TRIPOD, 0]} rotation={[Math.PI / 2, 0, 0]} material={mat.darkMetal()}>
        <torusGeometry args={[0.055, 0.003, 6, 20]} />
      </mesh>
      <mesh position={[0, TRIPOD + 0.003, 0]} material={mat.metal()}>
        <boxGeometry args={[0.12, 0.002, 0.12]} />
      </mesh>
    </group>
  );
}

/** The evaporating dish on a tripod and gauze (burner below), or on the water bath (steam). */
export function EvapDish({ water, dry, spat, lit, bath, glow }: { water: number; dry: boolean; spat: boolean; lit: boolean; bath: boolean; glow?: boolean }) {
  const steam = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (steam.current) steam.current.position.y = 0.03 + ((clock.elapsedTime * 0.04) % 0.04);
  });
  return (
    <group>
      <Tripod />
      <group position={[0, 0, 0]} scale={0.9}>
        <Burner lit={lit} />
      </group>
      {bath && (
        <mesh position={[0, TRIPOD + 0.035, 0]} material={mat.metal()}>
          <cylinderGeometry args={[0.06, 0.055, 0.065, 22]} />
        </mesh>
      )}
      <group position={[0, TRIPOD + (bath ? 0.07 : 0.005), 0]}>
        <mesh position={[0, 0.02, 0]} rotation={[Math.PI, 0, 0]} material={mat.white()}>
          <sphereGeometry args={[0.045, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2.6]} />
        </mesh>
        {water > 0 && (
          <mesh position={[0, 0.004 + Math.min(0.012, water * 0.00024), 0]} material={liquidMaterial(WATER, 0.55)} renderOrder={3}>
            <cylinderGeometry args={[0.012 + Math.min(0.022, water * 0.0005), 0.01, 0.002, 18]} />
          </mesh>
        )}
        {dry && (
          <mesh position={[0, 0.004, 0]} material={colourMaterial('#fbfbf7')}>
            <cylinderGeometry args={[0.022, 0.012, 0.004, 18]} />
          </mesh>
        )}
        {spat &&
          [0, 1, 2, 3].map((k) => (
            <mesh key={k} position={[Math.cos(k * 1.7) * 0.05, 0.002, Math.sin(k * 1.7) * 0.05]} material={colourMaterial('#fbfbf7')}>
              <sphereGeometry args={[0.0018, 6, 4]} />
            </mesh>
          ))}
        {lit && water > 0 && (
          <group ref={steam}>
            <mesh material={liquidMaterial('#ffffff', 0.18)}>
              <sphereGeometry args={[0.02, 10, 8]} />
            </mesh>
          </group>
        )}
      </group>
      {glow && <GlowRing r={0.08} />}
    </group>
  );
}

const DR = { flaskY: TRIPOD + 0.05, r: 0.05, neck: 0.1, arm: 0.075 };
const COND = { len: 0.36, tilt: -0.22, r: 0.017 };
/** Where things are on the distillation rig (rig-local). */
export const RIG = {
  thermo: [0, DR.flaskY + DR.r + DR.neck + 0.02, 0] as [number, number, number],
  condenser: [0.05 + (COND.len / 2) * Math.cos(COND.tilt), DR.flaskY + DR.r + DR.arm + (COND.len / 2) * Math.sin(COND.tilt), 0] as [number, number, number],
  receiver: [0.03 + COND.len * Math.cos(COND.tilt), 0, 0] as [number, number, number],
};
/** The simple-distillation rig: flask (with granules) on a tripod over the burner, thermometer, sloping Liebig condenser with its hoses, open or bunged receiver. */
export function DistillRig({ r, reading, glow }: { r: DsRun; reading: number; glow?: string | null }) {
  const bubbles = useRef<Group>(null);
  const boiling = r.heating && r.boilMin > 0;
  useFrame(({ clock }) => {
    if (bubbles.current) bubbles.current.visible = boiling && Math.sin(clock.elapsedTime * 9) > -0.3;
  });
  const fill = r.filled ? Math.max(0.1, r.liquidVol / 200) : 0;
  const bulbY = r.thermo === 'LIQUID' ? DR.flaskY - 0.01 : r.thermo === 'TOP' ? DR.flaskY + DR.r + DR.neck - 0.005 : DR.flaskY + DR.r + DR.arm;
  const inBottom = r.condenser === 'BOTTOM';
  const cx = Math.cos(COND.tilt);
  const sx = Math.sin(COND.tilt);
  const armY = DR.flaskY + DR.r + DR.arm;
  const end: [number, number, number] = [0.05 + COND.len * cx, armY + COND.len * sx, 0];
  return (
    <group>
      <Tripod />
      <Burner lit={r.heating} />
      {/* flask */}
      <mesh position={[0, DR.flaskY, 0]} material={mat.glass()} renderOrder={5}>
        <sphereGeometry args={[DR.r, 26, 18]} />
      </mesh>
      {fill > 0 && (
        <mesh position={[0, DR.flaskY - DR.r * (1 - fill), 0]} material={liquidMaterial(WATER, 0.5)} renderOrder={3} scale={[1, fill, 1]}>
          <sphereGeometry args={[DR.r - 0.002, 22, 14]} />
        </mesh>
      )}
      {r.chips && [0, 1, 2].map((k) => (
        <mesh key={k} position={[(k - 1) * 0.01, DR.flaskY - DR.r + 0.006, (k % 2) * 0.008]} material={colourMaterial('#9aa0a6')}>
          <boxGeometry args={[0.005, 0.004, 0.005]} />
        </mesh>
      ))}
      <group ref={bubbles}>
        {[0, 1, 2, 3].map((k) => (
          <mesh key={k} position={[Math.cos(k * 1.6) * 0.02, DR.flaskY - DR.r * (1 - fill) + 0.01 + k * 0.004, Math.sin(k * 1.6) * 0.02]} material={liquidMaterial('#ffffff', 0.6)}>
            <sphereGeometry args={[r.bumps && !r.chips ? 0.006 : 0.0025, 6, 4]} />
          </mesh>
        ))}
      </group>
      <mesh position={[0, DR.flaskY + DR.r + DR.neck / 2, 0]} material={mat.glass()} renderOrder={5}>
        <cylinderGeometry args={[0.011, 0.011, DR.neck, 14, 1, true]} />
      </mesh>
      {/* side arm */}
      <mesh position={[0.045, armY + 0.004, 0]} rotation={[0, 0, Math.PI / 2 + COND.tilt]} material={mat.glass()}>
        <cylinderGeometry args={[0.004, 0.004, 0.09, 8]} />
      </mesh>
      {/* thermometer */}
      {r.thermo && (
        <group>
          <mesh position={[0, (bulbY + DR.flaskY + DR.r + DR.neck + 0.12) / 2, 0]} material={mat.glass()}>
            <cylinderGeometry args={[0.0028, 0.0028, DR.flaskY + DR.r + DR.neck + 0.12 - bulbY, 8]} />
          </mesh>
          <mesh position={[0, bulbY, 0]} material={colourMaterial('#c8242b')}>
            <sphereGeometry args={[0.0042, 8, 6]} />
          </mesh>
          <mesh position={[0, bulbY + 0.01 + Math.max(0, (reading - 20) / 110) * 0.1, 0]} material={colourMaterial('#c8242b')}>
            <cylinderGeometry args={[0.0011, 0.0011, 0.02 + Math.max(0, (reading - 20) / 110) * 0.2, 6]} />
          </mesh>
          <mesh position={[0, DR.flaskY + DR.r + DR.neck + 0.003, 0]} material={mat.cork()}>
            <cylinderGeometry args={[0.012, 0.01, 0.014, 12]} />
          </mesh>
        </group>
      )}
      {/* condenser */}
      {r.condenser && (
        <group>
          <mesh position={[0.05 + (COND.len / 2) * cx, armY + (COND.len / 2) * sx, 0]} rotation={[0, 0, Math.PI / 2 + COND.tilt]} material={mat.glass()} renderOrder={5}>
            <cylinderGeometry args={[COND.r, COND.r, COND.len * 0.82, 18, 1, true]} />
          </mesh>
          {r.waterOn && (
            <mesh position={[0.05 + (COND.len / 2) * cx, armY + (COND.len / 2) * sx, 0]} rotation={[0, 0, Math.PI / 2 + COND.tilt]} material={liquidMaterial('#bcd9ee', inBottom ? 0.45 : 0.22)} renderOrder={3} scale={[1, inBottom ? 1 : 0.5, 1]}>
              <cylinderGeometry args={[COND.r - 0.002, COND.r - 0.002, COND.len * 0.8, 14]} />
            </mesh>
          )}
          <mesh position={[0.05 + (COND.len / 2) * cx, armY + (COND.len / 2) * sx, 0]} rotation={[0, 0, Math.PI / 2 + COND.tilt]} material={mat.glass()}>
            <cylinderGeometry args={[0.004, 0.004, COND.len, 8]} />
          </mesh>
          {/* hoses: inlet (blue) and outlet (grey) */}
          {[0.15, 0.85].map((f, k) => {
            const isIn = inBottom ? k === 1 : k === 0;
            return (
              <mesh key={k} position={[0.05 + COND.len * f * cx, armY + COND.len * f * sx - COND.r - 0.008, 0]} material={colourMaterial(isIn ? '#2563eb' : '#6b7280')}>
                <cylinderGeometry args={[0.004, 0.004, 0.02, 8]} />
              </mesh>
            );
          })}
        </group>
      )}
      {/* adapter down into the receiver */}
      <mesh position={[end[0], (end[1] + 0.1) / 2, 0]} material={mat.glass()}>
        <cylinderGeometry args={[0.004, 0.004, end[1] - 0.1, 8]} />
      </mesh>
      {/* receiver */}
      <group position={[end[0], 0, 0]}>
        <ConicalFlask volume={Math.min(60, r.distillate * 1.2)} colour={r.distillate > 0 ? WATER : null} />
        {r.receiver === 'STOPPERED' && !r.blown && (
          <mesh position={[0, 0.115, 0]} material={mat.rubber()}>
            <cylinderGeometry args={[0.012, 0.01, 0.018, 12]} />
          </mesh>
        )}
      </group>
      {glow && <GlowRing r={0.08} />}
    </group>
  );
}

// ------------------------------------------------------------------ AMMONIA

/** The ammonia rig: the hard-glass tube clamped sloping (down or up) over the burner, the drying tower, the gas jar. Rig-local positions. */
export const GAS = { tube: [0, 0, 0] as [number, number, number], dryer: [0.26, 0, 0] as [number, number, number], jar: [0.5, 0, 0] as [number, number, number] };
export function GasTube({ r, glow }: { r: AmRun; glow?: boolean }) {
  const tilt = r.clamp === 'UP' ? 0.35 : -0.12;
  return (
    <group>
      {/* retort stand */}
      <mesh position={[-0.12, 0.004, -0.04]} material={mat.darkMetal()}>
        <boxGeometry args={[0.14, 0.008, 0.1]} />
      </mesh>
      <mesh position={[-0.16, 0.2, -0.04]} material={mat.metal()}>
        <cylinderGeometry args={[0.005, 0.005, 0.4, 8]} />
      </mesh>
      <mesh position={[-0.1, 0.19, -0.02]} rotation={[0, 0, Math.PI / 2]} material={mat.metal()}>
        <cylinderGeometry args={[0.003, 0.003, 0.12, 6]} />
      </mesh>
      <group position={[-0.02, 0.19, 0]} rotation={[0, 0, tilt]}>
        <mesh rotation={[0, 0, Math.PI / 2]} material={mat.glass()} renderOrder={5}>
          <cylinderGeometry args={[0.012, 0.012, 0.16, 14, 1, true]} />
        </mesh>
        {r.loaded && (
          <mesh position={[-0.03, -0.006, 0]} rotation={[0, 0, Math.PI / 2]} material={colourMaterial(r.cracked ? '#d9d5c8' : '#f2f0e8')}>
            <cylinderGeometry args={[0.009, 0.009, 0.08, 10]} />
          </mesh>
        )}
        {r.heatSec > 0 && !r.cracked && (
          <mesh position={[0.06, -0.008, 0]} material={liquidMaterial('#dbe9f3', 0.7)}>
            <sphereGeometry args={[0.003, 6, 4]} />
          </mesh>
        )}
        {r.cracked && (
          <mesh position={[-0.02, 0, 0.0125]} rotation={[0, 0, 0.6]} material={mat.tickBlack()}>
            <planeGeometry args={[0.03, 0.0012]} />
          </mesh>
        )}
        <mesh position={[0.085, 0, 0]} material={mat.rubber()} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.012, 0.011, 0.014, 10]} />
        </mesh>
      </group>
      <group position={[-0.04, 0, 0]}>
        <Burner lit={r.heatSec > 0 && !r.cracked} />
      </group>
      {/* delivery tube to the dryer */}
      <mesh position={[0.17, 0.2, 0]} rotation={[0, 0, Math.PI / 2]} material={mat.glass()}>
        <cylinderGeometry args={[0.003, 0.003, 0.2, 6]} />
      </mesh>
      {/* from the top of the drying tower down and across to the gas jar, then up inside it */}
      <mesh position={[0.3, 0.115, 0]} material={mat.glass()}>
        <cylinderGeometry args={[0.003, 0.003, 0.17, 6]} />
      </mesh>
      <mesh position={[0.41, 0.03, 0]} rotation={[0, 0, Math.PI / 2]} material={mat.glass()}>
        <cylinderGeometry args={[0.003, 0.003, 0.22, 6]} />
      </mesh>
      <mesh position={[0.52, 0.13, 0]} material={mat.glass()}>
        <cylinderGeometry args={[0.003, 0.003, 0.2, 6]} />
      </mesh>
      {glow && <GlowRing r={0.12} />}
    </group>
  );
}
export function Dryer({ kind, glow }: { kind: string; glow?: boolean }) {
  return (
    <group>
      <BlobShadow r={0.04} />
      {kind === 'H2SO4' ? (
        <>
          <mesh position={[0, 0.06, 0]} material={mat.glass()} renderOrder={5}>
            <cylinderGeometry args={[0.03, 0.03, 0.12, 20, 1, true]} />
          </mesh>
          <mesh position={[0, 0.03, 0]} material={liquidMaterial('#f4f1e6', 0.6)} renderOrder={3}>
            <cylinderGeometry args={[0.028, 0.028, 0.06, 18]} />
          </mesh>
        </>
      ) : (
        <>
          <mesh position={[0, 0.11, 0]} material={mat.glass()} renderOrder={5}>
            <cylinderGeometry args={[0.022, 0.022, 0.16, 18, 1, true]} />
          </mesh>
          {kind && (
            <mesh position={[0, 0.1, 0]} material={colourMaterial(kind === 'CACL2' ? '#ecebe6' : '#e9e4d6')}>
              <cylinderGeometry args={[0.02, 0.02, 0.12, 14]} />
            </mesh>
          )}
          <mesh position={[0, 0.015, 0]} material={mat.glass()}>
            <cylinderGeometry args={[0.03, 0.035, 0.03, 18]} />
          </mesh>
        </>
      )}
      {kind && <Label text={kind === 'CAO' ? 'CaO' : kind === 'H2SO4' ? 'conc. H2SO4' : 'CaCl2'} position={[0, 0.06, 0.031]} w={0.04} h={0.016} />}
      {glow && <GlowRing r={0.045} />}
    </group>
  );
}
/** The gas jar: inverted over the delivery tube (upward delivery), upright (downward delivery) or in a trough of water. Damp litmus shows at the mouth once tested. */
export function GasJar({ r, glow }: { r: AmRun; glow?: boolean }) {
  const inverted = r.collect !== 'DOWNWARD';
  const litmus = r.litmus.includes('DAMP') ? (r.testedAt >= 0.3 ? '#2f5fd0' : '#c8242b') : null;
  return (
    <group>
      <BlobShadow r={0.05} />
      {r.collect === 'WATER' && (
        <mesh position={[0, 0.03, 0]} material={liquidMaterial('#cfe2f0', 0.4)} renderOrder={3}>
          <cylinderGeometry args={[0.09, 0.09, 0.06, 24]} />
        </mesh>
      )}
      <group position={[0, inverted ? 0.07 : 0, 0]}>
        <mesh position={[0, 0.09, 0]} material={mat.glass()} renderOrder={5}>
          <cylinderGeometry args={[0.035, 0.035, 0.18, 22, 1, true]} />
        </mesh>
        <mesh position={[0, inverted ? 0.18 : 0.002, 0]} material={mat.glass()}>
          <cylinderGeometry args={[0.036, 0.036, 0.004, 22]} />
        </mesh>
        {r.jar > 0.3 && (
          <mesh position={[0, 0.09, 0]} material={liquidMaterial('#f4f8fb', 0.06)} renderOrder={2}>
            <cylinderGeometry args={[0.033, 0.033, 0.17, 18]} />
          </mesh>
        )}
        {litmus && (
          <mesh position={[0.02, inverted ? -0.01 : 0.19, 0.03]} material={colourMaterial(litmus)}>
            <boxGeometry args={[0.008, 0.03, 0.001]} />
          </mesh>
        )}
        {r.hcl && r.testedAt >= 0.3 && (
          <mesh position={[0, inverted ? -0.012 : 0.19, 0]} material={liquidMaterial('#ffffff', 0.55)}>
            <sphereGeometry args={[0.025, 12, 8]} />
          </mesh>
        )}
      </group>
      {inverted && (
        <mesh position={[0, 0.035, 0]} material={mat.wood()}>
          <boxGeometry args={[0.08, 0.07, 0.08]} />
        </mesh>
      )}
      {glow && <GlowRing r={0.06} />}
    </group>
  );
}
/** The fountain: a round flask of ammonia held upside down over a trough of water with phenolphthalein; water spurts up the jet, pink. */
export function Fountain({ strength, glow }: { strength: number | null; glow?: boolean }) {
  const jet = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (jet.current) jet.current.scale.y = 0.85 + Math.sin(clock.elapsedTime * 14) * 0.15;
  });
  const pink = strength !== null && strength >= 0.6 ? '#ec5fa8' : '#dbe9f3';
  const filled = strength === null ? 0 : Math.min(0.9, strength);
  return (
    <group>
      <BlobShadow r={0.1} />
      <mesh position={[0, 0.03, 0]} material={liquidMaterial(strength !== null ? '#f3c3dc' : '#dbe9f3', 0.5)} renderOrder={3}>
        <cylinderGeometry args={[0.1, 0.1, 0.05, 26]} />
      </mesh>
      <mesh position={[0, 0.035, 0]} material={mat.glass()} renderOrder={5}>
        <cylinderGeometry args={[0.105, 0.1, 0.07, 26, 1, true]} />
      </mesh>
      <mesh position={[0, 0.15, 0]} material={mat.glass()}>
        <cylinderGeometry args={[0.003, 0.003, 0.19, 6]} />
      </mesh>
      <mesh position={[0, 0.31, 0]} material={mat.glass()} renderOrder={5}>
        <sphereGeometry args={[0.065, 24, 18]} />
      </mesh>
      {filled > 0 && (
        <mesh position={[0, 0.31 + 0.065 * (1 - filled), 0]} material={liquidMaterial(pink, 0.65)} renderOrder={3} scale={[1, filled, 1]}>
          <sphereGeometry args={[0.062, 20, 14]} />
        </mesh>
      )}
      {strength !== null && strength >= 0.6 && (
        <group ref={jet} position={[0, 0.27, 0]}>
          <mesh position={[0, 0.025, 0]} material={liquidMaterial(pink, 0.8)}>
            <cylinderGeometry args={[0.0015, 0.004, 0.05, 6]} />
          </mesh>
        </group>
      )}
      {/* clamp */}
      <mesh position={[-0.12, 0.2, 0]} material={mat.metal()}>
        <cylinderGeometry args={[0.005, 0.005, 0.4, 8]} />
      </mesh>
      <mesh position={[-0.06, 0.35, 0]} rotation={[0, 0, Math.PI / 2]} material={mat.metal()}>
        <cylinderGeometry args={[0.003, 0.003, 0.12, 6]} />
      </mesh>
      {glow && <GlowRing r={0.12} />}
    </group>
  );
}

/** A beaker of hot water (steaming) or iced water for the equilibrium tubes. */
export function TempBath({ kind, glow, children }: { kind: 'HOT' | 'ICE'; glow?: boolean; children?: ReactNode }) {
  return (
    <group>
      <BlobShadow r={0.06} />
      <mesh position={[0, 0.04, 0]} material={liquidMaterial(kind === 'ICE' ? '#e3f1fb' : '#d4e6f2', 0.38)} renderOrder={2}>
        <cylinderGeometry args={[0.05, 0.05, 0.075, 24]} />
      </mesh>
      {kind === 'ICE' &&
        [0, 1, 2, 3, 4].map((k) => (
          <mesh key={k} position={[Math.cos(k * 1.3) * 0.03, 0.075, Math.sin(k * 1.3) * 0.03]} rotation={[k, k * 0.5, 0]} material={liquidMaterial('#f4fbff', 0.8)} renderOrder={3}>
            <boxGeometry args={[0.016, 0.012, 0.016]} />
          </mesh>
        ))}
      {kind === 'HOT' && (
        <mesh position={[0, 0.11, 0]} material={liquidMaterial('#ffffff', 0.12)}>
          <sphereGeometry args={[0.035, 10, 8]} />
        </mesh>
      )}
      <mesh position={[0, 0.05, 0]} material={mat.glass()} renderOrder={5}>
        <cylinderGeometry args={[0.053, 0.052, 0.1, 26, 1, true]} />
      </mesh>
      <Label text={kind === 'HOT' ? 'HOT ~70 °C' : 'ICE ~2 °C'} position={[0, 0.05, 0.054]} w={0.06} h={0.022} />
      {children}
      {glow && <GlowRing r={0.07} />}
    </group>
  );
}
