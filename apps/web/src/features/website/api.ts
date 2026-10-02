import type {
  DownloadCategory,
  PostCategory,
  PublicEvent,
  ResultCodeRow,
  UploadedFile,
  WebsiteMessageRow,
  WebsiteMessageStatus,
  WebsiteOverview,
  WebsitePostRow,
  WebsiteSettings,
  WEBSITE_DRAFT_KINDS,
} from '@aischool/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, api, refreshSession } from '@/lib/api';
import { useAuthStore, useCan } from '@/lib/auth-store';
import { queryClient } from '@/lib/query-client';
import { aiErrorMessage } from '../finance/api';

// ------------------------------------------------------------------ admin-only response shapes

export interface WebsiteAlbumRow {
  id: string;
  title: string;
  description: string | null;
  date: string | null;
  published: boolean;
  photos: { id: string; url: string; caption: string | null }[];
}

export interface WebsiteDownloadRow {
  id: string;
  title: string;
  description: string | null;
  category: DownloadCategory;
  fileUrl: string;
  published: boolean;
  createdAt: string;
}

export interface WebsiteTeacherRow {
  id: string;
  name: string;
  jobTitle: string;
  type: string;
  department: string | null;
  showOnWebsite: boolean;
  websiteBio: string | null;
  photoUrl: string | null;
}

export interface WebsiteEventRow extends PublicEvent {
  id: string;
  showOnWebsite: boolean;
  audience: string;
  classSpecific: boolean;
}

export type DraftKind = (typeof WEBSITE_DRAFT_KINDS)[number];

export interface PostInputBody {
  title: string;
  excerpt: string | null;
  body: string;
  category: PostCategory;
  coverUrl: string | null;
  status: 'DRAFT' | 'PUBLISHED';
  publishedAt: string | null;
}

export interface AlbumInputBody {
  title: string;
  description: string | null;
  date: string | null;
  published: boolean;
}

export interface DownloadInputBody {
  title: string;
  description: string | null;
  category: DownloadCategory;
  fileUrl: string;
  published: boolean;
}

// ------------------------------------------------------------------ keys

export const wk = {
  all: ['website'] as const,
  overview: ['website', 'overview'] as const,
  posts: ['website', 'posts'] as const,
  albums: ['website', 'albums'] as const,
  downloads: ['website', 'downloads'] as const,
  teachers: ['website', 'teachers'] as const,
  events: ['website', 'events'] as const,
  messages: (status?: WebsiteMessageStatus) => ['website', 'messages', status ?? 'OPEN'] as const,
  codes: (classArmId: string, termId: string) => ['website', 'codes', classArmId, termId] as const,
};

const refresh = (key: readonly unknown[] = wk.all) => {
  void queryClient.invalidateQueries({ queryKey: key });
  void queryClient.invalidateQueries({ queryKey: wk.overview });
  // The public site the admin may have open in this tab.
  void queryClient.invalidateQueries({ queryKey: ['public-site'] });
};

function useManage() {
  return useCan('website.manage');
}

// ------------------------------------------------------------------ overview & settings

export function useWebsiteOverview() {
  const can = useManage();
  return useQuery({ queryKey: wk.overview, queryFn: ({ signal }) => api.get<WebsiteOverview>('/website', undefined, signal), enabled: can });
}

export function useSaveSettings() {
  return useMutation({
    mutationFn: (s: WebsiteSettings) => api.put<WebsiteSettings>('/website/settings', s),
    onSuccess: (s) => {
      queryClient.setQueryData<WebsiteOverview>(wk.overview, (o) => (o ? { ...o, settings: s } : o));
      refresh(wk.overview);
    },
  });
}

export function usePreviewLink() {
  return useMutation({ mutationFn: () => api.get<{ path: string }>('/website/preview-link') });
}

// ------------------------------------------------------------------ news

export function usePosts() {
  const can = useManage();
  return useQuery({ queryKey: wk.posts, queryFn: ({ signal }) => api.get<WebsitePostRow[]>('/website/posts', undefined, signal), enabled: can });
}

export function useSavePost() {
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: PostInputBody }) => (id ? api.put<WebsitePostRow>(`/website/posts/${id}`, body) : api.post<WebsitePostRow>('/website/posts', body)),
    meta: { silent: true },
    onSuccess: () => refresh(wk.posts),
  });
}

export function useDeletePost() {
  return useMutation({
    mutationFn: (id: string) => api.delete(`/website/posts/${id}`),
    onSuccess: () => {
      refresh(wk.posts);
      toast.success('Post deleted');
    },
  });
}

// ------------------------------------------------------------------ gallery

export function useAlbums() {
  const can = useManage();
  return useQuery({ queryKey: wk.albums, queryFn: ({ signal }) => api.get<WebsiteAlbumRow[]>('/website/albums', undefined, signal), enabled: can });
}

export function useSaveAlbum() {
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: AlbumInputBody }) => (id ? api.put<{ id: string }>(`/website/albums/${id}`, body) : api.post<{ id: string }>('/website/albums', body)),
    meta: { silent: true },
    onSuccess: () => refresh(wk.albums),
  });
}

export function useDeleteAlbum() {
  return useMutation({
    mutationFn: (id: string) => api.delete(`/website/albums/${id}`),
    onSuccess: () => {
      refresh(wk.albums);
      toast.success('Album deleted');
    },
  });
}

export function useAddPhoto() {
  return useMutation({
    mutationFn: ({ albumId, url, caption }: { albumId: string; url: string; caption: string | null }) => api.post(`/website/albums/${albumId}/photos`, { url, caption }),
    onSuccess: () => refresh(wk.albums),
  });
}

export function useUpdatePhoto() {
  return useMutation({
    mutationFn: ({ id, caption }: { id: string; caption: string | null }) => api.put(`/website/photos/${id}`, { caption }),
    onSuccess: () => refresh(wk.albums),
  });
}

export function useDeletePhoto() {
  return useMutation({
    mutationFn: (id: string) => api.delete(`/website/photos/${id}`),
    onSuccess: () => refresh(wk.albums),
  });
}

// ------------------------------------------------------------------ downloads

export function useDownloads() {
  const can = useManage();
  return useQuery({ queryKey: wk.downloads, queryFn: ({ signal }) => api.get<WebsiteDownloadRow[]>('/website/downloads', undefined, signal), enabled: can });
}

export function useSaveDownload() {
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: DownloadInputBody }) => (id ? api.put(`/website/downloads/${id}`, body) : api.post('/website/downloads', body)),
    meta: { silent: true },
    onSuccess: () => refresh(wk.downloads),
  });
}

export function useDeleteDownload() {
  return useMutation({
    mutationFn: (id: string) => api.delete(`/website/downloads/${id}`),
    onSuccess: () => {
      refresh(wk.downloads);
      toast.success('Document removed');
    },
  });
}

// ------------------------------------------------------------------ teachers & events

export function useWebsiteTeachers() {
  const can = useManage();
  return useQuery({ queryKey: wk.teachers, queryFn: ({ signal }) => api.get<WebsiteTeacherRow[]>('/website/teachers', undefined, signal), enabled: can });
}

export function useSaveTeacher() {
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: { showOnWebsite: boolean; websiteBio: string | null; photoUrl: string | null } }) => api.put<{ id: string }>(`/website/teachers/${id}`, body),
    onMutate: async ({ id, body }) => {
      await queryClient.cancelQueries({ queryKey: wk.teachers });
      const prev = queryClient.getQueryData<WebsiteTeacherRow[]>(wk.teachers);
      queryClient.setQueryData<WebsiteTeacherRow[]>(wk.teachers, (rows) => rows?.map((r) => (r.id === id ? { ...r, ...body } : r)));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && queryClient.setQueryData(wk.teachers, ctx.prev),
    onSettled: () => refresh(wk.teachers),
  });
}

export function useWebsiteEvents() {
  const can = useManage();
  return useQuery({ queryKey: wk.events, queryFn: ({ signal }) => api.get<WebsiteEventRow[]>('/website/events', undefined, signal), enabled: can });
}

export function useToggleEvent() {
  return useMutation({
    mutationFn: ({ id, showOnWebsite }: { id: string; showOnWebsite: boolean }) => api.put(`/website/events/${id}`, { showOnWebsite }),
    onMutate: async ({ id, showOnWebsite }) => {
      await queryClient.cancelQueries({ queryKey: wk.events });
      const prev = queryClient.getQueryData<WebsiteEventRow[]>(wk.events);
      queryClient.setQueryData<WebsiteEventRow[]>(wk.events, (rows) => rows?.map((r) => (r.id === id ? { ...r, showOnWebsite } : r)));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && queryClient.setQueryData(wk.events, ctx.prev),
    onSettled: () => refresh(wk.events),
  });
}

// ------------------------------------------------------------------ inbox

export function useMessages(status?: WebsiteMessageStatus) {
  const can = useManage();
  return useQuery({
    queryKey: wk.messages(status),
    queryFn: ({ signal }) => api.get<WebsiteMessageRow[]>('/website/messages', { status }, signal),
    enabled: can,
  });
}

export function useSetMessageStatus() {
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: WebsiteMessageStatus }) => api.put(`/website/messages/${id}`, { status }),
    onSuccess: () => refresh(['website', 'messages']),
  });
}

// ------------------------------------------------------------------ result codes

export function useResultCodes(classArmId: string, termId: string) {
  const can = useManage();
  return useQuery({
    queryKey: wk.codes(classArmId, termId),
    queryFn: ({ signal }) => api.get<ResultCodeRow[]>('/website/result-codes', { classArmId, termId }, signal),
    enabled: can && !!classArmId && !!termId,
  });
}

export function useIssueCodes() {
  return useMutation({
    mutationFn: (body: { classArmId: string; termId: string; maxUses: number }) => api.post<{ created: number; rows: ResultCodeRow[] }>('/website/result-codes', body),
    onSuccess: (r, v) => {
      queryClient.setQueryData(wk.codes(v.classArmId, v.termId), r.rows);
      toast.success(r.created ? `Issued ${r.created} new ${r.created === 1 ? 'code' : 'codes'}` : 'Every student already has a code for this term');
    },
  });
}

export function useResetCode() {
  return useMutation({
    mutationFn: ({ studentId, termId }: { studentId: string; termId: string; classArmId: string }) => api.post<{ code: string }>(`/website/result-codes/${studentId}/reset`, { termId }),
    onSuccess: (r, v) => {
      queryClient.setQueryData<ResultCodeRow[]>(wk.codes(v.classArmId, v.termId), (rows) => rows?.map((x) => (x.studentId === v.studentId ? { ...x, code: r.code, uses: 0 } : x)));
      toast.success('New code issued — the old one no longer works');
    },
  });
}

// ------------------------------------------------------------------ AI drafts

export function useWebsiteDraft() {
  return useMutation({
    mutationFn: (body: { kind: DraftKind; brief: string }) => api.post<Record<string, unknown> & { provider: string; model: string }>('/website/ai/draft', body),
    meta: { silent: true },
    onError: (err) => toast.error(aiErrorMessage(err)),
  });
}

// ------------------------------------------------------------------ uploads

export const UPLOAD_ACCEPT = {
  image: 'image/jpeg,image/png,image/webp,image/gif',
  document: '.pdf,.docx,.xlsx,.pptx,image/jpeg,image/png,image/webp,image/gif,application/pdf',
};
export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = /\.(jpe?g|png|webp|gif|pdf|docx|xlsx|pptx)$/i;

/** Multipart upload to /api/files (website files are public by default). */
export async function uploadFile(file: File, isPublic = true): Promise<UploadedFile> {
  if (file.size > UPLOAD_MAX_BYTES) throw new ApiError(413, 'That file is larger than 10 MB. Please choose a smaller one.');
  if (!ALLOWED.test(file.name)) throw new ApiError(415, 'Upload a JPG, PNG, WebP, GIF, PDF, Word, Excel or PowerPoint file.');
  const send = () => {
    const form = new FormData();
    form.append('file', file);
    const token = useAuthStore.getState().accessToken;
    return fetch(`/api/files${isPublic ? '' : '?public=false'}`, {
      method: 'POST',
      body: form,
      credentials: 'include',
      headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
  };
  let res: Response;
  try {
    res = await send();
    if (res.status === 401 && (await refreshSession())) res = await send();
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }
  if (!res.ok) {
    let message = res.status === 413 ? 'That file is larger than 10 MB.' : 'Upload failed. Please try again.';
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (body.message) message = Array.isArray(body.message) ? body.message.join('. ') : body.message;
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as UploadedFile;
}

export function useUpload(isPublic = true) {
  return useMutation({ mutationFn: (file: File) => uploadFile(file, isPublic) });
}
