import { MICRO_OBJECTIVES, type MicroMedium, type MicroObjective, type MicroScope } from '@aischool/shared';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, type ReactNode } from 'react';
import { CylinderGeometry, MeshStandardMaterial, type Group } from 'three';
import { BlobShadow, GlowRing } from '../../../lab3d-kit/apparatus';
import { colourMaterial, liquidMaterial, mat } from '../../../lab3d-kit/materials';
import { Ball, Box, CoverSlip, Rod, Slide } from '../../bio-common/lab3d/apparatus';
import { MS, OBJ_COLOUR, stageY } from './spots';

/**
 * A compound light microscope, built procedurally: horseshoe base with the
 * lamp and its dial, the arm, the stage (rising with the focus) with its two
 * clips, the condenser and iris-diaphragm lever under it, coarse and fine
 * focus knobs on both sides, the revolving nosepiece with ×4 / ×10 / ×40
 * objectives (colour-ringed) and the inclined eyepiece. The parts a student
 * uses are passed in as wrappers (`part`), so the station makes each one an
 * Interactive with its own name, menu and drag.
 */

const ring = new CylinderGeometry(1, 1, 1, 24, 1, true);
/** An invisible, easy-to-hit box around a small control. */
function Grip({ p, s }: { p: [number, number, number]; s: [number, number, number] }) {
  return (
    <mesh position={p}>
      <boxGeometry args={s} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}
const MEDIUM_COLOUR: Record<MicroMedium, string | null> = { WATER: '#dfeef3', NONE: null, IODINE: '#c9962e', METHYLENE_BLUE: '#3d6fb8', SALT: '#e7eef0', SAFRANIN: '#c2185b' };
const OBJ_LEN: Record<MicroObjective, number> = { 4: 0.022, 10: 0.03, 40: 0.04 };
/** Nosepiece angle that brings each objective over the stage. */
const TURRET_ANGLE: Record<MicroObjective, number> = { 4: 0, 10: (Math.PI * 2) / 3, 40: (Math.PI * 4) / 3 };

export type ScopePart = 'turret' | 'coarse' | 'fine' | 'diaphragm' | 'lamp' | 'stage' | 'eyepiece';
export interface SlideLook {
  medium: MicroMedium | null;
  specimen: boolean;
  coverslip: 'ANGLE' | 'DROP' | null;
  cavity: boolean;
  crashed: boolean;
}

/** The slide as it lies on the tile or the stage: the drop (coloured by the stain), the specimen, the cover slip (cracked after a crash). */
export function PreparedSlide({ look, lowering = 1 }: { look: SlideLook; lowering?: number }) {
  const c = look.medium ? MEDIUM_COLOUR[look.medium] : null;
  return (
    <group>
      <Slide cavity={look.cavity} />
      {c && <Rod p={[0.004, 0.0016, 0]} s={[0.009, 0.0008, 0.009]} m={liquidMaterial(c, 0.65)} />}
      {look.specimen && <Box p={[0.004, 0.0019, 0]} s={[0.007, 0.0003, 0.007]} m={colourMaterial(look.medium === 'IODINE' ? '#d9b45a' : look.medium === 'METHYLENE_BLUE' ? '#7fa2d6' : look.medium === 'SAFRANIN' ? '#d0567f' : '#e8e2c8')} />}
      {look.coverslip && (
        <group position={[0.004 - 0.011, 0.0024, 0]} rotation={[0, 0, (1 - lowering) * 0.78]}>
          <group position={[0.011, 0, 0]}>
            <CoverSlip />
            {look.crashed && <Box p={[0, 0.0004, 0]} s={[0.02, 0.0001, 0.0006]} r={[0, 0.7, 0]} m={mat.black()} />}
            {look.crashed && <Box p={[0.002, 0.0004, 0.002]} s={[0.014, 0.0001, 0.0005]} r={[0, -0.5, 0]} m={mat.black()} />}
          </group>
        </group>
      )}
    </group>
  );
}

/** The microscope at its current settings; `scope()` is read every frame so knob drags animate smoothly. */
export function MicroscopeModel({
  scope,
  slide,
  clipped,
  part = (_p, n) => n,
  glow,
  lampOn = true,
}: {
  scope: () => MicroScope;
  slide: SlideLook | null;
  clipped: boolean;
  /** Wraps a usable part (the station turns it into an Interactive). */
  part?: (p: ScopePart, node: ReactNode) => ReactNode;
  glow?: boolean;
  lampOn?: boolean;
}) {
  const stage = useRef<Group>(null);
  const turret = useRef<Group>(null);
  const coarseL = useRef<Group>(null);
  const coarseR = useRef<Group>(null);
  const fineL = useRef<Group>(null);
  const fineR = useRef<Group>(null);
  const lever = useRef<Group>(null);
  const dial = useRef<Group>(null);
  const lampMat = useMemo(() => new MeshStandardMaterial({ color: '#fff6d8', emissive: '#ffe9a8', emissiveIntensity: 0, roughness: 0.3 }), []);
  const shown = useRef({ h: -1, a: 0 });
  useFrame((_, dt) => {
    const s = scope();
    const h = s.coarse + s.fine;
    const sh = shown.current;
    sh.h = sh.h < 0 ? h : sh.h + (h - sh.h) * Math.min(1, dt * 12);
    if (stage.current) stage.current.position.y = stageY(sh.h);
    const target = TURRET_ANGLE[s.objective];
    let d = target - sh.a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    sh.a += d * Math.min(1, dt * 9);
    if (turret.current) turret.current.rotation.y = sh.a;
    const ca = (s.coarse / 100) * Math.PI * 6;
    const fa = (s.fine / 2) * Math.PI * 4;
    for (const r of [coarseL, coarseR]) if (r.current) r.current.rotation.x = ca;
    for (const r of [fineL, fineR]) if (r.current) r.current.rotation.x = fa;
    if (lever.current) lever.current.rotation.y = (s.diaphragm / 100 - 0.5) * 1.3;
    if (dial.current) dial.current.rotation.x = (s.lamp / 100) * Math.PI * 1.5;
    lampMat.emissiveIntensity = lampOn ? (s.lamp / 100) * 2.2 : 0;
  });
  const enamel = colourMaterial('#eef0ec');
  const dark = mat.darkMetal();
  const knob = (ref: React.RefObject<Group | null>, x: number, r: number, w: number) => (
    <group ref={ref} position={[x, 0, 0]}>
      <mesh rotation={[0, 0, Math.PI / 2]} scale={[r, w, r]} material={dark}>
        <cylinderGeometry args={[1, 1, 1, 18]} />
      </mesh>
      {/* knurled ridges, so the turning shows */}
      {[0, 1, 2, 3, 4, 5].map((k) => (
        <mesh key={k} rotation={[(k * Math.PI) / 3, 0, 0]} position={[0, 0, 0]}>
          <boxGeometry args={[w * 1.02, r * 2.04, r * 0.18]} />
          <meshStandardMaterial color="#2a2e33" roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
  return (
    <group>
      {/* base, lamp housing and lamp dial */}
      <Box p={[0, 0.016, -0.01]} s={[0.15, 0.032, 0.21]} m={enamel} />
      <Box p={[0, 0.033, -0.01]} s={[0.13, 0.004, 0.19]} m={colourMaterial('#d9dcd6')} />
      {part(
        'lamp',
        <group>
          <Rod p={[0, 0.037, MS.axisZ]} s={[0.018, 0.008, 0.018]} m={dark} />
          <mesh position={[0, 0.042, MS.axisZ]} scale={[0.012, 0.003, 0.012]} material={lampMat}>
            <cylinderGeometry args={[1, 1, 1, 18]} />
          </mesh>
          <group ref={dial} position={[0.078, 0.018, 0.05]}>
            <mesh rotation={[0, 0, Math.PI / 2]} scale={[0.012, 0.01, 0.012]} material={colourMaterial('#37474f')}>
              <cylinderGeometry args={[1, 1, 1, 14]} />
            </mesh>
            <Box p={[0.006, 0.009, 0]} s={[0.002, 0.004, 0.002]} m={mat.white()} />
          </group>
          <Grip p={[0.08, 0.018, 0.05]} s={[0.03, 0.035, 0.035]} />
        </group>,
      )}
      {/* the arm */}
      <Box p={[0, 0.12, -0.085]} s={[0.04, 0.18, 0.04]} m={enamel} />
      <Box p={[0, 0.25, -0.06]} s={[0.036, 0.11, 0.05]} r={[-0.45, 0, 0]} m={enamel} />
      {/* the head, body tube and the inclined eyepiece */}
      <Box p={[0, 0.29, -0.01]} s={[0.05, 0.05, 0.08]} m={enamel} />
      <Rod p={[0, 0.245, MS.axisZ - 0.006]} s={[0.017, 0.05, 0.017]} m={enamel} />
      {part(
        'eyepiece',
        <group position={[0, 0.315, 0.02]} rotation={[0.6, 0, 0]}>
          <Rod p={[0, 0.045, 0]} s={[0.014, 0.09, 0.014]} m={enamel} />
          <Rod p={[0, 0.095, 0]} s={[0.012, 0.02, 0.012]} m={dark} />
          <Rod p={[0, 0.106, 0]} s={[0.009, 0.002, 0.009]} m={colourMaterial('#203040')} />
          <Grip p={[0, 0.07, 0]} s={[0.04, 0.08, 0.04]} />
        </group>,
      )}
      {/* revolving nosepiece with three objectives */}
      {part(
        'turret',
        <group position={[0, 0.215, MS.axisZ - 0.018]}>
          <group ref={turret}>
            <Rod p={[0, 0, 0]} s={[0.03, 0.012, 0.03]} m={mat.steel()} />
            {MICRO_OBJECTIVES.map((o) => {
              // Placed so that turning the nosepiece to TURRET_ANGLE[o] brings it over the stage.
              const a = TURRET_ANGLE[o];
              const L = OBJ_LEN[o];
              return (
                <group key={o} position={[-Math.sin(a) * 0.018, -0.006, Math.cos(a) * 0.018]}>
                  <Rod p={[0, -L / 2, 0]} s={[0.0085, L, 0.0085]} m={mat.steel()} />
                  <Rod p={[0, -L, 0]} s={[0.006, 0.004, 0.006]} m={mat.steel()} />
                  <mesh position={[0, -L * 0.35, 0]} scale={[0.0088, 0.004, 0.0088]} geometry={ring} material={colourMaterial(OBJ_COLOUR[o])} />
                </group>
              );
            })}
          </group>
        </group>,
      )}
      {/* stage, clips, condenser and the diaphragm lever: they rise and fall with the focus */}
      <group ref={stage}>
        {part(
          'stage',
          <group>
            <Box p={[0, -0.005, MS.axisZ]} s={[0.12, 0.01, 0.11]} m={dark} />
            <Rod p={[0, 0.0002, MS.axisZ]} s={[0.008, 0.0004, 0.008]} m={mat.black()} />
            <Box p={[0, -0.005, -0.055]} s={[0.05, 0.03, 0.03]} m={enamel} />
            {slide && (
              <group position={[0.0, 0.0002, MS.axisZ]}>
                <PreparedSlide look={slide} />
              </group>
            )}
            {[-1, 1].map((s) => (
              <group key={s} position={[s * 0.036, 0.0012, MS.axisZ - 0.014]} rotation={[clipped && slide ? 0 : -0.35, 0, 0]}>
                <Box p={[0, 0.0012, 0.014]} s={[0.006, 0.0012, 0.03]} m={mat.steel()} />
                <Rod p={[0, 0.002, 0]} s={[0.003, 0.004, 0.003]} m={mat.steel()} />
              </group>
            ))}
          </group>,
        )}
        <Rod p={[0, -0.02, MS.axisZ]} s={[0.014, 0.022, 0.014]} m={dark} />
        {part(
          'diaphragm',
          <group position={[0, -0.025, MS.axisZ]}>
            <group ref={lever}>
              <Rod p={[0.022, 0, 0]} s={[0.0018, 0.03, 0.0018]} r={[0, 0, Math.PI / 2]} m={mat.steel()} />
              <Ball p={[0.037, 0, 0]} s={[0.003, 0.003, 0.003]} m={mat.black()} />
              <Grip p={[0.028, 0, 0]} s={[0.03, 0.014, 0.02]} />
            </group>
          </group>,
        )}
      </group>
      {/* focus knobs on both sides of the arm: the big coarse knob, the small fine one outside it */}
      {part(
        'coarse',
        <group position={[0, 0.115, -0.085]}>
          {knob(coarseL, -0.032, 0.02, 0.012)}
          {knob(coarseR, 0.032, 0.02, 0.012)}
        </group>,
      )}
      {part(
        'fine',
        <group position={[0, 0.115, -0.085]}>
          {knob(fineL, -0.046, 0.011, 0.012)}
          {knob(fineR, 0.046, 0.011, 0.012)}
        </group>,
      )}
      <BlobShadow r={0.15} opacity={0.8} />
      {glow && <GlowRing r={0.15} />}
    </group>
  );
}
