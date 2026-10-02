import type { PlatformBriefing } from '@aischool/shared';
import { motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Banknote,
  Bot,
  Building2,
  Clock,
  GraduationCap,
  LifeBuoy,
  Lightbulb,
  RotateCw,
  Server,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { Link } from 'react-router';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useCanOpenArea, useMe } from '@/lib/auth-store';
import { formatDate, formatNumber, greeting } from '@/lib/format';
import { cn } from '@/lib/utils';
import { monthShort, naira, nairaCompact, useBriefing, usePlatformOverview, usd } from './api';
import { MonthArea, MonthBars } from './charts';
import { daysUntil, Kpi, Section } from './ui';

export default function ConsoleOverviewPage() {
  const me = useMe();
  const q = usePlatformOverview();
  const o = q.data;
  const canBilling = useCanOpenArea('billing');
  const canSupport = useCanOpenArea('support');
  const canHealth = useCanOpenArea('health');
  const loading = !o;

  const aiDelta = o && o.aiSpendLastMonthUsd > 0 ? ((o.aiSpendThisMonthUsd - o.aiSpendLastMonthUsd) / o.aiSpendLastMonthUsd) * 100 : null;

  return (
    <Page>
      <PageHeader
        eyebrow={<Badge variant="ai">Platform console</Badge>}
        title={`${greeting()}, ${me?.user.firstName ?? 'there'}`}
        description="Every school on AI School OS at a glance: growth, revenue, usage and support."
        actions={
          <Button variant="outline" size="sm" onClick={() => void q.refetch()} loading={q.isFetching && !!o}>
            <RotateCw /> Refresh
          </Button>
        }
      />

      {q.error && !o ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </Card>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 [&>*]:min-w-0">
            <Kpi
              icon={Building2}
              label="Schools"
              loading={loading}
              value={o ? formatNumber(o.schools.total) : ''}
              sub={o ? `${o.schools.ACTIVE} active · ${o.schools.TRIAL} trial · ${o.schools.SUSPENDED} suspended` : undefined}
              to="/platform/schools"
            />
            <Kpi
              icon={GraduationCap}
              label="Active students"
              loading={loading}
              value={o ? formatNumber(o.students) : ''}
              sub={o ? `${formatNumber(o.staff)} staff · ${formatNumber(o.users)} users` : undefined}
              to="/platform/usage"
            />
            <Kpi
              icon={TrendingUp}
              label="MRR"
              loading={loading}
              value={o ? nairaCompact(o.mrrKobo) : ''}
              sub={o ? `ARR ${nairaCompact(o.arrKobo)}` : undefined}
              to={canBilling ? '/platform/billing' : undefined}
              tone="success"
            />
            <Kpi
              icon={Banknote}
              label="Collected (MTD)"
              loading={loading}
              value={o ? nairaCompact(o.collectedThisMonthKobo) : ''}
              sub={o ? `${o.schools.newThisMonth} new school${o.schools.newThisMonth === 1 ? '' : 's'} this month` : undefined}
              to={canBilling ? '/platform/billing?tab=payments' : undefined}
            />
            <Kpi
              icon={Wallet}
              label="Outstanding"
              loading={loading}
              value={o ? nairaCompact(o.outstandingKobo) : ''}
              sub={o ? (o.overdueInvoices ? `${nairaCompact(o.overdueKobo)} overdue · ${o.overdueInvoices} invoice${o.overdueInvoices === 1 ? '' : 's'}` : 'Nothing overdue') : undefined}
              tone={o && o.overdueKobo > 0 ? 'danger' : undefined}
              to={canBilling ? '/platform/billing?tab=invoices&status=OVERDUE' : undefined}
            />
            <Kpi
              icon={Bot}
              label="AI spend (MTD)"
              loading={loading}
              value={o ? usd(o.aiSpendThisMonthUsd) : ''}
              sub={
                o ? (
                  <span className="inline-flex items-center gap-1">
                    {aiDelta != null && (aiDelta >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />)}
                    {usd(o.aiSpendLastMonthUsd)} last month
                  </span>
                ) : undefined
              }
              to="/platform/usage?tab=ai"
            />
            <Kpi
              icon={Activity}
              label="API requests (24h)"
              loading={loading}
              value={o ? formatNumber(o.apiRequests24h) : ''}
              sub={o ? `${o.apiErrorRate24h.toFixed(2)}% server errors` : undefined}
              tone={o && o.apiErrorRate24h >= 1 ? 'warning' : undefined}
              to="/platform/usage?tab=api"
            />
            <Kpi
              icon={LifeBuoy}
              label="Open tickets"
              loading={loading}
              value={o ? formatNumber(o.openTickets) : ''}
              sub={o ? (o.urgentTickets ? `${o.urgentTickets} urgent` : 'None urgent') : undefined}
              tone={o && o.urgentTickets > 0 ? 'danger' : undefined}
              to={canSupport ? '/platform/support' : undefined}
            />
            <Kpi
              icon={AlertTriangle}
              label="Past due"
              loading={loading}
              value={o ? formatNumber(o.pastDue) : ''}
              sub="Subscriptions with an overdue invoice"
              tone={o && o.pastDue > 0 ? 'warning' : undefined}
              to={canBilling ? '/platform/billing' : undefined}
            />
          </div>

          <BriefingCard />

          <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
            <Section title="Signups" description="New schools per month, last 12 months">
              <div className="h-[220px]">
                {!o ? <Skeleton className="h-full w-full rounded-xl" /> : <MonthBars data={o.signups.map((s) => ({ month: s.month, value: s.count }))} label="New schools" monthFmt={monthShort} />}
              </div>
            </Section>
            <Section title="Revenue collected" description="Subscription payments received per month">
              <div className="h-[220px]">
                {!o ? (
                  <Skeleton className="h-full w-full rounded-xl" />
                ) : (
                  <MonthArea
                    data={o.revenue.map((r) => ({ month: r.month, value: r.kobo }))}
                    label="Collected"
                    format={naira}
                    axisFormat={(v) => (v === 0 ? '₦0' : nairaCompact(v))}
                    monthFmt={monthShort}
                  />
                )}
              </div>
            </Section>
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] [&>*]:min-w-0">
            <Section
              title={
                <>
                  <Clock className="size-4 text-muted-foreground" /> Trials ending soon
                </>
              }
              description="Trials ending in the next 14 days"
              flush
            >
              {!o ? (
                <div className="space-y-2 p-5">
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ) : o.trialsEndingSoon.length === 0 ? (
                <p className="px-5 py-8 text-center text-[13px] text-muted-foreground">No trials end in the next two weeks.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {o.trialsEndingSoon.map((t) => {
                    const d = daysUntil(t.trialEndsAt) ?? 0;
                    return (
                      <li key={t.id}>
                        <Link to={`/platform/schools/${t.id}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/40 focus-visible:bg-muted/60 focus-visible:outline-none">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13.5px] font-medium">{t.name}</p>
                            <p className="truncate text-[12px] text-muted-foreground">
                              {formatNumber(t.students)} students · ends {formatDate(t.trialEndsAt)}
                            </p>
                          </div>
                          <Badge variant={d < 0 ? 'danger' : d <= 3 ? 'warning' : 'outline'} className="tabular">
                            {d < 0 ? `${Math.abs(d)}d over` : d === 0 ? 'Today' : `${d}d left`}
                          </Badge>
                          <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>
            <Section title="Schools by status" description="Where every account stands">
              {!o ? (
                <Skeleton className="h-32 w-full" />
              ) : (
                <StatusBreakdown
                  total={o.schools.total}
                  rows={[
                    { label: 'Active', n: o.schools.ACTIVE, color: 'bg-success' },
                    { label: 'Trial', n: o.schools.TRIAL, color: 'bg-brand' },
                    { label: 'Suspended', n: o.schools.SUSPENDED, color: 'bg-danger' },
                    { label: 'Archived', n: o.schools.ARCHIVED, color: 'bg-muted-foreground/40' },
                  ]}
                />
              )}
              {canHealth && (
                <Button asChild variant="ghost" size="sm" className="mt-4 -ml-2">
                  <Link to="/platform/health">
                    <Server /> System health
                  </Link>
                </Button>
              )}
            </Section>
          </div>
        </div>
      )}
    </Page>
  );
}

function StatusBreakdown({ total, rows }: { total: number; rows: { label: string; n: number; color: string }[] }) {
  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        {rows.map((r) => (r.n > 0 ? <div key={r.label} className={r.color} style={{ width: `${(r.n / Math.max(total, 1)) * 100}%` }} /> : null))}
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-3">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2 text-[13px]">
            <span className={cn('size-2 rounded-full', r.color)} aria-hidden />
            <span className="text-muted-foreground">{r.label}</span>
            <span className="ml-auto font-semibold tabular">{r.n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BriefingCard() {
  const brief = useBriefing();
  const b = brief.data;
  if (b) return <BriefingResult b={b} onAgain={() => brief.mutate()} again={brief.isPending} />;
  return (
    <Card className="ai-border relative overflow-hidden border-transparent">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-ai-2/15 blur-3xl" />
      <div className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
        <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-ai-gradient shadow-[0_8px_24px_-8px_var(--ai-2)]">
          <AiSparkle className="size-5 [&_path]:fill-white" animated={false} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[16px] font-semibold tracking-tight">AI briefing</h2>
          <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">
            A short read on the platform right now: schools at risk, upsell opportunities and anything operations should look at. Written from live numbers when you ask.
          </p>
        </div>
        <Button variant="ai" onClick={() => brief.mutate()} loading={brief.isPending} className="self-start sm:self-auto">
          {!brief.isPending && <AiSparkle className="[&_path]:fill-white" animated={false} />} {brief.isPending ? 'Reading the numbers…' : 'Write a briefing'}
        </Button>
      </div>
    </Card>
  );
}

function BriefingResult({ b, onAgain, again }: { b: PlatformBriefing; onAgain: () => void; again: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="ai-border relative overflow-hidden border-transparent">
        <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-start sm:px-6">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-ai-gradient">
            <AiSparkle className="size-4 [&_path]:fill-white" animated={false} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11.5px] font-medium uppercase tracking-wider text-muted-foreground">AI briefing</p>
            <h2 className="mt-0.5 font-display text-[16px] font-semibold leading-snug tracking-tight">{b.headline}</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onAgain} loading={again} className="self-start">
            {!again && <RotateCw />} Write again
          </Button>
        </div>
        <div className="space-y-5 px-5 py-5 sm:px-6">
          <p className="max-w-3xl text-[14px] leading-relaxed text-foreground/90">{b.summary}</p>
          <div className="grid gap-5 lg:grid-cols-3 [&>*]:min-w-0">
            <BriefList
              icon={AlertTriangle}
              tone="text-danger"
              title="Risks"
              empty="No schools look at risk."
              items={b.risks.map((r) => ({ head: r.school, body: r.issue, action: r.action }))}
            />
            <BriefList
              icon={Lightbulb}
              tone="text-success"
              title="Opportunities"
              empty="Nothing stands out this time."
              items={b.opportunities.map((r) => ({ head: r.school, body: r.insight, action: r.action }))}
            />
            <BriefList icon={Server} tone="text-info" title="Operations" empty="Nothing to flag." items={b.operations.map((o) => ({ body: o }))} />
          </div>
          <p className="text-[11.5px] text-muted-foreground/80">
            Written by {b.provider} · <span className="font-mono">{b.model}</span>. Check figures before acting on them.
          </p>
        </div>
      </Card>
    </motion.div>
  );
}

function BriefList({
  icon: Icon,
  tone,
  title,
  items,
  empty,
}: {
  icon: typeof AlertTriangle;
  tone: string;
  title: string;
  items: { head?: string; body: string; action?: string }[];
  empty: string;
}) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold">
        <Icon className={cn('size-3.5', tone)} aria-hidden /> {title}
      </p>
      {items.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((it, i) => (
            <li key={i} className="rounded-xl border border-border bg-background/50 p-3 text-[13px]">
              {it.head && <p className="font-medium">{it.head}</p>}
              <p className={cn('text-muted-foreground', it.head && 'mt-0.5')}>{it.body}</p>
              {it.action && (
                <p className="mt-1.5 flex items-start gap-1.5 text-[12.5px] text-foreground">
                  <ArrowRight className="mt-0.5 size-3 shrink-0 text-brand" aria-hidden /> {it.action}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
