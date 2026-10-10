import { z } from 'zod';

/**
 * Self-serve sign-up and subscription billing: a school joins on its own,
 * gets a free trial, then pays the platform per student per term (or for a
 * whole session at a discount). Prices come from the console's plans; the
 * rest of the rules live in the operator's "selfServe" platform setting.
 */

export const NIGERIAN_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo',
  'Ekiti', 'Enugu', 'FCT (Abuja)', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos',
  'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
] as const;

export const SCHOOL_TYPES = ['NURSERY', 'PRIMARY', 'SECONDARY', 'COMBINED'] as const;
export type SchoolTypeKey = (typeof SCHOOL_TYPES)[number];
export const SCHOOL_TYPE_LABELS: Record<SchoolTypeKey, string> = {
  NURSERY: 'Nursery only',
  PRIMARY: 'Nursery and primary',
  SECONDARY: 'Secondary (JSS and SSS)',
  COMBINED: 'Nursery, primary and secondary',
};
/** The class templates a new school starts with (STAGE_TEMPLATES keys). */
export const SCHOOL_TYPE_STAGES: Record<SchoolTypeKey, ('NURSERY' | 'PRIMARY' | 'JUNIOR' | 'SENIOR')[]> = {
  NURSERY: ['NURSERY'],
  PRIMARY: ['NURSERY', 'PRIMARY'],
  SECONDARY: ['JUNIOR', 'SENIOR'],
  COMBINED: ['NURSERY', 'PRIMARY', 'JUNIOR', 'SENIOR'],
};

// ------------------------------------------------------------------ operator settings

export const selfServeSettingsSchema = z.object({
  /** The public /signup page accepts new schools. */
  enabled: z.boolean().default(false),
  /** Verified sign-ups become schools straight away; off = they wait in the console's review queue. */
  autoApprove: z.boolean().default(false),
  trialDays: z.number().int().min(1).max(180).default(30),
  /** After a trial or an unpaid invoice lapses: full access with a banner for this long, then read-only. */
  graceDays: z.number().int().min(0).max(90).default(14),
  /** Percentage off when a school pays for a whole session (three terms) at once. */
  sessionDiscountPct: z.number().int().min(0).max(50).default(10),
  /** The fewest students a school is billed for in a term. */
  minBilledStudents: z.number().int().min(0).max(5000).default(50),
  /** Days before the trial ends when the school's admins are reminded. */
  reminderDays: z.array(z.number().int().min(1).max(60)).max(6).default([7, 3, 1]),
  /** Days a school has to pay a new subscription invoice. */
  invoiceDueDays: z.number().int().min(0).max(60).default(7),
  /**
   * Billing rules (grace, read-only) for every school, not just self-serve ones.
   * Off by default so existing schools are grandfathered; each school can also be
   * switched on or off on its own (console → Schools → a school → Subscription).
   */
  enforceAll: z.boolean().default(false),
  /** The operator's details printed on invoices and receipts. */
  company: z
    .object({
      name: z.string().trim().max(160).default('[PLACEHOLDER: legal entity name]'),
      rcNumber: z.string().trim().max(40).default('[PLACEHOLDER: RC number]'),
      address: z.string().trim().max(300).default('[PLACEHOLDER: registered address]'),
      email: z.string().trim().max(160).default('[PLACEHOLDER: billing email]'),
      phone: z.string().trim().max(40).default(''),
      taxNote: z.string().trim().max(300).default('[PLACEHOLDER: confirm VAT/tax treatment with your accountant before charging schools.]'),
    })
    .default({
      name: '[PLACEHOLDER: legal entity name]',
      rcNumber: '[PLACEHOLDER: RC number]',
      address: '[PLACEHOLDER: registered address]',
      email: '[PLACEHOLDER: billing email]',
      phone: '',
      taxNote: '[PLACEHOLDER: confirm VAT/tax treatment with your accountant before charging schools.]',
    }),
});
export type SelfServeSettings = z.infer<typeof selfServeSettingsSchema>;
export const SELF_SERVE_SETTINGS_KEY = 'selfServe';

// ------------------------------------------------------------------ pricing (shared by the API and the web)

export const BILLING_CYCLES = ['TERM', 'SESSION'] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];
export const BILLING_CYCLE_LABELS: Record<BillingCycle, string> = { TERM: 'One term', SESSION: 'Whole session (3 terms)' };
export const CYCLE_MONTHS: Record<BillingCycle, number> = { TERM: 4, SESSION: 12 };

export interface PriceQuote {
  cycle: BillingCycle;
  unitKobo: number;
  /** Students billed: the larger of the students counted and the minimum. */
  billedStudents: number;
  terms: number;
  grossKobo: number;
  discountPct: number;
  discountKobo: number;
  totalKobo: number;
  perTermKobo: number;
}

/**
 * The price of a plan for a number of students. The plan's price is per
 * student per its billing period (PER_TERM for the standard plans); a term is
 * four months. Billed students = max(students, minimum). A session is three
 * terms less the session discount; an extra negotiated discount stacks on top.
 */
export function priceQuote(
  plan: { pricePerStudentKobo: number; billingPeriod: string },
  students: number,
  cycle: BillingCycle,
  rules: { minBilledStudents: number; sessionDiscountPct: number },
  extraDiscountPct = 0,
): PriceQuote {
  const periodMonths = ({ MONTHLY: 1, PER_TERM: 4, PER_SESSION: 12, ANNUAL: 12 } as Record<string, number>)[plan.billingPeriod] ?? 4;
  const unitKobo = Math.round((plan.pricePerStudentKobo * 4) / periodMonths);
  const billedStudents = Math.max(Math.max(0, Math.floor(students)), rules.minBilledStudents);
  const terms = cycle === 'SESSION' ? 3 : 1;
  const grossKobo = unitKobo * billedStudents * terms;
  const discountPct = Math.min(100, (cycle === 'SESSION' ? rules.sessionDiscountPct : 0) + extraDiscountPct);
  const discountKobo = Math.round((grossKobo * discountPct) / 100);
  const totalKobo = grossKobo - discountKobo;
  return { cycle, unitKobo, billedStudents, terms, grossKobo, discountPct, discountKobo, totalKobo, perTermKobo: Math.round(totalKobo / terms) };
}

// ------------------------------------------------------------------ public sign-up

const phone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()-]/g, ''))
  .pipe(z.string().regex(/^(\+?234|0)[789][01]\d{8}$/, 'Enter a Nigerian phone number, e.g. 0803 123 4567 or +234 803 123 4567'));

export const schoolSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'At least 3 characters')
  .max(40)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Lowercase letters, numbers and dashes only');

/** Portal addresses no school may take. */
export const RESERVED_SLUGS = ['admin', 'api', 'app', 'www', 'mail', 'platform', 'console', 'signup', 'login', 'support', 'help', 'billing', 'demo', 'test', 'static', 'assets', 'legal', 'pay', 'verify', 'portal', 'school', 'schools'];

export const signupSchema = z.object({
  schoolName: z.string().trim().min(3, 'Enter the school’s name').max(120),
  schoolType: z.enum(SCHOOL_TYPES),
  state: z.enum(NIGERIAN_STATES),
  lga: z.string().trim().min(2, 'Enter the local government area').max(80),
  approxStudents: z.coerce.number().int().min(1, 'Roughly how many students?').max(20000),
  slug: schoolSlugSchema,
  planId: z.string().max(40).optional(),
  admin: z.object({
    firstName: z.string().trim().min(1, 'Required').max(80),
    lastName: z.string().trim().min(1, 'Required').max(80),
    email: z.email('Enter a valid email').trim().toLowerCase().max(160),
    phone,
    password: z.string().min(10, 'At least 10 characters').max(200),
  }),
  acceptTerms: z.literal(true, { message: 'Please accept the terms to continue' }),
  /** Honeypot: people never see or fill this field. */
  website: z.string().max(200).optional(),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const signupVerifySchema = z.object({ id: z.string().min(10).max(40), code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code') });

export interface SignupConfig {
  enabled: boolean;
  trialDays: number;
  sessionDiscountPct: number;
  minBilledStudents: number;
  plans: { id: string; code: string; name: string; description: string | null; pricePerStudentKobo: number; billingPeriod: string; features: string[]; maxStudents: number | null }[];
}

export interface SignupResult {
  id: string;
  email: string;
  /** Local development without email: the code, so the flow can be tried. Never set in production. */
  devCode?: string;
}

export interface SignupVerifyResult {
  status: 'APPROVED' | 'PENDING_REVIEW';
  slug: string;
  schoolName: string;
}

export const SIGNUP_STATUSES = ['PENDING_VERIFICATION', 'PENDING_REVIEW', 'APPROVED', 'REJECTED'] as const;
export type SignupStatus = (typeof SIGNUP_STATUSES)[number];

export interface SignupRow {
  id: string;
  status: SignupStatus;
  schoolName: string;
  schoolType: SchoolTypeKey;
  state: string;
  lga: string;
  approxStudents: number;
  slug: string;
  plan: string | null;
  admin: { name: string; email: string; phone: string };
  verifiedAt: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  tenantId: string | null;
  createdAt: string;
}

export const signupReviewSchema = z.object({ reason: z.string().trim().min(3).max(500) });

// ------------------------------------------------------------------ a school's billing state

/**
 * OK: nothing owed (or billing rules are off for this school).
 * TRIAL: in the free trial. GRACE: the trial ended or an invoice is overdue,
 * still fully working. READ_ONLY: grace is over; people can view and export
 * but not add or change anything until the school pays.
 */
export const BILLING_STATES = ['OK', 'TRIAL', 'GRACE', 'READ_ONLY'] as const;
export type BillingStateKey = (typeof BILLING_STATES)[number];
export const READ_ONLY_CODE = 'SCHOOL_READ_ONLY';

export interface BillingStatus {
  state: BillingStateKey;
  enforced: boolean;
  trialEndsAt: string | null;
  /** When the school becomes read-only (GRACE), or became read-only. */
  readOnlyAt: string | null;
  daysLeft: number | null;
  reason: 'TRIAL_ENDED' | 'INVOICE_OVERDUE' | null;
}

export const subscriptionCheckoutSchema = z.object({
  planId: z.string().min(1).max(40),
  cycle: z.enum(BILLING_CYCLES),
  /** Students the school expects this term; the invoice uses the larger of this and active students (and the minimum). */
  students: z.coerce.number().int().min(0).max(20000),
  email: z.email().trim().toLowerCase().max(160).nullish(),
});
export type SubscriptionCheckoutInput = z.infer<typeof subscriptionCheckoutSchema>;

export interface SubscriptionCheckoutOptions {
  status: BillingStatus;
  currentPlanId: string | null;
  activeStudents: number;
  /** The rough student count given at sign-up, to start the estimate from. */
  estimatedStudents: number;
  cycle: BillingCycle;
  rules: { minBilledStudents: number; sessionDiscountPct: number; graceDays: number; trialDays: number };
  plans: SignupConfig['plans'];
  /** An open subscription invoice already waiting to be paid. */
  openInvoiceId: string | null;
  pendingPlan: string | null;
  onlinePayment: boolean;
  /** True once the school has paid for a period (plan changes then follow the change rules). */
  paying: boolean;
  discountPct: number;
}

export interface SubscriptionCheckoutResult {
  invoiceId: string;
  number: string;
  amountKobo: number;
  /** Set when online payment is available: go here to pay. */
  authorizationUrl: string | null;
}

export const planChangeSchema = z.object({ planId: z.string().min(1).max(40) });

export interface PlanChangeResult {
  effective: 'NOW' | 'NEXT_PERIOD';
  /** Upgrades mid-period: the top-up invoice for the rest of the period. */
  invoiceId: string | null;
  amountKobo: number;
}

/** A printable invoice or receipt. */
export interface BillingDocument {
  kind: 'INVOICE' | 'RECEIPT';
  number: string;
  status: string;
  issuedAt: string;
  dueDate: string;
  paidAt: string | null;
  description: string;
  periodStart: string | null;
  periodEnd: string | null;
  seats: number;
  unitKobo: number;
  discountKobo: number;
  amountKobo: number;
  paidKobo: number;
  balanceKobo: number;
  currency: string;
  school: { name: string; address: string | null; email: string | null; phone: string | null };
  company: SelfServeSettings['company'];
  payments: { reference: string; method: string; amountKobo: number; paidAt: string | null }[];
  bankDetails: string | null;
}

// ------------------------------------------------------------------ console

export const tenantBillingUpdateSchema = z.object({
  /** null: follow the platform setting ("enforceAll"). */
  enforced: z.boolean().nullable(),
  /** Push the trial end out by this many days (0 = leave it). */
  extendTrialDays: z.number().int().min(0).max(365).default(0),
  /** A negotiated discount on this school's subscription, in percent (100 = complimentary). */
  discountPct: z.number().int().min(0).max(100).optional(),
  notes: z.string().trim().max(500).nullish(),
});
export type TenantBillingUpdate = z.infer<typeof tenantBillingUpdateSchema>;

export interface TenantBillingRow {
  tenantId: string;
  name: string;
  slug: string;
  tenantStatus: string;
  selfServe: boolean;
  enforcedSetting: boolean | null;
  status: BillingStatus;
  plan: string | null;
  cycle: BillingCycle;
  discountPct: number;
  activeStudents: number;
  /** What one term costs at today's student count (after discounts). */
  termValueKobo: number;
  outstandingKobo: number;
  paidThisTermKobo: number;
  notes: string | null;
}

export interface SubscriptionsSummary {
  rows: TenantBillingRow[];
  /** Sum of termValueKobo over paying schools: the "MRR-like" figure, per term. */
  termRevenueKobo: number;
  collectedLast120DaysKobo: number;
  counts: Record<BillingStateKey, number>;
  overdue: number;
  pendingSignups: number;
  settings: SelfServeSettings;
}
