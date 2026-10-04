import { DOWNLOAD_CATEGORY_LABELS, type DownloadCategory, type PortalDownload } from '@aischool/shared';
import { Download, ExternalLink, FileText, FolderOpen } from 'lucide-react';
import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/format';
import { usePortalDownloads } from './api';
import { fileSize, PortalShell, type ShellCtx } from './ui';

const NEW_FOR_MS = 14 * 86_400_000;

export default function PortalDownloadsPage() {
  return (
    <PortalShell
      section="downloads"
      title={() => 'Downloads'}
      description={({ isParent, child }) => (isParent ? `Forms, timetables, newsletters and other documents for ${child.firstName}.` : 'Forms, timetables, newsletters and other documents from the school.')}
    >
      {(ctx) => <DownloadsBody {...ctx} />}
    </PortalShell>
  );
}

function categoryLabel(c: string) {
  return DOWNLOAD_CATEGORY_LABELS[c as DownloadCategory] ?? 'Other';
}

function DownloadsBody({ child }: ShellCtx) {
  const q = usePortalDownloads(child.id);
  const groups = useMemo(() => {
    const map = new Map<string, PortalDownload[]>();
    for (const d of q.data ?? []) map.set(d.category, [...(map.get(d.category) ?? []), d]);
    return [...map.entries()].sort(([a], [b]) => categoryLabel(a).localeCompare(categoryLabel(b)));
  }, [q.data]);

  if (q.error && !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 rounded-2xl" />
        <Skeleton className="h-16 rounded-2xl" />
        <Skeleton className="h-16 rounded-2xl" />
      </div>
    );
  }
  if (q.data.length === 0) {
    return (
      <Card>
        <EmptyState icon={FolderOpen} title="No documents yet" description="When the school shares forms, newsletters or timetables, you’ll find them here." />
      </Card>
    );
  }
  return (
    <div className="space-y-6">
      {groups.map(([cat, rows]) => (
        <section key={cat} aria-label={categoryLabel(cat)}>
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">{categoryLabel(cat)}</h2>
          <Card className="divide-y divide-border overflow-hidden">
            {rows.map((d) => (
              <DownloadRow key={d.id} d={d} />
            ))}
          </Card>
        </section>
      ))}
    </div>
  );
}

function DownloadRow({ d }: { d: PortalDownload }) {
  const external = /^https?:\/\//i.test(d.fileUrl) && !d.fileUrl.startsWith(window.location.origin);
  const ext = d.fileUrl.split('?')[0].split('.').pop();
  const kind = ext && ext.length <= 4 && !external ? ext.toUpperCase() : null;
  const isNew = Date.now() - Date.parse(d.updatedAt) < NEW_FOR_MS;
  const meta = [kind, fileSize(d.sizeBytes), `Updated ${formatDate(d.updatedAt)}`].filter(Boolean).join(' · ');
  return (
    <div className="flex items-center gap-3 p-3 sm:p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
        <FileText className="size-[18px]" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5 text-[14px] font-medium leading-snug">
          <span className="min-w-0 break-words">{d.title}</span>
          {isNew && <Badge variant="success">New</Badge>}
        </p>
        {d.description && <p className="line-clamp-2 text-[12.5px] text-muted-foreground">{d.description}</p>}
        <p className="text-[12px] text-muted-foreground">{meta}</p>
      </div>
      <Button asChild variant="outline" size="icon" className="sm:hidden" aria-label={`${external ? 'Open' : 'Download'} ${d.title}`}>
        <a href={d.fileUrl} target="_blank" rel="noopener noreferrer">
          {external ? <ExternalLink /> : <Download />}
        </a>
      </Button>
      <Button asChild variant="outline" className="hidden sm:inline-flex">
        <a href={d.fileUrl} target="_blank" rel="noopener noreferrer">
          {external ? <ExternalLink /> : <Download />} {external ? 'Open' : 'Download'}
        </a>
      </Button>
    </div>
  );
}
