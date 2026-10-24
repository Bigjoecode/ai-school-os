import type {
  PracticalAskInput,
  PracticalAskResult,
  PracticalAttemptView,
  PracticalCheckResult,
  PracticalClassView,
  PracticalLessonView,
  PracticalMode,
  PracticalSubjectRow,
  PracticalSubjectView,
  PracticalTeacherAttemptView,
  PracticeAttemptView,
} from '@aischool/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const pk = {
  all: ['practicals'] as const,
  subjects: ['practicals', 'subjects'] as const,
  subject: (s: string) => ['practicals', 'subject', s] as const,
  lesson: (id: string) => ['practicals', 'lesson', id] as const,
  lab: (id: string) => ['practicals', 'lab', id] as const,
  teaching: (classArmId: string, subject: string) => ['practicals', 'teaching', classArmId, subject] as const,
  teachingAttempt: (id: string) => ['practicals', 'teaching-attempt', id] as const,
};

export const usePracticalSubjects = (enabled = true) => useQuery({ queryKey: pk.subjects, queryFn: () => api.get<PracticalSubjectRow[]>('/learning/practicals'), enabled });
export const usePracticalSubject = (subject: string) => useQuery({ queryKey: pk.subject(subject), queryFn: () => api.get<PracticalSubjectView>(`/learning/practicals/subjects/${encodeURIComponent(subject)}`) });
export const usePracticalLesson = (id: string) => useQuery({ queryKey: pk.lesson(id), queryFn: () => api.get<PracticalLessonView>(`/learning/practicals/lessons/${encodeURIComponent(id)}`) });
export const useLabAttempt = (id: string) => useQuery({ queryKey: pk.lab(id), queryFn: () => api.get<PracticalAttemptView>(`/learning/practicals/labs/${id}`) });

export function usePracticalCheck(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (answers: number[]) => api.post<PracticalCheckResult>(`/learning/practicals/lessons/${encodeURIComponent(id)}/check`, { answers }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: pk.all }),
  });
}

/** A short check on some of the lesson's questions (inside the 3D lab's Learn stage): marked, not recorded. */
export function usePracticalMiniCheck(id: string) {
  return useMutation({
    meta: { silent: true },
    mutationFn: (body: { answers: number[]; questions: number[] }) => api.post<PracticalCheckResult>(`/learning/practicals/lessons/${encodeURIComponent(id)}/check`, body),
  });
}

/** "Ask Mrs Ada": a short AI answer from the practical's lesson (refused in timed practicals). */
export function usePracticalAsk(id: string) {
  return useMutation({
    meta: { silent: true },
    mutationFn: (body: PracticalAskInput) => api.post<PracticalAskResult>(`/learning/practicals/lessons/${encodeURIComponent(id)}/ask`, body),
  });
}

/** WAEC practical questions on the lesson's topic, AI-marked like theory (403 EXAM_NOT_INCLUDED without WAEC Prep). */
export function usePracticalPractice(id: string) {
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: (questions: number) => api.post<PracticeAttemptView>(`/learning/practicals/lessons/${encodeURIComponent(id)}/practice`, { questions }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['learning', 'attempts'] }),
  });
}

/** Opens (or resumes) a virtual lab. 403 EXAM_NOT_INCLUDED: exam mode, or the free labs are used up. */
export function useStartLab() {
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: (body: { practicalId: string; mode: PracticalMode }) => api.post<PracticalAttemptView>('/learning/practicals/labs', body),
    onSuccess: (v) => {
      qc.setQueryData(pk.lab(v.id), v);
      void qc.invalidateQueries({ queryKey: pk.lesson(v.practicalId) });
    },
  });
}

export const saveLabDraft = (id: string, state: unknown) => api.put<{ ok: boolean }>(`/learning/practicals/labs/${id}/draft`, { state });

export function useSubmitLab(id: string) {
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: (state: unknown) => api.post<PracticalAttemptView>(`/learning/practicals/labs/${id}/submit`, { state }),
    onSuccess: (v) => {
      qc.setQueryData(pk.lab(id), v);
      void qc.invalidateQueries({ queryKey: pk.all });
      void qc.invalidateQueries({ queryKey: ['learning', 'mastery'] });
    },
  });
}

// ------------------------------------------------------------------ teachers

export const usePracticalClass = (classArmId: string, subject: string) =>
  useQuery({ queryKey: pk.teaching(classArmId, subject), queryFn: () => api.get<PracticalClassView>('/practicals-teaching/class', { ...(classArmId ? { classArmId } : {}), ...(subject ? { subject } : {}) }) });
export const useTeachingAttempt = (id: string) => useQuery({ queryKey: pk.teachingAttempt(id), queryFn: () => api.get<PracticalTeacherAttemptView>(`/practicals-teaching/attempts/${id}`) });

export function useOverrideLab(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { score: number; note: string }) => api.post<PracticalTeacherAttemptView>(`/practicals-teaching/attempts/${id}/override`, body),
    onSuccess: (v) => {
      qc.setQueryData(pk.teachingAttempt(id), v);
      void qc.invalidateQueries({ queryKey: ['practicals', 'teaching'] });
    },
  });
}
