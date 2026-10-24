import type { PracticalMode, PracticalResult, SimulatorId, SimulatorStates } from '@aischool/shared';
import type { ComponentType, LazyExoticComponent } from 'react';

/**
 * What the lab host gives a simulator. The simulator is controlled: it renders
 * `state` and reports every change with `onChange(next)` (the host autosaves,
 * debounced). Hidden true values come from the shared `<id>Variant(seed)`.
 */
export interface SimulatorProps<Id extends SimulatorId = SimulatorId> {
  seed: number;
  mode: PracticalMode;
  state: SimulatorStates[Id];
  onChange: (next: SimulatorStates[Id]) => void;
  /** After hand-in (and for a teacher's review): show the recorded work, no controls. */
  readOnly: boolean;
  /** When the attempt opened (ISO): log times are measured from it. */
  startedAt: string;
  /** The lesson the lab was opened from (labs that serve several lessons pick their slide or specimens from it). */
  practicalId?: string;
  /** Timed practicals: when time runs out (ISO). A full-screen 3D view shows its own clock; the host still hands in. */
  endsAt?: string | null;
  /** Hand in from inside a full-screen 3D view (the 3D view shows what is missing and confirms first). */
  onHandIn?: () => void;
  /** Leave the 3D view for the 2D lab (same state, nothing is lost). */
  onUse2d?: () => void;
  /** The attempt on screen (the 3D lab's "Ask Mrs Ada" sends it so a timed practical can be refused). */
  attemptId?: string;
  /** Read-only after marking: the result, for a lab that walks the student through it. */
  result?: PracticalResult | null;
}

export interface SimulatorEntry<Id extends SimulatorId = SimulatorId> {
  id: Id;
  component: LazyExoticComponent<ComponentType<SimulatorProps<Id>>>;
  /** An optional 3D view of the same lab: same state, same marks (lazy, so only devices that open it download three.js). */
  component3d?: LazyExoticComponent<ComponentType<SimulatorProps<Id>>>;
  /** A fresh state for a new attempt. */
  empty: () => SimulatorStates[Id];
  /** Things still missing, shown before hand-in ("You haven't recorded the mean titre"). Empty when complete. */
  missing: (state: SimulatorStates[Id], seed: number) => string[];
}
