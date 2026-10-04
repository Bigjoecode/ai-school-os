import { LogOut, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { BrandMark } from '@/components/layout/brand';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/lib/auth-store';
import { useDocumentTitle } from '@/lib/hooks';
import { queryClient } from '@/lib/query-client';
import { useTwoFactorStatus } from '../settings/security-api';
import { TwoFactorSetup } from '../settings/two-factor-setup';
import { useSignOut } from './session';

const DISMISS_KEY = 'ais-2fa-banner-dismissed';

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/** Full-screen set-up when the school (or the platform) requires two-step sign-in and it isn't on yet. */
function ForcedSetup({ reason, onDone }: { reason: string | null; onDone: () => void }) {
  useDocumentTitle('Set up two-step sign-in');
  const signOut = useSignOut();
  const me = useAuthStore((s) => s.me);
  return (
    <div className="min-h-dvh bg-background px-4 py-8 sm:py-14">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <BrandMark />
            <span className="font-display text-[15px] font-semibold tracking-tight">
              AI School <span className="text-ai-gradient">OS</span>
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            <LogOut /> Sign out
          </Button>
        </div>
        <Card>
          <CardHeader>
            <div>
              <span className="mb-3 grid size-11 place-items-center rounded-xl bg-brand-soft text-brand">
                <ShieldCheck className="size-5" />
              </span>
              <CardTitle className="text-[20px]">Set up two-step sign-in to continue</CardTitle>
              <CardDescription>
                {reason ?? 'Two-step sign-in is required for your account.'} It takes about a minute: you’ll need your phone and an authenticator app.
                {me?.user.email && <span className="mt-1 block">Signed in as {me.user.email}</span>}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <TwoFactorSetup onDone={onDone} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/**
 * Wraps the signed-in app. When two-step sign-in is required and not set up,
 * only the set-up screen is shown (the API enforces the same rule). When it is
 * merely recommended (platform staff, powerful school roles), a dismissible
 * banner points to Settings → Security.
 */
export function TwoFactorGate({ children }: { children: ReactNode }) {
  const authed = useAuthStore((s) => s.status === 'authenticated');
  const status = useTwoFactorStatus();
  const { pathname } = useLocation();
  const [dismissed, setDismissed] = useState(readDismissed);
  const mustSetUp = !!status.data?.required && !status.data.enabled;
  // Stay on the set-up screen until the user has seen their recovery codes, even if the status refreshes meanwhile.
  const [forcing, setForcing] = useState(false);
  useEffect(() => {
    if (mustSetUp) setForcing(true);
  }, [mustSetUp]);

  if (!authed || !status.data) return <>{children}</>;
  const s = status.data;
  if (mustSetUp || forcing) {
    return (
      <ForcedSetup
        reason={s.reason}
        onDone={() => {
          setForcing(false);
          // Anything that failed while blocked loads again now.
          void queryClient.invalidateQueries();
        }}
      />
    );
  }

  const showBanner = s.recommended && !s.enabled && !dismissed && pathname !== '/settings/security';
  return (
    <>
      {showBanner && (
        <div className="flex items-center gap-3 border-b border-warning/30 bg-warning-soft px-4 py-2 text-[13px] text-warning" role="status">
          <ShieldAlert className="size-4 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1">
            <span className="font-semibold">Protect your account:</span> {s.reason ?? 'turn on two-step sign-in.'}{' '}
            <Link to="/settings/security" className="font-semibold underline underline-offset-2">
              Set it up
            </Link>
          </p>
          <button
            type="button"
            aria-label="Dismiss"
            className="rounded-md p-1 hover:bg-warning/10"
            onClick={() => {
              setDismissed(true);
              try {
                sessionStorage.setItem(DISMISS_KEY, '1');
              } catch {
                /* private mode */
              }
            }}
          >
            <X className="size-4" />
          </button>
        </div>
      )}
      {children}
    </>
  );
}
