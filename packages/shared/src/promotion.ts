import { z } from 'zod';

/**
 * End of session: promote every student to the next class (JSS 1 → JSS 2 …),
 * let some repeat, graduate the final classes, and roll the school over into
 * the new session.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const PROMOTION_DECISIONS = ['PROMOTED', 'REPEATED', 'GRADUATED', 'WITHDRAWN'] as const;
export type PromotionDecision = (typeof PROMOTION_DECISIONS)[number];

export const PROMOTION_DECISION_LABELS: Record<PromotionDecision, string> = {
  PROMOTED: 'Promote',
  REPEATED: 'Repeat',
  GRADUATED: 'Graduate',
  WITHDRAWN: 'Withdraw',
};

export const DEFAULT_PROMOTION_PASS_MARK = 40;

export const promotionSettingsSchema = z.object({
  /** Session average (percent) at or above which a student is suggested for promotion. */
  passMark: z.number().min(0).max(100),
  /**
   * Class levels whose students graduate at the end of the session (SS 3,
   * Primary 6 in a primary-only school…). Empty = the highest level only.
   */
  graduatingLevelIds: z.array(z.string().min(1)).max(100),
});
export type PromotionSettings = z.infer<typeof promotionSettingsSchema>;

export const promotionDecisionSchema = z.object({
  studentId: z.string().min(1),
  decision: z.enum(PROMOTION_DECISIONS),
  /** The class the student sits in next session (promoted/repeated); null for graduates and leavers. */
  targetArmId: z.string().min(1).nullable(),
  note: z.string().trim().max(300).nullable().optional(),
});
export type PromotionDecisionInput = z.infer<typeof promotionDecisionSchema>;

export const promotionDraftSchema = z.object({
  decisions: z.array(promotionDecisionSchema).max(10_000),
});
export type PromotionDraftInput = z.infer<typeof promotionDraftSchema>;

export const newSessionTermSchema = z.object({
  name: z.string().trim().min(2).max(60),
  startsOn: isoDate,
  endsOn: isoDate,
});

export const newSessionSchema = z
  .object({
    name: z.string().trim().min(4).max(40),
    startsOn: isoDate,
    endsOn: isoDate,
    terms: z.array(newSessionTermSchema).min(1).max(4),
    /** Copy each term's fee items from the matching term of this session. */
    copyFeesFromSessionId: z.string().min(1).nullable().optional(),
    /** Make it the current session (and its first term the current term) straight away. */
    makeCurrent: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.endsOn <= v.startsOn) ctx.addIssue({ code: 'custom', path: ['endsOn'], message: 'The session must end after it starts' });
    let prevEnd = '';
    v.terms.forEach((t, i) => {
      if (t.endsOn <= t.startsOn) ctx.addIssue({ code: 'custom', path: ['terms', i, 'endsOn'], message: 'The term must end after it starts' });
      if (t.startsOn < v.startsOn || t.endsOn > v.endsOn) ctx.addIssue({ code: 'custom', path: ['terms', i, 'startsOn'], message: 'Term dates must fall within the session' });
      if (prevEnd && t.startsOn <= prevEnd) ctx.addIssue({ code: 'custom', path: ['terms', i, 'startsOn'], message: 'Terms must not overlap' });
      prevEnd = t.endsOn;
    });
  });
export type NewSessionInput = z.input<typeof newSessionSchema>;

export const applyPromotionSchema = z
  .object({
    /** The session students move into. Give this, or `newSession` to create it now. */
    toSessionId: z.string().min(1).nullable().optional(),
    newSession: newSessionSchema.nullable().optional(),
    /** Final decisions; students left out use the saved draft, then the suggestion. */
    decisions: z.array(promotionDecisionSchema).max(10_000).default([]),
    /** Make the new session current (and its first term the current term). */
    makeCurrent: z.boolean().default(false),
    /** Issue first-term invoices for the new session from its fee schedule (needs finance.manage). */
    generateInvoices: z.boolean().default(false),
  })
  .refine((v) => !!v.toSessionId || !!v.newSession, { message: 'Choose or create the new session', path: ['toSessionId'] });
export type ApplyPromotionInput = z.input<typeof applyPromotionSchema>;

export interface PromotionSessionRef {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
}

export interface PromotionArmRef {
  id: string;
  name: string;
  levelId: string;
  levelName: string;
  label: string;
}

export interface PromotionLevel {
  id: string;
  name: string;
  order: number;
  /** Students in this level graduate at the end of the session. */
  graduates: boolean;
  nextLevelId: string | null;
  arms: PromotionArmRef[];
}

export interface PromotionRow {
  studentId: string;
  name: string;
  admissionNumber: string;
  gender: 'MALE' | 'FEMALE';
  status: string;
  /** The class the student sat in this session. */
  armId: string | null;
  /** One entry per term of the session (null = no results that term). */
  termAverages: (number | null)[];
  termsWithResults: number;
  /** Mean of the term averages that exist. */
  average: number | null;
  suggestion: PromotionDecision;
  suggestedArmId: string | null;
  /** Why the suggestion was made, in plain words. */
  reason: string;
  decision: PromotionDecision;
  targetArmId: string | null;
  note: string | null;
  /** The decision came from the saved draft (or the applied record) rather than the suggestion. */
  edited: boolean;
}

export interface PromotionClass {
  arm: PromotionArmRef;
  students: PromotionRow[];
}

export type PromotionCounts = Record<PromotionDecision, number>;

export interface PromotionApplied {
  appliedAt: string;
  toSession: { id: string; name: string } | null;
  counts: PromotionCounts;
  undo: { allowed: boolean; reason: string | null };
}

export interface SuggestedSession {
  name: string;
  startsOn: string;
  endsOn: string;
  terms: { name: string; startsOn: string; endsOn: string }[];
}

export interface PromotionSheet {
  session: PromotionSessionRef & { terms: { id: string; name: string; order: number }[] };
  settings: PromotionSettings;
  levels: PromotionLevel[];
  classes: PromotionClass[];
  counts: PromotionCounts;
  draftSavedAt: string | null;
  applied: PromotionApplied | null;
  /** Sessions that start after this one (candidates to move into). */
  laterSessions: PromotionSessionRef[];
  suggestedSession: SuggestedSession;
  /** A later session has already been promoted into, so this one shouldn't be applied. */
  blockedReason: string | null;
}

export interface PromotionApplyResult {
  fromSession: { id: string; name: string };
  toSession: { id: string; name: string; created: boolean; madeCurrent: boolean };
  counts: PromotionCounts;
  byLevel: PromotionReportLevel[];
  invoices: { created: number; skipped: string | null } | null;
}

export interface PromotionUndoResult {
  restored: number;
  skipped: number;
  currentSessionRestored: boolean;
}

export interface PromotionReportLevel {
  levelId: string;
  levelName: string;
  order: number;
  counts: PromotionCounts;
  total: number;
}

export interface PromotionReport {
  session: { id: string; name: string };
  applied: boolean;
  toSession: { id: string; name: string } | null;
  levels: PromotionReportLevel[];
  counts: PromotionCounts;
}

export interface StudentPromotionHistoryItem {
  id: string;
  fromSession: { id: string; name: string };
  toSession: { id: string; name: string } | null;
  fromClass: string | null;
  toClass: string | null;
  decision: PromotionDecision;
  average: number | null;
  note: string | null;
  createdAt: string;
}

export interface NewSessionResult {
  session: PromotionSessionRef;
  terms: { id: string; name: string; order: number; startsOn: string; endsOn: string }[];
  feesCopied: number;
}

export function emptyPromotionCounts(): PromotionCounts {
  return { PROMOTED: 0, REPEATED: 0, GRADUATED: 0, WITHDRAWN: 0 };
}
