import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  RESERVED_SLUGS,
  SCHOOL_TYPE_STAGES,
  SUBJECT_TEMPLATES,
  type SchoolTypeKey,
  type SignupConfig,
  type SignupInput,
  type SignupResult,
  type SignupRow,
  type SignupStatus,
  type SignupVerifyResult,
} from '@aischool/shared';
import type { Prisma } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { hashPassword } from '../auth/password';
import { RequestContextStore } from '../common/request-context';
import { env } from '../config/env';
import { SetupService } from '../onboarding/setup.service';
import { ProvisioningService } from '../platform/provisioning.service';
import { PrismaService } from '../prisma/prisma.service';
import { BillingStateService, platformSender } from './billing-state.service';

const CODE_TTL_MS = 30 * 60_000;
const MAX_CODE_ATTEMPTS = 5;
const MAX_CODES = 5;
/** Per email address and per IP address, per day. */
const MAX_SIGNUPS_PER_EMAIL = 3;
const MAX_SIGNUPS_PER_IP = 10;

const sha = (v: string) => createHash('sha256').update(v).digest('hex');

/**
 * Public self-serve sign-up: a school fills in one form, proves the admin's
 * email with a 6-digit code (or the link carrying it), and becomes a school
 * on a free trial straight away, or after the operator approves it.
 */
@Injectable()
export class SignupService {
  private readonly logger = new Logger(SignupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provisioning: ProvisioningService,
    private readonly setup: SetupService,
    private readonly state: BillingStateService,
    private readonly audit: AuditService,
  ) {}

  async publicPlans(): Promise<SignupConfig['plans']> {
    const plans = await this.prisma.root.plan.findMany({ where: { isActive: true, isPublic: true }, orderBy: { sortOrder: 'asc' } });
    return plans.map((p) => ({ id: p.id, code: p.code, name: p.name, description: p.description, pricePerStudentKobo: p.pricePerStudentKobo, billingPeriod: p.billingPeriod, features: p.features, maxStudents: p.maxStudents }));
  }

  async config(): Promise<SignupConfig> {
    const s = await this.state.settings();
    return {
      enabled: s.enabled && this.canEmail(),
      trialDays: s.trialDays,
      sessionDiscountPct: s.sessionDiscountPct,
      minBilledStudents: s.minBilledStudents,
      plans: await this.publicPlans(),
    };
  }

  /** Codes go by email; local development without SMTP shows the code instead. */
  private canEmail() {
    return !!platformSender() || env().NODE_ENV !== 'production';
  }

  async slugAvailable(slug: string) {
    if (RESERVED_SLUGS.includes(slug)) return false;
    const [tenant, pending] = await Promise.all([
      this.prisma.root.tenant.findUnique({ where: { slug }, select: { id: true } }),
      this.prisma.root.schoolSignup.findFirst({ where: { slug, status: 'PENDING_REVIEW' }, select: { id: true } }),
    ]);
    return !tenant && !pending;
  }

  private async sendCode(signupId: string, email: string, firstName: string, schoolName: string, origin: string): Promise<string | undefined> {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.prisma.root.schoolSignup.update({
      where: { id: signupId },
      data: { codeHash: sha(`${signupId}:${code}`), codeExpiresAt: new Date(Date.now() + CODE_TTL_MS), codeAttempts: 0, codesSent: { increment: 1 } },
    });
    const link = `${origin}/signup/verify?id=${encodeURIComponent(signupId)}&code=${code}`;
    const mail = platformSender();
    if (mail) {
      const text = `Dear ${firstName},\n\nThank you for signing ${schoolName} up to AI School OS.\n\nYour confirmation code is: ${code}\n\nOr open this link to confirm your email:\n${link}\n\nThe code expires in 30 minutes. If you did not sign up, you can ignore this email; nothing will be set up.\n\nAI School OS`;
      try {
        await mail.send(email, `Your AI School OS code: ${code}`, text);
      } catch (err) {
        this.logger.error(`Sign-up code email to ${email} failed: ${(err as Error).message}`);
        throw new BadRequestException('We could not send the confirmation email just now. Please try again in a few minutes.');
      }
      return undefined;
    }
    if (env().NODE_ENV === 'production') throw new BadRequestException('Sign-up is not available right now.');
    this.logger.warn(`[dev] Sign-up code for ${email}: ${code} (${link})`);
    return code;
  }

  async start(input: SignupInput, ip: string | undefined, origin: string): Promise<SignupResult> {
    const s = await this.state.settings();
    if (!s.enabled || !this.canEmail()) throw new BadRequestException('Self-serve sign-up is not open at the moment. Please contact us to set up your school.');
    const fakeId = `x${sha(input.admin.email + Date.now()).slice(0, 24)}`;
    // A bot filled the hidden field: look successful, do nothing.
    if (input.website) return { id: fakeId, email: input.admin.email };
    const since = new Date(Date.now() - 86_400_000);
    const [byEmail, byIp] = await Promise.all([
      this.prisma.root.schoolSignup.count({ where: { adminEmail: input.admin.email, createdAt: { gte: since } } }),
      ip ? this.prisma.root.schoolSignup.count({ where: { ip, createdAt: { gte: since } } }) : 0,
    ]);
    if (byEmail >= MAX_SIGNUPS_PER_EMAIL || byIp >= MAX_SIGNUPS_PER_IP) throw new HttpException('Too many sign-up attempts today. Please try again tomorrow or contact us.', HttpStatus.TOO_MANY_REQUESTS);
    if (!(await this.slugAvailable(input.slug))) {
      throw new ConflictException({ statusCode: 409, message: 'That portal address is taken', errors: [{ path: 'slug', message: 'Already taken: try another' }] });
    }
    const plan = input.planId ? await this.prisma.root.plan.findFirst({ where: { id: input.planId, isActive: true, isPublic: true }, select: { id: true } }) : null;
    const row = await this.prisma.root.schoolSignup.create({
      data: {
        schoolName: input.schoolName,
        schoolType: input.schoolType,
        state: input.state,
        lga: input.lga,
        approxStudents: input.approxStudents,
        slug: input.slug,
        planId: plan?.id ?? null,
        adminFirstName: input.admin.firstName,
        adminLastName: input.admin.lastName,
        adminEmail: input.admin.email,
        adminPhone: input.admin.phone,
        passwordHash: await hashPassword(input.admin.password),
        ip: ip ?? null,
      },
    });
    const devCode = await this.sendCode(row.id, row.adminEmail, row.adminFirstName, row.schoolName, origin);
    return { id: row.id, email: row.adminEmail, ...(devCode ? { devCode } : {}) };
  }

  async resend(id: string, origin: string): Promise<SignupResult> {
    const row = await this.prisma.root.schoolSignup.findUnique({ where: { id } });
    if (!row || row.status !== 'PENDING_VERIFICATION') throw new NotFoundException('This sign-up has already been confirmed or has expired. Start again.');
    if (row.codesSent >= MAX_CODES) throw new HttpException('We have sent the most codes we can for this sign-up. Please start again tomorrow.', HttpStatus.TOO_MANY_REQUESTS);
    const devCode = await this.sendCode(row.id, row.adminEmail, row.adminFirstName, row.schoolName, origin);
    return { id: row.id, email: row.adminEmail, ...(devCode ? { devCode } : {}) };
  }

  async verify(id: string, code: string): Promise<SignupVerifyResult> {
    const row = await this.prisma.root.schoolSignup.findUnique({ where: { id } });
    const wrong = () => new BadRequestException({ statusCode: 400, message: 'That code is not right, or it has expired', errors: [{ path: 'code', message: 'Check the code in the email' }] });
    if (!row) throw wrong();
    if (row.status === 'APPROVED' || row.status === 'PENDING_REVIEW') return { status: row.status, slug: row.slug, schoolName: row.schoolName };
    if (row.status !== 'PENDING_VERIFICATION' || !row.codeHash || !row.codeExpiresAt) throw wrong();
    if (row.codeAttempts >= MAX_CODE_ATTEMPTS) throw new BadRequestException('Too many wrong codes. Ask for a new code.');
    if (row.codeExpiresAt < new Date()) throw new BadRequestException('That code has expired. Ask for a new code.');
    const a = Buffer.from(sha(`${id}:${code}`));
    const b = Buffer.from(row.codeHash);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      await this.prisma.root.schoolSignup.update({ where: { id }, data: { codeAttempts: { increment: 1 } } });
      throw wrong();
    }
    // Claim it once (a double-click or the link opened twice must not create two schools).
    const claimed = await this.prisma.root.schoolSignup.updateMany({ where: { id, status: 'PENDING_VERIFICATION' }, data: { status: 'PENDING_REVIEW', verifiedAt: new Date(), codeHash: null } });
    if (!claimed.count) {
      const now = await this.prisma.root.schoolSignup.findUniqueOrThrow({ where: { id } });
      return { status: now.status === 'APPROVED' ? 'APPROVED' : 'PENDING_REVIEW', slug: now.slug, schoolName: now.schoolName };
    }
    const s = await this.state.settings();
    if (!s.autoApprove) {
      await this.audit.log({ tenantId: null, actorUserId: null, action: 'signup.pending_review', entityType: 'SchoolSignup', entityId: id, summary: `${row.schoolName} (${row.slug}) signed up and is waiting for review` });
      return { status: 'PENDING_REVIEW', slug: row.slug, schoolName: row.schoolName };
    }
    try {
      await this.createSchool(id, null);
    } catch (err) {
      // Leave it in the review queue rather than losing it (e.g. the address was taken meanwhile).
      this.logger.warn(`Auto-approving sign-up ${id} failed: ${(err as Error).message}`);
      await this.prisma.root.schoolSignup.update({ where: { id }, data: { reviewNote: `Automatic approval failed: ${(err as Error).message}`.slice(0, 500) } });
      return { status: 'PENDING_REVIEW', slug: row.slug, schoolName: row.schoolName };
    }
    return { status: 'APPROVED', slug: row.slug, schoolName: row.schoolName };
  }

  /** Creates the school from a verified sign-up: tenant on trial, admin, Nigerian class and subject templates, billing rules on. */
  async createSchool(id: string, reviewerId: string | null) {
    const row = await this.prisma.root.schoolSignup.findUniqueOrThrow({ where: { id } });
    if (row.status !== 'PENDING_REVIEW' || !row.verifiedAt) throw new BadRequestException('Only confirmed sign-ups waiting for review can be approved');
    const s = await this.state.settings();
    const existingUser = await this.prisma.root.user.findUnique({ where: { email: row.adminEmail }, select: { id: true } });
    const tenant = await this.provisioning.createSchool(
      {
        name: row.schoolName,
        slug: row.slug,
        country: 'NG',
        currency: 'NGN',
        timezone: 'Africa/Lagos',
        planId: row.planId ?? undefined,
        admin: { firstName: row.adminFirstName, lastName: row.adminLastName, email: row.adminEmail },
      },
      { passwordHash: row.passwordHash, trialDays: s.trialDays, contact: { email: row.adminEmail, phone: row.adminPhone, address: `${row.lga}, ${row.state} State`.replace('FCT (Abuja) State', 'FCT, Abuja') } },
    );
    await this.prisma.root.tenantBilling.create({ data: { tenantId: tenant.id, selfServe: true, notes: `Self-serve sign-up: about ${row.approxStudents} students` } });
    await this.prisma.root.subscription.updateMany({ where: { tenantId: tenant.id }, data: { studentSeats: 0, notes: `Estimated ${row.approxStudents} students at sign-up` } });
    await this.prisma.root.schoolSignup.update({
      where: { id },
      data: { status: 'APPROVED', tenantId: tenant.id, passwordHash: '', reviewedById: reviewerId, reviewedAt: reviewerId ? new Date() : null },
    });
    await this.applyTemplates(tenant.id, row.schoolType as SchoolTypeKey);
    await this.audit.log({
      tenantId: tenant.id,
      actorUserId: reviewerId,
      action: 'signup.school_created',
      entityType: 'Tenant',
      entityId: tenant.id,
      summary: `${row.schoolName} (${row.slug}) joined by self-serve sign-up${reviewerId ? ' (approved in the console)' : ''}; ${s.trialDays}-day trial`,
    });
    const mail = platformSender();
    if (mail) {
      const origin = env().CORS_ORIGINS[0] ?? '';
      const text = `Dear ${row.adminFirstName},\n\n${row.schoolName} is ready on AI School OS. Your free trial runs for ${s.trialDays} days.\n\nSign in: ${origin}/login?school=${row.slug}\nEmail: ${row.adminEmail}${existingUser ? '\n(You already had an AI School OS account, so sign in with your existing password.)' : ''}\n\nYour first week plan on the dashboard walks you through setting up classes, staff, students and parents.\n\nAI School OS`;
      await mail.send(row.adminEmail, `${row.schoolName} is ready on AI School OS`, text).catch((e: Error) => this.logger.warn(`Welcome email failed: ${e.message}`));
    }
    return tenant;
  }

  /** The one-click Nigerian classes (arm A) and core subjects for the school's type, as Setup does. Best effort. */
  private async applyTemplates(tenantId: string, type: SchoolTypeKey) {
    const stages = SCHOOL_TYPE_STAGES[type] ?? [];
    if (!stages.length) return;
    try {
      await RequestContextStore.run({ tenantId, permissions: new Set(), userId: undefined }, async () => {
        await this.setup.classes({ stages, arms: ['A'], capacity: 40 });
        await this.setup.subjects({ selections: stages.map((stage) => ({ stage, codes: SUBJECT_TEMPLATES[stage].filter((t) => t[3]).map((t) => t[1]) })) });
      });
    } catch (err) {
      this.logger.warn(`Templates for new school ${tenantId} failed: ${(err as Error).message}`);
    }
  }

  async reject(id: string, reason: string, reviewerId: string) {
    const row = await this.prisma.root.schoolSignup.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Sign-up not found');
    if (row.status !== 'PENDING_REVIEW' && row.status !== 'PENDING_VERIFICATION') throw new BadRequestException(`This sign-up is already ${row.status.toLowerCase().replace('_', ' ')}`);
    await this.prisma.root.schoolSignup.update({ where: { id }, data: { status: 'REJECTED', reviewNote: reason, reviewedById: reviewerId, reviewedAt: new Date(), passwordHash: '', codeHash: null } });
    await this.audit.log({ tenantId: null, action: 'signup.rejected', entityType: 'SchoolSignup', entityId: id, summary: `Declined the sign-up for ${row.schoolName} (${row.slug}): ${reason}` });
    const mail = platformSender();
    if (mail && row.verifiedAt) {
      const text = `Dear ${row.adminFirstName},\n\nThank you for your interest in AI School OS. We are not able to set up ${row.schoolName} through self-serve sign-up at the moment.\n\nReason: ${reason}\n\nIf you think this is a mistake, simply reply to this email and we will help.\n\nAI School OS`;
      await mail.send(row.adminEmail, `Your AI School OS sign-up for ${row.schoolName}`, text).catch((e: Error) => this.logger.warn(`Rejection email failed: ${e.message}`));
    }
  }

  async list(status?: SignupStatus): Promise<SignupRow[]> {
    const where: Prisma.SchoolSignupWhereInput = status ? { status } : { status: { not: 'PENDING_VERIFICATION' } };
    const rows = await this.prisma.root.schoolSignup.findMany({ where, orderBy: { createdAt: 'desc' }, take: 300 });
    const plans = new Map((await this.prisma.root.plan.findMany({ select: { id: true, name: true } })).map((p) => [p.id, p.name]));
    return rows.map((r) => ({
      id: r.id,
      status: r.status as SignupStatus,
      schoolName: r.schoolName,
      schoolType: r.schoolType as SchoolTypeKey,
      state: r.state,
      lga: r.lga,
      approxStudents: r.approxStudents,
      slug: r.slug,
      plan: r.planId ? (plans.get(r.planId) ?? null) : null,
      admin: { name: `${r.adminFirstName} ${r.adminLastName}`, email: r.adminEmail, phone: r.adminPhone },
      verifiedAt: r.verifiedAt?.toISOString() ?? null,
      reviewNote: r.reviewNote,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      tenantId: r.tenantId,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** Housekeeping: unconfirmed sign-ups older than a week are removed (they hold a password hash). */
  async purgeStale() {
    const r = await this.prisma.root.schoolSignup.deleteMany({ where: { status: 'PENDING_VERIFICATION', createdAt: { lt: new Date(Date.now() - 7 * 86_400_000) } } });
    return r.count;
  }
}
