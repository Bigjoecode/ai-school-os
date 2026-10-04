import type {
  BehaviourCreateResult,
  BehaviourDashboard,
  BehaviourInput,
  BehaviourRow,
  BehaviourUpdateInput,
  ClassBehaviourSummary,
  MedicalAlertRow,
  MedicalProfile,
  MedicalProfileInput,
  NotifyParentsInput,
  Paginated,
  SickBayCreateResult,
  SickBayRow,
  SickBaySummary,
  SickBayUpdateInput,
  SickBayVisitInput,
  StudentBehaviour,
  StudentWelfareSummary,
} from '@aischool/shared';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { queryClient } from '@/lib/query-client';

export const wk = {
  all: ['welfare'] as const,
  behaviour: (p?: object) => ['welfare', 'behaviour', p ?? {}] as const,
  studentBehaviour: (id: string) => ['welfare', 'behaviour-student', id] as const,
  classBehaviour: (id: string, termId?: string) => ['welfare', 'behaviour-class', id, termId ?? 'current'] as const,
  dashboard: (p: object) => ['welfare', 'dashboard', p] as const,
  visits: (p?: object) => ['welfare', 'visits', p ?? {}] as const,
  sickSummary: ['welfare', 'sick-summary'] as const,
  medical: (id: string) => ['welfare', 'medical', id] as const,
  alerts: (classArmId?: string) => ['welfare', 'alerts', classArmId ?? 'all'] as const,
  summary: (id: string) => ['welfare', 'summary', id] as const,
};

const refresh = () => void queryClient.invalidateQueries({ queryKey: wk.all });

/** Toasts for "saved" plus anything worth knowing about the parent message. */
function notifiedToast(saved: string, r: { notified: number; notice: string | null }) {
  if (r.notified) toast.success(saved, { description: `${r.notified === 1 ? 'A parent was' : `${r.notified} parents were`} notified.${r.notice ? ` ${r.notice}.` : ''}` });
  else if (r.notice) toast.success(saved, { description: r.notice });
  else toast.success(saved);
}

// ------------------------------------------------------------------ behaviour

export interface BehaviourListParams {
  q?: string;
  page: number;
  pageSize: number;
  from?: string;
  to?: string;
  classArmId?: string;
  studentId?: string;
  kind?: string;
  category?: string;
  status?: string;
  mine?: 'true';
}

export function useBehaviour(params: BehaviourListParams, enabled = true) {
  return useQuery({
    queryKey: wk.behaviour(params),
    queryFn: ({ signal }) => api.get<Paginated<BehaviourRow>>('/welfare/behaviour', { ...params }, signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useStudentBehaviour(id: string | null) {
  return useQuery({
    queryKey: wk.studentBehaviour(id ?? ''),
    queryFn: ({ signal }) => api.get<StudentBehaviour>(`/welfare/behaviour/students/${id}`, undefined, signal),
    enabled: !!id,
  });
}

export function useClassBehaviour(classArmId: string | undefined) {
  return useQuery({
    queryKey: wk.classBehaviour(classArmId ?? ''),
    queryFn: ({ signal }) => api.get<ClassBehaviourSummary>(`/welfare/behaviour/classes/${classArmId}`, undefined, signal),
    enabled: !!classArmId,
  });
}

export function useBehaviourDashboard(p: { from?: string; to?: string; classArmId?: string }) {
  return useQuery({
    queryKey: wk.dashboard(p),
    queryFn: ({ signal }) => api.get<BehaviourDashboard>('/welfare/behaviour/dashboard', { ...p }, signal),
    placeholderData: keepPreviousData,
  });
}

export function useRecordBehaviour() {
  return useMutation({
    mutationFn: (input: BehaviourInput) => api.post<BehaviourCreateResult>('/welfare/behaviour', input),
    meta: { silent: true },
    onSuccess: (r) => {
      refresh();
      const n = r.records.length;
      const kind = r.records[0]?.kind === 'MERIT' ? 'Merit' : r.records[0]?.kind === 'DEMERIT' ? 'Demerit' : 'Incident';
      notifiedToast(n === 1 ? `${kind} recorded for ${r.records[0]!.student.name}` : `${kind} recorded for ${n} students`, r);
    },
  });
}

export function useUpdateBehaviour() {
  return useMutation({
    mutationFn: ({ id, ...input }: BehaviourUpdateInput & { id: string }) => api.patch<BehaviourRow>(`/welfare/behaviour/${id}`, input),
    meta: { silent: true },
    onSuccess: () => {
      refresh();
      toast.success('Record updated');
    },
  });
}

export function useResolveBehaviour() {
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'OPEN' | 'RESOLVED' }) => api.patch<BehaviourRow>(`/welfare/behaviour/${id}`, { status }),
    onSuccess: (r) => {
      refresh();
      toast.success(r.status === 'RESOLVED' ? 'Marked as resolved' : 'Reopened');
    },
  });
}

export function useDeleteBehaviour() {
  return useMutation({
    mutationFn: (id: string) => api.delete(`/welfare/behaviour/${id}`),
    onSuccess: () => {
      refresh();
      toast.success('Record deleted');
    },
  });
}

export function useNotifyBehaviour() {
  return useMutation({
    mutationFn: ({ id, ...input }: NotifyParentsInput & { id: string }) => api.post<{ notified: number; notice: string | null }>(`/welfare/behaviour/${id}/notify`, input),
    onSuccess: (r) => {
      refresh();
      notifiedToast('Message sent', r);
    },
  });
}

// ------------------------------------------------------------------ sick bay

export interface VisitListParams {
  q?: string;
  page: number;
  pageSize: number;
  from?: string;
  to?: string;
  classArmId?: string;
  studentId?: string;
  outcome?: string;
}

export function useVisits(params: VisitListParams, enabled = true) {
  return useQuery({
    queryKey: wk.visits(params),
    queryFn: ({ signal }) => api.get<Paginated<SickBayRow>>('/welfare/sick-bay', { ...params }, signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useSickBaySummary() {
  return useQuery({ queryKey: wk.sickSummary, queryFn: ({ signal }) => api.get<SickBaySummary>('/welfare/sick-bay/summary', undefined, signal) });
}

export function useRecordVisit() {
  return useMutation({
    mutationFn: (input: SickBayVisitInput) => api.post<SickBayCreateResult>('/welfare/sick-bay', input),
    meta: { silent: true },
    onSuccess: (r) => {
      refresh();
      notifiedToast(`Visit recorded for ${r.visit.student.name}`, r);
    },
  });
}

export function useUpdateVisit() {
  return useMutation({
    mutationFn: ({ id, ...input }: SickBayUpdateInput & { id: string }) => api.patch<SickBayRow>(`/welfare/sick-bay/${id}`, input),
    meta: { silent: true },
    onSuccess: () => {
      refresh();
      toast.success('Visit updated');
    },
  });
}

export function useDeleteVisit() {
  return useMutation({
    mutationFn: (id: string) => api.delete(`/welfare/sick-bay/${id}`),
    onSuccess: () => {
      refresh();
      toast.success('Visit deleted');
    },
  });
}

export function useNotifyVisit() {
  return useMutation({
    mutationFn: ({ id, ...input }: NotifyParentsInput & { id: string }) => api.post<{ notified: number; notice: string | null }>(`/welfare/sick-bay/${id}/notify`, input),
    onSuccess: (r) => {
      refresh();
      notifiedToast('Message sent', r);
    },
  });
}

// ------------------------------------------------------------------ medical

export function useMedical(id: string | null) {
  const can = useCan('welfare.read');
  return useQuery({
    queryKey: wk.medical(id ?? ''),
    queryFn: ({ signal }) => api.get<MedicalProfile>(`/welfare/students/${id}/medical`, undefined, signal),
    enabled: !!id && can,
  });
}

export function useSaveMedical(id: string) {
  return useMutation({
    mutationFn: (input: MedicalProfileInput) => api.put<MedicalProfile>(`/welfare/students/${id}/medical`, input),
    meta: { silent: true },
    onSuccess: (p) => {
      refresh();
      toast.success(`${p.student.name}’s medical profile saved`);
    },
  });
}

export function useMedicalAlerts(classArmId?: string, enabled = true) {
  return useQuery({
    queryKey: wk.alerts(classArmId),
    queryFn: ({ signal }) => api.get<MedicalAlertRow[]>('/welfare/medical-alerts', { classArmId }, signal),
    enabled,
  });
}

export function useStudentWelfare(id: string | null) {
  const can = useCan('welfare.read');
  return useQuery({
    queryKey: wk.summary(id ?? ''),
    queryFn: ({ signal }) => api.get<StudentWelfareSummary>(`/welfare/students/${id}/summary`, undefined, signal),
    enabled: !!id && can,
  });
}
