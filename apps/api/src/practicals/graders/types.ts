import type { CriterionScore, SimulatorId, SimulatorStates } from '@aischool/shared';

/**
 * A written answer for an AI criterion. The AI judges only these (against the
 * criterion's guide); numbers are never left to it. `keywords` is the
 * deterministic stand-in used when AI marking can't run (no allowance, no
 * provider): each group is one point, any word of a group earns it, `need`
 * points earn full marks.
 */
export interface AiItem {
  criterionId: string;
  /** What the student was asked, with any context the marker needs (e.g. the indicator used). */
  question: string;
  answer: string;
  /** The specific points that earn marks for this attempt (defaults to the rubric guide). */
  guide?: string;
  keywords: string[][];
  need: number;
}

export interface GraderOutput {
  /** One score for every AUTO criterion of the simulator's rubric. */
  auto: CriterionScore[];
  /** One item for every AI criterion of the rubric. */
  ai: AiItem[];
  /** The worked solution with this variant's true values. */
  solution: string[];
  /** Short facts about the attempt for the feedback paragraph. */
  facts: string[];
}

/** Marks one simulator's submitted state. Must be pure and deterministic (same state + seed → same marks). */
export interface SimulatorGrader<Id extends SimulatorId = SimulatorId> {
  id: Id;
  grade(state: SimulatorStates[Id], seed: number): GraderOutput;
}
