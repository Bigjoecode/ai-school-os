import { z } from 'zod';
import { INVOICE_LINE_KINDS, type InvoiceLine, type InvoiceLineKind } from './pricing';
import { NIGERIAN_STATES } from './self-serve';

/**
 * The ambassador referral programme: people who refer schools earn a share
 * (5% by default) of every subscription payment a referred school makes.
 * Ambassadors apply on the public site, confirm their email, and the operator
 * approves each one in the console. Commissions wait out a hold period, then
 * become payable; the operator pays them in a monthly batch by bank transfer.
 */

export const AMBASSADOR_SETTINGS_KEY = 'ambassadors';
/** Bumped when docs/legal/ambassador-terms.md changes materially. */
export const AMBASSADOR_TERMS_VERSION = '2026-10-draft';
/** Referral cookie / localStorage lifetime on the public site. */
export const REFERRAL_TTL_DAYS = 90;
export const REFERRAL_STORAGE_KEY = 'ais_ref';

export const ambassadorSettingsSchema = z.object({
  /** The public application form accepts new ambassadors. Existing ambassadors keep earning either way. */
  open: z.boolean().default(true),
  /** Commission, as a percentage of what a referred school actually pays (e.g. 5 or 2.5). */
  ratePct: z.number().min(0).max(50).default(5),
  /** Days a commission waits before it can be paid out (covers refunds and reversed payments). */
  holdDays: z.number().int().min(0).max(365).default(30),
  /** Smallest payable balance paid out in a batch, in kobo (₦5,000 = 500000). */
  minPayoutKobo: z.number().int().min(0).max(1_000_000_000).default(500_000),
  /** Months after the school was referred during which its payments earn commission; null = for as long as it pays. */
  commissionMonths: z.number().int().min(1).max(240).nullable().default(null),
  /** What happens to a suspended ambassador's payable balance: kept for payout, or withheld until reinstated. */
  suspendedPayable: z.enum(['KEEP', 'WITHHOLD']).default('WITHHOLD'),
  /** Invoice line kinds that earn no commission (their share of each payment is left out). One-off setup fees by default. */
  excludedLineKinds: z.array(z.enum(INVOICE_LINE_KINDS)).max(INVOICE_LINE_KINDS.length).default(['SETUP_FEE']),
});
export type AmbassadorSettings = z.infer<typeof ambassadorSettingsSchema>;

/**
 * The commissionable part of a payment on a platform invoice: the payment's
 * pro-rata share of the invoice lines that earn commission. A ₦100,000 payment
 * on a ₦300,000 invoice of which ₦100,000 is a setup fee is two-thirds
 * commissionable (₦66,666). Invoices without itemised lines (older ones) are
 * wholly commissionable; an invoice made only of excluded lines earns nothing.
 */
export function commissionableKobo(paymentKobo: number, invoice: { amountKobo: number; lines: InvoiceLine[] | null | undefined }, excluded: readonly InvoiceLineKind[]): number {
  if (paymentKobo <= 0 || invoice.amountKobo <= 0) return 0;
  const lines = Array.isArray(invoice.lines) ? invoice.lines : [];
  const excludedKobo = lines.filter((l) => excluded.includes(l.kind)).reduce((n, l) => n + Math.max(0, l.amountKobo), 0);
  const eligible = Math.max(0, invoice.amountKobo - excludedKobo);
  if (eligible >= invoice.amountKobo) return paymentKobo;
  return Math.floor((paymentKobo * eligible) / invoice.amountKobo);
}

// ------------------------------------------------------------------ phones, codes

/** Nigerian mobile numbers: 0803 123 4567, +234 803 123 4567, 234803…; stored as +234XXXXXXXXXX. */
export function normaliseNgPhone(v: string): string | null {
  const s = v.replace(/[\s()-]/g, '');
  const m = s.match(/^(?:\+?234|0)([789][01]\d{8})$/);
  return m ? `+234${m[1]}` : null;
}

const ngPhone = z
  .string()
  .trim()
  .refine((v) => !!normaliseNgPhone(v), 'Enter a Nigerian phone number, e.g. 0803 123 4567 or +234 803 123 4567')
  .transform((v) => normaliseNgPhone(v)!);

/** A referral code: 3–12 letters and digits, case-insensitive (kept upper case). */
export const referralCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{3,12}$/, '3 to 12 letters and numbers');

export const NIGERIAN_BANKS = [
  'Access Bank', 'Citibank', 'Ecobank', 'Fidelity Bank', 'First Bank', 'FCMB', 'Globus Bank', 'GTBank', 'Heritage Bank', 'Jaiz Bank',
  'Keystone Bank', 'Kuda', 'Moniepoint', 'OPay', 'PalmPay', 'Parallex Bank', 'Polaris Bank', 'Providus Bank', 'Stanbic IBTC', 'Standard Chartered',
  'Sterling Bank', 'SunTrust Bank', 'Titan Trust Bank', 'Union Bank', 'UBA', 'Unity Bank', 'VFD Microfinance Bank', 'Wema Bank', 'Zenith Bank', 'Other',
] as const;

export const bankDetailsSchema = z.object({
  bankName: z.string().trim().min(2, 'Choose or type the bank').max(80),
  accountNumber: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s/g, ''))
    .pipe(z.string().regex(/^\d{10}$/, 'A NUBAN account number has 10 digits')),
  accountName: z.string().trim().min(3, 'The name on the account').max(120),
});
export type BankDetailsInput = z.infer<typeof bankDetailsSchema>;

// ------------------------------------------------------------------ public application

export const ambassadorApplySchema = z.object({
  fullName: z.string().trim().min(3, 'Your full name').max(120),
  phone: ngPhone,
  email: z.email('Enter a valid email').trim().toLowerCase().max(160),
  state: z.enum(NIGERIAN_STATES),
  approach: z.string().trim().min(10, 'A sentence or two, please').max(500),
  bank: bankDetailsSchema,
  password: z.string().min(10, 'At least 10 characters').max(200),
  acceptTerms: z.literal(true, { message: 'Please accept the ambassador terms to continue' }),
  /** Honeypot: people never see or fill this field. */
  website: z.string().max(200).optional(),
});
export type AmbassadorApplyInput = z.infer<typeof ambassadorApplySchema>;

export const ambassadorVerifySchema = z.object({ id: z.string().min(10).max(40), code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code') });

export interface AmbassadorApplyResult {
  id: string;
  email: string;
  /** Local development without email: the code. Never set in production. */
  devCode?: string;
}

export interface AmbassadorPublicConfig {
  open: boolean;
  ratePct: number;
  holdDays: number;
  minPayoutKobo: number;
  commissionMonths: number | null;
  /** Invoice line kinds that earn no commission (e.g. SETUP_FEE). */
  excludedLineKinds: InvoiceLineKind[];
}

/** GET /api/ambassadors/ref/:code — whether a code is valid, and the ambassador's first name only. */
export interface ReferralCodeCheck {
  code: string;
  valid: boolean;
  firstName: string | null;
}

// ------------------------------------------------------------------ statuses

export const AMBASSADOR_STATUSES = ['PENDING_VERIFICATION', 'PENDING_REVIEW', 'ACTIVE', 'DECLINED', 'SUSPENDED'] as const;
export type AmbassadorStatus = (typeof AMBASSADOR_STATUSES)[number];
export const AMBASSADOR_STATUS_LABELS: Record<AmbassadorStatus, string> = {
  PENDING_VERIFICATION: 'Email not confirmed',
  PENDING_REVIEW: 'Waiting for review',
  ACTIVE: 'Active',
  DECLINED: 'Declined',
  SUSPENDED: 'Suspended',
};

export const COMMISSION_STATUSES = ['PENDING', 'PAYABLE', 'PAID', 'REVERSED'] as const;
export type CommissionStatus = (typeof COMMISSION_STATUSES)[number];
export const COMMISSION_STATUS_LABELS: Record<CommissionStatus, string> = { PENDING: 'On hold', PAYABLE: 'Payable', PAID: 'Paid', REVERSED: 'Reversed' };

/** A referred school as the ambassador sees it: name, state and a coarse status only. */
export const REFERRAL_SCHOOL_STATUSES = ['APPLIED', 'TRIAL', 'PILOT', 'PAYING', 'SETUP', 'LAPSED'] as const;
export type ReferralSchoolStatus = (typeof REFERRAL_SCHOOL_STATUSES)[number];
export const REFERRAL_SCHOOL_STATUS_LABELS: Record<ReferralSchoolStatus, string> = {
  APPLIED: 'Applied',
  TRIAL: 'On trial',
  PILOT: 'Free pilot',
  PAYING: 'Paying',
  SETUP: 'Set up, not paying yet',
  LAPSED: 'Lapsed',
};

// ------------------------------------------------------------------ the ambassador's dashboard

export interface AmbassadorCommissionRow {
  id: string;
  schoolName: string;
  kind: 'COMMISSION' | 'CLAWBACK';
  baseKobo: number;
  ratePct: number;
  amountKobo: number;
  status: CommissionStatus;
  payableAt: string;
  paidAt: string | null;
  reason: string | null;
  createdAt: string;
}

export interface AmbassadorPayoutRow {
  id: string;
  amountKobo: number;
  commissionCount: number;
  reference: string;
  paidOn: string;
  createdAt: string;
}

export interface AmbassadorTotals {
  pendingKobo: number;
  payableKobo: number;
  paidKobo: number;
  reversedKobo: number;
}

export interface AmbassadorDashboard {
  id: string;
  firstName: string;
  fullName: string;
  email: string;
  phone: string;
  state: string;
  status: AmbassadorStatus;
  code: string;
  bank: { bankName: string; accountLast4: string; accountName: string; changePending: boolean };
  settings: AmbassadorPublicConfig & { suspendedPayable: 'KEEP' | 'WITHHOLD' };
  totals: AmbassadorTotals;
  schools: { name: string; state: string | null; status: ReferralSchoolStatus; referredAt: string }[];
  commissions: AmbassadorCommissionRow[];
  payouts: AmbassadorPayoutRow[];
  notices: { id: string; kind: string; title: string; body: string; read: boolean; createdAt: string }[];
  termsVersion: string;
  approvedAt: string | null;
}

export const ambassadorBankVerifySchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code') });

// ------------------------------------------------------------------ the console

export interface AmbassadorRow {
  id: string;
  status: AmbassadorStatus;
  fullName: string;
  email: string;
  phone: string;
  state: string;
  approach: string;
  bankName: string;
  accountLast4: string;
  accountName: string;
  code: string | null;
  codeChangeable: boolean;
  hasLogin: boolean;
  referrals: number;
  payingSchools: number;
  earnedKobo: number;
  payableKobo: number;
  paidKobo: number;
  flags: number;
  reviewNote: string | null;
  verifiedAt: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface ConsoleReferralRow {
  tenantId: string;
  schoolName: string;
  slug: string;
  state: string | null;
  status: ReferralSchoolStatus;
  ambassador: { id: string; name: string; code: string | null; status: AmbassadorStatus };
  source: 'SIGNUP' | 'CONSOLE';
  flags: string[];
  earnedKobo: number;
  createdAt: string;
}

export interface ConsoleCommissionRow extends AmbassadorCommissionRow {
  ambassador: { id: string; name: string };
  tenantId: string;
  paymentId: string | null;
  payoutId: string | null;
}

export interface PayoutDueRow {
  ambassadorId: string;
  name: string;
  email: string;
  phone: string;
  bankName: string;
  accountLast4: string;
  accountName: string;
  payableKobo: number;
  commissionCount: number;
  status: AmbassadorStatus;
}

export interface ConsolePayoutRow extends AmbassadorPayoutRow {
  ambassador: { id: string; name: string };
  note: string | null;
}

export interface AmbassadorOverview {
  settings: AmbassadorSettings;
  counts: { pendingReview: number; active: number; suspended: number; referredSchools: number; flagged: number };
  totals: AmbassadorTotals;
  dueCount: number;
  dueKobo: number;
}

export const ambassadorDeclineSchema = z.object({ reason: z.string().trim().min(3, 'Give a short reason').max(500) });
export const ambassadorSuspendSchema = z.object({ suspend: z.boolean(), reason: z.string().trim().min(3, 'Give a short reason').max(500) });
export const ambassadorCodeSchema = z.object({ code: referralCodeSchema });
export const referralAssignSchema = z.object({
  /** null removes the school's ambassador. */
  ambassadorId: z.string().min(10).max(40).nullable(),
  reason: z.string().trim().min(3, 'Give a short reason').max(500),
});
export type ReferralAssignInput = z.infer<typeof referralAssignSchema>;
export const commissionReverseSchema = z.object({ reason: z.string().trim().min(3, 'Give a short reason').max(500) });
export const payoutMarkPaidSchema = z.object({
  ambassadorId: z.string().min(10).max(40),
  /** The payable balance the operator saw (and transferred); refused if it has changed since. */
  expectedKobo: z.number().int().min(1),
  reference: z.string().trim().min(3, 'The bank transfer reference').max(80),
  paidOn: z.iso.date(),
  note: z.string().trim().max(300).optional(),
});
export type PayoutMarkPaidInput = z.infer<typeof payoutMarkPaidSchema>;
