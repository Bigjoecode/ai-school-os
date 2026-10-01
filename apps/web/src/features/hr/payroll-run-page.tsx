import { type AiText, type PayAdjustment, type PayrollRunDetail, type PayslipRow, toKobo } from '@aischool/shared';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Download,
  ExternalLink,
  FileStack,
  FileText,
  Info,
  Landmark,
  ListChecks,
  MoreHorizontal,
  Plus,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  UserX,
} from 'lucide-react';
import { type BaseSyntheticEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { Page } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tip } from '@/components/ui/tooltip';
import { ApiError, errorMessage } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { formatDate, formatRelative } from '@/lib/format';
import { useDocumentTitle } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { addDaysIso, koboToInput, money, MoneyInput, parseNaira, plural, schoolToday } from '../finance/ui';
import { BackLink, DetailSkeleton } from '../planning/ui';
import { downloadBankSchedule, useDeleteRun, useMarkPaid, usePayrollRun, useRunAction, useRunReview, useSetAdjustments } from './api';
import { AiTextCard, DeltaChip, pctChange, PayrollStatusBadge, RunStepper } from './ui';

export default function PayrollRunPage() {
  const { id = '' } = useParams();
  const q = usePayrollRun(id);
  if (q.isLoading) {
    return (
      <Page>
        <DetailSkeleton />
      </Page>
    );
  }
  if (!q.data) {
    const notFound = q.error instanceof ApiError && q.error.status === 404;
    return (
      <Page>
        <BackLink to="/payroll">Payroll</BackLink>
        {notFound ? <EmptyState icon={FileStack} title="Payroll not found" description="It may have been deleted while still a draft." /> : <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      </Page>
    );
  }
  return <RunView r={q.data} />;
}

/** Next month's YYYY-MM-DD for a "by the Nth" hint. */
function nextMonthDay(period: string, day: number) {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, day));
  return d.toISOString().slice(0, 10);
}

/** n working days (Mon–Fri) after iso. */
function addWorkingDays(iso: string, n: number) {
  let d = iso;
  let left = n;
  while (left > 0) {
    d = addDaysIso(d, 1);
    const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return d;
}

function RunView({ r }: { r: PayrollRunDetail }) {
  useDocumentTitle(`Payroll · ${r.label}`);
  const navigate = useNavigate();
  const canManage = useCan('payroll.manage');
  const canApprove = useCan('payroll.approve');
  const canAi = useCan('ai.use');
  const c = r.currency;
  const draft = r.status === 'DRAFT';

  const recalc = useRunAction(r.id, 'recalculate');
  const approve = useRunAction(r.id, 'approve');
  const reopen = useRunAction(r.id, 'reopen');
  const del = useDeleteRun();
  const review = useRunReview();
  const [aiResult, setAiResult] = useState<AiText | null>(null);
  const [confirm, setConfirm] = useState<'approve' | 'reopen' | 'delete' | null>(null);
  const [paidOpen, setPaidOpen] = useState(false);
  const [adjusting, setAdjusting] = useState<PayslipRow | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const download = () => {
    setDownloading(true);
    downloadBankSchedule(r.id)
      .then((f) => toast.success(`Downloaded ${f}`))
      .catch((err: unknown) => toast.error(errorMessage(err)))
      .finally(() => setDownloading(false));
  };

  const focusStaff = (staffId: string) => {
    // The table row is hidden on phones, where the card list shows instead.
    const desktop = document.getElementById(`slip-${staffId}`);
    const el = desktop?.offsetParent ? desktop : document.getElementById(`slip-${staffId}-m`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlight(staffId);
      window.setTimeout(() => setHighlight(null), 2400);
    } else navigate(`/hr/employees/${staffId}?tab=pay`);
  };

  const checks = useMemo(() => [...r.checks].sort((a, b) => (a.level === b.level ? 0 : a.level === 'warning' ? -1 : 1)), [r.checks]);
  const warnings = checks.filter((x) => x.level === 'warning').length;

  return (
    <Page>
      <BackLink to="/payroll">Payroll</BackLink>
      <div className="mb-6 mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-[28px]">Payroll · {r.label}</h1>
            <PayrollStatusBadge status={r.status} />
          </div>
          <p className="mt-1.5 text-[13.5px] text-muted-foreground">
            {plural(r.staffCount, 'payslip')} · {r.workingDays} working days
            {r.preparedBy && ` · prepared by ${r.preparedBy}`}
            {r.approvedBy && ` · approved by ${r.approvedBy}${r.approvedAt ? ` ${formatRelative(r.approvedAt)}` : ''}`}
            {r.paidOn && ` · paid ${formatDate(r.paidOn)}${r.payReference ? ` (${r.payReference})` : ''}`}
          </p>
          {r.note && <p className="mt-1 text-[13px] italic text-muted-foreground">“{r.note}”</p>}
          <RunStepper status={r.status} className="mt-3 flex-wrap" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {draft && canManage && (
            <>
              <Button variant="outline" onClick={() => recalc.mutate()} loading={recalc.isPending}>
                {!recalc.isPending && <RefreshCw />} Recalculate
              </Button>
              <Button variant="outline" className="text-danger hover:text-danger" onClick={() => setConfirm('delete')}>
                <Trash2 /> Delete
              </Button>
            </>
          )}
          {draft && canApprove && (
            <Button onClick={() => setConfirm('approve')}>
              <CheckCircle2 /> Approve
            </Button>
          )}
          {!draft && (
            <Button variant="outline" onClick={download} loading={downloading}>
              {!downloading && <Download />} Bank schedule
            </Button>
          )}
          {r.status === 'APPROVED' && canApprove && (
            <Button variant="outline" onClick={() => setConfirm('reopen')}>
              <RotateCcw /> Reopen
            </Button>
          )}
          {r.status === 'APPROVED' && canManage && (
            <Button onClick={() => setPaidOpen(true)}>
              <Banknote /> Mark paid
            </Button>
          )}
          {r.status === 'PAID' && (
            <Button asChild variant="outline">
              <Link to={`/expenses?month=${r.period}&category=SALARIES`}>
                <ExternalLink /> View in Expenses
              </Link>
            </Button>
          )}
        </div>
      </div>

      <Totals r={r} />

      <div className="mt-5 grid gap-5 xl:grid-cols-3 [&>*]:min-w-0">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                Checks {warnings > 0 ? <Badge variant="warning">{plural(warnings, 'warning')}</Badge> : checks.length === 0 ? <Badge variant="success">All clear</Badge> : null}
              </CardTitle>
              <CardDescription>Things worth a look before {draft ? 'approving' : 'paying'}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {checks.length === 0 ? (
              <p className="flex items-center gap-2 rounded-xl border border-success/30 bg-success-soft/40 px-3.5 py-3 text-[13px]">
                <CheckCircle2 className="size-4 text-success" aria-hidden /> Nothing unusual — pay moved as expected and everyone has bank details.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {checks.map((x, i) => {
                  const body = (
                    <>
                      {x.level === 'warning' ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden /> : <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />}
                      <span className={cn('text-left', x.level === 'info' && 'text-muted-foreground')}>{x.message}</span>
                    </>
                  );
                  const cls = cn(
                    'flex w-full items-start gap-2.5 rounded-xl px-3 py-2 text-[13px]',
                    x.level === 'warning' ? 'border border-warning/30 bg-warning-soft/40' : 'bg-muted/40',
                  );
                  return (
                    <li key={i}>
                      {x.staffId ? (
                        <button type="button" onClick={() => focusStaff(x.staffId!)} className={cn(cls, 'transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}>
                          {body}
                        </button>
                      ) : (
                        <div className={cls}>{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {r.missing.length > 0 && (
              <div className="mt-4 border-t border-border pt-4">
                <p className="mb-2 flex items-center gap-1.5 text-[12.5px] font-medium">
                  <UserX className="size-3.5 text-muted-foreground" aria-hidden /> Not on this payroll — no pay details yet
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {r.missing.map((m) => (
                    <Link key={m.id} to={`/hr/employees/${m.id}?tab=pay`} className="rounded-full border border-border bg-card px-2.5 py-1 text-[12px] hover:border-border-strong hover:bg-muted">
                      {m.name} <span className="text-muted-foreground">· {m.jobTitle}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        <Remittances r={r} />
      </div>

      {canAi && (
        <AiTextCard
          className="mt-5"
          title="AI payroll review"
          description="A short memo for the approver: is this month ready, what changed and what needs a look."
          points={[
            [ListChecks, 'Ready to approve?'],
            [SlidersHorizontal, 'Changes against last month'],
            [Landmark, 'Remittances due'],
          ]}
          result={aiResult}
          pending={review.isPending}
          onRun={() => review.mutate(r.id, { onSuccess: setAiResult })}
          runLabel="Review with AI"
          pendingLabel="Reviewing…"
          footnote="Based on this payroll’s totals, checks and adjustments."
        />
      )}

      <Card className="mt-5 overflow-hidden">
        <CardHeader>
          <div>
            <CardTitle>Payslips</CardTitle>
            <CardDescription>{draft ? 'Adjust one-off bonuses or deductions before approving.' : 'Approved — reopen to make changes.'}</CardDescription>
          </div>
        </CardHeader>
        <Payslips r={r} highlight={highlight} onAdjust={draft && canManage ? setAdjusting : undefined} />
      </Card>

      <ConfirmDialog
        open={confirm === 'approve'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Approve ${r.label} payroll?`}
        description={`${plural(r.staffCount, 'payslip')}, ${money(r.netKobo, c)} net. Staff can then see their payslips in My HR and the bank schedule can be downloaded.${warnings ? ` There ${warnings === 1 ? 'is' : 'are'} ${plural(warnings, 'warning')} above.` : ''}`}
        confirmLabel="Approve payroll"
        destructive={false}
        loading={approve.isPending}
        onConfirm={() => approve.mutate(undefined, { onSuccess: () => setConfirm(null) })}
      />
      <ConfirmDialog
        open={confirm === 'reopen'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Reopen as a draft?"
        description="Payslips are hidden from staff again until it’s re-approved."
        confirmLabel="Reopen"
        destructive={false}
        loading={reopen.isPending}
        onConfirm={() => reopen.mutate(undefined, { onSuccess: () => setConfirm(null) })}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Delete the ${r.label} draft?`}
        description="All its payslips and adjustments are removed. You can prepare the month again."
        confirmLabel="Delete draft"
        loading={del.isPending}
        onConfirm={() =>
          del.mutate(r.id, {
            onSuccess: () => {
              setConfirm(null);
              navigate('/payroll');
            },
          })
        }
      />
      {canManage && <MarkPaidDialog open={paidOpen} onOpenChange={setPaidOpen} r={r} />}
      <AdjustDialog slip={adjusting} runId={r.id} currency={c} onOpenChange={(o) => !o && setAdjusting(null)} />
    </Page>
  );
}

// ------------------------------------------------------------------ totals

function Totals({ r }: { r: PayrollRunDetail }) {
  const c = r.currency;
  const p = r.previous;
  const items: { label: string; value: number | string; prev?: number | null; invert?: boolean; strong?: boolean; sub?: string }[] = [
    { label: 'Staff', value: r.staffCount, prev: p?.staffCount, invert: false },
    { label: 'Gross', value: r.grossKobo, prev: p?.grossKobo, invert: true },
    { label: 'PAYE', value: r.payeKobo, prev: p?.payeKobo, invert: true },
    { label: 'Pension', value: r.pensionKobo + r.employerPensionKobo, prev: p ? p.pensionKobo + p.employerPensionKobo : null, invert: true, sub: `${money(r.pensionKobo, c)} staff · ${money(r.employerPensionKobo, c)} school` },
    { label: 'NHF', value: r.nhfKobo, prev: p?.nhfKobo, invert: true },
    { label: 'Other deductions', value: r.otherDeductionsKobo, prev: p?.otherDeductionsKobo, invert: true },
    { label: 'Net pay', value: r.netKobo, prev: p?.netKobo, invert: true, strong: true },
    { label: 'Total cost', value: r.costKobo, prev: p?.costKobo, invert: true, strong: true, sub: 'Gross + employer pension' },
  ];
  return (
    <Card className="overflow-hidden">
      <dl className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4 [&>*]:min-w-0">
        {items.map((it) => {
          const n = typeof it.value === 'number' ? it.value : 0;
          return (
            <div key={it.label} className={cn('bg-card px-4 py-3.5 sm:px-5', it.strong && 'bg-muted/30')}>
              <dt className="text-[12px] text-muted-foreground">{it.label}</dt>
              <dd className={cn('mt-0.5 font-display font-semibold tabular tracking-tight', it.strong ? 'text-[20px]' : 'text-[17px]')}>
                {it.label === 'Staff' ? n : money(n, c)}
              </dd>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted-foreground">
                {p && <DeltaChip value={pctChange(n, it.prev)} invert={it.invert} neutral={it.label === 'Staff'} />}
                {it.sub ?? (p ? `vs ${p.label.split(' ')[0]}` : null)}
              </div>
            </div>
          );
        })}
      </dl>
    </Card>
  );
}

// ------------------------------------------------------------------ remittances

function Remittances({ r }: { r: PayrollRunDetail }) {
  const c = r.currency;
  const rem = r.remittances;
  const pensionDue = r.paidOn ? addWorkingDays(r.paidOn, 7) : null;
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Remittances</CardTitle>
          <CardDescription>Statutory payments due for {r.label}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[13px] font-medium">PAYE</p>
            <p className="text-[12px] text-muted-foreground">To the State IRS by {formatDate(nextMonthDay(r.period, 10))}</p>
          </div>
          <p className="font-semibold tabular">{money(rem.payeKobo, c)}</p>
        </div>
        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[13px] font-medium">Pension</p>
              <p className="text-[12px] text-muted-foreground">{pensionDue ? `By ${formatDate(pensionDue)} — 7 working days after salaries` : 'Within 7 working days of paying salaries'}</p>
            </div>
            <p className="font-semibold tabular">{money(rem.pensionKobo, c)}</p>
          </div>
          {rem.byPfa.length > 0 && (
            <ul className="mt-2 space-y-1 border-l-2 border-border pl-3">
              {rem.byPfa.map((p) => (
                <li key={p.pfa} className="flex justify-between gap-3 text-[12.5px]">
                  <span className="min-w-0 truncate text-muted-foreground">
                    {p.pfa} · {plural(p.staff, 'person', 'people')}
                  </span>
                  <span className="tabular">{money(p.amountKobo, c)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[13px] font-medium">National Housing Fund</p>
            <p className="text-[12px] text-muted-foreground">To the FMBN monthly</p>
          </div>
          <p className="font-semibold tabular">{money(rem.nhfKobo, c)}</p>
        </div>
        <p className="border-t border-border pt-3 text-[11.5px] text-muted-foreground">Tax rules: {r.taxRules}</p>
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ payslips

function Payslips({ r, highlight, onAdjust }: { r: PayrollRunDetail; highlight: string | null; onAdjust?: (p: PayslipRow) => void }) {
  const c = r.currency;
  const change = (p: PayslipRow) => pctChange(p.netKobo, p.previousNetKobo);
  const actions = (p: PayslipRow) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${p.staffName}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link to={`/payroll/payslips/${p.id}`}>
            <FileText /> View payslip
          </Link>
        </DropdownMenuItem>
        {onAdjust && (
          <DropdownMenuItem onSelect={() => onAdjust(p)}>
            <SlidersHorizontal /> Adjust
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link to={`/hr/employees/${p.staffId}?tab=pay`}>
            <ExternalLink /> Pay details
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const badges = (p: PayslipRow) => (
    <>
      {p.adjustments.length > 0 && (
        <Tip label={p.adjustments.map((a) => `${a.label} ${a.kind === 'DEDUCTION' ? '−' : '+'}${money(a.amountKobo, c)}`).join(' · ')}>
          <Badge variant="brand" tabIndex={0}>
            {plural(p.adjustments.length, 'adjustment')}
          </Badge>
        </Tip>
      )}
      {p.unpaidLeaveDays > 0 && <Badge variant="warning">{plural(p.unpaidLeaveDays, 'unpaid day')}</Badge>}
      {!p.accountNumber && <Badge variant="danger">No bank account</Badge>}
    </>
  );
  const changeCell = (p: PayslipRow) => {
    const ch = change(p);
    if (ch == null) return <span className="text-[12px] text-muted-foreground">{p.previousNetKobo == null ? 'New' : '—'}</span>;
    const big = Math.abs(ch) >= 15;
    return <DeltaChip value={ch} neutral={!big} />;
  };

  if (r.payslips.length === 0) return <EmptyState compact icon={FileText} title="No payslips on this payroll" />;
  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Staff</TableHead>
              <TableHead className="text-right">Gross</TableHead>
              <TableHead className="text-right">PAYE</TableHead>
              <TableHead className="text-right">Pension</TableHead>
              <TableHead className="hidden text-right lg:table-cell">NHF</TableHead>
              <TableHead className="hidden text-right lg:table-cell">Other</TableHead>
              <TableHead className="text-right">Net</TableHead>
              <TableHead className="text-right">vs last month</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {r.payslips.map((p) => (
              <TableRow key={p.id} id={`slip-${p.staffId}`} className={cn('scroll-mt-24 transition-colors duration-700', highlight === p.staffId && 'bg-warning-soft/70 hover:bg-warning-soft/70')}>
                <TableCell>
                  <Link to={`/payroll/payslips/${p.id}`} className="font-medium hover:underline">
                    {p.staffName}
                  </Link>
                  <p className="text-[12px] text-muted-foreground">{p.department ?? p.jobTitle}</p>
                  <div className="mt-1 flex flex-wrap gap-1">{badges(p)}</div>
                </TableCell>
                <TableCell className="text-right tabular">{money(p.grossKobo, c)}</TableCell>
                <TableCell className="text-right tabular text-muted-foreground">{money(p.payeKobo, c)}</TableCell>
                <TableCell className="text-right tabular text-muted-foreground">{money(p.pensionKobo, c)}</TableCell>
                <TableCell className="hidden text-right tabular text-muted-foreground lg:table-cell">{money(p.nhfKobo, c)}</TableCell>
                <TableCell className="hidden text-right tabular text-muted-foreground lg:table-cell">{p.otherDeductionsKobo ? money(p.otherDeductionsKobo, c) : '—'}</TableCell>
                <TableCell className="text-right font-semibold tabular">{money(p.netKobo, c)}</TableCell>
                <TableCell className="text-right">
                  {changeCell(p)}
                </TableCell>
                <TableCell>{actions(p)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="divide-y divide-border md:hidden">
        {r.payslips.map((p) => (
          <li key={p.id} id={`slip-${p.staffId}-m`} className={cn('flex items-start gap-3 px-4 py-3.5', highlight === p.staffId && 'bg-warning-soft/70')}>
            <div className="min-w-0 flex-1">
              <Link to={`/payroll/payslips/${p.id}`} className="block truncate text-[14px] font-medium">
                {p.staffName}
              </Link>
              <p className="text-[12px] text-muted-foreground">
                Gross {money(p.grossKobo, c)} · PAYE {money(p.payeKobo, c)}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                {changeCell(p)}
                {badges(p)}
              </div>
            </div>
            <p className="text-[14px] font-semibold tabular">{money(p.netKobo, c)}</p>
            {actions(p)}
          </li>
        ))}
      </ul>
    </>
  );
}

// ------------------------------------------------------------------ dialogs

const METHODS = [
  ['BANK_TRANSFER', 'Bank transfer'],
  ['CHEQUE', 'Cheque'],
  ['CASH', 'Cash'],
] as const;

function MarkPaidDialog({ open, onOpenChange, r }: { open: boolean; onOpenChange: (o: boolean) => void; r: PayrollRunDetail }) {
  const paid = useMarkPaid(r.id);
  const [paidOn, setPaidOn] = useState(schoolToday());
  const [method, setMethod] = useState<string>('BANK_TRANSFER');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (open) {
      setPaidOn(schoolToday());
      setMethod('BANK_TRANSFER');
      setReference('');
      setError(undefined);
    }
  }, [open]);
  const statutory = r.payeKobo + r.pensionKobo + r.employerPensionKobo + r.nhfKobo;
  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    if (!paidOn) {
      setError('Pick the date salaries were paid');
      return;
    }
    paid.mutate({ paidOn, method, reference: reference.trim() || null }, { onSuccess: () => onOpenChange(false), onError: (err) => setError(err.message) });
  };
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Mark ${r.label} as paid`}
      description="Do this once the bank transfers have gone out."
      icon={<Banknote />}
      submitLabel="Mark paid"
      pending={paid.isPending}
      onSubmit={submit}
    >
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
          <Field label="Paid on" htmlFor="mp-date" error={error}>
            <Input id="mp-date" type="date" value={paidOn} max={schoolToday()} onChange={(e) => setPaidOn(e.target.value)} className="tabular [color-scheme:light] dark:[color-scheme:dark]" invalid={!!error} />
          </Field>
          <Field label="Method" htmlFor="mp-method">
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger id="mp-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METHODS.map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Reference" htmlFor="mp-ref" optional hint="e.g. the bank batch or cheque number">
          <Input id="mp-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} />
        </Field>
        <div className="rounded-xl border border-border bg-muted/30 p-3.5 text-[12.5px]">
          <p className="font-medium">This records two expenses under Salaries in Finance:</p>
          <ul className="mt-1.5 space-y-1 text-muted-foreground">
            <li className="flex justify-between gap-3">
              <span>Net salaries paid to staff</span>
              <span className="tabular text-foreground">{money(r.netKobo, r.currency)}</span>
            </li>
            <li className="flex justify-between gap-3">
              <span>Statutory remittances (PAYE, pension, NHF)</span>
              <span className="tabular text-foreground">{money(statutory, r.currency)}</span>
            </li>
          </ul>
        </div>
      </div>
    </FormDialog>
  );
}

interface AdjDraft {
  key: number;
  kind: PayAdjustment['kind'];
  label: string;
  amount: string;
}
let adjKey = 0;

function AdjustDialog({ slip, runId, currency, onOpenChange }: { slip: PayslipRow | null; runId: string; currency: string; onOpenChange: (o: boolean) => void }) {
  const save = useSetAdjustments(runId);
  const [rows, setRows] = useState<AdjDraft[]>([]);
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [formError, setFormError] = useState<string>();
  const [resultNet, setResultNet] = useState<number | null>(null);
  const open = !!slip;
  useEffect(() => {
    if (!slip) return;
    setRows(slip.adjustments.map((a) => ({ key: ++adjKey, kind: a.kind, label: a.label, amount: koboToInput(a.amountKobo) })));
    setErrors({});
    setFormError(undefined);
    setResultNet(null);
  }, [slip]);
  if (!slip) return null;
  const update = (key: number, p: Partial<AdjDraft>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));

  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    const next: Record<number, string> = {};
    const list: PayAdjustment[] = [];
    rows.forEach((r, i) => {
      const n = parseNaira(r.amount);
      if (r.label.trim().length < 2) next[i] = 'Describe it (at least 2 letters)';
      else if (n == null || n <= 0) next[i] = 'Enter an amount';
      else list.push({ kind: r.kind, label: r.label.trim(), amountKobo: toKobo(n) });
    });
    setErrors(next);
    if (Object.keys(next).length) return;
    save.mutate(
      { payslipId: slip.id, adjustments: list },
      {
        onSuccess: (d) => {
          const updated = d.payslips.find((p) => p.id === slip.id);
          setResultNet(updated?.netKobo ?? null);
          toast.success(`${slip.staffName}’s net pay is now ${money(updated?.netKobo ?? 0, currency)}`);
          onOpenChange(false);
        },
        onError: (err) => setFormError(err.message),
      },
    );
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Adjust ${slip.staffName}’s pay`}
      description={`One-off for this month only. Net pay now ${money(slip.netKobo, currency)}.`}
      icon={<SlidersHorizontal />}
      submitLabel="Save adjustments"
      pending={save.isPending}
      onSubmit={submit}
      size="lg"
    >
      <div className="grid gap-3">
        {rows.length === 0 && <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-[13px] text-muted-foreground">No adjustments. Add a bonus or a deduction such as a loan repayment.</p>}
        {rows.map((r, i) => (
          <div key={r.key} className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)_150px_auto] sm:items-start [&>*]:min-w-0">
            <Select value={r.kind} onValueChange={(k) => update(r.key, { kind: k as PayAdjustment['kind'] })}>
              <SelectTrigger aria-label={`Adjustment ${i + 1} type`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EARNING">Bonus (+)</SelectItem>
                <SelectItem value="DEDUCTION">Deduction (−)</SelectItem>
              </SelectContent>
            </Select>
            <div>
              <Input aria-label={`Adjustment ${i + 1} description`} value={r.label} onChange={(e) => update(r.key, { label: e.target.value })} maxLength={60} placeholder={r.kind === 'EARNING' ? 'e.g. Exam supervision bonus' : 'e.g. Staff loan repayment'} invalid={!!errors[i]} />
              {errors[i] && <p className="mt-1 text-[12px] font-medium text-danger">{errors[i]}</p>}
            </div>
            <MoneyInput aria-label={`Adjustment ${i + 1} amount`} value={r.amount} onChange={(amount) => update(r.key, { amount })} currency={currency} placeholder="0" />
            <Button type="button" variant="ghost" size="icon" aria-label={`Remove adjustment ${i + 1}`} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
              <Trash2 />
            </Button>
          </div>
        ))}
        {rows.length < 10 && (
          <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => setRows((rs) => [...rs, { key: ++adjKey, kind: 'EARNING', label: '', amount: '' }])}>
            <Plus /> Add adjustment
          </Button>
        )}
        <p className="text-[12px] text-muted-foreground">Bonuses are taxed through PAYE this month. Deductions come off after tax.</p>
        {resultNet != null && <p className="text-[12.5px]">New net pay: {money(resultNet, currency)}</p>}
        {formError && (
          <p role="alert" className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-soft/50 px-3.5 py-2.5 text-[13px] text-danger">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {formError}
          </p>
        )}
      </div>
    </FormDialog>
  );
}
