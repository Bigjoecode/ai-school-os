import type { OfflineExamStatus, OfflineInvigilatorSheet, OfflinePack, OfflineReviewInput, OfflineSettingsInput } from '@aischool/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { queryClient } from '@/lib/query-client';
import { cbtKeys } from '../api';
import { idb, packKeyOf, type StoredPack } from './db';
import { refreshPending } from './sync';

export const offlineKeys = {
  status: (id: string) => ['cbt', 'offline', id] as const,
  sheet: (id: string) => ['cbt', 'offline-sheet', id] as const,
};

// ------------------------------------------------------------------ saving packs on this device

/** Asks the browser not to clear this site's storage when space runs low (best effort). */
async function keepStorage() {
  try {
    if (navigator.storage?.persisted && !(await navigator.storage.persisted())) await navigator.storage.persist?.();
  } catch {
    /* not supported */
  }
}

async function savePack(pack: OfflinePack): Promise<StoredPack> {
  const me = useAuthStore.getState().me;
  const ownerUserId = me?.user.id ?? pack.downloadedBy.userId;
  const stored: StoredPack = { key: packKeyOf(pack.examId, pack.mode, ownerUserId), pack, ownerUserId, tenantId: me?.tenant?.id ?? null, savedAt: new Date().toISOString() };
  await idb.put('packs', stored);
  await keepStorage();
  // The exam room's code, so it opens offline even if it was never visited.
  void import('./offline-room-page').catch(() => undefined);
  await refreshPending();
  return stored;
}

/** A student downloads their own exam. */
export async function downloadMyPack(examId: string) {
  const pack = await api.post<OfflinePack>(`/cbt/offline/${examId}/pack`);
  const stored = await savePack(pack);
  void queryClient.invalidateQueries({ queryKey: cbtKeys.my });
  return stored;
}

/** Staff prepare this device for a whole class (students sign in with admission number + exam PIN). */
export async function downloadDevicePack(examId: string, classArmIds?: string[]) {
  const pack = await api.post<OfflinePack>(`/online-exams/${examId}/offline/device-pack`, { classArmIds });
  const stored = await savePack(pack);
  void queryClient.invalidateQueries({ queryKey: offlineKeys.status(examId) });
  return stored;
}

export async function storageEstimate(): Promise<{ usage: number; quota: number; persisted: boolean } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    if (!e) return null;
    return { usage: e.usage ?? 0, quota: e.quota ?? 0, persisted: (await navigator.storage.persisted?.()) ?? false };
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ staff

export function useOfflineStatus(id: string, enabled = true) {
  return useQuery({
    queryKey: offlineKeys.status(id),
    queryFn: ({ signal }) => api.get<OfflineExamStatus>(`/online-exams/${id}/offline`, undefined, signal),
    enabled,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
}

const afterChange = (id: string, s: OfflineExamStatus) => {
  queryClient.setQueryData(offlineKeys.status(id), s);
  void queryClient.invalidateQueries({ queryKey: cbtKeys.exam(id) });
  void queryClient.invalidateQueries({ queryKey: cbtKeys.list });
};

export function useSaveOfflineSettings(id: string) {
  return useMutation({
    mutationFn: (input: OfflineSettingsInput) => api.put<OfflineExamStatus>(`/online-exams/${id}/offline`, input),
    meta: { silent: true },
    onSuccess: (s) => {
      afterChange(id, s);
      toast.success(s.enabled ? 'Available offline' : 'No longer available offline');
    },
  });
}

export function useRotateOfflineCode(id: string) {
  return useMutation({
    mutationFn: () => api.post<OfflineExamStatus>(`/online-exams/${id}/offline/rotate-code`),
    onSuccess: (s) => {
      afterChange(id, s);
      toast.success('New start code made', { description: 'Devices that downloaded before must download again.' });
    },
  });
}

export function useReviewSeat(id: string) {
  return useMutation({
    mutationFn: ({ seatId, action }: { seatId: string } & OfflineReviewInput) => api.post<OfflineExamStatus>(`/online-exams/${id}/offline/seats/${seatId}/review`, { action }),
    onSuccess: (s, v) => {
      afterChange(id, s);
      void queryClient.invalidateQueries({ queryKey: cbtKeys.results(id) });
      toast.success(v.action === 'accept' ? 'Accepted and marked' : v.action === 'reject' ? 'Hand-in rejected' : 'Marked as reviewed');
    },
  });
}

export function useInvigilatorSheet(id: string) {
  return useQuery({ queryKey: offlineKeys.sheet(id), queryFn: ({ signal }) => api.get<OfflineInvigilatorSheet>(`/online-exams/${id}/offline/sheet`, undefined, signal), staleTime: 0 });
}
