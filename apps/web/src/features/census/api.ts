import type { CensusAggregate, CensusCandidates, CensusCell, CensusQuery, CensusReport, CensusSettings, CensusTable, SaveCensusProfileInput } from '@aischool/shared';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/query-client';

export const censusKeys = {
  profile: ['census', 'profile'] as const,
  report: (q: CensusQuery) => ['census', 'report', q.sessionId ?? '', q.termId ?? '', q.branchId ?? ''] as const,
  candidates: (levelId: string, branchId?: string) => ['census', 'candidates', levelId, branchId ?? ''] as const,
  aggregate: (state: string) => ['platform', 'census', state] as const,
};

export const useCensusProfile = () =>
  useQuery({ queryKey: censusKeys.profile, queryFn: ({ signal }) => api.get<CensusSettings>('/census/profile', undefined, signal) });

export const useSaveCensusProfile = () =>
  useMutation({
    mutationFn: (body: SaveCensusProfileInput) => api.put<CensusSettings>('/census/profile', body),
    onSuccess: (data) => {
      queryClient.setQueryData(censusKeys.profile, data);
      void queryClient.invalidateQueries({ queryKey: ['census', 'report'] });
    },
  });

export const useRemoveBranchProfile = () =>
  useMutation({
    mutationFn: (branchId: string) => api.delete<CensusSettings>(`/census/profile/branches/${branchId}`),
    onSuccess: (data) => {
      queryClient.setQueryData(censusKeys.profile, data);
      void queryClient.invalidateQueries({ queryKey: ['census', 'report'] });
    },
  });

export const useCensusReport = (q: CensusQuery) =>
  useQuery({
    queryKey: censusKeys.report(q),
    queryFn: ({ signal }) => api.get<CensusReport>('/census/report', { sessionId: q.sessionId, termId: q.termId, branchId: q.branchId }, signal),
    placeholderData: keepPreviousData,
  });

export const useCensusCandidates = (levelId: string | null, branchId?: string) =>
  useQuery({
    queryKey: censusKeys.candidates(levelId ?? '', branchId),
    queryFn: ({ signal }) => api.get<CensusCandidates>('/census/candidates', { classLevelId: levelId, branchId }, signal),
    enabled: !!levelId,
  });

export const useCensusAggregate = (state: string) =>
  useQuery({
    queryKey: censusKeys.aggregate(state),
    queryFn: ({ signal }) => api.get<CensusAggregate>('/platform/census/aggregate', { state }, signal),
  });

// ------------------------------------------------------------------ CSV

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

/** Download as CSV with a BOM so Excel opens Naira signs and names correctly. */
export function downloadCsv(filename: string, rows: unknown[][]) {
  const blob = new Blob([`﻿${toCsv(rows)}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function tableRows(t: CensusTable): CensusCell[][] {
  return [t.columns, ...t.rows, ...(t.totals ? [t.totals] : [])];
}

export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
