import type {
  AiLessonCheck,
  ComplianceReport,
  GenerateLessonInput,
  LessonReviewStatus,
  ReviewLessonInput,
  SubmitLessonsResult,
  UpdateLessonInput,
  VettedLessonDetail,
  VettedLessonSummary,
} from '@aischool/shared';
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
  review?: LessonReviewStatus;
  mine?: boolean;
}

export function useLessons(filters: LessonFilters = {}) {
  const can = useCan('lessons.read');
  return useQuery({
    queryKey: qk.lessons(filters),
    queryFn: ({ signal }) =>
      api.get<VettedLessonSummary[]>('/lessons', { ...filters, mine: filters.mine ? 'true' : undefined }, signal),
    enabled: can,
    refetchInterval: pollListWhileGenerating,
  });
}

export function useLesson(id: string | undefined) {
  return useQuery({
    queryKey: qk.lesson(id ?? ''),
    queryFn: ({ signal }) => api.get<VettedLessonDetail>(`/lessons/${id}`, undefined, signal),
    enabled: !!id,
    refetchInterval: pollWhileGenerating,
  });
}

const VETTING_KEY = ['lesson-vetting'] as const;

const invalidateLists = () => {
  void queryClient.invalidateQueries({ queryKey: qk.lessons() });
  void queryClient.invalidateQueries({ queryKey: VETTING_KEY });
  // Scheme weeks show a lesson count.
  void queryClient.invalidateQueries({ queryKey: ['scheme'] });
};

export function useGenerateLesson() {
  return useMutation({
    mutationFn: (input: GenerateLessonInput) => api.post<VettedLessonSummary>('/lessons/generate', input),
    meta: { silent: true },
    onSuccess: invalidateLists,
  });
}

export function useRegenerateLesson(id: string) {
  return useMutation({
    mutationFn: (guidance?: string) => api.post<VettedLessonSummary>(`/lessons/${id}/regenerate`, { guidance }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.lesson(id) });
      invalidateLists();
      toast.success('Rewriting the lesson plan', { description: 'This usually takes under a minute or two.' });
    },
  });
}

export function useUpdateLesson(id: string) {
  return useMutation({
    mutationFn: (input: UpdateLessonInput) => api.patch<VettedLessonDetail>(`/lessons/${id}`, input),
    onSuccess: (l) => {
      queryClient.setQueryData(qk.lesson(id), l);
      void queryClient.invalidateQueries({ queryKey: qk.lessons() });
      void queryClient.invalidateQueries({ queryKey: VETTING_KEY });
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

// ------------------------------------------------------------------ vetting

const afterDetail = (l: VettedLessonDetail) => {
  queryClient.setQueryData(qk.lesson(l.id), l);
  invalidateLists();
};

/** Says how a bulk action went, including anything skipped and why. */
export function reportBulk(r: SubmitLessonsResult, verb: string) {
  const skipped = r.skipped.length;
  if (!r.submitted && skipped) {
    toast.error(`Nothing ${verb}`, { description: r.skipped.slice(0, 3).map((s) => `${s.topic || 'A plan'}: ${s.reason}`).join(' · ') });
    return;
  }
  toast.success(`${r.submitted} lesson note${r.submitted === 1 ? '' : 's'} ${verb}`, {
    description: skipped ? `${skipped} skipped — ${r.skipped.slice(0, 2).map((s) => `${s.topic || 'a plan'}: ${s.reason}`).join(' · ')}` : undefined,
  });
}

export function useSubmitLesson(id: string) {
  return useMutation({
    mutationFn: () => api.post<VettedLessonDetail>(`/lessons/${id}/submit`),
    onSuccess: (l) => {
      afterDetail(l);
      toast.success('Submitted for vetting', { description: 'You’ll get a notification when it has been vetted.' });
    },
  });
}

export function useWithdrawLesson(id: string) {
  return useMutation({
    mutationFn: () => api.post<VettedLessonDetail>(`/lessons/${id}/withdraw`),
    onSuccess: (l) => {
      afterDetail(l);
      toast.success('Withdrawn from vetting');
    },
  });
}

export function useSubmitWeek() {
  return useMutation({
    mutationFn: (weekStart: string) => api.post<SubmitLessonsResult>('/lessons/submit-week', { weekStart }),
    onSuccess: (r) => {
      invalidateLists();
      reportBulk(r, 'submitted');
    },
  });
}

export function useReviewLesson(id: string) {
  return useMutation({
    mutationFn: (input: ReviewLessonInput) => api.post<VettedLessonDetail>(`/lessons/${id}/review`, input),
    onSuccess: (l) => {
      afterDetail(l);
      toast.success(l.reviewStatus === 'APPROVED' ? 'Lesson note approved' : 'Returned to the teacher with your comments');
    },
  });
}

export function useBulkApprove() {
  return useMutation({
    mutationFn: (ids: string[]) => api.post<SubmitLessonsResult>('/lessons/vetting/approve', { ids }),
    onSuccess: (r) => {
      invalidateLists();
      reportBulk(r, 'approved');
    },
  });
}

export function useAiLessonCheck(id: string) {
  return useMutation({
    mutationFn: () => api.post<AiLessonCheck>(`/lessons/${id}/ai-check`),
  });
}

export interface VettingFilters {
  status: LessonReviewStatus;
  subjectId?: string;
  classArmId?: string;
  weekStart?: string;
}

export function useVettingQueue(filters: VettingFilters) {
  const can = useCan('lessons.approve');
  return useQuery({
    queryKey: [...VETTING_KEY, 'queue', filters],
    queryFn: ({ signal }) => api.get<VettedLessonSummary[]>('/lessons/vetting/queue', { ...filters }, signal),
    enabled: can,
  });
}

export function useCompliance(weekStart: string) {
  const can = useCan('lessons.approve');
  return useQuery({
    queryKey: [...VETTING_KEY, 'compliance', weekStart],
    queryFn: ({ signal }) => api.get<ComplianceReport>('/lessons/vetting/compliance', { weekStart }, signal),
    enabled: can && !!weekStart,
  });
}
