import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { Prisma, PrismaClient } from '../generated/prisma/client';

/**
 * JAMB's brochure (institutions, the courses each offers and the admission
 * requirements), as published on IBASS (ibass.jamb.gov.ng), shipped as
 * prisma/jamb/ibass.json.gz and installed at start-up after the syllabi and
 * the career library. It is JAMB's data, never edited in the console, so a
 * new file simply replaces the tables (inside one transaction, with DELETE
 * rather than TRUNCATE, so readers keep seeing the old copy until it
 * commits). The file's hash (with faculties.json's) is kept in
 * platform_settings so each version installs once.
 */

export const JAMB_SETTING = 'jamb-file:ibass.json.gz';
/** Normalised course name → JAMB course ids (most institutions first), for linking careers' course names. */
export const JAMB_NAMES_SETTING = 'jamb-course-names';

interface IbassFile {
  source?: string;
  fetchedAt?: string;
  institutions: {
    id: number;
    name: string;
    abbr?: string | null;
    state?: string | null;
    address?: string | null;
    type: string;
    category?: string | null;
    ownership?: string | null;
    accreditation?: string | null;
    mode?: string | null;
    specialization?: string | null;
  }[];
  programmes: {
    id: number;
    inst: number;
    course?: number | null;
    name: string;
    dept?: string | null;
    utmeSubjects?: number | null;
    olevel?: number | null;
    de?: number | null;
    remarks?: number | null;
    duration?: string | null;
    status?: string | null;
    accreditation?: string | null;
    mode?: string | null;
  }[];
  texts: string[];
}

export interface JambInstallInfo {
  hash: string;
  installedAt: string;
  durationMs: number;
  source: string | null;
  fetchedAt: string | null;
  institutions: number;
  programmes: number;
  texts: number;
  courses: number;
  withFaculty: number;
}

function jambDir(): string | undefined {
  return [
    process.env.JAMB_DIR,
    resolve(__dirname, 'prisma/jamb'), // bundled deploy: main.js at app root
    resolve(__dirname, '../../prisma/jamb'), // dist/prisma/jamb-install.js in the repo
    resolve(__dirname, '../prisma/jamb'),
  ].find((p): p is string => !!p && existsSync(join(p, 'ibass.json.gz')));
}

export function jambFile(name: string): string | undefined {
  const dir = jambDir();
  return dir && existsSync(join(dir, name)) ? join(dir, name) : undefined;
}

/** "Banking & Finance", "BANKING AND FINANCE", "Banking/Finance" → "bankingandfinance". Must match scripts/build-jamb-faculties.mjs. */
export function normCourse(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\//g, ' and ')
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9]+/g, '');
}

const SMALL = new Set(['and', 'of', 'in', 'the', 'for', 'with', 'to', 'on', 'at', 'or', 'a', 'an', 'by']);
const KEEP_UPPER = /^(ICT|NCE|ND|HND|OND|II|III|IV|UTME|FCT|PGD|LLB|MBBS|BDS|DVM|ODL|ECWA|NBC|NTC|NTA|COE|FCE)$/;

/** JAMB's capitals made readable: "UNIVERSITY OF IBADAN, IBADAN, OYO STATE" → "University of Ibadan, Ibadan, Oyo State". Mixed-case names are kept. */
export function titleCase(s: string | null | undefined): string {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  if (!t || t !== t.toUpperCase()) return t;
  let first = true;
  return t.replace(/[A-Z0-9][A-Z0-9'’.]*/g, (w) => {
    const lower = w.toLowerCase();
    const out = KEEP_UPPER.test(w) || (/^[A-Z]{2,}$/.test(w) && !/[AEIOUY]/.test(w)) ? w : !first && SMALL.has(lower) ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
    first = false;
    return out;
  });
}

const DEPT_FACULTY: Record<string, string> = {
  SCIENCES: 'Sciences',
  SCIENCE: 'Sciences',
  'SOCIAL SCIENCES': 'Social Sciences',
  'SOCIAL SCIENCE': 'Social Sciences',
  ARTS: 'Arts',
  'ARTS AND HUMANITIES': 'Arts',
  ENGINEERING: 'Engineering & Technology',
  'ENGINEERING/TECH/ENV': 'Engineering & Technology',
  MEDICAL: 'Medicine & Health Sciences',
  'MED/PHARM/HEALTH SCIENCES': 'Medicine & Health Sciences',
  HEALTH: 'Medicine & Health Sciences',
  LAW: 'Law',
  'LAW/LEGAL STUDIES': 'Law',
  AGRICULTURE: 'Agriculture',
  EDUCATION: 'Education',
  ADMINISTRATION: 'Administration & Management',
};

const LEVELS = ['DEGREE', 'ND', 'NCE'];

function ownershipOf(i: IbassFile['institutions'][number]): string | null {
  if (i.ownership) return i.ownership;
  const c = (i.category ?? '').toUpperCase();
  return c.startsWith('FEDERAL') ? 'Federal' : c.startsWith('STATE') ? 'State' : c.startsWith('PRIVATE') ? 'Private' : null;
}

/** A stable id for a course IBASS gives no id (course 0), from its name and level. */
function syntheticId(key: string, taken: Map<number, string>): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619) >>> 0;
  let id = 900_000_000 + (h % 90_000_000);
  while (taken.has(id) && taken.get(id) !== key) id++;
  taken.set(id, key);
  return id;
}

function majority<T>(xs: T[]): T | undefined {
  const m = new Map<T, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  let best: T | undefined;
  let n = 0;
  for (const [k, v] of m) if (v > n) [best, n] = [k, v];
  return best;
}

async function inBatches<T>(rows: T[], size: number, maxChars: number, insert: (batch: T[]) => Promise<unknown>) {
  let batch: T[] = [];
  let chars = 0;
  for (const r of rows) {
    const c = JSON.stringify(r).length;
    if (batch.length && (batch.length >= size || chars + c > maxChars)) {
      await insert(batch);
      batch = [];
      chars = 0;
    }
    batch.push(r);
    chars += c;
  }
  if (batch.length) await insert(batch);
}

export async function installJamb(prisma: PrismaClient): Promise<string> {
  const dir = jambDir();
  if (!dir) return '';
  const raw = readFileSync(join(dir, 'ibass.json.gz'));
  const facultiesRaw = existsSync(join(dir, 'faculties.json')) ? readFileSync(join(dir, 'faculties.json'), 'utf8') : '{}';
  const hash = createHash('sha256').update(raw).update(facultiesRaw).digest('hex').slice(0, 16);
  const seen = await prisma.platformSetting.findUnique({ where: { key: JAMB_SETTING } });
  if ((seen?.value as { hash?: string } | null)?.hash === hash) return '';

  const started = Date.now();
  let data: IbassFile;
  try {
    data = JSON.parse(gunzipSync(raw).toString('utf8')) as IbassFile;
  } catch (err) {
    throw new Error(`ibass.json.gz could not be read: ${(err as Error).message}`);
  }
  if (!Array.isArray(data.institutions) || !Array.isArray(data.programmes) || !Array.isArray(data.texts)) throw new Error('ibass.json.gz has no institutions, programmes or texts');
  const faculties = JSON.parse(facultiesRaw) as Record<string, string>;

  const insts = new Map(data.institutions.map((i) => [i.id, i]));
  const textOk = (i: number | null | undefined) => (typeof i === 'number' && i >= 0 && i < data.texts.length ? i : null);
  const programmes = data.programmes.filter((p) => insts.has(p.inst) && p.name?.trim());
  const levelOf = (p: IbassFile['programmes'][number]) => insts.get(p.inst)!.type;

  // Course ids: IBASS's own, else (course 0) the course other institutions file the same name under, else a stable made-up id.
  const byNameLevel = new Map<string, Map<number, number>>();
  for (const p of programmes) {
    if (!p.course) continue;
    for (const key of [`${normCourse(p.name)}|${levelOf(p)}`, normCourse(p.name)]) {
      const m = byNameLevel.get(key) ?? new Map<number, number>();
      m.set(p.course, (m.get(p.course) ?? 0) + 1);
      byNameLevel.set(key, m);
    }
  }
  const best = (m: Map<number, number> | undefined) => (m ? [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] : undefined);
  const taken = new Map<number, string>();
  const courseOf = new Map<number, number>();
  for (const p of programmes) {
    if (p.course) courseOf.set(p.id, p.course);
    else {
      const norm = normCourse(p.name);
      courseOf.set(p.id, best(byNameLevel.get(`${norm}|${levelOf(p)}`)) ?? best(byNameLevel.get(norm)) ?? syntheticId(`${norm}|${levelOf(p)}`, taken));
    }
  }

  // The courses: most common title, level, institutions, faculty.
  const groups = new Map<number, IbassFile['programmes']>();
  for (const p of programmes) {
    const id = courseOf.get(p.id)!;
    const g = groups.get(id) ?? [];
    g.push(p);
    groups.set(id, g);
  }
  const courses: Prisma.JambCourseCreateManyInput[] = [];
  const names = new Map<string, Map<number, number>>();
  for (const [id, ps] of groups) {
    const title = majority(ps.map((p) => p.name.replace(/\s+/g, ' ').trim().toUpperCase()))!;
    const level = majority(ps.map(levelOf)) ?? null;
    const institutionCount = new Set(ps.map((p) => p.inst)).size;
    const faculty =
      faculties[normCourse(title)] ??
      majority(ps.map((p) => faculties[normCourse(p.name)]).filter((f): f is string => !!f)) ??
      majority(ps.map((p) => DEPT_FACULTY[(p.dept ?? '').trim().toUpperCase()]).filter((f): f is string => !!f)) ??
      null;
    courses.push({ id, name: titleCase(title).slice(0, 200), level, faculty, institutionCount });
    for (const p of ps) {
      const key = normCourse(p.name);
      const m = names.get(key) ?? new Map<number, number>();
      m.set(id, (m.get(id) ?? 0) + 1);
      names.set(key, m);
    }
  }
  const nameIndex: Record<string, number[]> = {};
  const instCount = new Map(courses.map((c) => [c.id, c.institutionCount ?? 0]));
  for (const [key, m] of names) {
    const ranked = [...m.entries()].sort((a, b) => b[1] - a[1] || (instCount.get(b[0]) ?? 0) - (instCount.get(a[0]) ?? 0));
    // A stray programme filed under another course (IBASS has "Medicine and Surgery" once under Mathematics) mustn't link the name to it.
    const top = ranked[0]?.[1] ?? 0;
    nameIndex[key] = ranked
      .filter(([, n]) => n >= Math.max(1, top * 0.2))
      .slice(0, 4)
      .map(([id]) => id);
  }

  const perInst = new Map<number, number>();
  for (const p of programmes) perInst.set(p.inst, (perInst.get(p.inst) ?? 0) + 1);
  const s = (v: string | null | undefined, max = 500) => (v ? v.replace(/\s+/g, ' ').trim().slice(0, max) || null : null);

  await prisma.$transaction(
    async (tx) => {
      await tx.jambProgramme.deleteMany({});
      await tx.jambInstitution.deleteMany({});
      await tx.jambText.deleteMany({});
      await tx.jambCourse.deleteMany({});
      await inBatches(
        data.texts.map((text, id) => ({ id, text: text ?? '' })),
        1000,
        1_500_000,
        (batch) => tx.jambText.createMany({ data: batch }),
      );
      await inBatches(
        data.institutions.map(
          (i): Prisma.JambInstitutionCreateManyInput => ({
            id: i.id,
            name: s(i.name, 300) ?? `Institution ${i.id}`,
            abbreviation: s(i.abbr, 60),
            state: s(i.state, 60),
            address: s(i.address),
            type: LEVELS.includes(i.type) ? i.type : 'DEGREE',
            category: s(i.category, 120),
            ownership: ownershipOf(i),
            accreditation: s(i.accreditation, 60),
            modeOfStudy: s(i.mode, 60),
            specialization: s(i.specialization, 120),
            programmeCount: perInst.get(i.id) ?? 0,
          }),
        ),
        1000,
        2_000_000,
        (batch) => tx.jambInstitution.createMany({ data: batch }),
      );
      await inBatches(
        programmes.map(
          (p): Prisma.JambProgrammeCreateManyInput => ({
            id: p.id,
            institutionId: p.inst,
            courseId: courseOf.get(p.id)!,
            name: s(p.name, 300)!,
            department: s(p.dept, 120),
            utmeSubjectsTextId: textOk(p.utmeSubjects),
            olevelTextId: textOk(p.olevel),
            directEntryTextId: textOk(p.de),
            remarksTextId: textOk(p.remarks),
            duration: s(p.duration, 40),
            status: s(p.status, 40),
            accreditation: s(p.accreditation, 60),
            modeOfStudy: s(p.mode, 60),
          }),
        ),
        1000,
        2_000_000,
        (batch) => tx.jambProgramme.createMany({ data: batch }),
      );
      await inBatches(courses, 1000, 2_000_000, (batch) => tx.jambCourse.createMany({ data: batch }));
      await tx.platformSetting.upsert({
        where: { key: JAMB_NAMES_SETTING },
        update: { value: nameIndex as unknown as Prisma.InputJsonValue },
        create: { key: JAMB_NAMES_SETTING, value: nameIndex as unknown as Prisma.InputJsonValue },
      });
    },
    { timeout: 15 * 60_000, maxWait: 60_000 },
  );

  const info: JambInstallInfo = {
    hash,
    installedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    source: data.source ?? null,
    fetchedAt: data.fetchedAt ?? null,
    institutions: data.institutions.length,
    programmes: programmes.length,
    texts: data.texts.length,
    courses: courses.length,
    withFaculty: courses.filter((c) => c.faculty).length,
  };
  await prisma.platformSetting.upsert({ where: { key: JAMB_SETTING }, update: { value: info as unknown as Prisma.InputJsonValue }, create: { key: JAMB_SETTING, value: info as unknown as Prisma.InputJsonValue } });
  return `JAMB brochure: ${info.institutions} institutions, ${info.programmes} programmes, ${info.courses} courses (${info.withFaculty} with a faculty), ${info.texts} requirement texts in ${(info.durationMs / 1000).toFixed(1)}s`;
}
