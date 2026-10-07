import type { PlatformSuccess, SuccessSummary, SuccessTrends } from '@aischool/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const successKeys = {
  summary: (termId: string) => ['success', 'summary', termId] as const,
  trends: (termId: string) => ['success', 'trends', termId] as const,
  platform: ['platform', 'success'] as const,
};

/** The API caches these for ten minutes, so the page does too. */
const STALE = 5 * 60_000;

export const useSuccessSummary = (termId?: string) =>
  useQuery({
    queryKey: successKeys.summary(termId ?? ''),
    queryFn: ({ signal }) => api.get<SuccessSummary>('/success/summary', { termId }, signal),
    staleTime: STALE,
    placeholderData: keepPreviousData,
  });

export const useSuccessTrends = (termId?: string) =>
  useQuery({
    queryKey: successKeys.trends(termId ?? ''),
    queryFn: ({ signal }) => api.get<SuccessTrends>('/success/trends', { termId }, signal),
    staleTime: STALE,
    placeholderData: keepPreviousData,
  });

export const usePlatformSuccess = () =>
  useQuery({ queryKey: successKeys.platform, queryFn: ({ signal }) => api.get<PlatformSuccess>('/platform/success', undefined, signal), staleTime: STALE });

/** kobo → "₦1,234,500" */
export function money(kobo: number | null | undefined, currency = 'NGN'): string {
  if (kobo == null) return '—';
  try {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency, currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 }).format(kobo / 100);
  } catch {
    return `${currency} ${Math.round(kobo / 100).toLocaleString()}`;
  }
}

/** 0.4567 → "46%" */
export const pct = (share: number | null | undefined, digits = 0) => (share == null ? '—' : `${(share * 100).toFixed(digits)}%`);

/** "2026-09-14" → "14 Sep" */
export const weekLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
