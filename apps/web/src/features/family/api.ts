import type { CheckoutQuote, FamilyOverview, KbAnswer, LanguageCode, MasteryMap, MemoryKind, PracticeAttemptRow, StudentAccess, StudentMemoryRow, StudyPlanRow } from '@aischool/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ChildProgress {
  access: StudentAccess;
  mastery: MasteryMap;
  plans: StudyPlanRow[];
  attempts: PracticeAttemptRow[];
  memories: StudentMemoryRow[];
  tutorConversations: number;
  tutorLanguage?: LanguageCode;
}
export interface CheckoutBody {
  productCode: string;
  studentIds: string[];
  couponCode?: string | null;
  autoRenew: boolean;
  email?: string | null;
}

export const fk = {
  overview: ['family'] as const,
  child: (id: string) => ['family', 'child', id] as const,
};

export const useFamily = () => useQuery({ queryKey: fk.overview, queryFn: () => api.get<FamilyOverview>('/family') });
export const useChildProgress = (id: string) => useQuery({ queryKey: fk.child(id), queryFn: () => api.get<ChildProgress>(`/family/children/${id}/progress`) });

export function useQuote() {
  return useMutation({ meta: { silent: true }, mutationFn: (body: CheckoutBody) => api.post<CheckoutQuote>('/family/quote', body) });
}
export function useCheckout() {
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: (body: CheckoutBody) => api.post<{ authorizationUrl: string | null; reference: string }>('/family/checkout', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: fk.overview }),
  });
}
export function useVerify() {
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: (reference: string) => api.get<{ status: string }>('/family/verify', { reference }),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['family'] }),
  });
}
export function useUpdateSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; cancelAtPeriodEnd?: boolean; autoRenew?: boolean }) => api.put<{ ok: true }>(`/family/subscriptions/${id}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: fk.overview }),
  });
}
export function useRenewNow() {
  return useMutation({ mutationFn: (id: string) => api.post<{ authorizationUrl: string | null; reference: string }>(`/family/subscriptions/${id}/renew`) });
}
export function useTellTutor(childId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { kind: MemoryKind; content: string }) => api.post<StudentMemoryRow>(`/family/children/${childId}/memories`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: fk.child(childId) }),
  });
}
export function useAskSchool() {
  return useMutation({ meta: { silent: true }, mutationFn: (question: string) => api.post<KbAnswer>('/knowledge/ask', { question }) });
}
