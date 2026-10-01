import { type FinanceOverview, PAYMENT_METHOD_LABELS } from '@aischool/shared';
import { AlertTriangle, ArrowUpDown, Banknote, CalendarClock, ChevronRight, CircleDollarSign, Hourglass, Receipt, RotateCw, Send, Sparkles, TrendingUp, Users, Wallet } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { Markdown } from '@/components/ai/markdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ApiError } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { StatTile } from '../attendance/ui';
import { useOpenComposer } from '../comms/ui';
import { termDates } from '../planning/pickers';
import { type AiText, useFinanceInsight, useFinanceOverview } from './api';
import { DailyCollectionsChart, MoneyDonut } from './charts';
import { CollectionRing, compactMoney, EmptyChart, fmtPct, METHOD_COLOR, money, plural, RateChip } from './ui';

interface Props {
  termId: string | undefined;
  onDraftReminder: (inv: { id: string; studentName: string }) => void;
  onGoInvoices: (status?: string) => void;
  onGoSchedule: () => void;
}

export function OverviewTab({ termId, onDraftReminder, onGoInvoices, onGoSchedule }: Props) {
  const q = useFinanceOverview(termId);
  const o = q.data;

  if (q.error && !o) {
    if (q.error instanceof ApiError && q.error.status === 400) {
      return <EmptyState icon={CalendarClock} title="No current term" description={q.error.message} />;
    }
    return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  }
  if (!o) return <OverviewSkeleton />;

  const c = o.currency;
  if (o.invoices.total === 0) {
    return (
      <div className="space-y-5">
        <Card className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-brand/10 blur-3xl" />
          <EmptyState
            icon={Receipt}
            title={`No invoices yet for ${o.term.name}`}
            description="Set the fee schedule, then issue invoices — every learner gets a numbered invoice with a secure payment link."
            action={
              <Button onClick={onGoSchedule}>
                <Receipt /> Open fee schedule
              </Button>
            }
          />
        </Card>
        <AiBriefingCard termId={termId} disabled />
      </div>
    );
  }

  return (
    <div className={cn('space-y-5 transition-opacity', q.isPlaceholderData && 'opacity-60')}>
      <HeroKpis o={o} onGoInvoices={onGoInvoices} />

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Daily collections</CardTitle>
              <CardDescription>
                Money received against {o.term.name} invoices · {termDates(o.term)}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[260px]">{o.daily.length === 0 ? <EmptyChart text="Collections appear here as payments come in." /> : <DailyCollectionsChart data={o.daily} currency={c} />}</div>
          </CardContent>
        </Card>
        <MethodCard o={o} />
      </div>

      <AiBriefingCard termId={termId} />

      <div className="grid gap-5 xl:grid-cols-5">
        <ByClass o={o} />
        <TopDebtors o={o} onDraftReminder={onDraftReminder} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ hero

function HeroKpis({ o, onGoInvoices }: { o: FinanceOverview; onGoInvoices: (status?: string) => void }) {
  const c = o.currency;
  const inv = o.invoices;
  const segments = [
    { key: 'paid', label: 'Paid', n: inv.paid, cls: 'bg-success', status: 'PAID' },
    { key: 'part', label: 'Part-paid', n: Math.max(0, inv.partPaid), cls: 'bg-warning', status: 'PART_PAID' },
    { key: 'unpaid', label: 'Unpaid', n: Math.max(0, inv.unpaid), cls: 'bg-info', status: 'ISSUED' },
    { key: 'overdue', label: 'Overdue', n: inv.overdue, cls: 'bg-danger', status: 'OVERDUE' },
  ];
  // Overdue overlaps part-paid/unpaid; the bar shows paid / part / unpaid, with overdue called out separately.
  const barTotal = Math.max(1, inv.paid + inv.partPaid + inv.unpaid);
  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <Card className="relative overflow-hidden xl:col-span-1">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 size-56 rounded-full bg-success/10 blur-3xl" />
        <div className="relative flex h-full flex-col gap-5 p-5 sm:p-6">
          <div>
            <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">{o.term.name}</p>
            <p className="text-[12.5px] text-muted-foreground">{termDates(o.term)}</p>
          </div>
          <div className="flex items-center gap-5">
            <CollectionRing rate={o.collectionRate} size={120} />
            <div className="min-w-0">
              <p className="text-[12.5px] text-muted-foreground">Collected</p>
              <p className="font-display text-[28px] font-semibold leading-tight tracking-[-0.03em] tabular text-success">{money(o.collectedKobo, c)}</p>
              <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                of <span className="font-medium text-foreground tabular">{money(o.billedKobo, c)}</span> billed
              </p>
            </div>
          </div>
          <div className="mt-auto space-y-2.5">
            <div role="img" aria-label={segments.slice(0, 3).map((s) => `${s.n} ${s.label.toLowerCase()}`).join(', ')} className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
              {segments.slice(0, 3).map((s) => (s.n > 0 ? <span key={s.key} className={cn('h-full transition-[width] duration-700', s.cls)} style={{ width: `${(s.n / barTotal) * 100}%` }} /> : null))}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
              {segments.map((s) => (
                <button key={s.key} type="button" onClick={() => onGoInvoices(s.status)} className="inline-flex items-center gap-1.5 rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span aria-hidden className={cn('size-2 rounded-full', s.cls)} />
                  <span className={cn('font-medium tabular text-foreground', s.key === 'overdue' && s.n > 0 && 'text-danger')}>{s.n.toLocaleString()}</span> {s.label.toLowerCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 xl:col-span-2">
        <StatTile label="Billed this term" icon={<Receipt />} value={compactMoney(o.billedKobo, c)} sub={`${plural(o.invoices.total, 'invoice')} · ${money(o.billedKobo, c)}`} />
        <StatTile
          label="Collected"
          icon={<TrendingUp />}
          value={compactMoney(o.collectedKobo, c)}
          tone="success"
          sub={
            <span className="flex items-center gap-2">
              <RateChip rate={o.collectionRate} /> collection rate
            </span>
          }
        />
        <StatTile label="Outstanding" icon={<Hourglass />} value={compactMoney(o.outstandingKobo, c)} sub={`${plural(o.invoices.unpaid + o.invoices.partPaid, 'invoice')} with a balance`} />
        <StatTile
          label="Overdue"
          icon={<AlertTriangle />}
          value={compactMoney(o.overdueKobo, c)}
          tone={o.overdueKobo > 0 ? 'danger' : undefined}
          sub={
            o.invoices.overdue > 0 ? (
              <button type="button" onClick={() => onGoInvoices('OVERDUE')} className="font-medium text-danger hover:underline">
                {plural(o.invoices.overdue, 'invoice')} past due →
              </button>
            ) : (
              'Nothing past due'
            )
          }
        />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ methods

function MethodCard({ o }: { o: FinanceOverview }) {
  const c = o.currency;
  const rows = o.byMethod.filter((m) => m.amountKobo > 0).map((m) => ({ name: PAYMENT_METHOD_LABELS[m.method], value: m.amountKobo, color: METHOD_COLOR[m.method], count: m.count }));
  const total = rows.reduce((n, r) => n + r.value, 0);
  return (
    <Card className="h-full">
      <CardHeader>
        <div>
          <CardTitle>How parents pay</CardTitle>
          <CardDescription>Collections by payment method</CardDescription>
        </div>
        {o.onlinePaymentsEnabled ? <Badge variant="success">Online on</Badge> : <Badge variant="outline">Online off</Badge>}
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="h-[220px]">
            <EmptyChart text="No payments yet this term." />
          </div>
        ) : (
          <>
            <div className="relative mx-auto h-[170px] w-[170px]">
              <MoneyDonut data={rows} currency={c} />
              <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                <div>
                  <p className="font-display text-lg font-semibold tabular">{compactMoney(total, c)}</p>
                  <p className="text-[11px] text-muted-foreground">received</p>
                </div>
              </div>
            </div>
            <ul className="mt-4 space-y-1.5">
              {rows.map((r) => (
                <li key={r.name} className="flex items-center gap-2 text-[12.5px]">
                  <span className="size-2 rounded-full" style={{ background: r.color }} aria-hidden />
                  <span className="text-muted-foreground">{r.name}</span>
                  <span className="text-[11.5px] text-muted-foreground/80">· {r.count}</span>
                  <span className="ml-auto font-medium tabular">{money(r.value, c)}</span>
                  <span className="w-10 text-right text-[11.5px] tabular text-muted-foreground">{Math.round((r.value / total) * 100)}%</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ by class

function ByClass({ o }: { o: FinanceOverview }) {
  const [asc, setAsc] = useState(true);
  const c = o.currency;
  const rows = useMemo(() => [...o.byClass].sort((a, b) => ((a.rate ?? -1) - (b.rate ?? -1)) * (asc ? 1 : -1)), [o.byClass, asc]);
  return (
    <Card className="overflow-hidden xl:col-span-3">
      <CardHeader>
        <div>
          <CardTitle>Collection by class</CardTitle>
          <CardDescription>Billed vs collected this term</CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setAsc(!asc)}>
          <ArrowUpDown /> {asc ? 'Lowest first' : 'Highest first'}
        </Button>
      </CardHeader>
      {rows.length === 0 ? (
        <EmptyState compact icon={Users} title="No classes billed yet" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Class</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Billed</TableHead>
              <TableHead className="text-right">Collected</TableHead>
              <TableHead className="w-[34%]">Rate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.classArm}>
                <TableCell className="font-medium">{r.classArm}</TableCell>
                <TableCell className="hidden text-right tabular text-muted-foreground sm:table-cell">{money(r.billedKobo, c)}</TableCell>
                <TableCell className="text-right tabular">{money(r.collectedKobo, c)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn('h-full rounded-full', r.rate == null ? '' : r.rate >= 80 ? 'bg-success' : r.rate >= 50 ? 'bg-warning' : 'bg-danger')}
                        style={{ width: `${Math.min(100, r.rate ?? 0)}%` }}
                      />
                    </div>
                    <span className="w-12 text-right text-[13px] font-semibold tabular">{fmtPct(r.rate)}</span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ debtors

function TopDebtors({ o, onDraftReminder }: { o: FinanceOverview; onDraftReminder: (inv: { id: string; studentName: string }) => void }) {
  const canAi = useCan('ai.use');
  const canSend = useCan('comms.send');
  const openComposer = useOpenComposer();
  const c = o.currency;
  return (
    <Card className="flex flex-col xl:col-span-2">
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            Largest balances
            {o.topDebtors.length > 0 && <Badge variant="danger">{o.topDebtors.length}</Badge>}
          </CardTitle>
          <CardDescription>Families to follow up with first</CardDescription>
        </div>
        {canSend && o.topDebtors.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() =>
              openComposer({
                audience: { type: 'FEE_DEBTORS', minBalanceKobo: 0, overdueOnly: false, primaryOnly: true },
                channels: ['SMS', 'EMAIL'],
                title: 'Fee reminder',
                subject: 'A reminder about school fees',
                body: [
                  'Dear {{first_name}},',
                  'This is a gentle reminder that {{balance}} is outstanding on {{children}}’s school fees for this term. Please pay at your earliest convenience, or speak to the bursary if you need to arrange a payment plan.',
                  'Thank you,\n{{school}}',
                ].join('\n\n'),
                smsBody: "Dear {{first_name}}, {{balance}} is outstanding on {{children}}'s fees this term. Kindly pay soon or call the bursary. - {{school}}",
                source: 'FEES',
              })
            }
          >
            <Send /> Message parents
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex-1">
        {o.topDebtors.length === 0 ? (
          <EmptyState compact icon={Sparkles} title="Everyone’s settled" description="No outstanding balances this term." />
        ) : (
          <ul className="-mx-2 max-h-[440px] space-y-0.5 overflow-y-auto scrollbar-thin">
            {o.topDebtors.map((d) => (
              <li key={d.invoiceId} className="group flex items-center gap-2 rounded-xl px-2 py-2 transition-colors hover:bg-muted/60">
                <Link to={`/fees/invoices/${d.invoiceId}`} className="min-w-0 flex-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="block truncate text-[13.5px] font-medium">{d.student}</span>
                  <span className="block text-[12px] text-muted-foreground">
                    {d.classArm ?? 'No class'}
                    {d.overdueDays > 0 && <span className="text-danger"> · {plural(d.overdueDays, 'day')} overdue</span>}
                  </span>
                </Link>
                <span className="text-[13px] font-semibold tabular text-danger">{money(d.balanceKobo, c)}</span>
                {canAi ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Draft a reminder for ${d.student}`}
                    title="Draft reminder (AI)"
                    onClick={() => onDraftReminder({ id: d.invoiceId, studentName: d.student })}
                  >
                    <AiSparkle className="size-4" animated={false} />
                  </Button>
                ) : (
                  <ChevronRight className="size-4 text-muted-foreground" />
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ AI

export function AiBriefingCard({ termId, disabled }: { termId: string | undefined; disabled?: boolean }) {
  const canAi = useCan('ai.use');
  const insight = useFinanceInsight();
  const [result, setResult] = useState<AiText | null>(null);

  useEffect(() => {
    setResult(null);
    insight.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termId]);

  if (!canAi) return null;
  const run = () => insight.mutate(termId, { onSuccess: setResult });

  return (
    <Card id="finance-briefing" className="ai-border relative overflow-hidden border-transparent">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full bg-ai-2/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 left-10 size-56 rounded-full bg-ai-3/10 blur-3xl" />
      <div className="relative p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-ai-gradient shadow-[0_6px_20px_-6px_var(--ai-2)]">
              <AiSparkle className="size-5 [&_path]:fill-white" animated={insight.isPending} />
            </div>
            <div className="min-w-0">
              <p className="font-display text-[15px] font-semibold tracking-tight">
                <span className="text-ai-gradient">AI finance briefing</span>
              </p>
              <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                {disabled
                  ? 'Available once invoices are issued for this term.'
                  : 'Collections, classes lagging behind, spending and what to do next — written from this term’s books.'}
              </p>
            </div>
          </div>
          <Button variant={result ? 'outline' : 'ai'} size="sm" onClick={run} loading={insight.isPending} disabled={disabled} className="shrink-0">
            {!insight.isPending && (result ? <RotateCw /> : <Sparkles />)} {result ? 'Refresh' : insight.isPending ? 'Reading the books…' : 'Write briefing'}
          </Button>
        </div>
        {insight.isPending && !result && (
          <div className="mt-5 space-y-2.5" aria-live="polite" aria-busy>
            <p className="text-[12.5px] text-muted-foreground">This takes 10–30 seconds…</p>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-11/12" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        )}
        {!insight.isPending && !result && !disabled && (
          <ul className="mt-5 grid gap-2 text-[12.5px] text-muted-foreground sm:grid-cols-3">
            {(
              [
                [CircleDollarSign, 'Collection pace and forecast'],
                [Wallet, 'Classes and families to chase'],
                [Banknote, 'Spending against income'],
              ] as const
            ).map(([Icon, text]) => (
              <li key={text} className="flex items-center gap-2 rounded-xl border border-border bg-card/60 px-3 py-2.5">
                <Icon className="size-3.5 shrink-0 text-ai-2" aria-hidden /> {text}
              </li>
            ))}
          </ul>
        )}
        {result && (
          <div className={cn('mt-5 border-t border-border pt-5 transition-opacity', insight.isPending && 'opacity-50')}>
            <Markdown text={result.text} className="text-[13.5px]" />
            <p className="mt-4 text-[11.5px] text-muted-foreground">
              Generated by {result.provider} · {result.model} from this term’s figures. No learner names are shared with the AI.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-5" aria-busy>
      <div className="grid gap-5 xl:grid-cols-3">
        <Skeleton className="h-[300px] rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-2 xl:col-span-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[140px] rounded-2xl" />
          ))}
        </div>
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <Skeleton className="h-[330px] rounded-2xl xl:col-span-2" />
        <Skeleton className="h-[330px] rounded-2xl" />
      </div>
    </div>
  );
}
