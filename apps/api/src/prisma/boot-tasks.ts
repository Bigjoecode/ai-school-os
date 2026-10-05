import { Logger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from '../auth/password';
import type { Env } from '../config/env';
import { PrismaClient } from '../generated/prisma/client';
import { seedDemo } from './demo-seed';
import { ensurePlatformContent } from './platform-content';
import { installSyllabi } from './syllabus-install';
import { installCareers } from './careers-install';
import { SYSTEM_ROLES } from '@aischool/shared';

/**
 * One-off setup that would normally be a shell command, for hosting where
 * there is no shell. Both are opt-in through environment variables and safe
 * to leave set: each checks first and does nothing if its work is done.
 *
 *  - BOOTSTRAP_OWNER_EMAIL / BOOTSTRAP_OWNER_PASSWORD: creates the platform
 *    owner (super admin) when the platform has none yet.
 *  - SEED_DEMO_ON_BOOT=true: loads the Greenfield/Sunrise demo schools when
 *    they aren't there yet (without the local-only demo owner account).
 *
 * Always: installs missing platform content (parent products, the syllabus
 * graph, the starter Exam Academy bank). It never overwrites console edits.
 */
export async function runBootTasks(config: Env): Promise<void> {
  const wantsOwner = Boolean(config.BOOTSTRAP_OWNER_EMAIL && config.BOOTSTRAP_OWNER_PASSWORD);

  const logger = new Logger('BootTasks');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: config.DATABASE_URL, max: 1 }) });
  try {
    try {
      const content = await ensurePlatformContent(prisma);
      if (!content.startsWith('0 products, 0 topics, 0')) logger.log(`Platform content: ${content}`);
    } catch (err) {
      logger.error(`Platform content could not be installed: ${(err as Error).message}`);
    }

    // New features add permissions to the built-in roles; give existing
    // schools' copies of those roles anything they are missing (never removes).
    try {
      let topped = 0;
      for (const def of SYSTEM_ROLES) {
        const roles = await prisma.role.findMany({ where: { key: def.key, isSystem: true }, select: { id: true, permissions: true } });
        for (const r of roles) {
          const missing = def.permissions.filter((p) => !r.permissions.includes(p));
          if (missing.length) {
            await prisma.role.update({ where: { id: r.id }, data: { permissions: [...r.permissions, ...missing] } });
            topped++;
          }
        }
      }
      // Built-in roles added since a school was created (e.g. School Nurse).
      const tenants = await prisma.tenant.findMany({ select: { id: true, roles: { where: { isSystem: true }, select: { key: true } } } });
      let created = 0;
      for (const t of tenants) {
        const have = new Set(t.roles.map((r) => r.key));
        const missing = SYSTEM_ROLES.filter((r) => !have.has(r.key));
        if (missing.length) {
          await prisma.role.createMany({ data: missing.map((r) => ({ tenantId: t.id, key: r.key, name: r.name, description: r.description, isSystem: true, permissions: [...r.permissions] })), skipDuplicates: true });
          created += missing.length;
        }
      }
      if (topped) logger.log(`Added new permissions to ${topped} built-in role(s)`);
      if (created) logger.log(`Added ${created} new built-in role(s) to existing schools`);
    } catch (err) {
      logger.error(`Built-in roles could not be updated: ${(err as Error).message}`);
    }

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

/**
 * Installs shipped exam syllabi and the career library after the server is listening (a first
 * install is thousands of rows; it must not hold up start-up). One process
 * at a time, via an advisory lock.
 */
export function installSyllabiInBackground(config: Env): void {
  const logger = new Logger('Syllabi');
  void (async () => {
    const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: config.DATABASE_URL, max: 1 }) });
    try {
      const [lock] = await prisma.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_lock(727275) AS ok`;
      if (!lock?.ok) return;
      try {
        try {
          const result = await installSyllabi(prisma);
          if (result) logger.log(result);
        } catch (err) {
          logger.error(`Exam syllabi could not be installed: ${(err as Error).message}`);
        }
        // The career library (prisma/careers/careers.json) installs the same way.
        try {
          const careers = await installCareers(prisma);
          if (careers) new Logger('Careers').log(careers);
        } catch (err) {
          new Logger('Careers').error(`Career library could not be installed: ${(err as Error).message}`);
        }
      } finally {
        await prisma.$queryRaw`SELECT pg_advisory_unlock(727275)`;
      }
    } catch (err) {
      logger.error(`Exam syllabi could not be installed: ${(err as Error).message}`);
    } finally {
      await prisma.$disconnect().catch(() => undefined);
    }
  })();
}

