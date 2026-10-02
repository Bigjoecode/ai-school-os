import { PLATFORM_AREAS, type AuthResponse, type MeResponse, type Permission, type PlatformArea, type PlatformRole } from '@aischool/shared';
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

/**
 * Whether the current school's plan (or a beta rollout) has this module or
 * flag switched on. Sessions without a features list are treated as all-on.
 */
export function hasFeature(me: MeResponse | null, feature: string): boolean {
  if (!me?.tenant) return false;
  if (!Array.isArray(me.features)) return true;
  return me.features.includes(feature);
}

export function useHasFeature(feature: string): boolean {
  return useAuthStore((s) => hasFeature(s.me, feature));
}

/** Platform staff may open a console area when their role is listed for it. */
export function canOpenArea(me: MeResponse | null, area: PlatformArea): boolean {
  const role = me?.user.platformRole;
  return !!role && (PLATFORM_AREAS[area] as readonly PlatformRole[]).includes(role);
}

export function useCanOpenArea(area: PlatformArea): boolean {
  return useAuthStore((s) => canOpenArea(s.me, area));
}

export function usePlatformRole(): PlatformRole | null {
  return useAuthStore((s) => s.me?.user.platformRole ?? null);
}
