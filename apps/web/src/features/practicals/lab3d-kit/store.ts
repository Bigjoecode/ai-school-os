import { create } from 'zustand';

/**
 * The 3D lab's view state (camera mode, what is hovered / selected / held):
 * shared by the scene inside the canvas and the HUD around it. Nothing here
 * is saved; the attempt's work lives in the simulator state.
 */
export type CameraMode = 'walk' | 'bench' | 'read';
/** A camera preset at the bench (the lab defines them: e.g. 'bench', 'burette', 'flask'). */
export type BenchFocus = string;
export type Quality = 'low' | 'medium' | 'high';

interface LabView {
  mode: CameraMode;
  focus: BenchFocus;
  hover: string | null;
  selected: string | null;
  /** The object in the student's hands (an apparatus id of the lab). */
  held: string | null;
  /** Reading view: the eye's height above (+) or below (−) the reading line, in metres. */
  eye: number;
  /** On-screen joystick (−1…1). */
  stick: { x: number; y: number };
  /** Bumped to ask the camera rig to walk back to the start / to the bench. */
  resetTick: number;
  quality: Quality;
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
  /** The lab assistant: at the teacher's desk or behind the student's bench (Learn and demo), what she points at, goggles on. */
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
  notice: null,
  spot: null,
  ada: { at: 'desk', point: null, goggles: false },
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
  /** While this spot is on, how far the student may orbit (radians; default: the bench's own limits). */
  limits?: { yaw?: [number, number]; pitch?: [number, number] };
}

/** A drag kind of the lab ('carry' is the kit's own: apparatus from the cupboard to the tray). */
export type DragKind = string;
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

export type Tone = 'info' | 'success' | 'warning' | 'danger';
/** Shows a short message over the lab. */
export function notify(text: string, tone: Tone = 'info', ms = 2400) {
  useLabView.setState({ notice: { text, tone, until: Date.now() + ms } });
}
