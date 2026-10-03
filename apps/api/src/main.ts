import 'reflect-metadata';
import 'dotenv/config';
import { stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { env } from './config/env';
import { runBootTasks } from './prisma/boot-tasks';
import { sendAlertNow } from './alerts/alerts.service';
import { runMigrations } from './prisma/migrator';

async function bootstrap() {
  const config = env();
  const logger = new Logger('Bootstrap');

  if (config.RUN_MIGRATIONS_ON_BOOT) await runMigrations(config.DATABASE_URL);
  await runBootTasks(config);

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Webhook signatures (Paystack) are computed over the exact raw body.
    rawBody: true,
    logger: config.NODE_ENV === 'production' ? ['log', 'warn', 'error'] : undefined,
  });

  // Behind cPanel's Apache/Passenger (and any other proxy): trust the first
  // hop so req.ip and secure cookies see the real client and scheme.
  app.set('trust proxy', 1);
  // CSV imports send a whole school's student list as JSON (the default limit is 100 KB).
  app.useBodyParser('json', { limit: '6mb' });
  app.use(helmet());
  app.use(cookieParser());

  // Passenger may hand requests over with the /api mount point stripped;
  // put it back so routes match either way.
  app.use((req: { url: string }, _res: unknown, next: () => void) => {
    if (!req.url.startsWith('/api')) req.url = `/api${req.url}`;
    next();
  });
  app.setGlobalPrefix('api');

  if (config.CORS_ORIGINS.length) {
    app.enableCors({ origin: config.CORS_ORIGINS, credentials: true });
  }
  app.enableShutdownHooks();

  await app.listen(config.PORT);
  logger.log(`AI School OS API listening on :${config.PORT} (${config.NODE_ENV})`);
}

bootstrap().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  // The app can't start (bad database password, failed migration…): email the operator if alerts are set up.
  // Passenger retries the start on every request, so send at most one of these an hour.
  const marker = join(tmpdir(), 'ai-school-os-boot-alert');
  const last = await stat(marker).then((s) => s.mtimeMs).catch(() => 0);
  if (Date.now() - last > 60 * 60_000) {
    await writeFile(marker, new Date().toISOString()).catch(() => undefined);
    await sendAlertNow('The API failed to start', `${(err as Error)?.stack ?? String(err)}`.slice(0, 4000)).catch(() => undefined);
  }
  process.exit(1);
});
