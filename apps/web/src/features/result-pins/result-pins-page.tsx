import { createPinBatchSchema, type PinBatchRow, type PinExport, type ResultPinChannel } from '@aischool/shared';
import { AlertTriangle, Ban, CalendarClock, Download, ExternalLink, Globe2, History, KeyRound, Plus, Printer, Search, ShoppingBag, Ticket, Unlock } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { type Column, DataTable } from '@/components/ui/data-table';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { errorMessage } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';
import { useStructure } from '../academics/api';
import { money, useCurrency } from '../finance/ui';
import { useExportBatch, useExtendBatch, useGenerateBatch, usePinCard, usePinOverview, usePinSales, usePinUses, useSellPins, useUnlockCard, useVoidBatch, useVoidCard } from './api';
import { downloadText, PinCardSheet, pinCsv } from './print-sheet';

const scopeOf = (b: PinBatchRow) => (b.termName ? `${b.termName}, ${b.sessionName}` : `Any term, ${b.sessionName}`);

export default function ResultPinsPage() {
  const q = usePinOverview();
  const canManage = useCan('finance.manage');
  const currency = useCurrency();
  const [creating, setCreating] = React.useState(false);
  const [exported, setExported] = React.useState<PinExport | null>(null);
  const [selling, setSelling] = React.useState(false);
  const [extending, setExtending] = React.useState<PinBatchRow | null>(null);
  const [voiding, setVoiding] = React.useState<PinBatchRow | null>(null);
  const [printing, setPrinting] = React.useState<PinBatchRow | null>(null);
  const exportBatch = useExportBatch();

  // The PINs exist only in this page once exported: warn before leaving it.
  React.useEffect(() => {
    if (!exported) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [exported]);

  if (exported) return <ExportedView data={exported} currency={currency} onDone={() => setExported(null)} />;

  const o = q.data;
  const checker = o ? `${window.location.origin}${o.checkerUrl}` : '';
  const columns: Column<PinBatchRow>[] = [
    {
      key: 'batch',
      header: 'Batch',
      cell: (b) => (
        <div className="min-w-0">
          <p className="font-medium">
            Batch {b.number}
            {b.label ? ` · ${b.label}` : ''}
          </p>
          <p className="font-mono text-[12px] text-muted-foreground">
            {b.firstSerial}–{b.lastSerial}
          </p>
        </div>
      ),
    },
    { key: 'scope', header: 'For', cell: (b) => <span className="text-[13px]">{scopeOf(b)}</span> },
    { key: 'channel', header: 'Sold', cell: (b) => <Badge variant={b.channel === 'ONLINE' ? 'info' : 'secondary'}>{b.channel === 'ONLINE' ? 'Online' : 'Printed'}</Badge> },
    {
      key: 'counts',
      header: 'Cards',
      cell: (b) => (
        <span className="text-[12.5px] tabular">
          {formatNumber(b.count)} · {b.counts.sold} sold · {b.counts.used} used
          {b.counts.void ? ` · ${b.counts.void} void` : ''}
        </span>
      ),
    },
    { key: 'revenue', header: 'Revenue', cell: (b) => <span className="tabular">{money(b.channel === 'ONLINE' ? b.onlineKobo : b.revenueKobo, currency)}</span> },
    { key: 'expires', header: 'Expires', cell: (b) => <span className={b.expired ? 'text-danger' : ''}>{formatDate(b.expiresOn)}</span> },
    { key: 'status', header: 'Status', cell: (b) => <BatchStatus b={b} /> },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      cell: (b) => (canManage ? <BatchActions b={b} onPrint={() => setPrinting(b)} onExtend={() => setExtending(b)} onVoid={() => setVoiding(b)} /> : null),
    },
  ];

  return (
    <Page>
      <PageHeader
        title="Result checker cards"
        description="Scratch-card PINs parents use to check published results on your website — a revenue line for the school. Parents in the portal see results free unless you require a PIN there too."
        actions={
          canManage && (
            <>
              <Button variant="outline" onClick={() => setSelling(true)}>
                <ShoppingBag /> Record sale
              </Button>
              <Button onClick={() => setCreating(true)}>
                <Plus /> Generate cards
              </Button>
            </>
          )
        }
      />
      {q.error && !o ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !o ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Cards issued" value={formatNumber(o.totals.cards)} />
            <Stat label="Recorded sold" value={formatNumber(o.totals.sold)} />
            <Stat label="Used" value={formatNumber(o.totals.used)} hint={`${formatNumber(o.totals.checks)} checks`} />
            <Stat label="Unused" value={formatNumber(o.totals.unused)} />
            <Stat label="Revenue" value={money(o.totals.revenueKobo + o.totals.onlineKobo, o.currency)} hint={o.totals.onlineKobo ? `${money(o.totals.onlineKobo, o.currency)} paid online` : 'cards sold × price'} />
          </div>
          <Card className="mb-5 flex flex-col gap-2 p-4 text-[13px] sm:flex-row sm:items-center sm:justify-between">
            <p className="min-w-0">
              <Globe2 className="mr-1.5 inline size-4 text-muted-foreground" aria-hidden />
              Parents check results at <a href={checker} target="_blank" rel="noreferrer" className="break-all font-medium text-brand hover:underline">{checker}</a>
              <span className="text-muted-foreground"> — or /check-result on your own website domain.</span>
            </p>
            {!o.onlineReady && (
              <p className="text-[12.5px] text-muted-foreground">
                To sell cards online, <Link to="/fees" className="font-medium text-brand hover:underline">connect Paystack</Link> and switch on online payments.
              </p>
            )}
          </Card>
          <Tabs defaultValue="batches">
            <TabsList className="mb-4 w-full overflow-x-auto sm:w-auto">
              <TabsTrigger value="batches"><Ticket /> Batches</TabsTrigger>
              <TabsTrigger value="lookup"><Search /> Find a card</TabsTrigger>
              <TabsTrigger value="usage"><History /> Usage log</TabsTrigger>
              <TabsTrigger value="sales"><ShoppingBag /> Online sales</TabsTrigger>
            </TabsList>
            <TabsContent value="batches">
              <Card className="overflow-hidden">
                <DataTable
                  columns={columns}
                  rows={o.batches}
                  rowKey={(b) => b.id}
                  renderMobile={(b) => (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">Batch {b.number}{b.label ? ` · ${b.label}` : ''}</p>
                        <BatchStatus b={b} />
                      </div>
                      <p className="text-[12.5px] text-muted-foreground">{scopeOf(b)} · {b.channel === 'ONLINE' ? 'online' : 'printed'} · expires {formatDate(b.expiresOn)}</p>
                      <p className="text-[12.5px] tabular">{b.count} cards · {b.counts.sold} sold · {b.counts.used} used · {money(b.channel === 'ONLINE' ? b.onlineKobo : b.revenueKobo, currency)}</p>
                    </div>
                  )}
                  mobileActions={(b) => (canManage ? <BatchActions b={b} onPrint={() => setPrinting(b)} onExtend={() => setExtending(b)} onVoid={() => setVoiding(b)} /> : null)}
                  empty={{ icon: Ticket, title: 'No cards yet', description: 'Generate a batch of result checker cards, print them once, and sell them to parents.' }}
                />
              </Card>
              {o.batches.some((b) => b.counts.usedNotRecordedSold > 0) && (
                <p className="mt-3 flex gap-2 text-[12.5px] text-muted-foreground">
                  <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />
                  {o.batches.reduce((n, b) => n + b.counts.usedNotRecordedSold, 0)} printed cards have been used but were not recorded as sold. Record the sales, or switch on “Only works once sold” for new batches.
                </p>
              )}
            </TabsContent>
            <TabsContent value="lookup">
              <CardLookup canManage={canManage} />
            </TabsContent>
            <TabsContent value="usage">
              <UsageLog batches={o.batches} />
            </TabsContent>
            <TabsContent value="sales">
              <SalesLog currency={currency} />
            </TabsContent>
          </Tabs>
        </>
      )}

      <GenerateDialog open={creating} onOpenChange={setCreating} onlineReady={!!o?.onlineReady} />
      <SellDialog open={selling} onOpenChange={setSelling} />
      <ExtendDialog batch={extending} onClose={() => setExtending(null)} />
      <VoidBatchDialog batch={voiding} onClose={() => setVoiding(null)} />
      <Dialog open={!!printing} onOpenChange={(v) => !v && setPrinting(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <div className="mb-2 grid size-10 place-items-center rounded-xl bg-warning-soft text-warning [&_svg]:size-5"><AlertTriangle /></div>
            <DialogTitle>Print batch {printing?.number}? This works once.</DialogTitle>
            <DialogDescription>
              The {printing?.count} PINs are shown one time only — for printing and a CSV download — and then deleted from our servers. If the printout is lost, the only fix is to void the batch and generate new cards. Have the printer ready.
            </DialogDescription>
          </DialogHeader>
          {exportBatch.error && <DialogBody><p className="text-[13px] text-danger">{errorMessage(exportBatch.error)}</p></DialogBody>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrinting(null)}>Cancel</Button>
            <Button
              loading={exportBatch.isPending}
              onClick={() =>
                printing &&
                exportBatch.mutate(printing.id, {
                  onSuccess: (d) => {
                    setPrinting(null);
                    setExported(d);
                  },
                })
              }
            >
              <Printer /> Show the PINs now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-[12px] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-display text-xl font-semibold tabular">{value}</p>
      {hint && <p className="truncate text-[11.5px] text-muted-foreground">{hint}</p>}
    </Card>
  );
}

function BatchStatus({ b }: { b: PinBatchRow }) {
  if (b.status === 'VOID') return <Badge variant="danger">Void</Badge>;
  if (b.expired) return <Badge variant="warning">Expired</Badge>;
  if (b.channel === 'PRINT' && !b.exportedAt) return <Badge variant="info">Not printed</Badge>;
  return <Badge variant="success">Active</Badge>;
}

function BatchActions({ b, onPrint, onExtend, onVoid }: { b: PinBatchRow; onPrint: () => void; onExtend: () => void; onVoid: () => void }) {
  return (
    <div className="flex justify-end gap-1">
      {b.channel === 'PRINT' && !b.exportedAt && b.status === 'ACTIVE' && (
        <Button size="sm" onClick={onPrint}>
          <Printer /> Print
        </Button>
      )}
      {b.status === 'ACTIVE' && (
        <>
          <Button size="sm" variant="ghost" onClick={onExtend} aria-label={`Change expiry of batch ${b.number}`}>
            <CalendarClock />
          </Button>
          <Button size="sm" variant="ghost" onClick={onVoid} aria-label={`Void batch ${b.number}`}>
            <Ban />
          </Button>
        </>
      )}
    </div>
  );
}

function ExportedView({ data, currency, onDone }: { data: PinExport; currency: string; onDone: () => void }) {
  const [downloaded, setDownloaded] = React.useState(false);
  return (
    <Page className="print:max-w-none print:p-0">
      <div className="print:hidden">
        <PageHeader
          title={`Batch ${data.batch.number}: ${data.cards.length} cards`}
          description="Print now (A4, ten cards a page) and/or download the CSV for a card printer. These PINs will not be shown again once you leave this page."
          actions={
            <>
              <Button
                variant="outline"
                onClick={() => {
                  downloadText(`result-cards-batch-${data.batch.number}.csv`, pinCsv(data));
                  setDownloaded(true);
                }}
              >
                <Download /> Download CSV
              </Button>
              <Button onClick={() => window.print()}>
                <Printer /> Print cards
              </Button>
            </>
          }
        />
        <Card className="mb-5 flex gap-3 border-warning/40 bg-warning-soft/40 p-4 text-[13px]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-medium">Keep these safe — this is the only copy.</p>
            <p className="text-muted-foreground">Cover each PIN with a scratch-off sticker or fold-over strip after printing. Store unsold cards locked away; anyone with a card can check one student’s result.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => (downloaded || window.confirm('Leave without downloading the CSV? Make sure the cards are printed — the PINs cannot be shown again.')) && onDone()}>
            Done
          </Button>
        </Card>
      </div>
      <PinCardSheet data={data} currency={currency} />
    </Page>
  );
}

// ------------------------------------------------------------------ dialogs

function GenerateDialog({ open, onOpenChange, onlineReady }: { open: boolean; onOpenChange: (v: boolean) => void; onlineReady: boolean }) {
  const structure = useStructure();
  const gen = useGenerateBatch();
  const sessions = structure.data?.sessions ?? [];
  const blank = () => {
    const s = sessions.find((x) => x.isCurrent) ?? sessions[0];
    return { label: '', channel: 'PRINT' as ResultPinChannel, sessionId: s?.id ?? '', termId: '', count: '100', usesPerPin: '5', price: '1000', expiresOn: s?.endsOn ?? '', requireSale: false };
  };
  const [v, setV] = React.useState(blank);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  React.useEffect(() => {
    if (open) {
      setV(blank());
      setErrors({});
      gen.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, structure.data]);
  const session = sessions.find((s) => s.id === v.sessionId);
  const set = (p: Partial<typeof v>) => setV((x) => ({ ...x, ...p }));
  const submit = (e?: React.BaseSyntheticEvent) => {
    e?.preventDefault();
    const parsed = createPinBatchSchema.safeParse({
      label: v.label,
      channel: v.channel,
      sessionId: v.sessionId,
      termId: v.termId || null,
      count: Number(v.count),
      usesPerPin: Number(v.usesPerPin),
      priceKobo: Math.round(Number(v.price) * 100),
      expiresOn: v.expiresOn,
      requireSale: v.requireSale,
    });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    gen.mutate(parsed.data, { onSuccess: () => onOpenChange(false) });
  };
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Generate result checker cards" icon={<KeyRound />} submitLabel="Generate" pending={gen.isPending} onSubmit={submit} description="Each card gets a printed serial number and a secret 12-digit PIN. PINs are stored only as a fingerprint.">
      <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
        <Field label="How they are sold" htmlFor="pb-ch" className="sm:col-span-2">
          <Select value={v.channel} onValueChange={(c) => set({ channel: c as ResultPinChannel })}>
            <SelectTrigger id="pb-ch"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="PRINT">Printed cards — the bursar sells them</SelectItem>
              <SelectItem value="ONLINE" disabled={!onlineReady}>Online — parents pay by Paystack and get a PIN{onlineReady ? '' : ' (connect Paystack first)'}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Session" htmlFor="pb-s" error={errors.sessionId}>
          <Select value={v.sessionId} onValueChange={(s) => set({ sessionId: s, termId: '', expiresOn: sessions.find((x) => x.id === s)?.endsOn ?? v.expiresOn })}>
            <SelectTrigger id="pb-s"><SelectValue placeholder="Choose" /></SelectTrigger>
            <SelectContent>
              {sessions.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Term" htmlFor="pb-t" hint="“Any term” cards work for every term of the session.">
          <Select value={v.termId || NONE} onValueChange={(t) => set({ termId: t === NONE ? '' : t })}>
            <SelectTrigger id="pb-t"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Any term in the session</SelectItem>
              {session?.terms.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Number of cards" htmlFor="pb-n" error={errors.count} hint="Up to 5,000 in one batch.">
          <Input id="pb-n" type="number" inputMode="numeric" min={1} max={5000} value={v.count} onChange={(e) => set({ count: e.target.value })} className="tabular" />
        </Field>
        <Field label="Checks per card" htmlFor="pb-u" error={errors.usesPerPin} hint="Each view of the result uses one.">
          <Input id="pb-u" type="number" inputMode="numeric" min={1} max={50} value={v.usesPerPin} onChange={(e) => set({ usesPerPin: e.target.value })} className="tabular" />
        </Field>
        <Field label="Price per card (₦)" htmlFor="pb-p" error={errors.priceKobo}>
          <Input id="pb-p" type="number" inputMode="decimal" min={0} value={v.price} onChange={(e) => set({ price: e.target.value })} className="tabular" />
        </Field>
        <Field label="Expires on" htmlFor="pb-e" error={errors.expiresOn}>
          <Input id="pb-e" type="date" value={v.expiresOn} onChange={(e) => set({ expiresOn: e.target.value })} />
        </Field>
        <Field label="Label" htmlFor="pb-l" optional className="sm:col-span-2">
          <Input id="pb-l" maxLength={80} placeholder="e.g. Third term 2026 — main office" value={v.label} onChange={(e) => set({ label: e.target.value })} />
        </Field>
        {v.channel === 'PRINT' && (
          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border bg-muted/30 px-4 py-3 sm:col-span-2">
            <span>
              <span className="block text-[13.5px] font-medium">Only works once recorded as sold</span>
              <span className="block text-[12px] text-muted-foreground">Safer if unsold cards could go missing; the bursar must record each sale first.</span>
            </span>
            <Switch checked={v.requireSale} onCheckedChange={(c) => set({ requireSale: c })} aria-label="Only works once recorded as sold" />
          </label>
        )}
        {gen.error && <p className="text-[13px] text-danger sm:col-span-2">{errorMessage(gen.error)}</p>}
      </div>
    </FormDialog>
  );
}

function SellDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const sell = useSellPins();
  const [v, setV] = React.useState({ fromSerial: '', toSerial: '', soldTo: '' });
  React.useEffect(() => {
    if (open) {
      setV({ fromSerial: '', toSerial: '', soldTo: '' });
      sell.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Record cards as sold"
      icon={<ShoppingBag />}
      submitLabel="Record sale"
      pending={sell.isPending}
      description="Enter the first and last serial numbers of the stack sold (one card: the same number twice)."
      onSubmit={(e) => {
        e?.preventDefault();
        sell.mutate({ fromSerial: v.fromSerial.trim(), toSerial: (v.toSerial || v.fromSerial).trim(), soldTo: v.soldTo.trim() || null }, { onSuccess: () => onOpenChange(false) });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
        <Field label="First serial" htmlFor="ps-a">
          <Input id="ps-a" inputMode="numeric" className="font-mono" value={v.fromSerial} onChange={(e) => setV((x) => ({ ...x, fromSerial: e.target.value }))} />
        </Field>
        <Field label="Last serial" htmlFor="ps-b">
          <Input id="ps-b" inputMode="numeric" className="font-mono" value={v.toSerial} onChange={(e) => setV((x) => ({ ...x, toSerial: e.target.value }))} />
        </Field>
        <Field label="Sold to" htmlFor="ps-c" optional className="sm:col-span-2" hint="A parent’s name, or e.g. “JSS 2 class teacher”.">
          <Input id="ps-c" maxLength={120} value={v.soldTo} onChange={(e) => setV((x) => ({ ...x, soldTo: e.target.value }))} />
        </Field>
        {sell.error && <p className="text-[13px] text-danger sm:col-span-2">{errorMessage(sell.error)}</p>}
      </div>
    </FormDialog>
  );
}

function ExtendDialog({ batch, onClose }: { batch: PinBatchRow | null; onClose: () => void }) {
  const ext = useExtendBatch();
  const [date, setDate] = React.useState('');
  React.useEffect(() => {
    if (batch) {
      setDate(batch.expiresOn);
      ext.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batch]);
  return (
    <FormDialog open={!!batch} onOpenChange={(o) => !o && onClose()} title={`Change expiry of batch ${batch?.number ?? ''}`} icon={<CalendarClock />} submitLabel="Save" pending={ext.isPending} onSubmit={(e) => { e?.preventDefault(); if (batch) ext.mutate({ id: batch.id, expiresOn: date }, { onSuccess: onClose }); }}>
      <Field label="Cards work until the end of" htmlFor="pe-d">
        <Input id="pe-d" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      {ext.error && <p className="mt-3 text-[13px] text-danger">{errorMessage(ext.error)}</p>}
    </FormDialog>
  );
}

function VoidBatchDialog({ batch, onClose }: { batch: PinBatchRow | null; onClose: () => void }) {
  const voidBatch = useVoidBatch();
  const [reason, setReason] = React.useState('');
  React.useEffect(() => {
    if (batch) {
      setReason('');
      voidBatch.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batch]);
  return (
    <FormDialog open={!!batch} onOpenChange={(o) => !o && onClose()} title={`Void batch ${batch?.number ?? ''}?`} icon={<Ban />} submitLabel="Void every card" pending={voidBatch.isPending} description="Every card in the batch stops working at once, including sold ones. Use this when a printout is lost or stolen, then generate new cards." onSubmit={(e) => { e?.preventDefault(); if (batch) voidBatch.mutate({ id: batch.id, reason }, { onSuccess: onClose }); }}>
      <Field label="Reason" htmlFor="pv-r">
        <Input id="pv-r" maxLength={200} placeholder="e.g. Printout lost" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {voidBatch.error && <p className="mt-3 text-[13px] text-danger">{errorMessage(voidBatch.error)}</p>}
    </FormDialog>
  );
}

// ------------------------------------------------------------------ tabs

function CardLookup({ canManage }: { canManage: boolean }) {
  const [input, setInput] = React.useState('');
  const [serial, setSerial] = React.useState('');
  const card = usePinCard(serial);
  const voidCard = useVoidCard();
  const unlock = useUnlockCard();
  const [reason, setReason] = React.useState('');
  const c = card.data;
  return (
    <Card className="p-4 sm:p-5">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSerial(input.replace(/[\s-]/g, ''));
        }}
      >
        <Input aria-label="Serial number" inputMode="numeric" placeholder="Serial number on the card" className="max-w-xs font-mono" value={input} onChange={(e) => setInput(e.target.value)} />
        <Button type="submit" variant="outline"><Search /> Find</Button>
      </form>
      {card.isLoading && <Skeleton className="mt-4 h-32 rounded-xl" />}
      {card.error && <p className="mt-4 text-[13px] text-danger">{errorMessage(card.error)}</p>}
      {c && (
        <div className="mt-4 space-y-4">
          <dl className="grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4">
            <Info k="Serial" v={<span className="font-mono">{c.serial}</span>} />
            <Info k="PIN ends" v={<span className="font-mono">…{c.last4}</span>} />
            <Info k="Status" v={<Badge variant={c.status === 'VOID' ? 'danger' : c.status === 'SOLD' ? 'success' : 'secondary'}>{c.status === 'VOID' ? 'Void' : c.status === 'SOLD' ? 'Sold' : 'Not recorded sold'}</Badge>} />
            <Info k="Checks left" v={`${c.usesLeft} of ${c.usesPerPin}`} />
            <Info k="Batch" v={`${c.batch.number} · ${c.batch.termName ?? 'Any term'}, ${c.batch.sessionName}`} />
            <Info k="Expires" v={formatDate(c.batch.expiresOn)} />
            <Info k="Student" v={c.student ? `${c.student.name} (${c.student.admissionNumber})` : 'Not used yet'} />
            <Info k="Sold" v={c.soldAt ? `${formatDate(c.soldAt)}${c.soldTo ? ` to ${c.soldTo}` : ''}${c.soldVia === 'ONLINE' ? ' (online)' : ''}` : '—'} />
          </dl>
          {c.voidReason && <p className="text-[13px] text-danger">Voided: {c.voidReason}</p>}
          {canManage && c.lockedUntil && (
            <div className="flex items-center gap-3 rounded-xl border border-warning/40 bg-warning-soft/40 p-3 text-[13px]">
              <span className="flex-1">Locked after wrong tries until {formatDateTime(c.lockedUntil)}.</span>
              <Button size="sm" variant="outline" loading={unlock.isPending} onClick={() => unlock.mutate(c.serial, { onSuccess: () => void card.refetch() })}><Unlock /> Unlock</Button>
            </div>
          )}
          {canManage && c.status !== 'VOID' && (
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Void this card (lost or stolen)" htmlFor="pc-r" className="min-w-0 flex-1">
                <Input id="pc-r" maxLength={200} placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
              <Button variant="outline" disabled={reason.trim().length < 2} loading={voidCard.isPending} onClick={() => voidCard.mutate({ serial: c.serial, reason }, { onSuccess: () => { setReason(''); void card.refetch(); } })}>
                <Ban /> Void card
              </Button>
            </div>
          )}
          {c.uses.length > 0 && (
            <ul className="divide-y divide-border rounded-xl border border-border text-[13px]">
              {c.uses.map((u) => (
                <li key={u.id} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                  <span>{formatDateTime(u.at)} · {u.term}</span>
                  <span className="text-muted-foreground">{u.channel === 'PORTAL' ? 'Portal' : 'Website'}{u.ipHash ? ` · device ${u.ipHash.slice(0, 6)}` : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

function Info({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] text-muted-foreground">{k}</dt>
      <dd className="mt-0.5 break-words font-medium">{v}</dd>
    </div>
  );
}

function UsageLog({ batches }: { batches: PinBatchRow[] }) {
  const [batchId, setBatchId] = React.useState('');
  const q = usePinUses(batchId);
  return (
    <>
      <div className="mb-3 max-w-xs">
        <Select value={batchId || NONE} onValueChange={(b) => setBatchId(b === NONE ? '' : b)}>
          <SelectTrigger aria-label="Batch"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>All batches</SelectItem>
            {batches.map((b) => <SelectItem key={b.id} value={b.id}>Batch {b.number}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Card className="overflow-hidden">
        <DataTable
          columns={[
            { key: 'at', header: 'When', cell: (u) => formatDateTime(u.at) },
            { key: 'serial', header: 'Serial', cell: (u) => <span className="font-mono text-[12.5px]">{u.serial}</span> },
            { key: 'student', header: 'Student', cell: (u) => `${u.student} (${u.admissionNumber})` },
            { key: 'term', header: 'Term', cell: (u) => u.term },
            { key: 'where', header: 'Where', cell: (u) => (u.channel === 'PORTAL' ? 'Portal' : 'Website') },
            { key: 'ip', header: 'Device', cell: (u) => <span className="font-mono text-[12px] text-muted-foreground">{u.ipHash ?? '—'}</span> },
          ]}
          rows={q.data}
          rowKey={(u) => u.id}
          loading={q.isLoading}
          error={q.error}
          onRetry={() => void q.refetch()}
          renderMobile={(u) => (
            <div>
              <p className="font-medium">{u.student}</p>
              <p className="text-[12px] text-muted-foreground">{formatDateTime(u.at)} · card {u.serial} · {u.term}</p>
            </div>
          )}
          empty={{ icon: History, title: 'No checks yet', description: 'Each successful result check appears here. “Device” is a one-way code for the visitor’s internet address, not the address itself.' }}
        />
      </Card>
    </>
  );
}

function SalesLog({ currency }: { currency: string }) {
  const q = usePinSales(true);
  return (
    <Card className="overflow-hidden">
      <DataTable
        columns={[
          { key: 'at', header: 'When', cell: (s) => formatDateTime(s.at) },
          { key: 'buyer', header: 'Buyer', cell: (s) => <span>{s.buyerName}<span className="block text-[12px] text-muted-foreground">{s.email}{s.phone ? ` · ${s.phone}` : ''}</span></span> },
          { key: 'amount', header: 'Amount', cell: (s) => <span className="tabular">{money(s.amountKobo, currency)}</span> },
          { key: 'card', header: 'Card', cell: (s) => <span className="font-mono text-[12.5px]">{s.serial ?? '—'}</span> },
          { key: 'status', header: 'Status', cell: (s) => <Badge variant={s.status === 'PAID' ? 'success' : s.status === 'PENDING' ? 'secondary' : 'danger'}>{s.status === 'PAID_NO_CARD' ? 'Paid — no card left' : s.status.toLowerCase()}</Badge> },
          { key: 'ref', header: 'Reference', cell: (s) => <span className="font-mono text-[11.5px] text-muted-foreground">{s.reference}</span> },
        ]}
        rows={q.data}
        rowKey={(s) => s.id}
        loading={q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        renderMobile={(s) => (
          <div>
            <p className="font-medium">{s.buyerName} · {money(s.amountKobo, currency)}</p>
            <p className="text-[12px] text-muted-foreground">{formatDateTime(s.at)} · {s.status === 'PAID' ? `card ${s.serial}` : s.status.toLowerCase()}</p>
          </div>
        )}
        empty={{ icon: ExternalLink, title: 'No online sales yet', description: 'Generate an “Online” batch and parents can buy a card on your result checker page.' }}
      />
    </Card>
  );
}
