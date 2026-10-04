import type {
  CbtAiSuggestion,
  CbtExamDetail,
  CbtExamSummary,
  CbtMarkingSheet,
  CbtMarksInput,
  CbtMyExam,
  CbtPaperOption,
  CbtResults,
  CbtRoom,
  CbtSaveAnswersInput,
  CbtSaveResult,
  CbtScorePreview,
  CbtSendScoresResult,
  CbtSubmitInput,
  CreateOnlineExamInput,
  UpdateOnlineExamInput,
} from '@aischool/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/query-client';
import { saveTextFile } from '../onboarding/api';

export const cbtKeys = {
  all: ['cbt'] as const,
  list: ['cbt', 'list'] as const,
  papers: ['cbt', 'papers'] as const,
  exam: (id: string) => ['cbt', 'exam', id] as const,
  results: (id: string) => ['cbt', 'results', id] as const,
  marking: (id: string) => ['cbt', 'marking', id] as const,
  scores: (id: string) => ['cbt', 'scores', id] as const,
  my: ['cbt', 'my'] as const,
  room: (id: string) => ['cbt', 'room', id] as const,
};

const invalidateExam = (id?: string) => {
  void queryClient.invalidateQueries({ queryKey: cbtKeys.list });
  if (id) {
    void queryClient.invalidateQueries({ queryKey: cbtKeys.exam(id) });
    void queryClient.invalidateQueries({ queryKey: cbtKeys.results(id) });
    void queryClient.invalidateQueries({ queryKey: cbtKeys.marking(id) });
    void queryClient.invalidateQueries({ queryKey: cbtKeys.scores(id) });
  }
};

// ------------------------------------------------------------------ staff

export function useOnlineExams() {
  return useQuery({ queryKey: cbtKeys.list, queryFn: ({ signal }) => api.get<CbtExamSummary[]>('/online-exams', undefined, signal), refetchInterval: 60_000 });
}

export function useCbtPapers(enabled = true) {
  return useQuery({ queryKey: cbtKeys.papers, queryFn: ({ signal }) => api.get<CbtPaperOption[]>('/online-exams/papers', undefined, signal), enabled });
}

/** The exam with its live roster; polls while it's open so the monitor stays current. */
export function useOnlineExam(id: string) {
  return useQuery({
    queryKey: cbtKeys.exam(id),
    queryFn: ({ signal }) => api.get<CbtExamDetail>(`/online-exams/${id}`, undefined, signal),
    refetchInterval: (q) => (q.state.data?.phase === 'OPEN' ? 10_000 : q.state.data?.phase === 'UPCOMING' ? 60_000 : false),
    refetchIntervalInBackground: false,
  });
}

export function useCbtResults(id: string, enabled = true) {
  return useQuery({ queryKey: cbtKeys.results(id), queryFn: ({ signal }) => api.get<CbtResults>(`/online-exams/${id}/results`, undefined, signal), enabled });
}

export function useCbtMarking(id: string, enabled = true) {
  return useQuery({ queryKey: cbtKeys.marking(id), queryFn: ({ signal }) => api.get<CbtMarkingSheet>(`/online-exams/${id}/marking`, undefined, signal), enabled });
}

export function useCbtScorePreview(id: string, enabled: boolean) {
  return useQuery({ queryKey: cbtKeys.scores(id), queryFn: ({ signal }) => api.get<CbtScorePreview>(`/online-exams/${id}/scores/preview`, undefined, signal), enabled, staleTime: 0 });
}

export function useCreateOnlineExam() {
  return useMutation({
    mutationFn: (input: CreateOnlineExamInput) => api.post<CbtExamSummary>('/online-exams', input),
    meta: { silent: true },
    onSuccess: (e) => {
      invalidateExam();
      toast.success(e.status === 'SCHEDULED' ? 'Online exam scheduled' : 'Saved as a draft');
    },
  });
}

export function useUpdateOnlineExam(id: string) {
  return useMutation({
    mutationFn: (input: UpdateOnlineExamInput) => api.patch<CbtExamSummary>(`/online-exams/${id}`, input),
    meta: { silent: true },
    onSuccess: () => {
      invalidateExam(id);
      toast.success('Online exam updated');
    },
  });
}

export function useExamAction(id: string) {
  return useMutation({
    mutationFn: ({ action, body }: { action: 'publish' | 'unpublish' | 'close' | 'release'; body?: unknown }) => api.post<CbtExamSummary>(`/online-exams/${id}/${action}`, body),
    onSuccess: (e, v) => {
      invalidateExam(id);
      toast.success(
        v.action === 'publish' ? 'Scheduled — students can see it now' : v.action === 'unpublish' ? 'Moved back to draft' : v.action === 'close' ? 'Exam closed' : e.resultsReleasedAt ? 'Results released to students' : 'Results hidden from students',
      );
    },
  });
}

export function useDeleteOnlineExam() {
  return useMutation({
    mutationFn: (id: string) => api.delete(`/online-exams/${id}`),
    onSuccess: () => {
      invalidateExam();
      toast.success('Online exam deleted');
    },
  });
}

export function useSaveMarks(id: string) {
  return useMutation({
    mutationFn: (input: CbtMarksInput) => api.put<{ saved: number }>(`/online-exams/${id}/marks`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: cbtKeys.marking(id) });
      void queryClient.invalidateQueries({ queryKey: cbtKeys.exam(id) });
      void queryClient.invalidateQueries({ queryKey: cbtKeys.results(id) });
      void queryClient.invalidateQueries({ queryKey: cbtKeys.scores(id) });
    },
  });
}

export function useAiSuggest(id: string) {
  return useMutation({
    mutationFn: ({ questionId, attemptIds }: { questionId: string; attemptIds?: string[] }) => api.post<CbtAiSuggestion[]>(`/online-exams/${id}/questions/${questionId}/ai-suggest`, { attemptIds }),
  });
}

export function useSendScores(id: string) {
  return useMutation({
    mutationFn: (overwriteStudentIds: string[]) => api.post<CbtSendScoresResult>(`/online-exams/${id}/scores`, { overwriteStudentIds }),
    onSuccess: (r) => {
      void queryClient.invalidateQueries({ queryKey: cbtKeys.scores(id) });
      toast.success(`${r.written + r.overwritten} mark${r.written + r.overwritten === 1 ? '' : 's'} sent to the score sheet${r.overwritten ? ` (${r.overwritten} replaced)` : ''}`);
    },
  });
}

export async function downloadResultsCsv(id: string, title: string) {
  const csv = await api.text(`/online-exams/${id}/results.csv`);
  saveTextFile(csv, `${title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'online-exam'}-results.csv`);
}

// ------------------------------------------------------------------ students

export function useMyExams() {
  return useQuery({ queryKey: cbtKeys.my, queryFn: ({ signal }) => api.get<CbtMyExam[]>('/cbt/my', undefined, signal), refetchInterval: 60_000 });
}

export function useExamRoom(id: string) {
  return useQuery({ queryKey: cbtKeys.room(id), queryFn: ({ signal }) => api.get<CbtRoom>(`/cbt/my/${id}`, undefined, signal), staleTime: 0, retry: 3 });
}

export function useStartExam(id: string) {
  return useMutation({
    mutationFn: (accessCode: string | null) => api.post<CbtRoom>(`/cbt/my/${id}/start`, { accessCode }),
    meta: { silent: true },
    onSuccess: (room) => {
      queryClient.setQueryData(cbtKeys.room(id), room);
      void queryClient.invalidateQueries({ queryKey: cbtKeys.my });
    },
  });
}

export const saveAnswers = (id: string, input: CbtSaveAnswersInput) => api.put<CbtSaveResult>(`/cbt/my/${id}/answers`, input);
export const submitExam = (id: string, input: CbtSubmitInput) => api.post<CbtRoom>(`/cbt/my/${id}/submit`, input);
