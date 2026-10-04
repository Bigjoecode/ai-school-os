import type {
  AiJobView,
  Channel,
  HomeworkInput,
  HomeworkRow,
  JoinLink,
  LiveAttendanceStatus,
  LiveClassDetail,
  LiveClassInput,
  LiveClassRow,
  LiveIntegrationStatus,
  LiveOverview,
  LiveProvider,
  LiveStatus,
  MyLearning,
  SubmissionBoard,
  SubmissionRow,
  SyncResult,
} from '@aischool/shared';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { useCan, useMe } from '@/lib/auth-store';
import { queryClient } from '@/lib/query-client';
import { aiErrorMessage } from '../finance/api';

/** Query keys — live classes under ['live'], homework under ['homework'], the family view under ['learning']. */
export const lk = {
  all: ['live'] as const,
  overview: ['live', 'overview'] as const,
  integrations: ['live', 'integrations'] as const,
  classes: (p: object) => ['live', 'classes', p] as const,
  detail: (id: string) => ['live', 'detail', id] as const,
  homeworkAll: ['homework'] as const,
  homework: (p: object) => ['homework', p] as const,
  learning: ['learning'] as const,
  board: (id: string) => ['homework', 'board', id] as const,
  assignment: (id: string) => ['learning', 'homework', id] as const,
  childHomework: (id: string) => ['learning', 'child', id] as const,
};

const refreshLive = () => void queryClient.invalidateQueries({ queryKey: lk.all });
const refreshHomework = () => void queryClient.invalidateQueries({ queryKey: lk.homeworkAll });

function setDetail(d: LiveClassDetail) {
  queryClient.setQueryData(lk.detail(d.id), d);
  void queryClient.invalidateQueries({ queryKey: lk.all, predicate: (q) => q.queryKey[1] !== 'detail' });
}

// ------------------------------------------------------------------ overview & integrations

export function useLiveOverview(enabled = true) {
  const can = useCan('live.read');
  return useQuery({
    queryKey: lk.overview,
    queryFn: ({ signal }) => api.get<LiveOverview>('/live/overview', undefined, signal),
    enabled: enabled && can,
    // Statuses (Scheduled → Live → Ended) are worked out on the server at request time.
    refetchInterval: 60_000,
  });
}

export function useLiveIntegrations(enabled = true) {
  const can = useCan('live.read');
  return useQuery({
    queryKey: lk.integrations,
    queryFn: ({ signal }) => api.get<LiveIntegrationStatus[]>('/live/integrations', undefined, signal),
    enabled: enabled && can,
    staleTime: 60_000,
  });
}

export function useSaveZoom() {
  return useMutation({
    meta: { silent: true },
    mutationFn: (input: { accountId: string; clientId: string; clientSecret: string }) => api.put<LiveIntegrationStatus[]>('/live/integrations/zoom', input),
    onSuccess: (s) => {
      queryClient.setQueryData(lk.integrations, s);
      refreshLive();
    },
  });
}

export function useSaveBbb() {
  return useMutation({
    meta: { silent: true },
    mutationFn: (input: { url: string; secret: string }) => api.put<LiveIntegrationStatus[]>('/live/integrations/bbb', input),
    onSuccess: (s) => {
      queryClient.setQueryData(lk.integrations, s);
      refreshLive();
    },
  });
}

export function useDisconnectProvider() {
  return useMutation({
    mutationFn: (provider: LiveProvider) => api.delete(`/live/integrations/${provider}`),
    onSuccess: () => refreshLive(),
  });
}

/** Sends the browser to Google; it comes back to /live/settings?google=… */
export function useGoogleConnect() {
  return useMutation({
    mutationFn: () => api.get<{ url: string }>('/live/google/connect'),
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
  });
}

// ------------------------------------------------------------------ classes

export interface LiveListParams {
  from?: string;
  to?: string;
  classArmId?: string;
  teacherId?: string;
  status?: LiveStatus;
  mine?: boolean;
}

export function useLiveClasses(params: LiveListParams, enabled = true) {
  const can = useCan('live.read');
  return useQuery({
    queryKey: lk.classes(params),
    queryFn: ({ signal }) => api.get<LiveClassRow[]>('/live/classes', { ...params, mine: params.mine ? 'true' : undefined }, signal),
    enabled: enabled && can,
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
}

export function useLiveClass(id: string | undefined) {
  return useQuery({
    queryKey: lk.detail(id ?? ''),
    queryFn: ({ signal }) => api.get<LiveClassDetail>(`/live/classes/${id}`, undefined, signal),
    enabled: !!id,
    refetchInterval: (q) => {
      const s = q.state.data?.intelligence;
      return s === 'QUEUED' || s === 'RUNNING' ? 4000 : 60_000;
    },
  });
}

export function useSaveLiveClass() {
  return useMutation({
    meta: { silent: true },
    mutationFn: ({ id, input }: { id?: string; input: LiveClassInput }) => (id ? api.put<LiveClassDetail>(`/live/classes/${id}`, input) : api.post<LiveClassDetail>('/live/classes', input)),
    onSuccess: (d, v) => {
      setDetail(d);
      toast.success(v.id ? 'Class updated' : 'Live class scheduled');
    },
  });
}

export function useFromTimetable() {
  return useMutation({
    meta: { silent: true },
    mutationFn: (input: { classArmId: string; subjectId: string; from: string; to: string; provider: LiveProvider; joinUrl: string | null }) =>
      api.post<{ created: number; skipped: string[] }>('/live/classes/from-timetable', input),
    onSuccess: () => refreshLive(),
  });
}

export function useCancelLiveClass() {
  return useMutation({
    mutationFn: (id: string) => api.post<LiveClassDetail>(`/live/classes/${id}/cancel`),
    onSuccess: (d) => {
      setDetail(d);
      toast.success('Class cancelled');
    },
  });
}

/**
 * Asks for the person's own link (host or attendee) and opens it in a new tab.
 * The tab is opened straight away so pop-up blockers don't stop it.
 */
export function useJoinLiveClass() {
  return useMutation({
    meta: { silent: true },
    mutationFn: async (id: string) => {
      const tab = window.open('about:blank', '_blank');
      try {
        const link = await api.post<JoinLink>(`/live/classes/${id}/join`);
        if (tab) {
          tab.opener = null;
          tab.location.href = link.url;
        } else {
          window.open(link.url, '_blank', 'noopener,noreferrer');
        }
        return link;
      } catch (err) {
        tab?.close();
        throw err;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: lk.learning });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useMarkLiveAttendance(id: string) {
  return useMutation({
    meta: { silent: true },
    mutationFn: (marks: { studentId: string; status: LiveAttendanceStatus }[]) => api.put<LiveClassDetail>(`/live/classes/${id}/attendance`, { marks }),
    onSuccess: (d) => {
      setDetail(d);
      toast.success('Attendance saved');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useSyncLiveClass(id: string) {
  return useMutation({
    meta: { silent: true },
    mutationFn: () => api.post<SyncResult>(`/live/classes/${id}/sync`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: lk.all }),
  });
}

export function useSaveTranscript(id: string) {
  return useMutation({
    meta: { silent: true },
    mutationFn: (input: { source: 'UPLOAD' | 'NOTES'; text: string }) => api.put<LiveClassDetail>(`/live/classes/${id}/transcript`, input),
    onSuccess: (d, v) => {
      setDetail(d);
      toast.success(v.source === 'UPLOAD' ? 'Transcript saved' : 'Notes saved');
    },
  });
}

export function useRunIntelligence(id: string) {
  return useMutation({
    meta: { silent: true },
    mutationFn: () => api.post<AiJobView>(`/live/classes/${id}/intelligence`),
    onSuccess: (job) => {
      queryClient.setQueryData<LiveClassDetail>(lk.detail(id), (d) => (d ? { ...d, intelligence: job.state === 'RUNNING' ? 'RUNNING' : 'QUEUED', intelligenceJobId: job.id, intelligenceResult: null, intelligenceError: null } : d));
      void queryClient.invalidateQueries({ queryKey: lk.detail(id) });
    },
    onError: (err) => toast.error(aiErrorMessage(err)),
  });
}

export function useSetHomeworkFromClass(id: string) {
  return useMutation({
    meta: { silent: true },
    mutationFn: (input: { dueDate: string; notifyParents: Channel[] }) => api.post<HomeworkRow>(`/live/classes/${id}/homework`, input),
    onSuccess: (_h, v) => {
      void queryClient.invalidateQueries({ queryKey: lk.detail(id) });
      refreshHomework();
      toast.success(v.notifyParents.length ? 'Homework set — parents are being told' : 'Homework set for the class');
    },
  });
}

export function useSaveQuiz(id: string) {
  return useMutation({
    mutationFn: () => api.post<{ questionIds: string[] }>(`/live/classes/${id}/quiz`),
    onSuccess: (r) => {
      queryClient.setQueryData<LiveClassDetail>(lk.detail(id), (d) => (d ? { ...d, quizQuestionIds: r.questionIds } : d));
      void queryClient.invalidateQueries({ queryKey: ['questions'] });
      toast.success(`${r.questionIds.length} questions saved to the question bank as drafts`);
    },
  });
}

export function useShareSummary(id: string) {
  return useMutation({
    meta: { silent: true },
    mutationFn: (input: { notifyParents: Channel[] }) => api.post<LiveClassDetail>(`/live/classes/${id}/share`, input),
    onSuccess: (d) => {
      setDetail(d);
      toast.success('Shared — students and parents can read it under My learning');
    },
  });
}

// ------------------------------------------------------------------ homework

export interface HomeworkParams {
  classArmId?: string;
  subjectId?: string;
  status?: 'DRAFT' | 'PUBLISHED';
  due?: 'UPCOMING' | 'PAST';
}

export function useHomework(params: HomeworkParams) {
  const can = useCan('homework.manage');
  return useQuery({
    queryKey: lk.homework(params),
    queryFn: ({ signal }) => api.get<HomeworkRow[]>('/homework', { ...params }, signal),
    enabled: can,
    placeholderData: keepPreviousData,
  });
}

export function useSaveHomework() {
  return useMutation({
    meta: { silent: true },
    mutationFn: ({ id, input }: { id?: string; input: HomeworkInput }) => (id ? api.put<HomeworkRow>(`/homework/${id}`, input) : api.post<HomeworkRow>('/homework', input)),
    onSuccess: (h, v) => {
      refreshHomework();
      void queryClient.invalidateQueries({ queryKey: lk.learning });
      toast.success(v.id ? (h.status === 'PUBLISHED' && v.input.publish ? 'Homework saved' : 'Draft saved') : h.status === 'PUBLISHED' ? 'Homework set for the class' : 'Saved as a draft');
    },
  });
}

export function useDeleteHomework() {
  return useMutation({
    mutationFn: (id: string) => api.delete(`/homework/${id}`),
    onSuccess: () => {
      refreshHomework();
      refreshLive();
      toast.success('Homework removed');
    },
  });
}

// ------------------------------------------------------------------ students & parents

export function useMyLearning(enabled = true) {
  const me = useMe();
  return useQuery({
    queryKey: lk.learning,
    queryFn: ({ signal }) => api.get<MyLearning>('/learning/mine', undefined, signal),
    enabled: enabled && !!me?.tenant,
    refetchInterval: 60_000,
  });
}

// ------------------------------------------------------------------ hand-ins

/** A student's own view of one assignment, with their hand-in. */
export interface AssignmentView {
  homework: HomeworkRow;
  submission: SubmissionRow | null;
}

/** A child's homework for their parent, with the child's hand-in. */
export type ChildHomeworkRow = HomeworkRow & { mine: NonNullable<HomeworkRow['mine']> | null };

export function useSubmissionBoard(id: string | undefined, enabled = true) {
  const can = useCan('homework.manage');
  return useQuery({
    queryKey: lk.board(id ?? ''),
    queryFn: ({ signal }) => api.get<SubmissionBoard>(`/homework/${id}/submissions`, undefined, signal),
    enabled: enabled && can && !!id,
  });
}

function putSubmission(homeworkId: string, row: SubmissionRow) {
  queryClient.setQueryData<SubmissionBoard>(lk.board(homeworkId), (b) => (b ? { ...b, submissions: b.submissions.map((s) => (s.id === row.id ? row : s)) } : b));
}

export function useAiMark(homeworkId: string) {
  return useMutation({
    meta: { silent: true },
    mutationFn: (submissionId: string) => api.post<SubmissionRow>(`/homework/submissions/${submissionId}/ai-mark`),
    onSuccess: (row) => putSubmission(homeworkId, row),
    onError: (err) => toast.error(aiErrorMessage(err)),
  });
}

export function useGradeSubmission(homeworkId: string) {
  return useMutation({
    meta: { silent: true },
    mutationFn: ({ id, input }: { id: string; input: { score: number | null; feedback: string | null; status: 'GRADED' | 'RETURNED' } }) => api.put<SubmissionRow>(`/homework/submissions/${id}`, input),
    onSuccess: (row, v) => {
      putSubmission(homeworkId, row);
      void queryClient.invalidateQueries({ queryKey: lk.homeworkAll, predicate: (q) => q.queryKey[1] !== 'board' });
      toast.success(v.input.status === 'RETURNED' ? `Returned to ${row.student.name} to redo` : `Mark saved — ${row.student.name} and their parents can see it`);
    },
  });
}

export function useAssignment(id: string | undefined) {
  const me = useMe();
  return useQuery({
    queryKey: lk.assignment(id ?? ''),
    queryFn: ({ signal }) => api.get<AssignmentView>(`/learning/homework/${id}`, undefined, signal),
    enabled: !!id && !!me?.tenant,
  });
}

export function useSubmitHomework(id: string) {
  return useMutation({
    meta: { silent: true },
    mutationFn: (input: { text: string | null; fileIds: string[]; links: string[] }) => api.post<SubmissionRow>(`/learning/homework/${id}/submit`, input),
    onSuccess: (row) => {
      queryClient.setQueryData<AssignmentView>(lk.assignment(id), (d) => (d ? { ...d, submission: row } : d));
      void queryClient.invalidateQueries({ queryKey: lk.learning });
      toast.success(row.late ? 'Handed in (late) — your teacher can see it now' : 'Handed in — your teacher can see it now');
    },
  });
}

export function useChildHomework(childId: string | undefined) {
  return useQuery({
    queryKey: lk.childHomework(childId ?? ''),
    queryFn: ({ signal }) => api.get<ChildHomeworkRow[]>(`/family/children/${childId}/homework`, undefined, signal),
    enabled: !!childId,
  });
}
