import {
  type BellSchedule,
  lessonPeriods,
  type InterpretResult,
  type MoveConflict,
  type RoomInput,
  type RoomRow,
  type SubjectLoadInput,
  type TimetableChange,
  type TimetableDetail,
  type TimetableSetup,
  type TimetableSummary,
  type TodaySchedule,
} from '@aischool/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { qk, queryClient } from '@/lib/query-client';

// ------------------------------------------------------------------ helpers

export type Generation = TimetableSummary['generation'];

export function isBuilding(generation: Generation | undefined | null): boolean {
  return generation === 'QUEUED' || generation === 'RUNNING';
}

/** Friendly copy for AI failures — a 503 means no provider is configured. */
export function aiErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.status === 503) return 'AI isn’t connected yet — add an API key on the server to use this.';
  return errorMessage(err);
}

/** The conflicts carried on a 409 from a lesson move, if any. */
export function moveConflicts(err: unknown): MoveConflict[] {
  if (!(err instanceof ApiError) || err.status !== 409) return [];
  const raw = err.details.conflicts;
  return Array.isArray(raw) ? (raw as MoveConflict[]) : [];
}

// ------------------------------------------------------------------ setup

export function useTimetableSetup(enabled = true) {
  const can = useCan('timetable.read');
  return useQuery({
    queryKey: qk.timetableSetup,
    queryFn: ({ signal }) => api.get<TimetableSetup>('/timetable-setup', undefined, signal),
    enabled: enabled && can,
    staleTime: 60_000,
  });
}

const putSetup = (s: TimetableSetup) => queryClient.setQueryData(qk.timetableSetup, s);

export function useSaveBell() {
  return useMutation({
    mutationFn: (input: BellSchedule) => api.put<TimetableSetup>('/timetable-setup/bell', input),
    onSuccess: (s) => {
      putSetup(s);
      toast.success('School day saved', { description: 'New timetables will use this bell schedule.' });
    },
  });
}

export function useSaveLoads() {
  return useMutation({
    mutationFn: (rows: SubjectLoadInput[]) => api.put<TimetableSetup>('/timetable-setup/loads', { rows }),
    onSuccess: (s, rows) => {
      putSetup(s);
      toast.success(`Saved ${rows.length} ${rows.length === 1 ? 'subject load' : 'subject loads'}`);
    },
  });
}

export function useSaveAvailability() {
  return useMutation({
    mutationFn: (input: { staffId: string; unavailable: { day: number; period: number }[] }) =>
      api.put<TimetableSetup>('/timetable-setup/availability', input),
    onSuccess: (s) => {
      putSetup(s);
      toast.success('Availability saved');
    },
  });
}

const invalidateSetup = () => void queryClient.invalidateQueries({ queryKey: qk.timetableSetup });

export function useSaveRoom() {
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: RoomInput }) =>
      id ? api.patch<RoomRow>(`/rooms/${id}`, input) : api.post<RoomRow>('/rooms', input),
    meta: { silent: true },
    onSuccess: (_r, v) => {
      invalidateSetup();
      toast.success(v.id ? 'Room updated' : 'Room added');
    },
  });
}

export function useToggleRoom() {
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.patch<RoomRow>(`/rooms/${id}`, { isActive }),
    onSuccess: (_r, v) => {
      invalidateSetup();
      toast.success(v.isActive ? 'Room is available for timetabling' : 'Room taken out of timetabling');
    },
  });
}

export function useDeleteRoom() {
  return useMutation({
    mutationFn: (room: RoomRow) => api.delete(`/rooms/${room.id}`),
    onSuccess: (_d, room) => {
      invalidateSetup();
      toast.success(`${room.name} deleted`);
    },
  });
}

// ------------------------------------------------------------------ timetables

export function useTimetables(termId: string | undefined, enabled = true) {
  const can = useCan('timetable.read');
  return useQuery({
    queryKey: qk.timetables({ termId: termId ?? null }),
    queryFn: ({ signal }) => api.get<TimetableSummary[]>('/timetables', { termId }, signal),
    enabled: enabled && can,
    refetchInterval: (q) => (q.state.data?.some((t) => isBuilding(t.generation)) ? 3000 : false),
  });
}

export function useTimetable(id: string | undefined) {
  return useQuery({
    queryKey: qk.timetable(id ?? ''),
    queryFn: ({ signal }) => api.get<TimetableDetail>(`/timetables/${id}`, undefined, signal),
    enabled: !!id,
    staleTime: 10_000,
    refetchInterval: (q) => (isBuilding(q.state.data?.generation) ? 2000 : false),
  });
}

const invalidateLists = () => void queryClient.invalidateQueries({ queryKey: qk.timetables() });

export function useGenerateTimetable() {
  return useMutation({
    mutationFn: (input: { termId: string; name?: string }) => api.post<TimetableSummary>('/timetables/generate', input),
    meta: { silent: true },
    onSuccess: () => invalidateLists(),
  });
}

export function useRegenerate() {
  return useMutation({
    mutationFn: (id: string) => api.post<TimetableSummary>(`/timetables/${id}/regenerate`),
    onSuccess: (t) => {
      // Mark the open detail as building straight away so polling kicks in.
      queryClient.setQueryData<TimetableDetail>(qk.timetable(t.id), (prev) => (prev ? { ...prev, ...t } : prev));
      void queryClient.invalidateQueries({ queryKey: qk.timetable(t.id) });
      invalidateLists();
    },
  });
}

export function usePublishTimetable() {
  return useMutation({
    mutationFn: (id: string) => api.post<TimetableDetail>(`/timetables/${id}/publish`),
    onSuccess: (t) => {
      queryClient.setQueryData(qk.timetable(t.id), t);
      invalidateLists();
      void queryClient.invalidateQueries({ queryKey: ['timetable', 'detail'] });
      void queryClient.invalidateQueries({ queryKey: qk.timetableToday });
      toast.success(`${t.name} is now live`, { description: 'Teachers see it on their overview today.' });
    },
  });
}

export function useDeleteTimetable() {
  return useMutation({
    mutationFn: (t: TimetableSummary) => api.delete(`/timetables/${t.id}`),
    onSuccess: (_d, t) => {
      queryClient.removeQueries({ queryKey: qk.timetable(t.id) });
      invalidateLists();
      toast.success(`${t.name} deleted`);
    },
  });
}

/** Where a lesson (and its double partner) ends up when moved to day/period. */
function applyMove(detail: TimetableDetail, entryId: string, day: number, period: number): TimetableDetail {
  const entry = detail.entries.find((e) => e.id === entryId);
  if (!entry) return detail;
  const group = entry.doubleGroup
    ? detail.entries.filter((e) => e.doubleGroup === entry.doubleGroup).sort((a, b) => a.period - b.period)
    : [entry];
  const lessons = lessonPeriods(detail.bellSchedule);
  const targets = group.length === 2 ? [period, lessons[lessons.indexOf(period) + 1] ?? period + 1] : [period];
  const ids = new Map(group.map((g, i) => [g.id, targets[i]]));
  return {
    ...detail,
    entries: detail.entries.map((e) => (ids.has(e.id) ? { ...e, day, period: ids.get(e.id)!, locked: true } : e)),
  };
}

export function useMoveEntry(timetableId: string) {
  const key = qk.timetable(timetableId);
  return useMutation({
    mutationFn: (v: { entryId: string; day: number; period: number }) =>
      api.patch<TimetableDetail>(`/timetables/${timetableId}/entries/${v.entryId}`, { day: v.day, period: v.period }),
    meta: { silent: true },
    onMutate: async (v) => {
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<TimetableDetail>(key);
      if (prev) queryClient.setQueryData(key, applyMove(prev, v.entryId, v.day, v.period));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(key, ctx.prev);
    },
    onSuccess: (t) => {
      queryClient.setQueryData(key, t);
      invalidateLists();
    },
  });
}

export function useLockEntry(timetableId: string) {
  const key = qk.timetable(timetableId);
  return useMutation({
    mutationFn: (v: { entryId: string; locked: boolean }) =>
      api.post<TimetableDetail>(`/timetables/${timetableId}/entries/${v.entryId}/lock`, { locked: v.locked }),
    onMutate: async (v) => {
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<TimetableDetail>(key);
      if (prev) {
        const entry = prev.entries.find((e) => e.id === v.entryId);
        queryClient.setQueryData<TimetableDetail>(key, {
          ...prev,
          entries: prev.entries.map((e) =>
            e.id === v.entryId || (entry?.doubleGroup && e.doubleGroup === entry.doubleGroup) ? { ...e, locked: v.locked } : e,
          ),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(key, ctx.prev);
    },
    onSuccess: (t) => queryClient.setQueryData(key, t),
  });
}

// ------------------------------------------------------------------ today

export function useTodaySchedule(enabled = true) {
  const can = useCan('timetable.read');
  return useQuery({
    queryKey: qk.timetableToday,
    queryFn: ({ signal }) => api.get<TodaySchedule>('/timetables/today', undefined, signal),
    enabled: enabled && can,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

// ------------------------------------------------------------------ AI

export function useExplainTimetable() {
  return useMutation({
    mutationFn: (id: string) => api.post<{ text: string; provider: string; model: string }>(`/timetables/${id}/explain`),
    meta: { silent: true },
    onError: (err) => toast.error(aiErrorMessage(err)),
  });
}

export function useInterpretRequest() {
  return useMutation({
    mutationFn: (text: string) => api.post<InterpretResult>('/timetables/assistant/interpret', { text }),
    meta: { silent: true },
    onError: (err) => toast.error(aiErrorMessage(err)),
  });
}

export function useApplyChanges() {
  return useMutation({
    mutationFn: (changes: TimetableChange[]) => api.post<{ applied: string[] }>('/timetables/assistant/apply', { changes }),
    onSuccess: () => invalidateSetup(),
  });
}
