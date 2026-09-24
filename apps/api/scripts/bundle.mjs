// Packs the compiled API (dist/) into a self-contained folder for shared
// hosting: one main.js with every dependency inlined, the SQL migrations the
// API applies at boot, and a dependency-free package.json. No `npm install`
// is needed on the server.
//
// tsc runs first (nest build) because Nest's dependency injection needs the
// decorator metadata tsc emits; esbuild then only bundles plain JavaScript.
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'bundle');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// Optional peers Nest probes for with try/require; leaving them external lets
// those probes fail quietly at runtime, exactly as when they aren't installed.
const optional = [
  '@nestjs/microservices',
  '@nestjs/microservices/*',
  '@nestjs/websockets',
  '@nestjs/websockets/*',
  '@fastify/*',
  'class-transformer',
  'class-transformer/*',
  'class-validator',
  'cache-manager',
  '@grpc/*',
  'kafkajs',
  'mqtt',
  'nats',
  'ioredis',
  'amqplib',
  'amqp-connection-manager',
  'pg-native',
];

const result = await build({
  entryPoints: [resolve(root, 'dist/main.js')],
  outfile: resolve(out, 'main.js'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  minify: true,
  keepNames: true, // Nest resolves providers and routes by class name
  sourcemap: 'linked',
  external: optional,
  legalComments: 'none',
  metafile: true,
  logLevel: 'warning',
});

cpSync(resolve(root, 'prisma/migrations'), resolve(out, 'prisma/migrations'), { recursive: true });
writeFileSync(
  resolve(out, 'package.json'),
  JSON.stringify({ name: 'ai-school-os-api', private: true, main: 'main.js', scripts: { start: 'node main.js' } }, null, 2),
);

const bytes = Object.values(result.metafile.outputs).reduce((n, o) => n + o.bytes, 0);
console.log(`API bundle written to ${out} (${(bytes / 1024 / 1024).toFixed(1)} MB incl. sourcemap)`);
