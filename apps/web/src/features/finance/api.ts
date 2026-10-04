import type {
  ExpenseInput,
  ExpenseRow,
  FeeItemInput,
  FeeItemRow,
  FeeReminder,
  FinanceOverview,
  FinanceSettings,
  FinanceSettingsInput,
  GenerateInvoicesInput,
  GenerateInvoicesResult,
  InvoiceDetail,
  InvoiceLineInput,
  InvoiceRow,
  OnlinePaymentResult,
  OnlinePaymentStart,
  Paginated,
  PaymentMethod,
  PaymentRow,
  PaystackStatus,
  PublicInvoice,
  ReceiptView,
  RecordPaymentInput,
} from '@aischool/shared';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError, errorMessage, request } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { qk, queryClient } from '@/lib/query-client';

/** Friendly copy for AI failures — a 503 means no provider is configured. */
export function aiErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.status === 503) return 'AI isn’t connected yet — add an API key on the server to use this.';
  return errorMessage(err);
}

export interface AiText {
  text: string;
  provider: string;
  model: string;
}

export type FinanceSettingsView = FinanceSettings & { currency: string; timezone: string };

export type InvoiceStatusFilter = 'ISSUED' | 'PART_PAID' | 'PAID' | 'CANCELLED' | 'OUTSTANDING' | 'OVERDUE';

export interface InvoiceListParams {
  termId?: string;
  classArmId?: string;
  status?: InvoiceStatusFilter;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface PaymentListParams {
  from?: string;
  to?: string;
  method?: PaymentMethod;
  page?: number;
  pageSize?: number;
}

export interface ExpenseListParams {
  from?: string;
  to?: string;
  category?: ExpenseRow['category'];
}

/** Query keys — everything finance lives under ['finance']. */
export const fk = {
  all: ['finance'] as const,
  settings: ['finance', 'settings'] as const,
  paystack: ['finance', 'paystack'] as const,
  overview: (termId?: string) => ['finance', 'overview', termId ?? null] as const,
  fees: (termId: string) => ['finance', 'fees', termId] as const,
  invoices: (params: InvoiceListParams) => ['finance', 'invoices', params] as const,
  invoice: (id: string) => ['finance', 'invoice', id] as const,
  payments: (params: PaymentListParams) => ['finance', 'payments', params] as const,
  receipt: (id: string) => ['finance', 'receipt', id] as const,
  expenses: (params: ExpenseListParams) => ['finance', 'expenses', params] as const,
};

/** Money moved: refresh every finance view plus the dashboard. */
export function invalidateFinance() {
  void queryClient.invalidateQueries({ queryKey: fk.all });
  void queryClient.invalidateQueries({ queryKey: qk.overview });
}

// ------------------------------------------------------------------ settings

export function useFinanceSettings(enabled = true) {
  const can = useCan('finance.read');
  return useQuery({
    queryKey: fk.settings,
    queryFn: ({ signal }) => api.get<FinanceSettingsView>('/finance/settings', undefined, signal),
    enabled: enabled && can,
    staleTime: 5 * 60_000,
  });
}

export function useSaveFinanceSettings() {
  return useMutation({
    mutationFn: (input: FinanceSettingsInput) => api.put<FinanceSettingsView>('/finance/settings', input),
    meta: { silent: true },
    onSuccess: (s) => {
      queryClient.setQueryData(fk.settings, s);
      toast.success('Finance settings saved');
    },
  });
}

export function usePaystack(enabled = true) {
  const can = useCan('finance.read');
  return useQuery({
    queryKey: fk.paystack,
    queryFn: ({ signal }) => api.get<PaystackStatus>('/finance/paystack', undefined, signal),
    enabled: enabled && can,
    staleTime: 60_000,
  });
}

export function useConnectPaystack() {
  return useMutation({
    mutationFn: (input: { publicKey: string; secretKey: string }) => api.put<PaystackStatus>('/finance/paystack', input),
    meta: { silent: true },
    onSuccess: (s) => {
      queryClient.setQueryData(fk.paystack, s);
      invalidateFinance();
      toast.success(`Paystack connected (${s.isLive ? 'live' : 'test'} keys)`);
    },
  });
}

export function useDisconnectPaystack() {
  return useMutation({
    mutationFn: () => api.delete('/finance/paystack'),
    onSuccess: () => {
      invalidateFinance();
      toast.success('Paystack disconnected — online payment links are now off');
    },
  });
}

// ------------------------------------------------------------------ overview

export function useFinanceOverview(termId?: string, enabled = true) {
  const can = useCan('finance.read');
  return useQuery({
    queryKey: fk.overview(termId),
    queryFn: ({ signal }) => api.get<FinanceOverview>('/finance/overview', { termId }, signal),
    enabled: enabled && can,
    placeholderData: keepPreviousData,
  });
}

export function useFinanceInsight() {
  return useMutation({
    mutationFn: (termId?: string) => api.post<AiText>('/finance/insight', { termId }),
    meta: { silent: true },
    onError: (err) => toast.error(aiErrorMessage(err)),
  });
}

export function useFeeReminder() {
  return useMutation({
    mutationFn: (invoiceId: string) => api.post<FeeReminder>('/finance/reminder', { invoiceId }),
    meta: { silent: true },
  });
}

// ------------------------------------------------------------------ fee schedule

export function useFees(termId: string | undefined) {
  return useQuery({
    queryKey: fk.fees(termId ?? ''),
    queryFn: ({ signal }) => api.get<FeeItemRow[]>('/finance/fees', { termId }, signal),
    enabled: !!termId,
    placeholderData: keepPreviousData,
  });
}

export function useSaveFee(id?: string) {
  return useMutation({
    mutationFn: (input: FeeItemInput) => (id ? api.put<unknown>(`/finance/fees/${id}`, input) : api.post<unknown>('/finance/fees', input)),
    meta: { silent: true },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['finance', 'fees'] });
      toast.success(id ? 'Fee item updated' : 'Fee item added');
    },
  });
}

export function useDeleteFee() {
  return useMutation({
    mutationFn: (id: string) => api.delete(`/finance/fees/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['finance', 'fees'] });
      toast.success('Fee item deleted');
    },
  });
}

export function useCopyFees() {
  return useMutation({
    mutationFn: (input: { fromTermId: string; toTermId: string }) => api.post<{ copied: number }>('/finance/fees/copy', input),
    onSuccess: (r) => {
      void queryClient.invalidateQueries({ queryKey: ['finance', 'fees'] });
      toast.success(`Copied ${r.copied} fee ${r.copied === 1 ? 'item' : 'items'}`);
    },
  });
}

export function useGenerateInvoices() {
  return useMutation({
    mutationFn: (input: GenerateInvoicesInput) => api.post<GenerateInvoicesResult>('/finance/invoices/generate', input),
    onSuccess: () => invalidateFinance(),
  });
}

// ------------------------------------------------------------------ invoices

export function useInvoices(params: InvoiceListParams, enabled = true) {
  const can = useCan('finance.read');
  return useQuery({
    queryKey: fk.invoices(params),
    queryFn: ({ signal }) => api.get<Paginated<InvoiceRow>>('/finance/invoices', { ...params }, signal),
    enabled: enabled && can,
    placeholderData: keepPreviousData,
  });
}

export function useInvoice(id: string | undefined) {
  return useQuery({
    queryKey: fk.invoice(id ?? ''),
    queryFn: ({ signal }) => api.get<InvoiceDetail>(`/finance/invoices/${id}`, undefined, signal),
    enabled: !!id,
  });
}

function onInvoice(detail: InvoiceDetail) {
  queryClient.setQueryData(fk.invoice(detail.id), detail);
  invalidateFinance();
}

export function useAddLine(invoiceId: string) {
  return useMutation({
    mutationFn: (input: InvoiceLineInput) => api.post<InvoiceDetail>(`/finance/invoices/${invoiceId}/lines`, input),
    meta: { silent: true },
    onSuccess: (d) => {
      onInvoice(d);
      toast.success('Line added');
    },
  });
}

export function useRemoveLine(invoiceId: string) {
  return useMutation({
    mutationFn: (lineId: string) => api.delete<InvoiceDetail>(`/finance/invoices/${invoiceId}/lines/${lineId}`),
    onSuccess: (d) => {
      onInvoice(d);
      toast.success('Line removed');
    },
  });
}

export function useCancelInvoice(invoiceId: string) {
  return useMutation({
    mutationFn: (reason: string) => api.post<InvoiceDetail>(`/finance/invoices/${invoiceId}/cancel`, { reason }),
    onSuccess: (d) => {
      onInvoice(d);
      toast.success(`Invoice ${d.number} cancelled`);
    },
  });
}

// ------------------------------------------------------------------ payments

export function usePayments(params: PaymentListParams) {
  return useQuery({
    queryKey: fk.payments(params),
    queryFn: ({ signal }) => api.get<Paginated<PaymentRow>>('/finance/payments', { ...params }, signal),
    placeholderData: keepPreviousData,
  });
}

export function useRecordPayment() {
  return useMutation({
    mutationFn: (input: RecordPaymentInput) => api.post<ReceiptView>('/finance/payments', input),
    meta: { silent: true },
    onSuccess: (r) => {
      queryClient.setQueryData(fk.receipt(r.id), r);
      invalidateFinance();
    },
  });
}

export function useReceipt(id: string | undefined) {
  return useQuery({
    queryKey: fk.receipt(id ?? ''),
    queryFn: ({ signal }) => api.get<ReceiptView>(`/finance/payments/${id}/receipt`, undefined, signal),
    enabled: !!id,
  });
}

export function useReversePayment(id: string) {
  return useMutation({
    mutationFn: (reason: string) => api.post<ReceiptView>(`/finance/payments/${id}/reverse`, { reason }),
    onSuccess: (r) => {
      queryClient.setQueryData(fk.receipt(r.id), r);
      invalidateFinance();
      toast.success(`Receipt ${r.receiptNumber ?? ''} reversed`);
    },
  });
}

// ------------------------------------------------------------------ expenses

export function useExpenses(params: ExpenseListParams) {
  return useQuery({
    queryKey: fk.expenses(params),
    queryFn: ({ signal }) => api.get<ExpenseRow[]>('/finance/expenses', { ...params }, signal),
    placeholderData: keepPreviousData,
  });
}

export function useSaveExpense(id?: string) {
  return useMutation({
    mutationFn: (input: ExpenseInput) => (id ? api.put<unknown>(`/finance/expenses/${id}`, input) : api.post<unknown>('/finance/expenses', input)),
    meta: { silent: true },
    onSuccess: () => {
      invalidateFinance();
      toast.success(id ? 'Expense updated' : 'Expense recorded');
    },
  });
}

export function useDeleteExpense() {
  return useMutation({
    mutationFn: (id: string) => api.delete(`/finance/expenses/${id}`),
    onSuccess: () => {
      invalidateFinance();
      toast.success('Expense deleted');
    },
  });
}

// ------------------------------------------------------------------ public (parent) payment link
// These never refresh or clear a session: a 401 here means the *link* expired.

export function usePublicInvoice(token: string | undefined) {
  return useQuery({
    queryKey: ['pay', token ?? ''],
    queryFn: ({ signal }) => request<PublicInvoice>(`/pay/${encodeURIComponent(token ?? '')}`, { signal, noRefresh: true }),
    enabled: !!token,
    staleTime: 15_000,
  });
}

export function startOnlinePayment(input: { token: string; amountKobo: number; email: string; payerName?: string }) {
  return request<OnlinePaymentStart>('/pay/start', { method: 'POST', body: input, noRefresh: true });
}

export function verifyOnlinePayment(token: string, reference: string, signal?: AbortSignal) {
  return request<OnlinePaymentResult>(`/pay/${encodeURIComponent(token)}/verify`, { query: { reference }, signal, noRefresh: true });
}
