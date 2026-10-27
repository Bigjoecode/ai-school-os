/**
 * Guided mode's shapes. A lab works out its own steps (from its state) and
 * its own corrections (from what was just recorded); the kit shows them: the
 * checklist, the beacon over `target`, Mrs Ada's tips and the correction card.
 */

export interface GuideStep {
  id: string;
  label: string;
  /** The object to use (a selectable id in the scene), if any. */
  target: string | null;
  /** Why the step matters (shown under the current step and said by the assistant). */
  why: string;
  done: boolean;
  /** Steps that belong together (e.g. one titration run) share a group heading. */
  group?: string;
}

export const currentStep = (steps: GuideStep[]) => steps.find((x) => !x.done) ?? null;

export interface Correction {
  title: string;
  why: string;
  /** A camera preset of the lab to look at. */
  focus?: string;
}

