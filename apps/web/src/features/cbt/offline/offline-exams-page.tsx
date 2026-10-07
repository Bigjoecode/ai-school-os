import { ArrowLeft, CheckCircle2, Clock, CloudOff, CloudUpload, HardDrive, ListOrdered, Loader2, LogIn, MonitorSmartphone, PlayCircle, RefreshCw, Trash2, WifiOff, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useAuthStore } from '@/lib/auth-store';
import { formatDateTime, formatRelative } from '@/lib/format';
import { useDocumentTitle } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { usePwaStore } from '@/pwa/store';
import { storageEstimate } from './api';
import { idb, idbAvailable, type OutboxItem, type Sitting, type StoredPack } from './db';
import { startOfflineSync, syncNow, useOfflineSync } from './sync';

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;

/**
 * "My offline exams": what is downloaded on this device, sittings in progress, and hand-ins
 * waiting to be sent. Reads only this device's storage, so it opens with no connection.
 */
export default function OfflineExamsPage() {
  useDocumentTitle('Offline exams');
  const me = useAuthStore((s) => s.me);
  const status = useAuthStore((s) => s.status);
  const online = usePwaStore((s) => s.online);
  const sync = useOfflineSync();
  const [packs, setPacks] = useState<StoredPack[] | null>(null);
  const [sittings, setSittings] = useState<Sitting[]>([]);
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const [storage, setStorage] = useState<Awaited<ReturnType<typeof storageEstimate>>>(null);
  const [remove, setRemove] = useState<StoredPack | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => startOfflineSync(), []);
  useEffect(() => {
    if (!idbAvailable()) return setPacks([]);
    void Promise.all([idb.all<StoredPack>('packs'), idb.all<Sitting>('sittings'), idb.all<OutboxItem>('outbox'), storageEstimate()])
      .then(([p, s, o, st]) => {
        setPacks(p.sort((a, b) => b.savedAt.localeCompare(a.savedAt)));
        setSittings(s);
        setOutbox(o.filter((i) => i.kind === 'final').sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
        setStorage(st);
      })
      .catch(() => setPacks([]));
  }, [sync.version, reload]);

  // Exam-device packs are for whoever uses the device; a personal pack only for the student who downloaded it.
  const visible = (packs ?? []).filter((p) => p.pack.mode === 'DEVICE' || p.ownerUserId === me?.user.id);
  const unsentFor = (p: StoredPack) => outbox.filter((o) => o.status !== 'SYNCED' && o.status !== 'HELD' && sittings.some((s) => s.key === o.sittingKey && s.packKey === p.key)).length;
  const writingFor = (p: StoredPack) => sittings.filter((s) => s.packKey === p.key && s.status === 'IN_PROGRESS').length;

  return (
    <main className="mx-auto min-h-dvh w-full max-w-3xl px-4 py-6 sm:py-10">
      <Link to={status === 'authenticated' ? '/my-exams' : '/'} className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> {status === 'authenticated' ? 'Exams' : 'Home'}
      </Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Offline exams</h1>
          <p className="mt-1 max-w-xl text-[13.5px] text-muted-foreground">Exams downloaded to this device. They open and run with no internet; answers are sent to the school when the device is next online.</p>
        </div>
        <Badge variant={online ? 'success' : 'warning'} dot>
          {online ? 'Online' : 'Offline'}
        </Badge>
      </div>

      <Card className="mt-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {sync.running ? <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-brand" /> : sync.pending ? <CloudOff className="mt-0.5 size-5 shrink-0 text-warning" /> : <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />}
          <div className="min-w-0 text-[13.5px]">
            <p className="font-medium">{sync.running ? 'Sending answers…' : sync.pending ? `${sync.pending} hand-in${sync.pending === 1 ? '' : 's'} waiting to be sent` : 'Nothing waiting to be sent'}</p>
            <p className="text-[12.5px] text-muted-foreground">
              {sync.needsSignIn ? 'Sign in (a student, or the staff member who prepared this device) to send them.' : sync.lastError ? sync.lastError : sync.lastSyncAt ? `Last sent ${formatRelative(new Date(sync.lastSyncAt).toISOString())}` : 'They are sent automatically when there is a connection.'}
            </p>
          </div>
        </div>
        {sync.needsSignIn || status === 'anonymous' ? (
          <Button asChild variant="outline" size="sm">
            <Link to="/login">
              <LogIn /> Sign in
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => void syncNow({ includeFailed: true }).then(() => setReload((n) => n + 1))} loading={sync.running} disabled={!online}>
            <RefreshCw /> Sync now
          </Button>
        )}
      </Card>

      <section className="mt-8" aria-labelledby="off-packs">
        <h2 id="off-packs" className="mb-3 font-display text-[15px] font-semibold tracking-tight">
          On this device
        </h2>
        {packs === null ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : !visible.length ? (
          <Card className="p-6 text-center text-[13.5px] text-muted-foreground">
            <WifiOff className="mx-auto mb-2 size-6" />
            No exams downloaded. While online, open <Link to="/my-exams" className="font-medium text-foreground underline underline-offset-2">Exams</Link> and choose “Download for offline” on an exam your teacher has made available.
          </Card>
        ) : (
          <ul className="space-y-3">
            {visible.map((s) => {
              const p = s.pack;
              const writing = writingFor(s);
              const unsent = unsentFor(s);
              const handedIn = sittings.filter((x) => x.packKey === s.key && x.status === 'SUBMITTED').length;
              return (
                <li key={s.key}>
                  <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="brand">{p.subject}</Badge>
                        {p.mode === 'DEVICE' ? (
                          <Badge variant="info">
                            <MonitorSmartphone /> Exam device · {p.seatCount} students
                          </Badge>
                        ) : (
                          <Badge variant="outline">{p.student?.name ?? 'Personal'}</Badge>
                        )}
                        {writing > 0 && <Badge variant="info">{writing} in progress</Badge>}
                        {handedIn > 0 && <Badge variant={unsent ? 'warning' : 'success'}>{unsent ? `${unsent} to send` : `${handedIn} handed in`}</Badge>}
                      </div>
                      <h3 className="mt-2 font-display text-[15.5px] font-semibold leading-snug tracking-tight">{p.title}</h3>
                      <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5 tabular">
                          <Clock className="size-3.5" /> {p.durationMinutes} min
                        </span>
                        <span className="inline-flex items-center gap-1.5 tabular">
                          <ListOrdered className="size-3.5" /> {p.questionCount} questions
                        </span>
                        {p.availableFrom && <span>From {formatDateTime(p.availableFrom)}</span>}
                        {p.syncBy && <span>Sync by {formatDateTime(p.syncBy)}</span>}
                      </p>
                      <p className="mt-1 text-[11.5px] text-muted-foreground">Downloaded {formatRelative(s.savedAt)}{p.mode === 'DEVICE' ? ` by ${p.downloadedBy.name}` : ''}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {p.mode === 'PERSONAL' && handedIn > 0 && !writing ? (
                        <Button asChild variant="outline" size="sm">
                          <Link to={`/offline-exams/${encodeURIComponent(s.key)}`}>View</Link>
                        </Button>
                      ) : (
                        <Button asChild>
                          <Link to={`/offline-exams/${encodeURIComponent(s.key)}`}>
                            <PlayCircle /> {writing && p.mode === 'PERSONAL' ? 'Continue' : 'Open'}
                          </Link>
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" aria-label="Remove from this device" onClick={() => setRemove(s)} disabled={writing > 0 || unsent > 0} title={writing || unsent ? 'Hand in and send the answers first' : 'Remove from this device'}>
                        <Trash2 />
                      </Button>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {outbox.length > 0 && (
        <section className="mt-8" aria-labelledby="off-outbox">
          <h2 id="off-outbox" className="mb-3 font-display text-[15px] font-semibold tracking-tight">
            Hand-ins from this device
          </h2>
          <Card className="divide-y divide-border">
            {outbox.slice(0, 100).map((o) => (
              <div key={o.id} className="flex items-center gap-3 px-4 py-3 text-[13.5px]">
                {o.status === 'SYNCED' ? <CheckCircle2 className="size-4 shrink-0 text-success" /> : o.status === 'HELD' ? <CloudUpload className="size-4 shrink-0 text-info" /> : o.status === 'FAILED' ? <XCircle className="size-4 shrink-0 text-danger" /> : <CloudOff className="size-4 shrink-0 text-warning" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {o.studentName} · <span className="font-normal">{o.title}</span>
                  </p>
                  <p className="text-[12px] text-muted-foreground">
                    {o.status === 'SYNCED' ? 'Sent and marked' : o.status === 'HELD' ? 'Sent — waiting for a teacher to check it' : o.status === 'FAILED' ? `Not accepted: ${o.lastError}` : `Waiting to send${o.lastError ? ` (${o.lastError})` : ''}`} · handed in {formatRelative(o.createdAt)}
                  </p>
                </div>
              </div>
            ))}
          </Card>
        </section>
      )}

      {storage && (
        <p className="mt-8 flex items-center gap-2 text-[12px] text-muted-foreground">
          <HardDrive className="size-3.5" /> This site uses {mb(storage.usage)} of {mb(storage.quota)} available on this device{storage.persisted ? ' · protected from automatic clean-up' : ''}.
        </p>
      )}

      <ConfirmDialog
        open={!!remove}
        onOpenChange={(o) => !o && setRemove(null)}
        title="Remove this exam from the device?"
        description="Handed-in answers that were already sent are kept by the school. You can download the exam again while it is available."
        confirmLabel="Remove"
        onConfirm={() => {
          const r = remove;
          setRemove(null);
          if (!r) return;
          void (async () => {
            await idb.delete('packs', r.key);
            for (const s of sittings.filter((x) => x.packKey === r.key)) await idb.delete('sittings', s.key);
            toast.success('Removed from this device');
            setReload((n) => n + 1);
          })();
        }}
      />
      <p className={cn('mt-2 text-[12px] text-muted-foreground', !idbAvailable() && 'text-danger')}>{!idbAvailable() && 'This browser can’t store exams for offline use.'}</p>
    </main>
  );
}
