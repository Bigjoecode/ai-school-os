/**
 * Demo data for the SaaS console: three plans, a handful of lighter schools
 * around Greenfield and Sunrise (trials, a past-due account, a suspended
 * one), subscriptions, a year of invoices and payments, AI and API usage
 * history, support tickets and beta feature flags.
 */
import { randomBytes } from 'node:crypto';
import { SYSTEM_ROLES } from '@aischool/shared';
import type { PrismaClient } from '../generated/prisma/client';
import { hashPassword } from '../auth/password';

const DAY = 86_400_000;
let state = 20261002;
function rand() {
  state |= 0;
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
const between = (a: number, b: number) => Math.floor(a + rand() * (b - a + 1));
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const dateOnly = (d: Date) => new Date(d.toISOString().slice(0, 10) + 'T00:00:00Z');
const addMonths = (d: Date, m: number) => {
  const r = new Date(d);
  r.setUTCMonth(r.getUTCMonth() + m);
  return r;
};

const FIRST = ['Chinedu', 'Adaeze', 'Tunde', 'Aisha', 'David', 'Ngozi', 'Ibrahim', 'Chioma', 'Samuel', 'Zainab', 'Femi', 'Blessing', 'Musa', 'Kemi', 'Obinna', 'Halima', 'Yusuf', 'Grace', 'Kelechi', 'Funmilayo'];
const LAST = ['Okafor', 'Adeyemi', 'Bello', 'Eze', 'Ibrahim', 'Nwosu', 'Abubakar', 'Chukwu', 'Olawale', 'Danjuma', 'Afolabi', 'Umar', 'Balogun', 'Obi', 'Lawal'];

export async function seedPlans(prisma: PrismaClient) {
  const plans = [
    {
      code: 'starter',
      name: 'Starter',
      description: 'The school core, attendance, exams and results, fees, the timetable and messages, with a small AI allowance.',
      pricePerStudentKobo: 1_200 * 100,
      billingPeriod: 'PER_TERM' as const,
      aiMonthlyBudgetUsd: 10,
      maxStudents: 300,
      features: ['ai', 'messaging', 'timetable'],
      sortOrder: 1,
    },
    {
      code: 'school-license',
      name: 'Growth',
      description: 'Everything in Starter plus the school website, online fee payments, live classes and the library.',
      pricePerStudentKobo: 2_000 * 100,
      billingPeriod: 'PER_TERM' as const,
      aiMonthlyBudgetUsd: 25,
      maxStudents: 1_500,
      features: ['ai', 'website', 'messaging', 'online_payments', 'live_classes', 'timetable', 'library'],
      sortOrder: 2,
    },
    {
      code: 'enterprise',
      name: 'Enterprise',
      description: 'Every module, including payroll, inventory, transport and hostels, with a large AI allowance and priority support.',
      pricePerStudentKobo: 3_500 * 100,
      billingPeriod: 'PER_TERM' as const,
      aiMonthlyBudgetUsd: 100,
      maxStudents: null,
      features: [],
      sortOrder: 3,
    },
  ];
  const out: Record<string, { id: string; pricePerStudentKobo: number }> = {};
  for (const p of plans) out[p.code] = await prisma.plan.upsert({ where: { code: p.code }, update: p, create: p });
  return { starter: out.starter!, growth: out['school-license']!, enterprise: out.enterprise! };
}

interface Ctx {
  plans: Awaited<ReturnType<typeof seedPlans>>;
  greenfieldId: string;
  sunriseId: string;
  greenfieldAdminId: string;
  /** Local development only: demo platform staff with the owner's password. */
  demoStaff: boolean;
}

export async function seedPlatform(prisma: PrismaClient, ctx: Ctx): Promise<string> {
  state = 20261002;
  const { plans } = ctx;
  const randomHash = async () => hashPassword(randomBytes(24).toString('hex'));

  // ---------------------------------------------------------- the platform team
  const staff = [];
  if (ctx.demoStaff) {
    for (const [email, first, last, role] of [
      ['support@aischool.os', 'Tolu', 'Bakare', 'SUPPORT_ADMIN'],
      ['finance@aischool.os', 'Ifeoma', 'Udeh', 'FINANCE_ADMIN'],
    ] as const) {
      staff.push(
        await prisma.user.upsert({
          where: { email },
          update: { platformRole: role, status: 'ACTIVE' },
          create: { email, firstName: first, lastName: last, platformRole: role, passwordHash: await hashPassword('AiSchoolOS#2026'), lastLoginAt: daysAgo(1) },
        }),
      );
    }
  }
  const owner = await prisma.user.findFirst({ where: { platformRole: 'SUPER_ADMIN' }, orderBy: { createdAt: 'asc' } });
  const supportAgent = staff[0] ?? owner;

  // ---------------------------------------------------------- lighter schools
  const SCHOOLS = [
    { slug: 'crestview', name: 'Crestview College', short: 'CVC', city: 'Wuse II, Abuja', plan: plans.growth, status: 'ACTIVE', sub: 'PAST_DUE', students: 640, branches: ['Wuse Campus', 'Gwarinpa Campus'], since: 420, ai: 38, api: 1.1 },
    { slug: 'royalgems', name: 'Royal Gems Academy', short: 'RGA', city: 'GRA, Port Harcourt', plan: plans.starter, status: 'ACTIVE', sub: 'ACTIVE', students: 210, branches: ['Main Campus'], since: 300, ai: 9, api: 0.6 },
    { slug: 'brightfuture', name: 'Bright Future Schools', short: 'BFS', city: 'Bodija, Ibadan', plan: plans.growth, status: 'TRIAL', sub: 'TRIALING', students: 85, branches: ['Main Campus'], since: 27, trialDays: 3, ai: 4, api: 0.4 },
    { slug: 'kingsqueens', name: 'Kings & Queens Montessori', short: 'KQM', city: 'Lekki, Lagos', plan: plans.starter, status: 'ACTIVE', sub: 'ACTIVE', students: 291, branches: ['Main Campus'], since: 200, ai: 46, api: 0.9 },
    { slug: 'unitymodel', name: 'Unity Model School', short: 'UMS', city: 'Nassarawa, Kano', plan: plans.starter, status: 'SUSPENDED', sub: 'PAST_DUE', students: 150, branches: ['Main Campus'], since: 380, ai: 0, api: 0 },
    { slug: 'lighthouse', name: 'Lighthouse International School', short: 'LIS', city: 'Independence Layout, Enugu', plan: plans.growth, status: 'TRIAL', sub: 'TRIALING', students: 12, branches: ['Main Campus'], since: 4, trialDays: 26, ai: 1, api: 0.2 },
  ] as const;

  const tenants: { id: string; name: string; slug: string; students: number; ai: number; api: number; plan: { id: string; pricePerStudentKobo: number }; sub: string; since: number; status: string }[] = [];
  for (const s of SCHOOLS) {
    await prisma.tenant.deleteMany({ where: { slug: s.slug } });
    const createdAt = daysAgo(s.since);
    const t = await prisma.tenant.create({
      data: {
        slug: s.slug,
        name: s.name,
        shortName: s.short,
        status: s.status,
        planId: s.plan.id,
        email: `info@${s.slug}.demo`,
        phone: `+234 80${between(1, 9)} ${between(100, 999)} ${between(1000, 9999)}`,
        address: s.city,
        trialEndsAt: 'trialDays' in s ? new Date(Date.now() + s.trialDays * DAY) : null,
        createdAt,
      },
    });
    await prisma.role.createMany({ data: SYSTEM_ROLES.map((r) => ({ tenantId: t.id, key: r.key, name: r.name, description: r.description, isSystem: true, permissions: [...r.permissions] })) });
    const branchIds: string[] = [];
    for (const [i, b] of s.branches.entries()) {
      branchIds.push((await prisma.branch.create({ data: { tenantId: t.id, name: b, code: b.slice(0, 3).toUpperCase(), isMain: i === 0, createdAt } })).id);
    }
    const first = pick(FIRST);
    const last = pick(LAST);
    const adminUser = await prisma.user.upsert({
      where: { email: `admin@${s.slug}.demo` },
      update: { lastLoginAt: s.status === 'SUSPENDED' ? daysAgo(70) : daysAgo(between(0, 6)) },
      create: { email: `admin@${s.slug}.demo`, firstName: first, lastName: last, passwordHash: await randomHash(), lastLoginAt: s.status === 'SUSPENDED' ? daysAgo(70) : daysAgo(between(0, 6)) },
    });
    const role = await prisma.role.findUniqueOrThrow({ where: { tenantId_key: { tenantId: t.id, key: 'school_admin' } } });
    await prisma.membership.create({ data: { tenantId: t.id, userId: adminUser.id, roles: { create: { roleId: role.id } } } });

    // Students admitted over the school's life, a few who have left.
    const rows = Array.from({ length: s.students + Math.round(s.students * 0.04) }, (_, i) => {
      const left = i >= s.students;
      const joined = daysAgo(Math.max(0, Math.round(s.since * Math.pow(rand(), 0.6))));
      return {
        tenantId: t.id,
        branchId: branchIds[i % branchIds.length]!,
        admissionNumber: `${s.short}/${joined.getUTCFullYear()}/${String(i + 1).padStart(4, '0')}`,
        firstName: pick(FIRST),
        lastName: pick(LAST),
        gender: rand() < 0.5 ? ('MALE' as const) : ('FEMALE' as const),
        status: left ? ('WITHDRAWN' as const) : ('ACTIVE' as const),
        admittedOn: dateOnly(joined),
        createdAt: joined,
        updatedAt: left ? daysAgo(between(1, 40)) : joined,
      };
    });
    await prisma.student.createMany({ data: rows });
    tenants.push({ id: t.id, name: s.name, slug: s.slug, students: s.students, ai: s.ai, api: s.api, plan: s.plan, sub: s.sub, since: s.since, status: s.status });
  }

  // ---------------------------------------------------------- subscriptions, invoices, payments
  let invoiceNo = 0;
  const nextNumber = () => `AIS-${new Date().getUTCFullYear()}-${String(++invoiceNo).padStart(5, '0')}`;
  const termStart = new Date('2026-09-07T00:00:00Z');

  const all = [
    { id: ctx.greenfieldId, name: 'Greenfield International School', students: 392, plan: plans.enterprise, sub: 'ACTIVE', since: 400, seats: 400, discount: 10, status: 'ACTIVE' },
    { id: ctx.sunriseId, name: 'Sunrise Academy', students: 1, plan: plans.growth, sub: 'TRIALING', since: 20, seats: 0, discount: 0, status: 'TRIAL' },
    ...tenants.map((t) => ({ ...t, seats: t.slug === 'crestview' ? 600 : 0, discount: t.slug === 'crestview' ? 5 : 0 })),
  ];
  await prisma.tenant.update({ where: { id: ctx.sunriseId }, data: { status: 'TRIAL', planId: plans.growth.id, trialEndsAt: new Date(Date.now() + 9 * DAY) } });
  await prisma.tenant.update({ where: { id: ctx.greenfieldId }, data: { planId: plans.enterprise.id } });

  for (const t of all) {
    const trial = t.sub === 'TRIALING';
    const start = trial ? daysAgo(t.since) : termStart;
    const sub = await prisma.subscription.create({
      data: {
        tenantId: t.id,
        planId: t.plan.id,
        status: t.sub as 'ACTIVE' | 'TRIALING' | 'PAST_DUE',
        studentSeats: t.seats,
        discountPct: t.discount,
        currentPeriodStart: start,
        currentPeriodEnd: trial ? new Date(start.getTime() + 30 * DAY) : addMonths(start, 4),
        notes: t.discount ? `${t.discount}% multi-term discount agreed with the proprietor` : null,
        createdAt: daysAgo(t.since),
      },
    });
    if (trial) continue;
    // One invoice per term since the school joined: earlier ones paid, the current one paid unless the account is behind.
    const terms = Math.min(3, Math.ceil(t.since / 120));
    for (let k = terms - 1; k >= 0; k--) {
      const ps = addMonths(termStart, -4 * k);
      const seats = Math.max(t.seats, Math.round(t.students * (1 - 0.05 * k)));
      const gross = seats * t.plan.pricePerStudentKobo;
      const discount = Math.round((gross * t.discount) / 100);
      const amount = gross - discount;
      const issued = new Date(ps.getTime() + DAY);
      const due = new Date(issued.getTime() + 14 * DAY);
      const behind = k === 0 && t.sub === 'PAST_DUE';
      const partial = behind && t.status === 'ACTIVE' ? Math.round(amount * 0.4) : 0;
      const inv = await prisma.platformInvoice.create({
        data: {
          number: nextNumber(),
          tenantId: t.id,
          subscriptionId: k === 0 ? sub.id : null,
          description: `Term subscription: ${seats} students`,
          periodStart: ps,
          periodEnd: addMonths(ps, 4),
          seats,
          unitKobo: t.plan.pricePerStudentKobo,
          discountKobo: discount,
          amountKobo: amount,
          paidKobo: behind ? partial : amount,
          status: behind ? 'OPEN' : 'PAID',
          issuedAt: issued,
          dueDate: dateOnly(due),
          paidAt: behind ? null : new Date(due.getTime() - between(1, 10) * DAY),
          createdAt: issued,
        },
      });
      const paid = behind ? partial : amount;
      if (paid > 0) {
        const online = rand() < 0.5;
        await prisma.platformPayment.create({
          data: {
            tenantId: t.id,
            invoiceId: inv.id,
            amountKobo: paid,
            method: online ? 'PAYSTACK' : 'BANK_TRANSFER',
            status: 'SUCCESS',
            reference: online ? `SUB-DEMO${randomBytes(4).toString('hex').toUpperCase()}` : `TRF/${inv.number}`,
            paidAt: inv.paidAt ?? new Date(issued.getTime() + 5 * DAY),
            recordedById: online ? null : (staff[1]?.id ?? owner?.id ?? null),
            createdAt: inv.paidAt ?? new Date(issued.getTime() + 5 * DAY),
          },
        });
      }
    }
  }

  // ---------------------------------------------------------- AI and API usage history
  const AGENTS = ['assistant:teacher', 'assistant:principal', 'lesson-plan', 'question-writer', 'report-remarks', 'comms-draft', 'website-assistant', 'class-pack'];
  const usage: { tenantId: string | null; agent: string; provider: string; model: string; inputTokens: number; outputTokens: number; costUsd: number; latencyMs: number; success: boolean; createdAt: Date }[] = [];
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  for (const t of tenants) {
    // Last month and this month, in proportion to the school's appetite for AI.
    for (const [from, to, share] of [
      [new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() - 1, 1)), monthStart, 1],
      [monthStart, new Date(), 0.15],
    ] as const) {
      const calls = Math.round(t.ai * 6 * share);
      for (let i = 0; i < calls; i++) {
        const advanced = rand() < 0.25;
        const input = between(800, 6000);
        const output = between(200, 1800);
        usage.push({
          tenantId: t.id,
          agent: pick(AGENTS),
          provider: 'anthropic',
          model: advanced ? 'claude-opus-5-5' : 'claude-haiku-4-5',
          inputTokens: input,
          outputTokens: output,
          costUsd: Math.round(((advanced ? input * 4 + output * 20 : input * 1 + output * 5) / 1e6) * 1e6) / 1e6,
          latencyMs: between(900, advanced ? 14000 : 5000),
          success: rand() > 0.02,
          createdAt: new Date(from.getTime() + rand() * Math.max(1, to.getTime() - from.getTime())),
        });
      }
    }
  }
  for (let i = 0; i < 6; i++) usage.push({ tenantId: null, agent: pick(['platform-briefing', 'support-assist']), provider: 'anthropic', model: 'claude-haiku-4-5', inputTokens: 4000, outputTokens: 700, costUsd: 0.0075, latencyMs: 4200, success: true, createdAt: daysAgo(between(0, 20)) });
  await prisma.aiUsage.createMany({ data: usage });

  const apiRows: { scope: string; day: Date; requests: number; clientErrors: number; serverErrors: number; totalMs: bigint; maxMs: number }[] = [];
  const scopes = [{ id: ctx.greenfieldId, students: 392, api: 1.4, since: 400 }, { id: ctx.sunriseId, students: 40, api: 0.5, since: 20 }, ...tenants];
  for (let d = 29; d >= 0; d--) {
    const day = dateOnly(daysAgo(d));
    const weekend = [0, 6].includes(day.getUTCDay());
    for (const t of scopes) {
      if (!t.api || d > t.since) continue;
      const requests = Math.round(t.students * 9 * t.api * (weekend ? 0.15 : 1) * (0.8 + rand() * 0.4));
      if (!requests) continue;
      apiRows.push({ scope: t.id, day, requests, clientErrors: Math.round(requests * 0.012), serverErrors: rand() < 0.15 ? between(1, 6) : 0, totalMs: BigInt(requests * between(70, 160)), maxMs: between(1200, 6000) });
    }
    apiRows.push({ scope: 'platform', day, requests: between(300, 900), clientErrors: between(10, 40), serverErrors: 0, totalMs: BigInt(600 * 60), maxMs: between(400, 2000) });
  }
  await prisma.apiUsageDaily.deleteMany({});
  await prisma.apiUsageDaily.createMany({ data: apiRows });

  // ---------------------------------------------------------- support tickets
  const crest = tenants.find((t) => t.slug === 'crestview')!;
  const royal = tenants.find((t) => t.slug === 'royalgems')!;
  const bright = tenants.find((t) => t.slug === 'brightfuture')!;
  const kq = tenants.find((t) => t.slug === 'kingsqueens')!;
  const adminOf = async (tenantId: string) => (await prisma.membership.findFirst({ where: { tenantId }, select: { userId: true } }))?.userId ?? null;
  const TICKETS: { tenantId: string; opener: string | null; subject: string; category: string; priority: string; status: 'OPEN' | 'PENDING' | 'RESOLVED' | 'CLOSED'; hoursAgo: number; thread: [boolean, string, boolean?][] }[] = [
    {
      tenantId: crest.id,
      opener: await adminOf(crest.id),
      subject: 'Parents get an error when paying fees online',
      category: 'TECHNICAL',
      priority: 'URGENT',
      status: 'OPEN',
      hoursAgo: 3,
      thread: [[false, 'Since this morning several parents say the payment page shows "Paystack rejected the secret key". We changed our Paystack account last week. Fees are due on Friday so this is urgent.']],
    },
    {
      tenantId: ctx.greenfieldId,
      opener: ctx.greenfieldAdminId,
      subject: 'Importing last session’s results',
      category: 'DATA',
      priority: 'NORMAL',
      status: 'PENDING',
      hoursAgo: 30,
      thread: [
        [false, 'We have last session’s results in Excel. Can we bring them in so the report cards show cumulative averages?'],
        [true, 'Yes. Send us the spreadsheet with one row per student and subject (admission number, subject, CA and exam scores) and we will import it for you. Could you confirm which terms it covers?'],
        [true, 'Internal: check the score import handles the 2025/2026 grading scale.', true],
      ],
    },
    {
      tenantId: royal.id,
      opener: await adminOf(royal.id),
      subject: 'Add a second accountant',
      category: 'ACCOUNT',
      priority: 'LOW',
      status: 'RESOLVED',
      hoursAgo: 96,
      thread: [
        [false, 'How do we give our new bursar access to fees but not to payroll?'],
        [true, 'Go to Settings → Users, invite her, and give her the Accountant role. If she should not see payroll, edit the Accountant role and untick the payroll permissions.'],
        [false, 'Done, thank you!'],
      ],
    },
    {
      tenantId: bright.id,
      opener: await adminOf(bright.id),
      subject: 'Can we extend our trial?',
      category: 'BILLING',
      priority: 'NORMAL',
      status: 'OPEN',
      hoursAgo: 20,
      thread: [[false, 'Our proprietor travels next week and must approve the subscription. Could the trial be extended by two weeks? We have entered all our students and teachers already.']],
    },
    {
      tenantId: kq.id,
      opener: await adminOf(kq.id),
      subject: 'Montessori-style report cards',
      category: 'FEATURE_REQUEST',
      priority: 'LOW',
      status: 'OPEN',
      hoursAgo: 52,
      thread: [[false, 'Our nursery uses developmental milestones (emerging, developing, secure) rather than scores. Could report cards support that?']],
    },
  ];
  for (const t of TICKETS) {
    const created = new Date(Date.now() - t.hoursAgo * 3_600_000);
    const lastPublic = [...t.thread].reverse().find(([, , internal]) => !internal);
    const ticket = await prisma.supportTicket.create({
      data: {
        tenantId: t.tenantId,
        openedById: t.opener,
        subject: t.subject,
        category: t.category,
        priority: t.priority,
        status: t.status,
        assignedToId: t.thread.some(([fromPlatform]) => fromPlatform) ? (supportAgent?.id ?? null) : null,
        awaitingPlatform: !(lastPublic?.[0] ?? false) && t.status !== 'RESOLVED',
        createdAt: created,
        lastMessageAt: new Date(created.getTime() + (t.thread.length - 1) * 2 * 3_600_000),
        firstResponseAt: t.thread.some(([p]) => p) ? new Date(created.getTime() + 2 * 3_600_000) : null,
        resolvedAt: t.status === 'RESOLVED' ? new Date(created.getTime() + 6 * 3_600_000) : null,
      },
    });
    for (const [i, [fromPlatform, body, internal]] of t.thread.entries()) {
      await prisma.supportMessage.create({
        data: { tenantId: t.tenantId, ticketId: ticket.id, authorId: fromPlatform ? (supportAgent?.id ?? null) : t.opener, fromPlatform, internal: internal ?? false, body, createdAt: new Date(created.getTime() + i * 2 * 3_600_000) },
      });
    }
  }

  // ---------------------------------------------------------- beta flags
  const FLAGS = [
    { key: 'report_card_designer', name: 'Report card designer', description: 'Drag-and-drop report card layouts.', enabled: true, rolloutPercent: 0 },
    { key: 'ai_voice_notes', name: 'AI voice notes for teachers', description: 'Dictate observations; AI turns them into remarks.', enabled: true, rolloutPercent: 50 },
    { key: 'whatsapp_chatbot', name: 'WhatsApp parent chatbot', description: 'Parents ask the school assistant on WhatsApp.', enabled: false, rolloutPercent: 0 },
  ];
  for (const f of FLAGS) await prisma.featureFlag.upsert({ where: { key: f.key }, update: f, create: { ...f, kind: 'BETA' } });
  await prisma.tenantFeature.create({ data: { tenantId: ctx.greenfieldId, flagKey: 'report_card_designer', enabled: true, note: 'Pilot school' } });

  // ---------------------------------------------------------- console history
  const unity = tenants.find((t) => t.slug === 'unitymodel')!;
  const HISTORY: [number, string, string, string | null][] = [
    [380, 'platform.school_created', 'Created school Unity Model School (unitymodel)', unity.id],
    [70, 'billing.past_due', 'Subscription is past due: invoice overdue', unity.id],
    [12, 'platform.school_suspended', 'Suspended Unity Model School: no payment for 60 days after three reminders', null],
    [27, 'platform.school_created', 'Created school Bright Future Schools (brightfuture)', bright.id],
    [9, 'platform.plan_updated', 'Updated the Growth plan', null],
    [5, 'platform.feature_override', 'Turned on Report card designer for Greenfield International School (Pilot school)', null],
  ];
  for (const [d, action, summary, tenantId] of HISTORY) {
    await prisma.auditLog.create({ data: { tenantId, actorUserId: tenantId ? null : (owner?.id ?? null), action, summary, createdAt: daysAgo(d) } });
  }

  return `${tenants.length} more schools, ${invoiceNo} subscription invoices, ${TICKETS.length} support tickets`;
}
