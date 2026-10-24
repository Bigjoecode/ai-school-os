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
  /** Burette tap angle, 0 (closed) to 1 (fully open): < 0.15 closed, < 0.55 dropwise, else a stream. */
  tap: number;
  /** A drag in progress on an object (the camera ignores the pointer meanwhile). */
  drag: DragState | null;
  /** The object the guide points at (beacon and floor path). */
  target: string | null;
  /** For the tour: metres walked and radians looked around since the lab opened. */
  walked: number;
  looked: number;
  /** Objects picked (clicked / tapped) — the tour waits for the first one. */
  picked: number;
  /** The lab assistant's current line. */
  line: { text: string; at: number } | null;
  /** Mrs Ada: at the teacher's desk or behind the student's bench (Learn and demo), what she points at, goggles on. */
  ada: { at: 'desk' | 'bench'; point: string | null; goggles: boolean };
  /** A camera spot at the bench (station-local target), overriding `focus` — the Learn stage and the demo move the camera with it. */
  spot: Spot | null;
  /** The short message shown under the hint bar (in place of page toasts, which would cover the lab's buttons). */
  notice: { text: string; tone: Tone; until: number } | null;
  set: (patch: Partial<Omit<LabView, 'set'>>) => void;
}

export type LabViewState = Omit<LabView, 'set'>;
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
  spot: null,
  ada: { at: 'desk', point: null, goggles: false },
  tap: 0,
  drag: null,
  target: null,
  walked: 0,
  looked: 0,
  picked: 0,
  line: null,
  set: (patch) => set(patch),
}));

export interface Spot {
  target: [number, number, number];
  dist: number;
  pitch: number;
  yaw?: number;
}

export type DragKind = 'carry' | 'flask' | 'tap' | 'swirl' | 'pour' | 'squeeze';
export interface DragState {
  kind: DragKind;
  /** The object being dragged (e.g. the apparatus id being carried). */
  id: string;
  x: number;
  y: number;
  /** Pointer travel so far (px): a drag that hardly moved is a tap. */
  moved: number;
  /** Kind-specific progress: swirl angle, pour tilt 0–1, squeeze 0–1. */
  value: number;
}
export const tapLevel = (tap: number) => (tap < 0.15 ? 'closed' : tap < 0.55 ? 'drops' : 'stream');

export type Tone = 'info' | 'success' | 'warning' | 'danger';
/** Shows a short message over the lab. */
export function notify(text: string, tone: Tone = 'info', ms = 2400) {
  useLabView.setState({ notice: { text, tone, until: Date.now() + ms } });
}
