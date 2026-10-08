import type {
  ChildGamesSummary,
  ClassGamesActivity,
  GameAnswerFeedback,
  GameLevel,
  GameRoundResult,
  GameRoundView,
  GamesAdminStatus,
  GamesHub,
  GamesLeaderboard,
  GamesSettings,
  LocalScoreInput,
  RoundStartInput,
  SyllabusMatchPack,
} from '@aischool/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

/** EduGames: the hub, server rounds, device-round scores (with an offline queue), leaderboards, staff and parent views. */

export const gk = {
  hub: ['games', 'hub'] as const,
  board: (scope: 'class' | 'house') => ['games', 'leaderboard', scope] as const,
  settings: ['games', 'settings'] as const,
  cls: (id: string) => ['games', 'class', id] as const,
  child: (id: string) => ['games', 'child', id] as const,
};

export const useGamesHub = () => useQuery({ queryKey: gk.hub, queryFn: ({ signal }) => api.get<GamesHub>('/games/hub', undefined, signal), staleTime: 30_000, retry: 1 });

export const useLeaderboard = (scope: 'class' | 'house') =>
  useQuery({ queryKey: gk.board(scope), queryFn: ({ signal }) => api.get<GamesLeaderboard>('/games/leaderboard', { scope }, signal), placeholderData: keepPreviousData, retry: false });

export function useSetHidden() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (hidden: boolean) => api.put<{ hidden: boolean }>('/games/me/privacy', { hidden }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['games'] }),
  });
}

export const startRound = (body: RoundStartInput) => api.post<GameRoundView>('/games/rounds', body);
export const answerRound = (id: string, index: number, choice: number | null) => api.post<GameAnswerFeedback>(`/games/rounds/${id}/answer`, { index, choice });
export const finishRound = (id: string) => api.post<GameRoundResult>(`/games/rounds/${id}/finish`);
export const syllabusPack = (subject: string) => api.get<SyllabusMatchPack | null>('/games/match/syllabus', { subject });

// ------------------------------------------------------------------ staff and parents

export const useClassGames = (classArmId: string | undefined) =>
  useQuery({ queryKey: gk.cls(classArmId ?? ''), queryFn: ({ signal }) => api.get<ClassGamesActivity>(`/games/class/${classArmId}`, undefined, signal), enabled: !!classArmId, retry: false });

export const useChildGames = (studentId: string | undefined) =>
  useQuery({ queryKey: gk.child(studentId ?? ''), queryFn: ({ signal }) => api.get<ChildGamesSummary>(`/games/child/${studentId}`, undefined, signal), enabled: !!studentId, retry: false });

export const useGamesSettings = (enabled = true) => useQuery({ queryKey: gk.settings, queryFn: ({ signal }) => api.get<GamesAdminStatus>('/games/settings', undefined, signal), enabled });

export function useSaveGamesSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: GamesSettings) => api.put<GamesAdminStatus>('/games/settings', body),
    onSuccess: (data) => qc.setQueryData(gk.settings, data),
  });
}

// ------------------------------------------------------------------ device rounds and the offline queue

/** What the device remembers to play offline: the student's level and year (from the last hub visit). */
const PROFILE_KEY = 'ais-games-level';
export function rememberLevel(level: GameLevel, year: number) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ level, year }));
  } catch {
    /* private mode */
  }
}
export function rememberedLevel(): { level: GameLevel; year: number } | null {
  try {
    const v = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null') as { level?: GameLevel; year?: number } | null;
    return v?.level ? { level: v.level, year: v.year ?? 1 } : null;
  } catch {
    return null;
  }
}

const queueKey = () => `ais-games-queue:${useAuthStore.getState().me?.user.id ?? 'anon'}`;
const readQueue = (): LocalScoreInput[] => {
  try {
    return JSON.parse(localStorage.getItem(queueKey()) ?? '[]') as LocalScoreInput[];
  } catch {
    return [];
  }
};
const writeQueue = (q: LocalScoreInput[]) => {
  try {
    if (q.length) localStorage.setItem(queueKey(), JSON.stringify(q.slice(-50)));
    else localStorage.removeItem(queueKey());
  } catch {
    /* storage full or blocked: nothing more we can do */
  }
};
export const queuedScores = () => readQueue().length;

export const newClientId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);

export type SubmitOutcome = { kind: 'saved'; result: GameRoundResult } | { kind: 'queued' } | { kind: 'rejected'; message: string };

/** Sends a device round's score; with no connection it waits on this phone and is sent later (once). */
export async function submitScore(input: LocalScoreInput): Promise<SubmitOutcome> {
  try {
    const result = await api.post<GameRoundResult>('/games/scores', input);
    return { kind: 'saved', result };
  } catch (err) {
    if (err instanceof ApiError && err.status === 0) {
      writeQueue([...readQueue().filter((q) => q.clientId !== input.clientId), input]);
      return { kind: 'queued' };
    }
    if (err instanceof ApiError && err.status === 429) {
      writeQueue([...readQueue().filter((q) => q.clientId !== input.clientId), input]);
      return { kind: 'queued' };
    }
    return { kind: 'rejected', message: err instanceof Error ? err.message : 'That score couldn’t be saved.' };
  }
}

let flushing = false;
/** Sends waiting scores (in the order played). Ones the server refuses are dropped; network trouble keeps them. */
export async function flushScores(): Promise<number> {
  if (flushing || typeof navigator !== 'undefined' && !navigator.onLine) return 0;
  flushing = true;
  let sent = 0;
  try {
    for (const item of readQueue()) {
      try {
        await api.post<GameRoundResult>('/games/scores', item);
        sent++;
        writeQueue(readQueue().filter((q) => q.clientId !== item.clientId));
      } catch (err) {
        if (err instanceof ApiError && (err.status === 0 || err.status === 429 || err.status >= 500 || err.status === 401)) break;
        // Refused (too old, implausible, games off then): it will never count, so let it go.
        writeQueue(readQueue().filter((q) => q.clientId !== item.clientId));
      }
    }
  } finally {
    flushing = false;
  }
  return sent;
}
