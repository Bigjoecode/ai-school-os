import { QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect } from 'react';
import { Toaster } from 'sonner';
import { BootLoader } from '@/components/layout/boot-loader';
import { TooltipProvider } from '@/components/ui/tooltip';
import { refreshSession } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { queryClient } from '@/lib/query-client';
import { useThemeStore } from '@/lib/theme';

/** Restore the session from the refresh cookie before rendering the app. */
function SessionGate({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  useEffect(() => {
    if (useAuthStore.getState().status !== 'booting') return;
    void refreshSession().then((session) => {
      if (!session && useAuthStore.getState().status === 'booting') useAuthStore.getState().clear();
    });
  }, []);
  if (status === 'booting') return <BootLoader />;
  return <>{children}</>;
}

export function Providers({ children }: { children: ReactNode }) {
  const theme = useThemeStore((s) => s.resolved);
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={250} skipDelayDuration={100}>
        <SessionGate>{children}</SessionGate>
        <Toaster
          theme={theme}
          position="bottom-right"
          richColors
          closeButton
          toastOptions={{ className: 'font-sans !rounded-xl !shadow-pop' }}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
