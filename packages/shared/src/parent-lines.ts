import { z } from 'zod';

/**
 * The parent SMS & USSD line: parents without a smartphone dial a USSD code
 * (e.g. *384*1234#) or text a keyword (RESULT, FEES…) to a short code and get
 * their own children's key information. One shared code serves every school
 * on the platform; a school may bring its own code instead.
 */

/** Requests a phone may make per minute (USSD screens and SMS together) before the line pauses for it. */
export const PARENT_LINE_PER_MINUTE = 12;
/** Default number of SMS keyword replies a phone gets per day from one school (each costs the school an SMS). */
export const PARENT_LINE_DEFAULT_DAILY_SMS_CAP = 10;
/** How long a consent SMS can be answered with YES. */
export const PARENT_LINE_CONSENT_PROMPT_DAYS = 7;
/** Longest USSD screen we send (most networks allow about 182 characters). */
export const USSD_SCREEN_MAX = 160;

export const PARENT_LINE_KEYWORDS = ['RESULT', 'FEES', 'ATTENDANCE', 'UPDATE', 'HELP', 'STOP', 'START', 'YES'] as const;

export const ussdCodeSchema = z
  .string()
  .trim()
  .regex(/^\*\d{2,4}(\*\d{1,6})*#$/, 'Use the format *384*1234#');

const shortCodeSchema = z
  .string()
  .trim()
  .regex(/^\+?\d{3,15}$/, 'Digits only, e.g. 32123 or a long number like 2348012345678');

const optionalText = <T extends z.ZodTypeAny>(s: T) =>
  z
    .union([s, z.literal('')])
    .nullish()
    .transform((v) => (v ? (v as string) : null));

// ------------------------------------------------------------------ school settings

export interface ParentLineSettings {
  /** Parents of this school can use the line. */
  enabled: boolean;
  /** Parents may agree to the privacy notice by replying YES to an SMS that links to it. */
  consentBySms: boolean;
  /** SMS keyword replies per phone per day. */
  dailySmsCapPerPhone: number;
}

export const DEFAULT_PARENT_LINE_SETTINGS: ParentLineSettings = {
  enabled: false,
  consentBySms: true,
  dailySmsCapPerPhone: PARENT_LINE_DEFAULT_DAILY_SMS_CAP,
};

export const parentLineSettingsSchema = z.object({
  enabled: z.boolean(),
  consentBySms: z.boolean(),
  dailySmsCapPerPhone: z.number().int().min(1, 'At least 1 a day').max(50, 'At most 50 a day'),
});

/** A school's own Africa's Talking account and codes (instead of the platform's shared code). */
export const parentLineOverrideSchema = z.object({
  username: z.string().trim().min(1, 'Your Africa’s Talking username').max(80),
  /** Write-only; stored encrypted. Leave out to keep the saved key. */
  apiKey: z.string().trim().min(10, 'Paste the API key from Africa’s Talking').max(200).optional(),
  ussdCode: optionalText(ussdCodeSchema),
  shortCode: optionalText(shortCodeSchema),
  sandbox: z.boolean(),
  regenerateSecret: z.boolean().optional(),
});
export type ParentLineOverrideInput = z.infer<typeof parentLineOverrideSchema>;

export const parentLineSimulateSchema = z.object({
  channel: z.enum(['USSD', 'SMS']),
  /** The parent's phone, any Nigerian format. */
  phone: z.string().trim().min(7).max(20),
  /** USSD: everything typed so far joined with "*" (Africa's Talking style), "" for the first screen. SMS: the message. */
  text: z.string().max(160),
});
export type ParentLineSimulateInput = z.infer<typeof parentLineSimulateSchema>;

export interface ParentLineSimulateResult {
  /** The screen or SMS reply, as the parent would see it. */
  reply: string;
  /** USSD: the session ended (END) rather than waiting for input (CON). */
  end: boolean;
  /** Other SMS the parent would receive (payment link, privacy notice). Nothing is actually sent. */
  sms: string[];
}

export interface ParentLineRequestRow {
  id: string;
  channel: 'USSD' | 'SMS';
  simulated: boolean;
  /** Masked: 234803…567 */
  phone: string;
  input: string;
  action: string;
  status: string;
  reply: string;
  smsUnits: number;
  createdAt: string;
}

export interface ParentLineUsage {
  /** Last 30 days, real requests only (not the simulator). */
  ussdSessions: number;
  smsRequests: number;
  smsUnits: number;
  /** smsUnits × the school's SMS price (Messages → Settings), an estimate. */
  estimatedSmsCostKobo: number;
  parents: number;
  byAction: { action: string; count: number }[];
  today: number;
}

export interface ParentLineStatus {
  settings: ParentLineSettings;
  /** The code parents use for this school (its own if set, otherwise the platform's shared one). */
  ussdCode: string | null;
  shortCode: string | null;
  /** The platform's shared line is set up and switched on. */
  sharedReady: boolean;
  /** The school's own Africa's Talking account, if any. */
  override: {
    username: string;
    apiKeyHint: string;
    ussdCode: string | null;
    shortCode: string | null;
    sandbox: boolean;
    ussdCallbackUrl: string;
    smsCallbackUrl: string;
  } | null;
  /** Parents of this school with a phone on record / opted out of SMS. */
  guardiansWithPhone: number;
  optedOut: number;
  smsPricePerUnitKobo: number;
  currency: string;
  usage: ParentLineUsage;
  recent: ParentLineRequestRow[];
}

// ------------------------------------------------------------------ platform (console)

export const PARENT_LINE_PROVIDERS = ['africastalking'] as const;

export const parentLinePlatformSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(PARENT_LINE_PROVIDERS),
  username: z.string().trim().max(80),
  /** Write-only; stored encrypted. Leave out to keep the saved key. */
  apiKey: z.string().trim().min(10, 'Paste the API key from Africa’s Talking').max(200).optional(),
  ussdCode: optionalText(ussdCodeSchema),
  shortCode: optionalText(shortCodeSchema),
  sandbox: z.boolean(),
  /** Platform name in replies to numbers no school knows. */
  brandName: z.string().trim().min(2).max(40),
  regenerateSecret: z.boolean().optional(),
});
export type ParentLinePlatformInput = z.infer<typeof parentLinePlatformSchema>;

export interface ParentLinePlatformView {
  enabled: boolean;
  provider: (typeof PARENT_LINE_PROVIDERS)[number];
  username: string;
  apiKeySaved: boolean;
  apiKeyHint: string | null;
  ussdCode: string | null;
  shortCode: string | null;
  sandbox: boolean;
  brandName: string;
  /** Paste these into the provider's dashboard (they contain the secret path segment). */
  ussdCallbackUrl: string | null;
  smsCallbackUrl: string | null;
  genericSmsUrl: string | null;
  /** Schools that have switched the line on. */
  schoolsEnabled: number;
  /** Last 30 days across all schools. */
  ussdSessions30d: number;
  smsRequests30d: number;
  smsUnits30d: number;
  unknownNumbers30d: number;
}
