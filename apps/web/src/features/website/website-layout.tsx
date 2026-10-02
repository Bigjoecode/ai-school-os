import { Download, ExternalLink, Eye, Gauge, Images, Inbox, KeyRound, LayoutTemplate, Newspaper, CalendarDays, Users } from 'lucide-react';
import { Suspense } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { usePreviewLink, useWebsiteOverview } from './api';

const TABS = [
  { to: '/website', label: 'Overview', icon: Gauge },
  { to: '/website/pages', label: 'Pages', icon: LayoutTemplate },
  { to: '/website/news', label: 'News', icon: Newspaper },
  { to: '/website/gallery', label: 'Gallery', icon: Images },
  { to: '/website/downloads', label: 'Downloads', icon: Download },
  { to: '/website/teachers', label: 'Teachers', icon: Users },
  { to: '/website/events', label: 'Events', icon: CalendarDays },
  { to: '/website/inbox', label: 'Inbox', icon: Inbox },
  { to: '/website/result-codes', label: 'Result codes', icon: KeyRound },
] as const;

/** Opens a signed preview of the (possibly unpublished) site in a new tab. */
export function useOpenPreview() {
  const preview = usePreviewLink();
  const open = () => {
    // Open the tab synchronously so pop-up blockers allow it, then point it at the signed link.
    const win = window.open('about:blank', '_blank');
    preview.mutate(undefined, {
      onSuccess: (r) => {
        if (win) win.location.href = r.path;
        else window.location.href = r.path;
      },
      onError: (err) => {
        win?.close();
        toast.error(errorMessage(err));
      },
    });
  };
  return { open, pending: preview.isPending };
}

export default function WebsiteLayout() {
  const { pathname } = useLocation();
  const q = useWebsiteOverview();
  const preview = useOpenPreview();
  const o = q.data;
  const newMessages = o?.counts.newMessages ?? 0;
  return (
    <Page>
      <PageHeader
        className="print:hidden"
        title="Website"
        description="Your school’s public website — pages, news, photos, downloads, the inbox and the results checker."
        actions={
          o && (
            <>
              <Button variant="outline" onClick={preview.open} loading={preview.pending}>
                <Eye /> Preview
              </Button>
              {o.settings.published && (
                <Button asChild>
                  <a href={o.publicUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink /> View site
                  </a>
                </Button>
              )}
            </>
          )
        }
      />
      <nav aria-label="Website" className="print:hidden no-scrollbar -mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0">
        {TABS.map((t) => {
          const active = t.to === '/website' ? pathname === '/website' : pathname.startsWith(t.to);
          return (
            <Link
              key={t.to}
              to={t.to}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex shrink-0 items-center gap-2 px-3 pb-3 pt-1 text-[13.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <t.icon className={cn('size-4', active && 'text-brand')} />
              {t.label}
              {t.to === '/website/inbox' && newMessages > 0 && <span className="rounded-full bg-brand-soft px-1.5 text-[10.5px] font-semibold text-brand tabular">{newMessages}</span>}
              {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand" />}
            </Link>
          );
        })}
      </nav>
      <Suspense fallback={<Skeleton className="h-64 rounded-2xl" />}>
        <Outlet />
      </Suspense>
    </Page>
  );
}
