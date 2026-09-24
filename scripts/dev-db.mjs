// Local PostgreSQL for development — no Docker or system install needed.
// Data lives in .data/pg and survives restarts. Stop with Ctrl+C.
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = resolve('.data/pg');
const pg = new EmbeddedPostgres({
  databaseDir: dir,
  user: 'aischool',
  password: 'aischool',
  port: 5433,
  persistent: true,
});

if (!existsSync(resolve(dir, 'PG_VERSION'))) await pg.initialise();
await pg.start();
try {
  await pg.createDatabase('aischool');
} catch {
  // already exists
}
console.log('PostgreSQL ready: postgresql://aischool:aischool@localhost:5433/aischool');

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
