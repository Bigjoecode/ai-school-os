import { LEDGER_ACCOUNT_LABELS, LEDGER_ACCOUNTS, REVENUE_DOMAINS, type LedgerAccount, type LedgerRow, type RevenueDomain } from '@aischool/shared';
import { BookOpenCheck, CheckCircle2, ScrollText, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { type Column, DataTable } from '@/components/ui/data-table';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/format';
import { monthShort, naira, nairaCompact } from './api';
import { useLedger, useLedgerSummary } from './commerce-api';
import { FilterSelect, Kpi, Muted, Section, Toolbar } from './ui';

export const DOMAIN_LABEL: Record<RevenueDomain, string> = { SCHOOL: 'School OS', STUDENT_AI: 'Student AI', EXAM: 'Exam Academy' };
const DOMAIN_COLOR: Record<RevenueDomain, string> = { SCHOOL: 'var(--chart-1)', STUDENT_AI: 'var(--chart-2)', EXAM: 'var(--chart-4)' };
const MONTH_KEY: Record<RevenueDomain, 'school' | 'studentAi' | 'exam'> = { SCHOOL: 'school', STUDENT_AI: 'studentAi', EXAM: 'exam' };

export default function RevenuePage() {
  const summary = useLedgerSummary({});
  const s = summary.data;
  const total = s?.revenueByDomain.reduce((t, d) => t + d.netKobo, 0) ?? 0;

  return (
    <Page>
      <PageHeader
        eyebrow="Platform"
        title="Revenue"
        description={s ? `Every naira in and out, from the double-entry ledger · ${s.from} to ${s.to}` : 'Every naira in and out, from the double-entry ledger.'}
        actions={
          s &&
          (s.balanced ? (
            <Badge variant="success" className="h-7 px-2.5">
              <CheckCircle2 className="size-3.5" aria-hidden /> Ledger balanced
            </Badge>
          ) : (
            <Badge variant="danger" className="h-7 px-2.5">
              <TriangleAlert className="size-3.5" aria-hidden /> Debits ≠ credits
            </Badge>
          ))
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0">
        <Kpi label="Net revenue · 12 months" loading={!s} value={nairaCompact(total)} sub="All domains, after refunds" />
        {REVENUE_DOMAINS.map((d) => {
          const r = s?.revenueByDomain.find((x) => x.domain === d);
          return (
            <Kpi
              key={d}
              label={DOMAIN_LABEL[d]}
              loading={!s}
              value={nairaCompact(r?.netKobo ?? 0)}
              sub={r ? `${naira(r.grossKobo)} gross${r.refundsKobo ? ` · ${naira(r.refundsKobo)} refunded` : ''}` : undefined}
            />
          );
        })}
      </div>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] [&>*]:min-w-0">
        <Section title="Revenue by month" description="Recognised revenue per domain (credits to revenue accounts, net of reversals).">
          <div className="h-[280px]">{s ? <StackedMonths data={s.monthly} /> : <Skeleton className="h-full w-full" />}</div>
        </Section>
        <Section title="Account balances" description="Debit-positive. Cash and receivables carry debit balances; revenue carries credit balances (negative here)." flush>
          {s ? (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11.5px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 font-medium sm:px-5">Account</th>
                  <th className="hidden px-2 py-2 text-right font-medium sm:table-cell">Debits</th>
                  <th className="hidden px-2 py-2 text-right font-medium sm:table-cell">Credits</th>
                  <th className="px-4 py-2 text-right font-medium sm:px-5">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[...s.balances]
                  .sort((a, b) => LEDGER_ACCOUNTS.indexOf(a.account) - LEDGER_ACCOUNTS.indexOf(b.account))
                  .map((b) => (
                    <tr key={b.account}>
                      <td className="px-4 py-2.5 sm:px-5">{LEDGER_ACCOUNT_LABELS[b.account] ?? b.account}</td>
                      <td className="hidden px-2 py-2.5 text-right tabular text-muted-foreground sm:table-cell">{naira(b.debitKobo)}</td>
                      <td className="hidden px-2 py-2.5 text-right tabular text-muted-foreground sm:table-cell">{naira(b.creditKobo)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium tabular sm:px-5">{naira(b.balanceKobo)}</td>
                    </tr>
                  ))}
                <tr className="bg-muted/40 font-medium">
                  <td className="px-4 py-2.5 sm:px-5">Total</td>
                  <td className="hidden px-2 py-2.5 text-right tabular sm:table-cell">{naira(s.balances.reduce((t, b) => t + b.debitKobo, 0))}</td>
                  <td className="hidden px-2 py-2.5 text-right tabular sm:table-cell">{naira(s.balances.reduce((t, b) => t + b.creditKobo, 0))}</td>
                  <td className={`px-4 py-2.5 text-right tabular sm:px-5 ${s.balanced ? 'text-success' : 'text-danger'}`}>{naira(s.balances.reduce((t, b) => t + b.balanceKobo, 0))}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <div className="space-y-2 p-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          )}
        </Section>
      </div>

      <div className="mt-5">
        <LedgerEntries />
      </div>
    </Page>
  );
}

function StackedMonths({ data }: { data: { month: string; school: number; studentAi: number; exam: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 4, left: -4, bottom: 0 }} barCategoryGap="24%">
        <CartesianGrid vertical={false} strokeDasharray="3 4" stroke="var(--chart-grid)" />
        <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} tickMargin={8} tickFormatter={(m: string) => monthShort(m)} minTickGap={4} />
        <YAxis tickLine={false} axisLine={false} fontSize={11} tickMargin={6} width={56} tickFormatter={(v: number) => (v === 0 ? '0' : nairaCompact(v))} />
        <Tooltip
          cursor={{ fill: 'var(--muted)', opacity: 0.6, radius: 6 }}
          content={({ active, payload }) => {
            const p = active ? (payload?.[0]?.payload as (typeof data)[number] | undefined) : undefined;
            if (!p) return null;
            return (
              <div className="min-w-[180px] rounded-xl border border-border bg-popover/95 px-3 py-2.5 text-[12px] shadow-pop backdrop-blur">
                <p className="mb-1.5 font-medium">{monthShort(p.month, true)}</p>
                {[...REVENUE_DOMAINS].reverse().map((d) => (
                  <div key={d} className="flex items-center gap-2">
                    <span className="size-2 rounded-full" style={{ background: DOMAIN_COLOR[d] }} aria-hidden />
                    <span className="text-muted-foreground">{DOMAIN_LABEL[d]}</span>
                    <span className="ml-auto pl-3 font-medium tabular">{naira(p[MONTH_KEY[d]])}</span>
                  </div>
                ))}
                <div className="mt-1 flex border-t border-border pt-1 font-medium">
                  Total <span className="ml-auto tabular">{naira(p.school + p.studentAi + p.exam)}</span>
                </div>
              </div>
            );
          }}
        />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} formatter={(v: string) => <span className="text-muted-foreground">{v}</span>} />
        {REVENUE_DOMAINS.map((d, i) => (
          <Bar key={d} dataKey={MONTH_KEY[d]} name={DOMAIN_LABEL[d]} stackId="r" fill={DOMAIN_COLOR[d]} radius={i === REVENUE_DOMAINS.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} maxBarSize={30} isAnimationActive={false} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

const SOURCE_LABEL: Record<string, string> = {
  CONSUMER_ORDER: 'Parent order',
  PLATFORM_PAYMENT: 'School payment',
  PLATFORM_INVOICE: 'School invoice',
  SPONSORSHIP: 'Sponsorship',
};

function LedgerEntries() {
  const [account, setAccount] = useState<string>();
  const [domain, setDomain] = useState<string>();
  const q = useLedger({ account, domain });
  const rows = useMemo(() => q.data?.pages.flatMap((p) => p.rows), [q.data]);

  const columns: Column<LedgerRow>[] = [
    { key: 'when', header: 'When', cell: (r) => <span className="whitespace-nowrap text-[12.5px] text-muted-foreground">{formatDateTime(r.createdAt)}</span> },
    {
      key: 'account',
      header: 'Account',
      cell: (r) => (
        <div>
          <p className="whitespace-nowrap font-medium">{LEDGER_ACCOUNT_LABELS[r.account] ?? r.account}</p>
          <p className="text-[11.5px] text-muted-foreground">{DOMAIN_LABEL[r.domain as RevenueDomain] ?? r.domain}</p>
        </div>
      ),
    },
    {
      key: 'memo',
      header: 'Memo',
      cell: (r) => (
        <div className="min-w-0">
          <p className="max-w-[360px] truncate" title={r.memo}>
            {r.memo}
          </p>
          <p className="truncate text-[11.5px] text-muted-foreground">
            {SOURCE_LABEL[r.source.type] ?? r.source.type}
            {r.tenant && ` · ${r.tenant}`} · <span className="font-mono">{r.txnId.slice(-8)}</span>
          </p>
        </div>
      ),
    },
    { key: 'dr', header: 'Debit', className: 'tabular text-right', headClassName: 'text-right', cell: (r) => (r.debitKobo ? naira(r.debitKobo) : <Muted />) },
    { key: 'cr', header: 'Credit', className: 'tabular text-right', headClassName: 'text-right', cell: (r) => (r.creditKobo ? naira(r.creditKobo) : <Muted />) },
  ];

  return (
    <Card className="overflow-hidden">
      <Toolbar>
        <p className="flex items-center gap-2 text-[14px] font-semibold sm:mr-2">
          <ScrollText className="size-4 text-muted-foreground" aria-hidden /> Ledger entries
        </p>
        <FilterSelect label="Account" value={account} onChange={setAccount} allLabel="All accounts" options={LEDGER_ACCOUNTS.map((a: LedgerAccount) => ({ value: a, label: LEDGER_ACCOUNT_LABELS[a] }))} className="sm:w-[210px]" />
        <FilterSelect label="Domain" value={domain} onChange={setDomain} allLabel="All domains" options={REVENUE_DOMAINS.map((d) => ({ value: d, label: DOMAIN_LABEL[d] }))} />
      </Toolbar>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        renderMobile={(r) => (
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-medium">{LEDGER_ACCOUNT_LABELS[r.account] ?? r.account}</p>
              <p className="line-clamp-2 text-[12px] text-muted-foreground">{r.memo}</p>
              <p className="text-[11.5px] text-muted-foreground">{formatDateTime(r.createdAt)}</p>
            </div>
            <p className="shrink-0 text-right text-[13px] font-medium tabular">{r.debitKobo ? `Dr ${naira(r.debitKobo)}` : `Cr ${naira(r.creditKobo)}`}</p>
          </div>
        )}
        empty={{ icon: BookOpenCheck, title: 'No entries match', description: 'Every payment, invoice and refund posts balanced entries here.' }}
      />
      {q.hasNextPage && (
        <div className="border-t border-border p-3 text-center">
          <Button variant="outline" size="sm" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
            Load more
          </Button>
        </div>
      )}
    </Card>
  );
}
