import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { careerSchema } from '@aischool/shared';
import type { Career, Prisma, PrismaClient } from '../generated/prisma/client';

/**
 * The career library shipped with the app (prisma/careers/careers.json),
 * installed at start-up like the exam syllabi. The file is applied once per
 * version (its hash is kept in platform_settings). New careers are added;
 * a career already in the library is only updated when nobody has edited it
 * in the console since the last install (we remember a hash of what we
 * wrote), so console edits always win. Course names the careers mention are
 * added to the course list without requirements, ready for the console to
 * fill in from the JAMB brochure.
 */

const SETTING_KEY = 'careers-file:careers.json';

type CareerData = ReturnType<typeof careerSchema.parse>;

function careersDir(): string | undefined {
  return [
    process.env.CAREERS_DIR,
    resolve(__dirname, 'prisma/careers'), // bundled deploy: main.js at app root
    resolve(__dirname, '../../prisma/careers'), // dist/prisma/careers-install.js in the repo
    resolve(__dirname, '../prisma/careers'),
  ].find((p): p is string => !!p && existsSync(join(p, 'careers.json')));
}

/** A stable fingerprint of a career's content, the same whether it comes from the file or the database. */
export function careerHash(c: Pick<Career, keyof CareerData> | CareerData): string {
  const shape = {
    name: c.name,
    field: c.field,
    summary: c.summary,
    description: c.description ?? null,
    dayToDay: c.dayToDay ?? null,
    skills: c.skills ?? [],
    subjects: c.subjects ?? [],
    tracks: c.tracks ?? [],
    interests: c.interests ?? [],
    courses: c.courses ?? [],
    otherRoutes: c.otherRoutes ?? null,
    professionalBodies: c.professionalBodies ?? [],
    outlook: c.outlook ?? null,
    published: c.published,
  };
  return createHash('sha256').update(JSON.stringify(shape)).digest('hex').slice(0, 16);
}

export async function installCareers(prisma: PrismaClient): Promise<string> {
  const dir = careersDir();
  if (!dir) return '';
  const raw = readFileSync(join(dir, 'careers.json'), 'utf8');
  const fileHash = createHash('sha256').update(raw).digest('hex').slice(0, 16);
  const seen = await prisma.platformSetting.findUnique({ where: { key: SETTING_KEY } });
  const prev = (seen?.value ?? null) as { hash?: string; rows?: Record<string, string> } | null;
  if (prev?.hash === fileHash) return '';

  let items: unknown[];
  try {
    const parsed = JSON.parse(raw) as unknown;
    items = Array.isArray(parsed) ? parsed : Array.isArray((parsed as { careers?: unknown[] })?.careers) ? (parsed as { careers: unknown[] }).careers : [];
  } catch (err) {
    throw new Error(`careers.json is not valid JSON: ${(err as Error).message}`);
  }

  const written: Record<string, string> = { ...(prev?.rows ?? {}) };
  const failed: string[] = [];
  let created = 0;
  let updated = 0;
  let kept = 0;
  const courseNames = new Map<string, string>();

  for (const [i, item] of items.entries()) {
    const r = careerSchema.safeParse(item);
    if (!r.success) {
      const slug = (item as { slug?: string })?.slug ?? `#${i + 1}`;
      failed.push(`${slug}: ${r.error.issues[0]?.path.join('.')} ${r.error.issues[0]?.message}`);
      continue;
    }
    const c = r.data;
    for (const name of c.courses) if (!courseNames.has(name.toLowerCase())) courseNames.set(name.toLowerCase(), name);
    const hash = careerHash(c);
    const existing = await prisma.career.findUnique({ where: { slug: c.slug } });
    const data = { ...c } as Prisma.CareerCreateInput;
    if (!existing) {
      await prisma.career.create({ data });
      created++;
      written[c.slug] = hash;
    } else if (careerHash(existing) === hash) {
      written[c.slug] = hash;
    } else if (written[c.slug] && careerHash(existing) === written[c.slug]) {
      // Untouched since our last install: take the new version.
      await prisma.career.update({ where: { id: existing.id }, data });
      updated++;
      written[c.slug] = hash;
    } else {
      kept++; // edited in the console: leave it alone
    }
  }

  // Courses the careers lead to, so the console can add their requirements.
  let courses = 0;
  if (courseNames.size) {
    const have = await prisma.universityCourse.findMany({ select: { name: true } });
    const known = new Set(have.map((h) => h.name.toLowerCase()));
    const missing = [...courseNames.entries()].filter(([k]) => !known.has(k)).map(([, name]) => name);
    if (missing.length) {
      const r = await prisma.universityCourse.createMany({ data: missing.map((name) => ({ name: name.slice(0, 160) })), skipDuplicates: true });
      courses = r.count;
    }
  }

  const value = { hash: fileHash, rows: written, installedAt: new Date().toISOString(), careers: items.length, failed: failed.slice(0, 50) };
  await prisma.platformSetting.upsert({ where: { key: SETTING_KEY }, update: { value: value as unknown as Prisma.InputJsonValue }, create: { key: SETTING_KEY, value: value as unknown as Prisma.InputJsonValue } });
  const summary = `Career library: ${created} added, ${updated} updated, ${kept} kept (edited in the console), ${courses} course(s) added${failed.length ? `; ${failed.length} skipped (${failed.slice(0, 3).join(' | ')})` : ''}`;
  return created || updated || courses || failed.length ? summary : '';
}
