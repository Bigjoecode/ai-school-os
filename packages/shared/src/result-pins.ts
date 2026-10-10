import { z } from 'zod';
import type { ReportCardView } from './assessment';

/**
 * Result-checker PINs ("scratch cards"): the school prints or sells cards,
 * each with a printed serial number and a secret 12-digit PIN. A parent
 * enters the admission number, serial and PIN to see a published report
 * card. The first use binds the card to that student; each view uses one
 * of the card's checks.
 */

export const RESULT_PIN_CHANNELS = ['PRINT', 'ONLINE'] as const;
export type ResultPinChannel = (typeof RESULT_PIN_CHANNELS)[number];
export const RESULT_PIN_CHANNEL_LABELS: Record<ResultPinChannel, string> = {
  PRINT: 'Printed cards (sold by the school)',
  ONLINE: 'Sold online (PIN shown after payment)',
};

export const RESULT_PIN_STATUSES = ['UNSOLD', 'SOLD', 'VOID'] as const;
export type ResultPinStatus = (typeof RESULT_PIN_STATUSES)[number];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-12-31');

export const createPinBatchSchema = z.object({
  label: z.string().trim().max(80).nullish().transform((v) => v || null),
  channel: z.enum(RESULT_PIN_CHANNELS).default('PRINT'),
  sessionId: z.string().min(1, 'Choose a session'),
  /** Empty: the card works for any term of the session. */
  termId: z.string().min(1).nullish().transform((v) => v || null),
  count: z.number().int().min(1, 'At least 1 card').max(5000, 'At most 5,000 cards in one batch'),
  usesPerPin: z.number().int().min(1).max(50).default(5),
  /** Price of one card in kobo (for records and online sales). */
  priceKobo: z.number().int().min(0).max(100_000_00),
  expiresOn: isoDate,
  /** Cards only work after the bursar records them as sold. */
  requireSale: z.boolean().default(false),
});
export type CreatePinBatchInput = z.infer<typeof createPinBatchSchema>;

export const extendPinBatchSchema = z.object({ expiresOn: isoDate });

export const sellPinsSchema = z.object({
  fromSerial: z.string().trim().min(4).max(20),
  toSerial: z.string().trim().min(4).max(20),
  soldTo: z.string().trim().max(120).nullish().transform((v) => v || null),
});

export const voidPinSchema = z.object({
  serial: z.string().trim().min(4).max(20),
  reason: z.string().trim().min(2).max(200),
});

export const pinCheckSchema = z.object({
  admissionNumber: z.string().trim().min(2).max(40),
  /** The student's surname: a second fact, so a card can't be used to guess admission numbers. */
  surname: z.string().trim().min(2, 'Enter the student’s surname').max(80),
  serial: z.string().trim().transform((v) => v.replace(/[\s-]/g, '')).pipe(z.string().regex(/^\d{6,12}$/, 'The serial number is the digits printed on the card')),
  pin: z.string().transform((v) => v.replace(/[\s-]/g, '')).pipe(z.string().regex(/^\d{12}$/, 'The PIN is 12 digits')),
  termId: z.string().min(1, 'Choose the term'),
  challenge: z.object({ token: z.string().max(400), answer: z.string().trim().max(10) }).nullish(),
  /** Honeypot: real people leave it empty. */
  website: z.string().max(0).optional(),
});
export type PinCheckInput = z.infer<typeof pinCheckSchema>;

export const portalPinUnlockSchema = pinCheckSchema.pick({ serial: true, pin: true });

export const buyPinSchema = z.object({
  batchId: z.string().min(1),
  name: z.string().trim().min(2).max(120),
  email: z.email('Enter a valid email address').max(160),
  phone: z.string().trim().min(7).max(30),
  /** Where Paystack sends the buyer back to (a path on this site). */
  returnPath: z.string().max(200).regex(/^\/(?!\/)[\w\-/]*$/, 'Bad return path'),
  website: z.string().max(0).optional(),
});
export type BuyPinInput = z.infer<typeof buyPinSchema>;

// ============================================================ responses

export interface PinBatchRow {
  id: string;
  number: number;
  label: string | null;
  channel: ResultPinChannel;
  sessionId: string;
  sessionName: string;
  termId: string | null;
  termName: string | null;
  count: number;
  usesPerPin: number;
  priceKobo: number;
  expiresOn: string;
  expired: boolean;
  requireSale: boolean;
  status: 'ACTIVE' | 'VOID';
  exportedAt: string | null;
  createdAt: string;
  firstSerial: string;
  lastSerial: string;
  counts: { sold: number; used: number; unused: number; void: number; exhausted: number; usedNotRecordedSold: number };
  /** Recorded sales × price, in kobo. */
  revenueKobo: number;
  /** Paid online, in kobo (what Paystack actually received). */
  onlineKobo: number;
}

export interface PinOverview {
  currency: string;
  batches: PinBatchRow[];
  totals: { cards: number; sold: number; used: number; unused: number; void: number; revenueKobo: number; onlineKobo: number; checks: number };
  /** Online sales need Paystack connected and online payments switched on. */
  onlineReady: boolean;
  checkerUrl: string;
  slug: string;
}

export interface PinExport {
  batch: PinBatchRow;
  school: { name: string; logoUrl: string | null; motto: string | null };
  checkerUrl: string;
  cards: { serial: string; pin: string }[];
}

export interface PinCardDetail {
  serial: string;
  last4: string;
  status: ResultPinStatus;
  batch: { id: string; number: number; label: string | null; sessionName: string; termName: string | null; expiresOn: string };
  soldAt: string | null;
  soldVia: string | null;
  soldTo: string | null;
  student: { id: string; name: string; admissionNumber: string } | null;
  usesLeft: number;
  usesPerPin: number;
  failedAttempts: number;
  lockedUntil: string | null;
  voidReason: string | null;
  uses: PinUseRow[];
}

export interface PinUseRow {
  id: string;
  at: string;
  serial: string;
  student: string;
  admissionNumber: string;
  term: string;
  channel: 'WEB' | 'PORTAL';
  /** A short hash of the visitor's IP address (never the address itself). */
  ipHash: string | null;
}

export interface PinSaleRow {
  id: string;
  reference: string;
  at: string;
  buyerName: string;
  email: string;
  phone: string | null;
  amountKobo: number;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'PAID_NO_CARD';
  serial: string | null;
}

export interface PublicPinInfo {
  school: { name: string; logoUrl: string | null; slug: string };
  /** The school has active scratch-card batches. */
  enabled: boolean;
  terms: { id: string; name: string; sessionName: string; isCurrent: boolean }[];
  currency: string;
  offers: { batchId: string; title: string; priceKobo: number; usesPerPin: number; expiresOn: string; available: boolean }[];
}

export interface PinCheckResult {
  view: ReportCardView;
  card: { serial: string; usesLeft: number; expiresOn: string };
}

export interface PinChallenge {
  question: string;
  token: string;
}

export interface PinPurchaseStart {
  authorizationUrl: string;
  reference: string;
  claim: string;
}

export interface PinPurchaseResult {
  status: 'PENDING' | 'PAID' | 'FAILED' | 'PAID_NO_CARD';
  serial: string | null;
  pin: string | null;
  usesPerPin: number | null;
  expiresOn: string | null;
  message: string;
  delivered: { sms: boolean; email: boolean };
}

/** "123456789012" → "1234 5678 9012". */
export const formatPin = (pin: string) => pin.replace(/(\d{4})(?=\d)/g, '$1 ');
