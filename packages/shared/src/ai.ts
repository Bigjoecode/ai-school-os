import { z } from 'zod';
import type { AiAgent } from './schemas';

/** AI school: the assistants a user can open, usage analytics, early warnings and briefings. */

export interface AgentInfo {
  agent: AiAgent;
  label: string;
  description: string;
  /** Plain-language names of what it can look up or prepare for this user. */
  capabilities: string[];
  suggestions: string[];
}

export interface AiUsageReport {
  month: string;
  currency: 'USD';
  budgetUsd: number | null;
  /** True when the school hasn't set its own limit and the plan default applies. */
  budgetIsDefault: boolean;
  spendUsd: number;
  calls: number;
  failures: number;
  inputTokens: number;
  outputTokens: number;
  averageLatencyMs: number | null;
  byDay: { date: string; costUsd: number; calls: number }[];
  byFeature: { feature: string; label: string; costUsd: number; calls: number; failures: number }[];
  byUser: { userId: string | null; name: string; costUsd: number; calls: number }[];
  byModel: { provider: string; model: string; costUsd: number; calls: number; inputTokens: number; outputTokens: number }[];
  recentFailures: { at: string; feature: string; provider: string; error: string | null }[];
}

export const aiBudgetSchema = z.object({
  monthlyBudgetUsd: z.number().min(0).max(100_000).nullable(),
});

export const RISK_LEVELS = ['HIGH', 'MEDIUM'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export interface AtRiskStudent {
  student: { id: string; name: string; admissionNumber: string; classArm: string | null };
  level: RiskLevel;
  score: number;
  /** "Attendance 78% this term", "Average 41% in 1st CA", "₦85,000 overdue". */
  reasons: string[];
  attendanceRate: number | null;
  averagePercent: number | null;
  overdueKobo: number | null;
}

export interface AtRiskReport {
  term: { id: string; name: string } | null;
  generatedAt: string;
  students: AtRiskStudent[];
  counts: { high: number; medium: number; assessed: number };
  /** Which signals were available to this user (e.g. fees only with finance access). */
  signals: { attendance: boolean; results: boolean; fees: boolean; liveClasses: boolean };
}

export interface BriefingResult {
  text: string;
  provider: string;
  model: string;
  generatedAt: string;
}
