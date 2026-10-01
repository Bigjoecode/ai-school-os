import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, type ExpenseRow, toKobo } from '@aischool/shared';
import { ChevronLeft, ChevronRight, MoreHorizontal, Pencil, PieChart, Plus, Receipt, Trash2, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { type BaseSyntheticEvent, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { type Column, DataTable } from '@/components/ui/data-table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Field } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ApiError } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { StatTile } from '../attendance/ui';
import { useDeleteExpense, useExpenses, useSaveExpense } from './api';
import { categoryColor, ShareBar } from './charts';
import { koboToInput, money, MoneyInput, monthBounds, monthLabel, parseNaira, plural, schoolToday, shiftMonth, useCurrency } from './ui';

type Category = ExpenseRow['category'];

export default function ExpensesPage() {
  const currency = useCurrency();
  const canManage = useCan('finance.manage');
  const [params, setParams] = useSearchParams();
  const thisMonth = schoolToday().slice(0, 7);
  const rawMonth = params.get('month');
  const month = rawMonth && /^\d{4}-\d{2}$/.test(rawMonth) ? rawMonth : thisMonth;
  const rawCat = params.get('category') as Category | null;
  const category = rawCat && EXPENSE_CATEGORIES.includes(rawCat) ? rawCat : undefined;

  const [editing, setEditing] = useState<ExpenseRow | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ExpenseRow | null>(null);
  const del = useDeleteExpense();

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

  useEffect(() => {
    if (params.get('new') === '1') {
      if (canManage) setEditing('new');
      patch({ new: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const list = useExpenses({ ...monthBounds(month), category });
  const prev = useExpenses({ ...monthBounds(shiftMonth(month, -1)), category });
  const rows = list.data;
  const total = (rows ?? []).reduce((n, e) => n + e.amountKobo, 0);
  const prevTotal = (prev.data ?? []).reduce((n, e) => n + e.amountKobo, 0);
  const change = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : null;

  const byCategory = useMemo(() => {
    const m = new Map<Category, number>();
    for (const e of rows ?? []) m.set(e.category, (m.get(e.category) ?? 0) + e.amountKobo);
    return [...m].map(([cat, amount]) => ({ cat, amount })).sort((a, b) => b.amount - a.amount);
  }, [rows]);

  const columns: Column<ExpenseRow>[] = [
    { key: 'date', header: 'Date', cell: (e) => <span className="whitespace-nowrap text-[12.5px] tabular text-muted-foreground">{formatDate(e.spentOn)}</span> },
    {
      key: 'desc',
      header: 'Description',
      cell: (e) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{e.description}</p>
          {e.paidTo && <p className="truncate text-[11.5px] text-muted-foreground">to {e.paidTo}</p>}
        </div>
      ),
    },
    {
      key: 'cat',
      header: 'Category',
      cell: (e) => (
        <span className="inline-flex items-center gap-1.5 text-[12.5px]">
          <span className="size-2 rounded-full" style={{ background: categoryColor(e.category) }} aria-hidden />
          {EXPENSE_CATEGORY_LABELS[e.category]}
        </span>
      ),
    },
    { key: 'method', header: 'Paid via', cell: (e) => <span className="text-[12.5px] text-muted-foreground">{[e.method, e.reference].filter(Boolean).join(' · ') || '—'}</span> },
    { key: 'by', header: 'Recorded by', cell: (e) => <span className="text-[12.5px] text-muted-foreground">{e.recordedBy ?? '—'}</span> },
    { key: 'amount', header: 'Amount', headClassName: 'text-right', className: 'text-right font-semibold tabular', cell: (e) => money(e.amountKobo, currency) },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: <span className="sr-only">Actions</span>,
            className: 'w-10',
            cell: (e: ExpenseRow) => <RowMenu onEdit={() => setEditing(e)} onDelete={() => setDeleting(e)} label={e.description} />,
          },
        ]
      : []),
  ];

  return (
    <Page>
      <PageHeader
        title="Expenses"
        description="What the school spends, by category — so income and expenditure always add up."
        actions={
          canManage && (
            <Button onClick={() => setEditing('new')}>
              <Plus /> Record expense
            </Button>
          )
        }
      />

      <Card className="mb-5 flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <div className="flex h-10 items-center rounded-lg border border-input bg-card shadow-xs">
          <Button variant="ghost" size="icon-sm" className="h-full rounded-r-none" aria-label="Previous month" onClick={() => patch({ month: shiftMonth(month, -1) })}>
            <ChevronLeft />
          </Button>
          <span className="min-w-[150px] border-x border-border px-3 text-center text-[13px] font-medium" aria-live="polite">
            {monthLabel(month, true)}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-full rounded-l-none"
            aria-label="Next month"
            disabled={month >= thisMonth}
            onClick={() => {
              const next = shiftMonth(month, 1);
              patch({ month: next === thisMonth ? undefined : next });
            }}
          >
            <ChevronRight />
          </Button>
        </div>
        <Select value={category ?? NONE} onValueChange={(v) => patch({ category: v === NONE ? undefined : v })}>
          <SelectTrigger aria-label="Category" className="sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>All categories</SelectItem>
            {EXPENSE_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {EXPENSE_CATEGORY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {month !== thisMonth && (
          <Button variant="ghost" size="sm" onClick={() => patch({ month: undefined })}>
            Back to this month
          </Button>
        )}
      </Card>

      <div className="mb-5 grid gap-4 md:grid-cols-3">
        <StatTile
          label={month === thisMonth ? 'Spent this month' : `Spent in ${monthLabel(month)}`}
          icon={<Wallet />}
          value={money(total, currency)}
          loading={!rows}
          sub={
            change == null ? (
              `${plural(rows?.length ?? 0, 'expense')}`
            ) : (
              <span className="flex items-center gap-2">
                <span className={cn('inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11.5px] font-semibold tabular', change > 0 ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success')}>
                  {change > 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                  {change > 0 ? '+' : ''}
                  {change.toFixed(0)}%
                </span>
                vs {monthLabel(shiftMonth(month, -1))}
              </span>
            )
          }
        />
        <StatTile label={`${monthLabel(shiftMonth(month, -1), true)}`} icon={<Receipt />} value={money(prevTotal, currency)} loading={!prev.data} sub={`${plural(prev.data?.length ?? 0, 'expense')}`} />
        <StatTile
          label="Biggest category"
          icon={<PieChart />}
          value={byCategory[0] ? EXPENSE_CATEGORY_LABELS[byCategory[0].cat] : '—'}
          loading={!rows}
          sub={byCategory[0] ? `${money(byCategory[0].amount, currency)} · ${Math.round((byCategory[0].amount / Math.max(1, total)) * 100)}% of spending` : 'Nothing recorded'}
        />
      </div>

      {byCategory.length > 0 && (
        <Card className="mb-5">
          <CardHeader>
            <div>
              <CardTitle>By category</CardTitle>
              <CardDescription>{monthLabel(month, true)}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <ShareBar parts={byCategory.map((c) => ({ key: c.cat, value: c.amount, color: categoryColor(c.cat) }))} label="Spending by category" />
            <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {byCategory.map((c) => (
                <li key={c.cat} className="flex items-center gap-2 text-[12.5px]">
                  <span className="size-2 rounded-full" style={{ background: categoryColor(c.cat) }} aria-hidden />
                  <button type="button" className="text-muted-foreground hover:text-foreground hover:underline" onClick={() => patch({ category: c.cat })}>
                    {EXPENSE_CATEGORY_LABELS[c.cat]}
                  </button>
                  <span className="ml-auto font-medium tabular">{money(c.amount, currency)}</span>
                  <span className="w-9 text-right text-[11.5px] tabular text-muted-foreground">{Math.round((c.amount / Math.max(1, total)) * 100)}%</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card className="overflow-hidden">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(e) => e.id}
          loading={list.isLoading || list.isPlaceholderData}
          error={list.error}
          onRetry={() => void list.refetch()}
          renderMobile={(e) => (
            <div className="flex items-start gap-3">
              <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: categoryColor(e.category) }} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium">{e.description}</p>
                <p className="text-[12px] text-muted-foreground">
                  {formatDate(e.spentOn)} · {EXPENSE_CATEGORY_LABELS[e.category]}
                  {e.paidTo && ` · ${e.paidTo}`}
                </p>
              </div>
              <p className="text-[14px] font-semibold tabular">{money(e.amountKobo, currency)}</p>
              {canManage && <RowMenu onEdit={() => setEditing(e)} onDelete={() => setDeleting(e)} label={e.description} />}
            </div>
          )}
          empty={{
            icon: Wallet,
            title: category ? `No ${EXPENSE_CATEGORY_LABELS[category].toLowerCase()} expenses` : `Nothing spent in ${monthLabel(month, true)}`,
            description: 'Record salaries, diesel, repairs and supplies to see where money goes.',
            action: canManage ? (
              <Button variant="outline" onClick={() => setEditing('new')}>
                <Plus /> Record expense
              </Button>
            ) : undefined,
          }}
        />
        {rows && rows.length > 0 && (
          <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-3 sm:px-5">
            <p className="text-[12.5px] text-muted-foreground">{plural(rows.length, 'expense')}</p>
            <p className="font-display text-[17px] font-semibold tabular">{money(total, currency)}</p>
          </div>
        )}
      </Card>

      {editing && <ExpenseDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} expense={editing === 'new' ? null : editing} defaultCategory={category} />}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this expense?"
        description={deleting ? `${deleting.description} · ${money(deleting.amountKobo, currency)}` : undefined}
        confirmLabel="Delete"
        loading={del.isPending}
        onConfirm={() => deleting && del.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
      />
    </Page>
  );
}

function RowMenu({ onEdit, onDelete, label }: { onEdit: () => void; onDelete: () => void; label: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${label}`} onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil /> Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onDelete} className="text-danger focus:text-danger">
          <Trash2 /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ExpenseDialog({ open, onOpenChange, expense, defaultCategory }: { open: boolean; onOpenChange: (o: boolean) => void; expense: ExpenseRow | null; defaultCategory?: Category }) {
  const currency = useCurrency();
  const save = useSaveExpense(expense?.id);
  const [category, setCategory] = useState<Category>(expense?.category ?? defaultCategory ?? 'SUPPLIES');
  const [description, setDescription] = useState(expense?.description ?? '');
  const [amount, setAmount] = useState(expense ? koboToInput(expense.amountKobo) : '');
  const [spentOn, setSpentOn] = useState(expense?.spentOn ?? schoolToday());
  const [paidTo, setPaidTo] = useState(expense?.paidTo ?? '');
  const [method, setMethod] = useState(expense?.method ?? '');
  const [reference, setReference] = useState(expense?.reference ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    const naira = parseNaira(amount);
    const next: Record<string, string> = {};
    if (description.trim().length < 2) next.description = 'What was it for?';
    if (naira == null || naira < 1) next.amountKobo = `At least ${money(100, currency)}`;
    if (!spentOn) next.spentOn = 'Pick a date';
    setErrors(next);
    if (Object.keys(next).length || naira == null) return;
    save.mutate(
      {
        category,
        description: description.trim(),
        amountKobo: toKobo(naira),
        spentOn,
        paidTo: paidTo.trim() || undefined,
        method: method.trim() || undefined,
        reference: reference.trim() || undefined,
      },
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
      title={expense ? 'Edit expense' : 'Record an expense'}
      description="Counts towards income & expenditure in Accounting."
      icon={<Wallet />}
      submitLabel={expense ? 'Save changes' : 'Record expense'}
      pending={save.isPending}
      onSubmit={submit}
    >
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount" htmlFor="ex-amount" error={errors.amountKobo}>
            <MoneyInput id="ex-amount" value={amount} onChange={setAmount} currency={currency} placeholder="0" invalid={!!errors.amountKobo} autoFocus />
          </Field>
          <Field label="Date" htmlFor="ex-date" error={errors.spentOn}>
            <Input id="ex-date" type="date" value={spentOn} max={schoolToday()} onChange={(e) => setSpentOn(e.target.value)} className="tabular [color-scheme:light] dark:[color-scheme:dark]" invalid={!!errors.spentOn} />
          </Field>
        </div>
        <Field label="Category" htmlFor="ex-cat">
          <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
            <SelectTrigger id="ex-cat">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPENSE_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {EXPENSE_CATEGORY_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Description" htmlFor="ex-desc" error={errors.description}>
          <Input id="ex-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder="e.g. Diesel for generator — 200 litres" invalid={!!errors.description} />
        </Field>
        <Field label="Paid to" htmlFor="ex-to" optional>
          <Input id="ex-to" value={paidTo} onChange={(e) => setPaidTo(e.target.value)} maxLength={120} placeholder="Vendor or person" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Paid via" htmlFor="ex-method" optional>
            <Input id="ex-method" value={method} onChange={(e) => setMethod(e.target.value)} maxLength={40} placeholder="Cash, transfer…" list="expense-methods" />
            <datalist id="expense-methods">
              {['Cash', 'Bank transfer', 'POS', 'Cheque'].map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </Field>
          <Field label="Reference" htmlFor="ex-ref" optional>
            <Input id="ex-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} />
          </Field>
        </div>
      </div>
    </FormDialog>
  );
}
