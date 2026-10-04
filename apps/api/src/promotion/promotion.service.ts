import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  DEFAULT_PROMOTION_PASS_MARK,
  emptyPromotionCounts,
  promotionSettingsSchema,
  round1,
  type NewSessionResult,
  type PromotionApplied,
  type PromotionApplyResult,
  type PromotionArmRef,
  type PromotionClass,
  type PromotionCounts,
  type PromotionDecision,
  type PromotionDecisionInput,
  type PromotionLevel,
  type PromotionReport,
  type PromotionReportLevel,
  type PromotionRow,
  type PromotionSessionRef,
  type PromotionSettings,
  type PromotionSheet,
  type PromotionUndoResult,
  type StudentPromotionHistoryItem,
  type SuggestedSession,
  newSessionSchema,
  applyPromotionSchema,
} from '@aischool/shared';
import type { z } from 'zod';
import type { Prisma } from '../generated/prisma/client';
import { ResultsService } from '../assessment/results.service';
import { forgetGraduates, graduationYearOf, recordGraduates } from '../alumni/graduates';
import { AuditService } from '../audit/audit.service';
import { dateOnly, fullName, parseDate } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { FinanceService } from '../finance/finance.service';
import { PrismaService, type ScopedPrisma } from '../prisma/prisma.service';

type Tx = Parameters<Parameters<ScopedPrisma['$transaction']>[0]>[0];
type NewSession = z.infer<typeof newSessionSchema>;
type ApplyInput = z.infer<typeof applyPromotionSchema>;

interface Draft {
  savedAt: string;
  decisions: Record<string, { decision: PromotionDecision; targetArmId: string | null; note: string | null }>;
}

/** Promotion settings and drafts live in platform_settings, keyed by school (no schema change needed). */
const settingsKey = (tenantId: string) => `promotion:${tenantId}`;
const draftKey = (tenantId: string, sessionId: string) => `promotion-draft:${tenantId}:${sessionId}`;

const LEAVES: PromotionDecision[] = ['GRADUATED', 'WITHDRAWN'];
const LEAVE_STATUSES = ['GRADUATED', 'WITHDRAWN'] as const;

@Injectable()
export class PromotionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly results: ResultsService,
    private readonly finance: FinanceService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------ settings

  async getSettings(): Promise<PromotionSettings> {
    const row = await this.prisma.root.platformSetting.findUnique({ where: { key: settingsKey(currentTenantId()) } });
    const parsed = promotionSettingsSchema.safeParse(row?.value ?? {});
    return parsed.success ? parsed.data : { passMark: DEFAULT_PROMOTION_PASS_MARK, graduatingLevelIds: [] };
  }

  async setSettings(settings: PromotionSettings): Promise<PromotionSettings> {
    const ids = [...new Set(settings.graduatingLevelIds)];
    if (ids.length && (await this.prisma.db.classLevel.count({ where: { id: { in: ids } } })) !== ids.length) {
      throw new BadRequestException('Some class levels were not found');
    }
    const value = { passMark: settings.passMark, graduatingLevelIds: ids };
    const key = settingsKey(currentTenantId());
    await this.prisma.root.platformSetting.upsert({
      where: { key },
      update: { value, updatedBy: currentContext().userId ?? null },
      create: { key, value, updatedBy: currentContext().userId ?? null },
    });
    await this.audit.log({ action: 'promotion.settings', summary: `Set the promotion pass mark to ${value.passMark}%`, metadata: value });
    return value;
  }

  // ------------------------------------------------------------ drafts

  private async getDraft(sessionId: string): Promise<Draft | null> {
    const row = await this.prisma.root.platformSetting.findUnique({ where: { key: draftKey(currentTenantId(), sessionId) } });
    return (row?.value as Draft | undefined) ?? null;
  }

  async saveDraft(sessionId: string, decisions: PromotionDecisionInput[]): Promise<PromotionSheet> {
    const session = await this.prisma.db.academicSession.findUniqueOrThrow({ where: { id: sessionId } });
    if (await this.prisma.db.studentPromotion.count({ where: { fromSessionId: sessionId } })) {
      throw new ConflictException(`Promotion for ${session.name} has already been applied`);
    }
    const draft = (await this.getDraft(sessionId)) ?? { savedAt: '', decisions: {} };
    for (const d of decisions) {
      draft.decisions[d.studentId] = { decision: d.decision, targetArmId: LEAVES.includes(d.decision) ? null : d.targetArmId, note: d.note ?? null };
    }
    draft.savedAt = new Date().toISOString();
    const key = draftKey(currentTenantId(), sessionId);
    const value = draft as unknown as Prisma.InputJsonValue;
    await this.prisma.root.platformSetting.upsert({
      where: { key },
      update: { value, updatedBy: currentContext().userId ?? null },
      create: { key, value, updatedBy: currentContext().userId ?? null },
    });
    return this.sheet(sessionId);
  }

  async clearDraft(sessionId: string): Promise<void> {
    await this.prisma.root.platformSetting.deleteMany({ where: { key: draftKey(currentTenantId(), sessionId) } });
  }

  // ------------------------------------------------------------ the sheet

  async sheet(sessionId: string): Promise<PromotionSheet> {
    const db = this.prisma.db;
    const session = await db.academicSession.findUniqueOrThrow({ where: { id: sessionId }, include: { terms: { orderBy: { order: 'asc' } } } });
    const [settings, levelRows, applied, draft, sessions] = await Promise.all([
      this.getSettings(),
      db.classLevel.findMany({ orderBy: [{ order: 'asc' }, { name: 'asc' }], include: { arms: { orderBy: { name: 'asc' } } } }),
      db.studentPromotion.findMany({
        where: { fromSessionId: sessionId },
        include: { student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true, gender: true, status: true } } },
      }),
      this.getDraft(sessionId),
      db.academicSession.findMany({ orderBy: { startsOn: 'asc' } }),
    ]);

    const levels = this.buildLevels(levelRows, settings);
    const levelById = new Map(levels.map((l) => [l.id, l]));
    const armById = new Map(levels.flatMap((l) => l.arms.map((a) => [a.id, a] as const)));

    // Who is being promoted: the applied records, or everyone currently in a class.
    const people = applied.length
      ? applied.map((p) => ({ ...p.student, armId: p.fromArmId }))
      : (
          await db.student.findMany({
            where: { classArmId: { not: null }, status: { in: ['ACTIVE', 'SUSPENDED'] } },
            select: { id: true, firstName: true, lastName: true, admissionNumber: true, gender: true, status: true, classArmId: true },
          })
        ).map((s) => ({ ...s, armId: s.classArmId }));

    const termAvgs = await this.termAverages(session.terms.map((t) => t.id));
    const appliedById = new Map(applied.map((p) => [p.studentId, p]));

    const rows: PromotionRow[] = people.map((s) => {
      const arm = s.armId ? armById.get(s.armId) : undefined;
      const level = arm ? levelById.get(arm.levelId) : undefined;
      const termAverages = termAvgs.get(s.id) ?? session.terms.map(() => null);
      const present = termAverages.filter((v): v is number => v !== null);
      const average = present.length ? round1(present.reduce((a, b) => a + b, 0) / present.length) : null;
      const sug = this.suggest(level, arm, average, settings.passMark, levelById);
      const done = appliedById.get(s.id);
      const saved = draft?.decisions[s.id];
      const decision = done ? (done.decision as PromotionDecision) : (saved?.decision ?? sug.suggestion);
      const targetArmId = done ? done.toArmId : saved ? saved.targetArmId : sug.suggestedArmId;
      return {
        studentId: s.id,
        name: fullName(s),
        admissionNumber: s.admissionNumber,
        gender: s.gender,
        status: s.status,
        armId: s.armId,
        termAverages,
        termsWithResults: present.length,
        average: done?.average ?? average,
        suggestion: sug.suggestion,
        suggestedArmId: sug.suggestedArmId,
        reason: sug.reason,
        decision,
        targetArmId,
        note: done ? done.note : (saved?.note ?? null),
        edited: !!done || (!!saved && (saved.decision !== sug.suggestion || saved.targetArmId !== sug.suggestedArmId || !!saved.note)),
      };
    });

    const classes = this.groupByClass(rows, armById, levelById);
    const counts = countDecisions(rows.map((r) => r.decision));
    const later = sessions.filter((x) => x.startsOn > session.startsOn && x.id !== session.id);
    const laterPromoted = later.length
      ? await db.studentPromotion.findFirst({ where: { fromSessionId: { in: later.map((x) => x.id) } }, select: { fromSessionId: true } })
      : null;

    let appliedInfo: PromotionApplied | null = null;
    if (applied.length) {
      const toId = applied.find((p) => p.toSessionId)?.toSessionId ?? null;
      const to = toId ? sessions.find((x) => x.id === toId) : undefined;
      appliedInfo = {
        appliedAt: new Date(Math.min(...applied.map((p) => p.createdAt.getTime()))).toISOString(),
        toSession: to ? { id: to.id, name: to.name } : null,
        counts,
        undo: await this.undoCheck(applied, to ?? null),
      };
    }

    return {
      session: { ...sessionRef(session), terms: session.terms.map((t) => ({ id: t.id, name: t.name, order: t.order })) },
      settings,
      levels,
      classes,
      counts,
      draftSavedAt: applied.length ? null : (draft?.savedAt ?? null),
      applied: appliedInfo,
      laterSessions: later.map(sessionRef),
      suggestedSession: suggestSession(session),
      blockedReason: laterPromoted
        ? `Students have already been promoted out of ${sessions.find((x) => x.id === laterPromoted.fromSessionId)?.name ?? 'a later session'}, so ${session.name} can no longer be promoted.`
        : null,
    };
  }

  private buildLevels(
    rows: { id: string; name: string; order: number; arms: { id: string; name: string }[] }[],
    settings: PromotionSettings,
  ): PromotionLevel[] {
    const maxOrder = rows.length ? Math.max(...rows.map((l) => l.order)) : 0;
    const chosen = new Set(settings.graduatingLevelIds.filter((id) => rows.some((l) => l.id === id)));
    return rows.map((l) => {
      const next = rows.find((x) => x.order > l.order);
      return {
        id: l.id,
        name: l.name,
        order: l.order,
        graduates: chosen.size ? chosen.has(l.id) : l.order === maxOrder,
        nextLevelId: next?.id ?? null,
        arms: l.arms.map((a) => ({ id: a.id, name: a.name, levelId: l.id, levelName: l.name, label: armLabel(l.name, a.name) })),
      };
    });
  }

  /** Each student's average in each of the given terms, from the same calculation report cards use. */
  private async termAverages(termIds: string[]): Promise<Map<string, (number | null)[]>> {
    const out = new Map<string, (number | null)[]>();
    for (const [i, termId] of termIds.entries()) {
      const arms = await this.prisma.db.score.groupBy({ by: ['classArmId'], where: { termId } });
      // A few at a time: each class result is several queries.
      for (let k = 0; k < arms.length; k += 4) {
        const batch = await Promise.all(arms.slice(k, k + 4).map((a) => this.results.classResults(a.classArmId, termId)));
        for (const r of batch) {
          for (const [studentId, avg] of r.averages) {
            if (avg === null) continue;
            const list = out.get(studentId) ?? termIds.map(() => null);
            // A student who moved class mid-term keeps the better-covered (later-read) average.
            list[i] = avg;
            out.set(studentId, list);
          }
        }
      }
    }
    return out;
  }

  private suggest(
    level: PromotionLevel | undefined,
    arm: PromotionArmRef | undefined,
    average: number | null,
    passMark: number,
    levels: Map<string, PromotionLevel>,
  ): { suggestion: PromotionDecision; suggestedArmId: string | null; reason: string } {
    if (!level || !arm) return { suggestion: 'REPEATED', suggestedArmId: null, reason: 'Their class no longer exists — choose a class' };
    if (level.graduates) return { suggestion: 'GRADUATED', suggestedArmId: null, reason: `${level.name} is a graduating class` };
    const next = level.nextLevelId ? levels.get(level.nextLevelId) : undefined;
    if (!next) return { suggestion: 'GRADUATED', suggestedArmId: null, reason: `There is no class above ${level.name}` };
    const nextArm = next.arms.find((a) => a.name.trim().toLowerCase() === arm.name.trim().toLowerCase()) ?? next.arms[0] ?? null;
    if (average === null) {
      return { suggestion: 'PROMOTED', suggestedArmId: nextArm?.id ?? null, reason: 'No results recorded this session — check before applying' };
    }
    if (average >= passMark) {
      return { suggestion: 'PROMOTED', suggestedArmId: nextArm?.id ?? null, reason: `Average ${average}% meets the ${passMark}% pass mark` };
    }
    return { suggestion: 'REPEATED', suggestedArmId: arm.id, reason: `Average ${average}% is below the ${passMark}% pass mark` };
  }

  private groupByClass(rows: PromotionRow[], armById: Map<string, PromotionArmRef>, levelById: Map<string, PromotionLevel>): PromotionClass[] {
    const groups = new Map<string, PromotionClass>();
    for (const r of rows) {
      const key = r.armId ?? 'none';
      let g = groups.get(key);
      if (!g) {
        const arm = (r.armId && armById.get(r.armId)) || { id: key, name: '', levelId: '', levelName: 'Former class', label: 'Former class' };
        g = { arm, students: [] };
        groups.set(key, g);
      }
      g.students.push(r);
    }
    const order = (c: PromotionClass) => levelById.get(c.arm.levelId)?.order ?? 1e9;
    return [...groups.values()]
      .map((g) => ({ ...g, students: g.students.sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort((a, b) => order(a) - order(b) || a.arm.label.localeCompare(b.arm.label));
  }

  // ------------------------------------------------------------ new session

  async createSession(input: NewSession): Promise<NewSessionResult> {
    this.assertFinanceFor(!!input.copyFeesFromSessionId);
    const result = await this.prisma.db.$transaction((tx) => this.createSessionTx(tx, input), { timeout: 30_000 });
    await this.audit.log({
      action: 'academics.session',
      entityType: 'session',
      entityId: result.session.id,
      summary: `Created academic session ${result.session.name} with ${result.terms.length} terms${result.feesCopied ? ` and ${result.feesCopied} fee items` : ''}`,
    });
    return result;
  }

  private async createSessionTx(tx: Tx, input: NewSession): Promise<NewSessionResult> {
    const tenantId = currentTenantId();
    if (await tx.academicSession.findFirst({ where: { name: input.name } })) {
      throw new ConflictException({ statusCode: 409, message: `A session called ${input.name} already exists`, errors: [{ path: 'name', message: 'Already exists' }] });
    }
    const source = input.copyFeesFromSessionId
      ? await tx.academicSession.findUniqueOrThrow({ where: { id: input.copyFeesFromSessionId }, include: { terms: { include: { feeItems: true } } } })
      : null;
    if (input.makeCurrent) {
      await tx.academicSession.updateMany({ data: { isCurrent: false } });
      await tx.term.updateMany({ data: { isCurrent: false } });
    }
    const session = await tx.academicSession.create({
      data: { tenantId, name: input.name, startsOn: parseDate(input.startsOn), endsOn: parseDate(input.endsOn), isCurrent: input.makeCurrent },
    });
    const terms = [];
    for (const [i, t] of input.terms.entries()) {
      terms.push(
        await tx.term.create({
          data: {
            tenantId,
            sessionId: session.id,
            name: t.name,
            order: i + 1,
            startsOn: parseDate(t.startsOn),
            endsOn: parseDate(t.endsOn),
            isCurrent: input.makeCurrent && i === 0,
          },
        }),
      );
    }
    let feesCopied = 0;
    if (source) {
      for (const term of terms) {
        const from = source.terms.find((t) => t.order === term.order);
        if (!from?.feeItems.length) continue;
        const r = await tx.feeItem.createMany({
          data: from.feeItems.map(({ name, category, amountKobo, classLevelIds, optional }) => ({ tenantId, termId: term.id, name, category, amountKobo, classLevelIds, optional })),
        });
        feesCopied += r.count;
      }
    }
    return {
      session: sessionRef(session),
      terms: terms.map((t) => ({ id: t.id, name: t.name, order: t.order, startsOn: dateOnly(t.startsOn)!, endsOn: dateOnly(t.endsOn)! })),
      feesCopied,
    };
  }

  async suggestion(fromSessionId: string): Promise<SuggestedSession> {
    const s = await this.prisma.db.academicSession.findUniqueOrThrow({ where: { id: fromSessionId }, include: { terms: { orderBy: { order: 'asc' } } } });
    return suggestSession(s);
  }

  private assertFinanceFor(needed: boolean) {
    if (needed && !currentContext().permissions.has('finance.manage')) {
      throw new ForbiddenException('Copying fees or issuing invoices needs the finance.manage permission');
    }
  }

  // ------------------------------------------------------------ apply

  async apply(sessionId: string, body: ApplyInput): Promise<PromotionApplyResult> {
    this.assertFinanceFor(body.generateInvoices || !!body.newSession?.copyFeesFromSessionId);
    const db = this.prisma.db;
    const sheet = await this.sheet(sessionId);
    const from = sheet.session;
    if (sheet.applied) throw new ConflictException(`Promotion for ${from.name} has already been applied. Undo it first to change decisions.`);
    if (sheet.blockedReason) throw new ConflictException(sheet.blockedReason);

    const rows = sheet.classes.flatMap((c) => c.students);
    if (!rows.length) throw new BadRequestException('There are no students in classes to promote');
    const known = new Set(rows.map((r) => r.studentId));
    const overrides = new Map(body.decisions.map((d) => [d.studentId, d]));
    const stray = body.decisions.filter((d) => !known.has(d.studentId));
    if (stray.length) throw new BadRequestException(`${stray.length} student(s) in the decisions are not in a class this session`);

    const armById = new Map(sheet.levels.flatMap((l) => l.arms.map((a) => [a.id, a] as const)));
    const final = rows.map((r) => {
      const o = overrides.get(r.studentId);
      const decision = o?.decision ?? r.decision;
      return {
        row: r,
        decision,
        targetArmId: LEAVES.includes(decision) ? null : o ? o.targetArmId : r.targetArmId,
        note: o?.note ?? r.note,
      };
    });
    const missing = final.filter((f) => !LEAVES.includes(f.decision) && (!f.targetArmId || !armById.has(f.targetArmId)));
    if (missing.length) {
      const names = missing.slice(0, 5).map((m) => m.row.name).join(', ');
      throw new BadRequestException(
        `Choose a class for ${missing.length} student(s) moving on or repeating (${names}${missing.length > 5 ? '…' : ''}). If the next class level has no classes, add one in Academic Setup first.`,
      );
    }

    // The session they move into.
    const fromStart = from.startsOn;
    let toSession: { id: string; name: string; startsOn: string } | null = null;
    if (body.toSessionId) {
      const s = await db.academicSession.findUniqueOrThrow({ where: { id: body.toSessionId } });
      toSession = { id: s.id, name: s.name, startsOn: dateOnly(s.startsOn)! };
    } else if (body.newSession) {
      toSession = { id: '', name: body.newSession.name, startsOn: body.newSession.startsOn };
    }
    if (!toSession) throw new BadRequestException('Choose or create the new session');
    if (toSession.startsOn <= fromStart) throw new BadRequestException(`${toSession.name} must start after ${from.name}`);

    const tenantId = currentTenantId();
    const userId = currentContext().userId ?? null;
    const created = !body.toSessionId;
    const outcome = await db.$transaction(
      async (tx) => {
        let toId = toSession.id;
        if (body.newSession) toId = (await this.createSessionTx(tx, { ...body.newSession, makeCurrent: false })).session.id;
        await tx.studentPromotion.createMany({
          data: final.map((f) => ({
            tenantId,
            studentId: f.row.studentId,
            fromSessionId: sessionId,
            toSessionId: toId,
            fromArmId: f.row.armId,
            toArmId: f.targetArmId,
            decision: f.decision,
            average: f.row.average,
            note: f.note,
            decidedById: userId,
          })),
          skipDuplicates: true,
        });
        // Move students class by class.
        const byArm = new Map<string, string[]>();
        for (const f of final) {
          if (!f.targetArmId || f.targetArmId === f.row.armId) continue;
          byArm.set(f.targetArmId, [...(byArm.get(f.targetArmId) ?? []), f.row.studentId]);
        }
        for (const [armId, ids] of byArm) await tx.student.updateMany({ where: { id: { in: ids } }, data: { classArmId: armId } });
        for (const status of LEAVE_STATUSES) {
          const ids = final.filter((f) => f.decision === status).map((f) => f.row.studentId);
          if (ids.length) await tx.student.updateMany({ where: { id: { in: ids } }, data: { status, classArmId: null } });
        }
        // Graduates join the alumni directory.
        const graduates = final.filter((f) => f.decision === 'GRADUATED').map((f) => ({ studentId: f.row.studentId, finalClass: f.row.armId ? (armById.get(f.row.armId)?.label ?? null) : null }));
        await recordGraduates(tx, tenantId, graduates, graduationYearOf(from.endsOn));
        let madeCurrent = false;
        if (body.makeCurrent) {
          await tx.academicSession.updateMany({ data: { isCurrent: false } });
          await tx.academicSession.update({ where: { id: toId }, data: { isCurrent: true } });
          await tx.term.updateMany({ data: { isCurrent: false } });
          const first = await tx.term.findFirst({ where: { sessionId: toId }, orderBy: { order: 'asc' } });
          if (first) await tx.term.update({ where: { id: first.id }, data: { isCurrent: true } });
          madeCurrent = true;
        }
        return { toId, madeCurrent };
      },
      { timeout: 120_000 },
    );

    await this.clearDraft(sessionId);
    const counts = countDecisions(final.map((f) => f.decision));
    await this.audit.log({
      action: 'promotion.apply',
      entityType: 'session',
      entityId: sessionId,
      summary: `Applied end-of-session promotion for ${from.name} into ${toSession.name}: ${counts.PROMOTED} promoted, ${counts.REPEATED} repeating, ${counts.GRADUATED} graduated, ${counts.WITHDRAWN} withdrawn`,
      metadata: { toSessionId: outcome.toId, counts: { ...counts } },
    });

    let invoices: PromotionApplyResult['invoices'] = null;
    if (body.generateInvoices) {
      const first = await db.term.findFirst({ where: { sessionId: outcome.toId }, orderBy: { order: 'asc' } });
      if (!first) invoices = { created: 0, skipped: 'The new session has no terms' };
      else {
        try {
          const r = await this.finance.generateInvoices({ termId: first.id, classLevelIds: [], siblingDiscountPct: 0 });
          invoices = { created: r.created, skipped: null };
        } catch (err) {
          invoices = { created: 0, skipped: (err as Error).message };
        }
      }
    }

    const report = await this.report(sessionId);
    return {
      fromSession: { id: from.id, name: from.name },
      toSession: { id: outcome.toId, name: toSession.name, created, madeCurrent: outcome.madeCurrent },
      counts,
      byLevel: report.levels,
      invoices,
    };
  }

  // ------------------------------------------------------------ undo

  private async undoCheck(
    applied: { toArmId: string | null; fromArmId: string | null; studentId: string }[],
    to: { id: string; name: string; startsOn: Date; endsOn: Date } | null,
  ): Promise<{ allowed: boolean; reason: string | null }> {
    if (!to) return { allowed: true, reason: null };
    const db = this.prisma.db;
    const studentIds = applied.map((p) => p.studentId);
    const [later, scores, reports, registers, invoices] = await Promise.all([
      db.studentPromotion.count({ where: { fromSessionId: to.id } }),
      db.score.count({ where: { term: { sessionId: to.id }, studentId: { in: studentIds } } }),
      db.reportCard.count({ where: { term: { sessionId: to.id }, studentId: { in: studentIds } } }),
      db.studentAttendance.count({ where: { studentId: { in: studentIds }, date: { gte: to.startsOn, lte: to.endsOn } } }),
      db.invoice.count({ where: { term: { sessionId: to.id }, studentId: { in: studentIds }, status: { not: 'CANCELLED' } } }),
    ]);
    if (later) return { allowed: false, reason: `Students have already been promoted out of ${to.name}. Undo that first.` };
    const what = [
      scores && `${scores} score(s)`,
      reports && `${reports} report card(s)`,
      registers && `${registers} attendance mark(s)`,
      invoices && `${invoices} invoice(s)`,
    ].filter(Boolean);
    if (what.length) {
      return {
        allowed: false,
        reason: `${to.name} already has ${what.join(', ')} for these students, so the promotion can't be undone safely. Move individual students from their profiles instead${invoices ? ', or cancel the invoices first' : ''}.`,
      };
    }
    return { allowed: true, reason: null };
  }

  async undo(sessionId: string): Promise<PromotionUndoResult> {
    const db = this.prisma.db;
    const session = await db.academicSession.findUniqueOrThrow({ where: { id: sessionId }, include: { terms: { orderBy: { order: 'desc' }, take: 1 } } });
    const applied = await db.studentPromotion.findMany({ where: { fromSessionId: sessionId }, include: { student: { select: { classArmId: true, status: true } } } });
    if (!applied.length) throw new NotFoundException(`No promotion has been applied for ${session.name}`);
    const toId = applied.find((p) => p.toSessionId)?.toSessionId ?? null;
    const to = toId ? await db.academicSession.findUnique({ where: { id: toId } }) : null;
    const check = await this.undoCheck(applied, to);
    if (!check.allowed) throw new ConflictException(check.reason);

    const armIds = [...new Set(applied.map((p) => p.fromArmId).filter((x): x is string => !!x))];
    const arms = new Set((await db.classArm.findMany({ where: { id: { in: armIds } }, select: { id: true } })).map((a) => a.id));
    // Only students still where the promotion put them are moved back; anyone
    // changed by hand since is left alone (and counted as skipped).
    const restore = applied.filter((p) =>
      LEAVES.includes(p.decision as PromotionDecision) ? p.student.status === p.decision && p.student.classArmId === null : p.student.classArmId === p.toArmId,
    );
    const result = await db.$transaction(
      async (tx) => {
        const byArm = new Map<string | null, { ids: string[]; reactivate: string[] }>();
        for (const p of restore) {
          const arm = p.fromArmId && arms.has(p.fromArmId) ? p.fromArmId : null;
          const g = byArm.get(arm) ?? { ids: [], reactivate: [] };
          (LEAVES.includes(p.decision as PromotionDecision) ? g.reactivate : g.ids).push(p.studentId);
          byArm.set(arm, g);
        }
        for (const [arm, g] of byArm) {
          if (g.ids.length) await tx.student.updateMany({ where: { id: { in: g.ids } }, data: { classArmId: arm } });
          if (g.reactivate.length) await tx.student.updateMany({ where: { id: { in: g.reactivate } }, data: { classArmId: arm, status: 'ACTIVE' } });
        }
        // Alumni records the promotion created go too (unless someone has edited them since).
        const regraduated = restore.filter((p) => p.decision === 'GRADUATED');
        if (regraduated.length) await forgetGraduates(tx, regraduated.map((p) => p.studentId), new Date(Math.min(...regraduated.map((p) => p.createdAt.getTime()))));
        await tx.studentPromotion.deleteMany({ where: { fromSessionId: sessionId } });
        let currentSessionRestored = false;
        if (to?.isCurrent) {
          await tx.academicSession.updateMany({ data: { isCurrent: false } });
          await tx.academicSession.update({ where: { id: sessionId }, data: { isCurrent: true } });
          await tx.term.updateMany({ data: { isCurrent: false } });
          const last = session.terms[0];
          if (last) await tx.term.update({ where: { id: last.id }, data: { isCurrent: true } });
          currentSessionRestored = true;
        }
        return { currentSessionRestored };
      },
      { timeout: 120_000 },
    );
    await this.audit.log({
      action: 'promotion.undo',
      entityType: 'session',
      entityId: sessionId,
      summary: `Undid the end-of-session promotion for ${session.name}: ${restore.length} student(s) restored`,
    });
    return { restored: restore.length, skipped: applied.length - restore.length, currentSessionRestored: result.currentSessionRestored };
  }

  // ------------------------------------------------------------ history & report

  async report(sessionId: string): Promise<PromotionReport> {
    const db = this.prisma.db;
    const session = await db.academicSession.findUniqueOrThrow({ where: { id: sessionId } });
    const applied = await db.studentPromotion.findMany({ where: { fromSessionId: sessionId }, select: { decision: true, fromArmId: true, toSessionId: true } });
    let entries: { decision: PromotionDecision; armId: string | null }[];
    let toSession: { id: string; name: string } | null = null;
    if (applied.length) {
      entries = applied.map((p) => ({ decision: p.decision as PromotionDecision, armId: p.fromArmId }));
      const toId = applied.find((p) => p.toSessionId)?.toSessionId;
      const to = toId ? await db.academicSession.findUnique({ where: { id: toId } }) : null;
      toSession = to ? { id: to.id, name: to.name } : null;
    } else {
      const sheet = await this.sheet(sessionId);
      entries = sheet.classes.flatMap((c) => c.students.map((s) => ({ decision: s.decision, armId: s.armId })));
    }
    const arms = await db.classArm.findMany({ include: { classLevel: true } });
    const armLevel = new Map(arms.map((a) => [a.id, a.classLevel]));
    const levels = new Map<string, PromotionReportLevel>();
    for (const e of entries) {
      const lvl = e.armId ? armLevel.get(e.armId) : undefined;
      const key = lvl?.id ?? 'unknown';
      const row = levels.get(key) ?? { levelId: key, levelName: lvl?.name ?? 'Former class', order: lvl?.order ?? 1e6, counts: emptyPromotionCounts(), total: 0 };
      row.counts[e.decision]++;
      row.total++;
      levels.set(key, row);
    }
    return {
      session: { id: session.id, name: session.name },
      applied: applied.length > 0,
      toSession,
      levels: [...levels.values()].sort((a, b) => a.order - b.order),
      counts: countDecisions(entries.map((e) => e.decision)),
    };
  }

  async history(studentId: string): Promise<StudentPromotionHistoryItem[]> {
    const db = this.prisma.db;
    await db.student.findUniqueOrThrow({ where: { id: studentId }, select: { id: true } });
    const rows = await db.studentPromotion.findMany({ where: { studentId }, orderBy: { createdAt: 'desc' } });
    const sessionIds = [...new Set(rows.flatMap((r) => [r.fromSessionId, r.toSessionId]).filter((x): x is string => !!x))];
    const armIds = [...new Set(rows.flatMap((r) => [r.fromArmId, r.toArmId]).filter((x): x is string => !!x))];
    const [sessions, arms] = await Promise.all([
      db.academicSession.findMany({ where: { id: { in: sessionIds } } }),
      db.classArm.findMany({ where: { id: { in: armIds } }, include: { classLevel: true } }),
    ]);
    const sName = new Map(sessions.map((s) => [s.id, s.name]));
    const aName = new Map(arms.map((a) => [a.id, armLabel(a.classLevel.name, a.name)]));
    return rows
      .map((r) => ({
        id: r.id,
        fromSession: { id: r.fromSessionId, name: sName.get(r.fromSessionId) ?? 'Deleted session' },
        toSession: r.toSessionId ? { id: r.toSessionId, name: sName.get(r.toSessionId) ?? 'Deleted session' } : null,
        fromClass: r.fromArmId ? (aName.get(r.fromArmId) ?? 'Former class') : null,
        toClass: r.toArmId ? (aName.get(r.toArmId) ?? 'Former class') : null,
        decision: r.decision as PromotionDecision,
        average: r.average,
        note: r.note,
        createdAt: r.createdAt.toISOString(),
      }))
      .sort((a, b) => (sessions.find((s) => s.id === b.fromSession.id)?.startsOn.getTime() ?? 0) - (sessions.find((s) => s.id === a.fromSession.id)?.startsOn.getTime() ?? 0));
  }
}

// ------------------------------------------------------------ helpers

function armLabel(levelName: string, armName: string): string {
  const arm = armName.trim();
  return arm ? `${levelName} ${arm}` : levelName;
}

function sessionRef(s: { id: string; name: string; startsOn: Date; endsOn: Date; isCurrent: boolean }): PromotionSessionRef {
  return { id: s.id, name: s.name, startsOn: dateOnly(s.startsOn)!, endsOn: dateOnly(s.endsOn)!, isCurrent: s.isCurrent };
}

function countDecisions(decisions: PromotionDecision[]): PromotionCounts {
  const c = emptyPromotionCounts();
  for (const d of decisions) c[d]++;
  return c;
}

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
/** Same calendar date a year on. */
const nextYear = (d: Date) => new Date(Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate()));
/** Nudges a start date to its nearest Monday and an end date to its nearest Friday. */
const toWeekday = (d: Date, target: 1 | 5) => {
  let diff = (target - d.getUTCDay() + 7) % 7;
  if (diff > 3) diff -= 7;
  return new Date(d.getTime() + diff * DAY);
};

/**
 * The next session's name and dates, from this one: "2025/2026" → "2026/2027",
 * each term a year on (starting on a Monday, ending on a Friday). Without three
 * terms to copy, the usual Nigerian calendar: Sept–Dec, Jan–Apr, late Apr–Jul.
 */
export function suggestSession(s: { name: string; startsOn: Date; endsOn: Date; terms: { name: string; order: number; startsOn: Date; endsOn: Date }[] }): SuggestedSession {
  const m = s.name.match(/(\d{4})\s*([/\-–])\s*(\d{2,4})/);
  const startYear = s.startsOn.getUTCFullYear() + 1;
  const name = m
    ? s.name.replace(m[0], `${Number(m[1]) + 1}${m[2]}${m[3]!.length === 2 ? String((Number(m[3]) + 1) % 100).padStart(2, '0') : Number(m[3]) + 1}`)
    : `${startYear}/${startYear + 1}`;
  const terms = [...s.terms].sort((a, b) => a.order - b.order);
  let next: { name: string; startsOn: string; endsOn: string }[];
  if (terms.length >= 2) {
    next = terms.map((t) => ({ name: t.name, startsOn: iso(toWeekday(nextYear(t.startsOn), 1)), endsOn: iso(toWeekday(nextYear(t.endsOn), 5)) }));
  } else {
    const y = startYear;
    const d = (yr: number, mo: number, day: number) => new Date(Date.UTC(yr, mo - 1, day));
    next = [
      { name: 'First Term', startsOn: iso(toWeekday(d(y, 9, 8), 1)), endsOn: iso(toWeekday(d(y, 12, 18), 5)) },
      { name: 'Second Term', startsOn: iso(toWeekday(d(y + 1, 1, 8), 1)), endsOn: iso(toWeekday(d(y + 1, 4, 3), 5)) },
      { name: 'Third Term', startsOn: iso(toWeekday(d(y + 1, 4, 27), 1)), endsOn: iso(toWeekday(d(y + 1, 7, 24), 5)) },
    ];
  }
  // Keep terms in order even after nudging, and the session around them.
  for (let i = 1; i < next.length; i++) {
    if (next[i]!.startsOn <= next[i - 1]!.endsOn) next[i]!.startsOn = iso(new Date(Date.parse(next[i - 1]!.endsOn) + 3 * DAY));
  }
  const shiftedStart = iso(nextYear(s.startsOn));
  const shiftedEnd = iso(nextYear(s.endsOn));
  const startsOn = [shiftedStart, next[0]!.startsOn].sort()[0]!;
  const endsOn = [shiftedEnd, next[next.length - 1]!.endsOn].sort().reverse()[0]!;
  return { name, startsOn, endsOn, terms: next };
}
