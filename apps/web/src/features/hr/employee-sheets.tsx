import {
  type Allowance,
  computePayslip,
  DEFAULT_HR_SETTINGS,
  type EmployeeDetail,
  employeeSchema,
  type PayCalculation,
  payProfileSchema,
  STAFF_STATUSES,
  toKobo,
} from '@aischool/shared';
import { Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { SwitchRow } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { koboToInput, money, MoneyInput, parseNaira } from '../finance/ui';
import { useDepartments, useGrades, usePayrollSettings, useSaveEmployee, useSavePayProfile } from './api';

const dateInput = 'tabular [color-scheme:light] dark:[color-scheme:dark]';
const STATUS_LABEL: Record<(typeof STAFF_STATUSES)[number], string> = { ACTIVE: 'Active', ON_LEAVE: 'On leave', EXITED: 'Left the school' };

function serverErrors(err: unknown): Record<string, string> | null {
  if (err instanceof ApiError && err.errors.length) return Object.fromEntries(err.errors.map((x) => [x.path, x.message]));
  return null;
}

// ------------------------------------------------------------------ employee record

export function EditEmployeeSheet({ open, onOpenChange, employee }: { open: boolean; onOpenChange: (o: boolean) => void; employee: EmployeeDetail }) {
  const save = useSaveEmployee(employee.id);
  const departments = useDepartments(open);
  const initial = () => ({
    firstName: employee.firstName,
    lastName: employee.lastName,
    gender: employee.gender,
    email: employee.email ?? '',
    phone: employee.phone ?? '',
    jobTitle: employee.jobTitle,
    type: employee.type,
    status: employee.status,
    departmentId: employee.department?.id ?? '',
    employedOn: employee.employedOn ?? '',
    dateOfBirth: employee.dateOfBirth ?? '',
    address: employee.address ?? '',
    qualification: employee.qualification ?? '',
    nextOfKinName: employee.nextOfKinName ?? '',
    nextOfKinPhone: employee.nextOfKinPhone ?? '',
    exitedOn: employee.exitedOn ?? '',
    exitReason: employee.exitReason ?? '',
  });
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) {
      setV(initial());
      setErrors({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, employee]);
  const set = (p: Partial<ReturnType<typeof initial>>) => setV((s) => ({ ...s, ...p }));
  const exited = v.status === 'EXITED';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const opt = (s: string) => s.trim() || null;
    const parsed = employeeSchema.safeParse({
      ...v,
      email: v.email.trim(),
      departmentId: v.departmentId || null,
      employedOn: v.employedOn || null,
      dateOfBirth: v.dateOfBirth || null,
      exitedOn: exited ? v.exitedOn || null : null,
      exitReason: exited ? opt(v.exitReason) : null,
    });
    const next: Record<string, string> = {};
    if (!parsed.success) for (const i of parsed.error.issues) next[String(i.path[0])] ??= i.message;
    if (exited && !v.exitedOn) next.exitedOn = 'When did they leave?';
    setErrors(next);
    if (Object.keys(next).length || !parsed.success) return;
    save.mutate(parsed.data, { onSuccess: () => onOpenChange(false), onError: (err) => setErrors(serverErrors(err) ?? { form: err.message }) });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="font-display text-lg font-semibold tracking-tight">Edit {employee.name}</SheetTitle>
          <SheetDescription className="text-[13px] text-muted-foreground">Personal and employment details. Staff number is fixed.</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <form id="employee-form" onSubmit={submit} noValidate className="grid gap-6">
            <section className="grid gap-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Personal</h3>
              <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
                <Field label="First name" htmlFor="em-first" error={errors.firstName}>
                  <Input id="em-first" value={v.firstName} onChange={(e) => set({ firstName: e.target.value })} invalid={!!errors.firstName} />
                </Field>
                <Field label="Last name" htmlFor="em-last" error={errors.lastName}>
                  <Input id="em-last" value={v.lastName} onChange={(e) => set({ lastName: e.target.value })} invalid={!!errors.lastName} />
                </Field>
                <Field label="Gender" htmlFor="em-gender">
                  <Select value={v.gender} onValueChange={(g) => set({ gender: g as 'MALE' | 'FEMALE' })}>
                    <SelectTrigger id="em-gender">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FEMALE">Female</SelectItem>
                      <SelectItem value="MALE">Male</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Date of birth" htmlFor="em-dob" optional error={errors.dateOfBirth}>
                  <Input id="em-dob" type="date" value={v.dateOfBirth} onChange={(e) => set({ dateOfBirth: e.target.value })} className={dateInput} />
                </Field>
                <Field label="Email" htmlFor="em-email" optional error={errors.email}>
                  <Input id="em-email" type="email" value={v.email} onChange={(e) => set({ email: e.target.value })} invalid={!!errors.email} autoComplete="off" />
                </Field>
                <Field label="Phone" htmlFor="em-phone" optional error={errors.phone}>
                  <Input id="em-phone" type="tel" value={v.phone} onChange={(e) => set({ phone: e.target.value })} autoComplete="off" />
                </Field>
              </div>
              <Field label="Address" htmlFor="em-addr" optional>
                <Textarea id="em-addr" rows={2} value={v.address} onChange={(e) => set({ address: e.target.value })} maxLength={300} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
                <Field label="Next of kin" htmlFor="em-nok" optional>
                  <Input id="em-nok" value={v.nextOfKinName} onChange={(e) => set({ nextOfKinName: e.target.value })} maxLength={120} />
                </Field>
                <Field label="Next of kin phone" htmlFor="em-nokp" optional>
                  <Input id="em-nokp" type="tel" value={v.nextOfKinPhone} onChange={(e) => set({ nextOfKinPhone: e.target.value })} maxLength={20} />
                </Field>
              </div>
            </section>

            <section className="grid gap-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Employment</h3>
              <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
                <Field label="Job title" htmlFor="em-job" error={errors.jobTitle}>
                  <Input id="em-job" value={v.jobTitle} onChange={(e) => set({ jobTitle: e.target.value })} invalid={!!errors.jobTitle} />
                </Field>
                <Field label="Type" htmlFor="em-type">
                  <Select value={v.type} onValueChange={(t) => set({ type: t as 'TEACHING' | 'NON_TEACHING' })}>
                    <SelectTrigger id="em-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TEACHING">Teaching</SelectItem>
                      <SelectItem value="NON_TEACHING">Non-teaching</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Department" htmlFor="em-dept">
                  <Select value={v.departmentId || NONE} onValueChange={(d) => set({ departmentId: d === NONE ? '' : d })}>
                    <SelectTrigger id="em-dept">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>No department</SelectItem>
                      {(departments.data ?? []).map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Employed on" htmlFor="em-emp" optional error={errors.employedOn}>
                  <Input id="em-emp" type="date" value={v.employedOn} onChange={(e) => set({ employedOn: e.target.value })} className={dateInput} />
                </Field>
                <Field label="Qualification" htmlFor="em-qual" optional className="sm:col-span-2">
                  <Input id="em-qual" value={v.qualification} onChange={(e) => set({ qualification: e.target.value })} maxLength={120} placeholder="e.g. B.Sc. (Ed) Mathematics" />
                </Field>
                <Field label="Status" htmlFor="em-status" className="sm:col-span-2">
                  <Select value={v.status} onValueChange={(s) => set({ status: s as (typeof STAFF_STATUSES)[number] })}>
                    <SelectTrigger id="em-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STAFF_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              {exited && (
                <div className="grid gap-4 rounded-xl border border-warning/30 bg-warning-soft/40 p-4 sm:grid-cols-2 [&>*]:min-w-0">
                  <Field label="Left on" htmlFor="em-exit" error={errors.exitedOn}>
                    <Input id="em-exit" type="date" value={v.exitedOn} onChange={(e) => set({ exitedOn: e.target.value })} className={dateInput} invalid={!!errors.exitedOn} />
                  </Field>
                  <Field label="Reason" htmlFor="em-exitr" optional className="sm:col-span-2">
                    <Textarea id="em-exitr" rows={2} value={v.exitReason} onChange={(e) => set({ exitReason: e.target.value })} maxLength={300} placeholder="e.g. Resigned to relocate" />
                  </Field>
                  <p className="text-[12px] text-muted-foreground sm:col-span-2">Leavers drop off payroll, the directory and pickers. Their record and payslips are kept.</p>
                </div>
              )}
            </section>
            {errors.form && (
              <p role="alert" className="rounded-xl border border-danger/30 bg-danger-soft/50 px-3.5 py-2.5 text-[13px] text-danger">
                {errors.form}
              </p>
            )}
          </form>
        </SheetBody>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="employee-form" loading={save.isPending}>
            Save changes
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ------------------------------------------------------------------ pay breakdown

/** Earnings and deductions side by side, payslip style. */
export function PayBreakdown({ calc, currency, compact }: { calc: PayCalculation; currency: string; compact?: boolean }) {
  const col = (title: string, lines: { label: string; amountKobo: number }[], total: number, totalLabel: string, tone?: string) => (
    <div className="min-w-0">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      <dl className="space-y-1">
        {lines.length === 0 && <p className="text-[12.5px] text-muted-foreground">None</p>}
        {lines.map((l, i) => (
          <div key={`${l.label}-${i}`} className="flex items-baseline justify-between gap-3 text-[13px]">
            <dt className="min-w-0 truncate text-muted-foreground">{l.label}</dt>
            <dd className={cn('shrink-0 tabular', l.amountKobo < 0 && 'text-danger')}>{l.amountKobo < 0 ? `−${money(-l.amountKobo, currency)}` : money(l.amountKobo, currency)}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-border pt-2 text-[13px] font-semibold">
        <span>{totalLabel}</span>
        <span className={cn('tabular', tone)}>{money(total, currency)}</span>
      </div>
    </div>
  );
  const totalDeductions = calc.payeKobo + calc.pensionKobo + calc.nhfKobo + calc.otherDeductionsKobo;
  return (
    <div className={cn('rounded-xl border border-border bg-card', compact ? 'p-4' : 'p-5')}>
      <div className="grid gap-5 sm:grid-cols-2 [&>*]:min-w-0">
        {col('Earnings', calc.earnings, calc.grossKobo, 'Gross pay')}
        {col('Deductions', calc.deductions, totalDeductions, 'Total deductions')}
      </div>
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-3 rounded-lg bg-success-soft/60 px-3.5 py-2.5">
        <span className="text-[13px] font-medium">Net pay</span>
        <span className="font-display text-[22px] font-semibold tracking-tight tabular text-success">{money(calc.netKobo, currency)}</span>
      </div>
      {calc.employerPensionKobo > 0 && (
        <p className="mt-2 text-[12px] text-muted-foreground">Plus {money(calc.employerPensionKobo, currency)} employer pension, paid by the school on top.</p>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ pay details

interface AllowanceDraft {
  key: number;
  label: string;
  amount: string;
}

let allowanceKey = 0;
const toDrafts = (list: Allowance[]): AllowanceDraft[] => list.map((a) => ({ key: ++allowanceKey, label: a.label, amount: koboToInput(a.amountKobo) }));
const kobo = (s: string) => toKobo(parseNaira(s) ?? 0);

/** Other allowances repeater, shared by pay details and salary grades. */
export function AllowanceRepeater({ rows, onChange, currency, errors, idPrefix }: { rows: AllowanceDraft[]; onChange: (r: AllowanceDraft[]) => void; currency: string; errors?: Record<number, string>; idPrefix: string }) {
  return (
    <div className="grid gap-2">
      {rows.map((r, i) => (
        <div key={r.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,140px)_auto] items-start gap-2 [&>*]:min-w-0">
          <div>
            <Input
              aria-label={`Allowance ${i + 1} name`}
              id={`${idPrefix}-al-${i}`}
              value={r.label}
              onChange={(e) => onChange(rows.map((x) => (x.key === r.key ? { ...x, label: e.target.value } : x)))}
              placeholder="e.g. Responsibility"
              maxLength={60}
              invalid={!!errors?.[i]}
            />
            {errors?.[i] && <p className="mt-1 text-[12px] font-medium text-danger">{errors[i]}</p>}
          </div>
          <MoneyInput aria-label={`Allowance ${i + 1} amount`} value={r.amount} onChange={(amount) => onChange(rows.map((x) => (x.key === r.key ? { ...x, amount } : x)))} currency={currency} placeholder="0" />
          <Button type="button" variant="ghost" size="icon" aria-label={`Remove allowance ${i + 1}`} onClick={() => onChange(rows.filter((x) => x.key !== r.key))}>
            <Trash2 />
          </Button>
        </div>
      ))}
      {rows.length < 10 && (
        <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => onChange([...rows, { key: ++allowanceKey, label: '', amount: '' }])}>
          <Plus /> Add allowance
        </Button>
      )}
    </div>
  );
}

export function allowancesFromDrafts(rows: AllowanceDraft[]): { list: Allowance[]; errors: Record<number, string> } {
  const errors: Record<number, string> = {};
  const list: Allowance[] = [];
  rows.forEach((r, i) => {
    const amountKobo = kobo(r.amount);
    if (!r.label.trim() && !amountKobo) return;
    if (r.label.trim().length < 2) errors[i] = 'Name this allowance';
    list.push({ label: r.label.trim(), amountKobo });
  });
  return { list, errors };
}

export { toDrafts as allowanceDrafts };
export type { AllowanceDraft };

export function PayProfileSheet({ open, onOpenChange, employee }: { open: boolean; onOpenChange: (o: boolean) => void; employee: EmployeeDetail }) {
  const save = useSavePayProfile(employee.id);
  const grades = useGrades(open);
  const settings = usePayrollSettings(open);
  const currency = employee.currency;
  const p = employee.payProfile;
  const initial = () => ({
    gradeId: p?.gradeId ?? '',
    basic: p ? koboToInput(p.basicKobo) : '',
    housing: p ? koboToInput(p.housingKobo) : '',
    transport: p ? koboToInput(p.transportKobo) : '',
    pensionEnabled: p?.pensionEnabled ?? true,
    nhfEnabled: p?.nhfEnabled ?? false,
    rent: p?.annualRentKobo ? koboToInput(p.annualRentKobo) : '',
    bankName: p?.bankName ?? '',
    accountNumber: p?.accountNumber ?? '',
    accountName: p?.accountName ?? employee.name,
    pfaName: p?.pfaName ?? '',
    pensionPin: p?.pensionPin ?? '',
    taxId: p?.taxId ?? '',
  });
  const [v, setV] = useState(initial);
  const [others, setOthers] = useState<AllowanceDraft[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [allowanceErrors, setAllowanceErrors] = useState<Record<number, string>>({});
  useEffect(() => {
    if (!open) return;
    setV(initial());
    setOthers(toDrafts(p?.otherAllowances ?? []));
    setErrors({});
    setAllowanceErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, employee]);
  const set = (x: Partial<ReturnType<typeof initial>>) => setV((s) => ({ ...s, ...x }));

  const pickGrade = (id: string) => {
    if (id === NONE) return set({ gradeId: '' });
    const g = grades.data?.find((x) => x.id === id);
    if (!g) return;
    set({ gradeId: id, basic: koboToInput(g.basicKobo), housing: koboToInput(g.housingKobo), transport: koboToInput(g.transportKobo) });
    setOthers(toDrafts(g.otherAllowances));
  };

  const preview = useMemo(
    () =>
      computePayslip(
        {
          basicKobo: kobo(v.basic),
          housingKobo: kobo(v.housing),
          transportKobo: kobo(v.transport),
          otherAllowances: others.map((o) => ({ label: o.label.trim() || 'Allowance', amountKobo: kobo(o.amount) })).filter((o) => o.amountKobo > 0),
          pensionEnabled: v.pensionEnabled,
          nhfEnabled: v.nhfEnabled,
          annualRentKobo: kobo(v.rent),
          unpaidLeaveDays: 0,
          workingDays: 22,
          adjustments: [],
        },
        settings.data ?? DEFAULT_HR_SETTINGS,
      ),
    [v, others, settings.data],
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const { list, errors: aErr } = allowancesFromDrafts(others);
    setAllowanceErrors(aErr);
    const parsed = payProfileSchema.safeParse({
      gradeId: v.gradeId || null,
      basicKobo: kobo(v.basic),
      housingKobo: kobo(v.housing),
      transportKobo: kobo(v.transport),
      otherAllowances: list,
      pensionEnabled: v.pensionEnabled,
      nhfEnabled: v.nhfEnabled,
      annualRentKobo: kobo(v.rent),
      bankName: v.bankName,
      accountNumber: v.accountNumber,
      accountName: v.accountName,
      pfaName: v.pfaName,
      pensionPin: v.pensionPin,
      taxId: v.taxId,
    });
    const next: Record<string, string> = {};
    if (!parsed.success) for (const i of parsed.error.issues) next[String(i.path[0])] ??= i.message;
    if (kobo(v.basic) <= 0) next.basicKobo = 'Enter the monthly basic salary';
    setErrors(next);
    if (Object.keys(next).length || Object.keys(aErr).length || !parsed.success) return;
    save.mutate(parsed.data, { onSuccess: () => onOpenChange(false), onError: (err) => setErrors(serverErrors(err) ?? { form: err.message }) });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="font-display text-lg font-semibold tracking-tight">Pay details · {employee.name}</SheetTitle>
          <SheetDescription className="text-[13px] text-muted-foreground">Monthly amounts. The preview updates as you type, using the school’s payroll settings.</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <form id="pay-form" onSubmit={submit} noValidate className="grid gap-6">
            <section className="grid gap-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Salary</h3>
              <Field label="Salary grade" htmlFor="pp-grade" optional hint="Choosing a grade fills in its amounts. You can still adjust them.">
                <Select value={v.gradeId || NONE} onValueChange={pickGrade}>
                  <SelectTrigger id="pp-grade">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No grade (custom)</SelectItem>
                    {(grades.data ?? []).map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name} · {money(g.grossKobo, currency)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div className="grid gap-4 sm:grid-cols-3 [&>*]:min-w-0">
                <Field label="Basic" htmlFor="pp-basic" error={errors.basicKobo}>
                  <MoneyInput id="pp-basic" value={v.basic} onChange={(basic) => set({ basic })} currency={currency} placeholder="0" invalid={!!errors.basicKobo} />
                </Field>
                <Field label="Housing" htmlFor="pp-housing" error={errors.housingKobo}>
                  <MoneyInput id="pp-housing" value={v.housing} onChange={(housing) => set({ housing })} currency={currency} placeholder="0" />
                </Field>
                <Field label="Transport" htmlFor="pp-transport" error={errors.transportKobo}>
                  <MoneyInput id="pp-transport" value={v.transport} onChange={(transport) => set({ transport })} currency={currency} placeholder="0" />
                </Field>
              </div>
              <div className="grid gap-1.5">
                <p className="text-[13px] font-medium">Other allowances</p>
                <AllowanceRepeater rows={others} onChange={setOthers} currency={currency} errors={allowanceErrors} idPrefix="pp" />
              </div>
            </section>

            <section className="grid gap-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Statutory</h3>
              <SwitchRow label="Pension" description={`Employee ${settings.data?.pensionEmployeePct ?? 8}% and employer ${settings.data?.pensionEmployerPct ?? 10}% of basic + housing + transport`}>
                <Switch checked={v.pensionEnabled} onCheckedChange={(c) => set({ pensionEnabled: c })} aria-label="Pension" />
              </SwitchRow>
              <SwitchRow label="National Housing Fund" description={`${settings.data?.nhfPct ?? 2.5}% of basic`}>
                <Switch checked={v.nhfEnabled} onCheckedChange={(c) => set({ nhfEnabled: c })} aria-label="National Housing Fund" />
              </SwitchRow>
              <Field label="Annual rent paid" htmlFor="pp-rent" optional hint="For rent relief on PAYE: 20% of rent, up to ₦500,000 a year.">
                <MoneyInput id="pp-rent" value={v.rent} onChange={(rent) => set({ rent })} currency={currency} placeholder="0" />
              </Field>
            </section>

            <section className="grid gap-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Bank, pension and tax</h3>
              <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
                <Field label="Bank" htmlFor="pp-bank" optional error={errors.bankName}>
                  <Input id="pp-bank" value={v.bankName} onChange={(e) => set({ bankName: e.target.value })} maxLength={80} placeholder="e.g. GTBank" list="pp-banks" />
                  <datalist id="pp-banks">
                    {['Access Bank', 'First Bank', 'GTBank', 'UBA', 'Zenith Bank', 'Fidelity Bank', 'Union Bank', 'Stanbic IBTC', 'Sterling Bank', 'Wema Bank', 'Polaris Bank', 'FCMB', 'Ecobank', 'Opay', 'Moniepoint', 'Kuda'].map((b) => (
                      <option key={b} value={b} />
                    ))}
                  </datalist>
                </Field>
                <Field label="Account number" htmlFor="pp-acc" optional error={errors.accountNumber} hint="10-digit NUBAN">
                  <Input
                    id="pp-acc"
                    inputMode="numeric"
                    value={v.accountNumber}
                    onChange={(e) => set({ accountNumber: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                    className="font-mono tabular"
                    invalid={!!errors.accountNumber}
                    autoComplete="off"
                  />
                </Field>
                <Field label="Account name" htmlFor="pp-accname" optional className="sm:col-span-2">
                  <Input id="pp-accname" value={v.accountName} onChange={(e) => set({ accountName: e.target.value })} maxLength={120} />
                </Field>
                <Field label="Pension fund administrator" htmlFor="pp-pfa" optional>
                  <Input id="pp-pfa" value={v.pfaName} onChange={(e) => set({ pfaName: e.target.value })} maxLength={80} placeholder="e.g. Stanbic IBTC Pension" />
                </Field>
                <Field label="Pension PIN" htmlFor="pp-pin" optional>
                  <Input id="pp-pin" value={v.pensionPin} onChange={(e) => set({ pensionPin: e.target.value.toUpperCase() })} maxLength={30} className="font-mono" placeholder="PEN…" />
                </Field>
                <Field label="Tax ID (TIN)" htmlFor="pp-tin" optional>
                  <Input id="pp-tin" value={v.taxId} onChange={(e) => set({ taxId: e.target.value })} maxLength={30} className="font-mono" />
                </Field>
              </div>
            </section>

            <section className="grid gap-2" aria-live="polite">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Monthly preview</h3>
              <PayBreakdown calc={preview} currency={currency} compact />
              <p className="text-[11.5px] text-muted-foreground">A full month with no unpaid leave or one-off adjustments.</p>
            </section>
            {errors.form && (
              <p role="alert" className="rounded-xl border border-danger/30 bg-danger-soft/50 px-3.5 py-2.5 text-[13px] text-danger">
                {errors.form}
              </p>
            )}
          </form>
        </SheetBody>
        <SheetFooter>
          <p className="mr-auto hidden text-[12.5px] text-muted-foreground sm:block">
            Net <span className="font-semibold tabular text-foreground">{money(preview.netKobo, currency)}</span>
          </p>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="pay-form" loading={save.isPending}>
            Save pay details
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
