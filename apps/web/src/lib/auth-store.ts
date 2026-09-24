import type { AuthResponse, MeResponse, Permission } from '@aischool/shared';
import { create } from 'zustand';

export type AuthStatus = 'booting' | 'authenticated' | 'anonymous';

interface AuthState {
  status: AuthStatus;
  /** Kept in memory only — the refresh token lives in an httpOnly cookie. */
  accessToken: string | null;
  me: MeResponse | null;
  setSession: (session: AuthResponse) => void;
  setMe: (me: MeResponse) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'booting',
  accessToken: null,
  me: null,
  setSession: (session) => {
    const { accessToken, expiresIn: _expiresIn, ...me } = session;
    set({ status: 'authenticated', accessToken, me });
  },
  setMe: (me) => set({ me }),
  clear: () => set({ status: 'anonymous', accessToken: null, me: null }),
}));

export function useMe(): MeResponse | null {
  return useAuthStore((s) => s.me);
}

export function hasPermission(me: MeResponse | null, permission: Permission): boolean {
  return !!me && me.permissions.includes(permission);
}

export function useCan(permission: Permission): boolean {
  return useAuthStore((s) => hasPermission(s.me, permission));
}

export function useIsSuperAdmin(): boolean {
  return useAuthStore((s) => s.me?.user.platformRole === 'SUPER_ADMIN');
}
