import {
  type Channel,
  CHANNEL_LABELS,
  CHANNELS,
  type ChannelStatus,
  commsSettingsSchema,
  type CommsSettings,
  DEFAULT_COMMS_SETTINGS,
  smsSettingsSchema,
  smtpSettingsSchema,
  whatsappSettingsSchema,
} from '@aischool/shared';
import { Bell, BellRing, Cake, CalendarClock, Check, Info, Link2Off, Pencil, Send, Settings2, Unplug } from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { koboToInput, MoneyInput, parseNaira, useCurrency } from '../finance/ui';
import { BackLink } from '../planning/ui';
import { apiFieldErrors, FormError, zodErrors } from '../operations/ui';
import { usePush } from './push';
import { type ProviderChannel, useChannels, useCommsSettings, useDisconnectChannel, useSaveChannel, useSaveCommsSettings, useTestChannel } from './api';
import { CHANNEL_ICON, insertAt, TokenChips } from './ui';
import { LanguageSelect } from '../learning/language';

type Tab = 'channels' | 'automations';

export default function CommsSettingsPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'automations' ? 'automations' : 'channels';
  const canManage = useCan('comms.manage');
  return (
    <Page className="max-w-5xl">
      <BackLink to="/messages">Messages</BackLink>
      <PageHeader
        className="mt-3"
        title="Messaging settings"
        description={canManage ? 'Connect email, SMS and WhatsApp, and choose what goes out automatically.' : 'How this school sends messages. Only admins can change these.'}
      />
      <Tabs value={tab} onValueChange={(t) => setParams(t === 'channels' ? {} : { tab: t }, { replace: true })}>
        <TabsList aria-label="Settings sections">
          <TabsTrigger value="channels">
            <Send /> Channels
          </TabsTrigger>
          <TabsTrigger value="automations">
            <Settings2 /> Automations
          </TabsTrigger>
        </TabsList>
        <TabsContent value="channels">
          <ChannelsTab canManage={canManage} />
        </TabsContent>
        <TabsContent value="automations">
          <AutomationsTab canManage={canManage} />
        </TabsContent>
      </Tabs>
    </Page>
  );
}

// ------------------------------------------------------------------ channels

function ChannelsTab({ canManage }: { canManage: boolean }) {
  const q = useChannels();
  if (q.error && !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const st = (c: Channel) => q.data?.find((x) => x.channel === c);
  if (q.isLoading) {
    return (
      <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="space-y-3 p-5">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-9 w-full" />
          </Card>
        ))}
      </div>
    );
  }
  return (
    <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
      <EmailCard status={st('EMAIL')} canManage={canManage} />
      <SmsCard status={st('SMS')} canManage={canManage} />
      <WhatsappCard status={st('WHATSAPP')} canManage={canManage} />
      <div className="grid content-start gap-5">
        <PushCard status={st('PUSH')} />
        <Card className="p-5">
          <ChannelHeading channel="IN_APP" title="In-app notifications" on detail="Always on — the bell in the app" />
          <p className="mt-3 text-[12.5px] text-muted-foreground">Everyone with an account (staff, and parents you’ve invited) sees messages under the bell. Free, and nothing to set up.</p>
        </Card>
      </div>
    </div>
  );
}

function ChannelHeading({ channel, title, on, detail }: { channel: Channel; title: string; on: boolean; detail?: string | null }) {
  const Icon = CHANNEL_ICON[channel];
  return (
    <div className="flex items-start gap-3">
      <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl border', on ? 'border-success/30 bg-success-soft text-success' : 'border-border bg-muted/50 text-muted-foreground')}>
        <Icon className="size-5" aria-hidden />
      </span>
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

/** Shared shell: status, the form when editing, and test/disconnect when connected. */
function ProviderCard({
  channel,
  title,
  status,
  canManage,
  intro,
  form,
  testPlaceholder,
  testType,
  extra,
}: {
  channel: ProviderChannel;
  title: string;
  status: ChannelStatus | undefined;
  canManage: boolean;
  intro: ReactNode;
  form: (done: () => void) => ReactNode;
  testPlaceholder: string;
  testType: 'email' | 'tel';
  extra?: ReactNode;
}) {
  const on = !!status?.configured;
  const [editing, setEditing] = useState(!on);
  const [disconnecting, setDisconnecting] = useState(false);
  const disconnect = useDisconnectChannel();
  useEffect(() => {
    if (!on) setEditing(true);
  }, [on]);
  return (
    <Card className="p-5">
      <ChannelHeading channel={channel} title={title} on={on} detail={on ? `Connected · ${status?.detail ?? ''}` : null} />
      <div className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">{intro}</div>
      {extra}
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
          <div className="mt-4 space-y-3 border-t border-border pt-4">
            <TestRow channel={channel} placeholder={testPlaceholder} type={testType} />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil /> Change details
              </Button>
              <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={() => setDisconnecting(true)}>
                <Unplug /> Disconnect
              </Button>
            </div>
          </div>
        )
      ) : (
        !on && <p className="mt-3 text-[12px] text-muted-foreground">Ask an admin with messaging settings access to connect it.</p>
      )}
      <ConfirmDialog
        open={disconnecting}
        onOpenChange={setDisconnecting}
        title={`Disconnect ${title.toLowerCase()}?`}
        description="Messages on this channel will be skipped until you connect it again. The saved password or key is deleted."
        confirmLabel="Disconnect"
        loading={disconnect.isPending}
        onConfirm={() => disconnect.mutate(channel, { onSuccess: () => setDisconnecting(false) })}
      />
    </Card>
  );
}

function TestRow({ channel, placeholder, type }: { channel: ProviderChannel; placeholder: string; type: 'email' | 'tel' }) {
  const test = useTestChannel();
  const [to, setTo] = useState('');
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (to.trim().length < 5) return setResult({ ok: false, text: type === 'email' ? 'Enter an email address' : 'Enter a phone number' });
    setResult(null);
    test.mutate(
      { channel, to: to.trim() },
      {
        onSuccess: (r) => setResult({ ok: true, text: `${r.message} — check it arrived.` }),
        onError: (err) => setResult({ ok: false, text: errorMessage(err) }),
      },
    );
  };
  const id = `test-${channel}`;
  return (
    <form onSubmit={submit} noValidate className="grid gap-1.5">
      <Label htmlFor={id}>Send a test</Label>
      <div className="flex gap-2">
        <Input id={id} type={type} value={to} onChange={(e) => setTo(e.target.value)} placeholder={placeholder} className="min-w-0 flex-1" />
        <Button type="submit" variant="outline" loading={test.isPending} className="shrink-0">
          {!test.isPending && <Send />} Send test
        </Button>
      </div>
      {result && (
        <p role="status" className={cn('text-[12px]', result.ok ? 'text-success' : 'font-medium text-danger')}>
          {result.text}
        </p>
      )}
    </form>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 flex items-start gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

// ------------------------------------------------------------------ email

const SMTP_PRESETS = [
  { label: 'cPanel mail', host: '', port: 465, secure: true, hint: 'mail.yourschool.com' },
  { label: 'Zoho Mail', host: 'smtp.zoho.com', port: 465, secure: true },
  { label: 'Google Workspace', host: 'smtp.gmail.com', port: 465, secure: true },
];

function EmailCard({ status, canManage }: { status?: ChannelStatus; canManage: boolean }) {
  return (
    <ProviderCard
      channel="EMAIL"
      title="Email"
      status={status}
      canManage={canManage}
      testPlaceholder="you@example.com"
      testType="email"
      intro="Sends from your school’s own mailbox over SMTP, so replies come back to you."
      form={(done) => <EmailForm onDone={done} />}
    />
  );
}

function EmailForm({ onDone }: { onDone: () => void }) {
  const save = useSaveChannel('EMAIL');
  const [v, setV] = useState({ host: '', port: '465', secure: true, username: '', password: '', fromEmail: '', fromName: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<typeof v>) => setV((p) => ({ ...p, ...patch }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = smtpSettingsSchema.safeParse({ ...v, port: Number(v.port), fromName: v.fromName.trim() || null });
    if (!parsed.success) return setErrors(zodErrors(parsed.error.issues));
    setErrors({});
    save.mutate(parsed.data, {
      onSuccess: () => {
        toast.success('Email connected — we checked it with your mail server');
        onDone();
      },
      onError: (err) => setErrors(apiFieldErrors(err)),
    });
  };
  return (
    <form onSubmit={submit} noValidate className="grid gap-3.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[12px] text-muted-foreground">Quick fill:</span>
        {SMTP_PRESETS.map((p) => (
          <Button key={p.label} type="button" size="sm" variant="outline" className="h-7 text-[12px]" onClick={() => set({ host: p.host || v.host, port: String(p.port), secure: p.secure })}>
            {p.label}
          </Button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_90px] [&>*]:min-w-0">
        <Field label="SMTP server" htmlFor="smtp-host" error={errors.host}>
          <Input id="smtp-host" value={v.host} onChange={(e) => set({ host: e.target.value })} placeholder="mail.yourschool.com" autoComplete="off" invalid={!!errors.host} />
        </Field>
        <Field label="Port" htmlFor="smtp-port" error={errors.port}>
          <Input id="smtp-port" inputMode="numeric" value={v.port} onChange={(e) => set({ port: e.target.value.replace(/\D/g, '').slice(0, 5) })} invalid={!!errors.port} />
        </Field>
      </div>
      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
        <span className="text-[13px]">
          <span className="font-medium">SSL/TLS</span> <span className="text-muted-foreground">— on for port 465, off for 587</span>
        </span>
        <Switch checked={v.secure} onCheckedChange={(secure) => set({ secure })} aria-label="Use SSL/TLS" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
        <Field label="Username" htmlFor="smtp-user" error={errors.username}>
          <Input id="smtp-user" value={v.username} onChange={(e) => set({ username: e.target.value })} placeholder="Usually the full email address" autoComplete="off" invalid={!!errors.username} />
        </Field>
        <Field label="Password" htmlFor="smtp-pass" error={errors.password} hint="Google: use an app password.">
          <Input id="smtp-pass" type="password" value={v.password} onChange={(e) => set({ password: e.target.value })} autoComplete="new-password" invalid={!!errors.password} />
        </Field>
        <Field label="Send from (email)" htmlFor="smtp-from" error={errors.fromEmail}>
          <Input id="smtp-from" type="email" value={v.fromEmail} onChange={(e) => set({ fromEmail: e.target.value })} placeholder="office@yourschool.com" invalid={!!errors.fromEmail} />
        </Field>
        <Field label="Send from (name)" htmlFor="smtp-name" optional>
          <Input id="smtp-name" value={v.fromName} onChange={(e) => set({ fromName: e.target.value })} maxLength={120} placeholder="Greenfield College" />
        </Field>
      </div>
      <Note>
        Common settings — your school’s cPanel mail: <strong>mail.yourschool.com</strong>, port 465, SSL. Zoho: <strong>smtp.zoho.com</strong>, 465, SSL. Google Workspace: <strong>smtp.gmail.com</strong>, 465, SSL, with an app password from your Google account’s security page.
      </Note>
      <FormError message={errors.form} />
      <Button type="submit" loading={save.isPending} className="justify-self-start">
        {!save.isPending && <Check />} {save.isPending ? 'Checking with your mail server…' : 'Save and connect'}
      </Button>
    </form>
  );
}

// ------------------------------------------------------------------ SMS

function SmsCard({ status, canManage }: { status?: ChannelStatus; canManage: boolean }) {
  const [balance, setBalance] = useState<string | null>(null);
  return (
    <ProviderCard
      channel="SMS"
      title="SMS"
      status={status}
      canManage={canManage}
      testPlaceholder="0803 123 4567"
      testType="tel"
      intro={
        <>
          Bulk SMS through <strong className="font-medium text-foreground">Termii</strong>, charged per page from your Termii wallet.
        </>
      }
      extra={
        balance && (
          <p className="mt-3 rounded-xl border border-success/30 bg-success-soft/50 px-3 py-2 text-[12.5px]">
            Termii balance: <strong className="tabular">{balance}</strong>
          </p>
        )
      }
      form={(done) => (
        <SmsForm
          onDone={(b) => {
            setBalance(b);
            done();
          }}
        />
      )}
    />
  );
}

function SmsForm({ onDone }: { onDone: (balance: string | null) => void }) {
  const save = useSaveChannel('SMS');
  const [v, setV] = useState({ apiKey: '', senderId: '', dnd: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<typeof v>) => setV((p) => ({ ...p, ...patch }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = smsSettingsSchema.safeParse({ provider: 'termii', ...v });
    if (!parsed.success) return setErrors(zodErrors(parsed.error.issues));
    setErrors({});
    save.mutate(parsed.data, {
      onSuccess: (r) => {
        toast.success(r.balance ? `SMS connected — Termii balance ${r.balance}` : 'SMS connected');
        onDone(r.balance);
      },
      onError: (err) => setErrors(apiFieldErrors(err)),
    });
  };
  return (
    <form onSubmit={submit} noValidate className="grid gap-3.5">
      <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
        <Field label="Termii API key" htmlFor="sms-key" error={errors.apiKey} hint="Termii dashboard → Settings → API.">
          <Input id="sms-key" type="password" value={v.apiKey} onChange={(e) => set({ apiKey: e.target.value })} autoComplete="off" invalid={!!errors.apiKey} />
        </Field>
        <Field label="Sender ID" htmlFor="sms-sender" error={errors.senderId} hint={`${v.senderId.length}/11 · must be approved by Termii`}>
          <Input id="sms-sender" value={v.senderId} onChange={(e) => set({ senderId: e.target.value.replace(/[^A-Za-z0-9 ]/g, '').slice(0, 11) })} placeholder="GREENFIELD" invalid={!!errors.senderId} />
        </Field>
      </div>
      <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
        <span className="min-w-0 text-[13px]">
          <span className="block font-medium">Use the DND route</span>
          <span className="block text-[12px] text-muted-foreground">
            Many Nigerian numbers are on Do-Not-Disturb and silently miss ordinary bulk SMS. The DND route reaches them, but Termii must approve it for your account first.
          </span>
        </span>
        <Switch checked={v.dnd} onCheckedChange={(dnd) => set({ dnd })} aria-label="Use the DND route" className="mt-0.5" />
      </label>
      <FormError message={errors.form} />
      <Button type="submit" loading={save.isPending} className="justify-self-start">
        {!save.isPending && <Check />} {save.isPending ? 'Checking with Termii…' : 'Save and connect'}
      </Button>
    </form>
  );
}

// ------------------------------------------------------------------ WhatsApp

function WhatsappCard({ status, canManage }: { status?: ChannelStatus; canManage: boolean }) {
  return (
    <ProviderCard
      channel="WHATSAPP"
      title="WhatsApp"
      status={status}
      canManage={canManage}
      testPlaceholder="0803 123 4567"
      testType="tel"
      intro={
        <>
          Through the <strong className="font-medium text-foreground">WhatsApp Business Cloud API</strong> (Meta). Each message is sent with your approved template.
        </>
      }
      extra={
        status?.configured && (
          <p className="mt-3 rounded-xl border border-border bg-muted/30 px-3 py-2 text-[12.5px]">
            Let parents ask questions on WhatsApp and get answers about their children:{' '}
            <Link to="/messages/whatsapp?tab=setup" className="font-medium text-brand underline-offset-4 hover:underline">
              set up the WhatsApp parent assistant
            </Link>
            .
          </p>
        )
      }
      form={(done) => <WhatsappForm onDone={done} />}
    />
  );
}

function WhatsappForm({ onDone }: { onDone: () => void }) {
  const save = useSaveChannel('WHATSAPP');
  const [v, setV] = useState({ phoneNumberId: '', accessToken: '', templateName: '', templateLanguage: 'en' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<typeof v>) => setV((p) => ({ ...p, ...patch }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = whatsappSettingsSchema.safeParse(v);
    if (!parsed.success) return setErrors(zodErrors(parsed.error.issues));
    setErrors({});
    save.mutate(parsed.data, {
      onSuccess: () => {
        toast.success('WhatsApp connected');
        onDone();
      },
      onError: (err) => setErrors(apiFieldErrors(err)),
    });
  };
  return (
    <form onSubmit={submit} noValidate className="grid gap-3.5">
      <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
        <Field label="Phone number ID" htmlFor="wa-phone" error={errors.phoneNumberId}>
          <Input id="wa-phone" inputMode="numeric" value={v.phoneNumberId} onChange={(e) => set({ phoneNumberId: e.target.value.trim() })} autoComplete="off" invalid={!!errors.phoneNumberId} />
        </Field>
        <Field label="Access token" htmlFor="wa-token" error={errors.accessToken} hint="A permanent system-user token.">
          <Input id="wa-token" type="password" value={v.accessToken} onChange={(e) => set({ accessToken: e.target.value })} autoComplete="off" invalid={!!errors.accessToken} />
        </Field>
        <Field label="Template name" htmlFor="wa-tpl" error={errors.templateName}>
          <Input id="wa-tpl" value={v.templateName} onChange={(e) => set({ templateName: e.target.value })} placeholder="school_message" invalid={!!errors.templateName} />
        </Field>
        <Field label="Template language" htmlFor="wa-lang" error={errors.templateLanguage}>
          <Input id="wa-lang" value={v.templateLanguage} onChange={(e) => set({ templateLanguage: e.target.value })} placeholder="en" maxLength={10} invalid={!!errors.templateLanguage} />
        </Field>
      </div>
      <Note>
        Create a <strong>Utility</strong> template in Meta Business Manager and wait for it to be approved. Its body needs two variables, like: <span className="font-mono text-foreground">Message from {'{{1}}'}: {'{{2}}'}</span> — we fill in your school’s name and the
        message.
      </Note>
      <FormError message={errors.form} />
      <Button type="submit" loading={save.isPending} className="justify-self-start">
        {!save.isPending && <Check />} {save.isPending ? 'Checking with Meta…' : 'Save and connect'}
      </Button>
    </form>
  );
}

// ------------------------------------------------------------------ push

function PushCard({ status }: { status?: ChannelStatus }) {
  const push = usePush();
  const on = !!status?.configured;
  return (
    <Card className="p-5">
      <ChannelHeading channel="PUSH" title="Push notifications" on={on} detail={status?.detail} />
      <p className="mt-3 text-[12.5px] text-muted-foreground">
        Browser notifications on phones and computers that allow them — free. {on ? 'Each person turns them on from the bell.' : 'This is switched on by whoever runs your server (it needs VAPID keys).'}
      </p>
      {push.available && push.state !== 'loading' && (
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-3 py-2.5">
          <BellRing className={cn('size-4 shrink-0', push.state === 'on' ? 'text-success' : 'text-muted-foreground')} aria-hidden />
          <p className="min-w-0 flex-1 text-[12.5px]">{push.state === 'on' ? 'On for this device' : push.state === 'blocked' ? 'Blocked in this browser’s settings' : 'Off for this device'}</p>
          {push.state === 'on' ? (
            <Button size="sm" variant="ghost" onClick={() => void push.disable()} loading={push.busy}>
              {!push.busy && <Link2Off />} Turn off
            </Button>
          ) : push.state === 'off' ? (
            <Button size="sm" variant="outline" onClick={() => void push.enable()} loading={push.busy}>
              {!push.busy && <Bell />} Turn on
            </Button>
          ) : null}
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ automations

function AutomationsTab({ canManage }: { canManage: boolean }) {
  const q = useCommsSettings();
  if (q.error && !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) {
    return (
      <div className="space-y-5">
        {[0, 1].map((i) => (
          <Card key={i} className="space-y-3 p-5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-20 w-full" />
          </Card>
        ))}
      </div>
    );
  }
  return <AutomationsForm initial={q.data} canManage={canManage} />;
}

function ChannelPicks({ value, onChange, disabled, label }: { value: Channel[]; onChange: (v: Channel[]) => void; disabled?: boolean; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {CHANNELS.map((c) => {
        const on = value.includes(c);
        const Icon = CHANNEL_ICON[c];
        return (
          <button
            key={c}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onChange(on ? value.filter((x) => x !== c) : [...value, c])}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60',
              on ? 'border-brand bg-brand text-brand-foreground' : 'border-border bg-card hover:bg-muted/50',
            )}
          >
            <Icon className="size-3.5" aria-hidden /> {CHANNEL_LABELS[c]}
          </button>
        );
      })}
    </div>
  );
}

function TemplateField({ id, value, onChange, disabled, error }: { id: string; value: string; onChange: (v: string) => void; disabled?: boolean; error?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>Message</Label>
      <Textarea id={id} ref={ref} rows={3} value={value} onChange={(e) => onChange(e.target.value)} maxLength={500} disabled={disabled} invalid={!!error} />
      {error && (
        <p role="alert" className="text-[12px] font-medium text-danger">
          {error}
        </p>
      )}
      {!disabled && (
        <TokenChips
          only={['{{first_name}}', '{{name}}', '{{children}}', '{{school}}']}
          onInsert={(t) => {
            const { value: next, caret } = insertAt(ref.current, value, t);
            onChange(next);
            requestAnimationFrame(() => {
              ref.current?.focus();
              ref.current?.setSelectionRange(caret, caret);
            });
          }}
        />
      )}
    </div>
  );
}

function AutomationBlock({ icon, title, description, enabled, onToggle, disabled, children }: { icon: ReactNode; title: string; description: string; enabled: boolean; onToggle: (v: boolean) => void; disabled?: boolean; children?: ReactNode }) {
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-muted/50 text-muted-foreground [&_svg]:size-5">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[15px] font-semibold tracking-tight">{title}</p>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">{description}</p>
        </div>
        <Switch checked={enabled} onCheckedChange={onToggle} disabled={disabled} aria-label={title} />
      </div>
      {enabled && children && <div className="mt-4 grid gap-3.5 border-t border-border pt-4">{children}</div>}
    </Card>
  );
}

function AutomationsForm({ initial, canManage }: { initial: CommsSettings; canManage: boolean }) {
  const save = useSaveCommsSettings();
  const currency = useCurrency();
  const [s, setS] = useState<CommsSettings>(() => ({ ...DEFAULT_COMMS_SETTINGS, ...initial }));
  const [price, setPrice] = useState(() => koboToInput(initial.smsPricePerUnitKobo));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const ro = !canManage;
  const setBirthday = (who: 'students' | 'staff', patch: Partial<CommsSettings['birthdays']['students']>) => setS((p) => ({ ...p, birthdays: { ...p.birthdays, [who]: { ...p.birthdays[who], ...patch } } }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const naira = parseNaira(price);
    const input = { ...s, senderName: s.senderName?.trim() || null, smsPricePerUnitKobo: Math.round((naira ?? 0) * 100) };
    const parsed = commsSettingsSchema.safeParse(input);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const i of parsed.error.issues) next[i.path.join('.')] ??= i.message;
      return setErrors(next);
    }
    setErrors({});
    save.mutate(parsed.data, { onError: (err) => setErrors(apiFieldErrors(err)) });
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {ro && <p className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-[13px] text-muted-foreground">You can see these settings, but only admins with messaging settings access can change them.</p>}

      <AutomationBlock
        icon={<Cake />}
        title="Student birthdays"
        description="A message to parents on their child’s birthday."
        enabled={s.birthdays.students.enabled}
        onToggle={(enabled) => setBirthday('students', { enabled })}
        disabled={ro}
      >
        <div className="grid gap-1.5">
          <Label>Send by</Label>
          <ChannelPicks label="Student birthday channels" value={s.birthdays.students.channels} onChange={(channels) => setBirthday('students', { channels })} disabled={ro} />
        </div>
        <TemplateField id="bd-students" value={s.birthdays.students.template} onChange={(template) => setBirthday('students', { template })} disabled={ro} error={errors['birthdays.students.template']} />
        <p className="text-[12px] text-muted-foreground">
          <span className="font-mono">{'{{first_name}}'}</span> is the parent; <span className="font-mono">{'{{children}}'}</span> is the birthday child.
        </p>
      </AutomationBlock>

      <AutomationBlock icon={<Cake />} title="Staff birthdays" description="A note to members of staff on their birthday." enabled={s.birthdays.staff.enabled} onToggle={(enabled) => setBirthday('staff', { enabled })} disabled={ro}>
        <div className="grid gap-1.5">
          <Label>Send by</Label>
          <ChannelPicks label="Staff birthday channels" value={s.birthdays.staff.channels} onChange={(channels) => setBirthday('staff', { channels })} disabled={ro} />
        </div>
        <TemplateField id="bd-staff" value={s.birthdays.staff.template} onChange={(template) => setBirthday('staff', { template })} disabled={ro} error={errors['birthdays.staff.template']} />
      </AutomationBlock>

      {(s.birthdays.students.enabled || s.birthdays.staff.enabled) && (
        <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <Label htmlFor="bd-time">Send birthday messages at</Label>
            <p className="mt-1 text-[12px] text-muted-foreground">School time, on the morning of the birthday.</p>
          </div>
          <Field htmlFor="bd-time" error={errors['birthdays.sendAt']} className="sm:w-36">
            <Input id="bd-time" type="time" value={s.birthdays.sendAt} onChange={(e) => setS((p) => ({ ...p, birthdays: { ...p.birthdays, sendAt: e.target.value } }))} disabled={ro} className="tabular [color-scheme:light] dark:[color-scheme:dark]" />
          </Field>
        </Card>
      )}

      <AutomationBlock
        icon={<CalendarClock />}
        title="Event reminders"
        description="Reminds the right parents and staff before calendar events that ask for a reminder."
        enabled={s.eventReminders.enabled}
        onToggle={(enabled) => setS((p) => ({ ...p, eventReminders: { ...p.eventReminders, enabled } }))}
        disabled={ro}
      >
        <div className="grid gap-1.5">
          <Label>Send by</Label>
          <ChannelPicks label="Event reminder channels" value={s.eventReminders.channels} onChange={(channels) => setS((p) => ({ ...p, eventReminders: { ...p.eventReminders, channels } }))} disabled={ro} />
        </div>
        <p className="text-[12px] text-muted-foreground">Set “Remind parents N days before” on an event in the Calendar to use this.</p>
      </AutomationBlock>

      <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <Label>Default language for parents</Label>
          <p className="mt-1 text-[12px] text-muted-foreground">
            The Parent AI, WhatsApp assistant and weekly learning updates use this when a parent hasn’t chosen their own language. Subject names and scores stay in English. Yoruba, Igbo and Hausa wording comes from the AI model — ask a native speaker to check it during your pilot.
          </p>
        </div>
        <LanguageSelect label="Default language for parents" value={s.parentLanguage ?? 'EN'} onChange={(code) => setS((p) => ({ ...p, parentLanguage: code ?? 'EN' }))} disabled={ro} />
      </Card>

      <Card className="grid gap-4 p-5 sm:grid-cols-2 [&>*]:min-w-0">
        <Field label="SMS price per page" htmlFor="sms-price" hint="What Termii charges you — used for cost estimates." error={errors.smsPricePerUnitKobo}>
          <MoneyInput id="sms-price" value={price} onChange={setPrice} currency={currency} disabled={ro} />
        </Field>
        <Field label="Sender name on email" htmlFor="sender-name" optional hint="Defaults to the school’s name.">
          <Input id="sender-name" value={s.senderName ?? ''} onChange={(e) => setS((p) => ({ ...p, senderName: e.target.value }))} maxLength={80} disabled={ro} placeholder="e.g. Greenfield College Office" />
        </Field>
      </Card>

      {canManage && (
        <div className="flex items-center gap-3">
          <Button type="submit" loading={save.isPending}>
            {!save.isPending && <Check />} Save settings
          </Button>
          <FormError message={errors.form} />
        </div>
      )}
    </form>
  );
}

