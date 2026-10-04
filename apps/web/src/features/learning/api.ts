import type {
  AllowanceExhausted,
  ExamBody,
  ExamCatalog,
  FlashcardDeckRow,
  MasteryMap,
  MasteryTopic,
  MemoryKind,
  PracticeAttemptRow,
  PracticeAttemptView,
  StudentAccess,
  StudentMemoryRow,
  StudyPlanRow,
  TutorReply,
} from '@aischool/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, refreshSession } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

export interface LearnHome {
  access: StudentAccess;
  plans: StudyPlanRow[];
  dueCards: number;
  recent: PracticeAttemptRow[];
  weakest: MasteryTopic[];
  strongest: MasteryTopic[];
}
export interface ConversationRow {
  id: string;
  title: string;
  updatedAt: string;
}
export interface ConversationDetail {
  id: string;
  title: string;
  messages: { id: string; role: string; content: string; createdAt: string }[];
}

export const lk = {
  all: ['learning'] as const,
  home: ['learning', 'home'] as const,
  conversations: ['learning', 'conversations'] as const,
  conversation: (id: string) => ['learning', 'conversation', id] as const,
  mastery: ['learning', 'mastery'] as const,
  memories: ['learning', 'memories'] as const,
  plans: ['learning', 'plans'] as const,
  decks: ['learning', 'decks'] as const,
  attempts: ['learning', 'attempts'] as const,
  attempt: (id: string) => ['learning', 'attempt', id] as const,
  exams: ['learning', 'exams'] as const,
};

export const useLearnHome = () => useQuery({ queryKey: lk.home, queryFn: () => api.get<LearnHome>('/learning/me') });
export const useConversations = () => useQuery({ queryKey: lk.conversations, queryFn: () => api.get<ConversationRow[]>('/learning/conversations') });
export const useConversation = (id: string | undefined) =>
  useQuery({ queryKey: lk.conversation(id ?? ''), queryFn: () => api.get<ConversationDetail>(`/learning/conversations/${id}`), enabled: !!id });
export const useMastery = () => useQuery({ queryKey: lk.mastery, queryFn: () => api.get<MasteryMap>('/learning/mastery') });
export const useMemories = () => useQuery({ queryKey: lk.memories, queryFn: () => api.get<StudentMemoryRow[]>('/learning/memories') });
export const usePlans = () => useQuery({ queryKey: lk.plans, queryFn: () => api.get<StudyPlanRow[]>('/learning/plans') });
export const useDecks = () => useQuery({ queryKey: lk.decks, queryFn: () => api.get<FlashcardDeckRow[]>('/learning/flashcards') });
export const useAttempts = () => useQuery({ queryKey: lk.attempts, queryFn: () => api.get<PracticeAttemptRow[]>('/learning/attempts') });
export const useAttempt = (id: string) => useQuery({ queryKey: lk.attempt(id), queryFn: () => api.get<PracticeAttemptView>(`/learning/attempts/${id}`) });
export const useExamCatalog = () => useQuery({ queryKey: lk.exams, queryFn: () => api.get<ExamCatalog>('/learning/exams') });

/** The tutor reply also carries the fresh access meter: keep the home cache in step. */
export function useTutorChat() {
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: (body: { conversationId?: string | null; message: string; deep: boolean; imageFileIds: string[]; subject?: string | null }) =>
      api.post<TutorReply>('/learning/tutor', body),
    onSuccess: (r) => {
      qc.setQueryData<LearnHome>(lk.home, (old) => (old ? { ...old, access: r.access } : old));
      void qc.invalidateQueries({ queryKey: lk.conversations });
      if (r.savedItems.length) {
        void qc.invalidateQueries({ queryKey: lk.memories });
        void qc.invalidateQueries({ queryKey: lk.mastery });
        void qc.invalidateQueries({ queryKey: lk.plans });
        void qc.invalidateQueries({ queryKey: lk.decks });
        void qc.invalidateQueries({ queryKey: lk.attempts });
      }
    },
  });
}

export function useAddMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { kind: MemoryKind; content: string }) => api.post<StudentMemoryRow>('/learning/memories', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: lk.memories }),
  });
}
export function useForgetMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/learning/memories/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: lk.memories }),
  });
}

export function useQuickQuiz() {
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: (body: { subject: string; topic: string; questions?: number }) => api.post<PracticeAttemptView>('/learning/quiz', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: lk.attempts });
      void qc.invalidateQueries({ queryKey: lk.home });
    },
  });
}

export function useSaveProgress(id: string) {
  return useMutation({ meta: { silent: true }, mutationFn: (answers: (number | null)[]) => api.put(`/learning/attempts/${id}/progress`, { answers }) });
}
export function useSubmitAttempt(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (answers: (number | null)[]) => api.post<PracticeAttemptView>(`/learning/attempts/${id}/submit`, { answers }),
    onSuccess: (v) => {
      qc.setQueryData(lk.attempt(id), v);
      void qc.invalidateQueries({ queryKey: lk.attempts });
      void qc.invalidateQueries({ queryKey: lk.home });
      void qc.invalidateQueries({ queryKey: lk.mastery });
      void qc.invalidateQueries({ queryKey: lk.exams });
    },
  });
}

export function useGeneratePlan() {
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: (body: { goal: string; days: number; minutesPerDay: number; subjects: string[] }) => api.post<StudyPlanRow>('/learning/plans', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: lk.plans });
      void qc.invalidateQueries({ queryKey: lk.home });
    },
  });
}
export function useUpdatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; itemIndex?: number; done?: boolean; status?: StudyPlanRow['status'] }) => api.put<StudyPlanRow>(`/learning/plans/${id}`, body),
    onMutate: async ({ id, itemIndex, done, status }) => {
      await qc.cancelQueries({ queryKey: lk.plans });
      const prev = qc.getQueryData<StudyPlanRow[]>(lk.plans);
      qc.setQueryData<StudyPlanRow[]>(lk.plans, (old) =>
        old?.map((p) => {
          if (p.id !== id) return p;
          const items = itemIndex != null && done != null ? p.items.map((it, i) => (i === itemIndex ? { ...it, done } : it)) : p.items;
          const pct = items.length ? Math.round((items.filter((i) => i.done).length / items.length) * 100) : p.progressPct;
          return { ...p, items, progressPct: pct, status: status ?? p.status };
        }),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(lk.plans, ctx.prev),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: lk.plans });
      void qc.invalidateQueries({ queryKey: lk.home });
    },
  });
}

export function useGenerateDeck() {
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: (body: { subject: string; topic: string; count: number }) => api.post<FlashcardDeckRow>('/learning/flashcards', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: lk.decks }),
  });
}
export function useReviewCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ deckId, cardId, result }: { deckId: string; cardId: string; result: 'AGAIN' | 'GOOD' | 'EASY' }) =>
      api.post<FlashcardDeckRow>(`/learning/flashcards/${deckId}/review`, { cardId, result }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: lk.home });
      void qc.invalidateQueries({ queryKey: lk.decks });
    },
  });
}

export function useStartExam() {
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: (body: { mode: 'PRACTICE' | 'MOCK'; exam: ExamBody; subjects: string[]; questions: number }) => api.post<PracticeAttemptView>('/learning/exams/start', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: lk.exams });
      void qc.invalidateQueries({ queryKey: lk.attempts });
    },
  });
}

/** Written (theory) practice for one exam subject; needs the exam's Prep pack (403 EXAM_NOT_INCLUDED otherwise). */
export function useStartTheory() {
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: (body: { exam: ExamBody; subject: string; questions: number }) => api.post<PracticeAttemptView>('/learning/exams/theory/start', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: lk.exams });
      void qc.invalidateQueries({ queryKey: lk.attempts });
    },
  });
}

/** Sends written answers for AI marking (10–30 s). Returns the marked attempt. */
export function useMarkTheory(id: string) {
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: (answers: string[]) => api.post<PracticeAttemptView>(`/learning/attempts/${id}/theory`, { answers }),
    onSuccess: (v) => {
      qc.setQueryData(lk.attempt(id), v);
      void qc.invalidateQueries({ queryKey: lk.attempts });
      void qc.invalidateQueries({ queryKey: lk.home });
      void qc.invalidateQueries({ queryKey: lk.mastery });
    },
  });
}

/** POST /learning/uploads (multipart `file`) — a photo of a question, Plus and Pro only. */
export async function uploadQuestionPhoto(file: File): Promise<{ id: string }> {
  if (!/^image\//.test(file.type)) throw new ApiError(415, 'Choose a photo (JPG, PNG or WebP).');
  if (file.size > 10 * 1024 * 1024) throw new ApiError(413, 'That photo is larger than 10 MB.');
  const send = () => {
    const form = new FormData();
    form.append('file', file);
    const token = useAuthStore.getState().accessToken;
    return fetch('/api/learning/uploads', {
      method: 'POST',
      body: form,
      credentials: 'include',
      headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
  };
  let res: Response;
  try {
    res = await send();
    if (res.status === 401 && (await refreshSession())) res = await send();
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }
  if (!res.ok) {
    let message = 'Upload failed. Please try again.';
    try {
      const b = (await res.json()) as { message?: string | string[] };
      if (b.message) message = Array.isArray(b.message) ? b.message.join('. ') : b.message;
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as { id: string };
}

// ------------------------------------------------------------------ upgrade-aware errors

/** A 402 from the tutor or study tools: the allowance/feature body, or null for any other error. */
export function allowanceError(error: unknown): AllowanceExhausted | null {
  if (!(error instanceof ApiError) || error.status !== 402) return null;
  const d = error.details as Partial<AllowanceExhausted>;
  if (!d.code) return null;
  return { code: d.code, message: error.message, access: d.access as StudentAccess, upgrade: d.upgrade ?? null };
}

/** Exam Academy's 403 `{ code: 'EXAM_NOT_INCLUDED', exam }`. */
export function examLockError(error: unknown): { exam: ExamBody; message: string } | null {
  if (!(error instanceof ApiError) || error.status !== 403 || error.details.code !== 'EXAM_NOT_INCLUDED') return null;
  return { exam: error.details.exam as ExamBody, message: error.message };
}
