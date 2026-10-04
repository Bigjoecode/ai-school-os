import { BadRequestException, Injectable } from '@nestjs/common';
import { EXAM_LABELS, type ExamBody, type SyllabusImportPreview } from '@aischool/shared';
import { z } from 'zod';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { AuditService } from '../audit/audit.service';
import { extractText } from '../knowledge/extract';
import { PrismaService } from '../prisma/prisma.service';
import { subjectKey } from './mastery.service';

/** Characters of syllabus text per AI request; long syllabi are read in parts and merged. */
const PART = 24_000;
const MAX_PARTS = 12;

const aiSyllabusSchema = z.object({
  topics: z.array(
    z.object({
      name: z.string().describe('The topic heading as printed, without numbering'),
      objectives: z.array(z.string()).describe('What candidates should be able to do, as listed'),
      content: z.string().describe('The content/notes column for the topic, condensed; empty if none'),
      subtopics: z.array(z.object({ name: z.string(), objectives: z.array(z.string()) })),
    }),
  ),
});
type AiTopic = z.infer<typeof aiSyllabusSchema>['topics'][number];

/**
 * Exam syllabi (WAEC, NECO, JAMB, BECE) into the topic graph that Exam
 * Academy, mastery and question drafting run on. Preview first, then save:
 * nothing reaches students until the console approves it.
 */
@Injectable()
export class SyllabusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: AiGatewayService,
    private readonly audit: AuditService,
  ) {}

  /** Text from an uploaded syllabus (PDF, Word or text). */
  async extract(file: { buffer: Buffer; originalname: string; mimetype: string } | undefined) {
    if (!file) throw new BadRequestException('Choose a file');
    const mime = /\.docx$/i.test(file.originalname) ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : /\.pdf$/i.test(file.originalname) ? 'application/pdf' : file.mimetype;
    let text: string;
    try {
      text = (await extractText(file.buffer, mime)).replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    if (text.length < 200) throw new BadRequestException('Almost no text could be read; this looks like a scan. Find a text PDF of the syllabus, or paste the text.');
    return { text, chars: text.length, filename: file.originalname };
  }

  async preview(input: { exam: ExamBody; subject: string; text?: string | null }): Promise<SyllabusImportPreview> {
    const text = input.text?.trim();
    if (!text || text.length < 200) throw new BadRequestException('Paste or upload the syllabus text first');
    const subject = subjectKey(input.subject);
    const parts = split(text).slice(0, MAX_PARTS);
    const merged = new Map<string, AiTopic>();
    let provider = '';
    let model = '';
    for (const [i, part] of parts.entries()) {
      const r = await this.gateway.generateJson(
        {
          tier: 'advanced',
          system: [
            `You turn the official ${EXAM_LABELS[input.exam]} syllabus for ${subject} into a clean topic list for an exam-prep app.`,
            'Copy topics, subtopics and objectives from the text in their order, close to their wording. Never add topics the text does not contain.',
            'Skip the preamble, aims, scheme of examination, reading lists and notes for examiners: only teachable topics.',
            parts.length > 1 ? `This is part ${i + 1} of ${parts.length} of the syllabus; a topic may continue from the previous part — repeat its name exactly.` : '',
          ].filter(Boolean).join('\n'),
          messages: [{ role: 'user', content: part }],
          maxOutputTokens: 12_000,
        },
        aiSyllabusSchema,
        'syllabus-import',
      );
      provider = r.provider;
      model = r.model;
      for (const t of r.data.topics) {
        const name = t.name.replace(/^[\s\d.()ivx]+\s/i, '').trim().slice(0, 120);
        if (name.length < 2) continue;
        const key = name.toLowerCase();
        const had = merged.get(key);
        merged.set(key, had ? { ...had, objectives: uniq([...had.objectives, ...t.objectives]), content: [had.content, t.content].filter(Boolean).join(' '), subtopics: [...had.subtopics, ...t.subtopics] } : { ...t, name });
      }
    }
    if (!merged.size) throw new BadRequestException('No topics were found. Check this is the syllabus for the subject.');
    return {
      exam: input.exam,
      subject,
      level: input.exam === 'BECE' ? 'JUNIOR' : 'SENIOR',
      topics: [...merged.values()].slice(0, 200).map((t) => ({
        name: t.name,
        objectives: uniq(t.objectives).slice(0, 40),
        content: t.content.trim().slice(0, 3000) || null,
        subtopics: dedupe(t.subtopics).slice(0, 40).map((s) => ({ name: s.name.trim().slice(0, 120), objectives: uniq(s.objectives).slice(0, 40) })).filter((s) => s.name.length >= 2),
      })),
      provider,
      model,
    };
  }

  /**
   * Saves approved topics. Existing topics (same subject, level and name) are
   * kept and gain this exam and any new objectives, so WAEC, NECO and JAMB
   * share one graph and a student's mastery carries across them.
   */
  async save(input: { exam: ExamBody; subject: string; level: string; topics: { name: string; objectives: string[]; content: string | null; subtopics: { name: string; objectives: string[] }[] }[] }, userId: string) {
    const subject = subjectKey(input.subject);
    const db = this.prisma.root;
    let created = 0;
    let updated = 0;
    const upsert = async (name: string, objectives: string[], content: string | null, parentId: string | null, order: number) => {
      const existing = await db.syllabusTopic.findUnique({ where: { subject_level_name: { subject, level: input.level, name } } });
      if (existing) {
        updated++;
        return db.syllabusTopic.update({
          where: { id: existing.id },
          data: { exams: uniq([...existing.exams, input.exam]), objectives: uniq([...existing.objectives, ...objectives]).slice(0, 60), content: existing.content ?? content, ...(parentId && !existing.parentId ? { parentId } : {}) },
        });
      }
      created++;
      return db.syllabusTopic.create({ data: { subject, level: input.level, name, parentId, order, exams: [input.exam], objectives, content } });
    };
    for (const [i, t] of input.topics.entries()) {
      const topic = await upsert(t.name, t.objectives, t.content, null, (i + 1) * 10);
      for (const [j, s] of t.subtopics.entries()) {
        if (s.name.toLowerCase() === t.name.toLowerCase()) continue;
        await upsert(s.name, s.objectives, null, topic.id, (i + 1) * 10 + j + 1);
      }
    }
    await this.audit.log({ action: 'syllabus.imported', entityType: 'SyllabusTopic', entityId: `${input.exam}:${subject}`, tenantId: null, actorUserId: userId, summary: `Imported the ${EXAM_LABELS[input.exam]} ${subject} syllabus: ${created} new topics, ${updated} updated` });
    return { created, updated };
  }
}

function uniq(xs: string[]) {
  const seen = new Set<string>();
  return xs.map((x) => x.trim()).filter((x) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()));
}

function dedupe<T extends { name: string }>(xs: T[]): T[] {
  const seen = new Set<string>();
  return xs.filter((x) => !seen.has(x.name.trim().toLowerCase()) && seen.add(x.name.trim().toLowerCase()));
}

/** Splits on paragraph breaks into parts of about PART characters. */
function split(text: string): string[] {
  const parts: string[] = [];
  let buf = '';
  for (const p of text.split(/\n\s*\n/)) {
    if (buf.length + p.length > PART && buf) {
      parts.push(buf);
      buf = '';
    }
    buf += (buf ? '\n\n' : '') + p.slice(0, PART);
  }
  if (buf.trim()) parts.push(buf);
  return parts;
}
