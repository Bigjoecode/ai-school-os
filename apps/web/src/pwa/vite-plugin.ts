import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

/**
 * Builds /sw.js from src/pwa/service-worker.js, filling in the files to keep for offline start-up:
 * index.html, the start-up code (the entry chunk and the portal router, with everything they import
 * statically and their CSS), the manifest and the icons. Page code is *not* pre-downloaded — it is
 * kept as each page is opened — so installing costs no extra data on expensive connections.
 *
 * The worker's version is a hash of that list, so each deploy with new code ships a new worker
 * (which then offers "Update available — Reload").
 */
const TEMPLATE = fileURLToPath(new URL('./service-worker.js', import.meta.url));
const STATIC_FILES = ['/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png', '/icons/maskable-192.png', '/icons/badge-96.png', '/icons/apple-touch-icon.png'];
/** Lazily imported at start-up by main.tsx, so needed to open the portal at all. */
const STARTUP_MODULES = [/\/src\/app\/router\.tsx$/];

function render(version: string, precache: string[]): string {
  return readFileSync(TEMPLATE, 'utf8')
    .replace("'__AIS_VERSION__'", JSON.stringify(version))
    .replace('__AIS_PRECACHE__', JSON.stringify(precache, null, 2));
}

export function serviceWorker(): Plugin {
  return {
    name: 'ais-service-worker',
    // Development: serve the worker with nothing to pre-download, so push notifications still work.
    configureServer(server) {
      server.middlewares.use('/sw.js', (_req, res) => {
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(render('dev', []));
      });
    },
    generateBundle(_options, bundle) {
      this.addWatchFile(TEMPLATE);
      const chunks = Object.values(bundle).filter((f) => f.type === 'chunk');
      const byName = new Map(chunks.map((c) => [c.fileName, c]));
      const files = new Set<string>();
      const visit = (fileName: string) => {
        if (files.has(fileName)) return;
        const chunk = byName.get(fileName);
        if (!chunk) return;
        files.add(fileName);
        const css = (chunk as { viteMetadata?: { importedCss?: Set<string> } }).viteMetadata?.importedCss;
        css?.forEach((f) => files.add(f));
        chunk.imports.forEach(visit);
      };
      for (const chunk of chunks) {
        // By the modules inside, not the chunk's facade: Rollup can merge the router into a chunk without one.
        const startup = chunk.moduleIds.some((id) => STARTUP_MODULES.some((re) => re.test(id.replace(/\\/g, '/'))));
        if (chunk.isEntry || startup) visit(chunk.fileName);
      }
      const precache = ['/index.html', ...[...files].sort().map((f) => `/${f}`), ...STATIC_FILES];
      const template = readFileSync(TEMPLATE, 'utf8');
      const version = createHash('sha256').update(template).update(JSON.stringify(precache)).digest('hex').slice(0, 12);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: render(version, precache) });
    },
  };
}
