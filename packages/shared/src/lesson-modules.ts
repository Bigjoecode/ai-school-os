import { z } from 'zod';

/**
 * Learning modules: ordered lesson units for a class and subject, made of
 * content steps (notes, videos, pictures, files, links, study materials) and
 * short check-ins. Teachers present them in class from their weekly workbook
 * (classroom mode, with a live check-in students answer on their own devices
 * or a show-of-hands tally), and students work through them at their own pace
 * ("My lessons"). Every check-in adds topic-mastery evidence (source CHECKIN).
 */

export const MODULE_STEP_KINDS = ['NOTE', 'VIDEO', 'IMAGE', 'FILE', 'LINK', 'MATERIAL', 'CHECKIN'] as const;
export type ModuleStepKind = (typeof MODULE_STEP_KINDS)[number];
export const MODULE_STEP_LABELS: Record<ModuleStepKind, string> = {
  NOTE: 'Notes',
  VIDEO: 'Video',
  IMAGE: 'Picture',
  FILE: 'Document',
  LINK: 'Link',
  MATERIAL: 'Study material',
  CHECKIN: 'Check-in',
};

export const CHECKIN_QUESTION_TYPES = ['MCQ', 'TRUE_FALSE', 'SHORT'] as const;
export type CheckInQuestionType = (typeof CHECKIN_QUESTION_TYPES)[number];
export const CHECKIN_TYPE_LABELS: Record<CheckInQuestionType, string> = { MCQ: 'Multiple choice', TRUE_FALSE: 'True or false', SHORT: 'Short answer' };

export const MODULE_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type ModuleStatus = (typeof MODULE_STATUSES)[number];

/** Where a check-in question came from. */
export const CHECKIN_SOURCES = ['TYPED', 'BANK', 'EXAM_BANK', 'AI'] as const;
export type CheckInSource = (typeof CHECKIN_SOURCES)[number];

export const DEFAULT_PASS_MARK = 60;
/** In class: move on when at least this share of the students who answered understood (scored the pass mark). */
export const MOVE_ON_SHARE = 0.7;
export type ClassroomDecision = 'MOVE_ON' | 'RETEACH';
export const classroomSuggestion = (understood: number, responses: number): ClassroomDecision =>
  responses > 0 && understood / responses >= MOVE_ON_SHARE ? 'MOVE_ON' : 'RETEACH';

/** Lower-case, no punctuation, extra spaces or leading article: "  The Nucleus. " → "nucleus". */
export const normaliseAnswer = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9.\-/ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(the|a|an) /, '')
    .replace(/\.+$/, '')
    .trim();

/** Marks a short answer against the accepted answers (numbers compared as numbers). */
export function markShortAnswer(given: string, accepted: string[]): boolean {
  const g = normaliseAnswer(given);
  if (!g) return false;
  return accepted.some((a) => {
    const n = normaliseAnswer(a);
    if (!n) return false;
    const gn = Number(g.replace(/,/g, ''));
    const an = Number(n.replace(/,/g, ''));
    if (g !== '' && Number.isFinite(gn) && Number.isFinite(an) && /^-?[\d.,/]+$/.test(n)) return Math.abs(gn - an) < 1e-9;
    return g === n;
  });
}

// ============================================================ requests

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const optId = () =>
  z
    .string()
    .min(1)
    .nullish()
    .transform((v) => v ?? null);

export const checkInQuestionSchema = z
  .object({
    id: z.string().trim().min(1).max(40).optional(),
    type: z.enum(CHECKIN_QUESTION_TYPES),
    prompt: z.string().trim().min(2, 'Write the question').max(1000),
    options: z.array(z.string().trim().min(1).max(300)).max(6).default([]),
    correctIndex: z.number().int().min(0).max(5).nullish().transform((v) => v ?? null),
    /** Accepted answers for a short-answer question. */
    answers: z.array(z.string().trim().min(1).max(200)).max(6).default([]),
    explanation: text(1000),
    /** Video quiz: seconds into the video where it pauses for this question. */
    at: z.number().min(0).max(36_000).nullish().transform((v) => v ?? null),
    source: z.enum(CHECKIN_SOURCES).default('TYPED'),
    sourceId: z.string().max(60).nullish().transform((v) => v ?? null),
  })
  .superRefine((q, ctx) => {
    if (q.type === 'MCQ') {
      if (q.options.length < 2) ctx.addIssue({ code: 'custom', path: ['options'], message: 'Give at least two options' });
      if (q.correctIndex === null || q.correctIndex >= q.options.length) ctx.addIssue({ code: 'custom', path: ['correctIndex'], message: 'Choose the correct option' });
    }
    if (q.type === 'TRUE_FALSE' && (q.correctIndex === null || q.correctIndex > 1)) ctx.addIssue({ code: 'custom', path: ['correctIndex'], message: 'Choose true or false' });
    if (q.type === 'SHORT' && !q.answers.length) ctx.addIssue({ code: 'custom', path: ['answers'], message: 'Give the accepted answer' });
  })
  .transform((q) => (q.type === 'TRUE_FALSE' ? { ...q, options: ['True', 'False'] } : q.type === 'SHORT' ? { ...q, options: [], correctIndex: null } : { ...q, answers: [] }));
export type CheckInQuestionInput = z.input<typeof checkInQuestionSchema>;
export type CheckInQuestion = z.output<typeof checkInQuestionSchema> & { id: string };

export const moduleStepSchema = z
  .object({
    id: z.string().min(1).max(40).optional(),
    kind: z.enum(MODULE_STEP_KINDS),
    title: z.string().trim().min(1, 'Give the step a title').max(160),
    body: text(50_000),
    fileId: optId(),
    url: text(1000),
    materialId: optId(),
    questions: z.array(checkInQuestionSchema).max(12).default([]),
    passMark: z.number().int().min(1).max(100).nullish().transform((v) => v ?? null),
  })
  .superRefine((s, ctx) => {
    if (s.url && !/^https:\/\/[^\s]+$/i.test(s.url)) ctx.addIssue({ code: 'custom', path: ['url'], message: 'Use a full https:// link' });
    if (s.kind === 'NOTE' && !s.body) ctx.addIssue({ code: 'custom', path: ['body'], message: 'Write the notes' });
    if (s.kind === 'VIDEO' && !s.fileId && !s.url && !s.materialId) ctx.addIssue({ code: 'custom', path: ['url'], message: 'Upload a video, paste a YouTube link or choose a video material' });
    if (s.kind === 'VIDEO' && s.questions.some((q) => q.at === null)) ctx.addIssue({ code: 'custom', path: ['questions'], message: 'Give each video question the time it appears' });
    if (s.kind === 'IMAGE' && !s.fileId) ctx.addIssue({ code: 'custom', path: ['fileId'], message: 'Upload the picture' });
    if (s.kind === 'FILE' && !s.fileId) ctx.addIssue({ code: 'custom', path: ['fileId'], message: 'Upload the document' });
    if (s.kind === 'LINK' && !s.url) ctx.addIssue({ code: 'custom', path: ['url'], message: 'Paste the link' });
    if (s.kind === 'MATERIAL' && !s.materialId) ctx.addIssue({ code: 'custom', path: ['materialId'], message: 'Choose a study material' });
    if (s.kind === 'CHECKIN' && !s.questions.length) ctx.addIssue({ code: 'custom', path: ['questions'], message: 'Add the check-in questions (3 to 5 works well)' });
  });
export type ModuleStepInput = z.input<typeof moduleStepSchema>;

export const moduleSchema = z.object({
  title: z.string().trim().min(2, 'Give the module a title').max(160),
  summary: text(1000),
  subjectId: z.string().min(1, 'Choose the subject'),
  /** The class; leave empty (with classLevelId) for a content-library module. */
  classArmId: optId(),
  classLevelId: optId(),
  topicId: optId(),
  topicName: text(160),
  termId: optId(),
  week: z.number().int().min(1).max(20).nullish().transform((v) => v ?? null),
  schemeWeekId: optId(),
  lessonPlanId: optId(),
  mustPass: z.boolean().default(true),
  passMark: z.number().int().min(1).max(100).default(DEFAULT_PASS_MARK),
});
export type ModuleInput = z.input<typeof moduleSchema>;

export const moduleStepsSchema = z.object({ steps: z.array(moduleStepSchema).max(40) });
export type ModuleStepsInput = z.input<typeof moduleStepsSchema>;

export const modulePublishSchema = z.object({ published: z.boolean(), notify: z.boolean().default(true) });
export const moduleCopySchema = z.object({ classArmId: z.string().min(1, 'Choose the class') });
export const moduleListQuerySchema = z.object({
  classArmId: z.string().optional(),
  subjectId: z.string().optional(),
  status: z.enum(MODULE_STATUSES).optional(),
});
export type ModuleListQuery = z.input<typeof moduleListQuerySchema>;
export const moduleLibraryQuerySchema = z.object({ subjectId: z.string().optional(), classLevelId: z.string().optional(), q: z.string().trim().max(100).optional() });
export type ModuleLibraryQuery = z.input<typeof moduleLibraryQuerySchema>;

export const moduleAiDraftSchema = z
  .object({
    classArmId: z.string().min(1, 'Choose the class'),
    subjectId: z.string().min(1, 'Choose the subject'),
    topicId: optId(),
    topic: text(160),
    schemeWeekId: optId(),
    termId: optId(),
    week: z.number().int().min(1).max(20).nullish().transform((v) => v ?? null),
    guidance: text(600),
  })
  .refine((v) => !!v.topicId || !!v.topic || !!v.schemeWeekId, { path: ['topic'], message: 'Choose or type the topic' });
export type ModuleAiDraftInput = z.input<typeof moduleAiDraftSchema>;

export const checkInAiSchema = z.object({
  subjectId: z.string().min(1),
  classArmId: optId(),
  classLevelId: optId(),
  topicId: optId(),
  topic: z.string().trim().min(2, 'Give the topic').max(160),
  count: z.number().int().min(1).max(8).default(4),
  /** Pin the questions in a video (each gets a time). */
  forVideo: z.boolean().default(false),
});
export type CheckInAiInput = z.input<typeof checkInAiSchema>;

export const moduleBankQuerySchema = z.object({ subjectId: z.string().min(1), classLevelId: z.string().min(1), topicId: z.string().optional(), q: z.string().trim().max(100).optional() });
export type ModuleBankQuery = z.input<typeof moduleBankQuerySchema>;

export const checkInSubmitSchema = z.object({ answers: z.record(z.string(), z.union([z.number().int().min(0).max(5), z.string().max(300)])) });
export type CheckInSubmitInput = z.input<typeof checkInSubmitSchema>;
export const cueAnswerSchema = z.object({ questionId: z.string().min(1), answer: z.union([z.number().int().min(0).max(5), z.string().max(300)]) });
export type CueAnswerInput = z.input<typeof cueAnswerSchema>;

export const joinCodeSchema = z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4,8}$/, 'Type the code on the board') });
export const sessionStartSchema = z.object({ present: z.number().int().min(0).max(500).nullish().transform((v) => v ?? null) });
export const sessionUpdateSchema = z.object({
  currentStepId: z.string().min(1).optional(),
  present: z.number().int().min(0).max(500).nullish(),
});
export const sessionOpenSchema = z.object({ stepId: z.string().min(1) });
export const sessionHandsSchema = z
  .object({
    stepId: z.string().min(1),
    /** Students in the room. */
    present: z.number().int().min(1, 'How many students are in class?').max(500),
    /** Hands up for the right answer, per question (in the step's order). */
    correctCounts: z.array(z.number().int().min(0).max(500)).max(12).default([]),
    /** Or a quick mark per student: got it / not yet. */
    marks: z.array(z.object({ studentId: z.string().min(1), understood: z.boolean() })).max(200).default([]),
  })
  .refine((v) => v.correctCounts.length > 0 || v.marks.length > 0, { path: ['correctCounts'], message: 'Count the hands or mark the students' });
export type SessionHandsInput = z.input<typeof sessionHandsSchema>;
export const sessionDecisionSchema = z.object({ stepId: z.string().min(1), decision: z.enum(['MOVE_ON', 'RETEACH']) });

export const workbookQuerySchema = z.object({
  classArmId: z.string().min(1),
  subjectId: z.string().min(1),
  termId: z.string().optional(),
  week: z.coerce.number().int().min(1).max(20).optional(),
});
export type WorkbookQuery = z.input<typeof workbookQuerySchema>;

// ============================================================ responses

export interface ModuleClassOption {
  classArmId: string;
  label: string;
  classLevelId: string;
  levelName: string;
  subjects: { id: string; name: string }[];
}

export interface ModuleOptions {
  classes: ModuleClassOption[];
  levels: { id: string; name: string }[];
  subjects: { id: string; name: string }[];
  /** Can manage modules for any class (academics.manage / curriculum.manage). */
  manageAll: boolean;
  /** Can publish to the school's content library (academic managers and heads of department). */
  canLibrary: boolean;
  canAi: boolean;
  canLessons: boolean;
  currentTerm: { id: string; name: string } | null;
}

export interface ModuleTopicOption {
  id: string;
  name: string;
  parent: string | null;
  objectives: string[];
}

export interface ModuleStats {
  /** Students in the class. */
  students: number;
  started: number;
  completed: number;
  /** Average of each student's latest check-in scores (%), or null. */
  averageScore: number | null;
  sessions: number;
  lastSessionAt: string | null;
}

export interface ModuleSummary {
  id: string;
  title: string;
  summary: string | null;
  subject: { id: string; name: string };
  classLevel: { id: string; name: string };
  class: { id: string; label: string } | null;
  topic: { id: string | null; name: string } | null;
  termId: string | null;
  week: number | null;
  status: ModuleStatus;
  library: boolean;
  source: 'MANUAL' | 'AI';
  mustPass: boolean;
  passMark: number;
  stepCount: number;
  checkInCount: number;
  videoQuizCount: number;
  createdBy: string | null;
  copiedFrom: string | null;
  updatedAt: string;
  publishedAt: string | null;
  canEdit: boolean;
  stats: ModuleStats | null;
}

export interface ModuleMaterialRef {
  id: string;
  title: string;
  kind: string;
  youtubeId: string | null;
  url: string | null;
  body: string | null;
  file: { name: string; mimeType: string; sizeBytes: number } | null;
}

export interface ModuleStepRow {
  id: string;
  order: number;
  kind: ModuleStepKind;
  title: string;
  body: string | null;
  fileId: string | null;
  mimeType: string | null;
  fileName: string | null;
  url: string | null;
  youtubeId: string | null;
  materialId: string | null;
  material: ModuleMaterialRef | null;
  questions: CheckInQuestion[];
  passMark: number | null;
}

export interface ModuleDetail extends ModuleSummary {
  steps: ModuleStepRow[];
  lessonPlan: { id: string; topic: string } | null;
  schemeWeek: { id: string; week: number; topic: string } | null;
}

/** A question as a student sees it: no answer; options keep their original index as `key`. */
export interface StudentQuestion {
  id: string;
  type: CheckInQuestionType;
  prompt: string;
  options: { key: number; text: string }[];
  at: number | null;
}

export type MyStepState = 'DONE' | 'OPEN' | 'LOCKED';

export interface MyModuleStep {
  id: string;
  order: number;
  kind: ModuleStepKind;
  title: string;
  body: string | null;
  url: string | null;
  youtubeId: string | null;
  mimeType: string | null;
  fileName: string | null;
  hasFile: boolean;
  material: ModuleMaterialRef | null;
  /** Video quiz questions (check-in questions come with each fresh try). */
  cues: StudentQuestion[];
  /** Video quiz: cues already answered, with whether they were right. */
  cuesAnswered: Record<string, boolean>;
  questionCount: number;
  passMark: number;
  state: MyStepState;
  /** Check-ins: the best try so far. */
  best: { percent: number; passed: boolean; tries: number } | null;
}

export type MyModuleStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

export interface MyModuleRow {
  id: string;
  title: string;
  summary: string | null;
  subject: { id: string; name: string };
  topic: string | null;
  week: number | null;
  stepCount: number;
  done: number;
  status: MyModuleStatus;
  currentStepId: string | null;
  lastScore: number | null;
  publishedAt: string | null;
  completedAt: string | null;
}

export interface MyModuleDetail extends MyModuleRow {
  mustPass: boolean;
  passMark: number;
  steps: MyModuleStep[];
  className: string | null;
}

export interface MyModules {
  student: { id: string; name: string; className: string | null };
  modules: MyModuleRow[];
}

export interface CheckInStart {
  attemptId: string;
  questions: StudentQuestion[];
  passMark: number;
  tries: number;
}

export interface CheckInReviewItem {
  questionId: string;
  prompt: string;
  yourAnswer: string | null;
  correctAnswer: string;
  correct: boolean;
  explanation: string | null;
}

export interface CheckInOutcome {
  attemptId: string;
  correct: number;
  total: number;
  percent: number;
  passed: boolean;
  passMark: number;
  mustPass: boolean;
  review: CheckInReviewItem[];
  stepCompleted: boolean;
  moduleCompleted: boolean;
}

export interface CueResult {
  correct: boolean;
  correctAnswer: string;
  explanation: string | null;
  allAnswered: boolean;
}

export interface ModuleResultsStudent {
  studentId: string;
  name: string;
  status: MyModuleStatus;
  done: number;
  lastSeenAt: string | null;
  /** Per check-in step: the latest try and the number of tries (self-paced and in class). */
  checkIns: Record<string, { percent: number; passed: boolean; tries: number }>;
}

export interface ModuleResults {
  module: ModuleSummary;
  steps: { id: string; title: string; kind: ModuleStepKind }[];
  students: ModuleResultsStudent[];
  sessions: SessionSummary[];
}

export interface SessionStepResult {
  /** DEVICES (live check-in), HANDS (show of hands), MARKED (teacher marked each student). */
  mode: 'DEVICES' | 'HANDS' | 'MARKED';
  responses: number;
  understood: number;
  /** Average score (%). */
  percent: number;
  suggestion: ClassroomDecision;
  decision: ClassroomDecision | null;
  rounds: number;
  at: string;
}

export interface SessionSummary {
  id: string;
  moduleId: string;
  moduleTitle: string;
  class: { id: string; label: string };
  status: 'LIVE' | 'ENDED';
  startedAt: string;
  endedAt: string | null;
  present: number | null;
  /** Students who answered at least one check-in (devices or marked), or the hands count. */
  participants: number;
  checkIns: number;
  /** Average understood share across check-ins (0–100), or null. */
  understoodPercent: number | null;
  teacher: string | null;
}

export interface LiveTally {
  stepId: string;
  openedAt: string;
  /** Students in the class list (who could join). */
  classSize: number;
  responses: number;
  understood: number;
  percent: number;
  suggestion: ClassroomDecision;
  perQuestion: { questionId: string; answered: number; correct: number }[];
  respondents: { studentId: string; name: string; percent: number }[];
}

export interface ClassroomSessionView {
  id: string;
  code: string;
  status: 'LIVE' | 'ENDED';
  module: ModuleDetail;
  class: { id: string; label: string };
  students: { id: string; name: string }[];
  currentStepId: string | null;
  openStepId: string | null;
  present: number | null;
  results: Record<string, SessionStepResult>;
  live: LiveTally | null;
  startedAt: string;
  endedAt: string | null;
}

export interface LiveJoin {
  sessionId: string;
  moduleTitle: string;
  subject: string;
  className: string;
}

export interface LiveStudentState {
  sessionId: string;
  status: 'LIVE' | 'ENDED';
  moduleTitle: string;
  subject: string;
  open: { stepId: string; title: string; openedAt: string; attemptId: string; questions: StudentQuestion[] } | null;
  /** This student's answer to the open check-in, once sent. */
  answered: { percent: number; passed: boolean; correct: number; total: number } | null;
}

export interface WorkbookWeek {
  week: number;
  topic: string;
  startsOn: string | null;
}

export interface Workbook {
  class: { id: string; label: string; classLevelId: string };
  subject: { id: string; name: string };
  term: { id: string; name: string; startsOn: string; endsOn: string } | null;
  /** SCHEME = the school's scheme of work; SYLLABUS = suggested from the syllabus order; NONE = nothing to go on. */
  source: 'SCHEME' | 'SYLLABUS' | 'NONE';
  scheme: { id: string; title: string } | null;
  weeks: WorkbookWeek[];
  week: number;
  currentWeek: number | null;
  plan: {
    topic: string;
    schemeWeekId: string | null;
    subtopics: string[];
    objectives: string[];
    activities: string[];
    resources: string[];
    /** The matching syllabus topic (mastery evidence goes here). */
    topicId: string | null;
    topicName: string | null;
  } | null;
  lessonPlans: { id: string; topic: string; date: string | null; status: string; reviewStatus: string; generation: string }[];
  modules: ModuleSummary[];
  materials: { id: string; title: string; kind: string; topic: string | null }[];
  library: ModuleSummary[];
  lastWeek: {
    week: number;
    modules: { id: string; title: string; completed: number; students: number; averageScore: number | null }[];
    sessions: SessionSummary[];
  } | null;
}

export interface ClassModulesSummary {
  modules: ModuleSummary[];
  sessionsThisTerm: number;
}

export interface ClassroomEngagement {
  /** Monday of this week (YYYY-MM-DD). */
  weekStart: string;
  sessions: number;
  classes: number;
  teachers: number;
  /** Students who answered a check-in in class (devices or marked) plus hand counts. */
  participants: number;
  checkInsAnswered: number;
  /** Share of class check-ins where most students understood (0–100), or null. */
  understoodPercent: number | null;
  selfPacedCompletions: number;
  previousWeekSessions: number;
}

export interface ChildModules {
  student: { id: string; name: string; firstName: string };
  modules: MyModuleRow[];
  completed: number;
  total: number;
}
