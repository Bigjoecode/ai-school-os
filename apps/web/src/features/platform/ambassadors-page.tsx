import {
  AMBASSADOR_STATUS_LABELS,
  COMMISSION_STATUS_LABELS,
  COMMISSION_STATUSES,
  INVOICE_LINE_KINDS,
  REFERRAL_SCHOOL_STATUS_LABELS,
  type AmbassadorOverview,
  type AmbassadorRow,
  type AmbassadorSettings,
  type AmbassadorStatus,
  type CommissionStatus,
  type ConsoleCommissionRow,
  type ConsolePayoutRow,
  type ConsoleReferralRow,
  type InvoiceLineKind,
  type PayoutDueRow,
} from '@aischool/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, BadgeCheck, Banknote, Download, Flag, Hourglass, Inbox, MoreHorizontal, Pencil, Plus, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
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
import { formatDate, todayIso } from '@/lib/format';
import { queryClient } from '@/lib/query-client';
import { cn } from '@/lib/utils';
import { COMMISSION_BADGE, SCHOOL_BADGE } from '../ambassadors/dashboard-page';
import { naira } from './api';
import { Kpi, Section, Toolbar, useTabParam } from './ui';

const KEY = ['platform', 'ambassadors'] as const;
const TABS = ['applications', 'ambassadors', 'referrals', 'commissions', 'payouts', 'settings'] as const;
const STATUS_BADGE: Record<AmbassadorStatus, BadgeProps['variant']> = { PENDING_VERIFICATION: 'secondary', PENDING_REVIEW: 'warning', ACTIVE: 'success', DECLINED: 'secondary', SUSPENDED: 'danger' };
const FLAG_LABEL: Record<string, string> = {
  SAME_IP_AS_AMBASSADOR: 'Signed up from the ambassador’s IP address',
  SHARED_ADMIN_PHONE: 'Admin phone shared with another referred school',
  MANY_SCHOOLS_SAME_IP: 'Several referred schools from one IP address',
};
const refresh = () => void queryClient.invalidateQueries({ queryKey: KEY });
const onErr = (e: unknown) => toast.error(errorMessage(e));

/** Console → Ambassadors: the application queue, ambassadors, referred schools, commissions, monthly payouts and the programme's settings. */
export default function AmbassadorsPage() {
  const [tab, setTab] = useTabParam(TABS, 'applications');
  const q = useQuery({ queryKey: [...KEY, 'overview'], queryFn: ({ signal }) => api.get<AmbassadorOverview>('/platform/ambassadors/overview', undefined, signal) });
  const o = q.data;
  const label = (t: (typeof TABS)[number]) =>
    ({ applications: `Applications${o?.counts.pendingReview ? ` (${o.counts.pendingReview})` : ''}`, ambassadors: 'Ambassadors', referrals: `Referred schools${o?.counts.flagged ? ` · ${o.counts.flagged} flagged` : ''}`, commissions: 'Commissions', payouts: `Payouts${o?.dueCount ? ` (${o.dueCount})` : ''}`, settings: 'Settings' })[t];
  return (
    <Page>
      <PageHeader
        title="Ambassadors"
        description={o ? `People who refer schools earn ${o.settings.ratePct}% of each subscription payment${o.settings.excludedLineKinds.length ? ` (excluding ${o.settings.excludedLineKinds.map((k) => LINE_KIND_LABELS[k].toLowerCase()).join(', ')})` : ''}${o.settings.commissionMonths ? ` for ${o.settings.commissionMonths} months` : ', for as long as the school pays'}; held ${o.settings.holdDays} days, paid monthly from ${naira(o.settings.minPayoutKobo)}.` : 'The ambassador referral programme.'}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Applications to review" icon={Inbox} tone={o?.counts.pendingReview ? 'warning' : undefined} value={o?.counts.pendingReview ?? '—'} loading={!o} />
        <Kpi label="Active ambassadors" icon={Users} value={o ? `${o.counts.active}${o.counts.suspended ? ` (+${o.counts.suspended} suspended)` : ''}` : '—'} loading={!o} />
        <Kpi label="Referred schools" icon={BadgeCheck} value={o?.counts.referredSchools ?? '—'} sub={o?.counts.flagged ? `${o.counts.flagged} flagged` : undefined} loading={!o} />
        <Kpi label="On hold / payable" icon={Hourglass} value={o ? `${naira(o.totals.pendingKobo)} / ${naira(o.totals.payableKobo)}` : '—'} loading={!o} />
        <Kpi label="Due this payout" icon={Banknote} tone={o?.dueCount ? 'warning' : undefined} value={o ? naira(o.dueKobo) : '—'} sub={o ? `${o.dueCount} ambassador${o.dueCount === 1 ? '' : 's'} · paid so far ${naira(o.totals.paidKobo)}` : undefined} loading={!o} />
      </div>
      <div className="mt-6 flex gap-1 overflow-x-auto rounded-xl border border-border bg-muted/40 p-1" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn('whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium', tab === t ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            {label(t)}
          </button>
        ))}
      </div>
      <div className="mt-4">
        {q.error && !o ? (
          <Card>
            <ErrorState error={q.error} onRetry={() => void q.refetch()} />
          </Card>
        ) : tab === 'applications' ? (
          <AmbassadorList status="PENDING_REVIEW" />
        ) : tab === 'ambassadors' ? (
          <AmbassadorList />
        ) : tab === 'referrals' ? (
          <ReferralsTab />
        ) : tab === 'commissions' ? (
          <CommissionsTab />
        ) : tab === 'payouts' ? (
          <PayoutsTab />
        ) : o ? (
          <SettingsTab settings={o.settings} />
        ) : (
          <Skeleton className="h-80 rounded-2xl" />
        )}
      </div>
    </Page>
  );
}

// ------------------------------------------------------------------ dialogs

function ReasonDialog({ open, onOpenChange, title, description, label = 'Reason', submitLabel, pending, onSubmit }: { open: boolean; onOpenChange: (v: boolean) => void; title: string; description?: string; label?: string; submitLabel: string; pending?: boolean; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (open) setReason('');
  }, [open]);
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      submitLabel={submitLabel}
      pending={pending}
      onSubmit={(e) => {
        e?.preventDefault();
        if (reason.trim().length < 3) {
          toast.error('Give a short reason');
          return;
        }
        onSubmit(reason.trim());
      }}
    >
      <Field label={label} htmlFor="reason" hint="Kept in the audit log.">
        <Textarea id="reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </FormDialog>
  );
}

// ------------------------------------------------------------------ applications / ambassadors

function AmbassadorList({ status }: { status?: AmbassadorStatus }) {
  const role = usePlatformRole();
  const q = useQuery({ queryKey: [...KEY, 'list', status ?? 'all'], queryFn: ({ signal }) => api.get<AmbassadorRow[]>('/platform/ambassadors', status ? { status } : undefined, signal) });
  const [dialog, setDialog] = useState<{ kind: 'decline' | 'suspend' | 'reinstate' | 'code'; row: AmbassadorRow } | null>(null);
  const [code, setCode] = useState('');
  const act = useMutation({
    mutationFn: ({ path, body, method = 'post' }: { path: string; body: unknown; method?: 'post' | 'put' }) => (method === 'put' ? api.put(path, body) : api.post(path, body)),
    onSuccess: (_r, v) => {
      toast.success(v.path.endsWith('/approve') ? 'Approved: the ambassador has been told their code' : 'Saved');
      setDialog(null);
      refresh();
    },
    onError: onErr,
  });
  const exportData = async (r: AmbassadorRow) => {
    try {
      const data = await api.get<unknown>(`/platform/ambassadors/${r.id}/export`);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      a.download = `ambassador-${r.code ?? r.id}-data.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast.success('Exported (audit-logged)');
    } catch (e) {
      onErr(e);
    }
  };
  const rows = q.data;
  if (!rows) return q.error ? <Card><ErrorState error={q.error} onRetry={() => void q.refetch()} /></Card> : <Skeleton className="h-80 rounded-2xl" />;
  return (
    <Section title={status ? 'Applications waiting for review' : 'All ambassadors'} description={status ? 'Email confirmed. Approve to create their sign-in and referral code, or decline with a reason (they are emailed).' : 'Referrals, earnings and status. Suspending stops new commissions.'} flush>
      {rows.length === 0 ? (
        <p className="p-6 text-center text-[13.5px] text-muted-foreground">{status ? 'No applications waiting.' : 'No ambassadors yet.'}</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ambassador</TableHead>
                <TableHead>{status ? 'How they’ll find schools' : 'Code'}</TableHead>
                <TableHead>Bank</TableHead>
                {!status && <TableHead className="text-right">Schools</TableHead>}
                {!status && <TableHead className="text-right">Earned / paid</TableHead>}
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <p className="font-medium">{r.fullName}</p>
                    <p className="text-[12px] text-muted-foreground">
                      {r.email} · {r.phone} · {r.state}
                    </p>
                  </TableCell>
                  <TableCell className="max-w-[280px]">{status ? <p className="line-clamp-3 text-[12.5px]">{r.approach}</p> : <span className="font-mono">{r.code ?? '—'}</span>}</TableCell>
                  <TableCell className="text-[12.5px]">
                    {r.bankName} ••{r.accountLast4}
                    <p className="text-muted-foreground">{r.accountName}</p>
                  </TableCell>
                  {!status && (
                    <TableCell className="text-right tabular">
                      {r.referrals} <span className="text-[12px] text-muted-foreground">({r.payingSchools} paying)</span>
                      {r.flags > 0 && (
                        <Badge variant="warning" className="ml-1">
                          <Flag className="size-3" /> {r.flags}
                        </Badge>
                      )}
                    </TableCell>
                  )}
                  {!status && (
                    <TableCell className="text-right tabular">
                      {naira(r.earnedKobo)}
                      <p className="text-[12px] text-muted-foreground">paid {naira(r.paidKobo)}</p>
                    </TableCell>
                  )}
                  <TableCell>
                    <Badge variant={STATUS_BADGE[r.status]}>{AMBASSADOR_STATUS_LABELS[r.status]}</Badge>
                    {r.reviewNote && <p className="mt-0.5 max-w-[200px] truncate text-[11.5px] text-muted-foreground" title={r.reviewNote}>{r.reviewNote}</p>}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.status === 'PENDING_REVIEW' ? (
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" loading={act.isPending && act.variables?.path === `/platform/ambassadors/${r.id}/approve`} onClick={() => act.mutate({ path: `/platform/ambassadors/${r.id}/approve`, body: {} })}>
                          Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setDialog({ kind: 'decline', row: r })}>
                          Decline
                        </Button>
                      </div>
                    ) : r.status === 'ACTIVE' || r.status === 'SUSPENDED' ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" aria-label="Actions">
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link to={`/platform/ambassadors?tab=commissions&ambassador=${r.id}`}>Commissions</Link>
                          </DropdownMenuItem>
                          {r.codeChangeable && (
                            <DropdownMenuItem
                              onSelect={() => {
                                setCode(r.code ?? '');
                                setDialog({ kind: 'code', row: r });
                              }}
                            >
                              <Pencil /> Change code (once)
                            </DropdownMenuItem>
                          )}
                          {role === 'SUPER_ADMIN' && <DropdownMenuItem onSelect={() => void exportData(r)}>Export their data (DSR)</DropdownMenuItem>}
                          <DropdownMenuSeparator />
                          {r.status === 'ACTIVE' ? (
                            <DropdownMenuItem className="text-danger" onSelect={() => setDialog({ kind: 'suspend', row: r })}>
                              Suspend
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onSelect={() => setDialog({ kind: 'reinstate', row: r })}>Reinstate</DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <ReasonDialog
        open={dialog?.kind === 'decline' || dialog?.kind === 'suspend' || dialog?.kind === 'reinstate'}
        onOpenChange={(v) => !v && setDialog(null)}
        title={dialog?.kind === 'decline' ? `Decline ${dialog.row.fullName}` : dialog?.kind === 'suspend' ? `Suspend ${dialog.row.fullName}` : `Reinstate ${dialog?.row.fullName ?? ''}`}
        description={dialog?.kind === 'decline' ? 'They are emailed the reason.' : dialog?.kind === 'suspend' ? 'New payments stop earning commission. Their payable balance follows the “suspended ambassadors” setting.' : 'New payments earn commission again.'}
        submitLabel={dialog?.kind === 'decline' ? 'Decline' : dialog?.kind === 'suspend' ? 'Suspend' : 'Reinstate'}
        pending={act.isPending}
        onSubmit={(reason) =>
          dialog &&
          act.mutate(dialog.kind === 'decline' ? { path: `/platform/ambassadors/${dialog.row.id}/decline`, body: { reason } } : { path: `/platform/ambassadors/${dialog.row.id}/suspend`, body: { suspend: dialog.kind === 'suspend', reason } })
        }
      />
      <FormDialog
        open={dialog?.kind === 'code'}
        onOpenChange={(v) => !v && setDialog(null)}
        title="Change referral code"
        description="A code can be changed once. Links with the old code stop working; the ambassador is told the new one."
        submitLabel="Save code"
        pending={act.isPending}
        onSubmit={(e) => {
          e?.preventDefault();
          if (dialog) act.mutate({ path: `/platform/ambassadors/${dialog.row.id}/code`, body: { code }, method: 'put' });
        }}
      >
        <Field label="New code" htmlFor="new-code" hint="3–12 letters and numbers, e.g. ADA25">
          <Input id="new-code" className="font-mono uppercase" maxLength={12} value={code} onChange={(e) => setCode(e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase())} />
        </Field>
      </FormDialog>
    </Section>
  );
}

// ------------------------------------------------------------------ referrals

function ReferralsTab() {
  const q = useQuery({ queryKey: [...KEY, 'referrals'], queryFn: ({ signal }) => api.get<ConsoleReferralRow[]>('/platform/ambassadors/referrals/list', undefined, signal) });
  const [assign, setAssign] = useState<{ tenantId?: string; schoolName?: string } | null>(null);
  const [remove, setRemove] = useState<ConsoleReferralRow | null>(null);
  const del = useMutation({
    mutationFn: ({ tenantId, reason }: { tenantId: string; reason: string }) => api.put(`/platform/ambassadors/referrals/${tenantId}`, { ambassadorId: null, reason }),
    onSuccess: () => {
      toast.success('Ambassador removed from the school');
      setRemove(null);
      refresh();
    },
    onError: onErr,
  });
  const rows = q.data;
  return (
    <Section
      title="Referred schools"
      description="One ambassador per school: the first valid code at sign-up. Set, change or remove one here (audit-logged); a change applies to payments from now on."
      actions={
        <Button size="sm" onClick={() => setAssign({})}>
          <Plus /> Set a school’s ambassador
        </Button>
      }
      flush
    >
      {!rows ? (
        <Skeleton className="m-4 h-40 rounded-xl" />
      ) : rows.length === 0 ? (
        <p className="p-6 text-center text-[13.5px] text-muted-foreground">No referred schools yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>School</TableHead>
                <TableHead>Ambassador</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Earned</TableHead>
                <TableHead>Since</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.tenantId}>
                  <TableCell>
                    <Link to={`/platform/schools/${r.tenantId}`} className="font-medium hover:underline">
                      {r.schoolName}
                    </Link>
                    <p className="text-[12px] text-muted-foreground">
                      {r.slug}
                      {r.state ? ` · ${r.state}` : ''}
                    </p>
                    {r.flags.map((f) => (
                      <p key={f} className="mt-0.5 flex items-center gap-1 text-[11.5px] text-warning">
                        <AlertTriangle className="size-3" /> {FLAG_LABEL[f] ?? f}
                      </p>
                    ))}
                  </TableCell>
                  <TableCell>
                    {r.ambassador.name} <span className="font-mono text-[12px] text-muted-foreground">{r.ambassador.code}</span>
                    <p className="text-[11.5px] text-muted-foreground">{r.source === 'SIGNUP' ? 'Code at sign-up' : 'Set in the console'}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={SCHOOL_BADGE[r.status]}>{REFERRAL_SCHOOL_STATUS_LABELS[r.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular">{naira(r.earnedKobo)}</TableCell>
                  <TableCell className="text-[12.5px]">{formatDate(r.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" aria-label="Actions">
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setAssign({ tenantId: r.tenantId, schoolName: r.schoolName })}>Change ambassador</DropdownMenuItem>
                        <DropdownMenuItem className="text-danger" onSelect={() => setRemove(r)}>
                          Remove ambassador
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <AssignDialog state={assign} onClose={() => setAssign(null)} />
      <ReasonDialog open={!!remove} onOpenChange={(v) => !v && setRemove(null)} title={`Remove the ambassador from ${remove?.schoolName ?? ''}`} description="Their existing commissions stay; future payments earn nothing." submitLabel="Remove" pending={del.isPending} onSubmit={(reason) => remove && del.mutate({ tenantId: remove.tenantId, reason })} />
    </Section>
  );
}

function AssignDialog({ state, onClose }: { state: { tenantId?: string; schoolName?: string } | null; onClose: () => void }) {
  const [search, setSearch] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [ambassadorId, setAmbassadorId] = useState('');
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (state) {
      setSearch('');
      setTenantId(state.tenantId ?? '');
      setAmbassadorId('');
      setReason('');
    }
  }, [state]);
  const schools = useQuery({ queryKey: [...KEY, 'school-search', search], queryFn: ({ signal }) => api.get<{ id: string; name: string; slug: string; ambassador: { id: string; name: string } | null }[]>('/platform/ambassadors/referrals/schools', { q: search }, signal), enabled: !!state && !state.tenantId });
  const ambassadors = useQuery({ queryKey: [...KEY, 'list', 'ACTIVE'], queryFn: ({ signal }) => api.get<AmbassadorRow[]>('/platform/ambassadors', { status: 'ACTIVE' }, signal), enabled: !!state });
  const save = useMutation({
    mutationFn: () => api.put(`/platform/ambassadors/referrals/${tenantId}`, { ambassadorId, reason }),
    onSuccess: () => {
      toast.success('Ambassador set');
      onClose();
      refresh();
    },
    onError: onErr,
  });
  return (
    <FormDialog
      open={!!state}
      onOpenChange={(v) => !v && onClose()}
      title={state?.schoolName ? `Change ${state.schoolName}’s ambassador` : 'Set a school’s ambassador'}
      description="Self-referral is refused (the ambassador is the school’s contact or one of its users). Only payments from now on earn the new ambassador commission."
      submitLabel="Save"
      pending={save.isPending}
      onSubmit={(e) => {
        e?.preventDefault();
        if (!tenantId || !ambassadorId || reason.trim().length < 3) {
          toast.error('Choose a school and an ambassador, and give a reason');
          return;
        }
        save.mutate();
      }}
    >
      {!state?.tenantId && (
        <Field label="School" htmlFor="as-school">
          <Input id="as-school" placeholder="Search by name or portal address" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className={cn(inputClass, 'mt-2')} size={5} value={tenantId} onChange={(e) => setTenantId(e.target.value)} aria-label="Choose the school">
            {(schools.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.slug}){s.ambassador ? ` — now: ${s.ambassador.name}` : ''}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Ambassador" htmlFor="as-amb">
        <select id="as-amb" className={inputClass} value={ambassadorId} onChange={(e) => setAmbassadorId(e.target.value)}>
          <option value="">Choose…</option>
          {(ambassadors.data ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.fullName} ({a.code})
            </option>
          ))}
        </select>
      </Field>
      <Field label="Reason" htmlFor="as-reason" hint="Kept in the audit log.">
        <Textarea id="as-reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </FormDialog>
  );
}

// ------------------------------------------------------------------ commissions

function CommissionsTab() {
  const [status, setStatus] = useState<CommissionStatus | ''>('');
  const ambassador = new URLSearchParams(window.location.search).get('ambassador') ?? '';
  const q = useQuery({
    queryKey: [...KEY, 'commissions', status, ambassador],
    queryFn: ({ signal }) => api.get<ConsoleCommissionRow[]>('/platform/ambassadors/commissions/list', { ...(status ? { status } : {}), ...(ambassador ? { ambassadorId: ambassador } : {}) }, signal),
  });
  const [reverse, setReverse] = useState<ConsoleCommissionRow | null>(null);
  const rev = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.post(`/platform/ambassadors/commissions/${id}/reverse`, { reason }),
    onSuccess: () => {
      toast.success('Reversed');
      setReverse(null);
      refresh();
    },
    onError: onErr,
  });
  const rows = q.data;
  return (
    <Section title="Commissions" description="One per school subscription payment, at the rate when it was earned. Refunds reverse them automatically; reverse one by hand for fraud or a reversed transfer (a paid one becomes a deduction from the next payout)." flush>
      <Toolbar>
        <select className={cn(inputClass, 'h-9 sm:w-[180px]')} value={status} onChange={(e) => setStatus(e.target.value as CommissionStatus | '')} aria-label="Status">
          <option value="">All statuses</option>
          {COMMISSION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {COMMISSION_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        {ambassador && (
          <Button asChild variant="ghost" size="sm">
            <Link to="/platform/ambassadors?tab=commissions">Showing one ambassador · show all</Link>
          </Button>
        )}
      </Toolbar>
      {!rows ? (
        <Skeleton className="m-4 h-40 rounded-xl" />
      ) : rows.length === 0 ? (
        <p className="p-6 text-center text-[13.5px] text-muted-foreground">No commissions.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Ambassador</TableHead>
                <TableHead>School</TableHead>
                <TableHead className="text-right">Payment</TableHead>
                <TableHead className="text-right">Commission</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="text-[12.5px]">{formatDate(c.createdAt)}</TableCell>
                  <TableCell>{c.ambassador.name}</TableCell>
                  <TableCell>
                    {c.schoolName}
                    {c.reason && <p className="max-w-[260px] truncate text-[11.5px] text-muted-foreground" title={c.reason}>{c.reason}</p>}
                  </TableCell>
                  <TableCell className="text-right tabular">{c.kind === 'CLAWBACK' ? 'Deduction' : `${naira(c.baseKobo)} × ${c.ratePct}%`}</TableCell>
                  <TableCell className={cn('text-right font-medium tabular', c.status === 'REVERSED' && 'text-muted-foreground line-through', c.amountKobo < 0 && 'text-danger')}>{naira(c.amountKobo)}</TableCell>
                  <TableCell>
                    <Badge variant={COMMISSION_BADGE[c.status]}>{COMMISSION_STATUS_LABELS[c.status]}</Badge>
                    {c.status === 'PENDING' && <p className="text-[11.5px] text-muted-foreground">payable {formatDate(c.payableAt)}</p>}
                  </TableCell>
                  <TableCell className="text-right">
                    {c.status !== 'REVERSED' && !(c.kind === 'CLAWBACK' && c.status === 'PAID') && (
                      <Button variant="ghost" size="sm" onClick={() => setReverse(c)}>
                        Reverse
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <ReasonDialog open={!!reverse} onOpenChange={(v) => !v && setReverse(null)} title={`Reverse ${reverse ? naira(reverse.amountKobo) : ''} for ${reverse?.ambassador.name ?? ''}`} description={reverse?.status === 'PAID' ? 'Already paid: a deduction is added to their next payout.' : 'The ambassador is told the reason.'} submitLabel="Reverse" pending={rev.isPending} onSubmit={(reason) => reverse && rev.mutate({ id: reverse.id, reason })} />
    </Section>
  );
}

// ------------------------------------------------------------------ payouts

function PayoutsTab() {
  const role = usePlatformRole();
  const due = useQuery({ queryKey: [...KEY, 'due'], queryFn: ({ signal }) => api.get<PayoutDueRow[]>('/platform/ambassadors/payouts/due', undefined, signal) });
  const history = useQuery({ queryKey: [...KEY, 'history'], queryFn: ({ signal }) => api.get<ConsolePayoutRow[]>('/platform/ambassadors/payouts/history', undefined, signal) });
  const [pay, setPay] = useState<PayoutDueRow | null>(null);
  const [reference, setReference] = useState('');
  const [paidOn, setPaidOn] = useState(todayIso());
  const [note, setNote] = useState('');
  const mark = useMutation({
    mutationFn: () => api.post('/platform/ambassadors/payouts', { ambassadorId: pay!.ambassadorId, expectedKobo: pay!.payableKobo, reference, paidOn, note: note || undefined }),
    onSuccess: () => {
      toast.success('Marked as paid; the ambassador has been told');
      setPay(null);
      refresh();
    },
    onError: onErr,
  });
  const exportCsv = async () => {
    try {
      const csv = await api.text('/platform/ambassadors/payouts/export.csv');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
      a.download = `ambassador-payouts-${todayIso()}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast.success('Downloaded (this export is audit-logged)');
    } catch (e) {
      onErr(e);
    }
  };
  return (
    <div className="space-y-4">
      <Section
        title="Due this month"
        description="Ambassadors whose payable balance has reached the minimum. Pay each by bank transfer, then mark it paid with the transfer reference. Deductions from refunds are already netted off."
        actions={
          role === 'SUPER_ADMIN' ? (
            <Button size="sm" variant="outline" onClick={() => void exportCsv()} disabled={!due.data?.length}>
              <Download /> Bank transfer list (CSV)
            </Button>
          ) : (
            <span className="text-[12px] text-muted-foreground">The CSV with account numbers is for the super admin only.</span>
          )
        }
        flush
      >
        {!due.data ? (
          <Skeleton className="m-4 h-32 rounded-xl" />
        ) : due.data.length === 0 ? (
          <p className="p-6 text-center text-[13.5px] text-muted-foreground">Nothing due.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ambassador</TableHead>
                  <TableHead>Bank</TableHead>
                  <TableHead className="text-right">Payable</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {due.data.map((d) => (
                  <TableRow key={d.ambassadorId}>
                    <TableCell>
                      {d.name} {d.status === 'SUSPENDED' && <Badge variant="danger">Suspended</Badge>}
                      <p className="text-[12px] text-muted-foreground">{d.phone}</p>
                    </TableCell>
                    <TableCell className="text-[12.5px]">
                      {d.bankName} ••{d.accountLast4}
                      <p className="text-muted-foreground">{d.accountName}</p>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular">
                      {naira(d.payableKobo)}
                      <p className="text-[11.5px] font-normal text-muted-foreground">{d.commissionCount} items</p>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        onClick={() => {
                          setReference('');
                          setNote('');
                          setPaidOn(todayIso());
                          setPay(d);
                        }}
                      >
                        Mark as paid
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>
      <Section title="Payout history" flush>
        {!history.data ? (
          <Skeleton className="m-4 h-32 rounded-xl" />
        ) : history.data.length === 0 ? (
          <p className="p-6 text-center text-[13.5px] text-muted-foreground">No payouts yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Paid on</TableHead>
                  <TableHead>Ambassador</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.data.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{formatDate(p.paidOn)}</TableCell>
                    <TableCell>{p.ambassador.name}</TableCell>
                    <TableCell className="font-mono text-[12px]">
                      {p.reference}
                      {p.note && <p className="font-sans text-muted-foreground">{p.note}</p>}
                    </TableCell>
                    <TableCell className="text-right tabular">{naira(p.amountKobo)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>
      <p className="text-[12.5px] text-muted-foreground">Phase 2 (not built): paying out automatically with Paystack Transfers. Today payouts are made by bank transfer and recorded here.</p>
      <FormDialog
        open={!!pay}
        onOpenChange={(v) => !v && setPay(null)}
        title={`Mark ${pay ? naira(pay.payableKobo) : ''} paid to ${pay?.name ?? ''}`}
        description="Every payable commission for this ambassador becomes Paid, and they are emailed. Refused if the balance has changed since you loaded this page."
        submitLabel="Mark as paid"
        pending={mark.isPending}
        onSubmit={(e) => {
          e?.preventDefault();
          if (reference.trim().length < 3) {
          toast.error('Enter the transfer reference');
          return;
        }
          mark.mutate();
        }}
      >
        <Field label="Transfer reference" htmlFor="po-ref">
          <Input id="po-ref" value={reference} maxLength={80} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <Field label="Paid on" htmlFor="po-date">
          <Input id="po-date" type="date" value={paidOn} max={todayIso()} onChange={(e) => setPaidOn(e.target.value)} />
        </Field>
        <Field label="Note" htmlFor="po-note" optional>
          <Input id="po-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </FormDialog>
    </div>
  );
}

// ------------------------------------------------------------------ settings

const LINE_KIND_LABELS: Record<InvoiceLineKind, string> = {
  SUBSCRIPTION: 'Subscription (term or session fee)',
  SETUP_FEE: 'One-off setup fee',
  ADDON: 'Add-ons',
  SMS: 'SMS overage',
};

function SettingsTab({ settings }: { settings: AmbassadorSettings }) {
  const role = usePlatformRole();
  const [v, setV] = useState(settings);
  const [forever, setForever] = useState(settings.commissionMonths == null);
  useEffect(() => {
    setV(settings);
    setForever(settings.commissionMonths == null);
  }, [settings]);
  const save = useMutation({
    mutationFn: () => api.put<AmbassadorSettings>('/platform/ambassadors/settings', { ...v, commissionMonths: forever ? null : (v.commissionMonths ?? 12) }),
    onSuccess: () => {
      toast.success('Settings saved: they apply to new commissions only');
      refresh();
    },
    onError: onErr,
  });
  const disabled = role !== 'SUPER_ADMIN';
  return (
    <Section title="Programme settings" description={disabled ? 'Only the super admin can change these.' : 'Changes apply to commissions earned from now on; existing ones keep their rate and dates.'}>
      <div className="grid max-w-2xl gap-4">
        <SwitchRow label="Applications open" description="The public form accepts new ambassadors. Existing ambassadors keep earning either way.">
          <Switch checked={v.open} disabled={disabled} onCheckedChange={(open) => setV({ ...v, open })} />
        </SwitchRow>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Commission rate (%)" htmlFor="st-rate">
            <Input id="st-rate" type="number" step="0.5" min={0} max={50} disabled={disabled} value={v.ratePct} onChange={(e) => setV({ ...v, ratePct: Number(e.target.value) })} />
          </Field>
          <Field label="Hold (days)" htmlFor="st-hold" hint="Before a commission can be paid">
            <Input id="st-hold" type="number" min={0} max={365} disabled={disabled} value={v.holdDays} onChange={(e) => setV({ ...v, holdDays: Math.round(Number(e.target.value)) })} />
          </Field>
          <Field label="Minimum payout (₦)" htmlFor="st-min">
            <Input id="st-min" type="number" min={0} disabled={disabled} value={v.minPayoutKobo / 100} onChange={(e) => setV({ ...v, minPayoutKobo: Math.round(Number(e.target.value) * 100) })} />
          </Field>
        </div>
        <SwitchRow label="Commission for as long as the school pays" description="Off: only payments in the first N months after the school was referred earn commission.">
          <Switch checked={forever} disabled={disabled} onCheckedChange={setForever} />
        </SwitchRow>
        {!forever && (
          <Field label="Commission period (months)" htmlFor="st-months">
            <Input id="st-months" type="number" min={1} max={240} disabled={disabled} value={v.commissionMonths ?? 12} onChange={(e) => setV({ ...v, commissionMonths: Math.round(Number(e.target.value)) })} />
          </Field>
        )}
        <fieldset className="grid gap-2">
          <legend className="text-[13px] font-medium">Invoice items that earn no commission</legend>
          <p className="text-[12.5px] text-muted-foreground">Each payment’s share of these lines is left out of the commission base (pro rata for part-payments). One-off setup fees by default.</p>
          {INVOICE_LINE_KINDS.map((k) => (
            <label key={k} className="flex min-h-9 items-center gap-2.5 text-[13.5px]">
              <input
                type="checkbox"
                className="size-4 accent-[var(--brand,currentColor)]"
                disabled={disabled}
                checked={v.excludedLineKinds.includes(k)}
                onChange={(e) => setV({ ...v, excludedLineKinds: e.target.checked ? [...v.excludedLineKinds, k] : v.excludedLineKinds.filter((x) => x !== k) })}
              />
              {LINE_KIND_LABELS[k]}
            </label>
          ))}
        </fieldset>
        <Field label="Suspended ambassadors’ payable balance" htmlFor="st-susp">
          <select id="st-susp" className={inputClass} disabled={disabled} value={v.suspendedPayable} onChange={(e) => setV({ ...v, suspendedPayable: e.target.value as 'KEEP' | 'WITHHOLD' })}>
            <option value="WITHHOLD">Withhold until reinstated</option>
            <option value="KEEP">Keep paying what was already earned</option>
          </select>
        </Field>
        {!disabled && (
          <div>
            <Button loading={save.isPending} onClick={() => save.mutate()}>
              Save settings
            </Button>
          </div>
        )}
      </div>
    </Section>
  );
}
