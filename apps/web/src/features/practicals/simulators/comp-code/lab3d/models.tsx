import { useEffect, useMemo } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';
import { BENCHES, BENCH } from '../../../lab3d-kit/layout';
import { mat } from '../../../lab3d-kit/materials';

/** The computer room's procedural equipment: every piece is a few boxes and one canvas-drawn screen. */

type V3 = [number, number, number];
function B({ p, s, m, c }: { p: V3; s: V3; m?: 'black' | 'plastic' | 'darkMetal' | 'white' | 'metal' | 'rubber' | 'red' | 'green'; c?: string }) {
  return (
    <mesh position={p} material={c ? undefined : mat[m ?? 'plastic']()}>
      <boxGeometry args={s} />
      {c && <meshStandardMaterial color={c} roughness={0.55} />}
    </mesh>
  );
}

export interface ScreenPicture {
  kind: 'off' | 'desktop' | 'code' | 'page';
  lines: string[];
  title?: string;
}

function drawScreen(g: CanvasRenderingContext2D, w: number, h: number, p: ScreenPicture) {
  if (p.kind === 'off') {
    g.fillStyle = '#05070a';
    g.fillRect(0, 0, w, h);
    return;
  }
  if (p.kind === 'desktop') {
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#0e7490');
    grad.addColorStop(1, '#1e3a8a');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,.45)';
    g.fillRect(0, h - 26, w, 26);
    g.fillStyle = '#fff';
    g.font = '15px sans-serif';
    g.fillText('Start', 12, h - 8);
    for (let i = 0; i < 3; i++) {
      g.fillStyle = 'rgba(255,255,255,.85)';
      g.fillRect(18, 18 + i * 62, 34, 30);
    }
    return;
  }
  if (p.kind === 'page') {
    g.fillStyle = '#e2e8f0';
    g.fillRect(0, 0, w, 26);
    g.fillStyle = '#fff';
    g.fillRect(0, 26, w, h - 26);
    g.fillStyle = '#0f172a';
    g.font = '13px sans-serif';
    g.fillText(p.title ?? 'New page', 10, 18);
    g.font = '15px monospace';
    p.lines.slice(0, 13).forEach((l, i) => g.fillText(l.slice(0, 52), 12, 50 + i * 21));
    return;
  }
  g.fillStyle = '#0b1f7a';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#e5e7eb';
  g.fillRect(0, 0, w, 22);
  g.fillStyle = '#0b1f7a';
  g.font = 'bold 14px monospace';
  g.fillText(p.title ?? 'BASIC', 10, 16);
  g.fillStyle = '#f8fafc';
  g.font = '15px monospace';
  p.lines.slice(0, 14).forEach((l, i) => g.fillText(l.slice(0, 54), 10, 42 + i * 20));
}

/** A monitor whose screen shows the work in hand. */
export function Monitor({ picture, glow }: { picture: ScreenPicture; glow?: boolean }) {
  const key = JSON.stringify(picture);
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 320;
    drawScreen(c.getContext('2d')!, 512, 320, picture);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <group>
      <B p={[0, 0.012, 0]} s={[0.22, 0.016, 0.16]} m="black" />
      <B p={[0, 0.07, -0.01]} s={[0.05, 0.11, 0.03]} m="black" />
      <B p={[0, 0.27, 0]} s={[0.52, 0.34, 0.03]} m="black" />
      <mesh position={[0, 0.27, 0.016]}>
        <planeGeometry args={[0.49, 0.305]} />
        <meshBasicMaterial map={tex} />
      </mesh>
      <mesh position={[0.235, 0.095, 0.017]}>
        <sphereGeometry args={[0.004, 8, 8]} />
        <meshBasicMaterial color={picture.kind === 'off' ? '#7f1d1d' : '#22c55e'} />
      </mesh>
      {glow && (
        <mesh position={[0, 0.27, -0.02]} material={mat.highlight()}>
          <boxGeometry args={[0.56, 0.38, 0.01]} />
        </mesh>
      )}
    </group>
  );
}

export function SystemUnit({ on, glow }: { on: boolean; glow?: boolean }) {
  return (
    <group>
      <B p={[0, 0.2, 0]} s={[0.19, 0.4, 0.42]} c="#d6d3d1" />
      <B p={[0, 0.34, 0.212]} s={[0.15, 0.05, 0.004]} m="black" />
      <B p={[0, 0.12, 0.212]} s={[0.15, 0.14, 0.004]} c="#a8a29e" />
      <mesh position={[0.05, 0.27, 0.215]}>
        <sphereGeometry args={[0.006, 8, 8]} />
        <meshBasicMaterial color={on ? '#22c55e' : '#3f3f46'} />
      </mesh>
      <mesh position={[0, 0.27, 0.215]} rotation={[Math.PI / 2, 0, 0]} material={mat.metal()}>
        <cylinderGeometry args={[0.012, 0.012, 0.006, 16]} />
      </mesh>
      {glow && (
        <mesh position={[0, 0.2, 0]} material={mat.highlight()}>
          <boxGeometry args={[0.21, 0.42, 0.44]} />
        </mesh>
      )}
    </group>
  );
}

export function DvdTray({ glow }: { glow?: boolean }) {
  return <B p={[0, 0, 0]} s={[0.15, 0.03, 0.008]} c={glow ? '#fbbf24' : '#57534e'} />;
}

export function Keyboard({ glow }: { glow?: boolean }) {
  const keys = useMemo(() => {
    const out: V3[] = [];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 14; c++) out.push([-0.195 + c * 0.03, 0.021, -0.06 + r * 0.03]);
    return out;
  }, []);
  return (
    <group>
      <B p={[0, 0.01, 0]} s={[0.44, 0.02, 0.16]} m={glow ? 'plastic' : 'black'} />
      {keys.map((p, i) => (
        <mesh key={i} position={p} material={mat.darkMetal()}>
          <boxGeometry args={[0.024, 0.006, 0.024]} />
        </mesh>
      ))}
    </group>
  );
}

export function Mouse({ glow }: { glow?: boolean }) {
  return (
    <mesh position={[0, 0.014, 0]} scale={[1, 0.6, 1.5]} material={glow ? mat.plastic() : mat.black()}>
      <sphereGeometry args={[0.03, 12, 10]} />
    </mesh>
  );
}

export function Ups({ on, glow }: { on: boolean; glow?: boolean }) {
  return (
    <group>
      <B p={[0, 0.09, 0]} s={[0.1, 0.18, 0.26]} m="black" />
      <B p={[0, 0.15, 0.131]} s={[0.07, 0.03, 0.002]} c={on ? '#16a34a' : '#374151'} />
      <mesh position={[0, 0.1, 0.133]} rotation={[Math.PI / 2, 0, 0]} material={glow ? mat.highlight() : mat.red()}>
        <cylinderGeometry args={[0.012, 0.012, 0.006, 14]} />
      </mesh>
    </group>
  );
}

/** A Cat 6 coil, plugs, the crimper and the tester. */
export function CableCoil({ glow }: { glow?: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.03, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.09, 0.024, 10, 28]} />
        <meshStandardMaterial color={glow ? '#60a5fa' : '#2563eb'} roughness={0.6} />
      </mesh>
    </group>
  );
}
export function Crimper({ glow }: { glow?: boolean }) {
  return (
    <group rotation={[0, 0.4, 0]}>
      <B p={[-0.05, 0.012, 0.018]} s={[0.17, 0.014, 0.022]} c={glow ? '#ef4444' : '#b91c1c'} />
      <B p={[-0.05, 0.012, -0.018]} s={[0.17, 0.014, 0.022]} c={glow ? '#ef4444' : '#b91c1c'} />
      <B p={[0.075, 0.014, 0]} s={[0.085, 0.022, 0.05]} m="darkMetal" />
    </group>
  );
}
export function CableTester({ lights, glow }: { lights: number[] | null; glow?: boolean }) {
  return (
    <group>
      {[-0.07, 0.07].map((x, u) => (
        <group key={x} position={[x, 0, 0]}>
          <B p={[0, 0.016, 0]} s={[0.11, 0.03, 0.17]} c={glow ? '#fbbf24' : '#eab308'} />
          {Array.from({ length: 8 }, (_, i) => (
            <mesh key={i} position={[-0.035 + (i % 4) * 0.022, 0.033, -0.04 + Math.floor(i / 4) * 0.03]}>
              <sphereGeometry args={[0.005, 8, 8]} />
              <meshBasicMaterial color={lights ? (u === 0 ? '#22c55e' : lights[i] === i + 1 ? '#22c55e' : lights[i] ? '#f59e0b' : '#7f1d1d') : '#3f3f46'} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}
export function Bottle({ colour, glow }: { colour: string; glow?: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.12, 14]} />
        <meshStandardMaterial color={glow ? '#fbbf24' : colour} roughness={0.5} />
      </mesh>
      <B p={[0, 0.13, 0]} s={[0.022, 0.02, 0.022]} m="black" />
    </group>
  );
}
export function Cloth({ glow }: { glow?: boolean }) {
  return <B p={[0, 0.012, 0]} s={[0.18, 0.024, 0.13]} c={glow ? '#fde68a' : '#0ea5e9'} />;
}

/** The other students' computers, for the room. */
export function RoomComputers() {
  return (
    <group>
      {BENCHES.flatMap(([x, z], b) =>
        [-0.72, 0.72].map((dx) =>
          b === 1 ? null : (
            <group key={`${b}-${dx}`} position={[x + dx, BENCH.h, z - 0.16]}>
              <B p={[0, 0.07, -0.01]} s={[0.05, 0.11, 0.03]} m="black" />
              <B p={[0, 0.27, 0]} s={[0.52, 0.34, 0.03]} m="black" />
              <B p={[0, 0.27, 0.016]} s={[0.49, 0.305, 0.002]} c="#155e75" />
              <group position={[0, 0, 0.34]}>
                <B p={[0, 0.01, 0]} s={[0.44, 0.02, 0.16]} m="black" />
              </group>
              <group position={[0.42, 0, 0.02]}>
                <B p={[0, 0.2, 0]} s={[0.19, 0.4, 0.42]} c="#d6d3d1" />
              </group>
            </group>
          ),
        ),
      )}
    </group>
  );
}
