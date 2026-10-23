import { create } from 'zustand';
import type { ApparatusId } from './scene-state';

/**
 * The 3D lab's view state (camera mode, what is hovered / selected / held):
 * shared by the scene inside the canvas and the HUD around it. Nothing here
 * is saved; the attempt's work lives in the simulator state.
 */
export type CameraMode = 'walk' | 'bench' | 'read';
export type BenchFocus = 'bench' | 'burette' | 'flask' | 'pipetting';
export type Quality = 'low' | 'medium' | 'high';

interface LabView {
  mode: CameraMode;
  focus: BenchFocus;
  hover: string | null;
  selected: string | null;
  held: ApparatusId | null;
  /** Reading view: the eye's height above (+) or below (−) the meniscus, in metres. */
  eye: number;
  /** On-screen joystick (−1…1). */
  stick: { x: number; y: number };
  /** Bumped to ask the camera rig to walk back to the start / to the bench. */
  resetTick: number;
  quality: Quality;
  /** Pipette sequence in progress: drawn up to the mark, drained into the flask. */
  pip: 'idle' | 'filled' | 'drained';
  /** The pipetting in progress is for an extra rough titration. */
  pipRough: boolean;
  /** Animations: swirling until (ms timestamp), the last single drop (ms timestamp). */
  swirlUntil: number;
  dropAt: number;
  streaming: boolean;
  /** The short message shown under the hint bar (in place of page toasts, which would cover the lab's buttons). */
  notice: { text: string; tone: Tone; until: number } | null;
  set: (patch: Partial<Omit<LabView, 'set'>>) => void;
}

export const useLabView = create<LabView>((set) => ({
  mode: 'walk',
  focus: 'bench',
  hover: null,
  selected: null,
  held: null,
  eye: 0.03,
  stick: { x: 0, y: 0 },
  resetTick: 0,
  quality: 'high',
  pip: 'idle',
  pipRough: false,
  swirlUntil: 0,
  dropAt: 0,
  streaming: false,
  notice: null,
  set: (patch) => set(patch),
}));

export type Tone = 'info' | 'success' | 'warning' | 'danger';
/** Shows a short message over the lab. */
export function notify(text: string, tone: Tone = 'info', ms = 2400) {
  useLabView.setState({ notice: { text, tone, until: Date.now() + ms } });
}
