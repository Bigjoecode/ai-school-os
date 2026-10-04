import { Injectable } from '@nestjs/common';
import { normalisePhone, type AlumniMatch, type AlumniPending, type AlumniRow, type AlumniSource, type alumniSignupSchema } from '@aischool/shared';
import type { z } from 'zod';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const alumniInclude = { student: { select: { id: true, admissionNumber: true } } } satisfies Prisma.AlumniProfileInclude;
export type AlumniWithStudent = Prisma.AlumniProfileGetPayload<{ include: typeof alumniInclude }>;

const ADM_NOTE = /^Admission no\. given: (.+)$/m;

export function alumniRow(a: AlumniWithStudent): AlumniRow {
  return {
    id: a.id,
    firstName: a.firstName,
    lastName: a.lastName,
    name: `${a.firstName} ${a.lastName}`,
    graduationYear: a.graduationYear,
    finalClass: a.finalClass,
    email: a.email,
    phone: a.phone,
    currentInstitution: a.currentInstitution,
    course: a.course,
    occupation: a.occupation,
    employer: a.employer,
    city: a.city,
    country: a.country,
    consentToContact: a.consentToContact,
    source: a.source as AlumniSource,
    verified: a.verified,
    notes: a.notes,
    student: a.student ? { id: a.student.id, admissionNumber: a.student.admissionNumber } : null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

/** The directory's filters as a Prisma where clause. */
export interface AlumniFilterValues {
  q?: string;
  year?: number;
  finalClass?: string;
  city?: string;
  verified?: 'true' | 'false';
  consent?: 'true' | 'false';
  source?: AlumniSource;
}

export function alumniWhere(f: AlumniFilterValues): Prisma.AlumniProfileWhereInput {
  const terms = f.q?.split(/\s+/).filter(Boolean) ?? [];
  const text = ['firstName', 'lastName', 'email', 'phone', 'currentInstitution', 'course', 'occupation', 'employer', 'city', 'finalClass'] as const;
  return {
    ...(f.year ? { graduationYear: Number(f.year) } : {}),
    ...(f.finalClass ? { finalClass: { contains: f.finalClass, mode: 'insensitive' } } : {}),
    ...(f.city ? { OR: [{ city: { contains: f.city, mode: 'insensitive' } }, { country: { contains: f.city, mode: 'insensitive' } }] } : {}),
    ...(f.verified ? { verified: f.verified === 'true' } : {}),
    ...(f.consent ? { consentToContact: f.consent === 'true' } : {}),
    ...(f.source ? { source: f.source } : {}),
    AND: terms.map((t) => ({ OR: text.map((k) => ({ [k]: { contains: t, mode: 'insensitive' } })) })),
  };
}

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^a-z]/g, '');

/** Shared alumni logic: matching sign-ups to students, merging records, and the public sign-up. */
@Injectable()
export class AlumniService {
  constructor(private readonly prisma: PrismaService) {}

  /** The graduation year and final class of graduated students, from their promotion records. */
  async graduationInfo(studentIds: string[]): Promise<Map<string, { year: number | null; finalClass: string | null }>> {
    const db = this.prisma.db;
    if (!studentIds.length) return new Map();
    const promos = await db.studentPromotion.findMany({ where: { studentId: { in: studentIds }, decision: 'GRADUATED' }, select: { studentId: true, fromSessionId: true, fromArmId: true } });
    const [sessions, arms] = await Promise.all([
      db.academicSession.findMany({ where: { id: { in: [...new Set(promos.map((p) => p.fromSessionId))] } }, select: { id: true, endsOn: true } }),
      db.classArm.findMany({ where: { id: { in: promos.map((p) => p.fromArmId).filter((x): x is string => !!x) } }, select: { id: true, name: true, classLevel: { select: { name: true } } } }),
    ]);
    const sById = new Map(sessions.map((s) => [s.id, s.endsOn.getUTCFullYear()]));
    const aById = new Map(arms.map((a) => [a.id, `${a.classLevel.name} ${a.name}`.trim()]));
    return new Map(promos.map((p) => [p.studentId, { year: sById.get(p.fromSessionId) ?? null, finalClass: p.fromArmId ? (aById.get(p.fromArmId) ?? null) : null }]));
  }

  /** Likely matches for unverified sign-ups: graduated students by admission number or name + year, and existing alumni records by name + year. */
  async withMatches(rows: AlumniWithStudent[]): Promise<AlumniPending[]> {
    const db = this.prisma.db;
    if (!rows.length) return [];
    const given = rows.map((r) => ADM_NOTE.exec(r.notes ?? '')?.[1]?.trim() ?? null);
    const names = [...new Set(rows.flatMap((r) => [r.firstName, r.lastName]))];
    const [byAdm, byName, profiles] = await Promise.all([
      db.student.findMany({
        where: { OR: given.filter((g): g is string => !!g).map((g) => ({ admissionNumber: { equals: g, mode: 'insensitive' as const } })) },
        select: { id: true, firstName: true, lastName: true, admissionNumber: true, status: true, alumniProfile: { select: { id: true, graduationYear: true, finalClass: true } } },
      }).then((x) => (given.some(Boolean) ? x : [])),
      db.student.findMany({
        where: { status: 'GRADUATED', OR: names.flatMap((n) => [{ firstName: { equals: n, mode: 'insensitive' as const } }, { lastName: { equals: n, mode: 'insensitive' as const } }]) },
        select: { id: true, firstName: true, lastName: true, admissionNumber: true, status: true, alumniProfile: { select: { id: true, graduationYear: true, finalClass: true } } },
        take: 500,
      }),
      db.alumniProfile.findMany({
        where: { verified: true, studentId: null, OR: names.flatMap((n) => [{ firstName: { equals: n, mode: 'insensitive' as const } }, { lastName: { equals: n, mode: 'insensitive' as const } }]) },
        select: { id: true, firstName: true, lastName: true, graduationYear: true, finalClass: true },
        take: 500,
      }),
    ]);
    const info = await this.graduationInfo([...new Set([...byAdm, ...byName].map((s) => s.id))]);
    return rows.map((r, i) => {
      const matches = new Map<string, AlumniMatch>();
      const sameName = (a: { firstName: string; lastName: string }) =>
        (norm(a.firstName) === norm(r.firstName) && norm(a.lastName) === norm(r.lastName)) || (norm(a.firstName) === norm(r.lastName) && norm(a.lastName) === norm(r.firstName));
      const studentMatch = (s: (typeof byName)[number], reason: string): AlumniMatch => {
        const g = info.get(s.id);
        return {
          studentId: s.id,
          name: `${s.firstName} ${s.lastName}`,
          admissionNumber: s.admissionNumber,
          graduationYear: s.alumniProfile?.graduationYear ?? g?.year ?? null,
          finalClass: s.alumniProfile?.finalClass ?? g?.finalClass ?? null,
          profileId: s.alumniProfile && s.alumniProfile.id !== r.id ? s.alumniProfile.id : null,
          reason,
        };
      };
      const adm = given[i];
      if (adm) for (const s of byAdm.filter((x) => x.admissionNumber.toLowerCase() === adm.toLowerCase())) matches.set(s.id, studentMatch(s, `Admission number ${s.admissionNumber}${s.status !== 'GRADUATED' ? ` (record is ${s.status.toLowerCase()})` : ''}`));
      for (const s of byName.filter(sameName)) {
        if (matches.has(s.id) || s.alumniProfile?.id === r.id) continue;
        const m = studentMatch(s, '');
        const yearOk = !r.graduationYear || !m.graduationYear || m.graduationYear === r.graduationYear;
        if (!yearOk) continue;
        m.reason = r.graduationYear && m.graduationYear ? `Name and graduation year (${m.graduationYear})` : 'Same name (graduation year not on record)';
        matches.set(s.id, m);
      }
      for (const p of profiles.filter(sameName)) {
        if (p.id === r.id || (r.graduationYear && p.graduationYear && p.graduationYear !== r.graduationYear)) continue;
        matches.set(`p:${p.id}`, { studentId: null, name: `${p.firstName} ${p.lastName}`, admissionNumber: null, graduationYear: p.graduationYear, finalClass: p.finalClass, profileId: p.id, reason: 'An alumni record with the same name' + (p.graduationYear ? ` and year` : '') });
      }
      return { ...alumniRow(r), admissionNumberGiven: adm, matches: [...matches.values()].slice(0, 6) };
    });
  }

  /**
   * Folds a sign-up into an existing record: what the old student told us
   * now (contacts, where they study or work) wins over what we had; the
   * sign-up itself is removed.
   */
  async merge(from: AlumniWithStudent, intoId: string): Promise<AlumniWithStudent> {
    const db = this.prisma.db;
    const into = await db.alumniProfile.findUniqueOrThrow({ where: { id: intoId } });
    const pick = <K extends 'email' | 'phone' | 'currentInstitution' | 'course' | 'occupation' | 'employer' | 'city' | 'country' | 'finalClass'>(k: K) => from[k] ?? into[k];
    const notes = [into.notes, from.notes ? `From their website sign-up (${from.createdAt.toISOString().slice(0, 10)}):\n${from.notes}` : null].filter(Boolean).join('\n\n') || null;
    const [, merged] = await db.$transaction([
      db.alumniProfile.delete({ where: { id: from.id } }),
      db.alumniProfile.update({
        where: { id: intoId },
        data: {
          email: pick('email'),
          phone: pick('phone'),
          currentInstitution: pick('currentInstitution'),
          course: pick('course'),
          occupation: pick('occupation'),
          employer: pick('employer'),
          city: pick('city'),
          country: pick('country'),
          finalClass: into.finalClass ?? from.finalClass,
          graduationYear: into.graduationYear ?? from.graduationYear,
          consentToContact: from.consentToContact,
          verified: true,
          notes: notes?.slice(0, 4000) ?? null,
        },
        include: alumniInclude,
      }),
    ]);
    return merged;
  }
}

/**
 * The website's "old students" form: an unverified record for staff to
 * confirm. A second sign-up with the same name and email/phone updates the
 * waiting one instead of adding another.
 */
export async function selfRegister(prisma: PrismaService, tenantId: string, body: z.output<typeof alumniSignupSchema>): Promise<{ id: string; updated: boolean }> {
  const db = prisma.db;
  const phone = normalisePhone(body.phone);
  const notes = [body.admissionNumber ? `Admission no. given: ${body.admissionNumber}` : null, body.message ? `Message: ${body.message}` : null].filter(Boolean).join('\n') || null;
  const data = {
    firstName: body.firstName,
    lastName: body.lastName,
    graduationYear: body.graduationYear,
    finalClass: body.finalClass,
    email: body.email,
    phone: body.phone,
    currentInstitution: body.currentInstitution,
    course: body.course,
    occupation: body.occupation,
    employer: body.employer,
    city: body.city,
    country: body.country,
    consentToContact: body.consentToContact,
    notes,
  };
  const waiting = await db.alumniProfile.findMany({
    where: {
      source: 'SELF_REGISTERED',
      verified: false,
      firstName: { equals: body.firstName, mode: 'insensitive' },
      lastName: { equals: body.lastName, mode: 'insensitive' },
    },
    select: { id: true, email: true, phone: true },
  });
  const same = waiting.find((w) => (body.email && w.email?.toLowerCase() === body.email) || (phone && normalisePhone(w.phone) === phone));
  if (same) {
    await db.alumniProfile.update({ where: { id: same.id }, data });
    return { id: same.id, updated: true };
  }
  const created = await db.alumniProfile.create({ data: { ...data, tenantId, source: 'SELF_REGISTERED', verified: false } });
  return { id: created.id, updated: false };
}

