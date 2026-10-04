import {
  DISCOUNT_KIND_LABELS,
  DISCOUNT_KINDS,
  DISCOUNT_SCOPE_LABELS,
  DISCOUNT_SCOPES,
  type DiscountKind,
  type DiscountReport,
  type DiscountRules,
  type DiscountScope,
  type ReapplyResult,
  resolveDiscounts,
  ruleCandidates,
  type StudentDiscountRow,
  studentDiscountSchema,
  toKobo,
} from '@aischool/shared';
import { ArrowRight, BadgePercent, Download, GraduationCap, HandCoins, HeartHandshake, Lock, MoreHorizontal, Pause, Pencil, Play, Plus, RefreshCw, Settings2, Trash2, Users } from 'lucide-react';
import { type BaseSyntheticEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { type Column, DataTable } from '@/components/ui/data-table';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { FormDialog, SwitchRow } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { useDebounced } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { TermSelect } from '../planning/pickers';
import { type PickedStudent, StudentPicker } from '../students/student-picker';
import { useFees } from './api';
import {
  downloadDiscountReport,
  useDeleteDiscount,
  useDiscountReport,
  useDiscountRules,
  useDiscounts,
  useReapplyDiscounts,
  useSaveDiscount,
  useSaveDiscountRules,
  useToggleDiscount,
} from './discounts-api';
import { compactMoney, FinanceTermSelect, koboToInput, money, MoneyInput, parseNaira, plural, type TermContext, useCurrency } from './ui';

export const KIND_ICON: Record<DiscountKind, typeof Users> = {
  SIBLING: Users,
  STAFF_CHILD: HeartHandshake,
  SCHOLARSHIP: GraduationCap,
  BURSARY: HandCoins,
  OTHER: BadgePercent,
};

const KIND_TONE: Record<DiscountKind | 'ONE_OFF', string> = {
  SIBLING: 'bg-info-soft text-info',
  STAFF_CHILD: 'bg-brand-soft text-brand',
  SCHOLARSHIP: 'bg-success-soft text-success',
  BURSARY: 'bg-warning-soft text-warning',
  OTHER: 'bg-muted text-muted-foreground',
  ONE_OFF: 'bg-muted text-muted-foreground',
};

/** "50% of tuition" or "₦50,000 a term". */
export function discountValue(d: { percent: number | null; amountKobo: number | null; appliesTo: DiscountScope }, currency: string) {
  return d.percent != null ? `${d.percent}% of ${d.appliesTo === 'ALL' ? 'fees' : 'tuition'}` : `${money(d.amountKobo ?? 0, currency)} a term`;
}

export function discountWindow(d: Pick<StudentDiscountRow, 'fromTerm' | 'untilTerm'>) {
  if (!d.fromTerm && !d.untilTerm) return 'Every term until stopped';
  if (d.fromTerm && d.untilTerm) return d.fromTerm.id === d.untilTerm.id ? `${d.fromTerm.name} only` : `${d.fromTerm.name} → ${d.untilTerm.name}`;
  return d.fromTerm ? `From ${d.fromTerm.name}` : `Until ${d.untilTerm!.name}`;
}

export function KindChip({ kind, label }: { kind: DiscountKind | 'ONE_OFF'; label?: string }) {
  const Icon = kind === 'ONE_OFF' ? BadgePercent : KIND_ICON[kind];
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium', KIND_TONE[kind])}>
      <Icon className="size-3" aria-hidden />
      {label ?? (kind === 'ONE_OFF' ? 'One-off' : DISCOUNT_KIND_LABELS[kind])}
    </span>
  );
}

function PercentInput({ id, value, onChange, invalid, className }: { id?: string; value: string; onChange: (v: string) => void; invalid?: boolean; className?: string }) {
  return (
    <div className={cn('relative', className)}>
      <Input id={id} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, '').slice(0, 5))} className="pr-8 tabular" invalid={invalid} />
      <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        %
      </span>
    </div>
  );
}

function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-8 rounded-md px-3 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value === o.value ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ tab

export function DiscountsTab({ ctx, onTermChange }: { ctx: TermContext; onTermChange: (termId: string | undefined) => void }) {
  const canManage = useCan('finance.manage');
  const [editing, setEditing] = useState<StudentDiscountRow | 'new' | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [reapplyOpen, setReapplyOpen] = useState(false);

  return (
    <div className="space-y-4">
      <RulesCard ctx={ctx} onEdit={canManage ? () => setRulesOpen(true) : undefined} />
      <ReportCard ctx={ctx} onTermChange={onTermChange} onReapply={canManage ? () => setReapplyOpen(true) : undefined} />
      <StandingList onAdd={canManage ? () => setEditing('new') : undefined} onEdit={canManage ? setEditing : undefined} />

      {editing && <DiscountDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} discount={editing === 'new' ? null : editing} ctx={ctx} />}
      {canManage && <RulesDialog open={rulesOpen} onOpenChange={setRulesOpen} ctx={ctx} />}
      {canManage && ctx.termId && <ReapplyDialog open={reapplyOpen} onOpenChange={setReapplyOpen} termId={ctx.termId} termName={ctx.termName} />}
    </div>
  );
}

// ------------------------------------------------------------------ automatic rules

function RulesCard({ ctx, onEdit }: { ctx: TermContext; onEdit?: () => void }) {
  const rules = useDiscountRules();
  const r = rules.data;
  const example = useRuleExample(ctx, r);
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[15px] font-semibold tracking-tight">Automatic discounts</h2>
          <p className="text-[12.5px] text-muted-foreground">Applied by the school’s rules whenever invoices are issued — no need to add them learner by learner.</p>
        </div>
        {onEdit && (
          <Button variant="outline" size="sm" onClick={onEdit} disabled={!r}>
            <Settings2 /> Edit rules
          </Button>
        )}
      </div>
      {rules.error && !r ? (
        <div className="p-4">
          <ErrorState error={rules.error} onRetry={() => void rules.refetch()} />
        </div>
      ) : !r ? (
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-px bg-border sm:grid-cols-3">
          <RuleTile icon={Users} title="Siblings" on={r.sibling.enabled}>
            {r.sibling.enabled ? (
              <>
                2nd child <b className="tabular">{r.sibling.secondChildPct}%</b> · 3rd and later <b className="tabular">{r.sibling.thirdChildPct}%</b> off tuition
              </>
            ) : (
              'Off'
            )}
          </RuleTile>
          <RuleTile icon={HeartHandshake} title="Staff children" on={r.staffChild.enabled}>
            {r.staffChild.enabled ? (
              <>
                <b className="tabular">{r.staffChild.percent}%</b> off {r.staffChild.appliesTo === 'ALL' ? 'all compulsory fees' : 'tuition'}
              </>
            ) : (
              'Off'
            )}
          </RuleTile>
          <RuleTile icon={BadgePercent} title="When several apply" on>
            {r.combine === 'BEST' ? 'Only the largest one' : 'Added together (never more than the fees)'}
          </RuleTile>
        </div>
      )}
      {example && (r?.sibling.enabled || r?.staffChild.enabled) && (
        <p className="border-t border-border bg-muted/30 px-5 py-2.5 text-[12.5px] text-muted-foreground">
          <span className="font-medium text-foreground">For example:</span> {example[0]}
        </p>
      )}
    </Card>
  );
}

function RuleTile({ icon: Icon, title, on, children }: { icon: typeof Users; title: string; on: boolean; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 bg-card px-5 py-4">
      <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', on ? 'bg-brand-soft text-brand' : 'bg-muted text-muted-foreground')}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-medium">{title}</p>
        <p className={cn('text-[12.5px]', on ? 'text-foreground/80' : 'text-muted-foreground')}>{children}</p>
      </div>
    </div>
  );
}

/** The term's school-wide tuition and other compulsory fees, for the live examples. */
function useSampleFees(ctx: TermContext) {
  const fees = useFees(ctx.termId);
  return useMemo(() => {
    const items = (fees.data ?? []).filter((f) => !f.optional);
    // Prefer items for every class; otherwise the first class level that has tuition.
    const general = items.filter((f) => f.classLevelIds.length === 0);
    let chosen = general;
    if (!general.some((f) => f.category === 'TUITION')) {
      const level = items.find((f) => f.category === 'TUITION')?.classLevelIds[0];
      chosen = level ? items.filter((f) => f.classLevelIds.length === 0 || f.classLevelIds.includes(level)) : [];
    }
    if (!chosen.some((f) => f.category === 'TUITION')) return [{ category: 'TUITION', amountKobo: 15_000_000 }, { category: 'LEVY', amountKobo: 3_500_000 }];
    return chosen.map((f) => ({ category: f.category, amountKobo: f.amountKobo }));
  }, [fees.data]);
}

function useRuleExample(ctx: TermContext, rules: DiscountRules | undefined): string[] | null {
  const currency = useCurrency();
  const items = useSampleFees(ctx);
  if (!rules) return null;
  const gross = items.reduce((n, i) => n + i.amountKobo, 0);
  const pays = (who: { siblingPosition: number | null; isStaffChild: boolean }) => {
    const d = resolveDiscounts(items, ruleCandidates(rules, who), rules.combine);
    return gross - d.reduce((n, x) => n + x.amountKobo, 0);
  };
  const out: string[] = [];
  if (rules.sibling.enabled) {
    out.push(`Ada (2nd child) pays ${money(pays({ siblingPosition: 2, isStaffChild: false }), currency)} instead of ${money(gross, currency)}.`);
    out.push(`Chidi (3rd child) pays ${money(pays({ siblingPosition: 3, isStaffChild: false }), currency)}.`);
  }
  if (rules.staffChild.enabled) out.push(`A staff member’s child pays ${money(pays({ siblingPosition: 1, isStaffChild: true }), currency)}.`);
  if (rules.sibling.enabled && rules.staffChild.enabled) {
    out.push(`A staff member’s 2nd child pays ${money(pays({ siblingPosition: 2, isStaffChild: true }), currency)} (${rules.combine === 'BEST' ? 'the larger discount only' : 'both discounts added'}).`);
  }
  return out.length ? out : null;
}

function RulesDialog({ open, onOpenChange, ctx }: { open: boolean; onOpenChange: (o: boolean) => void; ctx: TermContext }) {
  const current = useDiscountRules(open);
  const save = useSaveDiscountRules();
  const [sibOn, setSibOn] = useState(false);
  const [second, setSecond] = useState('10');
  const [third, setThird] = useState('15');
  const [staffOn, setStaffOn] = useState(false);
  const [staffPct, setStaffPct] = useState('50');
  const [staffScope, setStaffScope] = useState<DiscountScope>('TUITION');
  const [combine, setCombine] = useState<DiscountRules['combine']>('BEST');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open || !current.data) return;
    const r = current.data;
    setSibOn(r.sibling.enabled);
    setSecond(String(r.sibling.secondChildPct));
    setThird(String(r.sibling.thirdChildPct));
    setStaffOn(r.staffChild.enabled);
    setStaffPct(String(r.staffChild.percent));
    setStaffScope(r.staffChild.appliesTo);
    setCombine(r.combine);
    setErrors({});
  }, [open, current.data]);

  const clamp = (v: string) => Math.max(0, Math.min(100, Number(v) || 0));
  const draft: DiscountRules = {
    sibling: { enabled: sibOn, secondChildPct: clamp(second), thirdChildPct: clamp(third) },
    staffChild: { enabled: staffOn, percent: clamp(staffPct), appliesTo: staffScope },
    combine,
  };
  const example = useRuleExample(ctx, draft);

  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    const next: Record<string, string> = {};
    for (const [k, v] of [
      ['second', second],
      ['third', third],
      ['staff', staffPct],
    ] as const) {
      const n = Number(v);
      if (v.trim() === '' || Number.isNaN(n) || n < 0 || n > 100) next[k] = '0–100%';
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    save.mutate(draft, {
      onSuccess: () => onOpenChange(false),
      onError: (err) => toast.error(err.message),
    });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Automatic discount rules"
      description="Used for every invoice issued from now on — in bulk, on admission and on promotion. Invoices already issued don’t change until you re-apply."
      icon={<BadgePercent />}
      submitLabel="Save rules"
      pending={save.isPending}
      onSubmit={submit}
      size="lg"
    >
      <div className="grid gap-4">
        <section className="grid gap-3 rounded-xl border border-border p-4">
          <SwitchRow label="Sibling discount" description="Children who share a parent or guardian. The eldest (by date of birth, else admission date) pays in full.">
            <Switch checked={sibOn} onCheckedChange={setSibOn} aria-label="Sibling discount" />
          </SwitchRow>
          {sibOn && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="2nd child" htmlFor="r-2nd" hint="Off tuition" error={errors.second}>
                <PercentInput id="r-2nd" value={second} onChange={setSecond} invalid={!!errors.second} />
              </Field>
              <Field label="3rd child and later" htmlFor="r-3rd" hint="Off tuition" error={errors.third}>
                <PercentInput id="r-3rd" value={third} onChange={setThird} invalid={!!errors.third} />
              </Field>
            </div>
          )}
        </section>
        <section className="grid gap-3 rounded-xl border border-border p-4">
          <SwitchRow label="Staff children" description="Learners whose parent is an active staff member — matched by their login, phone number or email.">
            <Switch checked={staffOn} onCheckedChange={setStaffOn} aria-label="Staff child discount" />
          </SwitchRow>
          {staffOn && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Discount" htmlFor="r-staff" error={errors.staff}>
                <PercentInput id="r-staff" value={staffPct} onChange={setStaffPct} invalid={!!errors.staff} />
              </Field>
              <Field label="Off" htmlFor="r-staff-scope">
                <Select value={staffScope} onValueChange={(v) => setStaffScope(v as DiscountScope)}>
                  <SelectTrigger id="r-staff-scope">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DISCOUNT_SCOPES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {DISCOUNT_SCOPE_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          )}
        </section>
        <Field label="When a learner qualifies for more than one discount" hint="Applies to automatic rules and the discounts you add for individual learners.">
          <Segmented
            label="Combining discounts"
            value={combine}
            onChange={setCombine}
            options={[
              { value: 'BEST', label: 'Only the largest' },
              { value: 'STACK', label: 'Add them together' },
            ]}
          />
        </Field>
        <div className="rounded-xl border border-brand/25 bg-brand-soft/40 p-3.5 text-[13px]">
          <p className="mb-1 font-medium">How it works out</p>
          {example ? (
            <ul className="list-disc space-y-0.5 pl-5 text-foreground/85">
              {example.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">No automatic discounts — learners pay the full fees unless you add a discount for them.</p>
          )}
          <p className="mt-1.5 text-[11.5px] text-muted-foreground">Based on {ctx.termName ? `${ctx.termName}’s` : 'this term’s'} school-wide fees. A manual discount of the same kind replaces the rule.</p>
        </div>
      </div>
    </FormDialog>
  );
}

// ------------------------------------------------------------------ report

function ReportCard({ ctx, onTermChange, onReapply }: { ctx: TermContext; onTermChange: (t: string | undefined) => void; onReapply?: () => void }) {
  const currency = useCurrency();
  const report = useDiscountReport(ctx.termId);
  const [downloading, setDownloading] = useState(false);
  const r = report.data;

  const download = async () => {
    if (!r) return;
    setDownloading(true);
    try {
      await downloadDiscountReport(r.term.id, r.term.name);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Couldn’t download the report');
    } finally {
      setDownloading(false);
    }
  };

  const columns: Column<DiscountReport['rows'][number]>[] = [
    {
      key: 'student',
      header: 'Learner',
      cell: (x) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{x.student.name}</p>
          <p className="text-[11.5px] text-muted-foreground">{x.student.classArm ?? '—'}</p>
        </div>
      ),
    },
    {
      key: 'lines',
      header: 'Discounts',
      cell: (x) => (
        <ul className="space-y-1">
          {x.lines.map((l, i) => (
            <li key={i} className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
              <KindChip kind={l.kind} />
              <span className="text-muted-foreground">{l.description}</span>
            </li>
          ))}
        </ul>
      ),
    },
    { key: 'invoice', header: 'Invoice', cell: (x) => <span className="font-mono text-[12px] text-muted-foreground">{x.invoiceNumber}</span> },
    { key: 'total', header: 'Forgone', headClassName: 'text-right', className: 'text-right tabular font-semibold', cell: (x) => money(x.totalKobo, currency) },
  ];

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border p-3 sm:flex-row sm:items-center">
        <FinanceTermSelect ctx={ctx} onChange={onTermChange} className="sm:max-w-xs" />
        <p className="flex-1 px-1 text-[12.5px] text-muted-foreground">Discounts on this term’s invoices — for the bursar and principal.</p>
        <div className="flex flex-wrap gap-2">
          {onReapply && (
            <Button variant="outline" onClick={onReapply} disabled={!ctx.termId}>
              <RefreshCw /> Re-apply to unpaid invoices
            </Button>
          )}
          <Button variant="outline" onClick={() => void download()} loading={downloading} disabled={!r || !r.rows.length}>
            {!downloading && <Download />} CSV
          </Button>
        </div>
      </div>

      {report.error && !r ? (
        <div className="p-4">
          <ErrorState error={report.error} onRetry={() => void report.refetch()} />
        </div>
      ) : !r ? (
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <div className={cn(report.isPlaceholderData && 'opacity-60')}>
          <div className="grid gap-px bg-border sm:grid-cols-3">
            <Stat label="Fees forgone" value={money(r.totalKobo, currency)} sub={r.grossKobo ? `${((r.totalKobo / r.grossKobo) * 100).toFixed(1)}% of ${compactMoney(r.grossKobo, currency)} billed` : 'Nothing billed yet'} />
            <Stat label="Learners with a discount" value={r.students.toLocaleString()} sub={plural(r.byKind.reduce((n, k) => n + k.count, 0), 'discount line')} />
            <div className="bg-card px-5 py-4">
              <p className="text-[12px] text-muted-foreground">By kind</p>
              {r.byKind.length ? (
                <ul className="mt-1.5 space-y-1">
                  {r.byKind.map((k) => (
                    <li key={k.kind} className="flex items-center justify-between gap-2 text-[12.5px]">
                      <KindChip kind={k.kind} label={`${k.label} · ${k.count}`} />
                      <span className="tabular font-medium">{money(k.totalKobo, currency)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-[13px] text-muted-foreground">None this term</p>
              )}
            </div>
          </div>
          {r.rows.length > 0 && (
            <div className="border-t border-border">
              <DataTable
                columns={columns}
                rows={r.rows}
                rowKey={(x) => x.invoiceId}
                rowLabel={(x) => `Invoice ${x.invoiceNumber} for ${x.student.name}`}
                renderMobile={(x) => (
                  <Link to={`/fees/invoices/${x.invoiceId}`} className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium">{x.student.name}</p>
                      <p className="truncate text-[12px] text-muted-foreground">{x.lines.map((l) => l.description).join(' · ')}</p>
                    </div>
                    <p className="text-[14px] font-semibold tabular">{money(x.totalKobo, currency)}</p>
                  </Link>
                )}
                empty={{ icon: BadgePercent, title: 'No discounts this term' }}
              />
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-card px-5 py-4">
      <p className="text-[12px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-display text-[22px] font-semibold tabular tracking-tight">{value}</p>
      {sub && <p className="text-[11.5px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ------------------------------------------------------------------ standing discounts list

function StandingList({ onAdd, onEdit }: { onAdd?: () => void; onEdit?: (d: StudentDiscountRow) => void }) {
  const currency = useCurrency();
  const [kind, setKind] = useState<DiscountKind | undefined>();
  const [active, setActive] = useState<'true' | 'false' | undefined>('true');
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 300);
  const list = useDiscounts({ kind, active, q: q || undefined });
  const toggle = useToggleDiscount();
  const del = useDeleteDiscount();
  const [deleting, setDeleting] = useState<StudentDiscountRow | null>(null);

  const actions = (d: StudentDiscountRow) =>
    onEdit && (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${d.label}`} onClick={(e) => e.stopPropagation()}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onEdit(d)}>
            <Pencil /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => toggle.mutate(d)}>{d.active ? <><Pause /> Stop</> : <><Play /> Switch back on</>}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setDeleting(d)} className="text-danger focus:text-danger">
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );

  const columns: Column<StudentDiscountRow>[] = [
    {
      key: 'student',
      header: 'Learner',
      cell: (d) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{d.student.name}</p>
          <p className="text-[11.5px] text-muted-foreground">
            <span className="font-mono">{d.student.admissionNumber}</span>
            {d.student.classArm && ` · ${d.student.classArm}`}
          </p>
        </div>
      ),
    },
    {
      key: 'discount',
      header: 'Discount',
      cell: (d) => (
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5">
            <KindChip kind={d.kind} />
            <span className="truncate text-[13px]">{d.label}</span>
          </p>
          {d.note && <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{d.note}</p>}
        </div>
      ),
    },
    { key: 'value', header: 'Value', cell: (d) => <span className="whitespace-nowrap tabular">{discountValue(d, currency)}</span> },
    { key: 'window', header: 'Terms', cell: (d) => <span className="text-[12.5px] text-muted-foreground">{discountWindow(d)}</span> },
    {
      key: 'status',
      header: 'Status',
      cell: (d) => (
        <div>
          {d.active ? (
            <Badge variant="success" dot>
              Active
            </Badge>
          ) : (
            <Badge variant="outline">Stopped</Badge>
          )}
          {d.approvedBy && <p className="mt-0.5 text-[11px] text-muted-foreground">by {d.approvedBy}</p>}
        </div>
      ),
    },
    { key: 'actions', header: <span className="sr-only">Actions</span>, className: 'w-10', cell: (d) => actions(d) },
  ];

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[15px] font-semibold tracking-tight">Learner discounts</h2>
          <p className="text-[12.5px] text-muted-foreground">Scholarships, bursaries and other awards for named learners, applied every term in their window.</p>
        </div>
        {onAdd && (
          <Button onClick={onAdd}>
            <Plus /> Add discount
          </Button>
        )}
      </div>
      <div className="grid gap-3 border-b border-border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)]">
        <Select value={kind ?? NONE} onValueChange={(v) => setKind(v === NONE ? undefined : (v as DiscountKind))}>
          <SelectTrigger aria-label="Kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>All kinds</SelectItem>
            {DISCOUNT_KINDS.map((k) => (
              <SelectItem key={k} value={k}>
                {DISCOUNT_KIND_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={active ?? NONE} onValueChange={(v) => setActive(v === NONE ? undefined : (v as 'true' | 'false'))}>
          <SelectTrigger aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">Active</SelectItem>
            <SelectItem value="false">Stopped</SelectItem>
            <SelectItem value={NONE}>Active and stopped</SelectItem>
          </SelectContent>
        </Select>
        <SearchInput value={search} onChange={setSearch} placeholder="Learner or discount name" label="Search discounts" />
      </div>
      <DataTable
        columns={columns}
        rows={list.data}
        rowKey={(d) => d.id}
        loading={list.isLoading || list.isPlaceholderData}
        error={list.error}
        onRetry={() => void list.refetch()}
        onRowClick={onEdit}
        rowLabel={(d) => `${d.label} for ${d.student.name}`}
        renderMobile={(d) => (
          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium">{d.student.name}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
              <KindChip kind={d.kind} /> {d.label}
            </p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {discountValue(d, currency)} · {discountWindow(d)}
              {!d.active && ' · stopped'}
            </p>
          </div>
        )}
        mobileActions={actions}
        empty={
          kind || q || active === 'false'
            ? { icon: BadgePercent, title: 'No discounts match', description: 'Try a different kind, status or search.' }
            : {
                icon: GraduationCap,
                title: 'No learner discounts yet',
                description: 'Add a scholarship, bursary or staff-child award for a named learner. Siblings are handled by the automatic rule.',
                action: onAdd && (
                  <Button onClick={onAdd}>
                    <Plus /> Add discount
                  </Button>
                ),
              }
        }
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete “${deleting?.label}”?`}
        description="New invoices won’t include it. Invoices already issued keep their discount line — or use “Stop” to keep a record of it."
        confirmLabel="Delete"
        loading={del.isPending}
        onConfirm={() => deleting && del.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
      />
    </Card>
  );
}

// ------------------------------------------------------------------ add / edit

const DEFAULT_LABEL: Record<DiscountKind, string> = {
  SIBLING: 'Sibling discount',
  STAFF_CHILD: 'Staff child discount',
  SCHOLARSHIP: 'Scholarship',
  BURSARY: 'Bursary',
  OTHER: 'Discount',
};

export function DiscountDialog({
  open,
  onOpenChange,
  discount,
  ctx,
  student,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  discount: StudentDiscountRow | null;
  ctx: Pick<TermContext, 'structure'>;
  /** Fixes the learner (e.g. from the student sheet). */
  student?: PickedStudent;
}) {
  const currency = useCurrency();
  const save = useSaveDiscount(discount?.id);
  const [students, setStudents] = useState<PickedStudent[]>([]);
  const [kind, setKind] = useState<DiscountKind>('SCHOLARSHIP');
  const [label, setLabel] = useState('');
  const [mode, setMode] = useState<'PERCENT' | 'AMOUNT'>('PERCENT');
  const [percent, setPercent] = useState('');
  const [amount, setAmount] = useState('');
  const [scope, setScope] = useState<DiscountScope>('TUITION');
  const [from, setFrom] = useState<string | undefined>();
  const [until, setUntil] = useState<string | undefined>();
  const [active, setActive] = useState(true);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    const d = discount;
    setStudents(d ? [{ id: d.student.id, name: d.student.name, admissionNumber: d.student.admissionNumber }] : student ? [student] : []);
    setKind(d?.kind ?? 'SCHOLARSHIP');
    setLabel(d?.label ?? '');
    setMode(d?.amountKobo != null ? 'AMOUNT' : 'PERCENT');
    setPercent(d?.percent != null ? String(d.percent) : '');
    setAmount(d?.amountKobo != null ? koboToInput(d.amountKobo) : '');
    setScope(d?.appliesTo ?? (d?.amountKobo != null ? 'ALL' : 'TUITION'));
    setFrom(d?.fromTerm?.id);
    setUntil(d?.untilTerm?.id);
    setActive(d?.active ?? true);
    setNote(d?.note ?? '');
    setErrors({});
  }, [open, discount, student]);

  const fixed = !!discount || !!student;

  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    const naira = parseNaira(amount);
    const payload = {
      studentId: students[0]?.id ?? '',
      kind,
      label: label.trim() || DEFAULT_LABEL[kind],
      percent: mode === 'PERCENT' ? (percent.trim() === '' ? null : Number(percent)) : null,
      amountKobo: mode === 'AMOUNT' ? (naira == null ? null : toKobo(naira)) : null,
      appliesTo: scope,
      fromTermId: from ?? null,
      untilTermId: until ?? null,
      active,
      note: note.trim() || null,
    };
    const parsed = studentDiscountSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    save.mutate(
      { ...parsed.data, ...(!discount && students.length > 1 ? { studentIds: students.map((s) => s.id) } : {}) },
      {
        onSuccess: () => onOpenChange(false),
        onError: (err) => {
          if (err instanceof ApiError && err.errors.length) setErrors(Object.fromEntries(err.errors.map((x) => [x.path, x.message])));
          else toast.error(err.message);
        },
      },
    );
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={discount ? 'Edit discount' : 'Add a discount'}
      description={discount ? 'Changes apply to invoices issued from now on. Use “Re-apply” on the Discounts tab to update unpaid invoices.' : 'Applied automatically to every invoice issued in its term window.'}
      icon={<BadgePercent />}
      submitLabel={discount ? 'Save changes' : students.length > 1 ? `Add for ${students.length} learners` : 'Add discount'}
      pending={save.isPending}
      onSubmit={submit}
      size="lg"
    >
      <div className="grid gap-4">
        {fixed ? (
          <div className="rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-[13px]">
            <span className="font-medium">{students[0]?.name}</span> <span className="font-mono text-[12px] text-muted-foreground">{students[0]?.admissionNumber}</span>
          </div>
        ) : (
          <Field label="Learners" htmlFor="d-students" error={errors.studentId} hint="Pick one learner, or several to give each the same award.">
            <StudentPicker id="d-students" value={students} onChange={setStudents} />
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
          <Field label="Kind" htmlFor="d-kind">
            <Select
              value={kind}
              onValueChange={(v) => {
                const k = v as DiscountKind;
                if (!label.trim() || label === DEFAULT_LABEL[kind]) setLabel(DEFAULT_LABEL[k]);
                setKind(k);
              }}
            >
              <SelectTrigger id="d-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DISCOUNT_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {DISCOUNT_KIND_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Name on the invoice" htmlFor="d-label" error={errors.label}>
            <Input id="d-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} placeholder={kind === 'SCHOLARSHIP' ? 'e.g. Scholarship — Best JSS3 student' : DEFAULT_LABEL[kind]} invalid={!!errors.label} />
          </Field>
        </div>
        <Field label="Discount" error={errors.percent ?? errors.amountKobo}>
          <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] sm:items-center">
            <Segmented
              label="Percentage or amount"
              value={mode}
              onChange={(m) => {
                setMode(m);
                if (m === 'AMOUNT' && scope === 'TUITION' && !discount) setScope('ALL');
              }}
              options={[
                { value: 'PERCENT', label: '%' },
                { value: 'AMOUNT', label: `${currency === 'NGN' ? '₦' : currency} amount` },
              ]}
            />
            {mode === 'PERCENT' ? (
              <PercentInput id="d-percent" value={percent} onChange={setPercent} invalid={!!errors.percent} />
            ) : (
              <MoneyInput id="d-amount" value={amount} onChange={setAmount} currency={currency} placeholder="per term" invalid={!!errors.amountKobo} />
            )}
            <Select value={scope} onValueChange={(v) => setScope(v as DiscountScope)}>
              <SelectTrigger aria-label="Applies to">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DISCOUNT_SCOPES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {mode === 'PERCENT' ? `of ${s === 'ALL' ? 'all compulsory fees' : 'tuition'}` : `off ${s === 'ALL' ? 'all compulsory fees' : 'tuition'}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Field>
        {ctx.structure ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="From" htmlFor="d-from" error={errors.fromTermId}>
              <TermSelect id="d-from" structure={ctx.structure} value={from} onChange={setFrom} allLabel="Any term (from now)" />
            </Field>
            <Field label="Until" htmlFor="d-until" error={errors.untilTermId} hint={until && from === until ? 'One term only' : undefined}>
              <TermSelect id="d-until" structure={ctx.structure} value={until} onChange={setUntil} allLabel="No end — until stopped" />
            </Field>
          </div>
        ) : (
          <p className="text-[12.5px] text-muted-foreground">Applies every term until stopped.</p>
        )}
        {discount && (
          <SwitchRow label="Active" description="Stopped discounts are kept on record but not added to new invoices.">
            <Switch checked={active} onCheckedChange={setActive} aria-label="Active" />
          </SwitchRow>
        )}
        <Field label="Note" htmlFor="d-note" optional hint="Why it was given — e.g. the award, the sponsor or the board minute.">
          <Textarea id="d-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </Field>
      </div>
    </FormDialog>
  );
}

// ------------------------------------------------------------------ re-apply

function ReapplyDialog({ open, onOpenChange, termId, termName }: { open: boolean; onOpenChange: (o: boolean) => void; termId: string; termName: string | undefined }) {
  const currency = useCurrency();
  const check = useReapplyDiscounts();
  const apply = useReapplyDiscounts();
  const [result, setResult] = useState<ReapplyResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setResult(null);
    check.mutate({ termId, dryRun: true }, { onSuccess: setResult });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, termId]);

  const r = result;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <div className="mb-2 grid size-10 place-items-center rounded-xl bg-brand-soft text-brand [&_svg]:size-5">
            <RefreshCw />
          </div>
          <DialogTitle>Re-apply discounts{termName ? ` · ${termName}` : ''}</DialogTitle>
          <DialogDescription>
            Recalculates the discount lines on this term’s invoices that have no payments yet, using today’s rules and learner discounts. Discounts added by hand to a single invoice are kept.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {check.isPending || !r ? (
            check.error ? (
              <ErrorState error={check.error} onRetry={() => check.mutate({ termId, dryRun: true }, { onSuccess: setResult })} />
            ) : (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            )
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <MiniStat label={r.dryRun ? 'Will change' : 'Changed'} value={r.changed.length} tone="brand" />
                <MiniStat label="Already right" value={r.unchanged} />
                <MiniStat label="Locked" value={r.locked.length} />
              </div>
              {r.changed.length > 0 && (
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {r.changed.slice(0, 50).map((c) => (
                    <li key={c.invoiceId} className="px-3.5 py-2.5 text-[13px]">
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate font-medium">
                          {c.student.name} <span className="font-normal text-muted-foreground">· {c.student.classArm ?? '—'}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5 tabular">
                          <span className="text-muted-foreground line-through">{money(c.beforeKobo, currency)}</span>
                          <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden />
                          <span className="font-semibold">{money(c.afterKobo, currency)}</span>
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                        {c.added.length ? c.added.map((a) => `${a.description} (−${money(a.amountKobo, currency)})`).join(' · ') : 'No discount any more'}
                      </p>
                    </li>
                  ))}
                  {r.changed.length > 50 && <li className="px-3.5 py-2 text-[12px] text-muted-foreground">…and {r.changed.length - 50} more</li>}
                </ul>
              )}
              {r.locked.length > 0 && (
                <div className="rounded-xl border border-border bg-muted/30 p-3.5">
                  <p className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-medium">
                    <Lock className="size-3.5" aria-hidden /> Can’t be changed here
                  </p>
                  <ul className="space-y-0.5 text-[12px] text-muted-foreground">
                    {r.locked.slice(0, 30).map((l) => (
                      <li key={l.invoiceId}>
                        <Link to={`/fees/invoices/${l.invoiceId}`} className="font-medium text-foreground hover:underline">
                          {l.student}
                        </Link>{' '}
                        <span className="font-mono">{l.number}</span> — {l.reason}
                      </li>
                    ))}
                    {r.locked.length > 30 && <li>…and {r.locked.length - 30} more</li>}
                  </ul>
                  <p className="mt-1.5 text-[11.5px] text-muted-foreground">Adjust these by hand on the invoice (add or remove a discount line).</p>
                </div>
              )}
              {!r.changed.length && <p className="text-[13px] text-muted-foreground">Every unpaid invoice already has the right discounts.</p>}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {r && !r.dryRun ? 'Done' : 'Cancel'}
          </Button>
          {r?.dryRun && r.changed.length > 0 && (
            <Button loading={apply.isPending} onClick={() => apply.mutate({ termId, dryRun: false }, { onSuccess: setResult })}>
              Update {plural(r.changed.length, 'invoice')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone?: 'brand' }) {
  return (
    <div className={cn('rounded-xl border p-2.5', tone === 'brand' && value > 0 ? 'border-brand/30 bg-brand-soft/40' : 'border-border')}>
      <p className="font-display text-[20px] font-semibold tabular">{value.toLocaleString()}</p>
      <p className="text-[11.5px] text-muted-foreground">{label}</p>
    </div>
  );
}
