import type {
  DiscountKind,
  DiscountPreview,
  DiscountReport,
  DiscountRules,
  ReapplyResult,
  StudentDiscountInput,
  StudentDiscountRow,
  StudentDiscountSummary,
} from '@aischool/shared';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { queryClient } from '@/lib/query-client';
import { saveTextFile } from '../onboarding/api';
import { fk, invalidateFinance } from './api';

export interface DiscountListParams {
  studentId?: string;
  kind?: DiscountKind;
  active?: 'true' | 'false';
  q?: string;
}

/** Everything lives under ['finance', 'discounts'] so finance-wide invalidation covers it. */
export const dk = {
  all: ['finance', 'discounts'] as const,
  list: (p: DiscountListParams) => ['finance', 'discounts', 'list', p] as const,
  rules: ['finance', 'discounts', 'rules'] as const,
  student: (id: string) => ['finance', 'discounts', 'student', id] as const,
  report: (termId?: string) => ['finance', 'discounts', 'report', termId ?? null] as const,
  preview: (input: { termId: string; classLevelIds: string[]; siblingDiscountPct?: number }) => ['finance', 'discounts', 'preview', input] as const,
};

export function useDiscounts(params: DiscountListParams, enabled = true) {
  const can = useCan('finance.read');
  return useQuery({
    queryKey: dk.list(params),
    queryFn: ({ signal }) => api.get<StudentDiscountRow[]>('/finance/discounts', { ...params }, signal),
    enabled: enabled && can,
    placeholderData: keepPreviousData,
  });
}

export function useStudentDiscounts(studentId: string | undefined) {
  const can = useCan('finance.read');
  return useQuery({
    queryKey: dk.student(studentId ?? ''),
    queryFn: ({ signal }) => api.get<StudentDiscountSummary>(`/finance/discounts/student/${studentId}`, undefined, signal),
    enabled: !!studentId && can,
  });
}

export function useSaveDiscount(id?: string) {
  return useMutation({
    mutationFn: (input: StudentDiscountInput & { studentIds?: string[] }): Promise<StudentDiscountRow | StudentDiscountRow[]> =>
      id ? api.put<StudentDiscountRow>(`/finance/discounts/${id}`, input) : api.post<StudentDiscountRow[]>('/finance/discounts', input),
    meta: { silent: true },
    onSuccess: (r) => {
      void queryClient.invalidateQueries({ queryKey: dk.all });
      const n = Array.isArray(r) ? r.length : 1;
      toast.success(id ? 'Discount updated' : n > 1 ? `Discount added for ${n} students` : 'Discount added');
    },
  });
}

export function useToggleDiscount() {
  return useMutation({
    mutationFn: (d: StudentDiscountRow) =>
      api.put<StudentDiscountRow>(`/finance/discounts/${d.id}`, {
        studentId: d.student.id,
        kind: d.kind,
        label: d.label,
        percent: d.percent,
        amountKobo: d.amountKobo,
        appliesTo: d.appliesTo,
        fromTermId: d.fromTerm?.id ?? null,
        untilTermId: d.untilTerm?.id ?? null,
        active: !d.active,
        note: d.note,
      }),
    onSuccess: (d) => {
      void queryClient.invalidateQueries({ queryKey: dk.all });
      toast.success(d.active ? 'Discount switched back on' : 'Discount stopped — new invoices won’t include it');
    },
  });
}

export function useDeleteDiscount() {
  return useMutation({
    mutationFn: (id: string) => api.delete(`/finance/discounts/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: dk.all });
      toast.success('Discount removed');
    },
  });
}

export function useDiscountRules(enabled = true) {
  const can = useCan('finance.read');
  return useQuery({
    queryKey: dk.rules,
    queryFn: ({ signal }) => api.get<DiscountRules>('/finance/discounts/rules', undefined, signal),
    enabled: enabled && can,
  });
}

export function useSaveDiscountRules() {
  return useMutation({
    mutationFn: (rules: DiscountRules) => api.put<DiscountRules>('/finance/discounts/rules', rules),
    meta: { silent: true },
    onSuccess: (r) => {
      queryClient.setQueryData(dk.rules, r);
      void queryClient.invalidateQueries({ queryKey: fk.settings });
      void queryClient.invalidateQueries({ queryKey: dk.all });
      toast.success('Discount rules saved — they apply to invoices you issue from now on');
    },
  });
}

export function useDiscountPreview(input: { termId: string | undefined; classLevelIds: string[]; siblingDiscountPct?: number }, enabled = true) {
  const can = useCan('finance.read');
  return useQuery({
    queryKey: dk.preview({ termId: input.termId ?? '', classLevelIds: input.classLevelIds, siblingDiscountPct: input.siblingDiscountPct }),
    queryFn: ({ signal }) => api.post<DiscountPreview>('/finance/discounts/preview', input, { signal }),
    enabled: enabled && can && !!input.termId,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
}

export function useDiscountReport(termId: string | undefined, enabled = true) {
  const can = useCan('finance.read');
  return useQuery({
    queryKey: dk.report(termId),
    queryFn: ({ signal }) => api.get<DiscountReport>('/finance/discounts/report', { termId }, signal),
    enabled: enabled && can && !!termId,
    placeholderData: keepPreviousData,
  });
}

export function useReapplyDiscounts() {
  return useMutation({
    mutationFn: (input: { termId: string; dryRun: boolean }) => api.post<ReapplyResult>('/finance/discounts/reapply', input),
    onSuccess: (r) => {
      if (!r.dryRun) {
        invalidateFinance();
        toast.success(r.changed.length ? `Discounts updated on ${r.changed.length} unpaid invoice${r.changed.length === 1 ? '' : 's'}` : 'Every unpaid invoice was already up to date');
      }
    },
  });
}

export async function downloadDiscountReport(termId: string, termName: string) {
  const csv = await api.text(`/finance/discounts/report.csv?termId=${encodeURIComponent(termId)}`);
  saveTextFile(csv, `discounts-${termName.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'term'}.csv`);
}
