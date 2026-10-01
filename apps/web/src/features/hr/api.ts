import type {
  AiText,
  AwardInput,
  AwardRow,
  DepartmentInput,
  DepartmentRow,
  EmployeeDetail,
  EmployeeInput,
  EmployeeRow,
  HrOverview,
  HrSettings,
  LeaveRequestInput,
  LeaveRequestRow,
  LeaveStatus,
  LeaveTypeInput,
  LeaveTypeRow,
  MyHr,
  Paginated,
  PayAdjustment,
  PayProfileInput,
  PayProfileRow,
  PayrollRunDetail,
  PayrollRunRow,
  PayslipView,
  SalaryGradeInput,
  SalaryGradeRow,
  AwardCategory,
} from '@aischool/shared';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { qk, queryClient } from '@/lib/query-client';
import { aiErrorMessage } from '../finance/api';

export type PayrollSettingsView = HrSettings & { currency: string };

export interface EmployeeListParams {
  q?: string;
  departmentId?: string;
  status?: EmployeeRow['status'];
  type?: EmployeeRow['type'];
  page?: number;
  pageSize?: number;
}

export interface LeaveListParams {
  status?: LeaveStatus;
  staffId?: string;
  from?: string;
  to?: string;
}

/** Query keys — HR under ['hr'], payroll under ['payroll']. */
export const hk = {
  all: ['hr'] as const,
  overview: ['hr', 'overview'] as const,
  departments: ['hr', 'departments'] as const,
  employees: (params: EmployeeListParams) => ['hr', 'employees', params] as const,
  employee: (id: string) => ['hr', 'employee', id] as const,
  leaveTypes: ['hr', 'leave-types'] as const,
  leave: (params: LeaveListParams) => ['hr', 'leave', params] as const,
  awards: ['hr', 'awards'] as const,
  me: ['hr', 'me'] as const,
  myPayslip: (id: string) => ['hr', 'me', 'payslip', id] as const,
};

export const pk = {
  all: ['payroll'] as const,
  settings: ['payroll', 'settings'] as const,
  grades: ['payroll', 'grades'] as const,
  profiles: ['payroll', 'profiles'] as const,
  runs: ['payroll', 'runs'] as const,
  run: (id: string) => ['payroll', 'run', id] as const,
  payslip: (id: string) => ['payroll', 'payslip', id] as const,
};

/** Staff records changed: refresh HR views (and the dashboard). */
export function invalidateHr() {
  void queryClient.invalidateQueries({ queryKey: hk.all });
  void queryClient.invalidateQueries({ queryKey: qk.overview });
}

/** Pay changed: refresh payroll views, the HR overview and staff records. */
export function invalidatePayroll() {
  void queryClient.invalidateQueries({ queryKey: pk.all });
  void queryClient.invalidateQueries({ queryKey: hk.all });
}

// ------------------------------------------------------------------ overview & AI

export function useHrOverview() {
  const can = useCan('hr.read');
  return useQuery({
    queryKey: hk.overview,
    queryFn: ({ signal }) => api.get<HrOverview>('/hr/overview', undefined, signal),
    enabled: can,
  });
}

export function useHrInsight() {
  return useMutation({
    mutationFn: () => api.post<AiText>('/hr/insight'),
    meta: { silent: true },
    onError: (err) => toast.error(aiErrorMessage(err)),
  });
}

// ------------------------------------------------------------------ departments

export function useDepartments(enabled = true) {
  const can = useCan('hr.read');
  return useQuery({
    queryKey: hk.departments,
    queryFn: ({ signal }) => api.get<DepartmentRow[]>('/hr/departments', undefined, signal),
    enabled: enabled && can,
    staleTime: 60_000,
  });
}

export function useSaveDepartment(id?: string) {
  return useMutation({
    mutationFn: (input: DepartmentInput) => (id ? api.put<unknown>(`/hr/departments/${id}`, input) : api.post<unknown>('/hr/departments', input)),
    meta: { silent: true },
    onSuccess: () => {
      invalidateHr();
      toast.success(id ? 'Department updated' : 'Department added');
    },
  });
}

export function useDeleteDepartment() {
  return useMutation({
    mutationFn: (id: string) => api.delete(`/hr/departments/${id}`),
    onSuccess: () => {
      invalidateHr();
      toast.success('Department deleted');
    },
  });
}

// ------------------------------------------------------------------ employees

export function useEmployees(params: EmployeeListParams, enabled = true) {
  const can = useCan('hr.read');
  return useQuery({
    queryKey: hk.employees(params),
    queryFn: ({ signal }) => api.get<Paginated<EmployeeRow>>('/hr/employees', { ...params }, signal),
    enabled: enabled && can,
    placeholderData: keepPreviousData,
  });
}

/** Everyone still on staff, for pickers. */
export function useStaffOptions(enabled = true) {
  return useEmployees({ pageSize: 200 }, enabled);
}

export function useEmployee(id: string | undefined) {
  return useQuery({
    queryKey: hk.employee(id ?? ''),
    queryFn: ({ signal }) => api.get<EmployeeDetail>(`/hr/employees/${id}`, undefined, signal),
    enabled: !!id,
  });
}

export function useSaveEmployee(id: string) {
  return useMutation({
    mutationFn: (input: EmployeeInput) => api.put<EmployeeDetail>(`/hr/employees/${id}`, input),
    meta: { silent: true },
    onSuccess: (d) => {
      queryClient.setQueryData(hk.employee(d.id), d);
      invalidateHr();
      void queryClient.invalidateQueries({ queryKey: qk.staff() });
      toast.success(`${d.name}’s record saved`);
    },
  });
}

// ------------------------------------------------------------------ leave

export function useLeaveTypes(enabled = true) {
  const can = useCan('hr.read');
  return useQuery({
    queryKey: hk.leaveTypes,
    queryFn: ({ signal }) => api.get<LeaveTypeRow[]>('/hr/leave-types', undefined, signal),
    enabled: enabled && can,
    staleTime: 60_000,
  });
}

export function useSaveLeaveType(id?: string) {
  return useMutation({
    mutationFn: (input: LeaveTypeInput) => (id ? api.put<unknown>(`/hr/leave-types/${id}`, input) : api.post<unknown>('/hr/leave-types', input)),
    meta: { silent: true },
    onSuccess: () => {
      invalidateHr();
      toast.success(id ? 'Leave type updated' : 'Leave type added');
    },
  });
}

export function useLeave(params: LeaveListParams, enabled = true) {
  const can = useCan('hr.read');
  return useQuery({
    queryKey: hk.leave(params),
    queryFn: ({ signal }) => api.get<LeaveRequestRow[]>('/hr/leave', { ...params }, signal),
    enabled: enabled && can,
    placeholderData: keepPreviousData,
  });
}

export function useRecordLeave() {
  return useMutation({
    mutationFn: (input: LeaveRequestInput) => api.post<LeaveRequestRow>('/hr/leave', input),
    meta: { silent: true },
    onSuccess: (r) => {
      invalidateHr();
      toast.success(`Leave recorded for ${r.staff.name} — awaiting approval`);
    },
  });
}

export function useDecideLeave() {
  return useMutation({
    mutationFn: ({ id, decision, note }: { id: string; decision: 'APPROVE' | 'DECLINE'; note: string | null }) =>
      api.post<LeaveRequestRow>(`/hr/leave/${id}/decide`, { decision, note }),
    meta: { silent: true },
    onSuccess: (r) => {
      invalidateHr();
      void queryClient.invalidateQueries({ queryKey: qk.attendance });
      toast.success(r.status === 'APPROVED' ? `Approved ${r.staff.name}’s ${r.leaveType.name.toLowerCase()}` : `Declined ${r.staff.name}’s request`);
    },
  });
}

export function useCancelLeave() {
  return useMutation({
    mutationFn: (id: string) => api.post<LeaveRequestRow>(`/hr/leave/${id}/cancel`),
    onSuccess: (r) => {
      invalidateHr();
      void queryClient.invalidateQueries({ queryKey: qk.attendance });
      toast.success(`Cancelled ${r.staff.name}’s ${r.leaveType.name.toLowerCase()}`);
    },
  });
}

// ------------------------------------------------------------------ awards

export function useAwards() {
  const can = useCan('hr.read');
  return useQuery({
    queryKey: hk.awards,
    queryFn: ({ signal }) => api.get<AwardRow[]>('/hr/awards', undefined, signal),
    enabled: can,
  });
}

export function useGiveAward() {
  return useMutation({
    mutationFn: (input: AwardInput) => api.post<AwardRow>('/hr/awards', input),
    meta: { silent: true },
    onSuccess: (a) => {
      invalidateHr();
      toast.success(`${a.title} given to ${a.staff.name}`);
    },
  });
}

export function useDeleteAward() {
  return useMutation({
    mutationFn: (id: string) => api.delete(`/hr/awards/${id}`),
    onSuccess: () => {
      invalidateHr();
      toast.success('Award removed');
    },
  });
}

export interface CitationDraft extends AiText {
  citation: string;
  shortVersion: string;
}

export function useDraftCitation() {
  return useMutation({
    mutationFn: (input: { staffId: string; title: string; category: AwardCategory; notes?: string }) => api.post<CitationDraft>('/hr/awards/citation', input),
    meta: { silent: true },
    onError: (err) => toast.error(aiErrorMessage(err)),
  });
}

// ------------------------------------------------------------------ self-service

export function useMyHr() {
  const can = useCan('hr.self');
  return useQuery({
    queryKey: hk.me,
    queryFn: ({ signal }) => api.get<MyHr>('/hr/me', undefined, signal),
    enabled: can,
  });
}

export function useRequestMyLeave() {
  return useMutation({
    mutationFn: (input: Omit<LeaveRequestInput, 'staffId'>) => api.post<LeaveRequestRow>('/hr/me/leave', input),
    meta: { silent: true },
    onSuccess: (r) => {
      invalidateHr();
      toast.success(`Request sent — ${r.days} working day${r.days === 1 ? '' : 's'} of ${r.leaveType.name.toLowerCase()}`);
    },
  });
}

export function useCancelMyLeave() {
  return useMutation({
    mutationFn: (id: string) => api.post<LeaveRequestRow>(`/hr/me/leave/${id}/cancel`),
    onSuccess: () => {
      invalidateHr();
      toast.success('Leave request cancelled');
    },
  });
}

export function useMyPayslip(id: string | undefined) {
  return useQuery({
    queryKey: hk.myPayslip(id ?? ''),
    queryFn: ({ signal }) => api.get<PayslipView>(`/hr/me/payslips/${id}`, undefined, signal),
    enabled: !!id,
  });
}

// ------------------------------------------------------------------ payroll settings

export function usePayrollSettings(enabled = true) {
  const can = useCan('payroll.read');
  return useQuery({
    queryKey: pk.settings,
    queryFn: ({ signal }) => api.get<PayrollSettingsView>('/payroll/settings', undefined, signal),
    enabled: enabled && can,
    staleTime: 5 * 60_000,
  });
}

export function useSavePayrollSettings() {
  return useMutation({
    mutationFn: (input: HrSettings) => api.put<HrSettings>('/payroll/settings', input),
    meta: { silent: true },
    onSuccess: () => {
      invalidatePayroll();
      toast.success('Payroll settings saved');
    },
  });
}

// ------------------------------------------------------------------ grades & profiles

export function useGrades(enabled = true) {
  const can = useCan('payroll.read');
  return useQuery({
    queryKey: pk.grades,
    queryFn: ({ signal }) => api.get<SalaryGradeRow[]>('/payroll/grades', undefined, signal),
    enabled: enabled && can,
  });
}

export function useSaveGrade(id?: string) {
  return useMutation({
    mutationFn: (input: SalaryGradeInput) => (id ? api.put<unknown>(`/payroll/grades/${id}`, input) : api.post<unknown>('/payroll/grades', input)),
    meta: { silent: true },
    onSuccess: () => {
      invalidatePayroll();
      toast.success(id ? 'Salary grade updated' : 'Salary grade added');
    },
  });
}

export function useApplyGrade() {
  return useMutation({
    mutationFn: (id: string) => api.post<{ updated: number }>(`/payroll/grades/${id}/apply`),
    onSuccess: (r) => {
      invalidatePayroll();
      toast.success(`Updated pay for ${r.updated} staff`);
    },
  });
}

export function useDeleteGrade() {
  return useMutation({
    mutationFn: (id: string) => api.delete(`/payroll/grades/${id}`),
    onSuccess: () => {
      invalidatePayroll();
      toast.success('Salary grade deleted');
    },
  });
}

export function usePayProfiles(enabled = true) {
  const can = useCan('payroll.read');
  return useQuery({
    queryKey: pk.profiles,
    queryFn: ({ signal }) => api.get<PayProfileRow[]>('/payroll/profiles', undefined, signal),
    enabled: enabled && can,
  });
}

export function useSavePayProfile(staffId: string) {
  return useMutation({
    mutationFn: (input: PayProfileInput) => api.put<EmployeeDetail>(`/payroll/profiles/${staffId}`, input),
    meta: { silent: true },
    onSuccess: (d) => {
      queryClient.setQueryData(hk.employee(d.id), d);
      invalidatePayroll();
      toast.success(`Pay details saved for ${d.name}`);
    },
  });
}

// ------------------------------------------------------------------ runs

export function usePayrollRuns(enabled = true) {
  const can = useCan('payroll.read');
  return useQuery({
    queryKey: pk.runs,
    queryFn: ({ signal }) => api.get<PayrollRunRow[]>('/payroll/runs', undefined, signal),
    enabled: enabled && can,
  });
}

export function usePayrollRun(id: string | undefined) {
  return useQuery({
    queryKey: pk.run(id ?? ''),
    queryFn: ({ signal }) => api.get<PayrollRunDetail>(`/payroll/runs/${id}`, undefined, signal),
    enabled: !!id,
  });
}

function onRun(d: PayrollRunDetail) {
  queryClient.setQueryData(pk.run(d.id), d);
  void queryClient.invalidateQueries({ queryKey: pk.runs });
  void queryClient.invalidateQueries({ queryKey: hk.overview });
}

export function useCreateRun() {
  return useMutation({
    mutationFn: (input: { period: string; note?: string | null }) => api.post<PayrollRunDetail>('/payroll/runs', input),
    meta: { silent: true },
    onSuccess: (d) => {
      onRun(d);
      toast.success(`Payroll for ${d.label} prepared — ${d.staffCount} payslips`);
    },
  });
}

export function useRunAction(id: string, action: 'recalculate' | 'approve' | 'reopen') {
  const done = { recalculate: 'Payroll recalculated from current pay details', approve: 'Payroll approved — ready to pay', reopen: 'Payroll reopened as a draft' }[action];
  return useMutation({
    mutationFn: () => api.post<PayrollRunDetail>(`/payroll/runs/${id}/${action}`),
    onSuccess: (d) => {
      onRun(d);
      toast.success(done);
    },
  });
}

export function useDeleteRun() {
  return useMutation({
    mutationFn: (id: string) => api.delete(`/payroll/runs/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pk.all });
      void queryClient.invalidateQueries({ queryKey: hk.overview });
      toast.success('Draft payroll deleted');
    },
  });
}

export function useMarkPaid(id: string) {
  return useMutation({
    mutationFn: (input: { paidOn: string; method: string; reference: string | null }) => api.post<PayrollRunDetail>(`/payroll/runs/${id}/paid`, input),
    meta: { silent: true },
    onSuccess: (d) => {
      onRun(d);
      void queryClient.invalidateQueries({ queryKey: ['finance'] });
      toast.success(`${d.label} payroll marked paid — salaries recorded under Expenses`);
    },
  });
}

export function useSetAdjustments(runId: string) {
  return useMutation({
    mutationFn: ({ payslipId, adjustments }: { payslipId: string; adjustments: PayAdjustment[] }) =>
      api.put<PayrollRunDetail>(`/payroll/payslips/${payslipId}/adjustments`, { adjustments }),
    meta: { silent: true },
    onSuccess: (d) => {
      if (d.id === runId) onRun(d);
    },
  });
}

export function usePayslip(id: string | undefined) {
  return useQuery({
    queryKey: pk.payslip(id ?? ''),
    queryFn: ({ signal }) => api.get<PayslipView>(`/payroll/payslips/${id}`, undefined, signal),
    enabled: !!id,
  });
}

export function useRunReview() {
  return useMutation({
    mutationFn: (runId: string) => api.post<AiText>(`/payroll/runs/${runId}/review`),
    meta: { silent: true },
    onError: (err) => toast.error(aiErrorMessage(err)),
  });
}

/** Fetches the bank schedule CSV and saves it as a file. */
export async function downloadBankSchedule(runId: string) {
  const r = await api.get<{ filename: string; csv: string }>(`/payroll/runs/${runId}/bank-schedule`);
  const blob = new Blob([r.csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = r.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return r.filename;
}
