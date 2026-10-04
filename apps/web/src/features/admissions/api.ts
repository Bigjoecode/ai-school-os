import type {
  AdmissionDecisionInput,
  AdmissionDetail,
  AdmissionDocument,
  AdmissionList,
  AdmissionMoveInput,
  AdmissionsMeta,
  AdmissionsSettings,
  AdmissionsStats,
  ApplicationFeeInput,
  ApplicationInput,
  ApplicationListQuery,
  EnrolApplicantInput,
  EnrolPreview,
  EnrolResult,
  ExamScoreInput,
  MakeOfferInput,
  OfferLetter,
  ScheduleAssessmentInput,
} from '@aischool/shared';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError, refreshSession } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { queryClient } from '@/lib/query-client';

export const admissionsKeys = {
  all: ['admissions'] as const,
  meta: ['admissions', 'meta'] as const,
  stats: ['admissions', 'stats'] as const,
  list: (q: Partial<ApplicationListQuery>) => ['admissions', 'list', q] as const,
  detail: (id: string) => ['admissions', 'detail', id] as const,
  preview: (id: string) => ['admissions', 'enrol-preview', id] as const,
  letter: (id: string) => ['admissions', 'letter', id] as const,
  prefill: (enquiryId: string) => ['admissions', 'prefill', enquiryId] as const,
};

export interface EnquiryPrefill {
  enquiry: { id: string; parentName: string; phone: string; childName: string | null; classOfInterest: string | null; status: string };
  existing: { id: string; number: string } | null;
  prefill: {
    childFirstName: string;
    childMiddleName: string;
    childLastName: string;
    classLevelId: string | null;
    entryTerm: string;
    parentName: string;
    parentPhone: string;
    parentEmail: string;
    notes: string;
  };
}

export function useAdmissionsMeta() {
  return useQuery({ queryKey: admissionsKeys.meta, queryFn: ({ signal }) => api.get<AdmissionsMeta>('/admissions/meta', undefined, signal), staleTime: 60_000 });
}

export function useAdmissionsStats() {
  return useQuery({ queryKey: admissionsKeys.stats, queryFn: ({ signal }) => api.get<AdmissionsStats>('/admissions/stats', undefined, signal) });
}

export function useApplications(q: Partial<ApplicationListQuery>) {
  return useQuery({
    queryKey: admissionsKeys.list(q),
    queryFn: ({ signal }) => api.get<AdmissionList>('/admissions', q as Record<string, string | number | undefined>, signal),
    placeholderData: keepPreviousData,
  });
}

export function useApplication(id: string) {
  return useQuery({ queryKey: admissionsKeys.detail(id), queryFn: ({ signal }) => api.get<AdmissionDetail>(`/admissions/${id}`, undefined, signal), enabled: !!id });
}

export function useEnrolPreview(id: string, enabled: boolean) {
  return useQuery({ queryKey: admissionsKeys.preview(id), queryFn: ({ signal }) => api.get<EnrolPreview>(`/admissions/${id}/enrol-preview`, undefined, signal), enabled: enabled && !!id, staleTime: 0 });
}

export function useOfferLetter(id: string) {
  return useQuery({ queryKey: admissionsKeys.letter(id), queryFn: ({ signal }) => api.get<OfferLetter>(`/admissions/${id}/offer-letter`, undefined, signal) });
}

export function useEnquiryPrefill(enquiryId: string | null) {
  return useQuery({
    queryKey: admissionsKeys.prefill(enquiryId ?? ''),
    queryFn: ({ signal }) => api.get<EnquiryPrefill>(`/admissions/enquiries/${enquiryId}/prefill`, undefined, signal),
    enabled: !!enquiryId,
  });
}

/** After any change: refresh lists and stats; put the new detail straight into the cache. */
function settle(detail?: AdmissionDetail) {
  if (detail) queryClient.setQueryData(admissionsKeys.detail(detail.id), detail);
  void queryClient.invalidateQueries({ queryKey: ['admissions', 'list'] });
  void queryClient.invalidateQueries({ queryKey: admissionsKeys.stats });
}

export function useSaveApplication(id?: string) {
  return useMutation({
    mutationFn: (body: ApplicationInput) => (id ? api.put<AdmissionDetail>(`/admissions/${id}`, body) : api.post<AdmissionDetail>('/admissions', body)),
    meta: { silent: true },
    onSuccess: (d) => {
      settle(d);
      void queryClient.invalidateQueries({ queryKey: ['reception'] });
      toast.success(id ? 'Application updated' : `Application ${d.number} created`);
    },
  });
}

type Action =
  | { kind: 'move'; body: AdmissionMoveInput }
  | { kind: 'schedule'; body: ScheduleAssessmentInput }
  | { kind: 'score'; body: ExamScoreInput }
  | { kind: 'offer'; body: MakeOfferInput }
  | { kind: 'decision'; body: AdmissionDecisionInput }
  | { kind: 'fee'; body: ApplicationFeeInput }
  | { kind: 'documents'; body: AdmissionDocument };

export function useApplicationAction(id: string) {
  return useMutation({
    mutationFn: (a: Action) => api.post<AdmissionDetail>(`/admissions/${id}/${a.kind}`, a.body),
    meta: { silent: true },
    onSuccess: (d) => settle(d),
  });
}

export function useRemoveDocument(id: string) {
  return useMutation({
    mutationFn: (fileId: string) => api.delete<AdmissionDetail>(`/admissions/${id}/documents/${fileId}`),
    onSuccess: (d) => {
      settle(d);
      toast.success('Document removed');
    },
  });
}

export function useEnrol(id: string) {
  return useMutation({
    mutationFn: (body: EnrolApplicantInput) => api.post<EnrolResult>(`/admissions/${id}/enrol`, body),
    meta: { silent: true },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: admissionsKeys.detail(id) });
      settle();
      void queryClient.invalidateQueries({ queryKey: ['students'] });
      void queryClient.invalidateQueries({ queryKey: ['guardians'] });
    },
  });
}

export function useSaveAdmissionsSettings() {
  return useMutation({
    mutationFn: (body: AdmissionsSettings) => api.put<AdmissionsSettings>('/admissions/settings', body),
    meta: { silent: true },
    onSuccess: (settings) => {
      queryClient.setQueryData<AdmissionsMeta>(admissionsKeys.meta, (old) => (old ? { ...old, settings } : old));
      toast.success('Admissions settings saved');
    },
  });
}

// ------------------------------------------------------------------ files

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const send = () => {
    const token = useAuthStore.getState().accessToken;
    return fetch(`/api${path}`, { ...init, credentials: 'include', headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) } });
  };
  let res: Response;
  try {
    res = await send();
    if (res.status === 401 && (await refreshSession())) res = await send();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }
  if (!res.ok) {
    let message = res.status === 404 ? 'File not found.' : 'Request failed. Please try again.';
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

/** POST /files/private (multipart `file`). */
export async function uploadPrivate(file: File): Promise<{ id: string; filename: string }> {
  const form = new FormData();
  form.append('file', file);
  const res = await authedFetch('/files/private', { method: 'POST', body: form });
  return (await res.json()) as { id: string; filename: string };
}

/** Opens an application's document in a new tab (the request needs the bearer token). */
export async function openDocument(applicationId: string, fileId: string) {
  const tab = window.open('', '_blank');
  try {
    const res = await authedFetch(`/admissions/${applicationId}/documents/${fileId}`);
    const url = URL.createObjectURL(await res.blob());
    if (tab) tab.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    tab?.close();
    toast.error(err instanceof Error ? err.message : 'Could not open the document');
  }
}
