import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Clock, Eye, Facebook, Instagram, Linkedin, Mail, MapPin, Menu, MessageCircle, Phone, Twitter, X, Youtube } from 'lucide-react';
import * as React from 'react';
import { NavLink, useLocation } from 'react-router';
import { cn } from '@/lib/utils';
import { useSite } from './context';
import { Container, SiteLink, siteButton } from './ui';

export interface SiteNavItem {
  to: string;
  label: string;
}

/** The site's pages, minus those the school has switched off. */
export function useSiteNav(): { primary: SiteNavItem[]; more: SiteNavItem[]; all: SiteNavItem[] } {
  const { site, on } = useSite();
  const s = site.settings;
  const primary: SiteNavItem[] = [
    { to: '/about', label: 'About' },
    { to: '/academics', label: 'Academics' },
    { to: '/admissions', label: 'Admissions' },
    ...(on('news') ? [{ to: '/news', label: 'News' }] : []),
    ...(on('events') ? [{ to: '/events', label: 'Events' }] : []),
    ...(on('gallery') ? [{ to: '/gallery', label: 'Gallery' }] : []),
  ];
  const more: SiteNavItem[] = [
    ...(on('teachers') ? [{ to: '/teachers', label: 'Our teachers' }] : []),
    ...(on('fees') ? [{ to: '/fees', label: 'School fees' }] : []),
    ...(on('results') ? [{ to: '/results', label: 'Check results' }] : []),
    ...(on('downloads') ? [{ to: '/downloads', label: 'Downloads' }] : []),
    ...(on('alumni') ? [{ to: '/alumni', label: 'Alumni' }] : []),
    ...(s.faq.length ? [{ to: '/faq', label: 'FAQ' }] : []),
  ];
  return { primary, more, all: [{ to: '/', label: 'Home' }, ...primary, ...more, { to: '/contact', label: 'Contact' }] };
}

/** A portal link for parents and staff — only where the portal lives on this host. */
export function usePortalLogin(): string | null {
  const { basePath } = useSite();
  if (basePath) return '/login';
  const url = import.meta.env.VITE_PORTAL_URL as string | undefined;
  return url ? `${url.replace(/\/$/, '')}/login` : null;
}

export function SchoolMark({ size = 'md', light }: { size?: 'md' | 'lg'; light?: boolean }) {
  const { site } = useSite();
  const name = site.school.shortName || site.school.name;
  const acronym = /^[A-Z0-9]{2,4}$/.test(name) ? name : null;
  const letters = acronym ?? name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  const box = size === 'lg' ? 'size-12 text-[15px]' : 'size-10 text-[13px]';
  if (site.school.logoUrl) return <img src={site.school.logoUrl} alt="" className={cn(box, 'shrink-0 rounded-site object-contain', light && 'bg-white p-1')} />;
  return (
    <div aria-hidden className={cn(box, 'grid shrink-0 place-items-center rounded-site font-bold tracking-tight', light ? 'bg-white text-site' : 'bg-site text-site-on')}>
      {letters}
    </div>
  );
}

export function PreviewBanner() {
  const { preview, site } = useSite();
  if (!preview || site.settings.published) return null;
  return (
    <div className="bg-site-ink text-white print:hidden">
      <Container className="flex items-center justify-center gap-2 py-2 text-center text-[12.5px] font-medium">
        <Eye className="size-3.5 shrink-0 text-site-accent" aria-hidden />
        Preview — not published yet. Only people with this link can see it.
      </Container>
    </div>
  );
}

export function SiteHeader() {
  const { site, href } = useSite();
  const nav = useSiteNav();
  const [open, setOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);
  const { pathname } = useLocation();
  React.useEffect(() => setOpen(false), [pathname]);
  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const s = site.settings;
  return (
    <header className={cn('sticky top-0 z-40 border-b transition-[background-color,border-color,box-shadow] duration-200 print:hidden', scrolled || open ? 'border-site-line bg-white/90 shadow-[0_1px_12px_-6px_rgb(16_24_40/0.12)] backdrop-blur-xl' : 'border-transparent bg-site-bg/70 backdrop-blur')}>
      <Container className="flex h-16 items-center gap-4 sm:h-[72px]">
        <SiteLink to="/" className="flex min-w-0 items-center gap-3" aria-label={`${site.school.name} — home`}>
          <SchoolMark />
          <span className="min-w-0">
            <span className="site-h block truncate text-[15.5px] font-semibold leading-tight text-site-ink sm:text-[16.5px]">{site.school.name}</span>
            {site.school.motto && <span className="hidden truncate text-[12px] text-site-muted sm:block">{site.school.motto}</span>}
          </span>
        </SiteLink>

        <nav aria-label="Main" className="ml-auto hidden items-center gap-0.5 lg:flex">
          {nav.primary.map((i) => (
            <TopLink key={i.to} item={i} />
          ))}
          {nav.more.length > 0 && <MoreMenu items={nav.more} />}
          <TopLink item={{ to: '/contact', label: 'Contact' }} />
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-2">
          {s.admissions.open && (
            <SiteLink to="/admissions#apply" className={cn(siteButton('primary', 'sm'), 'hidden sm:inline-flex')}>
              {s.hero.primaryCta || 'Apply now'}
            </SiteLink>
          )}
          <button
            type="button"
            className="grid size-10 place-items-center rounded-site text-site-ink transition-colors hover:bg-site-soft lg:hidden"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="site-mobile-menu"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </Container>

      <AnimatePresence>
        {open && (
          <motion.div
            id="site-mobile-menu"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden border-t border-site-line bg-white lg:hidden"
          >
            <Container className="max-h-[calc(100dvh-64px)] overflow-y-auto py-4">
              <nav aria-label="Mobile" className="grid grid-cols-2 gap-1">
                {nav.all.map((i) => (
                  <NavLink
                    key={i.to}
                    to={href(i.to)}
                    end={i.to === '/'}
                    className={({ isActive }) => cn('rounded-site px-3 py-3 text-[15px] font-medium transition-colors', isActive ? 'bg-site-soft text-site' : 'text-site-ink hover:bg-site-surface')}
                  >
                    {i.label}
                  </NavLink>
                ))}
              </nav>
              {s.admissions.open && (
                <SiteLink to="/admissions#apply" className={cn(siteButton('primary', 'lg'), 'mt-4 w-full')}>
                  {s.hero.primaryCta || 'Apply now'}
                </SiteLink>
              )}
            </Container>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

function TopLink({ item }: { item: SiteNavItem }) {
  const { href } = useSite();
  return (
    <NavLink
      to={href(item.to)}
      className={({ isActive }) =>
        cn('relative rounded-site px-3 py-2 text-[14px] font-medium transition-colors', isActive ? 'text-site' : 'text-site-ink/75 hover:text-site-ink')
      }
    >
      {({ isActive }) => (
        <>
          {item.label}
          {isActive && <span className="absolute inset-x-3 -bottom-[15px] h-0.5 rounded-full bg-site" />}
        </>
      )}
    </NavLink>
  );
}

function MoreMenu({ items }: { items: SiteNavItem[] }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  React.useEffect(() => setOpen(false), [pathname]);
  React.useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 rounded-site px-3 py-2 text-[14px] font-medium text-site-ink/75 transition-colors hover:text-site-ink"
      >
        More <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            className="absolute right-0 top-full z-50 mt-2 w-52 rounded-site-lg border border-site-line bg-white p-1.5 shadow-[0_16px_40px_-12px_rgb(16_24_40/0.25)]"
          >
            {items.map((i) => (
              <SiteLink key={i.to} to={i.to} role="menuitem" className="block rounded-site px-3 py-2 text-[14px] text-site-ink transition-colors hover:bg-site-soft hover:text-site">
                {i.label}
              </SiteLink>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function waLink(phone: string) {
  return `https://wa.me/${phone.replace(/[^\d]/g, '')}`;
}
export function telLink(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}
export function mapLink(s: { mapUrl: string | null; address: string | null }) {
  if (s.mapUrl) return s.mapUrl;
  return s.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address)}` : null;
}

export function SocialLinks({ className, light }: { className?: string; light?: boolean }) {
  const { site } = useSite();
  const so = site.settings.social;
  const links = [
    { href: so.facebook, label: 'Facebook', icon: Facebook },
    { href: so.instagram, label: 'Instagram', icon: Instagram },
    { href: so.x, label: 'X (Twitter)', icon: Twitter },
    { href: so.youtube, label: 'YouTube', icon: Youtube },
    { href: so.linkedin, label: 'LinkedIn', icon: Linkedin },
  ].filter((l) => !!l.href);
  if (!links.length) return null;
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {links.map((l) => (
        <a
          key={l.label}
          href={l.href!}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={l.label}
          className={cn('grid size-9 place-items-center rounded-full transition-colors', light ? 'bg-white/10 text-white/80 hover:bg-white/20 hover:text-white' : 'bg-site-soft text-site hover:bg-site hover:text-site-on')}
        >
          <l.icon className="size-4" aria-hidden />
        </a>
      ))}
    </div>
  );
}

export function SiteFooter() {
  const { site } = useSite();
  const nav = useSiteNav();
  const login = usePortalLogin();
  const c = site.settings.contact;
  const map = mapLink(c);
  const year = new Date().getFullYear();
  return (
    <footer className="relative overflow-hidden bg-[color-mix(in_oklab,var(--site-primary)_14%,#070b14)] text-white/75 print:hidden">
      <div aria-hidden className="pointer-events-none absolute -top-40 right-0 size-96 rounded-full bg-site/30 blur-[120px]" />
      <Container className="relative py-14 sm:py-16">
        <div className="grid gap-10 md:grid-cols-12 [&>*]:min-w-0">
          <div className="md:col-span-5">
            <div className="flex items-center gap-3">
              <SchoolMark size="lg" light />
              <div className="min-w-0">
                <p className="site-h text-[18px] font-semibold leading-tight text-white">{site.school.name}</p>
                {site.school.motto && <p className="mt-0.5 text-[13px] italic text-white/60">{site.school.motto}</p>}
              </div>
            </div>
            {site.settings.seo.description && <p className="mt-5 max-w-sm text-[14px] leading-relaxed text-white/60">{site.settings.seo.description}</p>}
            <SocialLinks light className="mt-6" />
          </div>
          <div className="md:col-span-3">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/45">Explore</p>
            <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 text-[14px]">
              {nav.all.slice(1).map((i) => (
                <li key={i.to}>
                  <SiteLink to={i.to} className="transition-colors hover:text-white">
                    {i.label}
                  </SiteLink>
                </li>
              ))}
            </ul>
          </div>
          <div className="md:col-span-4">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/45">Get in touch</p>
            <ul className="mt-4 space-y-3 text-[14px]">
              {c.address && (
                <li className="flex gap-3">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-white/45" aria-hidden />
                  {map ? (
                    <a href={map} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-white">
                      {c.address}
                    </a>
                  ) : (
                    <span>{c.address}</span>
                  )}
                </li>
              )}
              {c.phone && (
                <li className="flex gap-3">
                  <Phone className="mt-0.5 size-4 shrink-0 text-white/45" aria-hidden />
                  <a href={telLink(c.phone)} className="transition-colors hover:text-white">
                    {c.phone}
                  </a>
                </li>
              )}
              {c.whatsapp && (
                <li className="flex gap-3">
                  <MessageCircle className="mt-0.5 size-4 shrink-0 text-white/45" aria-hidden />
                  <a href={waLink(c.whatsapp)} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-white">
                    WhatsApp {c.whatsapp}
                  </a>
                </li>
              )}
              {c.email && (
                <li className="flex gap-3">
                  <Mail className="mt-0.5 size-4 shrink-0 text-white/45" aria-hidden />
                  <a href={`mailto:${c.email}`} className="break-all transition-colors hover:text-white">
                    {c.email}
                  </a>
                </li>
              )}
              {c.hours && (
                <li className="flex gap-3">
                  <Clock className="mt-0.5 size-4 shrink-0 text-white/45" aria-hidden />
                  <span>{c.hours}</span>
                </li>
              )}
            </ul>
          </div>
        </div>
        <div className="mt-12 flex flex-col gap-3 border-t border-white/10 pt-6 text-[12.5px] text-white/45 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {site.school.name}. All rights reserved.
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {login && (
              <a href={login} className="font-medium text-white/70 transition-colors hover:text-white">
                Parent / staff login
              </a>
            )}
            <a href="/legal/privacy" className="transition-colors hover:text-white">
              Privacy
            </a>
            <a href="/legal/children" className="transition-colors hover:text-white">
              AI & children’s data
            </a>
            <span>Powered by AI School OS</span>
          </div>
        </div>
      </Container>
    </footer>
  );
}
