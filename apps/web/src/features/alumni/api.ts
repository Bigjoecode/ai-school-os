import type {
  AlumniBackfillResult,
  AlumniFilter,
  AlumniImportResult,
  AlumniInput,
  AlumniMessageInput,
  AlumniMessageResult,
  AlumniPending,
  AlumniRow,
  AlumniStats,
  Paginated,
} from '@aischool/shared';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/query-client';
import { saveTextFile } from '../onboarding/api';

export const ak = {
  all: ['alumni'] as const,
  list: (p: object) => ['alumni', 'list', p] as const,
  stats: ['alumni', 'stats'] as const,
  pending: ['alumni', 'pending'] as const,
  one: (id: string) => ['alumni', 'one', id] as const,
};

const refresh = () => void queryClient.invalidateQueries({ queryKey: ak.all });

export interface AlumniListParams {
  q?: string;
  page: number;
  pageSize: number;
  year?: number;
  finalClass?: string;
  city?: string;
  verified?: 'true' | 'false';
  consent?: 'true' | 'false';
  source?: string;
}

export function useAlumni(p: AlumniListParams) {
  return useQuery({ queryKey: ak.list(p), queryFn: ({ signal }) => api.get<Paginated<AlumniRow>>('/alumni', { ...p }, signal), placeholderData: keepPreviousData });
}

export function useAlumniStats() {
  return useQuery({ queryKey: ak.stats, queryFn: ({ signal }) => api.get<AlumniStats>('/alumni/stats', undefined, signal) });
}

export function useAlumniPending() {
  return useQuery({ queryKey: ak.pending, queryFn: ({ signal }) => api.get<AlumniPending[]>('/alumni/pending', undefined, signal) });
}

export function useAlumnus(id: string | null) {
  return useQuery({ queryKey: ak.one(id ?? ''), queryFn: ({ signal }) => api.get<AlumniPending>(`/alumni/${id}`, undefined, signal), enabled: !!id });
}

export function useSaveAlumnus(id?: string) {
  return useMutation({
    mutationFn: (input: AlumniInput) => (id ? api.patch<AlumniRow>(`/alumni/${id}`, input) : api.post<AlumniRow>('/alumni', input)),
    meta: { silent: true },
    onSuccess: refresh,
  });
}

export function useDeleteAlumnus() {
  return useMutation({ mutationFn: (id: string) => api.delete<{ ok: true }>(`/alumni/${id}`), onSuccess: refresh });
}

export function useVerifyAlumnus() {
  return useMutation({
    mutationFn: ({ id, studentId, intoId }: { id: string; studentId?: string | null; intoId?: string | null }) => api.post<AlumniRow>(`/alumni/${id}/verify`, { studentId, intoId }),
    onSuccess: refresh,
  });
}

export function useImportAlumni() {
  return useMutation({ mutationFn: (body: { csv: string; dryRun: boolean }) => api.post<AlumniImportResult>('/alumni/import', body), meta: { silent: true }, onSuccess: (r) => !r.dryRun && refresh() });
}

export function useBackfillAlumni() {
  return useMutation({ mutationFn: () => api.post<AlumniBackfillResult>('/alumni/backfill'), onSuccess: refresh });
}

export function useMessageAlumni() {
  return useMutation({ mutationFn: (body: AlumniMessageInput) => api.post<AlumniMessageResult>('/alumni/message', body), meta: { silent: true } });
}

export async function downloadAlumniCsv(filter: AlumniFilter) {
  const qs = new URLSearchParams(Object.entries(filter).filter(([, v]) => v !== undefined && v !== '' && v !== null).map(([k, v]) => [k, String(v)])).toString();
  const csv = await api.text(`/alumni/export.csv${qs ? `?${qs}` : ''}`);
  saveTextFile(csv, `alumni-${new Date().toISOString().slice(0, 10)}.csv`);
}
