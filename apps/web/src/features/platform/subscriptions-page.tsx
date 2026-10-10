import {
  SCHOOL_TYPE_LABELS,
  type BillingStateKey,
  type SelfServeSettings,
  type SignupRow,
  type SubscriptionsSummary,
  type TenantBillingRow,
} from '@aischool/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, BadgeCheck, CircleDollarSign, Hourglass, Inbox, Lock, Settings2, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { FormDialog, SwitchRow } from '@/components/ui/form-dialog';
import { Input, inputClass } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api';
import { usePlatformRole } from '@/lib/auth-store';
import { formatDate, formatNumber } from '@/lib/format';
import { queryClient } from '@/lib/query-client';
import { cn } from '@/lib/utils';
import { naira } from './api';
import { Kpi, Section, useTabParam } from './ui';

const KEY = ['platform', 'subscriptions'] as const;
const STATE_BADGE: Record<BillingStateKey, { label: string; variant: BadgeProps['variant'] }> = {
  OK: { label: 'In good standing', variant: 'success' },
  TRIAL: { label: 'Trial', variant: 'brand' },
  GRACE: { label: 'Grace period', variant: 'warning' },
  READ_ONLY: { label: 'Read-only', variant: 'danger' },
};
const TABS = ['schools', 'signups', 'settings'] as const;

/** Self-serve sign-ups and subscription billing: who is on trial, overdue or read-only, the review queue, and the rules. */
export default function SubscriptionsPage() {
  const [tab, setTab] = useTabParam(TABS, 'schools');
  const q = useQuery({ queryKey: KEY, queryFn: ({ signal }) => api.get<SubscriptionsSummary>('/platform/subscriptions/summary', undefined, signal) });
  const s = q.data;
  return (
    <Page>
      <PageHeader title="Subscriptions" description="Self-serve sign-ups, trials, overdue schools and the billing rules. Existing schools are grandfathered until you switch billing rules on for them." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Term revenue (paying schools)" icon={CircleDollarSign} value={s ? naira(s.termRevenueKobo) : '—'} sub="Per term at today’s student counts" loading={!s} />
        <Kpi label="Collected, last 120 days" icon={BadgeCheck} tone="success" value={s ? naira(s.collectedLast120DaysKobo) : '—'} loading={!s} />
        <Kpi label="On trial" icon={Hourglass} value={s?.counts.TRIAL ?? '—'} loading={!s} />
        <Kpi label="Grace / read-only" icon={Lock} tone={s && s.counts.READ_ONLY ? 'danger' : 'warning'} value={s ? `${s.counts.GRACE} / ${s.counts.READ_ONLY}` : '—'} sub={s ? `${s.overdue} with an overdue invoice` : undefined} loading={!s} />
        <Kpi label="Sign-ups to review" icon={Inbox} tone={s?.pendingSignups ? 'warning' : undefined} value={s?.pendingSignups ?? '—'} loading={!s} />
      </div>
      <div className="mt-6 flex gap-1 overflow-x-auto rounded-xl border border-border bg-muted/40 p-1" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn('whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium', tab === t ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            {t === 'schools' ? 'Schools' : t === 'signups' ? `Sign-ups${s?.pendingSignups ? ` (${s.pendingSignups})` : ''}` : 'Settings'}
          </button>
        ))}
      </div>
      <div className="mt-4">
        {q.error && !s ? (
          <Card>
            <ErrorState error={q.error} onRetry={() => void q.refetch()} />
          </Card>
        ) : tab === 'schools' ? (
          s ? <SchoolsTab rows={s.rows} /> : <Skeleton className="h-96 rounded-2xl" />
        ) : tab === 'signups' ? (
          <SignupsTab />
        ) : s ? (
          <SettingsTab settings={s.settings} />
        ) : (
          <Skeleton className="h-96 rounded-2xl" />
        )}
      </div>
    </Page>
  );
}

// ------------------------------------------------------------------ schools

function SchoolsTab({ rows }: { rows: TenantBillingRow[] }) {
  const [filter, setFilter] = useState<'all' | 'attention' | 'self'>('attention');
  const [edit, setEdit] = useState<TenantBillingRow | null>(null);
  const shown = rows.filter((r) => (filter === 'all' ? true : filter === 'self' ? r.selfServe : r.status.state !== 'OK' || r.outstandingKobo > 0));
  return (
    <Section
      title="Schools"
      description="Billing state is worked out from each school’s trial date and invoices. Nothing is ever deleted automatically."
      flush
      actions={
        <select className={cn(inputClass, 'h-9 w-auto')} value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Show">
          <option value="attention">Needs attention</option>
          <option value="self">Self-serve schools</option>
          <option value="all">All schools</option>
        </select>
      }
    >
      {shown.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13px] text-muted-foreground">Nothing here.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>School</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="text-right">Students</TableHead>
                <TableHead className="text-right">Per term</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((r) => (
                <TableRow key={r.tenantId}>
                  <TableCell>
                    <Link to={`/platform/schools/${r.tenantId}`} className="font-medium hover:underline">
                      {r.name}
                    </Link>
                    <p className="text-[12px] text-muted-foreground">
                      {r.slug}
                      {r.selfServe ? ' · self-serve' : ''}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATE_BADGE[r.status.state].variant}>{STATE_BADGE[r.status.state].label}</Badge>
                    <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                      {!r.status.enforced
                        ? 'Billing rules off'
                        : r.status.state === 'TRIAL' && r.status.trialEndsAt
                          ? `Ends ${formatDate(r.status.trialEndsAt)}`
                          : r.status.readOnlyAt
                            ? `${r.status.state === 'GRACE' ? 'Read-only from' : 'Since'} ${formatDate(r.status.readOnlyAt)}`
                            : ''}
                    </p>
                  </TableCell>
                  <TableCell>
                    {r.plan ?? '—'}
                    {r.discountPct ? <span className="text-[12px] text-muted-foreground"> · {r.discountPct === 100 ? 'comp' : `${r.discountPct}% off`}</span> : null}
                  </TableCell>
                  <TableCell className="text-right tabular">{formatNumber(r.activeStudents)}</TableCell>
                  <TableCell className="text-right tabular">{r.termValueKobo ? naira(r.termValueKobo) : '—'}</TableCell>
                  <TableCell className={cn('text-right tabular', r.outstandingKobo > 0 && 'font-medium text-danger')}>{r.outstandingKobo ? naira(r.outstandingKobo) : '—'}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => setEdit(r)}>
                      <Settings2 /> Manage
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <ManageDialog row={edit} onClose={() => setEdit(null)} />
    </Section>
  );
}

function ManageDialog({ row, onClose }: { row: TenantBillingRow | null; onClose: () => void }) {
  const [enforced, setEnforced] = useState<'inherit' | 'on' | 'off'>('inherit');
  const [extend, setExtend] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState('');
  useEffect(() => {
    if (!row) return;
    setEnforced(row.enforcedSetting === null ? 'inherit' : row.enforcedSetting ? 'on' : 'off');
    setExtend(0);
    setDiscount(row.discountPct);
    setNotes(row.notes ?? '');
  }, [row]);
  const save = useMutation({
    mutationFn: () =>
      api.put(`/platform/tenants/${row!.tenantId}/billing`, { enforced: enforced === 'inherit' ? null : enforced === 'on', extendTrialDays: extend, discountPct: discount, notes: notes.trim() || null }),
    onSuccess: () => {
      toast.success('Saved');
      void queryClient.invalidateQueries({ queryKey: KEY });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <FormDialog
      open={!!row}
      onOpenChange={(o) => !o && onClose()}
      title={`Billing for ${row?.name ?? ''}`}
      description="Extend a trial, give a discount or a complimentary account, or switch the billing rules on or off for this school."
      submitLabel="Save"
      pending={save.isPending}
      onSubmit={(e) => {
        e?.preventDefault();
        save.mutate();
      }}
    >
      <div className="space-y-4">
        <Field label="Billing rules (grace period, read-only)" htmlFor="enf" hint={row?.selfServe ? 'Self-serve schools follow the rules by default.' : 'Existing schools are grandfathered unless you switch this on (or turn on “all schools” in Settings).'}>
          <select id="enf" className={inputClass} value={enforced} onChange={(e) => setEnforced(e.target.value as typeof enforced)}>
            <option value="inherit">Platform default</option>
            <option value="on">On for this school</option>
            <option value="off">Off for this school</option>
          </select>
        </Field>
        <Field label="Extend the trial by (days)" htmlFor="ext" hint="Counts from the later of today and the current trial end. A lapsed unpaid school goes back on trial.">
          <Input id="ext" type="number" min={0} max={365} value={extend} onChange={(e) => setExtend(Math.max(0, Number(e.target.value) || 0))} />
        </Field>
        <Field label="Discount on the subscription (%)" htmlFor="disc" hint="100 = complimentary. Applies to invoices issued from now on.">
          <Input id="disc" type="number" min={0} max={100} value={discount} onChange={(e) => setDiscount(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} />
        </Field>
        <Field label="Notes" htmlFor="bn" optional>
          <Textarea id="bn" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
        </Field>
      </div>
    </FormDialog>
  );
}

// ------------------------------------------------------------------ sign-ups

function SignupsTab() {
  const role = usePlatformRole();
  const canReview = role === 'SUPER_ADMIN' || role === 'SUPPORT_ADMIN';
  const q = useQuery({ queryKey: [...KEY, 'signups'], queryFn: ({ signal }) => api.get<SignupRow[]>('/platform/signups', undefined, signal) });
  const [rejecting, setRejecting] = useState<SignupRow | null>(null);
  const [reason, setReason] = useState('');
  const approve = useMutation({
    mutationFn: (id: string) => api.post(`/platform/signups/${id}/approve`, {}),
    onSuccess: () => {
      toast.success('School created and the admin emailed');
      void queryClient.invalidateQueries({ queryKey: KEY });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const reject = useMutation({
    mutationFn: () => api.post(`/platform/signups/${rejecting!.id}/reject`, { reason }),
    onSuccess: () => {
      toast.success('Sign-up declined; the reason was emailed');
      setRejecting(null);
      setReason('');
      void queryClient.invalidateQueries({ queryKey: KEY });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const rows = q.data ?? [];
  return (
    <Section title={<><UserPlus className="size-4 text-muted-foreground" /> Sign-ups</>} description="Confirmed sign-ups. With auto-approve off, new schools wait here until someone approves them." flush>
      {q.isLoading ? (
        <Skeleton className="m-4 h-40 rounded-xl" />
      ) : rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13px] text-muted-foreground">No sign-ups yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {r.schoolName} <span className="font-mono text-[12px] text-muted-foreground">{r.slug}</span>
                </p>
                <p className="text-[12.5px] text-muted-foreground">
                  {SCHOOL_TYPE_LABELS[r.schoolType]} · {r.lga}, {r.state} · about {formatNumber(r.approxStudents)} students{r.plan ? ` · ${r.plan}` : ''}
                </p>
                <p className="text-[12.5px] text-muted-foreground">
                  {r.admin.name} · {r.admin.email} · {r.admin.phone} · {formatDate(r.createdAt)}
                </p>
                {r.reviewNote && <p className="mt-0.5 text-[12px] text-warning">{r.reviewNote}</p>}
              </div>
              {r.status === 'PENDING_REVIEW' && canReview ? (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => approve.mutate(r.id)} loading={approve.isPending && approve.variables === r.id}>
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setRejecting(r)}>
                    Decline
                  </Button>
                </div>
              ) : (
                <Badge variant={r.status === 'APPROVED' ? 'success' : r.status === 'REJECTED' ? 'secondary' : 'warning'}>
                  {r.status === 'APPROVED' ? 'Approved' : r.status === 'REJECTED' ? 'Declined' : 'Waiting for review'}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}
      <FormDialog
        open={!!rejecting}
        onOpenChange={(o) => !o && setRejecting(null)}
        title={`Decline ${rejecting?.schoolName ?? ''}?`}
        description="The reason is emailed to the person who signed up. Nothing is created."
        submitLabel="Decline"
        pending={reject.isPending}
        onSubmit={(e) => {
          e?.preventDefault();
          if (reason.trim().length >= 3) reject.mutate();
        }}
      >
        <Field label="Reason" htmlFor="rr">
          <Textarea id="rr" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="e.g. We could not confirm the school’s details; please call us on …" />
        </Field>
      </FormDialog>
    </Section>
  );
}

// ------------------------------------------------------------------ settings

function SettingsTab({ settings }: { settings: SelfServeSettings }) {
  const role = usePlatformRole();
  const canEdit = role === 'SUPER_ADMIN';
  const [v, setV] = useState(settings);
  useEffect(() => setV(settings), [settings]);
  const save = useMutation({
    mutationFn: () => api.put<SelfServeSettings>('/platform/self-serve', v),
    onSuccess: () => {
      toast.success('Settings saved');
      void queryClient.invalidateQueries({ queryKey: KEY });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const num = (k: 'trialDays' | 'graceDays' | 'sessionDiscountPct' | 'minBilledStudents' | 'invoiceDueDays', label: string, hint?: string) => (
    <Field label={label} htmlFor={k} hint={hint}>
      <Input id={k} type="number" min={0} value={v[k]} disabled={!canEdit} onChange={(e) => setV({ ...v, [k]: Math.max(0, Number(e.target.value) || 0) })} />
    </Field>
  );
  const co = (k: keyof SelfServeSettings['company'], label: string) => (
    <Field label={label} htmlFor={`co-${k}`}>
      <Input id={`co-${k}`} value={v.company[k]} disabled={!canEdit} onChange={(e) => setV({ ...v, company: { ...v.company, [k]: e.target.value } })} />
    </Field>
  );
  return (
    <div className="space-y-4">
      <Section title="Sign-up" description="Prices come from Plans (per student per term). Online payment uses the platform’s Paystack keys (PLATFORM_PAYSTACK_SECRET_KEY).">
        <div className="space-y-3">
          <SwitchRow label="Open self-serve sign-up" description="The public /signup page accepts new schools (needs the platform’s SMTP email to send codes).">
            <Switch checked={v.enabled} disabled={!canEdit} onCheckedChange={(c) => setV({ ...v, enabled: c })} />
          </SwitchRow>
          <SwitchRow label="Approve automatically" description="Off: confirmed sign-ups wait in the Sign-ups tab for someone to approve.">
            <Switch checked={v.autoApprove} disabled={!canEdit} onCheckedChange={(c) => setV({ ...v, autoApprove: c })} />
          </SwitchRow>
          <SwitchRow label="Billing rules for all schools" description="Off: only self-serve schools (and schools you switch on) get the grace period and read-only mode. Demo schools are always exempt.">
            <Switch checked={v.enforceAll} disabled={!canEdit} onCheckedChange={(c) => setV({ ...v, enforceAll: c })} />
          </SwitchRow>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {num('trialDays', 'Trial length (days)')}
          {num('graceDays', 'Grace period (days)', 'Full access with a banner after a trial ends or an invoice is overdue; then read-only.')}
          {num('sessionDiscountPct', 'Session discount (%)', 'Off three terms paid at once.')}
          {num('minBilledStudents', 'Minimum billed students')}
          {num('invoiceDueDays', 'Invoice due after (days)')}
          <Field label="Trial reminders (days before)" htmlFor="rem" hint="Comma-separated, e.g. 7, 3, 1">
            <Input
              id="rem"
              disabled={!canEdit}
              defaultValue={v.reminderDays.join(', ')}
              onBlur={(e) => setV({ ...v, reminderDays: e.target.value.split(',').map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n > 0 && n <= 60).slice(0, 6) })}
            />
          </Field>
        </div>
      </Section>
      <Section title="Invoices and receipts" description="Printed on every invoice and receipt. Replace the placeholders with your registered company details before charging schools.">
        <div className="grid gap-4 sm:grid-cols-2">
          {co('name', 'Company name')}
          {co('rcNumber', 'RC number')}
          {co('address', 'Registered address')}
          {co('email', 'Billing email')}
          {co('phone', 'Phone')}
          {co('taxNote', 'Tax note (footer)')}
        </div>
        {Object.values(v.company).some((x) => x.includes('PLACEHOLDER')) && (
          <p className="mt-3 flex items-center gap-2 text-[12.5px] text-warning">
            <AlertTriangle className="size-3.5" /> Some details are still placeholders.
          </p>
        )}
      </Section>
      {canEdit && (
        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} loading={save.isPending}>
            Save settings
          </Button>
        </div>
      )}
    </div>
  );
}
