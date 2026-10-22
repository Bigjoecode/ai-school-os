import { z } from 'zod';
import { CHEM_TITRATION, chemTitrationStateSchema, type ChemTitrationState } from './simulators/chem-titration';

/**
 * WAEC Practical Academy: a guided lesson for every syllabus topic with
 * practical work, practice on WAEC "alternative to practical" questions and,
 * for the sciences, interactive virtual labs marked against a rubric.
 *
 * The simulator contract (every virtual lab implements it):
 *  - shared  packages/shared/src/simulators/<id>.ts: the SimulatorSpec (rubric),
 *            a pure `<id>Variant(seed)` both sides use for the hidden true values,
 *            the typed state the web submits and its zod schema, and an
 *            `empty<Id>State()`; registered below in SIMULATOR_IDS, SIMULATORS,
 *            SIMULATOR_STATE_SCHEMAS and SimulatorStates.
 *  - API     apps/api/src/practicals/graders/<id>.ts: a SimulatorGrader (deterministic
 *            AUTO marks; AI criteria handed back as text items), registered in graders/index.ts.
 *  - web     apps/web/src/features/practicals/simulators/<id>/index.tsx: a component
 *            taking SimulatorProps, registered in simulators/registry.ts.
 */

export const PRACTICAL_EXAMS = ['WAEC'] as const;
export type PracticalExam = (typeof PRACTICAL_EXAMS)[number];
export const PRACTICAL_KINDS = ['LAB', 'FIELD', 'WORKSHOP', 'STUDIO', 'PERFORMANCE', 'COMPUTER', 'DRAWING'] as const;
export type PracticalKind = (typeof PRACTICAL_KINDS)[number];
export const PRACTICAL_KIND_LABELS: Record<PracticalKind, string> = { LAB: 'Laboratory', FIELD: 'Field work', WORKSHOP: 'Workshop', STUDIO: 'Studio', PERFORMANCE: 'Performance', COMPUTER: 'Computer', DRAWING: 'Drawing' };
export const PRACTICAL_SKILLS = ['measurement', 'observation', 'calculation', 'drawing', 'identification', 'procedure', 'safety', 'graph'] as const;
export type PracticalSkill = (typeof PRACTICAL_SKILLS)[number];

/** Virtual labs. Add an id here when its shared module, API grader and web component exist. */
export const SIMULATOR_IDS = ['chem-titration'] as const;
export type SimulatorId = (typeof SIMULATOR_IDS)[number];
export const isSimulatorId = (x: unknown): x is SimulatorId => typeof x === 'string' && (SIMULATOR_IDS as readonly string[]).includes(x);

/** One line of a lab's marking scheme. AUTO: marked exactly by the grader. AI: a written answer marked by AI against `guide` (never numbers). */
export interface RubricCriterion {
  id: string;
  label: string;
  marks: number;
  how: 'AUTO' | 'AI';
  /** What earns the marks (shown after marking; the AI marks AI criteria against it). */
  guide: string;
}

export interface SimulatorSpec {
  id: SimulatorId;
  /** Subject key (as subjectKey() gives it), e.g. "Chemistry". */
  subject: string;
  title: string;
  /** Syllabus topic names this lab practises (mastery is recorded on the lesson's topic). */
  topicNames: string[];
  /** Exam mode time limit; practice mode is untimed. */
  minutes: number;
  rubric: RubricCriterion[];
}

/** Every simulator's spec. */
export const SIMULATORS: Record<SimulatorId, SimulatorSpec> = {
  'chem-titration': CHEM_TITRATION,
};

/** The state each simulator saves and submits (typed per simulator). */
export interface SimulatorStates {
  'chem-titration': ChemTitrationState;
}
export type SimulatorState<Id extends SimulatorId = SimulatorId> = SimulatorStates[Id];

/** Server-side validation of what the web submits for each simulator. */
export const SIMULATOR_STATE_SCHEMAS: Record<SimulatorId, z.ZodType<unknown>> = {
  'chem-titration': chemTitrationStateSchema,
};

export const rubricTotal = (rubric: RubricCriterion[]) => rubric.reduce((t, c) => t + c.marks, 0);

// ------------------------------------------------------------------ seeded variants

export { SEED_MAX, roundDp, labBetween, labPick, labRandom } from './simulators/seeded';

// ------------------------------------------------------------------ content (prisma/practicals/<exam>/<slug>.json)

export interface PracticalCheckQuestion {
  q: string;
  options: string[];
  answer: number;
  explanation: string;
}
export interface PracticalContent {
  id: string;
  title: string;
  topic: string;
  kind: PracticalKind;
  skills: PracticalSkill[];
  aim: string;
  apparatus: string[];
  materials: string[];
  safety: string[];
  procedure: string[];
  expectedObservations: string;
  dataAndCalculations: string;
  precautions: string[];
  sourcesOfError: string[];
  commonMistakes: string[];
  examTips: string[];
  checkQuestions: PracticalCheckQuestion[];
  simulator: SimulatorId | null;
}
export interface PracticalFile {
  exam: string;
  subject: string;
  practicalPaper: string;
  practicals: PracticalContent[];
}

// ------------------------------------------------------------------ requests

export const PRACTICAL_MODES = ['LAB', 'EXAM'] as const;
export type PracticalMode = (typeof PRACTICAL_MODES)[number];
/** Without WAEC Prep: lessons and quick checks are free; this many practice-mode labs a term; exam mode needs WAEC Prep. */
export const FREE_LABS_PER_TERM = 2;

export const practicalLabStartSchema = z.object({ practicalId: z.string().trim().min(3).max(120), mode: z.enum(PRACTICAL_MODES) });
/** Autosave: the whole state (validated against the simulator's schema on submit; size-capped here). */
export const practicalDraftSchema = z.object({ state: z.record(z.string(), z.unknown()) });
export const practicalCheckSchema = z.object({ answers: z.array(z.number().int().min(-1).max(9)).min(1).max(10) });
export const practicalPracticeSchema = z.object({ questions: z.number().int().min(1).max(5).default(2) });
export const practicalOverrideSchema = z.object({ score: z.number().min(0).max(1000), note: z.string().trim().min(3).max(1000) });

// ------------------------------------------------------------------ views

export interface CriterionScore {
  id: string;
  label: string;
  awarded: number;
  max: number;
  how: 'AUTO' | 'AI';
  /** Why marks were lost (or what earned them). */
  note: string;
}

export interface PracticalStatus {
  /** Quick checks passed (or a lab done). */
  learned: boolean;
  /** Lab attempts and practical-question practice handed in. */
  practised: number;
  /** Best marked lab percent (after any teacher review). */
  best: number | null;
}

export interface PracticalSubjectRow {
  exam: PracticalExam;
  subject: string;
  practicalPaper: string;
  practicals: number;
  labs: number;
  learned: number;
  practised: number;
}

export interface PracticalListItem {
  id: string;
  title: string;
  topic: string;
  topicId: string | null;
  /** Parent syllabus topic when `topic` is a subtopic. */
  parentTopic: string | null;
  kind: PracticalKind;
  skills: PracticalSkill[];
  simulator: SimulatorId | null;
  status: PracticalStatus;
}

export interface PracticalSubjectView {
  exam: PracticalExam;
  subject: string;
  practicalPaper: string;
  practicals: PracticalListItem[];
  /** Published WAEC practical questions in the subject. */
  practicalQuestions: number;
  entitled: boolean;
}

export interface PracticalLabAttemptRow {
  id: string;
  practicalId: string;
  title: string;
  simulatorId: SimulatorId | null;
  mode: PracticalMode;
  startedAt: string;
  submittedAt: string | null;
  score: number | null;
  maxScore: number;
  percent: number | null;
  reviewed: boolean;
}

export interface PracticalLessonView extends Omit<PracticalContent, 'checkQuestions'> {
  exam: PracticalExam;
  subject: string;
  practicalPaper: string;
  topicId: string | null;
  parentTopic: string | null;
  /** Answers are checked on the server. */
  checkQuestions: { q: string; options: string[] }[];
  /** Published WAEC practical questions for this topic (and in the subject). */
  practicalQuestions: { topic: number; subject: number; pastYears: number[] };
  lab: (SimulatorSpec & { maxScore: number }) | null;
  attempts: PracticalLabAttemptRow[];
  status: PracticalStatus;
  access: { entitled: boolean; freeLabsLeft: number; freeLabsPerTerm: number };
}

export interface PracticalCheckResult {
  correct: number;
  total: number;
  passed: boolean;
  items: { correct: boolean; answer: number; explanation: string }[];
}

export interface PracticalResult {
  score: number;
  maxScore: number;
  percent: number;
  /** The score from marking (before a teacher's override). */
  markedScore: number;
  criteria: CriterionScore[];
  feedback: string | null;
  /** Worked solution with the true values of this variant. */
  solution: string[];
  review: { score: number; note: string; by: string; at: string } | null;
  next: { id: string; title: string } | null;
}

export interface PracticalAttemptView<Id extends SimulatorId = SimulatorId> {
  id: string;
  practicalId: string;
  title: string;
  subject: string;
  topic: string | null;
  simulatorId: Id;
  spec: SimulatorSpec;
  mode: PracticalMode;
  seed: number;
  state: SimulatorStates[Id] | null;
  startedAt: string;
  endsAt: string | null;
  submittedAt: string | null;
  serverNow: string;
  result: PracticalResult | null;
}

// ------------------------------------------------------------------ teachers

export interface PracticalClassOption {
  classArmId: string;
  label: string;
  subjects: string[];
}

export interface PracticalTeacherAttemptRow extends PracticalLabAttemptRow {
  studentId: string;
  student: string;
  subject: string;
  kind: 'LAB' | 'QUESTIONS';
}

export interface PracticalClassView {
  classes: PracticalClassOption[];
  classArmId: string | null;
  subject: string | null;
  students: { id: string; name: string; labs: number; questions: number; average: number | null }[];
  attempts: PracticalTeacherAttemptRow[];
  practicals: { practicalId: string; title: string; attempts: number; students: number; average: number | null }[];
  skills: { skill: string; attempts: number; average: number | null }[];
  criteria: { simulatorId: string; id: string; label: string; attempts: number; average: number | null }[];
}

export interface PracticalTeacherAttemptView extends PracticalAttemptView {
  studentId: string;
  student: string;
  canOverride: boolean;
}
