// The bus map's tile cache: only real tile numbers, only the Nigeria area once zoomed in,
// and a tile fetched from OpenStreetMap once is then served from the server's copy.
// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/map-tiles.test.ts
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.JWT_SECRET ??= 'local-test-secret-local-test-secret';
process.env.DATABASE_URL ??= 'postgresql://x:y@localhost:5432/none';
const dir = mkdtempSync(join(tmpdir(), 'tiles-'));
process.env.UPLOAD_DIR = dir;

/* eslint-disable @typescript-eslint/no-require-imports */
const { MapTilesController, tileAllowed, tileOf } = require('../src/bus/map-tiles.controller') as typeof import('../src/bus/map-tiles.controller');

test('only valid tiles, and only around Nigeria once zoomed in', () => {
  const lagos = tileOf(6.45, 3.39, 15);
  assert.equal(tileAllowed(15, lagos.x, lagos.y), true);
  const london = tileOf(51.5, -0.12, 15);
  assert.equal(tileAllowed(15, london.x, london.y), false);
  assert.equal(tileAllowed(3, 0, 0), true); // world view
  assert.equal(tileAllowed(20, 0, 0), false);
  assert.equal(tileAllowed(2, 4, 0), false);
  assert.equal(tileAllowed(2, -1, 0), false);
});

test('bad tile addresses are refused before anything is fetched', async () => {
  const c = new MapTilesController();
  await assert.rejects(c.tile('15', '1', '..%2f.png', {} as never), /Not a map tile/);
  const london = tileOf(51.5, -0.12, 15);
  await assert.rejects(c.tile('15', String(london.x), `${london.y}.png`, {} as never), /Nigeria/);
  c.onModuleDestroy();
});

test('a tile is fetched once, then served from the copy', { timeout: 30_000 }, async () => {
  const c = new MapTilesController();
  const t = tileOf(6.45, 3.39, 12);
  const sent: Buffer[] = [];
  const res = { set: () => res, send: (b: Buffer) => sent.push(b) } as never;
  await c.tile('12', String(t.x), `${t.y}.png`, res);
  const file = join(dir, 'map-tiles', '12', String(t.x), `${t.y}.png`);
  const first = statSync(file).mtimeMs;
  await c.tile('12', String(t.x), `${t.y}.png`, res);
  assert.equal(statSync(file).mtimeMs, first);
  assert.equal(sent.length, 2);
  assert.ok(sent[0]!.length > 100 && sent[0]!.equals(sent[1]!));
  c.onModuleDestroy();
  rmSync(dir, { recursive: true, force: true });
});
