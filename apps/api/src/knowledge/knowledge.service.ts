import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { KbAnswer, KbAudience, KbDocumentRow } from '@aischool/shared';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { AuditService } from '../audit/audit.service';
import { fullName } from '../common/format';
import { RequestContextStore, currentContext, currentTenantId } from '../common/request-context';
import { FilesService } from '../files/files.service';
import { PrismaService } from '../prisma/prisma.service';
import { chunk, extractText } from './extract';

/** Who may read which documents. */
export const AUDIENCES_FOR: Record<'PUBLIC' | 'FAMILY' | 'STAFF', KbAudience[]> = {
  PUBLIC: ['PUBLIC'],
  FAMILY: ['PUBLIC', 'PARENTS'],
  STAFF: ['PUBLIC', 'PARENTS', 'STAFF'],
};

export interface KbHit {
  documentId: string;
  title: string;
  heading: string | null;
  text: string;
  rank: number;
}

/**
 * The school's knowledge base: handbooks, fee policies, calendars. Documents
 * are split into passages and searched with PostgreSQL full-text search
 * inside the school only (no vectors to host, no data leaving the database);
 * the AI answers from the passages found and cites them.
 */
@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
    private readonly gateway: AiGatewayService,
    private readonly audit: AuditService,
  ) {}

  /** Staff see staff documents; parents and students see family ones. */
  audienceOfCaller(): 'FAMILY' | 'STAFF' {
    const p = currentContext().permissions;
    return p.has('students.read') || p.has('staff.read') || p.has('school.manage') ? 'STAFF' : 'FAMILY';
  }

  row(d: { id: string; title: string; audience: string; filename: string | null; status: string; error: string | null; chars: number; createdAt: Date; updatedAt: Date; _count?: { chunks: number }; uploadedById: string | null }, names: Map<string, string>): KbDocumentRow {
    return {
      id: d.id,
      title: d.title,
      audience: d.audience as KbAudience,
      filename: d.filename,
      status: d.status as KbDocumentRow['status'],
      error: d.error,
      chunks: d._count?.chunks ?? 0,
      chars: d.chars,
      uploadedBy: d.uploadedById ? (names.get(d.uploadedById) ?? null) : null,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    };
  }

  async list(): Promise<KbDocumentRow[]> {
    const rows = await this.prisma.db.kbDocument.findMany({ include: { _count: { select: { chunks: true } } }, orderBy: { updatedAt: 'desc' } });
    const users = await this.prisma.root.user.findMany({ where: { id: { in: rows.map((r) => r.uploadedById).filter((x): x is string => !!x) } }, select: { id: true, firstName: true, lastName: true } });
    const names = new Map(users.map((u) => [u.id, fullName(u)]));
    return rows.map((r) => this.row(r, names));
  }

  async create(input: { title: string; audience: KbAudience; fileId?: string | null; text?: string | null }) {
    if (!input.fileId && !input.text) throw new BadRequestException('Upload a document or paste its text');
    let filename: string | null = null;
    if (input.fileId) {
      const f = await this.prisma.db.fileObject.findUnique({ where: { id: input.fileId } });
      if (!f) throw new BadRequestException('Upload the document first');
      filename = f.filename;
    }
    const doc = await this.prisma.db.kbDocument.create({
      data: { tenantId: currentTenantId(), title: input.title, audience: input.audience, fileId: input.fileId ?? null, filename, uploadedById: currentContext().userId, status: 'PROCESSING' },
    });
    await this.audit.log({ action: 'knowledge.document_added', entityType: 'KbDocument', entityId: doc.id, summary: `Added "${doc.title}" to the knowledge base` });
    // Read in the background; the list shows PROCESSING until it's ready.
    const tenantId = doc.tenantId;
    const ctx = { ...currentContext(), permissions: new Set(currentContext().permissions) };
    setImmediate(() => void RequestContextStore.run({ ...ctx, tenantId }, () => this.process(doc.id, input.text ?? null)));
    return doc;
  }

  async process(id: string, pasted: string | null) {
    const doc = await this.prisma.root.kbDocument.findUniqueOrThrow({ where: { id } });
    try {
      let text = pasted;
      if (!text) {
        const f = await this.files.read(doc.fileId!, false);
        text = await extractText(f.data, f.mimeType);
      }
      text = text.replace(/\u0000/g, '').trim();
      if (text.length < 40) throw new Error('No readable text found. If this is a scanned document, paste its text instead.');
      const parts = chunk(text);
      await this.prisma.root.$transaction([
        this.prisma.root.kbChunk.deleteMany({ where: { documentId: id } }),
        this.prisma.root.kbChunk.createMany({ data: parts.map((p, i) => ({ tenantId: doc.tenantId, documentId: id, idx: i, heading: p.heading, text: p.text })) }),
        this.prisma.root.kbDocument.update({ where: { id }, data: { status: 'READY', error: null, chars: text.length } }),
      ]);
    } catch (err) {
      this.logger.warn(`Knowledge document ${id}: ${(err as Error).message}`);
      await this.prisma.root.kbDocument.update({ where: { id }, data: { status: 'FAILED', error: (err as Error).message.slice(0, 300) } });
    }
  }

  async reprocess(id: string) {
    const d = await this.prisma.db.kbDocument.findUnique({ where: { id } });
    if (!d) throw new NotFoundException('Document not found');
    if (!d.fileId) throw new BadRequestException('Pasted documents are already processed; edit by adding a new version');
    await this.prisma.db.kbDocument.update({ where: { id }, data: { status: 'PROCESSING', error: null } });
    const ctx = { ...currentContext(), permissions: new Set(currentContext().permissions) };
    setImmediate(() => void RequestContextStore.run({ ...ctx, tenantId: d.tenantId }, () => this.process(id, null)));
    return { ok: true };
  }

  async update(id: string, change: { title?: string; audience?: KbAudience }) {
    await this.prisma.db.kbDocument.update({ where: { id }, data: change });
    return { ok: true };
  }

  async remove(id: string) {
    const d = await this.prisma.db.kbDocument.findUnique({ where: { id } });
    if (!d) throw new NotFoundException('Document not found');
    await this.prisma.db.kbDocument.delete({ where: { id } });
    await this.audit.log({ action: 'knowledge.document_removed', entityType: 'KbDocument', entityId: id, summary: `Removed "${d.title}" from the knowledge base` });
  }

  /** Full-text search inside one school, limited to what the reader may see. */
  async search(tenantId: string, query: string, audiences: KbAudience[], limit = 5): Promise<KbHit[]> {
    const q = query.replace(/[^\p{L}\p{N}\s'-]/gu, ' ').trim().slice(0, 300);
    if (!q) return [];
    // websearch_to_tsquery ANDs the words; fall back to OR-ing them so a long question still finds passages.
    const orQuery = q.split(/\s+/).filter((w) => w.length > 2).join(' OR ');
    const hits = await this.prisma.root.$queryRaw<KbHit[]>`
      SELECT c."documentId", d."title", c."heading", c."text",
             ts_rank_cd(to_tsvector('english', coalesce(c."heading", '') || ' ' || c."text"), websearch_to_tsquery('english', ${q})) AS rank
      FROM "kb_chunks" c JOIN "kb_documents" d ON d."id" = c."documentId"
      WHERE c."tenantId" = ${tenantId} AND d."status" = 'READY' AND d."audience" = ANY(${audiences}::text[])
        AND to_tsvector('english', coalesce(c."heading", '') || ' ' || c."text") @@ websearch_to_tsquery('english', ${q})
      ORDER BY rank DESC LIMIT ${limit}`;
    if (hits.length || !orQuery) return hits;
    return this.prisma.root.$queryRaw<KbHit[]>`
      SELECT c."documentId", d."title", c."heading", c."text",
             ts_rank_cd(to_tsvector('english', coalesce(c."heading", '') || ' ' || c."text"), websearch_to_tsquery('english', ${orQuery})) AS rank
      FROM "kb_chunks" c JOIN "kb_documents" d ON d."id" = c."documentId"
      WHERE c."tenantId" = ${tenantId} AND d."status" = 'READY' AND d."audience" = ANY(${audiences}::text[])
        AND to_tsvector('english', coalesce(c."heading", '') || ' ' || c."text") @@ websearch_to_tsquery('english', ${orQuery})
      ORDER BY rank DESC LIMIT ${limit}`;
  }

  /** Passages formatted for a prompt, numbered for citation. */
  static asContext(hits: KbHit[]) {
    return hits.map((h, i) => `[${i + 1}] ${h.title}${h.heading ? ` — ${h.heading}` : ''}\n${h.text}`).join('\n\n');
  }

  async ask(question: string): Promise<KbAnswer> {
    const tenantId = currentTenantId();
    const hits = await this.search(tenantId, question, AUDIENCES_FOR[this.audienceOfCaller()], 5);
    const sources = hits.map((h) => ({ documentId: h.documentId, title: h.title, excerpt: h.text.slice(0, 280) }));
    if (!hits.length) return { answer: "I couldn't find that in the school's documents. Please contact the school office.", sources: [], provider: null, model: null };
    const school = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true } });
    const r = await this.gateway.generate(
      {
        tier: 'standard',
        system: `You answer questions about ${school.name} using ONLY the numbered passages from the school's own documents. Cite passages like [1]. If the passages don't contain the answer, say so and suggest contacting the school office. Be brief (under 120 words), British English.`,
        messages: [{ role: 'user', content: `PASSAGES\n${KnowledgeService.asContext(hits)}\n\nQUESTION: ${question}` }],
        maxOutputTokens: 500,
      },
      'knowledge-answer',
    );
    return { answer: r.text.trim(), sources, provider: r.provider, model: r.model };
  }
}
