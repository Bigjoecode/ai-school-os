import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { syllabusSaveSchema } from '@aischool/shared';
import type { Prisma, PrismaClient } from '../generated/prisma/client';
import { subjectKey } from '../learning/mastery.service';

/**
 * Official exam syllabi (WAEC, BECE, JAMB, NECO) shipped with the app as
 * structured JSON under prisma/syllabi/<exam>/*.json, installed into the
 * topic graph at start-up. Each file is applied once per version (its hash
 * is remembered in platform_settings), and merges rather than overwrites:
 * existing topics gain the exam and any new objectives, so console edits stay.
 */

interface SyllabusFile {
  exam: string;
  subject: string;
  level: string;
  examFormat?: string;
  excluded?: string;
  recommendedTexts?: string[];
  topics: { name: string; objectives?: string[]; content?: string | null; subtopics?: { name: string; objectives?: string[] }[] }[];
}

function syllabiDir(): string | undefined {
  return [
    process.env.SYLLABI_DIR,
    resolve(__dirname, 'prisma/syllabi'), // bundled deploy: main.js at app root
    resolve(__dirname, '../../prisma/syllabi'), // dist/prisma/syllabus-install.js in the repo
    resolve(__dirname, '../prisma/syllabi'),
  ].find((p): p is string => !!p && existsSync(p));
}

export async function installSyllabi(prisma: PrismaClient): Promise<string> {
  const dir = syllabiDir();
  if (!dir) return '';
  const merged = await mergeDuplicateTopics(prisma);
  let subjects = 0;
  let created = 0;
  let updated = 0;
  const failed: string[] = [];
  for (const exam of readdirSync(dir)) {
    const examDir = join(dir, exam);
    let files: string[];
    try {
      files = readdirSync(examDir).filter((f) => f.endsWith('.json'));
    } catch {
      continue;
    }
    for (const file of files) {
      const raw = readFileSync(join(examDir, file), 'utf8');
      const hash = createHash('sha256').update(raw).digest('hex').slice(0, 16);
      const key = `syllabus-file:${exam}/${file}`;
      const seen = await prisma.platformSetting.findUnique({ where: { key } });
      if ((seen?.value as { hash?: string } | null)?.hash === hash) continue;
      try {
        const data = JSON.parse(raw) as SyllabusFile;
        const parsed = syllabusSaveSchema.parse({ exam: data.exam, subject: data.subject, level: data.level, topics: data.topics });
        const r = await applySyllabus(prisma, parsed);
        created += r.created;
        updated += r.updated;
        subjects++;
        const meta = { hash, subject: subjectKey(parsed.subject), exam: parsed.exam, examFormat: data.examFormat ?? null, excluded: data.excluded ?? null, recommendedTexts: (data.recommendedTexts ?? []).slice(0, 80), topics: parsed.topics.length, installedAt: new Date().toISOString() };
        await prisma.platformSetting.upsert({ where: { key }, update: { value: meta as unknown as Prisma.InputJsonValue }, create: { key, value: meta as unknown as Prisma.InputJsonValue } });
      } catch (err) {
        failed.push(`${exam}/${file}: ${(err as Error).message.slice(0, 160)}`);
      }
    }
  }
  if (failed.length) throw new Error(`Syllabus files failed: ${failed.join(' | ')}`);
  const parts = [subjects ? `${subjects} syllabus subject(s): ${created} topics added, ${updated} updated` : '', merged ? `${merged} duplicate topic(s) merged` : ''].filter(Boolean);
  return parts.join('; ');
}

/** Same merge rules as the console's syllabus import. */
async function applySyllabus(prisma: PrismaClient, input: ReturnType<typeof syllabusSaveSchema.parse>) {
  const subject = subjectKey(input.subject);
  let created = 0;
  let updated = 0;
  const uniq = (xs: string[]) => {
    const seen = new Set<string>();
    return xs.map((x) => x.trim()).filter((x) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()));
  };
  const upsert = async (name: string, objectives: string[], content: string | null, parentId: string | null, order: number) => {
    // Case-insensitive: WAEC and JAMB capitalise the same topic differently ("Number Bases" / "Number bases").
    const existing =
      (await prisma.syllabusTopic.findUnique({ where: { subject_level_name: { subject, level: input.level, name } } })) ??
      (await prisma.syllabusTopic.findFirst({ where: { subject, level: input.level, name: { equals: name, mode: 'insensitive' } }, orderBy: { id: 'asc' } }));
    if (existing) {
      updated++;
      return prisma.syllabusTopic.update({
        where: { id: existing.id },
        data: {
          exams: uniq([...existing.exams, input.exam]),
          objectives: uniq([...existing.objectives, ...objectives]).slice(0, 60),
          content: existing.content ?? content,
          ...(parentId && !existing.parentId ? { parentId } : {}),
        },
      });
    }
    created++;
    return prisma.syllabusTopic.create({ data: { subject, level: input.level, name, parentId, order, exams: [input.exam], objectives, content } });
  };
  for (const [i, t] of input.topics.entries()) {
    const topic = await upsert(t.name, t.objectives, t.content ?? null, null, (i + 1) * 10);
    for (const [j, s] of t.subtopics.entries()) {
      if (s.name.toLowerCase() === t.name.toLowerCase()) continue;
      await upsert(s.name, s.objectives, null, topic.id, (i + 1) * 10 + j + 1);
    }
  }
  return { created, updated };
}

/**
 * Merges topics that differ only in capitalisation (same subject and level),
 * keeping one and moving everything that points at the others onto it:
 * sub-topics, exam questions, homework, practice attempts, mastery evidence
 * and mastery records (a student with progress on both gets one combined
 * record). Safe to run at every start-up: does nothing when there are none.
 */
export async function mergeDuplicateTopics(prisma: PrismaClient): Promise<number> {
  const groups = await prisma.$queryRaw<{ ids: string[] }[]>`
    SELECT array_agg(id ORDER BY ("parentId" IS NOT NULL), id) AS ids
    FROM syllabus_topics GROUP BY subject, level, lower(name) HAVING count(*) > 1`;
  let merged = 0;
  for (const g of groups) {
    const [keepId, ...dupIds] = g.ids;
    if (!keepId || !dupIds.length) continue;
    await prisma.$transaction(async (tx) => {
      const all = await tx.syllabusTopic.findMany({ where: { id: { in: [keepId, ...dupIds] } } });
      const keep = all.find((t) => t.id === keepId)!;
      const uniq = (xs: string[]) => {
        const seen = new Set<string>();
        return xs.map((x) => x.trim()).filter((x) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()));
      };
      await tx.syllabusTopic.update({
        where: { id: keepId },
        data: {
          exams: uniq(all.flatMap((t) => t.exams)),
          objectives: uniq(all.flatMap((t) => t.objectives)).slice(0, 60),
          content: keep.content ?? all.find((t) => t.content)?.content ?? null,
          parentId: keep.parentId ?? all.find((t) => t.parentId && !dupIds.includes(t.parentId) && t.parentId !== keepId)?.parentId ?? null,
        },
      });
      await tx.syllabusTopic.updateMany({ where: { parentId: { in: dupIds } }, data: { parentId: keepId } });
      await tx.examQuestion.updateMany({ where: { topicId: { in: dupIds } }, data: { topicId: keepId } });
      await tx.homework.updateMany({ where: { topicId: { in: dupIds } }, data: { topicId: keepId } });
      await tx.practiceAttempt.updateMany({ where: { topicId: { in: dupIds } }, data: { topicId: keepId } });
      await tx.masteryEvidence.updateMany({ where: { topicId: { in: dupIds } }, data: { topicId: keepId } });
      const recs = await tx.masteryRecord.findMany({ where: { topicId: { in: [keepId, ...dupIds] } } });
      const byStudent = new Map<string, typeof recs>();
      for (const r of recs) byStudent.set(r.studentId, [...(byStudent.get(r.studentId) ?? []), r]);
      for (const rs of byStudent.values()) {
        const target = rs.find((r) => r.topicId === keepId);
        if (rs.length === 1 && target) continue;
        const attempts = rs.reduce((n, r) => n + r.attempts, 0);
        const correct = rs.reduce((n, r) => n + r.correct, 0);
        const last = rs.map((r) => r.lastEvidenceAt).filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
        const score = Math.round((100 * (correct + 0.5)) / (attempts + 1));
        const confidence = Math.min(0.95, Math.round((1 - 1 / Math.sqrt(attempts + 1)) * 100) / 100);
        await tx.masteryRecord.deleteMany({ where: { id: { in: rs.map((r) => r.id) } } });
        await tx.masteryRecord.create({ data: { tenantId: rs[0]!.tenantId, studentId: rs[0]!.studentId, topicId: keepId, attempts, correct, score, confidence, lastEvidenceAt: last } });
      }
      await tx.syllabusTopic.deleteMany({ where: { id: { in: dupIds } } });
    }, { timeout: 60_000 });
    merged += dupIds.length;
  }
  return merged;
}

