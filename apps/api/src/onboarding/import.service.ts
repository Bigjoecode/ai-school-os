import { BadRequestException, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  IMPORT_FIELDS,
  parseGender,
  parseSchoolDate,
  type AssessmentComponent,
  type ImportKind,
  type ImportPreview,
  type ImportRequest,
  type ImportResult,
  type ImportRowResult,
} from '@aischool/shared';
import { AssessmentSettingsService } from '../assessment/assessment-settings.service';
import { AuditService } from '../audit/audit.service';
import { hashPassword } from '../auth/password';
import { currentContext, currentTenantId } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { csvCell, normHeader, parseCsv } from './csv';

const MAX_ROWS = 5000;
const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const TITLES = /^(mr|mrs|miss|ms|dr|chief|alhaji|alhaja|pastor|rev|prof|engr|barr|hon|sir|lady)\.?\s+/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** 0803 123 4567, +234 803 123 4567, 2348031234567 → 08031234567. */
export function normPhone(v: string): string | null {
  let d = v.replace(/[^\d+]/g, '');
  if (d.startsWith('+234')) d = `0${d.slice(4)}`;
  else if (d.startsWith('234') && d.length === 13) d = `0${d.slice(3)}`;
  d = d.replace(/\+/g, '');
  if (d.length === 10 && /^[789]/.test(d)) d = `0${d}`;
  return d.length >= 7 && d.length <= 15 ? d : null;
}

/** "Mr Emeka Okafor" → { first: Emeka, last: Okafor }; "Mr Okoro" → { first: Mr, last: Okoro }; "Emeka" → the family surname. */
function splitName(full: string, fallbackLast: string) {
  const title = TITLES.exec(full.trim())?.[1];
  const parts = full.replace(TITLES, '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  if (parts.length === 1) {
    if (title) return { first: title.charAt(0).toUpperCase() + title.slice(1).toLowerCase(), last: parts[0]! };
    return parts[0]!.toLowerCase() === fallbackLast.toLowerCase() ? { first: 'Parent', last: fallbackLast } : { first: parts[0]!, last: fallbackLast };
  }
  return { first: parts.slice(0, -1).join(' '), last: parts.at(-1)! };
}

/** "JSS 1 Gold" → the JSS 1 level and arm "Gold" (level name or code, spaces optional). */
function splitClass<L extends { name: string; code: string }>(cls: string, levels: L[]): { level: L; arm: string } | null {
  const text = cls.trim();
  for (const level of [...levels].sort((a, b) => b.name.length - a.name.length)) {
    for (const n of [level.name, level.code]) {
      const pattern = compact(n).split('').join('[\\s\\-_.]*');
      const m = new RegExp(`^${pattern}[\\s\\-_.]*`, 'i').exec(text);
      if (m && text.length > m[0].length) return { level, arm: text.slice(m[0].length).trim() };
    }
  }
  return null;
}

const titleCase = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/\b([a-z])([a-z']*)/gi, (_m, a: string, b: string) => a.toUpperCase() + b.toLowerCase());
const password = () => randomBytes(9).toString('base64').replace(/[+/=]/g, '').slice(0, 10) + '7a';

interface Parsed {
  columns: { header: string; field: string | null }[];
  missingRequired: string[];
  rows: { line: number; get: (field: string) => string; raw: Record<string, string> }[];
}

interface StudentOp {
  line: number;
  action: 'CREATE' | 'UPDATE';
  existingId?: string;
  data: { firstName: string; middleName: string | null; lastName: string; gender: 'MALE' | 'FEMALE'; dateOfBirth: string | null; admittedOn: string | null; address: string | null; medicalNotes: string | null; admissionNumber: string | null };
  classArmId: string | null;
  newArm: { levelId: string; name: string; label: string } | null;
  /** School house, matched by name ("Aggrey" or "Aggrey House"). */
  houseId: string | null;
  parents: { key: string; first: string; last: string; relationship: string; phone: string; email: string | null }[];
}
interface StaffOp {
  line: number;
  action: 'CREATE' | 'UPDATE';
  existingId?: string;
  data: { firstName: string; lastName: string; gender: 'MALE' | 'FEMALE'; email: string | null; phone: string | null; jobTitle: string; type: 'TEACHING' | 'NON_TEACHING'; employedOn: string | null; staffNumber: string | null };
  department: string | null;
  roleId: string | null;
}
interface ScoreOp {
  line: number;
  studentId: string;
  subjectId: string;
  classArmId: string;
  scores: { key: string; value: number }[];
}

/**
 * CSV imports for onboarding: students with their parents, staff, and past
 * results. One code path plans the import (validating every row against the
 * school's own classes, subjects and records); preview returns the plan and
 * commit re-plans from the same file and executes it, so what was previewed
 * is what is written.
 */
@Injectable()
export class ImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AssessmentSettingsService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------- shared

  private parse(kind: ImportKind, csv: string, components: AssessmentComponent[] = []): Parsed {
    const { headers, rows } = parseCsv(csv);
    if (!headers.length) throw new BadRequestException('The file is empty');
    if (rows.length > MAX_ROWS) throw new BadRequestException(`Import at most ${MAX_ROWS.toLocaleString('en-NG')} rows at a time; split the file`);
    const fields = [
      ...IMPORT_FIELDS[kind],
      ...components.map((c) => ({ field: `score:${c.key}`, label: c.name, aliases: [c.name, c.key, c.key.replace(/(\d+)/, ' $1')], required: false })),
    ];
    const used = new Set<string>();
    const columns = headers.map((header) => {
      const h = normHeader(header);
      const f = fields.find((x) => !used.has(x.field) && (normHeader(x.field) === h || compact(x.field) === compact(h) || x.aliases.some((a) => normHeader(a) === h || compact(a) === compact(h))));
      if (f) used.add(f.field);
      return { header, field: f?.field ?? null };
    });
    const missingRequired = IMPORT_FIELDS[kind].filter((f) => f.required && !used.has(f.field)).map((f) => f.label);
    return {
      columns,
      missingRequired,
      rows: rows.map((r) => {
        const raw: Record<string, string> = {};
        columns.forEach((c, i) => c.field && (raw[c.field] = r.values[i] ?? ''));
        return { line: r.line, raw, get: (f: string) => (raw[f] ?? '').trim() };
      }),
    };
  }

  private totals(rows: ImportRowResult[]) {
    return {
      create: rows.filter((r) => r.status === 'CREATE').length,
      update: rows.filter((r) => r.status === 'UPDATE').length,
      skip: rows.filter((r) => r.status === 'SKIP').length,
      error: rows.filter((r) => r.status === 'ERROR').length,
    };
  }

  template(kind: ImportKind, components: AssessmentComponent[]): string {
    const fields = kind === 'RESULTS' ? [...IMPORT_FIELDS.RESULTS.map((f) => ({ header: f.label, example: f.example })), ...components.map((c) => ({ header: c.name, example: String(Math.round(c.maxScore * 0.7)) }))] : IMPORT_FIELDS[kind].map((f) => ({ header: f.label, example: f.example }));
    return `${fields.map((f) => csvCell(f.header)).join(',')}\r\n${fields.map((f) => csvCell(f.example)).join(',')}\r\n`;
  }

  async templateFor(kind: ImportKind) {
    return this.template(kind, kind === 'RESULTS' ? (await this.settings.get()).components : []);
  }

  // ---------------------------------------------------------- students

  private async planStudents(req: ImportRequest) {
    const p = this.parse('STUDENTS', req.csv);
    const db = this.prisma.db;
    const [levels, existing, guardians, houses] = await Promise.all([
      db.classLevel.findMany({ include: { arms: true } }),
      db.student.findMany({ select: { id: true, admissionNumber: true, firstName: true, lastName: true, dateOfBirth: true } }),
      db.guardian.findMany({ select: { id: true, phone: true } }),
      db.house.findMany({ select: { id: true, name: true } }),
    ]);
    const houseKey = (s: string) => compact(s.replace(/\s*house$/i, ''));
    const houseIds = new Map(houses.map((h) => [houseKey(h.name), h.id]));
    const armKeys = new Map<string, { id: string; label: string }>();
    for (const l of levels) for (const a of l.arms) for (const name of [l.name, l.code]) armKeys.set(compact(`${name}${a.name}`), { id: a.id, label: `${l.name} ${a.name}` });
    const byAdm = new Map(existing.map((s) => [s.admissionNumber.toLowerCase(), s.id]));
    // Rows without an admission number are matched by name (and date of birth when both have one), so a re-upload doesn't duplicate them.
    const byName = new Map<string, { id: string; dob: string | null; adm: string }[]>();
    for (const s of existing) {
      const k = compact(`${s.firstName}${s.lastName}`);
      byName.set(k, [...(byName.get(k) ?? []), { id: s.id, dob: s.dateOfBirth?.toISOString().slice(0, 10) ?? null, adm: s.admissionNumber }]);
    }
    const knownPhones = new Set(guardians.map((g) => normPhone(g.phone)).filter(Boolean) as string[]);
    const seenAdm = new Set<string>();
    const newArms = new Map<string, { levelId: string; name: string; label: string }>();
    const newParents = new Set<string>();
    const results: ImportRowResult[] = [];
    const ops: StudentOp[] = [];

    for (const r of p.rows) {
      const msgs: string[] = [];
      const first = titleCase(r.get('firstName'));
      const last = titleCase(r.get('lastName'));
      const label = [first, last].filter(Boolean).join(' ') || `Line ${r.line}`;
      if (first.length < 1) msgs.push('First name is missing');
      if (last.length < 1) msgs.push('Surname is missing');
      const gender = parseGender(r.get('gender'));
      if (!gender) msgs.push(`Gender "${r.get('gender')}" isn't M or F`);
      const dob = r.get('dateOfBirth') ? parseSchoolDate(r.get('dateOfBirth')) : null;
      if (r.get('dateOfBirth') && !dob) msgs.push(`Date of birth "${r.get('dateOfBirth')}" isn't a date`);
      const admitted = r.get('admittedOn') ? parseSchoolDate(r.get('admittedOn')) : null;
      if (r.get('admittedOn') && !admitted) msgs.push(`Admission date "${r.get('admittedOn')}" isn't a date`);
      const adm = r.get('admissionNumber');
      if (adm.length > 30) msgs.push('Admission number is longer than 30 characters');
      if (adm && seenAdm.has(adm.toLowerCase())) msgs.push(`Admission number ${adm} appears twice in the file`);
      if (adm) seenAdm.add(adm.toLowerCase());

      let classArmId: string | null = null;
      let newArm: StudentOp['newArm'] = null;
      const cls = r.get('class');
      if (cls) {
        const hit = armKeys.get(compact(cls));
        if (hit) classArmId = hit.id;
        else {
          // "JSS 1 C" where JSS 1 exists but arm C doesn't.
          const split = splitClass(cls, levels);
          const level = split?.level;
          const armName = split?.arm ?? '';
          if (level && req.options.createMissingArms && armName) {
            const key = `${level.id}|${armName.toLowerCase()}`;
            newArm = newArms.get(key) ?? { levelId: level.id, name: armName.toUpperCase().length <= 2 ? armName.toUpperCase() : titleCase(armName), label: `${level.name} ${armName}` };
            newArms.set(key, newArm);
          } else msgs.push(level ? `Class "${cls}" doesn't exist (tick "create missing classes" to add it)` : `Class "${cls}" doesn't match any class level`);
        }
      }

      const houseName = r.get('house');
      const houseId = houseName ? (houseIds.get(houseKey(houseName)) ?? null) : null;
      if (houseName && !houseId) msgs.push(`House "${houseName}" doesn't exist, so it wasn't added (create it on the Houses page first)`);

      const parents: StudentOp['parents'] = [];
      for (const [n, rel, ph, em, def] of [
        ['parentName', 'parentRelationship', 'parentPhone', 'parentEmail', 'Parent'],
        ['parent2Name', 'parent2Relationship', 'parent2Phone', 'parent2Email', 'Parent'],
      ] as const) {
        const nm = r.get(n);
        const phone = r.get(ph) ? normPhone(r.get(ph)) : null;
        const email = r.get(em).toLowerCase();
        if (!nm && !r.get(ph)) continue;
        if (r.get(ph) && !phone) {
          msgs.push(`Phone "${r.get(ph)}" isn't a valid number`);
          continue;
        }
        if (!phone) {
          msgs.push(`${nm || 'Parent'} has no phone number, so wasn't added (a phone is required)`);
          continue;
        }
        if (email && !EMAIL.test(email)) msgs.push(`Email "${email}" isn't valid`);
        const name = splitName(nm || `${def} ${last}`, last) ?? { first: def, last };
        parents.push({ key: phone, first: titleCase(name.first), last: titleCase(name.last), relationship: titleCase(r.get(rel) || 'Parent').slice(0, 30), phone, email: email && EMAIL.test(email) ? email : null });
      }

      const sameName = !adm ? (byName.get(compact(`${first}${last}`)) ?? []).filter((x) => !dob || !x.dob || x.dob === dob) : [];
      const exists = adm ? byAdm.get(adm.toLowerCase()) : sameName.length === 1 ? sameName[0]!.id : undefined;
      if (!adm && sameName.length > 1) msgs.push(`${sameName.length} students called ${first} ${last} are already on record: add the admission number to say which`);
      const fatal = msgs.filter((m) => !m.includes('wasn\'t added'));
      if (fatal.length) {
        results.push({ line: r.line, status: 'ERROR', label, messages: msgs });
        continue;
      }
      if (exists && !req.options.updateExisting) {
        results.push({ line: r.line, status: 'SKIP', label, messages: [`${adm || `${first} ${last} (${sameName[0]?.adm})`} is already on record (tick "update existing" to update it)`, ...msgs] });
        continue;
      }
      results.push({ line: r.line, status: exists ? 'UPDATE' : 'CREATE', label: `${label}${adm ? ` (${adm})` : ''}`, messages: msgs });
      // Only rows that will be imported bring in parents.
      for (const p of parents) if (!knownPhones.has(p.key)) newParents.add(p.key);
      ops.push({
        line: r.line,
        action: exists ? 'UPDATE' : 'CREATE',
        existingId: exists,
        data: { firstName: first, middleName: titleCase(r.get('middleName')) || null, lastName: last, gender: gender!, dateOfBirth: dob, admittedOn: admitted, address: r.get('address') || null, medicalNotes: r.get('medicalNotes') || null, admissionNumber: adm || null },
        classArmId,
        newArm,
        houseId,
        parents,
      });
    }
    const logins = req.options.createLogins ? new Set(ops.flatMap((o) => o.parents.map((x) => x.email)).filter(Boolean)).size : 0;
    const extras = [
      newArms.size ? `${newArms.size} new class${newArms.size === 1 ? '' : 'es'}: ${[...newArms.values()].map((a) => a.label).join(', ')}` : '',
      newParents.size ? `${newParents.size} parent record${newParents.size === 1 ? '' : 's'} (parents are matched by phone, so siblings share one)` : '',
      logins ? `Up to ${logins} parent portal logins` : '',
    ].filter(Boolean);
    return { preview: { kind: 'STUDENTS' as const, columns: p.columns, missingRequired: p.missingRequired, rows: results, totals: this.totals(results), extras }, ops };
  }

  private async commitStudents(ops: StudentOp[], createLogins: boolean) {
    const db = this.prisma.db;
    const tenantId = currentTenantId();
    // New arms first.
    const armIds = new Map<string, string>();
    for (const op of ops) {
      if (!op.newArm) continue;
      const key = `${op.newArm.levelId}|${op.newArm.name.toLowerCase()}`;
      if (!armIds.has(key)) {
        const found = await db.classArm.findFirst({ where: { classLevelId: op.newArm.levelId, name: { equals: op.newArm.name, mode: 'insensitive' } } });
        armIds.set(key, found?.id ?? (await db.classArm.create({ data: { tenantId, classLevelId: op.newArm.levelId, name: op.newArm.name } })).id);
      }
      op.classArmId = armIds.get(key)!;
    }
    // Admission numbers for rows without one.
    const tenant = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { slug: true, shortName: true } });
    const prefix = `${(tenant.shortName ?? tenant.slug).replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase()}/${new Date().getFullYear()}/`;
    const last = await db.student.findFirst({ where: { admissionNumber: { startsWith: prefix } }, orderBy: { admissionNumber: 'desc' }, select: { admissionNumber: true } });
    let next = (last ? Number(last.admissionNumber.slice(prefix.length)) || 0 : 0) + 1;
    const date = (d: string | null) => (d ? new Date(`${d}T00:00:00Z`) : null);

    const studentIds = new Map<number, string>();
    const creates = ops.filter((o) => o.action === 'CREATE');
    for (let i = 0; i < creates.length; i += 500) {
      const chunk = creates.slice(i, i + 500);
      const made = await db.student.createManyAndReturn({
        data: chunk.map((o) => ({
          tenantId,
          ...o.data,
          admissionNumber: o.data.admissionNumber ?? `${prefix}${String(next++).padStart(4, '0')}`,
          dateOfBirth: date(o.data.dateOfBirth),
          admittedOn: date(o.data.admittedOn) ?? new Date(),
          classArmId: o.classArmId,
          houseId: o.houseId,
        })),
        select: { id: true },
      });
      chunk.forEach((o, k) => studentIds.set(o.line, made[k]!.id));
    }
    for (const o of ops.filter((x) => x.action === 'UPDATE')) {
      const { admissionNumber: _a, ...data } = o.data;
      await db.student.update({ where: { id: o.existingId! }, data: { ...data, dateOfBirth: date(o.data.dateOfBirth) ?? undefined, admittedOn: date(o.data.admittedOn) ?? undefined, ...(o.classArmId ? { classArmId: o.classArmId } : {}), ...(o.houseId ? { houseId: o.houseId } : {}) } });
      studentIds.set(o.line, o.existingId!);
    }

    // Parents: one per phone across the school.
    const existing = await db.guardian.findMany({ select: { id: true, phone: true, email: true, userId: true, firstName: true, lastName: true } });
    const byPhone = new Map(existing.map((g) => [normPhone(g.phone) ?? g.phone, g]));
    const wanted = new Map<string, StudentOp['parents'][number]>();
    for (const o of ops) for (const p of o.parents) if (!byPhone.has(p.key) && !wanted.has(p.key)) wanted.set(p.key, p);
    const newGuardians = [...wanted.values()];
    for (let i = 0; i < newGuardians.length; i += 500) {
      const made = await db.guardian.createManyAndReturn({
        data: newGuardians.slice(i, i + 500).map((g) => ({ tenantId, firstName: g.first, lastName: g.last, relationship: g.relationship, phone: g.phone, email: g.email })),
        select: { id: true, phone: true, email: true, userId: true, firstName: true, lastName: true },
      });
      for (const g of made) byPhone.set(normPhone(g.phone) ?? g.phone, g);
    }
    const links = ops.flatMap((o) => o.parents.map((p, k) => ({ tenantId, studentId: studentIds.get(o.line)!, guardianId: byPhone.get(p.key)!.id, isPrimary: k === 0 })));
    if (links.length) await db.studentGuardian.createMany({ data: links, skipDuplicates: true });

    // Parent portal logins (for parents with an email and no login yet).
    const credentials: string[][] = [];
    if (createLogins) {
      const role = await db.role.findFirst({ where: { key: 'parent' } });
      if (!role) throw new BadRequestException('This school has no Parent role');
      const todo = [...byPhone.values()].filter((g) => g.email && !g.userId && wanted.has(normPhone(g.phone) ?? g.phone));
      await this.makeLogins(
        todo.map((g) => ({ email: g.email!, firstName: g.firstName, lastName: g.lastName, roleId: role.id, roleName: 'Parent', link: (userId) => db.guardian.update({ where: { id: g.id }, data: { userId } }) })),
        credentials,
      );
    }
    return { created: creates.length, updated: ops.length - creates.length, parents: newGuardians.length, credentials };
  }

  /** Creates (or reuses) user accounts and school memberships; new accounts get a one-time password. */
  private async makeLogins(people: { email: string; firstName: string; lastName: string; roleId: string; roleName: string; link: (userId: string) => Promise<unknown> }[], credentials: string[][]) {
    const tenantId = currentTenantId();
    for (let i = 0; i < people.length; i += 10) {
      await Promise.all(
        people.slice(i, i + 10).map(async (p) => {
          let user = await this.prisma.root.user.findUnique({ where: { email: p.email } });
          if (!user) {
            const pw = password();
            user = await this.prisma.root.user.create({ data: { email: p.email, firstName: p.firstName, lastName: p.lastName, passwordHash: await hashPassword(pw) } });
            credentials.push([`${p.firstName} ${p.lastName}`, p.email, pw, p.roleName]);
          } else credentials.push([`${p.firstName} ${p.lastName}`, p.email, '(existing account: use their current password)', p.roleName]);
          const m = await this.prisma.root.membership.upsert({ where: { tenantId_userId: { tenantId, userId: user.id } }, update: { status: 'ACTIVE' }, create: { tenantId, userId: user.id } });
          await this.prisma.root.membershipRole.createMany({ data: [{ membershipId: m.id, roleId: p.roleId }], skipDuplicates: true });
          await p.link(user.id);
        }),
      );
    }
  }

  // ---------------------------------------------------------- staff

  private async planStaff(req: ImportRequest) {
    const p = this.parse('STAFF', req.csv);
    const db = this.prisma.db;
    const [existing, departments, roles] = await Promise.all([
      db.staff.findMany({ select: { id: true, staffNumber: true, email: true } }),
      db.department.findMany({ select: { name: true } }),
      db.role.findMany({ select: { id: true, key: true, name: true } }),
    ]);
    const byNumber = new Map(existing.map((s) => [s.staffNumber.toLowerCase(), s.id]));
    const byEmail = new Map(existing.filter((s) => s.email).map((s) => [s.email!.toLowerCase(), s.id]));
    const newDepts = new Set<string>();
    const seen = new Set<string>();
    const results: ImportRowResult[] = [];
    const ops: StaffOp[] = [];
    for (const r of p.rows) {
      const msgs: string[] = [];
      const first = titleCase(r.get('firstName'));
      const last = titleCase(r.get('lastName'));
      const label = [first, last].filter(Boolean).join(' ') || `Line ${r.line}`;
      if (!first) msgs.push('First name is missing');
      if (!last) msgs.push('Surname is missing');
      const gender = parseGender(r.get('gender'));
      if (!gender) msgs.push(`Gender "${r.get('gender')}" isn't M or F`);
      const jobTitle = r.get('jobTitle').slice(0, 80);
      if (!jobTitle) msgs.push('Job title is missing');
      const email = r.get('email').toLowerCase();
      if (email && !EMAIL.test(email)) msgs.push(`Email "${email}" isn't valid`);
      const phone = r.get('phone') ? normPhone(r.get('phone')) : null;
      if (r.get('phone') && !phone) msgs.push(`Phone "${r.get('phone')}" isn't a valid number`);
      const employed = r.get('employedOn') ? parseSchoolDate(r.get('employedOn')) : null;
      if (r.get('employedOn') && !employed) msgs.push(`Date "${r.get('employedOn')}" isn't a date`);
      const t = r.get('type').toLowerCase();
      const type: StaffOp['data']['type'] = t ? (/non|admin|support/.test(t) ? 'NON_TEACHING' : 'TEACHING') : /teacher|tutor|lecturer|instructor/i.test(jobTitle) ? 'TEACHING' : 'NON_TEACHING';
      const roleText = r.get('role');
      const role = roleText ? roles.find((x) => compact(x.key) === compact(roleText) || compact(x.name) === compact(roleText)) : null;
      if (roleText && !role) msgs.push(`Portal role "${roleText}" doesn't exist (use one of: ${roles.map((x) => x.name).join(', ')})`);
      if (req.options.createLogins && !email) msgs.push('No email, so no login will be created');
      const number = r.get('staffNumber');
      const dupKey = (number || email).toLowerCase();
      if (dupKey && seen.has(dupKey)) msgs.push(`${number || email} appears twice in the file`);
      if (dupKey) seen.add(dupKey);
      const dept = titleCase(r.get('department')) || null;
      if (dept && !departments.some((d) => d.name.toLowerCase() === dept.toLowerCase())) newDepts.add(dept);
      const fatal = msgs.filter((m) => !m.startsWith('No email'));
      if (fatal.length) {
        results.push({ line: r.line, status: 'ERROR', label, messages: msgs });
        continue;
      }
      const exists = (number && byNumber.get(number.toLowerCase())) || (email && byEmail.get(email)) || undefined;
      if (exists && !req.options.updateExisting) {
        results.push({ line: r.line, status: 'SKIP', label, messages: ['Already on record (tick "update existing" to update)', ...msgs] });
        continue;
      }
      results.push({ line: r.line, status: exists ? 'UPDATE' : 'CREATE', label: `${label}, ${jobTitle}`, messages: msgs });
      ops.push({ line: r.line, action: exists ? 'UPDATE' : 'CREATE', existingId: exists, data: { firstName: first, lastName: last, gender: gender!, email: email || null, phone, jobTitle, type, employedOn: employed, staffNumber: number || null }, department: dept, roleId: role?.id ?? null });
    }
    const logins = req.options.createLogins ? ops.filter((o) => o.data.email).length : 0;
    const extras = [newDepts.size ? `New departments: ${[...newDepts].join(', ')}` : '', logins ? `Up to ${logins} staff logins (role from the "Portal role" column, or Teacher / no role)` : ''].filter(Boolean);
    return { preview: { kind: 'STAFF' as const, columns: p.columns, missingRequired: p.missingRequired, rows: results, totals: this.totals(results), extras }, ops };
  }

  private async commitStaff(ops: StaffOp[], createLogins: boolean) {
    const db = this.prisma.db;
    const tenantId = currentTenantId();
    const depts = new Map((await db.department.findMany()).map((d) => [d.name.toLowerCase(), d.id]));
    for (const name of new Set(ops.map((o) => o.department).filter((d): d is string => !!d))) {
      if (!depts.has(name.toLowerCase())) depts.set(name.toLowerCase(), (await db.department.create({ data: { tenantId, name } })).id);
    }
    const lastNo = await db.staff.findFirst({ where: { staffNumber: { startsWith: 'STF-' } }, orderBy: { staffNumber: 'desc' }, select: { staffNumber: true } });
    let next = (lastNo ? Number(lastNo.staffNumber.slice(4)) || 0 : 0) + 1;
    const ids = new Map<number, string>();
    for (const o of ops) {
      const data = { ...o.data, employedOn: o.data.employedOn ? new Date(`${o.data.employedOn}T00:00:00Z`) : null, departmentId: o.department ? depts.get(o.department.toLowerCase()) : undefined };
      if (o.action === 'CREATE') {
        const s = await db.staff.create({ data: { tenantId, ...data, staffNumber: o.data.staffNumber ?? `STF-${String(next++).padStart(4, '0')}` } });
        ids.set(o.line, s.id);
      } else {
        const { staffNumber: _n, ...rest } = data;
        await db.staff.update({ where: { id: o.existingId! }, data: { ...rest, employedOn: rest.employedOn ?? undefined } });
        ids.set(o.line, o.existingId!);
      }
    }
    const credentials: string[][] = [];
    if (createLogins) {
      const teacher = await db.role.findFirst({ where: { key: 'teacher' } });
      const roles = new Map((await db.role.findMany()).map((r) => [r.id, r.name]));
      const people = [];
      for (const o of ops.filter((x) => x.data.email)) {
        const s = await db.staff.findUniqueOrThrow({ where: { id: ids.get(o.line)! }, select: { id: true, userId: true } });
        if (s.userId) continue;
        const roleId = o.roleId ?? (o.data.type === 'TEACHING' ? teacher?.id : null);
        if (!roleId) continue;
        people.push({ email: o.data.email!, firstName: o.data.firstName, lastName: o.data.lastName, roleId, roleName: roles.get(roleId) ?? 'Staff', link: (userId: string) => db.staff.update({ where: { id: s.id }, data: { userId } }) });
      }
      await this.makeLogins(people, credentials);
    }
    return { created: ops.filter((o) => o.action === 'CREATE').length, updated: ops.filter((o) => o.action === 'UPDATE').length, credentials };
  }

  // ---------------------------------------------------------- results

  private async planResults(req: ImportRequest) {
    if (!req.options.termId) throw new BadRequestException('Choose the term these results are for');
    const db = this.prisma.db;
    const { components } = await this.settings.get();
    const p = this.parse('RESULTS', req.csv, components);
    const term = await db.term.findUnique({ where: { id: req.options.termId }, include: { session: true } });
    if (!term) throw new BadRequestException('Unknown term');
    const scoreCols = p.columns.filter((c) => c.field?.startsWith('score:'));
    const missing = [...p.missingRequired, ...(scoreCols.length ? [] : [`at least one score column (${components.map((c) => c.name).join(', ')})`])];
    const [students, subjects, existing] = await Promise.all([
      db.student.findMany({ select: { id: true, admissionNumber: true, firstName: true, lastName: true, classArmId: true } }),
      db.subject.findMany({ select: { id: true, name: true, code: true } }),
      db.score.findMany({ where: { termId: term.id }, select: { studentId: true, subjectId: true } }),
    ]);
    const byAdm = new Map(students.map((s) => [s.admissionNumber.toLowerCase(), s]));
    const has = new Set(existing.map((s) => `${s.studentId}|${s.subjectId}`));
    const seen = new Set<string>();
    const results: ImportRowResult[] = [];
    const ops: ScoreOp[] = [];
    for (const r of p.rows) {
      const msgs: string[] = [];
      const st = byAdm.get(r.get('admissionNumber').toLowerCase());
      const subjText = r.get('subject');
      const sub = subjects.find((s) => compact(s.name) === compact(subjText) || compact(s.code) === compact(subjText));
      if (!st) msgs.push(`No student with admission number "${r.get('admissionNumber')}"`);
      else if (!st.classArmId) msgs.push(`${st.firstName} ${st.lastName} isn't in a class`);
      if (!sub) msgs.push(`Subject "${subjText}" doesn't exist`);
      const scores: ScoreOp['scores'] = [];
      for (const c of components) {
        const v = r.get(`score:${c.key}`);
        if (v === '') continue;
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0 || n > c.maxScore) msgs.push(`${c.name} "${v}" must be a number from 0 to ${c.maxScore}`);
        else scores.push({ key: c.key, value: Math.round(n * 100) / 100 });
      }
      if (!scores.length && !msgs.length) msgs.push('No scores on this row');
      const label = st && sub ? `${st.firstName} ${st.lastName}, ${sub.name}` : `Line ${r.line}`;
      const key = st && sub ? `${st.id}|${sub.id}` : '';
      if (key && seen.has(key)) msgs.push(`${label} appears twice in the file`);
      if (key) seen.add(key);
      if (msgs.length) {
        results.push({ line: r.line, status: 'ERROR', label, messages: msgs });
        continue;
      }
      if (has.has(key) && !req.options.overwriteScores) {
        results.push({ line: r.line, status: 'SKIP', label, messages: ['Scores already entered for this term (tick "overwrite" to replace them)'] });
        continue;
      }
      results.push({ line: r.line, status: has.has(key) ? 'UPDATE' : 'CREATE', label, messages: [] });
      ops.push({ line: r.line, studentId: st!.id, subjectId: sub!.id, classArmId: st!.classArmId!, scores });
    }
    const preview: ImportPreview = { kind: 'RESULTS', columns: p.columns, missingRequired: missing, rows: results, totals: this.totals(results), extras: [`Scores go into ${term.session.name}, ${term.name}`] };
    return { preview, ops, termId: term.id };
  }

  private async commitResults(ops: ScoreOp[], termId: string) {
    const db = this.prisma.db;
    const tenantId = currentTenantId();
    const userId = currentContext().userId ?? null;
    // Make sure each class teaches the subject, so results and report cards include it.
    await db.classSubject.createMany({ data: [...new Map(ops.map((o) => [`${o.classArmId}|${o.subjectId}`, { tenantId, classArmId: o.classArmId, subjectId: o.subjectId }])).values()], skipDuplicates: true });
    let written = 0;
    const all = ops.flatMap((o) => o.scores.map((s) => ({ ...o, s })));
    for (let i = 0; i < all.length; i += 200) {
      await db.$transaction(
        all.slice(i, i + 200).map((x) =>
          db.score.upsert({
            where: { studentId_subjectId_termId_componentKey: { studentId: x.studentId, subjectId: x.subjectId, termId, componentKey: x.s.key } },
            update: { score: x.s.value, enteredById: userId },
            create: { tenantId, studentId: x.studentId, subjectId: x.subjectId, termId, classArmId: x.classArmId, componentKey: x.s.key, score: x.s.value, enteredById: userId },
          }),
        ),
      );
      written += Math.min(200, all.length - i);
    }
    return { rows: ops.length, scores: written };
  }

  // ---------------------------------------------------------- entry points

  async preview(req: ImportRequest): Promise<ImportPreview> {
    if (req.kind === 'STUDENTS') return (await this.planStudents(req)).preview;
    if (req.kind === 'STAFF') return (await this.planStaff(req)).preview;
    return (await this.planResults(req)).preview;
  }

  /** Rows with errors are left out; everything else is written. */
  async commit(req: ImportRequest): Promise<ImportResult> {
    let preview: ImportPreview;
    let summary: string;
    let credentials: string[][] = [];
    if (req.kind === 'STUDENTS') {
      const plan = await this.planStudents(req);
      if (plan.preview.missingRequired.length) throw new BadRequestException(`Missing columns: ${plan.preview.missingRequired.join(', ')}`);
      const r = await this.commitStudents(plan.ops, req.options.createLogins);
      preview = plan.preview;
      credentials = r.credentials;
      summary = `Imported students: ${r.created} added, ${r.updated} updated, ${r.parents} parents added`;
    } else if (req.kind === 'STAFF') {
      const plan = await this.planStaff(req);
      if (plan.preview.missingRequired.length) throw new BadRequestException(`Missing columns: ${plan.preview.missingRequired.join(', ')}`);
      const r = await this.commitStaff(plan.ops, req.options.createLogins);
      preview = plan.preview;
      credentials = r.credentials;
      summary = `Imported staff: ${r.created} added, ${r.updated} updated`;
    } else {
      const plan = await this.planResults(req);
      if (plan.preview.missingRequired.length) throw new BadRequestException(`Missing columns: ${plan.preview.missingRequired.join(', ')}`);
      const r = await this.commitResults(plan.ops, plan.termId);
      preview = plan.preview;
      summary = `Imported results: ${r.scores} scores for ${r.rows} student–subject rows`;
    }
    await this.audit.log({ action: `import.${req.kind.toLowerCase()}`, summary: `${summary}${credentials.length ? `; ${credentials.length} logins` : ''}${preview.totals.error ? `; ${preview.totals.error} rows with errors left out` : ''}` });
    return {
      ...preview,
      committed: true,
      credentialsCsv: credentials.length ? `Name,Email,Password,Role\r\n${credentials.map((c) => c.map(csvCell).join(',')).join('\r\n')}\r\n` : null,
    };
  }
}
