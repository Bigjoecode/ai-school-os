import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { OG_IMAGE, OG_IMAGE_ALT, OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH, SALES_SEO } from './seo-data';

/**
 * Writes a copy of the built index.html for each sales page with its own title, description and
 * Open Graph / Twitter tags (dist/og/*.html). .htaccess serves those copies for /for-schools,
 * /for-schools/deck, /for-schools/calculator and /for-boards, so a link pasted into WhatsApp shows a
 * proper preview card; the copy then boots the normal app, which renders the page.
 *
 * The public origin (for absolute og:url / og:image) is VITE_PUBLIC_ORIGIN, defaulting to the live site.
 */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function salesSeoPages(): Plugin {
  let outDir = 'dist';
  let root = process.cwd();
  return {
    name: 'ais-sales-seo-pages',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
      root = config.root;
    },
    writeBundle() {
      const origin = (process.env.VITE_PUBLIC_ORIGIN || 'https://ai-schoolportal.mejortechworld.com').replace(/\/$/, '');
      const dist = resolve(root, outDir);
      const html = readFileSync(join(dist, 'index.html'), 'utf8');
      for (const page of SALES_SEO) {
        const url = `${origin}${page.path}`;
        const tags = [
          `<link rel="canonical" href="${esc(url)}" />`,
          `<meta property="og:type" content="website" />`,
          `<meta property="og:site_name" content="AI School OS" />`,
          `<meta property="og:title" content="${esc(page.title)}" />`,
          `<meta property="og:description" content="${esc(page.description)}" />`,
          `<meta property="og:url" content="${esc(url)}" />`,
          `<meta property="og:image" content="${esc(origin + OG_IMAGE)}" />`,
          `<meta property="og:image:width" content="${OG_IMAGE_WIDTH}" />`,
          `<meta property="og:image:height" content="${OG_IMAGE_HEIGHT}" />`,
          `<meta property="og:image:alt" content="${esc(OG_IMAGE_ALT)}" />`,
          `<meta property="og:locale" content="en_NG" />`,
          `<meta name="twitter:card" content="summary_large_image" />`,
          `<meta name="twitter:title" content="${esc(page.title)}" />`,
          `<meta name="twitter:description" content="${esc(page.description)}" />`,
          `<meta name="twitter:image" content="${esc(origin + OG_IMAGE)}" />`,
        ].join('\n    ');
        const out = html
          .replace(/<title>[^<]*<\/title>/, `<title>${esc(page.title)}</title>`)
          .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(page.description)}" />`)
          .replace('</head>', `    ${tags}\n  </head>`);
        const file = join(dist, page.file);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, out);
      }
    },
  };
}
