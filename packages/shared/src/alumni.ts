import { z } from 'zod';

/**
 * Alumni records: graduates (created when end-of-session promotion marks a
 * student GRADUATED), old students who sign up on the school website (they
 * wait for a member of staff to verify them), imports and hand-added
 * records. Schools use them for reunions, mentoring and fundraising, and
 * can message those who agreed to be contacted.
 */

const optionalText = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(160)
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), 'Enter a valid email address');
const year = z.coerce.number().int().min(1900, 'Enter a year like 2015').max(2100, 'Enter a year like 2015');

export const ALUMNI_SOURCES = ['GRADUATED', 'SELF_REGISTERED', 'IMPORTED', 'ADDED'] as const;
export type AlumniSource = (typeof ALUMNI_SOURCES)[number];
export const ALUMNI_SOURCE_LABELS: Record<AlumniSource, string> = {
  GRADUATED: 'Graduated here',
  SELF_REGISTERED: 'Signed up on the website',
  IMPORTED: 'Imported',
  ADDED: 'Added by staff',
};

export const alumniSchema = z.object({
  firstName: z.string().trim().min(1, 'Enter the first name').max(80),
  lastName: z.string().trim().min(1, 'Enter the surname').max(80),
  graduationYear: year.nullish().transform((v) => v ?? null),
  finalClass: optionalText(60),
  email: optionalEmail,
  phone: optionalText(30),
  currentInstitution: optionalText(160),
  course: optionalText(120),
  occupation: optionalText(120),
  employer: optionalText(160),
  city: optionalText(80),
  country: optionalText(80),
  consentToContact: z.boolean().default(true),
  verified: z.boolean().optional(),
  notes: optionalText(2000),
});
export type AlumniInput = z.input<typeof alumniSchema>;

export const alumniListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  finalClass: z.string().trim().max(60).optional(),
  city: z.string().trim().max(80).optional(),
  verified: z.enum(['true', 'false']).optional(),
  consent: z.enum(['true', 'false']).optional(),
  source: z.enum(ALUMNI_SOURCES).optional(),
});
export type AlumniListQuery = z.input<typeof alumniListQuerySchema>;
/** The directory's filters without paging (export, messaging). */
export const alumniFilterSchema = alumniListQuerySchema.omit({ page: true, pageSize: true });
export type AlumniFilter = z.input<typeof alumniFilterSchema>;

/** The public "old students" form on the school website. */
export const alumniSignupSchema = z
  .object({
    firstName: z.string().trim().min(1, 'Enter your first name').max(80),
    lastName: z.string().trim().min(1, 'Enter your surname').max(80),
    graduationYear: year,
    finalClass: optionalText(60),
    /** Helps the school find their record. */
    admissionNumber: optionalText(40),
    email: optionalEmail,
    phone: optionalText(30),
    currentInstitution: optionalText(160),
    course: optionalText(120),
    occupation: optionalText(120),
    employer: optionalText(160),
    city: optionalText(80),
    country: optionalText(80),
    consentToContact: z.boolean().default(true),
    message: optionalText(1000),
    /** Honeypot: real people leave it empty. */
    website: z.string().max(0).optional(),
  })
  .refine((v) => !!v.email || !!v.phone, { message: 'Leave an email address or phone number so the school can reach you', path: ['email'] });
export type AlumniSignupInput = z.input<typeof alumniSignupSchema>;

/** Confirm a sign-up: optionally link it to the student record (merging into that student's alumni record if one exists). */
export const alumniVerifySchema = z.object({
  studentId: z.string().nullish(),
  /** Merge into this existing alumni record instead (the sign-up is folded in and removed). */
  intoId: z.string().nullish(),
});

export const alumniImportSchema = z.object({
  csv: z.string().min(1, 'Choose a CSV file').max(3_000_000),
  dryRun: z.boolean().default(true),
});

export const ALUMNI_MESSAGE_CHANNELS = ['SMS', 'EMAIL'] as const;
export const alumniMessageSchema = z.object({
  filter: alumniFilterSchema.default({}),
  /** Hand-picked alumni; empty = everyone matching the filter. */
  ids: z.array(z.string()).max(5000).default([]),
  channels: z.array(z.enum(ALUMNI_MESSAGE_CHANNELS)).min(1, 'Choose SMS, email or both'),
  title: z.string().trim().min(2).max(120),
  subject: z.string().trim().max(160).nullish().transform((v) => v || null),
  body: z.string().trim().min(5, 'Write the message').max(5000),
  sms: z.string().trim().max(480).nullish().transform((v) => v || null),
  /** Only count recipients; send nothing. */
  dryRun: z.boolean().default(false),
});
export type AlumniMessageInput = z.input<typeof alumniMessageSchema>;

// ============================================================ views

export interface AlumniRow {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  graduationYear: number | null;
  finalClass: string | null;
  email: string | null;
  phone: string | null;
  currentInstitution: string | null;
  course: string | null;
  occupation: string | null;
  employer: string | null;
  city: string | null;
  country: string | null;
  consentToContact: boolean;
  source: AlumniSource;
  verified: boolean;
  notes: string | null;
  student: { id: string; admissionNumber: string } | null;
  createdAt: string;
  updatedAt: string;
}

/** A likely match for an unverified sign-up. */
export interface AlumniMatch {
  /** The student record (null when the match is an alumni record with no student behind it, e.g. an import). */
  studentId: string | null;
  name: string;
  admissionNumber: string | null;
  graduationYear: number | null;
  finalClass: string | null;
  /** An existing alumni record the sign-up would merge into. */
  profileId: string | null;
  reason: string;
}

export interface AlumniPending extends AlumniRow {
  /** What they told us (admission number, message). */
  admissionNumberGiven: string | null;
  matches: AlumniMatch[];
}

export interface AlumniCount {
  name: string;
  count: number;
}

export interface AlumniStats {
  total: number;
  verified: number;
  pending: number;
  withConsent: number;
  reachable: { email: number; sms: number };
  byYear: { year: number; count: number }[];
  institutions: AlumniCount[];
  employers: AlumniCount[];
  occupations: AlumniCount[];
  cities: AlumniCount[];
  /** Graduated students who have no alumni record yet (fixable with the backfill). */
  graduatesWithoutRecord: number;
  years: number[];
  finalClasses: string[];
}

export interface AlumniImportResult {
  dryRun: boolean;
  create: number;
  update: number;
  skip: number;
  errors: { line: number; message: string }[];
  /** Headers recognised, for the preview. */
  columns: { header: string; field: string | null }[];
}

export interface AlumniMessageResult {
  recipients: number;
  /** Matching alumni who said no to contact, or have no address for the chosen channels. */
  excluded: number;
  broadcastId: string | null;
  notice: string | null;
}

export interface AlumniBackfillResult {
  created: number;
  updated: number;
}

/** CSV columns for import and export (export writes every one). */
export const ALUMNI_CSV_FIELDS = [
  { field: 'firstName', label: 'First name', aliases: ['first name', 'firstname', 'given name'] },
  { field: 'lastName', label: 'Surname', aliases: ['last name', 'lastname', 'surname', 'family name'] },
  { field: 'name', label: 'Name', aliases: ['full name', 'name'] },
  { field: 'graduationYear', label: 'Graduation year', aliases: ['year', 'class of', 'set', 'graduated', 'year of graduation'] },
  { field: 'finalClass', label: 'Final class', aliases: ['class', 'final class', 'last class'] },
  { field: 'email', label: 'Email', aliases: ['email address', 'e-mail'] },
  { field: 'phone', label: 'Phone', aliases: ['phone number', 'mobile', 'telephone', 'gsm'] },
  { field: 'currentInstitution', label: 'Institution', aliases: ['university', 'school', 'institution', 'current institution'] },
  { field: 'course', label: 'Course', aliases: ['course of study', 'programme', 'degree'] },
  { field: 'occupation', label: 'Occupation', aliases: ['job', 'profession', 'job title'] },
  { field: 'employer', label: 'Employer', aliases: ['company', 'organisation', 'organization', 'workplace'] },
  { field: 'city', label: 'City', aliases: ['town', 'location', 'state'] },
  { field: 'country', label: 'Country', aliases: [] },
  { field: 'consentToContact', label: 'Consent to contact', aliases: ['consent', 'contact ok', 'can contact'] },
  { field: 'notes', label: 'Notes', aliases: ['comment', 'comments', 'remarks'] },
] as const;
