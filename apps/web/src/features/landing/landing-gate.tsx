import { lazy, type ReactNode, Suspense, useRef } from 'react';
import { useLocation } from 'react-router';
import { RequireAuth } from '@/app/guards';
import { BootLoader } from '@/components/layout/boot-loader';
import { useAuthStore } from '@/lib/auth-store';
import { isStandalone } from '@/pwa/store';

const LandingPage = lazy(() => import('./landing-page'));

/**
 * The portal root: signed-in people get the app (exactly as RequireAuth), signed-out visitors on
 * `/` itself get the public product landing page. Everything else is unchanged:
 * - any other path while signed out still goes to /login (deep links keep their `from`);
 * - the installed app (PWA, Play Store or App Store shell) still opens on /login;
 * - if the session ends while someone is using the app on `/`, they go to /login, not the landing page;
 * - school website domains never reach this router (main.tsx renders their site instead).
 */
export function RequireAuthOrLanding({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const { pathname } = useLocation();
  const wasAuthed = useRef(false);
  if (status === 'authenticated') wasAuthed.current = true;
  if (status === 'anonymous' && pathname === '/' && !wasAuthed.current && !isStandalone()) {
    return (
      <Suspense fallback={<BootLoader label="Loading…" />}>
        <LandingPage />
      </Suspense>
    );
  }
  return <RequireAuth>{children}</RequireAuth>;
}
