import type { WebsiteSection } from '@aischool/shared';
import { Globe2 } from 'lucide-react';
import * as React from 'react';
import { Route, Routes, useLocation, useParams, useSearchParams } from 'react-router';
import { ApiError } from '@/lib/api';
import { AlumniSignupPage } from '@/features/alumni/public-alumni-page';
import { AssistantWidget } from './assistant';
import { makeHref, onColor, SiteContext, type SiteContextValue, usePublicSite } from './context';
import { PreviewBanner, SiteFooter, SiteHeader } from './layout';
import { AboutPage, AcademicsPage, FaqPage, FeesPage } from './pages-content';
import { AdmissionsPage, ContactPage, ResultsPage } from './pages-forms';
import { HomePage } from './pages-home';
import { AlbumPage, DownloadsPage, EventsPage, GalleryPage, NewsPage, PostPage, TeachersPage } from './pages-lists';
import { Container, SiteLink, siteButton } from './ui';

/** The public website, at /s/:slug on the portal. */
export function PublicSiteRoute() {
  const { slug = '' } = useParams();
  return <PublicSiteApp slug={slug} basePath={`/s/${slug}`} />;
}

/** Websites are always light, whatever the visitor's portal theme. */
function useForceLight() {
  React.useLayoutEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains('dark');
    const prevScheme = root.style.colorScheme;
    root.classList.remove('dark');
    root.style.colorScheme = 'light';
    return () => {
      if (wasDark) root.classList.add('dark');
      root.style.colorScheme = prevScheme;
    };
  }, []);
}

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  React.useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1));
      if (el) {
        window.setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
        return;
      }
    }
    window.scrollTo({ top: 0 });
  }, [pathname, hash]);
  return null;
}

export default function PublicSiteApp({ slug, basePath }: { slug: string; basePath: string }) {
  useForceLight();
  const [params] = useSearchParams();
  // Keep the preview token for the whole visit, even if a link drops it.
  const [preview] = React.useState<string | null>(() => params.get('preview'));
  const q = usePublicSite(slug, preview);

  const ctx = React.useMemo<SiteContextValue | null>(() => {
    if (!q.data) return null;
    const site = q.data;
    return {
      site,
      slug,
      basePath,
      preview,
      href: makeHref(basePath, preview),
      on: (s: WebsiteSection) => site.settings.sections[s] !== false,
    };
  }, [q.data, slug, basePath, preview]);

  if (q.error && !q.data) {
    const notFound = q.error instanceof ApiError && q.error.status === 404;
    return <SiteUnavailable notFound={notFound} onRetry={() => void q.refetch()} />;
  }
  if (!ctx) return <SiteSplash />;

  const t = ctx.site.settings.theme;
  const style = {
    '--site-primary': t.primaryColor,
    '--site-accent': t.accentColor,
    '--site-on-primary': onColor(t.primaryColor),
  } as React.CSSProperties;

  return (
    <SiteContext.Provider value={ctx}>
      <div className="site flex min-h-dvh flex-col font-sans antialiased" data-style={t.style} style={style}>
        <ScrollToTop />
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-site focus:bg-white focus:px-3 focus:py-2 focus:shadow">
          Skip to content
        </a>
        <PreviewBanner />
        <SiteHeader />
        <main id="main" className="flex-1">
          <Routes>
            <Route index element={<HomePage />} />
            <Route path="about" element={<AboutPage />} />
            <Route path="academics" element={<AcademicsPage />} />
            <Route path="admissions" element={<AdmissionsPage />} />
            <Route path="contact" element={<ContactPage />} />
            {ctx.site.settings.faq.length > 0 && <Route path="faq" element={<FaqPage />} />}
            {ctx.on('teachers') && <Route path="teachers" element={<TeachersPage />} />}
            {ctx.on('news') && <Route path="news" element={<NewsPage />} />}
            {ctx.on('news') && <Route path="news/:post" element={<PostPage />} />}
            {ctx.on('events') && <Route path="events" element={<EventsPage />} />}
            {ctx.on('gallery') && <Route path="gallery" element={<GalleryPage />} />}
            {ctx.on('gallery') && <Route path="gallery/:id" element={<AlbumPage />} />}
            {ctx.on('results') && <Route path="results" element={<ResultsPage />} />}
            {ctx.on('downloads') && <Route path="downloads" element={<DownloadsPage />} />}
            {ctx.on('fees') && <Route path="fees" element={<FeesPage />} />}
            {ctx.on('alumni') && <Route path="alumni" element={<AlumniSignupPage />} />}
            <Route path="*" element={<PageNotFound />} />
          </Routes>
        </main>
        <SiteFooter />
        {ctx.on('assistant') && <AssistantWidget />}
      </div>
    </SiteContext.Provider>
  );
}

function SiteSplash() {
  return (
    <div className="grid min-h-dvh place-items-center bg-white" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-4">
        <div className="size-10 animate-spin rounded-full border-2 border-slate-200 border-t-slate-500" />
        <span className="sr-only">Loading the school website…</span>
      </div>
    </div>
  );
}

function SiteUnavailable({ notFound, onRetry }: { notFound: boolean; onRetry: () => void }) {
  React.useEffect(() => {
    document.title = notFound ? 'School website not found' : 'School website unavailable';
  }, [notFound]);
  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden bg-[#f7f8fb] px-4 text-[#0b1220]">
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/3 size-[480px] -translate-x-1/2 rounded-full bg-indigo-200/40 blur-[120px]" />
      <div className="relative max-w-md text-center">
        <div className="mx-auto grid size-16 place-items-center rounded-2xl border border-slate-200 bg-white shadow-sm">
          <Globe2 className="size-7 text-slate-500" aria-hidden />
        </div>
        <h1 className="mt-6 font-display text-[26px] font-semibold tracking-tight">{notFound ? 'This school website doesn’t exist or isn’t published yet' : 'We couldn’t load this website'}</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-slate-500">
          {notFound ? 'Check the address and try again. If you run this school, publish the website from the Website section of your portal.' : 'Please check your connection and try again in a moment.'}
        </p>
        {!notFound && (
          <button type="button" onClick={onRetry} className="mt-6 inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-[14px] font-medium shadow-sm hover:bg-slate-50">
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

function PageNotFound() {
  React.useEffect(() => {
    document.title = 'Page not found';
  }, []);
  return (
    <Container className="py-24 text-center sm:py-32">
      <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-site">404</p>
      <h1 className="site-h mt-3 text-[34px] font-semibold text-site-ink sm:text-[44px]">We can’t find that page</h1>
      <p className="mx-auto mt-3 max-w-md text-[16px] text-site-muted">It may have moved, or this part of the website isn’t available.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <SiteLink to="/" className={siteButton('primary')}>
          Back to home
        </SiteLink>
        <SiteLink to="/contact" className={siteButton('outline')}>
          Contact the school
        </SiteLink>
      </div>
    </Container>
  );
}
