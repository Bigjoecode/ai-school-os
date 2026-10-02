import { POST_CATEGORY_LABELS } from '@aischool/shared';
import { motion } from 'framer-motion';
import { ArrowRight, BookOpen, Newspaper, CalendarDays, GraduationCap, MapPin, Phone, Quote, School, Sparkles, Users } from 'lucide-react';
import { useSite, useSiteTitle } from './context';
import { telLink } from './layout';
import { Chip, Container, DateTile, Eyebrow, IconTile, Initials, MoreLink, Reveal, Section, SectionHeading, SiteCard, SiteLink, siteButton, siteDate, paragraphs } from './ui';
import { cn } from '@/lib/utils';
import type { PublicEvent, PublicPost } from '@aischool/shared';

export function HomePage() {
  const { site, on } = useSite();
  const s = site.settings;
  useSiteTitle(null);
  const firstPara = paragraphs(s.about.story)[0];
  return (
    <>
      <Hero />
      {site.stats && <Stats />}

      {(firstPara || s.about.mission) && (
        <Section>
          <div className="grid items-start gap-12 lg:grid-cols-2 [&>*]:min-w-0">
            <Reveal>
              <Eyebrow className="mb-3">About us</Eyebrow>
              <h2 className="site-h text-[28px] font-semibold leading-[1.15] text-site-ink sm:text-[36px]">{s.about.mission || `Welcome to ${site.school.name}`}</h2>
              {firstPara && <p className="mt-5 text-[16.5px] leading-relaxed text-site-muted">{firstPara}</p>}
              <div className="mt-7">
                <MoreLink to="/about">Read our story</MoreLink>
              </div>
            </Reveal>
            {s.about.values.length > 0 ? (
              <Reveal delay={0.08} className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
                {s.about.values.slice(0, 4).map((v, i) => (
                  <SiteCard key={i} className="p-5">
                    <p className="site-h text-[13px] font-semibold text-site tabular">0{i + 1}</p>
                    <p className="site-h mt-2 text-[17px] font-semibold text-site-ink">{v.title}</p>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-site-muted">{v.description}</p>
                  </SiteCard>
                ))}
              </Reveal>
            ) : s.about.vision ? (
              <Reveal delay={0.08}>
                <SiteCard className="p-7">
                  <Eyebrow>Our vision</Eyebrow>
                  <p className="site-h mt-3 text-[22px] font-semibold leading-snug text-site-ink">{s.about.vision}</p>
                </SiteCard>
              </Reveal>
            ) : null}
          </div>
        </Section>
      )}

      <Programmes />
      {s.about.leaderMessage && <LeaderMessage />}
      {on('news') && site.news.length > 0 && <LatestNews posts={site.news} />}
      {on('events') && site.events.length > 0 && <UpcomingEvents events={site.events} />}
      <ApplyCta />
    </>
  );
}

function Hero() {
  const { site } = useSite();
  const s = site.settings;
  const img = s.hero.imageUrl;
  return (
    <section className="relative isolate overflow-hidden bg-site text-white">
      {img ? (
        <>
          <img src={img} alt="" className="absolute inset-0 -z-20 size-full object-cover" />
          <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-[#060a14]/85 via-[#060a14]/55 to-[#060a14]/15" />
          <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-[#060a14]/50 to-transparent" />
        </>
      ) : (
        <>
          <div aria-hidden className="absolute inset-0 -z-20 bg-[radial-gradient(120%_90%_at_100%_0%,color-mix(in_oklab,var(--site-accent)_45%,transparent)_0%,transparent_55%),radial-gradient(90%_80%_at_0%_100%,color-mix(in_oklab,var(--site-primary)_60%,black)_0%,transparent_60%),linear-gradient(135deg,color-mix(in_oklab,var(--site-primary)_92%,white),color-mix(in_oklab,var(--site-primary)_70%,black))]" />
          <div aria-hidden className="site-grid-bg absolute inset-0 -z-10 [mask-image:radial-gradient(70%_70%_at_70%_30%,black,transparent)]" />
          <motion.div
            aria-hidden
            className="absolute -right-20 top-10 -z-10 hidden size-[420px] rounded-full border border-white/15 md:block"
            animate={{ rotate: 360 }}
            transition={{ duration: 120, repeat: Infinity, ease: 'linear' }}
          >
            <span className="absolute left-1/2 top-0 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-site-accent shadow-[0_0_24px_var(--site-accent)]" />
          </motion.div>
          <div aria-hidden className="absolute -right-4 top-28 -z-10 hidden size-[260px] rounded-full border border-white/10 md:block" />
        </>
      )}
      <Container className={cn('relative pb-28 pt-16 sm:pb-36 sm:pt-24 lg:pt-28', site.stats && 'pb-32 sm:pb-44')}>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} className="max-w-3xl">
          <div className="flex flex-wrap gap-2">
            {s.admissions.open && (
              <span className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1 text-[12.5px] font-medium text-white ring-1 ring-inset ring-white/25 backdrop-blur">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-site-accent opacity-70" />
                  <span className="relative inline-flex size-2 rounded-full bg-site-accent" />
                </span>
                Admissions open{s.admissions.entryTerms[0] ? ` · ${s.admissions.entryTerms[0]}` : ''}
              </span>
            )}
            {site.school.motto && <span className="hidden rounded-full px-3 py-1 text-[12.5px] italic text-white/75 sm:inline">“{site.school.motto}”</span>}
          </div>
          <h1 className="site-h mt-6 text-[38px] font-semibold leading-[1.05] tracking-tight text-white text-balance sm:text-[56px] lg:text-[64px]">{s.hero.title}</h1>
          {s.hero.subtitle && <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-white/80 sm:text-[19px]">{s.hero.subtitle}</p>}
          <div className="mt-9 flex flex-wrap gap-3">
            <SiteLink to={s.admissions.open ? '/admissions#apply' : '/contact'} className={siteButton('accent', 'lg')}>
              {s.admissions.open ? s.hero.primaryCta || 'Apply now' : 'Get in touch'}
              <ArrowRight aria-hidden />
            </SiteLink>
            <SiteLink to="/about" className={siteButton('light', 'lg')}>
              Discover our school
            </SiteLink>
          </div>
        </motion.div>
      </Container>
    </section>
  );
}

function Stats() {
  const { site } = useSite();
  const st = site.stats!;
  const items = [
    { value: st.students.toLocaleString(), label: 'Students', icon: GraduationCap },
    { value: st.teachers.toLocaleString(), label: 'Teachers', icon: Users },
    { value: st.classes.toLocaleString(), label: 'Classes', icon: School },
    ...(st.founded ? [{ value: st.founded, label: 'Founded', icon: Sparkles }] : []),
  ];
  return (
    <Container className="relative z-10 -mt-16 sm:-mt-20">
      <Reveal>
        <SiteCard className={cn('grid grid-cols-2 divide-site-line overflow-hidden shadow-[0_24px_60px_-24px_rgb(16_24_40/0.25)]', items.length === 4 ? 'md:grid-cols-4' : 'md:grid-cols-3')}>
          {items.map((it, i) => (
            <div key={it.label} className={cn('flex items-center gap-4 p-5 sm:p-7', i % 2 === 1 && 'border-l border-site-line', i >= 2 && 'border-t border-site-line md:border-t-0', i >= 1 && 'md:border-l')}>
              <IconTile icon={it.icon} className="hidden sm:grid" />
              <div className="min-w-0">
                <p className="site-h text-[28px] font-semibold leading-none text-site-ink tabular sm:text-[34px]">{it.value}</p>
                <p className="mt-1.5 text-[13px] font-medium text-site-muted">{it.label}</p>
              </div>
            </div>
          ))}
        </SiteCard>
      </Reveal>
    </Container>
  );
}

function Programmes() {
  const { site } = useSite();
  const a = site.settings.academics;
  const stages = [...new Set(site.classes.map((c) => c.stage).filter((x): x is string => !!x))];
  const items = a.programmes.length ? a.programmes : stages.map((st) => ({ title: st, description: site.classes.filter((c) => c.stage === st).map((c) => c.level).join(', ') }));
  if (!items.length) return null;
  return (
    <Section tone="surface">
      <SectionHeading eyebrow="Academics" title="Programmes for every stage" description={a.intro ? a.intro.split(/(?<=\.)\s/)[0] : undefined} action={<MoreLink to="/academics">Explore academics</MoreLink>} />
      <div className={cn('grid gap-5 sm:grid-cols-2 [&>*]:min-w-0', items.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3')}>
        {items.slice(0, 8).map((p, i) => (
          <Reveal key={i} delay={i * 0.05}>
            <SiteCard className="group h-full p-6 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-20px_rgb(16_24_40/0.25)]">
              <IconTile icon={BookOpen} className="transition-colors group-hover:bg-site group-hover:text-site-on" />
              <p className="site-h mt-5 text-[18px] font-semibold text-site-ink">{p.title}</p>
              <p className="mt-2 text-[14.5px] leading-relaxed text-site-muted">{p.description}</p>
            </SiteCard>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

export function LeaderMessage() {
  const { site } = useSite();
  const a = site.settings.about;
  if (!a.leaderMessage) return null;
  return (
    <Section>
      <Reveal>
        <div className="relative overflow-hidden rounded-site-lg bg-site-soft px-6 py-10 sm:px-12 sm:py-14">
          <Quote aria-hidden className="absolute right-6 top-6 size-24 text-site/10 sm:size-32" />
          <div className="relative grid items-center gap-8 md:grid-cols-[auto_1fr] [&>*]:min-w-0">
            <Initials name={a.leaderName || site.school.name} src={a.leaderPhotoUrl} className="size-28 rounded-full text-[28px] ring-4 ring-white sm:size-36" />
            <div>
              <Eyebrow>{a.leaderTitle ? `A word from our ${a.leaderTitle.toLowerCase()}` : 'A word from our head'}</Eyebrow>
              <blockquote className="site-h mt-4 text-[20px] font-medium leading-relaxed text-site-ink sm:text-[24px]">“{a.leaderMessage}”</blockquote>
              {a.leaderName && (
                <p className="mt-5 text-[14.5px]">
                  <span className="font-semibold text-site-ink">{a.leaderName}</span>
                  {a.leaderTitle && <span className="text-site-muted"> · {a.leaderTitle}</span>}
                </p>
              )}
            </div>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}

export function PostCard({ post, large }: { post: PublicPost; large?: boolean }) {
  return (
    <SiteLink to={`/news/${post.slug}`} className="group block h-full">
      <SiteCard className="flex h-full flex-col overflow-hidden transition-[transform,box-shadow] duration-200 group-hover:-translate-y-0.5 group-hover:shadow-[0_20px_40px_-20px_rgb(16_24_40/0.25)]">
        <div className={cn('relative overflow-hidden bg-site-soft', large ? 'aspect-[16/9]' : 'aspect-[16/10]')}>
          {post.coverUrl ? (
            <img src={post.coverUrl} alt="" loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
          ) : (
            <div aria-hidden className="absolute inset-0 bg-[radial-gradient(80%_80%_at_100%_0%,color-mix(in_oklab,var(--site-accent)_30%,transparent),transparent_60%),linear-gradient(135deg,color-mix(in_oklab,var(--site-primary)_85%,white),var(--site-primary))]">
              <div className="site-grid-bg absolute inset-0 opacity-70" />
              <Newspaper className="absolute bottom-5 left-5 size-7 text-white/80" aria-hidden />
              <p className="absolute bottom-5 right-5 text-[11.5px] font-semibold uppercase tracking-[0.16em] text-white/70">{POST_CATEGORY_LABELS[post.category] ?? post.category}</p>
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-site-muted">
            <Chip>{POST_CATEGORY_LABELS[post.category] ?? post.category}</Chip>
            <span>{siteDate(post.publishedAt)}</span>
          </div>
          <p className={cn('site-h mt-3 font-semibold leading-snug text-site-ink transition-colors group-hover:text-site', large ? 'text-[22px]' : 'text-[18px]')}>{post.title}</p>
          {post.excerpt && <p className="mt-2 line-clamp-3 text-[14.5px] leading-relaxed text-site-muted">{post.excerpt}</p>}
          <span className="mt-auto inline-flex items-center gap-1.5 pt-5 text-[13.5px] font-semibold text-site">
            Read more <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </span>
        </div>
      </SiteCard>
    </SiteLink>
  );
}

function LatestNews({ posts }: { posts: PublicPost[] }) {
  return (
    <Section tone="surface">
      <SectionHeading eyebrow="News" title="Latest from the school" action={<MoreLink to="/news">All news</MoreLink>} />
      <div className="grid gap-6 md:grid-cols-3 [&>*]:min-w-0">
        {posts.slice(0, 3).map((p, i) => (
          <Reveal key={p.slug} delay={i * 0.06}>
            <PostCard post={p} />
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

export function EventRow({ event }: { event: PublicEvent }) {
  return (
    <div className="flex gap-4 py-5 sm:gap-5">
      <DateTile date={event.startDate} />
      <div className="min-w-0 flex-1">
        <p className="site-h text-[17px] font-semibold text-site-ink">{event.title}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-site-muted">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-3.5" aria-hidden />
            {event.endDate && event.endDate !== event.startDate ? `${siteDate(event.startDate, { year: undefined })} – ${siteDate(event.endDate)}` : siteDate(event.startDate, { weekday: 'long' })}
            {event.time && ` · ${event.time}`}
          </span>
          {event.location && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-3.5" aria-hidden />
              {event.location}
            </span>
          )}
        </p>
        {event.description && <p className="mt-2 text-[14.5px] leading-relaxed text-site-muted">{event.description}</p>}
      </div>
    </div>
  );
}

function UpcomingEvents({ events }: { events: PublicEvent[] }) {
  return (
    <Section>
      <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] [&>*]:min-w-0">
        <div>
          <SectionHeading eyebrow="Calendar" title="What’s coming up" description="Open days, meetings, sports and celebrations — the dates families need." className="mb-6" />
          <MoreLink to="/events">See the full calendar</MoreLink>
        </div>
        <Reveal>
          <SiteCard className="divide-y divide-site-line px-5 sm:px-7">
            {events.slice(0, 4).map((e, i) => (
              <EventRow key={i} event={e} />
            ))}
          </SiteCard>
        </Reveal>
      </div>
    </Section>
  );
}

export function ApplyCta() {
  const { site } = useSite();
  const s = site.settings;
  const c = s.contact;
  return (
    <section className="px-4 pb-16 sm:px-6 sm:pb-20 lg:px-8">
      <Reveal>
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-site-lg bg-site px-6 py-12 text-site-on sm:px-12 sm:py-16">
          <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 size-80 rounded-full bg-site-accent/30 blur-3xl" />
          <div aria-hidden className="site-grid-bg pointer-events-none absolute inset-0 opacity-60 [mask-image:linear-gradient(to_left,black,transparent)]" />
          <div className="relative flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
            <div className="max-w-xl">
              <h2 className="site-h text-[28px] font-semibold leading-tight sm:text-[36px]">{s.admissions.open ? 'Give your child a place to flourish' : 'Come and see us'}</h2>
              <p className="mt-3 text-[16px] leading-relaxed opacity-80">
                {s.admissions.open ? 'Applications take five minutes. Our admissions team will call you to arrange a visit.' : 'Admissions are closed for now — get in touch and we’ll let you know when places open.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <SiteLink to={s.admissions.open ? '/admissions#apply' : '/contact'} className={siteButton('accent', 'lg')}>
                {s.admissions.open ? s.hero.primaryCta || 'Apply now' : 'Contact us'}
              </SiteLink>
              {c.phone && (
                <a href={telLink(c.phone)} className={siteButton('light', 'lg')}>
                  <Phone aria-hidden /> {c.phone}
                </a>
              )}
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
