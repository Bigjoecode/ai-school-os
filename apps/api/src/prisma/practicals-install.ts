import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PRACTICAL_KINDS, PRACTICAL_SKILLS, type PracticalContent, type PracticalFile } from '@aischool/shared';
import type { Prisma, PrismaClient } from '../generated/prisma/client';
import { subjectKey } from '../learning/mastery.service';

/**
 * Practical Academy lessons shipped with the app under
 * prisma/practicals/<exam>/<slug>.json, installed at start-up into
 * practical_lessons. Each file is applied once per version (its hash is kept in
 * platform_settings); a file whose lessons didn't all find their syllabus topic
 * is tried again on the next start (the syllabus may have been installed since).
 * Lessons are matched by their stable id; lessons dropped from a file are removed.
 */

function practicalsDir(): string | undefined {
  return [
    process.env.PRACTICALS_DIR,
    resolve(__dirname, 'prisma/practicals'), // bundled deploy: main.js at app root
    resolve(__dirname, '../../prisma/practicals'),
    resolve(__dirname, '../prisma/practicals'),
  ].find((p): p is string => !!p && existsSync(p));
}

const KINDS = new Set<string>(PRACTICAL_KINDS);
const SKILLS = new Set<string>(PRACTICAL_SKILLS);
const strings = (xs: unknown, max = 60): string[] => (Array.isArray(xs) ? xs.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim()).slice(0, max) : []);
const text = (x: unknown) => (typeof x === 'string' ? x.trim() : '');
/** Topic names compared loosely: case, punctuation and "and"/"&" don't matter. */
export const looseTopic = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** A lesson as stored (only the known fields, cleaned). Null when it lacks an id, title or topic. */
export function cleanPractical(p: Partial<PracticalContent>): PracticalContent | null {
  const id = text(p.id);
  const title = text(p.title);
  const topic = text(p.topic);
  if (!id || !title || !topic || id.length > 120) return null;
  const checks = (Array.isArray(p.checkQuestions) ? p.checkQuestions : [])
    .filter((c) => c && typeof c.q === 'string' && Array.isArray(c.options) && c.options.length >= 2 && Number.isInteger(c.answer) && c.answer >= 0 && c.answer < c.options.length)
    .slice(0, 10)
    .map((c) => ({ q: c.q.trim(), options: strings(c.options, 6), answer: c.answer, explanation: text(c.explanation) }));
  return {
    id,
    title,
    topic,
    kind: KINDS.has(p.kind ?? '') ? p.kind! : 'LAB',
    skills: strings(p.skills, 8).filter((s) => SKILLS.has(s)) as PracticalContent['skills'],
    aim: text(p.aim),
    apparatus: strings(p.apparatus),
    materials: strings(p.materials),
    safety: strings(p.safety),
    procedure: strings(p.procedure, 80),
    expectedObservations: text(p.expectedObservations),
    dataAndCalculations: text(p.dataAndCalculations),
    precautions: strings(p.precautions),
    sourcesOfError: strings(p.sourcesOfError),
    commonMistakes: strings(p.commonMistakes),
    examTips: strings(p.examTips),
    checkQuestions: checks,
    // Kept as written: a lab built later (a new SimulatorId) lights up without reinstalling; the app only offers known ids.
    simulator: typeof p.simulator === 'string' && /^[a-z0-9-]{3,40}$/.test(p.simulator) ? (p.simulator as PracticalContent['simulator']) : null,
  };
}

export async function installPracticals(prisma: PrismaClient): Promise<string> {
  const dir = practicalsDir();
  if (!dir) return '';
  let files = 0;
  let lessons = 0;
  let removed = 0;
  let unmatched = 0;
  const failed: string[] = [];
  for (const exam of readdirSync(dir)) {
    let names: string[];
    try {
      names = readdirSync(join(dir, exam)).filter((f) => f.endsWith('.json'));
    } catch {
      continue;
    }
    for (const file of names) {
      const raw = readFileSync(join(dir, exam, file), 'utf8');
      const hash = createHash('sha256').update(raw).digest('hex').slice(0, 16);
      const key = `practicals:${exam}/${file}`;
      const source = `${exam}/${file}`;
      const seen = (await prisma.platformSetting.findUnique({ where: { key } }))?.value as { hash?: string; unmatched?: number } | null;
      if (seen?.hash === hash && !seen.unmatched) continue;
      try {
        const data = JSON.parse(raw) as PracticalFile;
        if (!data.subject || !Array.isArray(data.practicals)) throw new Error('needs "subject" and "practicals"');
        const subject = subjectKey(data.subject);
        const examCode = (data.exam || exam).toUpperCase();
        const level = examCode === 'BECE' ? 'JUNIOR' : 'SENIOR';
        const topics = await prisma.syllabusTopic.findMany({ where: { subject, level }, select: { id: true, name: true, exams: true } });
        // The exam's own topics win over a same-named topic from another syllabus at the level.
        const ranked = [...topics].sort((a, b) => Number(b.exams.includes(examCode)) - Number(a.exams.includes(examCode)));
        const exact = new Map<string, string>();
        const loose = new Map<string, string>();
        for (const t of ranked.reverse()) {
          exact.set(t.name.toLowerCase(), t.id);
          loose.set(looseTopic(t.name), t.id);
        }
        const kept: string[] = [];
        let misses = 0;
        let order = 0;
        for (const rawLesson of data.practicals) {
          const p = cleanPractical(rawLesson);
          if (!p) continue;
          const topicId = exact.get(p.topic.toLowerCase()) ?? loose.get(looseTopic(p.topic)) ?? null;
          if (!topicId) misses++;
          const row = {
            exam: examCode,
            subject,
            topicId,
            topicName: p.topic,
            title: p.title,
            kind: p.kind,
            simulator: p.simulator,
            order: order++,
            data: { ...p, practicalPaper: text(data.practicalPaper) } as unknown as Prisma.InputJsonValue,
            file: source,
          };
          await prisma.practicalLesson.upsert({ where: { id: p.id }, update: row, create: { id: p.id, ...row } });
          kept.push(p.id);
        }
        removed += (await prisma.practicalLesson.deleteMany({ where: { file: source, id: { notIn: kept } } })).count;
        files++;
        lessons += kept.length;
        unmatched += misses;
        const value = { hash, subject, practicals: kept.length, unmatched: misses, installedAt: new Date().toISOString() };
        await prisma.platformSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
      } catch (err) {
        failed.push(`${source}: ${(err as Error).message.slice(0, 160)}`);
      }
    }
  }
  if (failed.length) throw new Error(`Practical files failed: ${failed.join(' | ')}`);
  return files ? `Practicals: ${files} file(s), ${lessons} lesson(s)${removed ? `, ${removed} removed` : ''}${unmatched ? `, ${unmatched} without a matching syllabus topic` : ''}` : '';
}
