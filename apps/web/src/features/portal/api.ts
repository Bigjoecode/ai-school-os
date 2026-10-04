import type { PortalAttendance, PortalDownload, PortalEvent, PortalFees, PortalMe, PortalOverview, PortalResultTerm, PortalSettings, ReceiptView, ReportCardView } from '@aischool/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { hasPermission, useAuthStore } from '@/lib/auth-store';

/**
 * The family portal ("My school"): parents see each child, students see
 * themselves. Every query is keyed by the child so switching is instant
 * once a child has been opened.
 */

export const pk = {
  me: ['portal', 'me'] as const,
  overview: (id: string) => ['portal', 'overview', id] as const,
  attendance: (id: string, termId?: string) => ['portal', 'attendance', id, termId ?? 'current'] as const,
  results: (id: string) => ['portal', 'results', id] as const,
  card: (id: string, termId: string) => ['portal', 'card', id, termId] as const,
  calendar: (id: string) => ['portal', 'calendar', id] as const,
  downloads: (id?: string) => ['portal', 'downloads', id ?? 'all'] as const,
  fees: (id: string) => ['portal', 'fees', id] as const,
  receipt: (id: string, paymentId: string) => ['portal', 'receipt', id, paymentId] as const,
  settings: ['portal', 'settings'] as const,
};

/** Parents and students (members without school.read) — the only people the portal is for. */
export function useIsPortalUser(): boolean {
  return useAuthStore((s) => !hasPermission(s.me, 'school.read') && (hasPermission(s.me, 'family.manage') || hasPermission(s.me, 'learning.use')));
}

export function usePortalMe(enabled = true) {
  const can = useIsPortalUser();
  return useQuery({
    queryKey: pk.me,
    queryFn: ({ signal }) => api.get<PortalMe>('/portal/me', undefined, signal),
    enabled: enabled && can,
    staleTime: 5 * 60_000,
  });
}

export const usePortalOverview = (id: string) =>
  useQuery({ queryKey: pk.overview(id), queryFn: ({ signal }) => api.get<PortalOverview>(`/portal/students/${id}/overview`, undefined, signal), enabled: !!id });

export const usePortalAttendance = (id: string, termId?: string) =>
  useQuery({
    queryKey: pk.attendance(id, termId),
    queryFn: ({ signal }) => api.get<PortalAttendance>(`/portal/students/${id}/attendance`, { termId }, signal),
    enabled: !!id,
    placeholderData: (prev) => prev,
  });

export const usePortalResults = (id: string) =>
  useQuery({ queryKey: pk.results(id), queryFn: ({ signal }) => api.get<PortalResultTerm[]>(`/portal/students/${id}/results`, undefined, signal), enabled: !!id });

export const usePortalReportCard = (id: string, termId: string) =>
  useQuery({
    queryKey: pk.card(id, termId),
    queryFn: ({ signal }) => api.get<ReportCardView>(`/portal/students/${id}/results/${termId}`, undefined, signal),
    enabled: !!id && !!termId,
    staleTime: 5 * 60_000,
  });

export const usePortalCalendar = (id: string) =>
  useQuery({ queryKey: pk.calendar(id), queryFn: ({ signal }) => api.get<PortalEvent[]>(`/portal/students/${id}/calendar`, undefined, signal), enabled: !!id });

export const usePortalDownloads = (studentId?: string) =>
  useQuery({ queryKey: pk.downloads(studentId), queryFn: ({ signal }) => api.get<PortalDownload[]>('/portal/downloads', { studentId }, signal) });

/**
 * Parents only. Always refetched on mount and when the tab regains focus, so
 * the balance is fresh after paying on Paystack and coming back.
 */
export const usePortalFees = (id: string, enabled = true) =>
  useQuery({
    queryKey: pk.fees(id),
    queryFn: ({ signal }) => api.get<PortalFees>(`/portal/students/${id}/fees`, undefined, signal),
    enabled: enabled && !!id,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  });

export const usePortalReceipt = (id: string, paymentId: string) =>
  useQuery({
    queryKey: pk.receipt(id, paymentId),
    queryFn: ({ signal }) => api.get<ReceiptView>(`/portal/students/${id}/receipts/${paymentId}`, undefined, signal),
    enabled: !!id && !!paymentId,
  });

const EMPTY = new Set<string>();

/** Sidebar paths for portal sections the school has switched off (empty for staff). */
export function usePortalHiddenNav(): ReadonlySet<string> {
  const q = usePortalMe();
  const s = q.data?.settings;
  const parent = q.data?.role === 'PARENT';
  return useMemo(() => {
    if (!s) return EMPTY;
    const out = new Set<string>();
    if (!s.showAttendance) out.add('/school/attendance');
    if (!s.showResults) out.add('/school/results');
    if (!s.showCalendar) out.add('/school/calendar');
    if (!s.showDownloads) out.add('/school/downloads');
    if (!s.showFees || !parent) out.add('/school/fees');
    return out;
  }, [s, parent]);
}

// ------------------------------------------------------------------ staff settings

export function usePortalSettings(enabled = true) {
  return useQuery({ queryKey: pk.settings, queryFn: ({ signal }) => api.get<PortalSettings>('/portal/settings', undefined, signal), enabled });
}

export function useSavePortalSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PortalSettings) => api.put<PortalSettings>('/portal/settings', body),
    onSuccess: (saved) => {
      qc.setQueryData(pk.settings, saved);
      toast.success('Portal settings saved');
    },
  });
}

// ------------------------------------------------------------------ remembering the child

const LAST_CHILD_KEY = 'portal.lastChild';

export function rememberChild(id: string) {
  try {
    localStorage.setItem(LAST_CHILD_KEY, id);
  } catch {
    /* private mode: the URL still carries the choice */
  }
}

export function lastChild(): string | null {
  try {
    return localStorage.getItem(LAST_CHILD_KEY);
  } catch {
    return null;
  }
}
