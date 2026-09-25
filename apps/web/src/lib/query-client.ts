import { MutationCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, errorMessage } from './api';

declare module '@tanstack/react-query' {
  interface Register {
    defaultError: Error;
    mutationMeta: {
      /** Don't toast errors — the caller renders them itself. */
      silent?: boolean;
    };
  }
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, error) => {
        if (error instanceof ApiError && error.status > 0 && error.status < 500) return false;
        return count < 2;
      },
    },
  },
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      if (mutation.meta?.silent) return;
      if (error instanceof ApiError && error.status === 401) return;
      toast.error(errorMessage(error));
    },
  }),
});

/** Canonical query keys, one namespace per resource. */
export const qk = {
  overview: ['overview'] as const,
  school: ['school'] as const,
  structure: ['academics', 'structure'] as const,
  students: (params?: object) => (params ? (['students', params] as const) : (['students'] as const)),
  student: (id: string) => ['student', id] as const,
  guardians: (params?: object) => (params ? (['guardians', params] as const) : (['guardians'] as const)),
  staff: (params?: object) => (params ? (['staff', params] as const) : (['staff'] as const)),
  roles: ['roles'] as const,
  users: ['users'] as const,
  audit: (params?: object) => (params ? (['audit', params] as const) : (['audit'] as const)),
  aiStatus: ['ai', 'status'] as const,
  tenants: ['platform', 'tenants'] as const,
  curricula: (params?: object) => (params ? (['curricula', params] as const) : (['curricula'] as const)),
  curriculum: (id: string) => ['curriculum', id] as const,
  schemes: (params?: object) => (params ? (['schemes', params] as const) : (['schemes'] as const)),
  scheme: (id: string) => ['scheme', id] as const,
  lessons: (params?: object) => (params ? (['lessons', params] as const) : (['lessons'] as const)),
  lesson: (id: string) => ['lesson', id] as const,
  questions: (params?: object) => (params ? (['questions', params] as const) : (['questions'] as const)),
  questionTopics: (params?: object) => (params ? (['question-topics', params] as const) : (['question-topics'] as const)),
  papers: (params?: object) => (params ? (['papers', params] as const) : (['papers'] as const)),
  paper: (id: string) => ['paper', id] as const,
  aiJob: (id: string) => ['ai', 'job', id] as const,
  assessmentSettings: ['assessment', 'settings'] as const,
  scoreSheet: (params?: object) => (params ? (['score-sheet', params] as const) : (['score-sheet'] as const)),
  broadsheet: (params?: object) => (params ? (['broadsheet', params] as const) : (['broadsheet'] as const)),
  analysis: (params?: object) => (params ? (['analysis', params] as const) : (['analysis'] as const)),
  reportCards: (params?: object) => (params ? (['report-cards', params] as const) : (['report-cards'] as const)),
  reportCard: (params?: object) => (params ? (['report-card', params] as const) : (['report-card'] as const)),
  timetableSetup: ['timetable', 'setup'] as const,
  timetables: (params?: object) => (params ? (['timetables', params] as const) : (['timetables'] as const)),
  timetable: (id: string) => ['timetable', 'detail', id] as const,
  timetableToday: ['timetable', 'today'] as const,
  attendance: ['attendance'] as const,
  attendanceSettings: ['attendance', 'settings'] as const,
  attendanceToday: (date?: string) => ['attendance', 'today', date ?? null] as const,
  attendanceRegister: (classArmId: string, date?: string) => ['attendance', 'register', classArmId, date ?? null] as const,
  attendanceStudent: (id: string, termId?: string) => ['attendance', 'student', id, termId ?? null] as const,
  attendanceClassReport: (classArmId: string, termId?: string) => ['attendance', 'class-report', classArmId, termId ?? null] as const,
  attendanceSchoolReport: (termId?: string) => ['attendance', 'school-report', termId ?? null] as const,
  attendanceStaff: (date?: string) => ['attendance', 'staff', date ?? null] as const,
  attendanceKiosk: ['attendance', 'kiosk'] as const,
  attendanceMe: ['attendance', 'me'] as const,
};
