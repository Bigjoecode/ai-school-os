import type {
  BackupExportRow,
  RecoveryCodesResponse,
  SecurityPolicy,
  SecurityPolicyResponse,
  TwoFactorSetupResponse,
  TwoFactorStatus,
} from '@aischool/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { queryClient } from '@/lib/query-client';

const statusKey = (userId?: string, tenantId?: string | null) => ['security', '2fa-status', userId ?? '', tenantId ?? ''] as const;
const policyKey = ['security', 'policy'] as const;

/** The signed-in user's two-step sign-in state, and whether their school or role requires it. */
export function useTwoFactorStatus() {
  const me = useAuthStore((s) => s.me);
  return useQuery({
    queryKey: statusKey(me?.user.id, me?.tenant?.id ?? null),
    queryFn: ({ signal }) => api.get<TwoFactorStatus>('/auth/2fa/status', undefined, signal),
    enabled: !!me,
    staleTime: 60_000,
    // A school can switch the policy on mid-session; notice within a few minutes.
    refetchInterval: 5 * 60_000,
  });
}

const refreshStatus = () => queryClient.invalidateQueries({ queryKey: ['security'] });

export function useStartTwoFactorSetup() {
  return useMutation({ mutationFn: () => api.post<TwoFactorSetupResponse>('/auth/2fa/setup') });
}

export function useEnableTwoFactor() {
  return useMutation({
    mutationFn: (code: string) => api.post<RecoveryCodesResponse>('/auth/2fa/enable', { code }),
    meta: { silent: true },
  });
}

export function useDisableTwoFactor() {
  return useMutation({
    mutationFn: (input: { password: string; code: string }) => api.post('/auth/2fa/disable', input),
    meta: { silent: true },
    onSuccess: () => {
      void refreshStatus();
      toast.success('Two-step sign-in is off');
    },
  });
}

export function useRegenerateRecoveryCodes() {
  return useMutation({
    mutationFn: (code: string) => api.post<RecoveryCodesResponse>('/auth/2fa/recovery-codes', { code }),
    meta: { silent: true },
    onSuccess: () => void refreshStatus(),
  });
}

export { refreshStatus as refreshTwoFactorStatus };

export function useSecurityPolicy(enabled: boolean) {
  return useQuery({
    queryKey: policyKey,
    queryFn: ({ signal }) => api.get<SecurityPolicyResponse>('/auth/2fa/policy', undefined, signal),
    enabled,
  });
}

export function useSaveSecurityPolicy() {
  return useMutation({
    mutationFn: (policy: SecurityPolicy) => api.put<SecurityPolicy>('/auth/2fa/policy', policy),
    onSuccess: (p) => {
      void refreshStatus();
      toast.success(p.requireTwoFactorForPowerfulStaff ? 'Two-step sign-in is now required for powerful roles' : 'Two-step sign-in is now optional');
    },
  });
}

export function useResetMemberTwoFactor() {
  return useMutation({
    mutationFn: (userId: string) => api.post<{ ok: true; changed: boolean }>(`/auth/2fa/reset/${userId}`),
    onSuccess: () => {
      void refreshStatus();
      toast.success('Two-step sign-in was reset. They will set it up again next time they sign in.');
    },
  });
}

export function useBackupHistory() {
  return useQuery({
    queryKey: ['backup', 'exports'],
    queryFn: ({ signal }) => api.get<BackupExportRow[]>('/backup/exports', undefined, signal),
  });
}
