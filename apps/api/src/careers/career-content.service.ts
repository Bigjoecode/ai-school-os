import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  parseOlevelText,
  parseUtmeText,
  type CareerFull,
  type CourseData,
  type CourseImportPreview,
  type CourseImportRow,
  type CourseRow,
  type CourseSource,
  type OlevelRequirements,
  type UtmeRule,
  careerSchema,
} from '@aischool/shared';
import { z } from 'zod';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { AuditService } from '../audit/audit.service';
import { Prisma, type UniversityCourse } from '../generated/prisma/client';
import { extractText, pdfPageCount, pdfText } from '../knowledge/extract';
import { PrismaService } from '../prisma/prisma.service';
import { CareersService } from './careers.service';

type CareerData = ReturnType<typeof careerSchema.parse>;

/** Brochure pages read per upload; a longer brochure is read in page ranges. */
const BROCHURE_PAGES = 150;

const aiBrochureSchema = z.object({
  courses: z.array(
    z.object({
      course: z.string().describe('The course (programme) name exactly as printed, e.g. "Medicine and Surgery"'),
      faculty: z.string().describe('The faculty heading the course is listed under; empty if not shown'),
      utmeSubjects: z.array(z.string()).describe('The UTME subjects as printed, one entry per subject slot (Use of English first). Alternatives in one entry joined with " or ".'),
      olevel: z.string().describe("The O'level (UTME requirements) column condensed, e.g. \"5 credits: English Language, Mathematics, Biology; any 2 of Chemistry/Physics\""),
      notes: z.string().describe('Direct entry and special remarks, including institution-specific exceptions, condensed; empty if none'),
    }),
  ),
});

/**
 * The console's careers content: the career library, the course list and
 * its admission requirements (typed in, imported from CSV, or extracted
 * from the JAMB brochure by AI for a person to verify). Nothing from AI is
 * ever saved as verified.
 */
@Injectable()
export class CareerContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: AiGatewayService,
    private readonly audit: AuditService,
    private readonly careers: CareersService,
  ) {}

  // ---------------------------------------------------------- careers

  async listCareers(): Promise<CareerFull[]> {
    const rows = await this.prisma.root.career.findMany({ orderBy: [{ field: 'asc' }, { name: 'asc' }] });
    return rows.map((r) => this.careers.full(r));
  }

  async createCareer(input: CareerData, userId: string): Promise<CareerFull> {
    if (await this.prisma.root.career.findUnique({ where: { slug: input.slug } })) throw new ConflictException('A career with this slug already exists');
    const c = await this.prisma.root.career.create({ data: input });
    await this.ensureCourses(input.courses);
    await this.audit.log({ action: 'career.created', entityType: 'Career', entityId: c.id, tenantId: null, actorUserId: userId, summary: `Added the career ${c.name}` });
    return this.careers.full(c);
  }

  async updateCareer(id: string, input: CareerData, userId: string): Promise<CareerFull> {
    const existing = await this.prisma.root.career.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Career not found');
    if (input.slug !== existing.slug && (await this.prisma.root.career.findUnique({ where: { slug: input.slug } }))) throw new ConflictException('A career with this slug already exists');
    const c = await this.prisma.root.career.update({ where: { id }, data: input });
    await this.ensureCourses(input.courses);
    // Students' saved lists follow a renamed slug.
    if (input.slug !== existing.slug) {
      await this.prisma.root.$executeRaw`UPDATE career_profiles SET "savedCareers" = array_replace("savedCareers", ${existing.slug}, ${input.slug}) WHERE ${existing.slug} = ANY("savedCareers")`;
    }
    await this.audit.log({ action: 'career.updated', entityType: 'Career', entityId: c.id, tenantId: null, actorUserId: userId, summary: `Edited the career ${c.name}` });
    return this.careers.full(c);
  }

  async deleteCareer(id: string, userId: string) {
    const c = await this.prisma.root.career.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Career not found');
    await this.prisma.root.career.delete({ where: { id } });
    await this.prisma.root.$executeRaw`UPDATE career_profiles SET "savedCareers" = array_remove("savedCareers", ${c.slug}) WHERE ${c.slug} = ANY("savedCareers")`;
    await this.audit.log({ action: 'career.deleted', entityType: 'Career', entityId: id, tenantId: null, actorUserId: userId, summary: `Deleted the career ${c.name}` });
  }

  /** Course names a career mentions join the course list (without requirements). */
  private async ensureCourses(names: string[]) {
    if (!names.length) return;
    const have = await this.prisma.root.universityCourse.findMany({ where: { OR: names.map((n) => ({ name: { equals: n, mode: 'insensitive' as const } })) }, select: { name: true } });
    const known = new Set(have.map((h) => h.name.toLowerCase()));
    const missing = names.filter((n) => !known.has(n.toLowerCase()));
    if (missing.length) await this.prisma.root.universityCourse.createMany({ data: missing.map((name) => ({ name })), skipDuplicates: true });
  }

  // ---------------------------------------------------------- courses

  async listCourses(): Promise<CourseRow[]> {
    const [rows, careers] = await Promise.all([this.prisma.root.universityCourse.findMany({ orderBy: [{ verified: 'asc' }, { name: 'asc' }] }), this.prisma.root.career.findMany({ select: { courses: true } })]);
    const count = new Map<string, number>();
    for (const c of careers) for (const n of new Set(c.courses.map((x) => x.toLowerCase()))) count.set(n, (count.get(n) ?? 0) + 1);
    return rows.map((r) => courseRow(r, count.get(r.name.toLowerCase()) ?? 0));
  }

  private async byName(name: string) {
    return this.prisma.root.universityCourse.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
  }

  async createCourse(input: CourseData, userId: string): Promise<CourseRow> {
    if (await this.byName(input.name)) throw new ConflictException('A course with this name already exists');
    const c = await this.prisma.root.universityCourse.create({ data: courseData(input) as Prisma.UniversityCourseCreateInput });
    await this.audit.log({ action: 'course.created', entityType: 'UniversityCourse', entityId: c.id, tenantId: null, actorUserId: userId, summary: `Added the course ${c.name}${c.verified ? ' (verified)' : ''}` });
    return courseRow(c, 0);
  }

  async updateCourse(id: string, input: CourseData, userId: string): Promise<CourseRow> {
    const existing = await this.prisma.root.universityCourse.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Course not found');
    const clash = await this.byName(input.name);
    if (clash && clash.id !== id) throw new ConflictException('A course with this name already exists');
    const c = await this.prisma.root.universityCourse.update({ where: { id }, data: courseData(input) });
    if (c.name !== existing.name) {
      // Keep careers and students' target courses pointing at the course.
      await this.prisma.root.$executeRaw`UPDATE careers SET courses = array_replace(courses, ${existing.name}, ${c.name}) WHERE ${existing.name} = ANY(courses)`;
      await this.prisma.root.careerProfile.updateMany({ where: { targetCourse: existing.name }, data: { targetCourse: c.name } });
    }
    const verb = c.verified && !existing.verified ? 'Verified' : 'Edited';
    await this.audit.log({ action: c.verified && !existing.verified ? 'course.verified' : 'course.updated', entityType: 'UniversityCourse', entityId: c.id, tenantId: null, actorUserId: userId, summary: `${verb} the course ${c.name}` });
    return courseRow(c, 0);
  }

  async deleteCourse(id: string, userId: string) {
    const c = await this.prisma.root.universityCourse.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Course not found');
    await this.prisma.root.universityCourse.delete({ where: { id } });
    await this.audit.log({ action: 'course.deleted', entityType: 'UniversityCourse', entityId: id, tenantId: null, actorUserId: userId, summary: `Deleted the course ${c.name}` });
  }

  // ---------------------------------------------------------- CSV import

  /**
   * Columns (header row, any order, case-insensitive): course, faculty,
   * utme subjects, olevel requirements, notes.
   */
  async csvPreview(csv: string): Promise<CourseImportPreview> {
    const table = parseCsv(csv);
    if (table.length < 2) throw new BadRequestException('The CSV needs a header row and at least one course');
    const header = table[0]!.map((h) => h.trim().toLowerCase().replace(/[^a-z]/g, ''));
    const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
    const ci = { course: col('course', 'coursename', 'programme', 'program', 'name'), faculty: col('faculty'), utme: col('utmesubjects', 'utme', 'utmesubjectcombination', 'subjects'), olevel: col('olevelrequirements', 'olevel', 'olevelcredits', 'utmerequirements'), notes: col('notes', 'remarks', 'specialremarks', 'directentry') };
    if (ci.course < 0) throw new BadRequestException('Add a "course" column (the header row names the columns: course, faculty, utme subjects, olevel requirements, notes)');
    const rows: CourseImportRow[] = [];
    for (const [i, cells] of table.slice(1).entries()) {
      const get = (n: number) => (n >= 0 ? (cells[n] ?? '').trim() : '');
      if (cells.every((c) => !c.trim())) continue;
      rows.push(this.importRow(i + 2, get(ci.course), get(ci.faculty), get(ci.utme), get(ci.olevel), get(ci.notes)));
    }
    return { rows: await this.markExisting(rows) };
  }

  private importRow(line: number | null, name: string, faculty: string, utme: string | string[], olevel: string, notes: string): CourseImportRow {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (name.length < 2) errors.push('Course name is missing');
    const u = Array.isArray(utme) ? parseUtmeText(utme.join('; ')) : parseUtmeText(utme);
    errors.push(...u.errors);
    if ((Array.isArray(utme) ? utme.join('') : utme).trim() && u.rules.length < 3) warnings.push(`Only ${u.rules.length} UTME subject(s) besides Use of English; JAMB courses usually list 3.`);
    if (!(Array.isArray(utme) ? utme.join('') : utme).trim()) warnings.push('No UTME subjects given.');
    const o = parseOlevelText(olevel);
    errors.push(...o.errors);
    if (!olevel.trim()) warnings.push("No O'level requirements given.");
    return { line, name: name.slice(0, 160), faculty: faculty.slice(0, 120) || null, utmeSubjects: u.rules, olevelRequirements: o.value, notes: notes.slice(0, 2000) || null, errors, warnings, existing: 'NONE' };
  }

  private async markExisting(rows: CourseImportRow[]) {
    const names = rows.map((r) => r.name).filter((n) => n.length >= 2);
    const have = names.length ? await this.prisma.root.universityCourse.findMany({ where: { OR: names.map((n) => ({ name: { equals: n, mode: 'insensitive' as const } })) }, select: { name: true, verified: true } }) : [];
    const by = new Map(have.map((h) => [h.name.toLowerCase(), h.verified]));
    const seen = new Set<string>();
    for (const r of rows) {
      const v = by.get(r.name.toLowerCase());
      r.existing = v === undefined ? 'NONE' : v ? 'VERIFIED' : 'UNVERIFIED';
      if (seen.has(r.name.toLowerCase())) r.warnings.push('This course appears more than once; the last row wins.');
      seen.add(r.name.toLowerCase());
    }
    return rows;
  }

  /** Saves reviewed rows: new courses are added, existing ones get the new requirements. */
  async importSave(input: { rows: { name: string; faculty: string | null; utmeSubjects: UtmeRule[]; olevelRequirements: OlevelRequirements | null; notes: string | null }[]; source: CourseSource; sourceEdition: string | null; verified: boolean; skipVerified: boolean }, userId: string, fromAi: boolean) {
    const verified = fromAi ? false : input.verified;
    let created = 0;
    let updated = 0;
    let skipped = 0;
    for (const r of input.rows) {
      const existing = await this.byName(r.name);
      const data = { faculty: r.faculty, utmeSubjects: r.utmeSubjects as unknown as Prisma.InputJsonValue, olevelRequirements: r.olevelRequirements ? (r.olevelRequirements as unknown as Prisma.InputJsonValue) : Prisma.DbNull, notes: r.notes, source: input.source, sourceEdition: input.sourceEdition, verified };
      if (!existing) {
        await this.prisma.root.universityCourse.create({ data: { name: r.name, ...data } });
        created++;
      } else if (existing.verified && (input.skipVerified || fromAi)) {
        skipped++;
      } else {
        await this.prisma.root.universityCourse.update({ where: { id: existing.id }, data });
        updated++;
      }
    }
    await this.audit.log({
      action: 'course.imported',
      entityType: 'UniversityCourse',
      entityId: input.source,
      tenantId: null,
      actorUserId: userId,
      summary: `Imported course requirements (${fromAi ? 'AI extraction from the JAMB brochure, unverified' : verified ? 'CSV, marked verified' : 'CSV, unverified'}${input.sourceEdition ? `, ${input.sourceEdition}` : ''}): ${created} added, ${updated} updated, ${skipped} verified courses left alone`,
    });
    return { created, updated, skipped };
  }

  // ---------------------------------------------------------- JAMB brochure (AI-assisted)

  /** Text from a page range of the brochure PDF (nothing is stored). */
  async brochureExtract(file: { buffer: Buffer; originalname: string; mimetype: string } | undefined, range: { from?: number; to?: number }) {
    if (!file) throw new BadRequestException('Choose the brochure PDF');
    const isPdf = /\.pdf$/i.test(file.originalname) || file.mimetype === 'application/pdf';
    let text: string;
    let pages: number | null = null;
    try {
      if (isPdf) {
        pages = await pdfPageCount(file.buffer);
        const from = Math.max(1, range.from ?? 1);
        const to = Math.min(pages, range.to ?? from + BROCHURE_PAGES - 1, from + BROCHURE_PAGES - 1);
        text = await pdfText(file.buffer, { from, to });
        range = { from, to };
      } else {
        text = await extractText(file.buffer, /\.docx$/i.test(file.originalname) ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : file.mimetype);
      }
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    text = text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    if (text.length < 200) throw new BadRequestException('Almost no text could be read from these pages; this looks like a scan. Use a text PDF of the brochure, or type the rows into the CSV template.');
    return { text, chars: text.length, filename: file.originalname, pages, from: isPdf ? range.from! : null, to: isPdf ? range.to! : null };
  }

  /** AI reads one part of the brochure text into course rows, for a person to check. */
  async brochurePreview(input: { text: string; edition: string | null }): Promise<CourseImportPreview> {
    const r = await this.gateway.generateJson(
      {
        tier: 'advanced',
        system: [
          'You read pages of the JAMB UTME brochure (Nigeria) and copy each course\'s admission requirements into rows for an admin to check.',
          'Copy only what the text says, close to its wording. Never add subjects, credits or cut-off marks the text does not contain; if a field is not in the text, leave it empty.',
          'utmeSubjects: one entry per subject slot as printed (Use of English, then the others); alternatives in a slot joined with " or ".',
          'olevel: the O\'level/UTME requirements condensed as "5 credits: English Language, Mathematics, Biology; any 2 of Chemistry/Physics/Agricultural Science".',
          'Requirements that only apply to particular institutions go in notes with the institution names. Skip institution lists, adverts and pages without course requirements.',
        ].join('\n'),
        messages: [{ role: 'user', content: input.text }],
        maxOutputTokens: 12_000,
      },
      aiBrochureSchema,
      'careers-brochure-import',
    );
    const rows = r.data.courses
      .filter((c) => c.course.trim().length >= 2)
      .map((c) => {
        const row = this.importRow(null, c.course.trim(), c.faculty.trim(), c.utmeSubjects, c.olevel, c.notes.trim());
        row.warnings.unshift('Read by AI — check every subject against the brochure before marking it verified.');
        return row;
      });
    return { rows: await this.markExisting(rows), provider: r.provider, model: r.model };
  }
}

// ---------------------------------------------------------- helpers

function courseData(input: CourseData) {
  return {
    name: input.name,
    faculty: input.faculty,
    utmeSubjects: input.utmeSubjects as unknown as Prisma.InputJsonValue,
    olevelRequirements: input.olevelRequirements ? (input.olevelRequirements as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
    notes: input.notes,
    source: input.source,
    sourceEdition: input.sourceEdition,
    verified: input.verified,
    published: input.published,
  };
}

function courseRow(r: UniversityCourse, careers: number): CourseRow {
  return {
    id: r.id,
    name: r.name,
    faculty: r.faculty,
    utmeSubjects: (r.utmeSubjects as unknown as UtmeRule[]) ?? [],
    olevelRequirements: (r.olevelRequirements as unknown as OlevelRequirements | null) ?? null,
    notes: r.notes,
    source: r.source as CourseSource,
    sourceEdition: r.sourceEdition,
    verified: r.verified,
    published: r.published,
    careers,
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** RFC 4180-ish CSV: quoted fields, doubled quotes, commas/newlines inside quotes; also semicolon- or tab-separated files. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const sep = firstLine.includes('\t') && !firstLine.includes(',') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === sep) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
