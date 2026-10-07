import { z } from 'zod';
import type { QuestionType } from './assessment';

/**
 * Offline exam packs: an online exam a school can sit with no internet.
 *
 *  - Staff turn on "Available offline" with a window (start from / sync by) and get an
 *    invigilator start code. The code never leaves staff hands until the exam starts.
 *  - A student's device (or a shared exam device prepared by staff) downloads an encrypted
 *    pack: AES-256-GCM, key = PBKDF2-SHA256(start code, per-pack salt, 600 000 rounds).
 *    Correct answers are never in the pack.
 *  - Each student's seat (their question/option order and a per-student HMAC key) is wrapped
 *    separately: with the content key on a personal device, or with PBKDF2(code + exam PIN)
 *    on a shared exam device, so one student can't sign in as another.
 *  - The device keeps the clock and the answers, signs the hand-in with the seat's HMAC key and
 *    uploads it when back online. The server checks it and marks it like an online attempt.
 */

export const OFFLINE_PACK_FORMAT = 1;
export const OFFLINE_KDF_ITERATIONS = 600_000;
/** Seat keys on shared devices: the start code is needed too, so this only slows guessing a classmate's PIN. */
export const OFFLINE_SEAT_KDF_ITERATIONS = 150_000;
/** No 0/O or 1/I, so a code read out in a hall is typed right first time. */
export const OFFLINE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const OFFLINE_CODE_LENGTH = 10;
export const OFFLINE_PIN_LENGTH = 6;

/** "abcde fghij" / "ABCDE-FGHIJ" → "ABCDEFGHIJ" (what the key is derived from). */
export const normaliseStartCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');
/** "ABCDEFGHIJ" → "ABCDE-FGHIJ" for reading out. */
export const formatStartCode = (code: string) => normaliseStartCode(code).replace(/^(.{5})(.+)$/, '$1-$2');

export const OFFLINE_FLAGS = ['BAD_SIGNATURE', 'OVER_TIME', 'CLOCK', 'OUTSIDE_WINDOW', 'LATE_SYNC', 'STALE_PACK', 'ALREADY_SAT', 'DIFFERENT_RESUBMISSION'] as const;
export type OfflineFlag = (typeof OFFLINE_FLAGS)[number];
export const OFFLINE_FLAG_LABELS: Record<OfflineFlag, string> = {
  BAD_SIGNATURE: 'Signature didn’t match: the answers may have been changed after handing in',
  OVER_TIME: 'Took longer than the time allowed',
  CLOCK: 'The device clock looks wrong or was changed',
  OUTSIDE_WINDOW: 'Started outside the offline window',
  LATE_SYNC: 'Synced after the sync-by time',
  STALE_PACK: 'Sat from a pack downloaded before the start code was changed',
  ALREADY_SAT: 'Had already sat the exam online',
  DIFFERENT_RESUBMISSION: 'A second, different hand-in arrived (ignored)',
};

// ------------------------------------------------------------------ staff settings

export const offlineSettingsSchema = z
  .object({
    enabled: z.boolean(),
    availableFrom: z.iso.datetime({ offset: true }).nullish(),
    syncBy: z.iso.datetime({ offset: true }).nullish(),
  })
  .refine((v) => !v.enabled || (!!v.availableFrom && !!v.syncBy), { path: ['syncBy'], message: 'Set when offline sittings may start and when they must be synced by' })
  .refine((v) => !v.availableFrom || !v.syncBy || Date.parse(v.syncBy) > Date.parse(v.availableFrom), { path: ['syncBy'], message: 'Must be after the start time' });
export type OfflineSettingsInput = z.input<typeof offlineSettingsSchema>;

export const offlineDevicePackSchema = z.object({ classArmIds: z.array(z.string().min(1)).max(40).optional() });
export type OfflineDevicePackInput = z.infer<typeof offlineDevicePackSchema>;

export const offlineReviewSchema = z.object({
  /** accept: mark a held hand-in anyway · reject: leave a held hand-in unmarked · reviewed: flags seen, nothing to do. */
  action: z.enum(['accept', 'reject', 'reviewed']),
});
export type OfflineReviewInput = z.infer<typeof offlineReviewSchema>;

// ------------------------------------------------------------------ the pack

export interface OfflineKdf {
  name: 'PBKDF2';
  hash: 'SHA-256';
  iterations: number;
  /** base64url */
  salt: string;
}

/** What the device stores. Everything about the questions is inside `ciphertext`. */
export interface OfflinePack {
  format: typeof OFFLINE_PACK_FORMAT;
  /** `${examId}.v${version}` — also the AES-GCM additional data of the content. */
  packId: string;
  examId: string;
  version: number;
  mode: 'PERSONAL' | 'DEVICE';
  title: string;
  subject: string;
  classLevel: string;
  durationMinutes: number;
  questionCount: number;
  totalMarks: number;
  availableFrom: string | null;
  syncBy: string | null;
  graceSeconds: number;
  schoolName: string;
  downloadedAt: string;
  downloadedBy: { userId: string; name: string };
  /** Personal packs: the student it belongs to. */
  student: { id: string; name: string } | null;
  seatCount: number;
  kdf: OfflineKdf;
  seatKdf: { iterations: number } | null;
  /** base64url AES-GCM nonce and ciphertext (with tag) of OfflinePackContent. */
  iv: string;
  ciphertext: string;
}

export interface OfflineQuestion {
  id: string;
  type: QuestionType;
  objective: boolean;
  stem: string;
  /** In the bank's order; each seat says how to show them. */
  options: string[];
  marks: number;
}

export interface OfflineSeatEntry {
  seatId: string;
  studentId: string;
  name: string;
  admissionNumber: string;
  classArm: string | null;
  /** null: wrapped with the content key (personal pack). Otherwise the PBKDF2 salt for code + PIN. */
  salt: string | null;
  iv: string;
  /** AES-GCM of OfflineSeatSecret, additional data `seat:${seatId}`. */
  ciphertext: string;
}

export interface OfflinePackContent {
  instructions: string | null;
  questions: OfflineQuestion[];
  seats: OfflineSeatEntry[];
}

export interface OfflineSeatSecret {
  seatId: string;
  studentId: string;
  /** base64url HMAC-SHA256 key for signing this student's submission. */
  hmacKey: string;
  /** Questions in the order shown; `order[displayed] = bank option index`. */
  items: { id: string; order: number[] }[];
}

// ------------------------------------------------------------------ sync

/** The device's report, JSON-encoded into `payload` and signed with the seat's HMAC key. */
export interface OfflineSignedPayload {
  v: 1;
  kind: 'progress' | 'final';
  examId: string;
  packVersion: number;
  seatId: string;
  /** Random id made on the device when handing in: the same hand-in sent twice counts once. */
  submissionId: string;
  /** Device clock (ISO) when the student started. */
  startedAt: string;
  /** Device clock (ISO) when handed in (final only). */
  submittedAt: string | null;
  /** Time used: the larger of the monotonic timer and the wall clock, in seconds. */
  elapsedSeconds: number;
  monotonicSeconds: number;
  wallSeconds: number;
  /** Displayed option index for objective questions, text for written ones. */
  answers: Record<string, number | string | null>;
  answered: number;
  focusLosses: number;
  /** What the device itself noticed, e.g. "clock went back 3600s". */
  clockIssues: string[];
  /** Handed in by the timer at zero. */
  auto: boolean;
  stage: 'STARTED' | 'SUBMITTED';
}

export const offlineSyncSchema = z.object({
  payload: z.string().min(2).max(600_000),
  signature: z.string().min(16).max(200),
  /** Device clock at upload, to work out how far off it is from the server. */
  deviceNow: z.iso.datetime({ offset: true }),
});
export type OfflineSyncInput = z.infer<typeof offlineSyncSchema>;

export const offlinePayloadSchema = z.object({
  v: z.literal(1),
  kind: z.enum(['progress', 'final']),
  examId: z.string().min(1).max(40),
  packVersion: z.number().int().min(0),
  seatId: z.string().min(1).max(40),
  submissionId: z.string().min(8).max(64),
  startedAt: z.iso.datetime({ offset: true }),
  submittedAt: z.iso.datetime({ offset: true }).nullable(),
  elapsedSeconds: z.number().min(0).max(10 * 24 * 3600),
  monotonicSeconds: z.number().min(0).max(10 * 24 * 3600),
  wallSeconds: z.number().min(-10 * 24 * 3600).max(10 * 24 * 3600),
  answers: z.record(z.string().min(1).max(40), z.union([z.number().int().min(0).max(9), z.string().max(8000), z.null()])).refine((r) => Object.keys(r).length <= 300, 'Too many answers'),
  answered: z.number().int().min(0).max(1000),
  focusLosses: z.number().int().min(0).max(10_000),
  clockIssues: z.array(z.string().max(200)).max(20),
  auto: z.boolean(),
  stage: z.enum(['STARTED', 'SUBMITTED']),
});

export interface OfflineSyncResult {
  /** SYNCED: marked like an online attempt · HELD: kept for a teacher to review · DUPLICATE: already had it · PROGRESS: noted. */
  status: 'SYNCED' | 'HELD' | 'DUPLICATE' | 'PROGRESS';
  flags: OfflineFlag[];
  serverNow: string;
  message: string;
}

// ------------------------------------------------------------------ staff views

export type OfflineSeatStatus = 'NOT_DOWNLOADED' | 'DOWNLOADED' | 'STARTED' | 'SUBMITTED' | 'SYNCED' | 'HELD' | 'REJECTED';

export interface OfflineSeatRow {
  student: { id: string; name: string; admissionNumber: string; classArm: string | null };
  seatId: string | null;
  status: OfflineSeatStatus;
  downloads: number;
  downloadedAt: string | null;
  mode: 'PERSONAL' | 'DEVICE' | null;
  stale: boolean;
  startedAt: string | null;
  lastSeenAt: string | null;
  syncedAt: string | null;
  elapsedSeconds: number | null;
  clockSkewSeconds: number | null;
  flags: OfflineFlag[];
  flagsReviewed: boolean;
  attemptId: string | null;
  score: number | null;
  total: number | null;
  sittingOnline: boolean;
}

export interface OfflineExamStatus {
  examId: string;
  enabled: boolean;
  availableFrom: string | null;
  syncBy: string | null;
  version: number;
  /** Only for staff who manage the exam. */
  code: string | null;
  canManage: boolean;
  serverNow: string;
  counts: { students: number; downloaded: number; started: number; synced: number; held: number; flagged: number };
  rows: OfflineSeatRow[];
}

export interface OfflineInvigilatorSheet {
  schoolName: string;
  exam: { id: string; title: string; subject: string; classLevel: string; durationMinutes: number; questionCount: number; totalMarks: number };
  code: string;
  version: number;
  availableFrom: string | null;
  syncBy: string | null;
  seats: { name: string; admissionNumber: string; classArm: string | null; pin: string }[];
}
