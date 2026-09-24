import {
  type AiJobView,
  type AnalysisInsight,
  type AssessmentComponent,
  type AssessmentSettings,
  type Broadsheet,
  type BuildPaperInput,
  type BuildPaperResult,
  type ClassAnalysis,
  DEFAULT_ASSESSMENT_COMPONENTS,
  DEFAULT_GRADING_SCALE,
  type GenerateQuestionsInput,
  type GenerateRemarksInput,
  type GradeBand,
  type Paginated,
  type PaperDetail,
  type PaperSummary,
  type QuestionInput,
  type QuestionRow,
  type QuestionTopicCount,
  type ReportCardRow,
  type ReportCardView,
  type SaveScoresInput,
  type ScoreSheet,
  type UpdatePaperInput,
  type UpdateReportCardInput,
} from '@aischool/shared';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, request } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { qk, queryClient } from '@/lib/query-client';

// ------------------------------------------------------------------ AI jobs

export function isJobActive(job: Pick<AiJobView, 'state'> | undefined | null): boolean {
  return job?.state === 'QUEUED' || job?.state === 'RUNNING';
}

/** Polls a background AI job every 2.5s until it finishes. */
export function useAiJob(id: string | undefined) {
  return useQuery({
    queryKey: qk.aiJob(id ?? ''),
    queryFn: ({ signal }) => api.get<AiJobView>(`/ai/jobs/${id}`, undefined, signal),
    enabled: !!id,
    staleTime: 0,
    refetchInterval: (q) => (q.state.data && !isJobActive(q.state.data) ? false : 2500),
  });
}

export function jobNumber(job: AiJobView | undefined, key: string): number {
  const v = job?.result?.[key];
  return typeof v === 'number' ? v : 0;
}

// ------------------------------------------------------------------ settings

export function useAssessmentSettings() {
  const can = useCan('results.read');
  const query = useQuery({
    queryKey: qk.assessmentSettings,
    queryFn: ({ signal }) => api.get<AssessmentSettings>('/assessment/settings', undefined, signal),
    enabled: can,
    staleTime: 5 * 60_000,
  });
  const components: AssessmentComponent[] = query.data?.components ?? DEFAULT_ASSESSMENT_COMPONENTS;
  const gradingScale: GradeBand[] = query.data?.gradingScale ?? DEFAULT_GRADING_SCALE;
  return { ...query, components, gradingScale };
}

export function useSaveAssessmentSettings() {
  return useMutation({
    mutationFn: (input: AssessmentSettings) => api.put<AssessmentSettings>('/assessment/settings', input),
    meta: { silent: true },
    onSuccess: (s) => {
      queryClient.setQueryData(qk.assessmentSettings, s);
      for (const key of [qk.scoreSheet(), qk.broadsheet(), qk.analysis(), qk.reportCards(), qk.reportCard(), qk.papers()]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      toast.success('Grading settings saved');
    },
  });
}

// ------------------------------------------------------------------ questions

export interface QuestionFilters {
  subjectId?: string;
  classLevelId?: string;
  topic?: string;
  type?: string;
  difficulty?: string;
  status?: string;
  aiJobId?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export function useQuestions(filters: QuestionFilters, enabled = true) {
  const can = useCan('assessment.read');
  return useQuery({
    queryKey: qk.questions(filters),
    queryFn: ({ signal }) => api.get<Paginated<QuestionRow>>('/questions', { ...filters }, signal),
    enabled: enabled && can,
    placeholderData: keepPreviousData,
  });
}

export function useQuestionTopics(subjectId: string | undefined, classLevelId: string | undefined) {
  const can = useCan('assessment.read');
  return useQuery({
    queryKey: qk.questionTopics({ subjectId, classLevelId }),
    queryFn: ({ signal }) => api.get<QuestionTopicCount[]>('/questions/topics', { subjectId, classLevelId }, signal),
    enabled: can && !!subjectId && !!classLevelId,
  });
}

const invalidateQuestions = () => {
  void queryClient.invalidateQueries({ queryKey: qk.questions() });
  void queryClient.invalidateQueries({ queryKey: qk.questionTopics() });
};

export function useSaveQuestion() {
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: QuestionInput }) =>
      id ? api.patch<QuestionRow>(`/questions/${id}`, input) : api.post<QuestionRow>('/questions', input),
    meta: { silent: true },
    onSuccess: (_q, v) => {
      invalidateQuestions();
      toast.success(v.id ? 'Question updated' : 'Question added');
    },
  });
}

export function useDeleteQuestion() {
  return useMutation({
    mutationFn: (q: QuestionRow) => api.delete(`/questions/${q.id}`),
    onSuccess: (_d, q) => {
      invalidateQuestions();
      toast.success(q.usedInPapers > 0 ? 'Question retired — it stays on the papers that use it' : 'Question deleted');
    },
  });
}

export function useQuestionStatus() {
  return useMutation({
    mutationFn: (input: { ids: string[]; status: QuestionRow['status'] }) => api.post<unknown>('/questions/status', input),
    onSuccess: (_d, v) => {
      invalidateQuestions();
      const n = v.ids.length;
      const noun = n === 1 ? 'question' : 'questions';
      toast.success(v.status === 'APPROVED' ? `${n} ${noun} approved` : v.status === 'RETIRED' ? `${n} ${noun} retired` : `${n} ${noun} moved to draft`);
    },
  });
}

export function useGenerateQuestions() {
  return useMutation({
    mutationFn: (input: GenerateQuestionsInput) => api.post<AiJobView>('/questions/generate', input),
    meta: { silent: true },
  });
}

// ------------------------------------------------------------------ papers

export interface PaperFilters {
  termId?: string;
  subjectId?: string;
  classLevelId?: string;
}

export function usePapers(filters: PaperFilters) {
  const can = useCan('assessment.read');
  return useQuery({
    queryKey: qk.papers(filters),
    queryFn: ({ signal }) => api.get<PaperSummary[]>('/papers', { ...filters }, signal),
    enabled: can,
  });
}

export function usePaper(id: string | undefined) {
  return useQuery({
    queryKey: qk.paper(id ?? ''),
    queryFn: ({ signal }) => api.get<PaperDetail>(`/papers/${id}`, undefined, signal),
    enabled: !!id,
  });
}

export function useBuildPaper() {
  return useMutation({
    mutationFn: (input: BuildPaperInput) => api.post<BuildPaperResult>('/papers/build', input),
    meta: { silent: true },
    onSuccess: (r) => {
      queryClient.setQueryData(qk.paper(r.paper.id), r.paper);
      void queryClient.invalidateQueries({ queryKey: qk.papers() });
    },
  });
}

export function useUpdatePaper(id: string) {
  return useMutation({
    mutationFn: (input: UpdatePaperInput) => api.patch<PaperDetail>(`/papers/${id}`, input),
    onSuccess: (p) => {
      queryClient.setQueryData(qk.paper(id), p);
      void queryClient.invalidateQueries({ queryKey: qk.papers() });
      void queryClient.invalidateQueries({ queryKey: qk.questions() });
    },
  });
}

export function useDeletePaper() {
  return useMutation({
    mutationFn: (id: string) => api.delete(`/papers/${id}`),
    onSuccess: (_d, id) => {
      queryClient.removeQueries({ queryKey: qk.paper(id) });
      void queryClient.invalidateQueries({ queryKey: qk.papers() });
      toast.success('Exam paper deleted');
    },
  });
}

// ------------------------------------------------------------------ results

export interface SheetKey {
  classArmId?: string;
  subjectId?: string;
  termId?: string;
}

export function useScoreSheet(k: SheetKey) {
  const can = useCan('results.read');
  return useQuery({
    queryKey: qk.scoreSheet(k),
    queryFn: ({ signal }) => api.get<ScoreSheet>('/results/sheet', { ...k }, signal),
    enabled: can && !!k.classArmId && !!k.subjectId && !!k.termId,
  });
}

export function useSaveScores() {
  return useMutation({
    mutationFn: (input: SaveScoresInput) => api.put<ScoreSheet>('/results/sheet', input),
    meta: { silent: true },
    onSuccess: (sheet, v) => {
      queryClient.setQueryData(qk.scoreSheet({ classArmId: v.classArmId, subjectId: v.subjectId, termId: v.termId }), sheet);
      for (const key of [qk.broadsheet(), qk.analysis(), qk.reportCards(), qk.reportCard()]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}

export interface ClassTermKey {
  classArmId?: string;
  termId?: string;
}

const ready = (k: ClassTermKey) => !!k.classArmId && !!k.termId;

export function useBroadsheet(k: ClassTermKey, enabled = true) {
  const can = useCan('results.read');
  return useQuery({
    queryKey: qk.broadsheet(k),
    queryFn: ({ signal }) => api.get<Broadsheet>('/results/broadsheet', { ...k }, signal),
    enabled: enabled && can && ready(k),
  });
}

export function useAnalysis(k: ClassTermKey, enabled = true) {
  const can = useCan('results.read');
  return useQuery({
    queryKey: qk.analysis(k),
    queryFn: ({ signal }) => api.get<ClassAnalysis>('/results/analysis', { ...k }, signal),
    enabled: enabled && can && ready(k),
  });
}

export function useAnalysisInsight() {
  return useMutation({
    mutationFn: (input: { classArmId: string; termId: string }) => api.post<AnalysisInsight>('/results/analysis/insight', input),
  });
}

// ------------------------------------------------------------------ report cards

export function useReportCards(k: ClassTermKey) {
  const can = useCan('results.read');
  return useQuery({
    queryKey: qk.reportCards(k),
    queryFn: ({ signal }) => api.get<ReportCardRow[]>('/report-cards', { ...k }, signal),
    enabled: can && ready(k),
  });
}

export function useReportCard(studentId: string | undefined, termId: string | undefined) {
  const can = useCan('results.read');
  return useQuery({
    queryKey: qk.reportCard({ studentId, termId }),
    queryFn: ({ signal }) => api.get<ReportCardView>('/report-cards/view', { studentId, termId }, signal),
    enabled: can && !!studentId && !!termId,
  });
}

export function useUpdateRemarks(studentId: string, termId: string) {
  return useMutation({
    mutationFn: (input: UpdateReportCardInput) =>
      request<ReportCardView>(`/report-cards/remarks`, { method: 'PATCH', body: input, query: { studentId, termId } }),
    onSuccess: (view) => {
      queryClient.setQueryData(qk.reportCard({ studentId, termId }), view);
      void queryClient.invalidateQueries({ queryKey: qk.reportCards() });
      toast.success('Remark saved');
    },
  });
}

export function useGenerateRemarks() {
  return useMutation({
    mutationFn: (input: GenerateRemarksInput) => api.post<AiJobView>('/report-cards/remarks/generate', input),
    meta: { silent: true },
  });
}

export function usePublishReports() {
  return useMutation({
    mutationFn: (input: { classArmId: string; termId: string; publish: boolean }) =>
      api.post<{ updated: number }>('/report-cards/publish', input),
    onSuccess: (r, v) => {
      void queryClient.invalidateQueries({ queryKey: qk.reportCards() });
      void queryClient.invalidateQueries({ queryKey: qk.reportCard() });
      toast.success(v.publish ? `${r.updated} report cards published` : `${r.updated} report cards withdrawn`);
    },
  });
}

export function invalidateReportCards() {
  void queryClient.invalidateQueries({ queryKey: qk.reportCards() });
  void queryClient.invalidateQueries({ queryKey: qk.reportCard() });
}
