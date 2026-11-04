import { PLATES, PLATE_LABEL, eosinCutAt, eosinFront, eosinSectionSeen, eosinVeinsAt, mouldCover, plateDots, ratTorn, type BioDissectionState, type BioDissectionVariant } from '@aischool/shared';
import { useMemo } from 'react';
import { CatmullRomCurve3, DoubleSide, Vector3 } from 'three';
import { BlobShadow, GlowRing } from '../../../lab3d-kit/apparatus';
import { colourMaterial, liquidMaterial, mat } from '../../../lab3d-kit/materials';
import { Box, Rod } from '../../bio-common/lab3d/apparatus';
import { bioCanvas, FONT } from '../../bio-common/lab3d/textures';
import { ORGANS, ORGAN_FILL, TUBE } from '../visuals';

/**
 * The dissection lab's procedural apparatus, at true size (metres; the
 * origin is the point it stands on): the balsam plant with its red line, the
 * eosin beaker and an upright ruler, the tile with its sections, a simple
 * microscope and the stopwatch; the dissecting board with a schematic rat
 * (the opened body is a canvas drawing of the organs — no blood); the agar
 * plates with their colonies drawn from the shared maths, the incubator,
 * bread slices and bags.
 */

const RED = '#c2185b';

// ------------------------------------------------------------------ eosin

const leafTex = (red: boolean) =>
  bioCanvas(`dissect-leaf-${red}`, 128, 64, (g, w, h) => {
    g.fillStyle = '#8bc34a';
    g.beginPath();
    g.ellipse(w / 2, h / 2, w / 2 - 2, h / 2 - 4, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = red ? RED : '#4f7d22';
    g.lineWidth = red ? 3 : 2;
    g.beginPath();
    g.moveTo(4, h / 2);
    g.lineTo(w - 6, h / 2);
    for (let i = 1; i < 6; i++) {
      g.moveTo((w * i) / 6, h / 2);
      g.lineTo((w * i) / 6 + 12, h / 2 - 18);
      g.moveTo((w * i) / 6, h / 2);
      g.lineTo((w * i) / 6 + 12, h / 2 + 18);
    }
    g.stroke();
  });
const rulerUpTex = () =>
  bioCanvas('dissect-ruler-up', 64, 1024, (g, w, h) => {
    g.fillStyle = '#fff8e1';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1c1f22';
    g.font = `600 20px ${FONT}`;
    for (let mm = 0; mm <= 300; mm++) {
      const y = h - 12 - (mm / 300) * (h - 24);
      const len = mm % 10 === 0 ? 26 : mm % 5 === 0 ? 18 : 10;
      g.fillRect(0, y - 0.5, len, mm % 10 === 0 ? 2 : 1);
      if (mm % 50 === 0) g.fillText(String(mm / 10), 30, y + 7);
    }
  });

/** The balsam plant: roots in soil (not washed), washed, or standing in the eosin; the red line in the stem at the current time. */
export function BalsamModel({ v, w, glow }: { v: BioDissectionVariant; w: BioDissectionState['eosin']; glow?: boolean }) {
  const cut = eosinCutAt(w);
  const h = eosinFront(v.eosin, w, cut ?? w.clock) / 100;
  const H = v.eosin.stemH / 100;
  const veins = w.dye && (cut ?? w.clock) >= eosinVeinsAt(v.eosin, w);
  const leaves = useMemo(() => {
    const out: { y: number; s: number }[] = [];
    for (let y = v.eosin.leafH; y < v.eosin.stemH - 1; y += 4.5) out.push({ y: y / 100, s: out.length % 2 ? 1 : -1 });
    return out;
  }, [v]);
  const base = 0.06;
  return (
    <group>
      {/* roots */}
      {[-0.6, 0, 0.6, 1.2, -1.2].map((a, i) => (
        <mesh key={i} position={[Math.sin(a) * 0.008, base - 0.022, Math.cos(a) * 0.008]} rotation={[Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4]} material={colourMaterial(w.wash ? '#efe6cf' : '#7b5e46')}>
          <cylinderGeometry args={[0.0009, 0.0004, 0.045, 5]} />
        </mesh>
      ))}
      <mesh position={[0, base + H / 2, 0]} material={liquidMaterial('#cfe6a8', 0.5)} renderOrder={3}>
        <cylinderGeometry args={[0.0032, 0.0036, H, 12]} />
      </mesh>
      {w.dye && h > 0.001 && (
        <mesh position={[0, base + h / 2, 0]} material={colourMaterial(RED)}>
          <cylinderGeometry args={[0.0025, 0.0025, h, 8]} />
        </mesh>
      )}
      {w.wash === 'ROUGH' && w.dye && h > 0.001 && (
        <mesh position={[0, base + (h * 0.6) / 2, 0]} material={liquidMaterial(RED, 0.35)} renderOrder={4}>
          <cylinderGeometry args={[0.0034, 0.0034, h * 0.6, 10]} />
        </mesh>
      )}
      {leaves.map((l, i) => (
        <mesh key={i} position={[l.s * 0.03, base + l.y + 0.006, 0]} rotation={[-Math.PI / 2 + 0.5, 0, l.s * 0.25]}>
          <planeGeometry args={[0.06, 0.028]} />
          <meshStandardMaterial map={leafTex(veins && l.y * 100 <= h * 100 + 0.1)} side={DoubleSide} transparent alphaTest={0.3} roughness={0.8} />
        </mesh>
      ))}
      {cut !== null && <Rod p={[0, base + H * 0.5, 0]} s={[0.0042, 0.002, 0.0042]} m={mat.white()} />}
      {glow && <GlowRing r={0.05} />}
    </group>
  );
}
/** A beaker of eosin (or of water) with an upright ruler, 0 at the liquid surface. */
export function EosinBeakerModel({ red, glow }: { red: boolean; glow?: boolean }) {
  return (
    <group>
      <BlobShadow r={0.05} />
      <mesh position={[0, 0.045, 0]} material={mat.glass()} renderOrder={5}>
        <cylinderGeometry args={[0.035, 0.034, 0.09, 24, 1, true]} />
      </mesh>
      <mesh position={[0, 0.03, 0]} material={liquidMaterial(red ? RED : '#cfe4f2', red ? 0.7 : 0.3)} renderOrder={3}>
        <cylinderGeometry args={[0.033, 0.033, 0.06, 24]} />
      </mesh>
      {glow && <GlowRing r={0.05} />}
    </group>
  );
}
export function UprightRuler({ glow }: { glow?: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.15, 0]}>
        <boxGeometry args={[0.03, 0.31, 0.003]} />
        <meshStandardMaterial map={rulerUpTex()} roughness={0.7} />
      </mesh>
      <Box p={[0, 0.003, 0]} s={[0.05, 0.006, 0.04]} m={mat.woodDark()} />
      {glow && <GlowRing r={0.04} />}
    </group>
  );
}
export function BowlModel({ glow }: { glow?: boolean }) {
  return (
    <group>
      <BlobShadow r={0.07} />
      <mesh position={[0, 0.02, 0]} material={colourMaterial('#eceff1')}>
        <cylinderGeometry args={[0.06, 0.045, 0.04, 24, 1, true]} />
      </mesh>
      <mesh position={[0, 0.028, 0]} material={liquidMaterial('#cfe4f2', 0.4)}>
        <cylinderGeometry args={[0.056, 0.056, 0.004, 24]} />
      </mesh>
      {glow && <GlowRing r={0.07} />}
    </group>
  );
}
export function SoilPotModel({ glow }: { glow?: boolean }) {
  return (
    <group>
      <BlobShadow r={0.05} />
      <mesh position={[0, 0.03, 0]} material={colourMaterial('#b5653a')}>
        <cylinderGeometry args={[0.04, 0.03, 0.06, 18]} />
      </mesh>
      <mesh position={[0, 0.058, 0]} material={colourMaterial('#4e342e')}>
        <cylinderGeometry args={[0.037, 0.037, 0.004, 18]} />
      </mesh>
      {glow && <GlowRing r={0.05} />}
    </group>
  );
}
export function RazorModel({ glow }: { glow?: boolean }) {
  return (
    <group>
      <Box p={[0, 0.001, 0]} s={[0.04, 0.0012, 0.02]} m={mat.steel()} />
      <Box p={[0, 0.0022, -0.004]} s={[0.04, 0.001, 0.005]} m={mat.darkMetal()} />
      {glow && <GlowRing r={0.03} />}
    </group>
  );
}
/** The tile with the sections cut so far (discs and strips, red where stained). */
export function TileModel({ v, w, glow }: { v: BioDissectionVariant; w: BioDissectionState['eosin']; glow?: boolean }) {
  return (
    <group>
      <Box p={[0, 0.004, 0]} s={[0.15, 0.008, 0.15]} m={mat.tile()} />
      {w.sections.map((s, n) => {
        const seen = eosinSectionSeen(v.eosin, w, n);
        const c = seen === 'NONE' ? '#dfe8c6' : seen === 'ALL' ? '#e091b2' : '#e7b7c8';
        const x = -0.05 + (n % 4) * 0.033;
        const z = -0.035 + Math.floor(n / 4) * 0.05;
        return s.kind === 'TS' ? (
          <mesh key={n} position={[x, 0.0085, z]} material={colourMaterial(c)}>
            <cylinderGeometry args={[0.0045, 0.0045, s.thin ? 0.0006 : 0.003, 14]} />
          </mesh>
        ) : (
          <Box key={n} p={[x, 0.0085, z]} s={[0.006, 0.0006, 0.03]} m={colourMaterial(c)} />
        );
      })}
      {glow && <GlowRing r={0.1} />}
    </group>
  );
}
/** A simple student microscope (the slide on the stage when looking). */
export function ScopeModel({ slide, glow }: { slide: boolean; glow?: boolean }) {
  return (
    <group>
      <BlobShadow r={0.07} />
      <Box p={[0, 0.008, 0]} s={[0.1, 0.016, 0.13]} m={mat.darkMetal()} />
      <Box p={[0, 0.11, -0.045]} s={[0.025, 0.19, 0.03]} m={mat.darkMetal()} />
      <Box p={[0, 0.085, 0.005]} s={[0.08, 0.006, 0.07]} m={mat.black()} />
      {slide && <Box p={[0, 0.089, 0.005]} s={[0.065, 0.0015, 0.022]} m={mat.glass()} />}
      <mesh position={[0, 0.16, 0.005]} rotation={[0.25, 0, 0]} material={mat.white()}>
        <cylinderGeometry args={[0.013, 0.013, 0.09, 16]} />
      </mesh>
      <mesh position={[0, 0.115, 0.012]} material={mat.steel()}>
        <cylinderGeometry args={[0.006, 0.004, 0.025, 12]} />
      </mesh>
      <mesh position={[0.035, 0.12, -0.04]} rotation={[0, 0, Math.PI / 2]} material={mat.steel()}>
        <cylinderGeometry args={[0.014, 0.014, 0.012, 16]} />
      </mesh>
      <mesh position={[0, 0.03, 0.01]} material={mat.light()}>
        <cylinderGeometry args={[0.012, 0.012, 0.004, 16]} />
      </mesh>
      {glow && <GlowRing r={0.09} />}
    </group>
  );
}
export function StopwatchModel({ minutes, glow }: { minutes: number; glow?: boolean }) {
  const face = bioCanvas(`dissect-sw-${minutes}`, 128, 128, (g, w, h) => {
    g.fillStyle = '#f5f5f5';
    g.beginPath();
    g.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#263238';
    g.fillRect(18, 46, 92, 36);
    g.fillStyle = '#b2ff59';
    g.font = `700 26px ${FONT}`;
    g.textAlign = 'center';
    g.fillText(`${String(Math.floor(minutes / 60)).padStart(1, '0')}:${String(Math.round(minutes % 60)).padStart(2, '0')}`, w / 2, 74);
    g.fillStyle = '#263238';
    g.font = `600 12px ${FONT}`;
    g.fillText('h : min', w / 2, 100);
  });
  return (
    <group>
      <mesh position={[0, 0.008, 0]} material={colourMaterial('#37474f')}>
        <cylinderGeometry args={[0.03, 0.03, 0.014, 24]} />
      </mesh>
      <mesh position={[0, 0.0152, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.027, 24]} />
        <meshBasicMaterial map={face} />
      </mesh>
      <Rod p={[0, 0.008, -0.034]} s={[0.004, 0.008, 0.004]} m={mat.steel()} />
      {glow && <GlowRing r={0.04} />}
    </group>
  );
}

// ------------------------------------------------------------------ the rat (schematic, respectful)

const openTex = (w: BioDissectionState['rat']) =>
  bioCanvas(`dissect-open-${w.wall ?? '-'}-${w.ribs}-${w.display ?? '-'}-${w.unravelled}-${ratTorn(w)}-${w.moist}`, 256, 320, (g) => {
    g.scale(256 / 200, 256 / 200);
    g.fillStyle = '#e5b7a8';
    g.fillRect(0, 0, 200, 250);
    if (!w.wall) {
      g.strokeStyle = '#c99686';
      g.lineWidth = 1.2;
      for (let y = 10; y < 240; y += 14) {
        g.beginPath();
        g.moveTo(20, y);
        g.lineTo(180, y + 4);
        g.stroke();
      }
      return;
    }
    if (w.ribs) {
      g.fillStyle = '#e8b4b4';
      g.beginPath();
      g.ellipse(78, 20, 18, 16, 0, 0, Math.PI * 2);
      g.ellipse(122, 20, 18, 16, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#b97c7c';
      g.beginPath();
      g.ellipse(100, 24, 10, 13, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#d8a99a';
    g.fillRect(30, 38, 140, 6);
    g.translate(0, 30);
    g.scale(1, 0.88);
    const shift = w.display ? 22 : 0;
    for (const k of Object.keys(ORGANS) as (keyof typeof ORGANS)[]) {
      const p = new Path2D(ORGANS[k]);
      const gut = k === 'ileum' || k === 'caecum' || k === 'colon';
      g.save();
      if (gut && shift) g.translate(shift, w.unravelled ? 8 : 0);
      if (TUBE[k]) {
        g.lineCap = 'round';
        g.strokeStyle = '#a7826b';
        g.lineWidth = 7.5;
        g.stroke(p);
        g.strokeStyle = TUBE[k]!;
        g.lineWidth = 6;
        g.stroke(p);
      } else {
        g.fillStyle = ORGAN_FILL[k];
        g.fill(p);
        g.strokeStyle = '#7c5a4a';
        g.lineWidth = 0.8;
        g.stroke(p);
      }
      g.restore();
    }
    if (ratTorn(w)) {
      g.strokeStyle = '#546e7a';
      g.setLineDash([2, 2]);
      g.lineWidth = 1.6;
      g.beginPath();
      g.arc(128, 138, 7, 0, Math.PI * 2);
      g.stroke();
    }
  });

/** The board with the rat pinned out (ventral side up), at the stage reached. */
export function RatBoardModel({ w, glow }: { w: BioDissectionState['rat']; glow?: boolean }) {
  const ventral = w.pinned !== 'DORSAL';
  const fur = colourMaterial(ventral ? '#d8cfc4' : '#8c7f72');
  const limbs: [number, number, number][] = [
    [-0.045, 0.07, 0.6],
    [0.045, 0.07, -0.6],
    [-0.045, -0.07, -0.6],
    [0.045, -0.07, 0.6],
  ];
  const tex = w.skinPinned ? openTex(w) : null;
  const tail = useMemo(() => new CatmullRomCurve3([new Vector3(0, 0, 0.1), new Vector3(0.01, 0, 0.14), new Vector3(0.04, 0, 0.17), new Vector3(0.08, 0, 0.18)]), []);
  return (
    <group>
      <BlobShadow r={0.2} />
      <Box p={[0, 0.008, 0]} s={[0.24, 0.016, 0.34]} m={mat.wood()} />
      <Box p={[0, 0.0175, 0]} s={[0.22, 0.003, 0.32]} m={mat.cork()} />
      <group position={[0, 0.03, -0.01]}>
        {/* body and head (head away from the student) */}
        <mesh scale={[0.045, 0.016, 0.1]} material={fur}>
          <sphereGeometry args={[1, 24, 16]} />
        </mesh>
        <mesh position={[0, 0.002, -0.12]} scale={[0.022, 0.014, 0.035]} material={fur}>
          <sphereGeometry args={[1, 16, 12]} />
        </mesh>
        <mesh material={colourMaterial('#c9a7a0')}>
          <tubeGeometry args={[tail, 16, 0.003, 6, false]} />
        </mesh>
        {limbs.map(([x, z, r], i) => (
          <group key={i}>
            <mesh position={[x * 1.35, -0.004, z * 0.9 - (z > 0 ? -0.005 : 0)]} rotation={[0, r, 0]} scale={[0.026, 0.006, 0.008]} material={fur}>
              <sphereGeometry args={[1, 10, 8]} />
            </mesh>
            {w.pinned && (
              <group position={[x * 1.9, 0.0, z * 1.05]}>
                <Rod p={[0, 0.002, 0]} s={[0.0008, 0.02, 0.0008]} m={mat.steel()} />
                <mesh position={[0, 0.013, 0]} material={mat.red()}>
                  <sphereGeometry args={[0.003, 8, 6]} />
                </mesh>
              </group>
            )}
          </group>
        ))}
        {w.skin && !w.skinPinned && <Box p={[0, 0.0165, 0.005]} s={[0.002, 0.001, 0.16]} m={colourMaterial('#6d5d50')} />}
        {tex && (
          <>
            <mesh position={[0, 0.0168, 0.005]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[0.07, 0.175]} />
              <meshStandardMaterial map={tex} roughness={w.moist ? 0.35 : 0.8} />
            </mesh>
            {[-1, 1].map((sd) => (
              <group key={sd}>
                <Box p={[sd * 0.05, 0.012, 0.005]} s={[0.03, 0.0015, 0.17]} m={colourMaterial('#cfc4b8')} r={[0, 0, sd * 0.25]} />
                {[-0.06, 0, 0.06].map((z) => (
                  <mesh key={z} position={[sd * 0.066, 0.02, z]} material={mat.red()}>
                    <sphereGeometry args={[0.0025, 8, 6]} />
                  </mesh>
                ))}
              </group>
            ))}
          </>
        )}
      </group>
      {glow && <GlowRing r={0.22} />}
    </group>
  );
}
/** The dissecting kit on a tray: scalpel, fine scissors, forceps and a seeker. */
export function KitModel({ glow }: { glow?: boolean }) {
  return (
    <group>
      <Box p={[0, 0.003, 0]} s={[0.16, 0.006, 0.11]} m={colourMaterial('#eceff1')} />
      {[-0.035, -0.01, 0.015, 0.04].map((z, i) => (
        <group key={i} position={[0, 0.008, z]}>
          <Box p={[-0.02, 0, 0]} s={[0.07, 0.004, 0.006]} m={i === 3 ? colourMaterial('#8d6e63') : mat.steel()} />
          <Box p={[0.035, 0, 0]} s={[0.04, 0.002, i === 1 ? 0.008 : 0.003]} m={mat.steel()} />
        </group>
      ))}
      {glow && <GlowRing r={0.1} />}
    </group>
  );
}
export function ThreadModel({ glow }: { glow?: boolean }) {
  return (
    <group>
      <Rod p={[0, 0.015, 0]} s={[0.014, 0.03, 0.014]} m={colourMaterial('#fafafa')} />
      <Rod p={[0, 0.0015, 0]} s={[0.018, 0.003, 0.018]} m={mat.woodDark()} />
      <Rod p={[0, 0.0315, 0]} s={[0.018, 0.003, 0.018]} m={mat.woodDark()} />
      {glow && <GlowRing r={0.03} />}
    </group>
  );
}

// ------------------------------------------------------------------ plates, incubator, bread

const plateTex = (v: BioDissectionVariant, w: BioDissectionState['micro'], k: number, days: number | null, seed: number) => {
  const p = w.plates[k]!;
  const key = `dissect-plate-${seed}-${k}-${days ?? '-'}-${p.airMin}-${p.touch}-${p.lid}-${p.label}-${w.temp}-${v.micro.finger}-${v.micro.airRate}`;
  return bioCanvas(key, 256, 256, (g, W, H) => {
    g.fillStyle = '#ddbd5e';
    g.beginPath();
    g.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2);
    g.fill();
    if (days !== null)
      for (const d of plateDots(v.micro, w, k, seed)) {
        if (d.t > days + 1e-9) continue;
        const grow = Math.min(1, 0.55 + (days - d.t) * 0.35);
        const x = W / 2 + d.x * (W / 2 - 8);
        const y = H / 2 + d.y * (H / 2 - 8);
        const r = d.r * (W / 2) * grow;
        g.fillStyle = d.fungus ? '#ffffff' : '#fff6dc';
        g.strokeStyle = d.fungus ? '#9e9e9e' : '#7a5c12';
        g.lineWidth = 1.8;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
    if (p.label) {
      g.fillStyle = p.label === 'BASE' ? 'rgba(30,58,138,0.55)' : '#7f1d1d';
      g.font = `italic 600 22px ${FONT}`;
      g.textAlign = 'center';
      g.fillText(PLATE_LABEL[PLATES[k]!], W / 2, p.label === 'BASE' ? H * 0.8 : H * 0.22);
    }
  });
};
/** One agar plate (upside down when inverted), its colonies after `days`. */
export function PlateModel({ v, w, k, days, seed, glow }: { v: BioDissectionVariant; w: BioDissectionState['micro']; k: number; days: number | null; seed: number; glow?: boolean }) {
  const p = w.plates[k]!;
  const tex = plateTex(v, w, k, days, seed);
  const r = 0.045;
  return (
    <group>
      <BlobShadow r={r * 1.15} />
      <group position={[0, w.inverted ? 0.014 : 0, 0]} rotation={[w.inverted ? Math.PI : 0, 0, 0]}>
        <mesh position={[0, 0.003, 0]} material={mat.glass()} renderOrder={4}>
          <cylinderGeometry args={[r, r, 0.006, 28, 1, true]} />
        </mesh>
        <mesh position={[0, 0.0045, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[w.inverted ? -1 : 1, 1, 1]}>
          <circleGeometry args={[r * 0.97, 28]} />
          <meshStandardMaterial map={tex} roughness={0.5} side={DoubleSide} />
        </mesh>
        <mesh position={[0, 0.011, 0]} material={mat.glass()} renderOrder={5}>
          <cylinderGeometry args={[r + 0.002, r + 0.002, 0.008, 28]} />
        </mesh>
      </group>
      {p.tape === 'STRIPS' &&
        [-1, 1].map((s) => <Box key={s} p={[0, 0.007, s * (r + 0.001)]} s={[0.014, 0.012, 0.0015]} m={colourMaterial('#f5f0dc')} />)}
      {p.tape === 'SEALED' && (
        <mesh position={[0, 0.008, 0]} material={colourMaterial('#efe7c8')}>
          <cylinderGeometry args={[r + 0.0025, r + 0.0025, 0.01, 28, 1, true]} />
        </mesh>
      )}
      {glow && <GlowRing r={r * 1.3} />}
    </group>
  );
}
export function IncubatorModel({ temp, glow, children }: { temp: number | null; glow?: boolean; children?: React.ReactNode }) {
  const disp = bioCanvas(`dissect-inc-${temp ?? 'off'}`, 128, 48, (g, w, h) => {
    g.fillStyle = '#102027';
    g.fillRect(0, 0, w, h);
    g.fillStyle = temp ? '#ff7043' : '#455a64';
    g.font = `700 28px ${FONT}`;
    g.textAlign = 'center';
    g.fillText(temp ? `${temp} °C` : 'OFF', w / 2, 34);
  });
  return (
    <group>
      <BlobShadow r={0.16} />
      <Box p={[0, 0.002, 0]} s={[0.26, 0.004, 0.2]} m={mat.darkMetal()} />
      <Box p={[0, 0.115, -0.095]} s={[0.26, 0.23, 0.01]} m={mat.cabinet()} />
      {[-1, 1].map((s) => (
        <Box key={s} p={[s * 0.125, 0.115, 0]} s={[0.01, 0.23, 0.2]} m={mat.cabinet()} />
      ))}
      <Box p={[0, 0.235, 0]} s={[0.26, 0.012, 0.2]} m={mat.cabinet()} />
      <Box p={[0, 0.115, 0]} s={[0.24, 0.004, 0.18]} m={mat.metal()} />
      <mesh position={[0, 0.12, 0.1]} material={mat.pane()}>
        <planeGeometry args={[0.24, 0.22]} />
      </mesh>
      <mesh position={[0.08, 0.255, 0.07]} rotation={[-0.6, 0, 0]}>
        <planeGeometry args={[0.07, 0.026]} />
        <meshBasicMaterial map={disp} />
      </mesh>
      {children}
      {glow && <GlowRing r={0.18} />}
    </group>
  );
}
const breadTex = (v: BioDissectionVariant, w: BioDissectionState['micro'], k: number, d: number) => {
  const cover = mouldCover(v.micro, w, k, d);
  const sl = w.slices[k]!;
  return bioCanvas(`dissect-bread-${k}-${Math.round(cover)}-${sl.moist}`, 128, 128, (g, W, H) => {
    g.fillStyle = '#c58a4a';
    g.fillRect(0, 0, W, H);
    g.fillStyle = sl.moist ? '#efdcae' : '#f6e8c4';
    g.fillRect(8, 8, W - 16, H - 16);
    const n = Math.round(cover / 3);
    for (let i = 0; i < n; i++) {
      const rx = ((Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
      const ry = ((Math.sin(i * 39.346 + k * 11.135) * 23421.631) % 1 + 1) % 1;
      const x = 14 + rx * (W - 28);
      const y = 14 + ry * (H - 28);
      g.fillStyle = 'rgba(255,255,255,0.92)';
      g.beginPath();
      g.arc(x, y, 6 + (i % 4) * 2, 0, Math.PI * 2);
      g.fill();
      if (cover > 18) {
        g.fillStyle = '#212121';
        g.beginPath();
        g.arc(x + 2, y - 1, 1.6, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
};
/** A slice of bread (its mould on clock day d), in a polythene bag once bagged. */
export function BreadModel({ v, w, k, d, glow }: { v: BioDissectionVariant; w: BioDissectionState['micro']; k: number; d: number; glow?: boolean }) {
  const tex = breadTex(v, w, k, d);
  return (
    <group>
      <BlobShadow r={0.06} />
      <Box p={[0, 0.006, 0]} s={[0.09, 0.012, 0.09]} m={colourMaterial('#c58a4a')} />
      <mesh position={[0, 0.0122, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.088, 0.088]} />
        <meshStandardMaterial map={tex} roughness={0.9} />
      </mesh>
      {w.bagged && w.breadAt !== null && (
        <mesh position={[0, 0.012, 0]} material={mat.pane()}>
          <boxGeometry args={[0.11, 0.026, 0.11]} />
        </mesh>
      )}
      {glow && <GlowRing r={0.07} />}
    </group>
  );
}
export function MarkerModel({ glow }: { glow?: boolean }) {
  return (
    <group>
      <Rod p={[0, 0.006, 0]} s={[0.006, 0.12, 0.006]} m={mat.black()} r={[0, 0, Math.PI / 2]} />
      {glow && <GlowRing r={0.06} />}
    </group>
  );
}
export function BagsModel({ glow }: { glow?: boolean }) {
  return (
    <group>
      <Box p={[0, 0.004, 0]} s={[0.12, 0.008, 0.08]} m={mat.pane()} />
      <Box p={[0, 0.009, 0]} s={[0.11, 0.002, 0.07]} m={colourMaterial('#e3f2fd')} />
      {glow && <GlowRing r={0.08} />}
    </group>
  );
}
