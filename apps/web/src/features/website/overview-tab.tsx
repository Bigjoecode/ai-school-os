import type { WebsiteOverview } from '@aischool/shared';
import { ArrowUpRight, Check, CircleDashed, ConciergeBell, Download, Globe, Images, Inbox, KeyRound, LayoutTemplate, Newspaper, CalendarDays, Users, Eye } from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useCan } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { CopyButton } from '../finance/ui';
import { useSaveSettings, useWebsiteOverview } from './api';
import { useOpenPreview } from './website-layout';

export default function WebsiteOverviewTab() {
  const q = useWebsiteOverview();
  if (q.error && !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data)
    return (
      <div className="grid gap-5 lg:grid-cols-3 [&>*]:min-w-0">
        <Skeleton className="h-52 rounded-2xl lg:col-span-2" />
        <Skeleton className="h-52 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl lg:col-span-3" />
      </div>
    );
  return <Overview o={q.data} />;
}

function Overview({ o }: { o: WebsiteOverview }) {
  const save = useSaveSettings();
  const preview = useOpenPreview();
  const canReception = useCan('reception.read');
  const s = o.settings;
  const url = `${window.location.origin}${o.publicUrl}`;
  const togglePublish = (published: boolean) =>
    save.mutate({ ...s, published }, { onSuccess: () => toast.success(published ? 'Your website is live' : 'Your website is offline — only previews work now') });

  const checklist = [
    { done: !!s.hero.title && s.hero.title !== 'A great education, close to home', label: 'Write your home page headline', to: '/website/pages#hero' },
    { done: !!s.about.story, label: 'Tell your school’s story', to: '/website/pages#about' },
    { done: !!(s.contact.phone || s.contact.email), label: 'Add contact details', to: '/website/pages#contact' },
    { done: o.counts.published > 0, label: 'Publish your first news post', to: '/website/news' },
    { done: o.counts.photos > 0, label: 'Upload some photos', to: '/website/gallery' },
    { done: o.counts.teachersShown > 0, label: 'Show your teachers', to: '/website/teachers' },
  ];
  const done = checklist.filter((c) => c.done).length;

  const stats = [
    { label: 'News posts', value: o.counts.published, sub: `${o.counts.posts - o.counts.published} draft${o.counts.posts - o.counts.published === 1 ? '' : 's'}`, icon: Newspaper, to: '/website/news' },
    { label: 'Photos', value: o.counts.photos, sub: `in ${o.counts.albums} album${o.counts.albums === 1 ? '' : 's'}`, icon: Images, to: '/website/gallery' },
    { label: 'Downloads', value: o.counts.downloads, sub: 'forms & documents', icon: Download, to: '/website/downloads' },
    { label: 'Teachers shown', value: o.counts.teachersShown, sub: 'on the Teachers page', icon: Users, to: '/website/teachers' },
    { label: 'Events shown', value: o.counts.eventsShown, sub: 'from the school calendar', icon: CalendarDays, to: '/website/events' },
    { label: 'New messages', value: o.counts.newMessages, sub: 'from the contact form', icon: Inbox, to: '/website/inbox', highlight: o.counts.newMessages > 0 },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-3 [&>*]:min-w-0">
        <Card className="relative overflow-hidden p-5 sm:p-6 lg:col-span-2">
          <div aria-hidden className={cn('pointer-events-none absolute -right-16 -top-16 size-56 rounded-full blur-3xl', s.published ? 'bg-success/15' : 'bg-warning/15')} />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="grid size-12 shrink-0 place-items-center rounded-2xl text-white shadow-soft" style={{ background: `linear-gradient(135deg, ${s.theme.primaryColor}, ${s.theme.accentColor})` }}>
                <Globe className="size-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-display text-lg font-semibold tracking-tight">{s.published ? 'Your website is live' : 'Your website is a draft'}</p>
                  {s.published ? (
                    <Badge variant="success" dot>
                      Published
                    </Badge>
                  ) : (
                    <Badge variant="warning" dot>
                      Not published
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-[13.5px] text-muted-foreground">{s.published ? 'Families can find it, apply online, check results and ask the AI assistant.' : 'Only people with a preview link can see it. Publish when you’re happy.'}</p>
              </div>
            </div>
            <label className="flex shrink-0 cursor-pointer items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5">
              <span className="text-[13px] font-medium">{s.published ? 'Online' : 'Offline'}</span>
              <Switch checked={s.published} disabled={save.isPending} onCheckedChange={togglePublish} aria-label="Publish the website" />
            </label>
          </div>
          <div className="relative mt-6 grid gap-3">
            <div className="flex min-w-0 items-center gap-2 rounded-xl border border-border bg-muted/40 py-1.5 pl-3.5 pr-1.5">
              <Globe className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]">{url}</span>
              <CopyButton text={url} label="website address" />
              {s.published ? (
                <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-[12px]">
                  <a href={o.publicUrl} target="_blank" rel="noopener noreferrer">
                    Open <ArrowUpRight />
                  </a>
                </Button>
              ) : (
                <Button variant="ghost" size="sm" className="h-7 px-2 text-[12px]" onClick={preview.open} loading={preview.pending}>
                  <Eye /> Preview
                </Button>
              )}
            </div>
            {o.domains.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
                <span>Domains:</span>
                {o.domains.map((d) => (
                  <span key={d.hostname} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1">
                    <span className="font-mono text-foreground">{d.hostname}</span>
                    <Badge variant={d.kind === 'WEBSITE' ? 'brand' : 'outline'}>{d.kind === 'WEBSITE' ? 'Website' : d.kind === 'PORTAL' ? 'Portal' : d.kind.toLowerCase()}</Badge>
                  </span>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="font-display text-[15px] font-semibold tracking-tight">Getting ready</p>
            <span className="text-[12.5px] text-muted-foreground tabular">
              {done}/{checklist.length}
            </span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${(done / checklist.length) * 100}%` }} />
          </div>
          <ul className="mt-4 space-y-1">
            {checklist.map((c) => (
              <li key={c.label}>
                <Link to={c.to} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] transition-colors hover:bg-muted/60">
                  {c.done ? <Check className="size-4 shrink-0 text-success" aria-hidden /> : <CircleDashed className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
                  <span className={cn(c.done && 'text-muted-foreground line-through decoration-border-strong')}>{c.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6 [&>*]:min-w-0">
        {stats.map((st) => (
          <Link key={st.label} to={st.to} className="group">
            <Card className={cn('h-full p-4 transition-[border-color,box-shadow] group-hover:border-border-strong group-hover:shadow-lift', st.highlight && 'border-brand/40')}>
              <div className="flex items-center justify-between">
                <st.icon className={cn('size-4', st.highlight ? 'text-brand' : 'text-muted-foreground')} aria-hidden />
                <ArrowUpRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
              </div>
              <p className="mt-3 font-display text-2xl font-semibold tracking-tight tabular">{st.value}</p>
              <p className="text-[12.5px] font-medium">{st.label}</p>
              <p className="truncate text-[12px] text-muted-foreground">{st.sub}</p>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        <Card className="p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
              <ConciergeBell className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="font-display text-[15px] font-semibold tracking-tight">Online applications</p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                Applications from the Admissions page land in Reception’s enquiries, marked “Applied” with a follow-up date.{' '}
                <span className="font-medium text-foreground tabular">{o.counts.applicationsThisMonth}</span> this month.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {canReception && (
                  <Button asChild variant="outline" size="sm">
                    <Link to="/reception?tab=enquiries">Open enquiries</Link>
                  </Button>
                )}
                <Button asChild variant="ghost" size="sm">
                  <Link to="/website/pages#admissions">Admissions page settings</Link>
                </Button>
              </div>
            </div>
          </div>
        </Card>
        <Card className="p-5 sm:p-6">
          <p className="font-display text-[15px] font-semibold tracking-tight">Quick actions</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {[
              { to: '/website/pages', label: 'Edit pages & theme', icon: LayoutTemplate },
              { to: '/website/news?new=1', label: 'Write a news post', icon: Newspaper },
              { to: '/website/gallery', label: 'Upload photos', icon: Images },
              { to: '/website/result-codes', label: 'Issue result codes', icon: KeyRound },
            ].map((l) => (
              <Link key={l.to} to={l.to} className="flex items-center gap-2.5 rounded-xl border border-border px-3 py-2.5 text-[13px] font-medium transition-colors hover:border-border-strong hover:bg-muted/40">
                <l.icon className="size-4 text-muted-foreground" aria-hidden />
                {l.label}
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
