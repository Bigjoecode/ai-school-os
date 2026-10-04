import { z } from 'zod';

/**
 * The WhatsApp parent assistant: parents message the school's WhatsApp
 * number and the Parent AI answers about their own children; anything urgent
 * or beyond the AI is handed to staff, who reply from the inbox.
 */

/** Messages a parent may send per hour before the assistant pauses for them. */
export const WHATSAPP_PER_PHONE_HOURLY = 20;
/** Default cap on AI answers per school per day (protects the AI budget). */
export const WHATSAPP_DEFAULT_DAILY_CAP = 300;
/** Meta's customer-service window: free-form replies are allowed this long after the parent's last message. */
export const WHATSAPP_WINDOW_HOURS = 24;

/** Words that send a message straight to staff instead of the AI. */
export const WHATSAPP_URGENT_WORDS = ['sick', 'ill', 'emergency', 'accident', 'injured', 'hurt', 'bully', 'bullied', 'bullying', 'fight', 'fighting', 'abuse', 'missing', 'hospital'] as const;

export const whatsappAssistantSettingsSchema = z.object({
  enabled: z.boolean(),
  dailyCap: z.number().int().min(10, 'At least 10 a day').max(10_000, 'At most 10,000 a day'),
  /** Only sent when it changes; the Meta App Secret is stored encrypted and never shown again. */
  appSecret: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{16,128}$/, 'Paste the App Secret from Meta (App settings → Basic)')
    .optional(),
  /** Make a new verify token (you must paste it into Meta again). */
  regenerateVerifyToken: z.boolean().optional(),
});
export type WhatsappAssistantSettingsInput = z.infer<typeof whatsappAssistantSettingsSchema>;

export interface WhatsappAssistantStatus {
  /** The WhatsApp channel (Cloud API phone number + token) is connected. */
  connected: boolean;
  phoneNumberId: string | null;
  enabled: boolean;
  dailyCap: number;
  perPhoneHourly: number;
  webhookUrl: string;
  verifyToken: string | null;
  appSecretSaved: boolean;
  appSecretHint: string | null;
  /** Meta has delivered at least one signed message to us (proves the webhook works). */
  lastInboundAt: string | null;
  aiAnswersToday: number;
  needsAttention: number;
}

export type WhatsappAuthor = 'PARENT' | 'AI' | 'STAFF' | 'SYSTEM';

export interface WhatsappMessageRow {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  author: WhatsappAuthor;
  staffName: string | null;
  body: string;
  /** INBOUND: RECEIVED, ANSWERED, FLAGGED, RESOLVED, UNKNOWN, LIMITED, OPT_OUT, OPT_IN, IGNORED, FAILED. OUTBOUND: SENT, DELIVERED, READ, FAILED. */
  status: string;
  /** Why it was flagged, or the delivery error. */
  note: string | null;
  createdAt: string;
}

export interface WhatsappThreadRow {
  phone: string;
  name: string | null;
  guardianId: string | null;
  lastMessageAt: string;
  lastBody: string;
  lastDirection: 'INBOUND' | 'OUTBOUND';
  needsAttention: number;
  /** The parent wrote within the last 24 hours, so a free-form reply is allowed. */
  windowOpen: boolean;
}

export interface WhatsappThread {
  phone: string;
  guardian: { id: string; name: string; relationship: string; children: string[] } | null;
  windowOpen: boolean;
  windowClosesAt: string | null;
  optedOut: boolean;
  messages: WhatsappMessageRow[];
}

export const whatsappReplySchema = z.object({
  text: z.string().trim().min(1, 'Write a reply').max(1000, 'Keep it under 1,000 characters'),
});
