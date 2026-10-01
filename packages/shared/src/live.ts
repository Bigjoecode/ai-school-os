import { z } from 'zod';

/**
 * Live learning contracts: live classes on Google Meet, Zoom, BigBlueButton
 * (or any meeting link), attendance, recordings and transcripts, the AI
 * class summary (summary, homework, quiz, revision notes), and homework.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const isoDateTime = z.iso.datetime({ offset: true }).or(z.iso.datetime());
const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const LIVE_PROVIDERS = ['GOOGLE_MEET', 'ZOOM', 'BBB', 'EXTERNAL'] as const;
export type LiveProvider = (typeof LIVE_PROVIDERS)[number];
export const LIVE_PROVIDER_LABELS: Record<LiveProvider, string> = {
  GOOGLE_MEET: 'Google Meet',
  ZOOM: 'Zoom',
  BBB: 'BigBlueButton',
  EXTERNAL: 'Meeting link',
};

export const LIVE_STATUSES = ['SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED'] as const;
export type LiveStatus = (typeof LIVE_STATUSES)[number];

export const LIVE_ATTENDANCE_STATUSES = ['PRESENT', 'LATE', 'ABSENT'] as const;
export type LiveAttendanceStatus = (typeof LIVE_ATTENDANCE_STATUSES)[number];

/** Where a transcript came from: the meeting service, a file the teacher uploaded, or the teacher's own notes. */
export const TRANSCRIPT_SOURCES = ['PROVIDER', 'UPLOAD', 'NOTES'] as const;
export type TranscriptSource = (typeof TRANSCRIPT_SOURCES)[number];

// ============================================================ schemas

export const liveClassSchema = z
  .object({
    title: z.string().trim().min(2).max(160),
    classArmId: z.string().min(1),
    subjectId: optionalId(),
    /** Defaults to the teacher of this class and subject, or the signed-in staff member. */
    teacherId: optionalId(),
    lessonPlanId: optionalId(),
    provider: z.enum(LIVE_PROVIDERS),
    startsAt: isoDateTime,
    durationMinutes: z.number().int().min(10).max(300),
    agenda: nullableText(2000),
    /** For EXTERNAL: the meeting link (Teams, Jitsi, a personal Zoom room…). */
    joinUrl: z.url().max(1000).nullish().transform((v) => v ?? null),
  })
  .refine((v) => v.provider !== 'EXTERNAL' || !!v.joinUrl, { message: 'Paste the meeting link', path: ['joinUrl'] });
export type LiveClassInput = z.infer<typeof liveClassSchema>;

function optionalId() {
  return z
    .string()
    .min(1)
    .nullish()
    .transform((v) => v ?? null);
}

/** Creates a session for every timetabled lesson of a class and subject in a date range. */
export const fromTimetableSchema = z
  .object({
    classArmId: z.string().min(1),
    subjectId: z.string().min(1),
    from: isoDate,
    to: isoDate,
    provider: z.enum(LIVE_PROVIDERS),
    joinUrl: z.url().max(1000).nullish().transform((v) => v ?? null),
  })
  .refine((v) => v.to >= v.from, { message: 'The end date must be on or after the start', path: ['to'] })
  .refine((v) => v.provider !== 'EXTERNAL' || !!v.joinUrl, { message: 'Paste the meeting link', path: ['joinUrl'] });

export const liveListQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  classArmId: z.string().optional(),
  teacherId: z.string().optional(),
  status: z.enum(LIVE_STATUSES).optional(),
  mine: z.enum(['true']).optional(),
});

export const liveAttendanceSchema = z.object({
  marks: z
    .array(z.object({ studentId: z.string().min(1), status: z.enum(LIVE_ATTENDANCE_STATUSES) }))
    .min(1)
    .max(200),
});

export const transcriptSchema = z.object({
  source: z.enum(['UPLOAD', 'NOTES']),
  /** Plain text or WebVTT/SRT (timestamps are stripped). */
  text: z.string().trim().min(20, 'Add a little more — at least a few sentences').max(200_000),
});

export const zoomSettingsSchema = z.object({
  accountId: z.string().trim().min(5).max(100),
  clientId: z.string().trim().min(5).max(100),
  clientSecret: z.string().trim().min(5).max(200),
});
export const bbbSettingsSchema = z.object({
  /** e.g. https://bbb.school.ng/bigbluebutton/ */
  url: z.url().max(300),
  secret: z.string().trim().min(10).max(200),
});

// ============================================================ AI class intelligence

export const aiClassIntelligenceSchema = z.object({
  topic: z.string().describe('The lesson topic in a few words'),
  summary: z.string().describe('What the class covered, 80–150 words, written for students and parents'),
  keyConcepts: z.array(z.string()).describe('3–6 key ideas or skills, each a short phrase'),
  homework: z.object({
    title: z.string(),
    instructions: z.string().describe('What to do and how to present it, 1–3 sentences'),
    questions: z.array(z.string()).describe('4–8 homework questions, graded from easy to harder'),
  }),
  quiz: z
    .array(
      z.object({
        question: z.string(),
        options: z.array(z.string()).describe('Exactly four options'),
        answerIndex: z.number().int().describe('Index (0–3) of the correct option'),
        explanation: z.string().describe('One sentence on why it is right'),
      }),
    )
    .describe('5 multiple-choice questions checking the key concepts'),
  revisionNotes: z.string().describe('Concise revision notes as short paragraphs or bullet lines, 120–250 words'),
  followUp: z.string().describe('One or two sentences for the teacher: what to revisit next lesson, based on the transcript/notes'),
});
export type AiClassIntelligence = z.infer<typeof aiClassIntelligenceSchema>;

export const publishHomeworkSchema = z.object({
  dueDate: isoDate,
  /** Also tell parents (in-app always; SMS/email if chosen and set up). */
  notifyParents: z.array(z.enum(['IN_APP', 'SMS', 'EMAIL', 'WHATSAPP', 'PUSH'])).default([]),
});

export const homeworkSchema = z.object({
  classArmId: z.string().min(1),
  subjectId: optionalId(),
  title: z.string().trim().min(2).max(160),
  instructions: z.string().trim().min(2).max(3000),
  questions: z.array(z.string().trim().min(2).max(1000)).max(30).default([]),
  dueDate: isoDate,
  publish: z.boolean().default(true),
  notifyParents: z.array(z.enum(['IN_APP', 'SMS', 'EMAIL', 'WHATSAPP', 'PUSH'])).default([]),
});
export type HomeworkInput = z.infer<typeof homeworkSchema>;

export const homeworkListQuerySchema = z.object({
  classArmId: z.string().optional(),
  subjectId: z.string().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
  due: z.enum(['UPCOMING', 'PAST']).optional(),
});

// ============================================================ responses

export interface LiveClassRow {
  id: string;
  title: string;
  provider: LiveProvider;
  status: LiveStatus;
  startsAt: string;
  endsAt: string;
  classArm: { id: string; name: string };
  subject: { id: string; name: string } | null;
  teacher: { id: string; name: string } | null;
  attendance: { present: number; late: number; absent: number; expected: number } | null;
  recordings: number;
  hasTranscript: boolean;
  intelligence: 'NONE' | 'QUEUED' | 'RUNNING' | 'READY' | 'FAILED';
  /** The signed-in user may host (start, edit, mark attendance, run AI). */
  canHost: boolean;
}

export interface LiveAttendanceRow {
  studentId: string;
  name: string;
  admissionNumber: string;
  status: LiveAttendanceStatus | null;
  joinedAt: string | null;
  leftAt: string | null;
  minutes: number | null;
  /** PORTAL (joined through the app), PROVIDER (from the meeting service), MANUAL. */
  source: string | null;
}

export interface LiveRecordingRow {
  id: string;
  kind: 'VIDEO' | 'AUDIO' | 'TRANSCRIPT' | 'CHAT';
  title: string;
  url: string;
  durationSeconds: number | null;
  startedAt: string | null;
}

export interface LiveClassDetail extends LiveClassRow {
  agenda: string | null;
  lessonPlan: { id: string; topic: string } | null;
  /** Students' join link (for Meet/Zoom/external); BBB links are made per person at join time. */
  joinUrl: string | null;
  providerInfo: { meetingCode: string | null; passcode: string | null };
  syncedAt: string | null;
  attendanceList: LiveAttendanceRow[];
  recordingList: LiveRecordingRow[];
  transcript: { source: TranscriptSource; words: number; preview: string } | null;
  teacherNotes: string | null;
  intelligenceResult: AiClassIntelligence | null;
  intelligenceJobId: string | null;
  intelligenceError: string | null;
  homeworkId: string | null;
  quizQuestionIds: string[];
  /** When the summary was shared with students and parents. */
  summarySharedAt: string | null;
}

export interface LiveIntegrationStatus {
  provider: LiveProvider;
  connected: boolean;
  /** e.g. the Google account, the Zoom account id, the BBB server. */
  detail: string | null;
  /** Server-side requirement missing (e.g. Google OAuth client not configured). */
  unavailableReason: string | null;
}

export interface LiveOverview {
  today: string;
  integrations: LiveIntegrationStatus[];
  upcoming: LiveClassRow[];
  recent: LiveClassRow[];
  thisWeek: { scheduled: number; held: number; averageAttendance: number | null; summariesReady: number };
}

export interface HomeworkRow {
  id: string;
  title: string;
  instructions: string;
  questions: string[];
  classArm: { id: string; name: string };
  subject: { id: string; name: string } | null;
  teacher: string | null;
  dueDate: string;
  status: 'DRAFT' | 'PUBLISHED';
  source: 'MANUAL' | 'AI';
  liveClassId: string | null;
  publishedAt: string | null;
  overdue: boolean;
}

/** What a student or parent sees: upcoming live classes and homework for their classes. */
export interface MyLearning {
  liveClasses: (LiveClassRow & { canJoin: boolean; children: string[] })[];
  homework: (HomeworkRow & { children: string[] })[];
  summaries: { liveClassId: string; title: string; date: string; classArm: string; subject: string | null; summary: string; keyConcepts: string[]; revisionNotes: string }[];
}

export interface JoinLink {
  url: string;
  /** HOST for the teacher (Zoom start link, BBB moderator), otherwise ATTENDEE. */
  role: 'HOST' | 'ATTENDEE';
}

export interface SyncResult {
  attendanceMatched: number;
  attendanceUnmatched: string[];
  recordings: number;
  transcript: boolean;
  message: string;
}
