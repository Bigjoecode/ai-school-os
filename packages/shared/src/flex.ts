import { z } from 'zod';
import { EXAMS, type ExamBody } from './learning';

/**
 * Flexibility for real schools: subjects linked to classes and teachers,
 * the school's own report card layout, uploaded curricula and schemes,
 * richer assignments (theory, projects, file/video hand-ins) and syllabus
 * imports for Exam Academy.
 */

// ============================================================ subjects ↔ classes

export const subjectClassesSchema = z.object({
  /** The exact set of classes that take the subject (others are unlinked). */
  assignments: z.array(z.object({ classArmId: z.string().min(1), teacherId: z.string().nullish().transform((v) => v || null) })).max(200),
});
export interface SubjectClasses {
  subject: { id: string; name: string; code: string };
  levels: {
    id: string;
    name: string;
    arms: { id: string; name: string; linked: boolean; teacherId: string | null; teacherName: string | null; periodsPerWeek: number; hasScores: boolean }[];
  }[];
  teachers: { id: string; name: string; jobTitle: string }[];
}

// ============================================================ report card templates

export const TRAIT_DOMAINS = ['AFFECTIVE', 'PSYCHOMOTOR'] as const;
export type TraitDomain = (typeof TRAIT_DOMAINS)[number];

export const REPORT_STUDENT_FIELDS = {
  admissionNumber: 'Admission no.',
  class: 'Class',
  term: 'Term',
  session: 'Session',
  gender: 'Sex',
  age: 'Age',
  classSize: 'No. in class',
  position: 'Position',
  average: 'Average',
  totalScore: 'Total score',
  attendance: 'Attendance',
  nextTermBegins: 'Next term begins',
  feesOwed: 'Fees owed',
} as const;
export type ReportStudentField = keyof typeof REPORT_STUDENT_FIELDS;

/** Columns of the subjects table; `component:<key>` columns come from the school's assessment components. */
export const REPORT_COLUMNS = {
  components: 'Assessment components (CA, exam…)',
  total: 'Total',
  percent: 'Percent',
  grade: 'Grade',
  remark: 'Remark',
  subjectPosition: 'Subject position',
  classAverage: 'Class average',
  highest: 'Highest in class',
  lowest: 'Lowest in class',
  cumulative: 'Term totals (1st, 2nd, 3rd) and cumulative average',
  teacherInitials: 'Teacher’s initials',
} as const;
export type ReportColumn = keyof typeof REPORT_COLUMNS;

const traitSection = z.object({
  enabled: z.boolean(),
  title: z.string().trim().min(2).max(60),
  traits: z.array(z.string().trim().min(2).max(60)).max(20),
});

export const reportTemplateConfigSchema = z.object({
  paper: z.enum(['A4', 'LETTER']).default('A4'),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  header: z.object({
    showLogo: z.boolean(),
    title: z.string().trim().min(2).max(80),
    showMotto: z.boolean(),
    showAddress: z.boolean(),
    extraLine: z.string().trim().max(160).nullish().transform((v) => v || null),
  }),
  studentFields: z.array(z.enum(Object.keys(REPORT_STUDENT_FIELDS) as [ReportStudentField, ...ReportStudentField[]])).max(14),
  columns: z.array(z.enum(Object.keys(REPORT_COLUMNS) as [ReportColumn, ...ReportColumn[]])).min(1).max(11),
  /** Column headings the school uses (e.g. { total: "Total (100)", grade: "Grd" }). */
  columnLabels: z.record(z.string(), z.string().trim().max(30)).default({}),
  affective: traitSection,
  psychomotor: traitSection,
  /** Rating key for the trait sections, highest first. */
  ratingScale: z.array(z.object({ value: z.number().int().min(0).max(10), label: z.string().trim().min(1).max(30) })).min(2).max(10),
  showGradingKey: z.boolean(),
  comments: z.object({
    teacherLabel: z.string().trim().min(2).max(60),
    principalLabel: z.string().trim().min(2).max(60),
  }),
  signatures: z.array(z.string().trim().min(2).max(60)).max(4),
  footerNote: z.string().trim().max(300).nullish().transform((v) => v || null),
});
export type ReportTemplateConfig = z.infer<typeof reportTemplateConfigSchema>;

export const reportTemplateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  isDefault: z.boolean().default(false),
  config: reportTemplateConfigSchema,
});
export interface ReportTemplateRow {
  id: string;
  name: string;
  isDefault: boolean;
  config: ReportTemplateConfig;
  sampleFileId: string | null;
  updatedAt: string;
}

/** The common Nigerian layout, used until a school sets its own. */
export const DEFAULT_REPORT_TEMPLATE: ReportTemplateConfig = {
  paper: 'A4',
  accentColor: '#1e3a8a',
  header: { showLogo: true, title: 'Report Sheet', showMotto: true, showAddress: true, extraLine: null },
  studentFields: ['admissionNumber', 'class', 'term', 'session', 'gender', 'classSize', 'position', 'average', 'attendance', 'nextTermBegins'],
  columns: ['components', 'total', 'grade', 'subjectPosition', 'classAverage', 'highest', 'lowest', 'remark'],
  columnLabels: {},
  affective: { enabled: true, title: 'Affective domain', traits: ['Punctuality', 'Neatness', 'Politeness', 'Honesty', 'Relationship with others', 'Leadership', 'Attentiveness', 'Self-control'] },
  psychomotor: { enabled: true, title: 'Psychomotor skills', traits: ['Handwriting', 'Verbal fluency', 'Sports and games', 'Handling of tools', 'Drawing and painting', 'Musical skills'] },
  ratingScale: [
    { value: 5, label: 'Excellent' },
    { value: 4, label: 'Very good' },
    { value: 3, label: 'Good' },
    { value: 2, label: 'Fair' },
    { value: 1, label: 'Poor' },
  ],
  showGradingKey: true,
  comments: { teacherLabel: "Class teacher's comment", principalLabel: "Principal's comment" },
  signatures: ['Class teacher', 'Principal'],
  footerNote: null,
};

export const templateFromSampleSchema = z.object({ fileId: z.string().min(1), name: z.string().trim().min(2).max(80).default('Our report card') });

export const traitRatingsSchema = z.object({
  termId: z.string().min(1),
  ratings: z
    .array(z.object({ studentId: z.string().min(1), domain: z.enum(TRAIT_DOMAINS), trait: z.string().trim().min(2).max(60), rating: z.number().int().min(0).max(10).nullable() }))
    .max(5000),
});
export interface TraitSheet {
  domain: TraitDomain;
  traits: string[];
  scale: { value: number; label: string }[];
  students: { id: string; name: string; admissionNumber: string; ratings: Record<string, number | null> }[];
}

// ============================================================ uploaded curricula & schemes

export const importCurriculumSchema = z.object({
  subjectId: z.string().min(1),
  classLevelId: z.string().min(1),
  weeksPerTerm: z.number().int().min(6).max(14).default(11),
  fileId: z.string().nullish(),
  text: z.string().trim().max(300_000).nullish(),
});
export const importSchemeSchema = z.object({
  subjectId: z.string().min(1),
  classLevelId: z.string().min(1),
  termId: z.string().min(1),
  fileId: z.string().nullish(),
  text: z.string().trim().max(300_000).nullish(),
});

// ============================================================ assignments

export const HOMEWORK_KINDS = ['QUESTIONS', 'THEORY', 'PROJECT', 'UPLOAD'] as const;
export type HomeworkKind = (typeof HOMEWORK_KINDS)[number];
export const HOMEWORK_KIND_LABELS: Record<HomeworkKind, string> = { QUESTIONS: 'Questions', THEORY: 'Theory (written answers)', PROJECT: 'Project', UPLOAD: 'Hand in a file or video' };
export const SUBMISSION_TYPES = ['TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'LINK'] as const;
export type SubmissionType = (typeof SUBMISSION_TYPES)[number];
export const SUBMISSION_TYPE_LABELS: Record<SubmissionType, string> = { TEXT: 'Typed answer', IMAGE: 'Photo or image', VIDEO: 'Video', AUDIO: 'Audio recording', DOCUMENT: 'Document (PDF, Word…)', LINK: 'Link (YouTube, Google Drive…)' };

export const attachmentSchema = z.object({
  type: z.enum(['FILE', 'LINK']),
  fileId: z.string().nullish().transform((v) => v || null),
  url: z.string().trim().max(1000),
  name: z.string().trim().min(1).max(200),
  mimeType: z.string().max(100).nullish().transform((v) => v || null),
});
export type Attachment = z.infer<typeof attachmentSchema>;

export const submitHomeworkSchema = z.object({
  text: z.string().trim().max(20_000).nullish().transform((v) => v || null),
  fileIds: z.array(z.string()).max(10).default([]),
  links: z.array(z.url().max(1000)).max(5).default([]),
});
export const gradeSubmissionSchema = z.object({
  score: z.number().min(0).max(1000).nullable(),
  feedback: z.string().trim().max(5000).nullish().transform((v) => v || null),
  /** RETURNED asks the student to redo it. */
  status: z.enum(['GRADED', 'RETURNED']).default('GRADED'),
});
export interface SubmissionFile {
  fileId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
}
export interface SubmissionRow {
  id: string;
  student: { id: string; name: string; admissionNumber: string };
  text: string | null;
  files: SubmissionFile[];
  links: string[];
  status: 'SUBMITTED' | 'GRADED' | 'RETURNED';
  late: boolean;
  submittedAt: string;
  score: number | null;
  feedback: string | null;
  gradedAt: string | null;
  aiSuggestion: { score: number; outOf: number; reasons: string[]; feedback: string } | null;
}
export interface SubmissionBoard {
  homework: { id: string; title: string; kind: HomeworkKind; maxScore: number | null; dueDate: string; markingGuide: string | null };
  submissions: SubmissionRow[];
  /** Students in the class who haven't handed in. */
  missing: { id: string; name: string; admissionNumber: string }[];
}

// ============================================================ Exam Academy theory & syllabus

export const QUESTION_KINDS = ['OBJECTIVE', 'THEORY'] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

export const theoryStartSchema = z.object({ exam: z.enum(EXAMS), subject: z.string().trim().min(2), questions: z.number().int().min(1).max(5).default(2) });
export const theoryAnswerSchema = z.object({ answers: z.array(z.string().trim().max(10_000)).max(10) });
export interface TheoryMarking {
  index: number;
  score: number;
  outOf: number;
  strengths: string[];
  missing: string[];
  feedback: string;
}

export const syllabusImportSchema = z.object({
  exam: z.enum(EXAMS),
  subject: z.string().trim().min(2).max(60),
  fileId: z.string().nullish(),
  text: z.string().trim().max(400_000).nullish(),
});
export interface SyllabusImportPreview {
  exam: ExamBody;
  subject: string;
  level: 'PRIMARY' | 'JUNIOR' | 'SENIOR';
  topics: { name: string; objectives: string[]; content: string | null; subtopics: { name: string; objectives: string[] }[] }[];
  provider: string;
  model: string;
}
export const syllabusSaveSchema = z.object({
  exam: z.enum(EXAMS),
  subject: z.string().trim().min(2).max(60),
  level: z.enum(['PRIMARY', 'JUNIOR', 'SENIOR']),
  topics: z
    .array(
      z.object({
        name: z.string().trim().min(2).max(120),
        objectives: z.array(z.string().trim().max(300)).max(40).default([]),
        content: z.string().trim().max(3000).nullish().transform((v) => v || null),
        subtopics: z.array(z.object({ name: z.string().trim().min(2).max(120), objectives: z.array(z.string().trim().max(300)).max(40).default([]) })).max(40).default([]),
      }),
    )
    .min(1)
    .max(200),
});
