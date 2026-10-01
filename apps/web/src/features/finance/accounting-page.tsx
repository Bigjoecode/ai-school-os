import { EXPENSE_CATEGORY_LABELS } from '@aischool/shared';
import { ArrowDownRight, ArrowUpRight, CalendarClock, Info, Scale, Wallet } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { StatTile } from '../attendance/ui';
import { termDates } from '../planning/pickers';
import { useFinanceOverview } from './api';
import { categoryColor, IncomeExpenseChart, ShareBar } from './charts';
import { compactMoney, EmptyChart, FinanceTermSelect, money, monthLabel, useTermContext } from './ui';

function signed(kobo: number, currency: string) {
  return kobo < 0 ? `−${money(-kobo, currency)}` : money(kobo, currency);
}

export default function AccountingPage() {
  const [params, setParams] = useSearchParams();
  const ctx = useTermContext(params.get('termId') ?? undefined);
  const termId = ctx.canPick ? ctx.termId : (params.get('termId') ?? undefined);
  const q = useFinanceOverview(termId);
  const o = q.data;

  return (
    <Page>
      <PageHeader
        title="Accounting"
        description="Income and expenditure at a glance — fees received against money spent."
        actions={<FinanceTermSelect ctx={ctx} onChange={(t) => setParams(t ? { termId: t } : {}, { replace: true })} className="w-full sm:w-72" />}
      />

      <p className="mb-5 flex items-start gap-2 rounded-xl border border-info/25 bg-info-soft/50 px-4 py-3 text-[13px]">
        <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
        <span>
          <strong className="font-semibold">Cash-basis summary.</strong> Income is fee money actually received; expenditure is what you’ve recorded under{' '}
          <Link to="/expenses" className="font-medium text-brand hover:underline">
            Expenses
          </Link>
          . It is not a double-entry ledger — use it to keep an eye on cash flow, and share full books with your accountant.
        </span>
      </p>

      {q.error && !o ? (
        q.error instanceof ApiError && q.error.status === 400 ? (
          <EmptyState icon={CalendarClock} title="No current term" description={q.error.message} />
        ) : (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        )
      ) : !o ? (
        <div className="space-y-5" aria-busy>
          <div className="grid gap-4 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[132px] rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-[360px] rounded-2xl" />
        </div>
      ) : (
        <div className={cn('space-y-5 transition-opacity', q.isPlaceholderData && 'opacity-60')}>
          <Body o={o} />
        </div>
      )}
    </Page>
  );
}

function Body({ o }: { o: NonNullable<ReturnType<typeof useFinanceOverview>['data']> }) {
  const c = o.currency;
  const termNet = o.collectedKobo - o.expenses.termKobo;
  const months = o.incomeVsExpense;
  const hasMonths = months.some((m) => m.incomeKobo > 0 || m.expenseKobo > 0);
  const totIn = months.reduce((n, m) => n + m.incomeKobo, 0);
  const totOut = months.reduce((n, m) => n + m.expenseKobo, 0);
  const cats = o.expenses.byCategory;
  const catTotal = cats.reduce((n, x) => n + x.amountKobo, 0);

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        <StatTile label={`Fees received · ${o.term.name}`} icon={<ArrowDownRight />} value={compactMoney(o.collectedKobo, c)} tone="success" sub={`${money(o.collectedKobo, c)} · ${termDates(o.term)}`} />
        <StatTile label={`Spent · ${o.term.name}`} icon={<ArrowUpRight />} value={compactMoney(o.expenses.termKobo, c)} tone={o.expenses.termKobo > 0 ? 'danger' : undefined} sub={money(o.expenses.termKobo, c)} />
        <StatTile
          label="Net this term"
          icon={<Scale />}
          value={`${termNet < 0 ? '−' : ''}${compactMoney(Math.abs(termNet), c)}`}
          tone={termNet < 0 ? 'danger' : 'success'}
          sub={termNet < 0 ? 'Spending is ahead of fees received' : `${signed(termNet, c)} surplus so far`}
        />
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Income vs expenditure</CardTitle>
            <CardDescription>Last six months · all fee receipts and recorded expenses</CardDescription>
          </div>
          <div className="hidden items-center gap-3 sm:flex">
            <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <span className="size-2 rounded-full bg-chart-4" /> Income
            </span>
            <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <span className="size-2 rounded-full bg-danger/75" /> Expenses
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">{hasMonths ? <IncomeExpenseChart data={months} currency={c} /> : <EmptyChart text="Nothing received or spent in the last six months yet." />}</div>
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-5">
        <Card className="overflow-hidden xl:col-span-3">
          <CardHeader>
            <div>
              <CardTitle>Month by month</CardTitle>
              <CardDescription>Net = income − expenses</CardDescription>
            </div>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Income</TableHead>
                <TableHead className="text-right">Expenses</TableHead>
                <TableHead className="text-right">Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...months].reverse().map((m) => {
                const net = m.incomeKobo - m.expenseKobo;
                return (
                  <TableRow key={m.month}>
                    <TableCell className="font-medium">{monthLabel(m.month, true)}</TableCell>
                    <TableCell className="text-right tabular text-success">{money(m.incomeKobo, c)}</TableCell>
                    <TableCell className="text-right tabular text-muted-foreground">{money(m.expenseKobo, c)}</TableCell>
                    <TableCell className={cn('text-right font-semibold tabular', net < 0 ? 'text-danger' : 'text-foreground')}>{signed(net, c)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <tfoot className="border-t border-border bg-muted/40">
              <TableRow>
                <TableCell className="font-semibold">Six months</TableCell>
                <TableCell className="text-right font-semibold tabular text-success">{money(totIn, c)}</TableCell>
                <TableCell className="text-right font-semibold tabular">{money(totOut, c)}</TableCell>
                <TableCell className={cn('text-right font-semibold tabular', totIn - totOut < 0 && 'text-danger')}>{signed(totIn - totOut, c)}</TableCell>
              </TableRow>
            </tfoot>
          </Table>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Where the money went</CardTitle>
              <CardDescription>Expenses by category · {o.term.name}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {cats.length === 0 ? (
              <EmptyState
                compact
                icon={Wallet}
                title="No expenses this term"
                action={
                  <Button asChild variant="outline" size="sm">
                    <Link to="/expenses">Record an expense</Link>
                  </Button>
                }
              />
            ) : (
              <div className="space-y-4">
                <ShareBar parts={cats.map((x) => ({ key: x.category, value: x.amountKobo, color: categoryColor(x.category) }))} label="Expenses by category" />
                <ul className="space-y-2.5">
                  {cats.map((x) => (
                    <li key={x.category}>
                      <div className="flex items-center gap-2 text-[13px]">
                        <span className="size-2 rounded-full" style={{ background: categoryColor(x.category) }} aria-hidden />
                        <span>{EXPENSE_CATEGORY_LABELS[x.category as keyof typeof EXPENSE_CATEGORY_LABELS] ?? x.category}</span>
                        <span className="ml-auto font-medium tabular">{money(x.amountKobo, c)}</span>
                        <span className="w-9 text-right text-[11.5px] tabular text-muted-foreground">{Math.round((x.amountKobo / Math.max(1, catTotal)) * 100)}%</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
