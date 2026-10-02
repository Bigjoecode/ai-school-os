import {
  formatMoney,
  type ApiUsageReport,
  type DomainRow,
  type FeatureFlagRow,
  type PlanInput,
  type PlanRow,
  type PlatformAiUsageReport,
  type PlatformAuditRow,
  type PlatformBriefing,
  type PlatformInvoiceRow,
  type PlatformInvoiceStatus,
  type PlatformOverview,
  type PlatformPaymentRow,
  type PlatformRole,
  type PlatformSchoolRow,
  type StudentUsageReport,
  type SubscriptionRow,
  type SubscriptionUpdateInput,
  type SystemHealth,
  type TenantFeatureState,
  type TenantStatusKey,
  type TicketAssist,
  type TicketCategory,
  type TicketDetail,
  type TicketPriority,
  type TicketRow,
  type TicketStatus,
} from '@aischool/shared';
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/query-client';

// ------------------------------------------------------------------ shapes the shared package doesn't name

export interface SchoolDetail extends Omit<PlatformSchoolRow, 'branches'> {
  shortName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  country: string;
  currency: string;
  timezone: string;
  aiMonthlyBudgetUsd: number | null;
  defaultAiBudgetUsd: number;
  planId: string | null;
  counts: { classes: number; guardians: number; subjects: number; feeInvoices: number; aiCalls30d: number };
  admins: { id: string; name: string; email: string; roles: string[]; lastLoginAt: string | null }[];
  branches: { id: string; name: string; code: string | null; isMain: boolean; students: number }[];
  unassignedStudents: number;
  domains: { id: string; hostname: string; kind: 'PORTAL' | 'WEBSITE'; isPrimary: boolean; verifiedAt: string | null }[];
  apiDaily: { day: string; requests: number; serverErrors: number }[];
  subscription: SubscriptionRow | null;
  invoices: PlatformInvoiceRow[];
  tickets: { id: string; number: number; subject: string; status: TicketStatus; priority: TicketPriority; lastMessageAt: string }[];
  features: TenantFeatureState[];
  audit: { id: string; action: string; summary: string; actor: string | null; createdAt: string }[];
}

export interface BranchRow {
  id: string;
  name: string;
  code: string | null;
  isMain: boolean;
  address: string | null;
  tenant: { id: string; name: string; slug: string; status: TenantStatusKey };
  students: number;
  classes: number;
  createdAt: string;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  platformRole: PlatformRole;
  status: string;
  lastLoginAt: string | null;
  isYou: boolean;
}

export interface DomainVerifyResult {
  verified: boolean;
  detail: string;
  target: string;
}

export interface BillingRunResult {
  renewed: number;
  invoiced: number;
  pastDue: number;
  cancelled: number;
}

export interface SchoolUpdateInput {
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  aiMonthlyBudgetUsd: number | null;
  trialEndsAt: string | null;
}

export interface AuditFilters {
  scope: 'all' | 'platform' | 'schools';
  tenantId?: string;
  action?: string;
  actor?: string;
  from?: string;
  to?: string;
}

export interface TicketFilters {
  status: TicketStatus | 'ACTIVE';
  priority?: TicketPriority;
  tenantId?: string;
  mine?: boolean;
}

// ------------------------------------------------------------------ formatting

export function naira(kobo: number | null | undefined): string {
  if (kobo == null || Number.isNaN(kobo)) return '—';
  return formatMoney(kobo, 'NGN');
}

/** ₦1.2M — for KPI headlines and chart axes. */
export function nairaCompact(kobo: number): string {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', notation: 'compact', maximumFractionDigits: 1 }).format(kobo / 100);
}

export function usd(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

/** "2026-03" → "Mar" (or "Mar 2026"). */
export function monthShort(month: string, withYear = false): string {
  const [y, m] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { month: 'short', ...(withYear ? { year: 'numeric' } : {}) }).format(new Date(y, m - 1, 1));
}

// ------------------------------------------------------------------ keys

export const pk = {
  all: ['platform'] as const,
  overview: ['platform', 'overview'] as const,
  schools: ['platform', 'schools'] as const,
  school: (id: string) => ['platform', 'school', id] as const,
  branches: ['platform', 'branches'] as const,
  plans: ['platform', 'plans'] as const,
  team: ['platform', 'team'] as const,
  subscriptions: ['platform', 'subscriptions'] as const,
  invoices: (status?: string) => ['platform', 'invoices', status ?? 'ALL'] as const,
  payments: ['platform', 'payments'] as const,
  aiUsage: (month: string) => ['platform', 'usage', 'ai', month] as const,
  apiUsage: (days: number) => ['platform', 'usage', 'api', days] as const,
  studentUsage: ['platform', 'usage', 'students'] as const,
  domains: ['platform', 'domains'] as const,
  flags: ['platform', 'flags'] as const,
  flagPreview: (key: string, percent: number) => ['platform', 'flags', key, 'preview', percent] as const,
  audit: (f: AuditFilters) => ['platform', 'audit', f] as const,
  health: ['platform', 'health'] as const,
  tickets: (f: TicketFilters) => ['platform', 'tickets', f] as const,
  ticket: (id: string) => ['platform', 'ticket', id] as const,
};

/** Most console writes touch several views; refresh the whole console. */
export function invalidatePlatform() {
  return queryClient.invalidateQueries({ queryKey: pk.all });
}

// ------------------------------------------------------------------ reads

export const usePlatformOverview = () =>
  useQuery({ queryKey: pk.overview, queryFn: ({ signal }) => api.get<PlatformOverview>('/platform/overview', undefined, signal) });

export const useSchools = () =>
  useQuery({ queryKey: pk.schools, queryFn: ({ signal }) => api.get<PlatformSchoolRow[]>('/platform/schools', undefined, signal) });

export const useSchool = (id: string) =>
  useQuery({ queryKey: pk.school(id), queryFn: ({ signal }) => api.get<SchoolDetail>(`/platform/schools/${id}`, undefined, signal) });

export const useBranches = () =>
  useQuery({ queryKey: pk.branches, queryFn: ({ signal }) => api.get<BranchRow[]>('/platform/branches', undefined, signal) });

export const usePlans = (enabled = true) =>
  useQuery({ queryKey: pk.plans, queryFn: ({ signal }) => api.get<PlanRow[]>('/platform/plans', undefined, signal), enabled });

export const useTeam = (enabled = true) =>
  useQuery({ queryKey: pk.team, queryFn: ({ signal }) => api.get<TeamMember[]>('/platform/team', undefined, signal), enabled, staleTime: 5 * 60_000 });

export const useSubscriptions = () =>
  useQuery({ queryKey: pk.subscriptions, queryFn: ({ signal }) => api.get<SubscriptionRow[]>('/platform/subscriptions', undefined, signal) });

export const usePlatformInvoices = (status?: PlatformInvoiceStatus | 'OVERDUE') =>
  useQuery({
    queryKey: pk.invoices(status),
    queryFn: ({ signal }) => api.get<PlatformInvoiceRow[]>('/platform/invoices', { status }, signal),
    placeholderData: keepPreviousData,
  });

export const usePlatformPayments = () =>
  useQuery({ queryKey: pk.payments, queryFn: ({ signal }) => api.get<PlatformPaymentRow[]>('/platform/payments', undefined, signal) });

export const usePlatformAiUsage = (month: string) =>
  useQuery({
    queryKey: pk.aiUsage(month),
    queryFn: ({ signal }) => api.get<PlatformAiUsageReport>('/platform/usage/ai', { month }, signal),
    placeholderData: keepPreviousData,
  });

export const useApiUsage = (days: number) =>
  useQuery({
    queryKey: pk.apiUsage(days),
    queryFn: ({ signal }) => api.get<ApiUsageReport>('/platform/usage/api', { days }, signal),
    placeholderData: keepPreviousData,
  });

export const useStudentUsage = () =>
  useQuery({ queryKey: pk.studentUsage, queryFn: ({ signal }) => api.get<StudentUsageReport>('/platform/usage/students', undefined, signal) });

export const useDomains = () =>
  useQuery({ queryKey: pk.domains, queryFn: ({ signal }) => api.get<{ target: string; rows: DomainRow[] }>('/platform/domains', undefined, signal) });

export const useFlags = () =>
  useQuery({ queryKey: pk.flags, queryFn: ({ signal }) => api.get<FeatureFlagRow[]>('/platform/flags', undefined, signal) });

export const useFlagPreview = (key: string | null, percent: number) =>
  useQuery({
    queryKey: pk.flagPreview(key ?? '', percent),
    queryFn: ({ signal }) => api.get<{ id: string; name: string; included: boolean }[]>(`/platform/flags/${key}/preview`, { percent }, signal),
    enabled: !!key,
    placeholderData: keepPreviousData,
  });

export const usePlatformAudit = (filters: AuditFilters) =>
  useInfiniteQuery({
    queryKey: pk.audit(filters),
    queryFn: ({ pageParam, signal }) =>
      api.get<{ rows: PlatformAuditRow[]; nextCursor: string | null }>('/platform/audit', { ...filters, cursor: pageParam, limit: 50 }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });

export const useHealth = () =>
  useQuery({
    queryKey: pk.health,
    queryFn: ({ signal }) => api.get<SystemHealth>('/platform/health', undefined, signal),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });

export const usePlatformTickets = (filters: TicketFilters) =>
  useQuery({
    queryKey: pk.tickets(filters),
    queryFn: ({ signal }) =>
      api.get<TicketRow[]>('/platform/support/tickets', { status: filters.status, priority: filters.priority, tenantId: filters.tenantId, mine: filters.mine || undefined }, signal),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });

export const usePlatformTicket = (id: string) =>
  useQuery({ queryKey: pk.ticket(id), queryFn: ({ signal }) => api.get<TicketDetail>(`/platform/support/tickets/${id}`, undefined, signal) });

// ------------------------------------------------------------------ writes

const after = () => void invalidatePlatform();

export const useBriefing = () =>
  useMutation({ mutationFn: () => api.post<PlatformBriefing>('/platform/ai/briefing') });

export const useUpdateSchool = (id: string) =>
  useMutation({ mutationFn: (body: SchoolUpdateInput) => api.put(`/platform/schools/${id}`, body), onSuccess: after, meta: { silent: true } });

export const useSetSchoolStatus = (id: string) =>
  useMutation({ mutationFn: (body: { status: TenantStatusKey; reason: string }) => api.post(`/platform/schools/${id}/status`, body), onSuccess: after });

export const useChangePlan = (id: string) =>
  useMutation({ mutationFn: (planId: string) => api.post(`/platform/schools/${id}/plan`, { planId }), onSuccess: after });

export const useSetFeature = (tenantId: string) =>
  useMutation({
    mutationFn: ({ key, enabled, note }: { key: string; enabled: boolean | null; note?: string | null }) =>
      api.put<TenantFeatureState[]>(`/platform/schools/${tenantId}/features/${key}`, { enabled, note: note ?? null }),
    onSuccess: after,
  });

export const useSavePlan = () =>
  useMutation({
    mutationFn: ({ id, body }: { id?: string; body: PlanInput }) => (id ? api.put(`/platform/plans/${id}`, body) : api.post('/platform/plans', body)),
    onSuccess: after,
    meta: { silent: true },
  });

export const useDeletePlan = () => useMutation({ mutationFn: (id: string) => api.delete(`/platform/plans/${id}`), onSuccess: after });

export const useUpdateSubscription = () =>
  useMutation({
    mutationFn: ({ id, body }: { id: string; body: SubscriptionUpdateInput }) => api.put(`/platform/subscriptions/${id}`, body),
    onSuccess: after,
    meta: { silent: true },
  });

export const useInvoiceNow = () =>
  useMutation({ mutationFn: (id: string) => api.post<{ id: string; number: string }>(`/platform/subscriptions/${id}/invoice`), onSuccess: after });

export const useRunBilling = () => useMutation({ mutationFn: () => api.post<BillingRunResult>('/platform/billing/run'), onSuccess: after });

export const useCreateInvoice = () =>
  useMutation({
    mutationFn: (body: { tenantId: string; description: string; amountKobo: number; dueDate: string; notes: string | null }) =>
      api.post<{ id: string; number: string }>('/platform/invoices', body),
    onSuccess: after,
    meta: { silent: true },
  });

export const useVoidInvoice = () =>
  useMutation({ mutationFn: ({ id, reason }: { id: string; reason: string }) => api.post(`/platform/invoices/${id}/void`, { reason }), onSuccess: after });

export const useRecordPayment = () =>
  useMutation({
    mutationFn: ({ invoiceId, body }: { invoiceId: string; body: { amountKobo: number; method: 'BANK_TRANSFER' | 'CASH' | 'OTHER'; reference: string; paidOn: string; note: string | null } }) =>
      api.post(`/platform/invoices/${invoiceId}/payments`, body),
    onSuccess: after,
    meta: { silent: true },
  });

export const useVerifyPayment = () =>
  useMutation({
    mutationFn: (reference: string) => api.post<{ status: 'PENDING' | 'SUCCESS' | 'FAILED'; invoiceId: string }>(`/platform/payments/${encodeURIComponent(reference)}/verify`),
    onSuccess: after,
  });

export const useAddDomain = () =>
  useMutation({
    mutationFn: (body: { tenantId: string; hostname: string; kind: 'PORTAL' | 'WEBSITE'; isPrimary: boolean }) => api.post('/platform/domains', body),
    onSuccess: after,
    meta: { silent: true },
  });

export const useRemoveDomain = () => useMutation({ mutationFn: (id: string) => api.delete(`/platform/domains/${id}`), onSuccess: after });

export const useVerifyDomain = () =>
  useMutation({ mutationFn: (id: string) => api.post<DomainVerifyResult>(`/platform/domains/${id}/verify`), onSuccess: after });

export interface FlagBody {
  name: string;
  description: string | null;
  enabled: boolean;
  rolloutPercent: number;
}

export const useCreateFlag = () =>
  useMutation({ mutationFn: (body: FlagBody & { key: string }) => api.post('/platform/flags', body), onSuccess: after, meta: { silent: true } });

export const useUpdateFlag = () =>
  useMutation({ mutationFn: ({ key, body }: { key: string; body: FlagBody }) => api.put(`/platform/flags/${key}`, body), onSuccess: after });

export const useDeleteFlag = () => useMutation({ mutationFn: (key: string) => api.delete(`/platform/flags/${key}`), onSuccess: after });

export const useTicketReply = (id: string) =>
  useMutation({
    mutationFn: (body: { body: string; internal: boolean; status?: TicketStatus }) => api.post<TicketDetail>(`/platform/support/tickets/${id}/reply`, body),
    onSuccess: (t) => {
      queryClient.setQueryData(pk.ticket(id), t);
      void queryClient.invalidateQueries({ queryKey: ['platform', 'tickets'] });
      void queryClient.invalidateQueries({ queryKey: pk.overview });
    },
  });

export const useTicketUpdate = (id: string) =>
  useMutation({
    mutationFn: (body: { status?: TicketStatus; priority?: TicketPriority; category?: TicketCategory; assignedToId?: string | null }) =>
      api.put<TicketDetail>(`/platform/support/tickets/${id}`, body),
    onSuccess: (t) => {
      queryClient.setQueryData(pk.ticket(id), t);
      void queryClient.invalidateQueries({ queryKey: ['platform', 'tickets'] });
      void queryClient.invalidateQueries({ queryKey: pk.overview });
    },
  });

export const useTicketAssist = (id: string) => useMutation({ mutationFn: () => api.post<TicketAssist>(`/platform/support/tickets/${id}/assist`) });
