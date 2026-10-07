import { z } from 'zod';

/**
 * Data protection (Nigeria Data Protection Act 2023): the legal documents'
 * versions, parental consent to the privacy notice, the school's acceptance of
 * the Data Processing Agreement, and data subject requests.
 *
 * Every document is a DRAFT FOR LEGAL REVIEW until counsel signs it off.
 * Bump a version when the text changes in a way parents or schools must
 * accept again: parents whose recorded version differs are asked again.
 */
export const LEGAL_VERSIONS = {
  privacy: '2026-10-draft-1',
  terms: '2026-10-draft-1',
  dpa: '2026-10-draft-1',
  subprocessors: '2026-10-draft-1',
  ai: '2026-10-draft-1',
  retention: '2026-10-draft-1',
} as const;

/** The notice parents agree to: consent is recorded against this version. */
export const PRIVACY_NOTICE_VERSION = LEGAL_VERSIONS.privacy;
export const DPA_VERSION = LEGAL_VERSIONS.dpa;

export const LEGAL_DOCS = [
  { slug: 'privacy', title: 'Privacy notice', short: 'Privacy', description: 'What we collect about students, parents and staff, why, and your rights.' },
  { slug: 'children', title: 'How we use AI with your children’s data', short: 'AI & children', description: 'Which AI services see what, and the safeguards around them.' },
  { slug: 'terms', title: 'School Terms of Service', short: 'Terms', description: 'The agreement between a school and the platform operator.' },
  { slug: 'dpa', title: 'Data Processing Agreement', short: 'DPA', description: 'The school (controller) and the platform operator (processor).' },
  { slug: 'subprocessors', title: 'Sub-processors', short: 'Sub-processors', description: 'The service providers that help run AI School OS.' },
  { slug: 'retention', title: 'Data retention', short: 'Retention', description: 'What the platform keeps, and for how long.' },
] as const;
export type LegalDocSlug = (typeof LEGAL_DOCS)[number]['slug'];

// ============================================================ school settings

/** Stored in Tenant.portalSettings.dataProtection (no migration). */
export interface DataProtectionSettings {
  /** Parents must accept the privacy notice before using the portal. Default true. */
  consentRequired: boolean;
  dpa: DpaAcceptance | null;
}

export interface DpaAcceptance {
  version: string;
  acceptedAt: string;
  acceptedByUserId: string;
  acceptedByName: string;
  signatoryName: string;
  signatoryTitle: string;
}

export const DEFAULT_DATA_PROTECTION_SETTINGS: DataProtectionSettings = { consentRequired: true, dpa: null };

export const dataProtectionSettingsSchema = z.object({ consentRequired: z.boolean() });
export type DataProtectionSettingsInput = z.infer<typeof dataProtectionSettingsSchema>;

export const dpaAcceptSchema = z.object({
  version: z.string().min(1).max(40),
  signatoryName: z.string().trim().min(2, 'Enter the name of the person accepting').max(120),
  signatoryTitle: z.string().trim().min(2, 'Enter their position, e.g. Proprietor or Principal').max(120),
  confirm: z.literal(true, { message: 'Tick to confirm you are authorised to accept for the school' }),
});
export type DpaAcceptInput = z.infer<typeof dpaAcceptSchema>;

// ============================================================ parental consent

export const consentAcceptSchema = z.object({
  version: z.string().min(1).max(40),
  agree: z.literal(true, { message: 'Tick the box to agree on behalf of your child(ren)' }),
});
export type ConsentAcceptInput = z.infer<typeof consentAcceptSchema>;

export const consentWithdrawSchema = z.object({
  reason: z.string().trim().max(1000).nullish().transform((v) => v || null),
});
export type ConsentWithdrawInput = z.infer<typeof consentWithdrawSchema>;

export type ConsentState = 'CURRENT' | 'OUTDATED' | 'WITHDRAWN' | 'PENDING';

export const CONSENT_STATE_LABELS: Record<ConsentState, string> = {
  CURRENT: 'Agreed (current notice)',
  OUTDATED: 'Agreed to an older notice',
  WITHDRAWN: 'Withdrawn',
  PENDING: 'Not yet',
};

/** The signed-in user's consent position in the current school. */
export interface MyConsentStatus {
  /** The user is a parent/guardian of this school (consent applies to them). */
  applies: boolean;
  /** The school requires consent before the portal can be used. */
  required: boolean;
  /** Show the full-screen consent step (required, not given, and the user is only a parent here). */
  blocking: boolean;
  state: ConsentState;
  currentVersion: string;
  consentedAt: string | null;
  consentedVersion: string | null;
  withdrawnAt: string | null;
  schoolName: string;
  children: string[];
  /** Optional, more sensitive features this school has switched on (mentioned in the consent text). */
  features: { aiTutor: boolean; parentAi: boolean; whatsappAssistant: boolean };
  /** What the user agreed to, newest first (from the audit trail). */
  history: { at: string; action: 'GIVEN' | 'WITHDRAWN'; version: string | null }[];
}

// ============================================================ school admin

export interface ConsentCoverage {
  guardians: number;
  withLogin: number;
  current: number;
  outdated: number;
  withdrawn: number;
  pending: number;
  /** Pending among parents who have a portal login (the ones who will see the consent step). */
  pendingWithLogin: number;
}

export interface DataProtectionOverview {
  settings: DataProtectionSettings;
  versions: typeof LEGAL_VERSIONS;
  coverage: ConsentCoverage;
  recentWithdrawals: { guardianId: string; name: string; at: string; reason: string | null }[];
}

export const DSR_SUBJECT_TYPES = ['student', 'guardian', 'staff'] as const;
export type DsrSubjectType = (typeof DSR_SUBJECT_TYPES)[number];

export interface DsrSubjectHit {
  type: DsrSubjectType;
  id: string;
  name: string;
  detail: string;
}

export const DSR_KINDS = ['ACCESS', 'CORRECTION', 'DELETION', 'OBJECTION', 'PORTABILITY', 'OTHER'] as const;
export type DsrKind = (typeof DSR_KINDS)[number];
export const DSR_KIND_LABELS: Record<DsrKind, string> = {
  ACCESS: 'Access (a copy of their data)',
  CORRECTION: 'Correction',
  DELETION: 'Deletion (erasure)',
  OBJECTION: 'Objection / restriction',
  PORTABILITY: 'Portability',
  OTHER: 'Other',
};

export const dsrLogSchema = z.object({
  kind: z.enum(DSR_KINDS),
  subjectType: z.enum(DSR_SUBJECT_TYPES).nullish().transform((v) => v ?? null),
  subjectId: z.string().max(40).nullish().transform((v) => v || null),
  subjectName: z.string().trim().min(2, 'Who is the request about?').max(160),
  requesterName: z.string().trim().min(2, 'Who made the request?').max(160),
  receivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick the date it was received'),
  notes: z.string().trim().max(2000).nullish().transform((v) => v || null),
});
export type DsrLogInput = z.infer<typeof dsrLogSchema>;

export const dsrCloseSchema = z.object({
  outcome: z.string().trim().min(2, 'Say what was done').max(2000),
});
export type DsrCloseInput = z.infer<typeof dsrCloseSchema>;

export interface DsrRequestRow {
  id: string;
  kind: DsrKind;
  subjectType: DsrSubjectType | null;
  subjectId: string | null;
  subjectName: string;
  requesterName: string;
  receivedOn: string;
  notes: string | null;
  loggedAt: string;
  loggedBy: string | null;
  closedAt: string | null;
  closedBy: string | null;
  outcome: string | null;
}
