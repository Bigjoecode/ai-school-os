import type {
  CreateCurriculumInput,
  CurriculumDetail,
  CurriculumSummary,
  CurriculumUnitInput,
  GenerateCurriculumInput,
  UpdateCurriculumInput,
} from '@aischool/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { qk, queryClient } from '@/lib/query-client';
import { pollListWhileGenerating, pollWhileGenerating } from '../planning/ui';

export interface CurriculumFilters {
  subjectId?: string;
  classLevelId?: string;
  status?: string;
}

export function useCurricula(filters: CurriculumFilters = {}, enabled = true) {
  const can = useCan('curriculum.read');
  return useQuery({
    queryKey: qk.curricula(filters),
    queryFn: ({ signal }) => api.get<CurriculumSummary[]>('/curricula', { ...filters }, signal),
    enabled: enabled && can,
    refetchInterval: pollListWhileGenerating,
  });
}

export function useCurriculum(id: string | undefined) {
  return useQuery({
    queryKey: qk.curriculum(id ?? ''),
    queryFn: ({ signal }) => api.get<CurriculumDetail>(`/curricula/${id}`, undefined, signal),
    enabled: !!id,
    refetchInterval: pollWhileGenerating,
  });
}

/**
 * The curriculum a scheme of work will be built from: the published one,
 * else the latest finished draft (mirrors the API's choice).
 */
export function pickSourceCurriculum(list: CurriculumSummary[] | undefined): CurriculumSummary | undefined {
  if (!list) return undefined;
  const published = list.find((c) => c.status === 'PUBLISHED');
  if (published) return published;
  return [...list]
    .filter((c) => c.status === 'DRAFT' && (c.generation === 'NONE' || c.generation === 'DONE'))
    .sort((a, b) => b.version - a.version)[0];
}

const invalidateLists = () => void queryClient.invalidateQueries({ queryKey: qk.curricula() });

function setDetail(c: CurriculumDetail) {
  queryClient.setQueryData(qk.curriculum(c.id), c);
  invalidateLists();
}

export function useGenerateCurriculum() {
  return useMutation({
    mutationFn: (input: GenerateCurriculumInput) => api.post<CurriculumSummary>('/curricula/generate', input),
    meta: { silent: true },
    onSuccess: invalidateLists,
  });
}

export function useCreateCurriculum() {
  return useMutation({
    mutationFn: (input: CreateCurriculumInput) => api.post<CurriculumDetail>('/curricula', input),
    meta: { silent: true },
    onSuccess: setDetail,
  });
}

export function useRegenerateCurriculum(id: string) {
  return useMutation({
    mutationFn: (guidance?: string) => api.post<CurriculumSummary>(`/curricula/${id}/regenerate`, { guidance }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.curriculum(id) });
      invalidateLists();
      toast.success('Regenerating with AI', { description: 'This usually takes 1–3 minutes.' });
    },
  });
}

export function useUpdateCurriculum(id: string) {
  return useMutation({
    mutationFn: (input: UpdateCurriculumInput) => api.patch<CurriculumDetail>(`/curricula/${id}`, input),
    onSuccess: setDetail,
  });
}

export function useDeleteCurriculum() {
  return useMutation({
    mutationFn: (id: string) => api.delete(`/curricula/${id}`),
    onSuccess: (_d, id) => {
      queryClient.removeQueries({ queryKey: qk.curriculum(id) });
      invalidateLists();
      toast.success('Curriculum deleted');
    },
  });
}

export function useAddUnit(id: string) {
  return useMutation({
    mutationFn: (input: CurriculumUnitInput & { termOrder: number; week: number }) =>
      api.post<CurriculumDetail>(`/curricula/${id}/units`, input),
    meta: { silent: true },
    onSuccess: setDetail,
  });
}

export function useUpdateUnit(id: string) {
  return useMutation({
    mutationFn: ({ unitId, ...input }: CurriculumUnitInput & { unitId: string }) =>
      api.put<CurriculumDetail>(`/curricula/${id}/units/${unitId}`, input),
    meta: { silent: true },
    onSuccess: setDetail,
  });
}

export function useDeleteUnit(id: string) {
  return useMutation({
    mutationFn: (unitId: string) => api.delete<CurriculumDetail>(`/curricula/${id}/units/${unitId}`),
    onSuccess: (c) => {
      if (c) setDetail(c);
      else void queryClient.invalidateQueries({ queryKey: qk.curriculum(id) });
      toast.success('Week removed');
    },
  });
}
