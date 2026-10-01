import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, Post, Put, Query } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import { randomBytes } from 'node:crypto';
import {
  CERTIFICATE_KINDS,
  CERTIFICATE_KIND_LABELS,
  aiCertificateSchema,
  certificateDraftRequestSchema,
  certificateSchema,
  operationsSettingsSchema,
  revokeCertificateSchema,
  type AiCertificate,
  type AiText,
  type CertificateInput,
  type CertificateKind,
  type CertificateRow,
  type CertificateView,
  type IdCardBatch,
  type OperationsOverview,
  type OperationsSettings,
  type PublicVerification,
} from '@aischool/shared';
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { AuditService } from '../audit/audit.service';
import { Public, RequirePermissions } from '../common/decorators';
import { dateOnly, fullName, parseDate } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { schoolNow } from '../common/school-time';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { OperationsService, armLabel, daysBetween } from './operations.service';
import { certificatePrompt } from './prompts';

interface IdToken {
  typ: 'idcard';
  tid: string;
  /** S = student, T = staff */
  k: 'S' | 'T';
  id: string;
}

const certInclude = {
  student: { select: { id: true, firstName: true, lastName: true, classArm: { select: { name: true, classLevel: { select: { name: true } } } } } },
  staff: { select: { id: true, firstName: true, lastName: true, jobTitle: true } },
} satisfies Prisma.CertificateInclude;
type CertWithRefs = Prisma.CertificateGetPayload<{ include: typeof certInclude }>;

/** Unambiguous characters for codes people may type in. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function publicCode(): string {
  return [...randomBytes(10)].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

@Controller()
export class DocumentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ops: OperationsService,
    private readonly jwt: JwtService,
    private readonly gateway: AiGatewayService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------- operations settings & overview

  @Get('operations/settings')
  @RequirePermissions('school.read')
  async settings(): Promise<OperationsSettings> {
    return (await this.ops.school()).settings;
  }

  @Put('operations/settings')
  @RequirePermissions('school.manage')
  setSettings(@Body(new ZodPipe(operationsSettingsSchema)) body: OperationsSettings) {
    return this.ops.setSettings(body);
  }

  /** Small counts for the dashboard; each part only for those who may see it. */
  @Get('operations/overview')
  async overview(): Promise<OperationsOverview> {
    const db = this.prisma.db;
    const school = await this.ops.school();
    const today = parseDate(school.today);
    const now = new Date();
    const [library, inventory, transport, hostel, reception] = await Promise.all([
      this.ops.can('library.read')
        ? Promise.all([db.libraryLoan.count({ where: { returnedOn: null } }), db.libraryLoan.count({ where: { returnedOn: null, dueOn: { lt: today } } })]).then(
            ([onLoan, overdue]) => ({ onLoan, overdue }),
          )
        : null,
      this.ops.can('inventory.read')
        ? db.inventoryItem.findMany({ where: { isAsset: false, reorderLevel: { gt: 0 } }, select: { quantity: true, reorderLevel: true } }).then((items) => ({
            lowStock: items.filter((i) => i.quantity <= i.reorderLevel).length,
          }))
        : null,
      this.ops.can('transport.read')
        ? db.transportRoute.findMany({ where: { active: true }, include: { vehicle: { select: { capacity: true } }, _count: { select: { assignments: true } } } }).then((routes) => ({
            riders: routes.reduce((n, r) => n + r._count.assignments, 0),
            overCapacity: routes.filter((r) => r.vehicle && r._count.assignments > r.vehicle.capacity).length,
          }))
        : null,
      this.ops.can('hostel.read')
        ? Promise.all([
            db.hostelAllocation.count({ where: { active: true } }),
            db.exeat.count({ where: { returnedAt: null } }),
            db.exeat.count({ where: { returnedAt: null, expectedReturnAt: { lt: now } } }),
          ]).then(([boarders, away, overdue]) => ({ boarders, away, overdue }))
        : null,
      this.ops.can('reception.read')
        ? Promise.all([
            db.visitor.count({ where: { checkOutAt: null, checkInAt: { gte: new Date(now.getTime() - 86_400_000) } } }),
            db.enquiry.count({ where: { status: { notIn: ['ENROLLED', 'CLOSED'] }, followUpOn: { lte: today } } }),
          ]).then(([onSite, followUpsDue]) => ({ onSite, followUpsDue }))
        : null,
    ]);
    return { library, inventory, transport, hostel, reception };
  }

  // ---------------------------------------------------------- certificates

  private certRow(c: CertWithRefs, names: Map<string, string>): CertificateRow {
    return {
      id: c.id,
      serial: c.serial,
      code: c.code,
      kind: c.kind as CertificateKind,
      recipient: c.student
        ? { kind: 'STUDENT', id: c.student.id, name: c.recipientName, detail: c.recipientInfo ?? armLabel(c.student.classArm) }
        : { kind: 'STAFF', id: c.staff?.id ?? '', name: c.recipientName, detail: c.recipientInfo ?? c.staff?.jobTitle ?? null },
      title: c.title,
      issuedOn: dateOnly(c.issuedOn)!,
      issuedBy: c.issuedById ? (names.get(c.issuedById) ?? null) : null,
      revokedAt: c.revokedAt?.toISOString() ?? null,
    };
  }

  @Get('documents/certificates')
  @RequirePermissions('documents.issue')
  async certificates(@Query(new ZodPipe(z.object({ kind: z.enum(CERTIFICATE_KINDS).optional(), q: z.string().trim().max(100).optional() }))) q: { kind?: CertificateKind; q?: string }): Promise<CertificateRow[]> {
    const rows = await this.prisma.db.certificate.findMany({
      where: {
        ...(q.kind ? { kind: q.kind } : {}),
        ...(q.q ? { OR: [{ recipientName: { contains: q.q, mode: 'insensitive' } }, { serial: { contains: q.q, mode: 'insensitive' } }] } : {}),
      },
      include: certInclude,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const names = await this.ops.userNames(rows.map((r) => r.issuedById));
    return rows.map((r) => this.certRow(r, names));
  }

  @Get('documents/certificates/:id')
  @RequirePermissions('documents.issue')
  async certificate(@Param('id') id: string): Promise<CertificateView> {
    const c = await this.prisma.db.certificate.findUniqueOrThrow({ where: { id }, include: certInclude });
    const school = await this.ops.school();
    return {
      ...this.certRow(c, await this.ops.userNames([c.issuedById])),
      body: c.body,
      revokeReason: c.revokeReason,
      school: { name: school.name, address: school.address, logoUrl: school.logoUrl, motto: school.motto },
      verifyPath: `/verify/certificate/${c.code}`,
    };
  }

  @Post('documents/certificates')
  @RequirePermissions('documents.issue')
  async issue(@Body(new ZodPipe(certificateSchema)) body: CertificateInput): Promise<CertificateView> {
    const db = this.prisma.db;
    const school = await this.ops.school();
    const recipient = body.studentId
      ? await db.student.findUniqueOrThrow({ where: { id: body.studentId }, include: { classArm: { include: { classLevel: true } } } })
      : await db.staff.findUniqueOrThrow({ where: { id: body.staffId! } });
    const info = 'classArm' in recipient ? armLabel(recipient.classArm) : recipient.jobTitle;
    const year = body.issuedOn.slice(0, 4);
    const stem = `${school.settings.certificatePrefix}/${year}/`;
    const tenantId = currentTenantId();
    const cert = await db.$transaction(async (tx) => {
      // Serialise numbering per school so two issues can't take the same serial.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cert:${tenantId}`}))`;
      const last = await tx.certificate.findFirst({ where: { serial: { startsWith: stem } }, orderBy: { serial: 'desc' }, select: { serial: true } });
      const n = (last ? Number(last.serial.slice(stem.length)) || 0 : 0) + 1;
      return tx.certificate.create({
        data: {
          tenantId,
          serial: `${stem}${String(n).padStart(4, '0')}`,
          code: publicCode(),
          kind: body.kind,
          studentId: body.studentId ?? null,
          staffId: body.staffId ?? null,
          recipientName: fullName(recipient),
          recipientInfo: info,
          title: body.title,
          body: body.body,
          issuedOn: parseDate(body.issuedOn),
          issuedById: currentContext().userId,
        },
      });
    });
    await this.audit.log({
      action: 'documents.certificate_issued',
      entityType: 'Certificate',
      entityId: cert.id,
      summary: `Issued ${CERTIFICATE_KIND_LABELS[body.kind].toLowerCase()} ${cert.serial} to ${cert.recipientName}`,
    });
    return this.certificate(cert.id);
  }

  @Post('documents/certificates/:id/revoke')
  @HttpCode(200)
  @RequirePermissions('documents.issue')
  async revoke(@Param('id') id: string, @Body(new ZodPipe(revokeCertificateSchema)) body: { reason: string }): Promise<CertificateView> {
    const done = await this.prisma.db.certificate.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: body.reason } });
    if (!done.count) throw new BadRequestException('This certificate has already been revoked');
    const c = await this.prisma.db.certificate.findUniqueOrThrow({ where: { id } });
    await this.audit.log({ action: 'documents.certificate_revoked', entityType: 'Certificate', entityId: id, summary: `Revoked ${c.serial} (${c.recipientName}): ${body.reason}` });
    return this.certificate(id);
  }

  /** Drafts certificate text from the recipient's record (nothing is saved). */
  @Post('documents/certificates/draft')
  @HttpCode(200)
  @RequirePermissions('documents.issue', 'ai.use')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async draft(@Body(new ZodPipe(certificateDraftRequestSchema)) body: z.infer<typeof certificateDraftRequestSchema>): Promise<AiCertificate & AiText> {
    const db = this.prisma.db;
    const school = await this.ops.school();
    const lines: string[] = [`Certificate: ${CERTIFICATE_KIND_LABELS[body.kind]}. Date of issue: ${school.today}.`, 'RECORD'];
    if (body.studentId) {
      const s = await db.student.findUniqueOrThrow({
        where: { id: body.studentId },
        include: {
          classArm: { include: { classLevel: true } },
          reportCards: { where: { status: 'PUBLISHED' }, include: { term: true }, orderBy: { publishedAt: 'desc' }, take: 2 },
        },
      });
      const term = await this.ops.currentTerm();
      const att = term
        ? await db.studentAttendance.groupBy({ by: ['status'], where: { studentId: s.id, date: { gte: term.startsOn, lte: term.endsOn } }, _count: { _all: true } })
        : [];
      const n = (st: string) => att.find((a) => a.status === st)?._count._all ?? 0;
      const marked = att.reduce((t, a) => t + a._count._all, 0);
      lines.push(
        `Learner: ${fullName(s)} (${s.gender === 'FEMALE' ? 'she/her' : 'he/him'}), admission number ${s.admissionNumber}.`,
        `Admitted on ${dateOnly(s.admittedOn)}; current class ${armLabel(s.classArm) ?? 'not assigned'}; status ${s.status.toLowerCase()}.`,
        marked ? `Attendance this term: present ${n('PRESENT') + n('LATE')} of ${marked} school days (late ${n('LATE')}, excused ${n('EXCUSED')}).` : 'Attendance: not recorded this term.',
        ...s.reportCards.map(
          (r) => `Report card, ${r.term.name}: class teacher wrote "${r.teacherRemark ?? 'no remark'}"; principal wrote "${r.principalRemark ?? 'no remark'}".`,
        ),
      );
    } else {
      const st = await db.staff.findUniqueOrThrow({ where: { id: body.staffId! }, include: { department: true, awards: { orderBy: { awardedOn: 'desc' }, take: 5 } } });
      const employed = dateOnly(st.employedOn);
      const until = dateOnly(st.exitedOn) ?? school.today;
      lines.push(
        `Staff member: ${fullName(st)} (${st.gender === 'FEMALE' ? 'she/her' : 'he/him'}), ${st.jobTitle}${st.department ? `, ${st.department.name}` : ''}.`,
        employed ? `Employed from ${employed}${st.exitedOn ? ` to ${dateOnly(st.exitedOn)}` : ' to date'} (${Math.floor(daysBetween(employed, until) / 365.25)} years).` : 'Start date not recorded.',
        st.qualification ? `Qualification: ${st.qualification}.` : '',
        st.awards.length ? `Awards: ${st.awards.map((a) => `${a.title} (${dateOnly(a.awardedOn)!.slice(0, 4)})`).join('; ')}.` : '',
      );
    }
    lines.push(body.notes ? `Issuer's notes: ${body.notes}` : 'No issuer notes — keep strictly to the record.');
    const { system, user } = certificatePrompt(school.name, lines.filter(Boolean).join('\n'));
    const r = await this.gateway.generateJson({ tier: 'standard', system, messages: [{ role: 'user', content: user }] }, aiCertificateSchema, 'certificate-draft');
    return { ...r.data, text: r.data.body, provider: r.provider, model: r.model };
  }

  // ---------------------------------------------------------- ID cards

  @Get('documents/id-cards')
  @RequirePermissions('documents.issue')
  async idCards(
    @Query(new ZodPipe(z.object({ kind: z.enum(['STUDENT', 'STAFF']), classArmId: z.string().optional(), ids: z.string().optional() })))
    q: { kind: 'STUDENT' | 'STAFF'; classArmId?: string; ids?: string },
  ): Promise<IdCardBatch> {
    const db = this.prisma.db;
    const school = await this.ops.school();
    const tid = currentTenantId();
    const ids = q.ids?.split(',').filter(Boolean);
    if (q.kind === 'STUDENT' && !q.classArmId && !ids?.length) throw new BadRequestException('Choose a class or some students');
    const token = (k: 'S' | 'T', id: string) => this.jwt.signAsync({ typ: 'idcard', tid, k, id } satisfies IdToken);
    const cards =
      q.kind === 'STUDENT'
        ? await Promise.all(
            (
              await db.student.findMany({
                where: { status: 'ACTIVE', ...(ids?.length ? { id: { in: ids } } : { classArmId: q.classArmId }) },
                include: {
                  classArm: { include: { classLevel: true } },
                  guardians: { orderBy: { isPrimary: 'desc' }, take: 1, include: { guardian: { select: { phone: true } } } },
                },
                orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
                take: 200,
              })
            ).map(async (s) => ({
              kind: 'STUDENT' as const,
              id: s.id,
              name: fullName(s),
              number: s.admissionNumber,
              detail: armLabel(s.classArm),
              photoUrl: s.photoUrl,
              guardianPhone: s.guardians[0]?.guardian.phone ?? null,
              validUntil: school.settings.idCardValidUntil,
              verifyPath: `/verify/id/${await token('S', s.id)}`,
            })),
          )
        : await Promise.all(
            (
              await db.staff.findMany({
                where: { status: { not: 'EXITED' }, ...(ids?.length ? { id: { in: ids } } : {}) },
                orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
                take: 300,
              })
            ).map(async (s) => ({
              kind: 'STAFF' as const,
              id: s.id,
              name: fullName(s),
              number: s.staffNumber,
              detail: s.jobTitle,
              photoUrl: null,
              guardianPhone: null,
              validUntil: school.settings.idCardValidUntil,
              verifyPath: `/verify/id/${await token('T', s.id)}`,
            })),
          );
    return {
      school: {
        name: school.name,
        shortName: school.shortName,
        address: school.address,
        phone: school.phone,
        logoUrl: school.logoUrl,
        primaryColor: school.primaryColor,
        motto: school.motto,
      },
      cards,
    };
  }

  // ---------------------------------------------------------- public verification (QR codes)

  @Get('verify/certificate/:code')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async verifyCertificate(@Param('code') code: string): Promise<PublicVerification> {
    const c = /^[A-Z0-9]{6,20}$/.test(code)
      ? await this.prisma.root.certificate.findUnique({ where: { code }, include: { tenant: { select: { name: true } } } })
      : null;
    if (!c) throw new NotFoundException('No certificate matches this code');
    const valid = !c.revokedAt;
    return {
      valid,
      school: c.tenant.name,
      kind: CERTIFICATE_KIND_LABELS[c.kind as CertificateKind],
      name: c.recipientName,
      detail: `${c.title} · ${c.serial}`,
      issuedOn: dateOnly(c.issuedOn),
      validUntil: null,
      message: valid ? `Genuine — issued by ${c.tenant.name}.` : `This certificate was withdrawn by ${c.tenant.name} and is no longer valid.`,
    };
  }

  @Get('verify/id/:token')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async verifyId(@Param('token') token: string): Promise<PublicVerification> {
    let p: IdToken;
    try {
      p = await this.jwt.verifyAsync<IdToken>(token);
    } catch {
      throw new NotFoundException('This ID card code is not recognised');
    }
    if (p.typ !== 'idcard') throw new NotFoundException('This ID card code is not recognised');
    const tenant = await this.prisma.root.tenant.findUnique({ where: { id: p.tid }, select: { name: true, timezone: true, operationsSettings: true } });
    if (!tenant) throw new NotFoundException('This ID card code is not recognised');
    const validUntil = ((tenant.operationsSettings as Partial<OperationsSettings> | null) ?? {}).idCardValidUntil ?? null;
    const expired = !!validUntil && schoolNow(tenant.timezone).date > validUntil;
    if (p.k === 'S') {
      const s = await this.prisma.root.student.findFirst({ where: { id: p.id, tenantId: p.tid }, include: { classArm: { include: { classLevel: true } } } });
      if (!s) throw new NotFoundException('This ID card code is not recognised');
      const valid = s.status === 'ACTIVE' && !expired;
      return {
        valid,
        school: tenant.name,
        kind: 'Student ID card',
        name: fullName(s),
        detail: valid ? armLabel(s.classArm) : null,
        issuedOn: null,
        validUntil,
        message: valid ? `A current student of ${tenant.name}.` : expired ? 'This card has expired.' : `Not a current student of ${tenant.name}.`,
      };
    }
    const st = await this.prisma.root.staff.findFirst({ where: { id: p.id, tenantId: p.tid } });
    if (!st) throw new NotFoundException('This ID card code is not recognised');
    const valid = st.status !== 'EXITED' && !expired;
    return {
      valid,
      school: tenant.name,
      kind: 'Staff ID card',
      name: fullName(st),
      detail: valid ? st.jobTitle : null,
      issuedOn: null,
      validUntil,
      message: valid ? `A current member of staff at ${tenant.name}.` : expired ? 'This card has expired.' : `No longer a member of staff at ${tenant.name}.`,
    };
  }
}
