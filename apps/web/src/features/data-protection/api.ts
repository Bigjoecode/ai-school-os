import type {
  DataProtectionOverview,
  DataProtectionSettings,
  DpaAcceptInput,
  DsrCloseInput,
  DsrLogInput,
  DsrRequestRow,
  DsrSubjectHit,
  DsrSubjectType,
  MyConsentStatus,
} from '@aischool/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, api, refreshSession } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { queryClient } from '@/lib/query-client';

const consentKey = (userId?: string, tenantId?: string | null) => ['data-protection', 'consent', userId ?? '', tenantId ?? ''] as const;

/** The signed-in user's consent position in the current school (parents only; others get applies=false). */
export function useMyConsent(enabled = true) {
  const me = useAuthStore((s) => s.me);
  return useQuery({
    queryKey: consentKey(me?.user.id, me?.tenant?.id ?? null),
    queryFn: ({ signal }) => api.get<MyConsentStatus>('/data-protection/consent/me', undefined, signal),
    enabled: enabled && !!me?.tenant,
    staleTime: 5 * 60_000,
  });
}

const setConsent = (s: MyConsentStatus) => {
  const me = useAuthStore.getState().me;
  queryClient.setQueryData(consentKey(me?.user.id, me?.tenant?.id ?? null), s);
};

export function useAcceptConsent() {
  return useMutation({
    mutationFn: (version: string) => api.post<MyConsentStatus>('/data-protection/consent', { version, agree: true }),
    onSuccess: (s) => {
      setConsent(s);
      // Anything that loaded behind the consent screen loads fresh now.
      void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'data-protection' });
    },
  });
}

export function useWithdrawConsent() {
  return useMutation({
    mutationFn: (reason: string | null) => api.post<MyConsentStatus>('/data-protection/consent/withdraw', { reason }),
    onSuccess: (s) => {
      setConsent(s);
      toast.success('Your consent has been withdrawn. The school has been told.');
    },
  });
}

// ------------------------------------------------------------------ school admin

export function useDataProtectionOverview() {
  return useQuery({
    queryKey: ['data-protection', 'overview'],
    queryFn: ({ signal }) => api.get<DataProtectionOverview>('/data-protection/overview', undefined, signal),
  });
}

const refreshOverview = () => queryClient.invalidateQueries({ queryKey: ['data-protection', 'overview'] });

export function useSetConsentRequired() {
  return useMutation({
    mutationFn: (consentRequired: boolean) => api.put<DataProtectionSettings>('/data-protection/settings', { consentRequired }),
    onSuccess: (s) => {
      void refreshOverview();
      toast.success(s.consentRequired ? 'Parents must accept the notice before using the portal' : 'Parents can use the portal before accepting the notice');
    },
  });
}

export function useAcceptDpa() {
  return useMutation({
    mutationFn: (input: DpaAcceptInput) => api.post<DataProtectionSettings>('/data-protection/dpa/accept', input),
    meta: { silent: true },
    onSuccess: () => {
      void refreshOverview();
      toast.success('Data Processing Agreement accepted');
    },
  });
}

export function useSubjectSearch(q: string) {
  return useQuery({
    queryKey: ['data-protection', 'subjects', q],
    queryFn: ({ signal }) => api.get<DsrSubjectHit[]>('/data-protection/subjects', { q }, signal),
    enabled: q.trim().length >= 2,
    staleTime: 30_000,
  });
}

export function useDsrRequests() {
  return useQuery({
    queryKey: ['data-protection', 'requests'],
    queryFn: ({ signal }) => api.get<DsrRequestRow[]>('/data-protection/requests', undefined, signal),
  });
}

export function useLogDsr() {
  return useMutation({
    mutationFn: (input: DsrLogInput) => api.post<DsrRequestRow[]>('/data-protection/requests', input),
    meta: { silent: true },
    onSuccess: (rows) => {
      queryClient.setQueryData(['data-protection', 'requests'], rows);
      toast.success('Request logged');
    },
  });
}

export function useCloseDsr() {
  return useMutation({
    mutationFn: ({ id, ...input }: DsrCloseInput & { id: string }) => api.post<DsrRequestRow[]>(`/data-protection/requests/${id}/close`, input),
    meta: { silent: true },
    onSuccess: (rows) => {
      queryClient.setQueryData(['data-protection', 'requests'], rows);
      toast.success('Request closed');
    },
  });
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function downloadConsentsCsv(history: boolean) {
  const csv = await api.text(`/data-protection/consents.csv${history ? '?history=1' : ''}`);
  saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${history ? 'consent-history' : 'parental-consents'}-${new Date().toISOString().slice(0, 10)}.csv`);
}

/** Downloads one person's data as JSON or a ZIP of CSV files (with the same auth and refresh as the API client). */
export async function downloadSubject(type: DsrSubjectType, id: string, format: 'json' | 'zip') {
  const path = `/api/data-protection/subjects/${type}/${id}/export.${format}`;
  const send = () =>
    fetch(path, {
      method: format === 'zip' ? 'POST' : 'GET',
      credentials: 'include',
      headers: { Authorization: `Bearer ${useAuthStore.getState().accessToken ?? ''}` },
    });
  let res = await send();
  if (res.status === 401 && (await refreshSession())) res = await send();
  if (!res.ok) {
    let message = 'The export could not be created. Please try again.';
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, message);
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? `${type}-data.${format}`;
  saveBlob(await res.blob(), name);
}
