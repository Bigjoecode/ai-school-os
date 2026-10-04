import { z } from 'zod';

/**
 * Admissions: applications from the website, the front desk and converted
 * enquiries, through entrance exam, interview and offer to enrolment.
 * Money is integer kobo, like finance.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const isoDateTime = z.iso.datetime({ offset: true }).or(z.iso.datetime());
const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const optionalId = z
  .string()
  .min(1)
  .nullish()
  .transform((v) => v ?? null);
const nullableEmail = z
  .union([z.email('Enter a valid email'), z.literal('')])
  .nullish()
  .transform((v) => (v ? v.toLowerCase() : null));
const personName = z.string().trim().min(1, 'Required').max(80);

// ============================================================ statuses

export const ADMISSION_STATUSES = ['SUBMITTED', 'REVIEWING', 'EXAM_SCHEDULED', 'INTERVIEW', 'OFFERED', 'ACCEPTED', 'ENROLLED', 'WAITLISTED', 'REJECTED', 'WITHDRAWN'] as const;
export type AdmissionStatus = (typeof ADMISSION_STATUSES)[number];
export const ADMISSION_STATUS_LABELS: Record<AdmissionStatus, string> = {
  SUBMITTED: 'Submitted',
  REVIEWING: 'Reviewing',
  EXAM_SCHEDULED: 'Exam scheduled',
  INTERVIEW: 'Interview',
  OFFERED: 'Offered',
  ACCEPTED: 'Accepted',
  ENROLLED: 'Enrolled',
  WAITLISTED: 'Waiting list',
  REJECTED: 'Not offered',
  WITHDRAWN: 'Withdrawn',
};
/** Still moving through the pipeline. */
export const ADMISSION_OPEN_STATUSES: AdmissionStatus[] = ['SUBMITTED', 'REVIEWING', 'EXAM_SCHEDULED', 'INTERVIEW', 'OFFERED', 'ACCEPTED', 'WAITLISTED'];
/** The main pipeline, in order (the board's columns). */
export const ADMISSION_PIPELINE: AdmissionStatus[] = ['SUBMITTED', 'REVIEWING', 'EXAM_SCHEDULED', 'INTERVIEW', 'OFFERED', 'ACCEPTED', 'ENROLLED'];

/** Where an application can go next. Enrolment has its own action (see ADMISSION_ENROLLABLE). */
export const ADMISSION_NEXT: Record<AdmissionStatus, AdmissionStatus[]> = {
  SUBMITTED: ['REVIEWING', 'EXAM_SCHEDULED', 'INTERVIEW', 'OFFERED', 'WAITLISTED', 'REJECTED', 'WITHDRAWN'],
  REVIEWING: ['EXAM_SCHEDULED', 'INTERVIEW', 'OFFERED', 'WAITLISTED', 'REJECTED', 'WITHDRAWN'],
  EXAM_SCHEDULED: ['EXAM_SCHEDULED', 'INTERVIEW', 'OFFERED', 'WAITLISTED', 'REJECTED', 'WITHDRAWN'],
  INTERVIEW: ['EXAM_SCHEDULED', 'INTERVIEW', 'OFFERED', 'WAITLISTED', 'REJECTED', 'WITHDRAWN'],
  OFFERED: ['OFFERED', 'ACCEPTED', 'WITHDRAWN'],
  ACCEPTED: ['WITHDRAWN'],
  ENROLLED: [],
  WAITLISTED: ['REVIEWING', 'EXAM_SCHEDULED', 'INTERVIEW', 'OFFERED', 'REJECTED', 'WITHDRAWN'],
  REJECTED: ['REVIEWING'],
  WITHDRAWN: ['REVIEWING'],
};
/** A place can be confirmed (student created) from these. */
export const ADMISSION_ENROLLABLE: AdmissionStatus[] = ['SUBMITTED', 'REVIEWING', 'EXAM_SCHEDULED', 'INTERVIEW', 'OFFERED', 'ACCEPTED', 'WAITLISTED'];

export const ADMISSION_SOURCES = ['WEBSITE', 'FRONT_DESK', 'ENQUIRY', 'PORTAL'] as const;
export type AdmissionSource = (typeof ADMISSION_SOURCES)[number];
export const ADMISSION_SOURCE_LABELS: Record<AdmissionSource, string> = {
  WEBSITE: 'School website',
  FRONT_DESK: 'Front desk',
  ENQUIRY: 'From an enquiry',
  PORTAL: 'Parent portal',
};

// ============================================================ settings

export const ADMISSION_NOTIFY_CHANNELS = ['SMS', 'EMAIL'] as const;
export type AdmissionNotifyChannel = (typeof ADMISSION_NOTIFY_CHANNELS)[number];

export const admissionsSettingsSchema = z.object({
  /** Charged per application (null or 0 = free). Recorded by staff when paid. */
  applicationFeeKobo: z.number().int().min(0).max(100_000_000).nullable(),
  /** Documents the school asks for (birth certificate, last result…). */
  documentChecklist: z.array(z.string().trim().min(2).max(80)).max(15),
  /** How parents hear about exam dates, offers and decisions. Empty = never automatically. */
  notifyChannels: z.array(z.enum(ADMISSION_NOTIFY_CHANNELS)).max(2),
  /** Default days a family has to accept an offer. */
  offerValidDays: z.number().int().min(1).max(90),
  /** Added to the exam invitation, e.g. "Bring a pencil, eraser and ruler". */
  examInstructions: nullableText(300),
});
export type AdmissionsSettings = z.infer<typeof admissionsSettingsSchema>;
export const DEFAULT_ADMISSIONS_SETTINGS: AdmissionsSettings = {
  applicationFeeKobo: null,
  documentChecklist: ['Birth certificate', 'Last school report', 'Passport photograph'],
  notifyChannels: ['SMS', 'EMAIL'],
  offerValidDays: 14,
  examInstructions: 'Please arrive 30 minutes early with a pencil, eraser and ruler.',
};

// ============================================================ inputs

export const applicationSchema = z.object({
  childFirstName: personName,
  childMiddleName: nullableText(80),
  childLastName: personName,
  gender: z.enum(['MALE', 'FEMALE'], 'Choose boy or girl'),
  dateOfBirth: isoDate.nullish().transform((v) => v ?? null),
  classLevelId: optionalId,
  entryTerm: nullableText(60),
  previousSchool: nullableText(160),
  parentName: z.string().trim().min(2, 'Enter the parent’s name').max(120),
  parentPhone: z.string().trim().min(7, 'Enter a phone number').max(20),
  parentEmail: nullableEmail,
  relationship: nullableText(30),
  address: nullableText(300),
  medicalNotes: nullableText(1000),
  notes: nullableText(2000),
  source: z.enum(ADMISSION_SOURCES).default('FRONT_DESK'),
  /** Converting a reception enquiry: links it and marks it Applied. */
  enquiryId: optionalId,
});
export type ApplicationInput = z.infer<typeof applicationSchema>;

export const applicationListQuerySchema = z.object({
  status: z.enum([...ADMISSION_STATUSES, 'OPEN', 'ALL']).optional(),
  classLevelId: z.string().optional(),
  source: z.enum(ADMISSION_SOURCES).optional(),
  q: z.string().trim().max(100).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});
export type ApplicationListQuery = z.infer<typeof applicationListQuerySchema>;

export const scheduleAssessmentSchema = z
  .object({
    examAt: isoDateTime.nullish().transform((v) => v ?? null),
    examVenue: nullableText(160),
    interviewAt: isoDateTime.nullish().transform((v) => v ?? null),
    notify: z.boolean().default(true),
  })
  .refine((v) => v.examAt || v.interviewAt, { message: 'Set an exam or an interview time', path: ['examAt'] });
export type ScheduleAssessmentInput = z.infer<typeof scheduleAssessmentSchema>;

export const examScoreSchema = z.object({
  examScore: z.number().min(0).max(1000),
  note: nullableText(1000),
});
export type ExamScoreInput = z.infer<typeof examScoreSchema>;

export const makeOfferSchema = z.object({
  offerExpiresOn: isoDate,
  /** Shown on the offer letter and in the message to the parent. */
  note: nullableText(1000),
  /** Offer a different class from the one applied for. */
  classLevelId: optionalId,
  notify: z.boolean().default(true),
});
export type MakeOfferInput = z.infer<typeof makeOfferSchema>;

export const admissionDecisionSchema = z.object({
  outcome: z.enum(['REJECTED', 'WAITLISTED']),
  /** Kept on the record for staff; the parent gets a standard, courteous message. */
  note: nullableText(1000),
  notify: z.boolean().default(true),
});
export type AdmissionDecisionInput = z.infer<typeof admissionDecisionSchema>;

/** Simple moves with no extra details: start review, accepted, withdrawn, reopen. */
export const admissionMoveSchema = z.object({
  status: z.enum(['REVIEWING', 'ACCEPTED', 'WITHDRAWN']),
  note: nullableText(1000),
});
export type AdmissionMoveInput = z.infer<typeof admissionMoveSchema>;

export const applicationFeeSchema = z.object({
  reference: z.string().trim().min(2, 'Enter the receipt or transfer reference').max(80),
  paidOn: isoDate.nullish().transform((v) => v ?? null),
});
export type ApplicationFeeInput = z.infer<typeof applicationFeeSchema>;

export const admissionDocumentSchema = z.object({
  fileId: z.string().min(1),
  name: z.string().trim().min(1).max(150),
  /** The checklist item it satisfies, or "Other". */
  kind: z.string().trim().min(1).max(80),
});
export type AdmissionDocument = z.infer<typeof admissionDocumentSchema>;

export const enrolApplicantSchema = z.object({
  classArmId: z.string().min(1, 'Choose a class'),
  /** Blank = the next number in the school's series. */
  admissionNumber: nullableText(30),
  admittedOn: isoDate.nullish().transform((v) => v ?? null),
  /** Link this existing parent instead of creating a new one. */
  guardianId: optionalId,
  guardian: z.object({
    firstName: personName,
    lastName: personName,
    relationship: z.string().trim().min(1).max(30),
    phone: z.string().trim().min(7).max(20),
    email: nullableEmail,
  }),
  createLogin: z.boolean().default(false),
  raiseInvoice: z.boolean().default(false),
  termId: optionalId,
  notify: z.boolean().default(true),
});
export type EnrolApplicantInput = z.infer<typeof enrolApplicantSchema>;

export const applicationStatusCheckSchema = z.object({
  number: z.string().trim().min(5).max(30),
  phone: z.string().trim().min(7).max(30),
  website: z.string().max(0).optional(),
});

// ============================================================ views

export interface AdmissionRow {
  id: string;
  number: string;
  status: AdmissionStatus;
  source: AdmissionSource;
  childName: string;
  childFirstName: string;
  childLastName: string;
  gender: 'MALE' | 'FEMALE';
  dateOfBirth: string | null;
  classLevel: { id: string; name: string } | null;
  entryTerm: string | null;
  parentName: string;
  parentPhone: string;
  parentEmail: string | null;
  examAt: string | null;
  examVenue: string | null;
  examScore: number | null;
  interviewAt: string | null;
  offerExpiresOn: string | null;
  /** A fee is set and not yet recorded as paid. */
  feeDue: boolean;
  documentsCount: number;
  studentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdmissionList {
  items: AdmissionRow[];
  total: number;
  page: number;
  pageSize: number;
  /** Pipeline counts per status, for the same search (ignoring the status filter). */
  counts: Record<AdmissionStatus, number>;
}

export interface AdmissionNotification {
  channels: string[];
  sent: number;
  queued: number;
  failed: number;
  skipped: number;
  /** The first reason a message was skipped or failed. */
  problem: string | null;
}

export interface AdmissionEvent {
  id: string;
  at: string;
  action: string;
  summary: string;
  actor: string | null;
  notification: AdmissionNotification | null;
}

export interface AdmissionDetail extends AdmissionRow {
  childMiddleName: string | null;
  previousSchool: string | null;
  relationship: string | null;
  address: string | null;
  medicalNotes: string | null;
  notes: string | null;
  decisionNote: string | null;
  applicationFeeKobo: number | null;
  feePaidAt: string | null;
  feeReference: string | null;
  documents: AdmissionDocument[];
  enquiryId: string | null;
  student: { id: string; name: string; admissionNumber: string; classArm: string | null } | null;
  createdBy: string | null;
  timeline: AdmissionEvent[];
  /** Statuses this application can move to now. */
  next: AdmissionStatus[];
  canEnrol: boolean;
}

export interface AdmissionsLetterhead {
  name: string;
  motto: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
}

export interface AdmissionsMeta {
  settings: AdmissionsSettings;
  currency: string;
  today: string;
  classLevels: { id: string; name: string; arms: { id: string; name: string; capacity: number | null; students: number }[] }[];
  terms: { id: string; name: string; session: string; isCurrent: boolean; startsOn: string; endsOn: string }[];
  school: AdmissionsLetterhead;
}

export interface FeeSummary {
  termId: string;
  termName: string;
  items: { name: string; amountKobo: number }[];
  totalKobo: number;
}

export interface EnrolPreview {
  alreadyEnrolled: boolean;
  admissionNumber: string;
  suggestedGuardian: { firstName: string; lastName: string; relationship: string; phone: string; email: string | null };
  guardianMatches: { id: string; name: string; phone: string; email: string | null; relationship: string; hasLogin: boolean; children: string[]; matchedOn: 'phone' | 'email' | 'both' }[];
  /** The email already has an account somewhere on the platform (a login will reuse it). */
  emailHasAccount: boolean;
  arms: { id: string; name: string; classLevel: string; capacity: number | null; students: number }[];
  fees: FeeSummary | null;
}

export interface EnrolResult {
  student: { id: string; name: string; admissionNumber: string; classArm: string };
  guardian: { id: string; name: string; created: boolean };
  /** Present when a portal login was requested. A password only for a brand-new account. */
  login: { email: string; password: string | null; existing: boolean } | null;
  invoice: { id: string; number: string; totalKobo: number } | null;
  /** Why no invoice was raised when one was asked for. */
  invoiceNote: string | null;
  notified: boolean;
}

export interface OfferLetter {
  school: AdmissionsLetterhead;
  currency: string;
  number: string;
  status: AdmissionStatus;
  childName: string;
  dateOfBirth: string | null;
  classLevel: string | null;
  entryTerm: string | null;
  parentName: string;
  address: string | null;
  offeredOn: string;
  offerExpiresOn: string | null;
  note: string | null;
  fees: FeeSummary | null;
}

export interface AdmissionsStats {
  window: { label: string; from: string; to: string };
  total: number;
  byStatus: Record<AdmissionStatus, number>;
  /** Enrolled ÷ applications in the window (null when there are none). */
  conversionRate: number | null;
  /** Accepted or enrolled ÷ offers made (null when no offers). */
  offerAcceptanceRate: number | null;
  byClass: { classLevelId: string | null; name: string; count: number; enrolled: number }[];
  bySource: { source: AdmissionSource; count: number }[];
  feesCollectedKobo: number;
  examsThisWeek: number;
  offersExpiringSoon: number;
}

export interface PublicApplicationStatus {
  number: string;
  childFirstName: string;
  status: AdmissionStatus;
  label: string;
  /** What happens next, in plain words. */
  message: string;
  examAt: string | null;
  examVenue: string | null;
  interviewAt: string | null;
  offerExpiresOn: string | null;
  fee: { amountKobo: number; paid: boolean } | null;
  currency: string;
}
