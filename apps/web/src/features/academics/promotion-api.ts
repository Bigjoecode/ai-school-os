import type {
  ApplyPromotionInput,
  NewSessionInput,
  NewSessionResult,
  PromotionApplyResult,
  PromotionDecisionInput,
  PromotionSettings,
  PromotionSheet,
  PromotionUndoResult,
  StudentPromotionHistoryItem,
} from '@aischool/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { qk, queryClient } from '@/lib/query-client';

const sheetKey = (sessionId: string) => ['promotion', 'sheet', sessionId] as const;

export function usePromotionSheet(sessionId: string | undefined) {
  const can = useCan('academics.manage');
  return useQuery({
    queryKey: sheetKey(sessionId ?? ''),
    queryFn: ({ signal }) => api.get<PromotionSheet>(`/promotion/sessions/${sessionId}/sheet`, undefined, signal),
    enabled: !!sessionId && can,
  });
}

/** After anything that moves students or changes sessions. */
function refreshEverything() {
  void queryClient.invalidateQueries({ queryKey: ['promotion'] });
  void queryClient.invalidateQueries({ queryKey: qk.structure });
  void queryClient.invalidateQueries({ queryKey: qk.overview });
  void queryClient.invalidateQueries({ queryKey: qk.students() });
  void queryClient.invalidateQueries({ queryKey: ['student'] });
}

export function useSavePromotionSettings() {
  return useMutation({
    mutationFn: (input: PromotionSettings) => api.put<PromotionSettings>('/promotion/settings', input),
    meta: { silent: true },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['promotion', 'sheet'] }),
  });
}

export function useSavePromotionDraft(sessionId: string) {
  return useMutation({
    mutationFn: (decisions: PromotionDecisionInput[]) => api.put<PromotionSheet>(`/promotion/sessions/${sessionId}/draft`, { decisions }),
    meta: { silent: true },
    onSuccess: (data) => queryClient.setQueryData(sheetKey(sessionId), data),
  });
}

export function useClearPromotionDraft(sessionId: string) {
  return useMutation({
    mutationFn: () => api.delete<PromotionSheet>(`/promotion/sessions/${sessionId}/draft`),
    meta: { silent: true },
    onSuccess: (data) => queryClient.setQueryData(sheetKey(sessionId), data),
  });
}

export function useCreateNextSession() {
  return useMutation({
    mutationFn: (input: NewSessionInput) => api.post<NewSessionResult>('/promotion/new-session', input),
    meta: { silent: true },
    onSuccess: refreshEverything,
  });
}

export function useApplyPromotion(sessionId: string) {
  return useMutation({
    mutationFn: (input: ApplyPromotionInput) => api.post<PromotionApplyResult>(`/promotion/sessions/${sessionId}/apply`, input),
    meta: { silent: true },
    onSettled: refreshEverything,
  });
}

export function useUndoPromotion(sessionId: string) {
  return useMutation({
    mutationFn: () => api.post<PromotionUndoResult>(`/promotion/sessions/${sessionId}/undo`),
    meta: { silent: true },
    onSettled: refreshEverything,
  });
}

export function useStudentPromotions(studentId: string | undefined) {
  const can = useCan('students.read');
  return useQuery({
    queryKey: ['promotion', 'student', studentId ?? ''],
    queryFn: ({ signal }) => api.get<StudentPromotionHistoryItem[]>(`/promotion/students/${studentId}/history`, undefined, signal),
    enabled: !!studentId && can,
  });
}
