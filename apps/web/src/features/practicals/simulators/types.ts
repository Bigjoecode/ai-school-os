import type { PracticalMode, SimulatorId, SimulatorStates } from '@aischool/shared';
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
}

export interface SimulatorEntry<Id extends SimulatorId = SimulatorId> {
  id: Id;
  component: LazyExoticComponent<ComponentType<SimulatorProps<Id>>>;
  /** A fresh state for a new attempt. */
  empty: () => SimulatorStates[Id];
  /** Things still missing, shown before hand-in ("You haven't recorded the mean titre"). Empty when complete. */
  missing: (state: SimulatorStates[Id], seed: number) => string[];
}
