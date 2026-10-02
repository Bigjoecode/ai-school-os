import { z } from 'zod';
import type { PlatformRole } from './roles';

// ============================================================ features

/**
 * Modules a plan can include. Each one gates its API routes (403 with
 * code FEATURE_NOT_IN_PLAN) and hides its menu entries. Beta flags are free
 * form and created in the console.
 */
export const MODULE_FEATURES = {
  ai: { label: 'AI assistants and generators', description: 'Every AI feature: assistants, lesson and exam generators, briefings and the website assistant.' },
  website: { label: 'School website', description: 'Public website, news, gallery, results checker and online applications.' },
  live_classes: { label: 'Live classes', description: 'Google Meet, Zoom and BigBlueButton classes with AI class packs.' },
  messaging: { label: 'Messages', description: 'Email, SMS and WhatsApp messages to parents and staff.' },
  online_payments: { label: 'Online fee payments', description: 'Parents pay fees online through the school’s Paystack account.' },
  payroll: { label: 'Payroll', description: 'Salary grades, monthly payroll, payslips and bank schedules.' },
  timetable: { label: 'Smart timetable', description: 'Timetable builder and solver.' },
  library: { label: 'Library', description: 'Catalogue, loans and fines.' },
  inventory: { label: 'Inventory', description: 'Stores, assets and stock counts.' },
  transport: { label: 'Transport', description: 'Vehicles, routes and riders.' },
  hostel: { label: 'Hostel', description: 'Boarding houses, beds and exeats.' },
} as const;
export type ModuleFeature = keyof typeof MODULE_FEATURES;
export const MODULE_FEATURE_KEYS = Object.keys(MODULE_FEATURES) as ModuleFeature[];

export const FLAG_KINDS = ['MODULE', 'BETA'] as const;
export type FlagKind = (typeof FLAG_KINDS)[number];

export const featureFlagSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{1,40}$/, 'Lowercase letters, numbers and underscores'),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).nullish().transform((v) => v || null),
  enabled: z.boolean(),
  rolloutPercent: z.number().int().min(0).max(100).default(0),
});
export type FeatureFlagInput = z.infer<typeof featureFlagSchema>;

export const tenantFeatureSchema = z.object({
  /** null removes the override, so the plan or rollout decides again. */
  enabled: z.boolean().nullable(),
  note: z.string().trim().max(200).nullish().transform((v) => v || null),
});

export interface FeatureFlagRow {
  key: string;
  name: string;
  description: string | null;
  kind: FlagKind;
  enabled: boolean;
  rolloutPercent: number;
  /** Schools this is on for right now. */
  enabledFor: number;
  overrides: { tenantId: string; tenantName: string; enabled: boolean; note: string | null }[];
  updatedAt: string;
}

export interface TenantFeatureState {
  key: string;
  name: string;
  kind: FlagKind;
  enabled: boolean;
  /** Why: MASTER_OFF | OVERRIDE | PLAN | NO_PLAN | ROLLOUT | DEFAULT */
  source: string;
  override: boolean | null;
}

// ============================================================ plans & billing

export const BILLING_PERIODS = ['MONTHLY', 'PER_TERM', 'PER_SESSION', 'ANNUAL'] as const;
export type BillingPeriodKey = (typeof BILLING_PERIODS)[number];
export const BILLING_PERIOD_LABELS: Record<BillingPeriodKey, string> = {
  MONTHLY: 'per month',
  PER_TERM: 'per term',
  PER_SESSION: 'per session',
  ANNUAL: 'per year',
};
/** Months each period covers (a Nigerian term is billed as four months). */
export const BILLING_PERIOD_MONTHS: Record<BillingPeriodKey, number> = { MONTHLY: 1, PER_TERM: 4, PER_SESSION: 12, ANNUAL: 12 };

export const planSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9-]{1,40}$/, 'Lowercase letters, numbers and dashes'),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).nullish().transform((v) => v || null),
  pricePerStudentKobo: z.number().int().min(0).max(100_000_000),
  billingPeriod: z.enum(BILLING_PERIODS),
  aiMonthlyBudgetUsd: z.number().min(0).max(100_000).nullable(),
  maxStudents: z.number().int().min(1).max(1_000_000).nullable(),
  features: z.array(z.string()).max(50),
  isActive: z.boolean(),
  isPublic: z.boolean(),
  sortOrder: z.number().int().min(0).max(1000).default(0),
});
export type PlanInput = z.infer<typeof planSchema>;

export interface PlanRow extends Omit<PlanInput, 'billingPeriod'> {
  id: string;
  billingPeriod: BillingPeriodKey;
  schools: number;
  activeSubscriptions: number;
}

export const SUBSCRIPTION_STATUSES = ['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED'] as const;
export type SubscriptionStatusKey = (typeof SUBSCRIPTION_STATUSES)[number];

export const subscriptionUpdateSchema = z.object({
  planId: z.string().min(1),
  status: z.enum(SUBSCRIPTION_STATUSES),
  studentSeats: z.number().int().min(0).max(1_000_000),
  priceOverrideKobo: z.number().int().min(0).max(100_000_000).nullable(),
  discountPct: z.number().int().min(0).max(100),
  currentPeriodStart: z.iso.date(),
  currentPeriodEnd: z.iso.date(),
  cancelAtPeriodEnd: z.boolean(),
  notes: z.string().trim().max(1000).nullish().transform((v) => v || null),
});
export type SubscriptionUpdateInput = z.infer<typeof subscriptionUpdateSchema>;

export interface SubscriptionRow {
  id: string;
  tenant: { id: string; name: string; slug: string; status: string };
  plan: { id: string; name: string; billingPeriod: BillingPeriodKey };
  status: SubscriptionStatusKey;
  studentSeats: number;
  activeStudents: number;
  /** Seats the next invoice will bill: the larger of committed seats and active students. */
  billableSeats: number;
  unitKobo: number;
  discountPct: number;
  priceOverrideKobo: number | null;
  periodAmountKobo: number;
  /** The period amount spread per month, for MRR. */
  monthlyKobo: number;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: string | null;
  outstandingKobo: number;
  notes: string | null;
}

export const PLATFORM_INVOICE_STATUSES = ['OPEN', 'PAID', 'VOID'] as const;
export type PlatformInvoiceStatus = (typeof PLATFORM_INVOICE_STATUSES)[number];

export const platformInvoiceSchema = z.object({
  tenantId: z.string().min(1),
  description: z.string().trim().min(3).max(200),
  amountKobo: z.number().int().min(100).max(10_000_000_000),
  dueDate: z.iso.date(),
  notes: z.string().trim().max(500).nullish().transform((v) => v || null),
});

export const PLATFORM_PAYMENT_METHODS = ['PAYSTACK', 'BANK_TRANSFER', 'CASH', 'OTHER'] as const;
export type PlatformPaymentMethod = (typeof PLATFORM_PAYMENT_METHODS)[number];
export const recordPlatformPaymentSchema = z.object({
  amountKobo: z.number().int().min(100).max(10_000_000_000),
  method: z.enum(PLATFORM_PAYMENT_METHODS).exclude(['PAYSTACK']),
  reference: z.string().trim().min(3).max(80),
  paidOn: z.iso.date(),
  note: z.string().trim().max(300).nullish().transform((v) => v || null),
});

export interface PlatformInvoiceRow {
  id: string;
  number: string;
  tenant: { id: string; name: string; slug: string };
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
  status: PlatformInvoiceStatus;
  overdue: boolean;
  issuedAt: string;
  dueDate: string;
  paidAt: string | null;
  notes: string | null;
}

export interface PlatformPaymentRow {
  id: string;
  tenant: { id: string; name: string; slug: string };
  invoice: { id: string; number: string };
  amountKobo: number;
  method: PlatformPaymentMethod;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  reference: string;
  paidAt: string | null;
  recordedBy: string | null;
  note: string | null;
  createdAt: string;
}

/** What a school sees on Settings → Billing. */
export interface SchoolBilling {
  status: string;
  trialEndsAt: string | null;
  plan: { name: string; description: string | null; billingPeriod: BillingPeriodKey; pricePerStudentKobo: number; features: string[]; aiMonthlyBudgetUsd: number | null; maxStudents: number | null } | null;
  subscription: Omit<SubscriptionRow, 'tenant' | 'plan' | 'notes'> | null;
  invoices: Omit<PlatformInvoiceRow, 'tenant'>[];
  payments: Omit<PlatformPaymentRow, 'tenant' | 'recordedBy'>[];
  outstandingKobo: number;
  onlinePayment: boolean;
  bankDetails: string | null;
  features: TenantFeatureState[];
  usage: { activeStudents: number; staff: number; aiSpendUsd: number; aiBudgetUsd: number | null };
}

// ============================================================ schools

export const TENANT_STATUSES = ['TRIAL', 'ACTIVE', 'SUSPENDED', 'ARCHIVED'] as const;
export type TenantStatusKey = (typeof TENANT_STATUSES)[number];

export const platformTenantUpdateSchema = z.object({
  name: z.string().trim().min(3).max(120),
  email: z.email().max(160).nullish().or(z.literal('')).transform((v) => v || null),
  phone: z.string().trim().max(40).nullish().transform((v) => v || null),
  address: z.string().trim().max(300).nullish().transform((v) => v || null),
  aiMonthlyBudgetUsd: z.number().min(0).max(100_000).nullable(),
  trialEndsAt: z.iso.date().nullable(),
});

export const tenantStatusSchema = z.object({
  status: z.enum(TENANT_STATUSES),
  reason: z.string().trim().min(3).max(300),
});

export interface PlatformSchoolRow {
  id: string;
  slug: string;
  name: string;
  status: TenantStatusKey;
  plan: string | null;
  subscriptionStatus: SubscriptionStatusKey | null;
  students: number;
  staff: number;
  users: number;
  branches: number;
  aiSpendUsd: number;
  apiRequests30d: number;
  outstandingKobo: number;
  lastActiveAt: string | null;
  trialEndsAt: string | null;
  createdAt: string;
}

// ============================================================ domains

export const DOMAIN_KINDS = ['PORTAL', 'WEBSITE'] as const;
export const domainSchema = z.object({
  tenantId: z.string().min(1),
  hostname: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, 'Enter a hostname like portal.myschool.ng'),
  kind: z.enum(DOMAIN_KINDS),
  isPrimary: z.boolean().default(false),
});

export interface DomainRow {
  id: string;
  hostname: string;
  kind: (typeof DOMAIN_KINDS)[number];
  isPrimary: boolean;
  verifiedAt: string | null;
  tenant: { id: string; name: string; slug: string };
  createdAt: string;
}

// ============================================================ support

export const TICKET_CATEGORIES = ['BILLING', 'TECHNICAL', 'ACCOUNT', 'DATA', 'FEATURE_REQUEST', 'OTHER'] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];
export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  BILLING: 'Billing',
  TECHNICAL: 'Something isn’t working',
  ACCOUNT: 'Accounts & access',
  DATA: 'Data & imports',
  FEATURE_REQUEST: 'Feature request',
  OTHER: 'Other',
};
export const TICKET_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];
export const TICKET_STATUSES = ['OPEN', 'PENDING', 'RESOLVED', 'CLOSED'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const createTicketSchema = z.object({
  subject: z.string().trim().min(4).max(160),
  category: z.enum(TICKET_CATEGORIES),
  priority: z.enum(TICKET_PRIORITIES).default('NORMAL'),
  body: z.string().trim().min(10).max(5000),
});
export const ticketReplySchema = z.object({
  body: z.string().trim().min(1).max(5000),
  /** Platform only: a note other support staff see but the school doesn't. */
  internal: z.boolean().default(false),
  /** Platform only: status to set with this reply (defaults to PENDING, i.e. waiting on the school). */
  status: z.enum(TICKET_STATUSES).optional(),
});
export const ticketUpdateSchema = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  category: z.enum(TICKET_CATEGORIES).optional(),
  assignedToId: z.string().nullable().optional(),
});

export interface TicketRow {
  id: string;
  number: number;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  tenant: { id: string; name: string; slug: string };
  openedBy: { id: string; name: string; email: string } | null;
  assignedTo: { id: string; name: string } | null;
  messages: number;
  lastMessageAt: string;
  /** Whether the last public message came from the school (needs a reply). */
  awaitingPlatform: boolean;
  createdAt: string;
}
export interface TicketMessage {
  id: string;
  body: string;
  fromPlatform: boolean;
  internal: boolean;
  author: { id: string; name: string } | null;
  createdAt: string;
}
export interface TicketDetail extends TicketRow {
  thread: TicketMessage[];
  firstResponseAt: string | null;
  resolvedAt: string | null;
}
export interface TicketAssist {
  summary: string;
  suggestedCategory: TicketCategory;
  suggestedPriority: TicketPriority;
  draftReply: string;
  provider: string;
  model: string;
}

// ============================================================ console

export interface PlatformOverview {
  schools: Record<TenantStatusKey, number> & { total: number; newThisMonth: number };
  students: number;
  staff: number;
  users: number;
  mrrKobo: number;
  arrKobo: number;
  collectedThisMonthKobo: number;
  outstandingKobo: number;
  overdueKobo: number;
  overdueInvoices: number;
  pastDue: number;
  trialsEndingSoon: { id: string; name: string; slug: string; trialEndsAt: string; students: number }[];
  aiSpendThisMonthUsd: number;
  aiSpendLastMonthUsd: number;
  apiRequests24h: number;
  apiErrorRate24h: number;
  openTickets: number;
  urgentTickets: number;
  signups: { month: string; count: number }[];
  revenue: { month: string; kobo: number }[];
}

export interface UsageSeriesPoint {
  day: string;
  value: number;
}
export interface PlatformAiUsageReport {
  month: string;
  totalUsd: number;
  calls: number;
  failures: number;
  inputTokens: number;
  outputTokens: number;
  daily: UsageSeriesPoint[];
  byTenant: { tenant: { id: string; name: string; slug: string } | null; usd: number; calls: number; budgetUsd: number | null; budgetUsedPct: number | null }[];
  byModel: { provider: string; model: string; usd: number; calls: number }[];
  byAgent: { agent: string; usd: number; calls: number }[];
}
export interface ApiUsageReport {
  days: number;
  requests: number;
  clientErrors: number;
  serverErrors: number;
  avgMs: number;
  daily: { day: string; requests: number; serverErrors: number }[];
  byTenant: { tenant: { id: string; name: string; slug: string } | null; requests: number; clientErrors: number; serverErrors: number; avgMs: number; maxMs: number }[];
}
export interface StudentUsageReport {
  totalActive: number;
  totalSeats: number;
  rows: {
    tenant: { id: string; name: string; slug: string; status: TenantStatusKey };
    plan: string | null;
    active: number;
    seats: number;
    billable: number;
    maxStudents: number | null;
    overLimit: boolean;
    addedLast30d: number;
    leftLast30d: number;
  }[];
  growth: { month: string; admitted: number }[];
}

export interface HealthCheck {
  key: string;
  label: string;
  status: 'ok' | 'warn' | 'fail';
  detail: string;
}
export interface SystemHealth {
  status: 'ok' | 'warn' | 'fail';
  checkedAt: string;
  version: string;
  node: string;
  environment: string;
  uptimeSeconds: number;
  memory: { rssMb: number; heapUsedMb: number; heapTotalMb: number };
  db: { latencyMs: number; sizeMb: number | null; migrations: number; lastMigration: string | null };
  uploads: { files: number; sizeMb: number };
  queues: { aiJobsPending: number; aiJobsFailed24h: number; deliveriesQueued: number; deliveriesFailed24h: number; scheduledBroadcasts: number; lastAutomationRunAt: string | null };
  errors: { serverErrors24h: number; requests24h: number; aiFailures24h: number };
  checks: HealthCheck[];
}

export const auditQuerySchema = z.object({
  tenantId: z.string().optional(),
  action: z.string().trim().max(80).optional(),
  actor: z.string().trim().max(120).optional(),
  scope: z.enum(['all', 'platform', 'schools']).default('all'),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(10).max(200).default(50),
});
export interface PlatformAuditRow {
  id: string;
  action: string;
  summary: string;
  tenant: { id: string; name: string; slug: string } | null;
  actor: { id: string; name: string; email: string; platformRole: PlatformRole | null } | null;
  entityType: string | null;
  entityId: string | null;
  ip: string | null;
  createdAt: string;
}

export interface PlatformBriefing {
  headline: string;
  summary: string;
  risks: { school: string; issue: string; action: string }[];
  opportunities: { school: string; insight: string; action: string }[];
  operations: string[];
  provider: string;
  model: string;
}

/** Which console areas each platform role can open. */
export const PLATFORM_AREAS = {
  overview: ['SUPER_ADMIN', 'SUPPORT_ADMIN', 'FINANCE_ADMIN'],
  schools: ['SUPER_ADMIN', 'SUPPORT_ADMIN', 'FINANCE_ADMIN'],
  billing: ['SUPER_ADMIN', 'FINANCE_ADMIN'],
  plans: ['SUPER_ADMIN', 'FINANCE_ADMIN'],
  usage: ['SUPER_ADMIN', 'SUPPORT_ADMIN', 'FINANCE_ADMIN'],
  domains: ['SUPER_ADMIN', 'SUPPORT_ADMIN'],
  support: ['SUPER_ADMIN', 'SUPPORT_ADMIN'],
  health: ['SUPER_ADMIN', 'SUPPORT_ADMIN'],
  flags: ['SUPER_ADMIN'],
  audit: ['SUPER_ADMIN', 'SUPPORT_ADMIN'],
  /** Parent subscriptions, products, coupons, refunds, the ledger and unit economics. */
  commerce: ['SUPER_ADMIN', 'FINANCE_ADMIN'],
  /** The Exam Academy question bank and syllabus. */
  content: ['SUPER_ADMIN', 'SUPPORT_ADMIN'],
} as const satisfies Record<string, readonly PlatformRole[]>;
export type PlatformArea = keyof typeof PLATFORM_AREAS;
