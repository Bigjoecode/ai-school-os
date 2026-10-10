import { parentLinePlatformSchema, type ParentLinePlatformInput, type ParentLinePlatformView } from '@aischool/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, Copy, RotateCcw, ShieldCheck } from 'lucide-react';
import { type ChangeEvent, type FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/query-client';
import { apiFieldErrors, FormError, zodErrors } from '../operations/ui';

const KEY = ['platform', 'parent-lines'] as const;

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1.5">
      <p className="text-[12px] font-medium text-muted-foreground">{label}</p>
      <div className="flex gap-2">
        <Input readOnly value={value} aria-label={label} className="min-w-0 flex-1 font-mono text-[12px]" onFocus={(e) => e.currentTarget.select()} />
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

/** Console → Parent SMS & USSD: the platform's shared USSD code and short code (Africa's Talking). */
export default function ParentLinesConsolePage() {
  const q = useQuery({ queryKey: KEY, queryFn: ({ signal }) => api.get<ParentLinePlatformView>('/platform/parent-lines', undefined, signal) });
  const v = q.data;
  return (
    <Page className="max-w-5xl">
      <PageHeader
        title="Parent SMS & USSD"
        description="One shared USSD code and two-way short code for every school. Parents are matched to schools by their phone number; each school switches the line on for its own parents."
        actions={v && <Badge variant={v.enabled ? 'success' : 'outline'} dot={v.enabled}>{v.enabled ? 'Shared line on' : 'Shared line off'}</Badge>}
      />
      {q.error && !v ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !v ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] [&>*]:min-w-0">
          <SettingsForm view={v} />
          <div className="grid content-start gap-5 [&>*]:min-w-0">
            <Card className="p-5">
              <p className="font-display text-[15px] font-semibold tracking-tight">Callback URLs</p>
              {v.ussdCallbackUrl ? (
                <div className="mt-3 grid gap-3">
                  <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                    Paste these into Africa’s Talking: USSD → your service code → callback URL, and SMS → your short code → incoming messages callback. They contain a secret, so keep them private; make new
                    ones if they leak.
                  </p>
                  <CopyField label="USSD callback URL" value={v.ussdCallbackUrl} />
                  {v.smsCallbackUrl && <CopyField label="Incoming SMS callback URL" value={v.smsCallbackUrl} />}
                  {v.genericSmsUrl && <CopyField label="Other aggregators (JSON: from, text → { reply })" value={v.genericSmsUrl} />}
                </div>
              ) : (
                <p className="mt-2 text-[12.5px] text-muted-foreground">Save the settings once to create the callback URLs.</p>
              )}
            </Card>
            <Card className="p-5">
              <p className="font-display text-[15px] font-semibold tracking-tight">Last 30 days</p>
              <dl className="mt-3 grid grid-cols-2 gap-2.5 text-[12.5px]">
                {(
                  [
                    ['Schools with the line on', v.schoolsEnabled],
                    ['USSD sessions', v.ussdSessions30d],
                    ['SMS requests', v.smsRequests30d],
                    ['SMS pages sent', v.smsUnits30d],
                    ['Unknown numbers', v.unknownNumbers30d],
                  ] as const
                ).map(([label, n]) => (
                  <div key={label} className="rounded-xl border border-border px-3 py-2">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="font-display text-[18px] font-semibold tabular">{n}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">SMS sent through the shared account is billed to the platform’s Africa’s Talking account. Schools see their own usage and an estimate at their SMS price.</p>
            </Card>
          </div>
        </div>
      )}
    </Page>
  );
}

function SettingsForm({ view: v }: { view: ParentLinePlatformView }) {
  const initial = () => ({ enabled: v.enabled, username: v.username, apiKey: '', ussdCode: v.ussdCode ?? '', shortCode: v.shortCode ?? '', sandbox: v.sandbox, brandName: v.brandName });
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setForm(initial()), [v]);
  const save = useMutation({ meta: { silent: true }, mutationFn: (b: ParentLinePlatformInput) => api.put<ParentLinePlatformView>('/platform/parent-lines', b), onSuccess: (r) => queryClient.setQueryData(KEY, r) });

  const submit = (e: FormEvent | null, regenerateSecret = false) => {
    e?.preventDefault();
    const parsed = parentLinePlatformSchema.safeParse({ ...form, provider: 'africastalking', apiKey: form.apiKey.trim() || undefined, regenerateSecret });
    if (!parsed.success) return setErrors(zodErrors(parsed.error.issues));
    setErrors({});
    save.mutate(parsed.data, { onSuccess: () => toast.success(regenerateSecret ? 'New callback URLs made — update them in Africa’s Talking' : 'Shared line saved'), onError: (err) => setErrors(apiFieldErrors(err)) });
  };
  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Card className="p-5">
      <form onSubmit={submit} noValidate className="grid gap-3">
        <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
          <span className="min-w-0 text-[13px]">
            <span className="block font-medium">Shared line on</span>
            <span className="block text-[12px] text-muted-foreground">Answers callbacks on the shared code. Each school must also switch it on under Messages → SMS & USSD.</span>
          </span>
          <Switch checked={form.enabled} onCheckedChange={(enabled) => setForm((f) => ({ ...f, enabled }))} aria-label="Shared line on" className="mt-0.5" />
        </label>
        <p className="text-[12px] text-muted-foreground">Provider: Africa’s Talking (USSD and two-way SMS). Other licensed aggregators can forward incoming SMS to the generic URL.</p>
        <Field label="Africa’s Talking username" htmlFor="pp-user" error={errors.username}>
          <Input id="pp-user" value={form.username} onChange={set('username')} autoComplete="off" invalid={!!errors.username} />
        </Field>
        <Field label={v.apiKeySaved ? `API key (saved, ends ${v.apiKeyHint})` : 'API key'} htmlFor="pp-key" error={errors.apiKey} hint={v.apiKeySaved ? 'Leave blank to keep the saved key.' : 'Stored encrypted; never shown again.'}>
          <Input id="pp-key" type="password" value={form.apiKey} onChange={set('apiKey')} autoComplete="off" invalid={!!errors.apiKey} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Shared USSD code" htmlFor="pp-ussd" error={errors.ussdCode} optional>
            <Input id="pp-ussd" placeholder="*384*1234#" value={form.ussdCode} onChange={set('ussdCode')} invalid={!!errors.ussdCode} />
          </Field>
          <Field label="Shared short code" htmlFor="pp-sc" error={errors.shortCode} optional>
            <Input id="pp-sc" placeholder="32123" value={form.shortCode} onChange={set('shortCode')} invalid={!!errors.shortCode} />
          </Field>
        </div>
        <Field label="Name in replies to unknown numbers" htmlFor="pp-brand" error={errors.brandName}>
          <Input id="pp-brand" value={form.brandName} onChange={set('brandName')} invalid={!!errors.brandName} />
        </Field>
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-[13px]">
          <span>Sandbox (Africa’s Talking test environment)</span>
          <Switch checked={form.sandbox} onCheckedChange={(sandbox) => setForm((f) => ({ ...f, sandbox }))} aria-label="Sandbox" />
        </label>
        <FormError message={errors.form} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={save.isPending}>
            {!save.isPending && <Check />} Save
          </Button>
          {v.ussdCallbackUrl && (
            <Button type="button" variant="ghost" onClick={() => submit(null, true)} disabled={save.isPending}>
              <RotateCcw /> New callback URLs
            </Button>
          )}
        </div>
        <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>Africa’s Talking does not sign callbacks, so each callback URL carries a long random secret. You can also ask Africa’s Talking for their callback IP addresses and restrict them at the web server.</span>
        </p>
      </form>
    </Card>
  );
}
