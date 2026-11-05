import type {
  CreatePracticalAssessmentInput,
  PracticalAssessmentOptions,
  PracticalAssessmentPick,
  PracticalAssessmentResults,
  PracticalAssessmentSummary,
  PracticalAttemptView,
  PracticalMyAssessment,
  UpdatePracticalAssessmentInput,
} from '@aischool/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/query-client';
import { saveTextFile } from '../onboarding/api';

export const ptKeys = {
  all: ['practical-tests'] as const,
  list: ['practical-tests', 'list'] as const,
  options: ['practical-tests', 'options'] as const,
  picks: (subjectId: string) => ['practical-tests', 'picks', subjectId] as const,
  results: (id: string) => ['practical-tests', 'results', id] as const,
  my: ['practical-tests', 'my'] as const,
};

export const practicalTestBase = (id: string) => `/practical-assessments/${id}`;

const invalidate = (id?: string) => {
  void queryClient.invalidateQueries({ queryKey: ptKeys.list });
  if (id) {
    void queryClient.invalidateQueries({ queryKey: ptKeys.results(id) });
    void queryClient.invalidateQueries({ queryKey: ['score-copy', practicalTestBase(id)] });
  }
};

// ------------------------------------------------------------------ staff

export const usePracticalTests = () => useQuery({ queryKey: ptKeys.list, queryFn: ({ signal }) => api.get<PracticalAssessmentSummary[]>('/practical-assessments', undefined, signal), refetchInterval: 60_000 });
export const usePracticalTestOptions = (enabled: boolean) => useQuery({ queryKey: ptKeys.options, queryFn: ({ signal }) => api.get<PracticalAssessmentOptions>('/practical-assessments/options', undefined, signal), enabled });
export const usePracticalTestPicks = (subjectId: string) =>
  useQuery({ queryKey: ptKeys.picks(subjectId), queryFn: ({ signal }) => api.get<PracticalAssessmentPick[]>('/practical-assessments/practicals', { subjectId }, signal), enabled: !!subjectId });

/** Results with the live roster; polls while it's open. */
export function usePracticalTestResults(id: string) {
  return useQuery({
    queryKey: ptKeys.results(id),
    queryFn: ({ signal }) => api.get<PracticalAssessmentResults>(`${practicalTestBase(id)}/results`, undefined, signal),
    refetchInterval: (q) => (q.state.data?.assessment.phase === 'OPEN' ? 15_000 : false),
  });
}

export function useCreatePracticalTest() {
  return useMutation({
    meta: { silent: true },
    mutationFn: (input: CreatePracticalAssessmentInput) => api.post<PracticalAssessmentSummary>('/practical-assessments', input),
    onSuccess: (e) => {
      invalidate();
      toast.success(e.status === 'SCHEDULED' ? 'Practical test scheduled' : 'Saved as a draft');
    },
  });
}

export function useUpdatePracticalTest(id: string) {
  return useMutation({
    meta: { silent: true },
    mutationFn: (input: UpdatePracticalAssessmentInput) => api.patch<PracticalAssessmentSummary>(practicalTestBase(id), input),
    onSuccess: () => {
      invalidate(id);
      toast.success('Practical test updated');
    },
  });
}

export function usePracticalTestAction(id: string) {
  return useMutation({
    mutationFn: ({ action, body }: { action: 'publish' | 'unpublish' | 'close' | 'release'; body?: unknown }) => api.post<PracticalAssessmentSummary>(`${practicalTestBase(id)}/${action}`, body),
    onSuccess: (e, v) => {
      invalidate(id);
      toast.success(v.action === 'publish' ? 'Scheduled — students can see it now' : v.action === 'unpublish' ? 'Moved back to draft' : v.action === 'close' ? 'Closed: anyone still in the lab was handed in' : e.resultsReleasedAt ? 'Results released to students' : 'Results hidden from students');
    },
  });
}

export function useDeletePracticalTest() {
  return useMutation({
    mutationFn: (id: string) => api.delete(practicalTestBase(id)),
    onSuccess: () => {
      invalidate();
      toast.success('Practical test deleted');
    },
  });
}

export async function downloadPracticalTestCsv(id: string, title: string) {
  const csv = await api.text(`${practicalTestBase(id)}/results.csv`);
  saveTextFile(csv, `${title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'practical-test'}-results.csv`);
}

// ------------------------------------------------------------------ students

export const useMyPracticalTests = () => useQuery({ queryKey: ptKeys.my, queryFn: ({ signal }) => api.get<PracticalMyAssessment[]>('/learning/practical-tests', undefined, signal), refetchInterval: 60_000 });

/** Starts (or returns to) the student's one sitting; the lab opens on its result. */
export function useStartPracticalTest(id: string) {
  return useMutation({
    meta: { silent: true },
    mutationFn: (accessCode: string | null) => api.post<PracticalAttemptView>(`/learning/practical-tests/${id}/start`, { accessCode }),
    onSuccess: (v) => {
      queryClient.setQueryData(['practicals', 'lab', v.id], v);
      void queryClient.invalidateQueries({ queryKey: ptKeys.my });
    },
  });
}
