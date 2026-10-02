import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { RequestContextStore } from '../common/request-context';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

interface Bucket {
  requests: number;
  clientErrors: number;
  serverErrors: number;
  totalMs: number;
  maxMs: number;
}

const FLUSH_MS = 60_000;
const buffer = new Map<string, Bucket>();

/**
 * Counts API requests per school per day. Counting is in memory and flushed
 * once a minute as a single upsert per school, so metering costs nothing on
 * the request path. Signed-out and console traffic counts under "platform".
 */
export function apiUsageMiddleware(req: Request, res: Response, next: NextFunction) {
  const started = process.hrtime.bigint();
  // The guard fills this same object in later; 'finish' listeners may run outside the request's async context.
  const ctx = RequestContextStore.get();
  res.on('finish', () => {
    if (req.method === 'OPTIONS' || req.originalUrl.startsWith('/api/health')) return;
    const ms = Number((process.hrtime.bigint() - started) / 1_000_000n);
    const day = new Date().toISOString().slice(0, 10);
    const key = `${ctx?.tenantId ?? 'platform'}|${day}`;
    const b = buffer.get(key) ?? { requests: 0, clientErrors: 0, serverErrors: 0, totalMs: 0, maxMs: 0 };
    b.requests++;
    if (res.statusCode >= 500) b.serverErrors++;
    else if (res.statusCode >= 400) b.clientErrors++;
    b.totalMs += ms;
    b.maxMs = Math.max(b.maxMs, ms);
    buffer.set(key, b);
  });
  next();
}

@Injectable()
export class ApiUsageService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(ApiUsageService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (env().NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.flush(), FLUSH_MS);
    this.timer.unref();
  }

  async onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
    await this.flush();
  }

  async flush() {
    const entries = [...buffer.entries()];
    buffer.clear();
    for (const [key, b] of entries) {
      const [scope, day] = key.split('|') as [string, string];
      try {
        await this.prisma.root.$executeRaw`
          INSERT INTO "api_usage_daily" ("id", "scope", "day", "requests", "clientErrors", "serverErrors", "totalMs", "maxMs")
          VALUES (md5(random()::text || clock_timestamp()::text), ${scope}, ${day}::date, ${b.requests}, ${b.clientErrors}, ${b.serverErrors}, ${b.totalMs}, ${b.maxMs})
          ON CONFLICT ("scope", "day") DO UPDATE SET
            "requests" = "api_usage_daily"."requests" + EXCLUDED."requests",
            "clientErrors" = "api_usage_daily"."clientErrors" + EXCLUDED."clientErrors",
            "serverErrors" = "api_usage_daily"."serverErrors" + EXCLUDED."serverErrors",
            "totalMs" = "api_usage_daily"."totalMs" + EXCLUDED."totalMs",
            "maxMs" = GREATEST("api_usage_daily"."maxMs", EXCLUDED."maxMs")`;
      } catch (err) {
        this.logger.warn(`API usage flush failed for ${scope}: ${(err as Error).message}`);
      }
    }
  }
}
