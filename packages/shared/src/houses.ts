import { z } from 'zod';

/**
 * School houses (Aggrey, Azikiwe, Awolowo, Bello…) and house points. Points
 * come from awards staff give a house (inter-house sports, quizzes,
 * inspections) and, if the school wants, from the behaviour log: each
 * member's merits and demerits count towards their house.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const HOUSE_POINT_CATEGORIES = ['SPORTS', 'ACADEMIC', 'CONDUCT', 'CULTURAL', 'INSPECTION', 'OTHER'] as const;
export type HousePointCategory = (typeof HOUSE_POINT_CATEGORIES)[number];
export const HOUSE_POINT_CATEGORY_LABELS: Record<HousePointCategory, string> = {
  SPORTS: 'Sports',
  ACADEMIC: 'Academic',
  CONDUCT: 'Conduct',
  CULTURAL: 'Cultural',
  INSPECTION: 'Inspection',
  OTHER: 'Other',
};

/** Colours most Nigerian schools use for their houses. */
export const HOUSE_COLOUR_PRESETS = [
  { name: 'Red', hex: '#dc2626' },
  { name: 'Blue', hex: '#2563eb' },
  { name: 'Green', hex: '#16a34a' },
  { name: 'Yellow', hex: '#eab308' },
  { name: 'Purple', hex: '#7c3aed' },
  { name: 'Orange', hex: '#ea580c' },
  { name: 'Pink', hex: '#db2777' },
  { name: 'Maroon', hex: '#7f1d1d' },
  { name: 'Sky blue', hex: '#0ea5e9' },
  { name: 'Black', hex: '#1f2937' },
] as const;

export const houseSchema = z.object({
  name: z.string().trim().min(2, 'Give the house a name').max(60),
  colour: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #dc2626'),
  motto: optionalText(160),
  masterStaffId: z
    .string()
    .nullish()
    .transform((v) => v || null),
});
export type HouseInput = z.input<typeof houseSchema>;

/** Put students in a house (or take them out with houseId null): picked students and/or whole classes. */
export const houseSetSchema = z
  .object({
    mode: z.literal('SET'),
    houseId: z.string().nullable(),
    studentIds: z.array(z.string()).max(3000).default([]),
    classArmIds: z.array(z.string()).max(200).default([]),
  })
  .refine((v) => v.studentIds.length || v.classArmIds.length, 'Choose students or classes');

/** Share students out evenly across houses, class by class and boys/girls separately. */
export const houseBalanceSchema = z.object({
  mode: z.literal('BALANCED'),
  /** Empty = every class. */
  classArmIds: z.array(z.string()).max(200).default([]),
  /** Empty = every house. */
  houseIds: z.array(z.string()).max(50).default([]),
  /** Leave students who already have a house where they are. */
  onlyUnassigned: z.boolean().default(true),
});

export const houseAllocateSchema = z.union([houseSetSchema, houseBalanceSchema]);
export type HouseAllocateInput = z.input<typeof houseAllocateSchema>;

export const housePointSchema = z
  .object({
    /** Award a house directly… */
    houseId: z.string().nullish(),
    /** …or name students: each one's house gets the points, credited to them. */
    studentIds: z.array(z.string()).max(100).default([]),
    points: z
      .number()
      .int('Whole points only')
      .min(-500)
      .max(500)
      .refine((n) => n !== 0, 'Points cannot be zero'),
    reason: z.string().trim().min(2, 'Say what the points are for').max(200),
    category: z.enum(HOUSE_POINT_CATEGORIES).default('OTHER'),
    date: isoDate,
  })
  .refine((v) => !!v.houseId || v.studentIds.length > 0, { message: 'Choose a house or a student', path: ['houseId'] });
export type HousePointInput = z.input<typeof housePointSchema>;

export const houseSettingsSchema = z.object({
  /** Members' behaviour merits and demerits count towards their house. */
  countBehaviour: z.boolean(),
});
export type HouseSettings = z.infer<typeof houseSettingsSchema>;
export const DEFAULT_HOUSE_SETTINGS: HouseSettings = { countBehaviour: true };

export const HOUSE_PERIODS = ['TERM', 'SESSION', 'ALL', 'CUSTOM'] as const;
export type HousePeriod = (typeof HOUSE_PERIODS)[number];
export const houseStandingsQuerySchema = z.object({
  period: z.enum(HOUSE_PERIODS).default('TERM'),
  from: isoDate.optional(),
  to: isoDate.optional(),
});
export type HouseStandingsQuery = z.input<typeof houseStandingsQuerySchema>;

// ============================================================ views

export interface HouseRef {
  id: string;
  name: string;
  colour: string;
}

export interface HouseRow extends HouseRef {
  motto: string | null;
  master: { id: string; name: string } | null;
  members: number;
  boys: number;
  girls: number;
}

export interface HouseList {
  houses: HouseRow[];
  settings: HouseSettings;
  /** Active students without a house. */
  unassigned: number;
  /** For choosing a house master (managers only; empty otherwise). */
  staff: { id: string; name: string }[];
  canManage: boolean;
  canAward: boolean;
}

export interface HousePointRow {
  id: string;
  house: HouseRef;
  student: { id: string; name: string; className: string | null } | null;
  points: number;
  reason: string;
  category: HousePointCategory;
  date: string;
  awardedBy: string | null;
  createdAt: string;
  canDelete: boolean;
}

export interface HouseStanding {
  house: HouseRef & { motto: string | null };
  rank: number;
  /** Points awarded to the house in the period. */
  awarded: number;
  /** Members' behaviour points in the period (0 when not counted). */
  behaviour: number;
  total: number;
  members: number;
  byCategory: Partial<Record<HousePointCategory, number>>;
}

export interface HouseContributor {
  student: { id: string; name: string; className: string | null };
  house: HouseRef;
  points: number;
}

export interface HouseStandings {
  period: { kind: HousePeriod; label: string; from: string | null; to: string | null };
  countBehaviour: boolean;
  standings: HouseStanding[];
  recent: HousePointRow[];
  topContributors: HouseContributor[];
  updatedAt: string;
}

export interface HouseMember {
  id: string;
  name: string;
  admissionNumber: string;
  gender: 'MALE' | 'FEMALE';
  className: string | null;
}

export interface HouseDetail {
  house: HouseRow;
  members: HouseMember[];
  history: HousePointRow[];
  topContributors: HouseContributor[];
}

export interface HouseAllocateResult {
  assigned: number;
  unchanged: number;
  byHouse: { house: HouseRef; added: number; members: number }[];
}

export interface StudentHouseView {
  house: (HouseRef & { motto: string | null }) | null;
  houses: HouseRef[];
  canChange: boolean;
}

/** The family portal: a child's house and how the houses stand. */
export interface PortalHouse {
  house: (HouseRef & { motto: string | null }) | null;
  periodLabel: string;
  standings: { house: HouseRef; rank: number; total: number }[];
  /** Points credited to this child in the period (awards plus behaviour, if counted). */
  myPoints: number;
}
