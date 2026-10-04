import type { SubmissionType, UploadedFile } from '@aischool/shared';
import { AlertTriangle, ExternalLink, FileText, Film, Image as ImageIcon, Link2, Loader2, Mic, Play, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ApiError, errorMessage, refreshSession } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { cn } from '@/lib/utils';

/**
 * Files for assignments: uploads with a progress bar, and protected files
 * (worksheets, hand-ins) shown inline. Those files need the bearer token, so
 * they're fetched as blobs and shown through object URLs.
 */

// ------------------------------------------------------------------ kinds & limits

export type FileKind = Exclude<SubmissionType, 'TEXT' | 'LINK'>;

export function kindOfMime(mime: string | null | undefined): FileKind {
  const m = mime ?? '';
  return m.startsWith('image/') ? 'IMAGE' : m.startsWith('video/') ? 'VIDEO' : m.startsWith('audio/') ? 'AUDIO' : 'DOCUMENT';
}

export const ACCEPT: Record<FileKind, string> = {
  IMAGE: 'image/jpeg,image/png,image/webp,image/gif',
  VIDEO: 'video/mp4,video/quicktime,video/webm,video/3gpp,.mp4,.mov,.webm,.3gp',
  AUDIO: 'audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/x-wav,audio/ogg,audio/webm,.mp3,.m4a,.wav,.ogg',
  DOCUMENT: '.pdf,.docx,.xlsx,.pptx,application/pdf',
};
/** What teachers may attach: worksheets, pictures, short clips and recordings. */
export const ATTACH_ACCEPT = [ACCEPT.IMAGE, ACCEPT.DOCUMENT, ACCEPT.VIDEO, ACCEPT.AUDIO].join(',');

const MB = 1024 * 1024;
const MEDIA_MAX_MB = 50;
const FILE_MAX_MB = 10;

/** The kind a picked file will be, worked out from its type or name (some phones leave the type blank). */
export function kindOfFile(file: File): FileKind {
  if (file.type) return kindOfMime(file.type);
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic'].includes(ext)) return 'IMAGE';
  if (['mp4', 'mov', 'webm', '3gp'].includes(ext)) return 'VIDEO';
  if (['mp3', 'm4a', 'wav', 'ogg'].includes(ext)) return 'AUDIO';
  return 'DOCUMENT';
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < MB) return `${Math.round(n / 1024)} KB`;
  return `${(n / MB).toFixed(n < 10 * MB ? 1 : 0)} MB`;
}

// ------------------------------------------------------------------ upload with progress

function xhrUpload(file: File, onProgress: (pct: number) => void, setAbort: (fn: () => void) => void): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/files/private');
    xhr.withCredentials = true;
    xhr.setRequestHeader('Accept', 'application/json');
    const token = useAuthStore.getState().accessToken;
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        /* not JSON */
      }
      resolve({ status: xhr.status, body });
    };
    xhr.onerror = () => reject(new ApiError(0, "Can't reach the server. Check your connection and try again."));
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
    setAbort(() => xhr.abort());
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}

/** POST /files/private (multipart `file`), reporting progress from 0 to 100. */
export async function uploadPrivate(file: File, onProgress: (pct: number) => void, setAbort: (fn: () => void) => void = () => {}): Promise<UploadedFile> {
  const kind = kindOfFile(file);
  const media = kind === 'VIDEO' || kind === 'AUDIO';
  const max = media ? MEDIA_MAX_MB : FILE_MAX_MB;
  if (file.size > max * MB) {
    throw new ApiError(413, media ? `Videos and recordings can be up to ${max} MB. For longer videos, share a YouTube or Google Drive link instead.` : `Files can be up to ${max} MB.`);
  }
  let r = await xhrUpload(file, onProgress, setAbort);
  if (r.status === 401 && (await refreshSession())) r = await xhrUpload(file, onProgress, setAbort);
  if (r.status === 401) throw new ApiError(401, 'Your session has expired. Please sign in again.');
  if (r.status < 200 || r.status >= 300) {
    const raw = (r.body as { message?: string | string[] } | null)?.message;
    const message = (Array.isArray(raw) ? raw.join('. ') : raw) || (r.status === 413 ? 'That file is too large.' : 'Upload failed. Please try again.');
    throw new ApiError(r.status, message);
  }
  onProgress(100);
  return r.body as UploadedFile;
}

export interface UploadItem {
  key: string;
  name: string;
  mimeType: string;
  size: number;
  progress: number;
  state: 'uploading' | 'done' | 'error';
  fileId: string | null;
  error: string | null;
}

let seq = 0;

/** A list of files being uploaded (or already uploaded, when seeded). */
export function useUploads(max: number) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const aborts = useRef(new Map<string, () => void>());
  const patch = (key: string, p: Partial<UploadItem>) => setItems((list) => list.map((x) => (x.key === key ? { ...x, ...p } : x)));

  useEffect(() => {
    const map = aborts.current;
    return () => map.forEach((fn) => fn());
  }, []);

  const add = useCallback(
    (files: File[], current: number) => {
      const room = Math.max(0, max - current);
      if (files.length > room) toast.error(room === 0 ? `You can add up to ${max} files.` : `Only ${room} more ${room === 1 ? 'file fits' : 'files fit'} — up to ${max} in all.`);
      for (const file of files.slice(0, room)) {
        const key = `u${++seq}`;
        const kind = kindOfFile(file);
        setItems((list) => [...list, { key, name: file.name, mimeType: file.type || (kind === 'IMAGE' ? 'image/jpeg' : kind === 'VIDEO' ? 'video/mp4' : kind === 'AUDIO' ? 'audio/mpeg' : 'application/octet-stream'), size: file.size, progress: 0, state: 'uploading', fileId: null, error: null }]);
        uploadPrivate(
          file,
          (progress) => patch(key, { progress }),
          (fn) => aborts.current.set(key, fn),
        )
          .then((saved) => patch(key, { state: 'done', progress: 100, fileId: saved.id, mimeType: saved.mimeType, name: saved.filename }))
          .catch((err: unknown) => {
            if (err instanceof DOMException && err.name === 'AbortError') return;
            patch(key, { state: 'error', error: errorMessage(err) });
          })
          .finally(() => aborts.current.delete(key));
      }
    },
    [max],
  );

  const remove = useCallback((key: string) => {
    aborts.current.get(key)?.();
    aborts.current.delete(key);
    setItems((list) => list.filter((x) => x.key !== key));
  }, []);

  const reset = useCallback((seed: { fileId: string; name: string; mimeType: string | null; size?: number }[] = []) => {
    aborts.current.forEach((fn) => fn());
    aborts.current.clear();
    setItems(seed.map((f) => ({ key: `u${++seq}`, name: f.name, mimeType: f.mimeType ?? 'application/octet-stream', size: f.size ?? 0, progress: 100, state: 'done', fileId: f.fileId, error: null })));
  }, []);

  const busy = items.some((x) => x.state === 'uploading');
  const done = items.filter((x): x is UploadItem & { fileId: string } => x.state === 'done' && !!x.fileId);
  return { items, add, remove, reset, busy, done };
}

const KIND_ICON: Record<FileKind, typeof FileText> = { IMAGE: ImageIcon, VIDEO: Film, AUDIO: Mic, DOCUMENT: FileText };

export function FileKindIcon({ mimeType, className }: { mimeType: string | null | undefined; className?: string }) {
  const Icon = KIND_ICON[kindOfMime(mimeType)];
  return <Icon className={cn('size-4 shrink-0 text-muted-foreground', className)} aria-hidden />;
}

/** Rows for files being uploaded or ready to send, with progress and remove buttons. */
export function UploadRows({ items, onRemove, className }: { items: UploadItem[]; onRemove: (key: string) => void; className?: string }) {
  if (!items.length) return null;
  return (
    <ul className={cn('grid gap-1.5', className)} aria-label="Files">
      {items.map((x) => (
        <li key={x.key} className={cn('rounded-xl border px-3 py-2', x.state === 'error' ? 'border-danger/40 bg-danger-soft/30' : 'border-border bg-card')}>
          <div className="flex items-center gap-2">
            {x.state === 'error' ? <AlertTriangle className="size-4 shrink-0 text-danger" aria-hidden /> : <FileKindIcon mimeType={x.mimeType} />}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">{x.name}</span>
              <span className={cn('block truncate text-[11.5px]', x.state === 'error' ? 'text-danger' : 'text-muted-foreground')}>
                {x.state === 'error' ? x.error : x.state === 'uploading' ? `Uploading… ${x.progress}%` : x.size ? `${formatBytes(x.size)} · ready` : 'Ready'}
              </span>
            </span>
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => onRemove(x.key)} aria-label={x.state === 'uploading' ? `Cancel uploading ${x.name}` : `Remove ${x.name}`}>
              <X />
            </Button>
          </div>
          {x.state === 'uploading' && <ProgressBar value={x.progress} label={`Uploading ${x.name}`} />}
        </li>
      ))}
    </ul>
  );
}

/** A plain progress bar that follows the value (the shared one animates from zero on mount). */
function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-label={label} className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-brand transition-[width] duration-200" style={{ width: `${value}%` }} />
    </div>
  );
}

// ------------------------------------------------------------------ protected files

/** '/api/homework/…' (as the API gives it) → a fetchable URL. */
const toUrl = (url: string) => (url.startsWith('/api/') || /^https?:/i.test(url) ? url : `/api${url.startsWith('/') ? '' : '/'}${url}`);

export async function fetchFileBlob(url: string, signal?: AbortSignal): Promise<Blob> {
  const send = () => {
    const token = useAuthStore.getState().accessToken;
    return fetch(toUrl(url), { credentials: 'include', signal, headers: token ? { Authorization: `Bearer ${token}` } : {} });
  };
  let res: Response;
  try {
    res = await send();
    if (res.status === 401 && (await refreshSession())) res = await send();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }
  if (!res.ok) throw new ApiError(res.status, res.status === 404 ? 'This file is no longer available.' : 'The file couldn’t be opened.');
  return res.blob();
}

/** An object URL for a protected file, revoked when no longer shown. */
export function useObjectUrl(url: string | null) {
  const [state, setState] = useState<{ src: string | null; error: string | null }>({ src: null, error: null });
  useEffect(() => {
    if (!url) return;
    const ctrl = new AbortController();
    let made: string | null = null;
    setState({ src: null, error: null });
    fetchFileBlob(url, ctrl.signal)
      .then((b) => {
        made = URL.createObjectURL(b);
        setState({ src: made, error: null });
      })
      .catch((err: unknown) => {
        if (!(err instanceof DOMException && err.name === 'AbortError')) setState({ src: null, error: errorMessage(err) });
      });
    return () => {
      ctrl.abort();
      if (made) URL.revokeObjectURL(made);
    };
  }, [url]);
  return state;
}

/** Opens a protected file: PDFs and pictures in a new tab, other documents download. */
export async function openProtectedFile(url: string, name: string, mimeType: string | null) {
  const viewable = !!mimeType && (mimeType === 'application/pdf' || mimeType.startsWith('image/') || mimeType.startsWith('video/') || mimeType.startsWith('audio/'));
  // Open the tab straight away so pop-up blockers don't stop it.
  const tab = viewable ? window.open('about:blank', '_blank') : null;
  try {
    const blob = await fetchFileBlob(url);
    const href = URL.createObjectURL(blob);
    if (tab) tab.location.href = href;
    else {
      const a = document.createElement('a');
      a.href = href;
      a.download = name;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(href), 60_000);
  } catch (err) {
    tab?.close();
    toast.error(errorMessage(err));
  }
}

function OpenButton({ url, name, mimeType, className }: { url: string; name: string; mimeType: string | null; className?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      loading={busy}
      onClick={() => {
        setBusy(true);
        void openProtectedFile(url, name, mimeType).finally(() => setBusy(false));
      }}
    >
      {!busy && <ExternalLink />} Open
    </Button>
  );
}

function ProtectedImage({ url, name, mimeType }: { url: string; name: string; mimeType: string | null }) {
  const { src, error } = useObjectUrl(url);
  if (error) return <FileRow url={url} name={name} mimeType={mimeType} note={error} />;
  return (
    <figure className="min-w-0">
      <button
        type="button"
        onClick={() => void openProtectedFile(url, name, mimeType)}
        className="block w-full overflow-hidden rounded-xl border border-border bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Open ${name} full size`}
      >
        {src ? <img src={src} alt={name} className="mx-auto max-h-96 w-auto max-w-full object-contain" /> : <span className="grid h-40 place-items-center text-muted-foreground"><Loader2 className="size-5 animate-spin" aria-hidden /></span>}
      </button>
      <figcaption className="mt-1 truncate text-[11.5px] text-muted-foreground">{name}</figcaption>
    </figure>
  );
}

/** Video or audio: nothing downloads until the person presses play (saves phone data). */
function ProtectedMedia({ url, name, mimeType, size }: { url: string; name: string; mimeType: string | null; size?: number }) {
  const [load, setLoad] = useState(false);
  const { src, error } = useObjectUrl(load ? url : null);
  const video = kindOfMime(mimeType) === 'VIDEO';
  if (error) return <FileRow url={url} name={name} mimeType={mimeType} note={error} />;
  if (!load || !src) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
        <FileKindIcon mimeType={mimeType} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{name}</span>
          <span className="block truncate text-[11.5px] text-muted-foreground">{video ? 'Video' : 'Audio'}{size ? ` · ${formatBytes(size)}` : ''}</span>
        </span>
        <Button type="button" variant="outline" size="sm" loading={load && !src} onClick={() => setLoad(true)}>
          {!(load && !src) && <Play />} {video ? 'Watch' : 'Listen'}
        </Button>
      </div>
    );
  }
  return (
    <figure className="min-w-0">
      {video ? (
        <video src={src} controls autoPlay playsInline className="max-h-[70vh] w-full rounded-xl border border-border bg-black" aria-label={name} />
      ) : (
        <audio src={src} controls autoPlay className="w-full" aria-label={name} />
      )}
      <figcaption className="mt-1 truncate text-[11.5px] text-muted-foreground">{name}</figcaption>
    </figure>
  );
}

function FileRow({ url, name, mimeType, size, note }: { url: string; name: string; mimeType: string | null; size?: number; note?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
      <FileKindIcon mimeType={mimeType} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{name}</span>
        <span className={cn('block truncate text-[11.5px]', note ? 'text-danger' : 'text-muted-foreground')}>{note ?? (size ? formatBytes(size) : 'Document')}</span>
      </span>
      <OpenButton url={url} name={name} mimeType={mimeType} />
    </div>
  );
}

/** One protected file, shown the best way for its type. */
export function FileView({ url, name, mimeType, size }: { url: string; name: string; mimeType: string | null; size?: number }) {
  const kind = kindOfMime(mimeType);
  if (kind === 'IMAGE') return <ProtectedImage url={url} name={name} mimeType={mimeType} />;
  if (kind === 'VIDEO' || kind === 'AUDIO') return <ProtectedMedia url={url} name={name} mimeType={mimeType} size={size} />;
  return <FileRow url={url} name={name} mimeType={mimeType} size={size} />;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function LinkRow({ url, name }: { url: string; name?: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Link2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{name || hostOf(url)}</span>
        <span className="block truncate text-[11.5px] text-muted-foreground">{name ? hostOf(url) : url}</span>
      </span>
      <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
    </a>
  );
}

/** A teacher's attachments on an assignment; files are served through the assignment so the class can open them. */
export function AttachmentList({ homeworkId, attachments, className }: { homeworkId: string; attachments: { type: 'FILE' | 'LINK'; fileId: string | null; url: string; name: string; mimeType: string | null }[]; className?: string }) {
  if (!attachments.length) return null;
  return (
    <ul className={cn('grid gap-2 sm:grid-cols-2 [&>*]:min-w-0', className)} aria-label="Attachments">
      {attachments.map((a, i) => (
        <li key={`${a.fileId ?? a.url}-${i}`} className={cn(a.type === 'FILE' && kindOfMime(a.mimeType) !== 'DOCUMENT' && 'sm:col-span-2')}>
          {a.type === 'FILE' && a.fileId ? <FileView url={`/api/homework/${homeworkId}/files/${a.fileId}`} name={a.name} mimeType={a.mimeType} /> : <LinkRow url={a.url} name={a.name} />}
        </li>
      ))}
    </ul>
  );
}
