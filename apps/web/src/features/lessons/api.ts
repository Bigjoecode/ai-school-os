import type { GenerateLessonInput, LessonDetail, LessonSummary, UpdateLessonInput } from '@aischool/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { qk, queryClient } from '@/lib/query-client';
import { pollListWhileGenerating, pollWhileGenerating } from '../planning/ui';

export interface LessonFilters {
  subjectId?: string;
  classArmId?: string;
  classLevelId?: string;
  status?: string;
  mine?: boolean;
}

export function useLessons(filters: LessonFilters = {}) {
  const can = useCan('lessons.read');
  return useQuery({
    queryKey: qk.lessons(filters),
    queryFn: ({ signal }) =>
      api.get<LessonSummary[]>('/lessons', { ...filters, mine: filters.mine ? 'true' : undefined }, signal),
    enabled: can,
    refetchInterval: pollListWhileGenerating,
  });
}

export function useLesson(id: string | undefined) {
  return useQuery({
    queryKey: qk.lesson(id ?? ''),
    queryFn: ({ signal }) => api.get<LessonDetail>(`/lessons/${id}`, undefined, signal),
    enabled: !!id,
    refetchInterval: pollWhileGenerating,
  });
}

const invalidateLists = () => {
  void queryClient.invalidateQueries({ queryKey: qk.lessons() });
  // Scheme weeks show a lesson count.
  void queryClient.invalidateQueries({ queryKey: ['scheme'] });
};

export function useGenerateLesson() {
  return useMutation({
    mutationFn: (input: GenerateLessonInput) => api.post<LessonSummary>('/lessons/generate', input),
    meta: { silent: true },
    onSuccess: invalidateLists,
  });
}

export function useRegenerateLesson(id: string) {
  return useMutation({
    mutationFn: (guidance?: string) => api.post<LessonSummary>(`/lessons/${id}/regenerate`, { guidance }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.lesson(id) });
      invalidateLists();
      toast.success('Rewriting the lesson plan', { description: 'This usually takes under a minute or two.' });
    },
  });
}

export function useUpdateLesson(id: string) {
  return useMutation({
    mutationFn: (input: UpdateLessonInput) => api.patch<LessonDetail>(`/lessons/${id}`, input),
    onSuccess: (l) => {
      queryClient.setQueryData(qk.lesson(id), l);
      void queryClient.invalidateQueries({ queryKey: qk.lessons() });
    },
  });
}

export function useDeleteLesson() {
  return useMutation({
    mutationFn: (id: string) => api.delete(`/lessons/${id}`),
    onSuccess: (_d, id) => {
      queryClient.removeQueries({ queryKey: qk.lesson(id) });
      invalidateLists();
      toast.success('Lesson plan deleted');
    },
  });
}
