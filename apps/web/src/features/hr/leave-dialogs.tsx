import { type LeaveBalance, type LeaveRequestRow, type LeaveTypeRow, leaveRequestSchema, workingDaysBetween } from '@aischool/shared';
import { AlertTriangle, CalendarPlus, CalendarX2, Check, X } from 'lucide-react';
import { type BaseSyntheticEvent, useEffect, useMemo, useState } from 'react';
import { Field } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { schoolToday } from '../finance/ui';
import { useDecideLeave, useLeaveTypes, useRecordLeave, useRequestMyLeave, useStaffOptions } from './api';
import { dateRange, daysLabel, StaffSelect } from './ui';

const dateInput = 'tabular [color-scheme:light] dark:[color-scheme:dark]';

interface LeaveFormState {
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  reason: string;
}

function useLeaveForm(open: boolean) {
  const [v, setV] = useState<LeaveFormState>({ leaveTypeId: '', startDate: schoolToday(), endDate: schoolToday(), reason: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setV({ leaveTypeId: '', startDate: schoolToday(), endDate: schoolToday(), reason: '' });
    setErrors({});
  }, [open]);
  const days = v.startDate && v.endDate && v.endDate >= v.startDate ? workingDaysBetween(v.startDate, v.endDate) : 0;
  return { v, set: (p: Partial<LeaveFormState>) => setV((s) => ({ ...s, ...p })), errors, setErrors, days };
}

function apiErrors(err: unknown, setErrors: (e: Record<string, string>) => void) {
  if (err instanceof ApiError && err.errors.length) setErrors(Object.fromEntries(err.errors.map((x) => [x.path, x.message])));
  else setErrors({ form: err instanceof Error ? err.message : 'Something went wrong' });
}

function LeaveFields({
  form,
  types,
  balances,
  idPrefix,
  minDate,
}: {
  form: ReturnType<typeof useLeaveForm>;
  types: LeaveTypeRow[];
  balances?: LeaveBalance[];
  idPrefix: string;
  minDate?: string;
}) {
  const { v, set, errors, days } = form;
  const balance = balances?.find((b) => b.leaveTypeId === v.leaveTypeId);
  const type = types.find((t) => t.id === v.leaveTypeId);
  const over = balance && days > balance.remaining;
  return (
    <div className="grid gap-4">
      <Field label="Type of leave" htmlFor={`${idPrefix}-type`} error={errors.leaveTypeId}>
        <Select value={v.leaveTypeId || undefined} onValueChange={(id) => set({ leaveTypeId: id })}>
          <SelectTrigger id={`${idPrefix}-type`} invalid={!!errors.leaveTypeId}>
            <SelectValue placeholder="Choose a type" />
          </SelectTrigger>
          <SelectContent>
            {types.map((t) => {
              const b = balances?.find((x) => x.leaveTypeId === t.id);
              return (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                  {!t.paid && ' (unpaid)'}
                  {b && <span className="text-muted-foreground"> · {daysLabel(b.remaining)} left</span>}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
        <Field label="First day" htmlFor={`${idPrefix}-start`} error={errors.startDate}>
          <Input
            id={`${idPrefix}-start`}
            type="date"
            value={v.startDate}
            min={minDate}
            onChange={(e) => set({ startDate: e.target.value, ...(v.endDate < e.target.value ? { endDate: e.target.value } : {}) })}
            className={dateInput}
            invalid={!!errors.startDate}
          />
        </Field>
        <Field label="Last day" htmlFor={`${idPrefix}-end`} error={errors.endDate}>
          <Input id={`${idPrefix}-end`} type="date" value={v.endDate} min={v.startDate || minDate} onChange={(e) => set({ endDate: e.target.value })} className={dateInput} invalid={!!errors.endDate} />
        </Field>
      </div>
      <div
        className={cn(
          'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-3.5 py-2.5 text-[13px]',
          over ? 'border-danger/30 bg-danger-soft/50' : 'border-border bg-muted/30',
        )}
        aria-live="polite"
      >
        <span>
          <span className="font-display text-[16px] font-semibold tabular">{days}</span> working day{days === 1 ? '' : 's'}
          <span className="text-muted-foreground"> (weekends not counted)</span>
        </span>
        {balance && (
          <span className={cn('sm:ml-auto', over ? 'font-medium text-danger' : 'text-muted-foreground')}>
            {over ? `Only ${daysLabel(Math.max(0, balance.remaining))} left` : `${daysLabel(balance.remaining - days)} left after this`}
          </span>
        )}
        {type && !type.paid && <span className="w-full text-[12px] text-warning">Unpaid — pay is reduced pro rata for these days.</span>}
      </div>
      <Field label="Reason" htmlFor={`${idPrefix}-reason`} optional>
        <Textarea id={`${idPrefix}-reason`} rows={3} value={v.reason} onChange={(e) => set({ reason: e.target.value })} maxLength={500} placeholder="A short note for the approver" />
      </Field>
      {errors.form && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-soft/50 px-3.5 py-2.5 text-[13px] text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {errors.form}
        </p>
      )}
    </div>
  );
}

function validate(form: ReturnType<typeof useLeaveForm>, staffId?: string | null, needStaff?: boolean) {
  const next: Record<string, string> = {};
  if (needStaff && !staffId) next.staffId = 'Choose the staff member';
  const parsed = leaveRequestSchema.safeParse({ ...form.v, staffId: staffId ?? undefined, reason: form.v.reason });
  if (!parsed.success) for (const i of parsed.error.issues) next[String(i.path[0])] ??= i.path[0] === 'leaveTypeId' ? 'Choose a type of leave' : i.message;
  if (!next.endDate && form.days === 0 && form.v.startDate && form.v.endDate) next.endDate = 'Those dates fall on a weekend';
  form.setErrors(next);
  return Object.keys(next).length || !parsed.success ? null : parsed.data;
}

/** HR records leave on someone's behalf. */
export function RecordLeaveDialog({ open, onOpenChange, staffId: fixedStaffId }: { open: boolean; onOpenChange: (o: boolean) => void; staffId?: string }) {
  const record = useRecordLeave();
  const types = useLeaveTypes(open);
  const staff = useStaffOptions(open);
  const form = useLeaveForm(open);
  const [staffId, setStaffId] = useState<string | null>(fixedStaffId ?? null);
  useEffect(() => {
    if (open) setStaffId(fixedStaffId ?? null);
  }, [open, fixedStaffId]);

  const gender = staff.data?.items.find((s) => s.id === staffId)?.gender;
  const options = useMemo(() => (types.data ?? []).filter((t) => t.active && (!gender || t.appliesTo === 'ALL' || t.appliesTo === gender)), [types.data, gender]);

  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    const data = validate(form, staffId, true);
    if (!data) return;
    record.mutate(data, { onSuccess: () => onOpenChange(false), onError: (err) => apiErrors(err, form.setErrors) });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Record leave"
      description="For leave phoned in or agreed in person. It goes to the approver like any other request."
      icon={<CalendarPlus />}
      submitLabel="Record leave"
      pending={record.isPending}
      onSubmit={submit}
    >
      <div className="grid gap-4">
        {!fixedStaffId && (
          <Field label="Staff member" htmlFor="rl-staff" error={form.errors.staffId}>
            <StaffSelect id="rl-staff" value={staffId} onChange={setStaffId} invalid={!!form.errors.staffId} />
          </Field>
        )}
        <LeaveFields form={form} types={options} idPrefix="rl" />
      </div>
    </FormDialog>
  );
}

/** Staff request their own leave (types and balances come from /hr/me). */
export function RequestLeaveDialog({ open, onOpenChange, types, balances }: { open: boolean; onOpenChange: (o: boolean) => void; types: LeaveTypeRow[]; balances: LeaveBalance[] }) {
  const request = useRequestMyLeave();
  const form = useLeaveForm(open);
  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    const data = validate(form);
    if (!data) return;
    const { staffId: _s, ...body } = data;
    request.mutate(body, { onSuccess: () => onOpenChange(false), onError: (err) => apiErrors(err, form.setErrors) });
  };
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Request leave"
      description="Your request goes to an approver. You’ll see the decision in My HR."
      icon={<CalendarPlus />}
      submitLabel="Send request"
      pending={request.isPending}
      onSubmit={submit}
    >
      <LeaveFields form={form} types={types} balances={balances} idPrefix="ml" minDate={schoolToday()} />
    </FormDialog>
  );
}

/** Approve (optional note) or decline (note required). */
export function DecideLeaveDialog({
  request,
  decision,
  onOpenChange,
}: {
  request: LeaveRequestRow | null;
  decision: 'APPROVE' | 'DECLINE';
  onOpenChange: (o: boolean) => void;
}) {
  const decide = useDecideLeave();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string>();
  const open = !!request;
  useEffect(() => {
    if (open) {
      setNote('');
      setError(undefined);
    }
  }, [open]);
  if (!request) return null;
  const declining = decision === 'DECLINE';
  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    if (declining && note.trim().length < 3) {
      setError('Give a short reason — it’s shared with the staff member');
      return;
    }
    decide.mutate(
      { id: request.id, decision, note: note.trim() || null },
      { onSuccess: () => onOpenChange(false), onError: (err) => setError(err.message) },
    );
  };
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={declining ? `Decline ${request.staff.name}’s request?` : `Approve ${request.staff.name}’s leave?`}
      description={`${request.leaveType.name} · ${dateRange(request.startDate, request.endDate)} · ${daysLabel(request.days)}`}
      icon={declining ? <CalendarX2 /> : <Check />}
      submitLabel={declining ? 'Decline request' : 'Approve leave'}
      pending={decide.isPending}
      size="sm"
      onSubmit={submit}
    >
      <div className="grid gap-3">
        {!declining && request.overlaps.length > 0 && (
          <p className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning-soft/50 px-3.5 py-2.5 text-[12.5px]">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <span>Also away in {request.staff.department ?? 'the department'}: {request.overlaps.join(', ')}.</span>
          </p>
        )}
        {!declining && <p className="text-[12.5px] text-muted-foreground">Approved days are marked “on leave” on the staff register automatically.</p>}
        <Field label={declining ? 'Reason' : 'Note'} htmlFor="ld-note" optional={!declining} error={error}>
          <Textarea
            id="ld-note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            placeholder={declining ? 'e.g. Mock exams that week — could you move it to the following week?' : 'Optional note'}
            invalid={!!error}
            autoFocus
          />
        </Field>
        {declining && (
          <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <X className="size-3.5" aria-hidden /> The staff member sees this reason in My HR.
          </p>
        )}
      </div>
    </FormDialog>
  );
}
