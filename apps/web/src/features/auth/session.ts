import type { AuthResponse, LoginInput } from '@aischool/shared';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { queryClient } from '@/lib/query-client';

export function useLogin() {
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation({
    mutationFn: (input: LoginInput) => api.post<AuthResponse>('/auth/login', input, { noRefresh: true }),
    meta: { silent: true },
    onSuccess: (session) => {
      queryClient.clear();
      setSession(session);
    },
  });
}

export function useSignOut() {
  const navigate = useNavigate();
  return async () => {
    try {
      await api.post('/auth/logout', undefined, { noRefresh: true });
    } catch {
      /* the local session is cleared regardless */
    }
    useAuthStore.getState().clear();
    queryClient.clear();
    navigate('/login', { replace: true });
    toast.success('Signed out');
  };
}

export function useSwitchTenant() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation({
    mutationFn: (tenantId: string) => api.post<AuthResponse>('/auth/switch-tenant', { tenantId }),
    onSuccess: (session) => {
      queryClient.clear();
      setSession(session);
      navigate('/', { replace: true });
      toast.success(`Switched to ${session.tenant?.name ?? 'school'}`);
    },
  });
}
