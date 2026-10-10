import { z } from 'zod';

/**
 * Returns & census: ASC-style summary tables a school can copy into its
 * state's Annual School Census form (SUBEB / State Ministry of Education)
 * and working lists for exam-body registration.
 *
 * Nothing here is an official form layout or code list. Every screen and
 * export carries CENSUS_DISCLAIMER so the school checks against its state's
 * current template.
 */
export const CENSUS_DISCLAIMER =
  "Prepared to help you complete your state's official form — check against your state's current template.";

export const CANDIDATES_DISCLAIMER =
  'Working list to help you prepare exam-body registration. It is not the official upload format: check names, dates of birth and subjects against the exam body’s current registration portal.';

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const optCount = z.coerce.number().int().min(0).max(100_000).nullish().transform((v) => (v == null || Number.isNaN(v) ? null : v));
const optBool = z.boolean().nullish().transform((v) => v ?? null);

export const SCHOOL_OWNERSHIPS = ['PRIVATE', 'PUBLIC', 'MISSION', 'COMMUNITY', 'OTHER'] as const;
export const OWNERSHIP_LABELS: Record<(typeof SCHOOL_OWNERSHIPS)[number], string> = {
  PRIVATE: 'Private (proprietor)',
  PUBLIC: 'Public (government)',
  MISSION: 'Mission / faith-based',
  COMMUNITY: 'Community',
  OTHER: 'Other',
};
export const SCHOOL_LOCALITIES = ['URBAN', 'RURAL'] as const;

export const WATER_SOURCES = ['PIPE_BORNE', 'BOREHOLE', 'WELL', 'RAINWATER', 'TANKER', 'OTHER', 'NONE'] as const;
export const WATER_SOURCE_LABELS: Record<(typeof WATER_SOURCES)[number], string> = {
  PIPE_BORNE: 'Pipe-borne',
  BOREHOLE: 'Borehole',
  WELL: 'Well',
  RAINWATER: 'Rainwater',
  TANKER: 'Water vendor / tanker',
  OTHER: 'Other',
  NONE: 'No water source',
};
export const POWER_SOURCES = ['GRID', 'GENERATOR', 'SOLAR', 'OTHER', 'NONE'] as const;
export const POWER_SOURCE_LABELS: Record<(typeof POWER_SOURCES)[number], string> = {
  GRID: 'Public grid',
  GENERATOR: 'Generator',
  SOLAR: 'Solar',
  OTHER: 'Other',
  NONE: 'No power source',
};

/** Suggested categories only: rename them to match your state's form. */
export const SPECIAL_NEEDS_SUGGESTIONS = ['Visual impairment', 'Hearing impairment', 'Physical disability', 'Learning difficulty', 'Speech impairment', 'Other'] as const;

export const specialNeedsCountSchema = z.object({
  category: z.string().trim().min(1).max(60),
  male: z.coerce.number().int().min(0).max(100_000).default(0),
  female: z.coerce.number().int().min(0).max(100_000).default(0),
});

/** The facilities and identity details the census asks for that the rest of the app doesn't record. */
export const censusProfileSchema = z.object({
  ownership: z.enum(SCHOOL_OWNERSHIPS).nullish().transform((v) => v ?? null),
  registrationNumber: optText(60),
  yearEstablished: z.coerce.number().int().min(1800).max(2100).nullish().transform((v) => v ?? null),
  state: optText(40),
  lga: optText(80),
  ward: optText(80),
  locality: z.enum(SCHOOL_LOCALITIES).nullish().transform((v) => v ?? null),
  gpsLatitude: z.coerce.number().min(-90).max(90).nullish().transform((v) => v ?? null),
  gpsLongitude: z.coerce.number().min(-180).max(180).nullish().transform((v) => v ?? null),
  headName: optText(120),
  headPhone: optText(20),
  classroomsGood: optCount,
  classroomsMinorRepairs: optCount,
  classroomsMajorRepairs: optCount,
  toiletsBoys: optCount,
  toiletsGirls: optCount,
  toiletsStaff: optCount,
  toiletsShared: optCount,
  waterSources: z.array(z.enum(WATER_SOURCES)).max(WATER_SOURCES.length).default([]),
  powerSources: z.array(z.enum(POWER_SOURCES)).max(POWER_SOURCES.length).default([]),
  playground: optBool,
  library: optBool,
  sickBay: optBool,
  fence: optBool,
  handWashing: optBool,
  scienceLabs: optCount,
  computerLabs: optCount,
  computersForPupils: optCount,
  /** Entered by hand: the app does not keep a per-pupil special-needs record. */
  specialNeeds: z.array(specialNeedsCountSchema).max(20).default([]),
  notes: optText(1000),
});
export type CensusProfileInput = z.input<typeof censusProfileSchema>;
export type CensusProfile = z.output<typeof censusProfileSchema>;

/** Stored in Tenant.operationsSettings.census. `branches` holds per-campus overrides. */
export const censusSettingsSchema = z.object({
  main: censusProfileSchema,
  branches: z.record(z.string(), censusProfileSchema).default({}),
  /** Opt-in: let the platform include this school's anonymous totals in state/LGA counts. */
  shareAggregates: z.boolean().default(false),
});
export type CensusSettingsInput = z.input<typeof censusSettingsSchema>;
export type CensusSettings = z.output<typeof censusSettingsSchema>;

export const saveCensusProfileSchema = z.object({
  /** null = the whole school (main profile). */
  branchId: z.string().min(1).nullish().transform((v) => v ?? null),
  profile: censusProfileSchema,
  shareAggregates: z.boolean().optional(),
});
export type SaveCensusProfileInput = z.input<typeof saveCensusProfileSchema>;

export const censusQuerySchema = z.object({
  sessionId: z.string().min(1).optional(),
  termId: z.string().min(1).optional(),
  /** Omit for the combined school. */
  branchId: z.string().min(1).optional(),
});
export type CensusQuery = z.infer<typeof censusQuerySchema>;

export const candidatesQuerySchema = z.object({
  classLevelId: z.string().min(1),
  branchId: z.string().min(1).optional(),
});
export type CandidatesQuery = z.infer<typeof candidatesQuerySchema>;

export type CensusCell = string | number | null;

export interface CensusTable {
  key: string;
  title: string;
  note?: string;
  columns: string[];
  rows: CensusCell[][];
  /** Totals row (first cell is the label). */
  totals?: CensusCell[];
}

export interface CensusSection {
  key: 'enrolment' | 'age' | 'entrants' | 'welfare' | 'teachers' | 'nonTeaching' | 'facilities' | 'attendance';
  title: string;
  description: string;
  tables: CensusTable[];
}

export interface CensusQualityIssue {
  key: string;
  label: string;
  count: number;
  /** Where to fix it in the app. */
  fixTo: string;
  fixLabel: string;
  /** A few examples (name + admission/staff number) for staff with the right to see them. */
  examples: string[];
}

export interface CensusReport {
  disclaimer: string;
  school: { name: string; address: string | null; logoUrl: string | null };
  branches: { id: string; name: string }[];
  /** Class levels in order (for the candidate list picker). */
  levels: { id: string; name: string }[];
  branch: { id: string; name: string } | null;
  sessions: { id: string; name: string; isCurrent: boolean; terms: { id: string; name: string; isCurrent: boolean }[] }[];
  session: { id: string; name: string; startsOn: string; endsOn: string; isCurrent: boolean } | null;
  term: { id: string; name: string; startsOn: string; endsOn: string } | null;
  /** Date ages are worked out at (the session start). */
  ageAsAt: string | null;
  /** Where the enrolment figures come from. */
  enrolmentBasis: 'CURRENT_ROLL' | 'PROMOTION_RECORDS' | 'NONE';
  profile: CensusProfile | null;
  /** True when a branch has no profile of its own and the whole-school profile is shown. */
  profileFromMain: boolean;
  sections: CensusSection[];
  quality: CensusQualityIssue[];
  generatedAt: string;
}

export interface CensusCandidate {
  admissionNumber: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  sex: 'M' | 'F';
  dateOfBirth: string | null;
  classArm: string;
  subjects: string[];
}

export interface CensusCandidates {
  disclaimer: string;
  classLevel: { id: string; name: string };
  candidates: CensusCandidate[];
  classLevels: { id: string; name: string }[];
}

/** Platform preview: counts only, from schools that opted in. */
export interface CensusAggregateRow {
  state: string;
  lga: string;
  schools: number;
  pupilsMale: number;
  pupilsFemale: number;
  teachersMale: number;
  teachersFemale: number;
  classrooms: number;
}

export interface CensusAggregate {
  preview: true;
  note: string;
  optedIn: number;
  totalSchools: number;
  rows: CensusAggregateRow[];
}
