import type {
  CreatePinBatchInput,
  PinBatchRow,
  PinCardDetail,
  PinChallenge,
  PinCheckResult,
  PinExport,
  PinOverview,
  PinPurchaseResult,
  PinPurchaseStart,
  PinSaleRow,
  PinUseRow,
  PublicPinInfo,
} from '@aischool/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/query-client';

const pk = {
  all: ['result-pins'] as const,
  overview: () => [...pk.all, 'overview'] as const,
  uses: (batchId: string) => [...pk.all, 'uses', batchId] as const,
  sales: () => [...pk.all, 'sales'] as const,
  card: (serial: string) => [...pk.all, 'card', serial] as const,
};
const refresh = () => queryClient.invalidateQueries({ queryKey: pk.all });

export function usePinOverview() {
  return useQuery({ queryKey: pk.overview(), queryFn: ({ signal }) => api.get<PinOverview>('/result-pins', undefined, signal) });
}

export function usePinUses(batchId: string) {
  return useQuery({ queryKey: pk.uses(batchId), queryFn: ({ signal }) => api.get<PinUseRow[]>('/result-pins/uses', { batchId }, signal) });
}

export function usePinSales(enabled: boolean) {
  return useQuery({ queryKey: pk.sales(), enabled, queryFn: ({ signal }) => api.get<PinSaleRow[]>('/result-pins/sales', undefined, signal) });
}

export function usePinCard(serial: string) {
  return useQuery({ queryKey: pk.card(serial), enabled: serial.length >= 6, retry: false, queryFn: ({ signal }) => api.get<PinCardDetail>(`/result-pins/cards/${encodeURIComponent(serial)}`, undefined, signal) });
}

export function useGenerateBatch() {
  return useMutation({
    mutationFn: (body: CreatePinBatchInput) => api.post<PinBatchRow>('/result-pins/batches', body),
    onSuccess: (b) => {
      toast.success(`Batch ${b.number} generated: ${b.count} cards`);
      void refresh();
    },
  });
}

export function useExportBatch() {
  return useMutation({
    mutationFn: (id: string) => api.post<PinExport>(`/result-pins/batches/${id}/export`),
    onSettled: () => void refresh(),
  });
}

export function useExtendBatch() {
  return useMutation({
    mutationFn: (v: { id: string; expiresOn: string }) => api.patch<PinBatchRow>(`/result-pins/batches/${v.id}/expiry`, { expiresOn: v.expiresOn }),
    onSuccess: () => {
      toast.success('Expiry date changed');
      void refresh();
    },
  });
}

export function useVoidBatch() {
  return useMutation({
    mutationFn: (v: { id: string; reason: string }) => api.post<PinBatchRow>(`/result-pins/batches/${v.id}/void`, { reason: v.reason }),
    onSuccess: () => {
      toast.success('Batch voided — its cards no longer work');
      void refresh();
    },
  });
}

export function useSellPins() {
  return useMutation({
    mutationFn: (body: { fromSerial: string; toSerial: string; soldTo: string | null }) => api.post<{ sold: number }>('/result-pins/sell', body),
    onSuccess: (r) => {
      toast.success(r.sold ? `${r.sold} ${r.sold === 1 ? 'card' : 'cards'} recorded as sold` : 'Those cards were already recorded as sold');
      void refresh();
    },
  });
}

export function useVoidCard() {
  return useMutation({
    mutationFn: (body: { serial: string; reason: string }) => api.post<PinCardDetail>('/result-pins/cards/void', body),
    onSuccess: () => {
      toast.success('Card voided');
      void refresh();
    },
  });
}

export function useUnlockCard() {
  return useMutation({
    mutationFn: (serial: string) => api.post<PinCardDetail>(`/result-pins/cards/${encodeURIComponent(serial)}/unlock`),
    onSuccess: () => {
      toast.success('Card unlocked');
      void refresh();
    },
  });
}

// ------------------------------------------------------------------ public

export function usePublicPinInfo(slug: string) {
  return useQuery({ queryKey: ['public-pins', slug], retry: false, queryFn: ({ signal }) => api.get<PublicPinInfo>(`/public/result-pins/${encodeURIComponent(slug)}`, undefined, signal) });
}

export const publicPins = {
  check: (slug: string, body: unknown) => api.post<PinCheckResult>(`/public/result-pins/${encodeURIComponent(slug)}/check`, body),
  challenge: (slug: string) => api.get<PinChallenge>(`/public/result-pins/${encodeURIComponent(slug)}/challenge`),
  buy: (slug: string, body: unknown) => api.post<PinPurchaseStart>(`/public/result-pins/${encodeURIComponent(slug)}/buy`, body),
  purchase: (slug: string, reference: string, claim: string) => api.get<PinPurchaseResult>(`/public/result-pins/${encodeURIComponent(slug)}/purchase/${encodeURIComponent(reference)}`, { claim }),
};
