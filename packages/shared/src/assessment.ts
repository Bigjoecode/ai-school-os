import { z } from 'zod';

/**
 * Assessment contracts: question bank, exam papers, scores, results and
 * report cards. Grading and ranking live here so the API, the score sheet and
 * the report card compute them identically.
 */

// ------------------------------------------------------------ grading

export interface AssessmentComponent {
  key: string;
  name: string;
  maxScore: number;
}

export interface GradeBand {
  grade: string;
  min: number;
  remark: string;
  pass: boolean;
}

/** Two continuous assessments and an exam, out of 100. Schools can change this. */
export const DEFAULT_ASSESSMENT_COMPONENTS: AssessmentComponent[] = [
  { key: 'ca1', name: '1st CA', maxScore: 20 },
  { key: 'ca2', name: '2nd CA', maxScore: 20 },
  { key: 'exam', name: 'Exam', maxScore: 60 },
];

/** The WAEC-style nine-point scale most Nigerian secondary schools use. Highest band first. */
export const DEFAULT_GRADING_SCALE: GradeBand[] = [
  { grade: 'A1', min: 75, remark: 'Excellent', pass: true },
  { grade: 'B2', min: 70, remark: 'Very good', pass: true },
  { grade: 'B3', min: 65, remark: 'Good', pass: true },
  { grade: 'C4', min: 60, remark: 'Credit', pass: true },
  { grade: 'C5', min: 55, remark: 'Credit', pass: true },
  { grade: 'C6', min: 50, remark: 'Credit', pass: true },
  { grade: 'D7', min: 45, remark: 'Pass', pass: true },
  { grade: 'E8', min: 40, remark: 'Pass', pass: true },
  { grade: 'F9', min: 0, remark: 'Fail', pass: false },
];

/** The band a percentage falls in. Scales are sorted highest first. */
export function gradeFor(percent: number, scale: GradeBand[] = DEFAULT_GRADING_SCALE): GradeBand {
  const sorted = [...scale].sort((a, b) => b.min - a.min);
  return sorted.find((b) => percent >= b.min) ?? sorted[sorted.length - 1]!;
}

/**
 * Competition ranking ("1224"): equal values share a position and the next
 * position skips. Returns positions in the input order; null values unranked.
 */
export function rank(values: (number | null)[]): (number | null)[] {
  const present = values.filter((v): v is number => v !== null).sort((a, b) => b - a);
  return values.map((v) => (v === null ? null : present.indexOf(v) + 1));
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

export const round1 = (n: number) => Math.round(n * 10) / 10;

// ------------------------------------------------------------ settings

export const assessmentComponentSchema = z.object({
  key: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{1,12}$/, 'Letters, numbers and _ only'),
  name: z.string().trim().min(1).max(30),
  maxScore: z.number().int().min(1).max(100),
});

export const gradeBandSchema = z.object({
  grade: z.string().trim().min(1).max(4),
  min: z.number().min(0).max(100),
  remark: z.string().trim().min(1).max(30),
  pass: z.boolean(),
});

export const assessmentSettingsSchema = z
  .object({
    components: z.array(assessmentComponentSchema).min(1).max(6),
    gradingScale: z.array(gradeBandSchema).min(2).max(12),
  })
  .refine((v) => v.components.reduce((n, c) => n + c.maxScore, 0) === 100, {
    message: 'Component maximums must add up to 100',
    path: ['components'],
  })
  .refine((v) => new Set(v.components.map((c) => c.key)).size === v.components.length, {
    message: 'Each component needs a different key',
    path: ['components'],
  })
  .refine((v) => v.gradingScale.some((b) => b.min === 0), {
    message: 'The lowest band must start at 0',
    path: ['gradingScale'],
  });
export type AssessmentSettings = z.infer<typeof assessmentSettingsSchema>;

// ------------------------------------------------------------ questions

export const QUESTION_TYPES = ['MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER', 'THEORY'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];
export const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export const QUESTION_STATUSES = ['DRAFT', 'APPROVED', 'RETIRED'] as const;
export const OBJECTIVE_TYPES: QuestionType[] = ['MULTIPLE_CHOICE', 'TRUE_FALSE'];

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  MULTIPLE_CHOICE: 'Multiple choice',
  TRUE_FALSE: 'True / false',
  SHORT_ANSWER: 'Short answer',
  THEORY: 'Theory',
};

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

/** The fields of a question, without the cross-field checks (use for partial updates). */
export const questionBaseSchema = z.object({
    subjectId: z.string().min(1),
    classLevelId: z.string().min(1),
    topic: z.string().trim().min(1).max(200),
    type: z.enum(QUESTION_TYPES),
    difficulty: z.enum(DIFFICULTIES).default('MEDIUM'),
    stem: z.string().trim().min(3).max(4000),
    options: z.array(z.string().trim().min(1).max(500)).max(6).default([]),
    correctIndex: z.number().int().min(0).max(5).nullable().optional(),
    answer: optionalText(4000),
    markingGuide: optionalText(4000),
    marks: z.number().int().min(1).max(50).default(1),
    status: z.enum(QUESTION_STATUSES).default('DRAFT'),
});

export const questionSchema = questionBaseSchema.superRefine((q, ctx) => {
    if (q.type === 'MULTIPLE_CHOICE' && (q.options.length < 3 || q.options.length > 6)) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Give 3 to 6 options' });
    }
    if (q.type === 'TRUE_FALSE' && q.options.length !== 2) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'True/false needs exactly two options' });
    }
    const objective = q.type === 'MULTIPLE_CHOICE' || q.type === 'TRUE_FALSE';
    if (objective && (q.correctIndex == null || q.correctIndex >= q.options.length)) {
      ctx.addIssue({ code: 'custom', path: ['correctIndex'], message: 'Mark the correct option' });
    }
    if (!objective && !q.answer) {
      ctx.addIssue({ code: 'custom', path: ['answer'], message: 'Give a model answer or key points' });
    }
  });
export type QuestionInput = z.infer<typeof questionSchema>;

export const questionListQuerySchema = z.object({
  subjectId: z.string().optional(),
  classLevelId: z.string().optional(),
  topic: z.string().trim().max(200).optional(),
  type: z.enum(QUESTION_TYPES).optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  status: z.enum(QUESTION_STATUSES).optional(),
  aiJobId: z.string().optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type QuestionListQuery = z.infer<typeof questionListQuerySchema>;

const count = (max: number) => z.number().int().min(0).max(max).default(0);
export const questionCountsSchema = z.object({
  multipleChoice: count(40),
  trueFalse: count(20),
  shortAnswer: count(20),
  theory: count(10),
});
export type QuestionCounts = z.infer<typeof questionCountsSchema>;
const totalOf = (c: QuestionCounts) => c.multipleChoice + c.trueFalse + c.shortAnswer + c.theory;

export const generateQuestionsSchema = z
  .object({
    subjectId: z.string().min(1),
    classLevelId: z.string().min(1),
    topic: z.string().trim().min(2).max(200),
    counts: questionCountsSchema,
    difficulty: z.enum(['MIXED', ...DIFFICULTIES]).default('MIXED'),
    guidance: optionalText(1500),
  })
  .refine((v) => totalOf(v.counts) >= 1 && totalOf(v.counts) <= 40, {
    message: 'Ask for between 1 and 40 questions',
    path: ['counts'],
  });
export type GenerateQuestionsInput = z.infer<typeof generateQuestionsSchema>;

/** What the AI must return for a batch of questions. */
export const aiQuestionSetSchema = z.object({
  questions: z.array(
    z.object({
      type: z.enum(QUESTION_TYPES),
      difficulty: z.enum(DIFFICULTIES),
      stem: z.string(),
      options: z.array(z.string()),
      correctIndex: z.number().int().nullable(),
      answer: z.string(),
      markingGuide: z.string(),
      marks: z.number().int(),
    }),
  ),
});
export type AiQuestionSet = z.infer<typeof aiQuestionSetSchema>;

export const bulkQuestionStatusSchema = z.object({
  ids: z.array(z.string()).min(1).max(200),
  status: z.enum(QUESTION_STATUSES),
});

// ------------------------------------------------------------ exam papers

export const PAPER_STATUSES = ['DRAFT', 'FINAL'] as const;

export const buildPaperSchema = z
  .object({
    subjectId: z.string().min(1),
    classLevelId: z.string().min(1),
    termId: z.string().min(1),
    componentKey: z.string().min(1),
    title: optionalText(160),
    instructions: optionalText(2000),
    durationMinutes: z.number().int().min(10).max(240).default(60),
    /** Only questions on these topics (empty = any topic). */
    topics: z.array(z.string()).max(30).default([]),
    counts: questionCountsSchema,
    difficulty: z.enum(['MIXED', ...DIFFICULTIES]).default('MIXED'),
  })
  .refine((v) => totalOf(v.counts) >= 1, { message: 'Pick at least one question', path: ['counts'] });
export type BuildPaperInput = z.infer<typeof buildPaperSchema>;

export const updatePaperSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  instructions: z.string().trim().max(2000).optional(),
  durationMinutes: z.number().int().min(10).max(240).optional(),
  status: z.enum(PAPER_STATUSES).optional(),
  /** Replaces the paper's questions, in this order. */
  questionIds: z.array(z.string()).max(100).optional(),
});
export type UpdatePaperInput = z.infer<typeof updatePaperSchema>;

// ------------------------------------------------------------ scores & reports

export const scoreSheetQuerySchema = z.object({
  classArmId: z.string().min(1),
  subjectId: z.string().min(1),
  termId: z.string().min(1),
});
export type ScoreSheetQuery = z.infer<typeof scoreSheetQuerySchema>;

export const saveScoresSchema = scoreSheetQuerySchema.extend({
  entries: z
    .array(
      z.object({
        studentId: z.string().min(1),
        componentKey: z.string().min(1),
        /** null clears the mark. */
        score: z.number().min(0).max(100).nullable(),
      }),
    )
    .min(1)
    .max(3000),
});
export type SaveScoresInput = z.infer<typeof saveScoresSchema>;

export const classTermQuerySchema = z.object({
  classArmId: z.string().min(1),
  termId: z.string().min(1),
});
export type ClassTermQuery = z.infer<typeof classTermQuerySchema>;

export const updateReportCardSchema = z.object({
  teacherRemark: z.string().trim().max(1000).optional(),
  principalRemark: z.string().trim().max(1000).optional(),
});
export type UpdateReportCardInput = z.infer<typeof updateReportCardSchema>;

export const generateRemarksSchema = classTermQuerySchema.extend({
  /** Also replace remarks a teacher already wrote. */
  overwrite: z.boolean().default(false),
});
export type GenerateRemarksInput = z.infer<typeof generateRemarksSchema>;

export const publishReportsSchema = classTermQuerySchema.extend({
  publish: z.boolean().default(true),
});
export type PublishReportsInput = z.infer<typeof publishReportsSchema>;

/** What the AI must return when drafting a class's report-card remarks. */
export const aiRemarksSchema = z.object({
  remarks: z.array(z.object({ studentRef: z.string(), remark: z.string() })),
});

// ------------------------------------------------------------ responses

interface Ref {
  id: string;
  name: string;
}

export interface QuestionRow {
  id: string;
  subject: Ref & { code: string };
  classLevel: Ref;
  topic: string;
  type: QuestionType;
  difficulty: Difficulty;
  stem: string;
  options: string[];
  correctIndex: number | null;
  answer: string | null;
  markingGuide: string | null;
  marks: number;
  status: (typeof QUESTION_STATUSES)[number];
  source: 'MANUAL' | 'AI';
  usedInPapers: number;
  updatedAt: string;
}

export interface QuestionTopicCount {
  topic: string;
  total: number;
  approved: number;
}

export interface AiJobView {
  id: string;
  kind: string;
  state: 'QUEUED' | 'RUNNING' | 'FAILED' | 'DONE';
  error: string | null;
  result: Record<string, unknown> | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface PaperSummary {
  id: string;
  title: string;
  subject: Ref & { code: string };
  classLevel: Ref;
  term: Ref & { sessionName: string };
  component: AssessmentComponent | null;
  durationMinutes: number;
  status: (typeof PAPER_STATUSES)[number];
  questionCount: number;
  totalMarks: number;
  updatedAt: string;
}

export interface PaperDetail extends PaperSummary {
  instructions: string | null;
  sections: {
    key: 'A' | 'B';
    title: string;
    questions: (QuestionRow & { number: number })[];
  }[];
  schoolName: string;
}

export interface BuildPaperResult {
  paper: PaperDetail;
  /** Requested but not available in the approved bank. */
  shortfall: Partial<Record<keyof QuestionCounts, number>>;
}

export interface ScoreSheet {
  classArm: Ref & { levelName: string };
  subject: Ref & { code: string };
  term: Ref & { sessionName: string };
  components: AssessmentComponent[];
  gradingScale: GradeBand[];
  canEdit: boolean;
  students: {
    id: string;
    name: string;
    admissionNumber: string;
    scores: Record<string, number | null>;
    /** Raw marks over the components assessed so far (missing marks count as 0). */
    total: number | null;
    /** What `total` is out of: the maximums of the components assessed so far. */
    outOf: number;
    /** total / outOf as a percentage — grades and positions use this. */
    percent: number | null;
    grade: string | null;
    position: number | null;
  }[];
}

/** Totals and averages are percentages of what has been assessed so far. */
export interface Broadsheet {
  classArm: Ref & { levelName: string };
  term: Ref & { sessionName: string };
  subjects: (Ref & { code: string })[];
  rows: {
    student: { id: string; name: string; admissionNumber: string };
    totals: Record<string, number | null>;
    subjectsTaken: number;
    average: number | null;
    position: number | null;
  }[];
  subjectAverages: Record<string, number | null>;
  classAverage: number | null;
}

export interface ReportCardRow {
  studentId: string;
  name: string;
  admissionNumber: string;
  subjectsTaken: number;
  average: number | null;
  position: number | null;
  hasTeacherRemark: boolean;
  hasPrincipalRemark: boolean;
  status: 'DRAFT' | 'PUBLISHED';
}

export interface ReportCardView {
  school: { name: string; motto: string | null; address: string | null; logoUrl: string | null };
  student: { id: string; name: string; admissionNumber: string; gender: 'MALE' | 'FEMALE' };
  classArm: Ref & { levelName: string; classTeacher: string | null };
  term: Ref & { sessionName: string; startsOn: string; endsOn: string };
  components: AssessmentComponent[];
  gradingScale: GradeBand[];
  subjects: {
    subject: Ref & { code: string };
    scores: Record<string, number | null>;
    total: number | null;
    outOf: number;
    percent: number | null;
    complete: boolean;
    grade: string | null;
    remark: string | null;
    position: number | null;
    classAverage: number | null;
    highest: number | null;
    lowest: number | null;
  }[];
  summary: {
    subjectsTaken: number;
    totalScore: number;
    average: number | null;
    position: number | null;
    classSize: number;
    classAverage: number | null;
  };
  teacherRemark: string | null;
  remarkSource: 'MANUAL' | 'AI';
  principalRemark: string | null;
  /** The signed-in user is this class's teacher or manages results. */
  canEditTeacherRemark: boolean;
  /** The signed-in user manages results (principal and similar). */
  canEditPrincipalRemark: boolean;
  status: 'DRAFT' | 'PUBLISHED';
  publishedAt: string | null;
}

/** Statistics are on percentages of what has been assessed so far. */
export interface SubjectAnalysis {
  subject: Ref & { code: string };
  entered: number;
  mean: number | null;
  median: number | null;
  highest: number | null;
  lowest: number | null;
  passRate: number | null;
  distribution: Record<string, number>;
  componentMeans: Record<string, number | null>;
}

export interface ClassAnalysis {
  classArm: Ref & { levelName: string };
  term: Ref & { sessionName: string };
  students: number;
  overall: { mean: number | null; passRate: number | null; completeness: number };
  subjects: SubjectAnalysis[];
  topStudents: { id: string; name: string; average: number }[];
  atRisk: { id: string; name: string; average: number | null; failedSubjects: string[] }[];
}

export interface AnalysisInsight {
  text: string;
  provider: string;
  model: string;
}
