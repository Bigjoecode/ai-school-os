import {
  BILLING_PERIOD_LABELS,
  MODULE_FEATURE_KEYS,
  platformTenantUpdateSchema,
  TENANT_STATUSES,
  type TenantFeatureState,
  type TenantStatusKey,
} from '@aischool/shared';
import { AlertTriangle, Boxes, Check, Pencil, ShieldAlert, ToggleRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toDateInput } from '@/lib/format';
import { cn } from '@/lib/utils';
import { apiFieldErrors, dateInput, FormError, zodErrors } from '../operations/ui';
import { naira, type SchoolDetail, useChangePlan, usePlans, useSetFeature, useSetSchoolStatus, useUpdateSchool, usd } from './api';
import { TenantStatusBadge } from './ui';

// ------------------------------------------------------------------ edit details

export function EditSchoolDialog({ school, open, onOpenChange }: { school: SchoolDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const save = useUpdateSchool(school.id);
  const [v, setV] = useState({ name: '', email: '', phone: '', address: '', budget: '', trialEndsAt: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setV({
      name: school.name,
      email: school.email ?? '',
      phone: school.phone ?? '',
      address: school.address ?? '',
      budget: school.aiMonthlyBudgetUsd == null ? '' : String(school.aiMonthlyBudgetUsd),
      trialEndsAt: toDateInput(school.trialEndsAt),
    });
  }, [open, school]);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((p) => ({ ...p, [k]: e.target.value }));

  const submit = (e?: React.BaseSyntheticEvent) => {
    e?.preventDefault();
    const budget = v.budget.trim() === '' ? null : Number(v.budget);
    const parsed = platformTenantUpdateSchema.safeParse({
      name: v.name,
      email: v.email,
      phone: v.phone,
      address: v.address,
      aiMonthlyBudgetUsd: budget,
      trialEndsAt: v.trialEndsAt || null,
    });
    if (!parsed.success) {
      const z = zodErrors(parsed.error.issues);
      setErrors({ ...z, budget: z.aiMonthlyBudgetUsd ?? (budget != null && Number.isNaN(budget) ? 'Enter a number' : '') });
      return;
    }
    save.mutate(parsed.data, {
      onSuccess: () => {
        toast.success('School details saved');
        onOpenChange(false);
      },
      onError: (err) => setErrors(apiFieldErrors(err)),
    });
  };

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Edit school details" icon={<Pencil />} submitLabel="Save changes" pending={save.isPending} onSubmit={submit} size="lg">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="School name" htmlFor="sd-name" error={errors.name} className="sm:col-span-2">
          <Input id="sd-name" value={v.name} onChange={set('name')} invalid={!!errors.name} />
        </Field>
        <Field label="Contact email" htmlFor="sd-email" error={errors.email} optional>
          <Input id="sd-email" type="email" value={v.email} onChange={set('email')} invalid={!!errors.email} />
        </Field>
        <Field label="Phone" htmlFor="sd-phone" error={errors.phone} optional>
          <Input id="sd-phone" value={v.phone} onChange={set('phone')} invalid={!!errors.phone} />
        </Field>
        <Field label="Address" htmlFor="sd-address" error={errors.address} optional className="sm:col-span-2">
          <Textarea id="sd-address" rows={2} value={v.address} onChange={set('address')} className="min-h-[64px]" />
        </Field>
        <Field
          label="AI budget per month (USD)"
          htmlFor="sd-budget"
          error={errors.budget || undefined}
          hint={`Leave blank for the platform default (${usd(school.defaultAiBudgetUsd)}). 0 switches AI off.`}
        >
          <Input id="sd-budget" inputMode="decimal" value={v.budget} onChange={set('budget')} placeholder={String(school.defaultAiBudgetUsd)} className="tabular" invalid={!!errors.budget} />
        </Field>
        <Field label="Trial ends" htmlFor="sd-trial" error={errors.trialEndsAt} hint={school.status === 'TRIAL' ? 'Extend or shorten the trial.' : 'Only used while the school is on trial.'}>
          <Input id="sd-trial" type="date" value={v.trialEndsAt} onChange={set('trialEndsAt')} className={dateInput} />
        </Field>
      </div>
      <div className="mt-4">
        <FormError message={errors.form} />
      </div>
    </FormDialog>
  );
}

// ------------------------------------------------------------------ change plan

export function ChangePlanDialog({ school, open, onOpenChange }: { school: SchoolDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const plans = usePlans(open);
  const change = useChangePlan(school.id);
  const [planId, setPlanId] = useState<string | null>(null);
  useEffect(() => {
    if (open) setPlanId(school.planId);
  }, [open, school.planId]);
  const options = (plans.data ?? []).filter((p) => p.isActive || p.id === school.planId);
  const chosen = options.find((p) => p.id === planId);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Change ${school.name}’s plan`}
      description="Modules and limits change straight away. The current subscription moves to the new plan; billing changes from the next invoice."
      icon={<Boxes />}
      submitLabel={chosen && chosen.id !== school.planId ? `Move to ${chosen.name}` : 'Keep plan'}
      pending={change.isPending}
      onSubmit={(e) => {
        e?.preventDefault();
        if (!planId || planId === school.planId) return onOpenChange(false);
        change.mutate(planId, {
          onSuccess: () => {
            toast.success(`${school.name} moved to ${chosen?.name ?? 'the new plan'}`);
            onOpenChange(false);
          },
        });
      }}
    >
      <div role="radiogroup" aria-label="Plan" className="grid gap-2">
        {!plans.data && <p className="text-[13px] text-muted-foreground">Loading plans…</p>}
        {options.map((p) => {
          const on = p.id === planId;
          const modules = p.features.length === 0 ? MODULE_FEATURE_KEYS.length : p.features.length;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setPlanId(p.id)}
              className={cn(
                'flex items-start gap-3 rounded-xl border p-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                on ? 'border-brand bg-brand-soft/40' : 'border-border hover:border-border-strong hover:bg-muted/40',
              )}
            >
              <span className={cn('mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border', on ? 'border-brand bg-brand text-white' : 'border-border-strong')}>
                {on && <Check className="size-3" strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-semibold">{p.name}</span>
                  {p.id === school.planId && <Badge variant="outline">Current</Badge>}
                  {!p.isActive && <Badge variant="warning">Retired</Badge>}
                </span>
                <span className="mt-0.5 block text-[12.5px] text-muted-foreground">
                  {naira(p.pricePerStudentKobo)} per student {BILLING_PERIOD_LABELS[p.billingPeriod]} · {modules} of {MODULE_FEATURE_KEYS.length} modules ·{' '}
                  {p.maxStudents ? `up to ${p.maxStudents.toLocaleString()} students` : 'no student limit'}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </FormDialog>
  );
}

// ------------------------------------------------------------------ status

const STATUS_COPY: Record<TenantStatusKey, { verb: string; note: string }> = {
  ACTIVE: { verb: 'Activate', note: 'Everyone can sign in and use the modules on the school’s plan.' },
  TRIAL: { verb: 'Move to trial', note: 'The school keeps access until its trial end date.' },
  SUSPENDED: { verb: 'Suspend', note: 'Everyone at the school is signed out now and can’t sign in until you reactivate it. No data is deleted.' },
  ARCHIVED: { verb: 'Archive', note: 'The school is closed: everyone is signed out and it drops out of billing. Data is kept and it can be reactivated.' },
};

const STATUS_NOUN: Record<TenantStatusKey, string> = { ACTIVE: 'active', TRIAL: 'on trial', SUSPENDED: 'suspended', ARCHIVED: 'archived' };

export function StatusDialog({ school, open, onOpenChange }: { school: SchoolDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const setStatus = useSetSchoolStatus(school.id);
  const [status, setStatusValue] = useState<TenantStatusKey>('ACTIVE');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!open) return;
    setStatusValue(school.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE');
    setReason('');
    setError(undefined);
  }, [open, school.status]);
  const destructive = status === 'SUSPENDED' || status === 'ARCHIVED';
  const copy = STATUS_COPY[status];

  const submit = () => {
    if (reason.trim().length < 3) return setError('Give a short reason — it goes in both audit logs.');
    setStatus.mutate(
      { status, reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success(`${school.name} is now ${STATUS_NOUN[status]}`);
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <div className={cn('mb-2 grid size-10 place-items-center rounded-xl', destructive ? 'bg-danger-soft text-danger' : 'bg-brand-soft text-brand')}>
            {destructive ? <ShieldAlert className="size-5" /> : <ToggleRight className="size-5" />}
          </div>
          <DialogTitle>Change {school.name}’s status</DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            Currently <TenantStatusBadge status={school.status} />
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div role="radiogroup" aria-label="New status" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TENANT_STATUSES.filter((s) => s !== school.status).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={status === s}
                onClick={() => setStatusValue(s)}
                className={cn(
                  'rounded-xl border px-3 py-2.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  status === s
                    ? s === 'SUSPENDED' || s === 'ARCHIVED'
                      ? 'border-danger bg-danger-soft/50 text-danger'
                      : 'border-brand bg-brand-soft/50 text-brand'
                    : 'border-border text-muted-foreground hover:border-border-strong hover:text-foreground',
                )}
              >
                {STATUS_COPY[s].verb}
              </button>
            ))}
          </div>
          <p
            className={cn(
              'flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-[13px]',
              destructive ? 'border-danger/30 bg-danger-soft/40 text-danger' : 'border-border bg-muted/40 text-muted-foreground',
            )}
          >
            {destructive && <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />}
            {copy.note}
          </p>
          <Field label="Reason" htmlFor="st-reason" error={error} hint="Recorded in the platform and school audit logs.">
            <Textarea
              id="st-reason"
              rows={3}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setError(undefined);
              }}
              placeholder={destructive ? 'e.g. Invoice INV-0042 is 60 days overdue after three reminders' : 'e.g. Payment received'}
              invalid={!!error}
              maxLength={300}
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant={destructive ? 'destructive' : 'default'} loading={setStatus.isPending} onClick={submit}>
            {copy.verb} school
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ feature override

export function OverrideDialog({
  tenantId,
  schoolName,
  feature,
  enabled,
  onOpenChange,
}: {
  tenantId: string;
  schoolName: string;
  feature: TenantFeatureState | null;
  enabled: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const set = useSetFeature(tenantId);
  const [note, setNote] = useState('');
  useEffect(() => {
    if (feature) setNote('');
  }, [feature]);
  return (
    <Dialog open={!!feature} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>
            Force {feature?.name} {enabled ? 'on' : 'off'}
          </DialogTitle>
          <DialogDescription>
            {enabled
              ? `${schoolName} gets ${feature?.name} whatever its plan says, until you clear the override.`
              : `${schoolName} loses ${feature?.name} whatever its plan says, until you clear the override.`}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Field label="Note" htmlFor="ov-note" optional hint="Why — shown next to the override and in the audit log.">
            <Input id="ov-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={enabled ? 'e.g. Pilot until end of term' : 'e.g. Paused at the school’s request'} />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={enabled ? 'default' : 'destructive'}
            loading={set.isPending}
            onClick={() =>
              feature &&
              set.mutate(
                { key: feature.key, enabled, note: note.trim() || null },
                {
                  onSuccess: () => {
                    toast.success(`${feature.name} forced ${enabled ? 'on' : 'off'} for ${schoolName}`);
                    onOpenChange(false);
                  },
                },
              )
            }
          >
            Force {enabled ? 'on' : 'off'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
