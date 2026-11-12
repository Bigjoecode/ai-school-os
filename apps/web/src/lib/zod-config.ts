import { z } from 'zod';

// Zod's speed-up compiles validators with `new Function`, which the Content-Security-Policy
// (no 'unsafe-eval') forbids. It falls back on its own, but its probe still trips a CSP
// violation on every page load; jitless skips the probe. Imported first in main.tsx.
z.config({ jitless: true });
