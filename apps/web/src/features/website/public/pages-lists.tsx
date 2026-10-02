import {
  DOWNLOAD_CATEGORY_LABELS,
  POST_CATEGORIES,
  POST_CATEGORY_LABELS,
  type DownloadCategory,
  type PostCategory,
  type PublicAlbum,
  type PublicDownload,
  type PublicEvent,
  type PublicPhoto,
  type PublicPost,
  type PublicTeacher,
} from '@aischool/shared';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Download, FileText, Images, Newspaper, Users, X } from 'lucide-react';
import * as React from 'react';
import { useParams, useSearchParams } from 'react-router';
import { ApiError, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useSite, useSitePart, useSiteTitle } from './context';
import { EventRow, PostCard } from './pages-home';
import { CardGridSkeleton, Chip, Container, Initials, PageIntro, Prose, Reveal, Section, SiteCard, SiteEmpty, SiteError, SiteLink, Shimmer, siteButton, siteDate } from './ui';

// ------------------------------------------------------------------ news

const PAGE_SIZE = 12;

export function NewsPage() {
  useSiteTitle('News');
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [category, setCategory] = React.useState<PostCategory | 'ALL'>('ALL');
  const q = useSitePart<{ items: PublicPost[]; total: number }>('/news', { page });
  const items = q.data?.items.filter((p) => category === 'ALL' || p.category === category) ?? [];
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / PAGE_SIZE)) : 1;
  const present = new Set(q.data?.items.map((p) => p.category));
  const go = (p: number) => {
    const next = new URLSearchParams(params);
    if (p <= 1) next.delete('page');
    else next.set('page', String(p));
    setParams(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  return (
    <>
      <PageIntro eyebrow="News" title="News and stories" description="Achievements, announcements and life at school." />
      <Section>
        {q.data && present.size > 1 && (
          <div className="no-scrollbar -mx-4 mb-8 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="radiogroup" aria-label="Filter by category">
            {(['ALL', ...POST_CATEGORIES.filter((c) => present.has(c))] as const).map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={category === c}
                onClick={() => setCategory(c)}
                className={cn('shrink-0 rounded-full px-4 py-2 text-[13.5px] font-medium transition-colors', category === c ? 'bg-site text-site-on' : 'bg-site-surface text-site-ink hover:bg-site-soft')}
              >
                {c === 'ALL' ? 'All' : POST_CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
        )}
        {q.error ? (
          <SiteError message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
        ) : !q.data ? (
          <CardGridSkeleton count={6} />
        ) : items.length === 0 ? (
          <SiteEmpty icon={Newspaper} title="No news yet" description={category === 'ALL' ? 'Stories from the school will appear here.' : 'Nothing in this category on this page.'} />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
            {items.map((p, i) => (
              <Reveal key={p.slug} delay={(i % 3) * 0.05}>
                <PostCard post={p} />
              </Reveal>
            ))}
          </div>
        )}
        {pages > 1 && (
          <nav aria-label="Pages" className="mt-12 flex items-center justify-center gap-3">
            <button type="button" onClick={() => go(page - 1)} disabled={page <= 1} className={siteButton('outline', 'sm')}>
              <ChevronLeft aria-hidden /> Newer
            </button>
            <span className="text-[13.5px] text-site-muted tabular">
              Page {page} of {pages}
            </span>
            <button type="button" onClick={() => go(page + 1)} disabled={page >= pages} className={siteButton('outline', 'sm')}>
              Older <ChevronRight aria-hidden />
            </button>
          </nav>
        )}
      </Section>
    </>
  );
}

export function PostPage() {
  const { post: slug = '' } = useParams();
  const q = useSitePart<PublicPost>(`/news/${encodeURIComponent(slug)}`);
  const p = q.data;
  useSiteTitle(p?.title ?? 'News', p?.excerpt);
  const missing = q.error instanceof ApiError && q.error.status === 404;
  return (
    <article>
      <div className="border-b border-site-line bg-site-soft">
        <Container className="max-w-3xl py-12 sm:py-16">
          <SiteLink to="/news" className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-site">
            <ArrowLeft className="size-4" aria-hidden /> All news
          </SiteLink>
          {p ? (
            <>
              <div className="mt-6 flex flex-wrap items-center gap-3 text-[13.5px] text-site-muted">
                <Chip>{POST_CATEGORY_LABELS[p.category] ?? p.category}</Chip>
                <time dateTime={p.publishedAt}>{siteDate(p.publishedAt, { weekday: 'long' })}</time>
              </div>
              <h1 className="site-h mt-4 text-[32px] font-semibold leading-[1.12] text-site-ink text-balance sm:text-[44px]">{p.title}</h1>
              {p.excerpt && <p className="mt-4 text-[18px] leading-relaxed text-site-muted">{p.excerpt}</p>}
            </>
          ) : !q.error ? (
            <div className="mt-6 space-y-4">
              <Shimmer className="h-5 w-40" />
              <Shimmer className="h-10 w-full" />
              <Shimmer className="h-10 w-2/3" />
            </div>
          ) : null}
        </Container>
      </div>
      <Container className="max-w-3xl py-12 sm:py-16">
        {q.error ? (
          missing ? (
            <SiteEmpty icon={Newspaper} title="That story isn’t here" description="It may have been removed or the link is wrong." action={<SiteLink to="/news" className={siteButton('primary', 'sm')}>See all news</SiteLink>} />
          ) : (
            <SiteError message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
          )
        ) : p ? (
          <>
            {p.coverUrl && <img src={p.coverUrl} alt="" className="mb-10 aspect-[16/9] w-full rounded-site-lg object-cover" />}
            <Prose text={p.body ?? ''} />
            <div className="mt-14 border-t border-site-line pt-8">
              <SiteLink to="/news" className={siteButton('outline', 'sm')}>
                <ArrowLeft aria-hidden /> More news
              </SiteLink>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Shimmer key={i} className={cn('h-4', i % 3 === 2 ? 'w-2/3' : 'w-full')} />
            ))}
          </div>
        )}
      </Container>
    </article>
  );
}

// ------------------------------------------------------------------ events

export function EventsPage() {
  const { site } = useSite();
  useSiteTitle('Events');
  const q = useSitePart<PublicEvent[]>('/events');
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (q.data ?? []).filter((e) => (e.endDate ?? e.startDate) >= today);
  const past = (q.data ?? []).filter((e) => (e.endDate ?? e.startDate) < today).reverse();
  const byMonth = React.useMemo(() => {
    const m = new Map<string, PublicEvent[]>();
    for (const e of upcoming) {
      const k = e.startDate.slice(0, 7);
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return [...m.entries()];
  }, [upcoming]);
  return (
    <>
      <PageIntro eyebrow="Calendar" title="Events and term dates" description={site.term ? `${site.term.name}: ${siteDate(site.term.startsOn, { year: undefined })} – ${siteDate(site.term.endsOn)}.` : 'Open days, meetings, sports and celebrations.'} />
      <Section>
        {q.error ? (
          <SiteError message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
        ) : !q.data ? (
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <Shimmer key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : upcoming.length === 0 && past.length === 0 ? (
          <SiteEmpty icon={CalendarDays} title="No events published yet" description="Upcoming school events will appear here." />
        ) : (
          <div className="mx-auto max-w-4xl space-y-12">
            {upcoming.length === 0 ? (
              <SiteEmpty icon={CalendarDays} title="Nothing coming up just now" description="Check back soon for the next school events." />
            ) : (
              byMonth.map(([month, events]) => (
                <section key={month}>
                  <h2 className="site-h mb-2 text-[20px] font-semibold text-site-ink">{siteDate(`${month}-01`, { day: undefined })}</h2>
                  <SiteCard className="divide-y divide-site-line px-5 sm:px-7">
                    {events.map((e, i) => (
                      <EventRow key={i} event={e} />
                    ))}
                  </SiteCard>
                </section>
              ))
            )}
            {past.length > 0 && (
              <section>
                <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.14em] text-site-muted">Recent</h2>
                <div className="divide-y divide-site-line opacity-75">
                  {past.slice(0, 6).map((e, i) => (
                    <EventRow key={i} event={e} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </Section>
    </>
  );
}

// ------------------------------------------------------------------ gallery

export function GalleryPage() {
  useSiteTitle('Gallery');
  const q = useSitePart<PublicAlbum[]>('/gallery');
  return (
    <>
      <PageIntro eyebrow="Gallery" title="Life at school, in pictures" description="Celebrations, sports, trips and everyday moments." />
      <Section>
        {q.error ? (
          <SiteError message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
        ) : !q.data ? (
          <CardGridSkeleton count={3} />
        ) : q.data.length === 0 ? (
          <SiteEmpty icon={Images} title="No albums yet" description="Photo albums from school life will appear here." />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
            {q.data.map((a, i) => (
              <Reveal key={a.id} delay={(i % 3) * 0.05}>
                <SiteLink to={`/gallery/${a.id}`} className="group block">
                  <div className="relative aspect-[4/3] overflow-hidden rounded-site-lg bg-site-soft">
                    {a.coverUrl ? (
                      <img src={a.coverUrl} alt="" loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
                    ) : (
                      <div className="grid size-full place-items-center text-site/40">
                        <Images className="size-10" aria-hidden />
                      </div>
                    )}
                    <div aria-hidden className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/55 to-transparent" />
                    <span className="absolute bottom-3 left-3 rounded-full bg-white/90 px-2.5 py-1 text-[12px] font-medium text-site-ink backdrop-blur">
                      {a.photos} {a.photos === 1 ? 'photo' : 'photos'}
                    </span>
                  </div>
                  <p className="site-h mt-4 text-[18px] font-semibold text-site-ink transition-colors group-hover:text-site">{a.title}</p>
                  <p className="mt-1 text-[13.5px] text-site-muted">{[a.date && siteDate(a.date), a.description].filter(Boolean).join(' · ')}</p>
                </SiteLink>
              </Reveal>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

export function AlbumPage() {
  const { id = '' } = useParams();
  const q = useSitePart<PublicAlbum & { items: PublicPhoto[] }>(`/gallery/${encodeURIComponent(id)}`);
  const a = q.data;
  useSiteTitle(a?.title ?? 'Gallery', a?.description);
  const [index, setIndex] = React.useState<number | null>(null);
  return (
    <>
      <PageIntro eyebrow={a?.date ? siteDate(a.date) : 'Gallery'} title={a?.title ?? 'Album'} description={a?.description ?? undefined}>
        <SiteLink to="/gallery" className="mt-6 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-site">
          <ArrowLeft className="size-4" aria-hidden /> All albums
        </SiteLink>
      </PageIntro>
      <Section>
        {q.error ? (
          q.error instanceof ApiError && q.error.status === 404 ? (
            <SiteEmpty icon={Images} title="That album isn’t here" description="It may have been removed." action={<SiteLink to="/gallery" className={siteButton('primary', 'sm')}>See all albums</SiteLink>} />
          ) : (
            <SiteError message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
          )
        ) : !a ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Shimmer key={i} className="aspect-square" />
            ))}
          </div>
        ) : a.items.length === 0 ? (
          <SiteEmpty icon={Images} title="No photos in this album yet" description="Check back soon." />
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
            {a.items.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setIndex(i)}
                className="group relative aspect-square overflow-hidden rounded-site bg-site-soft focus-visible:outline-2"
                aria-label={p.caption ? `Open photo: ${p.caption}` : `Open photo ${i + 1}`}
              >
                <img src={p.url} alt={p.caption ?? ''} loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.05]" />
              </button>
            ))}
          </div>
        )}
      </Section>
      {a && <Lightbox photos={a.items} index={index} onIndex={setIndex} />}
    </>
  );
}

function Lightbox({ photos, index, onIndex }: { photos: PublicPhoto[]; index: number | null; onIndex: (i: number | null) => void }) {
  const open = index !== null;
  const closeRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onIndex(null);
      if (e.key === 'ArrowRight') onIndex(((index ?? 0) + 1) % photos.length);
      if (e.key === 'ArrowLeft') onIndex(((index ?? 0) - 1 + photos.length) % photos.length);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, index, photos.length, onIndex]);
  const p = index !== null ? photos[index] : null;
  return (
    <AnimatePresence>
      {p && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Photo viewer"
          className="fixed inset-0 z-[70] flex flex-col bg-[#05070c]/95 backdrop-blur"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => onIndex(null)}
        >
          <div className="flex items-center justify-between px-4 py-3 text-white/70">
            <span className="text-[13px] tabular">
              {index! + 1} / {photos.length}
            </span>
            <button ref={closeRef} type="button" aria-label="Close" onClick={() => onIndex(null)} className="grid size-10 place-items-center rounded-full hover:bg-white/10 hover:text-white">
              <X className="size-5" />
            </button>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-16" onClick={(e) => e.stopPropagation()}>
            <motion.img key={p.id} src={p.url} alt={p.caption ?? ''} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2 }} className="max-h-full max-w-full rounded-lg object-contain" />
            {photos.length > 1 && (
              <>
                <button type="button" aria-label="Previous photo" onClick={() => onIndex((index! - 1 + photos.length) % photos.length)} className="absolute left-2 grid size-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:left-4">
                  <ChevronLeft className="size-5" />
                </button>
                <button type="button" aria-label="Next photo" onClick={() => onIndex((index! + 1) % photos.length)} className="absolute right-2 grid size-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:right-4">
                  <ChevronRight className="size-5" />
                </button>
              </>
            )}
          </div>
          <p className="min-h-[56px] px-4 py-4 text-center text-[14px] text-white/80" onClick={(e) => e.stopPropagation()}>
            {p.caption}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ------------------------------------------------------------------ teachers

export function TeachersPage() {
  useSiteTitle('Our teachers');
  const q = useSitePart<PublicTeacher[]>('/teachers');
  return (
    <>
      <PageIntro eyebrow="Our people" title="Meet our teachers" description="The people who know, stretch and care for every child." />
      <Section>
        {q.error ? (
          <SiteError message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
        ) : !q.data ? (
          <CardGridSkeleton count={6} />
        ) : q.data.length === 0 ? (
          <SiteEmpty icon={Users} title="Teacher profiles coming soon" description="The school hasn’t added teacher profiles yet." />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
            {q.data.map((t, i) => (
              <Reveal key={t.id} delay={(i % 3) * 0.05}>
                <SiteCard className="flex h-full flex-col p-6">
                  <div className="flex items-center gap-4">
                    <Initials name={t.name} src={t.photoUrl} className="size-16 shrink-0 rounded-full text-[18px]" />
                    <div className="min-w-0">
                      <p className="site-h text-[18px] font-semibold leading-tight text-site-ink">{t.name}</p>
                      <p className="mt-1 text-[13.5px] text-site-muted">{[t.jobTitle, t.department].filter(Boolean).join(' · ')}</p>
                    </div>
                  </div>
                  {t.bio && <p className="mt-4 text-[14.5px] leading-relaxed text-site-muted">{t.bio}</p>}
                  {t.subjects.length > 0 && (
                    <div className="mt-auto flex flex-wrap gap-1.5 pt-5">
                      {t.subjects.slice(0, 5).map((s) => (
                        <Chip key={s} className="text-[11.5px]">
                          {s}
                        </Chip>
                      ))}
                      {t.subjects.length > 5 && <Chip tone="outline">+{t.subjects.length - 5}</Chip>}
                    </div>
                  )}
                </SiteCard>
              </Reveal>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

// ------------------------------------------------------------------ downloads

function fileSize(bytes: number | null) {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DownloadsPage() {
  useSiteTitle('Downloads');
  const q = useSitePart<PublicDownload[]>('/downloads');
  const groups = React.useMemo(() => {
    const m = new Map<DownloadCategory, PublicDownload[]>();
    for (const d of q.data ?? []) m.set(d.category, [...(m.get(d.category) ?? []), d]);
    return [...m.entries()];
  }, [q.data]);
  return (
    <>
      <PageIntro eyebrow="Downloads" title="Forms and documents" description="Prospectus, forms, calendars, policies and newsletters." />
      <Section>
        {q.error ? (
          <SiteError message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
        ) : !q.data ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Shimmer key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <SiteEmpty icon={FileText} title="No documents yet" description="Forms and documents from the school will appear here." />
        ) : (
          <div className="mx-auto max-w-4xl space-y-10">
            {groups.map(([cat, docs]) => (
              <section key={cat}>
                <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.14em] text-site-muted">{DOWNLOAD_CATEGORY_LABELS[cat] ?? cat}</h2>
                <SiteCard className="divide-y divide-site-line">
                  {docs.map((d) => (
                    <div key={d.id} className="flex items-center gap-4 p-4 sm:p-5">
                      <div className="grid size-11 shrink-0 place-items-center rounded-site bg-site-soft text-site">
                        <FileText className="size-5" aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[15.5px] font-semibold text-site-ink">{d.title}</p>
                        <p className="mt-0.5 text-[13px] text-site-muted">{[d.description, fileSize(d.sizeBytes)].filter(Boolean).join(' · ')}</p>
                      </div>
                      <a href={d.fileUrl} target="_blank" rel="noopener noreferrer" download className={cn(siteButton('outline', 'sm'), 'px-3')} aria-label={`Download ${d.title}`}>
                        <Download aria-hidden /> <span className="hidden sm:inline">Download</span>
                      </a>
                    </div>
                  ))}
                </SiteCard>
              </section>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
