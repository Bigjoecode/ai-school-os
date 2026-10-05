import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CORE_SUBJECTS,
  INTEREST_QUIZ,
  INTEREST_TYPES,
  RIASEC,
  TRACK_INTERESTS,
  TRACK_LABELS,
  TRACK_SUBJECTS,
  TRACKS,
  type CareerDetail,
  type CareerFull,
  type CareerHome,
  type CareerMatch,
  type CareerPlanState,
  type CareerRow,
  type CourseView,
  type FitCheck,
  type InterestResult,
  type InterestType,
  type MyCareerPlan,
  type OlevelRequirements,
  type ParentCareerView,
  type QuizResult,
  type StaffCareerOverview,
  type StaffStudentCareer,
  type SubjectStrength,
  type Track,
  type TrackAdvice,
  type TrackRecommendation,
  type UtmeRule,
} from '@aischool/shared';
import { ResultsService } from '../assessment/results.service';
import { fullName } from '../common/format';
import { RequestContextStore } from '../common/request-context';
import type { Career, CareerProfile, Prisma, UniversityCourse } from '../generated/prisma/client';
import { levelOf, subjectKey } from '../learning/mastery.service';
import { PrismaService } from '../prisma/prisma.service';

/** Subjects whose results say most about each track (JSS and SS names). */
const TRACK_INDICATORS: Record<Track, string[]> = {
  SCIENCE: ['Mathematics', 'Basic Science', 'Physics', 'Chemistry', 'Biology', 'Further Mathematics', 'Agricultural Science', 'Basic Technology'],
  ARTS: ['English Language', 'Literature in English', 'Christian Religious Studies', 'Islamic Studies', 'History', 'Social Studies', 'Civic Education', 'Government', 'Cultural and Creative Arts', 'French', 'Yoruba', 'Igbo', 'Hausa'],
  COMMERCIAL: ['Mathematics', 'Business Studies', 'Economics', 'Commerce', 'Financial Accounting', 'Social Studies'],
  TECHNICAL: ['Basic Technology', 'Mathematics', 'Technical Drawing', 'Computer Studies', 'Information and Communication Technology', 'Physics', 'Basic Science'],
};
const STRONG = 65;
const NOT_LOADED = 'Requirements coming soon — check the JAMB brochure or ask your school counsellor.';

const norm = (s: string) => subjectKey(s).toLowerCase();
const uniq = <T>(xs: T[]) => [...new Set(xs)];
const listWords = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

export interface StudentInfo {
  id: string;
  tenantId: string;
  firstName: string;
  name: string;
  admissionNumber: string;
  className: string | null;
  levelName: string | null;
  stage: 'PRIMARY' | 'JUNIOR' | 'SENIOR';
  classArmId: string | null;
  classSubjects: string[];
}

/**
 * Careers guidance for students, their parents and school staff. The
 * library and course list are platform content (read through prisma.root);
 * each student's career profile belongs to their school (prisma.db).
 * Requirements reach students only once a person has verified them.
 */
@Injectable()
export class CareersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly results: ResultsService,
  ) {}

  // ---------------------------------------------------------- library

  row(c: Career): CareerRow {
    return { id: c.id, slug: c.slug, name: c.name, field: c.field, summary: c.summary, tracks: c.tracks as Track[], interests: c.interests as InterestType[], subjects: c.subjects, published: c.published };
  }

  full(c: Career): CareerFull {
    return { ...this.row(c), description: c.description, dayToDay: c.dayToDay, skills: c.skills, courses: c.courses, otherRoutes: c.otherRoutes, professionalBodies: c.professionalBodies, outlook: c.outlook, updatedAt: c.updatedAt.toISOString() };
  }

  private publishedCareers() {
    return this.prisma.root.career.findMany({ where: { published: true }, orderBy: { name: 'asc' } });
  }

  async library(q: { field?: string; track?: string; subject?: string; search?: string; interest?: string }): Promise<CareerRow[]> {
    const all = await this.publishedCareers();
    const s = q.search?.trim().toLowerCase();
    const subject = q.subject ? norm(q.subject) : null;
    return all
      .filter((c) => !q.field || c.field === q.field)
      .filter((c) => !q.track || c.tracks.includes(q.track))
      .filter((c) => !q.interest || c.interests.includes(q.interest))
      .filter((c) => !subject || c.subjects.some((x) => norm(x) === subject))
      .filter((c) => !s || [c.name, c.field, c.summary, ...c.skills, ...c.courses].some((x) => x.toLowerCase().includes(s)))
      .map((c) => this.row(c));
  }

  private async bySlugs(slugs: string[]): Promise<CareerRow[]> {
    if (!slugs.length) return [];
    const rows = await this.prisma.root.career.findMany({ where: { slug: { in: slugs }, published: true } });
    const by = new Map(rows.map((r) => [r.slug, r]));
    return slugs.flatMap((s) => (by.has(s) ? [this.row(by.get(s)!)] : []));
  }

  /** Courses by name (case-insensitive), as students see them. */
  async courseViews(names: string[]): Promise<CourseView[]> {
    if (!names.length) return [];
    const rows = await this.prisma.root.universityCourse.findMany({ where: { OR: names.map((n) => ({ name: { equals: n, mode: 'insensitive' as const } })) } });
    const by = new Map(rows.map((r) => [r.name.toLowerCase(), r]));
    return names.map((n) => courseView(by.get(n.toLowerCase()) ?? null, n));
  }

  private async course(name: string | null): Promise<UniversityCourse | null> {
    if (!name) return null;
    return this.prisma.root.universityCourse.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
  }

  /** Course names for the target-course picker (every published course, verified or not). */
  async courseNames(search?: string) {
    const rows = await this.prisma.root.universityCourse.findMany({
      where: { published: true, ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}) },
      orderBy: { name: 'asc' },
      select: { name: true, faculty: true, verified: true },
      take: 400,
    });
    return rows;
  }

  // ---------------------------------------------------------- the student

  async student(studentId: string): Promise<StudentInfo> {
    const s = await this.prisma.db.student.findUnique({
      where: { id: studentId },
      include: { classArm: { include: { classLevel: true, subjects: { include: { subject: true } } } } },
    });
    if (!s) throw new NotFoundException('Student not found');
    return {
      id: s.id,
      tenantId: s.tenantId,
      firstName: s.firstName,
      name: fullName(s),
      admissionNumber: s.admissionNumber,
      className: s.classArm ? `${s.classArm.classLevel.name} ${s.classArm.name}`.trim() : null,
      levelName: s.classArm?.classLevel.name ?? null,
      stage: levelOf(s.classArm?.classLevel.stage, s.classArm?.classLevel.name),
      classArmId: s.classArmId,
      classSubjects: uniq(s.classArm?.subjects.map((x) => subjectKey(x.subject.name)) ?? []),
    };
  }

  private profile(studentId: string) {
    return this.prisma.db.careerProfile.findUnique({ where: { studentId } });
  }

  private async upsertProfile(studentId: string, data: Omit<Prisma.CareerProfileUncheckedCreateInput, 'tenantId' | 'studentId'>) {
    return this.prisma.db.careerProfile.upsert({
      where: { studentId },
      update: data as Prisma.CareerProfileUncheckedUpdateInput,
      create: { ...data, studentId } as Prisma.CareerProfileUncheckedCreateInput,
    });
  }

  interests(p: CareerProfile | null): InterestResult | null {
    if (!p?.interestScores || !p.quizCompletedAt) return null;
    const scores = p.interestScores as Record<InterestType, number>;
    return { scores, top: topTypes(scores), completedAt: p.quizCompletedAt.toISOString() };
  }

  plan(p: CareerProfile | null): CareerPlanState {
    return { savedCareers: p?.savedCareers ?? [], targetCourse: p?.targetCourse ?? null, plannedTrack: (p?.plannedTrack as Track | null) ?? null };
  }

  /**
   * Subject strengths: the school's official percentages from the latest
   * term with results (current term first), beside practice mastery.
   */
  async strengths(info: Pick<StudentInfo, 'id' | 'tenantId' | 'classArmId'>): Promise<SubjectStrength[]> {
    const [official, records] = await Promise.all([this.officialLatest(info), this.prisma.root.masteryRecord.findMany({ where: { studentId: info.id }, select: { score: true, topic: { select: { subject: true } } } })]);
    const practice = new Map<string, number[]>();
    for (const r of records) practice.set(r.topic.subject, [...(practice.get(r.topic.subject) ?? []), r.score]);
    const subjects = uniq([...official.keys(), ...practice.keys()]);
    return subjects
      .map((subject) => {
        const p = practice.get(subject);
        return { subject, official: official.get(subject) ?? null, practice: p?.length ? Math.round(p.reduce((a, b) => a + b, 0) / p.length) : null };
      })
      .sort((a, b) => (best(b) ?? -1) - (best(a) ?? -1) || a.subject.localeCompare(b.subject));
  }

  private async officialLatest(info: Pick<StudentInfo, 'id' | 'tenantId' | 'classArmId'>): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (!info.classArmId) return out;
    const terms = await this.prisma.root.term.findMany({ where: { tenantId: info.tenantId, startsOn: { lte: new Date() } }, orderBy: [{ isCurrent: 'desc' }, { startsOn: 'desc' }], take: 3 });
    // Results read through the school-scoped client: run in the student's school, then restore.
    const ctx = RequestContextStore.get();
    const before = ctx?.tenantId;
    if (ctx) ctx.tenantId = info.tenantId;
    try {
      for (const term of terms) {
        try {
          const r = await this.results.classResults(info.classArmId, term.id);
          const mine = r.results.get(info.id);
          for (const s of r.subjects) {
            const p = mine?.get(s.id)?.percent;
            if (p !== null && p !== undefined) out.set(subjectKey(s.name), Math.round(p));
          }
        } catch {
          // No results for this term.
        }
        if (out.size) break;
      }
    } finally {
      if (ctx) ctx.tenantId = before;
    }
    return out;
  }

  // ---------------------------------------------------------- quiz & matching

  quiz() {
    return { statements: INTEREST_QUIZ, scale: [0, 1, 2] };
  }

  async submitQuiz(studentId: string, answers: Record<string, number>): Promise<QuizResult> {
    const known = new Map(INTEREST_QUIZ.map((q) => [q.id, q.type]));
    const answered = Object.keys(answers).filter((k) => known.has(k));
    if (answered.length < INTEREST_QUIZ.length * 0.8) throw new BadRequestException('Answer at least most of the statements so the results mean something');
    const raw = Object.fromEntries(RIASEC.map((t) => [t, 0])) as Record<InterestType, number>;
    const max = Object.fromEntries(RIASEC.map((t) => [t, 0])) as Record<InterestType, number>;
    for (const id of answered) {
      const t = known.get(id)!;
      raw[t] += answers[id]!;
      max[t] += 2;
    }
    const scores = Object.fromEntries(RIASEC.map((t) => [t, max[t] ? Math.round((100 * raw[t]) / max[t]) : 0])) as Record<InterestType, number>;
    const p = await this.upsertProfile(studentId, { interestScores: scores, quizAnswers: answers, quizCompletedAt: new Date() });
    const info = await this.student(studentId);
    const interests = this.interests(p)!;
    return { interests, matches: await this.matches(interests, await this.strengths(info), 12) };
  }

  /** The latest quiz results and the careers they point to (null before the quiz). */
  async quizResults(studentId: string): Promise<QuizResult | null> {
    const [info, p] = await Promise.all([this.student(studentId), this.profile(studentId)]);
    const interests = this.interests(p);
    if (!interests) return null;
    return { interests, matches: await this.matches(interests, await this.strengths(info), 12) };
  }

  /** Careers ranked by interest fit, then by the student's strong subjects. */
  async matches(interests: InterestResult | null, strengths: SubjectStrength[], limit: number, exclude: string[] = []): Promise<CareerMatch[]> {
    const strong = strengths.filter((s) => (best(s) ?? 0) >= STRONG);
    if (!interests && !strong.length) return [];
    const strongBy = new Map(strong.map((s) => [norm(s.subject), s]));
    const careers = (await this.publishedCareers()).filter((c) => !exclude.includes(c.slug));
    const weights = [1, 0.7, 0.5];
    return careers
      .map((c): CareerMatch => {
        const reasons: string[] = [];
        let interestScore: number | null = null;
        if (interests && c.interests.length) {
          const its = c.interests.slice(0, 3) as InterestType[];
          const w = its.map((_, i) => weights[i]!);
          interestScore = its.reduce((n, t, i) => n + interests.scores[t] * w[i]!, 0) / w.reduce((a, b) => a + b, 0);
          const shared = its.filter((t) => interests.top.includes(t) && interests.scores[t] >= 40);
          if (shared.length) reasons.push(`Suits your ${listWords(shared.map((t) => INTEREST_TYPES[t].name))} side`);
        }
        const hits = c.subjects.map((s) => strongBy.get(norm(s))).filter((s): s is SubjectStrength => !!s);
        const subjectScore = Math.min(1, hits.length / 2) * 100;
        if (hits.length) reasons.push(`You’re doing well in ${listWords(uniq(hits.map((h) => h.subject)).slice(0, 3))}`);
        const match = Math.round(interestScore === null ? subjectScore * 0.8 : interestScore * 0.75 + subjectScore * 0.25);
        return { ...this.row(c), match, reasons };
      })
      .filter((m) => m.match > 0)
      .sort((a, b) => b.match - a.match || a.name.localeCompare(b.name))
      .slice(0, limit);
  }

  // ---------------------------------------------------------- pages

  async home(studentId: string): Promise<CareerHome> {
    const [info, p, all] = await Promise.all([this.student(studentId), this.profile(studentId), this.publishedCareers()]);
    const interests = this.interests(p);
    const plan = this.plan(p);
    const fields = new Map<string, number>();
    for (const c of all) fields.set(c.field, (fields.get(c.field) ?? 0) + 1);
    return {
      student: { firstName: info.firstName, className: info.className, stage: info.stage },
      interests,
      plan,
      saved: await this.bySlugs(plan.savedCareers),
      suggestions: await this.matches(interests, await this.strengths(info), 6, plan.savedCareers),
      fields: [...fields.entries()].map(([field, count]) => ({ field, count })).sort((a, b) => b.count - a.count || a.field.localeCompare(b.field)),
      total: all.length,
    };
  }

  async detail(studentId: string, slug: string): Promise<CareerDetail> {
    const c = await this.prisma.root.career.findFirst({ where: { slug, published: true } });
    if (!c) throw new NotFoundException('Career not found');
    const [p, courseViews, info] = await Promise.all([this.profile(studentId), this.courseViews(c.courses), this.student(studentId)]);
    const related = await this.prisma.root.career.findMany({ where: { published: true, field: c.field, id: { not: c.id } }, take: 6, orderBy: { name: 'asc' } });
    const interests = this.interests(p);
    const plan = this.plan(p);
    const fitNotes: string[] = [];
    if (interests) {
      const shared = (c.interests as InterestType[]).filter((t) => interests.top.includes(t));
      fitNotes.push(shared.length ? `This career suits ${listWords(shared.map((t) => INTEREST_TYPES[t].name + 's'))} — that’s one of your top interest types.` : `Your top interest types are ${listWords(interests.top.map((t) => INTEREST_TYPES[t].name))}; this career leans more ${listWords((c.interests as InterestType[]).map((t) => INTEREST_TYPES[t].name))}. Worth exploring if it excites you!`);
    }
    if (plan.plannedTrack && c.tracks.length) {
      fitNotes.push(c.tracks.includes(plan.plannedTrack) ? `Your planned ${TRACK_LABELS[plan.plannedTrack]} track is a usual route here.` : `It’s usually reached through the ${listWords(c.tracks.map((t) => TRACK_LABELS[t as Track]))} track — talk to your counsellor about your subject choices.`);
    }
    const strengths = await this.strengths(info);
    const hits = c.subjects.filter((s) => strengths.some((x) => norm(x.subject) === norm(s) && (best(x) ?? 0) >= STRONG));
    if (hits.length) fitNotes.push(`You’re doing well in ${listWords(hits.slice(0, 3))}, which help here.`);
    return { ...this.full(c), courseViews, saved: plan.savedCareers.includes(c.slug), related: related.map((r) => this.row(r)), fitNotes };
  }

  async setSaved(studentId: string, slug: string, saved: boolean): Promise<CareerPlanState> {
    const c = await this.prisma.root.career.findFirst({ where: { slug, published: true }, select: { slug: true } });
    if (!c) throw new NotFoundException('Career not found');
    const p = await this.profile(studentId);
    const list = (p?.savedCareers ?? []).filter((s) => s !== slug);
    if (saved) list.unshift(slug);
    if (list.length > 30) throw new BadRequestException('You can save up to 30 careers');
    return this.plan(await this.upsertProfile(studentId, { savedCareers: list }));
  }

  async setPlan(studentId: string, input: { plannedTrack?: Track | null; targetCourse?: string | null }): Promise<CareerPlanState> {
    const data: { plannedTrack?: string | null; targetCourse?: string | null } = {};
    if (input.plannedTrack !== undefined) data.plannedTrack = input.plannedTrack;
    if (input.targetCourse !== undefined) {
      if (input.targetCourse) {
        const c = await this.course(input.targetCourse);
        if (!c || !c.published) throw new BadRequestException('Choose a course from the list');
        data.targetCourse = c.name;
      } else data.targetCourse = null;
    }
    return this.plan(await this.upsertProfile(studentId, data));
  }

  // ---------------------------------------------------------- track advisor & fit checks

  /** The subjects fit checks use: the planned track's usual subjects, else the class's subjects in senior school. */
  private subjectBasis(info: StudentInfo, plan: CareerPlanState): { list: string[]; basis: string } | null {
    if (plan.plannedTrack) {
      return { list: uniq([...CORE_SUBJECTS, ...TRACK_SUBJECTS[plan.plannedTrack]].map(subjectKey)), basis: `the usual ${TRACK_LABELS[plan.plannedTrack]} subjects (your school’s list may differ)` };
    }
    if (info.stage === 'SENIOR' && info.classSubjects.length) return { list: info.classSubjects, basis: 'your class’s subjects' };
    return null;
  }

  async fits(info: StudentInfo, plan: CareerPlanState): Promise<FitCheck[]> {
    const basis = this.subjectBasis(info, plan);
    const have = new Set((basis?.list ?? []).map(norm));
    const out: FitCheck[] = [];
    const saved = plan.savedCareers.length ? await this.prisma.root.career.findMany({ where: { slug: { in: plan.savedCareers } } }) : [];
    const courseRows = await this.courseViews(uniq([...saved.flatMap((c) => c.courses), ...(plan.targetCourse ? [plan.targetCourse] : [])]));
    const courseBy = new Map(courseRows.map((c) => [c.name.toLowerCase(), c]));

    if (plan.targetCourse) {
      out.push(courseFit(courseBy.get(plan.targetCourse.toLowerCase()) ?? courseView(null, plan.targetCourse), basis ? have : null));
    }
    for (const slug of plan.savedCareers) {
      const c = saved.find((x) => x.slug === slug);
      if (!c) continue;
      const notes: string[] = [];
      let status: FitCheck['status'] = 'NO_SUBJECTS';
      if (plan.plannedTrack && c.tracks.length) {
        status = c.tracks.includes(plan.plannedTrack) ? 'FITS' : 'GAPS';
        notes.push(status === 'FITS' ? `Your planned ${TRACK_LABELS[plan.plannedTrack]} track is a usual route into this career.` : `Usually reached through ${listWords(c.tracks.map((t) => TRACK_LABELS[t as Track]))}, not ${TRACK_LABELS[plan.plannedTrack]}.`);
      } else if (!plan.plannedTrack) {
        notes.push('Choose a planned track to see whether your subjects fit.');
      }
      const views = c.courses.map((n) => courseBy.get(n.toLowerCase())).filter((v): v is CourseView => !!v);
      const verified = views.filter((v) => v.verified);
      if (!views.length) notes.push('No university courses are linked yet.');
      else if (!verified.length) {
        notes.push(`Course requirements aren’t loaded yet for ${listWords(views.slice(0, 3).map((v) => v.name))} — check the JAMB brochure.`);
        if (status === 'FITS' || status === 'NO_SUBJECTS') status = basis ? status : 'NOT_LOADED';
      } else if (basis) {
        const checks = verified.map((v) => courseFit(v, have));
        const ok = checks.filter((x) => x.status === 'FITS');
        if (ok.length) notes.push(`Your subjects meet the listed subject requirements for ${listWords(ok.slice(0, 3).map((x) => x.name))}.`);
        else {
          notes.push(`Check your subjects for ${listWords(checks.slice(0, 2).map((x) => x.name))}: ${checks[0]!.notes[0] ?? ''}`.trim());
          status = 'GAPS';
        }
      }
      out.push({ kind: 'CAREER', name: c.name, slug: c.slug, status, notes });
    }
    return out;
  }

  async advice(studentId: string): Promise<TrackAdvice> {
    const [info, p] = await Promise.all([this.student(studentId), this.profile(studentId)]);
    const interests = this.interests(p);
    const plan = this.plan(p);
    const strengths = await this.strengths(info);
    const saved = plan.savedCareers.length ? await this.prisma.root.career.findMany({ where: { slug: { in: plan.savedCareers } }, select: { name: true, tracks: true } }) : [];
    const lvl = (info.levelName ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const relevant = /^(jss3|js3|juniorsecondary3|basic9|ss1|sss1|seniorsecondary1)$/.test(lvl);
    const stageNote = relevant
      ? null
      : info.stage === 'SENIOR'
        ? 'You’ve already started senior school. This shows how your interests and results line up with each track, so you can check your subjects still suit your goals.'
        : 'Most students choose their track at the end of JSS3. This is an early look — it will get more useful as your results build up.';
    const value = (s: SubjectStrength) => s.official ?? s.practice;
    const recs: TrackRecommendation[] = TRACKS.map((track) => {
      const reasons: string[] = [];
      const parts: { w: number; v: number }[] = [];
      if (interests) {
        const [a, b] = TRACK_INTERESTS[track] as [InterestType, InterestType];
        const v = (interests.scores[a] * 1 + interests.scores[b] * 0.6) / 1.6;
        parts.push({ w: 0.45, v });
        const tops = [a, b].filter((t) => interests.top.slice(0, 2).includes(t));
        if (tops.length) reasons.push(`Your quiz shows a strong ${listWords(tops.map((t) => INTEREST_TYPES[t].name))} side, which suits ${TRACK_LABELS[track]}.`);
        else if (v < 40) reasons.push(`Your quiz suggests ${TRACK_LABELS[track]}-type activities aren’t your favourites right now.`);
      }
      const indicators = new Set(TRACK_INDICATORS[track].map(norm));
      const scored = strengths.filter((s) => indicators.has(norm(s.subject)) && value(s) !== null);
      if (scored.length) {
        const avg = scored.reduce((n, s) => n + value(s)!, 0) / scored.length;
        parts.push({ w: 0.4, v: avg });
        const good = scored.filter((s) => value(s)! >= STRONG).sort((x, y) => value(y)! - value(x)!);
        const weak = scored.filter((s) => value(s)! < 50).sort((x, y) => value(x)! - value(y)!);
        if (good.length) reasons.push(`You’re doing well in ${listWords(good.slice(0, 3).map((s) => `${s.subject} (${value(s)}%)`))} — key subjects for ${TRACK_LABELS[track]}.`);
        if (weak.length) reasons.push(`${listWords(weak.slice(0, 2).map((s) => `${s.subject} (${value(s)}%)`))} could use extra work if you choose ${TRACK_LABELS[track]}.`);
      }
      if (saved.length) {
        const leading = saved.filter((c) => c.tracks.includes(track));
        parts.push({ w: 0.15, v: (100 * leading.length) / saved.length });
        if (leading.length) reasons.push(`${leading.length === 1 ? 'Your saved career' : `${leading.length} of your saved careers`} (${listWords(leading.slice(0, 3).map((c) => c.name))}) ${leading.length === 1 ? 'starts' : 'start'} from ${TRACK_LABELS[track]}.`);
      }
      if (track === 'TECHNICAL') reasons.push('Not every school offers a Technical track — ask your school what they run.');
      const w = parts.reduce((n, x) => n + x.w, 0);
      return { track, score: w ? Math.round(parts.reduce((n, x) => n + x.w * x.v, 0) / w) : 0, reasons };
    }).sort((a, b) => b.score - a.score);
    return {
      relevant,
      stageNote,
      plannedTrack: plan.plannedTrack,
      recommendations: interests || strengths.length || saved.length ? recs : TRACKS.map((track) => ({ track, score: 0, reasons: [] })),
      strengths,
      subjects: this.subjectBasis(info, plan),
      fits: await this.fits(info, plan),
      interests,
    };
  }

  async myPlan(studentId: string): Promise<MyCareerPlan> {
    const [info, p] = await Promise.all([this.student(studentId), this.profile(studentId)]);
    const plan = this.plan(p);
    const interests = this.interests(p);
    const [saved, target, fits] = await Promise.all([this.bySlugs(plan.savedCareers), plan.targetCourse ? this.courseViews([plan.targetCourse]).then((v) => v[0] ?? null) : null, this.fits(info, plan)]);
    const nextSteps: string[] = [];
    if (!interests) nextSteps.push('Take the interest quiz to discover your interest types.');
    if (!saved.length) nextSteps.push('Explore the career library and save careers that excite you.');
    if (!plan.plannedTrack) nextSteps.push(info.stage === 'SENIOR' ? 'Set your track so we can check your subjects against your goals.' : 'Use the track advisor to think about Science, Arts, Commercial or Technical.');
    if (!plan.targetCourse) nextSteps.push('Pick a target university course for your saved career.');
    else if (target && !target.verified) nextSteps.push(`Check the JAMB brochure for ${target.name}’s UTME subjects and O’level requirements (they aren’t loaded here yet).`);
    nextSteps.push('Talk your plan through with your parents and your school counsellor.');
    return { plan, interests, saved, target, fits, nextSteps };
  }

  // ---------------------------------------------------------- parents & staff

  async parentView(studentId: string): Promise<ParentCareerView> {
    const [info, p] = await Promise.all([this.student(studentId), this.profile(studentId)]);
    const plan = this.plan(p);
    const [saved, target, fits] = await Promise.all([this.bySlugs(plan.savedCareers), plan.targetCourse ? this.courseViews([plan.targetCourse]).then((v) => v[0] ?? null) : null, this.fits(info, plan)]);
    return { interests: this.interests(p), plan, saved, target, fits, updatedAt: p?.updatedAt.toISOString() ?? null };
  }

  async staffOverview(classArmId?: string): Promise<StaffCareerOverview> {
    const db = this.prisma.db;
    const [arms, students] = await Promise.all([
      db.classArm.findMany({ include: { classLevel: true }, orderBy: [{ classLevel: { order: 'asc' } }, { name: 'asc' }] }),
      db.student.findMany({
        where: { status: 'ACTIVE', ...(classArmId ? { classArmId } : {}) },
        include: { careerProfile: true, classArm: { include: { classLevel: true } } },
        orderBy: [{ classArm: { classLevel: { order: 'asc' } } }, { lastName: 'asc' }, { firstName: 'asc' }],
        take: 3000,
      }),
    ]);
    const byType = Object.fromEntries(RIASEC.map((t) => [t, 0])) as Record<InterestType, number>;
    const byTrack = Object.fromEntries(TRACKS.map((t) => [t, 0])) as Record<Track, number>;
    const careerCount = new Map<string, number>();
    const rows = students.map((s) => {
      const p = s.careerProfile;
      const interests = this.interests(p);
      if (interests) for (const t of interests.top.slice(0, 1)) byType[t]++;
      if (p?.plannedTrack) byTrack[p.plannedTrack as Track]++;
      for (const slug of p?.savedCareers ?? []) careerCount.set(slug, (careerCount.get(slug) ?? 0) + 1);
      return {
        studentId: s.id,
        name: fullName(s),
        admissionNumber: s.admissionNumber,
        className: s.classArm ? `${s.classArm.classLevel.name} ${s.classArm.name}`.trim() : null,
        top: interests?.top ?? [],
        plannedTrack: (p?.plannedTrack as Track | null) ?? null,
        savedCareers: p?.savedCareers ?? [],
        targetCourse: p?.targetCourse ?? null,
        quizCompletedAt: p?.quizCompletedAt?.toISOString() ?? null,
        hasNotes: !!p?.counsellorNotes,
      };
    });
    const topSlugs = [...careerCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const names = new Map((await this.prisma.root.career.findMany({ where: { slug: { in: [...careerCount.keys()] } }, select: { slug: true, name: true } })).map((c) => [c.slug, c.name]));
    for (const r of rows) r.savedCareers = r.savedCareers.map((s) => names.get(s) ?? s);
    return {
      classes: arms.map((a) => ({ id: a.id, label: `${a.classLevel.name} ${a.name}`.trim() })),
      rows,
      totals: {
        students: rows.length,
        quizDone: rows.filter((r) => r.quizCompletedAt).length,
        withTrack: rows.filter((r) => r.plannedTrack).length,
        byType,
        byTrack,
        topCareers: topSlugs.map(([slug, count]) => ({ slug, name: names.get(slug) ?? slug, count })),
      },
    };
  }

  async staffStudent(studentId: string, canNotes: boolean): Promise<StaffStudentCareer> {
    const info = await this.student(studentId);
    const p = await this.profile(studentId);
    const plan = this.plan(p);
    const [saved, target, advice] = await Promise.all([this.bySlugs(plan.savedCareers), plan.targetCourse ? this.courseViews([plan.targetCourse]).then((v) => v[0] ?? null) : null, this.advice(studentId)]);
    return {
      student: { id: info.id, name: info.name, admissionNumber: info.admissionNumber, className: info.className },
      interests: this.interests(p),
      plan,
      saved,
      target,
      advice,
      counsellorNotes: canNotes ? (p?.counsellorNotes ?? null) : null,
      canEditNotes: canNotes,
      updatedAt: p?.updatedAt.toISOString() ?? null,
    };
  }

  async setNotes(studentId: string, notes: string | null) {
    await this.student(studentId);
    const p = await this.upsertProfile(studentId, { counsellorNotes: notes });
    return { counsellorNotes: p.counsellorNotes };
  }
}

// ---------------------------------------------------------- helpers

function best(s: SubjectStrength): number | null {
  return s.official ?? s.practice;
}

export function topTypes(scores: Record<InterestType, number>): InterestType[] {
  const ranked = [...RIASEC].sort((a, b) => scores[b] - scores[a] || RIASEC.indexOf(a) - RIASEC.indexOf(b));
  // Types the student scored nothing on are never "top", but there is always at least one.
  return [ranked[0]!, ...ranked.slice(1, 3).filter((t) => scores[t] > 0)];
}

export function courseView(c: UniversityCourse | null, name: string): CourseView {
  const verified = !!c && c.verified && c.published;
  return {
    name: c?.name ?? name,
    faculty: c?.faculty ?? null,
    known: !!c,
    verified,
    utmeSubjects: verified ? (c!.utmeSubjects as unknown as UtmeRule[]) : null,
    olevelRequirements: verified ? ((c!.olevelRequirements as unknown as OlevelRequirements | null) ?? null) : null,
    notes: verified ? c!.notes : null,
    sourceEdition: verified ? c!.sourceEdition : null,
  };
}

/** Checks a verified course's subject requirements against a set of (normalised) subjects. */
export function courseFit(v: CourseView, have: Set<string> | null): FitCheck {
  const base = { kind: 'COURSE' as const, name: v.name, slug: null };
  if (!v.verified) return { ...base, status: 'NOT_LOADED', notes: [NOT_LOADED] };
  if (!have) return { ...base, status: 'NO_SUBJECTS', notes: ['Choose a planned track so we can check your subjects against this course.'] };
  const notes: string[] = [];
  for (const rule of v.utmeSubjects ?? []) {
    if (!rule.subjects.some((s) => have.has(norm(s)))) notes.push(`UTME needs ${rule.subjects.length > 1 ? `one of ${rule.subjects.join(' or ')}` : rule.subjects[0]}.`);
  }
  const o = v.olevelRequirements;
  if (o) {
    const missing = o.required.filter((s) => !have.has(norm(s)));
    if (missing.length) notes.push(`O’level credits needed in ${listWords(missing)}.`);
    for (const g of o.anyOf) {
      const got = g.subjects.filter((s) => have.has(norm(s))).length;
      if (got < g.count) notes.push(`O’level needs ${g.count} of ${g.subjects.join(', ')}.`);
    }
  }
  if (notes.length) return { ...base, status: 'GAPS', notes };
  return { ...base, status: 'FITS', notes: [`Your subjects match the listed requirements${v.sourceEdition ? ` (JAMB brochure ${v.sourceEdition})` : ''}. You’ll still need credit passes and a strong UTME score — each university sets its own cut-off.`] };
}
