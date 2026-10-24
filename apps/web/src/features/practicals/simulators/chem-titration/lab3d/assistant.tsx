import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useReducer, useRef } from 'react';
import { MeshStandardMaterial, Vector3, type Group } from 'three';
import { Interactive } from './interact';
import { ASSISTANT_POS, STATION } from './layout';
import { mat } from './materials';
import { useLabView } from './store';
import { objectPosition } from './targets';

/**
 * Mrs Ada, the lab technician: a simple procedural figure in a lab coat by
 * the teacher's desk. She turns to face the student, gestures while talking
 * and shows her current line in a speech bubble. Tapping her asks for the
 * next instruction (handled by the HUD, which owns the guide).
 */

export const ASSISTANT_NAME = 'Mrs Ada';
const LINE_MS = 9000;

const skin = new MeshStandardMaterial({ color: '#6b4128', roughness: 0.6 });
const hair = new MeshStandardMaterial({ color: '#141010', roughness: 0.9 });
const trousers = new MeshStandardMaterial({ color: '#2d3a4f', roughness: 0.8 });
const shoes = new MeshStandardMaterial({ color: '#1b1b1b', roughness: 0.5 });
const scarf = new MeshStandardMaterial({ color: '#0f7a55', roughness: 0.7 });

export function Assistant() {
  const line = useLabView((v) => v.line);
  const ada = useLabView((v) => v.ada);
  // Behind the student's bench (facing them across it) when she teaches or demonstrates.
  const pos: [number, number, number] = ada.at === 'bench' ? [STATION[0] - 0.55, 0, STATION[2] - 1.3] : ASSISTANT_POS;
  const point = useMemo(() => new Vector3(), []);
  const body = useRef<Group>(null);
  const head = useRef<Group>(null);
  const arm = useRef<Group>(null);
  const camera = useThree((s) => s.camera);
  const tmp = useMemo(() => new Vector3(), []);
  const talking = !!line && Date.now() - line.at < LINE_MS;
  // Hide the bubble when the line has been up long enough.
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!line) return;
    const id = setTimeout(rerender, Math.max(0, LINE_MS - (Date.now() - line.at)) + 30);
    return () => clearTimeout(id);
  }, [line]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const b = body.current;
    if (b) {
      // Turn the whole body slowly toward the student, the head the rest of the way.
      const { ada: a } = useLabView.getState();
      const aim = a.point ? objectPosition(a.point, point) : null;
      if (aim) tmp.set(aim.x - pos[0], 0, aim.z - pos[2]);
      else tmp.set(camera.position.x - pos[0], 0, camera.position.z - pos[2]);
      const want = Math.atan2(tmp.x, tmp.z);
      b.rotation.y += ((aim ? want : want * 0.6) - b.rotation.y) * (a.at === 'bench' ? 0.08 : 0.03);
      if (head.current) head.current.rotation.y = Math.max(-0.7, Math.min(0.7, want - b.rotation.y));
      b.position.y = Math.sin(t * 1.6) * 0.004;
    }
    const speaking = useLabView.getState().line;
    const live = !!speaking && Date.now() - speaking.at < LINE_MS;
    const pointing = !!useLabView.getState().ada.point;
    if (arm.current) arm.current.rotation.x = pointing ? -1.25 + Math.sin(t * 2) * 0.05 : live ? -0.9 + Math.sin(t * 4) * 0.25 : -0.05;
    if (head.current) head.current.rotation.x = live ? Math.sin(t * 6) * 0.04 : 0;
  });

  return (
    <Interactive id="assistant" label={`${ASSISTANT_NAME}, lab technician — tap for help`} labelY={1.95} position={pos}>
      <group ref={body}>
        {/* legs and shoes */}
        {[-0.08, 0.08].map((x) => (
          <group key={x}>
            <mesh position={[x, 0.42, 0]} material={trousers}>
              <cylinderGeometry args={[0.055, 0.05, 0.8, 10]} />
            </mesh>
            <mesh position={[x, 0.03, 0.03]} material={shoes}>
              <boxGeometry args={[0.09, 0.06, 0.2]} />
            </mesh>
          </group>
        ))}
        {/* lab coat: body and skirt */}
        <mesh position={[0, 1.12, 0]} material={mat.white()}>
          <cylinderGeometry args={[0.17, 0.19, 0.62, 16]} />
        </mesh>
        <mesh position={[0, 0.72, 0]} material={mat.white()}>
          <cylinderGeometry args={[0.2, 0.24, 0.26, 16, 1, true]} />
        </mesh>
        <mesh position={[0, 1.38, 0.02]} material={scarf}>
          <cylinderGeometry args={[0.075, 0.09, 0.06, 12]} />
        </mesh>
        {/* left arm by the side (holding a clipboard), right arm gestures when talking */}
        <group position={[-0.215, 1.36, 0]} rotation={[-0.35, 0, 0.08]}>
          <mesh position={[0, -0.25, 0]} material={mat.white()}>
            <cylinderGeometry args={[0.05, 0.045, 0.5, 10]} />
          </mesh>
          <mesh position={[0, -0.52, 0]} material={skin}>
            <sphereGeometry args={[0.045, 10, 8]} />
          </mesh>
          <mesh position={[0.05, -0.47, 0.07]} rotation={[0.3, 0.3, 0]} material={mat.wood()}>
            <boxGeometry args={[0.02, 0.3, 0.22]} />
          </mesh>
        </group>
        <group ref={arm} position={[0.215, 1.36, 0]}>
          <mesh position={[0, -0.25, 0]} material={mat.white()}>
            <cylinderGeometry args={[0.05, 0.045, 0.5, 10]} />
          </mesh>
          <mesh position={[0, -0.52, 0]} material={skin}>
            <sphereGeometry args={[0.045, 10, 8]} />
          </mesh>
        </group>
        {/* head: face, hair bun, glasses */}
        <group ref={head} position={[0, 1.5, 0]}>
          <mesh position={[0, 0.04, 0]} material={skin}>
            <cylinderGeometry args={[0.04, 0.045, 0.08, 10]} />
          </mesh>
          <mesh position={[0, 0.17, 0]} scale={[1, 1.12, 1]} material={skin}>
            <sphereGeometry args={[0.105, 20, 16]} />
          </mesh>
          <mesh position={[0, 0.215, -0.02]} scale={[1.05, 0.9, 1.05]} material={hair}>
            <sphereGeometry args={[0.105, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
          <mesh position={[0, 0.28, -0.08]} material={hair}>
            <sphereGeometry args={[0.06, 12, 10]} />
          </mesh>
          {[-0.04, 0.04].map((x) => (
            <mesh key={x} position={[x, 0.18, 0.1]} rotation={[Math.PI / 2, 0, 0]} material={mat.black()}>
              <torusGeometry args={[0.022, 0.004, 6, 16]} />
            </mesh>
          ))}
          {ada.goggles && (
            <group position={[0, 0.18, 0.1]}>
              {[-0.042, 0.042].map((x) => (
                <mesh key={x} position={[x, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.034, 0.034, 0.03, 16]} />
                  <meshStandardMaterial color="#cfe9f7" transparent opacity={0.55} roughness={0.1} />
                </mesh>
              ))}
              <mesh position={[0, 0, -0.02]} material={mat.black()}>
                <boxGeometry args={[0.24, 0.014, 0.012]} />
              </mesh>
            </group>
          )}
          <mesh position={[0, 0.1, 0.098]} material={mat.red()}>
            <boxGeometry args={[0.035, 0.008, 0.01]} />
          </mesh>
        </group>
      </group>
      {talking && line && (
        <Html position={[0, 2.05, 0]} center zIndexRange={[15, 0]} style={{ pointerEvents: 'none' }}>
          <div className="relative w-[230px] rounded-2xl border border-black/10 bg-white px-3 py-2 text-[12.5px] leading-snug text-slate-900 shadow-xl">
            <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">{ASSISTANT_NAME}</p>
            {line.text}
            <span className="absolute -bottom-1.5 left-1/2 size-3 -translate-x-1/2 rotate-45 border-b border-r border-black/10 bg-white" />
          </div>
        </Html>
      )}
    </Interactive>
  );
}
