import {
  type AudiencePreview,
  type AudienceType,
  type BroadcastDetail,
  type BroadcastInput,
  type BroadcastSource,
  broadcastSchema,
  type Channel,
  CHANNEL_LABELS,
  CHANNELS,
  TRANSLATE_LANGUAGE_LABELS,
  TRANSLATE_LANGUAGES,
} from '@aischool/shared';
import { CalendarClock, Check, FileText, Languages, Mail, RefreshCw, Save, Send, Sparkles } from 'lucide-react';
import { type ReactNode, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { Page } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { formatNumber } from '@/lib/format';
import { useDebounced, useDocumentTitle } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { schoolDateTime } from '../finance/ui';
import { apiFieldErrors, dateInput, FormError, Segmented, toLocalInput, zodErrors } from '../operations/ui';
import { BackLink, DetailSkeleton } from '../planning/ui';
import { type PreviewInput, useBroadcast, useChannels, useCompose, usePreview, useSaveBroadcast, useSendBroadcast, useTranslate } from './api';
import { type AudienceDraft, AudienceBuilder, draftFromAudience, toAudience } from './audience-builder';
import { PreviewPanel } from './preview-panel';
import { BroadcastStatusBadge, CHANNEL_ICON, type ComposePrefill, insertAt, makeSmsSafe, money, SmsCounter, TokenChips } from './ui';

export default function ComposePage() {
  const { id } = useParams();
  const location = useLocation();
  const q = useBroadcast(id);
  // A fresh composer per navigation, so ⌘K or a "Send" button can prefill it again.
  if (!id) return <Composer key={`new-${location.key}`} />;
  if (q.isLoading) {
    return (
      <Page className="max-w-7xl">
        <DetailSkeleton />
      </Page>
    );
  }
  if (!q.data) {
    const missing = q.error instanceof ApiError && q.error.status === 404;
    return (
      <Page className="max-w-7xl">
        <BackLink to="/messages">Messages</BackLink>
        {missing ? <EmptyState icon={FileText} title="Message not found" description="It may have been deleted." /> : <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      </Page>
    );
  }
  if (q.data.status !== 'DRAFT' && q.data.status !== 'SCHEDULED') {
    return (
      <Page className="max-w-7xl">
        <BackLink to="/messages">Messages</BackLink>
        <EmptyState
          icon={Send}
          title="This message has already gone out"
          description="Sent messages can’t be edited. You can open it to see who got it."
          action={
            <Button asChild variant="outline">
              <Link to={`/messages/${q.data.id}`}>Open message</Link>
            </Button>
          }
        />
      </Page>
    );
  }
  return <Composer key={q.data.id} initial={q.data} />;
}

// ------------------------------------------------------------------ composer

type Tone = 'WARM' | 'FORMAL' | 'URGENT';

interface State {
  audience: AudienceDraft;
  channels: Channel[];
  title: string;
  subject: string;
  body: string;
  smsBody: string;
  useBodyForSms: boolean;
  source: BroadcastSource;
  link: string | null;
}

function initialState(initial: BroadcastDetail | undefined, prefill: ComposePrefill | undefined, params: URLSearchParams): State {
  if (initial) {
    return {
      audience: draftFromAudience(initial.audience),
      channels: initial.channels,
      title: initial.title,
      subject: initial.subject ?? '',
      body: initial.body,
      smsBody: initial.smsBody ?? '',
      useBodyForSms: !initial.smsBody,
      source: initial.source,
      link: initial.link,
    };
  }
  // ?audience=ALL_PARENTS etc. (from the command palette) picks a starting audience type.
  const qType = params.get('audience') as AudienceType | null;
  let audience = draftFromAudience(prefill?.audience, prefill?.people);
  if (!prefill?.audience && qType && QUERY_AUDIENCES.includes(qType)) audience = { ...audience, type: qType };
  const qChannels = (params.get('channels') ?? '').split(',').filter((c): c is Channel => (CHANNELS as readonly string[]).includes(c));
  return {
    audience,
    channels: prefill?.channels ?? (qChannels.length ? qChannels : ['SMS', 'IN_APP']),
    title: prefill?.title ?? '',
    subject: prefill?.subject ?? '',
    body: prefill?.body ?? '',
    smsBody: prefill?.smsBody ?? '',
    useBodyForSms: !prefill?.smsBody,
    source: prefill?.source ?? 'MANUAL',
    link: prefill?.link ?? null,
  };
}

const QUERY_AUDIENCES: AudienceType[] = ['ALL_PARENTS', 'CLASS_PARENTS', 'FEE_DEBTORS', 'HOSTEL_PARENTS', 'ALL_STAFF', 'STAFF_GROUP', 'PEOPLE', 'CONTACTS'];

/** A tidy internal title when the author didn't give one. */
function autoTitle(s: State): string {
  const t = s.title.trim();
  if (t.length >= 2) return t.slice(0, 120);
  const from = (s.subject.trim() || s.body.trim().split(/\s+/).slice(0, 8).join(' ')).replace(/\s+/g, ' ');
  return (from.length >= 2 ? from : 'Message').slice(0, 120);
}

function Composer({ initial }: { initial?: BroadcastDetail }) {
  const location = useLocation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const prefill = (location.state as { prefill?: ComposePrefill } | null)?.prefill;
  const [s, setS] = useState<State>(() => initialState(initial, prefill, params));
  const set = (patch: Partial<State>) => setS((prev) => ({ ...prev, ...patch }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [savedId, setSavedId] = useState<string | undefined>(initial?.id);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const canAi = useCan('ai.use');
  useDocumentTitle(initial ? 'Edit message' : 'New message');

  const channels = useChannels();
  const save = useSaveBroadcast();
  const send = useSendBroadcast();

  const hasSms = s.channels.includes('SMS') || s.channels.includes('WHATSAPP');
  const smsText = s.useBodyForSms ? s.body : s.smsBody;
  const aud = toAudience(s.audience);

  // Debounce by value (a JSON key), so re-renders don't restart the timer.
  const previewKey = JSON.stringify(
    aud.audience && s.channels.length
      ? ({ audience: aud.audience, channels: s.channels, body: s.body.trim() || undefined, smsBody: hasSms && !s.useBodyForSms ? s.smsBody.trim() || null : null } satisfies PreviewInput)
      : null,
  );
  const debouncedKey = useDebounced(previewKey, 600);
  const previewInput = useMemo(() => JSON.parse(debouncedKey) as PreviewInput | null, [debouncedKey]);
  const preview = usePreview(previewInput);
  const problem = aud.problem ?? (s.channels.length ? null : 'Choose at least one channel.');

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const smsRef = useRef<HTMLTextAreaElement>(null);
  const lastFocus = useRef<'body' | 'sms'>('body');
  const insertToken = (token: string) => {
    const target = lastFocus.current === 'sms' && !s.useBodyForSms && hasSms ? 'sms' : 'body';
    const el = target === 'sms' ? smsRef.current : bodyRef.current;
    const current = target === 'sms' ? s.smsBody : s.body;
    const { value, caret } = insertAt(el, current, token);
    set(target === 'sms' ? { smsBody: value } : { body: value });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(caret, caret);
    });
  };

  const build = (): BroadcastInput | null => {
    const next: Record<string, string> = {};
    if (!aud.audience) next.audience = aud.problem ?? 'Choose who to send to';
    const input = {
      title: autoTitle(s),
      channels: s.channels,
      audience: aud.audience!,
      subject: s.subject.trim() || null,
      body: s.body.trim(),
      smsBody: hasSms && !s.useBodyForSms ? s.smsBody.trim() || null : null,
      source: s.source,
      link: s.link,
    };
    const parsed = aud.audience ? broadcastSchema.safeParse(input) : null;
    if (parsed && !parsed.success) Object.assign(next, zodErrors(parsed.error.issues));
    if (!s.body.trim()) next.body = 'Write your message';
    else if (s.body.trim().length < 2) next.body = 'Your message is too short';
    setErrors(next);
    if (Object.keys(next).length || !parsed?.success) {
      const first = Object.keys(next)[0];
      document.getElementById(first === 'audience' ? 'cm-audience' : first === 'channels' ? 'cm-channels' : `cm-${first === 'smsBody' ? 'sms' : first}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return null;
    }
    return parsed.data;
  };

  const persist = async (): Promise<BroadcastDetail | null> => {
    const input = build();
    if (!input) return null;
    try {
      const b = await save.mutateAsync({ id: savedId, input });
      setSavedId(b.id);
      return b;
    } catch (err) {
      setErrors(apiFieldErrors(err));
      return null;
    }
  };

  const saveDraft = async () => {
    const b = await persist();
    if (!b) return;
    toast.success(b.status === 'SCHEDULED' ? 'Changes saved — still scheduled' : 'Draft saved');
    if (!initial) navigate(`/messages/${b.id}/edit`, { replace: true });
  };

  const sendNow = async () => {
    const b = await persist();
    if (!b) return;
    try {
      await send.mutateAsync({ id: b.id });
      setConfirmOpen(false);
      toast.success('On its way — you can watch deliveries here');
      navigate(`/messages/${b.id}`, { replace: true });
    } catch (err) {
      setConfirmOpen(false);
      setErrors(apiFieldErrors(err));
    }
  };

  const schedule = async (at: Date) => {
    const b = await persist();
    if (!b) return;
    try {
      await send.mutateAsync({ id: b.id, scheduledAt: at.toISOString() });
      setScheduleOpen(false);
      toast.success(`Scheduled for ${schoolDateTime(at.toISOString())}`);
      navigate(`/messages/${b.id}`, { replace: true });
    } catch (err) {
      setErrors(apiFieldErrors(err));
    }
  };

  const tryOpen = (which: 'send' | 'schedule') => {
    if (!build()) return;
    if (which === 'send') setConfirmOpen(true);
    else setScheduleOpen(true);
  };

  const busy = save.isPending || send.isPending;
  const statusOf = (c: Channel) => channels.data?.find((x) => x.channel === c);

  return (
    <Page className="max-w-7xl">
      <BackLink to="/messages">Messages</BackLink>
      <div className="mt-3 mb-6 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-[28px]">{initial ? 'Edit message' : 'New message'}</h1>
        {initial && <BroadcastStatusBadge status={initial.status} />}
        {initial?.status === 'SCHEDULED' && <span className="text-[13px] text-muted-foreground">Goes out {schoolDateTime(initial.scheduledAt)}</span>}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] [&>*]:min-w-0">
        <div className="space-y-5">
          <Section n={1} title="Who is it for?" id="cm-audience">
            <AudienceBuilder value={s.audience} onChange={(audience) => set({ audience })} problem={errors.audience && aud.problem ? aud.problem : undefined} />
          </Section>

          <Section n={2} title="How should it reach them?" id="cm-channels">
            <div className="grid gap-2 sm:grid-cols-2 [&>*]:min-w-0" role="group" aria-label="Channels">
              {CHANNELS.map((c) => {
                const Icon = CHANNEL_ICON[c];
                const st = statusOf(c);
                const on = s.channels.includes(c);
                const ready = st?.configured ?? c === 'IN_APP';
                return (
                  <label
                    key={c}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors',
                      on ? 'border-brand/50 bg-brand-soft/40' : 'border-border hover:bg-muted/40',
                    )}
                  >
                    <Checkbox className="mt-0.5" checked={on} onCheckedChange={(v) => set({ channels: v ? [...s.channels, c] : s.channels.filter((x) => x !== c) })} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-[13px] font-medium">
                        <Icon className="size-3.5 text-muted-foreground" aria-hidden /> {CHANNEL_LABELS[c]}
                      </span>
                      <span className="block text-[11.5px] text-muted-foreground">
                        {channels.isLoading ? (
                          'Checking…'
                        ) : ready ? (
                          <span className="inline-flex items-center gap-1 text-success">
                            <Check className="size-3" aria-hidden /> Ready
                          </span>
                        ) : st?.serverManaged ? (
                          'Not available on this server'
                        ) : (
                          <span className="text-warning">
                            Not set up ·{' '}
                            <Link to="/messages/settings" className="font-medium underline-offset-2 hover:underline" onClick={(e) => e.stopPropagation()}>
                              Set up
                            </Link>
                          </span>
                        )}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
            {errors.channels && (
              <p role="alert" className="mt-2 text-[12px] font-medium text-danger">
                {errors.channels}
              </p>
            )}
          </Section>

          <Section n={3} title="What do you want to say?">
            <div className="grid gap-4">
              {canAi && <WriteForMe channels={s.channels} audienceSummary={preview.data?.summary} onResult={(r) => set({ title: r.title, subject: r.subject, body: r.body, smsBody: r.smsBody, useBodyForSms: false })} />}

              <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
                <Field label="Title" htmlFor="cm-title" optional hint="Only you see this — in the Sent list." error={errors.title}>
                  <Input id="cm-title" value={s.title} onChange={(e) => set({ title: e.target.value })} maxLength={120} placeholder="e.g. Sports day reminder" invalid={!!errors.title} />
                </Field>
                {s.channels.includes('EMAIL') && (
                  <Field label="Email subject" htmlFor="cm-subject" error={errors.subject}>
                    <Input id="cm-subject" value={s.subject} onChange={(e) => set({ subject: e.target.value })} maxLength={160} placeholder="e.g. Inter-house sports this Friday" invalid={!!errors.subject} />
                  </Field>
                )}
              </div>

              <div className="grid gap-1.5">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <Label htmlFor="cm-body">Message</Label>
                  <span className={cn('text-[11.5px] tabular', s.body.length > 4800 ? 'text-warning' : 'text-muted-foreground')}>{formatNumber(s.body.length)}/5,000</span>
                </div>
                <Textarea
                  id="cm-body"
                  ref={bodyRef}
                  rows={9}
                  value={s.body}
                  onFocus={() => (lastFocus.current = 'body')}
                  onChange={(e) => set({ body: e.target.value })}
                  maxLength={5000}
                  invalid={!!errors.body}
                  placeholder={'Dear {{first_name}},\n\n…'}
                />
                {errors.body ? (
                  <p role="alert" className="text-[12px] font-medium text-danger">
                    {errors.body}
                  </p>
                ) : (
                  <p className="text-[12px] text-muted-foreground">Used for email, the app and push{hasSms && s.useBodyForSms ? ', and for SMS/WhatsApp' : ''}.</p>
                )}
                <TokenChips onInsert={insertToken} />
              </div>

              {hasSms && (
                <div className="grid gap-3 rounded-xl border border-border bg-muted/20 p-3.5">
                  <label className="flex cursor-pointer items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium">Use the message above for SMS & WhatsApp</span>
                      <span className="block text-[12px] text-muted-foreground">Turn off to write a shorter version — SMS is charged per page.</span>
                    </span>
                    <Switch
                      checked={s.useBodyForSms}
                      onCheckedChange={(v) => set({ useBodyForSms: v, smsBody: !v && !s.smsBody ? makeSmsSafe(s.body).slice(0, 300) : s.smsBody })}
                      aria-label="Use the message above for SMS and WhatsApp"
                    />
                  </label>
                  {!s.useBodyForSms && (
                    <div className="grid gap-1.5">
                      <Label htmlFor="cm-sms">SMS & WhatsApp text</Label>
                      <Textarea
                        id="cm-sms"
                        ref={smsRef}
                        rows={4}
                        value={s.smsBody}
                        onFocus={() => (lastFocus.current = 'sms')}
                        onChange={(e) => set({ smsBody: e.target.value })}
                        maxLength={918}
                        invalid={!!errors.smsBody}
                        placeholder="Short and to the point, e.g. Dear {{first_name}}, sports day is this Friday at 9am. - {{school}}"
                      />
                      {errors.smsBody && (
                        <p role="alert" className="text-[12px] font-medium text-danger">
                          {errors.smsBody}
                        </p>
                      )}
                      <TokenChips onInsert={insertToken} only={['{{first_name}}', '{{children}}', '{{balance}}', '{{school}}']} />
                    </div>
                  )}
                  <SmsCounter text={smsText} onFix={() => set(s.useBodyForSms ? { body: makeSmsSafe(s.body) } : { smsBody: makeSmsSafe(s.smsBody) })} />
                  <p className="text-[11.5px] text-muted-foreground">Counts are before names are filled in — the preview shows the real total.</p>
                </div>
              )}

              {canAi && (s.body.trim() || s.smsBody.trim()) && <Translate body={s.body} sms={hasSms && !s.useBodyForSms ? s.smsBody : ''} onUse={(field, text) => set(field === 'body' ? { body: text } : { smsBody: text, useBodyForSms: false })} />}
            </div>
          </Section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start" aria-label="Preview and send">
          <PreviewPanel
            preview={previewInput ? preview.data : undefined}
            loading={!!previewInput && preview.isLoading}
            fetching={preview.isFetching || previewKey !== debouncedKey}
            error={preview.error}
            problem={problem}
            subject={s.channels.includes('EMAIL') ? s.subject : ''}
            body={s.body}
            smsText={smsText}
            showSms={hasSms}
          />
          <Card className="space-y-3 p-4">
            <FormError message={errors.form} />
            <Button className="w-full" size="lg" onClick={() => tryOpen('send')} disabled={busy}>
              <Send /> Send now
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => tryOpen('schedule')} disabled={busy}>
                <CalendarClock /> {initial?.status === 'SCHEDULED' ? 'Reschedule' : 'Schedule'}
              </Button>
              <Button variant="outline" onClick={() => void saveDraft()} loading={save.isPending && !confirmOpen && !scheduleOpen} disabled={busy}>
                {!save.isPending && <Save />} {initial?.status === 'SCHEDULED' ? 'Save' : 'Save draft'}
              </Button>
            </div>
            <p className="text-center text-[11.5px] text-muted-foreground">Nothing goes out until you press Send or Schedule.</p>
          </Card>
        </aside>
      </div>

      <ConfirmSend
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        channels={s.channels}
        preview={previewInput ? preview.data : undefined}
        checking={preview.isFetching || previewKey !== debouncedKey}
        pending={busy}
        onConfirm={() => void sendNow()}
      />
      <ScheduleDialog open={scheduleOpen} onOpenChange={setScheduleOpen} initial={initial?.scheduledAt ?? null} pending={busy} error={errors.form} onSchedule={(d) => void schedule(d)} />
    </Page>
  );
}

function Section({ n, title, id, children }: { n: number; title: string; id?: string; children: ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-24 p-5 sm:p-6">
      <h2 className="mb-4 flex items-center gap-2.5 font-display text-[15px] font-semibold tracking-tight">
        <span className="grid size-6 place-items-center rounded-full bg-brand-soft text-[12px] font-semibold text-brand tabular" aria-hidden>
          {n}
        </span>
        {title}
      </h2>
      {children}
    </Card>
  );
}

// ------------------------------------------------------------------ AI

function WriteForMe({ channels, audienceSummary, onResult }: { channels: Channel[]; audienceSummary?: string; onResult: (r: { title: string; subject: string; body: string; smsBody: string }) => void }) {
  const compose = useCompose();
  const [brief, setBrief] = useState('');
  const [tone, setTone] = useState<Tone>('WARM');
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<{ provider: string; model: string } | null>(null);
  const run = () => {
    if (brief.trim().length < 5) {
      setError('Say what the message is about, e.g. “Remind JSS 1 parents about Friday’s inter-house sports”');
      return;
    }
    setError(undefined);
    compose.mutate(
      { brief: brief.trim(), audienceSummary, channels: channels.length ? channels : ['EMAIL', 'SMS'], tone },
      {
        onSuccess: (r) => {
          onResult(r);
          setDone({ provider: r.provider, model: r.model });
          toast.success('Draft written — read it through and change anything you like');
        },
      },
    );
  };
  return (
    <div className="ai-border relative overflow-hidden rounded-xl border-transparent p-4">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-40 rounded-full bg-ai-2/10 blur-3xl" />
      <div className="relative grid gap-3">
        <p className="flex items-center gap-2 text-[13.5px] font-semibold">
          <AiSparkle className="size-4" animated={compose.isPending} /> <span className="text-ai-gradient">Write it for me</span>
        </p>
        <Field htmlFor="cm-brief" error={error}>
          <Textarea
            id="cm-brief"
            rows={2}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            maxLength={1000}
            placeholder="What’s it about? e.g. School closes early on Friday for the PTA meeting at 1pm"
            aria-label="What the message is about"
            invalid={!!error}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run();
            }}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            size="sm"
            label="Tone"
            value={tone}
            onChange={setTone}
            options={[
              { value: 'WARM', label: 'Warm' },
              { value: 'FORMAL', label: 'Formal' },
              { value: 'URGENT', label: 'Urgent' },
            ]}
          />
          <Button type="button" size="sm" variant={done ? 'outline' : 'ai'} onClick={run} loading={compose.isPending} className="ml-auto">
            {!compose.isPending && (done ? <RefreshCw /> : <Sparkles />)} {compose.isPending ? 'Writing…' : done ? 'Write again' : 'Write it'}
          </Button>
        </div>
        {done && (
          <p className="text-[11.5px] text-muted-foreground">
            Written by {done.provider} · {done.model}, using your term dates and calendar. Check the details before sending.
          </p>
        )}
      </div>
    </div>
  );
}

type Language = (typeof TRANSLATE_LANGUAGES)[number];

function Translate({ body, sms, onUse }: { body: string; sms: string; onUse: (field: 'body' | 'sms', text: string) => void }) {
  const tr = useTranslate();
  const [language, setLanguage] = useState<Language>('YORUBA');
  const [from, setFrom] = useState<'body' | 'sms'>('body');
  const [result, setResult] = useState<{ text: string; from: 'body' | 'sms'; language: Language } | null>(null);
  const source = from === 'sms' && sms.trim() ? sms : body;
  const run = () => {
    if (source.trim().length < 2) return;
    tr.mutate({ language, text: source.trim() }, { onSuccess: (r) => setResult({ text: r.text, from: from === 'sms' && sms.trim() ? 'sms' : 'body', language }) });
  };
  return (
    <div className="rounded-xl border border-border p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <Languages className="size-4 text-muted-foreground" aria-hidden />
        <span className="text-[13px] font-medium">Translate</span>
        {sms.trim() && (
          <Select value={from} onValueChange={(v) => setFrom(v as 'body' | 'sms')}>
            <SelectTrigger className="h-8 w-auto min-w-[9rem] text-[12.5px]" aria-label="Text to translate">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="body">The message</SelectItem>
              <SelectItem value="sms">The SMS text</SelectItem>
            </SelectContent>
          </Select>
        )}
        <span className="text-[12.5px] text-muted-foreground">into</span>
        <Select value={language} onValueChange={(v) => setLanguage(v as Language)}>
          <SelectTrigger className="h-8 w-auto min-w-[9rem] text-[12.5px]" aria-label="Language">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TRANSLATE_LANGUAGES.map((l) => (
              <SelectItem key={l} value={l}>
                {TRANSLATE_LANGUAGE_LABELS[l]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" size="sm" variant="outline" onClick={run} loading={tr.isPending} className="ml-auto">
          {!tr.isPending && <Sparkles />} Translate
        </Button>
      </div>
      {result && (
        <div className={cn('mt-3 space-y-2 transition-opacity', tr.isPending && 'opacity-50')}>
          <p className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-[13px] leading-relaxed scrollbar-thin" lang={result.language === 'FRENCH' ? 'fr' : undefined}>
            {result.text}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-muted-foreground">{TRANSLATE_LANGUAGE_LABELS[result.language]} — use it for:</span>
            <Button type="button" size="sm" variant="outline" onClick={() => onUse('body', result.text)}>
              <Mail /> The message
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => onUse('sms', result.text)}>
              SMS & WhatsApp
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setResult(null)}>
              Discard
            </Button>
          </div>
          <p className="text-[11.5px] text-muted-foreground">Have a fluent speaker check it before it goes to parents.</p>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ send / schedule dialogs

function ConfirmSend({
  open,
  onOpenChange,
  channels,
  preview,
  checking,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  channels: Channel[];
  preview: AudiencePreview | undefined;
  checking: boolean;
  pending: boolean;
  onConfirm: () => void;
}) {
  const skipped = preview?.byChannel.filter((c) => !c.configured) ?? [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <div className="mb-2 grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">
            <Send className="size-5" />
          </div>
          <DialogTitle>{preview ? `Send to ${formatNumber(preview.recipients)} ${preview.recipients === 1 ? 'person' : 'people'}?` : 'Send this message?'}</DialogTitle>
          <DialogDescription>{preview?.summary ?? 'Checking who it goes to…'}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3 pt-1">
          <dl className="grid gap-2 rounded-xl border border-border bg-muted/30 p-3 text-[13px]">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">By</dt>
              <dd className="text-right font-medium">{channels.map((c) => CHANNEL_LABELS[c]).join(', ')}</dd>
            </div>
            {preview?.sms && (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">SMS cost (estimate)</dt>
                <dd className="text-right font-medium tabular">
                  {money(preview.sms.costKobo, preview.currency)} <span className="font-normal text-muted-foreground">· {formatNumber(preview.sms.units)} pages</span>
                </dd>
              </div>
            )}
          </dl>
          {skipped.length > 0 && (
            <p className="rounded-xl border border-warning/30 bg-warning-soft/50 px-3 py-2 text-[12.5px]">
              {skipped.map((c) => CHANNEL_LABELS[c.channel]).join(' and ')} {skipped.length === 1 ? 'isn’t' : 'aren’t'} set up, so {skipped.length === 1 ? 'that part' : 'those parts'} will be skipped.
            </p>
          )}
          <p className="text-[12px] text-muted-foreground">It starts going out straight away and can’t be called back.</p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Not yet
          </Button>
          <Button onClick={onConfirm} loading={pending} disabled={checking && !preview}>
            {!pending && <Send />} Send now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleDialog({ open, onOpenChange, initial, pending, error, onSchedule }: { open: boolean; onOpenChange: (o: boolean) => void; initial: string | null; pending: boolean; error?: string; onSchedule: (d: Date) => void }) {
  const tomorrow8 = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(8, 0, 0, 0);
    return toLocalInput(d);
  };
  const [value, setValue] = useState(() => (initial ? toLocalInput(new Date(initial)) : tomorrow8()));
  const [err, setErr] = useState<string>();
  const min = toLocalInput(new Date(Date.now() + 2 * 60_000));
  const submit = () => {
    const d = new Date(value);
    if (!value || Number.isNaN(d.getTime())) return setErr('Pick a date and time');
    if (d.getTime() < Date.now() + 60_000) return setErr('Pick a time at least a minute from now — or send it now');
    setErr(undefined);
    onSchedule(d);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <div className="mb-2 grid size-10 place-items-center rounded-xl bg-info-soft text-info">
            <CalendarClock className="size-5" />
          </div>
          <DialogTitle>Schedule this message</DialogTitle>
          <DialogDescription>It goes out automatically at this time. You can cancel or change it until then.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <Field label="Send on" htmlFor="cm-when" error={err}>
            <Input id="cm-when" type="datetime-local" value={value} min={min} onChange={(e) => setValue(e.target.value)} className={dateInput} invalid={!!err} />
          </Field>
          <div className="flex flex-wrap gap-1.5">
            {[
              ['Tomorrow 8am', tomorrow8()],
              [
                'Monday 7am',
                (() => {
                  const d = new Date();
                  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
                  d.setHours(7, 0, 0, 0);
                  return toLocalInput(d);
                })(),
              ],
            ].map(([label, v]) => (
              <Button key={label} type="button" size="sm" variant="outline" className="h-7 text-[12px]" onClick={() => setValue(v)}>
                {label}
              </Button>
            ))}
          </div>
          <FormError message={error} />
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={pending}>
            {!pending && <CalendarClock />} Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
