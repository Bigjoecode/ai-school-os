import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Logger } from '@nestjs/common';
import { Client } from 'pg';

/**
 * Applies pending Prisma migrations from plain SQL files, over the same
 * `pg` driver the app uses.
 *
 * Why not `prisma migrate deploy`: on shared hosting the database accepts
 * local connections only and there is no shell to run the CLI, so the API
 * migrates itself at boot. It records progress in Prisma's own
 * `_prisma_migrations` table (same columns, same sha256 checksum), so local
 * `prisma migrate dev` and this runner stay interchangeable.
 */
export async function runMigrations(databaseUrl: string): Promise<void> {
  const logger = new Logger('Migrations');
  const dir = findMigrationsDir();
  if (!dir) {
    logger.warn('No migrations folder found; skipping');
    return;
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const { rows: enc } = await client.query<{ server_encoding: string }>('SHOW server_encoding');
    if (enc[0] && !['UTF8', 'SQL_ASCII'].includes(enc[0].server_encoding)) {
      logger.warn(`Database encoding is ${enc[0].server_encoding}, not UTF8: text with "₦" or other symbols will fail to save. Recreate the database as UTF8.`);
    }
    // One runner at a time, even if Passenger starts several processes.
    await client.query('SELECT pg_advisory_lock(727274)');
    await client.query(`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
        "id"                  VARCHAR(36) PRIMARY KEY NOT NULL,
        "checksum"            VARCHAR(64) NOT NULL,
        "finished_at"         TIMESTAMPTZ,
        "migration_name"      VARCHAR(255) NOT NULL,
        "logs"                TEXT,
        "rolled_back_at"      TIMESTAMPTZ,
        "started_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
        "applied_steps_count" INTEGER NOT NULL DEFAULT 0
      )`);

    const { rows } = await client.query<{ migration_name: string }>(
      `SELECT migration_name FROM "_prisma_migrations"
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    );
    const applied = new Set(rows.map((r) => r.migration_name));

    const pending = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, 'migration.sql')))
      .map((d) => d.name)
      .sort()
      .filter((name) => !applied.has(name));

    for (const name of pending) {
      const sql = readFileSync(join(dir, name, 'migration.sql'), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const id = randomUUID();
      logger.log(`Applying ${name}`);
      // Adding an enum value can't run inside a transaction before PostgreSQL 12 (shared hosting often runs
      // older versions): run those statements first, on their own, idempotently.
      const enumAdds = sql.match(/^ALTER TYPE [^;]+ ADD VALUE [^;]+;/gim) ?? [];
      for (const stmt of enumAdds) {
        await client.query(stmt.replace(/ADD VALUE (?!IF NOT EXISTS)/i, 'ADD VALUE IF NOT EXISTS '));
      }
      const body = enumAdds.reduce((acc, stmt) => acc.replace(stmt, ''), sql);
      await client.query('BEGIN');
      try {
        await client.query(body);
        await client.query(
          `INSERT INTO "_prisma_migrations"
             (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
           VALUES ($1, $2, $3, now(), now(), 1)`,
          [id, checksum, name],
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${name} failed: ${(err as Error).message}`);
      }
    }
    if (pending.length === 0) logger.log('Database is up to date');
  } finally {
    await client.query('SELECT pg_advisory_unlock(727274)').catch(() => undefined);
    await client.end();
  }
}

function findMigrationsDir(): string | undefined {
  const candidates = [
    process.env.MIGRATIONS_DIR,
    resolve(__dirname, 'prisma/migrations'), // bundled deploy: main.js at app root
    resolve(__dirname, '../prisma/migrations'), // dist/main.js in the repo
  ].filter((p): p is string => Boolean(p));
  return candidates.find((p) => existsSync(p));
}
