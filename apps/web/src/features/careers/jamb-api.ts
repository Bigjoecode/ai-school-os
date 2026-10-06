import type {
  JambCheckInput,
  JambCheckResult,
  JambCourseDetail,
  JambCourseRow,
  JambFacultyRow,
  JambFaq,
  JambInstallStatus,
  JambInstitutionDetail,
  JambInstitutionRow,
  JambLevel,
  JambOverview,
  JambPage,
  JambSyllabusDetail,
  JambSyllabusSubject,
} from '@aischool/shared';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** JAMB's brochure changes only when a new file ships: cache it generously. */
const STALE = 10 * 60_000;

export interface InstitutionFilters {
  type?: JambLevel;
  ownership?: string;
  state?: string;
  q?: string;
  page?: number;
}
export interface CourseFilters {
  faculty?: string;
  level?: JambLevel;
  q?: string;
  page?: number;
}
export interface CourseInstitutionFilters {
  state?: string;
  ownership?: string;
  type?: JambLevel;
}

const clean = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && v !== null)) as Record<string, string | number>;

export const jk = {
  all: ['jamb'] as const,
  overview: ['jamb', 'overview'] as const,
  institutions: (f: InstitutionFilters) => ['jamb', 'institutions', f] as const,
  institution: (id: number) => ['jamb', 'institution', id] as const,
  faculties: ['jamb', 'faculties'] as const,
  courses: (f: CourseFilters) => ['jamb', 'courses', f] as const,
  course: (id: number, f: CourseInstitutionFilters) => ['jamb', 'course', id, f] as const,
  syllabus: ['jamb', 'syllabus'] as const,
  subject: (s: string) => ['jamb', 'syllabus', s] as const,
  faq: ['jamb', 'faq'] as const,
  console: ['console', 'jamb'] as const,
};

export const useJambOverview = () => useQuery({ queryKey: jk.overview, queryFn: ({ signal }) => api.get<JambOverview>('/jamb/overview', undefined, signal), staleTime: STALE });
export const useJambInstitutions = (f: InstitutionFilters) =>
  useQuery({ queryKey: jk.institutions(f), queryFn: ({ signal }) => api.get<JambPage<JambInstitutionRow>>('/jamb/institutions', clean(f), signal), placeholderData: keepPreviousData, staleTime: STALE });
export const useJambInstitution = (id: number) => useQuery({ queryKey: jk.institution(id), queryFn: ({ signal }) => api.get<JambInstitutionDetail>(`/jamb/institutions/${id}`, undefined, signal), enabled: Number.isFinite(id), staleTime: STALE });
export const useJambFaculties = () => useQuery({ queryKey: jk.faculties, queryFn: ({ signal }) => api.get<JambFacultyRow[]>('/jamb/faculties', undefined, signal), staleTime: STALE });
export const useJambCourses = (f: CourseFilters, enabled = true) =>
  useQuery({ queryKey: jk.courses(f), queryFn: ({ signal }) => api.get<JambPage<JambCourseRow>>('/jamb/courses', clean(f), signal), placeholderData: keepPreviousData, staleTime: STALE, enabled });
export const useJambCourse = (id: number, f: CourseInstitutionFilters) =>
  useQuery({ queryKey: jk.course(id, f), queryFn: ({ signal }) => api.get<JambCourseDetail>(`/jamb/courses/${id}`, clean(f), signal), enabled: Number.isFinite(id), placeholderData: keepPreviousData, staleTime: STALE });
export const useJambSyllabus = () => useQuery({ queryKey: jk.syllabus, queryFn: ({ signal }) => api.get<JambSyllabusSubject[]>('/jamb/syllabus', undefined, signal), staleTime: STALE });
export const useJambSubject = (subject: string) =>
  useQuery({ queryKey: jk.subject(subject), queryFn: ({ signal }) => api.get<JambSyllabusDetail>(`/jamb/syllabus/${encodeURIComponent(subject)}`, undefined, signal), enabled: !!subject, staleTime: STALE });
export const useJambFaq = () => useQuery({ queryKey: jk.faq, queryFn: ({ signal }) => api.get<JambFaq>('/jamb/faq', undefined, signal), staleTime: Infinity });
export const useJambCheck = () => useMutation({ meta: { silent: true }, mutationFn: (body: JambCheckInput) => api.post<JambCheckResult>('/jamb/check', body) });

export interface JambConsoleStatus extends JambInstallStatus {
  counts: { institutions: number; programmes: number; courses: number; texts: number; withFaculty: number };
  careerCourses: { total: number; linked: number };
}
export const useJambConsoleStatus = () => useQuery({ queryKey: jk.console, queryFn: ({ signal }) => api.get<JambConsoleStatus>('/platform/jamb/status', undefined, signal) });
