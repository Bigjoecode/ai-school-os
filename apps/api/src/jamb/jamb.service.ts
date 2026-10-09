import { readFileSync } from 'node:fs';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  JAMB_LEVELS,
  JAMB_STATUSES,
  UTME_SUBJECTS,
  UTME_SYLLABUS_SUBJECT,
  type JambCheckInput,
  type JambCheckResult,
  type JambBrochureNotes,
  type JambCheckRow,
  type JambCourseDetail,
  type JambCourseInstitution,
  type JambCourseLink,
  type JambCourseRow,
  type JambFacultyRow,
  type JambFaq,
  type JambInstallStatus,
  type JambInstitutionDetail,
  type JambInstitutionRow,
  type JambLevel,
  type JambOverview,
  type JambPage,
  type JambRequirementGroup,
  type JambRuleVerdict,
  type JambStatus,
  type JambSyllabusDetail,
  type JambSyllabusSubject,
  type JambSyllabusTopic,
} from '@aischool/shared';
import type { JambCourse, JambInstitution, Prisma } from '../generated/prisma/client';
import { subjectKey } from '../learning/mastery.service';
import { JAMB_NAMES_SETTING, JAMB_SETTING, jambFile, normCourse, titleCase, type JambInstallInfo } from '../prisma/jamb-install';
import { PrismaService } from '../prisma/prisma.service';
import { canonicalSubject, describeRule, isCredit, judge, mentions, parseOlevel, parseUtme, type Verdict } from './eligibility';

const PAGE = 30;
const ENGLISH_NAMES = /^(use of english|english( language)?)$/i;

export interface InstitutionQuery {
  type?: JambLevel;
  ownership?: string;
  state?: string;
  category?: string;
  q?: string;
  page?: number;
}
export interface CourseQuery {
  faculty?: string;
  level?: JambLevel;
  q?: string;
  page?: number;
}
export interface CourseFilters {
  state?: string;
  ownership?: string;
  type?: JambLevel;
}

/** Does a remarks text name this institution (by its JAMB abbreviation, as the brochure does)? */
export function namesInstitution(text: string | undefined, abbr: string | null): boolean {
  if (!text || !abbr || abbr.length < 2) return false;
  const a = abbr.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9-])${a}(?=$|[^A-Za-z0-9-])`).test(text);
}

/** "Banking and Finance" also finds "Banking & Finance" (and the other way round). */
const nameVariants = (q: string) => [...new Set([q, q.replace(/\s+and\s+/gi, ' & '), q.replace(/\s*&\s*/g, ' and ')])];
const levelOf = (t: string): JambLevel => ((JAMB_LEVELS as readonly string[]).includes(t) ? (t as JambLevel) : 'DEGREE');
const syllabusName = (key: string) => Object.entries(UTME_SYLLABUS_SUBJECT).find(([, v]) => v === key)?.[0] ?? key;

/**
 * JAMB's brochure, read-only, for students, parents and staff: institutions,
 * courses by faculty, requirements grouped as the brochure prints them, the
 * eligibility helper, the JAMB syllabus and FAQ. Platform-wide content
 * (prisma.root); nothing here is per school.
 */
@Injectable()
export class JambService {
  private names: { at: number; map: Record<string, number[]> } | null = null;
  private faqCache: JambFaq | null = null;
  private notesCache: Map<number, JambBrochureNotes> | null = null;
  private overviewCache: { at: number; value: JambOverview } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.root;
  }

  // ---------------------------------------------------------------- shapes

  institutionRow(i: JambInstitution): JambInstitutionRow {
    return { id: i.id, name: titleCase(i.name), abbreviation: i.abbreviation, state: i.state, type: levelOf(i.type), category: i.category ? titleCase(i.category) : null, ownership: i.ownership, programmeCount: i.programmeCount };
  }

  courseRow(c: JambCourse): JambCourseRow {
    return { id: c.id, name: c.name, faculty: c.faculty, level: c.level ? levelOf(c.level) : null, institutionCount: c.institutionCount };
  }

  private async texts(ids: (number | null)[]): Promise<Record<number, string>> {
    const want = [...new Set(ids.filter((x): x is number => x !== null))];
    if (!want.length) return {};
    const rows = await this.db.jambText.findMany({ where: { id: { in: want } } });
    return Object.fromEntries(rows.map((r) => [r.id, r.text]));
  }

  // ---------------------------------------------------------------- overview

  async status(): Promise<JambInstallStatus & { info: JambInstallInfo | null }> {
    const s = await this.db.platformSetting.findUnique({ where: { key: JAMB_SETTING } });
    const v = (s?.value ?? null) as JambInstallInfo | null;
    return { info: v, installed: !!v, source: v?.source ?? null, fetchedAt: v?.fetchedAt ?? null, installedAt: v?.installedAt ?? null, durationMs: v?.durationMs ?? null };
  }

  async overview(): Promise<JambOverview> {
    // Counts change only when a new brochure installs: a few minutes' cache is plenty.
    if (this.overviewCache && Date.now() - this.overviewCache.at < 5 * 60_000) return this.overviewCache.value;
    const value = await this.computeOverview();
    if (value.installed) this.overviewCache = { at: Date.now(), value };
    return value;
  }

  private async computeOverview(): Promise<JambOverview> {
    const [status, byType, byOwnership, programmes, courses, states, categories] = await Promise.all([
      this.status(),
      this.db.jambInstitution.groupBy({ by: ['type'], _count: { _all: true } }),
      this.db.jambInstitution.groupBy({ by: ['ownership'], _count: { _all: true } }),
      this.db.jambProgramme.count(),
      this.db.jambCourse.count(),
      this.db.jambInstitution.findMany({ where: { state: { not: null } }, distinct: ['state'], select: { state: true }, orderBy: { state: 'asc' } }),
      this.db.jambInstitution.groupBy({ by: ['category', 'type'], _count: { _all: true } }),
    ]);
    const types = Object.fromEntries(JAMB_LEVELS.map((t) => [t, 0])) as Record<JambLevel, number>;
    for (const r of byType) types[levelOf(r.type)] += r._count._all;
    return {
      installed: status.installed,
      source: status.source,
      fetchedAt: status.fetchedAt,
      installedAt: status.installedAt,
      durationMs: status.durationMs,
      institutions: Object.values(types).reduce((a, b) => a + b, 0),
      byType: types,
      byOwnership: Object.fromEntries(byOwnership.map((r) => [r.ownership ?? 'Other', r._count._all])),
      programmes,
      courses,
      states: states.map((s) => s.state!).filter(Boolean),
      categories: categories
        .filter((c) => c.category)
        .map((c) => ({ category: titleCase(c.category!), type: levelOf(c.type), count: c._count._all }))
        .sort((a, b) => JAMB_LEVELS.indexOf(a.type) - JAMB_LEVELS.indexOf(b.type) || b.count - a.count),
    };
  }

  // ---------------------------------------------------------------- institutions

  async institutions(q: InstitutionQuery): Promise<JambPage<JambInstitutionRow>> {
    const search = q.q?.trim();
    const where: Prisma.JambInstitutionWhereInput = {
      ...(q.type ? { type: q.type } : {}),
      ...(q.ownership ? { ownership: q.ownership } : {}),
      ...(q.state ? { state: q.state } : {}),
      ...(q.category ? { category: { equals: q.category, mode: 'insensitive' } } : {}),
      ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { abbreviation: { contains: search, mode: 'insensitive' } }, { address: { contains: search, mode: 'insensitive' } }] } : {}),
    };
    const page = Math.max(1, q.page ?? 1);
    const [rows, total, exact] = await Promise.all([
      this.db.jambInstitution.findMany({ where, orderBy: { name: 'asc' }, skip: (page - 1) * PAGE, take: PAGE }),
      this.db.jambInstitution.count({ where }),
      // "UNILAG" should find the University of Lagos first, not every college affiliated to it.
      search && page === 1 ? this.db.jambInstitution.findMany({ where: { AND: [where, { abbreviation: { equals: search, mode: 'insensitive' } }] } }) : Promise.resolve([]),
    ]);
    const ordered = [...exact, ...rows.filter((r) => !exact.some((e) => e.id === r.id))].slice(0, PAGE);
    return { rows: ordered.map((r) => this.institutionRow(r)), total, page, pageSize: PAGE };
  }

  async institution(id: number): Promise<JambInstitutionDetail> {
    const i = await this.db.jambInstitution.findUnique({ where: { id }, include: { programmes: { orderBy: { name: 'asc' } } } });
    if (!i) throw new NotFoundException('Institution not found');
    const texts = await this.texts(i.programmes.flatMap((p) => [p.utmeSubjectsTextId, p.olevelTextId, p.directEntryTextId, p.remarksTextId]));
    return {
      ...this.institutionRow(i),
      address: i.address,
      accreditation: i.accreditation,
      modeOfStudy: i.modeOfStudy,
      specialization: i.specialization,
      brochureNotes: this.universityNotes().get(i.id) ?? null,
      programmes: i.programmes.map((p) => ({
        id: p.id,
        name: titleCase(p.name),
        courseId: p.courseId,
        department: p.department ? titleCase(p.department) : null,
        duration: p.duration,
        status: p.status,
        utme: p.utmeSubjectsTextId,
        olevel: p.olevelTextId,
        directEntry: p.directEntryTextId,
        remarks: p.remarksTextId,
        mentioned: namesInstitution(p.remarksTextId !== null ? texts[p.remarksTextId] : undefined, i.abbreviation),
      })),
      texts,
    };
  }

  // ---------------------------------------------------------------- courses

  async faculties(): Promise<JambFacultyRow[]> {
    const rows = await this.db.jambCourse.groupBy({ by: ['faculty', 'level'], _count: { _all: true } });
    return rows.map((r) => ({ faculty: r.faculty, level: levelOf(r.level ?? 'DEGREE'), courses: r._count._all })).sort((a, b) => JAMB_LEVELS.indexOf(a.level) - JAMB_LEVELS.indexOf(b.level) || b.courses - a.courses);
  }

  async courses(q: CourseQuery): Promise<JambPage<JambCourseRow>> {
    const search = q.q?.trim();
    const where: Prisma.JambCourseWhereInput = {
      ...(q.level ? { level: q.level } : {}),
      ...(q.faculty ? { faculty: q.faculty === 'none' ? null : q.faculty } : {}),
      ...(search ? { OR: nameVariants(search).map((v) => ({ name: { contains: v, mode: 'insensitive' as const } })) } : {}),
    };
    const page = Math.max(1, q.page ?? 1);
    const size = 50;
    const [rows, total] = await Promise.all([
      this.db.jambCourse.findMany({ where, orderBy: search ? [{ institutionCount: 'desc' }, { name: 'asc' }] : [{ name: 'asc' }], skip: (page - 1) * size, take: size }),
      this.db.jambCourse.count({ where }),
    ]);
    return { rows: rows.map((r) => this.courseRow(r)), total, page, pageSize: size };
  }

  async course(id: number, f: CourseFilters): Promise<JambCourseDetail> {
    const c = await this.db.jambCourse.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Course not found');
    const programmes = await this.db.jambProgramme.findMany({
      where: { courseId: id },
      select: {
        id: true,
        name: true,
        duration: true,
        status: true,
        utmeSubjectsTextId: true,
        olevelTextId: true,
        directEntryTextId: true,
        remarksTextId: true,
        institution: { select: { id: true, name: true, abbreviation: true, state: true, ownership: true, type: true } },
      },
    });
    const states = [...new Set(programmes.map((p) => p.institution.state).filter((s): s is string => !!s))].sort();
    const shown = programmes.filter((p) => (!f.state || p.institution.state === f.state) && (!f.ownership || p.institution.ownership === f.ownership) && (!f.type || p.institution.type === f.type));
    const texts = await this.texts(shown.flatMap((p) => [p.utmeSubjectsTextId, p.olevelTextId, p.directEntryTextId, p.remarksTextId]));
    const groups = new Map<string, JambRequirementGroup>();
    const remarks = new Map<number, number>();
    const notes = this.universityNotes();
    for (const p of shown) {
      const key = `${p.utmeSubjectsTextId}|${p.olevelTextId}|${p.directEntryTextId}`;
      const g = groups.get(key) ?? { utme: p.utmeSubjectsTextId, olevel: p.olevelTextId, directEntry: p.directEntryTextId, institutions: [] };
      const row: JambCourseInstitution = {
        id: p.institution.id,
        name: titleCase(p.institution.name),
        abbreviation: p.institution.abbreviation,
        state: p.institution.state,
        ownership: p.institution.ownership,
        type: levelOf(p.institution.type),
        programmeId: p.id,
        programmeName: titleCase(p.name),
        duration: p.duration,
        status: p.status,
        remarks: p.remarksTextId,
        mentioned: namesInstitution(p.remarksTextId !== null ? texts[p.remarksTextId] : undefined, p.institution.abbreviation),
        brochureNotes: notes.has(p.institution.id),
      };
      g.institutions.push(row);
      groups.set(key, g);
      if (p.remarksTextId !== null) remarks.set(p.remarksTextId, (remarks.get(p.remarksTextId) ?? 0) + 1);
    }
    for (const g of groups.values()) g.institutions.sort((a, b) => a.name.localeCompare(b.name));
    return {
      course: this.courseRow(c),
      total: programmes.length,
      shown: shown.length,
      // Sets with JAMB's wording first (some institutions' entries carry no texts), then the most common.
      groups: [...groups.values()].sort((a, b) => Number(a.utme === null && a.olevel === null) - Number(b.utme === null && b.olevel === null) || b.institutions.length - a.institutions.length),
      remarks: [...remarks.entries()].map(([text, institutions]) => ({ text, institutions })).sort((a, b) => b.institutions - a.institutions),
      texts,
      states,
      careers: await this.careersFor(id),
    };
  }

  // ---------------------------------------------------------------- careers ↔ JAMB courses

  private async nameIndex(): Promise<Record<string, number[]>> {
    if (this.names && Date.now() - this.names.at < 5 * 60_000) return this.names.map;
    const s = await this.db.platformSetting.findUnique({ where: { key: JAMB_NAMES_SETTING } });
    const map = (s?.value ?? {}) as Record<string, number[]>;
    this.names = { at: Date.now(), map };
    return map;
  }

  /** JAMB course ids for a course name (as careers and our course list write them). */
  async idsFor(name: string): Promise<number[]> {
    const map = await this.nameIndex();
    const variants = [name, name.replace(/\s*\(.*?\)\s*/g, ' '), name.replace(/\bstudies\b/i, '').trim(), name.replace(/^(b\.?\s?sc|b\.?\s?a|b\.?\s?eng|b\.?\s?tech)\.?\s+(in\s+)?/i, '')];
    for (const v of variants) {
      const ids = map[normCourse(v)];
      if (ids?.length) return ids;
    }
    return [];
  }

  /** Each name with the JAMB courses it matches (names without a match are left out). */
  async links(names: string[]): Promise<JambCourseLink[]> {
    const found = await Promise.all(names.map(async (name) => ({ name, ids: await this.idsFor(name) })));
    const all = [...new Set(found.flatMap((f) => f.ids))];
    if (!all.length) return [];
    const rows = new Map((await this.db.jambCourse.findMany({ where: { id: { in: all } } })).map((r) => [r.id, r]));
    return found
      .map((f) => ({ name: f.name, courses: f.ids.map((id) => rows.get(id)).filter((r): r is JambCourse => !!r).map((r) => this.courseRow(r)) }))
      .filter((l) => l.courses.length);
  }

  /** The best JAMB course for a name (most institutions), or null. */
  async courseFor(name: string): Promise<JambCourseRow | null> {
    const ids = await this.idsFor(name);
    if (ids.length) {
      const rows = await this.db.jambCourse.findMany({ where: { id: { in: ids } } });
      const best = rows.sort((a, b) => b.institutionCount - a.institutionCount)[0];
      if (best) return this.courseRow(best);
    }
    const exact = await this.db.jambCourse.findFirst({ where: { name: { equals: name, mode: 'insensitive' } }, orderBy: { institutionCount: 'desc' } });
    return exact ? this.courseRow(exact) : null;
  }

  async searchCourses(search: string | undefined, take: number): Promise<JambCourseRow[]> {
    const rows = await this.db.jambCourse.findMany({
      where: search ? { OR: nameVariants(search).map((v) => ({ name: { contains: v, mode: 'insensitive' as const } })) } : {},
      orderBy: [{ institutionCount: 'desc' }, { name: 'asc' }],
      take,
    });
    return rows.map((r) => this.courseRow(r));
  }

  private async careersFor(courseId: number): Promise<{ slug: string; name: string }[]> {
    const careers = await this.db.career.findMany({ where: { published: true }, select: { slug: true, name: true, courses: true }, orderBy: { name: 'asc' } });
    const out: { slug: string; name: string }[] = [];
    for (const c of careers) {
      for (const n of c.courses) {
        if ((await this.idsFor(n)).includes(courseId)) {
          out.push({ slug: c.slug, name: c.name });
          break;
        }
      }
    }
    return out.slice(0, 12);
  }

  // ---------------------------------------------------------------- syllabus & FAQ

  async syllabus(): Promise<JambSyllabusSubject[]> {
    const [settings, counts] = await Promise.all([
      this.db.platformSetting.findMany({ where: { key: { startsWith: 'syllabus-file:jamb/' } } }),
      this.db.syllabusTopic.groupBy({ by: ['subject'], where: { exams: { has: 'JAMB' }, parentId: null }, _count: { _all: true } }),
    ]);
    const topics = new Map(counts.map((c) => [c.subject, c._count._all]));
    const out = new Map<string, JambSyllabusSubject>();
    for (const s of settings) {
      const v = s.value as { subject?: string; recommendedTexts?: string[] } | null;
      if (!v?.subject) continue;
      const key = subjectKey(v.subject);
      out.set(key, { subject: key === 'English Language' ? 'Use of English' : syllabusName(key), key, topics: topics.get(key) ?? 0, recommendedTexts: v.recommendedTexts?.length ?? 0 });
    }
    for (const [key, n] of topics) if (!out.has(key)) out.set(key, { subject: key === 'English Language' ? 'Use of English' : syllabusName(key), key, topics: n, recommendedTexts: 0 });
    return [...out.values()].sort((a, b) => (a.key === 'English Language' ? -1 : b.key === 'English Language' ? 1 : a.subject.localeCompare(b.subject)));
  }

  async syllabusSubject(key: string): Promise<JambSyllabusDetail> {
    const subject = subjectKey(UTME_SYLLABUS_SUBJECT[key] ?? key);
    const [settings, topics] = await Promise.all([
      this.db.platformSetting.findMany({ where: { key: { startsWith: 'syllabus-file:jamb/' } } }),
      this.db.syllabusTopic.findMany({ where: { subject, exams: { has: 'JAMB' } }, orderBy: [{ order: 'asc' }, { name: 'asc' }], select: { id: true, name: true, parentId: true, objectives: true, content: true } }),
    ]);
    const meta = settings.map((s) => s.value as { subject?: string; recommendedTexts?: string[]; examFormat?: string | null; excluded?: string | null } | null).find((v) => v?.subject && subjectKey(v.subject) === subject);
    if (!topics.length && !meta) throw new NotFoundException('No JAMB syllabus for that subject');
    const top: JambSyllabusTopic[] = [];
    const byId = new Map<string, JambSyllabusTopic>();
    for (const t of topics.filter((x) => !x.parentId || !topics.some((p) => p.id === x.parentId))) {
      const node = { id: t.id, name: t.name, objectives: t.objectives, content: t.content, subtopics: [] };
      top.push(node);
      byId.set(t.id, node);
    }
    for (const t of topics) if (t.parentId && byId.has(t.parentId)) byId.get(t.parentId)!.subtopics.push({ id: t.id, name: t.name, objectives: t.objectives });
    return { subject: subject === 'English Language' ? 'Use of English' : syllabusName(subject), key: subject, examFormat: meta?.examFormat ?? null, excluded: meta?.excluded ?? null, recommendedTexts: meta?.recommendedTexts ?? [], topics: top };
  }

  faq(): JambFaq {
    if (this.faqCache) return this.faqCache;
    const path = jambFile('faq.json');
    if (!path) return { source: 'JAMB', faq: [] };
    this.faqCache = JSON.parse(readFileSync(path, 'utf8')) as JambFaq;
    return this.faqCache;
  }

  /**
   * Each university's own entry rules from the printed brochure (section 2.2.xx), by IBASS
   * institution id: prisma/jamb/university-notes.json, read once. The brochure copy is undated
   * and older than IBASS, so it is shown beside IBASS's requirements, never instead of them.
   */
  universityNotes(): Map<number, JambBrochureNotes> {
    if (this.notesCache) return this.notesCache;
    const map = new Map<number, JambBrochureNotes>();
    const path = jambFile('university-notes.json');
    if (path) {
      try {
        const file = JSON.parse(readFileSync(path, 'utf8')) as { source?: string; universities?: (Omit<JambBrochureNotes, 'source'> & { institutionId: number | null })[] };
        for (const u of file.universities ?? []) {
          if (typeof u.institutionId !== 'number' || !u.sections?.length) continue;
          map.set(u.institutionId, { no: u.no, brochureName: titleCase(u.brochureName), source: file.source ?? 'JAMB brochure', sections: u.sections });
        }
      } catch {
        // A broken file shows no notes rather than breaking the institution pages.
      }
    }
    this.notesCache = map;
    return map;
  }

  // ---------------------------------------------------------------- eligibility helper

  async check(input: JambCheckInput): Promise<JambCheckResult> {
    const known = new Set<string>(UTME_SUBJECTS);
    const subjects: string[] = [];
    for (const s of input.utmeSubjects) {
      if (ENGLISH_NAMES.test(s.trim())) continue;
      const c = canonicalSubject(s);
      if (!c || !known.has(c)) throw new BadRequestException(`“${s}” isn’t a UTME subject we know`);
      if (!subjects.includes(c)) subjects.push(c);
    }
    if (subjects.length !== 3) throw new BadRequestException('Choose three different UTME subjects besides Use of English');
    const olevelGiven = !!input.olevel?.length;
    const credits = [...new Set((input.olevel ?? []).filter((o) => isCredit(o.grade)).map((o) => canonicalSubject(o.subject)).filter((s): s is string => !!s && !s.startsWith('~')))].map((s) => (s === '__ENGLISH__' ? 'English Language' : s));

    let course: JambCourseRow | null = null;
    let institution: JambInstitutionRow | null = null;
    const where: Prisma.JambProgrammeWhereInput = {};
    if (input.courseId !== undefined) {
      const c = await this.db.jambCourse.findUnique({ where: { id: input.courseId } });
      if (!c) throw new NotFoundException('Course not found');
      course = this.courseRow(c);
      where.courseId = c.id;
    }
    if (input.institutionId !== undefined) {
      const i = await this.db.jambInstitution.findUnique({ where: { id: input.institutionId } });
      if (!i) throw new NotFoundException('Institution not found');
      institution = this.institutionRow(i);
      where.institutionId = i.id;
    }
    where.institution = { ...(input.state ? { state: input.state } : {}), ...(input.ownership ? { ownership: input.ownership } : {}), ...(input.type ? { type: input.type } : {}) };
    const programmes = await this.db.jambProgramme.findMany({
      where,
      take: 1500,
      select: { id: true, name: true, courseId: true, utmeSubjectsTextId: true, olevelTextId: true, remarksTextId: true, institution: { select: { id: true, name: true, abbreviation: true, state: true, ownership: true, type: true } } },
    });
    const texts = await this.texts(programmes.flatMap((p) => [p.utmeSubjectsTextId, olevelGiven ? p.olevelTextId : null, p.remarksTextId]));
    const verdicts: Record<string, JambRuleVerdict> = {};
    const verdict = (kind: 'u' | 'o', id: number | null): Verdict | null => {
      if (id === null) return null;
      const key = `${kind}${id}`;
      if (!verdicts[key]) {
        const text = texts[id] ?? '';
        const rule = kind === 'u' ? parseUtme(text) : parseOlevel(text);
        const have = kind === 'u' ? subjects : credits;
        const v = judge(rule, have, kind === 'u' ? 'UTME' : 'OLEVEL');
        verdicts[key] = { status: v.status, notes: v.notes, reading: describeRule(rule), have: mentions(text, have), missing: v.missing };
      }
      return verdicts[key]!;
    };
    const rank: Record<JambStatus, number> = { MATCH: 0, CHECK: 1, MISMATCH: 2 };
    const rows: JambCheckRow[] = programmes.map((p) => {
      const u = verdict('u', p.utmeSubjectsTextId);
      const o = olevelGiven ? verdict('o', p.olevelTextId) : null;
      const mentioned = namesInstitution(p.remarksTextId !== null ? texts[p.remarksTextId] : undefined, p.institution.abbreviation);
      let status: JambStatus = u?.status ?? 'CHECK';
      if (o?.status === 'MISMATCH' || status === 'MISMATCH') status = 'MISMATCH';
      else if (status === 'MATCH' && ((olevelGiven && o?.status !== 'MATCH') || mentioned)) status = 'CHECK';
      return {
        institutionId: p.institution.id,
        institutionName: titleCase(p.institution.name),
        abbreviation: p.institution.abbreviation,
        state: p.institution.state,
        ownership: p.institution.ownership,
        type: levelOf(p.institution.type),
        programmeId: p.id,
        programmeName: titleCase(p.name),
        courseId: p.courseId,
        utme: p.utmeSubjectsTextId,
        olevel: olevelGiven ? p.olevelTextId : null,
        remarks: p.remarksTextId,
        mentioned,
        status,
      };
    });
    rows.sort((a, b) => rank[a.status] - rank[b.status] || a.institutionName.localeCompare(b.institutionName) || a.programmeName.localeCompare(b.programmeName));
    const summary = Object.fromEntries(JAMB_STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length])) as Record<JambStatus, number>;
    return { subjects, olevelGiven, course, institution, summary, verdicts, texts, rows };
  }

  // ---------------------------------------------------------------- console

  async consoleStatus() {
    const [status, institutions, programmes, courses, texts, withFaculty, careers] = await Promise.all([
      this.status(),
      this.db.jambInstitution.count(),
      this.db.jambProgramme.count(),
      this.db.jambCourse.count(),
      this.db.jambText.count(),
      this.db.jambCourse.count({ where: { faculty: { not: null } } }),
      this.db.career.findMany({ select: { courses: true } }),
    ]);
    const names = [...new Set(careers.flatMap((c) => c.courses))];
    const linked = (await Promise.all(names.map((n) => this.idsFor(n)))).filter((ids) => ids.length).length;
    return { ...status, counts: { institutions, programmes, courses, texts, withFaculty }, careerCourses: { total: names.length, linked } };
  }
}
