import { BILLING_PERIOD_LABELS, BILLING_PERIODS, MODULE_FEATURE_KEYS, MODULE_FEATURES, planSchema, type BillingPeriodKey, type PlanRow } from '@aischool/shared';
import { Boxes, Check, Minus, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { FormDialog, SwitchRow } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tip } from '@/components/ui/tooltip';
import { usePlatformRole } from '@/lib/auth-store';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { koboToInput, MoneyInput, parseNaira } from '../finance/ui';
import { apiFieldErrors, FormError, zodErrors } from '../operations/ui';
import { naira, useDeletePlan, usePlans, useSavePlan, usd } from './api';

export default function PlansPage() {
  const q = usePlans();
  const role = usePlatformRole();
  const canDelete = role === 'SUPER_ADMIN';
  const [editing, setEditing] = useState<PlanRow | 'new' | null>(null);
  const [deleting, setDeleting] = useState<PlanRow | null>(null);
  const save = useSavePlan();
  const del = useDeletePlan();

  const toggle = (p: PlanRow, patch: Partial<Pick<PlanRow, 'isActive' | 'isPublic'>>) => {
    const { id, schools: _s, activeSubscriptions: _a, ...rest } = p;
    save.mutate(
      { id, body: { ...rest, ...patch } },
      {
        onSuccess: () => toast.success(`${p.name} updated`),
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <Page>
      <PageHeader
        eyebrow="Platform"
        title="Plans"
        description="What schools pay per student and which modules each plan includes."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus /> New plan
          </Button>
        }
      />
      {q.error && !q.data ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </Card>
      ) : !q.data ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-96 rounded-2xl" />
          ))}
        </div>
      ) : q.data.length === 0 ? (
        <Card>
          <EmptyState icon={Boxes} title="No plans yet" description="Create the first plan schools can subscribe to." action={<Button onClick={() => setEditing('new')}><Plus /> New plan</Button>} />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
          {q.data.map((p) => {
            const all = p.features.length === 0;
            const inUse = p.schools > 0 || p.activeSubscriptions > 0;
            return (
              <Card key={p.id} className={cn('flex flex-col', !p.isActive && 'opacity-75')}>
                <div className="flex items-start gap-3 p-5 pb-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-[17px] font-semibold tracking-tight">{p.name}</h2>
                      {!p.isActive && <Badge variant="warning">Retired</Badge>}
                      {p.isActive && !p.isPublic && <Badge variant="outline">Private</Badge>}
                    </div>
                    <p className="font-mono text-[11.5px] text-muted-foreground">{p.code}</p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${p.name}`}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onSelect={() => setEditing(p)}>
                        <Pencil /> Edit plan
                      </DropdownMenuItem>
                      {canDelete && (
                        <DropdownMenuItem disabled={inUse} onSelect={() => setDeleting(p)} className="text-danger focus:text-danger">
                          <Trash2 /> {inUse ? 'In use — can’t delete' : 'Delete plan'}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="px-5">
                  <p className="flex items-baseline gap-1.5">
                    <span className="font-display text-[28px] font-semibold tracking-tight tabular">{naira(p.pricePerStudentKobo)}</span>
                    <span className="text-[13px] text-muted-foreground">per student {BILLING_PERIOD_LABELS[p.billingPeriod]}</span>
                  </p>
                  {p.description && <p className="mt-1.5 text-[13px] text-muted-foreground">{p.description}</p>}
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <Mini label="Schools" value={formatNumber(p.schools)} />
                    <Mini label="AI / month" value={p.aiMonthlyBudgetUsd == null ? 'Default' : usd(p.aiMonthlyBudgetUsd)} />
                    <Mini label="Max students" value={p.maxStudents ? formatNumber(p.maxStudents) : 'No limit'} />
                  </div>
                </div>
                <ul className="mt-4 flex-1 space-y-1.5 border-t border-border px-5 py-4 text-[13px]">
                  {MODULE_FEATURE_KEYS.map((k) => {
                    const on = all || p.features.includes(k);
                    return (
                      <li key={k} className={cn('flex items-center gap-2', !on && 'text-muted-foreground/70')}>
                        {on ? <Check className="size-3.5 shrink-0 text-success" strokeWidth={3} /> : <Minus className="size-3.5 shrink-0" />}
                        {MODULE_FEATURES[k].label}
                      </li>
                    );
                  })}
                </ul>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border bg-muted/30 px-5 py-3 text-[12.5px]">
                  <label className="flex items-center gap-2">
                    <Switch checked={p.isActive} disabled={save.isPending} onCheckedChange={(isActive) => toggle(p, { isActive })} aria-label={`${p.name} active`} /> Active
                  </label>
                  <Tip label="Public plans are offered to new schools">
                    <label className="flex items-center gap-2">
                      <Switch checked={p.isPublic} disabled={save.isPending} onCheckedChange={(isPublic) => toggle(p, { isPublic })} aria-label={`${p.name} public`} /> Public
                    </label>
                  </Tip>
                  <span className="ml-auto text-muted-foreground tabular">{p.activeSubscriptions} {p.activeSubscriptions === 1 ? 'subscription' : 'subscriptions'}</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <PlanDialog plan={editing} onOpenChange={(o) => !o && setEditing(null)} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete the ${deleting?.name} plan?`}
        description="No school uses it, so it can go. This can’t be undone."
        confirmLabel="Delete plan"
        loading={del.isPending}
        onConfirm={() =>
          deleting &&
          del.mutate(deleting.id, {
            onSuccess: () => {
              toast.success(`${deleting.name} deleted`);
              setDeleting(null);
            },
          })
        }
      />
    </Page>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/50 px-2 py-2">
      <p className="truncate text-[13px] font-semibold tabular">{value}</p>
      <p className="truncate text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

const blank = { code: '', name: '', description: '', price: '', period: 'PER_TERM' as BillingPeriodKey, budget: '', maxStudents: '', features: [...MODULE_FEATURE_KEYS] as string[], isActive: true, isPublic: true, sortOrder: '0' };

function PlanDialog({ plan, onOpenChange }: { plan: PlanRow | 'new' | null; onOpenChange: (o: boolean) => void }) {
  const save = useSavePlan();
  const [v, setV] = useState(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const isNew = plan === 'new';
  useEffect(() => {
    if (!plan) return;
    setErrors({});
    if (plan === 'new') return setV(blank);
    setV({
      code: plan.code,
      name: plan.name,
      description: plan.description ?? '',
      price: koboToInput(plan.pricePerStudentKobo),
      period: plan.billingPeriod,
      budget: plan.aiMonthlyBudgetUsd == null ? '' : String(plan.aiMonthlyBudgetUsd),
      maxStudents: plan.maxStudents == null ? '' : String(plan.maxStudents),
      // An empty list means every module: show them all ticked.
      features: plan.features.length ? plan.features : [...MODULE_FEATURE_KEYS],
      isActive: plan.isActive,
      isPublic: plan.isPublic,
      sortOrder: String(plan.sortOrder),
    });
  }, [plan]);

  const submit = (e?: React.BaseSyntheticEvent) => {
    e?.preventDefault();
    const price = parseNaira(v.price);
    const parsed = planSchema.safeParse({
      code: v.code,
      name: v.name,
      description: v.description,
      pricePerStudentKobo: price == null ? NaN : Math.round(price * 100),
      billingPeriod: v.period,
      aiMonthlyBudgetUsd: v.budget.trim() ? Number(v.budget) : null,
      maxStudents: v.maxStudents.trim() ? Number(v.maxStudents) : null,
      features: v.features,
      isActive: v.isActive,
      isPublic: v.isPublic,
      sortOrder: Number(v.sortOrder || 0),
    });
    if (!parsed.success) return setErrors(zodErrors(parsed.error.issues));
    if (parsed.data.features.length === 0) return setErrors({ features: 'Tick at least one module' });
    save.mutate(
      { id: isNew ? undefined : (plan as PlanRow).id, body: parsed.data },
      {
        onSuccess: () => {
          toast.success(isNew ? `${parsed.data.name} plan created` : `${parsed.data.name} plan saved`);
          onOpenChange(false);
        },
        onError: (err) => setErrors(apiFieldErrors(err)),
      },
    );
  };

  const toggleFeature = (k: string, on: boolean) => setV((p) => ({ ...p, features: on ? [...new Set([...p.features, k])] : p.features.filter((f) => f !== k) }));
  const set = (k: 'code' | 'name' | 'description' | 'budget' | 'maxStudents' | 'sortOrder') => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((p) => ({ ...p, [k]: e.target.value }));

  return (
    <FormDialog
      open={!!plan}
      onOpenChange={onOpenChange}
      title={isNew ? 'New plan' : `Edit ${(plan as PlanRow | null)?.name ?? 'plan'}`}
      description={!isNew && plan && (plan as PlanRow).schools > 0 ? `${(plan as PlanRow).schools} schools are on this plan — module changes apply to them straight away.` : undefined}
      icon={<Boxes />}
      submitLabel={isNew ? 'Create plan' : 'Save plan'}
      pending={save.isPending}
      onSubmit={submit}
      size="lg"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="pl-name" error={errors.name}>
          <Input id="pl-name" value={v.name} onChange={set('name')} placeholder="Growth" invalid={!!errors.name} />
        </Field>
        <Field label="Code" htmlFor="pl-code" error={errors.code} hint="Lowercase letters, numbers and dashes">
          <Input id="pl-code" className="font-mono" value={v.code} onChange={set('code')} placeholder="growth" invalid={!!errors.code} />
        </Field>
        <Field label="Description" htmlFor="pl-desc" error={errors.description} optional className="sm:col-span-2">
          <Textarea id="pl-desc" rows={2} value={v.description} onChange={set('description')} maxLength={300} className="min-h-[64px]" />
        </Field>
        <Field label="Price per student" htmlFor="pl-price" error={errors.pricePerStudentKobo}>
          <MoneyInput id="pl-price" currency="NGN" value={v.price} onChange={(price) => setV((p) => ({ ...p, price }))} invalid={!!errors.pricePerStudentKobo} />
        </Field>
        <Field label="Billed" htmlFor="pl-period" error={errors.billingPeriod}>
          <Select value={v.period} onValueChange={(period) => setV((p) => ({ ...p, period: period as BillingPeriodKey }))}>
            <SelectTrigger id="pl-period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BILLING_PERIODS.map((b) => (
                <SelectItem key={b} value={b}>
                  {BILLING_PERIOD_LABELS[b].replace(/^per /, 'Per ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="AI budget per school / month (USD)" htmlFor="pl-ai" error={errors.aiMonthlyBudgetUsd} hint="Blank uses the platform default">
          <Input id="pl-ai" inputMode="decimal" className="tabular" value={v.budget} onChange={set('budget')} invalid={!!errors.aiMonthlyBudgetUsd} />
        </Field>
        <Field label="Max students" htmlFor="pl-max" error={errors.maxStudents} hint="Blank for no limit">
          <Input id="pl-max" inputMode="numeric" className="tabular" value={v.maxStudents} onChange={set('maxStudents')} invalid={!!errors.maxStudents} />
        </Field>
      </div>
      <fieldset className="mt-5">
        <legend className="mb-2 flex w-full items-center justify-between text-[13px] font-semibold">
          Modules included
          <span className="text-[12px] font-normal text-muted-foreground tabular">
            {v.features.length} of {MODULE_FEATURE_KEYS.length}
          </span>
        </legend>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {MODULE_FEATURE_KEYS.map((k) => {
            const on = v.features.includes(k);
            return (
              <label key={k} className={cn('flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition-colors', on ? 'border-brand/40 bg-brand-soft/30' : 'border-border hover:bg-muted/40')}>
                <Checkbox checked={on} onCheckedChange={(c) => toggleFeature(k, c === true)} className="mt-0.5" />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium">{MODULE_FEATURES[k].label}</span>
                  <span className="block text-[11.5px] leading-snug text-muted-foreground">{MODULE_FEATURES[k].description}</span>
                </span>
              </label>
            );
          })}
        </div>
        {errors.features && <p className="mt-2 text-[12px] font-medium text-danger">{errors.features}</p>}
      </fieldset>
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <SwitchRow label="Active" description="Schools can be moved onto it">
          <Switch checked={v.isActive} onCheckedChange={(isActive) => setV((p) => ({ ...p, isActive }))} />
        </SwitchRow>
        <SwitchRow label="Public" description="Offered to new schools">
          <Switch checked={v.isPublic} onCheckedChange={(isPublic) => setV((p) => ({ ...p, isPublic }))} />
        </SwitchRow>
      </div>
      <div className="mt-4">
        <FormError message={errors.form} />
      </div>
    </FormDialog>
  );
}
