import {
  couponSchema,
  ENTITLEMENT_KEYS,
  ENTITLEMENTS,
  PRODUCT_KINDS,
  PRODUCT_PERIOD_LABELS,
  PRODUCT_PERIODS,
  productSchema,
  type CouponRow,
  type EntitlementKey,
  type ProductPeriod,
  type ProductRow,
} from '@aischool/shared';
import { MoreHorizontal, PackageOpen, Pencil, Plus, TicketPercent, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { type Column, DataTable } from '@/components/ui/data-table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Field } from '@/components/ui/field';
import { FormDialog, SwitchRow } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { formatDate, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { koboToInput, MoneyInput, parseNaira } from '../finance/ui';
import { apiFieldErrors, dateInput, FormError, Segmented, zodErrors } from '../operations/ui';
import { naira } from './api';
import { useCoupons, useDeleteCoupon, useProducts, useSaveCoupon, useSaveProduct } from './commerce-api';
import { Muted, Toolbar, useTabParam } from './ui';

const TABS = ['products', 'coupons'] as const;
const toKobo = (v: string) => {
  const n = parseNaira(v);
  return n == null ? null : Math.round(n * 100);
};

export default function ProductsPage() {
  const [tab, setTab] = useTabParam(TABS, 'products');
  const [editing, setEditing] = useState<ProductRow | 'new' | null>(null);
  const [coupon, setCoupon] = useState<CouponRow | 'new' | null>(null);
  return (
    <Page>
      <PageHeader
        eyebrow="Platform"
        title="Parent products"
        description="What parents can buy for their children, and what schools pay to sponsor whole classes."
        actions={
          tab === 'products' ? (
            <Button onClick={() => setEditing('new')}>
              <Plus /> New product
            </Button>
          ) : (
            <Button onClick={() => setCoupon('new')}>
              <Plus /> New coupon
            </Button>
          )
        }
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as (typeof TABS)[number])}>
        <TabsList>
          <TabsTrigger value="products">
            <PackageOpen /> Products
          </TabsTrigger>
          <TabsTrigger value="coupons">
            <TicketPercent /> Coupons
          </TabsTrigger>
        </TabsList>
        <TabsContent value="products">
          <ProductsTab onEdit={setEditing} />
        </TabsContent>
        <TabsContent value="coupons">
          <CouponsTab onEdit={setCoupon} />
        </TabsContent>
      </Tabs>
      <ProductDialog product={editing} onOpenChange={(o) => !o && setEditing(null)} />
      <CouponDialog coupon={coupon} onOpenChange={(o) => !o && setCoupon(null)} />
    </Page>
  );
}

// ------------------------------------------------------------------ products

function ProductsTab({ onEdit }: { onEdit: (p: ProductRow) => void }) {
  const q = useProducts();
  if (q.isLoading) return <Card className="h-60 animate-pulse" />;
  if (!q.data?.length) return <Card className="p-10 text-center text-muted-foreground">No products yet.</Card>;
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
      {q.data.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onEdit(p)}
          className={cn(
            'group flex flex-col rounded-2xl border border-border bg-card p-5 text-left shadow-soft transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            !p.isActive && 'opacity-70',
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[15px] font-semibold">
                <span className="truncate">{p.name}</span>
                <Pencil className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
              </p>
              <p className="font-mono text-[11.5px] text-muted-foreground">{p.code}</p>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-1">
              <Badge variant={p.kind === 'AI' ? 'brand' : 'info'}>{p.kind === 'AI' ? 'AI' : 'Exam'}</Badge>
              {!p.isActive ? <Badge variant="outline">Inactive</Badge> : !p.isPublic ? <Badge variant="warning">Hidden</Badge> : null}
            </div>
          </div>
          {p.tagline && <p className="mt-2 line-clamp-2 text-[12.5px] text-muted-foreground">{p.tagline}</p>}
          <p className="mt-3 font-display text-[24px] font-semibold tracking-tight tabular">
            {naira(p.priceKobo)} <span className="text-[13px] font-normal text-muted-foreground">{PRODUCT_PERIOD_LABELS[p.period]}</span>
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px]">
            <dt className="text-muted-foreground">School sponsor</dt>
            <dd className="text-right tabular">{p.schoolPriceKobo == null ? <Muted>Not offered</Muted> : `${naira(p.schoolPriceKobo)}/student`}</dd>
            <dt className="text-muted-foreground">Access</dt>
            <dd className="text-right">{p.periodMonths} months</dd>
            <dt className="text-muted-foreground">AI sessions</dt>
            <dd className="text-right tabular">{p.aiSessions == null ? <Muted>—</Muted> : formatNumber(p.aiSessions)}</dd>
            <dt className="text-muted-foreground">Max children</dt>
            <dd className="text-right tabular">{p.maxChildren}</dd>
          </dl>
          <div className="mt-3 flex flex-wrap gap-1">
            {p.entitlements.map((e) => (
              <Badge key={e} variant="secondary">
                {ENTITLEMENTS[e]?.label ?? e}
              </Badge>
            ))}
          </div>
          <div className="flex-1" aria-hidden />
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-[12.5px]">
            <span>
              <span className="font-semibold tabular">{formatNumber(p.activeSubscriptions)}</span> <span className="text-muted-foreground">active subscriptions</span>
            </span>
            <span>
              <span className="font-semibold tabular">{formatNumber(p.sponsoredStudents)}</span> <span className="text-muted-foreground">sponsored</span>
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

function ProductDialog({ product, onOpenChange }: { product: ProductRow | 'new' | null; onOpenChange: (o: boolean) => void }) {
  const save = useSaveProduct();
  const existing = product && product !== 'new' ? product : null;
  const blank = {
    code: '',
    name: '',
    tagline: '',
    description: '',
    kind: 'AI' as (typeof PRODUCT_KINDS)[number],
    entitlements: [] as EntitlementKey[],
    price: '',
    school: '',
    period: 'TERM' as ProductPeriod,
    periodMonths: '4',
    maxChildren: '1',
    aiSessions: '',
    features: '',
    isActive: true,
    isPublic: true,
    sortOrder: '0',
  };
  const [v, setV] = useState(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!product) return;
    setErrors({});
    setV(
      existing
        ? {
            code: existing.code,
            name: existing.name,
            tagline: existing.tagline ?? '',
            description: existing.description ?? '',
            kind: existing.kind,
            entitlements: existing.entitlements,
            price: koboToInput(existing.priceKobo),
            school: existing.schoolPriceKobo == null ? '' : koboToInput(existing.schoolPriceKobo),
            period: existing.period,
            periodMonths: String(existing.periodMonths),
            maxChildren: String(existing.maxChildren),
            aiSessions: existing.aiSessions == null ? '' : String(existing.aiSessions),
            features: existing.features.join('\n'),
            isActive: existing.isActive,
            isPublic: existing.isPublic,
            sortOrder: String(existing.sortOrder),
          }
        : blank,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product]);
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }));

  const submit = (e?: React.BaseSyntheticEvent) => {
    e?.preventDefault();
    const parsed = productSchema.safeParse({
      code: v.code,
      name: v.name,
      tagline: v.tagline,
      description: v.description,
      kind: v.kind,
      entitlements: v.entitlements,
      priceKobo: toKobo(v.price) ?? -1,
      schoolPriceKobo: v.school.trim() ? (toKobo(v.school) ?? -1) : null,
      period: v.period,
      periodMonths: Number(v.periodMonths),
      maxChildren: Number(v.maxChildren),
      aiSessions: v.aiSessions.trim() ? Number(v.aiSessions) : null,
      features: v.features.split('\n').map((s) => s.trim()).filter(Boolean),
      isActive: v.isActive,
      isPublic: v.isPublic,
      sortOrder: Number(v.sortOrder) || 0,
    });
    if (!parsed.success) {
      const errs = zodErrors(parsed.error.issues);
      if (errs.entitlements) errs.entitlements = 'Choose at least one';
      return setErrors(errs);
    }
    save.mutate(
      { id: existing?.id, body: parsed.data },
      {
        onSuccess: () => {
          toast.success(existing ? `${parsed.data.name} saved` : `${parsed.data.name} created`);
          onOpenChange(false);
        },
        onError: (err) => setErrors(apiFieldErrors(err)),
      },
    );
  };

  return (
    <FormDialog
      open={!!product}
      onOpenChange={onOpenChange}
      title={existing ? `Edit ${existing.name}` : 'New product'}
      description={existing ? 'Price changes apply to new purchases and renewals; current periods keep what was paid.' : 'Products grant entitlements; features check entitlements, never subscriptions.'}
      icon={<PackageOpen />}
      submitLabel={existing ? 'Save product' : 'Create product'}
      pending={save.isPending}
      onSubmit={submit}
      size="xl"
    >
      <div className="grid gap-4">
        <FormError message={errors.form} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Name" htmlFor="pr-name" error={errors.name} className="sm:col-span-2">
            <Input id="pr-name" value={v.name} onChange={(e) => set('name', e.target.value)} placeholder="AI Plus" />
          </Field>
          <Field label="Code" htmlFor="pr-code" error={errors.code} hint={existing ? 'Coupons refer to it' : 'e.g. AI_PLUS_TERM'}>
            <Input id="pr-code" className="font-mono uppercase" value={v.code} onChange={(e) => set('code', e.target.value.toUpperCase())} />
          </Field>
        </div>
        <Field label="Tagline" htmlFor="pr-tag" error={errors.tagline} optional>
          <Input id="pr-tag" value={v.tagline} onChange={(e) => set('tagline', e.target.value)} />
        </Field>
        <Field label="Description" htmlFor="pr-desc" error={errors.description} optional>
          <Textarea id="pr-desc" rows={2} value={v.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kind">
            <Segmented
              label="Kind"
              value={v.kind}
              onChange={(k) => set('kind', k)}
              options={[
                { value: 'AI', label: 'AI learning' },
                { value: 'EXAM', label: 'Exam prep' },
              ]}
            />
          </Field>
          <Field label="Period" htmlFor="pr-period" error={errors.period}>
            <Select value={v.period} onValueChange={(p) => set('period', p as ProductPeriod)}>
              <SelectTrigger id="pr-period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRODUCT_PERIODS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PRODUCT_PERIOD_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Parent price" htmlFor="pr-price" error={errors.priceKobo}>
            <MoneyInput id="pr-price" currency="NGN" value={v.price} onChange={(x) => set('price', x)} invalid={!!errors.priceKobo} />
          </Field>
          <Field label="School sponsor price (per student)" htmlFor="pr-school" error={errors.schoolPriceKobo} hint="Leave empty if schools can’t sponsor it">
            <MoneyInput id="pr-school" currency="NGN" value={v.school} onChange={(x) => set('school', x)} invalid={!!errors.schoolPriceKobo} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Access (months)" htmlFor="pr-months" error={errors.periodMonths}>
            <Input id="pr-months" type="number" min={1} max={24} value={v.periodMonths} onChange={(e) => set('periodMonths', e.target.value)} />
          </Field>
          <Field label="Max children" htmlFor="pr-kids" error={errors.maxChildren}>
            <Input id="pr-kids" type="number" min={1} max={10} value={v.maxChildren} onChange={(e) => set('maxChildren', e.target.value)} />
          </Field>
          <Field label="AI sessions" htmlFor="pr-sessions" error={errors.aiSessions} hint="Per period; empty = none">
            <Input id="pr-sessions" type="number" min={0} value={v.aiSessions} onChange={(e) => set('aiSessions', e.target.value)} />
          </Field>
          <Field label="Sort order" htmlFor="pr-sort" error={errors.sortOrder}>
            <Input id="pr-sort" type="number" min={0} value={v.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} />
          </Field>
        </div>
        <Field label="Entitlements granted" error={errors.entitlements}>
          <div className="grid gap-2 sm:grid-cols-2">
            {ENTITLEMENT_KEYS.map((k) => (
              <label key={k} className={cn('flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2', v.entitlements.includes(k) ? 'border-brand bg-brand-soft/30' : 'border-border')}>
                <Checkbox className="mt-0.5" checked={v.entitlements.includes(k)} onCheckedChange={(on) => set('entitlements', on === true ? [...v.entitlements, k] : v.entitlements.filter((x) => x !== k))} />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium">{ENTITLEMENTS[k].label}</span>
                  <span className="block font-mono text-[11px] text-muted-foreground">{k}</span>
                </span>
              </label>
            ))}
          </div>
        </Field>
        <Field label="Features (one per line)" htmlFor="pr-features" error={errors.features} hint="Shown to parents on the product card. Up to 12.">
          <Textarea id="pr-features" rows={4} value={v.features} onChange={(e) => set('features', e.target.value)} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <SwitchRow label="Active" description="Can be bought and renewed">
            <Switch checked={v.isActive} onCheckedChange={(x) => set('isActive', x)} />
          </SwitchRow>
          <SwitchRow label="Public" description="Shown in the parent Family centre">
            <Switch checked={v.isPublic} onCheckedChange={(x) => set('isPublic', x)} />
          </SwitchRow>
        </div>
      </div>
    </FormDialog>
  );
}

// ------------------------------------------------------------------ coupons

function CouponsTab({ onEdit }: { onEdit: (c: CouponRow) => void }) {
  const q = useCoupons();
  const del = useDeleteCoupon();
  const [deleting, setDeleting] = useState<CouponRow | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const state = (c: CouponRow) =>
    !c.active ? (
      <Badge variant="outline">Inactive</Badge>
    ) : c.expiresAt && c.expiresAt < today ? (
      <Badge variant="secondary">Expired</Badge>
    ) : c.maxRedemptions != null && c.redemptions >= c.maxRedemptions ? (
      <Badge variant="secondary">Used up</Badge>
    ) : (
      <Badge variant="success" dot>
        Live
      </Badge>
    );
  const off = (c: CouponRow) => (c.percentOff != null ? `${c.percentOff}% off` : `${naira(c.amountOffKobo)} off`);

  const columns: Column<CouponRow>[] = [
    {
      key: 'code',
      header: 'Code',
      cell: (c) => (
        <div>
          <p className="font-mono text-[13px] font-semibold">{c.code}</p>
          {c.description && <p className="max-w-[260px] truncate text-[12px] text-muted-foreground">{c.description}</p>}
        </div>
      ),
    },
    { key: 'off', header: 'Discount', cell: (c) => <span className="font-medium tabular">{off(c)}</span> },
    { key: 'products', header: 'Products', cell: (c) => (c.productCodes.length ? <span className="font-mono text-[12px]">{c.productCodes.join(', ')}</span> : <Muted>Any</Muted>) },
    {
      key: 'used',
      header: 'Redemptions',
      className: 'tabular text-right',
      headClassName: 'text-right',
      cell: (c) => (
        <span>
          {formatNumber(c.redemptions)}
          <span className="text-muted-foreground"> / {c.maxRedemptions == null ? '∞' : formatNumber(c.maxRedemptions)}</span>
        </span>
      ),
    },
    { key: 'expires', header: 'Expires', cell: (c) => (c.expiresAt ? <span className="whitespace-nowrap">{formatDate(c.expiresAt)}</span> : <Muted>Never</Muted>) },
    { key: 'state', header: 'Status', cell: state },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'w-10 text-right',
      cell: (c) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${c.code}`} onClick={(e) => e.stopPropagation()}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()} className="w-48">
            <DropdownMenuItem onSelect={() => onEdit(c)}>
              <Pencil /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem className="text-danger focus:text-danger" onSelect={() => setDeleting(c)}>
              <Trash2 /> {c.redemptions ? 'Deactivate' : 'Delete'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <Card className="overflow-hidden">
      <Toolbar>
        <p className="text-[12.5px] text-muted-foreground">Parents enter a code at checkout. Codes already redeemed can only be deactivated, so the order history stays intact.</p>
      </Toolbar>
      <DataTable
        columns={columns}
        rows={q.data}
        rowKey={(c) => c.id}
        loading={q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        onRowClick={onEdit}
        rowLabel={(c) => `Edit ${c.code}`}
        renderMobile={(c) => (
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[14px] font-semibold">{c.code}</p>
              <p className="text-[12px] text-muted-foreground">
                {off(c)} · {formatNumber(c.redemptions)}/{c.maxRedemptions ?? '∞'} used{c.expiresAt ? ` · until ${formatDate(c.expiresAt)}` : ''}
              </p>
            </div>
            {state(c)}
          </div>
        )}
        empty={{ icon: TicketPercent, title: 'No coupons', description: 'Create a code for a launch offer or a partner school.' }}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={deleting?.redemptions ? `Deactivate ${deleting.code}?` : `Delete ${deleting?.code ?? ''}?`}
        description={deleting?.redemptions ? 'It has been redeemed, so it’s kept for the record and switched off.' : 'Nobody has used it yet, so it’s removed completely.'}
        confirmLabel={deleting?.redemptions ? 'Deactivate' : 'Delete'}
        loading={del.isPending}
        onConfirm={() =>
          deleting &&
          del.mutate(deleting.id, {
            onSuccess: () => {
              toast.success(deleting.redemptions ? `${deleting.code} deactivated` : `${deleting.code} deleted`);
              setDeleting(null);
            },
          })
        }
      />
    </Card>
  );
}

function CouponDialog({ coupon, onOpenChange }: { coupon: CouponRow | 'new' | null; onOpenChange: (o: boolean) => void }) {
  const save = useSaveCoupon();
  const products = useProducts();
  const existing = coupon && coupon !== 'new' ? coupon : null;
  const [v, setV] = useState({ code: '', description: '', mode: 'pct' as 'pct' | 'amt', pct: '', amt: '', products: [] as string[], max: '', expires: '', active: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!coupon) return;
    setErrors({});
    setV(
      existing
        ? {
            code: existing.code,
            description: existing.description ?? '',
            mode: existing.percentOff != null ? 'pct' : 'amt',
            pct: existing.percentOff != null ? String(existing.percentOff) : '',
            amt: existing.amountOffKobo != null ? koboToInput(existing.amountOffKobo) : '',
            products: existing.productCodes,
            max: existing.maxRedemptions == null ? '' : String(existing.maxRedemptions),
            expires: existing.expiresAt ?? '',
            active: existing.active,
          }
        : { code: '', description: '', mode: 'pct', pct: '', amt: '', products: [], max: '', expires: '', active: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coupon]);
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }));

  const submit = (e?: React.BaseSyntheticEvent) => {
    e?.preventDefault();
    const parsed = couponSchema.safeParse({
      code: v.code,
      description: v.description,
      percentOff: v.mode === 'pct' ? Number(v.pct) || 0 : null,
      amountOffKobo: v.mode === 'amt' ? (toKobo(v.amt) ?? 0) : null,
      productCodes: v.products,
      maxRedemptions: v.max.trim() ? Number(v.max) : null,
      expiresAt: v.expires || null,
      active: v.active,
    });
    if (!parsed.success) {
      const errs = zodErrors(parsed.error.issues);
      if (errs.percentOff) errs.percentOff = 'Between 1 and 100';
      if (errs.amountOffKobo) errs.amountOffKobo = 'At least ₦1';
      return setErrors(errs);
    }
    save.mutate(
      { id: existing?.id, body: parsed.data },
      {
        onSuccess: () => {
          toast.success(existing ? `${parsed.data.code} saved` : `${parsed.data.code} created`);
          onOpenChange(false);
        },
        onError: (err) => setErrors(apiFieldErrors(err)),
      },
    );
  };

  return (
    <FormDialog open={!!coupon} onOpenChange={onOpenChange} title={existing ? `Edit ${existing.code}` : 'New coupon'} icon={<TicketPercent />} submitLabel={existing ? 'Save coupon' : 'Create coupon'} pending={save.isPending} onSubmit={submit} size="lg">
      <div className="grid gap-4">
        <FormError message={errors.form} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code" htmlFor="cp-code" error={errors.code}>
            <Input id="cp-code" className="font-mono uppercase" value={v.code} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="BACK2SCHOOL" />
          </Field>
          <Field label="Description" htmlFor="cp-desc" error={errors.description} optional>
            <Input id="cp-desc" value={v.description} onChange={(e) => set('description', e.target.value)} />
          </Field>
        </div>
        <Field label="Discount" error={errors.percentOff ?? errors.amountOffKobo}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Segmented
              label="Discount type"
              value={v.mode}
              onChange={(m) => set('mode', m)}
              options={[
                { value: 'pct', label: 'Percent off' },
                { value: 'amt', label: 'Amount off' },
              ]}
            />
            {v.mode === 'pct' ? (
              <div className="relative sm:w-36">
                <Input aria-label="Percent off" type="number" min={1} max={100} value={v.pct} onChange={(e) => set('pct', e.target.value)} className="pr-8" />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
              </div>
            ) : (
              <MoneyInput aria-label="Amount off" currency="NGN" value={v.amt} onChange={(x) => set('amt', x)} className="sm:w-44" />
            )}
          </div>
        </Field>
        <Field label="Applies to" hint="None ticked = any product">
          <div className="flex flex-wrap gap-2">
            {(products.data ?? []).map((p) => (
              <label key={p.code} className={cn('flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12.5px]', v.products.includes(p.code) ? 'border-brand bg-brand-soft/30' : 'border-border')}>
                <Checkbox checked={v.products.includes(p.code)} onCheckedChange={(on) => set('products', on === true ? [...v.products, p.code] : v.products.filter((x) => x !== p.code))} />
                {p.name}
              </label>
            ))}
          </div>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Max redemptions" htmlFor="cp-max" error={errors.maxRedemptions} hint="Empty = unlimited">
            <Input id="cp-max" type="number" min={1} value={v.max} onChange={(e) => set('max', e.target.value)} />
          </Field>
          <Field label="Expires" htmlFor="cp-exp" error={errors.expiresAt} hint="Last day it works; empty = never">
            <Input id="cp-exp" type="date" className={dateInput} value={v.expires} onChange={(e) => set('expires', e.target.value)} />
          </Field>
        </div>
        <SwitchRow label="Active" description="Inactive codes are refused at checkout">
          <Switch checked={v.active} onCheckedChange={(x) => set('active', x)} />
        </SwitchRow>
      </div>
    </FormDialog>
  );
}
