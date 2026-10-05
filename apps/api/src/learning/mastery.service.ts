import { Injectable } from '@nestjs/common';
import { masteryBand, type MasteryMap, type MasteryTopic } from '@aischool/shared';
import { ResultsService } from '../assessment/results.service';
import { RequestContextStore } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

/** Old evidence counts for less: each new piece of evidence decays the history by this much. */
const DECAY = 0.85;

export type SyllabusLevel = 'PRIMARY' | 'JUNIOR' | 'SENIOR';

/** A school's class stage → the syllabus level its topics come from. */
export function levelOf(stage: string | null | undefined, levelName?: string): SyllabusLevel {
  const s = `${stage ?? ''} ${levelName ?? ''}`.toLowerCase();
  if (s.includes('senior') || /\bss\s?\d/.test(s)) return 'SENIOR';
  if (s.includes('junior') || /\bjss\s?\d/.test(s)) return 'JUNIOR';
  return 'PRIMARY';
}

/** "maths", "Mathematics", "General Mathematics" → one subject key. */
export function subjectKey(name: string): string {
  const n = name.toLowerCase().replace(/[^a-z ]/g, '').trim();
  // Specific names first: "Further Mathematics" isn't Mathematics, "Literature in English" isn't English.
  if (/further math|math[a-z]* elective/.test(n)) return 'Further Mathematics';
  if (/literature/.test(n)) return 'Literature in English';
  if (/data processing/.test(n)) return 'Data Processing';
  if (/\bict\b|information and communication/.test(n)) return 'Information and Communication Technology';
  if (/math/.test(n)) return 'Mathematics';
  if (/english/.test(n)) return 'English Language';
  if (/basic science|integrated science/.test(n)) return 'Basic Science';
  if (/physics/.test(n)) return 'Physics';
  if (/chem/.test(n)) return 'Chemistry';
  if (/\bbio\b|biolog/.test(n)) return 'Biology'; // not "Ibibio"
  if (/econ/.test(n)) return 'Economics';
  if (/civic/.test(n)) return 'Civic Education';
  if (/government/.test(n)) return 'Government';
  if (/geograph/.test(n)) return 'Geography';
  if (/computer/.test(n)) return 'Computer Studies';
  if (/social studies/.test(n)) return 'Social Studies';
  if (/agric/.test(n)) return 'Agricultural Science';
  // Keep names already written properly ("GSM Phone Maintenance and Repairs"); tidy all-caps or all-lowercase ones.
  const t = name.trim().replace(/\s+/g, ' ');
  if (t !== t.toUpperCase() && t !== t.toLowerCase()) return t;
  return t
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/(?!^)\b(And|Of|In|The|For|To)\b/g, (w) => w.toLowerCase());
}

/**
 * Topic mastery, kept apart from the school's official results. Evidence
 * (practice answers, quiz scores, the tutor's observations) moves a decayed
 * success rate; official term results are shown beside it, never replaced.
 */
@Injectable()
export class MasteryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly results: ResultsService,
  ) {}

  async studentLevel(studentId: string): Promise<SyllabusLevel> {
    const s = await this.prisma.root.student.findUnique({ where: { id: studentId }, select: { classArm: { select: { classLevel: { select: { stage: true, name: true } } } } } });
    return levelOf(s?.classArm?.classLevel.stage, s?.classArm?.classLevel.name);
  }

  /** Finds a topic by name in the student's level (or any level), creating it under the subject if new. */
  async topicFor(studentId: string, subject: string, topic: string) {
    const level = await this.studentLevel(studentId);
    const key = subjectKey(subject);
    const name = topic.trim().replace(/\s+/g, ' ').slice(0, 120);
    const existing =
      (await this.prisma.root.syllabusTopic.findFirst({ where: { subject: key, level, name: { equals: name, mode: 'insensitive' } } })) ??
      (await this.prisma.root.syllabusTopic.findFirst({ where: { subject: key, name: { equals: name, mode: 'insensitive' } } })) ??
      (await this.prisma.root.syllabusTopic.findFirst({ where: { subject: key, level, name: { contains: name, mode: 'insensitive' } } }));
    if (existing) return existing;
    return this.prisma.root.syllabusTopic.upsert({
      where: { subject_level_name: { subject: key, level, name } },
      update: {},
      create: { subject: key, level, name, order: 999 },
    });
  }

  /** Adds evidence: `correct` out of `total` (an observation counts as one attempt). */
  async record(tenantId: string, studentId: string, topicId: string, correct: number, total: number) {
    if (total <= 0) return null;
    const now = new Date();
    const prev = await this.prisma.root.masteryRecord.findUnique({ where: { studentId_topicId: { studentId, topicId } } });
    const attempts = (prev ? prev.attempts * DECAY : 0) + total;
    const right = (prev ? prev.correct * DECAY : 0) + correct;
    // Laplace-smoothed so one lucky answer isn't "mastered".
    const score = Math.round((100 * (right + 0.5)) / (attempts + 1));
    const confidence = Math.min(0.95, Math.round((1 - 1 / Math.sqrt(attempts + 1)) * 100) / 100);
    const data = { score, confidence, attempts: Math.round(attempts), correct: Math.round(right), lastEvidenceAt: now };
    return this.prisma.root.masteryRecord.upsert({
      where: { studentId_topicId: { studentId, topicId } },
      update: data,
      create: { tenantId, studentId, topicId, ...data },
    });
  }

  async map(studentId: string): Promise<MasteryMap> {
    const student = await this.prisma.root.student.findUniqueOrThrow({ where: { id: studentId }, select: { tenantId: true, classArmId: true } });
    const level = await this.studentLevel(studentId);
    const records = await this.prisma.root.masteryRecord.findMany({ where: { studentId }, include: { topic: { include: { parent: true } } } });
    // The syllabus for the student's level, so untouched topics show as "not started".
    const syllabus = await this.prisma.root.syllabusTopic.findMany({ where: { level, parentId: null }, orderBy: [{ subject: 'asc' }, { order: 'asc' }] });
    const official = await this.officialPercents(student.tenantId, studentId, student.classArmId);
    const bySubject = new Map<string, MasteryTopic[]>();
    const add = (subject: string, t: MasteryTopic) => bySubject.set(subject, [...(bySubject.get(subject) ?? []), t]);
    for (const r of records) {
      add(r.topic.subject, { topicId: r.topicId, topic: r.topic.name, parent: r.topic.parent?.name ?? null, score: r.score, confidence: r.confidence, attempts: r.attempts, lastEvidenceAt: r.lastEvidenceAt?.toISOString() ?? null, band: masteryBand(r.score) });
    }
    const touched = new Set(records.map((r) => r.topicId));
    for (const t of syllabus) {
      if (touched.has(t.id)) continue;
      if (!bySubject.has(t.subject) && !official.has(t.subject)) continue;
      add(t.subject, { topicId: t.id, topic: t.name, parent: null, score: null, confidence: 0, attempts: 0, lastEvidenceAt: null, band: 'NOT_STARTED' });
    }
    for (const s of official.keys()) if (!bySubject.has(s)) bySubject.set(s, []);
    const subjects = [...bySubject.entries()]
      .map(([subject, topics]) => {
        const scored = topics.filter((t) => t.score !== null);
        return {
          subject,
          average: scored.length ? Math.round(scored.reduce((x, t) => x + t.score!, 0) / scored.length) : null,
          officialPercent: official.get(subject) ?? null,
          topics: topics.sort((a, b) => (a.score ?? 101) - (b.score ?? 101) || a.topic.localeCompare(b.topic)),
        };
      })
      .sort((a, b) => a.subject.localeCompare(b.subject));
    const all = subjects.flatMap((s) => s.topics).filter((t) => t.score !== null && t.attempts >= 2);
    return {
      subjects,
      weakest: [...all].sort((a, b) => a.score! - b.score!).slice(0, 5),
      strongest: [...all].sort((a, b) => b.score! - a.score!).slice(0, 5),
    };
  }

  /** The school's official subject percentages this term (authoritative; shown, never altered). */
  async officialPercents(tenantId: string, studentId: string, classArmId: string | null): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (!classArmId) return out;
    const term = await this.prisma.root.term.findFirst({ where: { tenantId, isCurrent: true } });
    if (!term) return out;
    // Results read through the school-scoped client: run in the student's school, then restore.
    const ctx = RequestContextStore.get();
    const before = ctx?.tenantId;
    if (ctx) ctx.tenantId = tenantId;
    try {
      const r = await this.results.classResults(classArmId, term.id);
      const mine = r.results.get(studentId);
      for (const s of r.subjects) {
        const p = mine?.get(s.id)?.percent;
        if (p !== null && p !== undefined) out.set(subjectKey(s.name), Math.round(p));
      }
    } catch {
      // No results this term yet.
    } finally {
      if (ctx) ctx.tenantId = before;
    }
    return out;
  }
}
