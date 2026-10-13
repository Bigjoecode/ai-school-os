import { z } from 'zod';
import { priceQuote, type BillingCycle, type PriceQuote } from './self-serve';

/**
 * The price list: Standard and Premium per student per term, Ultimate on
 * request, a one-off setup fee (onboarding and training), SMS included per
 * student per term, the minimum students per plan, and add-ons sold per
 * school. Prices live on the console's plans and add-on catalogue; the
 * defaults below are only what the platform starts with.
 */

export const PLAN_CODES = { STANDARD: 'standard', PREMIUM: 'premium', ULTIMATE: 'ultimate' } as const;

/** Old public plans and the new plan a new sign-up on an old link gets. Existing schools keep their old plan. */
export const LEGACY_PLAN_MAP: Record<string, string> = { starter: 'standard', 'school-license': 'standard', enterprise: 'premium' };

/** Modules only in Premium (and Ultimate). Standard has every other module. */
export const PREMIUM_ONLY_MODULES = ['payroll', 'hr', 'inventory', 'transport', 'hostel', 'timetable', 'health', 'houses', 'careers', 'success', 'whatsapp_assistant', 'parent_lines', 'result_pins'] as const;

/** Module keys in the Standard plan by default. */
export const STANDARD_MODULES = ['ai', 'website', 'live_classes', 'messaging', 'online_payments', 'library'] as const;

/** The pricing page's checklists (display only; the modules above are what gates access). */
export const DEFAULT_FEATURE_LISTS: Record<'standard' | 'premium' | 'ultimate', { intro: string | null; lines: string[] }> = {
  standard: {
    intro: null,
    lines: [
      'Student and staff records',
      'Result management and report cards',
      'Fees management and online payment',
      'Attendance, including gate check-in',
      'Secure pickup',
      'Communication book and messaging',
      'Email and bulk SMS',
      'Student and parent portal',
      'User and privilege management',
      'Online CBT and offline exam packs',
      'Online admissions',
      'Lesson plans, lesson modules and check-ins',
      'Live classes, homework and assignments',
      'Calendar and events',
      'Curriculum and schemes of work',
      'Library',
      'EduGames',
      'Birthdays',
      'Expenses',
      'School website (basic)',
      'AI assistants (standard allowance)',
    ],
  },
  premium: {
    intro: 'Everything in Standard, plus:',
    lines: [
      'HR: departments, leave and awards',
      'Payroll and payslips',
      'Inventory and stores',
      'Transport',
      'Hostel',
      'Smart timetable generator',
      'Health and sick bay',
      'Houses and house points',
      'Careers guidance and JAMB',
      'Success dashboard and census returns',
      'WhatsApp assistant for parents',
      'Parent SMS and USSD line',
      'Result checker PINs',
      'AI tutor and Parent AI with a higher AI budget',
    ],
  },
  ultimate: {
    intro: 'Everything in Premium, plus:',
    lines: ['Dedicated support', 'Customisations for your school', 'Custom pricing for groups and large schools'],
  },
};

// ------------------------------------------------------------------ operator settings

export const SMS_OVERAGE_POLICIES = ['BILL', 'BLOCK', 'WARN'] as const;
export type SmsOveragePolicy = (typeof SMS_OVERAGE_POLICIES)[number];
export const SMS_OVERAGE_LABELS: Record<SmsOveragePolicy, string> = {
  BILL: 'Keep sending; bill extra pages on the next invoice',
  BLOCK: 'Stop sending SMS on the platform line until the next term',
  WARN: 'Keep sending; warn only (no charge)',
};

export const DEFAULT_PRICING_NOTES = [
  'Prices exclude VAT.',
  'Basic support, maintenance and hosting are included.',
  'Parents pay school fees online into the school’s own Paystack account. Paystack’s charges come out of what the school receives unless the school adds a charge to its fees to pass them on.',
  'The one-off setup fee covers onboarding and training. It is waived for pilot schools.',
];

export const pricingSettingsSchema = z.object({
  /** Schools created before this moment never owe a setup fee (set when the price list was introduced). */
  setupFeesFrom: z.string().max(40).nullable().default(null),
  /** The Standard / Premium / Ultimate plans and the add-on catalogue were installed (done once; console edits are kept). */
  catalogueSeeded: z.boolean().default(false),
  /** The old public plans were taken off the pricing page (done once). */
  legacyRetired: z.boolean().default(false),
  /** What happens past a school's included SMS on the platform SMS line. */
  smsOverage: z.enum(SMS_OVERAGE_POLICIES).default('BILL'),
  /** Price per SMS page past the allowance (kobo). */
  smsOverageKobo: z.number().int().min(0).max(100_000).default(400),
  /** The notes printed under the prices. */
  notes: z.array(z.string().trim().min(2).max(300)).max(10).default(DEFAULT_PRICING_NOTES),
});
export type PricingSettings = z.infer<typeof pricingSettingsSchema>;
export const PRICING_SETTINGS_KEY = 'planPricing';

// ------------------------------------------------------------------ plans as shown to the public

export interface PublicPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  pricePerStudentKobo: number;
  billingPeriod: string;
  features: string[];
  knownFeatures: string[];
  maxStudents: number | null;
  setupFeeKobo: number;
  trainingDays: number;
  /** The fewest students billed (the plan's, else the platform minimum). */
  minStudents: number;
  smsUnitsPerStudent: number;
  studentAiSessions: number;
  aiMonthlyBudgetUsd: number | null;
  badge: string | null;
  contactOnly: boolean;
  featureIntro: string | null;
  featureList: string[];
}

export interface PlanQuote extends PriceQuote {
  /** The one-off setup fee added to this invoice (0 if waived or already paid). */
  setupFeeKobo: number;
  /** SMS pages included per term on this invoice's student count. */
  smsUnitsPerTerm: number;
  /** Subscription total plus the setup fee. */
  grandTotalKobo: number;
}

/**
 * A plan's price for a number of students, with the plan's own minimum, the
 * session discount and (on a first invoice) the setup fee.
 */
export function planQuote(
  plan: { pricePerStudentKobo: number; billingPeriod: string; minStudents?: number | null; smsUnitsPerStudent?: number },
  students: number,
  cycle: BillingCycle,
  rules: { minBilledStudents: number; sessionDiscountPct: number },
  extraDiscountPct = 0,
  setupFeeKobo = 0,
): PlanQuote {
  const q = priceQuote(plan, students, cycle, { minBilledStudents: plan.minStudents ?? rules.minBilledStudents, sessionDiscountPct: rules.sessionDiscountPct }, extraDiscountPct);
  return { ...q, setupFeeKobo, smsUnitsPerTerm: (plan.smsUnitsPerStudent ?? 0) * q.billedStudents, grandTotalKobo: q.totalKobo + setupFeeKobo };
}

// ------------------------------------------------------------------ invoice lines

export const INVOICE_LINE_KINDS = ['SUBSCRIPTION', 'SETUP_FEE', 'ADDON', 'SMS'] as const;
export type InvoiceLineKind = (typeof INVOICE_LINE_KINDS)[number];
export interface InvoiceLine {
  kind: InvoiceLineKind;
  description: string;
  quantity: number;
  unitKobo: number;
  discountKobo: number;
  amountKobo: number;
}

// ------------------------------------------------------------------ add-ons

export const ADDON_PRICING = ['FIXED', 'QUOTE'] as const;
export type AddonPricing = (typeof ADDON_PRICING)[number];

export const addonSchema = z.object({
  code: z.string().trim().regex(/^[a-z][a-z0-9-]{1,40}$/, 'Lowercase letters, numbers and dashes'),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).nullish().transform((v) => v || null),
  pricing: z.enum(ADDON_PRICING),
  /** FIXED: the price per unit. QUOTE: ignored (the operator quotes each request). */
  priceKobo: z.number().int().min(0).max(1_000_000_000).nullable(),
  /** "per template", "per day"… */
  unitLabel: z.string().trim().max(40).nullish().transform((v) => v || null),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(1000).default(0),
});
export type AddonInput = z.infer<typeof addonSchema>;

export interface AddonRow extends AddonInput {
  id: string;
}

export const DEFAULT_ADDONS: AddonInput[] = [
  { code: 'template-customisation', name: 'Template customisation', description: 'A report card, result sheet or other document laid out to your school’s design.', pricing: 'FIXED', priceKobo: 50_000_00, unitLabel: 'per template', isActive: true, sortOrder: 1 },
  { code: 'extra-training', name: 'Extra staff training', description: 'Another day of on-site or online training for your staff.', pricing: 'FIXED', priceKobo: 30_000_00, unitLabel: 'per day', isActive: true, sortOrder: 2 },
  { code: 'curriculum-setup', name: 'Curriculum setup', description: 'We load your own curriculum and schemes of work.', pricing: 'QUOTE', priceKobo: null, unitLabel: null, isActive: true, sortOrder: 3 },
  { code: 'extra-branch', name: 'Extra school arm or branch setup', description: 'Setting up another campus or school arm on your account.', pricing: 'QUOTE', priceKobo: null, unitLabel: 'per branch', isActive: true, sortOrder: 4 },
  { code: 'extra-storage', name: 'Extra storage', description: 'More space for files, videos and recordings.', pricing: 'QUOTE', priceKobo: null, unitLabel: null, isActive: true, sortOrder: 5 },
];

export const ADDON_ORDER_STATUSES = ['REQUESTED', 'INVOICED', 'DECLINED', 'CANCELLED'] as const;
export type AddonOrderStatus = (typeof ADDON_ORDER_STATUSES)[number];

export const addonOrderSchema = z.object({
  addonId: z.string().min(1).max(40),
  quantity: z.coerce.number().int().min(1).max(100).default(1),
  note: z.string().trim().max(500).nullish().transform((v) => v || null),
});
export type AddonOrderInput = z.infer<typeof addonOrderSchema>;

/** Console: answer a request. QUOTE: invoice the school this amount; DECLINE: close it with a reason. */
export const addonOrderActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('INVOICE'), amountKobo: z.number().int().min(100).max(1_000_000_000), note: z.string().trim().max(500).nullish() }),
  z.object({ action: z.literal('DECLINE'), note: z.string().trim().min(3).max(500) }),
]);
export type AddonOrderAction = z.infer<typeof addonOrderActionSchema>;

export interface AddonOrderRow {
  id: string;
  tenant: { id: string; name: string; slug: string };
  addon: { id: string; name: string; pricing: AddonPricing; unitLabel: string | null };
  quantity: number;
  status: AddonOrderStatus;
  note: string | null;
  operatorNote: string | null;
  amountKobo: number | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  invoiceStatus: string | null;
  requestedBy: string | null;
  createdAt: string;
}

// ------------------------------------------------------------------ "Talk to us" (Ultimate and custom deals)

const phone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()-]/g, ''))
  .pipe(z.string().regex(/^(\+?234|0)[789][01]\d{8}$/, 'Enter a Nigerian phone number, e.g. 0803 123 4567'));

export const planEnquirySchema = z.object({
  planId: z.string().max(40).nullish(),
  schoolName: z.string().trim().min(3, 'Enter the school’s name').max(120),
  contactName: z.string().trim().min(2, 'Enter your name').max(120),
  email: z.email('Enter a valid email').trim().toLowerCase().max(160),
  phone,
  students: z.coerce.number().int().min(1, 'Roughly how many students?').max(100_000),
  /** Branches or schools in the group. */
  branches: z.coerce.number().int().min(1).max(500).default(1),
  message: z.string().trim().max(1000).nullish().transform((v) => v || null),
  /** Honeypot. */
  website: z.string().max(200).optional(),
});
export type PlanEnquiryInput = z.input<typeof planEnquirySchema>;

export const PLAN_ENQUIRY_STATUSES = ['NEW', 'CONTACTED', 'WON', 'CLOSED'] as const;
export type PlanEnquiryStatus = (typeof PLAN_ENQUIRY_STATUSES)[number];

export interface PlanEnquiryRow {
  id: string;
  plan: string | null;
  schoolName: string;
  contactName: string;
  email: string;
  phone: string;
  students: number;
  branches: number;
  message: string | null;
  status: PlanEnquiryStatus;
  createdAt: string;
}

// ------------------------------------------------------------------ a school's view

export const SETUP_FEE_STATES = ['NONE', 'DUE', 'INVOICED', 'PAID', 'WAIVED'] as const;
export type SetupFeeState = (typeof SETUP_FEE_STATES)[number];

export interface SetupFeeStatus {
  state: SetupFeeState;
  /** Why there is none: grandfathered (joined before the price list), pilot, demo, or the plan has none. */
  reason: 'GRANDFATHERED' | 'PILOT' | 'DEMO' | 'PLAN' | 'ALREADY_PAYING' | 'WAIVED' | null;
  /** What the school pays (after any operator discount). */
  amountKobo: number;
  /** The plan's list price. */
  planFeeKobo: number;
  trainingDays: number;
  invoiceId: string | null;
  note: string | null;
}

export interface SmsAllowance {
  /** The plan includes SMS (smsUnitsPerStudent > 0). */
  included: boolean;
  /** PLATFORM: SMS go out on the AI School OS line and count against the allowance. OWN: the school's own Termii account (paid to Termii directly). NONE: no SMS set up. */
  line: 'PLATFORM' | 'OWN' | 'NONE';
  unitsPerStudent: number;
  billedStudents: number;
  allowance: number;
  used: number;
  left: number;
  /** 0–100+ */
  pct: number;
  windowStart: string;
  windowEnd: string;
  overage: SmsOveragePolicy;
  overageKobo: number;
  /** Pages past the allowance this term, and what they will cost (BILL). */
  overUnits: number;
  overCostKobo: number;
  warning: 'NEAR' | 'USED_UP' | null;
}

export interface SchoolPricing {
  plan: PublicPlan | null;
  setupFee: SetupFeeStatus;
  sms: SmsAllowance;
  addons: AddonRow[];
  orders: AddonOrderRow[];
  notes: string[];
  sessionDiscountPct: number;
}

/** Console: a school's setup fee. WAIVE: nothing to pay; SET: charge this amount (a discount); RESET: back to the plan's fee. */
export const tenantSetupFeeSchema = z.object({
  action: z.enum(['WAIVE', 'SET', 'RESET']),
  amountKobo: z.number().int().min(0).max(1_000_000_000).optional(),
  note: z.string().trim().max(300).nullish().transform((v) => v || null),
});
export type TenantSetupFeeInput = z.infer<typeof tenantSetupFeeSchema>;

export interface PricingConsole {
  settings: PricingSettings;
  addons: AddonRow[];
  orders: AddonOrderRow[];
  enquiries: PlanEnquiryRow[];
}
