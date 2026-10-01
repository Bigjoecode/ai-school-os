import { type BroadcastDetail, type Channel, CHANNEL_LABELS, type DeliveryRow, type DeliveryStatus, smsInfo, smsSafe } from '@aischool/shared';
import { CalendarClock, Inbox, Pencil, RotateCw, Send, Trash2, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Page } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { SearchInput } from '@/components/ui/search-input';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ApiError } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { formatNumber } from '@/lib/format';
import { useDocumentTitle } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { schoolDateTime } from '../finance/ui';
import { BackLink, DetailSkeleton } from '../planning/ui';
import { useBroadcast, useCancelBroadcast, useDeleteBroadcast, useRetryBroadcast } from './api';
import { BroadcastStatusBadge, CHANNEL_ICON, CHANNEL_SHORT, DeliveryBar, SourceBadge } from './ui';

export default function BroadcastPage() {
  const { id = '' } = useParams();
  const q = useBroadcast(id);
  if (q.isLoading) {
    return (
      <Page className="max-w-6xl">
        <DetailSkeleton />
      </Page>
    );
  }
  if (!q.data) {
    const missing = q.error instanceof ApiError && q.error.status === 404;
    return (
      <Page className="max-w-6xl">
        <BackLink to="/messages">Messages</BackLink>
        {missing ? <EmptyState icon={Inbox} title="Message not found" description="It may have been deleted." /> : <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      </Page>
    );
  }
  return <BroadcastView b={q.data} />;
}

const DELIVERY_STATUS: Record<DeliveryStatus, { label: string; variant: 'success' | 'danger' | 'outline' | 'warning' }> = {
  SENT: { label: 'Sent', variant: 'success' },
  FAILED: { label: 'Failed', variant: 'danger' },
  SKIPPED: { label: 'Skipped', variant: 'outline' },
  QUEUED: { label: 'Waiting', variant: 'warning' },
};

function BroadcastView({ b }: { b: BroadcastDetail }) {
  useDocumentTitle(b.title);
  const canSend = useCan('comms.send');
  const navigate = useNavigate();
  const retry = useRetryBroadcast();
  const cancel = useCancelBroadcast();
  const del = useDeleteBroadcast();
  const [deleting, setDeleting] = useState(false);
  const t = b.totals;
  const live = b.status === 'SENDING' || t.queued > 0;
  const editable = b.status === 'DRAFT' || b.status === 'SCHEDULED';

  return (
    <Page className="max-w-6xl">
      <BackLink to="/messages">Messages</BackLink>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 break-words font-display text-2xl font-semibold tracking-tight sm:text-[28px]">{b.title}</h1>
            <BroadcastStatusBadge status={b.status} />
            <SourceBadge source={b.source} />
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-muted-foreground">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Users className="size-4 shrink-0" aria-hidden /> <span className="min-w-0 break-words">{b.audienceSummary}</span>
            </span>
            <span>by {b.channels.map((c) => CHANNEL_LABELS[c]).join(', ')}</span>
          </p>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            {b.status === 'SCHEDULED' ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-info">
                <CalendarClock className="size-3.5" aria-hidden /> Goes out {schoolDateTime(b.scheduledAt)}
              </span>
            ) : b.sentAt ? (
              `Sent ${schoolDateTime(b.sentAt)}`
            ) : (
              `Created ${schoolDateTime(b.createdAt)}`
            )}
            {b.createdBy && ` · ${b.createdBy}`}
          </p>
        </div>
        {canSend && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {t.failed > 0 && b.status !== 'DRAFT' && (
              <Button variant="outline" onClick={() => retry.mutate(b.id)} loading={retry.isPending}>
                {!retry.isPending && <RotateCw />} Retry {formatNumber(t.failed)} failed
              </Button>
            )}
            {b.status === 'SCHEDULED' && (
              <Button variant="outline" onClick={() => cancel.mutate(b.id)} loading={cancel.isPending}>
                Cancel schedule
              </Button>
            )}
            {b.status === 'DRAFT' && (
              <Button variant="outline" onClick={() => setDeleting(true)}>
                <Trash2 /> Delete
              </Button>
            )}
            {editable && (
              <Button asChild>
                <Link to={`/messages/${b.id}/edit`}>
                  {b.status === 'DRAFT' ? <Send /> : <Pencil />} {b.status === 'DRAFT' ? 'Edit and send' : 'Edit'}
                </Link>
              </Button>
            )}
          </div>
        )}
      </div>

      {(b.status === 'SENT' || b.status === 'SENDING' || t.recipients > 0) && (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(200px,1fr))] [&>*]:min-w-0" aria-live={live ? 'polite' : undefined}>
            {b.byChannel.map((c) => (
              <ChannelCard key={c.channel} {...c} smsUnits={c.channel === 'SMS' ? b.smsUnits : undefined} />
            ))}
          </div>
          {live && (
            <p className="mt-3 flex items-center gap-2 text-[12.5px] text-muted-foreground">
              <span className="size-1.5 animate-pulse rounded-full bg-warning" aria-hidden /> Going out now — this page updates by itself.
            </p>
          )}
        </>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] [&>*]:min-w-0">
        <ContentCard b={b} />
        <Deliveries b={b} />
      </div>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this draft?"
        description="It’s removed for good."
        confirmLabel="Delete draft"
        loading={del.isPending}
        onConfirm={() => del.mutate(b.id, { onSuccess: () => navigate('/messages?tab=drafts', { replace: true }) })}
      />
    </Page>
  );
}

function ChannelCard({ channel, sent, failed, skipped, queued, smsUnits }: { channel: Channel; sent: number; failed: number; skipped: number; queued: number; smsUnits?: number }) {
  const Icon = CHANNEL_ICON[channel];
  const total = sent + failed + skipped + queued;
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[13px] font-medium">
          <Icon className="size-4 text-muted-foreground" aria-hidden /> {CHANNEL_LABELS[channel]}
        </p>
        {smsUnits != null && smsUnits > 0 && <span className="text-[11.5px] text-muted-foreground tabular">{formatNumber(smsUnits)} pages</span>}
      </div>
      <p className="mt-2 font-display text-[24px] font-semibold leading-none tabular">
        {formatNumber(sent)}
        <span className="text-[13px] font-medium text-muted-foreground">/{formatNumber(total)} sent</span>
      </p>
      <DeliveryBar sent={sent} failed={failed} skipped={skipped} queued={queued} className="mt-2.5" />
      <p className="mt-2 flex flex-wrap gap-x-3 text-[12px] text-muted-foreground tabular">
        <span className={cn(failed > 0 && 'font-medium text-danger')}>{formatNumber(failed)} failed</span>
        <span>{formatNumber(skipped)} skipped</span>
        {queued > 0 && <span className="text-warning">{formatNumber(queued)} waiting</span>}
      </p>
    </Card>
  );
}

function ContentCard({ b }: { b: BroadcastDetail }) {
  const sms = b.smsBody ?? (b.channels.some((c) => c === 'SMS' || c === 'WHATSAPP') ? b.body : null);
  const info = sms ? smsInfo(smsSafe(sms)) : null;
  return (
    <Card className="self-start">
      <CardHeader>
        <div>
          <CardTitle>The message</CardTitle>
          <CardDescription>Names and balances are filled in for each person</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {b.subject && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Subject</p>
            <p className="mt-1 break-words text-[14px] font-medium">{b.subject}</p>
          </div>
        )}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Message</p>
          <p className="mt-1 max-h-[420px] overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-muted/20 px-3.5 py-3 text-[13.5px] leading-relaxed scrollbar-thin">{b.body}</p>
        </div>
        {sms && b.smsBody && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">SMS & WhatsApp</p>
            <p className="mt-1 whitespace-pre-wrap break-words rounded-xl border border-border bg-muted/20 px-3.5 py-3 text-[13.5px] leading-relaxed">{b.smsBody}</p>
          </div>
        )}
        {info && (
          <p className="text-[12px] text-muted-foreground tabular">
            SMS: {info.characters} characters · about {info.segments} page{info.segments === 1 ? '' : 's'} each{info.encoding === 'UNICODE' && ' · Unicode'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Deliveries({ b }: { b: BroadcastDetail }) {
  const [channel, setChannel] = useState<Channel | undefined>();
  const [status, setStatus] = useState<DeliveryStatus | undefined>();
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return b.deliveries.filter(
      (d) => (!channel || d.channel === channel) && (!status || d.status === status) && (!term || d.recipient.toLowerCase().includes(term) || (d.address ?? '').toLowerCase().includes(term)),
    );
  }, [b.deliveries, channel, status, q]);
  const shown = rows.slice(0, 300);

  return (
    <Card>
      <CardHeader className="flex-col gap-3 sm:flex-row sm:items-start">
        <div>
          <CardTitle>Deliveries</CardTitle>
          <CardDescription>
            {b.deliveries.length ? `${formatNumber(b.deliveries.length)} across ${b.channels.length} channel${b.channels.length === 1 ? '' : 's'}` : 'One row per person per channel'}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {b.deliveries.length === 0 ? (
          <EmptyState
            compact
            icon={Inbox}
            title={b.status === 'DRAFT' || b.status === 'SCHEDULED' ? 'Not sent yet' : 'No deliveries'}
            description={b.status === 'DRAFT' || b.status === 'SCHEDULED' ? 'Each person and channel appears here once it goes out.' : 'Nobody matched this audience when it was sent.'}
          />
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] [&>*]:min-w-0">
              <SearchInput value={q} onChange={setQ} placeholder="Search name, email or phone…" label="Search deliveries" />
              <Select value={channel ?? NONE} onValueChange={(v) => setChannel(v === NONE ? undefined : (v as Channel))}>
                <SelectTrigger className="sm:w-36" aria-label="Channel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>All channels</SelectItem>
                  {b.channels.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CHANNEL_SHORT[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={status ?? NONE} onValueChange={(v) => setStatus(v === NONE ? undefined : (v as DeliveryStatus))}>
                <SelectTrigger className="sm:w-36" aria-label="Status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Any status</SelectItem>
                  {(Object.keys(DELIVERY_STATUS) as DeliveryStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {DELIVERY_STATUS[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {rows.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted-foreground">No deliveries match these filters.</p>
            ) : (
              <>
                {/* Phones: stacked list */}
                <ul className="divide-y divide-border rounded-xl border border-border md:hidden">
                  {shown.map((d) => (
                    <li key={d.id} className="px-3.5 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-[13px] font-medium">{d.recipient}</p>
                        <DeliveryBadge d={d} />
                      </div>
                      <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground">
                        <ChannelTag channel={d.channel} /> <span className="truncate">{d.address ?? '—'}</span>
                      </p>
                      {d.error && <p className="mt-1 break-words text-[12px] text-danger">{d.error}</p>}
                    </li>
                  ))}
                </ul>
                <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Recipient</TableHead>
                        <TableHead>Channel</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Detail</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shown.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell className="max-w-[220px]">
                            <p className="truncate font-medium">{d.recipient}</p>
                            {d.address && <p className="truncate text-[12px] text-muted-foreground">{d.address}</p>}
                          </TableCell>
                          <TableCell>
                            <ChannelTag channel={d.channel} />
                          </TableCell>
                          <TableCell>
                            <DeliveryBadge d={d} />
                          </TableCell>
                          <TableCell className="max-w-[280px] text-[12.5px]">
                            {d.error ? (
                              <span className="break-words text-danger">{d.error}</span>
                            ) : d.sentAt ? (
                              <span className="text-muted-foreground">
                                {schoolDateTime(d.sentAt)}
                                {d.channel === 'SMS' && d.units > 0 && ` · ${d.units} page${d.units === 1 ? '' : 's'}`}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {rows.length > shown.length && <p className="text-center text-[12px] text-muted-foreground">Showing the first {shown.length} of {formatNumber(rows.length)} — search to narrow it down.</p>}
              </>
            )}
            {b.smsUnits > 0 && <p className="text-[12px] text-muted-foreground">{formatNumber(b.smsUnits)} SMS page{b.smsUnits === 1 ? '' : 's'} sent in all.</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ChannelTag({ channel }: { channel: Channel }) {
  const Icon = CHANNEL_ICON[channel];
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-[12px] text-muted-foreground">
      <Icon className="size-3.5" aria-hidden /> {CHANNEL_SHORT[channel]}
    </span>
  );
}

function DeliveryBadge({ d }: { d: DeliveryRow }) {
  const s = DELIVERY_STATUS[d.status];
  return (
    <Badge variant={s.variant} dot={d.status !== 'SKIPPED'} className={cn(d.status === 'QUEUED' && '[&>span:first-child]:animate-pulse')}>
      {s.label}
    </Badge>
  );
}

