import type {
  ClassInsightsOptions,
  ClassInsightsSummary,
  ClassMastery,
  ClassStudentMastery,
  ClassTopicDetail,
  HomeworkRow,
  MyClassInsights,
  PracticeDraft,
  PracticeHomeworkInput,
  RemedialLessonInput,
  RemedialLessonResult,
} from '@aischool/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const cik = {
  all: ['class-insights'] as const,
  options: ['class-insights', 'options'] as const,
  mine: ['class-insights', 'mine'] as const,
  mastery: (classArmId: string, subjectId: string, allTopics: boolean) => ['class-insights', 'mastery', classArmId, subjectId, allTopics] as const,
  topic: (classArmId: string, subjectId: string, topicId: string) => ['class-insights', 'topic', classArmId, subjectId, topicId] as const,
  student: (classArmId: string, subjectId: string, studentId: string) => ['class-insights', 'student', classArmId, subjectId, studentId] as const,
};

export const useInsightOptions = () =>
  useQuery({ queryKey: cik.options, queryFn: ({ signal }) => api.get<ClassInsightsOptions>('/class-insights/options', undefined, signal), staleTime: 5 * 60_000 });

export const useMyClassInsights = (enabled = true) =>
  useQuery({ queryKey: cik.mine, queryFn: ({ signal }) => api.get<MyClassInsights>('/class-insights/mine', undefined, signal), enabled, staleTime: 5 * 60_000 });

export const useClassMastery = (classArmId?: string, subjectId?: string, allTopics = false) =>
  useQuery({
    queryKey: cik.mastery(classArmId ?? '', subjectId ?? '', allTopics),
    queryFn: ({ signal }) => api.get<ClassMastery>('/class-insights/mastery', { classArmId, subjectId, allTopics: allTopics ? 'true' : undefined }, signal),
    enabled: !!classArmId && !!subjectId,
    placeholderData: keepPreviousData,
  });

export const useClassTopic = (classArmId: string, subjectId: string, topicId: string | null) =>
  useQuery({
    queryKey: cik.topic(classArmId, subjectId, topicId ?? ''),
    queryFn: ({ signal }) => api.get<ClassTopicDetail>('/class-insights/topic', { classArmId, subjectId, topicId }, signal),
    enabled: !!classArmId && !!subjectId && !!topicId,
  });

export const useClassStudent = (classArmId: string, subjectId: string, studentId: string | null) =>
  useQuery({
    queryKey: cik.student(classArmId, subjectId, studentId ?? ''),
    queryFn: ({ signal }) => api.get<ClassStudentMastery>('/class-insights/student', { classArmId, subjectId, studentId }, signal),
    enabled: !!classArmId && !!subjectId && !!studentId,
  });

export const useInsightSummary = () =>
  useMutation({ meta: { silent: true }, mutationFn: (b: { classArmId: string; subjectId: string }) => api.post<ClassInsightsSummary>('/class-insights/summary', b) });

export function useRemedialLesson() {
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: (b: RemedialLessonInput) => api.post<RemedialLessonResult>('/class-insights/remedial-lesson', b),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['lessons'] });
      void qc.invalidateQueries({ queryKey: [...cik.all, 'topic'] });
    },
  });
}

export const usePracticeDraft = () =>
  useMutation({ meta: { silent: true }, mutationFn: (b: { classArmId: string; subjectId: string; topicId: string }) => api.post<PracticeDraft>('/class-insights/practice-draft', b) });

/** Saves the practice set as draft homework, then returns its homework row for the homework form. */
export function usePracticeHomework() {
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: async (b: PracticeHomeworkInput) => {
      const { id } = await api.post<{ id: string }>('/class-insights/practice-homework', b);
      const rows = await api.get<HomeworkRow[]>('/homework', { classArmId: b.classArmId });
      return rows.find((r) => r.id === id) ?? null;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['homework'] });
      void qc.invalidateQueries({ queryKey: [...cik.all, 'topic'] });
    },
  });
}
