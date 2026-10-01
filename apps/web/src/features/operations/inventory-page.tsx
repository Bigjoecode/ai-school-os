import { INVENTORY_CATEGORIES, INVENTORY_CATEGORY_LABELS, type InventoryCategory, type InventoryItemRow, type StockMovementKind } from '@aischool/shared';
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Boxes, Package, PackagePlus, PackageSearch, Sofa, TrendingDown, Wrench } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { type Column, DataTable } from '@/components/ui/data-table';
import { ErrorState } from '@/components/ui/empty-state';
import { SearchInput } from '@/components/ui/search-input';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useCan } from '@/lib/auth-store';
import { useDebounced } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { StatTile } from '../attendance/ui';
import { compactMoney, money, useCurrency } from '../finance/ui';
import { AiTextCard } from '../hr/ui';
import { useInventoryInsight, useInventoryOverview, useItems } from './api';
import { ItemDetailSheet, ItemFormSheet, MoveStockDialog } from './inventory-dialogs';
import { ConditionBadge, plural, Segmented } from './ui';

type Kind = 'all' | 'false' | 'true';

export default function InventoryPage() {
  const canManage = useCan('inventory.manage');
  const canAi = useCan('ai.use');
  const currency = useCurrency();
  const [params, setParams] = useSearchParams();
  const overview = useInventoryOverview();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<InventoryCategory | undefined>();
  const [kind, setKind] = useState<Kind>('all');
  const [low, setLow] = useState(params.get('low') === '1');
  const q = useDebounced(search.trim(), 300);
  const items = useItems({ q: q || undefined, category, assets: kind === 'all' ? undefined : kind, low: low ? 'true' : undefined });

  const [selected, setSelected] = useState<InventoryItemRow | null>(null);
  const [editing, setEditing] = useState<InventoryItemRow | 'new' | null>(params.get('new') === '1' && canManage ? 'new' : null);
  const [moving, setMoving] = useState<{ item: InventoryItemRow; kind: StockMovementKind } | null>(null);
  // ⌘K "Receive stock": land on the list with a hint to pick an item.
  const receiveHint = params.get('receive') === '1';
  const newFlag = params.get('new') === '1';
  const lowFlag = params.get('low') === '1';
  useEffect(() => {
    if (newFlag && canManage) setEditing((s) => s ?? 'new');
  }, [newFlag, canManage]);
  useEffect(() => {
    if (lowFlag) setLow(true);
  }, [lowFlag]);

  // Keep the open sheet in step with fresh numbers after a movement.
  const live = selected ? (items.data?.find((i) => i.id === selected.id) ?? overview.data?.lowStock.find((i) => i.id === selected.id) ?? selected) : null;
  useEffect(() => {
    if (live && live !== selected) setSelected(live);
  }, [live, selected]);

  const clearParam = (k: string) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete(k);
        return p;
      },
      { replace: true },
    );

  const o = overview.data;
  const columns: Column<InventoryItemRow>[] = [
    {
      key: 'name',
      header: 'Item',
      cell: (i) => (
        <div className="min-w-0 max-w-[300px]">
          <p className="flex items-center gap-2 truncate font-medium">
            <span className="truncate">{i.name}</span>
            {i.isAsset && <ConditionBadge condition={i.condition} />}
          </p>
          <p className="truncate text-[12px] text-muted-foreground">
            {INVENTORY_CATEGORY_LABELS[i.category]}
            {i.sku && ` · ${i.sku}`}
          </p>
        </div>
      ),
    },
    {
      key: 'qty',
      header: 'On hand',
      cell: (i) => (
        <span className={cn('whitespace-nowrap tabular', i.low && 'font-semibold text-danger')}>
          {i.quantity.toLocaleString()} <span className="font-normal text-muted-foreground">{i.unit}</span>
          {i.low && (
            <Badge variant="danger" className="ml-2">
              Low
            </Badge>
          )}
        </span>
      ),
    },
    { key: 'reorder', header: 'Reorder at', cell: (i) => <span className="text-muted-foreground tabular">{i.isAsset || !i.reorderLevel ? '—' : i.reorderLevel.toLocaleString()}</span>, headClassName: 'hidden lg:table-cell', className: 'hidden lg:table-cell' },
    { key: 'weeks', header: 'Weeks left', cell: (i) => <WeeksLeft i={i} /> },
    { key: 'cost', header: 'Unit cost', cell: (i) => <span className="whitespace-nowrap tabular">{money(i.unitCostKobo, currency)}</span>, headClassName: 'hidden xl:table-cell text-right', className: 'hidden xl:table-cell text-right' },
    { key: 'value', header: 'Value', cell: (i) => <span className="whitespace-nowrap font-medium tabular">{money(i.valueKobo, currency)}</span>, headClassName: 'text-right', className: 'text-right' },
    { key: 'loc', header: 'Location', cell: (i) => <span className="block max-w-[160px] truncate text-[13px] text-muted-foreground">{i.location ?? '—'}</span>, headClassName: 'hidden lg:table-cell', className: 'hidden lg:table-cell' },
  ];

  return (
    <Page>
      <PageHeader
        title="Inventory"
        description="Stores and assets — what you have, what’s running low and where it all went."
        actions={
          canManage && (
            <Button onClick={() => setEditing('new')}>
              <PackagePlus /> Add item
            </Button>
          )
        }
      />
      {overview.error && !o ? (
        <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5 [&>*]:min-w-0">
            <StatTile label="Stock value" icon={<Boxes />} loading={!o} value={o ? compactMoney(o.stockValueKobo, o.currency) : '—'} sub={o ? `${plural(o.items, 'item')} in stores` : undefined} />
            <StatTile
              label="Asset value"
              icon={<Sofa />}
              loading={!o}
              value={o ? compactMoney(o.assetValueKobo, o.currency) : '—'}
              sub={o ? (o.assetsNeedingAttention ? <span className="font-medium text-warning">{plural(o.assetsNeedingAttention, 'asset')} poor or broken</span> : 'All assets in fair shape or better') : undefined}
            />
            <StatTile label="Received this month" icon={<ArrowDownLeft />} loading={!o} value={o ? compactMoney(o.receivedThisMonthKobo, o.currency) : '—'} sub="At cost" />
            <StatTile label="Issued this month" icon={<ArrowUpRight />} loading={!o} value={o ? compactMoney(o.issuedThisMonthKobo, o.currency) : '—'} sub="At cost" />
            <button type="button" onClick={() => setLow(true)} className="rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:col-span-2 xl:col-span-1">
              <StatTile
                label="Low stock"
                icon={<TrendingDown />}
                loading={!o}
                value={o?.lowStock.length ?? '—'}
                tone={o && o.lowStock.length > 0 ? 'danger' : undefined}
                sub={o ? (o.lowStock.length ? <span className="font-medium text-danger">Show low items →</span> : 'Nothing below its reorder level') : undefined}
              />
            </button>
          </div>

          <div className={cn('grid gap-5 [&>*]:min-w-0', canAi && 'xl:grid-cols-3')}>
            <LowStockCard items={o?.lowStock} loading={!o} currency={currency} onOpen={setSelected} />
            <InsightCard className="xl:col-span-2" />
          </div>

          <Card className="overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-border p-4 sm:px-5 xl:flex-row xl:items-center">
              <SearchInput value={search} onChange={setSearch} placeholder="Search name, code or location…" className="xl:max-w-xs xl:flex-1" />
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <Select value={category ?? NONE} onValueChange={(v) => setCategory(v === NONE ? undefined : (v as InventoryCategory))}>
                  <SelectTrigger aria-label="Category" className="sm:w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>All categories</SelectItem>
                    {INVENTORY_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {INVENTORY_CATEGORY_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Segmented
                  size="sm"
                  label="Item type"
                  value={kind}
                  onChange={setKind}
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'false', label: 'Consumables' },
                    { value: 'true', label: 'Assets' },
                  ]}
                />
                <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-muted-foreground">
                  <Switch checked={low} onCheckedChange={(v) => { setLow(v); if (!v) clearParam('low'); }} aria-label="Low stock only" /> Low stock only
                </label>
              </div>
            </div>
            {receiveHint && canManage && (
              <div className="flex items-center justify-between gap-3 border-b border-border bg-brand-soft/40 px-4 py-2.5 text-[13px] sm:px-5">
                <span className="flex items-center gap-2">
                  <PackageSearch className="size-4 text-brand" aria-hidden /> Choose the item you’re receiving, then press <span className="font-medium">Receive</span>.
                </span>
                <Button variant="ghost" size="sm" onClick={() => clearParam('receive')}>
                  Dismiss
                </Button>
              </div>
            )}
            <DataTable
              columns={columns}
              rows={items.data}
              rowKey={(i) => i.id}
              loading={items.isLoading || items.isPlaceholderData}
              error={items.error}
              onRetry={() => void items.refetch()}
              onRowClick={setSelected}
              rowLabel={(i) => `Open ${i.name}`}
              renderMobile={(i) => (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">
                      <span className="truncate">{i.name}</span>
                      {i.isAsset && <ConditionBadge condition={i.condition} />}
                    </p>
                    <p className="truncate text-[12.5px] text-muted-foreground">
                      {INVENTORY_CATEGORY_LABELS[i.category]}
                      {i.location && ` · ${i.location}`}
                    </p>
                    <div className="mt-1.5">
                      <WeeksLeft i={i} />
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={cn('text-[13.5px] font-semibold tabular', i.low && 'text-danger')}>
                      {i.quantity.toLocaleString()} <span className="font-normal text-muted-foreground">{i.unit}</span>
                    </p>
                    <p className="text-[12px] text-muted-foreground tabular">{money(i.valueKobo, currency)}</p>
                  </div>
                </div>
              )}
              empty={{
                icon: Package,
                title: q || category || low || kind !== 'all' ? 'No items match' : 'Stores are empty',
                description: q || category || low || kind !== 'all' ? (low ? 'Nothing is below its reorder level.' : 'Try a different search or filter.') : 'Add stationery, cleaning supplies, lab equipment and furniture to track them here.',
                action: canManage && !q && !category && !low && kind === 'all' && (
                  <Button onClick={() => setEditing('new')}>
                    <PackagePlus /> Add the first item
                  </Button>
                ),
              }}
            />
          </Card>
        </div>
      )}

      <ItemDetailSheet
        item={selected}
        onOpenChange={(o) => {
          if (!o) setSelected(null);
        }}
        onMove={(k) => {
          if (selected) setMoving({ item: selected, kind: k });
          if (receiveHint) clearParam('receive');
        }}
        onEdit={() => {
          if (selected) setEditing(selected);
        }}
        currency={currency}
      />
      {canManage && (
        <>
          <MoveStockDialog item={moving?.item ?? null} kind={moving?.kind ?? 'IN'} onOpenChange={(o) => !o && setMoving(null)} currency={currency} />
          <ItemFormSheet
            open={!!editing}
            onOpenChange={(o) => {
              if (!o) {
                setEditing(null);
                if (params.get('new')) clearParam('new');
              }
            }}
            item={editing === 'new' ? null : editing}
            currency={currency}
          />
        </>
      )}
    </Page>
  );
}

function WeeksLeft({ i }: { i: InventoryItemRow }) {
  if (i.isAsset) return <span className="text-[12.5px] text-muted-foreground">Asset</span>;
  if (i.weeksLeft == null) return <span className="text-[12.5px] text-muted-foreground">Not used lately</span>;
  const tone = i.weeksLeft < 2 ? 'bg-danger-soft text-danger' : i.weeksLeft < 4 ? 'bg-warning-soft text-warning' : 'bg-muted text-muted-foreground';
  return (
    <span className={cn('inline-flex h-5 items-center whitespace-nowrap rounded-full px-2 text-[11.5px] font-semibold tabular', tone)} title={`About ${i.weeklyUse} ${i.unit} a week`}>
      {i.weeksLeft < 1 ? 'Under a week' : `${i.weeksLeft} wk${i.weeksLeft === 1 ? '' : 's'}`}
    </span>
  );
}

function LowStockCard({ items, loading, currency, onOpen }: { items: InventoryItemRow[] | undefined; loading: boolean; currency: string; onOpen: (i: InventoryItemRow) => void }) {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-danger" aria-hidden /> Running low
          </CardTitle>
          <CardDescription>At or below the reorder level, soonest to run out first</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        {loading ? (
          <div className="space-y-2" aria-busy>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : !items?.length ? (
          <div className="grid h-full min-h-[120px] place-items-center rounded-xl border border-dashed border-border px-4 text-center text-[13px] text-muted-foreground">
            <span className="flex flex-col items-center gap-2">
              <Wrench className="size-5 text-success" aria-hidden /> Everything is above its reorder level.
            </span>
          </div>
        ) : (
          <ul className="space-y-1">
            {items.slice(0, 8).map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => onOpen(i)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium">{i.name}</span>
                    <span className="block truncate text-[12px] text-muted-foreground">
                      {i.quantity.toLocaleString()} {i.unit} left · reorder at {i.reorderLevel.toLocaleString()} · {money(i.unitCostKobo, currency)} each
                    </span>
                  </span>
                  <WeeksLeft i={i} />
                </button>
              </li>
            ))}
            {items.length > 8 && <li className="px-2 pt-1 text-[12px] text-muted-foreground">and {items.length - 8} more</li>}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function InsightCard({ className }: { className?: string }) {
  const canAi = useCan('ai.use');
  const run = useInventoryInsight();
  if (!canAi) return null;
  return (
    <AiTextCard
      className={className}
      title="Reorder briefing"
      description="What to buy before it runs out, what’s piling up, and assets that need attention."
      points={[
        [TrendingDown, 'Ranks reorders by weeks left'],
        [Boxes, 'Spots slow-moving stock'],
        [Wrench, 'Flags poor and broken assets'],
      ]}
      result={run.data ?? null}
      pending={run.isPending}
      onRun={() => run.mutate()}
      runLabel="Write briefing"
      pendingLabel="Reading the stores…"
      footnote="Based on stock levels and the last eight weeks of use."
    />
  );
}
