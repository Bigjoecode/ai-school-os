import { z } from 'zod';
import { CHANNELS, type Channel } from './comms';

/**
 * Student welfare: the behaviour log (merits, demerits, incidents), the sick
 * bay, and each student's medical profile. Parents see behaviour the school
 * marks as visible, their child's sick-bay visits and the medical profile;
 * students see their own behaviour only.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

// ============================================================ behaviour

export const BEHAVIOUR_KINDS = ['MERIT', 'DEMERIT', 'INCIDENT'] as const;
export type BehaviourKind = (typeof BEHAVIOUR_KINDS)[number];
export const BEHAVIOUR_KIND_LABELS: Record<BehaviourKind, string> = {
  MERIT: 'Merit',
  DEMERIT: 'Demerit',
  INCIDENT: 'Incident',
};

export interface BehaviourCategoryDef {
  key: string;
  label: string;
  /** The kinds this category is offered for. */
  kinds: readonly BehaviourKind[];
  /** Suggested points (positive; the sign comes from the kind). */
  points: number;
  severity: BehaviourSeverity;
}

/** A sensible starting list for Nigerian schools; schools can add their own later. */
export const BEHAVIOUR_CATEGORIES: readonly BehaviourCategoryDef[] = [
  { key: 'ACADEMIC_EXCELLENCE', label: 'Academic excellence', kinds: ['MERIT'], points: 3, severity: 'LOW' },
  { key: 'LEADERSHIP', label: 'Leadership', kinds: ['MERIT'], points: 2, severity: 'LOW' },
  { key: 'HELPFULNESS', label: 'Helpfulness', kinds: ['MERIT'], points: 1, severity: 'LOW' },
  { key: 'GOOD_CONDUCT', label: 'Good conduct', kinds: ['MERIT'], points: 1, severity: 'LOW' },
  { key: 'SPORTS', label: 'Sports', kinds: ['MERIT'], points: 2, severity: 'LOW' },
  { key: 'COMMUNITY_SERVICE', label: 'Community service', kinds: ['MERIT'], points: 2, severity: 'LOW' },
  { key: 'PUNCTUALITY', label: 'Punctuality', kinds: ['MERIT', 'DEMERIT'], points: 1, severity: 'LOW' },
  { key: 'UNIFORM', label: 'Uniform / appearance', kinds: ['DEMERIT'], points: 1, severity: 'LOW' },
  { key: 'HOMEWORK', label: 'Homework not done', kinds: ['DEMERIT'], points: 1, severity: 'LOW' },
  { key: 'DISRUPTION', label: 'Noise / disruption', kinds: ['DEMERIT'], points: 1, severity: 'LOW' },
  { key: 'RESPECT', label: 'Disrespect', kinds: ['DEMERIT', 'INCIDENT'], points: 2, severity: 'MEDIUM' },
  { key: 'PHONE', label: 'Unauthorised phone', kinds: ['DEMERIT', 'INCIDENT'], points: 2, severity: 'MEDIUM' },
  { key: 'TRUANCY', label: 'Truancy', kinds: ['DEMERIT', 'INCIDENT'], points: 3, severity: 'MEDIUM' },
  { key: 'FIGHTING', label: 'Fighting', kinds: ['INCIDENT', 'DEMERIT'], points: 5, severity: 'HIGH' },
  { key: 'BULLYING', label: 'Bullying', kinds: ['INCIDENT', 'DEMERIT'], points: 5, severity: 'HIGH' },
  { key: 'VANDALISM', label: 'Damage to property', kinds: ['INCIDENT', 'DEMERIT'], points: 4, severity: 'MEDIUM' },
  { key: 'THEFT', label: 'Stealing', kinds: ['INCIDENT'], points: 5, severity: 'HIGH' },
  { key: 'EXAM_MALPRACTICE', label: 'Exam malpractice', kinds: ['INCIDENT', 'DEMERIT'], points: 10, severity: 'HIGH' },
  { key: 'OTHER', label: 'Other', kinds: ['MERIT', 'DEMERIT', 'INCIDENT'], points: 1, severity: 'LOW' },
];

export function behaviourCategoryLabel(key: string): string {
  return BEHAVIOUR_CATEGORIES.find((c) => c.key === key)?.label ?? key.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export const BEHAVIOUR_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type BehaviourSeverity = (typeof BEHAVIOUR_SEVERITIES)[number];
export const BEHAVIOUR_SEVERITY_LABELS: Record<BehaviourSeverity, string> = { LOW: 'Minor', MEDIUM: 'Moderate', HIGH: 'Serious' };

export const BEHAVIOUR_STATUSES = ['OPEN', 'RESOLVED'] as const;
export type BehaviourStatus = (typeof BEHAVIOUR_STATUSES)[number];

/** Suggestions for "action taken"; the field stays free text. */
export const BEHAVIOUR_ACTIONS = [
  'Verbal warning',
  'Apology letter',
  'Detention',
  'Extra duty',
  'Letter to parents',
  'Parent conference',
  'Referred to counsellor',
  'Referred to the principal',
  'Suspension',
  'Commendation',
  'Certificate of merit',
] as const;

/** Paid channels (SMS, email) need messaging permission; in-app and push are always free. */
export const WELFARE_NOTIFY_CHANNELS = ['IN_APP', 'PUSH', 'SMS', 'EMAIL'] as const satisfies readonly Channel[];
const notifyChannels = z.array(z.enum(CHANNELS)).max(5).default(['IN_APP', 'PUSH']);

export const behaviourSchema = z.object({
  /** One record per student; a merit can be given to several at once. */
  studentIds: z.array(z.string().min(1)).min(1, 'Choose at least one student').max(60),
  date: isoDate,
  kind: z.enum(BEHAVIOUR_KINDS),
  category: z.string().trim().min(1).max(40),
  title: z.string().trim().min(2, 'Give it a short title').max(140),
  description: optionalText(2000),
  /** Size of the award or deduction; the sign comes from the kind (merits +, demerits/incidents −). */
  points: z.number().int().min(0).max(50).default(0),
  severity: z.enum(BEHAVIOUR_SEVERITIES).default('LOW'),
  actionTaken: optionalText(300),
  status: z.enum(BEHAVIOUR_STATUSES).optional(),
  visibleToParents: z.boolean().default(true),
  notifyParents: z.boolean().default(false),
  channels: notifyChannels,
});
export type BehaviourInput = z.input<typeof behaviourSchema>;
export type BehaviourParsed = z.output<typeof behaviourSchema>;

export const behaviourUpdateSchema = behaviourSchema.omit({ studentIds: true, notifyParents: true, channels: true }).partial();
export type BehaviourUpdateInput = z.input<typeof behaviourUpdateSchema>;

export const notifyParentsSchema = z.object({ channels: notifyChannels, message: optionalText(1000) });
export type NotifyParentsInput = z.input<typeof notifyParentsSchema>;

export interface WelfareStudentRef {
  id: string;
  name: string;
  admissionNumber: string;
  className: string | null;
  classArmId: string | null;
}

export interface BehaviourRow {
  id: string;
  student: WelfareStudentRef;
  date: string;
  kind: BehaviourKind;
  category: string;
  title: string;
  description: string | null;
  /** Signed: + for merits, − for demerits and incidents. */
  points: number;
  severity: BehaviourSeverity;
  actionTaken: string | null;
  status: BehaviourStatus;
  visibleToParents: boolean;
  parentNotifiedAt: string | null;
  reportedBy: { id: string; name: string } | null;
  resolvedAt: string | null;
  createdAt: string;
  /** The signed-in user may edit or delete it (their own record, or senior staff). */
  canEdit: boolean;
}

export interface BehaviourTally {
  merits: number;
  demerits: number;
  incidents: number;
  points: number;
  open: number;
}

export interface WelfareTermRef {
  id: string;
  name: string;
  sessionName: string;
  startsOn: string;
  endsOn: string;
}

export interface BehaviourCreateResult {
  records: BehaviourRow[];
  /** Parents reached, when notifying was asked for. */
  notified: number;
  notice: string | null;
}

export interface StudentBehaviour {
  student: WelfareStudentRef;
  term: WelfareTermRef | null;
  /** This term. */
  termTally: BehaviourTally;
  /** Since the student joined. */
  allTime: BehaviourTally;
  records: BehaviourRow[];
}

export interface ClassBehaviourRow extends BehaviourTally {
  student: WelfareStudentRef;
  lastDate: string | null;
}

export interface ClassBehaviourSummary {
  classArmId: string;
  className: string;
  term: WelfareTermRef | null;
  totals: BehaviourTally;
  students: ClassBehaviourRow[];
}

export interface BehaviourDashboard {
  from: string;
  to: string;
  totals: BehaviourTally;
  byCategory: { category: string; label: string; merits: number; demerits: number; incidents: number }[];
  byClass: ({ classArmId: string; className: string } & BehaviourTally)[];
  topStudents: { student: WelfareStudentRef; points: number; merits: number }[];
  concerns: { student: WelfareStudentRef; points: number; demerits: number; incidents: number }[];
  openIncidents: BehaviourRow[];
}

// ============================================================ sick bay

export const SICK_BAY_OUTCOMES = ['RETURNED_TO_CLASS', 'OBSERVATION', 'SENT_HOME', 'REFERRED', 'HOSPITAL'] as const;
export type SickBayOutcome = (typeof SICK_BAY_OUTCOMES)[number];
export const SICK_BAY_OUTCOME_LABELS: Record<SickBayOutcome, string> = {
  RETURNED_TO_CLASS: 'Returned to class',
  OBSERVATION: 'Under observation',
  SENT_HOME: 'Sent home',
  REFERRED: 'Referred',
  HOSPITAL: 'Taken to hospital',
};
/** Outcomes where the parent must be told (the form always offers it). */
export const SICK_BAY_SERIOUS: readonly SickBayOutcome[] = ['SENT_HOME', 'REFERRED', 'HOSPITAL'];

/** Common complaints, as quick picks. */
export const SICK_BAY_COMPLAINTS = ['Headache', 'Fever', 'Stomach ache', 'Malaria symptoms', 'Vomiting', 'Diarrhoea', 'Injury', 'Cough / catarrh', 'Menstrual pain', 'Asthma attack', 'Toothache', 'Dizziness'] as const;

export const sickBayVisitSchema = z.object({
  studentId: z.string().min(1, 'Choose a student'),
  /** ISO date-time; defaults to now. */
  visitedAt: z.iso.datetime({ offset: true }).or(z.iso.datetime()).optional(),
  complaint: z.string().trim().min(2, 'What is wrong?').max(300),
  temperature: z.number().min(30, 'Check the temperature').max(45, 'Check the temperature').nullish().transform((v) => v ?? null),
  assessment: optionalText(1000),
  treatment: optionalText(1000),
  medication: optionalText(500),
  outcome: z.enum(SICK_BAY_OUTCOMES).default('RETURNED_TO_CLASS'),
  followUp: optionalText(500),
  notifyParents: z.boolean().default(false),
  channels: notifyChannels,
});
export type SickBayVisitInput = z.input<typeof sickBayVisitSchema>;

export const sickBayUpdateSchema = sickBayVisitSchema.omit({ studentId: true, notifyParents: true, channels: true }).partial();
export type SickBayUpdateInput = z.input<typeof sickBayUpdateSchema>;

export interface SickBayRow {
  id: string;
  student: WelfareStudentRef;
  visitedAt: string;
  complaint: string;
  temperature: number | null;
  assessment: string | null;
  treatment: string | null;
  medication: string | null;
  outcome: SickBayOutcome;
  followUp: string | null;
  parentNotifiedAt: string | null;
  recordedBy: { id: string; name: string } | null;
  createdAt: string;
}

export interface SickBaySummary {
  today: number;
  todayByOutcome: Record<SickBayOutcome, number>;
  /** Visits still under observation (any day). */
  underObservation: number;
  last7Days: number;
  /** Students seen three or more times in 30 days. */
  frequent: { student: WelfareStudentRef; visits: number }[];
}

export interface SickBayCreateResult {
  visit: SickBayRow;
  notified: number;
  notice: string | null;
}

// ============================================================ medical profile

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export type BloodGroup = (typeof BLOOD_GROUPS)[number];
export const GENOTYPES = ['AA', 'AS', 'AC', 'SS', 'SC'] as const;
export type Genotype = (typeof GENOTYPES)[number];

export const medicalProfileSchema = z.object({
  bloodGroup: z.enum(BLOOD_GROUPS).nullish().transform((v) => v ?? null),
  genotype: z.enum(GENOTYPES).nullish().transform((v) => v ?? null),
  allergies: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  chronicConditions: optionalText(1000),
  medicalNotes: optionalText(2000),
});
export type MedicalProfileInput = z.input<typeof medicalProfileSchema>;

export interface MedicalProfile {
  studentId: string;
  student: WelfareStudentRef;
  bloodGroup: string | null;
  genotype: string | null;
  allergies: string[];
  chronicConditions: string | null;
  medicalNotes: string | null;
}

/** Things a nurse or teacher must notice at a glance. */
export function medicalAlerts(p: Pick<MedicalProfile, 'genotype' | 'allergies' | 'chronicConditions'>): string[] {
  const out: string[] = [];
  if (p.allergies.length) out.push(`Allergic to ${p.allergies.join(', ')}`);
  if (p.genotype === 'SS' || p.genotype === 'SC') out.push(`Genotype ${p.genotype} (sickle cell)`);
  if (p.chronicConditions) out.push(p.chronicConditions);
  return out;
}

export interface MedicalAlertRow {
  student: WelfareStudentRef;
  bloodGroup: string | null;
  genotype: string | null;
  allergies: string[];
  chronicConditions: string | null;
}

/** For the student profile sheet. */
export interface StudentWelfareSummary {
  medical: MedicalProfile;
  behaviour: { term: WelfareTermRef | null; tally: BehaviourTally; recent: BehaviourRow[] };
  sickBay: SickBayRow[];
}

// ============================================================ family portal

export interface PortalBehaviourRecord {
  id: string;
  date: string;
  kind: BehaviourKind;
  category: string;
  title: string;
  description: string | null;
  points: number;
  actionTaken: string | null;
  status: BehaviourStatus;
}

export interface PortalSickBayVisit {
  id: string;
  visitedAt: string;
  complaint: string;
  temperature: number | null;
  treatment: string | null;
  medication: string | null;
  outcome: SickBayOutcome;
  followUp: string | null;
}

export interface PortalWelfare {
  term: WelfareTermRef | null;
  /** This term, counting only what the school shares with families. */
  tally: BehaviourTally;
  behaviour: PortalBehaviourRecord[];
  /** Parents only (null for students). */
  sickBay: PortalSickBayVisit[] | null;
  /** Parents only (null for students). */
  medical: Omit<MedicalProfile, 'student' | 'studentId'> | null;
}
