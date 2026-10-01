import {
  ASSET_CONDITIONS,
  type AssetCondition,
  INVENTORY_CATEGORIES,
  INVENTORY_CATEGORY_LABELS,
  type InventoryCategory,
  type InventoryItemRow,
  inventoryItemSchema,
  type StockMovementKind,
  type StockMovementRow,
} from '@aischool/shared';
import { ArrowDownLeft, ArrowUpRight, ClipboardCheck, History, PackageMinus, PackagePlus, Pencil, Receipt, Scale, Trash2 } from 'lucide-react';
import { type BaseSyntheticEvent, type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field } from '@/components/ui/field';
import { FormDialog, SwitchRow } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useCan } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { koboToInput, money, MoneyInput, parseNaira, schoolDate, schoolToday } from '../finance/ui';
import { useDeleteItem, useMovements, useMoveStock, useSaveItem } from './api';
import { apiFieldErrors, ConditionBadge, CONDITION_LABEL, dateInput, FormError, zodErrors } from './ui';

// ------------------------------------------------------------------ add / edit item

const emptyItem = {
  name: '',
  category: 'STATIONERY' as InventoryCategory,
  unit: 'pcs',
  sku: '',
  location: '',
  reorderLevel: '0',
  unitCost: '',
  isAsset: false,
  condition: 'GOOD' as AssetCondition,
  opening: '',
};

export function ItemFormSheet({ open, onOpenChange, item, currency }: { open: boolean; onOpenChange: (o: boolean) => void; item: InventoryItemRow | null; currency: string }) {
  const save = useSaveItem(item?.id);
  const [v, setV] = useState(emptyItem);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setV(
      item
        ? {
            name: item.name,
            category: item.category,
            unit: item.unit,
            sku: item.sku ?? '',
            location: item.location ?? '',
            reorderLevel: String(item.reorderLevel),
            unitCost: item.unitCostKobo ? koboToInput(item.unitCostKobo) : '',
            isAsset: item.isAsset,
            condition: item.condition ?? 'GOOD',
            opening: '',
          }
        : emptyItem,
    );
  }, [open, item]);
  const set = (p: Partial<typeof v>) => setV((s) => ({ ...s, ...p }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = inventoryItemSchema.safeParse({
      name: v.name,
      category: v.category,
      unit: v.unit,
      sku: v.sku,
      location: v.location,
      reorderLevel: Number(v.reorderLevel || 0),
      unitCostKobo: Math.round((parseNaira(v.unitCost) ?? 0) * 100),
      isAsset: v.isAsset,
      condition: v.isAsset ? v.condition : null,
      ...(item ? {} : { openingQuantity: Number(v.opening || 0) }),
    });
    if (!parsed.success) {
      const errs = zodErrors(parsed.error.issues);
      if (errs.name) errs.name = 'Give the item a name';
      if (errs.unit) errs.unit = 'e.g. pcs, reams, litres';
      setErrors(errs);
      return;
    }
    setErrors({});
    save.mutate(parsed.data, { onSuccess: () => onOpenChange(false), onError: (err) => setErrors(apiFieldErrors(err)) });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="font-display text-lg font-semibold tracking-tight">{item ? `Edit ${item.name}` : 'Add an item'}</SheetTitle>
          <SheetDescription className="text-[13px] text-muted-foreground">
            {item ? 'Stock levels change through Receive, Issue and Count — not here.' : 'Consumables are counted in and out; equipment and furniture can be tracked as assets.'}
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <form id="item-form" onSubmit={submit} noValidate className="grid gap-4">
            <Field label="Name" htmlFor="it-name" error={errors.name}>
              <Input id="it-name" value={v.name} onChange={(e) => set({ name: e.target.value })} maxLength={120} invalid={!!errors.name} placeholder="e.g. A4 paper (80gsm)" autoFocus />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
              <Field label="Category" htmlFor="it-cat">
                <Select value={v.category} onValueChange={(c) => set({ category: c as InventoryCategory })}>
                  <SelectTrigger id="it-cat">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INVENTORY_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {INVENTORY_CATEGORY_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Unit" htmlFor="it-unit" error={errors.unit}>
                <Input id="it-unit" value={v.unit} onChange={(e) => set({ unit: e.target.value })} maxLength={20} invalid={!!errors.unit} />
              </Field>
              <Field label="Unit cost" htmlFor="it-cost" error={errors.unitCostKobo} hint="Used to value stock">
                <MoneyInput id="it-cost" value={v.unitCost} onChange={(unitCost) => set({ unitCost })} currency={currency} />
              </Field>
              <Field label="Reorder at" htmlFor="it-reorder" error={errors.reorderLevel} hint="Flag as low at or below this">
                <Input id="it-reorder" inputMode="numeric" value={v.reorderLevel} onChange={(e) => set({ reorderLevel: e.target.value.replace(/\D/g, '').slice(0, 7) })} className="tabular" disabled={v.isAsset} />
              </Field>
              <Field label="Location" htmlFor="it-loc" optional>
                <Input id="it-loc" value={v.location} onChange={(e) => set({ location: e.target.value })} maxLength={80} placeholder="e.g. Main store, shelf B" />
              </Field>
              <Field label="SKU / code" htmlFor="it-sku" optional>
                <Input id="it-sku" value={v.sku} onChange={(e) => set({ sku: e.target.value })} maxLength={40} className="font-mono" />
              </Field>
              {!item && (
                <Field label="Opening stock" htmlFor="it-open" optional hint="What’s on hand today">
                  <Input id="it-open" inputMode="numeric" value={v.opening} onChange={(e) => set({ opening: e.target.value.replace(/\D/g, '').slice(0, 7) })} className="tabular" />
                </Field>
              )}
            </div>
            <SwitchRow label="Track as an asset" description="For equipment and furniture — records its condition instead of a reorder level.">
              <Switch checked={v.isAsset} onCheckedChange={(isAsset) => set({ isAsset })} aria-label="Track as an asset" />
            </SwitchRow>
            {v.isAsset && (
              <Field label="Condition" htmlFor="it-cond">
                <Select value={v.condition} onValueChange={(c) => set({ condition: c as AssetCondition })}>
                  <SelectTrigger id="it-cond" className="sm:w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSET_CONDITIONS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CONDITION_LABEL[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
            <FormError message={errors.form} />
          </form>
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="item-form" loading={save.isPending}>
            {item ? 'Save changes' : 'Add item'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ------------------------------------------------------------------ receive / issue / count

const MOVE_COPY: Record<StockMovementKind, { title: string; submit: string; icon: ReactNode }> = {
  IN: { title: 'Receive stock', submit: 'Receive', icon: <PackagePlus /> },
  OUT: { title: 'Issue stock', submit: 'Issue', icon: <PackageMinus /> },
  ADJUST: { title: 'Count stock', submit: 'Save count', icon: <Scale /> },
};

export function MoveStockDialog({ item, kind, onOpenChange, currency }: { item: InventoryItemRow | null; kind: StockMovementKind; onOpenChange: (o: boolean) => void; currency: string }) {
  const move = useMoveStock(item?.id ?? '');
  const today = schoolToday();
  const [qty, setQty] = useState('');
  const [cost, setCost] = useState('');
  const [supplier, setSupplier] = useState('');
  const [issuedTo, setIssuedTo] = useState('');
  const [reason, setReason] = useState('');
  const [movedOn, setMovedOn] = useState(today);
  const [expense, setExpense] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!item) return;
    setQty(kind === 'ADJUST' ? String(item.quantity) : '');
    setCost(item.unitCostKobo ? koboToInput(item.unitCostKobo) : '');
    setSupplier('');
    setIssuedTo('');
    setReason('');
    setMovedOn(schoolToday());
    setExpense(false);
    setErrors({});
  }, [item, kind]);

  if (!item) return null;
  const n = qty === '' ? NaN : Number(qty);
  const costKobo = Math.round((parseNaira(cost) ?? 0) * 100);
  const diff = kind === 'ADJUST' && !Number.isNaN(n) ? n - item.quantity : 0;
  const copy = MOVE_COPY[kind];

  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    const next: Record<string, string> = {};
    if (Number.isNaN(n) || (kind !== 'ADJUST' && n <= 0)) next.quantity = kind === 'ADJUST' ? 'Enter the quantity you counted' : 'Enter a quantity';
    else if (kind === 'OUT' && n > item.quantity) next.quantity = `Only ${item.quantity} ${item.unit} in stock`;
    else if (kind === 'ADJUST' && diff === 0) next.quantity = `That matches the ${item.quantity} ${item.unit} already recorded`;
    if (kind === 'IN' && expense && costKobo <= 0) next.unitCostKobo = 'Enter the unit cost to record it as an expense';
    if (!movedOn || movedOn > today) next.movedOn = 'Use today or an earlier date';
    setErrors(next);
    if (Object.keys(next).length) return;
    move.mutate(
      {
        kind,
        quantity: n,
        ...(kind === 'IN' && costKobo > 0 ? { unitCostKobo: costKobo } : {}),
        reason: reason.trim() || null,
        issuedTo: kind === 'OUT' ? issuedTo.trim() || null : null,
        supplier: kind === 'IN' ? supplier.trim() || null : null,
        movedOn,
        recordExpense: kind === 'IN' && expense,
      },
      { onSuccess: () => onOpenChange(false), onError: (err) => setErrors(apiFieldErrors(err)) },
    );
  };

  return (
    <FormDialog
      open={!!item}
      onOpenChange={onOpenChange}
      title={`${copy.title} · ${item.name}`}
      description={`${item.quantity.toLocaleString()} ${item.unit} on hand now`}
      icon={copy.icon}
      submitLabel={copy.submit}
      pending={move.isPending}
      onSubmit={submit}
      size="sm"
    >
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
          <Field label={kind === 'ADJUST' ? 'Counted on hand' : `Quantity (${item.unit})`} htmlFor="mv-qty" error={errors.quantity}>
            <Input id="mv-qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, '').slice(0, 7))} className="tabular" invalid={!!errors.quantity} autoFocus />
          </Field>
          <Field label="Date" htmlFor="mv-date" error={errors.movedOn}>
            <Input id="mv-date" type="date" value={movedOn} max={today} onChange={(e) => setMovedOn(e.target.value)} className={dateInput} invalid={!!errors.movedOn} />
          </Field>
        </div>

        {kind === 'ADJUST' && !Number.isNaN(n) && (
          <div
            aria-live="polite"
            className={cn(
              'flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-[13px]',
              diff === 0 ? 'border-border bg-muted/30 text-muted-foreground' : diff < 0 ? 'border-danger/30 bg-danger-soft/40' : 'border-success/30 bg-success-soft/40',
            )}
          >
            <span>
              Recorded {item.quantity.toLocaleString()} → counted {n.toLocaleString()}
            </span>
            <span className={cn('font-display text-[16px] font-semibold tabular', diff < 0 ? 'text-danger' : diff > 0 ? 'text-success' : '')}>
              {diff === 0 ? 'No change' : `${diff > 0 ? '+' : '−'}${Math.abs(diff).toLocaleString()} ${item.unit}`}
            </span>
          </div>
        )}

        {kind === 'IN' && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
              <Field label="Unit cost" htmlFor="mv-cost" error={errors.unitCostKobo} hint={!errors.unitCostKobo && !Number.isNaN(n) && n > 0 && costKobo > 0 ? `${money(n * costKobo, currency)} in total` : undefined}>
                <MoneyInput id="mv-cost" value={cost} onChange={setCost} currency={currency} invalid={!!errors.unitCostKobo} />
              </Field>
              <Field label="Supplier" htmlFor="mv-sup" optional>
                <Input id="mv-sup" value={supplier} onChange={(e) => setSupplier(e.target.value)} maxLength={120} />
              </Field>
            </div>
            <label htmlFor="mv-exp" className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/30 px-3.5 py-3">
              <Checkbox id="mv-exp" checked={expense} onCheckedChange={(c) => setExpense(c === true)} className="mt-0.5" />
              <span>
                <span className="flex items-center gap-1.5 text-[13.5px] font-medium">
                  <Receipt className="size-3.5 text-muted-foreground" aria-hidden /> Record as an expense in Finance
                </span>
                <span className="block text-[12px] text-muted-foreground">
                  Also adds this purchase{!Number.isNaN(n) && n > 0 && costKobo > 0 ? ` (${money(n * costKobo, currency)})` : ''} to Expenses, so you don’t enter it twice.
                </span>
              </span>
            </label>
          </>
        )}

        {kind === 'OUT' && (
          <Field label="Issued to" htmlFor="mv-to" optional hint="A class, department or person">
            <Input id="mv-to" value={issuedTo} onChange={(e) => setIssuedTo(e.target.value)} maxLength={120} placeholder="e.g. JSS 2 A, Kitchen, Mr Bello" />
          </Field>
        )}

        <Field label={kind === 'ADJUST' ? 'Reason for the difference' : 'Note'} htmlFor="mv-reason" optional>
          <Input id="mv-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder={kind === 'ADJUST' ? 'e.g. Termly stock count' : undefined} />
        </Field>
        <FormError message={errors.form} />
      </div>
    </FormDialog>
  );
}

// ------------------------------------------------------------------ item detail

const KIND_META: Record<StockMovementKind, { label: string; icon: ReactNode; tone: string }> = {
  IN: { label: 'Received', icon: <ArrowDownLeft className="size-3.5" />, tone: 'bg-success-soft text-success' },
  OUT: { label: 'Issued', icon: <ArrowUpRight className="size-3.5" />, tone: 'bg-info-soft text-info' },
  ADJUST: { label: 'Counted', icon: <ClipboardCheck className="size-3.5" />, tone: 'bg-warning-soft text-warning' },
};

function MovementLine({ m, currency }: { m: StockMovementRow; currency: string }) {
  const k = KIND_META[m.kind];
  const who = m.kind === 'OUT' ? m.issuedTo : m.kind === 'IN' ? m.supplier : null;
  return (
    <li className="flex items-start gap-3 px-3.5 py-2.5">
      <span className={cn('mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg', k.tone)} aria-hidden>
        {k.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px]">
          <span className="font-medium">{k.label}</span>
          {who && <span className="text-muted-foreground"> · {who}</span>}
          {m.expenseRecorded && (
            <Badge variant="outline" className="ml-2">
              Expense recorded
            </Badge>
          )}
        </p>
        <p className="truncate text-[12px] text-muted-foreground">
          {schoolDate(m.movedOn)}
          {m.reason && ` · ${m.reason}`}
          {m.kind === 'IN' && m.unitCostKobo ? ` · ${money(m.unitCostKobo, currency)} each` : ''}
          {m.recordedBy && ` · ${m.recordedBy}`}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className={cn('text-[13px] font-semibold tabular', m.change > 0 ? 'text-success' : m.change < 0 ? 'text-foreground' : 'text-muted-foreground')}>
          {m.change > 0 ? '+' : m.change < 0 ? '−' : ''}
          {Math.abs(m.change).toLocaleString()}
        </p>
        <p className="text-[11.5px] text-muted-foreground tabular">→ {m.balanceAfter.toLocaleString()}</p>
      </div>
    </li>
  );
}

export function ItemDetailSheet({
  item,
  onOpenChange,
  onMove,
  onEdit,
  currency,
}: {
  item: InventoryItemRow | null;
  onOpenChange: (o: boolean) => void;
  onMove: (kind: StockMovementKind) => void;
  onEdit: () => void;
  currency: string;
}) {
  const canManage = useCan('inventory.manage');
  const moves = useMovements(item?.id);
  const del = useDeleteItem();
  const [deleting, setDeleting] = useState(false);

  return (
    <Sheet open={!!item} onOpenChange={onOpenChange}>
      <SheetContent>
        {item && (
          <>
            <SheetHeader>
              <SheetTitle className="font-display text-lg font-semibold tracking-tight">{item.name}</SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                {INVENTORY_CATEGORY_LABELS[item.category]}
                {item.location && <span>· {item.location}</span>}
                {item.isAsset && <ConditionBadge condition={item.condition} />}
                {item.low && (
                  <Badge variant="danger" dot>
                    Low stock
                  </Badge>
                )}
              </SheetDescription>
            </SheetHeader>
            <SheetBody className="space-y-6">
              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 [&>*]:min-w-0">
                {(
                  [
                    ['On hand', `${item.quantity.toLocaleString()} ${item.unit}`, item.low ? 'text-danger' : ''],
                    ['Value', money(item.valueKobo, currency), ''],
                    ['Used a week', item.isAsset ? '—' : item.weeklyUse ? item.weeklyUse.toLocaleString() : '—', ''],
                    ['Weeks left', item.weeksLeft == null ? '—' : String(item.weeksLeft), item.weeksLeft != null && item.weeksLeft < 2 ? 'text-danger' : ''],
                  ] as const
                ).map(([k, val, cls]) => (
                  <div key={k} className="rounded-xl border border-border bg-muted/30 px-3 py-2.5">
                    <dt className="truncate text-[11.5px] text-muted-foreground">{k}</dt>
                    <dd className={cn('mt-0.5 truncate font-display text-[16px] font-semibold tabular', cls)}>{val}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-[12.5px] text-muted-foreground">
                {money(item.unitCostKobo, currency)} per {item.unit}
                {!item.isAsset && item.reorderLevel > 0 && ` · reorder at ${item.reorderLevel.toLocaleString()}`}
                {item.sku && (
                  <>
                    {' '}
                    · <span className="font-mono">{item.sku}</span>
                  </>
                )}
              </p>
              {canManage && (
                <div className="grid grid-cols-3 gap-2">
                  <Button variant="outline" onClick={() => onMove('IN')}>
                    <PackagePlus /> Receive
                  </Button>
                  <Button variant="outline" onClick={() => onMove('OUT')} disabled={item.quantity === 0}>
                    <PackageMinus /> Issue
                  </Button>
                  <Button variant="outline" onClick={() => onMove('ADJUST')}>
                    <Scale /> Count
                  </Button>
                </div>
              )}
              <section aria-labelledby="item-history">
                <h3 id="item-history" className="mb-2 flex items-center gap-2 text-[13px] font-semibold">
                  <History className="size-4 text-muted-foreground" aria-hidden /> Movement history
                </h3>
                {!moves.data ? (
                  <Skeleton className="h-32 w-full rounded-xl" />
                ) : moves.data.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border p-4 text-[13px] text-muted-foreground">No stock has moved yet.</p>
                ) : (
                  <ul className="divide-y divide-border rounded-xl border border-border">
                    {moves.data.map((m) => (
                      <MovementLine key={m.id} m={m} currency={currency} />
                    ))}
                  </ul>
                )}
              </section>
            </SheetBody>
            {canManage && (
              <SheetFooter className="justify-between">
                <Button variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger" disabled={item.quantity > 0} onClick={() => setDeleting(true)} title={item.quantity > 0 ? 'Issue or count the stock out first' : undefined}>
                  <Trash2 /> Remove
                </Button>
                <Button variant="outline" onClick={onEdit}>
                  <Pencil /> Edit item
                </Button>
              </SheetFooter>
            )}
            <ConfirmDialog
              open={deleting}
              onOpenChange={setDeleting}
              title={`Remove ${item.name}?`}
              description="It comes off the stores list along with its movement history."
              confirmLabel="Remove item"
              loading={del.isPending}
              onConfirm={() =>
                del.mutate(item.id, {
                  onSuccess: () => {
                    setDeleting(false);
                    onOpenChange(false);
                  },
                })
              }
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
