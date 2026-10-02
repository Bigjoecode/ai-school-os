import type { TicketCategory, TicketDetail, TicketPriority, TicketRow } from '@aischool/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/query-client';

export const sk = {
  tickets: ['support', 'tickets'] as const,
  ticket: (id: string) => ['support', 'ticket', id] as const,
};

export const useMyTickets = () => useQuery({ queryKey: sk.tickets, queryFn: ({ signal }) => api.get<TicketRow[]>('/support/tickets', undefined, signal) });

export const useMyTicket = (id: string) =>
  useQuery({ queryKey: sk.ticket(id), queryFn: ({ signal }) => api.get<TicketDetail>(`/support/tickets/${id}`, undefined, signal), refetchInterval: 60_000 });

const store = (t: TicketDetail) => {
  queryClient.setQueryData(sk.ticket(t.id), t);
  void queryClient.invalidateQueries({ queryKey: sk.tickets });
};

export const useOpenTicket = () =>
  useMutation({
    mutationFn: (body: { subject: string; category: TicketCategory; priority: TicketPriority; body: string }) => api.post<TicketDetail>('/support/tickets', body),
    onSuccess: store,
    meta: { silent: true },
  });

export const useSchoolReply = (id: string) =>
  useMutation({ mutationFn: (body: string) => api.post<TicketDetail>(`/support/tickets/${id}/reply`, { body }), onSuccess: store });

export const useCloseTicket = (id: string) => useMutation({ mutationFn: () => api.post<TicketDetail>(`/support/tickets/${id}/close`), onSuccess: store });
