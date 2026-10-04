import { MATERIAL_KIND_LABELS, type MaterialKind, type MaterialRow } from '@aischool/shared';
import { Download, Eye, ExternalLink, FileText, Film, Headphones, Image as ImageIcon, Link2, Loader2, type LucideIcon, NotebookText, Play, Presentation } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Markdown } from '@/components/ai/markdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { fetchFileBlob, formatBytes, hostOf, openProtectedFile, useObjectUrl } from '../live/files';
import { countView, fileUrl, streamUrl } from './api';

export const KIND_ICON: Record<MaterialKind, LucideIcon> = {
  NOTE: NotebookText,
  DOCUMENT: FileText,
  SLIDES: Presentation,
  VIDEO: Film,
  AUDIO: Headphones,
  IMAGE: ImageIcon,
  LINK: Link2,
};

const KIND_TONE: Record<MaterialKind, string> = {
  NOTE: 'bg-brand-soft text-brand',
  DOCUMENT: 'bg-info-soft text-info',
  SLIDES: 'bg-warning-soft text-warning',
  VIDEO: 'bg-danger-soft text-danger',
  AUDIO: 'bg-success-soft text-success',
  IMAGE: 'bg-info-soft text-info',
  LINK: 'bg-muted text-muted-foreground',
};

export function KindIcon({ kind, className }: { kind: MaterialKind; className?: string }) {
  const Icon = KIND_ICON[kind];
  return (
    <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', KIND_TONE[kind], className)}>
      <Icon className="size-[18px]" aria-hidden />
    </span>
  );
}

/** "PDF · 2.1 MB", "YouTube video", "Written note"… */
export function materialMeta(m: MaterialRow): string {
  if (m.kind === 'NOTE') return 'Written note';
  if (m.youtubeId) return 'YouTube video';
  if (m.file) {
    const ext = m.file.name.split('.').pop()?.toUpperCase();
    return [ext && ext.length <= 4 ? ext : MATERIAL_KIND_LABELS[m.kind], formatBytes(m.file.sizeBytes)].join(' · ');
  }
  if (m.url) return hostOf(m.url);
  return MATERIAL_KIND_LABELS[m.kind];
}

export function audienceLabel(m: MaterialRow): string {
  if (m.wholeSchool) return 'Whole school';
  return [...m.classLevels.map((l) => `All ${l.name}`), ...m.classArms.map((a) => a.name)].join(', ');
}

/** One material as a tappable row; `actions` sit on the right (staff menus). */
export function MaterialTile({ m, onOpen, actions, staff }: { m: MaterialRow; onOpen: () => void; actions?: ReactNode; staff?: boolean }) {
  return (
    <div className="flex items-start gap-3 p-3 sm:p-4">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-start gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <KindIcon kind={m.kind} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="min-w-0 break-words text-[14px] font-medium leading-snug">{m.title}</span>
            {staff && !m.published && <Badge variant="warning">Draft</Badge>}
          </span>
          {m.description && <span className="mt-0.5 line-clamp-2 block text-[12.5px] text-muted-foreground">{m.description}</span>}
          <span className="mt-0.5 block text-[12px] text-muted-foreground">
            {[materialMeta(m), staff ? (m.subject?.name ?? null) : null, m.topic && staff ? m.topic : null].filter(Boolean).join(' · ')}
          </span>
          {staff && (
            <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-muted-foreground">
              <span className="min-w-0 truncate">{audienceLabel(m)}</span>
              <span className="inline-flex items-center gap-1 tabular">
                <Eye className="size-3" aria-hidden /> {m.views} {m.views === 1 ? 'view' : 'views'}
              </span>
              <span>{m.createdBy ? `${m.createdBy}, ` : ''}{formatDate(m.updatedAt)}</span>
            </span>
          )}
        </span>
      </button>
      {actions}
    </div>
  );
}

// ------------------------------------------------------------------ viewer

/** Opens a material: notes, pictures, video/audio streaming, YouTube, PDFs and links. */
export function MaterialViewer({ m, onOpenChange, footer }: { m: MaterialRow | null; onOpenChange: (open: boolean) => void; footer?: (m: MaterialRow) => ReactNode }) {
  useEffect(() => {
    if (m) countView(m.id);
  }, [m]);
  return (
    <Dialog open={!!m} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        {m && (
          <>
            <DialogHeader>
              <div className="flex items-start gap-3 pr-8">
                <KindIcon kind={m.kind} className="hidden sm:grid" />
                <div className="min-w-0">
                  <DialogTitle className="break-words">{m.title}</DialogTitle>
                  <DialogDescription>{[m.subject?.name, m.topic, m.term?.name, m.createdBy ? `Shared by ${m.createdBy}` : null].filter(Boolean).join(' · ') || MATERIAL_KIND_LABELS[m.kind]}</DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <DialogBody className="space-y-4">
              {m.description && <p className="whitespace-pre-line text-[14px] text-muted-foreground">{m.description}</p>}
              <MaterialContent m={m} />
              {footer?.(m)}
            </DialogBody>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MaterialContent({ m }: { m: MaterialRow }) {
  if (m.kind === 'NOTE') return <Markdown text={m.body ?? ''} className="rounded-xl border border-border bg-card p-4" />;
  if (m.youtubeId) return <YouTube id={m.youtubeId} title={m.title} />;
  if (m.file) {
    const mime = m.file.mimeType;
    if (mime.startsWith('image/')) return <ProtectedPicture m={m} />;
    if (mime.startsWith('video/') || mime.startsWith('audio/')) return <Stream m={m} video={mime.startsWith('video/')} />;
    return <DocumentView m={m} />;
  }
  if (m.url) return <LinkCard url={m.url} />;
  return <p className="text-[13px] text-muted-foreground">Nothing to show.</p>;
}

/** Nothing loads from YouTube until the viewer asks (saves data). Privacy-enhanced mode. */
function YouTube({ id, title }: { id: string; title: string }) {
  const [on, setOn] = useState(false);
  return (
    <div className="space-y-2">
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border bg-black">
        {on ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
            title={title}
            className="absolute inset-0 size-full"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <button type="button" onClick={() => setOn(true)} className="absolute inset-0 grid place-items-center text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Play ${title}`}>
            <span className="flex flex-col items-center gap-2">
              <span className="grid size-14 place-items-center rounded-full bg-danger shadow-lg">
                <Play className="ml-0.5 size-6 fill-current" aria-hidden />
              </span>
              <span className="text-[12.5px] text-white/80">Tap to play · uses mobile data</span>
            </span>
          </button>
        )}
      </div>
      <a href={`https://www.youtube.com/watch?v=${id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12.5px] text-brand hover:underline">
        Open in the YouTube app <ExternalLink className="size-3" aria-hidden />
      </a>
    </div>
  );
}

/** Video and audio stream with seeking; nothing downloads until play is pressed. */
function Stream({ m, video }: { m: MaterialRow; video: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setSrc(null);
    setError(null);
    streamUrl(m.id)
      .then((r) => live && setSrc(r.url))
      .catch((e: unknown) => live && setError(errorMessage(e)));
    return () => {
      live = false;
    };
  }, [m.id]);
  if (error) return <p className="text-[13px] text-danger">{error}</p>;
  if (!src) return <div className="grid h-40 place-items-center rounded-xl border border-border bg-muted/40"><Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden /></div>;
  return (
    <figure className="space-y-1.5">
      {video ? (
        <video src={src} controls preload="none" playsInline controlsList="nodownload" className="max-h-[65vh] w-full rounded-xl border border-border bg-black" aria-label={m.title} />
      ) : (
        <audio src={src} controls preload="none" className="w-full" aria-label={m.title} />
      )}
      <figcaption className="text-[11.5px] text-muted-foreground">
        {m.file ? `${formatBytes(m.file.sizeBytes)} · ` : ''}Press play to start. It streams as you watch, so you only use data for what you play.
      </figcaption>
    </figure>
  );
}

function ProtectedPicture({ m }: { m: MaterialRow }) {
  const { src, error } = useObjectUrl(fileUrl(m.id));
  if (error) return <p className="text-[13px] text-danger">{error}</p>;
  return (
    <button
      type="button"
      onClick={() => void openProtectedFile(fileUrl(m.id), m.file!.name, m.file!.mimeType)}
      className="block w-full overflow-hidden rounded-xl border border-border bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Open ${m.title} full size`}
    >
      {src ? <img src={src} alt={m.title} className="mx-auto max-h-[65vh] w-auto max-w-full object-contain" /> : <span className="grid h-48 place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden /></span>}
    </button>
  );
}

/** PDFs open in a new tab (or a preview here on bigger screens); Office files download. */
function DocumentView({ m }: { m: MaterialRow }) {
  const f = m.file!;
  const pdf = f.mimeType === 'application/pdf';
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<'open' | 'preview' | null>(null);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  const download = async () => {
    setBusy('open');
    try {
      const blob = await fetchFileBlob(fileUrl(m.id));
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = f.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 60_000);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-3 py-3">
        <KindIcon kind={m.kind} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium">{f.name}</span>
          <span className="block text-[12px] text-muted-foreground">{materialMeta(m)}</span>
        </span>
        <div className="flex w-full gap-2 sm:w-auto">
          {pdf && (
            <Button
              type="button"
              variant="outline"
              className="hidden sm:inline-flex"
              loading={busy === 'preview'}
              onClick={() => {
                setBusy('preview');
                fetchFileBlob(fileUrl(m.id))
                  .then((b) => setPreview(URL.createObjectURL(b)))
                  .catch((e: unknown) => toast.error(errorMessage(e)))
                  .finally(() => setBusy(null));
              }}
            >
              <Eye /> Preview here
            </Button>
          )}
          {pdf ? (
            <Button type="button" className="flex-1 sm:flex-none" onClick={() => void openProtectedFile(fileUrl(m.id), f.name, f.mimeType)}>
              <ExternalLink /> Open
            </Button>
          ) : (
            <Button type="button" className="flex-1 sm:flex-none" loading={busy === 'open'} onClick={() => void download()}>
              {busy !== 'open' && <Download />} Download
            </Button>
          )}
        </div>
      </div>
      {preview && <iframe src={preview} title={m.title} className="h-[70vh] w-full rounded-xl border border-border bg-white" />}
      {!pdf && <p className="text-[12px] text-muted-foreground">Opens in Word, Excel, PowerPoint or Google Docs on your phone.</p>}
    </div>
  );
}

function LinkCard({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Link2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium">{hostOf(url)}</span>
        <span className="block truncate text-[12px] text-muted-foreground">{url}</span>
      </span>
      <ExternalLink className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </a>
  );
}
