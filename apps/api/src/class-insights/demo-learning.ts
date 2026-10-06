import { BadRequestException, Body, Controller, HttpCode, Post } from '@nestjs/common';
import { z } from 'zod';
import type { Prisma, PrismaClient } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { RequirePlatformRole } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { subjectKey } from '../learning/mastery.service';
import { PrismaService } from '../prisma/prisma.service';

/** Only the built-in demo schools can be given demo learning data. */
const DEMO_SCHOOLS = ['greenfield', 'sunrise'];
const TAG = 'demo-seed';
const DECAY = 0.85;
const DAY = 86_400_000;

const bodySchema = z.object({ school: z.enum(['greenfield', 'sunrise']).default('greenfield'), remove: z.boolean().default(false) });

/**
 * Realistic topic-mastery history for the demo schools, so Class insights,
 * students' progress and parents' learning updates can be shown to prospective
 * schools. Everything created is tagged and can be removed in one call.
 */
@Controller('platform/demo')
@RequirePlatformRole('SUPER_ADMIN')
export class DemoLearningController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Post('learning-data')
  @HttpCode(200)
  learningData(@Body(new ZodPipe(bodySchema)) body: z.infer<typeof bodySchema>) {
    return seedDemoLearning(this.prisma.root, body.school, body.remove, this.audit);
  }
}

/**
 * Adds (or with remove, deletes) the tagged demo learning data for a demo
 * school. Re-running replaces the previous demo data.
 */
export async function seedDemoLearning(prisma: PrismaClient, school: 'greenfield' | 'sunrise', remove = false, audit?: AuditService) {
    const db = prisma;
    const tenant = await db.tenant.findUnique({ where: { slug: school }, select: { id: true, slug: true } });
    if (!tenant || !DEMO_SCHOOLS.includes(tenant.slug)) throw new BadRequestException('Demo learning data can only be added to the demo schools');
    const markerKey = `demo-learning-seed:${tenant.id}`;
    const marker = await db.platformSetting.findUnique({ where: { key: markerKey } });
    const previous = (marker?.value as { recordIds?: string[] } | null)?.recordIds ?? [];
    const restore = (marker?.value as { modified?: { id: string; score: number; confidence: number; attempts: number; correct: number; lastEvidenceAt: string | null }[] } | null)?.modified ?? [];

    // Remove anything added before (also when re-seeding).
    const removedEvidence = (await db.masteryEvidence.deleteMany({ where: { tenantId: tenant.id, sourceId: { startsWith: TAG } } })).count;
    const removedRecords = (await db.masteryRecord.deleteMany({ where: { id: { in: previous } } })).count;
    for (const r of restore) {
      await db.masteryRecord.updateMany({ where: { id: r.id }, data: { score: r.score, confidence: r.confidence, attempts: r.attempts, correct: r.correct, lastEvidenceAt: r.lastEvidenceAt ? new Date(r.lastEvidenceAt) : null } });
    }
    await db.platformSetting.deleteMany({ where: { key: markerKey } });
    if (remove) {
      await audit?.log({ action: 'platform.demo_learning_removed', entityType: 'Tenant', entityId: tenant.id, tenantId: null, summary: `Removed demo learning data from ${tenant.slug}: ${removedRecords} topic records, ${removedEvidence} pieces of evidence` });
      return { removed: { records: removedRecords, evidence: removedEvidence } };
    }

    // Which classes: the demo teacher's, plus the demo student's class.
    const pairs: { classArmId: string; subjectId: string; subject: string; level: string }[] = [];
    const levelOf = (code: string | null, name: string) => (/^(ss|sss)/i.test(code ?? name) ? 'SENIOR' : /^(jss|js)/i.test(code ?? name) ? 'JUNIOR' : 'PRIMARY');
    const teacher = await db.staff.findFirst({ where: { tenantId: tenant.id, user: { email: { startsWith: 'teacher@' } } }, select: { id: true } });
    if (teacher) {
      const taught = await db.classSubject.findMany({ where: { tenantId: tenant.id, teacherId: teacher.id }, include: { subject: true, classArm: { include: { classLevel: true } } } });
      // Senior classes first: they have the full WAEC/JAMB topic graph. Only subjects with enough topics.
      const ranked = taught
        .map((t) => ({ classArmId: t.classArmId, subjectId: t.subjectId, subject: t.subject.name, level: levelOf(t.classArm.classLevel.code, t.classArm.classLevel.name) }))
        .sort((x, y) => (x.level === 'SENIOR' ? 0 : 1) - (y.level === 'SENIOR' ? 0 : 1));
      for (const t of ranked) {
        if (pairs.length >= 3) break;
        if ((await db.syllabusTopic.count({ where: { subject: subjectKey(t.subject), level: t.level, parentId: null } })) >= 6) pairs.push(t);
      }
    }
    const student = await db.student.findFirst({ where: { tenantId: tenant.id, user: { email: { startsWith: 'student@' } } }, include: { classArm: { include: { classLevel: true, subjects: { include: { subject: true } } } } } });
    if (student?.classArm) {
      const wanted = ['Mathematics', 'English Language', 'Basic Science', 'Biology'];
      for (const cs of student.classArm.subjects.filter((s) => wanted.includes(subjectKey(s.subject.name)))) {
        if (!pairs.some((p) => p.classArmId === cs.classArmId && p.subjectId === cs.subjectId)) {
          pairs.push({ classArmId: cs.classArmId, subjectId: cs.subjectId, subject: cs.subject.name, level: levelOf(student.classArm.classLevel.code, student.classArm.classLevel.name) });
        }
      }
    }
    if (!pairs.length) throw new BadRequestException('No demo classes found to add learning data to');

    let seed = 20261006;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const sig = (x: number) => 1 / (1 + Math.exp(-x));
    const now = Date.now();
    const SOURCES = ['PRACTICE', 'PRACTICE', 'HOMEWORK', 'CBT', 'QUIZ', 'TUTOR'];
    const recordIds: string[] = [];
    const modified: { id: string; score: number; confidence: number; attempts: number; correct: number; lastEvidenceAt: string | null }[] = [];
    let evidenceRows = 0;
    const summary: { class: string; subject: string; topics: number; students: number }[] = [];

    for (const pair of pairs) {
      const subject = subjectKey(pair.subject);
      const topics = await db.syllabusTopic.findMany({ where: { subject, level: pair.level, parentId: null }, orderBy: [{ order: 'asc' }, { name: 'asc' }], take: 10, select: { id: true } });
      if (!topics.length) continue;
      const students = await db.student.findMany({ where: { tenantId: tenant.id, classArmId: pair.classArmId, status: 'ACTIVE' }, orderBy: { lastName: 'asc' }, select: { id: true } });
      const plan = topics.map((t, i) => ({ id: t.id, difficulty: [0, 0.4, 1.1, 0.2, 0.6, 0.7, 0.9, 1.2, 0.3, 0.8][i % 10]!, improving: i === 1 || i === 9 }));
      const evidence: Prisma.MasteryEvidenceCreateManyInput[] = [];
      for (const [si, s] of students.entries()) {
        const isDemoStudent = !!student && s.id === student.id;
        if (si % 9 === 4 && !isDemoStudent) continue; // a few students with no activity yet
        const ability = (rnd() - 0.5) * 2.6 + (si % 7 === 2 ? -1.2 : 0);
        for (const t of plan) {
          if (rnd() < 0.18 && !isDemoStudent) continue;
          const existing = await db.masteryRecord.findUnique({ where: { studentId_topicId: { studentId: s.id, topicId: t.id } } });
          // Other students' real records are left alone; the demo student's are extended (and restored on removal).
          if (existing && !isDemoStudent) continue;
          const events = 1 + Math.floor(rnd() * 5);
          const times = Array.from({ length: events }, () => now - Math.floor(rnd() * 42 * DAY));
          // The demo student always has some activity this week, so the weekly update has something to say.
          if (student && s.id === student.id) times.push(now - Math.floor(rnd() * 3 * DAY) - 3_600_000);
          times.sort((a, b) => a - b);
          let attempts = existing ? existing.attempts : 0;
          let right = existing ? existing.correct : 0;
          let score = existing ? existing.score : 0;
          if (existing) times.splice(0, times.length - 2); // just a couple of recent events on top of real history
          for (const at of times) {
            const recent = now - at < 14 * DAY;
            const p = sig(ability - t.difficulty + 0.35 + (t.improving && recent ? 1.1 : 0));
            const total = [1, 4, 5, 5, 10][Math.floor(rnd() * 5)]!;
            let correct = 0;
            for (let k = 0; k < total; k++) if (rnd() < p) correct++;
            attempts = attempts * DECAY + total;
            right = right * DECAY + correct;
            score = Math.round((100 * (right + 0.5)) / (attempts + 1));
            evidence.push({ tenantId: tenant.id, studentId: s.id, topicId: t.id, source: SOURCES[Math.floor(rnd() * SOURCES.length)]!, sourceId: `${TAG}:${pair.classArmId}`, correct, total, scoreAfter: score, createdAt: new Date(at) });
          }
          const values = {
            score,
            confidence: Math.min(0.95, Math.round((1 - 1 / Math.sqrt(attempts + 1)) * 100) / 100),
            attempts: Math.round(attempts),
            correct: Math.round(right),
            lastEvidenceAt: new Date(times[times.length - 1]!),
          };
          if (existing) {
            modified.push({ id: existing.id, score: existing.score, confidence: existing.confidence, attempts: existing.attempts, correct: existing.correct, lastEvidenceAt: existing.lastEvidenceAt?.toISOString() ?? null });
            await db.masteryRecord.update({ where: { id: existing.id }, data: values });
          } else {
            const rec = await db.masteryRecord.create({ data: { tenantId: tenant.id, studentId: s.id, topicId: t.id, ...values }, select: { id: true } });
            recordIds.push(rec.id);
          }
        }
      }
      for (let i = 0; i < evidence.length; i += 1000) await db.masteryEvidence.createMany({ data: evidence.slice(i, i + 1000) });
      evidenceRows += evidence.length;
      const arm = await db.classArm.findUnique({ where: { id: pair.classArmId }, include: { classLevel: true } });
      summary.push({ class: `${arm?.classLevel.name ?? ''} ${arm?.name ?? ''}`.trim(), subject, topics: topics.length, students: students.length });
    }
    await db.platformSetting.create({ data: { key: markerKey, value: { recordIds, modified, createdAt: new Date().toISOString() } as unknown as Prisma.InputJsonValue } });
    await audit?.log({ action: 'platform.demo_learning_added', entityType: 'Tenant', entityId: tenant.id, tenantId: null, summary: `Added demo learning data to ${tenant.slug}: ${recordIds.length} topic records, ${evidenceRows} pieces of evidence` });
    return { added: { records: recordIds.length, evidence: evidenceRows }, classes: summary };
}

/**
 * At start-up: gives the demo school its demo learning data once, ever. If it
 * has been removed (or added by hand), it is never added again automatically.
 */
export async function autoSeedDemoLearning(prisma: PrismaClient): Promise<string> {
  const tenant = await prisma.tenant.findUnique({ where: { slug: 'greenfield' }, select: { id: true } });
  if (!tenant) return '';
  const onceKey = `demo-learning-auto:${tenant.id}`;
  if (await prisma.platformSetting.findUnique({ where: { key: onceKey } })) return '';
  await prisma.platformSetting.create({ data: { key: onceKey, value: { at: new Date().toISOString() } } });
  if (await prisma.platformSetting.findUnique({ where: { key: `demo-learning-seed:${tenant.id}` } })) return '';
  const r = await seedDemoLearning(prisma, 'greenfield');
  return 'added' in r && r.added ? `Demo learning data: ${r.added.records} topic records, ${r.added.evidence} pieces of evidence` : '';
}
