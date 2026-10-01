import { DEFAULT_HR_SETTINGS, PAYE_RULES_LABEL, type PayProfileRow, type PayrollRunRow, periodLabel, type SalaryGradeRow, salaryGradeSchema, toKobo } from '@aischool/shared';
import { Banknote, FileStack, Layers, MoreHorizontal, Pencil, Plus, RefreshCw, Settings2, Trash2, Users, Wallet } from 'lucide-react';
import { type BaseSyntheticEvent, type FormEvent, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { type Column, DataTable } from '@/components/ui/data-table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { FormDialog, SwitchRow } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { StatTile } from '../attendance/ui';
import { compactMoney, koboToInput, money, MoneyInput, parseNaira, plural, schoolToday, shiftMonth, useCurrency } from '../finance/ui';
import { useApplyGrade, useCreateRun, useDeleteGrade, useGrades, usePayProfiles, usePayrollRuns, usePayrollSettings, useSaveGrade, useSavePayrollSettings } from './api';
import { AllowanceRepeater, allowanceDrafts, allowancesFromDrafts, type AllowanceDraft } from './employee-sheets';
import { PayrollStatusBadge } from './ui';

type Tab = 'runs' | 'salaries' | 'grades';
const TABS: Tab[] = ['runs', 'salaries', 'grades'];

export default function PayrollPage() {
  const canManage = useCan('payroll.manage');
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') as Tab | null;
  const tab: Tab = raw && TABS.includes(raw) ? raw : 'runs';
  const [prepareOpen, setPrepareOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const patch = (next: Record<string, string | undefined>) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(next)) {
          if (v) p.set(k, v);
          else p.delete(k);
        }
        return p;
      },
      { replace: true },
    );

  // ⌘K deep links: ?prepare=1, ?settings=1
  useEffect(() => {
    if (params.get('prepare') === '1') {
      if (canManage) setPrepareOpen(true);
      patch({ prepare: undefined });
    }
    if (params.get('settings') === '1') {
      setSettingsOpen(true);
      patch({ settings: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  return (
    <Page>
      <PageHeader
        title="Payroll"
        description="Salaries, monthly payroll and payslips — PAYE, pension and NHF worked out for you."
        actions={
          <>
            <Button variant="outline" onClick={() => setSettingsOpen(true)}>
              <Settings2 /> Settings
            </Button>
            {canManage && (
              <Button onClick={() => setPrepareOpen(true)}>
                <Plus /> Prepare payroll
              </Button>
            )}
          </>
        }
      />
      <Tabs value={tab} onValueChange={(t) => patch({ tab: t === 'runs' ? undefined : t })}>
        <TabsList aria-label="Payroll sections">
          <TabsTrigger value="runs">
            <FileStack /> Payroll runs
          </TabsTrigger>
          <TabsTrigger value="salaries">
            <Users /> Salaries
          </TabsTrigger>
          <TabsTrigger value="grades">
            <Layers /> Salary grades
          </TabsTrigger>
        </TabsList>
        <TabsContent value="runs">
          <RunsTab onPrepare={canManage ? () => setPrepareOpen(true) : undefined} />
        </TabsContent>
        <TabsContent value="salaries">
          <SalariesTab />
        </TabsContent>
        <TabsContent value="grades">
          <GradesTab />
        </TabsContent>
      </Tabs>
      {canManage && <PrepareDialog open={prepareOpen} onOpenChange={setPrepareOpen} />}
      <PayrollSettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />
    </Page>
  );
}

// ------------------------------------------------------------------ runs

function RunsTab({ onPrepare }: { onPrepare?: () => void }) {
  const navigate = useNavigate();
  const currency = useCurrency();
  const q = usePayrollRuns();
  const latest = q.data?.[0];
  const prev = q.data?.[1];

  const columns: Column<PayrollRunRow>[] = [
    { key: 'month', header: 'Month', cell: (r) => <span className="font-medium">{r.label}</span> },
    { key: 'status', header: 'Status', cell: (r) => <PayrollStatusBadge status={r.status} /> },
    { key: 'staff', header: 'Staff', headClassName: 'text-right', className: 'text-right tabular', cell: (r) => r.staffCount },
    { key: 'gross', header: 'Gross', headClassName: 'text-right', className: 'text-right tabular', cell: (r) => money(r.grossKobo, currency) },
    { key: 'net', header: 'Net', headClassName: 'text-right', className: 'text-right font-semibold tabular', cell: (r) => money(r.netKobo, currency) },
    { key: 'cost', header: 'Total cost', headClassName: 'text-right', className: 'text-right tabular text-muted-foreground', cell: (r) => money(r.costKobo, currency) },
    {
      key: 'who',
      header: 'Prepared / approved',
      cell: (r) => (
        <span className="text-[12.5px] text-muted-foreground">
          {r.preparedBy ?? '—'}
          {r.approvedBy && ` · ${r.approvedBy}`}
        </span>
      ),
    },
    { key: 'paid', header: 'Paid on', cell: (r) => <span className="whitespace-nowrap text-[12.5px] text-muted-foreground">{r.paidOn ? formatDate(r.paidOn) : '—'}</span> },
  ];

  return (
    <div className="space-y-5">
      {latest && (
        <div className="grid gap-4 md:grid-cols-3 [&>*]:min-w-0">
          <StatTile label={`${latest.label} net pay`} icon={<Wallet />} value={compactMoney(latest.netKobo, currency)} sub={<span className="flex items-center gap-2"><PayrollStatusBadge status={latest.status} /> {plural(latest.staffCount, 'payslip')}</span>} />
          <StatTile label="Total cost to school" icon={<Banknote />} value={compactMoney(latest.costKobo, currency)} sub={`Gross ${money(latest.grossKobo, currency)} + employer pension`} />
          <StatTile
            label="PAYE this month"
            icon={<FileStack />}
            value={compactMoney(latest.payeKobo, currency)}
            sub={prev ? `${prev.label}: ${money(prev.payeKobo, currency)}` : 'Remit by the 10th of next month'}
          />
        </div>
      )}
      <Card className="overflow-hidden">
        <DataTable
          columns={columns}
          rows={q.data}
          rowKey={(r) => r.id}
          loading={q.isLoading}
          error={q.error}
          onRetry={() => void q.refetch()}
          onRowClick={(r) => navigate(`/payroll/runs/${r.id}`)}
          rowLabel={(r) => `Open ${r.label} payroll`}
          renderMobile={(r) => (
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium">{r.label}</p>
                <p className="text-[12px] text-muted-foreground">
                  {plural(r.staffCount, 'payslip')} · gross {money(r.grossKobo, currency)}
                </p>
                <PayrollStatusBadge status={r.status} className="mt-1.5" />
              </div>
              <p className="text-[14px] font-semibold tabular">{money(r.netKobo, currency)}</p>
            </div>
          )}
          empty={{
            icon: FileStack,
            title: 'No payroll yet',
            description: 'Set salaries for your staff, then prepare the month. You’ll see every payslip and any problems before anything is approved.',
            action: onPrepare ? (
              <Button onClick={onPrepare}>
                <Plus /> Prepare payroll
              </Button>
            ) : undefined,
          }}
        />
      </Card>
    </div>
  );
}

function PrepareDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const create = useCreateRun();
  const runs = usePayrollRuns(open);
  const thisMonth = schoolToday().slice(0, 7);
  const [period, setPeriod] = useState(thisMonth);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (open) {
      setPeriod(thisMonth);
      setNote('');
      setError(undefined);
    }
  }, [open, thisMonth]);
  const options = [1, 0, -1, -2, -3].map((n) => shiftMonth(thisMonth, n));
  const taken = new Set((runs.data ?? []).map((r) => r.period));

  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    if (taken.has(period)) {
      setError(`There’s already a payroll for ${periodLabel(period)}`);
      return;
    }
    create.mutate(
      { period, note: note.trim() || null },
      {
        onSuccess: (d) => {
          onOpenChange(false);
          navigate(`/payroll/runs/${d.id}`);
        },
        onError: (err) => setError(err.message),
      },
    );
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Prepare payroll"
      description="Payslips are worked out from everyone’s pay details, with unpaid leave taken off. Nothing is paid until it’s approved."
      icon={<FileStack />}
      submitLabel="Prepare payroll"
      pending={create.isPending}
      onSubmit={submit}
      size="sm"
    >
      <div className="grid gap-4">
        <Field label="Month" htmlFor="pr-month" error={error}>
          <Select value={period} onValueChange={(p) => { setPeriod(p); setError(undefined); }}>
            <SelectTrigger id="pr-month" invalid={!!error}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((p) => (
                <SelectItem key={p} value={p} disabled={taken.has(p)}>
                  {periodLabel(p)}
                  {p === thisMonth && ' (this month)'}
                  {taken.has(p) && ' — done'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Note" htmlFor="pr-note" optional>
          <Textarea id="pr-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="e.g. Includes the September increment" />
        </Field>
      </div>
    </FormDialog>
  );
}

// ------------------------------------------------------------------ salaries

function SalariesTab() {
  const navigate = useNavigate();
  const currency = useCurrency();
  const canManage = useCan('payroll.manage');
  const q = usePayProfiles();
  const rows = q.data;
  const set = (rows ?? []).filter((r) => r.netKobo != null);
  const gaps = (rows ?? []).filter((r) => r.missing.length > 0).length;
  const gross = set.reduce((n, r) => n + (r.grossKobo ?? 0), 0);
  const net = set.reduce((n, r) => n + (r.netKobo ?? 0), 0);

  const columns: Column<PayProfileRow>[] = [
    {
      key: 'staff',
      header: 'Staff',
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.staff.name}</p>
          <p className="truncate text-[12px] text-muted-foreground">
            {r.staff.jobTitle}
            {r.staff.department && ` · ${r.staff.department}`}
          </p>
        </div>
      ),
    },
    { key: 'grade', header: 'Grade', cell: (r) => <span className="text-[13px]">{r.gradeName ?? (r.grossKobo == null ? '—' : 'Custom')}</span> },
    { key: 'gross', header: 'Gross', headClassName: 'text-right', className: 'text-right tabular', cell: (r) => money(r.grossKobo, currency) },
    { key: 'paye', header: 'PAYE', headClassName: 'text-right', className: 'text-right tabular text-muted-foreground', cell: (r) => money(r.payeKobo, currency) },
    { key: 'net', header: 'Net', headClassName: 'text-right', className: 'text-right font-semibold tabular', cell: (r) => money(r.netKobo, currency) },
    { key: 'missing', header: 'Missing', cell: (r) => <Missing r={r} /> },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: <span className="sr-only">Actions</span>,
            className: 'w-10',
            cell: (r: PayProfileRow) => (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[12px]"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/hr/employees/${r.staff.id}?tab=pay&editPay=1`);
                }}
              >
                <Pencil /> Edit pay
              </Button>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3 [&>*]:min-w-0">
        <StatTile label="Monthly gross" icon={<Banknote />} value={compactMoney(gross, currency)} loading={!rows} sub={`${plural(set.length, 'person', 'people')} with pay details`} />
        <StatTile label="Monthly net" icon={<Wallet />} value={compactMoney(net, currency)} loading={!rows} sub="Before unpaid leave and adjustments" />
        <StatTile label="Details missing" icon={<Users />} value={gaps} loading={!rows} tone={gaps ? 'warning' : 'success'} sub={gaps ? 'Fix before preparing payroll' : 'Everyone’s ready for payroll'} />
      </div>
      <Card className="overflow-hidden">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.staff.id}
          loading={q.isLoading}
          error={q.error}
          onRetry={() => void q.refetch()}
          onRowClick={(r) => navigate(`/hr/employees/${r.staff.id}?tab=pay`)}
          rowLabel={(r) => `Open ${r.staff.name}’s pay`}
          renderMobile={(r) => (
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium">{r.staff.name}</p>
                <p className="truncate text-[12px] text-muted-foreground">
                  {r.gradeName ?? r.staff.jobTitle} · gross {money(r.grossKobo, currency)}
                </p>
                <Missing r={r} className="mt-1.5" />
              </div>
              <p className="text-[14px] font-semibold tabular">{money(r.netKobo, currency)}</p>
            </div>
          )}
          empty={{ icon: Users, title: 'No active staff', description: 'Staff appear here once they’re added on Teachers & Staff.' }}
        />
      </Card>
    </div>
  );
}

function Missing({ r, className }: { r: PayProfileRow; className?: string }) {
  if (r.grossKobo == null)
    return (
      <Badge variant="danger" className={className}>
        No pay details
      </Badge>
    );
  if (!r.missing.length) return <span className={cn('text-[12px] text-muted-foreground', className)}>—</span>;
  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {r.missing.map((m) => (
        <Badge key={m} variant="warning">
          {m}
        </Badge>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ grades

function GradesTab() {
  const currency = useCurrency();
  const canManage = useCan('payroll.manage');
  const q = useGrades();
  const apply = useApplyGrade();
  const del = useDeleteGrade();
  const [editing, setEditing] = useState<SalaryGradeRow | 'new' | null>(null);
  const [applying, setApplying] = useState<SalaryGradeRow | null>(null);
  const [deleting, setDeleting] = useState<SalaryGradeRow | null>(null);

  if (q.error && !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-muted-foreground">Standard pay bands. Changing a grade doesn’t change anyone’s pay until you apply it.</p>
        {canManage && (
          <Button onClick={() => setEditing('new')}>
            <Plus /> Add grade
          </Button>
        )}
      </div>
      {!q.data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0" aria-busy>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[220px] rounded-2xl" />
          ))}
        </div>
      ) : q.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={Layers}
            title="No salary grades yet"
            description="Grades like “Graduate teacher” or “Senior teacher” make setting pay quick and consistent."
            action={
              canManage ? (
                <Button onClick={() => setEditing('new')}>
                  <Plus /> Add grade
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
          {q.data.map((g) => (
            <Card key={g.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-display text-[15px] font-semibold tracking-tight">{g.name}</p>
                  <p className="text-[12px] text-muted-foreground">{plural(g.staffCount, 'person', 'people')} on this grade</p>
                </div>
                {canManage && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${g.name}`}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setEditing(g)}>
                        <Pencil /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setApplying(g)} disabled={g.staffCount === 0}>
                        <RefreshCw /> Apply to {plural(g.staffCount, 'person', 'people')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem destructive onSelect={() => setDeleting(g)}>
                        <Trash2 /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              <dl className="mt-4 space-y-1 text-[13px]">
                {(
                  [
                    ['Basic', g.basicKobo],
                    ['Housing', g.housingKobo],
                    ['Transport', g.transportKobo],
                    ...g.otherAllowances.map((a) => [a.label, a.amountKobo] as const),
                  ] as (readonly [string, number])[]
                ).map(([label, v], i) => (
                  <div key={`${label}-${i}`} className="flex justify-between gap-3">
                    <dt className="truncate text-muted-foreground">{label}</dt>
                    <dd className="tabular">{money(v, currency)}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-auto flex items-baseline justify-between border-t border-border pt-3">
                <span className="text-[12.5px] font-medium">Gross a month</span>
                <span className="font-display text-[18px] font-semibold tabular">{money(g.grossKobo, currency)}</span>
              </div>
              {canManage && g.staffCount > 0 && (
                <Button variant="outline" size="sm" className="mt-3" onClick={() => setApplying(g)}>
                  <RefreshCw /> Apply to {plural(g.staffCount, 'person', 'people')}
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}
      {editing && <GradeDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} grade={editing === 'new' ? null : editing} />}
      <ConfirmDialog
        open={!!applying}
        onOpenChange={(o) => !o && setApplying(null)}
        title={`Apply ${applying?.name ?? ''} to ${plural(applying?.staffCount ?? 0, 'person', 'people')}?`}
        description="Their basic, housing, transport and other allowances are reset to this grade’s amounts. Payrolls already prepared aren’t changed — recalculate a draft to pick it up."
        confirmLabel="Apply grade"
        destructive={false}
        loading={apply.isPending}
        onConfirm={() => applying && apply.mutate(applying.id, { onSuccess: () => setApplying(null) })}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name ?? 'grade'}?`}
        description={deleting?.staffCount ? `${plural(deleting.staffCount, 'person', 'people')} keep their current pay, marked as custom.` : 'Nobody is on this grade.'}
        confirmLabel="Delete grade"
        loading={del.isPending}
        onConfirm={() => deleting && del.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
      />
    </div>
  );
}

function GradeDialog({ open, onOpenChange, grade }: { open: boolean; onOpenChange: (o: boolean) => void; grade: SalaryGradeRow | null }) {
  const currency = useCurrency();
  const save = useSaveGrade(grade?.id);
  const [name, setName] = useState(grade?.name ?? '');
  const [basic, setBasic] = useState(grade ? koboToInput(grade.basicKobo) : '');
  const [housing, setHousing] = useState(grade ? koboToInput(grade.housingKobo) : '');
  const [transport, setTransport] = useState(grade ? koboToInput(grade.transportKobo) : '');
  const [others, setOthers] = useState<AllowanceDraft[]>(() => allowanceDrafts(grade?.otherAllowances ?? []));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [allowanceErrors, setAllowanceErrors] = useState<Record<number, string>>({});
  const k = (s: string) => toKobo(parseNaira(s) ?? 0);
  const total = k(basic) + k(housing) + k(transport) + others.reduce((n, o) => n + k(o.amount), 0);

  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    const { list, errors: aErr } = allowancesFromDrafts(others);
    setAllowanceErrors(aErr);
    const parsed = salaryGradeSchema.safeParse({ name, basicKobo: k(basic), housingKobo: k(housing), transportKobo: k(transport), otherAllowances: list });
    const next: Record<string, string> = {};
    if (!parsed.success) for (const i of parsed.error.issues) next[String(i.path[0])] ??= i.path[0] === 'name' ? 'Name the grade (at least 2 letters)' : i.message;
    if (k(basic) <= 0) next.basicKobo = 'Enter the monthly basic';
    setErrors(next);
    if (Object.keys(next).length || Object.keys(aErr).length || !parsed.success) return;
    save.mutate(parsed.data, {
      onSuccess: () => onOpenChange(false),
      onError: (err) => {
        if (err instanceof ApiError && err.errors.length) setErrors(Object.fromEntries(err.errors.map((x) => [x.path, x.message])));
        else toast.error(err.message);
      },
    });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={grade ? `Edit ${grade.name}` : 'Add a salary grade'}
      description="Monthly amounts."
      icon={<Layers />}
      submitLabel={grade ? 'Save grade' : 'Add grade'}
      pending={save.isPending}
      onSubmit={submit}
      size="lg"
    >
      <div className="grid gap-4">
        <Field label="Name" htmlFor="gr-name" error={errors.name}>
          <Input id="gr-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Graduate teacher" invalid={!!errors.name} autoFocus />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3 [&>*]:min-w-0">
          <Field label="Basic" htmlFor="gr-basic" error={errors.basicKobo}>
            <MoneyInput id="gr-basic" value={basic} onChange={setBasic} currency={currency} placeholder="0" invalid={!!errors.basicKobo} />
          </Field>
          <Field label="Housing" htmlFor="gr-housing">
            <MoneyInput id="gr-housing" value={housing} onChange={setHousing} currency={currency} placeholder="0" />
          </Field>
          <Field label="Transport" htmlFor="gr-transport">
            <MoneyInput id="gr-transport" value={transport} onChange={setTransport} currency={currency} placeholder="0" />
          </Field>
        </div>
        <div className="grid gap-1.5">
          <p className="text-[13px] font-medium">Other allowances</p>
          <AllowanceRepeater rows={others} onChange={setOthers} currency={currency} errors={allowanceErrors} idPrefix="gr" />
        </div>
        <div className="flex items-baseline justify-between rounded-xl border border-border bg-muted/30 px-3.5 py-2.5" aria-live="polite">
          <span className="text-[13px] text-muted-foreground">Gross a month</span>
          <span className="font-display text-[18px] font-semibold tabular">{money(total, currency)}</span>
        </div>
      </div>
    </FormDialog>
  );
}

// ------------------------------------------------------------------ settings

export function PayrollSettingsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const canManage = useCan('payroll.manage');
  const settings = usePayrollSettings(open);
  const save = useSavePayrollSettings();
  const [paye, setPaye] = useState(DEFAULT_HR_SETTINGS.payeEnabled);
  const [emp, setEmp] = useState(String(DEFAULT_HR_SETTINGS.pensionEmployeePct));
  const [er, setEr] = useState(String(DEFAULT_HR_SETTINGS.pensionEmployerPct));
  const [nhf, setNhf] = useState(String(DEFAULT_HR_SETTINGS.nhfPct));
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open || !settings.data) return;
    setPaye(settings.data.payeEnabled);
    setEmp(String(settings.data.pensionEmployeePct));
    setEr(String(settings.data.pensionEmployerPct));
    setNhf(String(settings.data.nhfPct));
    setNote(settings.data.payslipNote ?? '');
    setErrors({});
  }, [open, settings.data]);

  const pct = (s: string, max: number, key: string, next: Record<string, string>) => {
    const n = Number(s);
    if (!s.trim() || Number.isNaN(n) || n < 0 || n > max) next[key] = `0–${max}%`;
    return n;
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    const input = {
      payeEnabled: paye,
      pensionEmployeePct: pct(emp, 30, 'pensionEmployeePct', next),
      pensionEmployerPct: pct(er, 30, 'pensionEmployerPct', next),
      nhfPct: pct(nhf, 10, 'nhfPct', next),
      payslipNote: note.trim() || null,
    };
    setErrors(next);
    if (Object.keys(next).length) return;
    save.mutate(input, {
      onSuccess: () => onOpenChange(false),
      onError: (err) => {
        if (err instanceof ApiError && err.errors.length) setErrors(Object.fromEntries(err.errors.map((x) => [x.path, x.message])));
        else toast.error(err.message);
      },
    });
  };

  const pctInput = (id: string, value: string, set: (v: string) => void, key: string) => (
    <div className="relative">
      <Input
        id={id}
        inputMode="decimal"
        value={value}
        onChange={(e) => set(e.target.value.replace(/[^\d.]/g, '').slice(0, 5))}
        className="pr-8 tabular"
        invalid={!!errors[key]}
        disabled={!canManage}
      />
      <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        %
      </span>
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="font-display text-lg font-semibold tracking-tight">Payroll settings</SheetTitle>
          <SheetDescription className="text-[13px] text-muted-foreground">Tax, pension and NHF rates used on every payslip.</SheetDescription>
        </SheetHeader>
        <SheetBody>
          {!settings.data ? (
            <div className="space-y-3">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <form id="payroll-settings" onSubmit={submit} noValidate className="grid gap-5">
              <SwitchRow label="Deduct PAYE income tax" description={`Tax rules: ${PAYE_RULES_LABEL}`}>
                <Switch checked={paye} onCheckedChange={setPaye} disabled={!canManage} aria-label="Deduct PAYE income tax" />
              </SwitchRow>
              <p className="-mt-2 text-[12px] text-muted-foreground">Bands follow the Nigeria Tax Act 2025: the first ₦800,000 a year is tax-free, then 15% rising to 25%, with rent relief of 20% of rent up to ₦500,000.</p>
              <div className="grid gap-4 sm:grid-cols-3 [&>*]:min-w-0">
                <Field label="Employee pension" htmlFor="ps-emp" error={errors.pensionEmployeePct} hint="Legal minimum 8%">
                  {pctInput('ps-emp', emp, setEmp, 'pensionEmployeePct')}
                </Field>
                <Field label="Employer pension" htmlFor="ps-er" error={errors.pensionEmployerPct} hint="Legal minimum 10%">
                  {pctInput('ps-er', er, setEr, 'pensionEmployerPct')}
                </Field>
                <Field label="NHF" htmlFor="ps-nhf" error={errors.nhfPct} hint="Of basic; usually 2.5%">
                  {pctInput('ps-nhf', nhf, setNhf, 'nhfPct')}
                </Field>
              </div>
              <Field label="Payslip note" htmlFor="ps-note" optional hint="Printed at the foot of every payslip.">
                <Textarea id="ps-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} disabled={!canManage} placeholder="e.g. Questions about your pay? Speak to the bursar in confidence." />
              </Field>
              {!canManage && <p className="rounded-xl border border-dashed border-border p-3 text-[12.5px] text-muted-foreground">Someone with payroll management permission can change these.</p>}
            </form>
          )}
        </SheetBody>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {canManage && (
            <Button type="submit" form="payroll-settings" loading={save.isPending} disabled={!settings.data}>
              Save settings
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
