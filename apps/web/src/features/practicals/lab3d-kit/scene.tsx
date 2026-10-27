import { PerformanceMonitor } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useState, type ReactNode } from 'react';
import { PMREMGenerator } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Assistant } from './assistant';
import { Beacon } from './beacon';
import { CameraRig, type CameraPresets } from './controls';
import { Room, SafetyCorner, type RoomConfig } from './room';
import { useLabView, type Quality } from './store';
import { objectPosition } from './targets';

/**
 * Everything inside the canvas that every lab shares: lights, the procedural
 * reflection map, the room, the safety corner (coat and goggles on their hooks
 * unless worn), the assistant, the guide's beacon, the camera rig and the
 * frame-rate monitor that lowers the quality tier. The lab's own bench, cupboard
 * contents and drag controller go in `children`.
 */

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

export function KitScene({
  room,
  coatOn,
  gogglesOn,
  presets,
  read,
  guided,
  onSlow,
  assistantSpot,
  children,
}: {
  room?: RoomConfig;
  coatOn: boolean;
  gogglesOn: boolean;
  /** The lab's bench views (see CameraRig). */
  presets: CameraPresets;
  /** The world point the eye-level view reads. */
  read: [number, number, number];
  /** Show the guide's beacon and floor path. */
  guided: boolean;
  onSlow: () => void;
  /** Where the assistant stands at the bench when teaching (see Assistant); default behind the bench, left of centre. */
  assistantSpot?: [number, number];
  children: ReactNode;
}) {
  const quality = useLabView((s) => s.quality);
  const set = useLabView((s) => s.set);
  // Judge the frame rate only once shaders are compiled and textures uploaded.
  const [watch, setWatch] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setWatch(true), 5000);
    return () => clearTimeout(id);
  }, []);
  return (
    <>
      <color attach="background" args={['#dde6ea']} />
      <hemisphereLight args={['#f4f8ff', '#9c8f7a', 0.95]} />
      <ambientLight intensity={0.22} />
      {/* daylight from the west windows, and the ceiling tubes over the benches */}
      <directionalLight position={[-6, 4.2, 1.5]} intensity={1.35} color="#fff2dc" />
      <directionalLight position={[1, 6, 3]} intensity={0.7} color="#ffffff" />
      <Environment intensity={quality === 'low' ? 0.35 : 0.5} />
      <Room config={room} />
      <SafetyCorner coatOn={coatOn} gogglesOn={gogglesOn} poster={room?.doorPoster} />
      {children}
      {import.meta.env.DEV && <DevProbe />}
      <Assistant benchSpot={assistantSpot} />
      {guided && <Beacon />}
      <CameraRig presets={presets} read={read} />
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
