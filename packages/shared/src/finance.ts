import { z } from 'zod';

/**
 * Finance contracts: fee schedules, invoices, payments (manual and Paystack),
 * expenses and reports. Amounts are integers in the currency's minor unit
 * (kobo for NGN): ₦150,000 is 15000000.
 */

export const FEE_CATEGORIES = ['TUITION', 'LEVY', 'BOOKS', 'UNIFORM', 'TRANSPORT', 'BOARDING', 'EXAM', 'LAB', 'ICT', 'OTHER'] as const;
export const FEE_CATEGORY_LABELS: Record<(typeof FEE_CATEGORIES)[number], string> = {
  TUITION: 'Tuition',
  LEVY: 'Levy',
  BOOKS: 'Books',
  UNIFORM: 'Uniform',
  TRANSPORT: 'Transport',
  BOARDING: 'Boarding',
  EXAM: 'Exam fee',
  LAB: 'Laboratory',
  ICT: 'ICT',
  OTHER: 'Other',
};

export const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'POS', 'CHEQUE', 'PAYSTACK'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank transfer',
  POS: 'POS',
  CHEQUE: 'Cheque',
  PAYSTACK: 'Paystack (online)',
};

export const EXPENSE_CATEGORIES = ['SALARIES', 'UTILITIES', 'FUEL', 'MAINTENANCE', 'SUPPLIES', 'TRANSPORT', 'EVENTS', 'FEEDING', 'OTHER'] as const;
export const EXPENSE_CATEGORY_LABELS: Record<(typeof EXPENSE_CATEGORIES)[number], string> = {
  SALARIES: 'Salaries',
  UTILITIES: 'Utilities',
  FUEL: 'Diesel & fuel',
  MAINTENANCE: 'Maintenance',
  SUPPLIES: 'Supplies',
  TRANSPORT: 'Transport',
  EVENTS: 'Events',
  FEEDING: 'Feeding',
  OTHER: 'Other',
};

export const INVOICE_STATUSES = ['ISSUED', 'PART_PAID', 'PAID', 'CANCELLED'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** kobo → "₦150,000" (or "₦150,000.50" when there are kobo). */
export function formatMoney(kobo: number, currency = 'NGN'): string {
  const major = kobo / 100;
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    minimumFractionDigits: Number.isInteger(major) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(major);
}

/** "150,000" or "150000.5" (naira) → kobo. */
export function toKobo(naira: number): number {
  return Math.round(naira * 100);
}

export interface FinanceSettings {
  invoicePrefix: string;
  receiptPrefix: string;
  /** Days after issue that an invoice falls due. */
  defaultDueDays: number;
  /** Shown on invoices for payment by transfer. */
  bankDetails: string | null;
}

export const DEFAULT_FINANCE_SETTINGS: FinanceSettings = {
  invoicePrefix: 'INV',
  receiptPrefix: 'RCT',
  defaultDueDays: 21,
  bankDetails: null,
};

// ------------------------------------------------------------ schemas

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const kobo = z.number().int();
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const financeSettingsSchema = z.object({
  invoicePrefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,8}$/, '2–8 letters or digits'),
  receiptPrefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,8}$/, '2–8 letters or digits'),
  defaultDueDays: z.number().int().min(0).max(120),
  bankDetails: z.string().trim().max(500).nullable(),
});

export const feeItemSchema = z.object({
  termId: z.string().min(1),
  name: z.string().trim().min(2).max(80),
  category: z.enum(FEE_CATEGORIES).default('TUITION'),
  amountKobo: kobo.min(100, 'At least ₦1').max(2_000_000_000),
  classLevelIds: z.array(z.string()).max(50).default([]),
  optional: z.boolean().default(false),
});
export type FeeItemInput = z.infer<typeof feeItemSchema>;

export const copyFeesSchema = z.object({
  fromTermId: z.string().min(1),
  toTermId: z.string().min(1),
});

export const generateInvoicesSchema = z.object({
  termId: z.string().min(1),
  /** Limit to some class levels (empty = the whole school). */
  classLevelIds: z.array(z.string()).max(50).default([]),
  dueDate: isoDate.optional(),
  /** Discount applied to every child after the eldest in a family, in percent. */
  siblingDiscountPct: z.number().min(0).max(100).default(0),
});
export type GenerateInvoicesInput = z.infer<typeof generateInvoicesSchema>;

export const invoiceLineSchema = z.object({
  description: z.string().trim().min(2).max(120),
  kind: z.enum(['FEE', 'DISCOUNT', 'FINE']),
  /** Positive number; discounts are subtracted automatically. */
  amountKobo: kobo.min(1).max(2_000_000_000),
});
export type InvoiceLineInput = z.infer<typeof invoiceLineSchema>;

export const invoiceListQuerySchema = z.object({
  termId: z.string().optional(),
  classArmId: z.string().optional(),
  status: z.enum([...INVOICE_STATUSES, 'OUTSTANDING', 'OVERDUE']).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;

export const recordPaymentSchema = z.object({
  invoiceId: z.string().min(1),
  amountKobo: kobo.min(100, 'At least ₦1'),
  method: z.enum(['CASH', 'BANK_TRANSFER', 'POS', 'CHEQUE']),
  reference: optionalText(80),
  payerName: optionalText(120),
  paidOn: isoDate.optional(),
  note: optionalText(300),
});
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

export const reversePaymentSchema = z.object({ reason: z.string().trim().min(3).max(300) });

export const paymentListQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type PaymentListQuery = z.infer<typeof paymentListQuerySchema>;

export const expenseSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  description: z.string().trim().min(2).max(200),
  amountKobo: kobo.min(100).max(2_000_000_000),
  spentOn: isoDate,
  paidTo: optionalText(120),
  method: optionalText(40),
  reference: optionalText(80),
});
export type ExpenseInput = z.infer<typeof expenseSchema>;

export const expenseListQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  category: z.enum(EXPENSE_CATEGORIES).optional(),
});

export const paystackSettingsSchema = z.object({
  publicKey: z.string().trim().regex(/^pk_(test|live)_[A-Za-z0-9]+$/, 'Starts with pk_test_ or pk_live_'),
  secretKey: z.string().trim().regex(/^sk_(test|live)_[A-Za-z0-9]+$/, 'Starts with sk_test_ or sk_live_'),
});

/** Public payment link: the parent chooses how much to pay now. */
export const startOnlinePaymentSchema = z.object({
  token: z.string().min(10),
  amountKobo: kobo.min(10_000, 'At least ₦100'),
  email: z.email('Enter an email for your receipt'),
  payerName: optionalText(120),
});

export const verifyOnlinePaymentSchema = z.object({ reference: z.string().min(6).max(100) });

export const financeReportQuerySchema = z.object({ termId: z.string().optional() });

export const feeReminderSchema = z.object({ invoiceId: z.string().min(1) });
export const aiFeeReminderSchema = z.object({ subject: z.string(), message: z.string(), smsVersion: z.string() });

// ------------------------------------------------------------ responses

interface Ref {
  id: string;
  name: string;
}

export interface FeeItemRow {
  id: string;
  termId: string;
  name: string;
  category: (typeof FEE_CATEGORIES)[number];
  amountKobo: number;
  classLevelIds: string[];
  optional: boolean;
  invoicedCount: number;
}

export interface InvoiceRow {
  id: string;
  number: string;
  status: InvoiceStatus;
  student: { id: string; name: string; admissionNumber: string; classArm: string | null };
  term: Ref;
  totalKobo: number;
  paidKobo: number;
  balanceKobo: number;
  dueDate: string;
  overdue: boolean;
  issuedAt: string;
}

export interface InvoiceDetail extends InvoiceRow {
  school: { name: string; address: string | null; phone: string | null; email: string | null; logoUrl: string | null; bankDetails: string | null };
  currency: string;
  lines: { id: string; description: string; kind: 'FEE' | 'DISCOUNT' | 'FINE'; amountKobo: number }[];
  payments: PaymentRow[];
  guardians: { id: string; name: string; phone: string; email: string | null }[];
  note: string | null;
  /** Path for the parent payment page (append to the site origin). */
  payPath: string | null;
  onlinePaymentsEnabled: boolean;
}

export interface PaymentRow {
  id: string;
  receiptNumber: string | null;
  invoiceId: string;
  invoiceNumber: string;
  student: { id: string; name: string; classArm: string | null };
  amountKobo: number;
  method: PaymentMethod;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'REVERSED';
  reference: string | null;
  payerName: string | null;
  paidAt: string;
  receivedBy: string | null;
  note: string | null;
}

export interface ReceiptView extends PaymentRow {
  school: InvoiceDetail['school'];
  currency: string;
  invoice: { number: string; totalKobo: number; paidKobo: number; balanceKobo: number; term: string };
}

export interface GenerateInvoicesResult {
  created: number;
  skipped: number;
  totalKobo: number;
  noFees: number;
}

export interface ExpenseRow {
  id: string;
  category: (typeof EXPENSE_CATEGORIES)[number];
  description: string;
  amountKobo: number;
  spentOn: string;
  paidTo: string | null;
  method: string | null;
  reference: string | null;
  recordedBy: string | null;
}

export interface FinanceOverview {
  currency: string;
  term: Ref & { startsOn: string; endsOn: string };
  billedKobo: number;
  collectedKobo: number;
  outstandingKobo: number;
  overdueKobo: number;
  collectionRate: number | null;
  invoices: { total: number; paid: number; partPaid: number; unpaid: number; overdue: number };
  byClass: { classArm: string; billedKobo: number; collectedKobo: number; rate: number | null }[];
  byMethod: { method: PaymentMethod; amountKobo: number; count: number }[];
  daily: { date: string; amountKobo: number }[];
  topDebtors: { invoiceId: string; student: string; classArm: string | null; balanceKobo: number; overdueDays: number }[];
  expenses: { thisMonthKobo: number; lastMonthKobo: number; termKobo: number; byCategory: { category: string; amountKobo: number }[] };
  incomeVsExpense: { month: string; incomeKobo: number; expenseKobo: number }[];
  onlinePaymentsEnabled: boolean;
}

export interface PaystackStatus {
  connected: boolean;
  publicKey: string | null;
  secretHint: string | null;
  isLive: boolean;
  /** Paste into Paystack → Settings → API keys & webhooks. */
  webhookPath: string;
}

/** What a parent sees on the public payment page. */
export interface PublicInvoice {
  school: { name: string; logoUrl: string | null };
  currency: string;
  invoice: { number: string; term: string; totalKobo: number; paidKobo: number; balanceKobo: number; dueDate: string; status: InvoiceStatus };
  student: { firstName: string; classArm: string | null };
  lines: { description: string; amountKobo: number }[];
  onlinePaymentsEnabled: boolean;
  guardianEmail: string | null;
}

export interface OnlinePaymentStart {
  authorizationUrl: string;
  reference: string;
}

export interface OnlinePaymentResult {
  status: 'SUCCESS' | 'PENDING' | 'FAILED';
  amountKobo: number;
  receiptNumber: string | null;
  receiptPath: string | null;
  balanceKobo: number;
  message: string;
}

export interface FeeReminder {
  subject: string;
  message: string;
  smsVersion: string;
  guardian: { id: string; name: string; phone: string; email: string | null } | null;
  provider: string;
  model: string;
}
