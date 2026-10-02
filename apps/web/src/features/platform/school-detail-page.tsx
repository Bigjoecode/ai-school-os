import { BILLING_PERIOD_LABELS, MODULE_FEATURES, type TenantFeatureState } from '@aischool/shared';
import {
  ArrowLeft,
  ArrowUpRight,
  Boxes,
  Building2,
  Check,
  ChevronDown,
  GitBranch,
  Globe2,
  LifeBuoy,
  LogIn,
  Pencil,
  ShieldAlert,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Sparkline } from '@/components/charts/charts';
import { SchoolLogo } from '@/components/layout/tenant-switcher';
import { Page } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/empty-state';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSwitchTenant } from '@/features/auth/session';
import { useCanOpenArea, usePlatformRole } from '@/lib/auth-store';
import { formatDate, formatDateTime, formatNumber, formatRelative } from '@/lib/format';
import { useDocumentTitle } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Segmented } from '../operations/ui';
import { naira, type SchoolDetail, useSchool, useSetFeature, usd } from './api';
import { ChangePlanDialog, EditSchoolDialog, OverrideDialog, StatusDialog } from './school-dialogs';
import {
  daysUntil,
  Facts,
  FeatureSourceBadge,
  Muted,
  PlatformInvoiceBadge,
  PriorityBadge,
  Section,
  SubStatusBadge,
  TenantStatusBadge,
  TicketStatusBadge,
  useTabParam,
} from './ui';

const TABS = ['overview', 'billing', 'features', 'domains', 'support', 'activity'] as const;
type Tab = (typeof TABS)[number];

export default function SchoolDetailPage() {
  const { id = '' } = useParams();
  const q = useSchool(id);
  const s = q.data;
  useDocumentTitle(s?.name ?? 'School');

  if (q.error && !s) {
    return (
      <Page>
        <BackLink />
        <Card>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </Card>
      </Page>
    );
  }
  if (!s) {
    return (
      <Page>
        <BackLink />
        <div className="flex items-center gap-4">
          <Skeleton className="size-14 rounded-2xl" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Skeleton className="mt-8 h-10 w-full max-w-lg rounded-xl" />
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      </Page>
    );
  }
  return <SchoolDetailView s={s} />;
}

function BackLink() {
  return (
    <Link to="/platform/schools" className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" /> Schools
    </Link>
  );
}

function SchoolDetailView({ s }: { s: SchoolDetail }) {
  const role = usePlatformRole();
  const isSuper = role === 'SUPER_ADMIN';
  const canEdit = role === 'SUPER_ADMIN' || role === 'SUPPORT_ADMIN';
  const canPlan = role === 'SUPER_ADMIN' || role === 'FINANCE_ADMIN';
  const [tab, setTab] = useTabParam(TABS, 'overview');
  const [dialog, setDialog] = useState<'edit' | 'plan' | 'status' | null>(null);
  const switchTenant = useSwitchTenant();
  const trialDays = s.status === 'TRIAL' ? daysUntil(s.trialEndsAt) : null;
  const overrides = s.features.filter((f) => f.override !== null).length;

  return (
    <Page>
      <BackLink />
      <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <SchoolLogo tenant={{ name: s.name, shortName: s.shortName, logoUrl: null, primaryColor: null }} className="size-14 rounded-2xl text-[16px]" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate font-display text-2xl font-semibold tracking-tight sm:text-[26px]">{s.name}</h1>
              <TenantStatusBadge status={s.status} />
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
              <span className="font-mono">{s.slug}</span>
              <span>{s.plan ? `${s.plan} plan` : 'No plan'}</span>
              <span>Joined {formatDate(s.createdAt)}</span>
              {trialDays != null && (
                <span className={cn('font-medium', trialDays < 0 ? 'text-danger' : trialDays <= 7 ? 'text-warning' : '')}>
                  {trialDays < 0 ? `Trial ended ${Math.abs(trialDays)}d ago` : `Trial ends in ${trialDays}d`}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isSuper && (
            <Button onClick={() => switchTenant.mutate(s.id)} loading={switchTenant.isPending} disabled={s.status === 'ARCHIVED'}>
              {!switchTenant.isPending && <LogIn />} Open school
            </Button>
          )}
          {canEdit && (
            <Button variant="outline" onClick={() => setDialog('edit')}>
              <Pencil /> Edit
            </Button>
          )}
          {(canPlan || isSuper) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  More <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {canPlan && (
                  <DropdownMenuItem onSelect={() => setDialog('plan')}>
                    <Boxes /> Change plan
                  </DropdownMenuItem>
                )}
                {isSuper && (
                  <>
                    {canPlan && <DropdownMenuSeparator />}
                    <DropdownMenuItem onSelect={() => setDialog('status')} className={s.status === 'ACTIVE' || s.status === 'TRIAL' ? 'text-danger focus:text-danger' : ''}>
                      <ShieldAlert /> Change status…
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>

      {s.status === 'SUSPENDED' && (
        <p className="mb-5 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-soft/40 px-4 py-3 text-[13px] text-danger">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" /> This school is suspended — nobody there can sign in. Reactivate it from “More → Change status”.
        </p>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="billing">Subscription</TabsTrigger>
          <TabsTrigger value="features">
            Features
            {overrides > 0 && <span className="rounded-full bg-brand-soft px-1.5 text-[10.5px] font-semibold text-brand tabular">{overrides}</span>}
          </TabsTrigger>
          <TabsTrigger value="domains">Domains</TabsTrigger>
          <TabsTrigger value="support">Support</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <OverviewTab s={s} />
        </TabsContent>
        <TabsContent value="billing">
          <BillingTab s={s} />
        </TabsContent>
        <TabsContent value="features">
          <FeaturesTab s={s} editable={isSuper} />
        </TabsContent>
        <TabsContent value="domains">
          <DomainsTab s={s} />
        </TabsContent>
        <TabsContent value="support">
          <SupportTab s={s} />
        </TabsContent>
        <TabsContent value="activity">
          <ActivityTab s={s} />
        </TabsContent>
      </Tabs>

      {canEdit && <EditSchoolDialog school={s} open={dialog === 'edit'} onOpenChange={(o) => setDialog(o ? 'edit' : null)} />}
      {canPlan && <ChangePlanDialog school={s} open={dialog === 'plan'} onOpenChange={(o) => setDialog(o ? 'plan' : null)} />}
      {isSuper && <StatusDialog school={s} open={dialog === 'status'} onOpenChange={(o) => setDialog(o ? 'status' : null)} />}
    </Page>
  );
}

// ------------------------------------------------------------------ overview

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-background/40 p-3.5">
      <p className="truncate text-[12px] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-display text-[19px] font-semibold tracking-tight tabular">{value}</p>
      {sub && <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function OverviewTab({ s }: { s: SchoolDetail }) {
  const apiTotal = s.apiDaily.reduce((t, d) => t + d.requests, 0);
  const apiErrors = s.apiDaily.reduce((t, d) => t + d.serverErrors, 0);
  const budget = s.aiMonthlyBudgetUsd ?? s.defaultAiBudgetUsd;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Stat label="Active students" value={formatNumber(s.students)} sub={`${formatNumber(s.staff)} staff`} />
        <Stat label="Users" value={formatNumber(s.users)} sub={`${formatNumber(s.counts.guardians)} guardians`} />
        <Stat label="Classes" value={formatNumber(s.counts.classes)} sub={`${formatNumber(s.counts.subjects)} subjects`} />
        <Stat label="Fee invoices" value={formatNumber(s.counts.feeInvoices)} sub="Issued to parents" />
        <Stat label="AI this month" value={usd(s.aiSpendUsd)} sub={budget > 0 ? `of ${usd(budget)} budget` : 'AI switched off'} />
        <Stat label="Last active" value={s.lastActiveAt ? formatRelative(s.lastActiveAt) : 'Never'} sub={`${formatNumber(s.counts.aiCalls30d)} AI calls in 30d`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] [&>*]:min-w-0">
        <Section title="Admins" description="School admins and principals" flush>
          {s.admins.length === 0 ? (
            <p className="px-5 py-6 text-[13px] text-muted-foreground">No active admins. Create one by opening the school.</p>
          ) : (
            <ul className="divide-y divide-border">
              {s.admins.map((a) => (
                <li key={a.id} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium">{a.name}</p>
                    <a href={`mailto:${a.email}`} className="block truncate text-[12px] text-muted-foreground hover:text-foreground">
                      {a.email}
                    </a>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {a.roles.map((r) => (
                      <Badge key={r} variant="outline">
                        {r}
                      </Badge>
                    ))}
                  </div>
                  <span className="shrink-0 text-[12px] text-muted-foreground sm:w-28 sm:text-right">{a.lastLoginAt ? formatRelative(a.lastLoginAt) : 'Never signed in'}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Contact" description="Account details">
          <Facts
            rows={[
              ['Email', s.email ?? <Muted />],
              ['Phone', s.phone ?? <Muted />],
              ['Address', s.address ?? <Muted />],
              ['Country · currency', `${s.country} · ${s.currency}`],
              ['Timezone', s.timezone],
              ['AI budget', s.aiMonthlyBudgetUsd == null ? `${usd(s.defaultAiBudgetUsd)} (default)` : usd(s.aiMonthlyBudgetUsd)],
            ]}
          />
        </Section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        <Section
          title={
            <>
              <GitBranch className="size-4 text-muted-foreground" /> Branches
            </>
          }
          description={`${s.branches.length} branch${s.branches.length === 1 ? '' : 'es'}${s.unassignedStudents ? ` · ${s.unassignedStudents} students without a branch` : ''}`}
          flush
        >
          {s.branches.length === 0 ? (
            <p className="px-5 py-6 text-[13px] text-muted-foreground">No branches yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {s.branches.map((b) => (
                <li key={b.id} className="flex items-center gap-3 px-5 py-2.5 text-[13px]">
                  <span className="min-w-0 flex-1 truncate font-medium">{b.name}</span>
                  {b.code && <span className="font-mono text-[11.5px] text-muted-foreground">{b.code}</span>}
                  {b.isMain && <Badge variant="brand">Main</Badge>}
                  <span className="w-24 text-right tabular text-muted-foreground">{formatNumber(b.students)} students</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="API traffic" description="Requests per day, last 30 days">
          <div className="flex items-end gap-6">
            <div>
              <p className="font-display text-[22px] font-semibold tabular">{formatNumber(apiTotal)}</p>
              <p className="text-[12px] text-muted-foreground">
                requests · <span className={apiErrors ? 'text-danger' : ''}>{formatNumber(apiErrors)} server errors</span>
              </p>
            </div>
          </div>
          <div className="mt-3 h-20">
            {s.apiDaily.length > 1 ? <Sparkline data={s.apiDaily.map((d) => d.requests)} /> : <p className="text-[12.5px] text-muted-foreground">Not enough traffic recorded yet.</p>}
          </div>
        </Section>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ billing

function BillingTab({ s }: { s: SchoolDetail }) {
  const canBilling = useCanOpenArea('billing');
  const sub = s.subscription;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] [&>*]:min-w-0">
      <Section
        title="Subscription"
        actions={
          canBilling && (
            <Button asChild variant="ghost" size="sm">
              <Link to="/platform/billing">
                Manage <ArrowUpRight />
              </Link>
            </Button>
          )
        }
      >
        {!sub ? (
          <p className="text-[13px] text-muted-foreground">No subscription yet. Choosing a plan starts one.</p>
        ) : (
          <Facts
            rows={[
              ['Plan', `${sub.plan.name} · ${BILLING_PERIOD_LABELS[sub.plan.billingPeriod]}`],
              ['Status', <SubStatusBadge key="s" status={sub.status} />],
              ['Seats', `${formatNumber(sub.studentSeats)} committed · ${formatNumber(sub.activeStudents)} active`],
              ['Billable seats', formatNumber(sub.billableSeats)],
              ['Price per student', `${naira(sub.unitKobo)}${sub.priceOverrideKobo != null ? ' (custom)' : ''}`],
              ['Discount', sub.discountPct ? `${sub.discountPct}%` : <Muted key="d">None</Muted>],
              ['Period amount', <span key="p" className="font-semibold">{naira(sub.periodAmountKobo)}</span>],
              ['Monthly value', naira(sub.monthlyKobo)],
              ['Current period', `${formatDate(sub.currentPeriodStart)} – ${formatDate(sub.currentPeriodEnd)}`],
              ['Renews', sub.cancelAtPeriodEnd ? <Badge key="c" variant="warning">Cancels at period end</Badge> : 'Automatically'],
              ['Outstanding', sub.outstandingKobo ? <span key="o" className="text-danger">{naira(sub.outstandingKobo)}</span> : <Muted key="o">Nothing owed</Muted>],
            ]}
          />
        )}
        {sub?.notes && <p className="mt-4 rounded-xl bg-muted/50 p-3 text-[12.5px] text-muted-foreground">{sub.notes}</p>}
      </Section>
      <Section title="Invoices" description="Most recent 12" flush>
        {s.invoices.length === 0 ? (
          <p className="px-5 py-6 text-[13px] text-muted-foreground">No invoices yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Invoice</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {s.invoices.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="min-w-[180px]">
                    <p className="font-mono text-[12.5px] font-medium">{i.number}</p>
                    <p className="max-w-[260px] truncate text-[12px] text-muted-foreground">{i.description}</p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(i.dueDate)}</TableCell>
                  <TableCell className="text-right tabular">{naira(i.amountKobo)}</TableCell>
                  <TableCell className="text-right tabular">{i.balanceKobo ? naira(i.balanceKobo) : <Muted />}</TableCell>
                  <TableCell>
                    <PlatformInvoiceBadge invoice={i} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
    </div>
  );
}

// ------------------------------------------------------------------ features

type OverrideChoice = 'default' | 'on' | 'off';

function FeaturesTab({ s, editable }: { s: SchoolDetail; editable: boolean }) {
  const set = useSetFeature(s.id);
  const [pending, setPending] = useState<{ feature: TenantFeatureState; enabled: boolean } | null>(null);
  const modules = s.features.filter((f) => f.kind === 'MODULE');
  const betas = s.features.filter((f) => f.kind === 'BETA');

  const choose = (f: TenantFeatureState, c: OverrideChoice) => {
    const current: OverrideChoice = f.override === null ? 'default' : f.override ? 'on' : 'off';
    if (c === current) return;
    if (c === 'default') set.mutate({ key: f.key, enabled: null });
    else setPending({ feature: f, enabled: c === 'on' });
  };

  const list = (rows: TenantFeatureState[]) => (
    <ul className="divide-y divide-border">
      {rows.map((f) => {
        const desc = (MODULE_FEATURES as Record<string, { description: string }>)[f.key]?.description;
        return (
          <li key={f.key} className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center">
            <span className={cn('grid size-6 shrink-0 place-items-center rounded-full', f.enabled ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground')} aria-label={f.enabled ? 'On' : 'Off'}>
              {f.enabled ? <Check className="size-3.5" strokeWidth={3} /> : <X className="size-3.5" strokeWidth={3} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-medium">
                {f.name}
                <span className="font-mono text-[11px] font-normal text-muted-foreground">{f.key}</span>
                <FeatureSourceBadge source={f.source} />
              </p>
              {desc && <p className="mt-0.5 text-[12px] text-muted-foreground">{desc}</p>}
            </div>
            {editable ? (
              <Segmented<OverrideChoice>
                size="sm"
                label={`Override for ${f.name}`}
                value={f.override === null ? 'default' : f.override ? 'on' : 'off'}
                onChange={(c) => choose(f, c)}
                options={[
                  { value: 'default', label: f.kind === 'MODULE' ? 'Plan default' : 'Rollout' },
                  { value: 'on', label: 'Force on' },
                  { value: 'off', label: 'Force off' },
                ]}
              />
            ) : (
              f.override !== null && <Badge variant="brand">Forced {f.override ? 'on' : 'off'}</Badge>
            )}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="space-y-5">
      <Section title="Modules" description={`What ${s.name} can use. ${s.plan ? `The ${s.plan} plan decides unless you override it.` : 'Without a plan every module is on.'}`} flush>
        {list(modules)}
      </Section>
      {betas.length > 0 && (
        <Section title="Beta flags" description="Experiments rolled out by percentage in Feature flags" flush>
          {list(betas)}
        </Section>
      )}
      {!editable && <p className="text-[12.5px] text-muted-foreground">Only super admins can override features for a school.</p>}
      <OverrideDialog
        tenantId={s.id}
        schoolName={s.name}
        feature={pending?.feature ?? null}
        enabled={pending?.enabled ?? true}
        onOpenChange={(o) => !o && setPending(null)}
      />
    </div>
  );
}

// ------------------------------------------------------------------ domains

function DomainsTab({ s }: { s: SchoolDetail }) {
  const canDomains = useCanOpenArea('domains');
  return (
    <Section
      title={
        <>
          <Globe2 className="size-4 text-muted-foreground" /> Custom domains
        </>
      }
      description="Hostnames that open this school’s portal or website"
      actions={
        canDomains && (
          <Button asChild variant="outline" size="sm">
            <Link to="/platform/domains">
              Manage domains <ArrowUpRight />
            </Link>
          </Button>
        )
      }
      flush
    >
      {s.domains.length === 0 ? (
        <p className="px-5 py-6 text-[13px] text-muted-foreground">No custom domains. The school uses its AI School OS address.</p>
      ) : (
        <ul className="divide-y divide-border">
          {s.domains.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 px-5 py-3 text-[13px]">
              <a href={`https://${d.hostname}`} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate font-mono font-medium hover:underline">
                {d.hostname}
              </a>
              <Badge variant="outline">{d.kind === 'PORTAL' ? 'Portal' : 'Website'}</Badge>
              {d.isPrimary && <Badge variant="brand">Primary</Badge>}
              {d.verifiedAt ? <Badge variant="success">Verified</Badge> : <Badge variant="warning">DNS pending</Badge>}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ------------------------------------------------------------------ support

function SupportTab({ s }: { s: SchoolDetail }) {
  const canSupport = useCanOpenArea('support');
  return (
    <Section
      title={
        <>
          <LifeBuoy className="size-4 text-muted-foreground" /> Recent tickets
        </>
      }
      actions={
        canSupport && (
          <Button asChild variant="ghost" size="sm">
            <Link to={`/platform/support?school=${s.id}`}>
              Open queue <ArrowUpRight />
            </Link>
          </Button>
        )
      }
      flush
    >
      {s.tickets.length === 0 ? (
        <p className="px-5 py-6 text-[13px] text-muted-foreground">{s.name} hasn’t contacted support.</p>
      ) : (
        <ul className="divide-y divide-border">
          {s.tickets.map((t) => {
            const row = (
              <>
                <span className="w-12 shrink-0 font-mono text-[12px] text-muted-foreground">#{t.number}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{t.subject}</span>
                <PriorityBadge priority={t.priority} quiet />
                <TicketStatusBadge status={t.status} />
                <span className="hidden w-24 text-right text-[12px] text-muted-foreground sm:block">{formatRelative(t.lastMessageAt)}</span>
              </>
            );
            return (
              <li key={t.id}>
                {canSupport ? (
                  <Link to={`/platform/support/${t.id}`} className="flex items-center gap-3 px-5 py-3 text-[13px] transition-colors hover:bg-muted/40">
                    {row}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 px-5 py-3 text-[13px]">{row}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

// ------------------------------------------------------------------ activity

function ActivityTab({ s }: { s: SchoolDetail }) {
  return (
    <Section
      title={
        <>
          <Building2 className="size-4 text-muted-foreground" /> Recent activity
        </>
      }
      description="The school’s last 25 audit entries"
      flush
    >
      {s.audit.length === 0 ? (
        <p className="px-5 py-6 text-[13px] text-muted-foreground">Nothing recorded yet.</p>
      ) : (
        <ol className="divide-y divide-border">
          {s.audit.map((a) => (
            <li key={a.id} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-start sm:gap-4">
              <time className="shrink-0 text-[12px] text-muted-foreground tabular sm:w-40" dateTime={a.createdAt} title={formatDateTime(a.createdAt)}>
                {formatDateTime(a.createdAt)}
              </time>
              <div className="min-w-0 flex-1 text-[13px]">
                <p className="[overflow-wrap:anywhere]">{a.summary}</p>
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                  <span className="font-mono">{a.action}</span>
                  {a.actor && ` · ${a.actor}`}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}
