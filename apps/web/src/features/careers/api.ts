import type {
  CareerDetail,
  CareerFull,
  CareerHome,
  CareerPlanState,
  CareerRow,
  CounsellorReply,
  CourseImportPreview,
  CourseInput,
  CourseRow,
  courseImportSaveSchema,
  MyCareerPlan,
  ParentCareerView,
  QuizResult,
  QuizStatement,
  StaffCareerOverview,
  StaffStudentCareer,
  Track,
  TrackAdvice,
  CareerInput,
} from '@aischool/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import { api, ApiError, refreshSession } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import type { LearnHome } from '../learning/api';
import { lk } from '../learning/api';

export const crk = {
  all: ['careers'] as const,
  home: ['careers', 'home'] as const,
  library: (q: LibraryQuery) => ['careers', 'library', q] as const,
  career: (slug: string) => ['careers', 'career', slug] as const,
  quiz: ['careers', 'quiz'] as const,
  results: ['careers', 'results'] as const,
  plan: ['careers', 'plan'] as const,
  advice: ['careers', 'advice'] as const,
  courses: (search: string) => ['careers', 'courses', search] as const,
  conversations: ['careers', 'conversations'] as const,
  conversation: (id: string) => ['careers', 'conversation', id] as const,
  portal: (id: string) => ['portal', 'careers', id] as const,
  staff: (classArmId?: string) => ['careers', 'staff', classArmId ?? 'all'] as const,
  staffStudent: (id: string) => ['careers', 'staff-student', id] as const,
  console: ['console', 'careers'] as const,
  consoleCareers: ['console', 'careers', 'careers'] as const,
  consoleCourses: ['console', 'careers', 'courses'] as const,
};

export interface LibraryQuery {
  field?: string;
  track?: string;
  subject?: string;
  search?: string;
  interest?: string;
}

// ---------------------------------------------------------- student

export const useCareerHome = () => useQuery({ queryKey: crk.home, queryFn: () => api.get<CareerHome>('/careers/home') });
export const useCareerLibrary = (q: LibraryQuery) =>
  useQuery({ queryKey: crk.library(q), queryFn: ({ signal }) => api.get<CareerRow[]>('/careers/library', { ...q }, signal), placeholderData: keepPreviousData });
export const useCareer = (slug: string) => useQuery({ queryKey: crk.career(slug), queryFn: () => api.get<CareerDetail>(`/careers/library/${encodeURIComponent(slug)}`), enabled: !!slug });
export const useCareerQuiz = () => useQuery({ queryKey: crk.quiz, queryFn: () => api.get<{ statements: QuizStatement[] }>('/careers/quiz'), staleTime: Infinity });
export const useQuizResults = () => useQuery({ queryKey: crk.results, queryFn: () => api.get<{ result: QuizResult | null }>('/careers/results') });
export const useMyCareerPlan = () => useQuery({ queryKey: crk.plan, queryFn: () => api.get<MyCareerPlan>('/careers/plan') });
export const useTrackAdvice = () => useQuery({ queryKey: crk.advice, queryFn: () => api.get<TrackAdvice>('/careers/advice') });
export const useCourseNames = (search: string, enabled = true) =>
  useQuery({
    queryKey: crk.courses(search),
    queryFn: ({ signal }) => api.get<{ name: string; faculty: string | null; verified: boolean }[]>('/careers/courses', search ? { search } : undefined, signal),
    enabled,
    placeholderData: keepPreviousData,
  });

function useInvalidateCareers() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: crk.all });
}

export function useSubmitQuiz() {
  const inv = useInvalidateCareers();
  return useMutation({ mutationFn: (answers: Record<string, number>) => api.post<QuizResult>('/careers/quiz', { answers }), onSuccess: inv });
}

export function useSaveCareer() {
  const inv = useInvalidateCareers();
  return useMutation({
    mutationFn: ({ slug, saved }: { slug: string; saved: boolean }) => (saved ? api.put<CareerPlanState>(`/careers/saved/${encodeURIComponent(slug)}`) : api.delete<CareerPlanState>(`/careers/saved/${encodeURIComponent(slug)}`)),
    onSuccess: inv,
  });
}

export function useSetCareerPlan() {
  const inv = useInvalidateCareers();
  return useMutation({ mutationFn: (body: { plannedTrack?: Track | null; targetCourse?: string | null }) => api.put<CareerPlanState>('/careers/plan', body), onSuccess: inv });
}

export interface CounsellorConversation {
  id: string;
  title: string;
  messages: { id: string; role: string; content: string; createdAt: string }[];
}
export const useCounsellorConversations = () => useQuery({ queryKey: crk.conversations, queryFn: () => api.get<{ id: string; title: string; updatedAt: string }[]>('/careers/counsellor/conversations') });
export const useCounsellorConversation = (id: string | undefined) =>
  useQuery({ queryKey: crk.conversation(id ?? ''), queryFn: () => api.get<CounsellorConversation>(`/careers/counsellor/conversations/${id}`), enabled: !!id });

export function useCounsellorChat() {
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: (body: { conversationId?: string | null; message: string; voice?: boolean }) => api.post<CounsellorReply>('/careers/counsellor', body),
    onSuccess: (r) => {
      qc.setQueryData<LearnHome>(lk.home, (old) => (old ? { ...old, access: r.access } : old));
      void qc.invalidateQueries({ queryKey: crk.conversations });
      if (r.savedCareers.length) {
        void qc.invalidateQueries({ queryKey: crk.home });
        void qc.invalidateQueries({ queryKey: crk.plan });
      }
    },
  });
}

// ---------------------------------------------------------- parents & staff

export const usePortalCareers = (id: string) => useQuery({ queryKey: crk.portal(id), queryFn: ({ signal }) => api.get<ParentCareerView>(`/portal/students/${id}/careers`, undefined, signal), enabled: !!id });
export const useStaffCareers = (classArmId?: string) =>
  useQuery({ queryKey: crk.staff(classArmId), queryFn: ({ signal }) => api.get<StaffCareerOverview>('/careers/staff/overview', classArmId ? { classArmId } : undefined, signal), placeholderData: keepPreviousData });
export const useStaffStudentCareer = (id: string | null) =>
  useQuery({ queryKey: crk.staffStudent(id ?? ''), queryFn: () => api.get<StaffStudentCareer>(`/careers/staff/students/${id}`), enabled: !!id });
export function useSaveCounsellorNotes(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (notes: string | null) => api.put<{ counsellorNotes: string | null }>(`/careers/staff/students/${id}/notes`, { notes }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: crk.staffStudent(id) });
      void qc.invalidateQueries({ queryKey: ['careers', 'staff'] });
    },
  });
}

// ---------------------------------------------------------- console

export const useConsoleCareers = () => useQuery({ queryKey: crk.consoleCareers, queryFn: () => api.get<CareerFull[]>('/platform/careers/careers') });
export const useConsoleCourses = () => useQuery({ queryKey: crk.consoleCourses, queryFn: () => api.get<CourseRow[]>('/platform/careers/courses') });

function useInvalidateConsole() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: crk.console });
}

export function useSaveConsoleCareer() {
  const inv = useInvalidateConsole();
  return useMutation({ mutationFn: ({ id, body }: { id?: string; body: CareerInput }) => (id ? api.put<CareerFull>(`/platform/careers/careers/${id}`, body) : api.post<CareerFull>('/platform/careers/careers', body)), onSuccess: inv });
}
export function useDeleteConsoleCareer() {
  const inv = useInvalidateConsole();
  return useMutation({ mutationFn: (id: string) => api.delete(`/platform/careers/careers/${id}`), onSuccess: inv });
}
export function useSaveConsoleCourse() {
  const inv = useInvalidateConsole();
  return useMutation({ mutationFn: ({ id, body }: { id?: string; body: CourseInput }) => (id ? api.put<CourseRow>(`/platform/careers/courses/${id}`, body) : api.post<CourseRow>('/platform/careers/courses', body)), onSuccess: inv });
}
export function useDeleteConsoleCourse() {
  const inv = useInvalidateConsole();
  return useMutation({ mutationFn: (id: string) => api.delete(`/platform/careers/courses/${id}`), onSuccess: inv });
}
export const useCsvPreview = () => useMutation({ meta: { silent: true }, mutationFn: (csv: string) => api.post<CourseImportPreview>('/platform/careers/courses/import/preview', { csv }) });
export function useImportCourses(kind: 'csv' | 'brochure') {
  const inv = useInvalidateConsole();
  return useMutation({
    mutationFn: (body: z.input<typeof courseImportSaveSchema>) => api.post<{ created: number; updated: number; skipped: number }>(kind === 'csv' ? '/platform/careers/courses/import' : '/platform/careers/brochure/save', body),
    onSuccess: inv,
  });
}
export const useBrochurePreview = () =>
  useMutation({ meta: { silent: true }, mutationFn: (body: { text: string; edition: string | null }) => api.post<CourseImportPreview>('/platform/careers/brochure/preview', body) });

export interface BrochureText {
  text: string;
  chars: number;
  filename: string;
  pages: number | null;
  from: number | null;
  to: number | null;
}

/** POST /platform/careers/brochure/extract (multipart): the text of a page range of the brochure; nothing is stored. */
export async function extractBrochure(file: File, from?: number, to?: number): Promise<BrochureText> {
  if (file.size > 60 * 1024 * 1024) throw new ApiError(413, 'That file is larger than 60 MB.');
  if (!/\.(pdf|docx|txt)$/i.test(file.name)) throw new ApiError(415, 'Upload the brochure as a PDF (or a Word or text file).');
  const send = () => {
    const form = new FormData();
    form.append('file', file);
    if (from) form.append('from', String(from));
    if (to) form.append('to', String(to));
    const token = useAuthStore.getState().accessToken;
    return fetch('/api/platform/careers/brochure/extract', { method: 'POST', body: form, credentials: 'include', headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
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
  return (await res.json()) as BrochureText;
}
