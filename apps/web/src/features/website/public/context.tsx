import type { PublicSite, WebsiteSection } from '@aischool/shared';
import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useEffect } from 'react';
import { api } from '@/lib/api';

export interface SiteContextValue {
  site: PublicSite;
  slug: string;
  /** `/s/:slug` on the portal, `` on the school's own domain. */
  basePath: string;
  /** Preview token for unpublished sites — kept on every link. */
  preview: string | null;
  /** Link target inside the site, e.g. href('/about'). */
  href: (to: string) => string;
  /** A page or section the school has switched on. */
  on: (section: WebsiteSection) => boolean;
}

export const SiteContext = createContext<SiteContextValue | null>(null);

export function useSite(): SiteContextValue {
  const ctx = useContext(SiteContext);
  if (!ctx) throw new Error('useSite must be used inside the public website');
  return ctx;
}

export function makeHref(basePath: string, preview: string | null) {
  return (to: string) => {
    const [path, hash] = to.split('#');
    const joined = `${basePath}${path === '/' ? '' : path}` || '/';
    const qs = preview ? `?preview=${encodeURIComponent(preview)}` : '';
    return `${joined}${qs}${hash ? `#${hash}` : ''}`;
  };
}

/** Public website data. Everything is keyed by the site and the preview token. */
export const sk = {
  site: (slug: string, preview: string | null) => ['public-site', slug, preview] as const,
  part: (slug: string, preview: string | null, ...rest: (string | number)[]) => ['public-site', slug, preview, ...rest] as const,
};

export function usePublicSite(slug: string, preview: string | null) {
  return useQuery({
    queryKey: sk.site(slug, preview),
    queryFn: ({ signal }) => api.get<PublicSite>(`/public/sites/${encodeURIComponent(slug)}`, { preview }, signal),
    staleTime: 5 * 60_000,
    retry: (n, err) => !(err && 'status' in err && (err as { status: number }).status === 404) && n < 2,
  });
}

/** A query for one part of the public site (news, gallery, …). */
export function useSitePart<T>(path: string, query?: Record<string, string | number | undefined>, enabled = true) {
  const { slug, preview } = useSite();
  return useQuery({
    queryKey: sk.part(slug, preview, path, JSON.stringify(query ?? {})),
    queryFn: ({ signal }) => api.get<T>(`/public/sites/${encodeURIComponent(slug)}${path}`, { ...query, preview }, signal),
    staleTime: 2 * 60_000,
    enabled,
  });
}

/** Sets the page title (and meta description) for a public page. */
export function useSiteTitle(title: string | null, description?: string | null) {
  const { site } = useSite();
  const name = site.settings.seo.title || site.school.name;
  useEffect(() => {
    document.title = title ? `${title} · ${name}` : name;
    const desc = description || site.settings.seo.description || site.settings.hero.subtitle || '';
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    meta.content = desc.slice(0, 160);
  }, [title, description, name, site.settings.seo.description, site.settings.hero.subtitle]);
}

/** Readable text colour on a hex background. */
export function onColor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.45 ? '#0b1220' : '#ffffff';
}
