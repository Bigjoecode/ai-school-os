import { z } from 'zod';

/**
 * Onboarding a real school: a setup checklist with Nigerian templates
 * (classes, subjects, the academic year) and CSV imports for students with
 * their parents, staff, and past results.
 */

// ============================================================ setup templates

export const STAGE_TEMPLATES = {
  NURSERY: { label: 'Nursery', stage: 'Nursery', levels: [['Pre-Nursery', 'PNUR'], ['Nursery 1', 'NUR1'], ['Nursery 2', 'NUR2'], ['Nursery 3', 'NUR3']] },
  PRIMARY: { label: 'Primary', stage: 'Primary', levels: [['Primary 1', 'PRY1'], ['Primary 2', 'PRY2'], ['Primary 3', 'PRY3'], ['Primary 4', 'PRY4'], ['Primary 5', 'PRY5'], ['Primary 6', 'PRY6']] },
  JUNIOR: { label: 'Junior secondary', stage: 'Junior Secondary', levels: [['JSS 1', 'JSS1'], ['JSS 2', 'JSS2'], ['JSS 3', 'JSS3']] },
  SENIOR: { label: 'Senior secondary', stage: 'Senior Secondary', levels: [['SS 1', 'SS1'], ['SS 2', 'SS2'], ['SS 3', 'SS3']] },
} as const;
export type StageKey = keyof typeof STAGE_TEMPLATES;
export const STAGE_KEYS = Object.keys(STAGE_TEMPLATES) as StageKey[];

/** [name, code, category, core] per stage, following the Nigerian curriculum. */
export const SUBJECT_TEMPLATES: Record<StageKey, [string, string, string, boolean][]> = {
  NURSERY: [
    ['Numeracy', 'NUM', 'Core', true],
    ['Literacy', 'LIT', 'Core', true],
    ['Basic Science', 'BSC', 'Science', true],
    ['Social Habits', 'SOH', 'Core', true],
    ['Creative Arts', 'CCA', 'Arts', false],
    ['Rhymes and Songs', 'RHY', 'Arts', false],
  ],
  PRIMARY: [
    ['Mathematics', 'MTH', 'Core', true],
    ['English Studies', 'ENS', 'Core', true],
    ['Basic Science and Technology', 'BST', 'Science', true],
    ['Social Studies', 'SST', 'Core', true],
    ['Civic Education', 'CIV', 'Core', true],
    ['Cultural and Creative Arts', 'CCA', 'Arts', false],
    ['Computer Studies', 'CMP', 'Vocational', false],
    ['Nigerian History', 'HIS', 'Core', false],
    ['Christian Religious Studies', 'CRS', 'Religion', false],
    ['Islamic Religious Studies', 'IRS', 'Religion', false],
    ['French', 'FRE', 'Languages', false],
    ['Yoruba', 'YOR', 'Languages', false],
    ['Igbo', 'IGB', 'Languages', false],
    ['Hausa', 'HAU', 'Languages', false],
  ],
  JUNIOR: [
    ['Mathematics', 'MTH', 'Core', true],
    ['English Language', 'ENG', 'Core', true],
    ['Basic Science', 'BSC', 'Science', true],
    ['Basic Technology', 'BTE', 'Science', true],
    ['Social Studies', 'SST', 'Core', true],
    ['Civic Education', 'CIV', 'Core', true],
    ['Computer Studies', 'CMP', 'Vocational', true],
    ['Business Studies', 'BUS', 'Vocational', false],
    ['Agricultural Science', 'AGR', 'Vocational', false],
    ['Home Economics', 'HEC', 'Vocational', false],
    ['Physical and Health Education', 'PHE', 'Core', false],
    ['Cultural and Creative Arts', 'CCA', 'Arts', false],
    ['Nigerian History', 'HIS', 'Core', false],
    ['Christian Religious Studies', 'CRS', 'Religion', false],
    ['Islamic Religious Studies', 'IRS', 'Religion', false],
    ['French', 'FRE', 'Languages', false],
    ['Yoruba', 'YOR', 'Languages', false],
    ['Igbo', 'IGB', 'Languages', false],
    ['Hausa', 'HAU', 'Languages', false],
  ],
  SENIOR: [
    ['Mathematics', 'MTH', 'Core', true],
    ['English Language', 'ENG', 'Core', true],
    ['Civic Education', 'CIV', 'Core', true],
    ['Biology', 'BIO', 'Science', false],
    ['Chemistry', 'CHM', 'Science', false],
    ['Physics', 'PHY', 'Science', false],
    ['Further Mathematics', 'FMT', 'Science', false],
    ['Agricultural Science', 'AGR', 'Science', false],
    ['Geography', 'GEO', 'Social Science', false],
    ['Economics', 'ECO', 'Social Science', false],
    ['Government', 'GOV', 'Social Science', false],
    ['Commerce', 'COM', 'Commercial', false],
    ['Financial Accounting', 'ACC', 'Commercial', false],
    ['Literature in English', 'LIE', 'Arts', false],
    ['Data Processing', 'DPR', 'Vocational', false],
    ['Christian Religious Studies', 'CRS', 'Religion', false],
    ['Islamic Religious Studies', 'IRS', 'Religion', false],
    ['French', 'FRE', 'Languages', false],
    ['Yoruba', 'YOR', 'Languages', false],
    ['Igbo', 'IGB', 'Languages', false],
    ['Hausa', 'HAU', 'Languages', false],
  ],
};

export const setupYearSchema = z.object({
  name: z.string().trim().regex(/^\d{4}\/\d{4}$/, 'Like 2026/2027'),
  terms: z
    .array(z.object({ name: z.string().trim().min(2).max(40), startsOn: z.iso.date(), endsOn: z.iso.date() }))
    .min(1)
    .max(4),
  currentTerm: z.number().int().min(0).max(3),
});
export type SetupYearInput = z.infer<typeof setupYearSchema>;

export const setupClassesSchema = z.object({
  stages: z.array(z.enum(STAGE_KEYS as [StageKey, ...StageKey[]])).min(1),
  /** Arm names for every level, e.g. ["A", "B"] or ["Gold", "Silver"]. */
  arms: z.array(z.string().trim().min(1).max(20)).min(1).max(12),
  capacity: z.number().int().min(1).max(200).default(35),
});

export const setupSubjectsSchema = z.object({
  /** Subject codes per stage to create; each is linked to every class of that stage. */
  selections: z.array(z.object({ stage: z.enum(STAGE_KEYS as [StageKey, ...StageKey[]]), codes: z.array(z.string().min(2).max(12)).min(1) })).min(1),
});

export interface SetupStep {
  key: 'profile' | 'year' | 'classes' | 'subjects' | 'staff' | 'students' | 'parents' | 'fees' | 'results';
  label: string;
  done: boolean;
  detail: string;
  href: string;
}
export interface SetupStatus {
  steps: SetupStep[];
  progressPct: number;
  /** Stages the school already has classes for. */
  stages: StageKey[];
  counts: { levels: number; arms: number; subjects: number; staff: number; students: number; guardians: number; feeItems: number; scores: number };
}

// ============================================================ CSV import

export const IMPORT_KINDS = ['STUDENTS', 'STAFF', 'RESULTS'] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

export const importRequestSchema = z.object({
  kind: z.enum(IMPORT_KINDS),
  /** The CSV file's text (comma, semicolon or tab separated; the first row is the header). */
  csv: z.string().min(1).max(5_000_000),
  options: z
    .object({
      /** STUDENTS: update records whose admission number already exists (otherwise they're skipped). */
      updateExisting: z.boolean().default(false),
      /** STUDENTS: create a class arm when the level exists but the arm doesn't ("JSS 1 C"). */
      createMissingArms: z.boolean().default(false),
      /** STUDENTS: give parents with an email a portal login. STAFF: give staff with an email a login. */
      createLogins: z.boolean().default(false),
      /** RESULTS: the term the scores are for. */
      termId: z.string().optional(),
      /** RESULTS: overwrite scores already entered. */
      overwriteScores: z.boolean().default(false),
    })
    .default({ updateExisting: false, createMissingArms: false, createLogins: false, overwriteScores: false }),
});
export type ImportRequest = z.infer<typeof importRequestSchema>;

export interface ImportRowResult {
  /** 1-based line number in the file (the header is line 1). */
  line: number;
  status: 'CREATE' | 'UPDATE' | 'SKIP' | 'ERROR';
  label: string;
  messages: string[];
}
export interface ImportPreview {
  kind: ImportKind;
  columns: { header: string; field: string | null }[];
  missingRequired: string[];
  rows: ImportRowResult[];
  totals: { create: number; update: number; skip: number; error: number };
  /** Things the import will also create (classes, parents, departments, logins). */
  extras: string[];
}
export interface ImportResult extends ImportPreview {
  committed: true;
  /** Login details for new accounts, as CSV text to download once (passwords are not stored in plain text). */
  credentialsCsv: string | null;
}

/** Recognised columns per import, with the header spellings schools actually use. */
export const IMPORT_FIELDS: Record<ImportKind, { field: string; label: string; required?: boolean; aliases: string[]; example: string }[]> = {
  STUDENTS: [
    { field: 'admissionNumber', label: 'Admission number', aliases: ['admission no', 'admission number', 'adm no', 'reg no', 'student id'], example: 'GIS/2024/0012' },
    { field: 'firstName', label: 'First name', required: true, aliases: ['first name', 'firstname', 'given name', 'forename'], example: 'Chiamaka' },
    { field: 'middleName', label: 'Middle name', aliases: ['middle name', 'other names', 'othername'], example: 'Ada' },
    { field: 'lastName', label: 'Surname', required: true, aliases: ['last name', 'lastname', 'surname', 'family name'], example: 'Okafor' },
    { field: 'gender', label: 'Gender (M/F)', required: true, aliases: ['gender', 'sex'], example: 'F' },
    { field: 'dateOfBirth', label: 'Date of birth', aliases: ['date of birth', 'dob', 'birth date', 'birthday'], example: '2013-04-21' },
    { field: 'class', label: 'Class (level and arm)', aliases: ['class', 'class arm', 'form', 'class name'], example: 'JSS 1 A' },
    { field: 'admittedOn', label: 'Admission date', aliases: ['admission date', 'date admitted', 'admitted on', 'date of admission'], example: '2024-09-09' },
    { field: 'address', label: 'Home address', aliases: ['address', 'home address'], example: '12 Admiralty Way, Lekki' },
    { field: 'medicalNotes', label: 'Medical notes', aliases: ['medical notes', 'medical', 'allergies', 'health'], example: 'Asthma: inhaler in bag' },
    { field: 'parentName', label: 'Parent/guardian name', aliases: ['parent name', 'guardian name', 'father name', 'parent', 'guardian', 'parent/guardian name'], example: 'Mr Emeka Okafor' },
    { field: 'parentRelationship', label: 'Relationship', aliases: ['relationship', 'parent relationship', 'relation'], example: 'Father' },
    { field: 'parentPhone', label: 'Parent phone', aliases: ['parent phone', 'guardian phone', 'phone', 'phone number', 'father phone', 'parent mobile'], example: '08031234567' },
    { field: 'parentEmail', label: 'Parent email', aliases: ['parent email', 'guardian email', 'email', 'father email'], example: 'emeka.okafor@gmail.com' },
    { field: 'parent2Name', label: 'Second parent name', aliases: ['parent 2 name', 'mother name', 'second parent name', 'guardian 2 name'], example: 'Mrs Ngozi Okafor' },
    { field: 'parent2Relationship', label: 'Second relationship', aliases: ['parent 2 relationship', 'relationship 2'], example: 'Mother' },
    { field: 'parent2Phone', label: 'Second parent phone', aliases: ['parent 2 phone', 'mother phone', 'second parent phone', 'guardian 2 phone'], example: '08037654321' },
    { field: 'parent2Email', label: 'Second parent email', aliases: ['parent 2 email', 'mother email', 'second parent email'], example: '' },
  ],
  STAFF: [
    { field: 'staffNumber', label: 'Staff number', aliases: ['staff no', 'staff number', 'staff id', 'employee id'], example: 'STF-0042' },
    { field: 'firstName', label: 'First name', required: true, aliases: ['first name', 'firstname'], example: 'Babatunde' },
    { field: 'lastName', label: 'Surname', required: true, aliases: ['last name', 'lastname', 'surname'], example: 'Adeyemi' },
    { field: 'gender', label: 'Gender (M/F)', required: true, aliases: ['gender', 'sex'], example: 'M' },
    { field: 'email', label: 'Email', aliases: ['email', 'email address'], example: 'b.adeyemi@school.ng' },
    { field: 'phone', label: 'Phone', aliases: ['phone', 'phone number', 'mobile'], example: '08021234567' },
    { field: 'jobTitle', label: 'Job title', required: true, aliases: ['job title', 'title', 'position', 'designation', 'role title'], example: 'Mathematics Teacher' },
    { field: 'type', label: 'Teaching / non-teaching', aliases: ['type', 'staff type', 'category'], example: 'Teaching' },
    { field: 'department', label: 'Department', aliases: ['department', 'dept'], example: 'Sciences' },
    { field: 'employedOn', label: 'Date employed', aliases: ['date employed', 'employment date', 'employed on', 'start date', 'resumption date'], example: '2021-01-11' },
    { field: 'role', label: 'Portal role', aliases: ['role', 'portal role', 'access'], example: 'teacher' },
  ],
  RESULTS: [
    { field: 'admissionNumber', label: 'Admission number', required: true, aliases: ['admission no', 'admission number', 'adm no', 'reg no', 'student id'], example: 'GIS/2024/0012' },
    { field: 'subject', label: 'Subject (name or code)', required: true, aliases: ['subject', 'subject name', 'subject code'], example: 'Mathematics' },
  ],
};

/** Gender spellings → enum. */
export function parseGender(v: string): 'MALE' | 'FEMALE' | null {
  const s = v.trim().toLowerCase();
  if (['m', 'male', 'boy', 'man'].includes(s)) return 'MALE';
  if (['f', 'female', 'girl', 'woman'].includes(s)) return 'FEMALE';
  return null;
}

/** Dates as schools type them: 2013-04-21, 21/04/2013, 21-04-2013, 21 Apr 2013 (day first, as in Nigeria). */
export function parseSchoolDate(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  let y: number, m: number, d: number;
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (r) [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else if ((r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s))) {
    [d, m, y] = [Number(r[1]), Number(r[2]), Number(r[3])];
    if (y < 100) y += y > 50 ? 1900 : 2000;
  } else {
    const t = Date.parse(s);
    if (Number.isNaN(t)) return null;
    const dt = new Date(t);
    [y, m, d] = [dt.getFullYear(), dt.getMonth() + 1, dt.getDate()];
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d || y < 1950 || y > 2100) return null;
  return dt.toISOString().slice(0, 10);
}
