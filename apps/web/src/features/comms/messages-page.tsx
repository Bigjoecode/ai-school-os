import { BROADCAST_SOURCES, type BroadcastRow, type BroadcastSource, type Channel, CHANNEL_LABELS, type CommsOverview } from '@aischool/shared';
import { AlertTriangle, CalendarClock, CheckCircle2, Coins, Gift, Inbox, Mail, MessageCircle, PenLine, Plus, Send, Settings, Smartphone, Trash2, XCircle } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tip } from '@/components/ui/tooltip';
import { useCan } from '@/lib/auth-store';
import { formatNumber, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { StatTile } from '../attendance/ui';
import { schoolDateTime } from '../finance/ui';
import { Segmented } from '../operations/ui';
import { useBroadcasts, useCancelBroadcast, useCommsOverview, useDeleteBroadcast } from './api';
import { BroadcastStatusBadge, CHANNEL_ICON, ChannelIcons, DeliveryBar, money, SOURCE_LABELS, SourceBadge } from './ui';

type Tab = 'sent' | 'scheduled' | 'drafts';

export default function MessagesPage() {
  const canSend = useCan('comms.send');
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'scheduled' ? 'scheduled' : params.get('tab') === 'drafts' ? 'drafts' : 'sent';
  const source = (BROADCAST_SOURCES as readonly string[]).includes(params.get('source') ?? '') ? (params.get('source') as BroadcastSource) : undefined;
  const overview = useCommsOverview();
  const list = useBroadcasts(source ? { source } : {});

  const setParam = (key: string, value: string | null) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (value) p.set(key, value);
        else p.delete(key);
        return p;
      },
      { replace: true },
    );

  const rows = list.data ?? [];
  const sent = rows.filter((r) => r.status === 'SENT' || r.status === 'SENDING' || r.status === 'CANCELLED');
  const scheduled = rows.filter((r) => r.status === 'SCHEDULED').sort((a, b) => (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? ''));
  const drafts = rows.filter((r) => r.status === 'DRAFT');

  return (
    <Page>
      <PageHeader
        title="Messages"
        description="Email, SMS, WhatsApp and app notifications to parents and staff — with delivery reports."
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/messages/whatsapp">
                <MessageCircle /> WhatsApp assistant
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/messages/sms-ussd">
                <Smartphone /> SMS &amp; USSD
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/messages/settings">
                <Settings /> Settings
              </Link>
            </Button>
            {canSend && (
              <Button asChild>
                <Link to="/messages/new">
                  <Plus /> New message
                </Link>
              </Button>
            )}
          </>
        }
      />

      {overview.error && !overview.data ? (
        <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
      ) : (
        <div className="space-y-5">
          <OverviewStrip o={overview.data} />
          <Tabs value={tab} onValueChange={(t) => setParam('tab', t === 'sent' ? null : t)}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <TabsList aria-label="Messages">
                <TabsTrigger value="sent">
                  <Send /> Sent
                </TabsTrigger>
                <TabsTrigger value="scheduled">
                  <CalendarClock /> Scheduled
                  {scheduled.length > 0 && <span className="rounded-full bg-info-soft px-1.5 text-[10.5px] text-info tabular">{scheduled.length}</span>}
                </TabsTrigger>
                <TabsTrigger value="drafts">
                  <PenLine /> Drafts
                  {drafts.length > 0 && <span className="rounded-full bg-muted px-1.5 text-[10.5px] text-muted-foreground tabular">{drafts.length}</span>}
                </TabsTrigger>
              </TabsList>
              <Select value={source ?? NONE} onValueChange={(v) => setParam('source', v === NONE ? null : v)}>
                <SelectTrigger className="sm:w-48" aria-label="Filter by source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>All messages</SelectItem>
                  {BROADCAST_SOURCES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s === 'MANUAL' ? 'Written by staff' : SOURCE_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {list.error && !list.data ? (
              <ErrorState error={list.error} onRetry={() => void list.refetch()} className="mt-6" />
            ) : (
              <>
                <TabsContent value="sent">
                  <SentTab rows={sent} loading={list.isLoading} filtered={!!source} />
                </TabsContent>
                <TabsContent value="scheduled">
                  <BroadcastList
                    rows={scheduled}
                    loading={list.isLoading}
                    empty={<EmptyState icon={CalendarClock} title="Nothing scheduled" description="Schedule a message to go out later — the night before an event, or first thing on Monday." />}
                  />
                </TabsContent>
                <TabsContent value="drafts">
                  <BroadcastList
                    rows={drafts}
                    loading={list.isLoading}
                    empty={
                      <EmptyState
                        icon={PenLine}
                        title="No drafts"
                        description="Messages you save without sending wait here."
                        action={
                          canSend && (
                            <Button asChild size="sm">
                              <Link to="/messages/new">
                                <Plus /> New message
                              </Link>
                            </Button>
                          )
                        }
                      />
                    }
                  />
                </TabsContent>
              </>
            )}
          </Tabs>
        </div>
      )}
    </Page>
  );
}

// ------------------------------------------------------------------ overview strip

function OverviewStrip({ o }: { o: CommsOverview | undefined }) {
  const loading = !o;
  const m = o?.thisMonth;
  const month = new Intl.DateTimeFormat(undefined, { month: 'long' }).format(new Date());
  const delivered = m ? m.delivered + m.failed : 0;
  return (
    <div className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
        <StatTile label={`Messages in ${month}`} icon={<Send />} value={formatNumber(m?.broadcasts ?? 0)} sub="Sent or sending" loading={loading} />
        <StatTile
          label="Delivered"
          icon={<CheckCircle2 />}
          value={formatNumber(m?.delivered ?? 0)}
          sub={delivered ? `${Math.round(((m?.delivered ?? 0) / delivered) * 100)}% of attempts` : 'Nothing sent yet this month'}
          tone="success"
          loading={loading}
        />
        <StatTile label="Failed" icon={<XCircle />} value={formatNumber(m?.failed ?? 0)} sub={m?.failed ? 'Open a message to retry' : 'None failed'} tone={m?.failed ? 'danger' : undefined} loading={loading} />
        <StatTile label="SMS pages" icon={<Coins />} value={formatNumber(m?.smsUnits ?? 0)} sub={o ? `≈ ${money(m?.smsCostKobo ?? 0, o.currency)} this month` : undefined} loading={loading} />
      </div>
      {o && (
        <Card className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center">
          <p className="shrink-0 text-[12.5px] font-medium text-muted-foreground">Channels</p>
          <ul className="flex flex-wrap gap-1.5">
            {o.channels.map((c) => (
              <ChannelChip key={c.channel} channel={c.channel} configured={c.configured} detail={c.detail} serverManaged={c.serverManaged} />
            ))}
          </ul>
          {o.birthdaysToday.length > 0 && (
            <p className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted-foreground sm:ml-auto">
              <Gift className="size-3.5 shrink-0 text-chart-5" aria-hidden />
              <span className="truncate">
                Birthdays today: {o.birthdaysToday.slice(0, 3).map((b) => b.name.split(' ')[0]).join(', ')}
                {o.birthdaysToday.length > 3 && ` and ${o.birthdaysToday.length - 3} more`}
              </span>
            </p>
          )}
        </Card>
      )}
    </div>
  );
}

function ChannelChip({ channel, configured, detail, serverManaged }: { channel: Channel; configured: boolean; detail: string | null; serverManaged?: boolean }) {
  const Icon = CHANNEL_ICON[channel];
  const on = configured || channel === 'IN_APP';
  const chip = (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium',
        on ? 'border-success/30 bg-success-soft/60 text-foreground' : 'border-dashed border-border text-muted-foreground',
      )}
    >
      <Icon className={cn('size-3.5', on ? 'text-success' : 'text-muted-foreground')} aria-hidden />
      {CHANNEL_LABELS[channel]}
      {!on && <span className="text-[11px] font-normal">· {serverManaged ? 'Off' : 'Set up'}</span>}
    </span>
  );
  return (
    <li>
      <Tip label={on ? (detail ?? 'Ready') : serverManaged ? (detail ?? 'Needs setting up on the server') : 'Not set up yet'}>
        {on || serverManaged ? (
          chip
        ) : (
          <Link to="/messages/settings" className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {chip}
          </Link>
        )}
      </Tip>
    </li>
  );
}

// ------------------------------------------------------------------ lists

function SentTab({ rows, loading, filtered }: { rows: BroadcastRow[]; loading: boolean; filtered: boolean }) {
  const canSend = useCan('comms.send');
  const [status, setStatus] = useState<'ALL' | 'SENDING' | 'FAILED'>('ALL');
  const shown = status === 'ALL' ? rows : status === 'SENDING' ? rows.filter((r) => r.status === 'SENDING' || r.totals.queued > 0) : rows.filter((r) => r.totals.failed > 0);
  const failing = rows.filter((r) => r.totals.failed > 0).length;
  const sending = rows.filter((r) => r.status === 'SENDING' || r.totals.queued > 0).length;
  return (
    <div className="space-y-3">
      {rows.length > 0 && (
        <Segmented
          size="sm"
          label="Show"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'ALL', label: 'All' },
            { value: 'SENDING', label: 'Going out', count: sending },
            { value: 'FAILED', label: 'With failures', count: failing },
          ]}
        />
      )}
      <BroadcastList
        rows={shown}
        loading={loading}
        empty={
          rows.length > 0 ? (
            <EmptyState compact icon={CheckCircle2} title={status === 'FAILED' ? 'No failures' : 'Nothing going out right now'} description="Everything else has finished." />
          ) : (
            <EmptyState
              icon={Inbox}
              title={filtered ? 'No messages from this source' : 'No messages sent yet'}
              description={filtered ? 'Try another filter.' : 'Reach every parent in a class, families owing fees, or all staff — by email, SMS, WhatsApp and the app.'}
              action={
                canSend &&
                !filtered && (
                  <Button asChild size="sm">
                    <Link to="/messages/new">
                      <Mail /> Write your first message
                    </Link>
                  </Button>
                )
              }
            />
          )
        }
      />
    </div>
  );
}

function BroadcastList({ rows, loading, empty }: { rows: BroadcastRow[]; loading: boolean; empty: ReactNode }) {
  const canSend = useCan('comms.send');
  const cancel = useCancelBroadcast();
  const del = useDeleteBroadcast();
  const [deleting, setDeleting] = useState<BroadcastRow | null>(null);
  if (loading) {
    return (
      <Card className="divide-y divide-border">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2 p-4">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </Card>
    );
  }
  if (!rows.length) return <Card>{empty}</Card>;
  return (
    <>
      <Card className="divide-y divide-border overflow-hidden">
        {rows.map((r) => (
          <BroadcastItem
            key={r.id}
            r={r}
            canSend={canSend}
            onCancel={() => cancel.mutate(r.id)}
            cancelling={cancel.isPending && cancel.variables === r.id}
            onDelete={() => setDeleting(r)}
          />
        ))}
      </Card>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete “${deleting?.title ?? ''}”?`}
        description="The draft is removed for good."
        confirmLabel="Delete draft"
        loading={del.isPending}
        onConfirm={() => deleting && del.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
      />
    </>
  );
}

function BroadcastItem({ r, canSend, onCancel, cancelling, onDelete }: { r: BroadcastRow; canSend: boolean; onCancel: () => void; cancelling: boolean; onDelete: () => void }) {
  const t = r.totals;
  const href = r.status === 'DRAFT' && canSend ? `/messages/${r.id}/edit` : `/messages/${r.id}`;
  const when = r.status === 'SCHEDULED' ? r.scheduledAt : (r.sentAt ?? r.createdAt);
  return (
    <div className="group relative flex flex-col gap-3 px-4 py-3.5 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:gap-5">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <Link to={href} className="min-w-0 truncate text-[14px] font-medium after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:rounded-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring">
            {r.title}
          </Link>
          <SourceBadge source={r.source} />
          {r.status !== 'SENT' && <BroadcastStatusBadge status={r.status} />}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted-foreground">
          <ChannelIcons channels={r.channels} />
          <span className="min-w-0 truncate">{r.audienceSummary}</span>
          {r.createdBy && <span className="hidden truncate sm:inline">· {r.createdBy}</span>}
        </p>
      </div>

      {(r.status === 'SENT' || r.status === 'SENDING') && (
        <div className="w-full shrink-0 sm:w-56">
          <div className="flex items-baseline justify-between gap-2 text-[12px] tabular">
            <span>
              <span className="font-semibold text-foreground">{formatNumber(t.sent)}</span> <span className="text-muted-foreground">sent</span>
            </span>
            <span className="flex items-center gap-2 text-muted-foreground">
              {t.failed > 0 && (
                <span className="inline-flex items-center gap-1 font-medium text-danger">
                  <AlertTriangle className="size-3" aria-hidden /> {formatNumber(t.failed)} failed
                </span>
              )}
              {t.skipped > 0 && <span>{formatNumber(t.skipped)} skipped</span>}
              {t.queued > 0 && <span className="text-warning">{formatNumber(t.queued)} waiting</span>}
            </span>
          </div>
          <DeliveryBar {...t} className="mt-1.5" />
        </div>
      )}

      <div className="flex shrink-0 items-center justify-between gap-2 sm:w-36 sm:justify-end">
        <time dateTime={when ?? undefined} title={schoolDateTime(when)} className="text-[12px] text-muted-foreground">
          {r.status === 'SCHEDULED' ? schoolDateTime(when) : formatRelative(when)}
        </time>
        {canSend && r.status === 'SCHEDULED' && (
          <Button size="sm" variant="outline" className="relative z-10 h-7 px-2 text-[12px]" onClick={onCancel} loading={cancelling}>
            Cancel
          </Button>
        )}
        {canSend && r.status === 'DRAFT' && (
          <Button size="icon-sm" variant="ghost" className="relative z-10" aria-label={`Delete draft ${r.title}`} onClick={onDelete}>
            <Trash2 />
          </Button>
        )}
      </div>
    </div>
  );
}
