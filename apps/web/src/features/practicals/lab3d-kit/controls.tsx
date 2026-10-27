import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Euler, MathUtils, Matrix4, Quaternion, Vector3, type PerspectiveCamera } from 'three';
import { cn } from '@/lib/utils';
import { BENCH_STAND, EYE, START, STATION, collide } from './layout';
import { useLabView, type BenchFocus, type CameraMode, type Spot } from './store';

/**
 * The camera: first-person walking (WASD / arrows / joystick, drag to look),
 * the bench view (orbit within limits, zoom, the lab's presets) and the
 * eye-level reading view (the eye moves up and down past the line being read,
 * e.g. a meniscus). Mode changes glide in 0.7 s.
 */

/** The whole bench: the preset every lab has (named 'bench'). */
export const BENCH_PRESET: Spot = { target: [0.2, 0.14, -0.06], dist: 1.0, pitch: 0.62 };
/** Camera presets at the bench, by name (station-local targets). A lab passes its own; 'bench' is always there. */
export type CameraPresets = Record<BenchFocus, Spot>;
const FOV: Record<CameraMode, number> = { walk: 62, bench: 50, read: 26 };
const WALK_SPEED = 1.7;
const EYE_RANGE = 0.05;
/** Portrait phones: widen the view (walking) or step back (bench) so the same width of the room stays in shot. */
const portrait = (aspect: number) => MathUtils.clamp(1.15 / aspect, 1, 1.7);
/** A bench spot may ask for a narrower view (`Spot.fov`, degrees): a close look at small things. */
const fovFor = (mode: CameraMode, aspect: number, spot?: Spot | null) => (mode === 'read' ? FOV.read : Math.min(80, (mode === 'bench' && spot?.fov ? spot.fov : FOV[mode]) * Math.sqrt(portrait(aspect))));
/** Adds to the tour's walked / looked counters (the store is only touched every 0.25 so the HUD doesn't re-render each frame). */
const pending = { walked: 0, looked: 0 };
function bump(key: 'walked' | 'looked', d: number) {
  pending[key] += d;
  if (pending[key] < 0.25) return;
  useLabView.setState((v) => ({ [key]: v[key] + pending[key] }));
  pending[key] = 0;
}
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * `presets`: the lab's bench views (station-local). `read`: the eye-level
 * reading view — the world point read (e.g. the bottom of a meniscus); the eye
 * sits 13 cm in front of it (+z) and moves up and down with `eye`.
 */
export function CameraRig({ presets, read }: { presets: CameraPresets; read: [number, number, number] }) {
  const FOCUS: CameraPresets = { bench: BENCH_PRESET, ...presets };
  const focusOf = (f: BenchFocus) => FOCUS[f] ?? BENCH_PRESET;
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const st = useRef({
    x: START.x,
    z: START.z,
    yaw: START.yaw,
    pitch: -0.1,
    oYaw: 0.12,
    oPitch: BENCH_PRESET.pitch,
    dist: BENCH_PRESET.dist,
    trans: 1,
    mode: 'walk' as CameraMode,
    focus: 'bench' as BenchFocus,
    reset: 0,
    spotKey: '',
    keys: new Set<string>(),
    fromP: new Vector3(),
    fromQ: new Quaternion(),
    fromFov: FOV.walk,
  });
  const tmp = useRef({ p: new Vector3(), q: new Quaternion(), e: new Euler(0, 0, 0, 'YXZ'), look: new Vector3() });

  // Drag to look / orbit / move the eye; pinch and wheel to zoom.
  useEffect(() => {
    const el = gl.domElement;
    const pts = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    const down = (e: PointerEvent) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      }
    };
    const move = (e: PointerEvent) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      if (useLabView.getState().drag) {
        p.x = e.clientX;
        p.y = e.clientY;
        return;
      }
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      const s = st.current;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        if (pinch) zoom((pinch - d) * 0.004);
        pinch = d;
        return;
      }
      const k = e.pointerType === 'touch' ? 0.006 : 0.0045;
      if (s.mode === 'walk') {
        s.yaw -= dx * k;
        s.pitch = MathUtils.clamp(s.pitch - dy * k, -1.1, 1.0);
        bump('looked', Math.abs(dx * k) + Math.abs(dy * k));
      } else if (s.mode === 'bench') {
        const lim = useLabView.getState().spot?.limits;
        s.oYaw = MathUtils.clamp(s.oYaw - dx * k, ...(lim?.yaw ?? [-0.95, 0.95]));
        s.oPitch = MathUtils.clamp(s.oPitch + dy * k, ...(lim?.pitch ?? [-0.2, 1.15]));
      } else {
        const { eye, set } = useLabView.getState();
        set({ eye: MathUtils.clamp(eye - dy * 0.00025, -EYE_RANGE, EYE_RANGE) });
      }
    };
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      pinch = 0;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (st.current.mode === 'read') {
        const { eye, set } = useLabView.getState();
        set({ eye: MathUtils.clamp(eye - e.deltaY * 0.00005, -EYE_RANGE, EYE_RANGE) });
      } else zoom(e.deltaY * 0.001);
    };
    const zoom = (f: number) => {
      const s = st.current;
      if (s.mode === 'bench') s.dist = MathUtils.clamp(s.dist * (1 + f), 0.22, 1.7);
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
    };
  }, [gl]);

  // Keyboard: walking, orbiting, the reading eye.
  useEffect(() => {
    const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    const down = (e: KeyboardEvent) => {
      if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const s = st.current;
      const key = e.key.toLowerCase();
      if (s.mode === 'walk' && ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        s.keys.add(key);
        e.preventDefault();
      } else if (s.mode === 'bench') {
        const lim = useLabView.getState().spot?.limits;
        const yl = lim?.yaw ?? [-0.95, 0.95];
        const pl = lim?.pitch ?? [-0.2, 1.15];
        if (key === 'arrowleft') s.oYaw = MathUtils.clamp(s.oYaw + 0.08, ...yl);
        else if (key === 'arrowright') s.oYaw = MathUtils.clamp(s.oYaw - 0.08, ...yl);
        else if (key === 'arrowup') s.oPitch = MathUtils.clamp(s.oPitch + 0.06, ...pl);
        else if (key === 'arrowdown') s.oPitch = MathUtils.clamp(s.oPitch - 0.06, ...pl);
        else if (key === '+' || key === '=') s.dist = MathUtils.clamp(s.dist * 0.9, 0.22, 1.7);
        else if (key === '-') s.dist = MathUtils.clamp(s.dist * 1.1, 0.22, 1.7);
        else return;
        e.preventDefault();
      } else if (s.mode === 'read' && (key === 'arrowup' || key === 'arrowdown')) {
        const { eye, set } = useLabView.getState();
        set({ eye: MathUtils.clamp(eye + (key === 'arrowup' ? 0.002 : -0.002), -EYE_RANGE, EYE_RANGE) });
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => st.current.keys.delete(e.key.toLowerCase());
    const blur = () => st.current.keys.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const s = st.current;
    const view = useLabView.getState();
    const { p, q, e, look } = tmp.current;

    if (view.resetTick !== s.reset) {
      s.reset = view.resetTick;
      Object.assign(s, { x: START.x, z: START.z, yaw: START.yaw, pitch: -0.1 });
    }
    if (view.focus !== s.focus) {
      s.focus = view.focus;
      s.dist = focusOf(view.focus).dist;
      s.oPitch = focusOf(view.focus).pitch;
      s.oYaw = 0.1;
      startTransition();
    }
    const spotKey = view.spot ? JSON.stringify(view.spot) : '';
    if (spotKey !== s.spotKey) {
      s.spotKey = spotKey;
      const sp = view.spot ?? focusOf(s.focus);
      s.dist = sp.dist;
      s.oPitch = sp.pitch;
      s.oYaw = view.spot?.yaw ?? 0.1;
      startTransition();
    }
    if (view.mode !== s.mode) {
      // Leaving the bench on foot: stand where the student was sitting, facing the bench.
      if (view.mode === 'walk' && s.mode !== 'walk') Object.assign(s, { x: BENCH_STAND[0], z: BENCH_STAND[1], yaw: 0, pitch: -0.35 });
      s.mode = view.mode;
      startTransition();
    }

    // The pose this mode wants.
    if (s.mode === 'walk') {
      const k = s.keys;
      let f = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0) - view.stick.y;
      let r = (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0) + view.stick.x;
      if (k.has('arrowleft')) s.yaw += dt * 1.8;
      if (k.has('arrowright')) s.yaw -= dt * 1.8;
      if (k.has('arrowleft') || k.has('arrowright')) bump('looked', dt * 1.8);
      const len = Math.hypot(f, r);
      if (len > 1) {
        f /= len;
        r /= len;
      }
      if (len > 0.02) {
        const sin = Math.sin(s.yaw);
        const cos = Math.cos(s.yaw);
        const dx = (-sin * f + cos * r) * WALK_SPEED * dt;
        const dz = (-cos * f - sin * r) * WALK_SPEED * dt;
        const [nx, nz] = collide(s.x, s.z, dx, dz);
        bump('walked', Math.hypot(nx - s.x, nz - s.z));
        [s.x, s.z] = [nx, nz];
      }
      p.set(s.x, EYE, s.z);
      q.setFromEuler(e.set(s.pitch, s.yaw, 0, 'YXZ'));
    } else if (s.mode === 'bench') {
      const fc = view.spot ?? focusOf(s.focus);
      look.set(STATION[0] + fc.target[0], STATION[1] + fc.target[1], STATION[2] + fc.target[2]);
      p.set(Math.sin(s.oYaw) * Math.cos(s.oPitch), Math.sin(s.oPitch), Math.cos(s.oYaw) * Math.cos(s.oPitch)).multiplyScalar(s.dist * portrait(camera.aspect)).add(look);
      q.setFromRotationMatrix(m4.lookAt(p, look, UP));
    } else {
      look.set(read[0], read[1], read[2]);
      p.set(look.x, read[1] + view.eye, look.z + 0.13);
      q.setFromRotationMatrix(m4.lookAt(p, look, UP));
    }

    // Glide between modes.
    if (s.trans < 1) {
      s.trans = Math.min(1, s.trans + dt / 0.7);
      const k = ease(s.trans);
      camera.position.lerpVectors(s.fromP, p, k);
      camera.quaternion.slerpQuaternions(s.fromQ, q, k);
      camera.fov = MathUtils.lerp(s.fromFov, fovFor(s.mode, camera.aspect, view.spot), k);
    } else {
      camera.position.copy(p);
      camera.quaternion.copy(q);
      camera.fov = fovFor(s.mode, camera.aspect, view.spot);
    }
    const near = s.mode === 'read' ? 0.004 : s.mode === 'bench' ? 0.01 : 0.03;
    if (camera.near !== near || Math.abs(camera.fov - (camera.userData.fov ?? 0)) > 1e-4) {
      camera.near = near;
      camera.userData.fov = camera.fov;
      camera.updateProjectionMatrix();
    }
  });

  function startTransition() {
    const s = st.current;
    s.fromP.copy(camera.position);
    s.fromQ.copy(camera.quaternion);
    s.fromFov = camera.fov;
    s.trans = 0;
  }
  return null;
}
const UP = new Vector3(0, 1, 0);
const m4 = new Matrix4();

/** On-screen joystick for walking on touch screens. */
export function Joystick({ className }: { className?: string }) {
  const set = useLabView((s) => s.set);
  const knob = useRef<HTMLDivElement>(null);
  const base = useRef<HTMLDivElement>(null);
  const R = 46;
  const moveTo = (e: React.PointerEvent) => {
    const b = base.current!.getBoundingClientRect();
    let x = e.clientX - (b.left + b.width / 2);
    let y = e.clientY - (b.top + b.height / 2);
    const len = Math.hypot(x, y);
    if (len > R) {
      x = (x / len) * R;
      y = (y / len) * R;
    }
    if (knob.current) knob.current.style.transform = `translate(${x}px, ${y}px)`;
    set({ stick: { x: x / R, y: y / R } });
  };
  const release = () => {
    if (knob.current) knob.current.style.transform = '';
    set({ stick: { x: 0, y: 0 } });
  };
  return (
    <div
      ref={base}
      className={cn('relative grid size-[120px] touch-none select-none place-items-center rounded-full border border-white/30 bg-black/25 backdrop-blur-sm', className)}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        moveTo(e);
      }}
      onPointerMove={(e) => e.buttons && moveTo(e)}
      onPointerUp={release}
      onPointerCancel={release}
      role="application"
      aria-label="Walk joystick: drag to walk"
    >
      <div ref={knob} className="size-12 rounded-full border border-white/50 bg-white/70 shadow-lg" />
    </div>
  );
}
