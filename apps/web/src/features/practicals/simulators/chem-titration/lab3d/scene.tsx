import type { ChemTitrationState, ChemTitrationVariant } from '@aischool/shared';
import { PerformanceMonitor } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import { PMREMGenerator } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Titration } from '../actions';
import { buretteY } from './apparatus';
import { CameraRig } from './controls';
import { SPOT, STATION } from './layout';
import { Room, SafetyCorner } from './room';
import type { SceneState } from './scene-state';
import { CupboardContents, Held, Station } from './station';
import { useLabView, type Quality } from './store';

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

const DOWN: Record<Quality, Quality> = { high: 'medium', medium: 'low', low: 'low' };

export function LabScene({ state, scene, t, v, onSlow }: { state: ChemTitrationState; scene: SceneState; t: Titration; v: ChemTitrationVariant; onSlow: () => void }) {
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
