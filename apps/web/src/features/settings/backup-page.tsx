import { BACKUP_SECTIONS } from '@aischool/shared';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Download, FileArchive, HardDrive, Lock, ShieldCheck, XCircle } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, refreshSession } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { formatDateTime, formatNumber } from '@/lib/format';
import { useDocumentTitle } from '@/lib/hooks';
import { useBackupHistory } from './security-api';

function formatBytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

async function postExport(signal: AbortSignal): Promise<Response> {
  const send = () =>
    fetch('/api/backup/export', {
      method: 'POST',
      credentials: 'include',
      signal,
      headers: { Authorization: `Bearer ${useAuthStore.getState().accessToken ?? ''}`, Accept: 'application/zip' },
    });
  let res = await send();
  if (res.status === 401 && (await refreshSession())) res = await send();
  if (!res.ok) {
    let message = 'The export could not be created. Please try again.';
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, message);
  }
  return res;
}

/** Streams the ZIP, showing how much has arrived, then hands it to the browser as a download. */
function useSchoolExport() {
  const qc = useQueryClient();
  const [state, setState] = useState<{ status: 'idle' | 'running' | 'done' | 'error'; bytes: number; message?: string }>({ status: 'idle', bytes: 0 });
  const abort = useRef<AbortController | null>(null);

  const start = async () => {
    const ac = new AbortController();
    abort.current = ac;
    setState({ status: 'running', bytes: 0 });
    try {
      const res = await postExport(ac.signal);
      const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'school-data.zip';
      const reader = res.body?.getReader();
      const parts: Uint8Array[] = [];
      let bytes = 0;
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          parts.push(value);
          bytes += value.length;
          setState({ status: 'running', bytes });
        }
      }
      const blob = new Blob(parts as BlobPart[], { type: 'application/zip' });
      // A complete ZIP ends with the end-of-central-directory record (PK\5\6); a cut-off stream doesn't.
      const tail = new Uint8Array(await blob.slice(-22).arrayBuffer());
      if (blob.size < 22 || tail[0] !== 0x50 || tail[1] !== 0x4b || tail[2] !== 5 || tail[3] !== 6) {
        throw new Error('The download stopped before it finished. Please try again.');
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setState({ status: 'done', bytes: blob.size });
      toast.success('School data downloaded');
    } catch (err) {
      if (ac.signal.aborted) setState({ status: 'idle', bytes: 0 });
      else setState({ status: 'error', bytes: 0, message: (err as Error).message });
    } finally {
      abort.current = null;
      void qc.invalidateQueries({ queryKey: ['backup', 'exports'] });
    }
  };

  return { state, start: () => void start(), cancel: () => abort.current?.abort() };
}

const STATUS = {
  completed: { label: 'Completed', variant: 'success' as const, icon: CheckCircle2 },
  aborted: { label: 'Cancelled', variant: 'outline' as const, icon: XCircle },
  failed: { label: 'Failed', variant: 'danger' as const, icon: XCircle },
};

export default function BackupPage() {
  useDocumentTitle('Backup & export');
  const { state, start, cancel } = useSchoolExport();
  const history = useBackupHistory();

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Download your school’s data</CardTitle>
            <CardDescription>
              One ZIP file with a spreadsheet (CSV) for each kind of record, plus a README explaining them. Keep a copy each term, or use it to move your
              records elsewhere.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {BACKUP_SECTIONS.map((s) => (
              <div key={s.title} className="rounded-xl border border-border bg-muted/30 px-4 py-3">
                <p className="text-[13px] font-semibold">{s.title}</p>
                <p className="mt-0.5 text-[12.5px] text-muted-foreground">{s.items.join(' · ')}</p>
              </div>
            ))}
          </div>

          <div className="flex items-start gap-2.5 rounded-xl border border-border px-4 py-3 text-[12.5px] text-muted-foreground">
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              Never included: passwords, two-step sign-in secrets, sign-in sessions, payment or SMS keys, uploaded files themselves, or any other school’s
              data. The file does contain personal details about children, families and staff (including health notes and pay), so store it securely.
              Every export is recorded in the audit log.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {state.status === 'running' ? (
              <>
                <Button disabled loading>
                  Preparing… {state.bytes > 0 && formatBytes(state.bytes)}
                </Button>
                <Button variant="ghost" onClick={cancel}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button onClick={start}>
                <Download /> Download school data
              </Button>
            )}
            {state.status === 'done' && (
              <span className="flex items-center gap-1.5 text-[13px] font-medium text-success">
                <CheckCircle2 className="size-4" /> Downloaded ({formatBytes(state.bytes)})
              </span>
            )}
          </div>
          {state.status === 'running' && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Preparing the export">
              <div className="h-full w-1/3 animate-[pulse_1.2s_ease-in-out_infinite] rounded-full bg-brand" />
            </div>
          )}
          {state.status === 'error' && (
            <p role="alert" className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2.5 text-[13px] font-medium text-danger">
              {state.message}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Recent exports</CardTitle>
            <CardDescription>Who downloaded the school’s data, and when.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {history.error && !history.data ? (
            <ErrorState error={history.error} onRetry={() => void history.refetch()} />
          ) : !history.data ? (
            <Skeleton className="h-24 rounded-xl" />
          ) : history.data.length === 0 ? (
            <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <FileArchive className="size-4" /> No exports yet.
            </p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
              {history.data.map((r) => {
                const st = STATUS[r.status] ?? STATUS.completed;
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-medium">{formatDateTime(r.createdAt)}</p>
                      <p className="truncate text-[12px] text-muted-foreground">
                        {r.actorName ?? 'Unknown'}
                        {r.status === 'completed' && r.rows !== null && ` · ${formatNumber(r.rows)} rows · ${formatBytes(r.bytes)}`}
                      </p>
                    </div>
                    <Badge variant={st.variant}>
                      <st.icon /> {st.label}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-success" /> Your copy and the platform’s backups
            </CardTitle>
            <CardDescription>
              This export is your school’s own copy, in a format you can open without AI School OS. It sits alongside, and doesn’t replace, the
              system backups the platform operator keeps of the whole service.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <p className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
            <HardDrive className="size-4" /> Photos and documents you uploaded are not in the ZIP. Download important ones from where they are used.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
