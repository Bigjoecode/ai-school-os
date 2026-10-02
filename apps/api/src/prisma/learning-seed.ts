/**
 * Phase 15 demo data: a student login for the demo parent's child (on AI
 * Plus, with tutoring history, mastery, a plan, flashcards and practice),
 * a WAEC Prep sponsorship for SS 3, families paying for AI and exam prep
 * (with a coupon and a refund), a parent handbook in the knowledge base,
 * and ledger postings for every seeded money event.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import type { PrismaClient } from '../generated/prisma/client';
import { hashPassword } from '../auth/password';
import { chunk } from '../knowledge/extract';

const DAY = 86_400_000;
let state = 20261015;
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
const addMonths = (d: Date, m: number) => {
  const r = new Date(d);
  r.setUTCMonth(r.getUTCMonth() + m);
  return r;
};
/** Paystack's local rate: 1.5% + ₦100 (waived under ₦2,500), capped at ₦2,000. */
export const paystackFee = (kobo: number) => Math.min(2_000_00, Math.round(kobo * 0.015) + (kobo >= 2_500_00 ? 100_00 : 0));

const HANDBOOK = `Greenfield International School — Parent Handbook 2026/2027

School hours
Lessons run from 7:45am to 2:30pm, Monday to Friday. Clubs and extra lessons run until 4:00pm. The gates open at 7:00am; children arriving after 8:00am must sign in at reception.

Term dates
First term runs from 7 September to 18 December 2026, with a mid-term break on 22 and 23 October. Second term runs from 4 January to 1 April 2027. Third term runs from 19 April to 23 July 2027.

Fees and payment
Fees are due by the end of the second week of each term. You can pay online from the parent portal by card or bank transfer, or at the bursary. Families with three or more children at the school receive a 10% discount on tuition for the third child. Instalment plans can be agreed with the bursar before the start of term.

Uniform
Pupils wear the green and white school uniform with black shoes. On Wednesdays pupils wear their house T-shirts. Jewellery other than a wristwatch and small stud earrings is not allowed.

Attendance and absence
If your child will be absent, please inform the school office before 8:30am on the first day of absence. A doctor's note is required for absences of more than three days. Holidays during term time are not authorised.

Phones and devices
Phones must be handed in at the start of the day and collected at home time. Tablets used for learning stay in school.

Contact
School office: +234 803 000 1234 (7:30am–4:00pm). Email: admissions@greenfield.demo. The bursary is open from 8:00am to 2:00pm.`;

const PROSPECTUS = `Greenfield International School — Admissions Prospectus

How to apply
Complete the online application on the school website. Our admissions team will call you within two working days to arrange a school visit and an entrance assessment in English and mathematics.

Entry points
We admit pupils from Nursery 1 to SS 2. Entry into SS 3 is not usually possible.

Acceptance fee
An acceptance fee of ₦50,000 secures a place and is deducted from the first term's tuition.

School bus
Our buses serve Lekki, Ajah, Victoria Island and Ikeja. Routes and termly fees are available from the school office.`;

interface Ctx {
  greenfieldId: string;
  sunriseId: string;
  parentUserId: string;
  financeUserId: string | null;
}

/** Minimal double-entry posting for seeded money events. */
async function post(prisma: PrismaClient, e: { domain: string; sourceType: string; sourceId: string; tenantId?: string | null; userId?: string | null; memo: string; event: string; at: Date }, lines: { account: string; debitKobo?: number; creditKobo?: number }[]) {
  const txnId = randomUUID();
  await prisma.ledgerEntry.createMany({
    data: lines.map((l) => ({ txnId, account: l.account, debitKobo: l.debitKobo ?? 0, creditKobo: l.creditKobo ?? 0, domain: e.domain, sourceType: e.sourceType, sourceId: e.sourceId, tenantId: e.tenantId ?? null, userId: e.userId ?? null, memo: `[${e.event}] ${e.memo}`, createdAt: e.at })),
  });
}

const REVENUE: Record<string, string> = { SCHOOL: 'REVENUE_SCHOOL', STUDENT_AI: 'REVENUE_STUDENT_AI', EXAM: 'REVENUE_EXAM' };

export async function seedLearning(prisma: PrismaClient, ctx: Ctx): Promise<string> {
  state = 20261015;
  const g = ctx.greenfieldId;
  const products = Object.fromEntries((await prisma.product.findMany()).map((p) => [p.code, p]));
  const plus = products.AI_PLUS!;
  const waec = products.EXAM_WAEC_PREP!;
  const family = products.AI_FAMILY!;
  await prisma.ledgerEntry.deleteMany({});
  await prisma.refund.deleteMany({});
  await prisma.coupon.deleteMany({});
  await prisma.consumerSubscription.deleteMany({});
  await prisma.consumerOrder.deleteMany({});
  await prisma.user.deleteMany({ where: { email: { endsWith: '@parents.demo' } } });

  // ---------------------------------------------------------- the demo student
  const link = await prisma.studentGuardian.findFirstOrThrow({ where: { tenantId: g, guardian: { userId: ctx.parentUserId } }, include: { student: { include: { classArm: { include: { classLevel: true } } } } } });
  const child = link.student;
  const studentUser = await prisma.user.upsert({
    where: { email: 'student@greenfield.demo' },
    update: { firstName: child.firstName, lastName: child.lastName, passwordHash: await hashPassword('Greenfield#2026'), status: 'ACTIVE' },
    create: { email: 'student@greenfield.demo', firstName: child.firstName, lastName: child.lastName, passwordHash: await hashPassword('Greenfield#2026') },
  });
  await prisma.student.update({ where: { id: child.id }, data: { userId: studentUser.id } });
  const studentRole = await prisma.role.findUniqueOrThrow({ where: { tenantId_key: { tenantId: g, key: 'student' } } });
  await prisma.membership.create({ data: { tenantId: g, userId: studentUser.id, roles: { create: { roleId: studentRole.id } } } });

  // ---------------------------------------------------------- coupons
  await prisma.coupon.create({ data: { code: 'LAUNCH20', description: 'Launch offer: 20% off the first term', percentOff: 20, productCodes: ['AI_PLUS', 'AI_FAMILY'], maxRedemptions: 200, redemptions: 0, expiresAt: new Date(Date.now() + 60 * DAY) } });
  await prisma.coupon.create({ data: { code: 'PTA-GREENFIELD', description: 'PTA partnership: ₦2,000 off exam prep', amountOffKobo: 2_000_00, productCodes: ['EXAM_WAEC_PREP', 'EXAM_NECO_PREP', 'EXAM_JAMB_PREP'], maxRedemptions: 50 } });

  // ---------------------------------------------------------- families paying for AI and exam prep
  const orders: { id: string; amountKobo: number; feeKobo: number; at: Date; userId: string; domain: string; memo: string; refund?: number }[] = [];
  const buy = async (userId: string, email: string, product: typeof plus, students: { id: string; tenantId: string }[], o: { daysAgo: number; coupon?: string; discountPct?: number; status?: string; renewals?: number }) => {
    const paidAt = daysAgo(o.daysAgo);
    const start = paidAt;
    const end = addMonths(start, product.periodMonths);
    const discount = o.discountPct ? Math.round((product.priceKobo * o.discountPct) / 100) : 0;
    const amount = product.priceKobo - discount;
    const status = o.status ?? (end > new Date() ? 'ACTIVE' : 'EXPIRED');
    const sub = await prisma.consumerSubscription.create({
      data: {
        userId,
        productId: product.id,
        status,
        priceKobo: product.priceKobo,
        email,
        autoRenew: product.period !== 'ONE_OFF',
        cardHint: pick(['Visa •••• 4081', 'Mastercard •••• 2210', 'Verve •••• 6633']),
        currentPeriodStart: start,
        currentPeriodEnd: end,
        couponCode: o.coupon ?? null,
        createdAt: paidAt,
        students: { create: students.map((s) => ({ studentId: s.id, tenantId: s.tenantId })) },
      },
    });
    const fee = paystackFee(amount);
    const order = await prisma.consumerOrder.create({
      data: { reference: `FAM-DEMO-${randomBytes(4).toString('hex').toUpperCase()}`, userId, productId: product.id, subscriptionId: sub.id, studentIds: students.map((s) => s.id), amountKobo: amount, discountKobo: discount, feeKobo: fee, couponCode: o.coupon ?? null, status: 'PAID', paidAt, createdAt: paidAt },
    });
    if (status !== 'CANCELLED') {
      await prisma.studentEntitlement.createMany({
        data: students.flatMap((s) => product.entitlements.map((key) => ({ tenantId: s.tenantId, studentId: s.id, key, source: 'PARENT', consumerSubscriptionId: sub.id, productId: product.id, aiSessions: key.startsWith('STUDENT_AI') ? product.aiSessions : null, startsAt: start, endsAt: end, createdAt: paidAt }))),
      });
    }
    orders.push({ id: order.id, amountKobo: amount, feeKobo: fee, at: paidAt, userId, domain: product.kind === 'EXAM' ? 'EXAM' : 'STUDENT_AI', memo: `${product.name} purchase ${order.reference}` });
    return { sub, order };
  };

  const parent = await prisma.user.findUniqueOrThrow({ where: { id: ctx.parentUserId } });
  await buy(parent.id, parent.email, plus, [{ id: child.id, tenantId: g }], { daysAgo: 24, coupon: 'LAUNCH20', discountPct: 20 });

  // Other Greenfield families: guardians get portal accounts and some buy AI Plus or exam prep.
  const guardians = await prisma.guardian.findMany({
    where: { tenantId: g, userId: null },
    include: { students: { include: { student: { include: { classArm: { include: { classLevel: true } } } } } } },
    take: 400,
  });
  const parentRole = await prisma.role.findUniqueOrThrow({ where: { tenantId_key: { tenantId: g, key: 'parent' } } });
  const pwd = await hashPassword(randomBytes(24).toString('hex'));
  let plusCount = 0;
  let examCount = 0;
  let familyCount = 0;
  for (const gd of guardians) {
    const kids = gd.students.map((x) => x.student).filter((s) => s.status === 'ACTIVE');
    if (!kids.length) continue;
    const r = rand();
    const senior = kids.find((k) => k.classArm?.classLevel.code === 'SS3');
    const wantsFamily = kids.length >= 2 && familyCount < 4 && r < 0.3;
    const wantsPlus = !wantsFamily && plusCount < 34 && r < 0.12;
    const wantsExam = !!senior && examCount < 6 && rand() < 0.5;
    if (!wantsFamily && !wantsPlus && !wantsExam) continue;
    const email = `family.${gd.id.slice(-8)}@parents.demo`;
    const u = await prisma.user.create({ data: { email, firstName: gd.firstName, lastName: gd.lastName, passwordHash: pwd, lastLoginAt: daysAgo(between(0, 10)) } });
    await prisma.guardian.update({ where: { id: gd.id }, data: { userId: u.id } });
    await prisma.membership.create({ data: { tenantId: g, userId: u.id, roles: { create: { roleId: parentRole.id } } } });
    if (wantsFamily) {
      familyCount++;
      await buy(u.id, email, family, kids.slice(0, 3).map((k) => ({ id: k.id, tenantId: g })), { daysAgo: between(5, 60) });
    } else if (wantsPlus) {
      plusCount++;
      const coupon = rand() < 0.25;
      const cancelled = plusCount === 7;
      await buy(u.id, email, plus, [{ id: kids[0]!.id, tenantId: g }], { daysAgo: between(3, 110), ...(coupon ? { coupon: 'LAUNCH20', discountPct: 20 } : {}), ...(cancelled ? { status: 'CANCELLED' } : {}) });
    }
    if (wantsExam && senior) {
      examCount++;
      await buy(u.id, email, waec, [{ id: senior.id, tenantId: g }], { daysAgo: between(2, 40) });
    }
  }
  await prisma.coupon.update({ where: { code: 'LAUNCH20' }, data: { redemptions: await prisma.consumerOrder.count({ where: { couponCode: 'LAUNCH20' } }) } });

  // One refund: a family bought AI Plus twice by mistake.
  const refundOrder = await prisma.consumerOrder.findFirst({ where: { couponCode: null, product: { code: 'AI_PLUS' }, userId: { not: parent.id } }, orderBy: { createdAt: 'asc' } });
  if (refundOrder) {
    await prisma.consumerOrder.update({ where: { id: refundOrder.id }, data: { status: 'REFUNDED', refundedKobo: refundOrder.amountKobo } });
    await prisma.consumerSubscription.update({ where: { id: refundOrder.subscriptionId! }, data: { status: 'CANCELLED', autoRenew: false } });
    await prisma.studentEntitlement.updateMany({ where: { consumerSubscriptionId: refundOrder.subscriptionId! }, data: { status: 'REVOKED', note: 'Refunded: duplicate purchase' } });
    await prisma.refund.create({ data: { sourceType: 'CONSUMER_ORDER', sourceId: refundOrder.id, amountKobo: refundOrder.amountKobo, reason: 'Duplicate purchase', status: 'PROCESSED', createdById: ctx.financeUserId, processedAt: daysAgo(2), createdAt: daysAgo(3) } });
    const o = orders.find((x) => x.id === refundOrder.id);
    if (o) o.refund = refundOrder.amountKobo;
  }

  // ---------------------------------------------------------- the school sponsors WAEC Prep for SS 3
  const ss3 = await prisma.classArm.findMany({ where: { tenantId: g, classLevel: { code: 'SS3' } }, select: { id: true } });
  const ss3Students = await prisma.student.findMany({ where: { tenantId: g, classArmId: { in: ss3.map((a) => a.id) }, status: 'ACTIVE' }, select: { id: true } });
  const spStart = daysAgo(18);
  const spEnd = addMonths(spStart, 8);
  const sponsorInvoice = await prisma.platformInvoice.create({
    data: {
      number: `AIS-${new Date().getUTCFullYear()}-${String(100 + (await prisma.platformInvoice.count())).padStart(5, '0')}`,
      tenantId: g,
      description: `WAEC Prep sponsorship: SS 3 2026/2027 (${ss3Students.length} students × ₦${(waec.schoolPriceKobo! / 100).toLocaleString('en-NG')})`,
      seats: ss3Students.length,
      unitKobo: waec.schoolPriceKobo!,
      amountKobo: waec.schoolPriceKobo! * ss3Students.length,
      paidKobo: waec.schoolPriceKobo! * ss3Students.length,
      domain: 'EXAM',
      status: 'PAID',
      issuedAt: spStart,
      dueDate: new Date(spStart.getTime() + 14 * DAY),
      paidAt: daysAgo(9),
      createdAt: spStart,
    },
  });
  const sponsorPayment = await prisma.platformPayment.create({ data: { tenantId: g, invoiceId: sponsorInvoice.id, amountKobo: sponsorInvoice.amountKobo, method: 'BANK_TRANSFER', status: 'SUCCESS', reference: `TRF/${sponsorInvoice.number}`, paidAt: daysAgo(9), recordedById: ctx.financeUserId, createdAt: daysAgo(9) } });
  const sp = await prisma.sponsorship.create({
    data: { tenantId: g, productId: waec.id, title: 'SS 3 WAEC preparation 2026/2027', classArmIds: ss3.map((a) => a.id), seats: ss3Students.length, unitKobo: waec.schoolPriceKobo!, totalKobo: sponsorInvoice.amountKobo, startsAt: spStart, endsAt: spEnd, platformInvoiceId: sponsorInvoice.id, createdAt: spStart },
  });
  await prisma.studentEntitlement.createMany({ data: ss3Students.map((s) => ({ tenantId: g, studentId: s.id, key: 'EXAM_WAEC', source: 'SCHOOL', sponsorshipId: sp.id, productId: waec.id, startsAt: spStart, endsAt: spEnd, note: sp.title })) });

  // ---------------------------------------------------------- the demo child's learning history
  const topics = await prisma.syllabusTopic.findMany();
  const level = child.classArm?.classLevel.stage?.toLowerCase().includes('senior') ? 'SENIOR' : child.classArm?.classLevel.stage?.toLowerCase().includes('junior') ? 'JUNIOR' : 'JUNIOR';
  const mine = topics.filter((t) => t.level === level && ['Mathematics', 'English Language', 'Basic Science', 'Physics', 'Biology'].includes(t.subject));
  for (const t of mine.slice(0, 14)) {
    const attempts = between(3, 14);
    const correct = Math.round(attempts * (0.35 + rand() * 0.6));
    await prisma.masteryRecord.create({
      data: { tenantId: g, studentId: child.id, topicId: t.id, score: Math.round((100 * (correct + 0.5)) / (attempts + 1)), confidence: Math.min(0.95, Math.round((1 - 1 / Math.sqrt(attempts + 1)) * 100) / 100), attempts, correct, lastEvidenceAt: daysAgo(between(0, 20)) },
    });
  }
  const MEMORIES: [string, string][] = [
    ['PREFERENCE', 'Understands best with a worked example before the rule'],
    ['STRUGGLE', 'Mixes up the signs when expanding brackets with negative numbers'],
    ['STRENGTH', 'Quick with mental arithmetic and times tables'],
    ['GOAL', 'Wants an A in mathematics this term'],
  ];
  for (const [kind, content] of MEMORIES) await prisma.studentMemory.create({ data: { tenantId: g, studentId: child.id, kind, content, confidence: 0.8, source: 'AI', createdAt: daysAgo(between(1, 20)) } });
  await prisma.studentMemory.create({ data: { tenantId: g, studentId: child.id, kind: 'NOTE', content: 'Learns best with diagrams; gets anxious before tests', confidence: 0.9, source: 'PARENT', createdAt: daysAgo(15) } });

  const today = new Date().toISOString().slice(0, 10);
  const planItems = Array.from({ length: 14 }, (_, i) => {
    const date = new Date(Date.parse(`${today}T00:00:00Z`) + (i - 4) * DAY).toISOString().slice(0, 10);
    const [subject, topic, activity] = pick([
      ['Mathematics', 'Algebraic expressions', 'Expand and simplify 10 bracket questions, then check with the tutor'],
      ['Mathematics', 'Linear equations', 'Solve 8 equations; explain one aloud step by step'],
      ['English Language', 'Comprehension', 'Read one passage and answer the questions in full sentences'],
      ['Basic Science', 'Energy', 'Make flashcards for the forms of energy and review them'],
      ['Mathematics', 'Fractions and decimals', 'Quiz: 5 questions on adding fractions'],
    ] as const);
    return { date, subject, topic, activity, minutes: pick([30, 40, 45]), done: i < 4 };
  });
  await prisma.studyPlan.create({ data: { tenantId: g, studentId: child.id, title: 'Two weeks to stronger algebra', goal: 'Get an A in mathematics this term', startsOn: new Date(`${planItems[0]!.date}T00:00:00Z`), endsOn: new Date(`${planItems.at(-1)!.date}T00:00:00Z`), items: planItems, source: 'AI', createdAt: daysAgo(4) } });
  await prisma.flashcardDeck.create({
    data: {
      tenantId: g,
      studentId: child.id,
      title: 'Forms of energy',
      subject: 'Basic Science',
      topic: 'Energy',
      cards: [
        ['What is energy?', 'The ability to do work'],
        ['Energy stored in food and fuels', 'Chemical energy'],
        ['Energy of a moving object', 'Kinetic energy'],
        ['Energy from the sun', 'Solar energy'],
        ['Energy stored because of height', 'Gravitational potential energy'],
        ['Can energy be created or destroyed?', 'No: it only changes from one form to another'],
      ].map(([front, back], i) => ({ id: `c${i + 1}`, front, back, box: i < 3 ? 2 : 1, dueAt: today })),
      createdAt: daysAgo(6),
    },
  });
  const conv = await prisma.aiConversation.create({ data: { tenantId: g, userId: studentUser.id, studentId: child.id, agent: 'tutor', title: 'Help with expanding brackets', createdAt: daysAgo(2), updatedAt: daysAgo(2) } });
  await prisma.aiMessage.createMany({
    data: [
      { tenantId: g, conversationId: conv.id, role: 'user', content: 'How do I expand -3(x - 4)?', createdAt: daysAgo(2) },
      { tenantId: g, conversationId: conv.id, role: 'assistant', content: "Good question! Multiply **each** term inside the bracket by −3:\n\n1. −3 × x = −3x\n2. −3 × (−4) = **+12** (a negative times a negative is positive)\n\nSo −3(x − 4) = **−3x + 12**.\n\nYour turn: what is −2(y − 5)?", provider: 'anthropic', model: 'claude-haiku-4-5', createdAt: daysAgo(2) },
      { tenantId: g, conversationId: conv.id, role: 'user', content: '-2y + 10', createdAt: daysAgo(2) },
      { tenantId: g, conversationId: conv.id, role: 'assistant', content: 'Exactly right! You remembered that −2 × −5 = +10. 🎉 Want to try a slightly harder one with two brackets?', provider: 'anthropic', model: 'claude-haiku-4-5', createdAt: daysAgo(2) },
    ],
  });
  // Usage this window and the AI cost behind it.
  const ent = await prisma.studentEntitlement.findFirst({ where: { studentId: child.id, key: 'STUDENT_AI_PLUS', status: 'ACTIVE' }, orderBy: { endsAt: 'desc' } });
  if (ent) await prisma.studentAiUsage.create({ data: { tenantId: g, studentId: child.id, periodKey: `ent:${ent.id}`, units: 37, deepUnits: 6, lastAt: daysAgo(1) } });

  // AI cost per student for unit economics: paying students use more, Basic students a little.
  const paid = await prisma.studentEntitlement.findMany({ where: { key: { in: ['STUDENT_AI_PLUS', 'STUDENT_AI_PRO'] }, status: 'ACTIVE' }, select: { studentId: true, tenantId: true, startsAt: true, key: true } });
  const usage: { tenantId: string; studentId: string; aiTier: string; agent: string; provider: string; model: string; inputTokens: number; outputTokens: number; costUsd: number; latencyMs: number; createdAt: Date }[] = [];
  for (const p of paid) {
    const days = Math.max(1, Math.round((Date.now() - p.startsAt.getTime()) / DAY));
    const calls = Math.round(days * (0.6 + rand() * 1.4));
    for (let i = 0; i < calls; i++) {
      const deep = rand() < 0.1;
      const input = between(2500, 9000);
      const output = between(250, 900);
      usage.push({ tenantId: p.tenantId, studentId: p.studentId, aiTier: 'PLUS', agent: 'tutor', provider: 'anthropic', model: deep ? 'claude-opus-5-5' : 'claude-haiku-4-5', inputTokens: input, outputTokens: output, costUsd: (deep ? input * 4 + output * 20 : input + output * 5) / 1e6, latencyMs: between(1500, deep ? 12000 : 5000), createdAt: new Date(p.startsAt.getTime() + rand() * (Date.now() - p.startsAt.getTime())) });
    }
  }
  const basicStudents = await prisma.student.findMany({ where: { tenantId: g, status: 'ACTIVE', id: { notIn: paid.map((p) => p.studentId) } }, select: { id: true }, take: 120 });
  for (const s of basicStudents) {
    for (let i = 0; i < between(1, 9); i++) {
      const input = between(2000, 6000);
      const output = between(200, 700);
      usage.push({ tenantId: g, studentId: s.id, aiTier: 'BASIC', agent: 'tutor', provider: 'anthropic', model: 'claude-haiku-4-5', inputTokens: input, outputTokens: output, costUsd: (input + output * 5) / 1e6, latencyMs: between(1500, 5000), createdAt: daysAgo(between(0, 25)) });
    }
  }
  await prisma.aiUsage.createMany({ data: usage });

  // Practice history.
  const bank = await prisma.examQuestion.findMany({ where: { exam: 'BECE', status: 'PUBLISHED' }, include: { topic: true } });
  for (const [i, subject] of ['Mathematics', 'Basic Science', 'Mathematics'].entries()) {
    const qs = bank.filter((q) => q.subject === subject).slice(0, 5);
    if (!qs.length) continue;
    const answers = qs.map((q) => (rand() < 0.7 ? q.answer : (q.answer + 1) % (q.options as string[]).length));
    const score = answers.filter((a, k) => a === qs[k]!.answer).length;
    const per = new Map<string, { topic: string; correct: number; total: number }>();
    qs.forEach((q, k) => {
      const t = per.get(q.topic?.name ?? 'General') ?? { topic: q.topic?.name ?? 'General', correct: 0, total: 0 };
      t.total++;
      if (answers[k] === q.answer) t.correct++;
      per.set(t.topic, t);
    });
    await prisma.practiceAttempt.create({
      data: {
        tenantId: g,
        studentId: child.id,
        mode: 'PRACTICE',
        exam: 'BECE',
        subject,
        title: `BECE practice: ${subject}`,
        questions: qs.map((q) => ({ questionId: q.id, stem: q.stem, options: q.options, answer: q.answer, explanation: q.explanation, topicId: q.topicId, topic: q.topic?.name ?? null })),
        answers,
        score,
        total: qs.length,
        perTopic: [...per.values()],
        startedAt: daysAgo(12 - i * 4),
        submittedAt: new Date(daysAgo(12 - i * 4).getTime() + 9 * 60_000),
        review: i === 2 ? 'Good progress: 4 out of 5. Fractions are now secure. Next, practise reading word problems slowly and writing the equation before solving.' : null,
      },
    });
  }

  // ---------------------------------------------------------- the knowledge base
  for (const [title, audience, text] of [
    ['Parent Handbook 2026/2027', 'PARENTS', HANDBOOK],
    ['Admissions prospectus', 'PUBLIC', PROSPECTUS],
  ] as const) {
    const doc = await prisma.kbDocument.create({ data: { tenantId: g, title, audience, status: 'READY', chars: text.length, filename: null, createdAt: daysAgo(30) } });
    await prisma.kbChunk.createMany({ data: chunk(text).map((c, i) => ({ tenantId: g, documentId: doc.id, idx: i, heading: c.heading, text: c.text })) });
  }

  // ---------------------------------------------------------- ledger for every seeded money event
  for (const inv of await prisma.platformInvoice.findMany()) {
    await post(prisma, { event: 'invoice', domain: inv.domain, sourceType: 'PLATFORM_INVOICE', sourceId: inv.id, tenantId: inv.tenantId, memo: `Invoice ${inv.number}`, at: inv.issuedAt }, [
      { account: 'RECEIVABLE_SCHOOLS', debitKobo: inv.amountKobo },
      { account: REVENUE[inv.domain]!, creditKobo: inv.amountKobo },
    ]);
  }
  for (const p of await prisma.platformPayment.findMany({ where: { status: 'SUCCESS' }, include: { invoice: true } })) {
    await post(prisma, { event: 'payment', domain: p.invoice.domain, sourceType: 'PLATFORM_PAYMENT', sourceId: p.id, tenantId: p.tenantId, memo: `Payment for ${p.invoice.number} (${p.reference})`, at: p.paidAt ?? p.createdAt }, [
      { account: p.method === 'PAYSTACK' ? 'CASH_PAYSTACK' : 'CASH_BANK', debitKobo: p.amountKobo },
      { account: 'RECEIVABLE_SCHOOLS', creditKobo: p.amountKobo },
    ]);
    if (p.method === 'PAYSTACK') {
      const fee = paystackFee(p.amountKobo);
      await post(prisma, { event: 'fee', domain: p.invoice.domain, sourceType: 'PLATFORM_PAYMENT', sourceId: p.id, tenantId: p.tenantId, memo: `Paystack fee on ${p.reference}`, at: p.paidAt ?? p.createdAt }, [
        { account: 'PAYMENT_FEES', debitKobo: fee },
        { account: 'CASH_PAYSTACK', creditKobo: fee },
      ]);
    }
  }
  void sponsorPayment;
  for (const o of orders) {
    if (o.amountKobo > 0) {
      await post(prisma, { event: 'order', domain: o.domain, sourceType: 'CONSUMER_ORDER', sourceId: o.id, userId: o.userId, memo: o.memo, at: o.at }, [
        { account: 'CASH_PAYSTACK', debitKobo: o.amountKobo },
        { account: REVENUE[o.domain]!, creditKobo: o.amountKobo },
      ]);
      await post(prisma, { event: 'fee', domain: o.domain, sourceType: 'CONSUMER_ORDER', sourceId: o.id, userId: o.userId, memo: `Paystack fee`, at: o.at }, [
        { account: 'PAYMENT_FEES', debitKobo: o.feeKobo },
        { account: 'CASH_PAYSTACK', creditKobo: o.feeKobo },
      ]);
    }
    if (o.refund) {
      await post(prisma, { event: 'refund:seed', domain: o.domain, sourceType: 'CONSUMER_ORDER', sourceId: o.id, userId: o.userId, memo: 'Refund: duplicate purchase', at: daysAgo(3) }, [
        { account: 'REFUNDS', debitKobo: o.refund },
        { account: 'CASH_PAYSTACK', creditKobo: o.refund },
      ]);
    }
  }

  return `student login for ${child.firstName}; ${orders.length} family orders (${plusCount + 1} AI Plus, ${familyCount} AI Family, ${examCount} WAEC Prep); WAEC sponsorship for ${ss3Students.length} SS 3 students; 2 knowledge-base documents`;
}
