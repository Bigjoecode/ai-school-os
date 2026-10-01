import type { AgentInfo, AiAgent, AiJobView, AiUsageReport, AtRiskReport, AtRiskStudent, BriefingResult, RiskLevel } from '@aischool/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { hasPermission, useCan, useMe } from '@/lib/auth-store';
import { qk, queryClient } from '@/lib/query-client';
import { safeStorage } from '@/lib/utils';

export const aik = {
  agents: ['ai', 'agents'] as const,
  usage: (month: string) => ['ai', 'usage', month] as const,
  atRisk: (classArmId?: string) => ['ai', 'at-risk', classArmId ?? null] as const,
};

/** The assistants this user may open (the API applies each one's permission gate). */
export function useAgents() {
  const can = useCan('ai.use');
  return useQuery({
    queryKey: aik.agents,
    queryFn: ({ signal }) => api.get<AgentInfo[]>('/ai/agents', undefined, signal),
    enabled: can,
    staleTime: 10 * 60_000,
  });
}

export function useCanOpenAgent(agent: AiAgent): boolean {
  const agents = useAgents();
  return !!agents.data?.some((a) => a.agent === agent);
}

export function useCanSeeAtRisk(): boolean {
  const me = useMe();
  return hasPermission(me, 'students.read') && hasPermission(me, 'attendance.read');
}

export function useAtRisk(classArmId?: string, enabled = true) {
  const can = useCanSeeAtRisk();
  return useQuery({
    queryKey: aik.atRisk(classArmId),
    queryFn: ({ signal }) => api.get<AtRiskReport>('/ai/insights/at-risk', { classArmId }, signal),
    enabled: can && enabled,
    staleTime: 5 * 60_000,
  });
}

export function useAiUsage(month: string) {
  const can = useCan('ai.admin');
  return useQuery({
    queryKey: aik.usage(month),
    queryFn: ({ signal }) => api.get<AiUsageReport>('/ai/usage', { month }, signal),
    enabled: can,
    placeholderData: (prev) => prev,
  });
}

export function useSetAiBudget() {
  return useMutation({
    mutationFn: (monthlyBudgetUsd: number | null) => api.put<{ monthlyBudgetUsd: number | null }>('/ai/budget', { monthlyBudgetUsd }),
    onSuccess: (r) => {
      toast.success(r.monthlyBudgetUsd === null ? 'Monthly AI budget reset to the plan default' : 'Monthly AI budget saved');
      void queryClient.invalidateQueries({ queryKey: ['ai', 'usage'] });
      void queryClient.invalidateQueries({ queryKey: qk.aiStatus });
    },
  });
}

// ------------------------------------------------------------------ at risk

export const LEVEL_BADGE: Record<RiskLevel, { label: string; variant: 'danger' | 'warning' }> = {
  HIGH: { label: 'High', variant: 'danger' },
  MEDIUM: { label: 'Medium', variant: 'warning' },
};

/** Which assistant to ask about a student: Principal AI if open to this user, else School AI. */
export function useAskAgent(): 'principal' | 'school' | null {
  const agents = useAgents();
  const open = new Set(agents.data?.map((a) => a.agent));
  return open.has('principal') ? 'principal' : open.has('school') ? 'school' : null;
}

export function askAboutLink(agent: 'principal' | 'school', s: AtRiskStudent) {
  const who = s.student.classArm ? `${s.student.name} (${s.student.classArm})` : s.student.name;
  const q = `Tell me about ${who}. Why might they need attention, and what support should we arrange this week?`;
  return `/ai?agent=${agent}&q=${encodeURIComponent(q)}`;
}

// ------------------------------------------------------------------ briefing

const briefingKey = (tenantId: string | undefined) => `aischool.briefing.${tenantId ?? 'none'}`;

/** The last briefing job, remembered per school so it is still there after a reload. */
export function useBriefingJobId(): [string | undefined, (id: string) => void] {
  const me = useMe();
  const key = briefingKey(me?.tenant?.id);
  const [id, setId] = useState<string | undefined>(() => safeStorage().get(key) ?? undefined);
  const set = (next: string) => {
    safeStorage().set(key, next);
    setId(next);
  };
  return [id, set];
}

export function useStartBriefing(onStarted: (id: string) => void) {
  return useMutation({
    mutationFn: () => api.post<AiJobView>('/ai/briefing'),
    onSuccess: (job) => {
      queryClient.setQueryData(qk.aiJob(job.id), job);
      onStarted(job.id);
    },
  });
}

export function briefingOf(job: AiJobView | undefined): BriefingResult | null {
  const r = job?.state === 'DONE' ? job.result : null;
  return r && typeof r.text === 'string' ? (r as unknown as BriefingResult) : null;
}

// ------------------------------------------------------------------ formatting

/** USD with sensible precision: cents for real money, up to 4 decimals for fractions of a cent. */
export function formatUsd(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  const small = value !== 0 && Math.abs(value) < 1;
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: small ? 4 : 2,
  }).format(value);
}
