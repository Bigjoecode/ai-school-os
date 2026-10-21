import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Prisma, PrismaClient } from '../generated/prisma/client';
import { subjectKey } from '../learning/mastery.service';

/**
 * Practice questions shipped with the app under prisma/question-bank/<exam>/*.json
 * (original questions written for the Exam Academy), installed at start-up as
 * DRAFTS for the console review queue: students only see a question once a
 * reviewer publishes it. Each file is applied once per version (its hash is kept
 * in platform_settings). Questions are matched by their stable bank id, so a new
 * version updates drafts in place and never touches a question a reviewer has
 * already published, edited or retired.
 */

interface BankFile {
  exam: string;
  subject: string;
  /** AUTHORED (written for the app) or LICENSED (official past questions used with permission). */
  source?: string;
  questions: { id: string; topic: string; stem: string; options?: string[]; answer?: number; explanation?: string; difficulty?: string; year?: number | null; type?: 'OBJECTIVE' | 'THEORY'; marks?: number; markingGuide?: string }[];
}

const SOURCES = new Set(['AUTHORED', 'LICENSED']);

const DIFFICULTIES = new Set(['EASY', 'MEDIUM', 'HARD']);

function bankDir(): string | undefined {
  return [
    process.env.QUESTION_BANK_DIR,
    resolve(__dirname, 'prisma/question-bank'), // bundled deploy: main.js at app root
    resolve(__dirname, '../../prisma/question-bank'),
    resolve(__dirname, '../prisma/question-bank'),
  ].find((p): p is string => !!p && existsSync(p));
}

export async function installQuestionBank(prisma: PrismaClient): Promise<string> {
  const dir = bankDir();
  if (!dir) return '';
  let files = 0;
  let created = 0;
  let updated = 0;
  let kept = 0;
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
      const key = `question-bank:${exam}/${file}`;
      const seen = await prisma.platformSetting.findUnique({ where: { key } });
      if ((seen?.value as { hash?: string } | null)?.hash === hash) continue;
      try {
        const data = JSON.parse(raw) as BankFile;
        const subject = subjectKey(data.subject);
        const examCode = data.exam.toUpperCase();
        const level = examCode === 'BECE' ? 'JUNIOR' : 'SENIOR';
        const topics = await prisma.syllabusTopic.findMany({ where: { subject, level }, select: { id: true, name: true } });
        const topicId = new Map(topics.map((t) => [t.name.toLowerCase(), t.id]));
        for (const q of data.questions) {
          const theory = q.type === 'THEORY';
          if (!q.id || !q.stem) continue;
          if (theory ? !q.markingGuide : !Array.isArray(q.options) || q.options.length < 2 || q.answer === undefined || q.answer < 0 || q.answer >= q.options.length) continue;
          const content = {
            exam: examCode,
            type: theory ? 'THEORY' : 'OBJECTIVE',
            marks: theory ? Math.max(1, Math.min(100, Math.round(q.marks ?? 10))) : 1,
            markingGuide: theory ? q.markingGuide!.trim() : null,
            subject,
            topicId: topicId.get(q.topic.trim().toLowerCase()) ?? null,
            stem: q.stem.trim(),
            options: (theory ? [] : q.options!) as unknown as Prisma.InputJsonValue,
            answer: theory ? 0 : q.answer!,
            explanation: q.explanation?.trim() || null,
            difficulty: DIFFICULTIES.has(q.difficulty ?? '') ? q.difficulty! : 'MEDIUM',
            year: typeof q.year === 'number' && q.year >= 1978 && q.year <= 2100 ? q.year : null,
          };
          const existing = await prisma.examQuestion.findUnique({ where: { bankRef: q.id }, select: { id: true, status: true, reviewedAt: true } });
          if (!existing) {
            await prisma.examQuestion.create({ data: { ...content, bankRef: q.id, source: SOURCES.has(data.source ?? '') ? data.source! : 'AUTHORED', status: 'DRAFT' } });
            created++;
          } else if (existing.status === 'DRAFT' && !existing.reviewedAt) {
            await prisma.examQuestion.update({ where: { id: existing.id }, data: content });
            updated++;
          } else {
            kept++;
          }
        }
        files++;
        await prisma.platformSetting.upsert({
          where: { key },
          update: { value: { hash, subject, questions: data.questions.length, installedAt: new Date().toISOString() } },
          create: { key, value: { hash, subject, questions: data.questions.length, installedAt: new Date().toISOString() } },
        });
      } catch (err) {
        failed.push(`${exam}/${file}: ${(err as Error).message.slice(0, 160)}`);
      }
    }
  }
  if (failed.length) throw new Error(`Question bank files failed: ${failed.join(' | ')}`);
  return files ? `Question bank: ${files} file(s), ${created} new draft(s), ${updated} draft(s) updated, ${kept} reviewed question(s) left as they are` : '';
}
