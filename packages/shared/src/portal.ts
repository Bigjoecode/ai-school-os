import { z } from 'zod';

/**
 * The family portal: what parents (for each child) and students (for
 * themselves) can see about school life: attendance, published results and
 * report cards, exams and the calendar, and the school's downloads.
 */

export const portalSettingsSchema = z.object({
  showAttendance: z.boolean(),
  showResults: z.boolean(),
  /** Common in Nigerian schools: results stay hidden until the fees are paid. */
  withholdResultsWhenOwing: z.boolean(),
  withholdMessage: z.string().trim().max(300).nullish().transform((v) => v || null),
  showCalendar: z.boolean(),
  showDownloads: z.boolean(),
  /** Fees, receipts and paying online (parents only). */
  showFees: z.boolean().default(true),
});
export type PortalSettings = z.infer<typeof portalSettingsSchema>;
export const DEFAULT_PORTAL_SETTINGS: PortalSettings = {
  showAttendance: true,
  showResults: true,
  withholdResultsWhenOwing: false,
  withholdMessage: null,
  showCalendar: true,
  showDownloads: true,
  showFees: true,
};

export const DOWNLOAD_AUDIENCES = ['PUBLIC', 'FAMILIES', 'PARENTS', 'STUDENTS'] as const;
export type DownloadAudience = (typeof DOWNLOAD_AUDIENCES)[number];
export const DOWNLOAD_AUDIENCE_LABELS: Record<DownloadAudience, string> = {
  PUBLIC: 'Everyone (website and portal)',
  FAMILIES: 'Parents and students (portal only)',
  PARENTS: 'Parents only',
  STUDENTS: 'Students only',
};

export interface PortalChild {
  id: string;
  name: string;
  firstName: string;
  admissionNumber: string;
  className: string | null;
  photoUrl: string | null;
}

export interface PortalMe {
  /** PARENT: sees their children; STUDENT: sees themselves. */
  role: 'PARENT' | 'STUDENT';
  children: PortalChild[];
  settings: PortalSettings;
  currency: string;
}

export interface PortalTermRef {
  id: string;
  name: string;
  sessionName: string;
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
}

export interface PortalAttendance {
  term: PortalTermRef;
  terms: PortalTermRef[];
  counts: { present: number; absent: number; late: number; excused: number; rate: number | null; daysMarked: number };
  /** Every marked school day, newest first. */
  days: { date: string; status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'; note: string | null }[];
}

export interface PortalResultTerm {
  term: PortalTermRef;
  published: boolean;
  publishedAt: string | null;
  average: number | null;
  position: number | null;
  classSize: number | null;
  /** Set when the school withholds the result (e.g. fees owed). */
  withheld: string | null;
}

export interface PortalEvent {
  id: string;
  title: string;
  description: string | null;
  category: string;
  startDate: string;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  location: string | null;
}

export interface PortalDownload {
  id: string;
  title: string;
  description: string | null;
  category: string;
  fileUrl: string;
  sizeBytes: number | null;
  updatedAt: string;
}

export interface PortalOverview {
  child: PortalChild;
  attendance: PortalAttendance['counts'] | null;
  latestResult: PortalResultTerm | null;
  upcoming: PortalEvent[];
  homeworkDue: number;
  /** Parents only. */
  feesOwed: number | null;
  newDownloads: number;
}

/** A child's fees for parents: every invoice, what's been paid, and how to pay the rest. */
export interface PortalFees {
  currency: string;
  /** Paystack is connected and online payments are on: Pay now opens the payment page. */
  onlinePayments: boolean;
  /** For paying by transfer or at the bank, as the school wrote it. */
  bankDetails: string | null;
  totals: { billedKobo: number; paidKobo: number; balanceKobo: number };
  invoices: {
    id: string;
    number: string;
    term: string;
    sessionName: string;
    totalKobo: number;
    paidKobo: number;
    balanceKobo: number;
    dueDate: string;
    status: string;
    overdue: boolean;
    lines: { description: string; amountKobo: number }[];
    /** /pay/<token>: the payment page for this invoice (null when nothing is owed or online payment is off). */
    payPath: string | null;
  }[];
  payments: { id: string; receiptNumber: string | null; amountKobo: number; method: string; status: string; paidAt: string | null; invoiceNumber: string }[];
}
