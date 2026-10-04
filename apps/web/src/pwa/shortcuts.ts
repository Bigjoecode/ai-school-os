import type { MeResponse, Permission } from '@aischool/shared';
import { useAuthStore } from '@/lib/auth-store';

/**
 * The installed app's shortcuts (long-press the icon) open "/?shortcut=<name>". The right page
 * depends on who is signed in — a parent's fees are not a bursar's — so it's chosen here.
 */
export function shortcutPath(name: string, me: MeResponse): string {
  const has = (p: Permission) => me.permissions.includes(p);
  const family = has('family.manage') || has('learning.use');
  switch (name) {
    case 'homework':
      return has('homework.manage') ? '/homework' : '/learning/homework';
    case 'tutor':
      return has('learning.use') ? '/learn/tutor' : has('ai.use') ? '/ai' : '/';
    case 'fees':
      return has('family.manage') ? '/school/fees' : has('finance.read') ? '/fees' : '/';
    case 'attendance':
      return family ? '/school/attendance' : has('attendance.read') ? '/attendance' : '/';
    default:
      return '/';
  }
}

/** Once signed in, moves from "/?shortcut=…" to the right page. */
export function handleShortcut(navigate: (to: string, opts: { replace: boolean }) => unknown) {
  const name = new URLSearchParams(window.location.search).get('shortcut');
  if (!name || window.location.pathname !== '/') return;
  const go = (): boolean => {
    const { status, me } = useAuthStore.getState();
    if (status === 'anonymous') return true;
    if (status !== 'authenticated' || !me) return false;
    void navigate(shortcutPath(name, me), { replace: true });
    return true;
  };
  if (go()) return;
  const stop = useAuthStore.subscribe(() => {
    if (go()) stop();
  });
}
