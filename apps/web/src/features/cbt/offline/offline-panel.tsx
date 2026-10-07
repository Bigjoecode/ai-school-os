import { OFFLINE_FLAG_LABELS, formatStartCode, type CbtExamDetail, type OfflineExamStatus, type OfflineFlag, type OfflineSeatRow, type OfflineSeatStatus } from '@aischool/shared';
import { AlertTriangle, Check, Download, Eye, EyeOff, KeyRound, MonitorSmartphone, Printer, RefreshCw, ShieldAlert, WifiOff, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { SwitchRow } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ApiError, errorMessage } from '@/lib/api';
import { formatDateTime, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { minutesLabel } from '../ui';
import { downloadDevicePack, useOfflineStatus, useReviewSeat, useRotateOfflineCode, useSaveOfflineSettings } from './api';

function toLocalInput(iso: string | Date) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

const STATUS: Record<OfflineSeatStatus, { label: string; variant: 'outline' | 'secondary' | 'info' | 'warning' | 'success' | 'danger' }> = {
  NOT_DOWNLOADED: { label: 'Not downloaded', variant: 'outline' },
  DOWNLOADED: { label: 'Downloaded', variant: 'secondary' },
  STARTED: { label: 'Started', variant: 'info' },
  SUBMITTED: { label: 'Handed in, not synced', variant: 'warning' },
  SYNCED: { label: 'Synced', variant: 'success' },
  HELD: { label: 'Held for review', variant: 'danger' },
  REJECTED: { label: 'Rejected', variant: 'outline' },
};

/** The "Offline" tab on an online exam: settings, the start code, devices and the sync board. */
export function OfflinePanel({ e }: { e: CbtExamDetail }) {
  const q = useOfflineStatus(e.id);
  if (q.error && !q.data) {
    return (
      <Card>
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </Card>
    );
  }
  if (!q.data) return <Skeleton className="h-72 rounded-2xl" />;
  const s = q.data;
  return (
    <div className="space-y-4">
      {s.canManage && <Settings e={e} s={s} />}
      {!s.canManage && !s.enabled && (
        <Card>
          <EmptyState icon={WifiOff} title="Not available offline" description="The teacher of this exam can let students download it and sit it with no internet." />
        </Card>
      )}
      {s.enabled || s.rows.some((r) => r.status !== 'NOT_DOWNLOADED') ? <Board e={e} s={s} /> : null}
    </div>
  );
}

function Settings({ e, s }: { e: CbtExamDetail; s: OfflineExamStatus }) {
  const save = useSaveOfflineSettings(e.id);
  const rotate = useRotateOfflineCode(e.id);
  const [enabled, setEnabled] = useState(s.enabled);
  // Defaults: from a day before the exam opens (download day) to two days after it closes.
  const [from, setFrom] = useState(() => toLocalInput(s.availableFrom ?? e.opensAt));
  const [syncBy, setSyncBy] = useState(() => toLocalInput(s.syncBy ?? new Date(Date.parse(e.closesAt) + 2 * 86_400_000)));
  const [showCode, setShowCode] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [preparing, setPreparing] = useState(false);
  useEffect(() => setEnabled(s.enabled), [s.enabled]);
  const err = save.error instanceof ApiError ? save.error : null;
  const dirty = enabled !== s.enabled || (enabled && (fromLocalInput(from) !== s.availableFrom || fromLocalInput(syncBy) !== s.syncBy));
  const ended = e.phase === 'ENDED';

  const prepare = async () => {
    setPreparing(true);
    try {
      const stored = await downloadDevicePack(e.id);
      toast.success('This device is ready for the exam', { description: `${stored.pack.seatCount} students can sit it here with no internet. Open “Offline exams” on exam day.` });
    } catch (x) {
      toast.error(errorMessage(x));
    } finally {
      setPreparing(false);
    }
  };

  return (
    <Card className="p-4 sm:p-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <form
          className="space-y-4"
          onSubmit={(ev) => {
            ev.preventDefault();
            save.mutate({ enabled, availableFrom: fromLocalInput(from), syncBy: fromLocalInput(syncBy) });
          }}
        >
          <SwitchRow label="Available offline" description="Students download an encrypted copy the day before and sit it with no internet. Answers sync later and are marked here.">
            <Switch checked={enabled} onCheckedChange={setEnabled} disabled={ended && !s.enabled} />
          </SwitchRow>
          {enabled && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Can start from" htmlFor="off-from" error={err?.errors.find((x) => x.path === 'availableFrom')?.message}>
                <Input id="off-from" type="datetime-local" value={from} onChange={(x) => setFrom(x.target.value)} />
              </Field>
              <Field label="Must sync by" htmlFor="off-sync" error={err?.errors.find((x) => x.path === 'syncBy')?.message} hint="Later hand-ins are still accepted, but flagged.">
                <Input id="off-sync" type="datetime-local" value={syncBy} onChange={(x) => setSyncBy(x.target.value)} />
              </Field>
            </div>
          )}
          {save.error && !err?.errors.length && <p className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{errorMessage(save.error)}</p>}
          <Button type="submit" disabled={!dirty} loading={save.isPending}>
            Save
          </Button>
        </form>

        {s.code ? (
          <div className="space-y-3 rounded-2xl border border-border bg-muted/30 p-4">
            <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground">
              <KeyRound className="size-3.5" /> Invigilator start code
            </p>
            <div className="flex items-center gap-2">
              <p className="flex-1 font-mono text-2xl font-semibold tracking-[0.15em] tabular" aria-live="polite">
                {showCode ? formatStartCode(s.code) : '•••••-•••••'}
              </p>
              <Button variant="ghost" size="icon" onClick={() => setShowCode((v) => !v)} aria-label={showCode ? 'Hide code' : 'Show code'}>
                {showCode ? <EyeOff /> : <Eye />}
              </Button>
            </div>
            <p className="text-[12px] text-muted-foreground">Give it out only when the exam starts. The questions can’t be read on any device without it. Version {s.version}.</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link to={`/online-exams/${e.id}/offline-sheet`}>
                  <Printer /> Invigilator sheet
                </Link>
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmRotate(true)}>
                <RefreshCw /> Change code
              </Button>
              {s.enabled && e.status === 'SCHEDULED' && (
                <Button variant="outline" size="sm" onClick={() => void prepare()} loading={preparing}>
                  <MonitorSmartphone /> Prepare this device
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border p-4 text-[13px] text-muted-foreground">A start code is made when you turn offline sitting on.</div>
        )}
      </div>
      <ConfirmDialog
        open={confirmRotate}
        onOpenChange={setConfirmRotate}
        title="Change the start code?"
        description="Use this if the code leaked. Every device that already downloaded the exam must download it again before exam day, or it won’t open with the new code."
        confirmLabel="Change code"
        loading={rotate.isPending}
        onConfirm={() => rotate.mutate(undefined, { onSettled: () => setConfirmRotate(false) })}
      />
    </Card>
  );
}

function Board({ e, s }: { e: CbtExamDetail; s: OfflineExamStatus }) {
  const review = useReviewSeat(e.id);
  const [filter, setFilter] = useState<'all' | 'flagged' | OfflineSeatStatus>('all');
  const rows = s.rows.filter((r) => filter === 'all' || (filter === 'flagged' ? r.flags.length > 0 : r.status === filter));
  const c = s.counts;
  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-2 gap-px border-b border-border bg-border sm:grid-cols-5">
        {(
          [
            ['Downloaded', c.downloaded],
            ['Started', c.started],
            ['Synced', c.synced],
            ['Held', c.held],
            ['Flags to review', c.flagged],
          ] as const
        ).map(([label, n]) => (
          <div key={label} className="bg-card px-4 py-3">
            <p className="text-[12px] text-muted-foreground">{label}</p>
            <p className={cn('font-display text-xl font-semibold tabular', (label === 'Held' || label === 'Flags to review') && n > 0 && 'text-danger')}>
              {n}
              {label !== 'Held' && label !== 'Flags to review' && <span className="text-[13px] font-normal text-muted-foreground"> / {c.students}</span>}
            </p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        {(
          [
            ['all', 'Everyone'],
            ['NOT_DOWNLOADED', 'Not downloaded'],
            ['DOWNLOADED', 'Downloaded'],
            ['SYNCED', 'Synced'],
            ['HELD', 'Held'],
            ['flagged', 'Flagged'],
          ] as const
        ).map(([f, label]) => (
          <Button key={f} size="sm" variant={filter === f ? 'default' : 'ghost'} onClick={() => setFilter(f)} aria-pressed={filter === f}>
            {label}
          </Button>
        ))}
        <span className="ml-auto text-[12px] text-muted-foreground">Updates every 15 seconds</span>
      </div>
      {!rows.length ? (
        <p className="p-6 text-center text-[13px] text-muted-foreground">Nobody here.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Downloaded</TableHead>
              <TableHead>Synced</TableHead>
              <TableHead className="text-right">Time used</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead>Flags</TableHead>
              {s.canManage && <TableHead className="text-right">Review</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <SeatRow key={r.student.id} r={r} e={e} canManage={s.canManage} busy={review.isPending && review.variables?.seatId === r.seatId} onReview={(action) => r.seatId && review.mutate({ seatId: r.seatId, action })} />
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

function SeatRow({ r, e, canManage, busy, onReview }: { r: OfflineSeatRow; e: CbtExamDetail; canManage: boolean; busy: boolean; onReview: (a: 'accept' | 'reject' | 'reviewed') => void }) {
  const st = STATUS[r.status];
  return (
    <TableRow>
      <TableCell>
        <p className="font-medium">{r.student.name}</p>
        <p className="text-[12px] text-muted-foreground">
          {r.student.admissionNumber}
          {r.student.classArm && e.classArms.length > 1 ? ` · ${r.student.classArm}` : ''}
        </p>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          <Badge variant={st.variant} dot>
            {st.label}
          </Badge>
          {r.stale && <Badge variant="warning">Old code — download again</Badge>}
          {r.sittingOnline && <Badge variant="outline">Sat online</Badge>}
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap text-[12.5px] text-muted-foreground">
        {r.downloadedAt ? (
          <>
            {formatRelative(r.downloadedAt)}
            <span className="block text-[11.5px]">
              {r.mode === 'DEVICE' ? 'Exam device' : 'Own device'}
              {r.downloads > 1 ? ` · ${r.downloads}×` : ''}
            </span>
          </>
        ) : (
          '—'
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap text-[12.5px] text-muted-foreground">{r.syncedAt ? formatDateTime(r.syncedAt) : r.lastSeenAt ? `Seen ${formatRelative(r.lastSeenAt)}` : '—'}</TableCell>
      <TableCell className="text-right tabular">{r.elapsedSeconds != null ? minutesLabel(r.elapsedSeconds) : '—'}</TableCell>
      <TableCell className="text-right tabular">{r.score != null ? `${r.score}/${r.total}` : '—'}</TableCell>
      <TableCell>
        {r.flags.length ? (
          <ul className="space-y-0.5">
            {r.flags.map((f) => (
              <li key={f} className={cn('flex items-start gap-1 text-[12px]', r.flagsReviewed ? 'text-muted-foreground' : 'text-danger')}>
                {f === 'BAD_SIGNATURE' ? <ShieldAlert className="mt-0.5 size-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />}
                <span>
                  {OFFLINE_FLAG_LABELS[f as OfflineFlag] ?? f}
                  {f === 'CLOCK' && r.clockSkewSeconds != null && Math.abs(r.clockSkewSeconds) > 60 ? ` (device ${Math.round(Math.abs(r.clockSkewSeconds) / 60)} min ${r.clockSkewSeconds > 0 ? 'behind' : 'ahead'})` : ''}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      {canManage && (
        <TableCell className="text-right">
          {r.status === 'HELD' ? (
            <div className="flex justify-end gap-1">
              <Button size="sm" variant="outline" onClick={() => onReview('accept')} loading={busy} title="Mark it anyway">
                <Check /> Accept
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onReview('reject')} disabled={busy} title="Leave it unmarked">
                <X /> Reject
              </Button>
            </div>
          ) : r.flags.length && !r.flagsReviewed ? (
            <Button size="sm" variant="ghost" onClick={() => onReview('reviewed')} loading={busy}>
              <Check /> Reviewed
            </Button>
          ) : r.status === 'NOT_DOWNLOADED' ? (
            <Download className="ml-auto size-4 text-muted-foreground/40" aria-hidden />
          ) : null}
        </TableCell>
      )}
    </TableRow>
  );
}
