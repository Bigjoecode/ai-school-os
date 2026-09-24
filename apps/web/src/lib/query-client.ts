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
};
