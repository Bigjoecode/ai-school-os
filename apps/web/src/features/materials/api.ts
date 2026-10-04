import type { MaterialAiDraft, MaterialInput, MaterialLibrary, MaterialListQuery, MaterialOptions, MaterialRow, MaterialStreamUrl } from '@aischool/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';

/** Study materials: the staff list and editor, and the student / parent library. */

export const mk = {
  all: ['materials'] as const,
  options: ['materials', 'options'] as const,
  list: (q: MaterialListQuery) => ['materials', 'list', q] as const,
  library: (studentId: string | undefined) => ['materials', 'library', studentId ?? 'me'] as const,
  one: (id: string) => ['materials', 'one', id] as const,
};

export const useMaterialOptions = () =>
  useQuery({ queryKey: mk.options, queryFn: ({ signal }) => api.get<MaterialOptions>('/materials/options', undefined, signal), staleTime: 5 * 60_000 });

export const useMaterials = (q: MaterialListQuery) =>
  useQuery({
    queryKey: mk.list(q),
    queryFn: ({ signal }) => api.get<MaterialRow[]>('/materials', q as Record<string, string | undefined>, signal),
    placeholderData: (prev) => prev,
  });

export const useLibrary = (studentId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: mk.library(studentId),
    queryFn: ({ signal }) => api.get<MaterialLibrary>('/materials/library', { studentId }, signal),
    enabled,
    staleTime: 60_000,
  });

export const useMaterial = (id: string | null) =>
  useQuery({ queryKey: mk.one(id ?? ''), queryFn: ({ signal }) => api.get<MaterialRow>(`/materials/${id}`, undefined, signal), enabled: !!id });

export function useSaveMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: MaterialInput }) => (id ? api.put<MaterialRow>(`/materials/${id}`, body) : api.post<MaterialRow>('/materials', body)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: mk.all }),
    meta: { silent: true },
  });
}

export function usePublishMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, published }: { id: string; published: boolean }) => api.patch<MaterialRow>(`/materials/${id}/publish`, { published, notify: true }),
    onSuccess: (m) => {
      toast.success(m.published ? 'Published — the class can see it now' : 'Hidden from students and parents');
      void qc.invalidateQueries({ queryKey: mk.all });
    },
  });
}

export function useDeleteMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/materials/${id}`),
    onSuccess: () => {
      toast.success('Material deleted');
      void qc.invalidateQueries({ queryKey: mk.all });
    },
  });
}

export function useMaterialAi() {
  return useMutation({
    mutationFn: ({ id, kind }: { id: string; kind: 'summary' | 'questions' }) => api.post<MaterialAiDraft>(`/materials/${id}/ai/${kind}`),
  });
}

/** Counts an opening (once per material per browser session, so re-opening doesn't inflate it). */
export function countView(id: string) {
  const key = `material.viewed.${id}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
  } catch {
    /* private mode: count anyway */
  }
  void api.post(`/materials/${id}/view`).catch(() => undefined);
}

/** A short-lived link `<video>` and `<audio>` can stream from (they can't send the sign-in header). */
export const streamUrl = (id: string) => api.post<MaterialStreamUrl>(`/materials/${id}/stream`);

export const fileUrl = (id: string) => `/api/materials/${id}/file`;
