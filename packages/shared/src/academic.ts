import { z } from 'zod';

/**
 * Academic engine contracts: Curriculum → Scheme of Work → Lesson Plan.
 *
 * The `ai*Schema` objects are the exact shapes the AI must return. The API
 * hands them to the model as a structured-output schema and validates the
 * reply against them before anything is saved, so generated content lands in
 * the same columns a teacher would fill by hand.
 */

const text = (max: number) => z.string().trim().min(1).max(max);
const list = z.array(z.string().trim().min(1).max(400)).max(12);
const guidance = z
  .string()
  .trim()
  .max(1500)
  .optional()
  .transform((v) => (v ? v : undefined));
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const CONTENT_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export const LESSON_STATUSES = ['DRAFT', 'READY', 'DELIVERED'] as const;
export type GenerationState = 'NONE' | 'QUEUED' | 'RUNNING' | 'FAILED' | 'DONE';

// ------------------------------------------------------------ AI outputs

export const aiCurriculumWeekSchema = z.object({
  topic: z.string(),
  subtopics: z.array(z.string()),
  objectives: z.array(z.string()),
  activities: z.array(z.string()),
  resources: z.array(z.string()),
  assessment: z.array(z.string()),
});

export const aiCurriculumTermSchema = z.object({
  termSummary: z.string(),
  weeks: z.array(aiCurriculumWeekSchema),
});
export type AiCurriculumTerm = z.infer<typeof aiCurriculumTermSchema>;

export const aiSchemeSchema = z.object({
  weeks: z.array(
    z.object({
      topic: z.string(),
      subtopics: z.array(z.string()),
      objectives: z.array(z.string()),
      activities: z.array(z.string()),
      resources: z.array(z.string()),
      evaluation: z.array(z.string()),
    }),
  ),
});
export type AiScheme = z.infer<typeof aiSchemeSchema>;

export const lessonStepSchema = z.object({
  title: z.string(),
  minutes: z.number().int(),
  teacherActivity: z.string(),
  learnerActivity: z.string(),
});
export type LessonStep = z.infer<typeof lessonStepSchema>;

export const differentiationSchema = z.object({
  support: z.string(),
  core: z.string(),
  stretch: z.string(),
});
export type Differentiation = z.infer<typeof differentiationSchema>;

export const aiLessonSchema = z.object({
  topic: z.string(),
  objectives: z.array(z.string()),
  priorKnowledge: z.string(),
  materials: z.array(z.string()),
  steps: z.array(lessonStepSchema),
  differentiation: differentiationSchema,
  assessment: z.array(z.string()),
  homework: z.string(),
});
export type AiLesson = z.infer<typeof aiLessonSchema>;

// ------------------------------------------------------------ requests

export const generateCurriculumSchema = z.object({
  subjectId: z.string().min(1),
  classLevelId: z.string().min(1),
  weeksPerTerm: z.number().int().min(6).max(14).default(11),
  guidance,
});
export type GenerateCurriculumInput = z.infer<typeof generateCurriculumSchema>;

export const createCurriculumSchema = z.object({
  subjectId: z.string().min(1),
  classLevelId: z.string().min(1),
  weeksPerTerm: z.number().int().min(6).max(14).default(11),
  title: text(160).optional(),
});
export type CreateCurriculumInput = z.infer<typeof createCurriculumSchema>;

export const updateCurriculumSchema = z.object({
  title: text(160).optional(),
  overview: z.string().trim().max(4000).optional(),
  status: z.enum(CONTENT_STATUSES).optional(),
});
export type UpdateCurriculumInput = z.infer<typeof updateCurriculumSchema>;

export const curriculumUnitSchema = z.object({
  topic: text(200),
  subtopics: list.default([]),
  objectives: list.default([]),
  activities: list.default([]),
  resources: list.default([]),
  assessment: list.default([]),
});
export type CurriculumUnitInput = z.infer<typeof curriculumUnitSchema>;

export const generateSchemeSchema = z.object({
  subjectId: z.string().min(1),
  classLevelId: z.string().min(1),
  termId: z.string().min(1),
  guidance,
});
export type GenerateSchemeInput = z.infer<typeof generateSchemeSchema>;

export const updateSchemeSchema = z.object({
  title: text(160).optional(),
  status: z.enum(CONTENT_STATUSES).optional(),
});
export type UpdateSchemeInput = z.infer<typeof updateSchemeSchema>;

export const schemeWeekSchema = z.object({
  topic: text(200),
  subtopics: list.default([]),
  objectives: list.default([]),
  activities: list.default([]),
  resources: list.default([]),
  evaluation: list.default([]),
});
export type SchemeWeekInput = z.infer<typeof schemeWeekSchema>;

export const generateLessonSchema = z
  .object({
    subjectId: z.string().min(1),
    classArmId: z.string().min(1),
    schemeWeekId: z.string().optional(),
    topic: z.string().trim().max(200).optional(),
    date: isoDate.optional(),
    durationMinutes: z.number().int().min(20).max(180).default(40),
    guidance,
  })
  .refine((v) => v.schemeWeekId || v.topic, { message: 'Pick a scheme week or enter a topic', path: ['topic'] });
export type GenerateLessonInput = z.infer<typeof generateLessonSchema>;

export const updateLessonSchema = z.object({
  topic: text(200).optional(),
  date: isoDate.nullable().optional(),
  durationMinutes: z.number().int().min(20).max(180).optional(),
  objectives: list.optional(),
  priorKnowledge: z.string().trim().max(2000).optional(),
  materials: list.optional(),
  steps: z.array(lessonStepSchema).max(15).optional(),
  differentiation: differentiationSchema.optional(),
  assessment: list.optional(),
  homework: z.string().trim().max(2000).optional(),
  status: z.enum(LESSON_STATUSES).optional(),
});
export type UpdateLessonInput = z.infer<typeof updateLessonSchema>;

export const academicListQuerySchema = z.object({
  subjectId: z.string().optional(),
  classLevelId: z.string().optional(),
  classArmId: z.string().optional(),
  termId: z.string().optional(),
  status: z.string().optional(),
  mine: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
export type AcademicListQuery = z.infer<typeof academicListQuerySchema>;

// ------------------------------------------------------------ responses

interface Ref {
  id: string;
  name: string;
}

interface GenerationInfo {
  source: 'MANUAL' | 'AI';
  generation: GenerationState;
  generationError: string | null;
}

export interface CurriculumSummary extends GenerationInfo {
  id: string;
  title: string;
  version: number;
  status: (typeof CONTENT_STATUSES)[number];
  weeksPerTerm: number;
  subject: Ref & { code: string };
  classLevel: Ref & { code: string };
  unitCount: number;
  createdBy: string | null;
  updatedAt: string;
}

export interface CurriculumUnit {
  id: string;
  termOrder: number;
  week: number;
  topic: string;
  subtopics: string[];
  objectives: string[];
  activities: string[];
  resources: string[];
  assessment: string[];
}

export interface CurriculumDetail extends CurriculumSummary {
  overview: string | null;
  guidance: string | null;
  units: CurriculumUnit[];
}

export interface SchemeSummary extends GenerationInfo {
  id: string;
  title: string;
  status: (typeof CONTENT_STATUSES)[number];
  subject: Ref & { code: string };
  classLevel: Ref & { code: string };
  term: Ref & { sessionName: string; startsOn: string; endsOn: string };
  curriculum: { id: string; version: number } | null;
  weekCount: number;
  updatedAt: string;
}

export interface SchemeWeek {
  id: string;
  week: number;
  startsOn: string | null;
  topic: string;
  subtopics: string[];
  objectives: string[];
  activities: string[];
  resources: string[];
  evaluation: string[];
  lessonCount: number;
}

export interface SchemeDetail extends SchemeSummary {
  guidance: string | null;
  weeks: SchemeWeek[];
}

export interface LessonSummary extends GenerationInfo {
  id: string;
  topic: string;
  date: string | null;
  durationMinutes: number;
  status: (typeof LESSON_STATUSES)[number];
  subject: Ref & { code: string };
  classArm: Ref & { levelName: string };
  teacher: { id: string; name: string } | null;
  schemeWeek: { id: string; week: number; schemeId: string } | null;
  /** The signed-in user may change it: their own lesson, or they manage the curriculum. */
  canEdit: boolean;
  updatedAt: string;
}

export interface LessonDetail extends LessonSummary {
  objectives: string[];
  priorKnowledge: string | null;
  materials: string[];
  steps: LessonStep[];
  differentiation: Differentiation | null;
  assessment: string[];
  homework: string | null;
  guidance: string | null;
}
