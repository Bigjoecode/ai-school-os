import { type AcademicStructure, FEE_CATEGORIES, FEE_CATEGORY_LABELS, type FeeItemRow, toKobo } from '@aischool/shared';
import { Copy, FileStack, MoreHorizontal, Pencil, Plus, Receipt, Send, Trash2 } from 'lucide-react';
import { type BaseSyntheticEvent, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { FormDialog, SwitchRow } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { ApiError } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { sortedLevels, TermSelect, termOptions } from '../planning/pickers';
import { useCopyFees, useDeleteFee, useFees, useFinanceSettings, useGenerateInvoices, useSaveFee } from './api';
import { addDaysIso, compactMoney, FinanceTermSelect, koboToInput, money, MoneyInput, parseNaira, plural, schoolToday, type TermContext, useCurrency } from './ui';

type Category = FeeItemRow['category'];

interface Props {
  ctx: TermContext;
  onTermChange: (termId: string | undefined) => void;
  issueOpen: boolean;
  onIssueOpenChange: (open: boolean) => void;
}

export function ScheduleTab({ ctx, onTermChange, issueOpen, onIssueOpenChange }: Props) {
  const canManage = useCan('finance.manage');
  const currency = useCurrency();
  const fees = useFees(ctx.termId);
  const [editing, setEditing] = useState<FeeItemRow | 'new' | null>(null);
  const [deleting, setDeleting] = useState<FeeItemRow | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const del = useDeleteFee();

  const levels = sortedLevels(ctx.structure);
  const levelName = (id: string) => levels.find((l) => l.id === id)?.name ?? 'Class';

  const groups = useMemo(() => {
    const items = fees.data ?? [];
    return FEE_CATEGORIES.map((cat) => ({ cat, items: items.filter((f) => f.category === cat) })).filter((g) => g.items.length > 0);
  }, [fees.data]);

  const compulsoryTotal = (fees.data ?? []).filter((f) => !f.optional && f.classLevelIds.length === 0).reduce((n, f) => n + f.amountKobo, 0);

  return (
    <div className="space-y-4">
      <Card className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <FinanceTermSelect ctx={ctx} onChange={onTermChange} className="sm:max-w-xs" />
        <p className="flex-1 px-1 text-[12.5px] text-muted-foreground">
          {fees.data?.length ? (
            <>
              {plural(fees.data.length, 'fee item')} · school-wide compulsory fees <span className="font-medium text-foreground tabular">{money(compulsoryTotal, currency)}</span>
            </>
          ) : (
            'What each class pays this term.'
          )}
        </p>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            {ctx.canPick && (
              <Button variant="outline" onClick={() => setCopyOpen(true)}>
                <Copy /> Copy from term
              </Button>
            )}
            <Button variant="outline" onClick={() => setEditing('new')} disabled={!ctx.termId}>
              <Plus /> Add fee
            </Button>
            <Button onClick={() => onIssueOpenChange(true)} disabled={!fees.data?.length}>
              <Send /> Issue invoices
            </Button>
          </div>
        )}
      </Card>

      {fees.error && !fees.data ? (
        <ErrorState error={fees.error} onRetry={() => void fees.refetch()} />
      ) : !fees.data ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-40 w-full rounded-2xl" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <Card>
          <EmptyState
            icon={FileStack}
            title="No fees set for this term"
            description="Add tuition, levies and other items — or copy last term’s schedule and adjust."
            action={
              canManage && (
                <>
                  <Button onClick={() => setEditing('new')} disabled={!ctx.termId}>
                    <Plus /> Add fee item
                  </Button>
                  {ctx.canPick && (
                    <Button variant="outline" onClick={() => setCopyOpen(true)}>
                      <Copy /> Copy from another term
                    </Button>
                  )}
                </>
              )
            }
          />
        </Card>
      ) : (
        <div className={cn('grid gap-4 lg:grid-cols-2', fees.isPlaceholderData && 'opacity-60')}>
          {groups.map((g) => (
            <Card key={g.cat} className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <p className="font-display text-[14px] font-semibold tracking-tight">{FEE_CATEGORY_LABELS[g.cat]}</p>
                <span className="text-[12px] tabular text-muted-foreground">{money(g.items.reduce((n, f) => n + f.amountKobo, 0), currency)}</span>
              </div>
              <ul className="divide-y divide-border">
                {g.items.map((f) => (
                  <li key={f.id} className="flex items-start gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-medium">
                        {f.name}
                        {f.optional && <Badge variant="outline">Optional</Badge>}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {f.classLevelIds.length === 0 ? (
                          <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand">All classes</span>
                        ) : ctx.structure ? (
                          f.classLevelIds.map((id) => (
                            <span key={id} className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                              {levelName(id)}
                            </span>
                          ))
                        ) : (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{plural(f.classLevelIds.length, 'class level')}</span>
                        )}
                      </div>
                      {f.invoicedCount > 0 && <p className="mt-1.5 text-[11.5px] text-muted-foreground">On {plural(f.invoicedCount, 'invoice')}</p>}
                    </div>
                    <p className="pt-0.5 text-[14px] font-semibold tabular">{money(f.amountKobo, currency)}</p>
                    {canManage && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${f.name}`}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setEditing(f)}>
                            <Pencil /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onSelect={() => setDeleting(f)} className="text-danger focus:text-danger">
                            <Trash2 /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      {editing && ctx.termId && (
        <FeeItemDialog
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
          termId={ctx.termId}
          item={editing === 'new' ? null : editing}
          structure={ctx.structure}
        />
      )}
      {ctx.canPick && ctx.structure && ctx.termId && <CopyFeesDialog open={copyOpen} onOpenChange={setCopyOpen} structure={ctx.structure} toTermId={ctx.termId} />}
      {ctx.termId && (
        <IssueInvoicesDialog open={issueOpen} onOpenChange={onIssueOpenChange} ctx={ctx} fees={fees.data ?? []} />
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete “${deleting?.name}”?`}
        description={
          deleting?.invoicedCount
            ? `It’s already on ${plural(deleting.invoicedCount, 'invoice')}; those invoices keep their lines. New invoices won’t include it.`
            : 'It won’t be added to new invoices.'
        }
        confirmLabel="Delete"
        loading={del.isPending}
        onConfirm={() => deleting && del.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
      />
    </div>
  );
}

// ------------------------------------------------------------------ class-level chips

export function LevelChips({
  structure,
  value,
  onChange,
  allLabel = 'All classes',
}: {
  structure: AcademicStructure | undefined;
  value: string[];
  onChange: (ids: string[]) => void;
  allLabel?: string;
}) {
  const levels = sortedLevels(structure);
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const chip = (active: boolean) =>
    cn(
      'inline-flex h-8 items-center rounded-full border px-3 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      active ? 'border-brand bg-brand-soft text-brand' : 'border-border bg-card text-muted-foreground hover:border-border-strong hover:text-foreground',
    );
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Class levels">
      <button type="button" aria-pressed={value.length === 0} className={chip(value.length === 0)} onClick={() => onChange([])}>
        {allLabel}
      </button>
      {levels.map((l) => (
        <button key={l.id} type="button" aria-pressed={value.includes(l.id)} className={chip(value.includes(l.id))} onClick={() => toggle(l.id)}>
          {l.name}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ fee item dialog

function FeeItemDialog({
  open,
  onOpenChange,
  termId,
  item,
  structure,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  termId: string;
  item: FeeItemRow | null;
  structure: AcademicStructure | undefined;
}) {
  const currency = useCurrency();
  const save = useSaveFee(item?.id);
  const [name, setName] = useState(item?.name ?? '');
  const [category, setCategory] = useState<Category>(item?.category ?? 'TUITION');
  const [amount, setAmount] = useState(item ? koboToInput(item.amountKobo) : '');
  const [levels, setLevels] = useState<string[]>(item?.classLevelIds ?? []);
  const [optional, setOptional] = useState(item?.optional ?? false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    const naira = parseNaira(amount);
    const next: Record<string, string> = {};
    if (name.trim().length < 2) next.name = 'Give it a name, e.g. “Tuition”';
    if (naira == null || naira < 1) next.amountKobo = `At least ${money(100, currency)}`;
    setErrors(next);
    if (Object.keys(next).length || naira == null) return;
    save.mutate(
      { termId, name: name.trim(), category, amountKobo: toKobo(naira), classLevelIds: levels, optional },
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
      title={item ? 'Edit fee item' : 'Add fee item'}
      description={item?.invoicedCount ? `Changes apply to new invoices; the ${plural(item.invoicedCount, 'invoice')} already issued keep their amounts.` : 'Added to invoices you issue for this term.'}
      icon={<Receipt />}
      submitLabel={item ? 'Save changes' : 'Add fee'}
      pending={save.isPending}
      onSubmit={submit}
    >
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Field label="Name" htmlFor="fee-name" error={errors.name}>
            <Input id="fee-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Tuition" invalid={!!errors.name} autoFocus />
          </Field>
          <Field label="Category" htmlFor="fee-cat">
            <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
              <SelectTrigger id="fee-cat">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FEE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {FEE_CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Amount per learner" htmlFor="fee-amount" error={errors.amountKobo}>
          <MoneyInput id="fee-amount" value={amount} onChange={setAmount} currency={currency} placeholder="0" invalid={!!errors.amountKobo} />
        </Field>
        <Field label="Applies to" hint={structure ? 'Pick class levels, or leave on “All classes”.' : 'You need access to Academic Setup to pick class levels.'}>
          {structure ? <LevelChips structure={structure} value={levels} onChange={setLevels} /> : <p className="text-[13px] text-muted-foreground">{levels.length ? plural(levels.length, 'class level') : 'All classes'}</p>}
        </Field>
        <SwitchRow label="Optional" description="Not added automatically — e.g. bus or boarding. Add it to an invoice by hand.">
          <Switch checked={optional} onCheckedChange={setOptional} aria-label="Optional fee" />
        </SwitchRow>
      </div>
    </FormDialog>
  );
}

// ------------------------------------------------------------------ copy

function CopyFeesDialog({ open, onOpenChange, structure, toTermId }: { open: boolean; onOpenChange: (open: boolean) => void; structure: AcademicStructure; toTermId: string }) {
  const copy = useCopyFees();
  const others = termOptions(structure).filter((t) => t.id !== toTermId);
  const [from, setFrom] = useState<string | undefined>(others[0]?.id);
  const to = termOptions(structure).find((t) => t.id === toTermId);
  useEffect(() => {
    if (open) setFrom(others[0]?.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, toTermId]);
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Copy fees from another term"
      description={`Every item is added to ${to?.label ?? 'this term'} — you can adjust amounts afterwards.`}
      icon={<Copy />}
      submitLabel="Copy fees"
      pending={copy.isPending}
      onSubmit={(e) => {
        e?.preventDefault();
        if (!from) return;
        copy.mutate({ fromTermId: from, toTermId }, { onSuccess: () => onOpenChange(false) });
      }}
    >
      <Field label="Copy from" htmlFor="copy-from">
        <TermSelect id="copy-from" structure={{ ...structure, sessions: structure.sessions.map((s) => ({ ...s, terms: s.terms.filter((t) => t.id !== toTermId) })) }} value={from} onChange={setFrom} />
      </Field>
    </FormDialog>
  );
}

// ------------------------------------------------------------------ issue invoices

function IssueInvoicesDialog({ open, onOpenChange, ctx, fees }: { open: boolean; onOpenChange: (open: boolean) => void; ctx: TermContext; fees: FeeItemRow[] }) {
  const currency = useCurrency();
  const settings = useFinanceSettings();
  const generate = useGenerateInvoices();
  const [termId, setTermId] = useState(ctx.termId);
  const [levels, setLevels] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState('');
  const [sibling, setSibling] = useState('10');

  useEffect(() => {
    if (!open) return;
    setTermId(ctx.termId);
    setLevels([]);
    setDueDate(addDaysIso(schoolToday(), settings.data?.defaultDueDays ?? 21));
    setSibling('10');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ctx.termId, settings.data?.defaultDueDays]);

  const termFees = termId === ctx.termId ? fees : null;
  const preview = useMemo(() => {
    const all = sortedLevels(ctx.structure);
    if (!all.length) return null;
    const chosen = levels.length ? all.filter((l) => levels.includes(l.id)) : all;
    let learners = 0;
    let gross = 0;
    for (const l of chosen) {
      const n = l.arms.reduce((s, a) => s + a.studentCount, 0);
      learners += n;
      if (termFees) {
        const perHead = termFees.filter((f) => !f.optional && (f.classLevelIds.length === 0 || f.classLevelIds.includes(l.id))).reduce((s, f) => s + f.amountKobo, 0);
        gross += perHead * n;
      }
    }
    return { learners, gross };
  }, [ctx.structure, levels, termFees]);

  const pct = Math.max(0, Math.min(100, Number(sibling) || 0));

  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    if (!termId) return;
    generate.mutate(
      { termId, classLevelIds: levels, dueDate: dueDate || undefined, siblingDiscountPct: pct },
      {
        onSuccess: (r) => {
          onOpenChange(false);
          const extra = r.noFees ? ` · ${plural(r.noFees, 'learner')} had no fees` : '';
          if (r.created === 0) toast.info(`No new invoices — ${plural(r.skipped, 'learner')} already invoiced${extra}`);
          else toast.success(`Issued ${plural(r.created, 'invoice')} worth ${compactMoney(r.totalKobo, currency)} (${r.skipped} skipped)${extra}`);
        },
      },
    );
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Issue invoices"
      description="One invoice per learner, built from the fee schedule. Learners who already have an invoice this term are skipped."
      icon={<Send />}
      submitLabel="Issue invoices"
      pending={generate.isPending}
      onSubmit={submit}
      size="lg"
    >
      <div className="grid gap-5">
        <Field label="Term" htmlFor="gen-term">
          {ctx.canPick && ctx.structure ? <TermSelect id="gen-term" structure={ctx.structure} value={termId} onChange={setTermId} /> : <FinanceTermSelect ctx={ctx} onChange={() => undefined} />}
        </Field>
        {ctx.structure ? (
          <Field label="Classes" hint="Leave on “Whole school”, or choose class levels.">
            <LevelChips structure={ctx.structure} value={levels} onChange={setLevels} allLabel="Whole school" />
          </Field>
        ) : (
          <p className="rounded-xl border border-border bg-muted/30 p-3 text-[12.5px] text-muted-foreground">Invoices will be issued for the whole school.</p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Due date" htmlFor="gen-due" hint={settings.data ? `Default: ${settings.data.defaultDueDays} days from today` : undefined}>
            <Input id="gen-due" type="date" value={dueDate} min={schoolToday()} onChange={(e) => setDueDate(e.target.value)} className="tabular [color-scheme:light] dark:[color-scheme:dark]" />
          </Field>
          <Field label="Sibling discount" htmlFor="gen-sib" hint="Off every child after the eldest in a family">
            <div className="relative">
              <Input id="gen-sib" inputMode="decimal" value={sibling} onChange={(e) => setSibling(e.target.value.replace(/[^\d.]/g, '').slice(0, 5))} className="pr-8 tabular" />
              <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                %
              </span>
            </div>
          </Field>
        </div>
        <div className="flex items-start gap-3 rounded-xl border border-brand/25 bg-brand-soft/40 p-3.5">
          <FileStack className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
          <p className="text-[13px]">
            {preview ? (
              <>
                <span className="font-semibold tabular">~{preview.learners.toLocaleString()}</span> learners · compulsory items only
                {termFees && preview.gross > 0 && (
                  <>
                    {' '}
                    · ≈ <span className="font-semibold tabular">{compactMoney(preview.gross, currency)}</span> before discounts
                  </>
                )}
              </>
            ) : (
              'Compulsory items only — optional fees are added to individual invoices.'
            )}
          </p>
        </div>
      </div>
    </FormDialog>
  );
}
