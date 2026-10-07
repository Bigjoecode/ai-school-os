import type {
  CheckInAiInput,
  CheckInOutcome,
  CheckInQuestion,
  CheckInStart,
  ChildModules,
  ClassModulesSummary,
  ClassroomEngagement,
  ClassroomSessionView,
  CueResult,
  LiveJoin,
  LiveStudentState,
  MaterialStreamUrl,
  ModuleAiDraftInput,
  ModuleDetail,
  ModuleInput,
  ModuleLibraryQuery,
  ModuleListQuery,
  ModuleOptions,
  ModuleResults,
  ModuleStepsInput,
  ModuleSummary,
  ModuleTopicOption,
  MyModuleDetail,
  MyModules,
  SessionHandsInput,
  SessionSummary,
  Workbook,
  WorkbookQuery,
} from '@aischool/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** Learning modules: authoring, library, workbook, classroom mode and the student's lessons. */

export const lk = {
  all: ['lesson-modules'] as const,
  options: ['lesson-modules', 'options'] as const,
  topics: (subjectId: string, classLevelId: string) => ['lesson-modules', 'topics', subjectId, classLevelId] as const,
  list: (q: ModuleListQuery) => ['lesson-modules', 'list', q] as const,
  library: (q: ModuleLibraryQuery) => ['lesson-modules', 'library', q] as const,
  one: (id: string) => ['lesson-modules', 'one', id] as const,
  results: (id: string) => ['lesson-modules', 'results', id] as const,
  workbook: (q: WorkbookQuery) => ['lesson-modules', 'workbook', q] as const,
  classSummary: (a: string, s: string) => ['lesson-modules', 'class', a, s] as const,
  engagement: ['lesson-modules', 'engagement'] as const,
  sessions: (moduleId?: string) => ['lesson-modules', 'sessions', moduleId ?? 'all'] as const,
  session: (id: string) => ['lesson-modules', 'session', id] as const,
  mine: ['my-lessons'] as const,
  myOne: (id: string) => ['my-lessons', id] as const,
  child: (id: string) => ['my-lessons', 'child', id] as const,
  live: (id: string) => ['my-lessons', 'live', id] as const,
};

// ------------------------------------------------------------------ staff

export const useModuleOptions = () => useQuery({ queryKey: lk.options, queryFn: ({ signal }) => api.get<ModuleOptions>('/modules/options', undefined, signal), staleTime: 5 * 60_000 });

export const useModuleTopics = (subjectId: string | undefined, classLevelId: string | undefined) =>
  useQuery({
    queryKey: lk.topics(subjectId ?? '', classLevelId ?? ''),
    queryFn: ({ signal }) => api.get<ModuleTopicOption[]>('/modules/topics', { subjectId, classLevelId }, signal),
    enabled: !!subjectId && !!classLevelId,
    staleTime: 10 * 60_000,
  });

export const useModules = (q: ModuleListQuery, enabled = true) =>
  useQuery({ queryKey: lk.list(q), queryFn: ({ signal }) => api.get<ModuleSummary[]>('/modules', q as Record<string, string | undefined>, signal), enabled, placeholderData: keepPreviousData });

export const useModuleLibrary = (q: ModuleLibraryQuery, enabled = true) =>
  useQuery({ queryKey: lk.library(q), queryFn: ({ signal }) => api.get<ModuleSummary[]>('/modules/library', q as Record<string, string | undefined>, signal), enabled, placeholderData: keepPreviousData });

export const useModule = (id: string | undefined) =>
  useQuery({ queryKey: lk.one(id ?? ''), queryFn: ({ signal }) => api.get<ModuleDetail>(`/modules/${id}`, undefined, signal), enabled: !!id });

export const useModuleResults = (id: string | undefined, enabled = true) =>
  useQuery({ queryKey: lk.results(id ?? ''), queryFn: ({ signal }) => api.get<ModuleResults>(`/modules/${id}/results`, undefined, signal), enabled: !!id && enabled });

export const useWorkbook = (q: WorkbookQuery | null) =>
  useQuery({
    queryKey: lk.workbook(q ?? { classArmId: '', subjectId: '' }),
    queryFn: ({ signal }) => api.get<Workbook>('/modules/workbook', q as unknown as Record<string, string | number | undefined>, signal),
    enabled: !!q,
    placeholderData: keepPreviousData,
  });

export const useClassModules = (classArmId: string | undefined, subjectId: string | undefined) =>
  useQuery({
    queryKey: lk.classSummary(classArmId ?? '', subjectId ?? ''),
    queryFn: ({ signal }) => api.get<ClassModulesSummary>('/modules/class-summary', { classArmId, subjectId }, signal),
    enabled: !!classArmId && !!subjectId,
  });

export const useEngagement = () => useQuery({ queryKey: lk.engagement, queryFn: ({ signal }) => api.get<ClassroomEngagement>('/modules/engagement', undefined, signal), staleTime: 60_000 });

export const useSessions = (moduleId?: string) =>
  useQuery({ queryKey: lk.sessions(moduleId), queryFn: ({ signal }) => api.get<SessionSummary[]>('/classroom/sessions', { moduleId }, signal) });

const invalidate = (qc: ReturnType<typeof useQueryClient>) => void qc.invalidateQueries({ queryKey: lk.all });

export function useSaveModule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: ModuleInput }) => (id ? api.put<ModuleDetail>(`/modules/${id}`, body) : api.post<ModuleDetail>('/modules', body)),
    onSuccess: (m) => {
      qc.setQueryData(lk.one(m.id), m);
      invalidate(qc);
    },
    meta: { silent: true },
  });
}

export function useSaveSteps(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ModuleStepsInput) => api.put<ModuleDetail>(`/modules/${id}/steps`, body),
    onSuccess: (m) => {
      qc.setQueryData(lk.one(m.id), m);
      invalidate(qc);
    },
    meta: { silent: true },
  });
}

export function useModuleAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, body }: { id: string; action: 'publish' | 'copy' | 'library' | 'delete'; body?: unknown }): Promise<ModuleDetail | { archived: boolean }> =>
      action === 'publish'
        ? api.patch<ModuleDetail>(`/modules/${id}/publish`, body)
        : action === 'delete'
          ? api.delete<{ archived: boolean }>(`/modules/${id}`)
          : api.post<ModuleDetail>(`/modules/${id}/${action}`, body),
    onSuccess: () => invalidate(qc),
  });
}

export function useAiDraft() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: ModuleAiDraftInput) => api.post<ModuleDetail>('/modules/ai/draft', body), onSuccess: () => invalidate(qc), meta: { silent: true } });
}

export const aiCheckIn = (body: CheckInAiInput) => api.post<CheckInQuestion[]>('/modules/ai/checkin', body);
export const bankQuestions = (q: { subjectId: string; classLevelId: string; topicId?: string; q?: string }) => api.get<CheckInQuestion[]>('/modules/bank', q);

/** A step's file (staff, students and parents alike). */
export const stepFileUrl = (moduleId: string, stepId: string) => `/api/modules/${moduleId}/steps/${stepId}/file`;
export const stepStreamUrl = (moduleId: string, stepId: string) => api.post<MaterialStreamUrl>(`/modules/${moduleId}/steps/${stepId}/stream`);

// ------------------------------------------------------------------ classroom (teacher)

export const startSession = (moduleId: string, present?: number | null) => api.post<{ id: string }>(`/classroom/modules/${moduleId}/sessions`, { present: present ?? null });

export const useSession = (id: string | undefined, polling: boolean) =>
  useQuery({
    queryKey: lk.session(id ?? ''),
    queryFn: ({ signal }) => api.get<ClassroomSessionView>(`/classroom/sessions/${id}`, undefined, signal),
    enabled: !!id,
    refetchInterval: polling ? 2000 : false,
  });

export function useSessionAction(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { kind: 'open'; stepId: string } | { kind: 'close' } | { kind: 'end' } | { kind: 'step'; stepId: string } | { kind: 'present'; present: number | null } | { kind: 'decision'; stepId: string; decision: 'MOVE_ON' | 'RETEACH' } | { kind: 'hands'; body: SessionHandsInput }) => {
      const base = `/classroom/sessions/${id}`;
      switch (a.kind) {
        case 'open':
          return api.post<ClassroomSessionView>(`${base}/open`, { stepId: a.stepId });
        case 'close':
          return api.post<ClassroomSessionView>(`${base}/close`);
        case 'end':
          return api.post<ClassroomSessionView>(`${base}/end`);
        case 'step':
          return api.patch<ClassroomSessionView>(base, { currentStepId: a.stepId });
        case 'present':
          return api.patch<ClassroomSessionView>(base, { present: a.present });
        case 'decision':
          return api.post<ClassroomSessionView>(`${base}/decision`, { stepId: a.stepId, decision: a.decision });
        case 'hands':
          return api.post<ClassroomSessionView>(`${base}/hands`, a.body);
      }
    },
    onSuccess: (v) => qc.setQueryData(lk.session(id), v),
  });
}

// ------------------------------------------------------------------ students

export const useMyLessons = () => useQuery({ queryKey: lk.mine, queryFn: ({ signal }) => api.get<MyModules>('/my-lessons', undefined, signal) });
export const useMyLesson = (id: string | undefined) => useQuery({ queryKey: lk.myOne(id ?? ''), queryFn: ({ signal }) => api.get<MyModuleDetail>(`/my-lessons/${id}`, undefined, signal), enabled: !!id });
export const useChildModules = (studentId: string | undefined) =>
  useQuery({ queryKey: lk.child(studentId ?? ''), queryFn: ({ signal }) => api.get<ChildModules>(`/my-lessons/child/${studentId}`, undefined, signal), enabled: !!studentId });

export const visitStep = (id: string, stepId: string) => api.post(`/my-lessons/${id}/steps/${stepId}/visit`).catch(() => undefined);
export const completeStep = (id: string, stepId: string) => api.post<{ moduleCompleted: boolean }>(`/my-lessons/${id}/steps/${stepId}/complete`);
export const startCheckIn = (id: string, stepId: string) => api.post<CheckInStart>(`/my-lessons/${id}/steps/${stepId}/checkin`);
export const submitCheckIn = (attemptId: string, answers: Record<string, number | string>) => api.post<CheckInOutcome>(`/my-lessons/attempts/${attemptId}/submit`, { answers });
export const answerCue = (id: string, stepId: string, questionId: string, answer: number | string) => api.post<CueResult>(`/my-lessons/${id}/steps/${stepId}/cue`, { questionId, answer });

export const joinLesson = (code: string) => api.post<LiveJoin>('/classroom/join', { code });
export const useLiveState = (sessionId: string | undefined) =>
  useQuery({ queryKey: lk.live(sessionId ?? ''), queryFn: ({ signal }) => api.get<LiveStudentState>(`/classroom/live/${sessionId}`, undefined, signal), enabled: !!sessionId, refetchInterval: (q) => (q.state.data?.status === 'ENDED' ? false : 2000) });
export const sendLiveAnswer = (sessionId: string, attemptId: string, answers: Record<string, number | string>) => api.post<CheckInOutcome>(`/classroom/live/${sessionId}/answer`, { attemptId, answers });
