import { QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect } from 'react';
import { Toaster } from 'sonner';
import { BootLoader } from '@/components/layout/boot-loader';
import { TooltipProvider } from '@/components/ui/tooltip';
import { refreshSession } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { queryClient } from '@/lib/query-client';
import { useThemeStore } from '@/lib/theme';
import { openSavedSession } from '@/pwa/session';

/** Restore the session from the refresh cookie before rendering the app. */
function SessionGate({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  useEffect(() => {
    if (useAuthStore.getState().status !== 'booting') return;
    // No connection (or a very slow one): open with this device's saved sign-in while the real one restores.
    const fallback = window.setTimeout(() => void openSavedSession(), navigator.onLine ? 8000 : 0);
    void refreshSession().then(async (session) => {
      window.clearTimeout(fallback);
      if (session || useAuthStore.getState().status !== 'booting') return;
      if (await openSavedSession({ verifyOffline: true })) return;
      if (useAuthStore.getState().status === 'booting') useAuthStore.getState().clear();
    });
  }, []);
  // Public pages (parent payments, QR verification, school websites) render straight away; the session restore runs in the background.
  const isPublic = typeof window !== 'undefined' && /^\/(pay|verify|s)\//.test(window.location.pathname);
  if (status === 'booting' && !isPublic) return <BootLoader />;
  return <>{children}</>;
}

/** `publicOnly`: a school's website on its own domain — no portal session at all. */
export function Providers({ children, publicOnly }: { children: ReactNode; publicOnly?: boolean }) {
  const theme = useThemeStore((s) => s.resolved);
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={250} skipDelayDuration={100}>
        {publicOnly ? children : <SessionGate>{children}</SessionGate>}
        <Toaster
          theme={publicOnly ? 'light' : theme}
          position="bottom-right"
          richColors
          closeButton
          toastOptions={{ className: 'font-sans !rounded-xl !shadow-pop' }}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
