import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { env } from '../config/env';
import { tenantScope } from './tenant-scope';

function createClient() {
  const config = env();
  const adapter = new PrismaPg({
    connectionString: config.DATABASE_URL,
    max: config.DATABASE_POOL_MAX,
    // Keep connections open through short quiet spells: opening one costs a
    // Postgres backend process, and a burst (a class starting a test) would
    // otherwise pay for it on every request.
    idleTimeoutMillis: 5 * 60_000,
    // Fail a request that can't get a connection rather than letting it hang.
    connectionTimeoutMillis: 20_000,
  });
  return new PrismaClient({ adapter });
}

function createScoped(base: PrismaClient) {
  return base.$extends(tenantScope);
}

export type ScopedPrisma = ReturnType<typeof createScoped>;

/**
 * Two views of one connection pool:
 *  - `db`   — tenant-scoped. Use this for everything inside a school.
 *  - `root` — unscoped. Only for platform code (tenants, users, auth) that
 *             legitimately works across schools.
 */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  readonly root: PrismaClient;
  readonly db: ScopedPrisma;

  constructor() {
    this.root = createClient();
    this.db = createScoped(this.root);
  }

  async onModuleDestroy() {
    await this.root.$disconnect();
    this.logger.log('Database disconnected');
  }
}
