import { z } from 'zod';

/**
 * JAMB & universities: JAMB's own brochure (IBASS, ibass.jamb.gov.ng) —
 * every tertiary institution, the courses each offers and JAMB's admission
 * requirements in JAMB's wording — with an honest eligibility helper, the
 * JAMB e-syllabus and JAMB's FAQ. Read-only for students, parents and staff.
 */

export const JAMB_LEVELS = ['DEGREE', 'ND', 'NCE'] as const;
export type JambLevel = (typeof JAMB_LEVELS)[number];
export const JAMB_LEVEL_LABELS: Record<JambLevel, string> = {
  DEGREE: 'Universities',
  ND: 'Polytechnics',
  NCE: 'Colleges of Education',
};
export const JAMB_LEVEL_HINTS: Record<JambLevel, string> = {
  DEGREE: 'Universities and other degree-awarding institutions',
  ND: 'Polytechnics and monotechnics (National Diploma)',
  NCE: 'Colleges of education (Nigeria Certificate in Education)',
};
export const JAMB_OWNERSHIPS = ['Federal', 'State', 'Private'] as const;

/** Faculties as JAMB's brochure groups degree courses. */
export const JAMB_FACULTIES = [
  'Sciences',
  'Arts',
  'Social Sciences',
  'Engineering & Technology',
  'Medicine & Health Sciences',
  'Law',
  'Agriculture',
  'Education',
  'Administration & Management',
] as const;

export const JAMB_LINKS = [
  { label: 'JAMB', url: 'https://www.jamb.gov.ng', hint: 'News, registration dates and announcements' },
  { label: 'JAMB e-Facility', url: 'https://efacility.jamb.gov.ng', hint: 'Profile, results, admission status and CAPS' },
  { label: 'IBASS brochure', url: 'https://ibass.jamb.gov.ng', hint: 'JAMB’s official brochure and syllabus' },
] as const;

/** UTME subjects besides Use of English (compulsory), in JAMB's names. */
export const UTME_SUBJECTS = [
  'Mathematics',
  'Physics',
  'Chemistry',
  'Biology',
  'Agricultural Science',
  'Geography',
  'Economics',
  'Commerce',
  'Principles of Accounts',
  'Government',
  'History',
  'Literature in English',
  'Christian Religious Studies',
  'Islamic Studies',
  'Fine Arts',
  'Music',
  'French',
  'Arabic',
  'Hausa',
  'Igbo',
  'Yoruba',
  'Home Economics',
  'Physical and Health Education',
  'Computer Studies',
] as const;

/** O'level (WASSCE/NECO) subjects for the eligibility checker. */
export const OLEVEL_SUBJECTS = [
  'English Language',
  'Mathematics',
  'Further Mathematics',
  'Physics',
  'Chemistry',
  'Biology',
  'Agricultural Science',
  'Geography',
  'Economics',
  'Commerce',
  'Principles of Accounts',
  'Government',
  'History',
  'Civic Education',
  'Literature in English',
  'Christian Religious Studies',
  'Islamic Studies',
  'Fine Arts',
  'Music',
  'French',
  'Arabic',
  'Hausa',
  'Igbo',
  'Yoruba',
  'Home Economics',
  'Food and Nutrition',
  'Physical and Health Education',
  'Computer Studies',
  'Data Processing',
  'Technical Drawing',
  'Office Practice',
  'Marketing',
  'Animal Husbandry',
  'Basic Electricity',
  'Electronics',
  'Auto Mechanics',
  'Metalwork',
  'Woodwork',
  'Building Construction',
  'Clothing and Textiles',
] as const;
export const OLEVEL_GRADES = ['A1', 'B2', 'B3', 'C4', 'C5', 'C6', 'D7', 'E8', 'F9'] as const;

/** The JAMB syllabus file for each UTME subject (our topic graph's subject names). */
export const UTME_SYLLABUS_SUBJECT: Record<string, string> = {
  'Use of English': 'English Language',
  'Principles of Accounts': 'Financial Accounting',
  'Islamic Studies': 'Islamic Religious Studies',
  'Fine Arts': 'Visual Art',
};

// ============================================================ browsing

export interface JambPage<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface JambInstallStatus {
  installed: boolean;
  source: string | null;
  /** When the brochure data was collected from IBASS. */
  fetchedAt: string | null;
  installedAt: string | null;
  durationMs: number | null;
}

export interface JambOverview extends JambInstallStatus {
  institutions: number;
  byType: Record<JambLevel, number>;
  byOwnership: Record<string, number>;
  programmes: number;
  courses: number;
  states: string[];
  categories: { category: string; type: JambLevel; count: number }[];
}

export interface JambInstitutionRow {
  id: number;
  name: string;
  abbreviation: string | null;
  state: string | null;
  type: JambLevel;
  category: string | null;
  ownership: string | null;
  programmeCount: number;
}

export interface JambProgrammeRow {
  id: number;
  name: string;
  courseId: number | null;
  department: string | null;
  duration: string | null;
  status: string | null;
  /** Requirement text ids (texts are shared; see `texts`). */
  utme: number | null;
  olevel: number | null;
  directEntry: number | null;
  remarks: number | null;
  /** The remarks name this institution (its own exceptions). */
  mentioned: boolean;
}

export interface JambInstitutionDetail extends JambInstitutionRow {
  address: string | null;
  accreditation: string | null;
  modeOfStudy: string | null;
  specialization: string | null;
  programmes: JambProgrammeRow[];
  texts: Record<number, string>;
  /** The university's own entry rules from the printed JAMB brochure (undated copy), when it has a section there. */
  brochureNotes: JambBrochureNotes | null;
}

/** Shown wherever brochure notes appear: they are older than IBASS and never override it. */
export const JAMB_BROCHURE_NOTICE = 'From the JAMB brochure (undated) — confirm with the institution and on JAMB’s IBASS portal';

/** A university's "specific entry requirements and other information" from the JAMB brochure (section 2.2.xx). */
export interface JambBrochureNotes {
  /** Section number in the brochure, e.g. "2.2.02". */
  no: string;
  /** The university's name as the brochure prints it (it may since have been renamed). */
  brochureName: string;
  source: string;
  sections: { heading?: string; text: string }[];
}

export interface JambFacultyRow {
  faculty: string | null;
  level: JambLevel;
  courses: number;
}

export interface JambCourseRow {
  id: number;
  name: string;
  faculty: string | null;
  level: JambLevel | null;
  institutionCount: number;
}

export interface JambCourseInstitution {
  id: number;
  name: string;
  abbreviation: string | null;
  state: string | null;
  ownership: string | null;
  type: JambLevel;
  programmeId: number;
  programmeName: string;
  duration: string | null;
  status: string | null;
  remarks: number | null;
  mentioned: boolean;
  /** The JAMB brochure has university-specific entry rules for this institution (see its page). */
  brochureNotes: boolean;
}

/** Institutions offering a course with exactly the same requirement texts, as the brochure prints them. */
export interface JambRequirementGroup {
  utme: number | null;
  olevel: number | null;
  directEntry: number | null;
  institutions: JambCourseInstitution[];
}

export interface JambCourseDetail {
  course: JambCourseRow;
  /** Institutions before filters. */
  total: number;
  /** Institutions after filters. */
  shown: number;
  groups: JambRequirementGroup[];
  remarks: { text: number; institutions: number }[];
  texts: Record<number, string>;
  states: string[];
  /** Careers in our library that lead to this course. */
  careers: { slug: string; name: string }[];
}

export interface JambCourseLink {
  /** The course name as the career lists it. */
  name: string;
  courses: JambCourseRow[];
}

export interface JambSyllabusSubject {
  subject: string;
  /** Our topic graph's subject name. */
  key: string;
  topics: number;
  recommendedTexts: number;
}

export interface JambSyllabusTopic {
  id: string;
  name: string;
  objectives: string[];
  content: string | null;
  subtopics: { id: string; name: string; objectives: string[] }[];
}

export interface JambSyllabusDetail {
  subject: string;
  key: string;
  examFormat: string | null;
  excluded: string | null;
  recommendedTexts: string[];
  topics: JambSyllabusTopic[];
}

export interface JambFaq {
  source: string;
  faq: { q: string; a: string }[];
}

// ============================================================ eligibility helper

export const JAMB_STATUSES = ['MATCH', 'CHECK', 'MISMATCH'] as const;
export type JambStatus = (typeof JAMB_STATUSES)[number];

export const jambCheckSchema = z
  .object({
    /** Three subjects besides Use of English (English may be included; it is always assumed). */
    utmeSubjects: z.array(z.string().trim().min(2).max(60)).min(3).max(4),
    olevel: z
      .array(z.object({ subject: z.string().trim().min(2).max(60), grade: z.enum(OLEVEL_GRADES) }))
      .max(12)
      .optional(),
    courseId: z.number().int().optional(),
    institutionId: z.number().int().optional(),
    state: z.string().max(60).optional(),
    ownership: z.string().max(20).optional(),
    type: z.enum(JAMB_LEVELS).optional(),
  })
  .refine((v) => v.courseId !== undefined || v.institutionId !== undefined, { message: 'Choose a course or an institution' });
export type JambCheckInput = z.infer<typeof jambCheckSchema>;

export interface JambRuleVerdict {
  status: JambStatus;
  notes: string[];
  /** How we read JAMB's text, in plain words (shown as a hint). */
  reading: string;
  /** Words in the text that are the student's subjects (to highlight). */
  have: string[];
  /** Named subjects the student lacks. */
  missing: string[];
}

export interface JambCheckRow {
  institutionId: number;
  institutionName: string;
  abbreviation: string | null;
  state: string | null;
  ownership: string | null;
  type: JambLevel;
  programmeId: number;
  programmeName: string;
  courseId: number | null;
  utme: number | null;
  olevel: number | null;
  remarks: number | null;
  mentioned: boolean;
  status: JambStatus;
}

export interface JambCheckResult {
  subjects: string[];
  olevelGiven: boolean;
  course: JambCourseRow | null;
  institution: JambInstitutionRow | null;
  summary: Record<JambStatus, number>;
  /** Verdicts per requirement text: "u<textId>" (UTME) and "o<textId>" (O'level). */
  verdicts: Record<string, JambRuleVerdict>;
  texts: Record<number, string>;
  rows: JambCheckRow[];
}
