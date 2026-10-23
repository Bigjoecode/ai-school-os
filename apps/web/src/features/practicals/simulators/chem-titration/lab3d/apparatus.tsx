import { BURETTE_CAPACITY } from '@aischool/shared';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { CylinderGeometry, LatheGeometry, Matrix4, Vector2, type InstancedMesh, type Mesh } from 'three';
import { colourMaterial, liquidMaterial, mat } from './materials';
import { blobTexture, buretteNumbersTexture, labelTexture } from './textures';

/**
 * The glassware and apparatus, built from lathe profiles and primitives at
 * true size (metres). Each component's origin is the point it stands on.
 */

const v2 = (x: number, y: number) => new Vector2(x, y);
const lathe = (pts: Vector2[], seg = 32) => new LatheGeometry(pts, seg);

// ------------------------------------------------------------------ burette
/** Burette geometry: origin at the jet tip; 1 cm³ = 1 cm of tube. */
export const BU = { tap: 0.058, y50: 0.11, y0: 0.61, top: 0.66, rIn: 0.0056, rOut: 0.0068 };
/** Height in the burette's frame of a reading (cm³; 0 at the top mark). */
export const buretteY = (reading: number) => BU.y0 - (reading / BURETTE_CAPACITY) * (BU.y0 - BU.y50);

const tick = (theta: number, h = 0.0002) => new CylinderGeometry(BU.rOut + 0.00012, BU.rOut + 0.00012, h, 40, 1, true, -theta / 2, theta);

function Graduations({ detail }: { detail: boolean }) {
  const geo = useMemo(() => ({ whole: tick(Math.PI * 2, 0.0003), half: tick(0.7), minor: tick(0.5) }), []);
  const counts = { whole: BURETTE_CAPACITY + 1, half: BURETTE_CAPACITY, minor: BURETTE_CAPACITY * 8 };
  const place = (mesh: InstancedMesh | null, ys: number[]) => {
    if (!mesh || mesh.userData.done) return;
    const m = new Matrix4();
    ys.forEach((y, i) => mesh.setMatrixAt(i, m.makeTranslation(0, y, 0)));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.userData.done = true;
  };
  const ys = useMemo(() => {
    const w: number[] = [];
    const h: number[] = [];
    const n: number[] = [];
    for (let t = 0; t <= BURETTE_CAPACITY * 10; t++) {
      const y = buretteY(t / 10);
      if (t % 10 === 0) w.push(y);
      else if (t % 5 === 0) h.push(y);
      else n.push(y);
    }
    return { w, h, n };
  }, []);
  const numbers = useMemo(() => buretteNumbersTexture(64), []);
  const strip = useMemo(() => new CylinderGeometry(BU.rOut + 0.00018, BU.rOut + 0.00018, ((BURETTE_CAPACITY + 2) / BURETTE_CAPACITY) * (BU.y0 - BU.y50), 24, 1, true, 0.37, 1.2), []);
  const stripY = buretteY(BURETTE_CAPACITY / 2);
  return (
    <group>
      <instancedMesh ref={(m) => place(m, ys.w)} args={[geo.whole, mat.tickBlack(), counts.whole]} frustumCulled={false} />
      <instancedMesh ref={(m) => place(m, ys.h)} args={[geo.half, mat.tickBlack(), counts.half]} frustumCulled={false} />
      <instancedMesh ref={(m) => place(m, ys.n)} args={[geo.minor, mat.tickBlack(), counts.minor]} visible={detail} frustumCulled={false} />
      <mesh geometry={strip} position={[0, stripY, 0]}>
        <meshBasicMaterial map={numbers} transparent alphaTest={0.3} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** The column of acid with its concave meniscus (bottom of the curve exactly at the reading). */
function AcidColumn({ level }: { level: number }) {
  const geo = useMemo(() => {
    const y = buretteY(level);
    const r = BU.rIn - 0.0001;
    const pts = [v2(0, BU.y50 - 0.03), v2(0.0028, BU.y50 - 0.03), v2(r, BU.y50 - 0.004), v2(r, y + 0.0016)];
    for (let i = 1; i <= 8; i++) {
      const f = i / 8;
      pts.push(v2(r * (1 - f), y + 0.0016 * (1 - f) ** 2));
    }
    return lathe(pts, 28);
  }, [level]);
  const y = buretteY(level);
  return (
    <group>
      <mesh geometry={geo} material={liquidMaterial('#d5e9f7', 0.42)} renderOrder={2} />
      {/* the meniscus line: the dark band you read the bottom of */}
      <mesh position={[0, y + 0.0007, 0]} rotation={[Math.PI / 2, 0, 0]} renderOrder={3}>
        <torusGeometry args={[BU.rIn - 0.0012, 0.0006, 6, 40]} />
        <meshBasicMaterial color="#22384f" transparent opacity={0.8} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function Burette({ level, bubble, tapOpen, detail = true, glow }: { level: number | null; bubble: boolean; tapOpen: boolean; detail?: boolean; glow?: boolean }) {
  const glass = useMemo(() => {
    const p = [v2(0.0016, 0), v2(0.0022, 0.004), v2(0.0026, 0.04), v2(0.0034, BU.tap - 0.008), v2(0.0034, BU.tap + 0.01), v2(0.003, BU.y50 - 0.03), v2(BU.rOut, BU.y50 - 0.006), v2(BU.rOut, BU.top - 0.004), v2(BU.rOut + 0.0012, BU.top)];
    return lathe(p, 28);
  }, []);
  const tapRef = useRef<Mesh>(null);
  useFrame((_, dt) => {
    const key = tapRef.current;
    if (!key) return;
    const target = tapOpen ? Math.PI / 2 : 0;
    key.rotation.x += (target - key.rotation.x) * Math.min(1, dt * 12);
  });
  return (
    <group>
      {level !== null && <AcidColumn level={level} />}
      {level !== null && (
        <mesh position={[0, 0.03, 0]} material={liquidMaterial('#d5e9f7', 0.42)}>
          <cylinderGeometry args={[0.0016, 0.0012, 0.06, 10]} />
        </mesh>
      )}
      {level !== null && bubble && (
        <mesh position={[0, 0.03, 0]}>
          <sphereGeometry args={[0.0021, 12, 8]} />
          <meshStandardMaterial color="#ffffff" roughness={0} transparent opacity={0.7} />
        </mesh>
      )}
      <mesh geometry={glass} material={mat.glass()} renderOrder={4} />
      <Graduations detail={detail} />
      {/* stopcock: PTFE barrel and key */}
      <mesh position={[0, BU.tap, 0]} rotation={[0, 0, Math.PI / 2]} material={mat.ptfe()}>
        <cylinderGeometry args={[0.0042, 0.0042, 0.026, 16]} />
      </mesh>
      <mesh ref={tapRef} position={[0.018, BU.tap, 0]} material={mat.ptfe()}>
        <boxGeometry args={[0.006, 0.022, 0.004]} />
      </mesh>
      {glow && <GlowRing r={0.02} y={BU.tap} />}
    </group>
  );
}

// ------------------------------------------------------------------ conical flask
const FL = { R: 0.041, neck: 0.0165, cone: 0.105, h: 0.138 };
/** Radius of the flask's inside at height y (m). */
const flaskR = (y: number) => (y < FL.cone ? FL.R - (y / FL.cone) * (FL.R - FL.neck) : FL.neck) - 0.0012;
/** Liquid height for a volume (cm³) in the flask. */
export function flaskLevel(cm3: number) {
  const target = cm3 * 1e-6;
  let y = 0;
  let v = 0;
  const dy = 0.0002;
  while (v < target && y < FL.h) {
    const r = flaskR(y + dy / 2);
    v += Math.PI * r * r * dy;
    y += dy;
  }
  return y;
}
export function ConicalFlask({ volume, colour, flash, glow }: { volume: number; colour: string | null; flash?: string | null; glow?: boolean }) {
  const glass = useMemo(() => lathe([v2(0, 0.0015), v2(FL.R - 0.004, 0), v2(FL.R, 0.004), v2(FL.neck, FL.cone), v2(FL.neck, FL.h - 0.004), v2(FL.neck + 0.002, FL.h - 0.002), v2(FL.neck + 0.0015, FL.h)], 36), []);
  const h = volume > 0 ? Math.max(0.004, flaskLevel(volume)) + 0.002 : 0;
  const liquid = useMemo(() => {
    if (!h) return null;
    const pts = [v2(0, 0.0025), v2(flaskR(0.003) - 0.003, 0.0025), v2(flaskR(0.006), 0.006)];
    pts.push(v2(flaskR(h), h), v2(0, h));
    return lathe(pts, 32);
  }, [h]);
  return (
    <group>
      <BlobShadow r={0.06} />
      {liquid && colour && <mesh geometry={liquid} material={liquidMaterial(colour, 0.8)} renderOrder={2} />}
      {liquid && flash && (
        <mesh position={[0.008, h + 0.0004, 0.004]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}>
          <circleGeometry args={[0.012, 20]} />
          <meshBasicMaterial color={flash} transparent opacity={0.85} depthWrite={false} />
        </mesh>
      )}
      <mesh geometry={glass} material={mat.glass()} renderOrder={4} />
      <mesh position={[0, 0.06, FL.R - 0.012]} rotation={[-0.33, 0, 0]}>
        <planeGeometry args={[0.026, 0.012]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.8} />
      </mesh>
      {glow && <GlowRing r={0.055} />}
    </group>
  );
}

// ------------------------------------------------------------------ pipette and filler
/** A 25.0 cm³ bulb pipette standing on its tip (origin): 0.46 m long. */
export function Pipette({ filled, glow }: { filled: number; glow?: boolean }) {
  const glass = useMemo(
    () => lathe([v2(0.0012, 0), v2(0.0026, 0.03), v2(0.0034, 0.12), v2(0.012, 0.15), v2(0.013, 0.19), v2(0.012, 0.23), v2(0.0034, 0.26), v2(0.0034, 0.455), v2(0.0038, 0.46)], 24),
    [],
  );
  return (
    <group>
      {filled > 0 && (
        <mesh material={liquidMaterial('#dfeff8', 0.55)}>
          <latheGeometry args={[[v2(0.001, 0.002), v2(0.0022, 0.03), v2(0.003, 0.12), v2(0.011, 0.15), v2(0.012, 0.19), v2(0.011, 0.23), v2(0.003, 0.26), v2(0.003, 0.26 + 0.12 * filled), v2(0, 0.26 + 0.12 * filled)], 16]} />
        </mesh>
      )}
      <mesh geometry={glass} material={mat.glass()} renderOrder={4} />
      <mesh position={[0, 0.38, 0]} material={mat.tickBlack()}>
        <cylinderGeometry args={[0.0036, 0.0036, 0.0006, 20, 1, true]} />
      </mesh>
      {glow && <GlowRing r={0.03} y={0.19} />}
    </group>
  );
}
export function Filler({ glow }: { glow?: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.03, 0]} scale={[1, 1.15, 1]} material={mat.rubber()}>
        <sphereGeometry args={[0.026, 20, 16]} />
      </mesh>
      <mesh position={[0, 0.07, 0]} material={mat.rubber()}>
        <cylinderGeometry args={[0.006, 0.009, 0.03, 12]} />
      </mesh>
      <mesh position={[0, 0.0, 0]} material={mat.rubber()}>
        <cylinderGeometry args={[0.008, 0.008, 0.01, 12]} />
      </mesh>
      {glow && <GlowRing r={0.035} />}
    </group>
  );
}

// ------------------------------------------------------------------ funnel, stand, tile
export function Funnel({ glow }: { glow?: boolean }) {
  const g = useMemo(() => lathe([v2(0.0028, 0), v2(0.0032, 0.035), v2(0.005, 0.04), v2(0.034, 0.075), v2(0.036, 0.078)], 28), []);
  return (
    <group>
      <mesh geometry={g} material={mat.glass()} renderOrder={4} />
      {glow && <GlowRing r={0.045} y={0.05} />}
    </group>
  );
}

/** Retort stand: the base plate under the burette, the rod behind and to its left, the clamp arm reaching the burette axis (stand-local x = 0, z = +0.04) at `clampY`. */
const ROD: [number, number] = [-0.11, -0.13];
const ARM = { len: Math.hypot(-ROD[0], 0.04 - ROD[1]), yaw: Math.atan2(-ROD[0], 0.04 - ROD[1]) };
export function RetortStand({ clampY, glow }: { clampY: number; glow?: boolean }) {
  return (
    <group>
      <mesh position={[-0.03, 0.007, -0.01]} material={mat.darkMetal()}>
        <boxGeometry args={[0.22, 0.014, 0.3]} />
      </mesh>
      <mesh position={[ROD[0], 0.46, ROD[1]]} material={mat.steel()}>
        <cylinderGeometry args={[0.0065, 0.0065, 0.9, 14]} />
      </mesh>
      {/* boss head, then the clamp arm and its cork-lined jaws */}
      <group position={[ROD[0], clampY, ROD[1]]} rotation={[0, ARM.yaw, 0]}>
        <mesh material={mat.darkMetal()}>
          <boxGeometry args={[0.03, 0.03, 0.03]} />
        </mesh>
        <mesh position={[0.022, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={mat.darkMetal()}>
          <cylinderGeometry args={[0.004, 0.004, 0.03, 8]} />
        </mesh>
        <mesh position={[0, 0, ARM.len / 2 - 0.01]} rotation={[Math.PI / 2, 0, 0]} material={mat.steel()}>
          <cylinderGeometry args={[0.005, 0.005, ARM.len - 0.02, 10]} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.012, 0, ARM.len]} material={mat.cork()}>
            <boxGeometry args={[0.008, 0.035, 0.03]} />
          </mesh>
        ))}
      </group>
      <BlobShadow r={0.17} />
      {glow && <GlowRing r={0.13} />}
    </group>
  );
}
export function WhiteTile({ glow }: { glow?: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.004, 0]} material={mat.tile()}>
        <boxGeometry args={[0.15, 0.008, 0.15]} />
      </mesh>
      {glow && <GlowRing r={0.1} />}
    </group>
  );
}

// ------------------------------------------------------------------ containers
export function Beaker({ liquid = 0, glow, scale = 1 }: { liquid?: number; glow?: boolean; scale?: number }) {
  const g = useMemo(() => lathe([v2(0, 0.001), v2(0.026, 0), v2(0.027, 0.003), v2(0.027, 0.072), v2(0.029, 0.075)], 28), []);
  return (
    <group scale={scale}>
      <BlobShadow r={0.04} />
      {liquid > 0 && (
        <mesh position={[0, 0.003 + liquid / 2, 0]} material={liquidMaterial('#cfe4f2', 0.18)}>
          <cylinderGeometry args={[0.0255, 0.0255, liquid, 24]} />
        </mesh>
      )}
      <mesh geometry={g} material={mat.glass()} renderOrder={4} />
      {[0.02, 0.035, 0.05].map((y) => (
        <mesh key={y} position={[0, y, 0]} material={mat.tickBlack()}>
          <cylinderGeometry args={[0.0273, 0.0273, 0.0006, 16, 1, true, -0.35, 0.7]} />
        </mesh>
      ))}
      {glow && <GlowRing r={0.04} />}
    </group>
  );
}
export function WashBottle({ glow }: { glow?: boolean }) {
  return (
    <group>
      <BlobShadow r={0.05} />
      <mesh position={[0, 0.07, 0]} material={mat.plastic()}>
        <cylinderGeometry args={[0.034, 0.036, 0.14, 24]} />
      </mesh>
      <mesh position={[0, 0.06, 0]} material={liquidMaterial('#e8f3fa', 0.4)}>
        <cylinderGeometry args={[0.031, 0.033, 0.11, 20]} />
      </mesh>
      <mesh position={[0, 0.15, 0]} material={mat.red()}>
        <cylinderGeometry args={[0.014, 0.016, 0.02, 16]} />
      </mesh>
      <mesh position={[0.012, 0.18, 0]} rotation={[0, 0, -0.6]} material={mat.plastic()}>
        <cylinderGeometry args={[0.0025, 0.0025, 0.06, 8]} />
      </mesh>
      <mesh position={[0, 0.075, 0.036]} renderOrder={3}>
        <planeGeometry args={[0.04, 0.03]} />
        <meshBasicMaterial map={labelTexture('H₂O', '#2a7fc9', 'Distilled water')} />
      </mesh>
      {glow && <GlowRing r={0.05} />}
    </group>
  );
}
/** A stoppered reagent bottle with a printed label. */
export function ReagentBottle({ name, band, sub = '', liquid = '#e9f2f7', amber = false, r = 0.038, h = 0.13, glow }: { name: string; band: string; sub?: string; liquid?: string; amber?: boolean; r?: number; h?: number; glow?: boolean }) {
  const glass = useMemo(() => lathe([v2(0, 0.001), v2(r - 0.003, 0), v2(r, 0.004), v2(r, h * 0.78), v2(r * 0.4, h * 0.92), v2(r * 0.36, h), v2(r * 0.4, h + 0.004)], 24), [r, h]);
  return (
    <group>
      <BlobShadow r={r * 1.4} />
      <mesh position={[0, h * 0.36, 0]} material={liquidMaterial(liquid, amber ? 0.9 : 0.55)}>
        <cylinderGeometry args={[r - 0.002, r - 0.002, h * 0.68, 20]} />
      </mesh>
      <mesh geometry={glass} material={amber ? colourMaterial('#6b3a12') : mat.glass()} renderOrder={4} />
      <mesh position={[0, h + 0.012, 0]} material={amber ? mat.black() : mat.glass()}>
        <cylinderGeometry args={[r * 0.3, r * 0.36, 0.022, 14]} />
      </mesh>
      <mesh position={[0, h * 0.42, 0]} renderOrder={5}>
        <cylinderGeometry args={[r + 0.0006, r + 0.0006, h * 0.36, 24, 1, true, -0.9, 1.8]} />
        <meshStandardMaterial map={labelTexture(name, band, sub)} roughness={0.7} />
      </mesh>
      {glow && <GlowRing r={r * 1.5} />}
    </group>
  );
}
/** A small dropper bottle of indicator. */
export function DropperBottle({ name, colour, glow }: { name: string; colour: string; glow?: boolean }) {
  return (
    <group>
      <BlobShadow r={0.028} />
      <mesh position={[0, 0.026, 0]} material={colourMaterial('#5b2d0e')}>
        <cylinderGeometry args={[0.017, 0.018, 0.052, 16]} />
      </mesh>
      <mesh position={[0, 0.03, 0]} material={liquidMaterial(colour, 0.9)}>
        <cylinderGeometry args={[0.0172, 0.0172, 0.03, 16]} />
      </mesh>
      <mesh position={[0, 0.06, 0]} material={mat.black()}>
        <cylinderGeometry args={[0.008, 0.01, 0.014, 12]} />
      </mesh>
      <mesh position={[0, 0.074, 0]} material={mat.rubber()}>
        <sphereGeometry args={[0.0075, 12, 10]} />
      </mesh>
      <mesh position={[0, 0.026, 0]} renderOrder={5}>
        <cylinderGeometry args={[0.0186, 0.0186, 0.026, 20, 1, true, -1, 2]} />
        <meshStandardMaterial map={labelTexture(name, colour)} roughness={0.7} />
      </mesh>
      {glow && <GlowRing r={0.03} />}
    </group>
  );
}

// ------------------------------------------------------------------ apparatus that is not needed (the cupboard's distractors)
export function MeasuringCylinder({ glow }: { glow?: boolean }) {
  const g = useMemo(() => lathe([v2(0, 0.012), v2(0.012, 0.012), v2(0.012, 0.2), v2(0.014, 0.205)], 20), []);
  return (
    <group>
      <mesh position={[0, 0.006, 0]} material={mat.glass()}>
        <cylinderGeometry args={[0.03, 0.032, 0.012, 6]} />
      </mesh>
      <mesh geometry={g} material={mat.glass()} renderOrder={4} />
      {glow && <GlowRing r={0.04} />}
    </group>
  );
}
export function TestTubeRack({ glow }: { glow?: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.045, 0]} material={mat.wood()}>
        <boxGeometry args={[0.2, 0.012, 0.06]} />
      </mesh>
      <mesh position={[0, 0.006, 0]} material={mat.wood()}>
        <boxGeometry args={[0.2, 0.012, 0.06]} />
      </mesh>
      {[-0.06, -0.02, 0.02, 0.06].map((x) => (
        <mesh key={x} position={[x, 0.065, 0]} material={mat.glass()} renderOrder={4}>
          <cylinderGeometry args={[0.008, 0.008, 0.11, 12]} />
        </mesh>
      ))}
      {glow && <GlowRing r={0.12} />}
    </group>
  );
}
export function Thermometer({ glow }: { glow?: boolean }) {
  return (
    <group rotation={[0, 0, Math.PI / 2]} position={[0.14, 0.005, 0]}>
      <mesh position={[0, 0.14, 0]} material={mat.glass()}>
        <cylinderGeometry args={[0.0035, 0.0035, 0.28, 10]} />
      </mesh>
      <mesh position={[0, 0.07, 0]}>
        <cylinderGeometry args={[0.0011, 0.0011, 0.13, 6]} />
        <meshBasicMaterial color="#c62828" />
      </mesh>
      <mesh position={[0, 0.004, 0]}>
        <sphereGeometry args={[0.0042, 10, 8]} />
        <meshBasicMaterial color="#c62828" />
      </mesh>
      {glow && <GlowRing r={0.05} />}
    </group>
  );
}
export function BunsenBurner({ glow }: { glow?: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.006, 0]} material={mat.darkMetal()}>
        <cylinderGeometry args={[0.04, 0.045, 0.012, 20]} />
      </mesh>
      <mesh position={[0, 0.08, 0]} material={mat.metal()}>
        <cylinderGeometry args={[0.008, 0.009, 0.14, 14]} />
      </mesh>
      <mesh position={[0, 0.035, 0]} material={mat.metal()}>
        <cylinderGeometry args={[0.012, 0.012, 0.02, 14]} />
      </mesh>
      {glow && <GlowRing r={0.05} />}
    </group>
  );
}

// ------------------------------------------------------------------ helpers
/** A soft round "baked" shadow on the surface below. */
export function BlobShadow({ r, y = 0.0008, opacity = 1 }: { r: number; y?: number; opacity?: number }) {
  return (
    <mesh position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
      <planeGeometry args={[r * 2, r * 2]} />
      <meshBasicMaterial map={blobTexture()} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}

/** The pulsing ring that marks what is under the cursor or selected. */
export function GlowRing({ r, y = 0.002 }: { r: number; y?: number }) {
  const ref = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 5) * 0.06);
  });
  return (
    <mesh ref={ref} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mat.highlight()} renderOrder={6}>
      <ringGeometry args={[r * 0.86, r, 40]} />
    </mesh>
  );
}
