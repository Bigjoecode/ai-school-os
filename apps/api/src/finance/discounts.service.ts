import { BadRequestException, Injectable } from '@nestjs/common';
import {
  DISCOUNT_KIND_LABELS,
  type DiscountKind,
  type DiscountPreview,
  type DiscountPreviewInput,
  type DiscountReport,
  type DiscountRules,
  type ReapplyChange,
  type ReapplyResult,
  type StudentDiscountInput,
  type StudentDiscountRow,
  type StudentDiscountSummary,
  formatMoney,
  resolveDiscounts,
} from '@aischool/shared';
import type { Prisma } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { fullName } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { classifyDiscountLine, loadDiscountContext } from './discount-engine';
import { FinanceService } from './finance.service';

const discountInclude = {
  student: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      admissionNumber: true,
      status: true,
      classArm: { select: { name: true, classLevel: { select: { name: true } } } },
    },
  },
} satisfies Prisma.StudentDiscountInclude;
type DiscountWithStudent = Prisma.StudentDiscountGetPayload<{ include: typeof discountInclude }>;

const armLabel = (a: { name: string; classLevel: { name: string } } | null) => (a ? `${a.classLevel.name} ${a.name}` : null);
const ONE_OFF_LABEL = 'One-off (added by hand)';

@Injectable()
export class DiscountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: FinanceService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------- per-student discounts

  private async rows(list: DiscountWithStudent[]): Promise<StudentDiscountRow[]> {
    const termIds = [...new Set(list.flatMap((d) => [d.fromTermId, d.untilTermId]).filter((x): x is string => !!x))];
    const [terms, names] = await Promise.all([
      termIds.length ? this.prisma.db.term.findMany({ where: { id: { in: termIds } }, select: { id: true, name: true, session: { select: { name: true } } } }) : [],
      this.finance.userNames(list.map((d) => d.approvedById)),
    ]);
    const term = new Map(terms.map((t) => [t.id, { id: t.id, name: `${t.name} ${t.session.name}` }]));
    return list.map((d) => ({
      id: d.id,
      student: { id: d.student.id, name: fullName(d.student), admissionNumber: d.student.admissionNumber, classArm: armLabel(d.student.classArm), status: d.student.status },
      kind: d.kind as DiscountKind,
      label: d.label,
      percent: d.percent,
      amountKobo: d.amountKobo,
      appliesTo: d.appliesTo === 'ALL' ? 'ALL' : 'TUITION',
      fromTerm: d.fromTermId ? (term.get(d.fromTermId) ?? null) : null,
      untilTerm: d.untilTermId ? (term.get(d.untilTermId) ?? null) : null,
      active: d.active,
      note: d.note,
      approvedBy: d.approvedById ? (names.get(d.approvedById) ?? null) : null,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    }));
  }

  async list(q: { studentId?: string; kind?: DiscountKind; active?: 'true' | 'false'; q?: string }): Promise<StudentDiscountRow[]> {
    const words = q.q?.split(/\s+/).filter(Boolean) ?? [];
    const list = await this.prisma.db.studentDiscount.findMany({
      where: {
        ...(q.studentId ? { studentId: q.studentId } : {}),
        ...(q.kind ? { kind: q.kind } : {}),
        ...(q.active ? { active: q.active === 'true' } : {}),
        AND: words.map((w) => ({
          OR: [
            { label: { contains: w, mode: 'insensitive' as const } },
            { student: { firstName: { contains: w, mode: 'insensitive' as const } } },
            { student: { lastName: { contains: w, mode: 'insensitive' as const } } },
            { student: { admissionNumber: { contains: w, mode: 'insensitive' as const } } },
          ],
        })),
      },
      include: discountInclude,
      orderBy: [{ active: 'desc' }, { student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }, { createdAt: 'asc' }],
      take: 1000,
    });
    return this.rows(list);
  }

  private async checkWindow(body: StudentDiscountInput) {
    const ids = [body.fromTermId, body.untilTermId].filter((x): x is string => !!x);
    if (!ids.length) return;
    const terms = await this.prisma.db.term.findMany({ where: { id: { in: ids } }, select: { id: true, startsOn: true } });
    if (terms.length !== new Set(ids).size) throw new BadRequestException({ statusCode: 400, message: 'Term not found', errors: [{ path: 'fromTermId', message: 'Term not found' }] });
    const from = terms.find((t) => t.id === body.fromTermId);
    const until = terms.find((t) => t.id === body.untilTermId);
    if (from && until && from.startsOn > until.startsOn) {
      throw new BadRequestException({ statusCode: 400, message: 'The last term is before the first', errors: [{ path: 'untilTermId', message: 'Before the first term' }] });
    }
  }

  private describe(body: { label: string; percent: number | null; amountKobo: number | null; appliesTo: string }, currency: string) {
    return body.percent != null ? `${body.label} (${body.percent}% of ${body.appliesTo === 'ALL' ? 'fees' : 'tuition'})` : `${body.label} (${formatMoney(body.amountKobo ?? 0, currency)} a term)`;
  }

  async create(body: StudentDiscountInput, studentIds?: string[]): Promise<StudentDiscountRow[]> {
    const ids = [...new Set(studentIds?.length ? studentIds : [body.studentId])];
    await this.checkWindow(body);
    const found = await this.prisma.db.student.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } });
    if (found.length !== ids.length) throw new BadRequestException({ statusCode: 400, message: 'Some students were not found', errors: [{ path: 'studentId', message: 'Student not found' }] });
    const { studentId: _s, ...data } = body;
    const tenantId = currentTenantId();
    const approvedById = currentContext().userId ?? null;
    const created = await this.prisma.db.$transaction(
      ids.map((studentId) => this.prisma.db.studentDiscount.create({ data: { ...data, tenantId, studentId, approvedById }, include: discountInclude })),
    );
    const { currency } = await this.finance.settings();
    await this.audit.log({
      action: 'finance.discount_added',
      entityType: 'StudentDiscount',
      entityId: created[0]!.id,
      summary: `Approved ${DISCOUNT_KIND_LABELS[body.kind].toLowerCase()} discount "${this.describe(body, currency)}" for ${found.map(fullName).join(', ')}`,
    });
    return this.rows(created);
  }

  async update(id: string, body: StudentDiscountInput): Promise<StudentDiscountRow> {
    const before = await this.prisma.db.studentDiscount.findUniqueOrThrow({ where: { id } });
    await this.checkWindow(body);
    const { studentId: _s, ...data } = body;
    const d = await this.prisma.db.studentDiscount.update({
      where: { id },
      data: { ...data, approvedById: currentContext().userId ?? before.approvedById },
      include: discountInclude,
    });
    const { currency } = await this.finance.settings();
    await this.audit.log({
      action: 'finance.discount_updated',
      entityType: 'StudentDiscount',
      entityId: id,
      summary: `${!body.active && before.active ? 'Stopped' : 'Updated'} discount "${this.describe(body, currency)}" for ${fullName(d.student)}`,
    });
    return (await this.rows([d]))[0]!;
  }

  async remove(id: string) {
    const d = await this.prisma.db.studentDiscount.findUniqueOrThrow({ where: { id }, include: discountInclude });
    await this.prisma.db.studentDiscount.delete({ where: { id } });
    await this.audit.log({ action: 'finance.discount_removed', entityType: 'StudentDiscount', entityId: id, summary: `Removed discount "${d.label}" for ${fullName(d.student)}` });
  }

  /** The student's own discounts plus what the automatic rules say about them. */
  async forStudent(studentId: string): Promise<StudentDiscountSummary> {
    await this.prisma.db.student.findUniqueOrThrow({ where: { id: studentId }, select: { id: true } });
    const settings = await this.finance.settings();
    const rules = settings.discountRules;
    const [discounts, ctx] = await Promise.all([
      this.list({ studentId }),
      loadDiscountContext(this.prisma.db, currentTenantId(), null, rules, { includeStudentIds: [studentId] }),
    ]);
    const sib = ctx.sibling(studentId);
    const staffName = ctx.staffParent(studentId);
    return {
      discounts,
      sibling: sib && sib.familySize > 1 ? { ...sib, rulePct: rules.sibling.enabled && sib.position > 1 ? (sib.position === 2 ? rules.sibling.secondChildPct : rules.sibling.thirdChildPct) : null } : null,
      staffChild: { matched: !!staffName, staffName, rulePct: staffName && rules.staffChild.enabled ? rules.staffChild.percent : null },
      rules,
    };
  }

  // ---------------------------------------------------------- rules

  async rules(): Promise<DiscountRules> {
    return (await this.finance.settings()).discountRules;
  }

  async setRules(rules: DiscountRules): Promise<DiscountRules> {
    const s = rules.sibling;
    const parts = [
      s.enabled ? `sibling ${s.secondChildPct}% / ${s.thirdChildPct}%` : 'sibling off',
      rules.staffChild.enabled ? `staff child ${rules.staffChild.percent}% of ${rules.staffChild.appliesTo === 'ALL' ? 'fees' : 'tuition'}` : 'staff child off',
      rules.combine === 'BEST' ? 'best one only' : 'stacking',
    ];
    return (await this.finance.setSettings({ discountRules: rules }, `Updated discount rules: ${parts.join(', ')}`)).discountRules;
  }

  // ---------------------------------------------------------- invoice preview

  async preview(body: DiscountPreviewInput): Promise<DiscountPreview> {
    const over = body.siblingDiscountPct != null && body.siblingDiscountPct > 0 ? body.siblingDiscountPct : undefined;
    const { term, settings, plans, skipped } = await this.finance.planInvoices({ ...body, siblingDiscountPct: over });
    const byKind = new Map<DiscountKind, { count: number; totalKobo: number }>();
    const examples: DiscountPreview['examples'] = [];
    let discountKobo = 0;
    for (const p of plans) {
      for (const d of p.discounts) {
        const k = byKind.get(d.kind) ?? { count: 0, totalKobo: 0 };
        k.count++;
        k.totalKobo += d.amountKobo;
        byKind.set(d.kind, k);
        discountKobo += d.amountKobo;
        examples.push({ student: fullName(p.student), classArm: p.student.classArm, description: d.description, amountKobo: d.amountKobo });
      }
    }
    return {
      term: { id: term.id, name: term.name },
      learners: plans.length,
      alreadyInvoiced: skipped,
      grossKobo: plans.reduce((n, p) => n + p.grossKobo, 0),
      discountKobo,
      byKind: [...byKind].map(([kind, v]) => ({ kind, ...v })).sort((a, b) => b.totalKobo - a.totalKobo),
      examples: examples.sort((a, b) => b.amountKobo - a.amountKobo).slice(0, 6),
      combine: settings.discountRules.combine,
      usingOverride: over != null,
    };
  }

  // ---------------------------------------------------------- re-apply to issued invoices

  /**
   * Recalculates the standing-discount lines on a term's invoices that have
   * no payments yet. One-off discount lines added by hand are kept (and still
   * count towards the cap). Invoices with payments, or cancelled, are listed
   * as locked and left alone.
   */
  async reapply(termId: string, dryRun: boolean): Promise<ReapplyResult> {
    const db = this.prisma.db;
    const tenantId = currentTenantId();
    const settings = await this.finance.settings();
    const money = (k: number) => formatMoney(k, settings.currency);
    const term = await db.term.findUniqueOrThrow({ where: { id: termId }, include: { session: { select: { name: true } } } });
    const invoices = await db.invoice.findMany({
      where: { termId },
      include: {
        lines: { include: { feeItem: { select: { category: true } } }, orderBy: { id: 'asc' } },
        payments: { where: { status: { in: ['SUCCESS', 'PENDING'] } }, select: { status: true, amountKobo: true } },
        student: { select: { id: true, firstName: true, lastName: true, classArm: { select: { name: true, classLevel: { select: { name: true } } } } } },
      },
      orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
    });
    const ctx = await loadDiscountContext(db, tenantId, termId, settings.discountRules, { includeStudentIds: invoices.map((i) => i.studentId) });
    const labels = await this.labelsByStudent(invoices.map((i) => i.studentId));

    const changed: ReapplyChange[] = [];
    const locked: ReapplyResult['locked'] = [];
    const work: { invoiceId: string; removeIds: string[]; add: { description: string; amountKobo: number }[] }[] = [];
    let unchanged = 0;

    for (const inv of invoices) {
      const name = fullName(inv.student);
      if (inv.status === 'CANCELLED') {
        locked.push({ invoiceId: inv.id, number: inv.number, student: name, reason: 'Cancelled' });
        continue;
      }
      if (inv.payments.length || inv.paidKobo > 0) {
        const pending = inv.payments.some((p) => p.status === 'PENDING');
        locked.push({ invoiceId: inv.id, number: inv.number, student: name, reason: pending && !inv.paidKobo ? 'An online payment is in progress' : `${money(inv.paidKobo)} already paid` });
        continue;
      }
      const items = inv.lines.filter((l) => l.kind === 'FEE' && l.feeItemId && l.feeItem).map((l) => ({ category: l.feeItem!.category, amountKobo: l.amountKobo }));
      const discountLines = inv.lines.filter((l) => l.kind === 'DISCOUNT');
      const standing = discountLines.filter((l) => classifyDiscountLine(l.description, labels.get(inv.studentId) ?? []).standing);
      const oneOff = discountLines.filter((l) => !standing.includes(l)).reduce((n, l) => n - l.amountKobo, 0);
      const next = resolveDiscounts(items, ctx.candidatesFor(inv.studentId), settings.discountRules.combine, { alreadyDiscountedKobo: oneOff, money });
      const key = (xs: { description: string; amountKobo: number }[]) =>
        xs
          .map((x) => `${x.description}|${Math.abs(x.amountKobo)}`)
          .sort()
          .join('\n');
      if (key(standing) === key(next)) {
        unchanged++;
        continue;
      }
      const otherKobo = inv.lines.filter((l) => !standing.includes(l)).reduce((n, l) => n + l.amountKobo, 0);
      const afterKobo = Math.max(0, otherKobo - next.reduce((n, d) => n + d.amountKobo, 0));
      changed.push({
        invoiceId: inv.id,
        number: inv.number,
        student: { id: inv.student.id, name, classArm: armLabel(inv.student.classArm) },
        beforeKobo: inv.totalKobo,
        afterKobo,
        removed: standing.map((l) => l.description),
        added: next.map((d) => ({ description: d.description, amountKobo: d.amountKobo })),
      });
      work.push({ invoiceId: inv.id, removeIds: standing.map((l) => l.id), add: next.map((d) => ({ description: d.description, amountKobo: -d.amountKobo })) });
    }

    if (!dryRun && work.length) {
      for (const w of work) {
        await db.$transaction(async (tx) => {
          // Re-check inside the transaction: a payment may have arrived since.
          const paid = await tx.payment.count({ where: { invoiceId: w.invoiceId, status: { in: ['SUCCESS', 'PENDING'] } } });
          if (paid) return;
          if (w.removeIds.length) await tx.invoiceLine.deleteMany({ where: { id: { in: w.removeIds }, invoiceId: w.invoiceId, kind: 'DISCOUNT' } });
          if (w.add.length) await tx.invoiceLine.createMany({ data: w.add.map((a) => ({ tenantId, invoiceId: w.invoiceId, feeItemId: null, kind: 'DISCOUNT', ...a })) });
          await this.finance.refreshInvoice(tx, w.invoiceId);
        });
      }
      await this.audit.log({
        action: 'finance.discounts_reapplied',
        summary: `Re-applied discounts to ${work.length} unpaid invoice${work.length === 1 ? '' : 's'} for ${term.name} ${term.session.name} (${locked.length} locked)`,
      });
    }
    return { dryRun, term: { id: term.id, name: `${term.name} ${term.session.name}` }, changed, unchanged, locked };
  }

  private async labelsByStudent(studentIds: string[]) {
    const all = await this.prisma.db.studentDiscount.findMany({ where: { studentId: { in: studentIds } }, select: { studentId: true, label: true, kind: true } });
    const m = new Map<string, { label: string; kind: string }[]>();
    for (const d of all) m.set(d.studentId, [...(m.get(d.studentId) ?? []), { label: d.label, kind: d.kind }]);
    return m;
  }

  // ---------------------------------------------------------- report

  async report(termId?: string): Promise<DiscountReport> {
    const db = this.prisma.db;
    const settings = await this.finance.settings();
    const term = termId
      ? await db.term.findUniqueOrThrow({ where: { id: termId }, include: { session: { select: { name: true } } } })
      : await db.term.findFirst({ where: { isCurrent: true }, include: { session: { select: { name: true } } } });
    if (!term) throw new BadRequestException('Set a current term in Academic Setup first');
    const invoices = await db.invoice.findMany({
      where: { termId: term.id, status: { not: 'CANCELLED' } },
      include: {
        lines: { select: { kind: true, description: true, amountKobo: true } },
        student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true, classArm: { select: { name: true, classLevel: { select: { name: true } } } } } },
      },
      orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
    });
    const labels = await this.labelsByStudent(invoices.map((i) => i.studentId));
    const byKind = new Map<DiscountKind | 'ONE_OFF', { count: number; totalKobo: number }>();
    const rows: DiscountReport['rows'] = [];
    let grossKobo = 0;
    let totalKobo = 0;
    for (const inv of invoices) {
      grossKobo += inv.lines.filter((l) => l.amountKobo > 0).reduce((n, l) => n + l.amountKobo, 0);
      const lines = inv.lines
        .filter((l) => l.kind === 'DISCOUNT' && l.amountKobo < 0)
        .map((l) => ({ kind: classifyDiscountLine(l.description, labels.get(inv.studentId) ?? []).kind, description: l.description, amountKobo: -l.amountKobo }));
      if (!lines.length) continue;
      for (const l of lines) {
        const k = byKind.get(l.kind) ?? { count: 0, totalKobo: 0 };
        k.count++;
        k.totalKobo += l.amountKobo;
        byKind.set(l.kind, k);
      }
      const t = lines.reduce((n, l) => n + l.amountKobo, 0);
      totalKobo += t;
      rows.push({
        invoiceId: inv.id,
        invoiceNumber: inv.number,
        student: { id: inv.student.id, name: fullName(inv.student), admissionNumber: inv.student.admissionNumber, classArm: armLabel(inv.student.classArm) },
        lines,
        totalKobo: t,
        status: inv.status,
      });
    }
    return {
      term: { id: term.id, name: `${term.name} ${term.session.name}` },
      currency: settings.currency,
      totalKobo,
      grossKobo,
      students: rows.length,
      byKind: [...byKind]
        .map(([kind, v]) => ({ kind, label: kind === 'ONE_OFF' ? ONE_OFF_LABEL : DISCOUNT_KIND_LABELS[kind], ...v }))
        .sort((a, b) => b.totalKobo - a.totalKobo),
      rows,
    };
  }

  async reportCsv(termId?: string): Promise<{ csv: string; filename: string }> {
    const r = await this.report(termId);
    // Text cells that look like formulas are prefixed so spreadsheets don't run them.
    const cell = (v: string | number | null) => {
      if (v === null) return '';
      if (typeof v === 'number') return String(v);
      const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const naira = (k: number) => (k / 100).toFixed(2);
    const out: string[] = [['Student', 'Admission no.', 'Class', 'Invoice', 'Kind', 'Discount', `Amount (${r.currency})`].join(',')];
    for (const row of r.rows) {
      for (const l of row.lines) {
        out.push(
          [row.student.name, row.student.admissionNumber, row.student.classArm, row.invoiceNumber, l.kind === 'ONE_OFF' ? ONE_OFF_LABEL : DISCOUNT_KIND_LABELS[l.kind], l.description, naira(l.amountKobo)]
            .map((v) => (typeof v === 'string' && /^\d+\.\d\d$/.test(v) ? v : cell(v)))
            .join(','),
        );
      }
    }
    out.push('', ['Summary', '', '', '', 'Kind', 'Discounts', `Total (${r.currency})`].join(','));
    for (const k of r.byKind) out.push(['', '', '', '', cell(k.label), String(k.count), naira(k.totalKobo)].join(','));
    out.push(['', '', '', '', 'All discounts', String(r.byKind.reduce((n, k) => n + k.count, 0)), naira(r.totalKobo)].join(','));
    const slug = r.term.name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
    return { csv: `﻿${out.join('\r\n')}\r\n`, filename: `discounts-${slug}.csv` };
  }
}
