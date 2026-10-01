import type {
  AiCompose,
  AiText,
  AnnouncementInput,
  AnnouncementRow,
  Audience,
  AudiencePreview,
  BroadcastDetail,
  BroadcastInput,
  BroadcastRow,
  BroadcastSource,
  BroadcastStatus,
  Channel,
  ChannelStatus,
  CommsOverview,
  CommsSettings,
  EventInput,
  EventRow,
  NoticeboardResponse,
  NotificationsResponse,
} from '@aischool/shared';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useCan, useMe } from '@/lib/auth-store';
import { queryClient } from '@/lib/query-client';
import { aiErrorMessage } from '../finance/api';

/** Query keys — messages under ['comms'], the noticeboard and calendar under ['community']. */
export const ck = {
  all: ['comms'] as const,
  overview: ['comms', 'overview'] as const,
  settings: ['comms', 'settings'] as const,
  channels: ['comms', 'channels'] as const,
  broadcasts: (p: object) => ['comms', 'broadcasts', p] as const,
  broadcast: (id: string) => ['comms', 'broadcast', id] as const,
  preview: (p: object) => ['comms', 'preview', p] as const,
  community: ['community'] as const,
  noticeboard: ['community', 'noticeboard'] as const,
  announcements: ['community', 'announcements'] as const,
  events: (p: object) => ['community', 'events', p] as const,
  feedLink: ['community', 'feed-link'] as const,
  notifications: ['notifications'] as const,
  pushKey: ['push', 'key'] as const,
};

const refreshComms = () => void queryClient.invalidateQueries({ queryKey: ck.all });
const refreshCommunity = () => void queryClient.invalidateQueries({ queryKey: ck.community });

const aiError = { meta: { silent: true }, onError: (err: Error) => toast.error(aiErrorMessage(err)) } as const;

// ------------------------------------------------------------------ overview & settings

export function useCommsOverview(enabled = true) {
  const can = useCan('comms.read');
  return useQuery({
    queryKey: ck.overview,
    queryFn: ({ signal }) => api.get<CommsOverview>('/comms/overview', undefined, signal),
    enabled: enabled && can,
  });
}

export function useCommsSettings() {
  const can = useCan('comms.read');
  return useQuery({
    queryKey: ck.settings,
    queryFn: ({ signal }) => api.get<CommsSettings>('/comms/settings', undefined, signal),
    enabled: can,
  });
}

export function useSaveCommsSettings() {
  return useMutation({
    mutationFn: (input: CommsSettings) => api.put<CommsSettings>('/comms/settings', input),
    onSuccess: (s) => {
      queryClient.setQueryData(ck.settings, s);
      refreshComms();
      toast.success('Messaging settings saved');
    },
  });
}

export function useChannels() {
  const can = useCan('comms.read');
  return useQuery({
    queryKey: ck.channels,
    queryFn: ({ signal }) => api.get<ChannelStatus[]>('/comms/channels', undefined, signal),
    enabled: can,
    staleTime: 60_000,
  });
}

export type ProviderChannel = 'EMAIL' | 'SMS' | 'WHATSAPP';

/** Saves a provider's credentials; the server checks them with the provider first. */
export function useSaveChannel(channel: ProviderChannel) {
  const path = channel === 'EMAIL' ? 'email' : channel === 'SMS' ? 'sms' : 'whatsapp';
  return useMutation({
    meta: { silent: true },
    mutationFn: async (input: unknown) => {
      const r = await api.put<ChannelStatus[] | { channels: ChannelStatus[]; balance: string | null }>(`/comms/channels/${path}`, input);
      return Array.isArray(r) ? { channels: r, balance: null } : r;
    },
    onSuccess: (r) => {
      queryClient.setQueryData(ck.channels, r.channels);
      refreshComms();
    },
  });
}

export function useDisconnectChannel() {
  return useMutation({
    mutationFn: (channel: ProviderChannel) => api.delete(`/comms/channels/${channel}`),
    onSuccess: (_r, channel) => {
      refreshComms();
      toast.success(`${channel === 'EMAIL' ? 'Email' : channel === 'SMS' ? 'SMS' : 'WhatsApp'} disconnected`);
    },
  });
}

export function useTestChannel() {
  return useMutation({
    meta: { silent: true },
    mutationFn: (input: { channel: ProviderChannel; to: string }) => api.post<{ ok: boolean; message: string }>('/comms/channels/test', input),
  });
}

// ------------------------------------------------------------------ broadcasts

export interface PreviewInput {
  audience: Audience;
  channels: Channel[];
  body?: string;
  smsBody?: string | null;
}

/** Live audience preview. Pass null while the audience is incomplete. */
export function usePreview(input: PreviewInput | null) {
  const can = useCan('comms.send');
  return useQuery({
    queryKey: ck.preview(input ?? {}),
    queryFn: ({ signal }) => api.post<AudiencePreview>('/comms/preview', input, { signal }),
    enabled: can && !!input,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

export interface BroadcastListParams {
  status?: BroadcastStatus;
  source?: BroadcastSource;
}

export function useBroadcasts(params: BroadcastListParams = {}) {
  const can = useCan('comms.read');
  return useQuery({
    queryKey: ck.broadcasts(params),
    queryFn: ({ signal }) => api.get<BroadcastRow[]>('/comms/broadcasts', { ...params }, signal),
    enabled: can,
    placeholderData: keepPreviousData,
    // Keep counts moving while something is going out.
    refetchInterval: (q) => (q.state.data?.some((b) => b.status === 'SENDING') ? 5000 : false),
  });
}

export function useBroadcast(id: string | undefined) {
  return useQuery({
    queryKey: ck.broadcast(id ?? ''),
    queryFn: ({ signal }) => api.get<BroadcastDetail>(`/comms/broadcasts/${id}`, undefined, signal),
    enabled: !!id,
    refetchInterval: (q) => {
      const b = q.state.data;
      return b && (b.status === 'SENDING' || b.totals.queued > 0) ? 3000 : false;
    },
  });
}

export function useSaveBroadcast() {
  return useMutation({
    meta: { silent: true },
    mutationFn: ({ id, input }: { id?: string; input: BroadcastInput }) =>
      id ? api.put<BroadcastDetail>(`/comms/broadcasts/${id}`, input) : api.post<BroadcastDetail>('/comms/broadcasts', input),
    onSuccess: (b) => {
      queryClient.setQueryData(ck.broadcast(b.id), b);
      refreshComms();
    },
  });
}

export function useSendBroadcast() {
  return useMutation({
    meta: { silent: true },
    mutationFn: ({ id, scheduledAt }: { id: string; scheduledAt?: string | null }) => api.post<BroadcastDetail>(`/comms/broadcasts/${id}/send`, { scheduledAt: scheduledAt ?? null }),
    onSuccess: (b) => {
      queryClient.setQueryData(ck.broadcast(b.id), b);
      refreshComms();
    },
  });
}

export function useCancelBroadcast() {
  return useMutation({
    mutationFn: (id: string) => api.post<BroadcastDetail>(`/comms/broadcasts/${id}/cancel`),
    onSuccess: (b) => {
      queryClient.setQueryData(ck.broadcast(b.id), b);
      refreshComms();
      toast.success('Schedule cancelled — it’s back in your drafts');
    },
  });
}

export function useRetryBroadcast() {
  return useMutation({
    mutationFn: (id: string) => api.post<BroadcastDetail>(`/comms/broadcasts/${id}/retry`),
    onSuccess: (b) => {
      queryClient.setQueryData(ck.broadcast(b.id), b);
      refreshComms();
      toast.success('Retrying the failed deliveries');
    },
  });
}

export function useDeleteBroadcast() {
  return useMutation({
    mutationFn: (id: string) => api.delete(`/comms/broadcasts/${id}`),
    onSuccess: () => {
      refreshComms();
      toast.success('Draft deleted');
    },
  });
}

// ------------------------------------------------------------------ AI

export function useCompose() {
  return useMutation({
    mutationFn: (input: { brief: string; audienceSummary?: string; channels: Channel[]; tone: 'WARM' | 'FORMAL' | 'URGENT' }) => api.post<AiCompose & AiText>('/comms/compose', input),
    ...aiError,
  });
}

export function useTranslate() {
  return useMutation({
    mutationFn: (input: { language: string; text: string }) => api.post<AiText>('/comms/translate', input),
    ...aiError,
  });
}

// ------------------------------------------------------------------ noticeboard & announcements

export function useNoticeboard(enabled = true) {
  const me = useMe();
  return useQuery({
    queryKey: ck.noticeboard,
    queryFn: ({ signal }) => api.get<NoticeboardResponse>('/noticeboard', undefined, signal),
    enabled: enabled && !!me?.tenant,
  });
}

export function useAnnouncements(enabled = true) {
  const can = useCan('announcements.manage');
  return useQuery({
    queryKey: ck.announcements,
    queryFn: ({ signal }) => api.get<AnnouncementRow[]>('/announcements', undefined, signal),
    enabled: enabled && can,
  });
}

export function useSaveAnnouncement() {
  return useMutation({
    meta: { silent: true },
    mutationFn: ({ id, input }: { id?: string; input: AnnouncementInput }) =>
      id ? api.put<AnnouncementRow>(`/announcements/${id}`, input) : api.post<AnnouncementRow>('/announcements', input),
    onSuccess: (_a, v) => {
      refreshCommunity();
      if (v.input.notify.length) refreshComms();
      toast.success(v.id ? 'Announcement updated' : v.input.notify.length ? 'Announcement posted and on its way' : 'Announcement posted');
    },
  });
}

export function useDeleteAnnouncement() {
  return useMutation({
    mutationFn: (id: string) => api.delete(`/announcements/${id}`),
    onSuccess: () => {
      refreshCommunity();
      toast.success('Announcement removed');
    },
  });
}

// ------------------------------------------------------------------ calendar

export function useEvents(range: { from: string; to: string }) {
  const me = useMe();
  return useQuery({
    queryKey: ck.events(range),
    queryFn: ({ signal }) => api.get<EventRow[]>('/events', range, signal),
    enabled: !!me?.tenant,
    placeholderData: keepPreviousData,
  });
}

export function useSaveEvent() {
  return useMutation({
    meta: { silent: true },
    mutationFn: ({ id, input }: { id?: string; input: EventInput }) => (id ? api.put<EventRow>(`/events/${id}`, input) : api.post<EventRow>('/events', input)),
    onSuccess: (_e, v) => {
      refreshCommunity();
      void queryClient.invalidateQueries({ queryKey: ck.overview });
      toast.success(v.id ? 'Event updated' : 'Added to the calendar');
    },
  });
}

export function useDeleteEvent() {
  return useMutation({
    mutationFn: (id: string) => api.delete(`/events/${id}`),
    onSuccess: () => {
      refreshCommunity();
      toast.success('Removed from the calendar');
    },
  });
}

export function useFeedLink(enabled: boolean) {
  return useQuery({
    queryKey: ck.feedLink,
    queryFn: ({ signal }) => api.get<{ path: string }>('/events/feed-link', undefined, signal),
    enabled,
    staleTime: Infinity,
  });
}

// ------------------------------------------------------------------ notifications

export function useNotifications() {
  const me = useMe();
  return useQuery({
    queryKey: ck.notifications,
    queryFn: ({ signal }) => api.get<NotificationsResponse>('/notifications', undefined, signal),
    enabled: !!me?.tenant,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 20_000,
  });
}

export function useMarkRead() {
  return useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onMutate: (id) => {
      queryClient.setQueryData<NotificationsResponse>(ck.notifications, (d) =>
        d
          ? {
              unread: Math.max(0, d.unread - (d.items.find((n) => n.id === id && !n.readAt) ? 1 : 0)),
              items: d.items.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n)),
            }
          : d,
      );
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ck.notifications }),
  });
}

export function useMarkAllRead() {
  return useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onMutate: () => {
      const now = new Date().toISOString();
      queryClient.setQueryData<NotificationsResponse>(ck.notifications, (d) => (d ? { unread: 0, items: d.items.map((n) => ({ ...n, readAt: n.readAt ?? now })) } : d));
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ck.notifications }),
  });
}
