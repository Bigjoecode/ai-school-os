import { z } from 'zod';

/**
 * The weekly parent learning update ("How Ada is learning"): strong topics,
 * topics getting better, topics needing attention, homework and attendance in
 * one line, and one practical recommendation. Built only from real records
 * (topic mastery evidence, homework, registers, published report cards).
 */

export const LEARNING_UPDATE_QUIET_WEEKS = ['SHORT', 'SKIP'] as const;
export type LearningUpdateQuietWeeks = (typeof LEARNING_UPDATE_QUIET_WEEKS)[number];

export const learningUpdateSettingsSchema = z.object({
  /** Off for schools that existed before this feature; on for schools created after it. */
  enabled: z.boolean(),
  /** 1 = Monday … 7 = Sunday, in the school's time zone. */
  day: z.number().int().min(1).max(7),
  /** HH:MM, 24-hour, school time. */
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 17:00'),
  /** In-app and push always go; email is on by default; SMS costs money, so it is opt-in. */
  email: z.boolean(),
  sms: z.boolean(),
  /** An approved WhatsApp template ({{1}} = school name, {{2}} = the message). Empty = no WhatsApp. */
  whatsappTemplate: z
    .string()
    .trim()
    .max(512)
    .regex(/^[a-z0-9_]*$/, 'Template names use lower-case letters, numbers and underscores')
    .nullish()
    .transform((v) => v || null),
  /** A week with no practice or quizzes: send a short attendance-and-homework note, or skip that child. */
  quietWeeks: z.enum(LEARNING_UPDATE_QUIET_WEEKS),
  /** Let AI word the recommendation (standard tier, within the school's AI budget); rules otherwise. */
  useAi: z.boolean(),
  /** Students also see their own update (in the app only), in an encouraging tone. */
  students: z.boolean(),
});
export type LearningUpdateSettings = z.infer<typeof learningUpdateSettingsSchema>;

export const DEFAULT_LEARNING_UPDATE_SETTINGS: LearningUpdateSettings = {
  enabled: false,
  day: 5,
  time: '17:00',
  email: true,
  sms: false,
  whatsappTemplate: null,
  quietWeeks: 'SHORT',
  useAi: true,
  students: true,
};

export interface LearningUpdateTopic {
  topicId: string;
  topic: string;
  subject: string;
  /** Mastery score (0–100) at the end of the week. */
  score: number;
  /** Score before this week, or null when the topic is new this week. */
  before: number | null;
  /** score − before, or null. */
  change: number | null;
}

export interface LearningUpdateContent {
  version: 1;
  firstName: string;
  /** Monday and Sunday of the week covered (YYYY-MM-DD). */
  weekStart: string;
  weekEnd: string;
  strong: LearningUpdateTopic[];
  improving: LearningUpdateTopic[];
  attention: LearningUpdateTopic[];
  /** Short facts: "Handed in 3 of 4 homework", "In school 5 of 5 days". */
  highlights: string[];
  homework: { set: number; handedIn: number } | null;
  attendance: { present: number; absent: number; late: number; excused: number; daysMarked: number } | null;
  activity: { pieces: number; questions: number; topics: number };
  recommendation: { text: string; topicId: string | null; subject: string | null; topic: string | null };
  /** No practice, quizzes or tests this week: only attendance and homework. */
  quiet: boolean;
  /** The same week, written to the student. */
  studentText: string;
}

export interface LearningUpdateView {
  id: string;
  studentId: string;
  weekStart: string;
  content: LearningUpdateContent;
  text: string;
  source: 'AI' | 'RULES';
  sentAt: string | null;
  channels: string[];
}

export interface LearningUpdateList {
  /** The school sends weekly updates. */
  enabled: boolean;
  /** For parents: whether they've turned the updates off (students: always false). */
  optedOut: boolean;
  role: 'PARENT' | 'STUDENT';
  updates: LearningUpdateView[];
}

export const learningUpdateSubscriptionSchema = z.object({ on: z.boolean() });

export interface LearningUpdatePreview {
  content: LearningUpdateContent;
  text: string;
  smsText: string;
  source: 'AI' | 'RULES';
  /** This week's update has already gone out for this student. */
  alreadySent: boolean;
  recipients: { name: string; channels: string[]; optedOut: boolean; note: string | null }[];
}

export const learningUpdateSendSchema = z
  .object({ classArmId: z.string().min(1).optional(), studentId: z.string().min(1).optional() })
  .refine((v) => !!v.classArmId !== !!v.studentId, 'Choose a class or one student');
export type LearningUpdateSendInput = z.infer<typeof learningUpdateSendSchema>;

export interface LearningUpdateSendResult {
  students: number;
  sent: number;
  skipped: number;
  alreadySent: number;
  recipients: number;
}

export interface LearningUpdateStatus {
  settings: LearningUpdateSettings;
  weekStart: string;
  /** When this week's run is due (school time), e.g. "Friday 17:00". */
  due: string;
  /** This week so far. */
  generated: number;
  sent: number;
  skipped: number;
  activeStudents: number;
  channels: { email: boolean; sms: boolean; whatsapp: boolean; push: boolean };
}
