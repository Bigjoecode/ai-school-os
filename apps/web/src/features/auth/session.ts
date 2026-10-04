import type { AuthResponse, LoginInput, TwoFactorChallengeResponse, TwoFactorLoginInput } from '@aischool/shared';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { queryClient } from '@/lib/query-client';

export type LoginResult = AuthResponse | TwoFactorChallengeResponse;

export function isTwoFactorChallenge(r: LoginResult): r is TwoFactorChallengeResponse {
  return 'twoFactorRequired' in r && r.twoFactorRequired === true;
}

/** Password step. With two-step sign-in on, the result is a challenge and no session is stored yet. */
export function useLogin() {
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation({
    mutationFn: (input: LoginInput) => api.post<LoginResult>('/auth/login', input, { noRefresh: true }),
    meta: { silent: true },
    onSuccess: (result) => {
      if (isTwoFactorChallenge(result)) return;
      queryClient.clear();
      setSession(result);
    },
  });
}

/** Second step: the code from the authenticator app (or a recovery code). */
export function useCompleteTwoFactor() {
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation({
    mutationFn: (input: TwoFactorLoginInput) => api.post<AuthResponse>('/auth/2fa', input, { noRefresh: true }),
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
