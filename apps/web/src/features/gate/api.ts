import type {
  AuthorisedPickupInput,
  AuthorisedPickupRow,
  CollectInput,
  CollectResult,
  GateChild,
  GateEventRow,
  GatePassBatch,
  GateScanInput,
  GateScanResult,
  GateSettings,
  GateSettingsView,
  GateToday,
  PickupNoticeInput,
  PickupNoticeResult,
  PortalArrival,
} from '@aischool/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api, ApiError, refreshSession } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

/**
 * Gate check-in/out, pick-up and parents' arrival & pick-up section.
 * The gate screen polls so parents' notices (running late, someone else
 * collecting) show up without a reload.
 */

export const gk = {
  today: ['gate', 'today'] as const,
  search: (q: string) => ['gate', 'search', q] as const,
  child: (id: string) => ['gate', 'child', id] as const,
  settings: ['gate', 'settings'] as const,
  passes: (classArmId?: string) => ['gate', 'passes', classArmId ?? ''] as const,
  arrival: (id: string) => ['portal', 'arrival', id] as const,
};

export const useGateToday = () => useQuery({ queryKey: gk.today, queryFn: ({ signal }) => api.get<GateToday>('/gate/today', undefined, signal), refetchInterval: 20_000 });

export const useGateSearch = (q: string) =>
  useQuery({
    queryKey: gk.search(q),
    queryFn: ({ signal }) => api.get<GateChild[]>('/gate/students', { q }, signal),
    enabled: q.trim().length >= 2,
    placeholderData: keepPreviousData,
  });

export const useGateChild = (id: string | null) =>
  useQuery({ queryKey: gk.child(id ?? ''), queryFn: ({ signal }) => api.get<GateChild>(`/gate/students/${id}`, undefined, signal), enabled: !!id });

export const useGateSettings = (enabled = true) => useQuery({ queryKey: gk.settings, queryFn: ({ signal }) => api.get<GateSettingsView>('/gate/settings', undefined, signal), enabled });

export const useGatePasses = (classArmId?: string) =>
  useQuery({ queryKey: gk.passes(classArmId), queryFn: ({ signal }) => api.get<GatePassBatch>('/gate/passes', { classArmId }, signal), placeholderData: keepPreviousData });

function useInvalidateGate() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ['gate'] });
}

export function useScan() {
  const done = useInvalidateGate();
  return useMutation({ mutationFn: (body: GateScanInput) => api.post<GateScanResult>('/gate/scan', body), onSuccess: done });
}

export function useUndo() {
  const done = useInvalidateGate();
  return useMutation({
    mutationFn: (id: string) => api.post<GateEventRow>(`/gate/events/${id}/undo`),
    onSuccess: (e) => {
      toast.success(`Undone: ${e.student.firstName}’s ${e.type === 'ARRIVE' ? 'arrival' : 'departure'}`);
      done();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not undo'),
  });
}

export function useCollect() {
  const done = useInvalidateGate();
  return useMutation({ mutationFn: (body: CollectInput) => api.post<CollectResult>('/gate/collect', body), onSuccess: done });
}

/** A lost pass: its code stops working; the next print gets a new one. */
export function useCancelPass() {
  const done = useInvalidateGate();
  return useMutation({
    mutationFn: (studentId: string) => api.post(`/gate/students/${studentId}/pass/reissue`),
    onSuccess: () => {
      toast.success('Gate pass cancelled. Print a new one from Gate passes.');
      done();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not cancel the pass'),
  });
}

export function useSaveGateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: GateSettings) => api.put<GateSettingsView>('/gate/settings', body),
    onSuccess: (v) => {
      qc.setQueryData(gk.settings, v);
      void qc.invalidateQueries({ queryKey: gk.today });
      toast.success('Gate & pick-up settings saved');
    },
  });
}

/** Staff (gate) or parent (portal) management of a child's pick-up list. */
export function usePickupPeople(studentId: string, as: 'staff' | 'parent') {
  const qc = useQueryClient();
  const base = as === 'staff' ? `/gate/students/${studentId}/pickup-people` : `/portal/students/${studentId}/pickup-people`;
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['gate'] });
    void qc.invalidateQueries({ queryKey: gk.arrival(studentId) });
  };
  const save = useMutation({
    mutationFn: ({ id, body }: { id?: string; body: AuthorisedPickupInput }) => (id ? api.put<AuthorisedPickupRow>(`${base}/${id}`, body) : api.post<AuthorisedPickupRow>(base, body)),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`${base}/${id}`),
    onSuccess: () => {
      toast.success('Removed from the pick-up list');
      refresh();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not remove'),
  });
  return { save, remove };
}

// ------------------------------------------------------------------ parents

export const usePortalArrival = (id: string) =>
  useQuery({ queryKey: gk.arrival(id), queryFn: ({ signal }) => api.get<PortalArrival>(`/portal/students/${id}/arrival`, undefined, signal), enabled: !!id, refetchInterval: 60_000 });

export function usePickupNotice(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PickupNoticeInput) => api.post<PickupNoticeResult>(`/portal/students/${studentId}/pickup-notices`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: gk.arrival(studentId) }),
  });
}

export function useCancelNotice(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/portal/students/${studentId}/pickup-notices/${id}/cancel`),
    onSuccess: () => {
      toast.success('Cancelled');
      void qc.invalidateQueries({ queryKey: gk.arrival(studentId) });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not cancel'),
  });
}

// ------------------------------------------------------------------ files & photos

async function authed(path: string, init: RequestInit = {}): Promise<Response> {
  const send = () => {
    const token = useAuthStore.getState().accessToken;
    return fetch(`/api${path}`, { ...init, credentials: 'include', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) } });
  };
  let res = await send();
  if (res.status === 401 && (await refreshSession())) res = await send();
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
  return res;
}

/** A photo upload (private to the school): returns the file id to send with the form. */
export async function uploadPhoto(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const res = await authed('/files/private', { method: 'POST', body: form });
  return ((await res.json()) as { id: string }).id;
}

/** Photos of pick-up people need sign-in, so they're fetched and shown as blob URLs. */
export function useAuthedImage(path: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    let alive = true;
    let made: string | null = null;
    authed(path)
      .then((r) => r.blob())
      .then((b) => {
        if (!alive) return;
        made = URL.createObjectURL(b);
        setUrl(made);
      })
      .catch(() => alive && setUrl(null));
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [path]);
  return url;
}
