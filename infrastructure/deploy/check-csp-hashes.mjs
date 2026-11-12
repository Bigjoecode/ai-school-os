// Fails the deploy if an inline <script> in the built web app isn't allowed by the
// Content-Security-Policy in dist/.htaccess (it would be silently blocked in browsers).
// usage: node infrastructure/deploy/check-csp-hashes.mjs apps/web/dist
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.argv[2] ?? 'apps/web/dist';
const htaccess = readFileSync(join(dist, '.htaccess'), 'utf8');
const csp = htaccess.match(/Content-Security-Policy(?:-Report-Only)? "([^"]+)"/)?.[1];
if (!csp) {
  console.error('No Content-Security-Policy found in .htaccess');
  process.exit(1);
}
const scriptSrc = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src ')) ?? '';

const htmlFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? htmlFiles(join(dir, e.name)) : e.name.endsWith('.html') ? [join(dir, e.name)] : [],
  );

let bad = 0;
for (const file of htmlFiles(dist)) {
  const html = readFileSync(file, 'utf8');
  for (const [, body] of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    if (!body.trim()) continue;
    const hash = `'sha256-${createHash('sha256').update(body).digest('base64')}'`;
    if (!scriptSrc.includes(hash)) {
      console.error(`${file}: inline script not allowed by CSP script-src; add ${hash} to apps/web/public/.htaccess`);
      bad++;
    }
  }
}
if (bad) process.exit(1);
console.log('CSP: every inline script is allowed by its hash');
