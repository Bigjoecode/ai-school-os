import { ADDON_PRICING, PLAN_ENQUIRY_STATUSES, SMS_OVERAGE_LABELS, SMS_OVERAGE_POLICIES, type AddonInput, type AddonOrderRow, type AddonRow, type PlanEnquiryStatus, type PricingConsole, type PricingSettings } from '@aischool/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Inbox, Package, Pencil, Plus, Settings2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { FormDialog, SwitchRow } from '@/components/ui/form-dialog';
import { Input, inputClass } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api';
import { usePlatformRole } from '@/lib/auth-store';
import { formatDate } from '@/lib/format';
import { queryClient } from '@/lib/query-client';
import { addonPrice } from '../sales/pricing';
import { naira } from './api';
import { Section } from './ui';

const KEY = ['platform', 'pricing'] as const;
const refresh = () => void queryClient.invalidateQueries({ queryKey: KEY });
const toKobo = (v: string) => {
  const n = Number(v.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && v.trim() ? Math.round(n * 100) : null;
};

/** Console → Subscriptions → Price list: add-on requests, "Talk to us" enquiries, the add-on catalogue and the price notes. */
export function PriceListTab() {
  const q = useQuery({ queryKey: KEY, queryFn: ({ signal }) => api.get<PricingConsole>('/platform/pricing', undefined, signal) });
  const d = q.data;
  if (!d) return <Skeleton className="h-96 rounded-2xl" />;
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-muted-foreground">
        Plan prices, setup fees, training days, minimum students and included SMS are set on each plan in{' '}
        <Link to="/platform/plans" className="font-medium text-brand hover:underline">
          Plans
        </Link>
        . Waive or discount a school’s setup fee from the Schools tab (Manage).
      </p>
      <Requests orders={d.orders} />
      <Enquiries d={d} />
      <Catalogue addons={d.addons} />
      <SettingsCard settings={d.settings} />
    </div>
  );
}

function Requests({ orders }: { orders: AddonOrderRow[] }) {
  const [answer, setAnswer] = useState<AddonOrderRow | null>(null);
  const open = orders.filter((o) => o.status === 'REQUESTED');
  const recent = orders.filter((o) => o.status !== 'REQUESTED').slice(0, 15);
  return (
    <Section title={<><Inbox className="size-4 text-muted-foreground" /> Add-on requests {open.length > 0 && <Badge variant="warning">{open.length} waiting</Badge>}</>} description="Quote items schools asked for, and fixed-price add-ons they bought." flush>
      {orders.length === 0 ? (
        <p className="px-5 py-6 text-center text-[13px] text-muted-foreground">No add-on orders yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {[...open, ...recent].map((o) => (
            <li key={o.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 sm:px-6">
              <div className="min-w-0 text-[13px]">
                <p className="font-medium">
                  {o.addon.name}
                  {o.quantity > 1 ? ` × ${o.quantity}` : ''} · <Link to={`/platform/schools/${o.tenant.id}`} className="hover:underline">{o.tenant.name}</Link>
                </p>
                <p className="text-[12px] text-muted-foreground">
                  {formatDate(o.createdAt)}
                  {o.requestedBy ? ` · ${o.requestedBy}` : ''}
                  {o.invoiceNumber ? ` · ${o.invoiceNumber} (${o.invoiceStatus?.toLowerCase()})` : ''}
                </p>
                {o.note && <p className="mt-1 rounded-lg bg-muted/50 px-2.5 py-1.5 text-[12.5px]">“{o.note}”</p>}
                {o.operatorNote && <p className="mt-1 text-[12px] text-muted-foreground">Reply: {o.operatorNote}</p>}
              </div>
              <div className="flex items-center gap-2">
                {o.amountKobo != null && <span className="text-[13px] font-medium tabular">{naira(o.amountKobo)}</span>}
                {o.status === 'REQUESTED' ? (
                  <Button size="sm" onClick={() => setAnswer(o)}>
                    Answer
                  </Button>
                ) : (
                  <Badge variant={o.status === 'INVOICED' ? 'success' : o.status === 'DECLINED' ? 'danger' : 'outline'}>{o.status.toLowerCase()}</Badge>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <AnswerDialog order={answer} onClose={() => setAnswer(null)} />
    </Section>
  );
}

function AnswerDialog({ order, onClose }: { order: AddonOrderRow | null; onClose: () => void }) {
  const [action, setAction] = useState<'INVOICE' | 'DECLINE'>('INVOICE');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => {
    setAction('INVOICE');
    setAmount('');
    setNote('');
  }, [order]);
  const save = useMutation({
    mutationFn: () => api.post(`/platform/addon-orders/${order!.id}`, action === 'INVOICE' ? { action, amountKobo: toKobo(amount) ?? 0, note: note || null } : { action, note }),
    onSuccess: () => {
      toast.success(action === 'INVOICE' ? 'Invoice issued and the school told' : 'Declined and the school told');
      refresh();
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <FormDialog
      open={!!order}
      onOpenChange={(o) => !o && onClose()}
      title={`${order?.addon.name ?? ''} for ${order?.tenant.name ?? ''}`}
      description="Invoice the school a price (it goes on their AI School OS invoices), or decline with a reason."
      submitLabel={action === 'INVOICE' ? 'Issue invoice' : 'Decline'}
      pending={save.isPending}
      onSubmit={(e) => {
        e?.preventDefault();
        save.mutate();
      }}
    >
      <div className="space-y-4">
        <Field label="Answer" htmlFor="ans">
          <select id="ans" className={inputClass} value={action} onChange={(e) => setAction(e.target.value as typeof action)}>
            <option value="INVOICE">Quote and invoice</option>
            <option value="DECLINE">Decline</option>
          </select>
        </Field>
        {action === 'INVOICE' && (
          <Field label="Total price (₦)" htmlFor="ans-amt" hint={order && order.quantity > 1 ? `For all ${order.quantity}` : undefined}>
            <Input id="ans-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="250,000" />
          </Field>
        )}
        <Field label={action === 'INVOICE' ? 'Note to the school (optional)' : 'Reason'} htmlFor="ans-note">
          <Textarea id="ans-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </Field>
      </div>
    </FormDialog>
  );
}

function Enquiries({ d }: { d: PricingConsole }) {
  const set = useMutation({
    mutationFn: ({ id, status }: { id: string; status: PlanEnquiryStatus }) => api.put(`/platform/plan-enquiries/${id}`, { status }),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Section title="“Talk to us” enquiries" description="From the pricing page (Ultimate and custom prices)." flush>
      {d.enquiries.length === 0 ? (
        <p className="px-5 py-6 text-center text-[13px] text-muted-foreground">No enquiries yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {d.enquiries.map((e) => (
            <li key={e.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 text-[13px] sm:px-6">
              <div className="min-w-0">
                <p className="font-medium">
                  {e.schoolName} <span className="text-muted-foreground">· {e.plan ?? 'pricing'} · {e.students.toLocaleString('en-NG')} students{e.branches > 1 ? `, ${e.branches} branches` : ''}</span>
                </p>
                <p className="text-[12px] text-muted-foreground">
                  {e.contactName} · <a href={`mailto:${e.email}`} className="hover:underline">{e.email}</a> · <a href={`tel:${e.phone}`} className="hover:underline">{e.phone}</a> · {formatDate(e.createdAt)}
                </p>
                {e.message && <p className="mt-1 rounded-lg bg-muted/50 px-2.5 py-1.5 text-[12.5px]">“{e.message}”</p>}
              </div>
              <select className={inputClass + ' h-9 !w-36 shrink-0'} value={e.status} onChange={(ev) => set.mutate({ id: e.id, status: ev.target.value as PlanEnquiryStatus })} aria-label="Status">
                {PLAN_ENQUIRY_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s === 'NEW' ? 'New' : s === 'CONTACTED' ? 'Contacted' : s === 'WON' ? 'Won' : 'Closed'}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

const blankAddon: AddonInput = { code: '', name: '', description: null, pricing: 'FIXED', priceKobo: null, unitLabel: null, isActive: true, sortOrder: 0 };

function Catalogue({ addons }: { addons: AddonRow[] }) {
  const role = usePlatformRole();
  const canEdit = role === 'SUPER_ADMIN' || role === 'FINANCE_ADMIN';
  const [edit, setEdit] = useState<AddonRow | 'new' | null>(null);
  return (
    <Section
      title={<><Package className="size-4 text-muted-foreground" /> Add-on catalogue</>}
      description="Sold per school and invoiced on the platform invoice. “Quote” items create a request here instead of an instant price."
      flush
      actions={
        canEdit && (
          <Button size="sm" variant="outline" onClick={() => setEdit('new')}>
            <Plus /> Add-on
          </Button>
        )
      }
    >
      <ul className="divide-y divide-border">
        {addons.map((a) => (
          <li key={a.id} className="flex items-start justify-between gap-3 px-5 py-3 text-[13px] sm:px-6">
            <div className="min-w-0">
              <p className="font-medium">
                {a.name} {!a.isActive && <Badge variant="outline">Off</Badge>}
              </p>
              {a.description && <p className="text-[12px] text-muted-foreground">{a.description}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="font-medium tabular">{addonPrice(a)}</span>
              {canEdit && (
                <Button size="icon-sm" variant="ghost" aria-label={`Edit ${a.name}`} onClick={() => setEdit(a)}>
                  <Pencil />
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <AddonDialog addon={edit} onClose={() => setEdit(null)} />
    </Section>
  );
}

function AddonDialog({ addon, onClose }: { addon: AddonRow | 'new' | null; onClose: () => void }) {
  const [v, setV] = useState<AddonInput>(blankAddon);
  const [price, setPrice] = useState('');
  useEffect(() => {
    if (!addon) return;
    const base = addon === 'new' ? blankAddon : addon;
    setV({ code: base.code, name: base.name, description: base.description, pricing: base.pricing, priceKobo: base.priceKobo, unitLabel: base.unitLabel, isActive: base.isActive, sortOrder: base.sortOrder });
    setPrice(base.priceKobo ? String(base.priceKobo / 100) : '');
  }, [addon]);
  const save = useMutation({
    mutationFn: () => {
      const body = { ...v, priceKobo: v.pricing === 'FIXED' ? toKobo(price) : null };
      return addon === 'new' ? api.post('/platform/addons', body) : api.put(`/platform/addons/${(addon as AddonRow).id}`, body);
    },
    onSuccess: () => {
      toast.success('Add-on saved');
      refresh();
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <FormDialog
      open={!!addon}
      onOpenChange={(o) => !o && onClose()}
      title={addon === 'new' ? 'New add-on' : `Edit ${(addon as AddonRow | null)?.name ?? ''}`}
      icon={<Package />}
      submitLabel="Save"
      pending={save.isPending}
      onSubmit={(e) => {
        e?.preventDefault();
        save.mutate();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="ad-name">
          <Input id="ad-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </Field>
        <Field label="Code" htmlFor="ad-code" hint="Lowercase letters, numbers and dashes">
          <Input id="ad-code" className="font-mono" value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} />
        </Field>
        <Field label="Description" htmlFor="ad-desc" optional className="sm:col-span-2">
          <Textarea id="ad-desc" rows={2} value={v.description ?? ''} onChange={(e) => setV({ ...v, description: e.target.value || null })} maxLength={300} />
        </Field>
        <Field label="Pricing" htmlFor="ad-pricing">
          <select id="ad-pricing" className={inputClass} value={v.pricing} onChange={(e) => setV({ ...v, pricing: e.target.value as AddonInput['pricing'] })}>
            {ADDON_PRICING.map((p) => (
              <option key={p} value={p}>
                {p === 'FIXED' ? 'Fixed price' : 'Quote on request'}
              </option>
            ))}
          </select>
        </Field>
        {v.pricing === 'FIXED' && (
          <Field label="Price (₦)" htmlFor="ad-price">
            <Input id="ad-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="50000" />
          </Field>
        )}
        <Field label="Unit" htmlFor="ad-unit" optional hint="e.g. per template, per day">
          <Input id="ad-unit" value={v.unitLabel ?? ''} onChange={(e) => setV({ ...v, unitLabel: e.target.value || null })} maxLength={40} />
        </Field>
        <Field label="Order" htmlFor="ad-sort">
          <Input id="ad-sort" type="number" min={0} value={v.sortOrder} onChange={(e) => setV({ ...v, sortOrder: Math.max(0, Number(e.target.value) || 0) })} />
        </Field>
      </div>
      <div className="mt-4">
        <SwitchRow label="Offered to schools" description="Off hides it from the pricing page and billing">
          <Switch checked={v.isActive} onCheckedChange={(isActive) => setV({ ...v, isActive })} />
        </SwitchRow>
      </div>
    </FormDialog>
  );
}

function SettingsCard({ settings }: { settings: PricingSettings }) {
  const role = usePlatformRole();
  const canEdit = role === 'SUPER_ADMIN' || role === 'FINANCE_ADMIN';
  const [policy, setPolicy] = useState(settings.smsOverage);
  const [price, setPrice] = useState(String(settings.smsOverageKobo / 100));
  const [notes, setNotes] = useState(settings.notes.join('\n'));
  useEffect(() => {
    setPolicy(settings.smsOverage);
    setPrice(String(settings.smsOverageKobo / 100));
    setNotes(settings.notes.join('\n'));
  }, [settings]);
  const save = useMutation({
    mutationFn: () =>
      api.put('/platform/pricing/settings', {
        smsOverage: policy,
        smsOverageKobo: toKobo(price) ?? 0,
        notes: notes.split('\n').map((l) => l.trim()).filter(Boolean),
      }),
    onSuccess: () => {
      toast.success('Price list settings saved');
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const runSms = useMutation({
    mutationFn: () => api.post<{ done: number }>('/platform/pricing/run-sms', {}),
    onSuccess: (r) => toast.success(`SMS checks run: ${r.done} warning(s) or invoice(s)`),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Section
      title={<><Settings2 className="size-4 text-muted-foreground" /> SMS past the allowance and price notes</>}
      description="Included SMS go out on the platform’s Termii account (PLATFORM_TERMII_API_KEY and PLATFORM_TERMII_SENDER_ID) for schools without their own. Schools are warned at 80% and 100%."
      actions={
        <Button size="sm" variant="outline" onClick={() => runSms.mutate()} loading={runSms.isPending}>
          Run SMS checks now
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="When a school’s included SMS are used up" htmlFor="sms-pol">
          <select id="sms-pol" className={inputClass} value={policy} disabled={!canEdit} onChange={(e) => setPolicy(e.target.value as typeof policy)}>
            {SMS_OVERAGE_POLICIES.map((p) => (
              <option key={p} value={p}>
                {SMS_OVERAGE_LABELS[p]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Price per extra SMS page (₦)" htmlFor="sms-price" hint="Billed after the term on a separate invoice">
          <Input id="sms-price" inputMode="decimal" value={price} disabled={!canEdit} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <Field label="Notes shown with the prices" htmlFor="pr-notes" hint="One per line. Confirm VAT and payment-charge wording with your accountant." className="sm:col-span-2">
          <Textarea id="pr-notes" rows={5} value={notes} disabled={!canEdit} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      {canEdit && (
        <div className="mt-4 flex justify-end">
          <Button onClick={() => save.mutate()} loading={save.isPending}>
            Save
          </Button>
        </div>
      )}
    </Section>
  );
}
