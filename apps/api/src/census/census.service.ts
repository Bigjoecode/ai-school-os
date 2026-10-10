import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CANDIDATES_DISCLAIMER,
  CENSUS_DISCLAIMER,
  OWNERSHIP_LABELS,
  POWER_SOURCE_LABELS,
  WATER_SOURCE_LABELS,
  censusSettingsSchema,
  type CensusAggregate,
  type CensusAggregateRow,
  type CensusCandidates,
  type CensusCell,
  type CensusProfile,
  type CensusQualityIssue,
  type CensusQuery,
  type CensusReport,
  type CensusSection,
  type CensusSettings,
  type CensusTable,
  type SaveCensusProfileInput,
} from '@aischool/shared';
import { AuditService } from '../audit/audit.service';
import { dateOnly } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Sex = 'MALE' | 'FEMALE';
interface MF {
  m: number;
  f: number;
}
const mf = (): MF => ({ m: 0, f: 0 });
const add = (x: MF, sex: Sex, n = 1) => (sex === 'MALE' ? (x.m += n) : (x.f += n));
const mfRow = (label: string, x: MF, ...extra: CensusCell[]): CensusCell[] => [label, ...extra, x.m, x.f, x.m + x.f];

/** Ages shown one by one; younger or older pupils are grouped at the ends. */
const AGE_MIN = 3;
const AGE_MAX = 20;

const EMPTY_PROFILE: CensusProfile = censusSettingsSchema.shape.main.parse({});

/**
 * Groups free-text qualifications ("B.Sc. (Ed.) Maths", "NCE", "M.Ed.") by
 * the highest one recognised. A convenience for the summary only: the
 * "as recorded" table shows the exact text.
 */
export function qualificationGroup(q: string | null): string {
  if (!q?.trim()) return 'Not recorded';
  const t = new Set(
    q
      .toUpperCase()
      .replace(/\./g, '')
      .split(/[\s,()/&+;-]+/)
      .filter(Boolean),
  );
  const has = (...w: string[]) => w.some((x) => t.has(x));
  if (has('PHD', 'DPHIL', 'EDD')) return 'Doctorate';
  if (has('MED', 'MSC', 'MA', 'MSCED', 'MAED', 'MBA', 'MPHIL', 'MTECH', 'MASTERS')) return 'Master’s degree';
  if (has('PGDE', 'PGDIPED')) return 'PGDE';
  if (has('BED', 'BSCED', 'BAED', 'BTECHED') || (has('BSC', 'BA', 'BTECH') && has('ED', 'EDU', 'EDUCATION'))) return 'Bachelor’s in education';
  if (has('BSC', 'BA', 'BTECH', 'BENG', 'BN', 'BNSC', 'LLB', 'BAGRIC', 'BPHARM', 'MBBS', 'BACHELOR', 'BACHELORS')) return 'Bachelor’s degree';
  if (has('PGD')) return 'Postgraduate diploma';
  if (has('HND')) return 'HND';
  if (has('NCE')) return 'NCE';
  if (has('OND', 'ND')) return 'OND / ND';
  if (has('TC2', 'TCII', 'GRADE')) return 'Teachers’ Grade II';
  if (has('SSCE', 'WASSCE', 'GCE', 'NECO', 'WAEC', 'FSLC')) return 'SSCE / O-level or below';
  return 'Other';
}
const QUAL_ORDER = [
  'Doctorate',
  'Master’s degree',
  'PGDE',
  'Bachelor’s in education',
  'Bachelor’s degree',
  'Postgraduate diploma',
  'HND',
  'NCE',
  'OND / ND',
  'Teachers’ Grade II',
  'SSCE / O-level or below',
  'Other',
  'Not recorded',
];

/** Whole years between two YYYY-MM-DD dates. */
export function ageAt(dob: Date, at: Date): number {
  let age = at.getUTCFullYear() - dob.getUTCFullYear();
  const m = at.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && at.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

function yesNo(v: boolean | null): string {
  return v == null ? 'Not recorded' : v ? 'Yes' : 'No';
}
function num(v: number | null): CensusCell {
  return v == null ? 'Not recorded' : v;
}

@Injectable()
export class CensusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private can(p: string): boolean {
    return currentContext().permissions.has(p as never);
  }

  // ------------------------------------------------------------- profile

  async settings(tenantId = currentTenantId()): Promise<CensusSettings> {
    const t = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { operationsSettings: true } });
    return readCensus(t.operationsSettings);
  }

  branches() {
    return this.prisma.db.branch.findMany({ orderBy: [{ isMain: 'desc' }, { name: 'asc' }], select: { id: true, name: true } });
  }

  async saveProfile(body: SaveCensusProfileInput & { profile: CensusProfile; branchId: string | null }): Promise<CensusSettings> {
    const tenantId = currentTenantId();
    if (body.branchId) await this.prisma.db.branch.findUniqueOrThrow({ where: { id: body.branchId } });
    const t = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { operationsSettings: true } });
    const ops = (t.operationsSettings as Record<string, unknown> | null) ?? {};
    const current = readCensus(ops);
    const next: CensusSettings = {
      main: body.branchId ? current.main : body.profile,
      branches: body.branchId ? { ...current.branches, [body.branchId]: body.profile } : current.branches,
      shareAggregates: body.shareAggregates ?? current.shareAggregates,
    };
    await this.prisma.root.tenant.update({
      where: { id: tenantId },
      data: { operationsSettings: { ...ops, census: next } as unknown as Prisma.InputJsonValue },
    });
    await this.audit.log({
      action: 'census.profile_updated',
      summary: `Updated the school profile for returns${body.branchId ? ' (one campus)' : ''}${body.shareAggregates !== undefined && body.shareAggregates !== current.shareAggregates ? `; anonymous totals sharing ${body.shareAggregates ? 'turned on' : 'turned off'}` : ''}`,
      entityType: 'Tenant',
      entityId: tenantId,
    });
    return next;
  }

  async removeBranchProfile(branchId: string): Promise<CensusSettings> {
    const tenantId = currentTenantId();
    const t = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { operationsSettings: true } });
    const ops = (t.operationsSettings as Record<string, unknown> | null) ?? {};
    const current = readCensus(ops);
    const branches = { ...current.branches };
    delete branches[branchId];
    const next = { ...current, branches };
    await this.prisma.root.tenant.update({ where: { id: tenantId }, data: { operationsSettings: { ...ops, census: next } as unknown as Prisma.InputJsonValue } });
    await this.audit.log({ action: 'census.profile_updated', summary: 'Removed a campus profile for returns (it now uses the whole-school profile)', entityType: 'Tenant', entityId: tenantId });
    return next;
  }

  // -------------------------------------------------------------- report

  async report(q: CensusQuery): Promise<CensusReport> {
    const tenantId = currentTenantId();
    const db = this.prisma.db;
    const [tenant, branches, sessions, levels] = await Promise.all([
      this.prisma.root.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true, address: true, logoUrl: true, operationsSettings: true } }),
      db.branch.findMany({ orderBy: [{ isMain: 'desc' }, { name: 'asc' }], select: { id: true, name: true } }),
      db.academicSession.findMany({ orderBy: { startsOn: 'desc' }, include: { terms: { orderBy: { order: 'asc' } } } }),
      db.classLevel.findMany({ orderBy: [{ order: 'asc' }, { name: 'asc' }], select: { id: true, name: true } }),
    ]);
    const branch = q.branchId ? (branches.find((b) => b.id === q.branchId) ?? null) : null;
    if (q.branchId && !branch) throw new BadRequestException('That campus was not found');
    const session = (q.sessionId ? sessions.find((s) => s.id === q.sessionId) : (sessions.find((s) => s.isCurrent) ?? sessions[0])) ?? null;
    if (q.sessionId && !session) throw new BadRequestException('That session was not found');
    const term = session ? (q.termId ? session.terms.find((t) => t.id === q.termId) : (session.terms.find((t) => t.isCurrent) ?? null)) : null;
    if (q.termId && !term) throw new BadRequestException('That term is not in the chosen session');

    const census = readCensus(tenant.operationsSettings);
    const branchProfile = branch ? census.branches[branch.id] : undefined;
    const profile = branchProfile ?? (hasAnyValue(census.main) ? census.main : null);
    const profileFromMain = !!branch && !branchProfile && !!profile;

    // Arms in scope: arms of the campus, or every arm.
    const arms = await db.classArm.findMany({
      where: branch ? { branchId: branch.id } : {},
      select: { id: true, name: true, classLevelId: true, branchId: true },
    });
    const armIds = new Set(arms.map((a) => a.id));
    const armLevel = new Map(arms.map((a) => [a.id, a.classLevelId]));
    const branchScope: Prisma.StudentWhereInput = branch ? { OR: [{ branchId: branch.id }, { classArm: { branchId: branch.id } }] } : {};

    // ---- Enrolment: today's roll for the current session; promotion records for a past one.
    interface Pupil {
      id: string;
      gender: Sex;
      dateOfBirth: Date | null;
      levelId: string | null;
      admittedOn: Date;
    }
    let basis: CensusReport['enrolmentBasis'] = 'NONE';
    let pupils: Pupil[] = [];
    if (!session || session.isCurrent) {
      const rows = await db.student.findMany({
        where: { status: 'ACTIVE', ...branchScope },
        select: { id: true, gender: true, dateOfBirth: true, classArmId: true, admittedOn: true, classArm: { select: { classLevelId: true } } },
      });
      pupils = rows.map((s) => ({ id: s.id, gender: s.gender, dateOfBirth: s.dateOfBirth, levelId: s.classArm?.classLevelId ?? null, admittedOn: s.admittedOn }));
      basis = 'CURRENT_ROLL';
    } else {
      const promos = await db.studentPromotion.findMany({
        where: { fromSessionId: session.id, ...(branch ? { fromArmId: { in: [...armIds] } } : {}) },
        select: { fromArmId: true, student: { select: { id: true, gender: true, dateOfBirth: true, admittedOn: true } } },
      });
      if (promos.length) {
        basis = 'PROMOTION_RECORDS';
        pupils = promos.map((p) => ({ ...p.student, levelId: p.fromArmId ? (armLevel.get(p.fromArmId) ?? null) : null }));
      }
    }

    const levelName = new Map(levels.map((l) => [l.id, l.name]));
    const streams = new Map<string, number>();
    for (const a of arms) streams.set(a.classLevelId, (streams.get(a.classLevelId) ?? 0) + 1);
    const byLevel = new Map<string | null, MF>();
    for (const p of pupils) {
      const k = p.levelId && levelName.has(p.levelId) ? p.levelId : null;
      if (!byLevel.has(k)) byLevel.set(k, mf());
      add(byLevel.get(k)!, p.gender);
    }
    const total = mf();
    pupils.forEach((p) => add(total, p.gender));
    const enrolRows: CensusCell[][] = levels
      .filter((l) => byLevel.has(l.id) || streams.has(l.id))
      .map((l) => mfRow(l.name, byLevel.get(l.id) ?? mf(), streams.get(l.id) ?? 0));
    if (byLevel.has(null)) enrolRows.push(mfRow('No class assigned', byLevel.get(null)!, 0));

    const sections: CensusSection[] = [];
    sections.push({
      key: 'enrolment',
      title: 'Enrolment by class and sex',
      description:
        basis === 'CURRENT_ROLL'
          ? 'Active pupils on roll today, by class level. Streams are the class arms (A, B, …) at each level.'
          : basis === 'PROMOTION_RECORDS'
            ? `Pupils in each class during ${session?.name}, from the end-of-session promotion records.`
            : `No class records are kept for ${session?.name ?? 'this session'}: past enrolment comes from end-of-session promotion records, and none were made.`,
      tables: [
        {
          key: 'enrolment',
          title: 'Enrolment by class level × sex',
          columns: ['Class', 'Streams', 'Male', 'Female', 'Total'],
          rows: enrolRows,
          totals: mfRow('Total', total, arms.length),
        },
      ],
    });

    // ---- Age × sex, at the session start.
    const asAt = session?.startsOn ?? new Date();
    const ageKey = (age: number) => (age < AGE_MIN ? `Under ${AGE_MIN}` : age > AGE_MAX ? `Over ${AGE_MAX}` : String(age));
    const ageKeys = [`Under ${AGE_MIN}`, ...Array.from({ length: AGE_MAX - AGE_MIN + 1 }, (_, i) => String(AGE_MIN + i)), `Over ${AGE_MAX}`, 'Date of birth missing'];
    const ageMap = new Map<string, MF>(ageKeys.map((k) => [k, mf()]));
    const ageByLevel = new Map<string, Map<string, number>>();
    for (const p of pupils) {
      const k = p.dateOfBirth ? ageKey(ageAt(p.dateOfBirth, asAt)) : 'Date of birth missing';
      add(ageMap.get(k)!, p.gender);
      const lk = p.levelId ?? '';
      if (!ageByLevel.has(k)) ageByLevel.set(k, new Map());
      ageByLevel.get(k)!.set(lk, (ageByLevel.get(k)!.get(lk) ?? 0) + 1);
    }
    const usedAgeKeys = ageKeys.filter((k) => ageMap.get(k)!.m + ageMap.get(k)!.f > 0);
    const levelsWithPupils = levels.filter((l) => byLevel.has(l.id));
    sections.push({
      key: 'age',
      title: 'Enrolment by age and sex',
      description: `Age in completed years on ${dateOnly(asAt)} (the session start). Pupils without a date of birth are counted separately — fix them for an accurate return.`,
      tables: [
        {
          key: 'age-sex',
          title: 'Age × sex',
          columns: ['Age', 'Male', 'Female', 'Total'],
          rows: usedAgeKeys.map((k) => mfRow(k, ageMap.get(k)!)),
          totals: mfRow('Total', total),
        },
        {
          key: 'age-class',
          title: 'Age × class level (both sexes)',
          columns: ['Age', ...levelsWithPupils.map((l) => l.name), ...(byLevel.has(null) ? ['No class'] : []), 'Total'],
          rows: usedAgeKeys.map((k) => {
            const m = ageByLevel.get(k) ?? new Map<string, number>();
            const cells = levelsWithPupils.map((l) => m.get(l.id) ?? 0);
            if (byLevel.has(null)) cells.push(m.get('') ?? 0);
            return [k, ...cells, cells.reduce((a, b) => a + b, 0)];
          }),
          totals: ['Total', ...levelsWithPupils.map((l) => (byLevel.get(l.id)!.m + byLevel.get(l.id)!.f) as CensusCell), ...(byLevel.has(null) ? [byLevel.get(null)!.m + byLevel.get(null)!.f] : []), total.m + total.f],
        },
      ],
    });

    // ---- New entrants and repeaters.
    if (session) {
      const newByLevel = new Map<string | null, MF>();
      const newTotal = mf();
      for (const p of pupils) {
        if (p.admittedOn >= session.startsOn && p.admittedOn <= session.endsOn) {
          if (!newByLevel.has(p.levelId)) newByLevel.set(p.levelId, mf());
          add(newByLevel.get(p.levelId)!, p.gender);
          add(newTotal, p.gender);
        }
      }
      const repeats = await db.studentPromotion.findMany({
        where: { toSessionId: session.id, decision: 'REPEATED', ...(branch ? { toArmId: { in: [...armIds] } } : {}) },
        select: { toArmId: true, fromArmId: true, student: { select: { gender: true } } },
      });
      const repByLevel = new Map<string | null, MF>();
      const repTotal = mf();
      const allArmLevel = branch ? armLevel : new Map((await db.classArm.findMany({ select: { id: true, classLevelId: true } })).map((a) => [a.id, a.classLevelId]));
      for (const r of repeats) {
        const lv = (r.toArmId && allArmLevel.get(r.toArmId)) || (r.fromArmId && allArmLevel.get(r.fromArmId)) || null;
        if (!repByLevel.has(lv)) repByLevel.set(lv, mf());
        add(repByLevel.get(lv)!, r.student.gender);
        add(repTotal, r.student.gender);
      }
      const lvRows = (m: Map<string | null, MF>) => [
        ...levels.filter((l) => m.has(l.id)).map((l) => mfRow(l.name, m.get(l.id)!)),
        ...(m.has(null) ? [mfRow('No class assigned', m.get(null)!)] : []),
      ];
      sections.push({
        key: 'entrants',
        title: 'New entrants and repeaters',
        description: `New entrants: pupils on the roll whose admission date falls within ${session.name} (${dateOnly(session.startsOn)} to ${dateOnly(session.endsOn)}). Repeaters: pupils the end-of-session promotion marked "repeat" into ${session.name}.`,
        tables: [
          { key: 'new-entrants', title: 'New entrants by class × sex', columns: ['Class', 'Male', 'Female', 'Total'], rows: lvRows(newByLevel), totals: mfRow('Total', newTotal) },
          {
            key: 'repeaters',
            title: 'Repeaters by class × sex',
            note: repeats.length ? undefined : 'No repeat decisions are recorded into this session. If pupils repeated, record them in End of session.',
            columns: ['Class', 'Male', 'Female', 'Total'],
            rows: lvRows(repByLevel),
            totals: mfRow('Total', repTotal),
          },
        ],
      });
    }

    // ---- Special needs (entered counts) and health (aggregated welfare data, no names).
    const welfareTables: CensusTable[] = [];
    const sn = profile?.specialNeeds ?? [];
    const snTotal = mf();
    sn.forEach((r) => {
      snTotal.m += r.male;
      snTotal.f += r.female;
    });
    welfareTables.push({
      key: 'special-needs',
      title: 'Pupils with special needs (entered in the profile)',
      note: sn.length ? 'Counts entered by the school in Settings → Returns profile. Use your state form’s own categories.' : 'Not entered yet. Add the counts in Settings → Returns profile.',
      columns: ['Category', 'Male', 'Female', 'Total'],
      rows: sn.map((r) => [r.category, r.male, r.female, r.male + r.female]),
      totals: mfRow('Total', snTotal),
    });
    if (this.can('welfare.read')) {
      const ids = pupils.map((p) => p.id);
      const health = ids.length
        ? await db.student.findMany({ where: { id: { in: ids } }, select: { gender: true, chronicConditions: true, allergies: true, genotype: true } })
        : [];
      const chronic = mf();
      const allergy = mf();
      const ss = mf();
      const recorded = mf();
      for (const h of health) {
        if (h.chronicConditions?.trim()) add(chronic, h.gender);
        if (h.allergies.length) add(allergy, h.gender);
        if (h.genotype && /^S[SC]$/i.test(h.genotype.replace(/\s/g, ''))) add(ss, h.gender);
        if (h.genotype?.trim()) add(recorded, h.gender);
      }
      welfareTables.push({
        key: 'health',
        title: 'Health records (counts only)',
        note: 'From the medical details recorded on pupil records. Counts only — no names leave this page.',
        columns: ['Measure', 'Male', 'Female', 'Total'],
        rows: [
          mfRow('Pupils with a long-term condition recorded', chronic),
          mfRow('Pupils with an allergy recorded', allergy),
          mfRow('Pupils with genotype SS or SC recorded', ss),
          mfRow('Pupils with a genotype recorded at all', recorded),
        ],
      });
      if (term) {
        const visits = await db.sickBayVisit.groupBy({
          by: ['outcome'],
          where: { visitedAt: { gte: term.startsOn, lt: new Date(term.endsOn.getTime() + 86_400_000) }, ...(branch ? { studentId: { in: ids } } : {}) },
          _count: { _all: true },
        });
        welfareTables.push({
          key: 'sick-bay',
          title: `Sick-bay visits in ${term.name}`,
          columns: ['Outcome', 'Visits'],
          rows: visits.map((v) => [v.outcome.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()), v._count._all]),
          totals: ['Total', visits.reduce((a, v) => a + v._count._all, 0)],
        });
      }
    }
    sections.push({
      key: 'welfare',
      title: 'Special needs and health',
      description: this.can('welfare.read') ? 'Aggregated counts only.' : 'Health counts need the “View behaviour, sick-bay and medical details” permission. Special-needs counts come from the returns profile.',
      tables: welfareTables,
    });

    // ---- Teachers.
    const staffRows = await db.staff.findMany({
      where: { status: { in: ['ACTIVE', 'ON_LEAVE'] } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        staffNumber: true,
        gender: true,
        type: true,
        jobTitle: true,
        qualification: true,
        trcnNumber: true,
        dateOfBirth: true,
        classSubjects: { select: { classArmId: true, subject: { select: { name: true } } } },
        classesLed: { select: { id: true } },
      },
    });
    const teachers = staffRows.filter((s) => s.type === 'TEACHING' && (!branch || s.classSubjects.some((c) => armIds.has(c.classArmId)) || s.classesLed.some((c) => armIds.has(c.id))));
    const nonTeaching = staffRows.filter((s) => s.type === 'NON_TEACHING');
    const tTotal = mf();
    teachers.forEach((t) => add(tTotal, t.gender));
    const qual = new Map<string, MF>();
    const qualText = new Map<string, MF>();
    const trcn = { yes: mf(), no: mf() };
    const subj = new Map<string, MF>();
    for (const t of teachers) {
      const g = qualificationGroup(t.qualification);
      if (!qual.has(g)) qual.set(g, mf());
      add(qual.get(g)!, t.gender);
      const raw = t.qualification?.trim() || 'Not recorded';
      if (!qualText.has(raw)) qualText.set(raw, mf());
      add(qualText.get(raw)!, t.gender);
      add(t.trcnNumber?.trim() ? trcn.yes : trcn.no, t.gender);
      const names = new Set(t.classSubjects.filter((c) => !branch || armIds.has(c.classArmId)).map((c) => c.subject.name));
      if (!names.size) names.add('No subject assigned');
      for (const n of names) {
        if (!subj.has(n)) subj.set(n, mf());
        add(subj.get(n)!, t.gender);
      }
    }
    sections.push({
      key: 'teachers',
      title: 'Teachers by sex, qualification and subject',
      description: `Active teaching staff (including those on leave).${branch ? ' For a campus: teachers who teach or lead a class there, so a teacher on two campuses counts on both.' : ''} Qualification groups are worked out from the qualification text — check the “as recorded” table before copying.`,
      tables: [
        {
          key: 'teachers-qualification',
          title: 'Teachers by highest qualification × sex',
          columns: ['Qualification', 'Male', 'Female', 'Total'],
          rows: QUAL_ORDER.filter((k) => qual.has(k)).map((k) => mfRow(k, qual.get(k)!)),
          totals: mfRow('Total', tTotal),
        },
        {
          key: 'teachers-qualification-raw',
          title: 'Qualifications as recorded',
          columns: ['Qualification (as recorded)', 'Male', 'Female', 'Total'],
          rows: [...qualText.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => mfRow(k, v)),
          totals: mfRow('Total', tTotal),
        },
        {
          key: 'teachers-trcn',
          title: 'TRCN registration × sex',
          note: 'Counts teachers with a TRCN number on their HR record. Add numbers in HR → Employees.',
          columns: ['TRCN', 'Male', 'Female', 'Total'],
          rows: [mfRow('Registration number recorded', trcn.yes), mfRow('No number recorded', trcn.no)],
          totals: mfRow('Total', tTotal),
        },
        {
          key: 'teachers-subject',
          title: 'Teachers by subject taught × sex',
          note: 'From class subject assignments. A teacher who teaches several subjects counts under each, so this table does not add up to the number of teachers.',
          columns: ['Subject', 'Male', 'Female', 'Total'],
          rows: [...subj.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => mfRow(k, v)),
        },
      ],
    });

    // ---- Non-teaching staff (not assigned to campuses, so whole-school figures).
    const ntTotal = mf();
    const byTitle = new Map<string, MF>();
    for (const s of nonTeaching) {
      add(ntTotal, s.gender);
      const k = s.jobTitle.trim() || 'Not recorded';
      if (!byTitle.has(k)) byTitle.set(k, mf());
      add(byTitle.get(k)!, s.gender);
    }
    sections.push({
      key: 'nonTeaching',
      title: 'Non-teaching staff',
      description: `Active non-teaching staff by job title.${branch ? ' Staff records are not tied to a campus, so these are whole-school figures.' : ''}`,
      tables: [
        {
          key: 'non-teaching',
          title: 'Non-teaching staff by job title × sex',
          columns: ['Job title', 'Male', 'Female', 'Total'],
          rows: [...byTitle.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => mfRow(k, v)),
          totals: mfRow('Total', ntTotal),
        },
      ],
    });

    // ---- Facilities from the profile.
    const p = profile ?? EMPTY_PROFILE;
    const rooms = [p.classroomsGood, p.classroomsMinorRepairs, p.classroomsMajorRepairs];
    const roomsTotal = rooms.every((x) => x == null) ? null : rooms.reduce<number>((a, b) => a + (b ?? 0), 0);
    sections.push({
      key: 'facilities',
      title: 'School identity and facilities',
      description: profile
        ? profileFromMain
          ? 'This campus has no profile of its own, so the whole-school profile is shown.'
          : 'From Settings → Returns profile.'
        : 'Not filled in yet. Complete Settings → Returns profile.',
      tables: [
        {
          key: 'identity',
          title: 'School identity',
          columns: ['Item', 'Value'],
          rows: [
            ['Ownership', p.ownership ? OWNERSHIP_LABELS[p.ownership] : 'Not recorded'],
            ['Registration / approval number', p.registrationNumber ?? 'Not recorded'],
            ['Year established', num(p.yearEstablished)],
            ['State', p.state ?? 'Not recorded'],
            ['LGA', p.lga ?? 'Not recorded'],
            ['Ward', p.ward ?? 'Not recorded'],
            ['Location', p.locality ? (p.locality === 'URBAN' ? 'Urban' : 'Rural') : 'Not recorded'],
            ['GPS (latitude, longitude)', p.gpsLatitude != null && p.gpsLongitude != null ? `${p.gpsLatitude}, ${p.gpsLongitude}` : 'Not recorded'],
          ],
        },
        {
          key: 'classrooms',
          title: 'Classrooms by condition',
          columns: ['Condition', 'Classrooms'],
          rows: [
            ['Good', num(p.classroomsGood)],
            ['Needs minor repairs', num(p.classroomsMinorRepairs)],
            ['Needs major repairs', num(p.classroomsMajorRepairs)],
          ],
          totals: ['Total', num(roomsTotal)],
        },
        {
          key: 'toilets',
          title: 'Toilets',
          columns: ['Used by', 'Toilets'],
          rows: [
            ['Boys only', num(p.toiletsBoys)],
            ['Girls only', num(p.toiletsGirls)],
            ['Staff only', num(p.toiletsStaff)],
            ['Shared', num(p.toiletsShared)],
          ],
        },
        {
          key: 'facilities',
          title: 'Water, power and other facilities',
          columns: ['Facility', 'Value'],
          rows: [
            ['Water source(s)', p.waterSources.length ? p.waterSources.map((w) => WATER_SOURCE_LABELS[w]).join('; ') : 'Not recorded'],
            ['Power source(s)', p.powerSources.length ? p.powerSources.map((w) => POWER_SOURCE_LABELS[w]).join('; ') : 'Not recorded'],
            ['Hand-washing facility', yesNo(p.handWashing)],
            ['Playground / sports field', yesNo(p.playground)],
            ['Library', yesNo(p.library)],
            ['Sick bay / first aid room', yesNo(p.sickBay)],
            ['Perimeter fence', yesNo(p.fence)],
            ['Science laboratories', num(p.scienceLabs)],
            ['Computer / ICT laboratories', num(p.computerLabs)],
            ['Computers for pupils', num(p.computersForPupils)],
          ],
        },
      ],
    });

    // ---- Attendance for the term (or the whole session).
    const range = term ?? session;
    if (range) {
      const armList = [...armIds];
      const rows = armList.length
        ? await this.prisma.root.$queryRaw<{ classLevelId: string; gender: Sex; status: string; n: bigint; days: bigint }[]>(Prisma.sql`
            SELECT ca."classLevelId", s."gender"::text AS "gender", sa."status"::text AS "status", COUNT(*)::bigint AS n, COUNT(DISTINCT r."date")::bigint AS days
            FROM student_attendance sa
            JOIN attendance_registers r ON r."id" = sa."registerId"
            JOIN class_arms ca ON ca."id" = r."classArmId"
            JOIN students s ON s."id" = sa."studentId"
            WHERE sa."tenantId" = ${tenantId} AND r."tenantId" = ${tenantId}
              AND r."date" >= ${range.startsOn} AND r."date" <= ${range.endsOn}
              AND r."classArmId" IN (${Prisma.join(armList)})
            GROUP BY ca."classLevelId", s."gender", sa."status"`)
        : [];
      const days = armList.length
        ? await this.prisma.root.$queryRaw<{ d: bigint }[]>(Prisma.sql`
            SELECT COUNT(DISTINCT r."date")::bigint AS d FROM attendance_registers r
            WHERE r."tenantId" = ${tenantId} AND r."date" >= ${range.startsOn} AND r."date" <= ${range.endsOn}
              AND r."classArmId" IN (${Prisma.join(armList)})`)
        : [{ d: 0n }];
      interface Att {
        present: MF;
        absent: MF;
      }
      const att = new Map<string, Att>();
      const tot: Att = { present: mf(), absent: mf() };
      for (const r of rows) {
        if (!att.has(r.classLevelId)) att.set(r.classLevelId, { present: mf(), absent: mf() });
        const a = att.get(r.classLevelId)!;
        const n = Number(r.n);
        const bucket = r.status === 'PRESENT' || r.status === 'LATE' ? 'present' : r.status === 'ABSENT' ? 'absent' : null;
        if (!bucket) continue;
        add(a[bucket], r.gender, n);
        add(tot[bucket], r.gender, n);
      }
      const rate = (p: number, a: number): CensusCell => (p + a ? `${Math.round((p / (p + a)) * 1000) / 10}%` : '—');
      const attRow = (label: string, a: Att): CensusCell[] => [label, a.present.m, a.absent.m, rate(a.present.m, a.absent.m), a.present.f, a.absent.f, rate(a.present.f, a.absent.f), rate(a.present.m + a.present.f, a.absent.m + a.absent.f)];
      sections.push({
        key: 'attendance',
        title: `Attendance summary — ${term ? `${term.name}, ${session!.name}` : session!.name}`,
        description: `From the daily registers between ${dateOnly(range.startsOn)} and ${dateOnly(range.endsOn)}: ${Number(days[0]?.d ?? 0)} school days had at least one register. Present includes late; excused absences are left out of the rate.`,
        tables: [
          {
            key: 'attendance',
            title: 'Pupil-days present and absent by class × sex',
            columns: ['Class', 'Male present', 'Male absent', 'Male rate', 'Female present', 'Female absent', 'Female rate', 'Overall rate'],
            rows: levels.filter((l) => att.has(l.id)).map((l) => attRow(l.name, att.get(l.id)!)),
            totals: attRow('Total', tot),
          },
        ],
      });
    }

    // ---- Data quality.
    const quality = await this.quality(pupils, teachers, nonTeaching, profile);

    return {
      disclaimer: CENSUS_DISCLAIMER,
      school: { name: tenant.name, address: tenant.address, logoUrl: tenant.logoUrl },
      branches,
      levels,
      branch,
      sessions: sessions.map((s) => ({ id: s.id, name: s.name, isCurrent: s.isCurrent, terms: s.terms.map((t) => ({ id: t.id, name: t.name, isCurrent: t.isCurrent })) })),
      session: session ? { id: session.id, name: session.name, startsOn: dateOnly(session.startsOn)!, endsOn: dateOnly(session.endsOn)!, isCurrent: session.isCurrent } : null,
      term: term ? { id: term.id, name: term.name, startsOn: dateOnly(term.startsOn)!, endsOn: dateOnly(term.endsOn)! } : null,
      ageAsAt: dateOnly(asAt),
      enrolmentBasis: basis,
      profile,
      profileFromMain,
      sections,
      quality,
      generatedAt: new Date().toISOString(),
    };
  }

  private async quality(
    pupils: { id: string; dateOfBirth: Date | null; levelId: string | null }[],
    teachers: { id: string; firstName: string; lastName: string; staffNumber: string; qualification: string | null; trcnNumber: string | null; dateOfBirth: Date | null; classSubjects: unknown[] }[],
    nonTeaching: { id: string; firstName: string; lastName: string; staffNumber: string; dateOfBirth: Date | null }[],
    profile: CensusProfile | null,
  ): Promise<CensusQualityIssue[]> {
    const issues: CensusQualityIssue[] = [];
    const noDob = pupils.filter((p) => !p.dateOfBirth);
    const noClass = pupils.filter((p) => !p.levelId);
    const sample = async (ids: string[]) =>
      ids.length
        ? (await this.prisma.db.student.findMany({ where: { id: { in: ids.slice(0, 5) } }, select: { firstName: true, lastName: true, admissionNumber: true } })).map(
            (s) => `${s.firstName} ${s.lastName} (${s.admissionNumber})`,
          )
        : [];
    const staffName = (s: { firstName: string; lastName: string; staffNumber: string }) => `${s.firstName} ${s.lastName} (${s.staffNumber})`;
    const push = (i: CensusQualityIssue) => i.count > 0 && issues.push(i);
    push({ key: 'student-dob', label: 'Pupils without a date of birth (needed for the age table)', count: noDob.length, fixTo: '/students', fixLabel: 'Students', examples: await sample(noDob.map((p) => p.id)) });
    push({ key: 'student-class', label: 'Pupils on roll with no class', count: noClass.length, fixTo: '/students', fixLabel: 'Students', examples: await sample(noClass.map((p) => p.id)) });
    const tq = teachers.filter((t) => !t.qualification?.trim());
    push({ key: 'teacher-qualification', label: 'Teachers without a qualification recorded', count: tq.length, fixTo: '/hr/employees', fixLabel: 'HR → Employees', examples: tq.slice(0, 5).map(staffName) });
    const tq2 = teachers.filter((t) => t.qualification?.trim() && qualificationGroup(t.qualification) === 'Other');
    push({ key: 'teacher-qualification-unknown', label: 'Teacher qualifications the summary could not group (check spelling, e.g. “B.Sc. (Ed.)”, “NCE”)', count: tq2.length, fixTo: '/hr/employees', fixLabel: 'HR → Employees', examples: tq2.slice(0, 5).map((t) => `${staffName(t)}: ${t.qualification}`) });
    const tt = teachers.filter((t) => !t.trcnNumber?.trim());
    push({ key: 'teacher-trcn', label: 'Teachers without a TRCN number recorded', count: tt.length, fixTo: '/hr/employees', fixLabel: 'HR → Employees', examples: tt.slice(0, 5).map(staffName) });
    const ts = teachers.filter((t) => !t.classSubjects.length);
    push({ key: 'teacher-subjects', label: 'Teachers with no subject assigned', count: ts.length, fixTo: '/academics', fixLabel: 'Academic setup', examples: ts.slice(0, 5).map(staffName) });
    const sd = [...teachers, ...nonTeaching].filter((s) => !s.dateOfBirth);
    push({ key: 'staff-dob', label: 'Staff without a date of birth', count: sd.length, fixTo: '/hr/employees', fixLabel: 'HR → Employees', examples: sd.slice(0, 5).map(staffName) });
    const p = profile;
    const missing = [
      !p?.ownership && 'ownership',
      !p?.registrationNumber && 'registration number',
      !p?.state && 'state',
      !p?.lga && 'LGA',
      !p?.ward && 'ward',
      (p?.classroomsGood ?? p?.classroomsMinorRepairs ?? p?.classroomsMajorRepairs) == null && 'classrooms',
      (p?.toiletsBoys ?? p?.toiletsGirls ?? p?.toiletsShared) == null && 'toilets',
      !p?.waterSources.length && 'water source',
      !p?.powerSources.length && 'power source',
    ].filter(Boolean) as string[];
    push({ key: 'profile', label: 'Returns profile items not filled in', count: missing.length, fixTo: '/settings/returns', fixLabel: 'Settings → Returns profile', examples: missing });
    return issues;
  }

  // ---------------------------------------------------------- candidates

  async candidates(classLevelId: string, branchId?: string): Promise<CensusCandidates> {
    const db = this.prisma.db;
    const [level, levels] = await Promise.all([
      db.classLevel.findUniqueOrThrow({ where: { id: classLevelId }, select: { id: true, name: true } }),
      db.classLevel.findMany({ orderBy: [{ order: 'asc' }, { name: 'asc' }], select: { id: true, name: true } }),
    ]);
    const students = await db.student.findMany({
      where: {
        status: 'ACTIVE',
        classArm: { classLevelId, ...(branchId ? { branchId } : {}) },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        admissionNumber: true,
        firstName: true,
        middleName: true,
        lastName: true,
        gender: true,
        dateOfBirth: true,
        classArm: { select: { name: true, subjects: { select: { subject: { select: { name: true } } } } } },
      },
    });
    await this.audit.log({
      action: 'census.candidates_viewed',
      summary: `Opened the exam candidate working list for ${level.name} (${students.length} pupils)`,
      entityType: 'ClassLevel',
      entityId: level.id,
    });
    return {
      disclaimer: CANDIDATES_DISCLAIMER,
      classLevel: level,
      classLevels: levels,
      candidates: students.map((s) => ({
        admissionNumber: s.admissionNumber,
        lastName: s.lastName,
        firstName: s.firstName,
        middleName: s.middleName,
        sex: s.gender === 'MALE' ? 'M' : 'F',
        dateOfBirth: dateOnly(s.dateOfBirth),
        classArm: `${level.name} ${s.classArm?.name ?? ''}`.trim(),
        subjects: [...new Set((s.classArm?.subjects ?? []).map((c) => c.subject.name))].sort(),
      })),
    };
  }

  // ------------------------------------------------------- platform preview

  /** Counts only, from schools that opted in. No names, no per-pupil data. */
  async aggregate(state?: string): Promise<CensusAggregate> {
    const root = this.prisma.root;
    const tenants = await root.tenant.findMany({ select: { id: true, operationsSettings: true } });
    const opted = tenants
      .map((t) => ({ id: t.id, census: readCensus(t.operationsSettings) }))
      .filter((t) => t.census.shareAggregates && (!state || (t.census.main.state ?? '').toLowerCase() === state.toLowerCase()));
    const ids = opted.map((t) => t.id);
    const [pupils, teachers] = ids.length
      ? await Promise.all([
          root.student.groupBy({ by: ['tenantId', 'gender'], where: { tenantId: { in: ids }, status: 'ACTIVE' }, _count: { _all: true } }),
          root.staff.groupBy({ by: ['tenantId', 'gender'], where: { tenantId: { in: ids }, type: 'TEACHING', status: { in: ['ACTIVE', 'ON_LEAVE'] } }, _count: { _all: true } }),
        ])
      : [[], []];
    const rows = new Map<string, CensusAggregateRow>();
    for (const t of opted) {
      const st = t.census.main.state ?? 'State not set';
      const lga = t.census.main.lga ?? 'LGA not set';
      const k = `${st}|${lga}`;
      if (!rows.has(k)) rows.set(k, { state: st, lga, schools: 0, pupilsMale: 0, pupilsFemale: 0, teachersMale: 0, teachersFemale: 0, classrooms: 0 });
      const r = rows.get(k)!;
      r.schools++;
      for (const p of pupils.filter((x) => x.tenantId === t.id)) p.gender === 'MALE' ? (r.pupilsMale += p._count._all) : (r.pupilsFemale += p._count._all);
      for (const p of teachers.filter((x) => x.tenantId === t.id)) p.gender === 'MALE' ? (r.teachersMale += p._count._all) : (r.teachersFemale += p._count._all);
      const m = t.census.main;
      r.classrooms += (m.classroomsGood ?? 0) + (m.classroomsMinorRepairs ?? 0) + (m.classroomsMajorRepairs ?? 0);
    }
    return {
      preview: true,
      note: 'Preview. Totals from schools that opted in under Settings → Returns profile. Counts only; no names or pupil-level data. Not an official statistic.',
      optedIn: opted.length,
      totalSchools: tenants.length,
      rows: [...rows.values()].sort((a, b) => a.state.localeCompare(b.state) || a.lga.localeCompare(b.lga)),
    };
  }
}

function hasAnyValue(p: CensusProfile): boolean {
  return Object.values(p).some((v) => (Array.isArray(v) ? v.length > 0 : v != null));
}

export function readCensus(ops: unknown): CensusSettings {
  const raw = (ops as { census?: unknown } | null)?.census;
  const parsed = censusSettingsSchema.safeParse(raw ?? { main: {} });
  return parsed.success ? parsed.data : censusSettingsSchema.parse({ main: {} });
}
