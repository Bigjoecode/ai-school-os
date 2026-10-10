import {
  formatMoney,
  parentLineOverrideSchema,
  parentLineSettingsSchema,
  type ParentLineOverrideInput,
  type ParentLineSettings,
  type ParentLineSimulateInput,
  type ParentLineSimulateResult,
  type ParentLineStatus,
} from '@aischool/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, Copy, Hash, KeyRound, MessageSquareText, Phone, RotateCcw, Send, ShieldCheck, Smartphone, Trash2 } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
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
import { api, errorMessage } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { formatRelative } from '@/lib/format';
import { queryClient } from '@/lib/query-client';
import { cn } from '@/lib/utils';
import { apiFieldErrors, FormError, zodErrors } from '../operations/ui';
import { BackLink } from '../planning/ui';

const KEY = ['comms', 'parent-lines'] as const;

function useLineStatus() {
  return useQuery({ queryKey: KEY, queryFn: ({ signal }) => api.get<ParentLineStatus>('/comms/parent-lines', undefined, signal) });
}

const onSaved = (s: ParentLineStatus) => queryClient.setQueryData(KEY, s);

export default function ParentLinesPage() {
  const status = useLineStatus();
  const s = status.data;
  return (
    <Page className="max-w-6xl">
      <BackLink to="/messages">Messages</BackLink>
      <PageHeader
        className="mt-3"
        title="SMS & USSD for parents"
        description="Parents without a smartphone dial a USSD code or text a keyword to get their child’s results, fees balance, attendance and weekly learning update, on any phone."
        actions={
          s && (
            <Badge variant={s.settings.enabled ? 'success' : 'outline'} dot={s.settings.enabled}>
              {s.settings.enabled ? 'Line on' : 'Line off'}
            </Badge>
          )
        }
      />
      {status.error && !s ? (
        <ErrorState error={status.error} onRetry={() => void status.refetch()} />
      ) : !s ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] [&>*]:min-w-0">
          <div className="grid content-start gap-5 [&>*]:min-w-0">
            <ShareCard status={s} />
            <SimulatorCard />
            <UsageCard status={s} />
          </div>
          <div className="grid content-start gap-5 [&>*]:min-w-0">
            <SettingsCard status={s} />
            <OwnCodeCard status={s} />
          </div>
        </div>
      )}
    </Page>
  );
}

// ------------------------------------------------------------------ share

function CopyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-[11.5px] text-muted-foreground">{label}</p>
        <p className="truncate font-mono text-[17px] font-semibold tracking-tight">{value}</p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0"
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
  );
}

function ShareCard({ status: s }: { status: ParentLineStatus }) {
  const ready = !!(s.ussdCode || s.shortCode);
  return (
    <Card className="p-5">
      <p className="font-display text-[15px] font-semibold tracking-tight">What to tell parents</p>
      {ready ? (
        <div className="mt-3 grid gap-2.5">
          {s.ussdCode && <CopyValue label="Dial (USSD)" value={s.ussdCode} />}
          {s.shortCode && <CopyValue label="Text keywords to" value={s.shortCode} />}
          <div className="rounded-xl border border-border px-3 py-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
            <p className="font-medium text-foreground">Keywords</p>
            <p className="mt-1">
              <strong className="text-foreground">RESULT</strong>, <strong className="text-foreground">FEES</strong>, <strong className="text-foreground">ATTENDANCE</strong>, <strong className="text-foreground">UPDATE</strong>,{' '}
              <strong className="text-foreground">HELP</strong>. Parents with more than one child add the number: <span className="font-mono">RESULT 2</span>. <strong className="text-foreground">STOP</strong> stops SMS updates;{' '}
              <strong className="text-foreground">START</strong> turns them back on.
            </p>
          </div>
          {!s.settings.enabled && <p className="text-[12.5px] text-warning">Switch the line on in Settings before sharing the code with parents.</p>}
          {!s.override && <p className="text-[12px] text-muted-foreground">This is the platform’s shared code: parents of every school use it, and each only sees their own children.</p>}
        </div>
      ) : (
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          No code yet. The platform’s shared USSD code and short code appear here once the platform team has set them up, or you can use your school’s own Africa’s Talking code (Your school’s own code). The simulator below works
          without a code.
        </p>
      )}
      <p className="mt-4 flex items-start gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          The caller is identified by the phone number the mobile network gives us, matched to guardian records ({s.guardiansWithPhone} with a usable number). They only ever see children linked to them, only
          published results, and only what you share in the portal settings. If you require consent to the privacy notice, nothing is shown until the parent has agreed.
        </span>
      </p>
    </Card>
  );
}

// ------------------------------------------------------------------ settings

function SettingsCard({ status: s }: { status: ParentLineStatus }) {
  const canManage = useCan('comms.manage');
  const [form, setForm] = useState<ParentLineSettings>(s.settings);
  const [cap, setCap] = useState(String(s.settings.dailySmsCapPerPhone));
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    setForm(s.settings);
    setCap(String(s.settings.dailySmsCapPerPhone));
  }, [s.settings]);
  const save = useMutation({ meta: { silent: true }, mutationFn: (b: ParentLineSettings) => api.put<ParentLineStatus>('/comms/parent-lines', b), onSuccess: onSaved });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parentLineSettingsSchema.safeParse({ ...form, dailySmsCapPerPhone: Number(cap) });
    if (!parsed.success) return setErrors(zodErrors(parsed.error.issues));
    setErrors({});
    save.mutate(parsed.data, { onSuccess: () => toast.success('SMS & USSD settings saved'), onError: (err) => setErrors(apiFieldErrors(err)) });
  };

  const toggle = (key: 'enabled' | 'consentBySms', title: string, hint: string) => (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
      <span className="min-w-0 text-[13px]">
        <span className="block font-medium">{title}</span>
        <span className="block text-[12px] text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={form[key]} onCheckedChange={(v) => setForm((f) => ({ ...f, [key]: v }))} disabled={!canManage} aria-label={title} className="mt-0.5" />
    </label>
  );

  return (
    <Card className="p-5">
      <p className="font-display text-[15px] font-semibold tracking-tight">Settings</p>
      <form onSubmit={submit} noValidate className="mt-3 grid gap-3">
        {toggle('enabled', 'Parents can use the line', 'When off, callers from this school hear that their number is not set up.')}
        {toggle('consentBySms', 'Allow consent by SMS', 'Where the privacy notice must be accepted, parents can get the notice link by SMS and reply YES. The version and time are recorded and audited. Off: they accept in the portal or at the school.')}
        <Field label="SMS replies per parent per day" htmlFor="pl-cap" error={errors.dailySmsCapPerPhone} hint="Each keyword reply is an SMS your school pays for. USSD menus are not limited this way.">
          <Input id="pl-cap" inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))} disabled={!canManage} invalid={!!errors.dailySmsCapPerPhone} className="sm:w-32" />
        </Field>
        <FormError message={errors.form} />
        {canManage ? (
          <Button type="submit" loading={save.isPending} className="justify-self-start">
            {!save.isPending && <Check />} Save
          </Button>
        ) : (
          <p className="text-[12px] text-muted-foreground">Only staff who manage messaging can change these.</p>
        )}
      </form>
    </Card>
  );
}

// ------------------------------------------------------------------ simulator

type Turn = { from: 'parent' | 'line' | 'sms'; text: string };

function SimulatorCard() {
  const canManage = useCan('comms.manage');
  const [channel, setChannel] = useState<'USSD' | 'SMS'>('USSD');
  const [phone, setPhone] = useState('');
  const [path, setPath] = useState<string[] | null>(null);
  const [screen, setScreen] = useState<ParentLineSimulateResult | null>(null);
  const [entry, setEntry] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const sim = useMutation({
    meta: { silent: true },
    mutationFn: (b: ParentLineSimulateInput) => api.post<ParentLineSimulateResult>('/comms/parent-lines/simulate', b),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: KEY }),
  });

  if (!canManage) return null;

  const reset = () => {
    setPath(null);
    setScreen(null);
    setEntry('');
    setTurns([]);
  };

  const dial = (next: string[]) =>
    sim.mutate(
      { channel: 'USSD', phone, text: next.join('*') },
      {
        onSuccess: (r) => {
          setPath(r.end ? null : next);
          setScreen(r);
          setEntry('');
          if (r.sms.length) setTurns((t) => [...t, ...r.sms.map((text) => ({ from: 'sms' as const, text }))]);
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    );

  const sendSms = () => {
    const text = entry.trim();
    if (!text) return;
    sim.mutate(
      { channel: 'SMS', phone, text },
      {
        onSuccess: (r) => {
          setTurns((t) => [...t, { from: 'parent', text }, { from: 'line', text: r.reply }, ...r.sms.map((x) => ({ from: 'sms' as const, text: x }))]);
          setEntry('');
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  };

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-display text-[15px] font-semibold tracking-tight">Test as a parent</p>
        <div className="flex gap-1.5" role="group" aria-label="Channel">
          {(['USSD', 'SMS'] as const).map((c) => (
            <Button
              key={c}
              type="button"
              size="sm"
              variant={channel === c ? 'secondary' : 'ghost'}
              aria-pressed={channel === c}
              onClick={() => {
                setChannel(c);
                reset();
              }}
            >
              {c === 'USSD' ? <Hash /> : <MessageSquareText />} {c}
            </Button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-[12.5px] text-muted-foreground">Type a parent’s phone number from your records to see exactly what they would get. Nothing is sent and nothing is changed; tests are logged.</p>
      <div className="mt-3 grid gap-3">
        <Field label="Parent’s phone" htmlFor="pl-phone">
          <Input id="pl-phone" inputMode="tel" placeholder="0803 123 4567" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>

        {channel === 'USSD' ? (
          <div className="mx-auto w-full max-w-[300px] rounded-[28px] border border-border bg-muted/40 p-3 shadow-sm">
            <div className="min-h-[190px] whitespace-pre-wrap rounded-2xl bg-card p-3 font-mono text-[12.5px] leading-relaxed" aria-live="polite">
              {screen ? screen.reply : <span className="text-muted-foreground">Press Dial to start a session.</span>}
              {screen?.end && <p className="mt-2 text-[11px] text-muted-foreground">Session ended.</p>}
            </div>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!path) dial([]);
                else if (entry.trim()) dial([...path, entry.trim()]);
              }}
            >
              <Input aria-label="Your reply" inputMode="numeric" value={entry} onChange={(e) => setEntry(e.target.value.replace(/[^0-9*#]/g, '').slice(0, 6))} disabled={!path} placeholder={path ? 'Reply' : ''} className="min-w-0 flex-1" />
              <Button type="submit" loading={sim.isPending} disabled={!phone.trim()}>
                {!sim.isPending && (path ? <Send /> : <Phone />)} {path ? 'Send' : 'Dial'}
              </Button>
            </form>
            {path && (
              <Button type="button" variant="ghost" size="sm" className="mt-1 w-full" onClick={reset}>
                <RotateCcw /> Hang up
              </Button>
            )}
          </div>
        ) : (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              sendSms();
            }}
          >
            <Input aria-label="Message" placeholder="RESULT" value={entry} onChange={(e) => setEntry(e.target.value.slice(0, 160))} className="min-w-0 flex-1" />
            <Button type="submit" loading={sim.isPending} disabled={!phone.trim() || !entry.trim()}>
              {!sim.isPending && <Send />} Send
            </Button>
          </form>
        )}

        {turns.length > 0 && (
          <div className="grid gap-2" aria-live="polite">
            {turns.map((t, i) => (
              <div
                key={i}
                className={cn(
                  'max-w-[90%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[12.5px] leading-relaxed',
                  t.from === 'parent' ? 'justify-self-end bg-brand text-brand-foreground' : 'justify-self-start border border-border bg-card',
                )}
              >
                {t.from === 'sms' && <span className="mb-0.5 block text-[10.5px] font-medium text-muted-foreground">SMS that would be sent</span>}
                {t.text}
              </div>
            ))}
            <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => setTurns([])}>
              Clear
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ usage

const ACTION_LABELS: Record<string, string> = {
  MENU: 'Menus',
  RESULT: 'Results',
  FEES: 'Fees',
  ATTENDANCE: 'Attendance',
  UPDATE: 'Learning update',
  CONTACT: 'School contact',
  HELP: 'Help',
  STOP: 'STOP',
  START: 'START',
  YES: 'Consent (YES)',
  CONSENT_PROMPT: 'Privacy notice sent',
  PAY_LINK: 'Payment link sent',
};

function UsageCard({ status: s }: { status: ParentLineStatus }) {
  const u = s.usage;
  const stat = (label: string, value: string) => (
    <div className="rounded-xl border border-border px-3 py-2.5">
      <p className="text-[11.5px] text-muted-foreground">{label}</p>
      <p className="font-display text-[19px] font-semibold tabular">{value}</p>
    </div>
  );
  return (
    <Card className="p-5">
      <p className="font-display text-[15px] font-semibold tracking-tight">Usage (last 30 days)</p>
      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {stat('USSD sessions', String(u.ussdSessions))}
        {stat('SMS requests', String(u.smsRequests))}
        {stat('Parents', String(u.parents))}
        {stat('SMS sent', String(u.smsUnits))}
      </div>
      <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
        About <strong className="text-foreground">{formatMoney(u.estimatedSmsCostKobo, s.currency)}</strong> in SMS at your price of {formatMoney(s.smsPricePerUnitKobo, s.currency)} a page (Messages → Settings). This is an estimate:
        USSD session charges and short-code fees depend on the provider and network, so confirm current prices with your provider. {s.optedOut > 0 && `${s.optedOut} parent record${s.optedOut === 1 ? '' : 's'} texted STOP.`}
      </p>
      {u.byAction.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {u.byAction.map((a) => (
            <Badge key={a.action} variant="outline">
              {ACTION_LABELS[a.action] ?? a.action} · {a.count}
            </Badge>
          ))}
        </div>
      )}
      <p className="mt-5 text-[13px] font-medium">Recent requests</p>
      {s.recent.length === 0 ? (
        <EmptyState compact icon={Smartphone} title="No requests yet" description="Requests from parents (and your tests) appear here." />
      ) : (
        <ul className="mt-2 max-h-[420px] divide-y divide-border overflow-y-auto rounded-xl border border-border">
          {s.recent.map((r) => (
            <li key={r.id} className="px-3 py-2.5 text-[12.5px]">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline">{r.channel}</Badge>
                {r.simulated && <Badge variant="outline">Test</Badge>}
                <span className="font-mono text-muted-foreground">{r.phone}</span>
                <span className="text-muted-foreground">· {ACTION_LABELS[r.action] ?? r.action}</span>
                {r.status !== 'ANSWERED' && <Badge variant="warning">{r.status.replace(/_/g, ' ').toLowerCase()}</Badge>}
                <span className="ml-auto text-[11.5px] text-muted-foreground">{formatRelative(r.createdAt)}</span>
              </div>
              {r.input && <p className="mt-1 font-mono text-[11.5px] text-muted-foreground">“{r.input}”</p>}
              {r.reply && <p className="mt-1 line-clamp-2 text-muted-foreground">{r.reply}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ own code

function OwnCodeCard({ status: s }: { status: ParentLineStatus }) {
  const canManage = useCan('comms.manage');
  const o = s.override;
  const [open, setOpen] = useState(!!o);
  const [form, setForm] = useState({ username: o?.username ?? '', apiKey: '', ussdCode: o?.ussdCode ?? '', shortCode: o?.shortCode ?? '', sandbox: o?.sandbox ?? false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMutation({ meta: { silent: true }, mutationFn: (b: ParentLineOverrideInput) => api.put<ParentLineStatus>('/comms/parent-lines/own-code', b), onSuccess: onSaved });
  const remove = useMutation({ meta: { silent: true }, mutationFn: () => api.delete<ParentLineStatus>('/comms/parent-lines/own-code'), onSuccess: onSaved });

  const submit = (e: FormEvent | null, regenerateSecret = false) => {
    e?.preventDefault();
    const parsed = parentLineOverrideSchema.safeParse({ ...form, apiKey: form.apiKey.trim() || undefined, regenerateSecret });
    if (!parsed.success) return setErrors(zodErrors(parsed.error.issues));
    setErrors({});
    save.mutate(parsed.data, {
      onSuccess: () => {
        setForm((f) => ({ ...f, apiKey: '' }));
        toast.success(regenerateSecret ? 'New callback URLs made — paste them into Africa’s Talking' : 'Your own code is saved');
      },
      onError: (err) => setErrors(apiFieldErrors(err)),
    });
  };

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-[15px] font-semibold tracking-tight">Your school’s own code (optional)</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">Most schools use the shared code. If your school has its own USSD code or short code with Africa’s Talking, connect it here; it then serves only your parents.</p>
        </div>
        {!open && canManage && (
          <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => setOpen(true)}>
            <KeyRound /> Set up
          </Button>
        )}
      </div>
      {open && (
        <form onSubmit={submit} noValidate className="mt-4 grid gap-3">
          <Field label="Africa’s Talking username" htmlFor="pl-user" error={errors.username}>
            <Input id="pl-user" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} disabled={!canManage} invalid={!!errors.username} autoComplete="off" />
          </Field>
          <Field label={o ? `API key (saved, ends ${o.apiKeyHint})` : 'API key'} htmlFor="pl-key" error={errors.apiKey} hint={o ? 'Leave blank to keep the saved key.' : 'Stored encrypted; never shown again.'}>
            <Input id="pl-key" type="password" value={form.apiKey} onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))} disabled={!canManage} invalid={!!errors.apiKey} autoComplete="off" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="USSD code" htmlFor="pl-ussd" error={errors.ussdCode} optional>
              <Input id="pl-ussd" placeholder="*384*1234#" value={form.ussdCode} onChange={(e) => setForm((f) => ({ ...f, ussdCode: e.target.value }))} disabled={!canManage} invalid={!!errors.ussdCode} />
            </Field>
            <Field label="Short code (two-way SMS)" htmlFor="pl-sc" error={errors.shortCode} optional>
              <Input id="pl-sc" placeholder="32123" value={form.shortCode} onChange={(e) => setForm((f) => ({ ...f, shortCode: e.target.value }))} disabled={!canManage} invalid={!!errors.shortCode} />
            </Field>
          </div>
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-[13px]">
            <span>Sandbox (testing account)</span>
            <Switch checked={form.sandbox} onCheckedChange={(v) => setForm((f) => ({ ...f, sandbox: v }))} disabled={!canManage} aria-label="Sandbox" />
          </label>
          {o && (o.ussdCallbackUrl || o.smsCallbackUrl) && (
            <div className="grid gap-2 text-[12.5px] text-muted-foreground">
              <p>In Africa’s Talking, set these as the callback URLs (USSD → your service code; SMS → your short code’s incoming messages). Keep them private: they contain a secret.</p>
              {o.ussdCallbackUrl && <CopyValue label="USSD callback URL" value={o.ussdCallbackUrl} />}
              {o.smsCallbackUrl && <CopyValue label="Incoming SMS callback URL" value={o.smsCallbackUrl} />}
            </div>
          )}
          <FormError message={errors.form} />
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={save.isPending}>
                {!save.isPending && <Check />} Save
              </Button>
              {o && (
                <>
                  <Button type="button" variant="ghost" onClick={() => submit(null, true)} disabled={save.isPending}>
                    <RotateCcw /> New callback URLs
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-danger"
                    loading={remove.isPending}
                    onClick={() => remove.mutate(undefined, { onSuccess: () => toast.success('Back to the shared code'), onError: (err) => toast.error(errorMessage(err)) })}
                  >
                    {!remove.isPending && <Trash2 />} Use the shared code
                  </Button>
                </>
              )}
            </div>
          )}
        </form>
      )}
    </Card>
  );
}
