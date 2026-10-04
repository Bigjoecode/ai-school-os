import type { ExamBody, SyllabusImportPreview, syllabusSaveSchema } from '@aischool/shared';
import { useMutation } from '@tanstack/react-query';
import type { z } from 'zod';
import { api, ApiError, refreshSession } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { queryClient } from '@/lib/query-client';
import { ck } from './commerce-api';

/** Exam syllabus import for the console: extract text → AI preview → save to the topic graph. */

export interface SyllabusText {
  text: string;
  chars: number;
  filename: string;
}

const MAX_BYTES = 25 * 1024 * 1024;

/** POST /platform/content/syllabus/extract (multipart `file`): the text of a PDF, Word or text file; nothing is stored. */
export async function extractSyllabus(file: File): Promise<SyllabusText> {
  if (file.size > MAX_BYTES) throw new ApiError(413, 'That file is larger than 25 MB.');
  if (!/\.(pdf|docx|txt|md)$/i.test(file.name)) throw new ApiError(415, 'Upload a PDF, Word (.docx) or text file — or paste the text below.');
  const send = () => {
    const form = new FormData();
    form.append('file', file);
    const token = useAuthStore.getState().accessToken;
    return fetch('/api/platform/content/syllabus/extract', { method: 'POST', body: form, credentials: 'include', headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  };
  let res: Response;
  try {
    res = await send();
    if (res.status === 401 && (await refreshSession())) res = await send();
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }
  if (!res.ok) {
    let message = 'The file could not be read. Please try again.';
    try {
      const b = (await res.json()) as { message?: string | string[] };
      if (b.message) message = Array.isArray(b.message) ? b.message.join('. ') : b.message;
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as SyllabusText;
}

export const useExtractSyllabus = () => useMutation({ meta: { silent: true }, mutationFn: extractSyllabus });

export const usePreviewSyllabus = () =>
  useMutation({ meta: { silent: true }, mutationFn: (body: { exam: ExamBody; subject: string; text: string }) => api.post<SyllabusImportPreview>('/platform/content/syllabus/preview', body) });

export const useSaveSyllabus = () =>
  useMutation({
    mutationFn: (body: z.input<typeof syllabusSaveSchema>) => api.post<{ created: number; updated: number }>('/platform/content/syllabus', body),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ck.content }),
  });
