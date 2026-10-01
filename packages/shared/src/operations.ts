import { z } from 'zod';
import type { AiText } from './hr';

/**
 * Operations contracts: library, inventory, transport, hostel, reception,
 * certificates and ID cards. Money is integer kobo, like finance.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');
const kobo = z.number().int();
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

export interface PersonRef {
  kind: 'STUDENT' | 'STAFF';
  id: string;
  name: string;
  /** Class for a student, job title for staff. */
  detail: string | null;
}

// ============================================================ settings

export interface OperationsSettings {
  libraryLoanDays: number;
  libraryStudentMaxLoans: number;
  libraryStaffMaxLoans: number;
  /** Fine per day overdue, in kobo (0 = no fines). */
  libraryFinePerDayKobo: number;
  /** Certificate serial prefix, e.g. GIS → GIS/CERT/2026/0007. */
  certificatePrefix: string;
  /** Last day student and staff ID cards are valid. */
  idCardValidUntil: string | null;
}

export const DEFAULT_OPERATIONS_SETTINGS: OperationsSettings = {
  libraryLoanDays: 14,
  libraryStudentMaxLoans: 3,
  libraryStaffMaxLoans: 5,
  libraryFinePerDayKobo: 2_000,
  certificatePrefix: 'CERT',
  idCardValidUntil: null,
};

export const operationsSettingsSchema = z.object({
  libraryLoanDays: z.number().int().min(1).max(120),
  libraryStudentMaxLoans: z.number().int().min(1).max(20),
  libraryStaffMaxLoans: z.number().int().min(1).max(50),
  libraryFinePerDayKobo: kobo.min(0).max(1_000_000),
  certificatePrefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,8}$/, '2–8 letters or digits'),
  idCardValidUntil: isoDate.nullable(),
});

// ============================================================ library

export const BOOK_CATEGORIES = ['TEXTBOOK', 'FICTION', 'NON_FICTION', 'REFERENCE', 'AFRICAN_LITERATURE', 'SCIENCE', 'MAGAZINE', 'OTHER'] as const;
export type BookCategory = (typeof BOOK_CATEGORIES)[number];
export const BOOK_CATEGORY_LABELS: Record<BookCategory, string> = {
  TEXTBOOK: 'Textbook',
  FICTION: 'Fiction',
  NON_FICTION: 'Non-fiction',
  REFERENCE: 'Reference',
  AFRICAN_LITERATURE: 'African literature',
  SCIENCE: 'Science',
  MAGAZINE: 'Magazine',
  OTHER: 'Other',
};

export const bookSchema = z.object({
  title: z.string().trim().min(1).max(200),
  author: z.string().trim().min(1).max(160),
  isbn: nullableText(20),
  category: z.enum(BOOK_CATEGORIES),
  publisher: nullableText(120),
  publishedYear: z.number().int().min(1800).max(2100).nullish().transform((v) => v ?? null),
  shelf: nullableText(30),
  subject: nullableText(80),
  /** Suggested reading level, free text: "JSS 1–3", "SS 2". */
  level: nullableText(40),
  copies: z.number().int().min(1).max(1000),
  summary: nullableText(1000),
});
export type BookInput = z.infer<typeof bookSchema>;

export const bookListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.enum(BOOK_CATEGORIES).optional(),
  available: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const issueLoanSchema = z
  .object({
    bookId: z.string().min(1),
    studentId: z.string().min(1).optional(),
    staffId: z.string().min(1).optional(),
    dueOn: isoDate.optional(),
    note: nullableText(200),
  })
  .refine((v) => !!v.studentId !== !!v.staffId, { message: 'Choose one borrower — a student or a member of staff', path: ['studentId'] });
export type IssueLoanInput = z.infer<typeof issueLoanSchema>;

export const returnLoanSchema = z.object({
  /** Waive part or all of the fine (kobo). */
  fineKobo: kobo.min(0).max(100_000_000).optional(),
  finePaid: z.boolean().default(false),
  note: nullableText(200),
});

export const loanListQuerySchema = z.object({
  status: z.enum(['OUT', 'OVERDUE', 'RETURNED', 'ALL']).default('OUT'),
  studentId: z.string().optional(),
  staffId: z.string().optional(),
  bookId: z.string().optional(),
});

export const readingListRequestSchema = z.object({
  /** Who it's for, e.g. "JSS 2 students who enjoy adventure stories". */
  audience: z.string().trim().min(3).max(200),
  topic: z.string().trim().max(200).optional(),
  count: z.number().int().min(3).max(15).default(8),
});

export const aiReadingListSchema = z.object({
  intro: z.string().describe('One or two sentences introducing the list to the readers'),
  picks: z
    .array(
      z.object({
        bookId: z.string().describe('The id of a book from the CATALOGUE — never invent one'),
        why: z.string().describe('One sentence on why this reader would enjoy or benefit from it'),
      }),
    )
    .describe('Books chosen only from the catalogue provided, best first'),
});
export type AiReadingList = z.infer<typeof aiReadingListSchema>;

export interface BookRow {
  id: string;
  title: string;
  author: string;
  isbn: string | null;
  category: BookCategory;
  publisher: string | null;
  publishedYear: number | null;
  shelf: string | null;
  subject: string | null;
  level: string | null;
  copies: number;
  onLoan: number;
  available: number;
  timesBorrowed: number;
  summary: string | null;
}

export interface LoanRow {
  id: string;
  book: { id: string; title: string; author: string };
  borrower: PersonRef;
  issuedOn: string;
  dueOn: string;
  returnedOn: string | null;
  daysOverdue: number;
  /** Fine accrued so far (open loans) or charged (returned). */
  fineKobo: number;
  finePaid: boolean;
  note: string | null;
}

export interface LibraryOverview {
  currency: string;
  titles: number;
  copies: number;
  onLoan: number;
  overdue: number;
  finesOutstandingKobo: number;
  loansThisMonth: number;
  byCategory: { category: BookCategory; titles: number; copies: number }[];
  popular: { id: string; title: string; author: string; loans: number }[];
  topReaders: { borrower: PersonRef; loans: number }[];
  loansByMonth: { month: string; loans: number }[];
  settings: OperationsSettings;
}

export interface ReadingList extends AiText {
  intro: string;
  picks: { book: BookRow; why: string }[];
}

// ============================================================ inventory

export const INVENTORY_CATEGORIES = ['STATIONERY', 'CLEANING', 'LAB', 'ICT', 'FURNITURE', 'SPORTS', 'KITCHEN', 'MEDICAL', 'UNIFORM', 'MAINTENANCE', 'OTHER'] as const;
export type InventoryCategory = (typeof INVENTORY_CATEGORIES)[number];
export const INVENTORY_CATEGORY_LABELS: Record<InventoryCategory, string> = {
  STATIONERY: 'Stationery',
  CLEANING: 'Cleaning',
  LAB: 'Laboratory',
  ICT: 'ICT equipment',
  FURNITURE: 'Furniture',
  SPORTS: 'Sports',
  KITCHEN: 'Kitchen',
  MEDICAL: 'Sick bay',
  UNIFORM: 'Uniforms',
  MAINTENANCE: 'Maintenance',
  OTHER: 'Other',
};

export const ASSET_CONDITIONS = ['NEW', 'GOOD', 'FAIR', 'POOR', 'BROKEN'] as const;
export type AssetCondition = (typeof ASSET_CONDITIONS)[number];

export const inventoryItemSchema = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.enum(INVENTORY_CATEGORIES),
  unit: z.string().trim().min(1).max(20).default('pcs'),
  sku: nullableText(40),
  location: nullableText(80),
  reorderLevel: z.number().int().min(0).max(1_000_000).default(0),
  unitCostKobo: kobo.min(0).max(1_000_000_000).default(0),
  /** Equipment and furniture tracked as assets, with a condition. */
  isAsset: z.boolean().default(false),
  condition: z.enum(ASSET_CONDITIONS).nullish().transform((v) => v ?? null),
  /** Opening stock when the item is created. */
  openingQuantity: z.number().int().min(0).max(1_000_000).optional(),
});
export type InventoryItemInput = z.infer<typeof inventoryItemSchema>;

export const STOCK_MOVEMENT_KINDS = ['IN', 'OUT', 'ADJUST'] as const;
export type StockMovementKind = (typeof STOCK_MOVEMENT_KINDS)[number];

export const stockMovementSchema = z.object({
  kind: z.enum(STOCK_MOVEMENT_KINDS),
  /** Positive for IN and OUT; for ADJUST, the counted quantity now on hand. */
  quantity: z.number().int().min(0).max(1_000_000),
  unitCostKobo: kobo.min(0).max(1_000_000_000).optional(),
  reason: nullableText(200),
  /** Who it went to: "JSS 2 A", "Kitchen", "Mr Bello". */
  issuedTo: nullableText(120),
  movedOn: isoDate.optional(),
  supplier: nullableText(120),
  /** For IN: also record the purchase as an expense in Finance. */
  recordExpense: z.boolean().default(false),
});
export type StockMovementInput = z.infer<typeof stockMovementSchema>;

export interface InventoryItemRow {
  id: string;
  name: string;
  category: InventoryCategory;
  unit: string;
  sku: string | null;
  location: string | null;
  quantity: number;
  reorderLevel: number;
  unitCostKobo: number;
  valueKobo: number;
  isAsset: boolean;
  condition: AssetCondition | null;
  low: boolean;
  /** Average issued per week over the last 8 weeks. */
  weeklyUse: number;
  /** Weeks of stock left at that rate (null if nothing is being used). */
  weeksLeft: number | null;
  lastMovedOn: string | null;
}

export interface StockMovementRow {
  id: string;
  item: { id: string; name: string; unit: string };
  kind: StockMovementKind;
  /** Signed change in stock. */
  change: number;
  balanceAfter: number;
  unitCostKobo: number | null;
  reason: string | null;
  issuedTo: string | null;
  supplier: string | null;
  movedOn: string;
  recordedBy: string | null;
  expenseRecorded: boolean;
}

export interface InventoryOverview {
  currency: string;
  items: number;
  stockValueKobo: number;
  assetValueKobo: number;
  lowStock: InventoryItemRow[];
  byCategory: { category: InventoryCategory; items: number; valueKobo: number }[];
  issuedThisMonthKobo: number;
  receivedThisMonthKobo: number;
  assetsNeedingAttention: number;
}

// ============================================================ transport

export const VEHICLE_STATUSES = ['ACTIVE', 'MAINTENANCE', 'RETIRED'] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export const vehicleSchema = z.object({
  name: z.string().trim().min(2).max(60),
  plateNumber: z.string().trim().toUpperCase().min(4).max(20),
  capacity: z.number().int().min(1).max(100),
  driverName: nullableText(120),
  driverPhone: nullableText(20),
  assistantName: nullableText(120),
  status: z.enum(VEHICLE_STATUSES).default('ACTIVE'),
  notes: nullableText(300),
});
export type VehicleInput = z.infer<typeof vehicleSchema>;

export const routeStopSchema = z.object({
  name: z.string().trim().min(2).max(80),
  pickup: hhmm,
  dropoff: hhmm,
});
export type RouteStop = z.infer<typeof routeStopSchema>;

export const transportRouteSchema = z.object({
  name: z.string().trim().min(2).max(80),
  vehicleId: optionalId,
  stops: z.array(routeStopSchema).min(1, 'Add at least one stop').max(40),
  active: z.boolean().default(true),
});
export type TransportRouteInput = z.infer<typeof transportRouteSchema>;

export const TRANSPORT_DIRECTIONS = ['BOTH', 'MORNING', 'AFTERNOON'] as const;
export const transportAssignmentSchema = z.object({
  studentIds: z.array(z.string().min(1)).min(1).max(200),
  routeId: z.string().min(1),
  stop: z.string().trim().min(2).max(80),
  direction: z.enum(TRANSPORT_DIRECTIONS).default('BOTH'),
});

export const routeNoticeRequestSchema = z.object({
  /** What happened: "Bus delayed 30 minutes by traffic on Lekki–Epe expressway". */
  situation: z.string().trim().min(5).max(400),
});
export const aiRouteNoticeSchema = z.object({
  message: z.string().describe('The notice to parents, 50–100 words, calm and specific'),
  smsVersion: z.string().describe('The same notice in at most 300 characters'),
});

export interface VehicleRow extends Omit<VehicleInput, 'status'> {
  id: string;
  status: VehicleStatus;
  routes: { id: string; name: string; riders: number }[];
}

export interface RouteRow {
  id: string;
  name: string;
  active: boolean;
  stops: (RouteStop & { riders: number })[];
  vehicle: { id: string; name: string; plateNumber: string; capacity: number; status: VehicleStatus; driverName: string | null; driverPhone: string | null } | null;
  riders: number;
  /** Riders above the vehicle's seats. */
  overCapacity: number;
}

export interface RiderRow {
  assignmentId: string;
  student: { id: string; name: string; admissionNumber: string; classArm: string | null };
  stop: string;
  direction: (typeof TRANSPORT_DIRECTIONS)[number];
  guardian: { name: string; phone: string | null } | null;
  /** Billed for the school bus this term. */
  billed: boolean;
}

export interface RouteDetail extends RouteRow {
  riderList: RiderRow[];
}

export interface TransportOverview {
  vehicles: number;
  activeVehicles: number;
  routes: number;
  riders: number;
  seats: number;
  /** On a route but not billed for the bus this term. */
  unbilledRiders: { id: string; name: string; classArm: string | null; route: string }[];
  /** Billed for the bus but not on any route. */
  billedNotAssigned: { id: string; name: string; classArm: string | null }[];
  routeList: RouteRow[];
}

// ============================================================ hostel

export const HOSTEL_GENDERS = ['MALE', 'FEMALE', 'MIXED'] as const;

export const hostelSchema = z.object({
  name: z.string().trim().min(2).max(80),
  gender: z.enum(HOSTEL_GENDERS),
  wardenStaffId: optionalId,
  notes: nullableText(300),
});
export type HostelInput = z.infer<typeof hostelSchema>;

export const hostelRoomSchema = z.object({
  name: z.string().trim().min(1).max(40),
  beds: z.number().int().min(1).max(60),
});

export const allocateSchema = z.object({
  studentId: z.string().min(1),
  roomId: z.string().min(1),
  bed: z.number().int().min(1).max(60).nullish().transform((v) => v ?? null),
});

export const exeatSchema = z.object({
  studentId: z.string().min(1),
  leaveAt: z.iso.datetime({ offset: true }).or(z.iso.datetime()),
  expectedReturnAt: z.iso.datetime({ offset: true }).or(z.iso.datetime()),
  reason: z.string().trim().min(3).max(300),
  collectedBy: z.string().trim().min(2).max(120),
});
export type ExeatInput = z.infer<typeof exeatSchema>;

export interface HostelRoomRow {
  id: string;
  name: string;
  beds: number;
  occupants: { allocationId: string; studentId: string; name: string; classArm: string | null; bed: number | null; awayOnExeat: boolean }[];
}

export interface HostelRow {
  id: string;
  name: string;
  gender: (typeof HOSTEL_GENDERS)[number];
  warden: { id: string; name: string; phone: string | null } | null;
  notes: string | null;
  beds: number;
  occupied: number;
  rooms: HostelRoomRow[];
}

export interface ExeatRow {
  id: string;
  student: { id: string; name: string; classArm: string | null; hostel: string | null };
  leaveAt: string;
  expectedReturnAt: string;
  returnedAt: string | null;
  reason: string;
  collectedBy: string;
  approvedBy: string | null;
  overdue: boolean;
}

export interface HostelOverview {
  hostels: HostelRow[];
  boarders: number;
  beds: number;
  away: ExeatRow[];
  /** Exeats past their expected return and not back. */
  overdue: ExeatRow[];
}

// ============================================================ reception

export const visitorSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: nullableText(20),
  organisation: nullableText(120),
  purpose: z.string().trim().min(2).max(200),
  hostStaffId: optionalId,
  /** Someone not on staff, or a department: "Bursary". */
  hostName: nullableText(120),
  badgeNumber: nullableText(20),
  vehiclePlate: nullableText(20),
});
export type VisitorInput = z.infer<typeof visitorSchema>;

export interface VisitorRow {
  id: string;
  name: string;
  phone: string | null;
  organisation: string | null;
  purpose: string;
  host: string | null;
  badgeNumber: string | null;
  vehiclePlate: string | null;
  checkInAt: string;
  checkOutAt: string | null;
}

export const ENQUIRY_STATUSES = ['NEW', 'CONTACTED', 'VISIT_BOOKED', 'APPLIED', 'ENROLLED', 'CLOSED'] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];
export const ENQUIRY_STATUS_LABELS: Record<EnquiryStatus, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  VISIT_BOOKED: 'Visit booked',
  APPLIED: 'Applied',
  ENROLLED: 'Enrolled',
  CLOSED: 'Closed',
};
export const ENQUIRY_SOURCES = ['WALK_IN', 'PHONE', 'WHATSAPP', 'WEBSITE', 'REFERRAL', 'SOCIAL', 'OTHER'] as const;
export const ENQUIRY_SOURCE_LABELS: Record<(typeof ENQUIRY_SOURCES)[number], string> = {
  WALK_IN: 'Walk-in',
  PHONE: 'Phone',
  WHATSAPP: 'WhatsApp',
  WEBSITE: 'Website',
  REFERRAL: 'Referral',
  SOCIAL: 'Social media',
  OTHER: 'Other',
};

export const enquirySchema = z.object({
  parentName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(20),
  email: z
    .union([z.email('Enter a valid email'), z.literal('')])
    .nullish()
    .transform((v) => (v ? v.toLowerCase() : null)),
  childName: nullableText(120),
  classOfInterest: nullableText(40),
  entryTerm: nullableText(60),
  source: z.enum(ENQUIRY_SOURCES).default('WALK_IN'),
  status: z.enum(ENQUIRY_STATUSES).default('NEW'),
  question: nullableText(1000),
  notes: nullableText(1000),
  followUpOn: isoDate.nullish().transform((v) => v ?? null),
});
export type EnquiryInput = z.infer<typeof enquirySchema>;

export interface EnquiryRow extends Omit<EnquiryInput, 'source' | 'status'> {
  id: string;
  source: (typeof ENQUIRY_SOURCES)[number];
  status: EnquiryStatus;
  createdAt: string;
  createdBy: string | null;
  followUpDue: boolean;
}

export const aiEnquiryReplySchema = z.object({
  subject: z.string().describe('A short email subject'),
  message: z.string().describe('The reply, 100–170 words, warm and specific, answering the question from the facts given'),
  whatsappVersion: z.string().describe('The same reply in at most 500 characters for WhatsApp'),
});
export type AiEnquiryReply = z.infer<typeof aiEnquiryReplySchema>;

export const pickupSchema = z.object({
  studentId: z.string().min(1),
  collectedBy: z.string().trim().min(2).max(120),
  relationship: z.string().trim().min(2).max(40),
  phone: nullableText(20),
  reason: z.string().trim().min(2).max(200),
});
export type PickupInput = z.infer<typeof pickupSchema>;

export interface PickupRow {
  id: string;
  student: { id: string; name: string; classArm: string | null };
  collectedBy: string;
  relationship: string;
  phone: string | null;
  reason: string;
  at: string;
  /** The collector matches a parent or guardian on record. */
  onRecord: boolean;
  recordedBy: string | null;
}

export interface ReceptionToday {
  date: string;
  onSite: VisitorRow[];
  visitors: VisitorRow[];
  pickups: PickupRow[];
  enquiries: { open: number; new: number; followUpsDue: number; thisMonth: number; enrolledThisYear: number };
}

// ============================================================ certificates & ID cards

export const CERTIFICATE_KINDS = ['TESTIMONIAL', 'TRANSFER', 'MERIT', 'ATTENDANCE', 'COMPLETION', 'SERVICE'] as const;
export type CertificateKind = (typeof CERTIFICATE_KINDS)[number];
export const CERTIFICATE_KIND_LABELS: Record<CertificateKind, string> = {
  TESTIMONIAL: 'Testimonial',
  TRANSFER: 'Transfer certificate',
  MERIT: 'Certificate of merit',
  ATTENDANCE: 'Attendance certificate',
  COMPLETION: 'Certificate of completion',
  SERVICE: 'Certificate of service',
};

export const certificateSchema = z
  .object({
    kind: z.enum(CERTIFICATE_KINDS),
    studentId: z.string().min(1).optional(),
    staffId: z.string().min(1).optional(),
    title: z.string().trim().min(2).max(160),
    body: z.string().trim().min(10).max(4000),
    issuedOn: isoDate,
  })
  .refine((v) => !!v.studentId !== !!v.staffId, { message: 'Choose one recipient — a student or a member of staff', path: ['studentId'] });
export type CertificateInput = z.infer<typeof certificateSchema>;

export const certificateDraftRequestSchema = z
  .object({
    kind: z.enum(CERTIFICATE_KINDS),
    studentId: z.string().min(1).optional(),
    staffId: z.string().min(1).optional(),
    notes: z.string().trim().max(600).optional(),
  })
  .refine((v) => !!v.studentId !== !!v.staffId, { message: 'Choose one recipient', path: ['studentId'] });

export const aiCertificateSchema = z.object({
  title: z.string().describe('The certificate heading, e.g. "Testimonial" or "Certificate of Merit in Mathematics"'),
  body: z.string().describe('The certificate text, formal and specific, 70–180 words depending on the kind'),
});
export type AiCertificate = z.infer<typeof aiCertificateSchema>;

export const revokeCertificateSchema = z.object({ reason: z.string().trim().min(3).max(300) });

export interface CertificateRow {
  id: string;
  serial: string;
  code: string;
  kind: CertificateKind;
  recipient: PersonRef;
  title: string;
  issuedOn: string;
  issuedBy: string | null;
  revokedAt: string | null;
}

export interface CertificateView extends CertificateRow {
  body: string;
  revokeReason: string | null;
  school: { name: string; address: string | null; logoUrl: string | null; motto: string | null };
  /** Path of the public verification page. */
  verifyPath: string;
}

export interface IdCard {
  kind: 'STUDENT' | 'STAFF';
  id: string;
  name: string;
  number: string;
  /** Class for students; job title for staff. */
  detail: string | null;
  photoUrl: string | null;
  guardianPhone: string | null;
  validUntil: string | null;
  verifyPath: string;
}

export interface IdCardBatch {
  school: { name: string; shortName: string | null; address: string | null; phone: string | null; logoUrl: string | null; primaryColor: string | null; motto: string | null };
  cards: IdCard[];
}

/** What anyone scanning a QR code sees — no private details. */
export interface PublicVerification {
  valid: boolean;
  school: string;
  kind: string;
  name: string | null;
  detail: string | null;
  issuedOn: string | null;
  validUntil: string | null;
  message: string;
}

export interface OperationsOverview {
  library: { onLoan: number; overdue: number } | null;
  inventory: { lowStock: number } | null;
  transport: { riders: number; overCapacity: number } | null;
  hostel: { boarders: number; away: number; overdue: number } | null;
  reception: { onSite: number; followUpsDue: number } | null;
}

export interface RouteNotice extends AiText {
  message: string;
  smsVersion: string;
  /** Distinct parent phone numbers on the route. */
  recipients: number;
  riders: number;
}
