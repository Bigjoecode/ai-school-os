import type { ExamCoverage, ExamQuestionInput, FillGapsInput, PipelineJob, PipelineSettings, PipelineSettingsInput, ReviewItem, ReviewQueue, ReviewStats, SubjectCoverage } from '@aischool/shared';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/query-client';
import { ck } from './commerce-api';

/** The console's question-bank pipeline: coverage, AI gap filling and the review queue. */

const base = '/platform/content/pipeline';
export const pk = {
  all: [...ck.content, 'pipeline'] as const,
  settings: [...ck.content, 'pipeline', 'settings'] as const,
  coverage: (exam: string) => [...ck.content, 'pipeline', 'coverage', exam] as const,
  subject: (exam: string, subject: string) => [...ck.content, 'pipeline', 'coverage', exam, subject] as const,
  jobs: [...ck.content, 'pipeline', 'jobs'] as const,
  review: (f: object) => [...ck.content, 'pipeline', 'review', f] as const,
  stats: [...ck.content, 'pipeline', 'stats'] as const,
};
/** Everything under Exam content (bank, coverage, queue) moves together. */
const afterContent = () => void queryClient.invalidateQueries({ queryKey: ck.content });

export const usePipelineSettings = () => useQuery({ queryKey: pk.settings, queryFn: ({ signal }) => api.get<PipelineSettings>(`${base}/settings`, undefined, signal) });
export const useSavePipelineSettings = () => useMutation({ mutationFn: (body: PipelineSettingsInput) => api.put<PipelineSettings>(`${base}/settings`, body), onSuccess: afterContent });

export const useExamCoverage = (exam: string) => useQuery({ queryKey: pk.coverage(exam), queryFn: ({ signal }) => api.get<ExamCoverage>(`${base}/coverage`, { exam }, signal), placeholderData: keepPreviousData });
export const useSubjectCoverage = (exam: string, subject: string | null) =>
  useQuery({ queryKey: pk.subject(exam, subject ?? ''), enabled: !!subject, queryFn: ({ signal }) => api.get<SubjectCoverage>(`${base}/coverage/subject`, { exam, subject: subject! }, signal) });

const live = (j: PipelineJob) => j.state === 'QUEUED' || j.state === 'RUNNING';
export const isJobLive = live;
/** Recent jobs; polls every 2s while one is running and refreshes coverage when it finishes. */
export const usePipelineJobs = () =>
  useQuery({
    queryKey: pk.jobs,
    queryFn: async ({ signal }) => {
      const jobs = await api.get<PipelineJob[]>(`${base}/jobs`, undefined, signal);
      const prev = queryClient.getQueryData<PipelineJob[]>(pk.jobs);
      // A job finished (or made progress) since last poll: coverage and the queue changed.
      if (prev && jobs.some((j) => { const p = prev.find((x) => x.id === j.id); return p && (p.state !== j.state || p.counts.drafted !== j.counts.drafted); })) {
        void queryClient.invalidateQueries({ queryKey: [...ck.content, 'pipeline', 'coverage'] });
        void queryClient.invalidateQueries({ queryKey: [...ck.content, 'pipeline', 'review'] });
      }
      return jobs;
    },
    refetchInterval: (q) => ((q.state.data ?? []).some(live) ? 2000 : false),
  });
export const useFillGaps = () => useMutation({ mutationFn: (body: Partial<FillGapsInput> & Pick<FillGapsInput, 'exam' | 'subject'>) => api.post<PipelineJob>(`${base}/fill`, body), onSuccess: () => void queryClient.invalidateQueries({ queryKey: pk.jobs }) });
export const useCancelJob = () => useMutation({ mutationFn: (id: string) => api.post<PipelineJob>(`${base}/jobs/${id}/cancel`), onSuccess: () => void queryClient.invalidateQueries({ queryKey: pk.jobs }) });

export interface ReviewFilter {
  exam?: string;
  subject?: string;
  topicId?: string;
  flagged?: 'yes' | 'no';
  aiOnly?: boolean;
}
export const useReviewQueue = (f: ReviewFilter, limit = 50) =>
  useQuery({
    queryKey: pk.review({ ...f, limit }),
    queryFn: ({ signal }) => api.get<ReviewQueue>(`${base}/review`, { ...f, aiOnly: f.aiOnly ? 'true' : undefined, limit }, signal),
    placeholderData: keepPreviousData,
  });
export const useReviewStats = () => useQuery({ queryKey: pk.stats, queryFn: ({ signal }) => api.get<ReviewStats>(`${base}/review/stats`, undefined, signal) });
export const useApprove = () => useMutation({ mutationFn: ({ id, edits }: { id: string; edits?: ExamQuestionInput }) => api.post<ReviewItem>(`${base}/review/${id}/approve`, edits ? { edits } : {}), onSuccess: afterContent });
export const useReject = () => useMutation({ mutationFn: ({ id, mode }: { id: string; mode: 'DELETE' | 'RETIRE' }) => api.post<{ id: string }>(`${base}/review/${id}/reject`, { mode }), onSuccess: afterContent });
export const useBulkApprove = () =>
  useMutation({ mutationFn: (ids: string[]) => api.post<{ approved: number; skipped: { id: string; flags: string[] }[]; notDraft: number }>(`${base}/review/bulk-approve`, { ids }), onSuccess: afterContent });
