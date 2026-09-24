import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { env } from '../config/env';
import { tenantScope } from './tenant-scope';

function createClient() {
  const adapter = new PrismaPg({ connectionString: env().DATABASE_URL, max: 5 });
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
