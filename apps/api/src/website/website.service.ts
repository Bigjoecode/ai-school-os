import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  DEFAULT_WEBSITE_SETTINGS,
  gradeFor,
  type PostCategory,
  type PublicEvent,
  type PublicPost,
  type PublicResult,
  type PublicSite,
  type WebsiteSettings,
} from '@aischool/shared';
import type { Prisma } from '../generated/prisma/client';
import { ResultsService } from '../assessment/results.service';
import { dateOnly, fullName, parseDate } from '../common/format';
import { RequestContextStore, currentTenantId } from '../common/request-context';
import { schoolNow } from '../common/school-time';
import { FeatureService } from '../features/features.service';
import { PrismaService } from '../prisma/prisma.service';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const resultCode = () => [...randomBytes(8)].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');

/** A URL-friendly slug from a title: "Inter-house sports 2026!" → "inter-house-sports-2026". */
export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80) || 'post'
  );
}

export function postView(p: Prisma.WebsitePostGetPayload<object>, withBody = false): PublicPost {
  return {
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    category: p.category as PostCategory,
    coverUrl: p.coverUrl,
    publishedAt: (p.publishedAt ?? p.createdAt).toISOString(),
    ...(withBody ? { body: p.body } : {}),
  };
}

export function eventView(e: Prisma.SchoolEventGetPayload<object>): PublicEvent {
  return {
    title: e.title,
    description: e.description,
    category: e.category,
    startDate: dateOnly(e.startDate)!,
    endDate: dateOnly(e.endDate),
    time: e.allDay ? null : [e.startTime, e.endTime].filter(Boolean).join('–') || null,
    location: e.location,
  };
}

@Injectable()
export class WebsiteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly results: ResultsService,
    private readonly features: FeatureService,
  ) {}

  settingsOf(raw: Prisma.JsonValue | null): WebsiteSettings {
    const saved = (raw as Partial<WebsiteSettings> | null) ?? {};
    const d = DEFAULT_WEBSITE_SETTINGS;
    return {
      ...d,
      ...saved,
      theme: { ...d.theme, ...(saved.theme ?? {}) },
      hero: { ...d.hero, ...(saved.hero ?? {}) },
      about: { ...d.about, ...(saved.about ?? {}) },
      academics: { ...d.academics, ...(saved.academics ?? {}) },
      admissions: { ...d.admissions, ...(saved.admissions ?? {}) },
      contact: { ...d.contact, ...(saved.contact ?? {}) },
      social: { ...d.social, ...(saved.social ?? {}) },
      sections: { ...d.sections, ...(saved.sections ?? {}) },
      seo: { ...d.seo, ...(saved.seo ?? {}) },
    };
  }

  /**
   * The school behind a public site address. Sets the request's school so
   * scoped queries (and AI metering) work for visitors without accounts.
   * Unpublished sites are only visible with a preview token.
   */
  async siteTenant(slug: string, previewTenantId?: string | null) {
    const t = await this.prisma.root.tenant.findUnique({
      where: { slug },
      select: { id: true, slug: true, name: true, shortName: true, motto: true, logoUrl: true, primaryColor: true, timezone: true, currency: true, status: true, websiteSettings: true },
    });
    if (!t || t.status === 'SUSPENDED' || t.status === 'ARCHIVED') throw new NotFoundException('This school website does not exist');
    const settings = this.settingsOf(t.websiteSettings);
    if (!(await this.features.isEnabled(t.id, 'website'))) throw new NotFoundException('This school website does not exist');
    if (!settings.published && previewTenantId !== t.id) throw new NotFoundException('This school website is not published yet');
    const ctx = RequestContextStore.get();
    if (ctx) ctx.tenantId = t.id;
    return { ...t, settings, today: schoolNow(t.timezone).date };
  }

  async publicSite(slug: string, previewTenantId?: string | null): Promise<PublicSite> {
    const t = await this.siteTenant(slug, previewTenantId);
    const db = this.prisma.db;
    const [levels, subjects, students, teachers, arms, news, events, term] = await Promise.all([
      db.classLevel.findMany({ orderBy: { order: 'asc' }, select: { name: true, stage: true } }),
      db.subject.findMany({ orderBy: { name: 'asc' }, select: { name: true } }),
      db.student.count({ where: { status: 'ACTIVE' } }),
      db.staff.count({ where: { status: { not: 'EXITED' }, type: 'TEACHING' } }),
      db.classArm.count(),
      t.settings.sections.news ? db.websitePost.findMany({ where: { status: 'PUBLISHED' }, orderBy: { publishedAt: 'desc' }, take: 3 }) : [],
      t.settings.sections.events ? db.schoolEvent.findMany({ where: { showOnWebsite: true, OR: [{ startDate: { gte: parseDate(t.today) } }, { endDate: { gte: parseDate(t.today) } }] }, orderBy: { startDate: 'asc' }, take: 6 }) : [],
      db.term.findFirst({ where: { isCurrent: true } }),
    ]);
    return {
      slug: t.slug,
      school: { name: t.name, shortName: t.shortName, motto: t.motto, logoUrl: t.logoUrl, primaryColor: t.primaryColor },
      settings: t.settings,
      classes: levels.map((l) => ({ level: l.name, stage: l.stage })),
      subjects: subjects.map((s) => s.name),
      stats: t.settings.sections.stats ? { students, teachers, classes: arms, founded: t.settings.about.founded } : null,
      news: news.map((p) => postView(p)),
      events: events.map(eventView),
      term: term ? { name: term.name, startsOn: dateOnly(term.startsOn)!, endsOn: dateOnly(term.endsOn)! } : null,
    };
  }

  // ---------------------------------------------------------- results checker

  /**
   * A parent enters the admission number and the term's access code (printed
   * by the school). Only a published report card is shown; each code has a
   * limited number of uses.
   */
  async checkResult(slug: string, admissionNumber: string, code: string): Promise<PublicResult> {
    const t = await this.siteTenant(slug);
    if (!t.settings.sections.results) throw new NotFoundException('Results are not available on this website');
    const db = this.prisma.db;
    const access = await db.resultAccessCode.findUnique({
      where: { tenantId_code: { tenantId: t.id, code } },
      include: { student: { include: { classArm: { include: { classLevel: true } } } }, term: { include: { session: true } } },
    });
    // The same answer for a wrong code and a wrong admission number, so neither can be probed.
    if (!access || access.student.admissionNumber.toLowerCase() !== admissionNumber.toLowerCase()) {
      throw new BadRequestException('That admission number and code do not match. Check the slip from the school and try again.');
    }
    const card = await db.reportCard.findUnique({ where: { studentId_termId: { studentId: access.studentId, termId: access.termId } } });
    if (!card || card.status !== 'PUBLISHED') throw new BadRequestException(`The ${access.term.name} result has not been released yet. Please check again later.`);
    const used = await db.resultAccessCode.updateMany({ where: { id: access.id, uses: { lt: access.maxUses } }, data: { uses: { increment: 1 } } });
    if (!used.count) throw new ForbiddenException('This code has been used the maximum number of times. Ask the school office for a new one.');

    const r = await this.results.classResults(card.classArmId, access.termId);
    const mine = r.results.get(access.studentId);
    const [att] = await Promise.all([
      db.studentAttendance.groupBy({ by: ['status'], where: { studentId: access.studentId, date: { gte: access.term.startsOn, lte: access.term.endsOn } }, _count: { _all: true } }),
    ]);
    const n = (s: string) => att.find((a) => a.status === s)?._count._all ?? 0;
    const total = n('PRESENT') + n('LATE') + n('ABSENT') + n('EXCUSED');
    return {
      school: t.name,
      student: { name: fullName(access.student), admissionNumber: access.student.admissionNumber, classArm: `${r.classArm.levelName} ${r.classArm.name}` },
      term: access.term.name,
      session: access.term.session.name,
      subjects: r.subjects
        .map((s) => {
          const x = mine?.get(s.id);
          const band = x?.percent !== null && x?.percent !== undefined ? gradeFor(x.percent, r.gradingScale) : null;
          return { subject: s.name, total: x?.total ?? null, outOf: x?.outOf ?? 0, percent: x?.percent ?? null, grade: band?.grade ?? null, remark: band?.remark ?? null };
        })
        .filter((x) => x.percent !== null),
      average: r.averages.get(access.studentId) ?? null,
      position: r.positions.get(access.studentId) ?? null,
      classSize: r.students.length,
      teacherRemark: card.teacherRemark,
      principalRemark: card.principalRemark,
      attendance: total ? { present: n('PRESENT') + n('LATE'), absent: n('ABSENT'), total } : null,
      usesLeft: access.maxUses - access.uses - 1,
    };
  }

  /** Issues codes for a class and term (existing codes are kept). */
  async issueCodes(classArmId: string, termId: string, maxUses: number) {
    const db = this.prisma.db;
    await db.classArm.findUniqueOrThrow({ where: { id: classArmId } });
    await db.term.findUniqueOrThrow({ where: { id: termId } });
    const students = await db.student.findMany({ where: { classArmId, status: 'ACTIVE' }, select: { id: true } });
    const existing = new Set((await db.resultAccessCode.findMany({ where: { termId, studentId: { in: students.map((s) => s.id) } }, select: { studentId: true } })).map((c) => c.studentId));
    const tenantId = currentTenantId();
    let created = 0;
    for (const s of students.filter((x) => !existing.has(x.id))) {
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          await db.resultAccessCode.create({ data: { tenantId, studentId: s.id, termId, code: resultCode(), maxUses } });
          created++;
          break;
        } catch {
          // A clash on the random code: try another.
        }
      }
    }
    return created;
  }
}
