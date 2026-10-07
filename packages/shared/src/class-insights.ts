import { z } from 'zod';

/**
 * Teacher learning loop: a class's topic mastery (from MasteryRecord and the
 * MasteryEvidence log) as a heatmap, with insights, an AI or rule-based
 * summary, and one-click remedial work (lesson plan, practice homework,
 * support groups). Mastery is kept apart from official results.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

/** Heatmap colour bands: red below 50, amber 50–69, green 70+, grey for no evidence. */
export type MasteryCellBand = 'LOW' | 'MID' | 'HIGH' | 'NONE';
export const STRUGGLING_BELOW = 50;
export const cellBand = (score: number | null | undefined): MasteryCellBand =>
  score === null || score === undefined ? 'NONE' : score < STRUGGLING_BELOW ? 'LOW' : score < 70 ? 'MID' : 'HIGH';
export const CELL_BAND_LABELS: Record<MasteryCellBand, string> = {
  LOW: 'Struggling (below 50%)',
  MID: 'Developing (50–69%)',
  HIGH: 'Secure (70% and above)',
  NONE: 'No evidence yet',
};

/** Where a piece of mastery evidence came from (MasteryEvidence.source). */
export const INSIGHT_SOURCE_LABELS: Record<string, string> = {
  PRACTICE: 'Exam Academy practice',
  TUTOR: 'AI tutor',
  QUIZ: 'Quizzes',
  CBT: 'Online exams (CBT)',
  HOMEWORK: 'Homework',
  TEST: 'School tests',
  CHECKIN: 'Lesson check-ins',
};

// ============================================================ requests

export const classInsightsQuerySchema = z.object({
  classArmId: z.string().min(1),
  subjectId: z.string().min(1),
  /** Also show syllabus topics with no evidence yet (grey columns). */
  allTopics: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
export type ClassInsightsQuery = z.infer<typeof classInsightsQuerySchema>;

export const classTopicQuerySchema = z.object({ classArmId: z.string().min(1), subjectId: z.string().min(1), topicId: z.string().min(1) });
export const classStudentQuerySchema = z.object({ classArmId: z.string().min(1), subjectId: z.string().min(1), studentId: z.string().min(1) });

export const classInsightsTargetSchema = z.object({ classArmId: z.string().min(1), subjectId: z.string().min(1) });
export type ClassInsightsTarget = z.infer<typeof classInsightsTargetSchema>;

export const remedialLessonSchema = z.object({
  classArmId: z.string().min(1),
  subjectId: z.string().min(1),
  topicId: z.string().min(1),
  date: isoDate.optional(),
  durationMinutes: z.number().int().min(20).max(180).default(40),
  /** Anything else the teacher wants the plan to cover. */
  note: z.string().trim().max(400).optional(),
});
export type RemedialLessonInput = z.infer<typeof remedialLessonSchema>;

export const practiceDraftSchema = z.object({ classArmId: z.string().min(1), subjectId: z.string().min(1), topicId: z.string().min(1) });
export type PracticeDraftInput = z.infer<typeof practiceDraftSchema>;

export const practiceHomeworkSchema = z.object({
  classArmId: z.string().min(1),
  subjectId: z.string().min(1),
  topicId: z.string().min(1),
  title: z.string().trim().min(2).max(160),
  instructions: z.string().trim().min(2).max(3000),
  questions: z.array(z.string().trim().min(2).max(1000)).min(1).max(10),
  dueDate: isoDate,
});
export type PracticeHomeworkInput = z.infer<typeof practiceHomeworkSchema>;

/** AI's structured practice set (validated by the gateway). */
export const aiPracticeSetSchema = z.object({
  title: z.string().describe('Short homework title naming the topic'),
  instructions: z.string().describe('One or two sentences to the students'),
  questions: z.array(z.string()).describe('Exactly five practice questions, easiest first, each answerable in a few lines'),
});

export const aiClassSummarySchema = z.object({
  summary: z.string().describe('One short paragraph (3–5 sentences) with the key numbers'),
  suggestions: z.array(z.string()).describe('2–4 concrete teaching actions for the next week'),
});

// ============================================================ responses

export interface ClassInsightsClass {
  classArmId: string;
  label: string;
  level: 'PRIMARY' | 'JUNIOR' | 'SENIOR';
  subjects: { id: string; name: string }[];
}

export interface ClassInsightsOptions {
  classes: ClassInsightsClass[];
  /** Sees every class (academics.manage / results.publish). */
  manage: boolean;
  canLessons: boolean;
  canHomework: boolean;
  canAi: boolean;
}

export interface ClassMasteryTopic {
  id: string;
  name: string;
  parent: string | null;
  exams: string[];
  /** Any student in the class has evidence on it. */
  evidenced: boolean;
  average: number | null;
  /** Students with evidence. */
  assessed: number;
  /** Students below 50%. */
  struggling: number;
  /** % of assessed students below 50% (null when nobody is assessed). */
  strugglingPct: number | null;
  /** % of the class with no evidence. */
  noEvidencePct: number;
  /** Change in the class average: last 14 days against before (null when too little evidence). */
  trend: number | null;
}

export interface ClassMasteryStudent {
  id: string;
  name: string;
  admissionNumber: string;
  overall: number | null;
  assessed: number;
  /** Topics below 50%. */
  low: number;
  trend: number | null;
}

export interface ClassMasteryCell {
  score: number;
  confidence: number;
  attempts: number;
}

export interface ClassMasteryInsights {
  strugglingTopics: { topicId: string; topic: string; struggling: number; assessed: number; average: number | null }[];
  needSupport: { studentId: string; name: string; low: number; assessed: number; overall: number | null; topics: string[] }[];
  improving: { topicId: string; topic: string; change: number; students: number }[];
}

export interface ClassMastery {
  class: { id: string; label: string; level: 'PRIMARY' | 'JUNIOR' | 'SENIOR' };
  subject: { id: string; name: string; key: string };
  allTopics: boolean;
  topics: ClassMasteryTopic[];
  students: ClassMasteryStudent[];
  /** cells[student][topic], null = no evidence. */
  cells: (ClassMasteryCell | null)[][];
  insights: ClassMasteryInsights;
  totals: { students: number; withEvidence: number; evidenceLast14Days: number; average: number | null; officialAverage: number | null };
}

export interface ClassTopicStudent {
  id: string;
  name: string;
  admissionNumber: string;
  score: number | null;
  confidence: number;
  attempts: number;
  lastEvidenceAt: string | null;
  trend: number | null;
}

export interface ClassTopicDetail {
  topic: { id: string; name: string; parent: string | null; objectives: string[]; exams: string[] };
  classLabel: string;
  subject: string;
  average: number | null;
  assessed: number;
  classSize: number;
  distribution: { band: MasteryCellBand; label: string; count: number }[];
  students: ClassTopicStudent[];
  /** Below 50%, weakest first (for "Group the struggling students"). */
  struggling: ClassTopicStudent[];
  sources: { source: string; label: string; count: number; percentCorrect: number | null }[];
  /** Sub-topics (children) with the class's results on each. */
  subSkills: { topicId: string; name: string; average: number | null; assessed: number; struggling: number }[];
  homework: { id: string; title: string; status: string; dueDate: string }[];
  lessons: { id: string; topic: string; generation: string; reviewStatus: string }[];
}

export interface ClassStudentMastery {
  student: { id: string; name: string; admissionNumber: string };
  classLabel: string;
  subject: string;
  overall: number | null;
  officialPercent: number | null;
  topics: { topicId: string; topic: string; parent: string | null; score: number; confidence: number; attempts: number; lastEvidenceAt: string | null; trend: number | null }[];
  recent: { at: string; topic: string; source: string; scoreAfter: number; correct: number; total: number }[];
}

export interface ClassInsightsSummary {
  text: string;
  suggestions: string[];
  source: 'AI' | 'RULES';
}

export interface PracticeDraft {
  title: string;
  instructions: string;
  questions: string[];
  source: 'AI' | 'TEMPLATE';
}

export interface RemedialLessonResult {
  lessonId: string;
  topic: string;
}

export interface MyClassInsights {
  items: {
    classArmId: string;
    classLabel: string;
    subjectId: string;
    subject: string;
    assessed: number;
    topic: { id: string; name: string; struggling: number; assessed: number; average: number | null } | null;
  }[];
}
