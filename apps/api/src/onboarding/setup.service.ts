import { BadRequestException, Injectable } from '@nestjs/common';
import { STAGE_TEMPLATES, SUBJECT_TEMPLATES, type SetupStatus, type SetupYearInput, type StageKey } from '@aischool/shared';
import { AuditService } from '../audit/audit.service';
import { currentTenantId } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

const stageOf = (stage: string | null): StageKey | null =>
  (Object.entries(STAGE_TEMPLATES).find(([, t]) => t.stage.toLowerCase() === (stage ?? '').toLowerCase())?.[0] as StageKey | undefined) ?? null;

/**
 * The new-school setup: a checklist of what a school needs before day one,
 * and one-click Nigerian templates for the academic year, classes and
 * subjects. Every step is safe to repeat: existing rows are kept.
 */
@Injectable()
export class SetupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async status(): Promise<SetupStatus> {
    const db = this.prisma.db;
    const [tenant, sessions, currentTerm, levels, arms, subjects, linked, staff, students, guardians, feeItems, scores, withGuardian] = await Promise.all([
      this.prisma.root.tenant.findUniqueOrThrow({ where: { id: currentTenantId() }, select: { address: true, phone: true, email: true, logoUrl: true } }),
      db.academicSession.count(),
      db.term.findFirst({ where: { isCurrent: true }, include: { session: true } }),
      db.classLevel.findMany({ select: { stage: true } }),
      db.classArm.count(),
      db.subject.count(),
      db.classSubject.count(),
      db.staff.count({ where: { status: { not: 'EXITED' } } }),
      db.student.count({ where: { status: 'ACTIVE' } }),
      db.guardian.count(),
      db.feeItem.count(),
      db.score.count(),
      db.student.count({ where: { status: 'ACTIVE', guardians: { some: {} } } }),
    ]);
    const profileDone = !!(tenant.address && (tenant.phone || tenant.email));
    const steps: SetupStatus['steps'] = [
      { key: 'profile', label: 'School profile', done: profileDone, detail: profileDone ? 'Address and contact details are set' : 'Add the address, phone and logo', href: '/settings' },
      { key: 'year', label: 'Academic year and terms', done: !!currentTerm, detail: currentTerm ? `${currentTerm.session.name}, ${currentTerm.name} is current` : sessions ? 'Mark the current term' : 'Create this session and its terms', href: '/setup' },
      { key: 'classes', label: 'Classes', done: arms > 0, detail: arms ? `${levels.length} levels, ${arms} classes` : 'Create your class levels and arms', href: '/setup' },
      { key: 'subjects', label: 'Subjects', done: subjects > 0 && linked > 0, detail: subjects ? `${subjects} subjects, ${linked} class–subject links` : 'Choose the subjects you teach', href: '/setup' },
      { key: 'staff', label: 'Staff', done: staff > 0, detail: staff ? `${staff} staff` : 'Import your staff list', href: '/import?kind=STAFF' },
      { key: 'students', label: 'Students', done: students > 0, detail: students ? `${students} active students` : 'Import your students', href: '/import?kind=STUDENTS' },
      { key: 'parents', label: 'Parents', done: students > 0 && withGuardian / students >= 0.8, detail: students ? `${Math.round((withGuardian / Math.max(1, students)) * 100)}% of students have a parent on record (${guardians} parents)` : 'Parents come in with the student import', href: '/import?kind=STUDENTS' },
      { key: 'fees', label: 'Fees', done: feeItems > 0, detail: feeItems ? `${feeItems} fee items` : 'Set up this term’s fees', href: '/finance' },
      { key: 'results', label: 'Past results (optional)', done: scores > 0, detail: scores ? `${scores.toLocaleString('en-NG')} scores on record` : 'Import last term’s scores for cumulative report cards', href: '/import?kind=RESULTS' },
    ];
    const required = steps.filter((s) => s.key !== 'results');
    return {
      steps,
      progressPct: Math.round((required.filter((s) => s.done).length / required.length) * 100),
      stages: [...new Set(levels.map((l) => stageOf(l.stage)).filter((s): s is StageKey => !!s))],
      counts: { levels: levels.length, arms, subjects, staff, students, guardians, feeItems, scores },
    };
  }

  async year(input: SetupYearInput) {
    const db = this.prisma.db;
    const tenantId = currentTenantId();
    const sorted = [...input.terms].sort((a, b) => a.startsOn.localeCompare(b.startsOn));
    for (const [i, t] of sorted.entries()) {
      if (t.endsOn <= t.startsOn) throw new BadRequestException(`${t.name} must end after it starts`);
      if (i && t.startsOn <= sorted[i - 1]!.endsOn) throw new BadRequestException(`${t.name} overlaps ${sorted[i - 1]!.name}`);
    }
    if (await db.academicSession.findFirst({ where: { name: input.name } })) throw new BadRequestException(`${input.name} already exists. Manage its terms in Academic Setup.`);
    const at = (d: string) => new Date(`${d}T00:00:00Z`);
    await db.$transaction(async (tx) => {
      await tx.academicSession.updateMany({ data: { isCurrent: false } });
      await tx.term.updateMany({ data: { isCurrent: false } });
      const session = await tx.academicSession.create({ data: { tenantId, name: input.name, startsOn: at(sorted[0]!.startsOn), endsOn: at(sorted.at(-1)!.endsOn), isCurrent: true } });
      await tx.term.createMany({
        data: input.terms.map((t, i) => ({ tenantId, sessionId: session.id, name: t.name, order: sorted.indexOf(t) + 1, startsOn: at(t.startsOn), endsOn: at(t.endsOn), isCurrent: i === input.currentTerm })),
      });
    });
    await this.audit.log({ action: 'setup.year', summary: `Set up ${input.name} with ${input.terms.length} terms` });
    return this.status();
  }

  async classes(input: { stages: StageKey[]; arms: string[]; capacity: number }) {
    const db = this.prisma.db;
    const tenantId = currentTenantId();
    const existing = await db.classLevel.findMany({ include: { arms: { select: { name: true } } } });
    const main = await db.branch.findFirst({ where: { isMain: true }, select: { id: true } });
    let order = existing.reduce((m, l) => Math.max(m, l.order), 0);
    const stageOrder: StageKey[] = ['NURSERY', 'PRIMARY', 'JUNIOR', 'SENIOR'];
    let createdLevels = 0;
    let createdArms = 0;
    for (const stage of stageOrder.filter((s) => input.stages.includes(s))) {
      const t = STAGE_TEMPLATES[stage];
      for (const [name, code] of t.levels) {
        let level = existing.find((l) => l.code.toUpperCase() === code || l.name.toLowerCase() === name.toLowerCase());
        if (!level) {
          const created = await db.classLevel.create({ data: { tenantId, name, code, stage: t.stage, order: ++order } });
          level = { ...created, arms: [] };
          createdLevels++;
        }
        for (const arm of input.arms) {
          if (level.arms.some((a) => a.name.toLowerCase() === arm.toLowerCase())) continue;
          await db.classArm.create({ data: { tenantId, classLevelId: level.id, name: arm, capacity: input.capacity, branchId: main?.id } });
          createdArms++;
        }
      }
    }
    await this.audit.log({ action: 'setup.classes', summary: `Set up classes: ${createdLevels} levels and ${createdArms} classes added` });
    return { createdLevels, createdArms, status: await this.status() };
  }

  /** Creates the chosen subjects (once per code) and links each to every class of its stage. */
  async subjects(input: { selections: { stage: StageKey; codes: string[] }[] }) {
    const db = this.prisma.db;
    const tenantId = currentTenantId();
    const subjects = await db.subject.findMany();
    const levels = await db.classLevel.findMany({ include: { arms: { select: { id: true } } } });
    let createdSubjects = 0;
    let linked = 0;
    for (const sel of input.selections) {
      const template = SUBJECT_TEMPLATES[sel.stage];
      const arms = levels.filter((l) => stageOf(l.stage) === sel.stage).flatMap((l) => l.arms.map((a) => a.id));
      if (!arms.length) throw new BadRequestException(`Create the ${STAGE_TEMPLATES[sel.stage].label.toLowerCase()} classes first`);
      for (const code of sel.codes) {
        const t = template.find(([, c]) => c === code);
        if (!t) throw new BadRequestException(`Unknown subject ${code}`);
        const [name, , category, isCore] = t;
        let subject = subjects.find((s) => s.code.toUpperCase() === code || s.name.toLowerCase() === name.toLowerCase());
        if (!subject) {
          subject = await db.subject.create({ data: { tenantId, name, code, category, isCore } });
          subjects.push(subject);
          createdSubjects++;
        }
        const r = await db.classSubject.createMany({ data: arms.map((classArmId) => ({ tenantId, classArmId, subjectId: subject.id })), skipDuplicates: true });
        linked += r.count;
      }
    }
    await this.audit.log({ action: 'setup.subjects', summary: `Set up subjects: ${createdSubjects} added, ${linked} class links` });
    return { createdSubjects, linked, status: await this.status() };
  }
}
