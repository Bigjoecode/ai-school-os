import type { UnitEconomicsRow } from '@aischool/shared';
import { CircleDollarSign, Users } from 'lucide-react';
import { useState } from 'react';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { type Column, DataTable } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { dateInput } from '../operations/ui';
import { naira, usd } from './api';
import { useUnitEconomics } from './commerce-api';
import { Kpi, Muted, Section } from './ui';

const pct = (v: number | null) => (v == null ? '—' : `${v.toFixed(1)}%`);

export default function UnitEconomicsPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const q = useUnitEconomics({ from: from || undefined, to: to || undefined });
  const d = q.data;
  const paid = d?.rows.filter((r) => r.students > 0) ?? [];
  const students = paid.reduce((t, r) => t + r.students, 0);
  const contribution = paid.reduce((t, r) => t + r.contributionKobo, 0);
  const revenue = paid.reduce((t, r) => t + r.revenueKobo, 0);
  const perStudent = students ? Math.round(contribution / students) : null;

  const columns: Column<UnitEconomicsRow>[] = [
    {
      key: 'product',
      header: 'Product',
      cell: (r) => (
        <div>
          <p className="whitespace-nowrap font-medium">{r.product.name}</p>
          <p className="font-mono text-[11.5px] text-muted-foreground">{r.product.code}</p>
        </div>
      ),
    },
    {
      key: 'subs',
      header: 'Subscribers',
      className: 'tabular text-right',
      headClassName: 'text-right',
      cell: (r) => (
        <div>
          <p>{formatNumber(r.subscribers)}</p>
          <p className="whitespace-nowrap text-[11.5px] text-muted-foreground">{r.students === 1 ? '1 student' : `${formatNumber(r.students)} students`}</p>
        </div>
      ),
    },
    { key: 'rev', header: 'Revenue', className: 'tabular text-right', headClassName: 'text-right', cell: (r) => naira(r.revenueKobo) },
    {
      key: 'ai',
      header: 'AI cost',
      className: 'tabular text-right',
      headClassName: 'text-right',
      cell: (r) =>
        r.product.kind === 'AI' ? (
          <div>
            <p>{naira(r.aiCostKobo)}</p>
            <p className="text-[11.5px] text-muted-foreground">{usd(r.aiCostUsd)}</p>
          </div>
        ) : (
          <Muted>n/a</Muted>
        ),
    },
    { key: 'fees', header: 'Fees', className: 'tabular text-right', headClassName: 'text-right', cell: (r) => naira(r.feesKobo) },
    {
      key: 'contribution',
      header: 'Contribution',
      className: 'tabular text-right',
      headClassName: 'text-right',
      cell: (r) => <span className={cn('font-medium', r.contributionKobo < 0 && 'text-danger')}>{naira(r.contributionKobo)}</span>,
    },
    {
      key: 'per',
      header: 'Per student',
      className: 'tabular text-right',
      headClassName: 'text-right',
      cell: (r) =>
        r.students ? (
          <div>
            <p className={cn('font-semibold', r.perStudent.contributionKobo < 0 && 'text-danger')}>{naira(r.perStudent.contributionKobo)}</p>
            <p className="whitespace-nowrap text-[11.5px] text-muted-foreground">
              {naira(r.perStudent.revenueKobo)} − {naira(r.perStudent.aiCostKobo + r.perStudent.feesKobo)}
            </p>
          </div>
        ) : (
          <Muted />
        ),
    },
    {
      key: 'margin',
      header: 'Margin',
      className: 'text-right',
      headClassName: 'text-right',
      cell: (r) =>
        r.marginPct == null ? <Muted /> : <Badge variant={r.marginPct >= 60 ? 'success' : r.marginPct >= 30 ? 'warning' : 'danger'}>{pct(r.marginPct)}</Badge>,
    },
  ];

  return (
    <Page>
      <PageHeader
        eyebrow="Platform"
        title="Unit economics"
        description="What each paid product earns per student after its AI cost and payment fees."
        actions={
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Input type="date" aria-label="From" className={cn(dateInput, 'h-9 min-w-0 flex-1 sm:w-[150px]')} value={from} onChange={(e) => setFrom(e.target.value)} />
            <span className="text-muted-foreground">–</span>
            <Input type="date" aria-label="To" className={cn(dateInput, 'h-9 min-w-0 flex-1 sm:w-[150px]')} value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        }
      />

      <div className="mb-5 grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)] [&>*]:min-w-0">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <p className="flex items-center gap-2 text-[12.5px] font-medium text-muted-foreground">
            <CircleDollarSign className="size-4 text-brand" aria-hidden /> Contribution per paid student
          </p>
          {d ? (
            <>
              <p className={cn('mt-2 font-display text-[38px] font-semibold leading-none tracking-tight tabular', perStudent != null && perStudent < 0 && 'text-danger')}>{perStudent == null ? '—' : naira(perStudent)}</p>
              <p className="mt-2 text-[12.5px] text-muted-foreground">
                {naira(contribution)} contribution from {formatNumber(students)} paid students · {revenue ? pct((contribution / revenue) * 100) : '—'} blended margin
              </p>
              <p className="mt-1 text-[11.5px] text-muted-foreground">
                {d.from} to {d.to} · AI cost converted at ₦{formatNumber(d.nairaPerUsd)}/$
              </p>
            </>
          ) : (
            <Skeleton className="mt-2 h-10 w-40" />
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 [&>*]:min-w-0 [&>*:last-child]:col-span-2 sm:[&>*:last-child]:col-span-1">
          <Kpi label="Conversion" icon={Users} loading={!d} value={d ? pct(d.conversion.ratePct) : ''} sub={d ? `${formatNumber(d.conversion.paying)} of ${formatNumber(d.conversion.eligibleStudents)} students pay` : undefined} />
          <Kpi label="Basic AI cost / student" loading={!d} value={d ? naira(d.basic.perStudentKobo) : ''} sub={d ? `${naira(d.basic.aiCostKobo)} across ${formatNumber(d.basic.students)} students (included with schools)` : undefined} />
          <Kpi label="Paid revenue" loading={!d} value={d ? naira(revenue) : ''} sub="Parents and school sponsorships, net of refunds" />
        </div>
      </div>

      <Section title="By product" description="Revenue is net of refunds and includes school sponsorship invoices. AI cost counts only Plus/Pro usage of the students each product covers." flush>
        <DataTable
          columns={columns}
          rows={d?.rows}
          rowKey={(r) => r.product.code}
          loading={q.isLoading || q.isPlaceholderData}
          error={q.error}
          onRetry={() => void q.refetch()}
          renderMobile={(r) => (
            <div>
              <div className="flex items-start justify-between gap-3">
                <p className="text-[14px] font-medium">{r.product.name}</p>
                {r.marginPct != null && <Badge variant={r.marginPct >= 60 ? 'success' : r.marginPct >= 30 ? 'warning' : 'danger'}>{pct(r.marginPct)}</Badge>}
              </div>
              <p className="text-[12px] text-muted-foreground tabular">
                {r.students === 1 ? '1 student' : `${formatNumber(r.students)} students`} · {naira(r.revenueKobo)} revenue · {naira(r.aiCostKobo)} AI · {naira(r.feesKobo)} fees
              </p>
              <p className="mt-1 text-[13px] tabular">
                <span className="text-muted-foreground">Per student </span>
                <span className="font-semibold">{r.students ? naira(r.perStudent.contributionKobo) : '—'}</span>
              </p>
            </div>
          )}
          empty={{ icon: CircleDollarSign, title: 'No products', description: 'Create parent products first.' }}
        />
      </Section>
    </Page>
  );
}
