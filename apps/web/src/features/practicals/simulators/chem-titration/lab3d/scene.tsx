import type { ChemTitrationState, ChemTitrationVariant } from '@aischool/shared';
import { PerformanceMonitor } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import { PMREMGenerator } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Titration } from '../actions';
import { buretteY } from './apparatus';
import { Assistant } from './assistant';
import { Beacon } from './beacon';
import { CameraRig } from './controls';
import { DragController } from './drag';
import { SPOT, STATION } from './layout';
import { Room, SafetyCorner } from './room';
import type { SceneState } from './scene-state';
import { CupboardContents, Held, Station } from './station';
import { useLabView, type Quality } from './store';
import { objectPosition } from './targets';

/** A reflection map made on the GPU from three's built-in procedural room (no HDRI download). */
function Environment({ intensity }: { intensity: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const pm = new PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const env = pm.fromScene(room, 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = intensity;
    room.dispose();
    return () => {
      scene.environment = null;
      env.dispose();
      pm.dispose();
    };
  }, [gl, scene, intensity]);
  return null;
}

/** Development only: screen position of an object by id, so an automated browser check can drag it. */
function DevProbe() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const w = window as Window & { __lab3dProject?: (id: string, dy?: number) => { x: number; y: number } | null };
    w.__lab3dProject = (id, dy = 0) => {
      const p = objectPosition(id);
      if (!p) return null;
      p.y += dy;
      p.project(camera);
      const r = gl.domElement.getBoundingClientRect();
      return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
    };
    return () => {
      delete w.__lab3dProject;
    };
  }, [camera, gl]);
  return null;
}

const DOWN: Record<Quality, Quality> = { high: 'medium', medium: 'low', low: 'low' };

export function LabScene({ state, scene, t, v, guided, interactive, onSlow }: { state: ChemTitrationState; scene: SceneState; t: Titration; v: ChemTitrationVariant; guided: boolean; interactive: boolean; onSlow: () => void }) {
  const quality = useLabView((s) => s.quality);
  const mode = useLabView((s) => s.mode);
  const set = useLabView((s) => s.set);
  // Judge the frame rate only once shaders are compiled and textures uploaded.
  const [watch, setWatch] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setWatch(true), 5000);
    return () => clearTimeout(id);
  }, []);
  const meniscusY = STATION[1] + SPOT.jetHeight + buretteY(state.burette ?? 0);
  return (
    <>
      <color attach="background" args={['#dde6ea']} />
      <hemisphereLight args={['#f4f8ff', '#9c8f7a', 0.95]} />
      <ambientLight intensity={0.22} />
      {/* daylight from the west windows, and the ceiling tubes over the benches */}
      <directionalLight position={[-6, 4.2, 1.5]} intensity={1.35} color="#fff2dc" />
      <directionalLight position={[1, 6, 3]} intensity={0.7} color="#ffffff" />
      <Environment intensity={quality === 'low' ? 0.35 : 0.5} />
      <Room />
      <SafetyCorner coatOn={scene.coat} gogglesOn={scene.goggles} />
      <CupboardContents scene={scene} />
      <Station state={state} scene={scene} t={t} v={v} detail={quality !== 'low' || mode !== 'walk'} />
      <Held />
      {import.meta.env.DEV && <DevProbe />}
      <Assistant />
      {guided && <Beacon />}
      {interactive && <DragController t={t} s={state} scene={scene} />}
      <CameraRig meniscusY={meniscusY} />
      {watch && (
        <PerformanceMonitor
          bounds={() => [26, 50]}
          flipflops={3}
          onDecline={() => {
            const q = useLabView.getState().quality;
            if (q === 'low') onSlow();
            else set({ quality: DOWN[q] });
          }}
        />
      )}
    </>
  );
}
