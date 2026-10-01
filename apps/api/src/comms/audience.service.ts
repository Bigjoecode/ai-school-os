import { Injectable } from '@nestjs/common';
import { formatMoney, normalisePhone, type Audience } from '@aischool/shared';
import type { Prisma } from '../generated/prisma/client';
import { dateOnly } from '../common/format';
import { schoolNow } from '../common/school-time';
import { PrismaService } from '../prisma/prisma.service';

export interface Contact {
  key: string;
  name: string;
  firstName: string;
  email: string | null;
  phone: string | null;
  userId: string | null;
  guardianId: string | null;
  staffId: string | null;
  /** For parents: their children in the audience. */
  children: { firstName: string; classLabel: string | null }[];
  /** For parents: fees outstanding this term across their children (kobo). */
  balanceKobo: number | null;
  /** Shown in previews: "Parent of Ada (JSS 1 A)", "Mathematics Teacher". */
  detail: string | null;
}

const studentSelect = {
  id: true,
  firstName: true,
  classArm: { select: { name: true, classLevel: { select: { name: true } } } },
  guardians: {
    orderBy: { isPrimary: 'desc' },
    select: { isPrimary: true, guardian: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, userId: true } } },
  },
} satisfies Prisma.StudentSelect;
type StudentRow = Prisma.StudentGetPayload<{ select: typeof studentSelect }>;

const arm = (a: { name: string; classLevel: { name: string } } | null) => (a ? `${a.classLevel.name} ${a.name}` : null);
const firstWord = (s: string) => s.trim().split(/\s+/)[0] ?? s;

/**
 * Turns an audience definition into the people to contact. Works with an
 * explicit tenant id (no request context) so scheduled sends and automations
 * can use it too. Parents are de-duplicated: a mother of two gets one message
 * naming both children.
 */
@Injectable()
export class AudienceService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(tenantId: string, audience: Audience, opts: { withBalances?: boolean } = {}): Promise<{ contacts: Contact[]; summary: string }> {
    const db = this.prisma.root;
    switch (audience.type) {
      case 'ALL_PARENTS': {
        const students = await db.student.findMany({ where: { tenantId, status: 'ACTIVE' }, select: studentSelect });
        return { contacts: await this.parents(tenantId, students, audience.primaryOnly, opts.withBalances), summary: `All parents${audience.primaryOnly ? ' (main contact per child)' : ''}` };
      }
      case 'CLASS_PARENTS': {
        const students = await db.student.findMany({
          where: {
            tenantId,
            status: 'ACTIVE',
            OR: [
              ...(audience.classArmIds.length ? [{ classArmId: { in: audience.classArmIds } }] : []),
              ...(audience.classLevelIds.length ? [{ classArm: { classLevelId: { in: audience.classLevelIds } } }] : []),
            ],
          },
          select: studentSelect,
        });
        const [arms, levels] = await Promise.all([
          db.classArm.findMany({ where: { tenantId, id: { in: audience.classArmIds } }, include: { classLevel: true } }),
          db.classLevel.findMany({ where: { tenantId, id: { in: audience.classLevelIds } } }),
        ]);
        const names = [...levels.map((l) => l.name), ...arms.map((a) => arm(a)!)];
        return {
          contacts: audience.classArmIds.length || audience.classLevelIds.length ? await this.parents(tenantId, students, audience.primaryOnly, opts.withBalances) : [],
          summary: `Parents of ${names.length > 4 ? `${names.slice(0, 4).join(', ')} and ${names.length - 4} more` : names.join(', ') || 'no classes'}`,
        };
      }
      case 'FEE_DEBTORS': {
        const term = await db.term.findFirst({ where: { tenantId, isCurrent: true } });
        if (!term) return { contacts: [], summary: 'Parents with fees outstanding (no current term)' };
        const tz = (await db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { timezone: true } })).timezone;
        const today = schoolNow(tz).date;
        const invoices = await db.invoice.findMany({ where: { tenantId, termId: term.id, status: { in: ['ISSUED', 'PART_PAID'] } }, select: { studentId: true, totalKobo: true, paidKobo: true, dueDate: true } });
        const ids = invoices
          .filter((i) => i.totalKobo - i.paidKobo > audience.minBalanceKobo && (!audience.overdueOnly || dateOnly(i.dueDate)! < today))
          .map((i) => i.studentId);
        const students = await db.student.findMany({ where: { tenantId, status: 'ACTIVE', id: { in: ids } }, select: studentSelect });
        return {
          contacts: await this.parents(tenantId, students, audience.primaryOnly, true),
          summary: `Parents with fees outstanding${audience.overdueOnly ? ' past the due date' : ''}${audience.minBalanceKobo ? ` over ${formatMoney(audience.minBalanceKobo)}` : ''} (${term.name})`,
        };
      }
      case 'ROUTE_PARENTS': {
        const [riders, routes] = await Promise.all([
          db.transportAssignment.findMany({ where: { tenantId, routeId: { in: audience.routeIds } }, select: { studentId: true } }),
          db.transportRoute.findMany({ where: { tenantId, id: { in: audience.routeIds } }, select: { name: true } }),
        ]);
        const students = await db.student.findMany({ where: { tenantId, status: 'ACTIVE', id: { in: riders.map((r) => r.studentId) } }, select: studentSelect });
        return { contacts: await this.parents(tenantId, students, audience.primaryOnly, opts.withBalances), summary: `Parents of riders on ${routes.map((r) => r.name).join(', ')}` };
      }
      case 'HOSTEL_PARENTS': {
        const beds = await db.hostelAllocation.findMany({
          where: { tenantId, active: true, ...(audience.hostelIds.length ? { room: { hostelId: { in: audience.hostelIds } } } : {}) },
          select: { studentId: true },
        });
        const hostels = audience.hostelIds.length ? await db.hostel.findMany({ where: { tenantId, id: { in: audience.hostelIds } }, select: { name: true } }) : [];
        const students = await db.student.findMany({ where: { tenantId, status: 'ACTIVE', id: { in: beds.map((b) => b.studentId) } }, select: studentSelect });
        return {
          contacts: await this.parents(tenantId, students, audience.primaryOnly, opts.withBalances),
          summary: `Parents of boarders${hostels.length ? ` in ${hostels.map((h) => h.name).join(', ')}` : ''}`,
        };
      }
      case 'ALL_STAFF': {
        const staff = await db.staff.findMany({ where: { tenantId, status: { not: 'EXITED' } } });
        return { contacts: staff.map((s) => this.staffContact(s)), summary: 'All staff' };
      }
      case 'STAFF_GROUP': {
        const staff = await db.staff.findMany({
          where: {
            tenantId,
            status: { not: 'EXITED' },
            ...(audience.departmentIds.length ? { departmentId: { in: audience.departmentIds } } : {}),
            ...(audience.staffType ? { type: audience.staffType } : {}),
          },
        });
        const depts = audience.departmentIds.length ? await db.department.findMany({ where: { tenantId, id: { in: audience.departmentIds } }, select: { name: true } }) : [];
        const what = [audience.staffType === 'TEACHING' ? 'Teaching staff' : audience.staffType === 'NON_TEACHING' ? 'Non-teaching staff' : 'Staff', depts.length ? `in ${depts.map((d) => d.name).join(', ')}` : ''].filter(Boolean).join(' ');
        return { contacts: staff.map((s) => this.staffContact(s)), summary: what };
      }
      case 'PEOPLE': {
        const [guardians, staff] = await Promise.all([
          audience.guardianIds.length
            ? db.guardian.findMany({
                where: { tenantId, id: { in: audience.guardianIds } },
                include: {
                  students: {
                    where: { student: { status: 'ACTIVE' } },
                    select: { student: { select: { id: true, firstName: true, classArm: { select: { name: true, classLevel: { select: { name: true } } } } } } },
                  },
                },
              })
            : [],
          audience.staffIds.length ? db.staff.findMany({ where: { tenantId, id: { in: audience.staffIds } } }) : [],
        ]);
        const contacts: Contact[] = guardians.map((g) => ({
          key: `g:${g.id}`,
          name: `${g.firstName} ${g.lastName}`,
          firstName: g.firstName,
          email: g.email,
          phone: normalisePhone(g.phone),
          userId: g.userId,
          guardianId: g.id,
          staffId: null,
          children: g.students.map((s) => ({ firstName: s.student.firstName, classLabel: arm(s.student.classArm) })),
          balanceKobo: null,
          detail: g.students.length ? `Parent of ${g.students.map((s) => s.student.firstName).join(', ')}` : 'Parent',
        }));
        if (opts.withBalances) await this.addBalances(tenantId, contacts, new Map(guardians.map((g) => [g.id, g.students.map((s) => s.student.id)])));
        contacts.push(...staff.map((s) => this.staffContact(s)));
        return { contacts, summary: contacts.length === 1 ? contacts[0]!.name : `${contacts.length} people` };
      }
      case 'CONTACTS': {
        const contacts = audience.contacts.map((c, i) => ({
          key: `c:${i}`,
          name: c.name,
          firstName: firstWord(c.name.replace(/^(mr|mrs|ms|miss|dr|engr|prof|chief)\.?\s+/i, '')),
          email: c.email ?? null,
          phone: normalisePhone(c.phone),
          userId: null,
          guardianId: null,
          staffId: null,
          children: [],
          balanceKobo: null,
          detail: null,
        }));
        return { contacts, summary: contacts.length === 1 ? contacts[0]!.name : `${contacts.length} contacts` };
      }
    }
  }

  private staffContact(s: { id: string; firstName: string; lastName: string; email: string | null; phone: string | null; userId: string | null; jobTitle: string }): Contact {
    return {
      key: `s:${s.id}`,
      name: `${s.firstName} ${s.lastName}`,
      firstName: s.firstName,
      email: s.email,
      phone: normalisePhone(s.phone),
      userId: s.userId,
      guardianId: null,
      staffId: s.id,
      children: [],
      balanceKobo: null,
      detail: s.jobTitle,
    };
  }

  /** One contact per guardian, naming each of their children in the audience. */
  private async parents(tenantId: string, students: StudentRow[], primaryOnly: boolean, withBalances = false): Promise<Contact[]> {
    const byGuardian = new Map<string, Contact>();
    const studentsOf = new Map<string, string[]>();
    for (const st of students) {
      const links = primaryOnly ? st.guardians.slice(0, 1) : st.guardians;
      for (const { guardian: g } of links) {
        let c = byGuardian.get(g.id);
        if (!c) {
          c = {
            key: `g:${g.id}`,
            name: `${g.firstName} ${g.lastName}`,
            firstName: g.firstName,
            email: g.email,
            phone: normalisePhone(g.phone),
            userId: g.userId,
            guardianId: g.id,
            staffId: null,
            children: [],
            balanceKobo: null,
            detail: null,
          };
          byGuardian.set(g.id, c);
        }
        c.children.push({ firstName: st.firstName, classLabel: arm(st.classArm) });
        studentsOf.set(g.id, [...(studentsOf.get(g.id) ?? []), st.id]);
      }
    }
    const contacts = [...byGuardian.values()];
    for (const c of contacts) c.detail = `Parent of ${c.children.map((ch) => `${ch.firstName}${ch.classLabel ? ` (${ch.classLabel})` : ''}`).join(', ')}`;
    if (withBalances) await this.addBalances(tenantId, contacts, studentsOf);
    return contacts;
  }

  private async addBalances(tenantId: string, contacts: Contact[], studentsOf: Map<string, string[]>) {
    const term = await this.prisma.root.term.findFirst({ where: { tenantId, isCurrent: true } });
    if (!term) return;
    const ids = [...new Set([...studentsOf.values()].flat())];
    const invoices = await this.prisma.root.invoice.findMany({
      where: { tenantId, termId: term.id, studentId: { in: ids }, status: { not: 'CANCELLED' } },
      select: { studentId: true, totalKobo: true, paidKobo: true },
    });
    const bal = new Map(invoices.map((i) => [i.studentId, Math.max(0, i.totalKobo - i.paidKobo)]));
    for (const c of contacts) {
      if (c.guardianId) c.balanceKobo = (studentsOf.get(c.guardianId) ?? []).reduce((n, id) => n + (bal.get(id) ?? 0), 0);
    }
  }
}

/** Fills {{tokens}} for one recipient. */
export function personalise(text: string, c: Contact, school: { name: string; currency: string }): string {
  const list = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
  return text
    .replace(/\{\{\s*first_name\s*\}\}/g, c.firstName)
    .replace(/\{\{\s*name\s*\}\}/g, c.name)
    .replace(/\{\{\s*children\s*\}\}/g, list(c.children.map((ch) => ch.firstName)) || 'your child')
    .replace(/\{\{\s*class\s*\}\}/g, list([...new Set(c.children.map((ch) => ch.classLabel).filter((x): x is string => !!x))]))
    .replace(/\{\{\s*balance\s*\}\}/g, c.balanceKobo !== null ? formatMoney(c.balanceKobo, school.currency) : '')
    .replace(/\{\{\s*school\s*\}\}/g, school.name);
}
