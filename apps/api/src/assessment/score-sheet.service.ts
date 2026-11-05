import { BadRequestException, Injectable } from '@nestjs/common';
import type { CbtScorePreview, CbtScorePreviewRow, CbtSendScoresResult } from '@aischool/shared';
import { AuditService } from '../audit/audit.service';
import { fullName } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { AssessmentSettingsService } from './assessment-settings.service';
import { ResultsService } from './results.service';
import { scaleToComponent, scoreRowStatus } from './score-copy';

/** Which marks on the score sheet: one subject, term and result component. */
export interface ScoreTarget {
  subjectId: string;
  termId: string;
  componentKey: string;
}

/** One sitter's mark: `score` out of `total`, or null while it isn't fully marked. */
export interface ScoreEntry {
  studentId: string;
  score: number | null;
  total: number | null;
}

/**
 * Copies marks from a school assessment into the score sheet: a preview of
 * new marks, unchanged ones and conflicts with marks already there, then the
 * write (only new marks, and conflicts the teacher ticked). Each mark is
 * scaled to the component's maximum; only classes the user may enter scores
 * for are written. Used by online exams and practical assessments.
 */
@Injectable()
export class ScoreSheetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AssessmentSettingsService,
    private readonly results: ResultsService,
    private readonly audit: AuditService,
  ) {}

  async preview(target: ScoreTarget, entries: ScoreEntry[]): Promise<CbtScorePreview> {
    const db = this.prisma.db;
    const { components } = await this.settings.get();
    const component = components.find((c) => c.key === target.componentKey);
    if (!component) throw new BadRequestException('The result component this feeds no longer exists in your assessment settings');
    const ids = entries.map((e) => e.studentId);
    const [subject, term, students, existing] = await Promise.all([
      db.subject.findUnique({ where: { id: target.subjectId }, select: { id: true, name: true } }),
      db.term.findUnique({ where: { id: target.termId }, select: { id: true, name: true, session: { select: { name: true } } } }),
      db.student.findMany({
        where: { id: { in: ids } },
        select: { id: true, firstName: true, lastName: true, admissionNumber: true, classArm: { select: { id: true, name: true, classLevel: { select: { name: true } } } } },
      }),
      db.score.findMany({ where: { studentId: { in: ids }, subjectId: target.subjectId, termId: target.termId, componentKey: target.componentKey } }),
    ]);
    if (!subject || !term) throw new BadRequestException('The subject or term for these marks no longer exists');
    const byStudent = new Map(students.map((s) => [s.id, s]));
    const existingBy = new Map(existing.map((s) => [s.studentId, Number(s.score)]));
    const allowed = new Map<string, boolean>();
    const rows: CbtScorePreviewRow[] = [];
    for (const e of entries) {
      const s = byStudent.get(e.studentId);
      if (!s) continue;
      const arm = s.classArm ? { id: s.classArm.id, name: `${s.classArm.classLevel.name} ${s.classArm.name}` } : null;
      if (arm && !allowed.has(arm.id)) allowed.set(arm.id, await this.results.canEnterScores(arm.id, target.subjectId));
      const existingScore = existingBy.get(s.id) ?? null;
      const newScore = scaleToComponent(e.score, e.total, component.maxScore);
      rows.push({
        student: { id: s.id, name: fullName(s), admissionNumber: s.admissionNumber },
        classArm: arm,
        status: scoreRowStatus({ hasClass: !!arm, allowed: !!arm && !!allowed.get(arm.id), newScore, existingScore }),
        newScore,
        existingScore,
      });
    }
    rows.sort((x, y) => (x.classArm?.name ?? '').localeCompare(y.classArm?.name ?? '') || x.student.name.localeCompare(y.student.name));
    return { component, subject, term: { id: term.id, name: `${term.name} · ${term.session.name}` }, rows };
  }

  /** Writes the new marks and the conflicts in `overwriteStudentIds`, audited as coming from `source`. */
  async send(target: ScoreTarget, entries: ScoreEntry[], overwriteStudentIds: string[], source: { entityType: string; entityId: string; label: string }): Promise<CbtSendScoresResult> {
    const preview = await this.preview(target, entries);
    const overwrite = new Set(overwriteStudentIds);
    const write = preview.rows.filter((r) => r.status === 'NEW' || (r.status === 'CONFLICT' && overwrite.has(r.student.id)));
    if (!write.length) return { written: 0, overwritten: 0, skipped: preview.rows.length };
    const userId = currentContext().userId;
    const tenantId = currentTenantId();
    await this.prisma.db.$transaction(
      write.map((r) =>
        this.prisma.db.score.upsert({
          where: { studentId_subjectId_termId_componentKey: { studentId: r.student.id, subjectId: target.subjectId, termId: target.termId, componentKey: target.componentKey } },
          update: { score: r.newScore!, classArmId: r.classArm!.id, enteredById: userId },
          create: { tenantId, studentId: r.student.id, subjectId: target.subjectId, termId: target.termId, classArmId: r.classArm!.id, componentKey: target.componentKey, score: r.newScore!, enteredById: userId },
        }),
      ),
    );
    const overwritten = write.filter((r) => r.status === 'CONFLICT').length;
    await this.audit.log({
      action: 'results.entered',
      entityType: source.entityType,
      entityId: source.entityId,
      summary: `Sent ${write.length} ${preview.subject.name} ${preview.component.name} mark${write.length === 1 ? '' : 's'} from ${source.label} to the score sheet${overwritten ? ` (replacing ${overwritten})` : ''}`,
    });
    return { written: write.length - overwritten, overwritten, skipped: preview.rows.length - write.length };
  }
}
