import { z } from 'zod';

/**
 * Communication contracts: broadcasts over email, SMS, WhatsApp, push and
 * in-app notifications; announcements; the school calendar; and automations
 * (birthdays, event reminders).
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const isoDateTime = z.iso.datetime({ offset: true }).or(z.iso.datetime());
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');
const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

// ============================================================ channels

export const CHANNELS = ['EMAIL', 'SMS', 'WHATSAPP', 'PUSH', 'IN_APP'] as const;
export type Channel = (typeof CHANNELS)[number];
export const CHANNEL_LABELS: Record<Channel, string> = {
  EMAIL: 'Email',
  SMS: 'SMS',
  WHATSAPP: 'WhatsApp',
  PUSH: 'Push notification',
  IN_APP: 'In-app',
};

// ============================================================ SMS helpers

/** Characters in the GSM 03.38 basic set (plus the extension table, which costs two). */
const GSM_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXT = '^{}\\[~]|€';

/**
 * Makes text SMS-friendly: curly quotes, dashes and ellipses become plain
 * ASCII and "₦" becomes "N", so a message stays in the cheaper GSM encoding.
 */
export function smsSafe(text: string): string {
  return text
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/₦/g, 'N')
    .replace(/ /g, ' ');
}

export interface SmsInfo {
  encoding: 'GSM' | 'UNICODE';
  characters: number;
  /** Billable SMS pages. */
  segments: number;
}

/** How many SMS pages a message takes: 160/153 per page in GSM, 70/67 in Unicode. */
export function smsInfo(text: string): SmsInfo {
  let gsmLength = 0;
  let unicode = false;
  for (const ch of text) {
    if (GSM_BASIC.includes(ch)) gsmLength += 1;
    else if (GSM_EXT.includes(ch)) gsmLength += 2;
    else {
      unicode = true;
      break;
    }
  }
  if (unicode) {
    const n = [...text].length;
    return { encoding: 'UNICODE', characters: n, segments: n <= 70 ? 1 : Math.ceil(n / 67) };
  }
  return { encoding: 'GSM', characters: gsmLength, segments: gsmLength <= 160 ? 1 : Math.ceil(gsmLength / 153) };
}

/** Nigerian numbers to international format without "+": 08031234567 → 2348031234567. */
export function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (d.startsWith('00')) d = d.slice(2);
  if (/^0[789][01]\d{8}$/.test(d)) d = `234${d.slice(1)}`;
  if (/^[789][01]\d{8}$/.test(d)) d = `234${d}`;
  return /^\d{10,15}$/.test(d) ? d : null;
}

// ============================================================ personalisation

/** Placeholders a message may use; each recipient gets their own values. */
export const MESSAGE_TOKENS = {
  '{{first_name}}': "Recipient's first name",
  '{{name}}': "Recipient's full name",
  '{{children}}': "Their children's first names (parents)",
  '{{class}}': "Their children's classes (parents)",
  '{{balance}}': 'Fees outstanding this term (parents)',
  '{{school}}': 'School name',
} as const;

// ============================================================ audiences

export const AUDIENCE_TYPES = ['ALL_PARENTS', 'CLASS_PARENTS', 'FEE_DEBTORS', 'ROUTE_PARENTS', 'HOSTEL_PARENTS', 'ALL_STAFF', 'STAFF_GROUP', 'PEOPLE', 'CONTACTS'] as const;
export type AudienceType = (typeof AUDIENCE_TYPES)[number];

export const audienceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ALL_PARENTS'), primaryOnly: z.boolean().default(true) }),
  z.object({
    type: z.literal('CLASS_PARENTS'),
    classArmIds: z.array(z.string()).default([]),
    classLevelIds: z.array(z.string()).default([]),
    primaryOnly: z.boolean().default(true),
  }),
  /** Parents with fees outstanding this term; optional minimum balance and overdue-only. */
  z.object({ type: z.literal('FEE_DEBTORS'), minBalanceKobo: z.number().int().min(0).default(0), overdueOnly: z.boolean().default(false), primaryOnly: z.boolean().default(true) }),
  z.object({ type: z.literal('ROUTE_PARENTS'), routeIds: z.array(z.string()).min(1), primaryOnly: z.boolean().default(true) }),
  z.object({ type: z.literal('HOSTEL_PARENTS'), hostelIds: z.array(z.string()).default([]), primaryOnly: z.boolean().default(true) }),
  z.object({ type: z.literal('ALL_STAFF') }),
  z.object({ type: z.literal('STAFF_GROUP'), departmentIds: z.array(z.string()).default([]), staffType: z.enum(['TEACHING', 'NON_TEACHING']).optional() }),
  /** Hand-picked parents and/or staff. */
  z.object({ type: z.literal('PEOPLE'), guardianIds: z.array(z.string()).default([]), staffIds: z.array(z.string()).default([]) }),
  /** People not on record — an enquiring parent, a supplier. */
  z.object({
    type: z.literal('CONTACTS'),
    contacts: z
      .array(z.object({ name: z.string().trim().min(1).max(120), email: z.email().nullish(), phone: z.string().trim().max(20).nullish() }))
      .min(1)
      .max(50),
  }),
]);
export type Audience = z.infer<typeof audienceSchema>;

// ============================================================ broadcasts

export const BROADCAST_STATUSES = ['DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED'] as const;
export type BroadcastStatus = (typeof BROADCAST_STATUSES)[number];
export const BROADCAST_SOURCES = ['MANUAL', 'BIRTHDAY', 'EVENT_REMINDER', 'ANNOUNCEMENT', 'TRANSPORT', 'FEES', 'ENQUIRY', 'HOMEWORK', 'CLASS_SUMMARY', 'ADMISSIONS', 'WELFARE', 'ALUMNI', 'LEARNING_UPDATE'] as const;
export type BroadcastSource = (typeof BROADCAST_SOURCES)[number];

export const broadcastSchema = z
  .object({
    title: z.string().trim().min(2).max(120),
    channels: z.array(z.enum(CHANNELS)).min(1, 'Choose at least one channel'),
    audience: audienceSchema,
    subject: nullableText(160),
    /** The full message: email body, push/in-app text, WhatsApp (if no short version). */
    body: z.string().trim().min(2).max(5000),
    /** Short version for SMS (and WhatsApp); defaults to the body. */
    smsBody: nullableText(918),
    source: z.enum(BROADCAST_SOURCES).default('MANUAL'),
    /** In-app/push link, e.g. "/announcements". */
    link: nullableText(200),
  })
  .refine((v) => !v.channels.includes('EMAIL') || !!v.subject, { message: 'Add a subject for email', path: ['subject'] });
export type BroadcastInput = z.infer<typeof broadcastSchema>;

export const sendBroadcastSchema = z.object({
  /** Send at this time instead of now. */
  scheduledAt: isoDateTime.nullish().transform((v) => v ?? null),
});

export const DELIVERY_STATUSES = ['QUEUED', 'SENT', 'FAILED', 'SKIPPED'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export interface AudiencePreview {
  recipients: number;
  /** Per channel: who can be reached, and who can't (no email/phone/app account). */
  byChannel: { channel: Channel; reachable: number; unreachable: number; configured: boolean }[];
  sms: (SmsInfo & { units: number; costKobo: number }) | null;
  sample: { name: string; detail: string | null; email: string | null; phone: string | null; hasApp: boolean }[];
  summary: string;
  currency: string;
}

export interface BroadcastRow {
  id: string;
  title: string;
  channels: Channel[];
  audienceSummary: string;
  status: BroadcastStatus;
  source: BroadcastSource;
  scheduledAt: string | null;
  sentAt: string | null;
  createdAt: string;
  createdBy: string | null;
  totals: { recipients: number; sent: number; failed: number; skipped: number; queued: number };
}

export interface DeliveryRow {
  id: string;
  channel: Channel;
  recipient: string;
  address: string | null;
  status: DeliveryStatus;
  error: string | null;
  units: number;
  sentAt: string | null;
}

export interface BroadcastDetail extends BroadcastRow {
  subject: string | null;
  body: string;
  smsBody: string | null;
  link: string | null;
  audience: Audience;
  byChannel: { channel: Channel; sent: number; failed: number; skipped: number; queued: number }[];
  deliveries: DeliveryRow[];
  smsUnits: number;
}

// ============================================================ AI drafting

export const composeRequestSchema = z.object({
  /** What to say: "Remind JSS 1 parents about Friday's inter-house sports". */
  brief: z.string().trim().min(5).max(1000),
  audienceSummary: z.string().trim().max(200).optional(),
  channels: z.array(z.enum(CHANNELS)).default(['EMAIL', 'SMS']),
  tone: z.enum(['WARM', 'FORMAL', 'URGENT']).default('WARM'),
});

export const aiComposeSchema = z.object({
  title: z.string().describe('A short internal title for the message, 3–8 words'),
  subject: z.string().describe('Email subject line'),
  body: z.string().describe('The full message for email and the app, 60–220 words, plain text with paragraphs'),
  smsBody: z.string().describe('SMS version: at most 300 characters, plain ASCII, no emoji, no "₦" (write N)'),
});
export type AiCompose = z.infer<typeof aiComposeSchema>;

export const TRANSLATE_LANGUAGES = ['YORUBA', 'IGBO', 'HAUSA', 'PIDGIN', 'FRENCH'] as const;
export const TRANSLATE_LANGUAGE_LABELS: Record<(typeof TRANSLATE_LANGUAGES)[number], string> = {
  YORUBA: 'Yoruba',
  IGBO: 'Igbo',
  HAUSA: 'Hausa',
  PIDGIN: 'Nigerian Pidgin',
  FRENCH: 'French',
};
export const translateRequestSchema = z.object({
  language: z.enum(TRANSLATE_LANGUAGES),
  text: z.string().trim().min(2).max(5000),
});

// ============================================================ announcements

export const ANNOUNCEMENT_AUDIENCES = ['EVERYONE', 'STAFF', 'PARENTS', 'STUDENTS'] as const;
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];

export const announcementSchema = z.object({
  title: z.string().trim().min(2).max(160),
  body: z.string().trim().min(2).max(5000),
  audience: z.enum(ANNOUNCEMENT_AUDIENCES).default('EVERYONE'),
  /** Limit to some classes (parents and students of those classes). */
  classArmIds: z.array(z.string()).default([]),
  pinned: z.boolean().default(false),
  publishAt: isoDateTime.nullish().transform((v) => v ?? null),
  expiresAt: isoDateTime.nullish().transform((v) => v ?? null),
  /** Also notify people now, on these channels. */
  notify: z.array(z.enum(CHANNELS)).default([]),
});
export type AnnouncementInput = z.infer<typeof announcementSchema>;

export interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  classes: string[];
  classArmIds: string[];
  pinned: boolean;
  publishAt: string;
  expiresAt: string | null;
  author: string | null;
  createdAt: string;
  /** Not yet live (publishAt in the future) or already expired. */
  state: 'LIVE' | 'SCHEDULED' | 'EXPIRED';
  broadcastId: string | null;
}

// ============================================================ events

export const EVENT_CATEGORIES = ['ACADEMIC', 'EXAM', 'HOLIDAY', 'PTA', 'SPORTS', 'CULTURAL', 'MEETING', 'TRIP', 'OTHER'] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];
export const EVENT_CATEGORY_LABELS: Record<EventCategory, string> = {
  ACADEMIC: 'Academic',
  EXAM: 'Exams',
  HOLIDAY: 'Holiday',
  PTA: 'PTA',
  SPORTS: 'Sports',
  CULTURAL: 'Cultural',
  MEETING: 'Meeting',
  TRIP: 'Trip',
  OTHER: 'Other',
};

export const eventSchema = z
  .object({
    title: z.string().trim().min(2).max(160),
    description: nullableText(3000),
    category: z.enum(EVENT_CATEGORIES).default('OTHER'),
    /** All-day events use dates; timed events use date + time (school time). */
    allDay: z.boolean().default(false),
    startDate: isoDate,
    startTime: hhmm.nullish().transform((v) => v ?? null),
    endDate: isoDate.nullish().transform((v) => v ?? null),
    endTime: hhmm.nullish().transform((v) => v ?? null),
    location: nullableText(160),
    audience: z.enum(ANNOUNCEMENT_AUDIENCES).default('EVERYONE'),
    classArmIds: z.array(z.string()).default([]),
    /** Remind parents/staff this many days before (null = no reminder). */
    remindDaysBefore: z.number().int().min(0).max(30).nullish().transform((v) => v ?? null),
  })
  .refine((v) => v.allDay || !!v.startTime, { message: 'Add a start time, or make it an all-day event', path: ['startTime'] })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, { message: 'The end must be on or after the start', path: ['endDate'] });
export type EventInput = z.infer<typeof eventSchema>;

export interface EventRow {
  id: string;
  title: string;
  description: string | null;
  category: EventCategory;
  allDay: boolean;
  startDate: string;
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
  location: string | null;
  audience: AnnouncementAudience;
  classes: string[];
  classArmIds: string[];
  remindDaysBefore: number | null;
  reminderSentAt: string | null;
}

export const eventListQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
});

// ============================================================ settings & automations

export interface CommsSettings {
  /** Price per SMS page, for cost estimates (kobo). */
  smsPricePerUnitKobo: number;
  /** Shown as the sender name on email. */
  senderName: string | null;
  birthdays: {
    students: { enabled: boolean; channels: Channel[]; template: string };
    staff: { enabled: boolean; channels: Channel[]; template: string };
    /** School time to send, HH:MM. */
    sendAt: string;
  };
  eventReminders: { enabled: boolean; channels: Channel[] };
}

export const DEFAULT_COMMS_SETTINGS: CommsSettings = {
  smsPricePerUnitKobo: 400,
  senderName: null,
  birthdays: {
    students: {
      enabled: false,
      channels: ['SMS'],
      template: 'Dear {{first_name}}, everyone at {{school}} wishes {{children}} a very happy birthday today! Have a wonderful day.',
    },
    staff: {
      enabled: false,
      channels: ['IN_APP', 'SMS'],
      template: 'Happy birthday, {{first_name}}! Thank you for all you do at {{school}}. Enjoy your day.',
    },
    sendAt: '07:00',
  },
  eventReminders: { enabled: true, channels: ['IN_APP', 'SMS'] },
};

const channelList = z.array(z.enum(CHANNELS));
export const commsSettingsSchema = z.object({
  smsPricePerUnitKobo: z.number().int().min(0).max(100_000),
  senderName: z.string().trim().max(80).nullable(),
  birthdays: z.object({
    students: z.object({ enabled: z.boolean(), channels: channelList, template: z.string().trim().min(5).max(500) }),
    staff: z.object({ enabled: z.boolean(), channels: channelList, template: z.string().trim().min(5).max(500) }),
    sendAt: hhmm,
  }),
  eventReminders: z.object({ enabled: z.boolean(), channels: channelList }),
});

/** Provider set-up. Secrets are write-only: they are never sent back. */
export const smtpSettingsSchema = z.object({
  host: z.string().trim().min(3).max(200),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  username: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(500),
  fromEmail: z.email(),
  fromName: z.string().trim().max(120).nullish(),
});
export const smsSettingsSchema = z.object({
  provider: z.literal('termii'),
  apiKey: z.string().trim().min(8).max(200),
  /** Registered sender ID (max 11 characters). */
  senderId: z.string().trim().min(3).max(11),
  /** DND route reaches numbers on Do-Not-Disturb (needs approval from Termii). */
  dnd: z.boolean().default(false),
});
export const whatsappSettingsSchema = z.object({
  phoneNumberId: z.string().trim().min(5).max(40),
  accessToken: z.string().trim().min(20).max(1000),
  /** An approved template with two body variables: {{1}} school name, {{2}} message. */
  templateName: z.string().trim().min(2).max(100),
  templateLanguage: z.string().trim().min(2).max(10).default('en'),
});

export interface ChannelStatus {
  channel: Channel;
  configured: boolean;
  /** e.g. "smtp.zoho.com · bursar@greenfield.sch.ng" or "Termii · GREENFIELD" */
  detail: string | null;
  /** Server-wide, not per school (push needs VAPID keys on the server). */
  serverManaged?: boolean;
}

export const testChannelSchema = z.object({
  channel: z.enum(['EMAIL', 'SMS', 'WHATSAPP']),
  to: z.string().trim().min(5).max(200),
});

export interface CommsOverview {
  currency: string;
  channels: ChannelStatus[];
  thisMonth: { broadcasts: number; delivered: number; failed: number; smsUnits: number; smsCostKobo: number };
  scheduled: BroadcastRow[];
  recent: BroadcastRow[];
  upcomingEvents: EventRow[];
  birthdaysToday: { kind: 'STUDENT' | 'STAFF'; name: string; detail: string | null }[];
  settings: CommsSettings;
}

// ============================================================ notifications & push

export interface NotificationRow {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationsResponse {
  items: NotificationRow[];
  unread: number;
}

export const pushSubscriptionSchema = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(5).max(100) }),
});

export interface NoticeboardResponse {
  announcements: AnnouncementRow[];
  events: EventRow[];
}

