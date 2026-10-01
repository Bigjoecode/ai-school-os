import { bbbSettingsSchema, type LiveIntegrationStatus, type LiveProvider, zoomSettingsSchema } from '@aischool/shared';
import { Check, Info, LogIn, Pencil, Unplug } from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useCan } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { apiFieldErrors, FormError, zodErrors } from '../operations/ui';
import { BackLink } from '../planning/ui';
import { useDisconnectProvider, useGoogleConnect, useLiveIntegrations, useSaveBbb, useSaveZoom } from './api';
import { ProviderIcon } from './ui';

export default function LiveSettingsPage() {
  const canManage = useCan('live.manage');
  const q = useLiveIntegrations();
  useGoogleReturn();
  const st = (p: LiveProvider) => q.data?.find((x) => x.provider === p);

  return (
    <Page className="max-w-5xl">
      <BackLink to="/live">Live classes</BackLink>
      <PageHeader
        className="mt-3"
        title="Live class settings"
        description={canManage ? 'Connect the meeting services your teachers use. Each class can use any connected service, or a plain meeting link.' : 'How this school runs live classes. Only admins can change these.'}
      />
      {q.error && !q.data ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i} className="space-y-3 p-5">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-9 w-full" />
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
          <GoogleCard status={st('GOOGLE_MEET')} canManage={canManage} />
          <ZoomCard status={st('ZOOM')} canManage={canManage} />
          <BbbCard status={st('BBB')} canManage={canManage} />
          <Card className="p-5">
            <Heading provider="EXTERNAL" title="Meeting link" on detail="Always available" />
            <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
              Teams, Jitsi, a personal Zoom room — paste any link when scheduling. Students join from their portal and are marked present when they do. Recordings and transcripts can’t be fetched automatically, so add your notes after the class for the AI summary.
            </p>
          </Card>
        </div>
      )}
    </Page>
  );
}

/** Google sends people back here with ?google=connected|error|access_denied. */
function useGoogleReturn() {
  const [params, setParams] = useSearchParams();
  const handled = useRef(false);
  useEffect(() => {
    const g = params.get('google');
    if (!g || handled.current) return;
    handled.current = true;
    if (g === 'connected') toast.success('Google Meet connected — new classes can use Meet');
    else if (g === 'access_denied') toast.error('Google sign-in was cancelled, so Meet isn’t connected');
    else toast.error(params.get('message') || 'Couldn’t connect Google Meet. Please try again.');
    setParams({}, { replace: true });
  }, [params, setParams]);
}

function Heading({ provider, title, on, detail }: { provider: LiveProvider; title: string; on: boolean; detail?: string | null }) {
  return (
    <div className="flex items-start gap-3">
      <ProviderIcon provider={provider} className={cn(!on && 'opacity-70')} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
          {title}
          {on ? (
            <Badge variant="success" dot>
              Connected
            </Badge>
          ) : (
            <Badge variant="outline">Not set up</Badge>
          )}
        </p>
        {detail && <p className="mt-0.5 break-words text-[12.5px] text-muted-foreground">{detail}</p>}
      </div>
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 flex items-start gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function DisconnectButton({ provider, title }: { provider: LiveProvider; title: string }) {
  const [open, setOpen] = useState(false);
  const disconnect = useDisconnectProvider();
  return (
    <>
      <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={() => setOpen(true)}>
        <Unplug /> Disconnect
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Disconnect ${title}?`}
        description="Classes already scheduled keep their links, but you can’t schedule new ones on it, or fetch attendance and recordings, until you connect it again. Saved keys are deleted."
        confirmLabel="Disconnect"
        loading={disconnect.isPending}
        onConfirm={() =>
          disconnect.mutate(provider, {
            onSuccess: () => {
              setOpen(false);
              toast.success(`${title} disconnected`);
            },
          })
        }
      />
    </>
  );
}

// ------------------------------------------------------------------ Google Meet

function GoogleCard({ status, canManage }: { status?: LiveIntegrationStatus; canManage: boolean }) {
  const connect = useGoogleConnect();
  const on = !!status?.connected;
  return (
    <Card className="p-5">
      <Heading provider="GOOGLE_MEET" title="Google Meet" on={on} detail={on ? `Connected as ${status?.detail ?? 'your Google account'}` : null} />
      <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
        Sign in once with the school’s <strong className="font-medium text-foreground">Google Workspace</strong> account. We create a Calendar event with a Meet link for each class, and fetch who joined afterwards.
      </p>
      <Note>
        Attendance reports need Google Workspace (not a personal Gmail). Recordings and transcripts depend on your Workspace edition — Business Standard, Education Plus or higher — and the teacher pressing record in Meet.
      </Note>
      {status?.unavailableReason && !on && (
        <p className="mt-3 rounded-xl border border-warning/30 bg-warning-soft/50 px-3 py-2.5 text-[12px] leading-relaxed">{status.unavailableReason}</p>
      )}
      {canManage ? (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
          {on ? (
            <>
              <Button variant="outline" size="sm" loading={connect.isPending} onClick={() => connect.mutate()}>
                {!connect.isPending && <LogIn />} Reconnect
              </Button>
              <DisconnectButton provider="GOOGLE_MEET" title="Google Meet" />
            </>
          ) : (
            <Button loading={connect.isPending} disabled={!!status?.unavailableReason} onClick={() => connect.mutate()}>
              {!connect.isPending && <GoogleMark />} Connect with Google
            </Button>
          )}
        </div>
      ) : (
        !on && <p className="mt-3 text-[12px] text-muted-foreground">Ask an admin to connect it.</p>
      )}
    </Card>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.8Z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z" />
    </svg>
  );
}

// ------------------------------------------------------------------ shared shell

function KeyedCard({ provider, title, status, canManage, intro, note, form }: { provider: LiveProvider; title: string; status?: LiveIntegrationStatus; canManage: boolean; intro: ReactNode; note: ReactNode; form: (done: () => void) => ReactNode }) {
  const on = !!status?.connected;
  const [editing, setEditing] = useState(!on);
  useEffect(() => {
    if (!on) setEditing(true);
  }, [on]);
  return (
    <Card className="p-5">
      <Heading provider={provider} title={title} on={on} detail={on ? status?.detail : null} />
      <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">{intro}</p>
      <Note>{note}</Note>
      {canManage ? (
        editing ? (
          <div className="mt-4 border-t border-border pt-4">
            {form(() => setEditing(false))}
            {on && (
              <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => setEditing(false)}>
                Keep current settings
              </Button>
            )}
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil /> Change details
            </Button>
            <DisconnectButton provider={provider} title={title} />
          </div>
        )
      ) : (
        !on && <p className="mt-3 text-[12px] text-muted-foreground">Ask an admin to connect it.</p>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ Zoom

function ZoomCard({ status, canManage }: { status?: LiveIntegrationStatus; canManage: boolean }) {
  return (
    <KeyedCard
      provider="ZOOM"
      title="Zoom"
      status={status}
      canManage={canManage}
      intro={
        <>
          Uses a <strong className="font-medium text-foreground">Server-to-Server OAuth</strong> app on the school’s Zoom account. Teachers start classes as the host; students join from their portal.
        </>
      }
      note={
        <>
          In the Zoom App Marketplace, choose <em>Develop → Build app → Server-to-Server OAuth</em>, then add the scopes{' '}
          <span className="font-mono text-foreground">meeting:write</span>, <span className="font-mono text-foreground">meeting:read</span>, <span className="font-mono text-foreground">recording:read</span> and{' '}
          <span className="font-mono text-foreground">report:read</span> (for attendance) and activate it. Attendance reports and cloud recordings need a Pro plan or higher.
        </>
      }
      form={(done) => <ZoomForm onDone={done} />}
    />
  );
}

function ZoomForm({ onDone }: { onDone: () => void }) {
  const save = useSaveZoom();
  const [v, setV] = useState({ accountId: '', clientId: '', clientSecret: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<typeof v>) => setV((p) => ({ ...p, ...patch }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = zoomSettingsSchema.safeParse(v);
    if (!parsed.success) return setErrors(zodErrors(parsed.error.issues));
    setErrors({});
    save.mutate(parsed.data, {
      onSuccess: () => {
        toast.success('Zoom connected — we checked the keys with Zoom');
        onDone();
      },
      onError: (err) => setErrors(apiFieldErrors(err)),
    });
  };
  return (
    <form onSubmit={submit} noValidate className="grid gap-3.5">
      <Field label="Account ID" htmlFor="zoom-account" error={errors.accountId}>
        <Input id="zoom-account" value={v.accountId} onChange={(e) => set({ accountId: e.target.value })} autoComplete="off" invalid={!!errors.accountId} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
        <Field label="Client ID" htmlFor="zoom-client" error={errors.clientId}>
          <Input id="zoom-client" value={v.clientId} onChange={(e) => set({ clientId: e.target.value })} autoComplete="off" invalid={!!errors.clientId} />
        </Field>
        <Field label="Client secret" htmlFor="zoom-secret" error={errors.clientSecret} hint="Kept on the server — never shown again.">
          <Input id="zoom-secret" type="password" value={v.clientSecret} onChange={(e) => set({ clientSecret: e.target.value })} autoComplete="new-password" invalid={!!errors.clientSecret} />
        </Field>
      </div>
      <FormError message={errors.form} />
      <Button type="submit" loading={save.isPending} className="justify-self-start">
        {!save.isPending && <Check />} {save.isPending ? 'Checking with Zoom…' : 'Save and connect'}
      </Button>
    </form>
  );
}

// ------------------------------------------------------------------ BigBlueButton

function BbbCard({ status, canManage }: { status?: LiveIntegrationStatus; canManage: boolean }) {
  return (
    <KeyedCard
      provider="BBB"
      title="BigBlueButton"
      status={status}
      canManage={canManage}
      intro="Open-source classrooms on your own server (or a hosting provider’s). Each person gets their own link, so teachers join as moderators automatically."
      note={
        <>
          You need the server’s API URL — usually ending in <span className="font-mono text-foreground">/bigbluebutton/</span> — and its shared secret. On the server, run{' '}
          <span className="font-mono text-foreground">bbb-conf --secret</span> to see both.
        </>
      }
      form={(done) => <BbbForm onDone={done} />}
    />
  );
}

function BbbForm({ onDone }: { onDone: () => void }) {
  const save = useSaveBbb();
  const [v, setV] = useState({ url: '', secret: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<typeof v>) => setV((p) => ({ ...p, ...patch }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = bbbSettingsSchema.safeParse({ url: v.url.trim(), secret: v.secret });
    if (!parsed.success) return setErrors(zodErrors(parsed.error.issues));
    setErrors({});
    save.mutate(parsed.data, {
      onSuccess: () => {
        toast.success('BigBlueButton connected — we checked it with your server');
        onDone();
      },
      onError: (err) => setErrors(apiFieldErrors(err)),
    });
  };
  return (
    <form onSubmit={submit} noValidate className="grid gap-3.5">
      <Field label="Server URL" htmlFor="bbb-url" error={errors.url}>
        <Input id="bbb-url" type="url" inputMode="url" value={v.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://bbb.yourschool.ng/bigbluebutton/" autoComplete="off" invalid={!!errors.url} />
      </Field>
      <Field label="Shared secret" htmlFor="bbb-secret" error={errors.secret} hint="Kept on the server — never shown again.">
        <Input id="bbb-secret" type="password" value={v.secret} onChange={(e) => set({ secret: e.target.value })} autoComplete="new-password" invalid={!!errors.secret} />
      </Field>
      <FormError message={errors.form} />
      <Button type="submit" loading={save.isPending} className="justify-self-start">
        {!save.isPending && <Check />} {save.isPending ? 'Checking your server…' : 'Save and connect'}
      </Button>
    </form>
  );
}

