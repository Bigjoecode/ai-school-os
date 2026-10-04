import type {
  CouponRow,
  couponSchema,
  EntitlementKey,
  ExamQuestionInput,
  ExamQuestionRow,
  LedgerRow,
  LedgerSummary,
  ProductInput,
  ProductRow,
  SponsorshipRow,
  SyllabusTopicRow,
  UnitEconomics,
} from '@aischool/shared';
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import type { z } from 'zod';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/query-client';

// ------------------------------------------------------------------ shapes the API returns without a shared name

export interface ConsoleFamilySub {
  id: string;
  parent: { id: string; name: string; email: string };
  product: { code: string; name: string; kind: string };
  status: string;
  students: { name: string; school: string }[];
  priceKobo: number;
  currentPeriodEnd: string | null;
  autoRenew: boolean;
  cancelAtPeriodEnd: boolean;
  card: string | null;
  renewalAttempts: number;
  createdAt: string;
}

export interface ConsoleOrder {
  id: string;
  reference: string;
  parent: { name: string; email: string };
  product: string;
  kind: 'NEW' | 'RENEWAL';
  amountKobo: number;
  discountKobo: number;
  feeKobo: number | null;
  couponCode: string | null;
  status: string;
  refundedKobo: number;
  paidAt: string | null;
  createdAt: string;
}

export interface RefundRow {
  id: string;
  sourceType: 'CONSUMER_ORDER' | 'PLATFORM_PAYMENT';
  sourceId: string;
  amountKobo: number;
  reason: string;
  status: 'PENDING' | 'PROCESSED' | 'FAILED';
  providerRef: string | null;
  createdById: string | null;
  createdAt: string;
  processedAt: string | null;
}

export interface QuestionBank {
  rows: ExamQuestionRow[];
  summary: { exam: string; status: string; count: number }[];
}

export type CouponInput = z.infer<typeof couponSchema>;
export interface RefundInput {
  amountKobo: number;
  reason: string;
  revokeAccess: boolean;
}

// ------------------------------------------------------------------ keys

export const ck = {
  all: ['platform', 'commerce'] as const,
  products: ['platform', 'commerce', 'products'] as const,
  coupons: ['platform', 'commerce', 'coupons'] as const,
  subs: ['platform', 'commerce', 'family-subs'] as const,
  orders: ['platform', 'commerce', 'orders'] as const,
  refunds: ['platform', 'commerce', 'refunds'] as const,
  sponsorships: ['platform', 'commerce', 'sponsorships'] as const,
  ledger: (f: object) => ['platform', 'commerce', 'ledger', f] as const,
  summary: (f: object) => ['platform', 'commerce', 'summary', f] as const,
  economics: (f: object) => ['platform', 'commerce', 'economics', f] as const,
  content: ['platform', 'content'] as const,
  questions: (f: object) => ['platform', 'content', 'questions', f] as const,
  topics: ['platform', 'content', 'topics'] as const,
};

const afterCommerce = () => {
  void queryClient.invalidateQueries({ queryKey: ck.all });
  // Refunds of school payments also move the Billing tab.
  void queryClient.invalidateQueries({ queryKey: ['platform', 'payments'] });
};
const afterContent = () => void queryClient.invalidateQueries({ queryKey: ck.content });

// ------------------------------------------------------------------ queries

export const useProducts = () => useQuery({ queryKey: ck.products, queryFn: ({ signal }) => api.get<ProductRow[]>('/platform/products', undefined, signal) });
export const useCoupons = () => useQuery({ queryKey: ck.coupons, queryFn: ({ signal }) => api.get<CouponRow[]>('/platform/coupons', undefined, signal) });
export const useFamilySubs = () => useQuery({ queryKey: ck.subs, queryFn: ({ signal }) => api.get<ConsoleFamilySub[]>('/platform/family-subscriptions', undefined, signal) });
export const useOrders = () => useQuery({ queryKey: ck.orders, queryFn: ({ signal }) => api.get<ConsoleOrder[]>('/platform/orders', undefined, signal) });
export const useRefunds = () => useQuery({ queryKey: ck.refunds, queryFn: ({ signal }) => api.get<RefundRow[]>('/platform/refunds', undefined, signal) });
export const useAllSponsorships = () => useQuery({ queryKey: ck.sponsorships, queryFn: ({ signal }) => api.get<SponsorshipRow[]>('/platform/sponsorships', undefined, signal) });

export const useLedgerSummary = (range: { from?: string; to?: string }) =>
  useQuery({ queryKey: ck.summary(range), queryFn: ({ signal }) => api.get<LedgerSummary>('/platform/ledger/summary', range, signal), placeholderData: keepPreviousData });

export const useLedger = (filters: { account?: string; domain?: string }) =>
  useInfiniteQuery({
    queryKey: ck.ledger(filters),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => api.get<{ rows: LedgerRow[]; nextCursor: string | null }>('/platform/ledger', { ...filters, cursor: pageParam, limit: 50 }, signal),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

export const useUnitEconomics = (range: { from?: string; to?: string }) =>
  useQuery({ queryKey: ck.economics(range), queryFn: ({ signal }) => api.get<UnitEconomics>('/platform/unit-economics', range, signal), placeholderData: keepPreviousData });

export const useQuestions = (f: { exam?: string; subject?: string; status?: string; q?: string; type?: string }) =>
  useQuery({ queryKey: ck.questions(f), queryFn: ({ signal }) => api.get<QuestionBank>('/platform/content/questions', f, signal), placeholderData: keepPreviousData });

export const useTopics = () => useQuery({ queryKey: ck.topics, queryFn: ({ signal }) => api.get<SyllabusTopicRow[]>('/platform/content/topics', undefined, signal), staleTime: 60_000 });

// ------------------------------------------------------------------ mutations

export const useSaveProduct = () =>
  useMutation({ mutationFn: ({ id, body }: { id?: string; body: ProductInput }) => (id ? api.put(`/platform/products/${id}`, body) : api.post('/platform/products', body)), onSuccess: afterCommerce });

export const useSaveCoupon = () =>
  useMutation({ mutationFn: ({ id, body }: { id?: string; body: CouponInput }) => (id ? api.put(`/platform/coupons/${id}`, body) : api.post('/platform/coupons', body)), onSuccess: afterCommerce });

export const useDeleteCoupon = () => useMutation({ mutationFn: (id: string) => api.delete(`/platform/coupons/${id}`), onSuccess: afterCommerce });

export const useRefundOrder = () =>
  useMutation({ mutationFn: ({ id, body }: { id: string; body: RefundInput }) => api.post(`/platform/orders/${id}/refund`, body), onSuccess: afterCommerce });

export const useRefundPayment = () =>
  useMutation({ mutationFn: ({ id, body }: { id: string; body: RefundInput }) => api.post(`/platform/payments/${id}/refund`, body), onSuccess: afterCommerce });

export const useRunRenewals = () =>
  useMutation({ mutationFn: () => api.post<{ renewed: number; failed: number; ended: number; reminded: number }>('/platform/renewals/run'), onSuccess: afterCommerce });

export const useGrantAccess = () =>
  useMutation({
    mutationFn: (body: { studentIds: string[]; key: EntitlementKey; months: number; aiSessions: number | null; note: string }) => api.post<{ granted: number }>('/platform/entitlements/grant', body),
    onSuccess: afterCommerce,
  });

export const useSaveQuestion = () =>
  useMutation({ mutationFn: ({ id, body }: { id?: string; body: ExamQuestionInput }) => (id ? api.put(`/platform/content/questions/${id}`, body) : api.post('/platform/content/questions', body)), onSuccess: afterContent });

export const useDeleteQuestion = () => useMutation({ mutationFn: (id: string) => api.delete(`/platform/content/questions/${id}`), onSuccess: afterContent });

export const useSetQuestionStatus = () =>
  useMutation({ mutationFn: (body: { ids: string[]; status: 'DRAFT' | 'PUBLISHED' | 'RETIRED' }) => api.post<{ updated: number }>('/platform/content/questions/status', body), onSuccess: afterContent });

export const useImportQuestions = () =>
  useMutation({ mutationFn: (questions: ExamQuestionInput[]) => api.post<{ imported: number }>('/platform/content/questions/import', { questions }), onSuccess: afterContent });

export const useDraftQuestions = () =>
  useMutation({
    mutationFn: (body: { exam: string; subject: string; topicId?: string | null; count: number; difficulty: string; type?: 'OBJECTIVE' | 'THEORY' }) =>
      api.post<{ drafted: number; provider: string; model: string }>('/platform/content/questions/draft', body),
    onSuccess: afterContent,
  });

export const useAddTopic = () =>
  useMutation({ mutationFn: (body: { subject: string; level: string; name: string; parentId?: string | null; order: number }) => api.post('/platform/content/topics', body), onSuccess: afterContent });
