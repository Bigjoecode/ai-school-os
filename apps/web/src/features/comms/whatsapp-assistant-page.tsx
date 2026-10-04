import {
  type WhatsappAssistantSettingsInput,
  type WhatsappAssistantStatus,
  type WhatsappMessageRow,
  type WhatsappThread,
  type WhatsappThreadRow,
  whatsappAssistantSettingsSchema,
} from '@aischool/shared';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, Bot, Check, CheckCircle2, Circle, Copy, Inbox, KeyRound, MessageCircle, RefreshCw, Send, Settings2, ShieldCheck, UserRound } from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { formatDateTime, formatRelative } from '@/lib/format';
import { queryClient } from '@/lib/query-client';
import { cn } from '@/lib/utils';
import { apiFieldErrors, FormError, zodErrors } from '../operations/ui';
import { BackLink } from '../planning/ui';

// ------------------------------------------------------------------ data

const wk = {
  all: ['comms', 'whatsapp'] as const,
  status: ['comms', 'whatsapp', 'status'] as const,
  threads: ['comms', 'whatsapp', 'threads'] as const,
  thread: (phone: string) => ['comms', 'whatsapp', 'thread', phone] as const,
};

function useAssistantStatus() {
  return useQuery({ queryKey: wk.status, queryFn: ({ signal }) => api.get<WhatsappAssistantStatus>('/comms/whatsapp-assistant', undefined, signal) });
}

function useSaveAssistant() {
  return useMutation({
    meta: { silent: true },
    mutationFn: (input: WhatsappAssistantSettingsInput) => api.put<WhatsappAssistantStatus>('/comms/whatsapp-assistant', input),
    onSuccess: (s) => {
      queryClient.setQueryData(wk.status, s);
      void queryClient.invalidateQueries({ queryKey: ['comms', 'channels'] });
    },
  });
}

function useThreads() {
  return useQuery({
    queryKey: wk.threads,
    queryFn: ({ signal }) => api.get<WhatsappThreadRow[]>('/comms/whatsapp-assistant/threads', undefined, signal),
    refetchInterval: 30_000,
  });
}

function useThread(phone: string | null) {
  return useQuery({
    queryKey: wk.thread(phone ?? ''),
    queryFn: ({ signal }) => api.get<WhatsappThread>(`/comms/whatsapp-assistant/threads/${phone}`, undefined, signal),
    enabled: !!phone,
    refetchInterval: 15_000,
    placeholderData: keepPreviousData,
  });
}

function useThreadAction(kind: 'reply' | 'resolve') {
  return useMutation({
    meta: { silent: true },
    mutationFn: ({ phone, text }: { phone: string; text?: string }) => api.post<WhatsappThread>(`/comms/whatsapp-assistant/threads/${phone}/${kind}`, kind === 'reply' ? { text } : undefined),
    onSuccess: (t) => {
      queryClient.setQueryData(wk.thread(t.phone), t);
      void queryClient.invalidateQueries({ queryKey: wk.threads });
      void queryClient.invalidateQueries({ queryKey: wk.status });
    },
  });
}

// ------------------------------------------------------------------ page

type Tab = 'inbox' | 'setup';

export default function WhatsappAssistantPage() {
  const [params, setParams] = useSearchParams();
  const status = useAssistantStatus();
  const tab: Tab = params.get('tab') === 'setup' ? 'setup' : 'inbox';
  const s = status.data;
  return (
    <Page className="max-w-6xl">
      <BackLink to="/messages">Messages</BackLink>
      <PageHeader
        className="mt-3"
        title="WhatsApp parent assistant"
        description="Parents message the school’s WhatsApp number and the Parent AI answers about their own children. Urgent messages and anything it can’t answer come here for staff."
        actions={
          s && (
            <Badge variant={s.enabled ? 'success' : 'outline'} dot={s.enabled}>
              {s.enabled ? 'Assistant on' : 'Assistant off'}
            </Badge>
          )
        }
      />
      {status.error && !s ? (
        <ErrorState error={status.error} onRetry={() => void status.refetch()} />
      ) : (
        <Tabs value={tab} onValueChange={(t) => setParams(t === 'inbox' ? {} : { tab: t }, { replace: true })}>
          <TabsList aria-label="WhatsApp assistant">
            <TabsTrigger value="inbox">
              <Inbox /> Conversations
              {!!s?.needsAttention && <span className="rounded-full bg-warning-soft px-1.5 text-[10.5px] text-warning tabular">{s.needsAttention}</span>}
            </TabsTrigger>
            <TabsTrigger value="setup">
              <Settings2 /> Set-up
            </TabsTrigger>
          </TabsList>
          <TabsContent value="inbox">
            <InboxTab />
          </TabsContent>
          <TabsContent value="setup">{s ? <SetupTab status={s} /> : <Skeleton className="h-64 w-full" />}</TabsContent>
        </Tabs>
      )}
    </Page>
  );
}

// ------------------------------------------------------------------ set-up

function CopyField({ label, value, id }: { label: string; value: string; id: string }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[12px] font-medium text-muted-foreground">
        {label}
      </label>
      <div className="flex gap-2">
        <Input id={id} readOnly value={value} className="min-w-0 flex-1 font-mono text-[12.5px]" onFocus={(e) => e.currentTarget.select()} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 shrink-0"
          onClick={() =>
            void navigator.clipboard.writeText(value).then(
              () => toast.success(`${label} copied`),
              () => toast.error('Copy failed — select the text and copy it'),
            )
          }
        >
          <Copy /> Copy
        </Button>
      </div>
    </div>
  );
}

function Step({ done, title, children }: { done: boolean; title: string; children?: ReactNode }) {
  return (
    <li className="flex gap-3">
      {done ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-label="Done" /> : <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-label="To do" />}
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium">{title}</p>
        {children && <div className="mt-1.5 grid gap-2 text-[12.5px] leading-relaxed text-muted-foreground">{children}</div>}
      </div>
    </li>
  );
}

function SetupTab({ status: s }: { status: WhatsappAssistantStatus }) {
  const canManage = useCan('comms.manage');
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] [&>*]:min-w-0">
      <Card className="p-5">
        <p className="font-display text-[15px] font-semibold tracking-tight">Set-up checklist</p>
        <ol className="mt-4 grid gap-5">
          <Step done={s.connected} title="Connect the WhatsApp Cloud API">
            {s.connected ? (
              <p>Connected · phone number ID {s.phoneNumberId}</p>
            ) : (
              <p>
                Add your phone number ID and permanent access token under{' '}
                <Link to="/messages/settings" className="font-medium text-brand underline-offset-4 hover:underline">
                  Messaging settings
                </Link>
                .
              </p>
            )}
          </Step>
          <Step done={s.appSecretSaved} title="Save the Meta App Secret">
            <p>Meta signs every message with it, so we can tell real messages from fakes. Find it in your Meta app under App settings → Basic. {s.appSecretSaved && `Saved (ends ${s.appSecretHint}).`}</p>
          </Step>
          <Step done={!!s.verifyToken && !!s.lastInboundAt} title="Add the webhook in Meta">
            <p>In your Meta app: WhatsApp → Configuration → Webhook → Edit. Paste these, then subscribe to the “messages” field.</p>
            <CopyField id="wa-webhook-url" label="Callback URL" value={s.webhookUrl} />
            {s.verifyToken ? <CopyField id="wa-verify-token" label="Verify token" value={s.verifyToken} /> : <p className="text-warning">Save the settings on the right to create your verify token.</p>}
          </Step>
          <Step done={!!s.lastInboundAt} title="Test it">
            <p>
              From a parent’s phone, send <strong className="text-foreground">HELP</strong> to the school’s WhatsApp number.{' '}
              {s.lastInboundAt ? `Last message received ${formatRelative(s.lastInboundAt)} — it works.` : 'Nothing received yet.'}
            </p>
          </Step>
        </ol>
        <p className="mt-5 flex items-start gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            Only parents whose phone number matches a parent record with a portal login get answers, and only about their own children. The assistant can read records but never change them. Messages
            mentioning illness, accidents, bullying or fights go straight to staff.
          </span>
        </p>
      </Card>
      <SettingsCard status={s} canManage={canManage} />
    </div>
  );
}

function SettingsCard({ status: s, canManage }: { status: WhatsappAssistantStatus; canManage: boolean }) {
  const save = useSaveAssistant();
  const [enabled, setEnabled] = useState(s.enabled);
  const [cap, setCap] = useState(String(s.dailyCap));
  const [secret, setSecret] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    setEnabled(s.enabled);
    setCap(String(s.dailyCap));
  }, [s.enabled, s.dailyCap]);

  const submit = (e: FormEvent | null, extra: Partial<WhatsappAssistantSettingsInput> = {}) => {
    e?.preventDefault();
    const parsed = whatsappAssistantSettingsSchema.safeParse({ enabled, dailyCap: Number(cap), ...(secret.trim() ? { appSecret: secret.trim() } : {}), ...extra });
    if (!parsed.success) return setErrors(zodErrors(parsed.error.issues));
    setErrors({});
    save.mutate(parsed.data, {
      onSuccess: () => {
        setSecret('');
        toast.success(extra.regenerateVerifyToken ? 'New verify token made — paste it into Meta again' : 'WhatsApp assistant settings saved');
      },
      onError: (err) => setErrors(apiFieldErrors(err)),
    });
  };

  if (!s.connected) {
    return (
      <Card className="p-5">
        <EmptyState compact icon={MessageCircle} title="Connect WhatsApp first" description="The assistant uses the school’s WhatsApp Cloud API number." action={<Button asChild variant="outline" size="sm"><Link to="/messages/settings">Messaging settings</Link></Button>} />
      </Card>
    );
  }
  return (
    <Card className="p-5">
      <form onSubmit={submit} noValidate className="grid gap-4">
        <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
          <span className="min-w-0 text-[13px]">
            <span className="block font-medium">Answer parents automatically</span>
            <span className="block text-[12px] text-muted-foreground">When off, parents’ messages still arrive here for staff to answer.</span>
          </span>
          <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!canManage} aria-label="Answer parents automatically" className="mt-0.5" />
        </label>
        <Field label="AI answers per day (whole school)" htmlFor="wa-cap" error={errors.dailyCap} hint={`Protects your AI allowance. Each parent can also send at most ${s.perPhoneHourly} messages an hour. ${s.aiAnswersToday} answered in the last 24 hours.`}>
          <Input id="wa-cap" inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value.replace(/\D/g, '').slice(0, 5))} disabled={!canManage} invalid={!!errors.dailyCap} className="sm:w-40" />
        </Field>
        <Field label={s.appSecretSaved ? `Meta App Secret (saved, ends ${s.appSecretHint})` : 'Meta App Secret'} htmlFor="wa-secret" error={errors.appSecret} hint={s.appSecretSaved ? 'Leave blank to keep the saved one.' : 'Stored encrypted; never shown again.'}>
          <Input id="wa-secret" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" disabled={!canManage} invalid={!!errors.appSecret} />
        </Field>
        <FormError message={errors.form} />
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={save.isPending}>
              {!save.isPending && <Check />} Save
            </Button>
            {s.verifyToken && (
              <Button type="button" variant="ghost" onClick={() => submit(null, { regenerateVerifyToken: true })} disabled={save.isPending}>
                <RefreshCw /> New verify token
              </Button>
            )}
          </div>
        ) : (
          <p className="text-[12px] text-muted-foreground">Only admins with messaging settings access can change these.</p>
        )}
      </form>
    </Card>
  );
}

// ------------------------------------------------------------------ inbox

function InboxTab() {
  const [params, setParams] = useSearchParams();
  const selected = params.get('phone');
  const [filter, setFilter] = useState<'all' | 'attention'>('all');
  const threads = useThreads();
  const select = (phone: string | null) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (phone) p.set('phone', phone);
        else p.delete('phone');
        return p;
      },
      { replace: true },
    );

  if (threads.error && !threads.data) return <ErrorState error={threads.error} onRetry={() => void threads.refetch()} />;
  const rows = (threads.data ?? []).filter((t) => filter === 'all' || t.needsAttention > 0);
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] [&>*]:min-w-0">
      <Card className={cn('overflow-hidden', selected && 'hidden lg:block')}>
        <div className="flex gap-1.5 border-b border-border p-3" role="group" aria-label="Show">
          {(['all', 'attention'] as const).map((f) => (
            <Button key={f} type="button" size="sm" variant={filter === f ? 'secondary' : 'ghost'} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : 'Needs a reply'}
            </Button>
          ))}
        </div>
        {threads.isLoading ? (
          <div className="space-y-3 p-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState compact icon={MessageCircle} title={filter === 'all' ? 'No WhatsApp messages yet' : 'Nothing needs a reply'} description={filter === 'all' ? 'Parents’ messages appear here once the webhook is set up.' : 'Flagged messages appear here.'} />
        ) : (
          <ul className="max-h-[65vh] divide-y divide-border overflow-y-auto">
            {rows.map((t) => (
              <li key={t.phone}>
                <button
                  type="button"
                  onClick={() => select(t.phone)}
                  aria-current={selected === t.phone}
                  className={cn('flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none', selected === t.phone && 'bg-muted/60')}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                    <UserRound className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[13.5px] font-medium">{t.name ?? `+${t.phone}`}</span>
                      {t.needsAttention > 0 && (
                        <Badge variant="warning" className="shrink-0">
                          {t.needsAttention}
                        </Badge>
                      )}
                    </span>
                    <span className="block truncate text-[12px] text-muted-foreground">
                      {t.lastDirection === 'OUTBOUND' ? 'You: ' : ''}
                      {t.lastBody}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {formatRelative(t.lastMessageAt)}
                      {!t.name && ' · not a matched parent'}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {selected ? (
        <ThreadPane phone={selected} onBack={() => select(null)} />
      ) : (
        <Card className="hidden lg:block">
          <EmptyState icon={Inbox} title="Pick a conversation" description="See what parents asked, what the assistant answered, and reply yourself." />
        </Card>
      )}
    </div>
  );
}

const AUTHOR: Record<WhatsappMessageRow['author'], { label: string; icon: ReactNode }> = {
  PARENT: { label: 'Parent', icon: <UserRound className="size-3" aria-hidden /> },
  AI: { label: 'Assistant', icon: <Bot className="size-3" aria-hidden /> },
  STAFF: { label: 'Staff', icon: <UserRound className="size-3" aria-hidden /> },
  SYSTEM: { label: 'Automatic reply', icon: <Bot className="size-3" aria-hidden /> },
};

const STATUS_LABEL: Record<string, string> = {
  FLAGGED: 'Needs a reply',
  RESOLVED: 'Resolved',
  UNKNOWN: 'Unknown number',
  LIMITED: 'Rate-limited',
  OPT_OUT: 'Sent STOP',
  OPT_IN: 'Sent START',
  IGNORED: 'Not answered',
  FAILED: 'Failed',
  DELIVERED: 'Delivered',
  READ: 'Read',
};

function Bubble({ m }: { m: WhatsappMessageRow }) {
  const out = m.direction === 'OUTBOUND';
  const a = AUTHOR[m.author];
  const label = STATUS_LABEL[m.status];
  return (
    <li className={cn('flex', out ? 'justify-end' : 'justify-start')}>
      <div className={cn('max-w-[85%] rounded-2xl border px-3.5 py-2.5', out ? 'border-brand/20 bg-brand-soft/60' : 'border-border bg-card', m.status === 'FLAGGED' && 'border-warning/50')}>
        <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          {a.icon} {m.staffName ?? a.label} · {formatDateTime(m.createdAt)}
          {label && (
            <Badge variant={m.status === 'FLAGGED' || m.status === 'FAILED' ? 'warning' : m.status === 'RESOLVED' ? 'success' : 'outline'} className="h-4 px-1.5 text-[10px]">
              {label}
            </Badge>
          )}
        </p>
        <p className="mt-1 whitespace-pre-wrap break-words text-[13.5px] leading-relaxed">{m.body}</p>
        {m.note && (
          <p className={cn('mt-1.5 flex items-start gap-1 text-[11.5px]', m.status === 'FLAGGED' || m.status === 'FAILED' ? 'text-warning' : 'text-muted-foreground')}>
            <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden /> {m.note}
          </p>
        )}
      </div>
    </li>
  );
}

function ThreadPane({ phone, onBack }: { phone: string; onBack: () => void }) {
  const q = useThread(phone);
  const reply = useThreadAction('reply');
  const resolve = useThreadAction('resolve');
  const canSend = useCan('comms.send');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const t = q.data?.phone === phone ? q.data : undefined;
  useEffect(() => end.current?.scrollIntoView({ block: 'nearest' }), [t?.messages.length]);

  if (q.error && !t) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!t) return <Skeleton className="h-96 w-full" />;
  const flagged = t.messages.some((m) => m.status === 'FLAGGED');
  const send = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return setError('Write a reply');
    setError(null);
    reply.mutate(
      { phone, text: text.trim() },
      {
        onSuccess: () => {
          setText('');
          toast.success('Sent on WhatsApp');
        },
        onError: (err) => setError(errorMessage(err)),
      },
    );
  };
  return (
    <Card className="flex min-h-[420px] flex-col overflow-hidden">
      <div className="flex flex-wrap items-start gap-3 border-b border-border p-4">
        <Button type="button" variant="ghost" size="sm" className="lg:hidden" onClick={onBack}>
          ← Back
        </Button>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[15px] font-semibold tracking-tight">{t.guardian?.name ?? `+${t.phone}`}</p>
          <p className="text-[12px] text-muted-foreground">
            {t.guardian ? `${t.guardian.relationship} of ${t.guardian.children.join(', ') || 'no linked children'} · +${t.phone}` : 'Not matched to a parent with a portal login — no student information was shared.'}
          </p>
        </div>
        {flagged && canSend && (
          <Button size="sm" variant="outline" loading={resolve.isPending} onClick={() => resolve.mutate({ phone }, { onSuccess: () => toast.success('Marked as resolved'), onError: (err) => toast.error(errorMessage(err)) })}>
            {!resolve.isPending && <Check />} Mark resolved
          </Button>
        )}
      </div>
      <ul className="flex max-h-[55vh] flex-1 flex-col gap-2.5 overflow-y-auto bg-muted/20 p-4">
        {t.messages.map((m) => (
          <Bubble key={m.id} m={m} />
        ))}
        <div ref={end} />
      </ul>
      {canSend && (
        <form onSubmit={send} noValidate className="grid gap-2 border-t border-border p-4">
          {t.optedOut ? (
            <p className="text-[12.5px] text-muted-foreground">This parent sent STOP. You can reply here again after they send START.</p>
          ) : t.windowOpen ? (
            <>
              <label htmlFor="wa-reply" className="sr-only">
                Reply on WhatsApp
              </label>
              <Textarea id="wa-reply" rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="Reply on WhatsApp…" invalid={!!error} />
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" loading={reply.isPending}>
                  {!reply.isPending && <Send />} Send on WhatsApp
                </Button>
                <span className="text-[11.5px] text-muted-foreground">You can reply freely until {t.windowClosesAt ? formatDateTime(t.windowClosesAt) : '—'} (24 hours after their last message).</span>
              </div>
              {error && (
                <p role="alert" className="text-[12px] font-medium text-danger">
                  {error}
                </p>
              )}
            </>
          ) : (
            <p className="flex items-start gap-2 text-[12.5px] text-muted-foreground">
              <KeyRound className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                It’s more than 24 hours since this parent last wrote, so WhatsApp only allows an approved template message now.{' '}
                <Link to="/messages/new" className="font-medium text-brand underline-offset-4 hover:underline">
                  Send a message
                </Link>{' '}
                with WhatsApp ticked, or wait for them to write again.
              </span>
            </p>
          )}
        </form>
      )}
    </Card>
  );
}
