import { GERM_TUBES, germSeeds, respCo2, seedStage, seedUp, tropCtrlAngle, tropKlinoDown, tropTestAngle, tropTurn, type BioGrowthState, type BioGrowthVariant, type GermTube, type SeedKind } from '@aischool/shared';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { CatmullRomCurve3, DoubleSide, Vector3, type Group } from 'three';
import { BlobShadow, GlowRing, Thermometer } from '../../../lab3d-kit/apparatus';
import { colourMaterial, liquidMaterial, mat } from '../../../lab3d-kit/materials';
import { bioCanvas, FONT, letterCardTexture } from '../../bio-common/lab3d/textures';

/**
 * The growth lab's procedural apparatus, at true size (metres; the origin is
 * the point it stands on): the germination tubes seed by seed and the bench
 * refrigerator; the box of sawdust and the seed jar with seedlings at their
 * true lengths; the vacuum flasks in clamps with thermometers and the CO₂
 * test; the light-proof box, the potted seedlings bending by the shared
 * angle, the clinostat and the cork of pinned radicles; the protractor.
 */

type V3 = [number, number, number];
const SEED = '#c9a86a';
const PALE = '#ece6c4';
const GREEN = '#5c9b36';

// ------------------------------------------------------------------ germination

const TUBE = { r: 0.011, h: 0.15 };
/** One stoppered test tube: cotton wool or water (with oil), the seeds swelling and putting out radicles on day d, a label. */
export function GermTubeModel({ v, w, t, k, d, glow }: { v: BioGrowthVariant; w: BioGrowthState['germ']; t: GermTube; k: number; d: number; glow?: boolean }) {
  const seeds = useMemo(() => germSeeds(v.germ, w, t, k), [v, w, t, k]);
  const label = useMemo(() => letterCardTexture(GERM_TUBES[k]!), [k]);
  const cottonTop = 0.05;
  return (
    <group>
      <mesh position={[0, TUBE.h / 2, 0]} material={mat.glass()} renderOrder={5}>
        <cylinderGeometry args={[TUBE.r, TUBE.r, TUBE.h, 16, 1, true]} />
      </mesh>
      <mesh position={[0, 0.002, 0]} material={mat.glass()} renderOrder={5}>
        <sphereGeometry args={[TUBE.r, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
      </mesh>
      <mesh position={[0, TUBE.h + 0.008, 0]} material={mat.cork()}>
        <cylinderGeometry args={[TUBE.r + 0.001, TUBE.r - 0.002, 0.018, 12]} />
      </mesh>
      {t.cotton && (
        <mesh position={[0, cottonTop / 2, 0]} material={colourMaterial(t.cotton === 'MOIST' ? '#e3e8ea' : '#fbfbf6')}>
          <cylinderGeometry args={[TUBE.r - 0.001, TUBE.r - 0.002, cottonTop, 12]} />
        </mesh>
      )}
      {t.water && (
        <mesh position={[0, 0.045, 0]} material={liquidMaterial('#cfe6f6', 0.5)} renderOrder={3}>
          <cylinderGeometry args={[TUBE.r - 0.0008, TUBE.r - 0.0008, 0.09, 12]} />
        </mesh>
      )}
      {t.water && t.oil && (
        <mesh position={[0, 0.093, 0]} material={liquidMaterial('#e8c95a', 0.85)} renderOrder={3}>
          <cylinderGeometry args={[TUBE.r - 0.0008, TUBE.r - 0.0008, 0.006, 12]} />
        </mesh>
      )}
      {seeds.map((s, j) => {
        const a = j * 2.4;
        const rr = j % 2 ? 0.005 : 0.002;
        const y = t.water ? 0.006 + Math.floor(j / 3) * 0.006 : cottonTop + 0.003 + (j % 3) * 0.003;
        const sw = s.swell !== null && s.swell <= d ? 1.25 : 1;
        const germ = s.tg !== null && s.tg <= d + 1e-9;
        const len = germ ? Math.min(0.03, 0.004 + (d - s.tg!) * 0.01) : 0;
        return (
          <group key={j} position={[rr * Math.cos(a), y, rr * Math.sin(a)]} rotation={[0, a, 0.4]}>
            <mesh scale={[0.0034 * sw, 0.0024 * sw, 0.0026 * sw]} material={colourMaterial(SEED)}>
              <sphereGeometry args={[1, 10, 8]} />
            </mesh>
            {germ && (
              <mesh position={[0, -len / 2, 0]} material={colourMaterial('#f4efda')}>
                <cylinderGeometry args={[0.0007, 0.0005, len, 6]} />
              </mesh>
            )}
          </group>
        );
      })}
      {t.label && (
        <mesh position={[0, 0.115, TUBE.r + 0.0008]}>
          <planeGeometry args={[0.016, 0.016]} />
          <meshStandardMaterial map={label} roughness={0.8} />
        </mesh>
      )}
      {glow && <GlowRing r={0.02} />}
    </group>
  );
}

/** A wooden rack for four test tubes. */
export function RackModel({ glow }: { glow?: boolean }) {
  return (
    <group>
      <BlobShadow r={0.14} />
      <mesh position={[0, 0.006, 0]} material={mat.wood()}>
        <boxGeometry args={[0.28, 0.012, 0.06]} />
      </mesh>
      <mesh position={[0, 0.07, 0]} material={mat.wood()}>
        <boxGeometry args={[0.28, 0.01, 0.06]} />
      </mesh>
      {[-0.135, 0.135].map((x) => (
        <mesh key={x} position={[x, 0.04, 0]} material={mat.wood()}>
          <boxGeometry args={[0.01, 0.07, 0.06]} />
        </mesh>
      ))}
      {glow && <GlowRing r={0.16} />}
    </group>
  );
}

/** A small bench refrigerator with a glass door (contents visible), its inside lit pale blue. */
export function FridgeModel({ glow, children }: { glow?: boolean; children?: React.ReactNode }) {
  return (
    <group>
      <BlobShadow r={0.2} />
      {/* back, sides, top, bottom */}
      <mesh position={[0, 0.17, -0.13]} material={mat.white()}>
        <boxGeometry args={[0.3, 0.34, 0.02]} />
      </mesh>
      {[-0.145, 0.145].map((x) => (
        <mesh key={x} position={[x, 0.17, 0]} material={mat.white()}>
          <boxGeometry args={[0.01, 0.34, 0.27]} />
        </mesh>
      ))}
      <mesh position={[0, 0.335, 0]} material={mat.white()}>
        <boxGeometry args={[0.3, 0.012, 0.27]} />
      </mesh>
      <mesh position={[0, 0.02, 0]} material={mat.darkMetal()}>
        <boxGeometry args={[0.3, 0.04, 0.27]} />
      </mesh>
      <mesh position={[0, 0.18, -0.115]} material={colourMaterial('#dceefc')}>
        <planeGeometry args={[0.27, 0.3]} />
      </mesh>
      <mesh position={[0, 0.17, 0.136]} material={mat.pane()}>
        <planeGeometry args={[0.28, 0.32]} />
      </mesh>
      <mesh position={[0.12, 0.2, 0.142]} material={mat.metal()}>
        <boxGeometry args={[0.01, 0.12, 0.012]} />
      </mesh>
      <mesh position={[0.08, 0.3, 0.138]}>
        <planeGeometry args={[0.06, 0.02]} />
        <meshBasicMaterial map={fridgeTexture()} />
      </mesh>
      {children}
      {glow && <GlowRing r={0.22} />}
    </group>
  );
}
const fridgeTexture = () =>
  bioCanvas('growth-fridge-display', 128, 42, (g, w, h) => {
    g.fillStyle = '#0d1b24';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#7fe0ff';
    g.font = `700 26px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('5 °C', w / 2, h / 2 + 1);
  });

/** A tuft of cotton wool. */
export function CottonModel({ glow }: { glow?: boolean }) {
  return (
    <group>
      <BlobShadow r={0.05} />
      {[
        [0, 0.018, 0],
        [0.02, 0.014, 0.01],
        [-0.018, 0.013, -0.006],
        [0.004, 0.026, -0.012],
      ].map((p, k) => (
        <mesh key={k} position={p as V3} material={colourMaterial('#fbfbf6')}>
          <sphereGeometry args={[0.02, 10, 8]} />
        </mesh>
      ))}
      {glow && <GlowRing r={0.05} />}
    </group>
  );
}

/** A dish of seeds (cowpea), soaked or dry. */
export function SeedDishModel({ soaked, glow, maize }: { soaked: boolean; glow?: boolean; maize?: boolean }) {
  const pts = useMemo(() => Array.from({ length: 22 }, (_, k) => ({ a: k * 2.4, r: 0.008 + (k % 5) * 0.007, maize: !!maize && k % 2 === 1 })), [maize]);
  return (
    <group>
      <BlobShadow r={0.06} />
      <mesh position={[0, 0.008, 0]} material={mat.glass()} renderOrder={5}>
        <cylinderGeometry args={[0.055, 0.05, 0.016, 24, 1, true]} />
      </mesh>
      <mesh position={[0, 0.001, 0]} material={mat.glass()}>
        <cylinderGeometry args={[0.05, 0.05, 0.002, 24]} />
      </mesh>
      {soaked && (
        <mesh position={[0, 0.008, 0]} material={liquidMaterial('#cfe6f6', 0.45)}>
          <cylinderGeometry args={[0.049, 0.049, 0.012, 20]} />
        </mesh>
      )}
      {pts.map((p, k) => (
        <mesh key={k} position={[p.r * Math.cos(p.a), 0.006, p.r * Math.sin(p.a)]} rotation={[0, p.a, 0]} scale={[0.0042 * (soaked ? 1.2 : 1), 0.0028, 0.003]} material={colourMaterial(p.maize ? '#f2c94c' : SEED)}>
          <sphereGeometry args={[1, 10, 8]} />
        </mesh>
      ))}
      {glow && <GlowRing r={0.065} />}
    </group>
  );
}

// ------------------------------------------------------------------ seedlings

/** A seedling at its true length L (mm) from its seed point (origin): cowpea arches then lifts its cotyledons; maize keeps its grain and sends up a coleoptile. */
export function Seedling3D({ v, w, kind, d, scale = 1 }: { v: BioGrowthVariant; w: BioGrowthState['seedling']; kind: SeedKind; d: number; scale?: number }) {
  const st = seedStage(v.seedling, w, kind, d);
  const L = (st.L / 1000) * scale;
  const rad = st.radicle ? Math.min(0.05, 0.006 + L * 0.5) : 0;
  const arched = kind === 'COWPEA' && st.hook && !st.cotAbove;
  const cotCol = st.green ? GREEN : '#d9c27e';
  return (
    <group>
      {rad > 0 && (
        <mesh position={[0, -rad / 2, 0]} material={colourMaterial('#f1ead2')}>
          <cylinderGeometry args={[0.0011, 0.0006, rad, 6]} />
        </mesh>
      )}
      {kind === 'COWPEA' ? (
        <>
          {L > 0.002 && (
            <mesh position={[0, L / 2, 0]} material={colourMaterial(st.green ? '#8bb859' : PALE)}>
              <cylinderGeometry args={[0.0014, 0.0016, L, 6]} />
            </mesh>
          )}
          {st.hook ? (
            <group position={[0, L, 0]} rotation={[0, 0, arched ? Math.PI * 0.85 : 0]}>
              {[-1, 1].map((s) => (
                <mesh key={s} position={[s * 0.004, 0.002, 0]} scale={[0.005, 0.0032, 0.004]} material={colourMaterial(cotCol)}>
                  <sphereGeometry args={[1, 10, 8]} />
                </mesh>
              ))}
              {st.leaves &&
                [-1, 1].map((s) => (
                  <mesh key={`l${s}`} position={[s * 0.008, 0.008, 0]} rotation={[0, 0, -s * 0.8]} material={colourMaterial(GREEN)}>
                    <planeGeometry args={[0.012, 0.007]} />
                  </mesh>
                ))}
            </group>
          ) : (
            <mesh scale={[0.006, 0.004, 0.0045]} material={colourMaterial(SEED)}>
              <sphereGeometry args={[1, 10, 8]} />
            </mesh>
          )}
        </>
      ) : (
        <>
          <mesh scale={[0.0045, 0.006, 0.003]} material={colourMaterial('#f2c94c')}>
            <sphereGeometry args={[1, 10, 8]} />
          </mesh>
          {L > 0.001 && (
            <mesh position={[0, L / 2, 0]} material={colourMaterial(st.green ? '#a9c77a' : PALE)}>
              <cylinderGeometry args={[0.0009, 0.0018, L, 6]} />
            </mesh>
          )}
          {st.leaves && (
            <mesh position={[0.002, L + 0.012, 0]} rotation={[0, 0, -0.15]} material={colourMaterial(GREEN)}>
              <boxGeometry args={[0.003, 0.028, 0.0006]} />
            </mesh>
          )}
        </>
      )}
    </group>
  );
}

/** The box of sawdust with ten cowpea and ten maize seeds; what has come up above the surface on day d. */
export function SawdustBoxModel({ v, w, glow }: { v: BioGrowthVariant; w: BioGrowthState['seedling']; glow?: boolean }) {
  const d = w.day;
  const depth = v.seedling.depth / 1000;
  const moist = w.waters.length > 0 && d - Math.max(...w.waters.filter((x) => x <= d)) < 2;
  return (
    <group>
      <BlobShadow r={0.18} />
      <mesh position={[0, 0.03, 0]} material={mat.wood()}>
        <boxGeometry args={[0.3, 0.06, 0.16]} />
      </mesh>
      <mesh position={[0, 0.061, 0]} rotation={[-Math.PI / 2, 0, 0]} material={colourMaterial(moist ? '#9c7a4f' : '#c4a57a')}>
        <planeGeometry args={[0.28, 0.14]} />
      </mesh>
      {w.box &&
        (['COWPEA', 'MAIZE'] as SeedKind[]).map((kind, ki) =>
          Array.from({ length: seedUp(v.seedling, w, kind, d) }, (_, j) => (
            <group key={`${kind}${j}`} position={[-0.12 + (j % 5) * 0.025, 0.06 - depth, ki === 0 ? -0.035 + Math.floor(j / 5) * 0.025 : 0.02 + Math.floor(j / 5) * 0.025]}>
              <Seedling3D v={v} w={w} kind={kind} d={d} scale={0.95 + (j % 3) * 0.04} />
            </group>
          )),
        )}
      {glow && <GlowRing r={0.19} />}
    </group>
  );
}

/** The seed jar: a gas jar lined with blotting paper, a cowpea and a maize seed pinned against it (seen from the front). */
export function SeedJarModel({ v, w, glow }: { v: BioGrowthVariant; w: BioGrowthState['seedling']; glow?: boolean }) {
  const d = w.day;
  const moist = w.waters.length > 0 && d - Math.max(...w.waters.filter((x) => x <= d)) < 2;
  return (
    <group>
      <BlobShadow r={0.07} />
      <mesh position={[0, 0.13, 0]} material={mat.glass()} renderOrder={5}>
        <cylinderGeometry args={[0.05, 0.05, 0.26, 24, 1, true]} />
      </mesh>
      <mesh position={[0, 0.004, 0]} material={mat.glass()}>
        <cylinderGeometry args={[0.055, 0.055, 0.008, 24]} />
      </mesh>
      <mesh position={[0, 0.12, 0]} material={colourMaterial(moist ? '#e7e0cc' : '#f7f3e8')}>
        <cylinderGeometry args={[0.047, 0.047, 0.22, 20, 1, true, Math.PI * 0.6, Math.PI * 0.8]} />
      </mesh>
      {w.jar &&
        (['COWPEA', 'MAIZE'] as SeedKind[]).map((kind, i) => (
          <group key={kind} position={[i === 0 ? -0.018 : 0.018, 0.1, 0.042]}>
            <Seedling3D v={v} w={w} kind={kind} d={d} />
          </group>
        ))}
      {glow && <GlowRing r={0.07} />}
    </group>
  );
}

// ------------------------------------------------------------------ respiration

/** A vacuum flask held in a clamp: upright or inverted, with seeds, a thermometer and a plug of cotton wool or a bung. */
export function ThermosModel({ flask, letter, glow }: { flask: BioGrowthState['resp']['A']; letter: string; glow?: boolean }) {
  const label = useMemo(() => letterCardTexture(letter), [letter]);
  const inv = flask.inverted;
  const y0 = inv ? 0.36 : 0.06;
  return (
    <group>
      <BlobShadow r={0.08} />
      {/* retort stand */}
      <mesh position={[-0.07, 0.006, 0]} material={mat.darkMetal()}>
        <boxGeometry args={[0.1, 0.012, 0.12]} />
      </mesh>
      <mesh position={[-0.1, 0.26, 0]} material={mat.metal()}>
        <cylinderGeometry args={[0.005, 0.005, 0.5, 8]} />
      </mesh>
      <mesh position={[-0.06, inv ? 0.28 : 0.2, 0]} rotation={[0, 0, Math.PI / 2]} material={mat.metal()}>
        <cylinderGeometry args={[0.004, 0.004, 0.08, 8]} />
      </mesh>
      <group position={[0, y0, 0]} rotation={[inv ? Math.PI : 0, 0, 0]}>
        <mesh position={[0, 0.1, 0]} material={mat.steel()}>
          <cylinderGeometry args={[0.04, 0.04, 0.2, 24]} />
        </mesh>
        <mesh position={[0, 0.215, 0]} material={mat.steel()}>
          <cylinderGeometry args={[0.022, 0.034, 0.03, 20]} />
        </mesh>
        {flask.plug && (
          <mesh position={[0, 0.237, 0]} material={flask.plug === 'COTTON' ? colourMaterial('#fbfbf6') : mat.black()}>
            <cylinderGeometry args={[0.02, 0.018, 0.016, 14]} />
          </mesh>
        )}
        {flask.thermo && (
          <group position={[0.008, 0.2, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <Thermometer />
          </group>
        )}
        <mesh position={[0, 0.12, 0.0405]}>
          <planeGeometry args={[0.03, 0.03]} />
          <meshStandardMaterial map={label} roughness={0.8} />
        </mesh>
      </group>
      {flask.seeds && !flask.thermo && (
        <mesh position={[0, inv ? 0.26 : 0.17, 0]} material={colourMaterial(flask.seeds === 'LIVE' ? '#d8bd7a' : '#b9a27a')}>
          <cylinderGeometry args={[0.02, 0.02, 0.004, 12]} />
        </mesh>
      )}
      {glow && <GlowRing r={0.09} />}
    </group>
  );
}

/** A beaker of water on a tripod over a Bunsen burner (for boiling half the seeds). */
export function BoilerModel({ lit, seeds, glow }: { lit: boolean; seeds: boolean; glow?: boolean }) {
  const flame = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (flame.current) flame.current.scale.y = 1 + Math.sin(clock.elapsedTime * 20) * 0.1;
  });
  return (
    <group>
      <BlobShadow r={0.09} />
      {[0, 2.1, 4.2].map((a) => (
        <mesh key={a} position={[0.06 * Math.cos(a), 0.09, 0.06 * Math.sin(a)]} rotation={[0.18 * Math.sin(a), 0, -0.18 * Math.cos(a)]} material={mat.darkMetal()}>
          <cylinderGeometry args={[0.003, 0.003, 0.18, 6]} />
        </mesh>
      ))}
      <mesh position={[0, 0.182, 0]} material={mat.metal()}>
        <boxGeometry args={[0.13, 0.003, 0.13]} />
      </mesh>
      <mesh position={[0, 0.22, 0]} material={mat.glass()} renderOrder={5}>
        <cylinderGeometry args={[0.04, 0.038, 0.075, 20, 1, true]} />
      </mesh>
      <mesh position={[0, 0.212, 0]} material={liquidMaterial('#d6e8f5', 0.4)}>
        <cylinderGeometry args={[0.037, 0.036, 0.055, 18]} />
      </mesh>
      {seeds && (
        <mesh position={[0, 0.19, 0]} material={colourMaterial('#b9a27a')}>
          <cylinderGeometry args={[0.034, 0.034, 0.01, 14]} />
        </mesh>
      )}
      <mesh position={[0, 0.045, 0]} material={mat.metal()}>
        <cylinderGeometry args={[0.008, 0.01, 0.09, 10]} />
      </mesh>
      <mesh position={[0, 0.006, 0]} material={mat.darkMetal()}>
        <cylinderGeometry args={[0.035, 0.04, 0.012, 16]} />
      </mesh>
      {lit && (
        <group ref={flame} position={[0, 0.12, 0]}>
          <mesh>
            <coneGeometry args={[0.009, 0.05, 12]} />
            <meshBasicMaterial color="#5f8dff" transparent opacity={0.75} depthWrite={false} />
          </mesh>
        </group>
      )}
      {glow && <GlowRing r={0.1} />}
    </group>
  );
}

/** The CO₂ test: a stoppered conical flask of seeds with a delivery tube into a test tube of lime water (milky) or indicator (red → yellow). */
export function Co2TestModel({ seeds, liquid, bubbling, glow }: { seeds: 'LIVE' | 'BOILED'; liquid: string; bubbling: boolean; glow?: boolean }) {
  const bub = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!bub.current) return;
    bub.current.children.forEach((c, i) => {
      c.position.y = 0.01 + ((clock.elapsedTime * 0.05 + i * 0.017) % 0.06);
      c.visible = bubbling;
    });
  });
  return (
    <group>
      <BlobShadow r={0.06} />
      <mesh position={[0, 0.04, 0]} material={mat.glass()} renderOrder={5}>
        <cylinderGeometry args={[0.012, 0.042, 0.08, 20, 1, true]} />
      </mesh>
      <mesh position={[0, 0.012, 0]} material={colourMaterial(seeds === 'LIVE' ? '#d8bd7a' : '#b9a27a')}>
        <cylinderGeometry args={[0.035, 0.04, 0.02, 16]} />
      </mesh>
      <mesh position={[0, 0.085, 0]} material={mat.rubber()}>
        <cylinderGeometry args={[0.013, 0.011, 0.014, 12]} />
      </mesh>
      <mesh position={[0.04, 0.115, 0]} rotation={[0, 0, Math.PI / 2]} material={mat.glass()}>
        <cylinderGeometry args={[0.002, 0.002, 0.08, 6]} />
      </mesh>
      <mesh position={[0, 0.1, 0]} material={mat.glass()}>
        <cylinderGeometry args={[0.002, 0.002, 0.03, 6]} />
      </mesh>
      <mesh position={[0.08, 0.075, 0]} material={mat.glass()}>
        <cylinderGeometry args={[0.002, 0.002, 0.08, 6]} />
      </mesh>
      <group position={[0.08, 0, 0]}>
        <mesh position={[0, 0.06, 0]} material={mat.glass()} renderOrder={5}>
          <cylinderGeometry args={[0.011, 0.011, 0.12, 14, 1, true]} />
        </mesh>
        <mesh position={[0, 0.035, 0]} material={liquidMaterial(liquid, 0.8)} renderOrder={3}>
          <cylinderGeometry args={[0.0102, 0.0102, 0.065, 12]} />
        </mesh>
        <group ref={bub}>
          {[0, 1, 2, 3].map((i) => (
            <mesh key={i} position={[0.002 * (i % 2 ? 1 : -1), 0.01, 0]} material={mat.white()}>
              <sphereGeometry args={[0.0016, 6, 5]} />
            </mesh>
          ))}
        </group>
      </group>
      {glow && <GlowRing r={0.08} />}
    </group>
  );
}
export const co2Liquid = (ind: 'LIME' | 'BICARB' | null, x: number) => {
  const mix = (a: string, b: string, f: number) => {
    const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const A = p(a);
    const B = p(b);
    return `#${A.map((c, i) => Math.round(c + (B[i]! - c) * Math.max(0, Math.min(1, f))).toString(16).padStart(2, '0')).join('')}`;
  };
  return ind === 'BICARB' ? (x < 0.5 ? mix('#d8343f', '#ef8a2c', x * 2) : mix('#ef8a2c', '#e8d23c', (x - 0.5) * 2)) : mix('#bfe0f5', '#fbfaf2', x);
};
export const co2Now = (v: BioGrowthVariant, w: BioGrowthState['resp']) => respCo2(v.resp, w, w.clock);

// ------------------------------------------------------------------ tropisms

/** A pot of maize seedlings whose shoots bend by `deg` towards +x. */
export function PotSeedlingsModel({ deg, glow }: { deg: number; glow?: boolean }) {
  const shoots = useMemo(() => [-0.02, -0.007, 0.007, 0.02].map((x, k) => ({ x, z: (k % 2 ? 1 : -1) * 0.01, len: 0.085 + k * 0.006, f: 0.9 + k * 0.05 })), []);
  return (
    <group>
      <BlobShadow r={0.06} />
      <mesh position={[0, 0.035, 0]} material={colourMaterial('#b5653a')}>
        <cylinderGeometry args={[0.045, 0.035, 0.07, 18]} />
      </mesh>
      <mesh position={[0, 0.068, 0]} material={colourMaterial('#4a3424')}>
        <cylinderGeometry args={[0.042, 0.042, 0.004, 18]} />
      </mesh>
      {shoots.map((s, k) => (
        <ShootTube key={k} x={s.x} z={s.z} len={s.len} deg={deg * s.f} />
      ))}
      {glow && <GlowRing r={0.07} />}
    </group>
  );
}
function ShootTube({ x, z, len, deg }: { x: number; z: number; len: number; deg: number }) {
  const geo = useMemo(() => {
    const a = (Math.max(-85, Math.min(85, deg)) * Math.PI) / 180;
    const pts: Vector3[] = [];
    for (let i = 0; i <= 8; i++) {
      const f = i / 8;
      const ang = a * f * f;
      const prev = pts[i - 1] ?? new Vector3(x, 0.07, z);
      pts.push(i === 0 ? prev.clone() : new Vector3(prev.x + (len / 8) * Math.sin(ang), prev.y + (len / 8) * Math.cos(ang), z));
    }
    return new CatmullRomCurve3(pts);
  }, [x, z, len, deg]);
  return (
    <mesh material={colourMaterial('#6aa84f')}>
      <tubeGeometry args={[geo, 16, 0.0015, 5, false]} />
    </mesh>
  );
}

/** The light-proof box (cut away at the front so the pot shows), its slit on the +x side (or −x: facing away), black tape over the gaps. */
export function LightBoxModel({ slit, taped, glow, children }: { slit: 'LAMP' | 'AWAY' | null; taped: boolean; glow?: boolean; children?: React.ReactNode }) {
  const W = 0.24;
  const H = 0.24;
  const D = 0.2;
  const black = colourMaterial('#202020');
  const sx = slit === 'AWAY' ? -W / 2 : W / 2;
  return (
    <group>
      <BlobShadow r={0.16} />
      <mesh position={[0, H / 2, -D / 2]} material={black}>
        <boxGeometry args={[W, H, 0.006]} />
      </mesh>
      <mesh position={[0, H, 0]} material={black}>
        <boxGeometry args={[W, 0.006, D]} />
      </mesh>
      {[-W / 2, W / 2].map((x) => (
        <group key={x}>
          {slit && Math.abs(x - sx) < 1e-6 ? (
            <>
              <mesh position={[x, H * 0.78, 0]} material={black}>
                <boxGeometry args={[0.006, H * 0.44, D]} />
              </mesh>
              <mesh position={[x, H * 0.22, 0]} material={black}>
                <boxGeometry args={[0.006, H * 0.3, D]} />
              </mesh>
            </>
          ) : (
            <mesh position={[x, H / 2, 0]} material={black}>
              <boxGeometry args={[0.006, H, D]} />
            </mesh>
          )}
        </group>
      ))}
      {!taped && (
        <mesh position={[-W / 2 + 0.004, H - 0.03, -D / 2 + 0.004]} material={colourMaterial('#ffe9a8')}>
          <boxGeometry args={[0.004, 0.05, 0.004]} />
        </mesh>
      )}
      {taped && (
        <mesh position={[0, H + 0.004, -D / 2]} material={colourMaterial('#111')}>
          <boxGeometry args={[W, 0.012, 0.012]} />
        </mesh>
      )}
      {children}
      {glow && <GlowRing r={0.17} />}
    </group>
  );
}

/** The clinostat: a motor with a vertical turntable (the control pot) and a horizontal spindle carrying a cork of seedlings; both turn slowly when on. */
export function KlinostatModel({ on, pot, set, ctrlDeg, v, w, glow }: { on: boolean; pot: boolean; set: boolean; ctrlDeg: number; v: BioGrowthVariant; w: BioGrowthState['trop']; glow?: boolean }) {
  const table = useRef<Group>(null);
  const spindle = useRef<Group>(null);
  useFrame((_, dt) => {
    if (!on) return;
    if (table.current) table.current.rotation.y += dt * 0.4;
    if (spindle.current) spindle.current.rotation.x += dt * 0.4;
  });
  return (
    <group>
      <BlobShadow r={0.14} />
      <mesh position={[0, 0.03, 0]} material={colourMaterial('#546e7a')}>
        <boxGeometry args={[0.12, 0.06, 0.1]} />
      </mesh>
      <mesh position={[0.03, 0.045, 0.051]}>
        <circleGeometry args={[0.006, 12]} />
        <meshBasicMaterial color={on ? '#4caf50' : '#5d4037'} />
      </mesh>
      <group ref={table} position={[0, 0.062, 0]}>
        <mesh material={mat.darkMetal()}>
          <cylinderGeometry args={[0.05, 0.05, 0.006, 24]} />
        </mesh>
        {pot && (
          <group position={[0, 0.003, 0]}>
            <PotSeedlingsModel deg={ctrlDeg} />
          </group>
        )}
      </group>
      <mesh position={[0.1, 0.06, 0]} rotation={[0, 0, Math.PI / 2]} material={mat.metal()}>
        <cylinderGeometry args={[0.004, 0.004, 0.08, 8]} />
      </mesh>
      {set && (
        <group position={[0.15, 0.08, 0]} rotation={[0, Math.PI / 2, 0]}>
          <group ref={spindle}>
            <CorkDisc v={v} w={w} mode={on ? 'klino' : 'cork'} />
          </group>
        </group>
      )}
      {glow && <GlowRing r={0.15} />}
    </group>
  );
}

/** A cork disc (facing +z) with the ten seedlings pinned round it, radicles turning down on day d (mode 'cork') or straight on ('klino'). */
function CorkDisc({ v, w, mode }: { v: BioGrowthVariant; w: BioGrowthState['trop']; mode: 'cork' | 'klino' }) {
  const d = w.day;
  const turn = mode === 'cork' ? tropTurn(v.trop, w, d) : 0;
  const curves = useMemo(
    () =>
      v.trop.dirs.map((dir, i) => {
        const damaged = v.trop.damaged.includes(i);
        const grow = Math.min(1, (d + 0.3) / 2.5) * (damaged ? 0.1 : 1);
        const a0 = ((dir > 180 ? dir - 360 : dir) * Math.PI) / 180;
        let x = 0.032 * Math.sin(a0);
        let y = -0.032 * Math.cos(a0);
        const pts = [new Vector3(x, y, 0.012)];
        const f = damaged ? 0 : turn;
        for (let k = 0; k < 8; k++) {
          const seg = 0.006 * grow + 0.0004;
          const cur = a0 * (1 - f * Math.min(1, (k + 1) / 4));
          x += seg * Math.sin(cur);
          y -= seg * Math.cos(cur);
          pts.push(new Vector3(x, y, 0.012));
        }
        return { c: new CatmullRomCurve3(pts), damaged, sx: pts[0]!.x, sy: pts[0]!.y };
      }),
    [v, d, turn],
  );
  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]} material={mat.cork()}>
        <cylinderGeometry args={[0.03, 0.03, 0.02, 24]} />
      </mesh>
      {curves.map((c, i) => (
        <group key={i}>
          <mesh position={[c.sx, c.sy, 0.012]} scale={[0.005, 0.0038, 0.004]} material={colourMaterial(SEED)}>
            <sphereGeometry args={[1, 8, 6]} />
          </mesh>
          <mesh material={colourMaterial(c.damaged ? '#a1887f' : '#f3ecd2')}>
            <tubeGeometry args={[c.c, 10, 0.0011, 5, false]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** The gas jar with moist cotton wool and the cork of pinned seedlings standing in it (stationary). */
export function CorkJarModel({ v, w, glow }: { v: BioGrowthVariant; w: BioGrowthState['trop']; glow?: boolean }) {
  return (
    <group>
      <BlobShadow r={0.07} />
      <mesh position={[0, 0.12, 0]} material={mat.glass()} renderOrder={5}>
        <cylinderGeometry args={[0.055, 0.055, 0.24, 24, 1, true]} />
      </mesh>
      <mesh position={[0, 0.004, 0]} material={mat.glass()}>
        <cylinderGeometry args={[0.06, 0.06, 0.008, 24]} />
      </mesh>
      {w.moist && (
        <mesh position={[0, 0.018, 0]} material={colourMaterial('#e3e8ea')}>
          <cylinderGeometry args={[0.05, 0.05, 0.022, 18]} />
        </mesh>
      )}
      <mesh position={[0, 0.244, 0]} material={mat.glass()}>
        <cylinderGeometry args={[0.062, 0.062, 0.006, 24]} />
      </mesh>
      {w.pinned && (
        <group position={[0, 0.13, 0]}>
          <CorkDisc v={v} w={w} mode="cork" />
        </group>
      )}
      {glow && <GlowRing r={0.07} />}
    </group>
  );
}

/** A plastic protractor lying flat. */
export function ProtractorModel({ glow }: { glow?: boolean }) {
  const tex = useMemo(
    () =>
      bioCanvas('growth-protractor', 256, 132, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        g.fillStyle = 'rgba(240,248,255,0.85)';
        g.beginPath();
        g.arc(w / 2, h - 4, w / 2 - 4, Math.PI, 0);
        g.closePath();
        g.fill();
        g.strokeStyle = '#333';
        g.fillStyle = '#333';
        g.font = `600 11px ${FONT}`;
        g.textAlign = 'center';
        for (let a = 0; a <= 180; a += 5) {
          const r = (a * Math.PI) / 180;
          const R = w / 2 - 6;
          const l = a % 10 === 0 ? 12 : 6;
          g.lineWidth = a % 10 === 0 ? 1.4 : 0.8;
          g.beginPath();
          g.moveTo(w / 2 + R * Math.cos(r), h - 4 - R * Math.sin(r));
          g.lineTo(w / 2 + (R - l) * Math.cos(r), h - 4 - (R - l) * Math.sin(r));
          g.stroke();
          if (a % 30 === 0) g.fillText(String(a), w / 2 + (R - 22) * Math.cos(r), h - 4 - (R - 22) * Math.sin(r) + 4);
        }
      }),
    [],
  );
  return (
    <group>
      <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.12, 0.062]} />
        <meshStandardMaterial map={tex} transparent side={DoubleSide} roughness={0.4} />
      </mesh>
      {glow && <GlowRing r={0.07} />}
    </group>
  );
}

export const tropAngles = (v: BioGrowthVariant, w: BioGrowthState['trop']) => ({ test: tropTestAngle(v.trop, w, w.day) * (w.slit === 'AWAY' ? -1 : 1), ctrl: tropCtrlAngle(v.trop, w, w.day), klinoDown: tropKlinoDown(v.trop, w, w.day) });
