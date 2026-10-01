import type { PayslipView } from '@aischool/shared';
import { FileStack, FileText, Printer } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { Page } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useDocumentTitle } from '@/lib/hooks';
import { cn, initialsFromName } from '@/lib/utils';
import { money } from '../finance/ui';
import { BackLink, DetailSkeleton } from '../planning/ui';
import { useMyPayslip, usePayslip } from './api';
import { maskAccount, PayrollStatusBadge } from './ui';

/** /payroll/payslips/:id (payroll staff) and /me/payslips/:id (the employee). */
export default function PayslipPage({ self = false }: { self?: boolean }) {
  const { id = '' } = useParams();
  const admin = usePayslip(self ? undefined : id);
  const mine = useMyPayslip(self ? id : undefined);
  const q = self ? mine : admin;
  const back = self ? { to: '/me/hr', label: 'My HR' } : { to: '/payroll', label: 'Payroll' };

  if (q.isLoading) {
    return (
      <Page className="max-w-4xl">
        <DetailSkeleton />
      </Page>
    );
  }
  if (!q.data) {
    const status = q.error instanceof ApiError ? q.error.status : 0;
    return (
      <Page className="max-w-4xl">
        <BackLink to={back.to}>{back.label}</BackLink>
        {status === 404 || status === 403 ? (
          <EmptyState icon={FileText} title="Payslip not available" description={status === 403 ? 'It may not be approved yet, or it isn’t yours.' : 'The link may be wrong.'} />
        ) : (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        )}
      </Page>
    );
  }
  return <PayslipDoc p={q.data} back={back} self={self} />;
}

function PayslipDoc({ p, back, self }: { p: PayslipView; back: { to: string; label: string }; self: boolean }) {
  useDocumentTitle(`Payslip · ${p.staff.name} · ${p.label}`);
  const c = p.currency;
  const draft = p.status === 'DRAFT';
  const totalDeductions = p.deductions.reduce((n, d) => n + d.amountKobo, 0);

  return (
    <Page className="max-w-4xl print:max-w-none print:p-0">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <BackLink to={back.to}>{back.label}</BackLink>
        <div className="flex flex-wrap items-center gap-2">
          {!self && (
            <Button asChild variant="outline">
              <Link to={`/payroll/runs/${p.runId}`}>
                <FileStack /> {p.label} payroll
              </Link>
            </Button>
          )}
          <Button onClick={() => window.print()}>
            <Printer /> Print payslip
          </Button>
        </div>
      </div>

      <article className="print-a4 relative mx-auto overflow-hidden rounded-2xl border border-border bg-card shadow-soft print:rounded-none print:border-0 print:shadow-none">
        <div aria-hidden className="h-1.5 w-full bg-gradient-to-r from-brand via-chart-2 to-success" />
        {draft && (
          <div aria-hidden className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
            <span className="-rotate-[22deg] rounded-2xl border-[6px] border-muted-foreground/20 px-8 py-2 font-display text-[64px] font-black tracking-[0.2em] text-muted-foreground/15 sm:text-[92px]">DRAFT</span>
          </div>
        )}

        <header className="flex flex-col gap-5 border-b border-border px-6 py-6 sm:flex-row sm:items-start sm:justify-between sm:px-10 print:flex-row print:px-8">
          <div className="flex items-start gap-4">
            {p.school.logoUrl ? (
              <img src={p.school.logoUrl} alt="" className="size-14 shrink-0 rounded-xl object-contain" />
            ) : (
              <div className="grid size-14 shrink-0 place-items-center rounded-xl bg-brand-soft font-display text-lg font-bold text-brand">{initialsFromName(p.school.name)}</div>
            )}
            <div className="min-w-0 text-[12.5px] text-muted-foreground">
              <p className="font-display text-[18px] font-bold leading-tight tracking-tight text-foreground">{p.school.name}</p>
              {p.school.address && <p className="mt-0.5 whitespace-pre-line">{p.school.address}</p>}
            </div>
          </div>
          <div className="sm:text-right print:text-right">
            <p className="font-display text-[22px] font-semibold uppercase tracking-[0.18em] text-foreground/90">Payslip</p>
            <p className="mt-1 text-[14px] font-medium">{p.label}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 sm:justify-end print:justify-end">
              <PayrollStatusBadge status={p.status} className="print:hidden" />
              {p.paidOn && <span className="text-[12px] text-muted-foreground">Paid {formatDate(p.paidOn)}</span>}
            </div>
          </div>
        </header>

        <dl className="grid grid-cols-1 gap-px border-b border-border bg-border sm:grid-cols-3 print:grid-cols-3 [&>*]:min-w-0">
          {(
            [
              ['Employee', p.staff.name],
              ['Staff number', p.staff.staffNumber],
              ['Job title', `${p.staff.jobTitle}${p.staff.department ? ` · ${p.staff.department}` : ''}`],
              ['Bank', p.bankName ? `${p.bankName} · ${maskAccount(p.accountNumber)}` : '—'],
              ['Pension', p.pfaName ? `${p.pfaName}${p.pensionPin ? ` · ${p.pensionPin}` : ''}` : p.pensionPin ?? '—'],
              ['Tax ID', p.taxId ?? '—'],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="bg-card px-6 py-3 sm:px-8 print:px-6">
              <dt className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{k}</dt>
              <dd className={cn('mt-0.5 break-words text-[13.5px] font-medium', (k === 'Staff number' || k === 'Tax ID') && 'font-mono text-[12.5px]')}>{v}</dd>
            </div>
          ))}
        </dl>

        <div className="grid gap-8 px-6 py-6 sm:grid-cols-2 sm:px-10 print:grid-cols-2 print:px-8 [&>*]:min-w-0">
          <Lines title="Earnings" lines={p.earnings} total={p.grossKobo} totalLabel="Gross pay" currency={c} />
          <Lines title="Deductions" lines={p.deductions} total={totalDeductions} totalLabel="Total deductions" currency={c} />
        </div>

        <div className="mx-6 mb-6 flex flex-col gap-1 rounded-xl bg-success-soft/60 px-5 py-4 sm:mx-10 sm:flex-row sm:items-center sm:justify-between print:mx-8 print:flex-row print:items-center print:justify-between">
          <div>
            <p className="text-[13px] font-medium">Net pay</p>
            {p.unpaidLeaveDays > 0 && <p className="text-[12px] text-muted-foreground">Includes {p.unpaidLeaveDays} day{p.unpaidLeaveDays === 1 ? '' : 's'} of unpaid leave</p>}
          </div>
          <p className="font-display text-[32px] font-semibold leading-none tracking-[-0.03em] tabular text-success">{money(p.netKobo, c)}</p>
        </div>

        {p.employerPensionKobo > 0 && (
          <p className="mx-6 -mt-2 mb-6 text-[12px] text-muted-foreground sm:mx-10 print:mx-8">
            The school also paid {money(p.employerPensionKobo, c)} into your pension this month, on top of your pay.
          </p>
        )}

        <div className="border-t border-border px-6 py-5 sm:px-10 print:px-8">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Year to date ({p.period.slice(0, 4)})</p>
          <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4 print:grid-cols-4 [&>*]:min-w-0">
            {(
              [
                ['Gross', p.ytd.grossKobo],
                ['PAYE', p.ytd.payeKobo],
                ['Pension', p.ytd.pensionKobo],
                ['Net', p.ytd.netKobo],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="rounded-xl border border-border bg-muted/30 px-3 py-2.5">
                <dt className="text-[11.5px] text-muted-foreground">{k}</dt>
                <dd className="mt-0.5 font-display text-[15px] font-semibold tabular">{money(v, c)}</dd>
              </div>
            ))}
          </dl>
        </div>

        <footer className="space-y-1.5 border-t border-border px-6 py-5 text-[11.5px] text-muted-foreground sm:px-10 print:px-8">
          {p.note && <p className="text-[12.5px] text-foreground/90">{p.note}</p>}
          <p>PAYE worked out under the {p.taxRules}. Pension is on basic, housing and transport; NHF on basic.</p>
          <p>Issued electronically by {p.school.name}. This payslip is confidential.</p>
        </footer>
      </article>
    </Page>
  );
}

function Lines({ title, lines, total, totalLabel, currency }: { title: string; lines: { label: string; amountKobo: number }[]; total: number; totalLabel: string; currency: string }) {
  return (
    <div className="min-w-0">
      <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      <dl className="space-y-1.5">
        {lines.length === 0 && <p className="text-[13px] text-muted-foreground">None</p>}
        {lines.map((l, i) => (
          <div key={`${l.label}-${i}`} className="flex items-baseline justify-between gap-4 text-[13.5px]">
            <dt className="min-w-0 text-muted-foreground">{l.label}</dt>
            <dd className={cn('shrink-0 tabular', l.amountKobo < 0 && 'text-danger')}>{l.amountKobo < 0 ? `−${money(-l.amountKobo, currency)}` : money(l.amountKobo, currency)}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 flex items-baseline justify-between gap-4 border-t border-border pt-2.5 text-[13.5px] font-semibold">
        <span>{totalLabel}</span>
        <span className="tabular">{money(total, currency)}</span>
      </div>
    </div>
  );
}
