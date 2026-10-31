import { useMemo } from 'react';
import { BlobShadow, GlowRing } from '../../../lab3d-kit/apparatus';
import { colourMaterial, liquidMaterial, mat } from '../../../lab3d-kit/materials';
import { bioCanvas, FONT } from '../../bio-common/lab3d/textures';

/**
 * The osmosis apparatus, at true size (metres), procedural: the potato and
 * its cylinders, the cork borer, the labelled solution beakers, the
 * electronic balance with its display, the agar block and cubes (a pink core
 * inside a colourless rim), and the beaker of acid.
 */

const FLESH = '#efe2b2';
const SKIN = '#9a6a3c';
export const PINK = '#e04f9a';
const CLEAR = '#f3efe2';

/** An Irish potato tuber on its side (cut flat where cylinders have been bored). */
export function PotatoTuber({ bored, glow }: { bored: number; glow?: boolean }) {
  return (
    <group>
      <BlobShadow r={0.06} />
      <mesh position={[0, 0.03, 0]} scale={[0.05, 0.03, 0.036]} material={colourMaterial(SKIN)}>
        <sphereGeometry args={[1, 24, 16]} />
      </mesh>
      {[0.6, 2.2, 4.1].map((a, k) => (
        <mesh key={k} position={[Math.cos(a) * 0.04, 0.05, Math.sin(a) * 0.024]} material={colourMaterial('#6f4a28')}>
          <sphereGeometry args={[0.003, 6, 5]} />
        </mesh>
      ))}
      {Array.from({ length: Math.min(8, bored) }, (_, k) => (
        <mesh key={`h${k}`} position={[-0.027 + (k % 4) * 0.018, 0.06, -0.009 + Math.floor(k / 4) * 0.018]} rotation={[-Math.PI / 2, 0, 0]} material={colourMaterial('#d9c78f')}>
          <circleGeometry args={[0.0045, 14]} />
        </mesh>
      ))}
      {glow && <GlowRing r={0.08} />}
    </group>
  );
}

/** A potato cylinder lying along x (origin at its left end, on the surface below it): `length` and `diameter` in mm; soft ones sag. */
export function PotatoCylinder({ length, diameter, sag = 0, glow }: { length: number; diameter: number; sag?: number; glow?: boolean }) {
  const L = length / 1000;
  const r = diameter / 2000;
  return (
    <group>
      <mesh position={[L / 2, r, 0]} rotation={[sag * 0.15, 0, Math.PI / 2]} material={colourMaterial(FLESH)}>
        <cylinderGeometry args={[r, r, L, 16]} />
      </mesh>
      {glow && (
        <mesh position={[L / 2, r, 0]} rotation={[0, 0, Math.PI / 2]} material={mat.highlight()}>
          <cylinderGeometry args={[r * 1.5, r * 1.5, L * 1.08, 16, 1, true]} />
        </mesh>
      )}
    </group>
  );
}

/** A cork borer: a brass tube with a ring handle. */
export function CorkBorer({ glow }: { glow?: boolean }) {
  return (
    <group rotation={[0, 0.3, 0]}>
      <mesh position={[0, 0.006, 0]} rotation={[0, 0, Math.PI / 2]} material={colourMaterial('#c7a24a')}>
        <cylinderGeometry args={[0.005, 0.005, 0.09, 14, 1, true]} />
      </mesh>
      <mesh position={[0.05, 0.006, 0]} rotation={[0, Math.PI / 2, 0]} material={colourMaterial('#b48c33')}>
        <torusGeometry args={[0.012, 0.0028, 8, 20]} />
      </mesh>
      {glow && <GlowRing r={0.06} />}
    </group>
  );
}

const labelTexture = (text: string, sub: string) =>
  bioCanvas(`osmo-label-${text}-${sub}`, 160, 96, (g, w, h) => {
    g.fillStyle = '#fffdf6';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#2d5d8a';
    g.lineWidth = 6;
    g.strokeRect(3, 3, w - 6, h - 6);
    g.fillStyle = '#1d2a35';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `700 40px ${FONT}`;
    g.fillText(text, w / 2, h * 0.42);
    g.font = `500 20px ${FONT}`;
    g.fillText(sub, w / 2, h * 0.78);
  });

/** A 100 cm³ beaker of solution with its label (the concentration); the cylinder stands in it while soaking. */
export function SolutionBeakerModel({ conc, cylinder, glow }: { conc: number; cylinder: { length: number; diameter: number } | null; glow?: boolean }) {
  const tex = useMemo(() => labelTexture(conc === 0 ? 'Water' : `${conc.toFixed(1)} M`, conc === 0 ? 'distilled' : 'sucrose'), [conc]);
  return (
    <group>
      <BlobShadow r={0.045} />
      <mesh position={[0, 0.03, 0]} material={liquidMaterial(conc === 0 ? '#dcecf5' : '#e8eef0', 0.35)} renderOrder={2}>
        <cylinderGeometry args={[0.03, 0.03, 0.056, 20]} />
      </mesh>
      {cylinder && (
        <mesh position={[0, 0.003 + cylinder.length / 2000, 0]} material={colourMaterial(FLESH)} renderOrder={3}>
          <cylinderGeometry args={[cylinder.diameter / 2000, cylinder.diameter / 2000, cylinder.length / 1000, 14]} />
        </mesh>
      )}
      <mesh position={[0, 0.045, 0]} material={mat.glass()} renderOrder={4}>
        <cylinderGeometry args={[0.033, 0.032, 0.09, 22, 1, true]} />
      </mesh>
      <mesh position={[0, 0.06, 0.0335]}>
        <planeGeometry args={[0.036, 0.022]} />
        <meshStandardMaterial map={tex} roughness={0.8} />
      </mesh>
      {glow && <GlowRing r={0.05} />}
    </group>
  );
}

/** The electronic balance (0.01 g), its display showing `mass` (null: 0.00). */
export function BalanceModel({ mass, glow }: { mass: number | null; glow?: boolean }) {
  const shown = mass === null ? '0.00' : mass.toFixed(2);
  const tex = useMemo(
    () =>
      bioCanvas(`osmo-balance-${shown}`, 256, 96, (g, w, h) => {
        g.fillStyle = '#1d2a22';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#9ff0b4';
        g.textAlign = 'right';
        g.textBaseline = 'middle';
        g.font = `700 64px ui-monospace, Consolas, monospace`;
        g.fillText(shown, w - 50, h / 2 + 3);
        g.font = `600 30px ${FONT}`;
        g.fillText('g', w - 14, h / 2 + 8);
      }),
    [shown],
  );
  return (
    <group>
      <BlobShadow r={0.11} />
      <mesh position={[0, 0.022, 0]} material={colourMaterial('#e9ebe6')}>
        <boxGeometry args={[0.16, 0.044, 0.2]} />
      </mesh>
      <mesh position={[0, 0.047, -0.02]} material={mat.steel()}>
        <cylinderGeometry args={[0.055, 0.055, 0.004, 28]} />
      </mesh>
      <mesh position={[0, 0.033, 0.1005]} rotation={[-0.25, 0, 0]}>
        <planeGeometry args={[0.07, 0.026]} />
        <meshBasicMaterial map={tex} />
      </mesh>
      {glow && <GlowRing r={0.12} />}
    </group>
  );
}
/** Height of the balance pan above the bench. */
export const PAN_Y = 0.049;

/** The slab of pink agar on the tile. */
export function AgarBlock({ glow }: { glow?: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.0155, 0]} material={liquidMaterial(PINK, 0.88)}>
        <boxGeometry args={[0.07, 0.03, 0.05]} />
      </mesh>
      {glow && <GlowRing r={0.06} />}
    </group>
  );
}

/** An agar cube of side `side` (mm): a pink core (`core`: its half-side fraction) inside a colourless rim; `cut`: halved, the cut face up. */
export function AgarCubeModel({ side, core, cut, glow }: { side: number; core: number; cut?: boolean; glow?: boolean }) {
  const s = side / 1000;
  const k = Math.max(0, Math.min(1, core));
  if (cut)
    return (
      <group>
        <mesh position={[0, s / 4, 0]} material={colourMaterial(CLEAR)}>
          <boxGeometry args={[s, s / 2, s]} />
        </mesh>
        {k > 0 && (
          <mesh position={[0, s / 2 + 0.0002, 0]} rotation={[-Math.PI / 2, 0, 0]} material={colourMaterial(PINK)}>
            <planeGeometry args={[s * k, s * k]} />
          </mesh>
        )}
        {glow && <GlowRing r={s} />}
      </group>
    );
  return (
    <group>
      <mesh position={[0, s / 2, 0]} material={liquidMaterial(CLEAR, 0.45)} renderOrder={3}>
        <boxGeometry args={[s, s, s]} />
      </mesh>
      {k > 0 && (
        <mesh position={[0, s / 2, 0]} material={colourMaterial(PINK)} renderOrder={2}>
          <boxGeometry args={[s * k, s * k, s * k]} />
        </mesh>
      )}
      {glow && <GlowRing r={Math.max(0.02, s)} />}
    </group>
  );
}

/** The 400 cm³ beaker for the acid (`level`: liquid height, m). Children stand on its floor. */
export function AcidBeaker({ level, glow, children }: { level: number; glow?: boolean; children?: React.ReactNode }) {
  return (
    <group>
      <BlobShadow r={0.06} />
      {children}
      {level > 0 && (
        <mesh position={[0, 0.003 + level / 2, 0]} material={liquidMaterial('#d9ecf5', 0.28)} renderOrder={4}>
          <cylinderGeometry args={[0.042, 0.042, level, 26]} />
        </mesh>
      )}
      <mesh position={[0, 0.06, 0]} material={mat.glass()} renderOrder={5}>
        <cylinderGeometry args={[0.045, 0.044, 0.12, 28, 1, true]} />
      </mesh>
      {glow && <GlowRing r={0.07} />}
    </group>
  );
}
export const ACID_LEVEL = { FULL: 0.045, SHALLOW: 0.018 } as const;
