import type { MyConsentStatus } from '@aischool/shared';
import { ExternalLink, LogOut, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { BrandMark } from '@/components/layout/brand';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { CONSENT_REQUIRED_EVENT, errorMessage } from '@/lib/api';
import { hasPermission, useAuthStore } from '@/lib/auth-store';
import { formatDate } from '@/lib/format';
import { useDocumentTitle } from '@/lib/hooks';
import { useSignOut } from '../auth/session';
import { useAcceptConsent, useMyConsent } from './api';

const DISMISS_KEY = 'ais-consent-banner-dismissed';

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/** What the parent is agreeing to: the notice in brief, the optional AI features this school uses, and the checkbox. */
export function ConsentForm({ status, onDone }: { status: MyConsentStatus; onDone?: () => void }) {
  const accept = useAcceptConsent();
  const [agree, setAgree] = useState(false);
  const kids = status.children.length ? status.children.join(', ') : 'your child(ren)';
  const optional = [
    status.features.aiTutor && 'the AI tutor, which helps your child learn and keeps their conversations so the school can review them',
    status.features.parentAi && 'the parent AI assistant, which answers your questions about your own children',
    status.features.whatsappAssistant && 'the WhatsApp parent assistant (send STOP to the school’s number to turn it off)',
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-5 text-[14px] leading-relaxed">
      <ul className="space-y-2">
        {[
          `${status.schoolName} uses AI School OS to keep school records for ${kids}: class, attendance, homework, results, fees and the health details needed to keep them safe.`,
          'The school is in charge of this information. The company that runs AI School OS only handles it for the school.',
          'Only people who need it can see it. Other children can never see your child’s records.',
          'Some information is handled by trusted service providers, including AI providers outside Nigeria, only to provide the service.',
          'You can ask the school to see, correct or delete information, and you can withdraw this consent at any time in Settings → Privacy & consent.',
        ].map((t) => (
          <li key={t} className="flex gap-2.5">
            <span aria-hidden className="mt-[9px] size-1.5 shrink-0 rounded-full bg-brand/70" />
            <span>{t}</span>
          </li>
        ))}
      </ul>

      {optional.length > 0 && (
        <div className="rounded-xl border border-ai-2/25 bg-muted/40 px-4 py-3">
          <p className="flex items-center gap-2 text-[13px] font-semibold">
            <Sparkles className="size-4 text-ai-2" aria-hidden /> AI features this school uses
          </p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[13px] text-muted-foreground">
            {optional.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
          <p className="mt-2 text-[12.5px] text-muted-foreground">
            Information goes to the AI provider only to answer the request and is not used to train AI models. Staff check AI suggestions about your child.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
        <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-brand underline underline-offset-2">
          Read the full privacy notice <ExternalLink className="size-3.5" />
        </a>
        <a href="/legal/children" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-brand underline underline-offset-2">
          How AI is used with children’s data <ExternalLink className="size-3.5" />
        </a>
      </div>

      <label htmlFor="consent-agree" className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <Checkbox id="consent-agree" checked={agree} onCheckedChange={(v) => setAgree(v === true)} className="mt-0.5" />
        <span className="text-[13.5px]">
          <span className="font-semibold">I agree on behalf of my child(ren)</span>
          <span className="block text-muted-foreground">
            I am the parent or guardian, I have read the privacy notice (version {status.currentVersion}), and I agree to {status.schoolName} using AI School OS for{' '}
            {kids} as it describes.
          </span>
        </span>
      </label>

      {accept.error && (
        <p role="alert" className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2.5 text-[13px] font-medium text-danger">
          {errorMessage(accept.error)}
        </p>
      )}

      <Button size="lg" className="w-full sm:w-auto" disabled={!agree} loading={accept.isPending} onClick={() => accept.mutate(status.currentVersion, { onSuccess: () => onDone?.() })}>
        <ShieldCheck /> Accept and continue
      </Button>
    </div>
  );
}

function ConsentScreen({ status }: { status: MyConsentStatus }) {
  useDocumentTitle('Your child’s data');
  const signOut = useSignOut();
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
              <CardTitle className="text-[20px]">
                {status.state === 'OUTDATED' ? 'Our privacy notice has changed' : 'Before you continue: your child’s data'}
              </CardTitle>
              <CardDescription>
                {status.state === 'OUTDATED'
                  ? `You agreed to an earlier version${status.consentedAt ? ` on ${formatDate(status.consentedAt)}` : ''}. Please read the summary and agree to the current one.`
                  : status.state === 'WITHDRAWN'
                    ? `You withdrew your consent${status.withdrawnAt ? ` on ${formatDate(status.withdrawnAt)}` : ''}. ${status.schoolName} asks parents to agree before using the portal.`
                    : `${status.schoolName} asks every parent to read how their child’s information is used, once, before using the portal.`}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ConsentForm status={status} />
          </CardContent>
        </Card>
        <p className="mt-4 text-center text-[12px] text-muted-foreground">
          Questions? Contact {status.schoolName}. You can also{' '}
          <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" className="underline">
            read all the documents
          </a>
          .
        </p>
      </div>
    </div>
  );
}

/**
 * Wraps the signed-in app for parents. When the school requires consent and
 * the parent hasn't accepted the current notice, only the consent screen is
 * shown. When it is optional (or the person is also staff), a dismissible
 * banner points to Settings → Privacy & consent instead.
 *
 * The server enforces the same rule: a held parent's requests for their
 * children's data answer 403 CONSENT_REQUIRED, which re-checks the status here
 * and shows the consent screen (e.g. the notice changed during a session).
 */
export function ConsentGate({ children }: { children: ReactNode }) {
  const isParent = useAuthStore((s) => hasPermission(s.me, 'family.manage'));
  const status = useMyConsent(isParent);
  const { pathname } = useLocation();
  const [dismissed, setDismissed] = useState(readDismissed);
  const [held, setHeld] = useState(false);
  const { refetch } = status;

  useEffect(() => {
    if (!isParent) return;
    const onRequired = () => {
      setHeld(true);
      void refetch();
    };
    window.addEventListener(CONSENT_REQUIRED_EVENT, onRequired);
    return () => window.removeEventListener(CONSENT_REQUIRED_EVENT, onRequired);
  }, [isParent, refetch]);

  if (!isParent || !status.data?.applies) return <>{children}</>;
  const s = status.data;
  if (s.blocking || (held && s.required && s.state !== 'CURRENT')) return <ConsentScreen status={s} />;

  const showBanner = s.state !== 'CURRENT' && !dismissed && pathname !== '/settings/privacy';
  return (
    <>
      {showBanner && (
        <div className="flex items-center gap-3 border-b border-brand/20 bg-brand-soft px-4 py-2 text-[13px] text-brand" role="status">
          <ShieldCheck className="size-4 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1">
            <span className="font-semibold">Your child’s data:</span> please read how {s.schoolName} uses it.{' '}
            <Link to="/settings/privacy" className="font-semibold underline underline-offset-2">
              Review and agree
            </Link>
          </p>
          <button
            type="button"
            aria-label="Dismiss"
            className="rounded-md p-1 hover:bg-brand/10"
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
