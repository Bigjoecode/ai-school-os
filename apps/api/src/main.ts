import 'reflect-metadata';
import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { env } from './config/env';
import { runBootTasks } from './prisma/boot-tasks';
import { runMigrations } from './prisma/migrator';

async function bootstrap() {
  const config = env();
  const logger = new Logger('Bootstrap');

  if (config.RUN_MIGRATIONS_ON_BOOT) await runMigrations(config.DATABASE_URL);
  await runBootTasks(config);

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: config.NODE_ENV === 'production' ? ['log', 'warn', 'error'] : undefined,
  });

  // Behind cPanel's Apache/Passenger (and any other proxy): trust the first
  // hop so req.ip and secure cookies see the real client and scheme.
  app.set('trust proxy', 1);
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

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
