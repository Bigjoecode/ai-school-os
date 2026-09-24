import type { GenerateSchemeInput, SchemeDetail, SchemeSummary, SchemeWeekInput, UpdateSchemeInput } from '@aischool/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { qk, queryClient } from '@/lib/query-client';
import { pollListWhileGenerating, pollWhileGenerating } from '../planning/ui';

export interface SchemeFilters {
  subjectId?: string;
  classLevelId?: string;
  termId?: string;
  status?: string;
}

export function useSchemes(filters: SchemeFilters = {}, enabled = true) {
  const can = useCan('curriculum.read');
  return useQuery({
    queryKey: qk.schemes(filters),
    queryFn: ({ signal }) => api.get<SchemeSummary[]>('/schemes', { ...filters }, signal),
    enabled: enabled && can,
    refetchInterval: pollListWhileGenerating,
  });
}

export function useScheme(id: string | undefined) {
  const can = useCan('curriculum.read');
  return useQuery({
    queryKey: qk.scheme(id ?? ''),
    queryFn: ({ signal }) => api.get<SchemeDetail>(`/schemes/${id}`, undefined, signal),
    enabled: !!id && can,
    refetchInterval: pollWhileGenerating,
  });
}

const invalidateLists = () => void queryClient.invalidateQueries({ queryKey: qk.schemes() });

function setDetail(s: SchemeDetail) {
  queryClient.setQueryData(qk.scheme(s.id), s);
  invalidateLists();
}

export function useGenerateScheme() {
  return useMutation({
    mutationFn: (input: GenerateSchemeInput) => api.post<SchemeSummary>('/schemes/generate', input),
    meta: { silent: true },
    onSuccess: invalidateLists,
  });
}

export function useRegenerateScheme(id: string) {
  return useMutation({
    mutationFn: (guidance?: string) => api.post<SchemeSummary>(`/schemes/${id}/regenerate`, { guidance }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.scheme(id) });
      invalidateLists();
      toast.success('Regenerating with AI', { description: 'This usually takes 1–3 minutes.' });
    },
  });
}

export function useUpdateScheme(id: string) {
  return useMutation({
    mutationFn: (input: UpdateSchemeInput) => api.patch<SchemeDetail>(`/schemes/${id}`, input),
    onSuccess: setDetail,
  });
}

export function useUpdateSchemeWeek(id: string) {
  return useMutation({
    mutationFn: ({ weekId, ...input }: SchemeWeekInput & { weekId: string }) =>
      api.put<SchemeDetail>(`/schemes/${id}/weeks/${weekId}`, input),
    meta: { silent: true },
    onSuccess: setDetail,
  });
}

export function useDeleteScheme() {
  return useMutation({
    mutationFn: (id: string) => api.delete(`/schemes/${id}`),
    onSuccess: (_d, id) => {
      queryClient.removeQueries({ queryKey: qk.scheme(id) });
      invalidateLists();
      toast.success('Scheme of work deleted');
    },
  });
}
