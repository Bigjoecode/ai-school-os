// Loads the demo schools into the database in DATABASE_URL.
//   npm run db:seed
// Refuses to run in production unless SEED_ALLOW_PRODUCTION=true.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { seedDemo } from '../src/prisma/demo-seed';

if (process.env.NODE_ENV === 'production' && process.env.SEED_ALLOW_PRODUCTION !== 'true') {
  console.error('Refusing to seed demo data in production (set SEED_ALLOW_PRODUCTION=true to override).');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

seedDemo(prisma, { demoOwner: true })
  .then((summary) => console.log(`Seeded: ${summary}.`))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
