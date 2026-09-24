import { Logger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from '../auth/password';
import type { Env } from '../config/env';
import { PrismaClient } from '../generated/prisma/client';
import { seedDemo } from './demo-seed';

/**
 * One-off setup that would normally be a shell command, for hosting where
 * there is no shell. Both are opt-in through environment variables and safe
 * to leave set: each checks first and does nothing if its work is done.
 *
 *  - BOOTSTRAP_OWNER_EMAIL / BOOTSTRAP_OWNER_PASSWORD: creates the platform
 *    owner (super admin) when the platform has none yet.
 *  - SEED_DEMO_ON_BOOT=true: loads the Greenfield/Sunrise demo schools when
 *    they aren't there yet (without the local-only demo owner account).
 */
export async function runBootTasks(config: Env): Promise<void> {
  const wantsOwner = Boolean(config.BOOTSTRAP_OWNER_EMAIL && config.BOOTSTRAP_OWNER_PASSWORD);
  if (!wantsOwner && !config.SEED_DEMO_ON_BOOT) return;

  const logger = new Logger('BootTasks');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: config.DATABASE_URL, max: 1 }) });
  try {
    if (wantsOwner) {
      const existing = await prisma.user.count({ where: { platformRole: 'SUPER_ADMIN' } });
      if (existing === 0) {
        const email = config.BOOTSTRAP_OWNER_EMAIL!.toLowerCase();
        await prisma.user.upsert({
          where: { email },
          update: { platformRole: 'SUPER_ADMIN', status: 'ACTIVE' },
          create: {
            email,
            passwordHash: await hashPassword(config.BOOTSTRAP_OWNER_PASSWORD!),
            firstName: config.BOOTSTRAP_OWNER_FIRST_NAME,
            lastName: config.BOOTSTRAP_OWNER_LAST_NAME,
            platformRole: 'SUPER_ADMIN',
          },
        });
        logger.log(`Created platform owner ${email}; remove BOOTSTRAP_OWNER_PASSWORD from the environment now`);
      }
    }

    if (config.SEED_DEMO_ON_BOOT) {
      const present = await prisma.tenant.count({ where: { slug: 'greenfield' } });
      if (!present) logger.log(`Loaded demo schools: ${await seedDemo(prisma, { demoOwner: false })}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}
