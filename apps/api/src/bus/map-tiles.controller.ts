import { BadRequestException, Controller, Get, Logger, NotFoundException, OnModuleDestroy, Param, Res, ServiceUnavailableException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Public } from '../common/decorators';
import { uploadRoot } from '../files/files.service';

/** OpenStreetMap's standard tiles. Their policy allows this: a named client that caches and shows the attribution. */
const UPSTREAM = 'https://tile.openstreetmap.org';
const USER_AGENT = 'AISchoolOS-bus-map/1.0 (+https://ai-schoolportal.mejortechworld.com)';
/** Kept for a month, then refreshed; an old copy is still served if OpenStreetMap can't be reached. */
const FRESH_MS = 30 * 24 * 3600 * 1000;
/** Copies nobody has asked for in three months are removed. */
const PRUNE_MS = 90 * 24 * 3600 * 1000;
const MAX_ZOOM = 19;
/** Above country level, only the area around Nigeria (with a margin): the proxy is for school buses, not a free tile server. */
const OPEN_ZOOM = 6;
const AREA = { north: 16, south: 2, west: 0, east: 17 };
const MAX_BYTES = 512 * 1024;
const MAX_UPSTREAM = 4;

/** The tile numbers covering a point at a zoom (Web Mercator). */
export function tileOf(lat: number, lon: number, z: number) {
  const n = 2 ** z;
  const r = (lat * Math.PI) / 180;
  return {
    x: Math.min(n - 1, Math.max(0, Math.floor(((lon + 180) / 360) * n))),
    y: Math.min(n - 1, Math.max(0, Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n))),
  };
}

/** Whether a tile may be served: valid numbers, and inside the bus area once zoomed in past country level. */
export function tileAllowed(z: number, x: number, y: number): boolean {
  if (![z, x, y].every(Number.isInteger) || z < 0 || z > MAX_ZOOM) return false;
  const n = 2 ** z;
  if (x < 0 || y < 0 || x >= n || y >= n) return false;
  if (z <= OPEN_ZOOM) return true;
  const nw = tileOf(AREA.north, AREA.west, z);
  const se = tileOf(AREA.south, AREA.east, z);
  return x >= nw.x && x <= se.x && y >= nw.y && y <= se.y;
}

/**
 * Map tiles for the live bus map, through this server: each tile is fetched
 * from OpenStreetMap at most once a month however many schools and phones
 * view it, so the free service isn't overloaded, and parents' and drivers'
 * phones never contact it directly. Tiles are public map pictures (no
 * school data), so no sign-in is needed; tile numbers are all the URL holds.
 */
@Controller('map-tiles')
export class MapTilesController implements OnModuleDestroy {
  private readonly logger = new Logger(MapTilesController.name);
  private readonly inFlight = new Map<string, Promise<Buffer>>();
  private active = 0;
  private readonly waiting: (() => void)[] = [];
  private readonly prune = setInterval(() => void this.pruneOld(), 24 * 3600 * 1000).unref();

  onModuleDestroy() {
    clearInterval(this.prune);
  }

  @Get(':z/:x/:file')
  @Public()
  // A map screen loads a few dozen tiles and more as it pans; phones on one mobile network can share an address.
  @Throttle({ default: { limit: 1500, ttl: 60_000 } })
  async tile(@Param('z') zs: string, @Param('x') xs: string, @Param('file') file: string, @Res() res: Response) {
    const m = /^(\d{1,7})\.png$/.exec(file);
    if (!/^\d{1,2}$/.test(zs) || !/^\d{1,7}$/.test(xs) || !m) throw new BadRequestException('Not a map tile');
    const [z, x, y] = [Number(zs), Number(xs), Number(m[1])];
    if (!tileAllowed(z, x, y)) throw new NotFoundException('Map tiles are available for Nigeria');
    const body = await this.get(z, x, y);
    res.set({
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=604800',
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(body);
  }

  private path(z: number, x: number, y: number) {
    return join(uploadRoot(), 'map-tiles', String(z), String(x), `${y}.png`);
  }

  private async get(z: number, x: number, y: number): Promise<Buffer> {
    const file = this.path(z, x, y);
    const age = await stat(file).then((s) => Date.now() - s.mtimeMs, () => null);
    if (age !== null && age < FRESH_MS) return readFile(file);
    const key = `${z}/${x}/${y}`;
    let job = this.inFlight.get(key);
    if (!job) {
      job = this.fetchAndStore(z, x, y, file).finally(() => this.inFlight.delete(key));
      this.inFlight.set(key, job);
    }
    try {
      return await job;
    } catch (err) {
      // OpenStreetMap unreachable or busy: an old copy is better than a blank square.
      if (age !== null) return readFile(file);
      this.logger.warn(`Map tile ${key} unavailable: ${(err as Error).message}`);
      throw new ServiceUnavailableException('The map is busy. Try again in a moment.');
    }
  }

  private async fetchAndStore(z: number, x: number, y: number, file: string): Promise<Buffer> {
    // A few at a time towards OpenStreetMap, as their policy asks; the rest wait their turn.
    if (this.active >= MAX_UPSTREAM) {
      if (this.waiting.length > 200) throw new Error('too many tiles waiting');
      await new Promise<void>((go) => this.waiting.push(go));
    }
    this.active++;
    try {
      const ask = () => fetch(`${UPSTREAM}/${z}/${x}/${y}.png`, { headers: { 'User-Agent': USER_AGENT, Accept: 'image/png' }, redirect: 'error', signal: AbortSignal.timeout(10_000) });
      // One more try after a dropped connection (not after a refusal from OpenStreetMap).
      const r = await ask().catch(() => new Promise<void>((go) => setTimeout(go, 700)).then(ask));
      if (!r.ok) throw new Error(`OpenStreetMap answered ${r.status}`);
      if (!(r.headers.get('content-type') ?? '').startsWith('image/png')) throw new Error('not a PNG');
      const body = Buffer.from(await r.arrayBuffer());
      if (body.length > MAX_BYTES || !body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) throw new Error('not a PNG');
      await mkdir(dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, body);
      await rename(tmp, file);
      return body;
    } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }

  /** Removes tiles not refreshed in three months (an area no bus has driven through lately). */
  private async pruneOld() {
    const root = join(uploadRoot(), 'map-tiles');
    const walk = async (dir: string): Promise<void> => {
      const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const e of entries) {
        const p = join(dir, e.name);
        if (e.isDirectory()) await walk(p);
        else if (Date.now() - (await stat(p).then((s) => s.mtimeMs, () => Date.now())) > PRUNE_MS) await rm(p, { force: true });
      }
    };
    await walk(root).catch((err: unknown) => this.logger.warn(`Map tile clean-up failed: ${(err as Error).message}`));
  }
}
