import { z } from 'zod';
import type { LanguageCode } from './languages';

/**
 * Gate check-in/out for students, parent arrival alerts and secure pick-up.
 *
 * Staff at the gate scan a child's gate pass (or type their name): the first
 * scan of the day is the arrival, later ones the departure. A class register
 * marked present can count as the arrival too. Parents get an alert for each
 * (on the channels the school chooses), manage who may collect their child,
 * and can send a one-time pick-up code to someone collecting on their behalf.
 */

export const GATE_EVENT_TYPES = ['ARRIVE', 'LEAVE'] as const;
export type GateEventType = (typeof GATE_EVENT_TYPES)[number];
export const GATE_METHODS = ['SCAN', 'MANUAL', 'REGISTER', 'PICKUP'] as const;
export type GateMethod = (typeof GATE_METHODS)[number];

export const GATE_ALERT_KINDS = ['ARRIVE', 'LATE', 'ABSENT', 'LEAVE'] as const;
export type GateAlertKind = (typeof GATE_ALERT_KINDS)[number];
export const GATE_ALERT_CHANNELS = ['IN_APP', 'PUSH', 'SMS', 'WHATSAPP'] as const;
export type GateAlertChannel = (typeof GATE_ALERT_CHANNELS)[number];

export const GATE_ALERT_LABELS: Record<GateAlertKind, { title: string; example: string }> = {
  ARRIVE: { title: 'Arrived at school', example: 'Emeka arrived at school at 7:42.' },
  LATE: { title: 'Marked late', example: 'Emeka is marked LATE (8:21).' },
  ABSENT: { title: 'Absent today', example: 'Emeka is ABSENT today.' },
  LEAVE: { title: 'Left school', example: 'Emeka left school at 14:15 — collected by Mrs Ada Okafor.' },
};

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

const alertSchema = z.object({ enabled: z.boolean(), channels: z.array(z.enum(GATE_ALERT_CHANNELS)).max(4) });

export const gateSettingsSchema = z.object({
  /** Children arriving after this (school time) are late. */
  studentLateAfter: hhmm,
  /** A class register marked present or late counts as the arrival when the child wasn't scanned. */
  registerCountsAsArrival: z.boolean(),
  /** End of the school day: children still in school after this are "due to be collected". */
  homeTime: hhmm,
  /** The absence alert goes once, at or after this time, only to parents of children marked absent on the register and not seen at the gate. */
  absentAlertAt: hhmm,
  /** Named gates (optional), e.g. "Main gate", "Back gate". */
  gates: z.array(z.string().trim().min(1).max(40)).max(10),
  alerts: z.object({ ARRIVE: alertSchema, LATE: alertSchema, ABSENT: alertSchema, LEAVE: alertSchema }),
  /** Text the one-time pick-up code to the person collecting (one SMS page each). */
  delegateCodeSms: z.boolean(),
});
export type GateSettings = z.infer<typeof gateSettingsSchema>;

export const DEFAULT_GATE_SETTINGS: GateSettings = {
  studentLateAfter: '08:00',
  registerCountsAsArrival: true,
  homeTime: '14:00',
  absentAlertAt: '10:00',
  gates: [],
  // In-app and push are free; WhatsApp goes only when the school has connected it; SMS costs per page, so it starts off.
  alerts: {
    ARRIVE: { enabled: true, channels: ['IN_APP', 'PUSH', 'WHATSAPP'] },
    LATE: { enabled: true, channels: ['IN_APP', 'PUSH', 'WHATSAPP'] },
    ABSENT: { enabled: true, channels: ['IN_APP', 'PUSH', 'WHATSAPP'] },
    LEAVE: { enabled: true, channels: ['IN_APP', 'PUSH', 'WHATSAPP'] },
  },
  delegateCodeSms: true,
};

/** Saved settings merged over the defaults (older saves may miss newer keys). */
export function normaliseGateSettings(raw: unknown): GateSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<GateSettings>;
  const parsed = gateSettingsSchema.safeParse({
    ...DEFAULT_GATE_SETTINGS,
    ...r,
    alerts: { ...DEFAULT_GATE_SETTINGS.alerts, ...(r.alerts ?? {}) },
  });
  return parsed.success ? parsed.data : DEFAULT_GATE_SETTINGS;
}

export interface GateSettingsView {
  settings: GateSettings;
  /** Which paid/optional channels the school has set up. */
  channels: { sms: boolean; whatsapp: boolean; push: boolean };
  smsPricePerUnitKobo: number;
  currency: string;
  /** A rough monthly SMS cost for the alerts switched on with SMS (20 school days). */
  estimate: { parentsWithPhone: number; smsPerMonth: number; monthlyKobo: number };
}

// ------------------------------------------------------------ gate passes (QR)

/** What a gate pass QR holds: a prefix and a random code (never the student's id). */
export const GATE_PASS_PREFIX = 'AISGATE:';

export interface GatePassBatch {
  school: { name: string; shortName: string | null; logoUrl: string | null; primaryColor: string | null };
  cards: { studentId: string; name: string; classArm: string | null; admissionNumber: string; photoUrl: string | null; qr: string }[];
  /** Classes to choose from. */
  classes: { id: string; label: string }[];
}

// ------------------------------------------------------------ scanning

export const gateScanSchema = z
  .object({
    /** The scanned QR text (a gate pass or an ID card's verify link). */
    code: z.string().trim().min(4).max(600).optional(),
    /** Or the child chosen by name. */
    studentId: z.string().min(1).optional(),
    gate: z.string().trim().max(40).nullable().optional(),
    /** Force arrival or departure (otherwise: first of the day = arrival, later = departure). */
    type: z.enum(GATE_EVENT_TYPES).optional(),
  })
  .refine((v) => !!v.code || !!v.studentId, { message: 'Scan a pass or choose a student', path: ['code'] });
export type GateScanInput = z.infer<typeof gateScanSchema>;

export interface GateEventRow {
  id: string;
  student: { id: string; name: string; firstName: string; classArm: string | null; photoUrl: string | null };
  type: GateEventType;
  method: GateMethod;
  at: string;
  late: boolean;
  gate: string | null;
  recordedBy: string | null;
  undone: boolean;
  /** Who collected the child (pick-ups). */
  collectedBy: string | null;
}

export interface GateScanResult {
  outcome: 'ARRIVED' | 'LEFT' | 'DUPLICATE';
  message: string;
  event: GateEventRow | null;
  /** Today's notes from the parents (running late, someone else collecting…). */
  notices: PickupNoticeRow[];
}

// ------------------------------------------------------------ authorised pick-up people

export const authorisedPickupSchema = z.object({
  name: z.string().trim().min(2, 'Enter their name').max(120),
  relationship: z.string().trim().min(2, 'e.g. Aunt, Driver').max(40),
  phone: z.string().trim().max(20).nullable(),
  /** An uploaded image (POST /files/private): its file id, or null to remove the photo. */
  photoFileId: z.string().trim().max(60).nullable().optional(),
  validUntil: isoDate.nullable(),
  active: z.boolean(),
});
export type AuthorisedPickupInput = z.infer<typeof authorisedPickupSchema>;

export interface AuthorisedPickupRow {
  id: string;
  studentId: string;
  name: string;
  relationship: string;
  phone: string | null;
  /** GET /gate/pickup-people/:id/photo when true. */
  hasPhoto: boolean;
  validUntil: string | null;
  active: boolean;
  /** Not active, or past its valid-until date. */
  expired: boolean;
  addedBy: 'PARENT' | 'STAFF';
}

// ------------------------------------------------------------ parent notices

export const PICKUP_NOTICE_KINDS = ['RUNNING_LATE', 'PICKUP_TIME', 'DELEGATE'] as const;
export type PickupNoticeKind = (typeof PICKUP_NOTICE_KINDS)[number];

export const pickupNoticeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('RUNNING_LATE'), eta: hhmm, note: z.string().trim().max(200).nullable() }),
  z.object({ kind: z.literal('PICKUP_TIME'), eta: hhmm, note: z.string().trim().max(200).nullable() }),
  z.object({
    kind: z.literal('DELEGATE'),
    /** Someone already on the authorised list… */
    authorisedPickupId: z.string().min(1).nullable(),
    /** …or a one-off person for today. */
    delegate: z
      .object({
        name: z.string().trim().min(2, 'Enter their name').max(120),
        relationship: z.string().trim().min(2, 'e.g. Neighbour, Driver').max(40),
        phone: z.string().trim().min(7, 'Enter their phone number').max(20),
        photoFileId: z.string().trim().max(60).nullable().optional(),
      })
      .nullable(),
    eta: hhmm.nullable(),
    note: z.string().trim().max(200).nullable(),
  }),
]);
export type PickupNoticeInput = z.infer<typeof pickupNoticeSchema>;

export interface PickupNoticeRow {
  id: string;
  studentId: string;
  kind: PickupNoticeKind;
  eta: string | null;
  note: string | null;
  /** Who is collecting (DELEGATE). */
  delegate: { name: string; relationship: string; phone: string | null; hasPhoto: boolean; authorisedPickupId: string | null } | null;
  /** A one-time code applies (one-off delegates). */
  needsCode: boolean;
  /** The code itself: only for the child's parents. */
  code: string | null;
  codeUsed: boolean;
  /** What happened to the SMS with the code. */
  codeSms: string | null;
  createdAt: string;
  createdBy: string | null;
  cancelled: boolean;
}

export interface PickupNoticeResult {
  notice: PickupNoticeRow;
  message: string;
}

// ------------------------------------------------------------ collection (gate / reception)

export const collectSchema = z.object({
  studentId: z.string().min(1),
  /** END_OF_DAY (home time) or EARLY (during the day; give a reason). */
  kind: z.enum(['END_OF_DAY', 'EARLY']),
  reason: z.string().trim().max(200).nullable(),
  by: z.discriminatedUnion('type', [
    z.object({ type: z.literal('GUARDIAN'), guardianId: z.string().min(1) }),
    z.object({ type: z.literal('AUTHORISED'), authorisedPickupId: z.string().min(1) }),
    z.object({ type: z.literal('CODE'), noticeId: z.string().min(1), code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code') }),
    z.object({
      type: z.literal('OTHER'),
      name: z.string().trim().min(2).max(120),
      relationship: z.string().trim().min(2).max(40),
      phone: z.string().trim().max(20).nullable(),
      /** Required: this person is not on the child's list. Recorded in the audit log. */
      overrideReason: z.string().trim().min(5, 'Say why you are releasing the child to someone not on the list').max(300),
    }),
  ]),
});
export type CollectInput = z.infer<typeof collectSchema>;

export interface CollectResult {
  message: string;
  event: GateEventRow;
  verification: 'GUARDIAN' | 'AUTHORISED' | 'CODE' | 'OVERRIDE';
}

/** One child as the gate/pick-up screen sees them. */
export interface GateChild {
  id: string;
  name: string;
  firstName: string;
  classArm: string | null;
  photoUrl: string | null;
  arrivedAt: string | null;
  arrivedVia: GateMethod | null;
  late: boolean;
  leftAt: string | null;
  collectedBy: string | null;
  guardians: { id: string; name: string; relationship: string; phone: string | null }[];
  authorised: AuthorisedPickupRow[];
  notices: PickupNoticeRow[];
}

export interface GateToday {
  date: string;
  time: string;
  schoolDay: boolean;
  settings: Pick<GateSettings, 'studentLateAfter' | 'homeTime' | 'gates' | 'registerCountsAsArrival'>;
  counts: { arrived: number; late: number; left: number; inSchool: number; active: number };
  recent: GateEventRow[];
  notices: (PickupNoticeRow & { student: { id: string; name: string; classArm: string | null } })[];
  /** In school now (arrived, not left), parents' notices first. */
  due: GateChild[];
}

// ------------------------------------------------------------ the parent's view

export interface PortalArrival {
  date: string;
  schoolDay: boolean;
  homeTime: string;
  arrivedAt: string | null;
  arrivedVia: GateMethod | null;
  late: boolean;
  leftAt: string | null;
  collectedBy: string | null;
  /** Marked absent on today's register. */
  absent: boolean;
  guardians: { name: string; relationship: string }[];
  authorised: AuthorisedPickupRow[];
  notices: PickupNoticeRow[];
}

// ------------------------------------------------------------ alert wording

export interface GateAlertFacts {
  kind: GateAlertKind;
  firstName: string;
  /** "7:42" */
  time: string | null;
  collectedBy?: string | null;
  /** The arrival came from the class register, not the gate. */
  viaRegister?: boolean;
}

/**
 * Fixed alert wording per parent language. English is the reference; Pidgin is
 * included. Yoruba, Igbo and Hausa use English until a native speaker has
 * checked a translation (wrong safety messages are worse than English ones).
 */

/** "16:45" or "4:45" (24-hour, school time) → "4:45 pm"; anything else is returned unchanged. */
export function clock12(t: string | null): string | null {
  const m = t ? /^(\d{1,2}):(\d{2})$/.exec(t.trim()) : null;
  if (!m) return t;
  const h = Number(m[1]);
  if (h > 23) return t;
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'am' : 'pm'}`;
}

/** Fixed alert wording per parent language (see above); every time in it is shown as "4:45 am" / "2:15 pm". */
export function gateAlertText(f: GateAlertFacts, language: LanguageCode): { title: string; body: string } {
  // Parents read "4:45 am", never a bare "4:45" (the time is already in the school's time zone, Africa/Lagos by default).
  f = { ...f, time: clock12(f.time) };
  if (language === 'PCM') {
    switch (f.kind) {
      case 'ARRIVE':
        return f.viaRegister
          ? { title: `${f.firstName} dey school`, body: `${f.firstName} dey school today — dem mark am present for class register (${f.time}).` }
          : { title: `${f.firstName} don reach school`, body: `${f.firstName} don reach school for ${f.time}.` };
      case 'LATE':
        return { title: `${f.firstName} come late`, body: `Dem mark ${f.firstName} LATE today (${f.time}).` };
      case 'ABSENT':
        return { title: `${f.firstName} no come school`, body: `${f.firstName} no dey school today — dem mark am ABSENT. If you know why, abeg tell the school.` };
      case 'LEAVE':
        return {
          title: `${f.firstName} don comot school`,
          body: f.collectedBy ? `${f.firstName} comot school for ${f.time} — na ${f.collectedBy} carry am.` : `${f.firstName} comot school for ${f.time}.`,
        };
    }
  }
  switch (f.kind) {
    case 'ARRIVE':
      return f.viaRegister
        ? { title: `${f.firstName} is in school`, body: `${f.firstName} is in school today (marked present on the class register at ${f.time}).` }
        : { title: `${f.firstName} arrived at school`, body: `${f.firstName} arrived at school at ${f.time}.` };
    case 'LATE':
      return { title: `${f.firstName} is late`, body: `${f.firstName} is marked LATE (${f.time}).` };
    case 'ABSENT':
      return { title: `${f.firstName} is absent today`, body: `${f.firstName} is ABSENT today (marked on the class register). If you know the reason, please let the school know.` };
    case 'LEAVE':
      return {
        title: `${f.firstName} left school`,
        body: f.collectedBy ? `${f.firstName} left school at ${f.time} — collected by ${f.collectedBy}.` : `${f.firstName} left school at ${f.time}.`,
      };
  }
}

/** The SMS to a one-off delegate with their pick-up code. */
export function delegateCodeSms(o: { delegateName: string; childName: string; school: string; parentName: string; code: string; date: string }): string {
  return `${o.school}: ${o.parentName} has asked you to collect ${o.childName} today (${o.date}). Your one-time pick-up code is ${o.code}. Show it at the gate. Valid today only.`;
}
