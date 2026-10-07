import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import {
  asLanguage,
  DEFAULT_LEARNING_UPDATE_SETTINGS,
  languageInfo,
  learningUpdateSettingsSchema,
  type LanguageCode,
  normalisePhone,
  smsInfo,
  smsSafe,
  type Audience,
  type LearningUpdateContent,
  type LearningUpdatePreview,
  type LearningUpdateSendResult,
  type LearningUpdateSettings,
  type LearningUpdateStatus,
  type LearningUpdateView,
} from '@aischool/shared';
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { schoolParentLanguage } from '../common/language';
import { RequestContextStore } from '../common/request-context';
import { schoolNow } from '../common/school-time';
import { registerTickTask } from '../common/tick-tasks';
import { ChannelsService, SendError, type SchoolChannels } from '../comms/channels.service';
import { SenderService } from '../comms/sender.service';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import {
  acceptableAiText,
  addDays,
  buildContent,
  classify,
  focusTopic,
  localMidnight,
  longDate,
  mondayOf,
  nothingToSay,
  parentText,
  parentTextIn,
  rulesRecommendation,
  shortSubject,
  WEEKDAY_NAMES,
  type TopicFacts,
  type WeekFacts,
} from './generator';
import { stopToken } from './unsubscribe-token';

/** Students handled per step of the weekly run, and how long one tick may spend on it. */
const BATCH = 8;
const CONCURRENCY = 4;
const TICK_BUDGET_MS = 20_000;

type Row = Prisma.LearningUpdateGetPayload<object>;

/** Per-run state: AI stops being tried for the rest of a run once it fails (budget used, not in plan…). */
interface RunState {
  aiOff: boolean;
  broadcastId: string | null;
  channels: SchoolChannels | null;
  queued: boolean;
}

const aiSchema = z.object({ recommendation: z.string().min(10).max(400), translations: z.record(z.string(), z.string().max(600)).optional() });

/**
 * The weekly "How <child> is learning" update: built from topic mastery
 * evidence, homework, registers and report cards; sent to every guardian who
 * hasn't opted out (in-app and push always, email, SMS and WhatsApp as the
 * school chooses); students see their own in the app.
 *
 * The weekly run is a scheduler tick task: from the school's chosen day and
 * time until the end of that week it works through students in small batches
 * (one LearningUpdate per student per week, unique, so it is idempotent and
 * resumes wherever it stopped).
 */
@Injectable()
export class LearningUpdatesService implements OnModuleInit {
  private readonly logger = new Logger(LearningUpdatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiGatewayService,
    private readonly channels: ChannelsService,
    private readonly sender: SenderService,
  ) {}

  onModuleInit() {
    registerTickTask('learningUpdates', () => this.sweep());
  }

  // ---------------------------------------------------------------- settings

  async settings(tenantId: string): Promise<LearningUpdateSettings> {
    const t = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { portalSettings: true } });
    return readSettings(t.portalSettings);
  }

  async saveSettings(tenantId: string, s: LearningUpdateSettings): Promise<LearningUpdateSettings> {
    const t = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { portalSettings: true } });
    const portal = (t.portalSettings as Record<string, unknown> | null) ?? {};
    await this.prisma.root.tenant.update({ where: { id: tenantId }, data: { portalSettings: { ...portal, learningUpdates: s } as Prisma.InputJsonValue } });
    return s;
  }

  async status(tenantId: string): Promise<LearningUpdateStatus> {
    const db = this.prisma.root;
    const [s, tenant, ch] = await Promise.all([this.settings(tenantId), db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { timezone: true } }), this.channels.status(tenantId)]);
    const weekStart = mondayOf(schoolNow(tenant.timezone).date);
    const week = new Date(`${weekStart}T00:00:00Z`);
    const [generated, sent, skipped, activeStudents] = await Promise.all([
      db.learningUpdate.count({ where: { tenantId, weekStart: week } }),
      db.learningUpdate.count({ where: { tenantId, weekStart: week, sentAt: { not: null }, text: { not: '' } } }),
      db.learningUpdate.count({ where: { tenantId, weekStart: week, text: '' } }),
      db.student.count({ where: { tenantId, status: 'ACTIVE' } }),
    ]);
    const on = (c: string) => ch.find((x) => x.channel === c)?.configured ?? false;
    return {
      settings: s,
      weekStart,
      due: `${WEEKDAY_NAMES[s.day - 1]} ${s.time}`,
      generated,
      sent,
      skipped,
      activeStudents,
      channels: { email: on('EMAIL'), sms: on('SMS'), whatsapp: on('WHATSAPP'), push: on('PUSH') },
    };
  }

  // ---------------------------------------------------------------- facts

  private async facts(tenantId: string, studentId: string, weekStart: string, timezone: string): Promise<WeekFacts & { userId: string | null }> {
    const db = this.prisma.root;
    const student = await db.student.findFirst({ where: { id: studentId, tenantId }, select: { firstName: true, classArmId: true, userId: true } });
    if (!student) throw new NotFoundException('Student not found');
    const from = localMidnight(weekStart, timezone);
    const to = localMidnight(addDays(weekStart, 7), timezone);
    const weekEnd = addDays(weekStart, 6);

    const evidence = await db.masteryEvidence.findMany({
      where: { tenantId, studentId, createdAt: { gte: from, lt: to } },
      orderBy: { createdAt: 'asc' },
      select: { topicId: true, source: true, total: true, scoreAfter: true, topic: { select: { name: true, subject: true } } },
    });
    const latest = new Map<string, (typeof evidence)[number]>();
    for (const e of evidence) latest.set(e.topicId, e);
    const topicIds = [...latest.keys()];
    const [before, records] = topicIds.length
      ? await Promise.all([
          db.masteryEvidence.findMany({
            where: { tenantId, studentId, topicId: { in: topicIds }, createdAt: { lt: from } },
            orderBy: { createdAt: 'desc' },
            distinct: ['topicId'],
            select: { topicId: true, scoreAfter: true },
          }),
          db.masteryRecord.findMany({ where: { studentId, topicId: { in: topicIds } }, select: { topicId: true, confidence: true } }),
        ])
      : [[], []];
    const beforeBy = new Map(before.map((b) => [b.topicId, b.scoreAfter]));
    const confBy = new Map(records.map((r) => [r.topicId, r.confidence]));
    const topics: TopicFacts[] = [...latest.values()].map((e) => ({
      topicId: e.topicId,
      topic: e.topic.name,
      subject: e.topic.subject,
      score: e.scoreAfter,
      before: beforeBy.get(e.topicId) ?? null,
      confidence: confBy.get(e.topicId) ?? 0,
    }));

    const day = (d: string) => new Date(`${d}T00:00:00Z`);
    const [homework, attendance, card, modulesCompleted] = await Promise.all([
      student.classArmId
        ? db.homework.findMany({
            where: { tenantId, classArmId: student.classArmId, status: 'PUBLISHED', dueDate: { gte: day(weekStart), lte: day(weekEnd) } },
            select: { id: true, submissions: { where: { studentId }, select: { id: true } } },
          })
        : [],
      db.studentAttendance.groupBy({ by: ['status'], where: { tenantId, studentId, date: { gte: day(weekStart), lte: day(weekEnd) } }, _count: { _all: true } }),
      db.reportCard.findFirst({ where: { tenantId, studentId, status: 'PUBLISHED', publishedAt: { gte: from, lt: to } }, select: { term: { select: { name: true } } } }),
      db.moduleProgress.count({ where: { tenantId, studentId, completedAt: { gte: from, lt: to } } }),
    ]);
    const count = (s: string) => attendance.find((a) => a.status === s)?._count._all ?? 0;
    const att = { present: count('PRESENT'), absent: count('ABSENT'), late: count('LATE'), excused: count('EXCUSED'), daysMarked: attendance.reduce((n, a) => n + a._count._all, 0) };
    return {
      firstName: student.firstName,
      userId: student.userId,
      weekStart,
      topics,
      pieces: evidence.length,
      questions: Math.round(evidence.filter((e) => e.source !== 'TUTOR').reduce((n, e) => n + e.total, 0)),
      homework: homework.length ? { set: homework.length, handedIn: homework.filter((h) => h.submissions.length > 0).length } : null,
      attendance: att.daysMarked ? att : null,
      reportCard: card?.term.name ?? null,
      modulesCompleted,
    };
  }

  /** Words the recommendation with AI (standard tier, the school's budget); null to use the rules. */
  private async aiRecommendation(tenantId: string, f: WeekFacts, state: RunState, languages: LanguageCode[] = []): Promise<{ text: string; localized: Partial<Record<LanguageCode, string>> } | null> {
    const others = languages.filter((l) => l !== 'EN');
    if (state.aiOff) return null;
    const g = classify(f.topics);
    const focus = focusTopic(g) ?? g.strong[0] ?? null;
    const facts = {
      child: f.firstName,
      doingWell: g.strong.map((t) => `${t.topic} (${shortSubject(t.subject)})`),
      gettingBetter: g.improving.map((t) => `${t.topic} (${shortSubject(t.subject)})`),
      needsAttention: g.attention.map((t) => `${t.topic} (${shortSubject(t.subject)})`),
      focusTopic: focus ? `${focus.topic} (${shortSubject(focus.subject)})` : null,
      homework: f.homework ? `${f.homework.handedIn} of ${f.homework.set} handed in` : 'none set',
      attendance: f.attendance ? `${f.attendance.present + f.attendance.late} of ${f.attendance.daysMarked} days in school` : 'not marked',
      practisedOnTheApp: f.pieces > 0,
    };
    try {
      const r = await RequestContextStore.run({ tenantId, permissions: new Set(), userAgent: 'learning-updates' }, () =>
        this.ai.generateJson(
          {
            tier: 'standard',
            maxOutputTokens: 200 + others.length * 200,
            system:
              'You write ONE practical recommendation for a Nigerian parent about their child this week. ' +
              'Plain, warm British English that a busy parent reading on a basic phone understands. No jargon, no scores, no percentages, no numbers except minutes of practice, no lists, no greetings. ' +
              'One or two short sentences, at most 30 words. Something the parent can do at home this week; if there is a focus topic, name it and suggest short practice in Exam Academy on the school app. ' +
              'Use only the facts given; never invent anything. ' +
              (others.length
                ? `LANGUAGES: some parents read in other languages. Also write the same recommendation, with the same meaning, in each of: ${others.map((l) => `${l} = ${languageInfo(l).english}`).join(', ')}. ` +
                  others.map((l) => `${l}: ${languageInfo(l).instruction}`).join(' ') +
                  ' In every language keep the child’s name, subject names, topic names and "Exam Academy" in English exactly as given; write minutes as digits; respectful and natural for a Nigerian parent; no greetings. If you are not confident in a language, leave it out. ' +
                  `Reply as JSON: {"recommendation": "...", "translations": {${others.map((l) => `"${l}": "..."`).join(', ')}}}`
                : 'Reply as JSON: {"recommendation": "..."}'),
            messages: [{ role: 'user', content: JSON.stringify(facts) }],
          },
          aiSchema,
          'learning_update',
        ),
      );
      const text = acceptableAiText(r.data.recommendation);
      if (!text) return null;
      const localized: Partial<Record<LanguageCode, string>> = {};
      for (const l of others) {
        // Same checks as English (no invented numbers), a little longer allowed for the language.
        const t = acceptableAiText(r.data.translations?.[l] ?? '', 400);
        if (t) localized[l] = t;
      }
      return { text, localized };
    } catch (err) {
      state.aiOff = true;
      this.logger.debug(`AI recommendation off for this run (${tenantId}): ${(err as Error).message}`);
      return null;
    }
  }

  /** The update for one student and week, not saved. Null when the school skips quiet weeks (or there's nothing at all to say). */
  async compose(
    tenantId: string,
    studentId: string,
    weekStart: string,
    s: LearningUpdateSettings,
    state: RunState,
  ): Promise<{ content: LearningUpdateContent; text: string; source: 'AI' | 'RULES'; userId: string | null } | null> {
    const tenant = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { timezone: true } });
    const f = await this.facts(tenantId, studentId, weekStart, tenant.timezone);
    if (nothingToSay(f) || (f.pieces === 0 && s.quietWeeks === 'SKIP')) return null;
    const rules = rulesRecommendation(f, classify(f.topics));
    const ai = s.useAi ? await this.aiRecommendation(tenantId, f, state, await this.guardianLanguages(tenantId, studentId)) : null;
    const content = buildContent(f, ai ? { ...rules, text: ai.text } : rules);
    if (ai && Object.keys(ai.localized).length) content.localized = ai.localized;
    return { content, text: parentText(content), source: ai ? 'AI' : 'RULES', userId: f.userId };
  }

  /** The languages this student's guardians read their updates in (their choice, else the school's default). */
  private async guardianLanguages(tenantId: string, studentId: string): Promise<LanguageCode[]> {
    const [links, fallback] = await Promise.all([
      this.prisma.root.studentGuardian.findMany({ where: { tenantId, studentId, guardian: { learningUpdatesOff: false } }, select: { guardian: { select: { preferredLanguage: true } } } }),
      schoolParentLanguage(this.prisma, tenantId),
    ]);
    return [...new Set(links.map((l) => asLanguage(l.guardian.preferredLanguage) ?? fallback))];
  }

  // ---------------------------------------------------------------- weekly run

  /** The tick task: each school whose weekly time has come gets its updates, a batch at a time. */
  async sweep(): Promise<number> {
    const deadline = Date.now() + TICK_BUDGET_MS;
    const tenants = await this.prisma.root.tenant.findMany({
      where: { status: { in: ['TRIAL', 'ACTIVE'] }, portalSettings: { path: ['learningUpdates', 'enabled'], equals: true } },
      select: { id: true, timezone: true, portalSettings: true },
    });
    let done = 0;
    for (const t of tenants) {
      if (Date.now() > deadline) break;
      const s = readSettings(t.portalSettings);
      if (!s.enabled) continue;
      const now = schoolNow(t.timezone);
      // Due from the chosen day and time until the week ends (so a sleeping server catches up).
      if (now.weekday < s.day || (now.weekday === s.day && now.time < s.time)) continue;
      try {
        done += await this.runWeek(t.id, mondayOf(now.date), s, deadline);
      } catch (err) {
        this.logger.error(`Learning updates for ${t.id} failed: ${(err as Error).message}`);
      }
    }
    return done;
  }

  private async runWeek(tenantId: string, weekStart: string, s: LearningUpdateSettings, deadline: number): Promise<number> {
    const db = this.prisma.root;
    const week = new Date(`${weekStart}T00:00:00Z`);
    const state: RunState = { aiOff: false, broadcastId: null, channels: null, queued: false };
    let done = 0;
    try {
      while (Date.now() < deadline) {
        // Generated earlier but not sent (e.g. a restart in between), then students with nothing yet this week.
        const unsent = await db.learningUpdate.findMany({ where: { tenantId, weekStart: week, sentAt: null }, take: BATCH });
        const fresh = unsent.length ? [] : await db.student.findMany({ where: { tenantId, status: 'ACTIVE', learningUpdates: { none: { weekStart: week } } }, select: { id: true }, take: BATCH, orderBy: { id: 'asc' } });
        if (!unsent.length && !fresh.length) break;
        for (let i = 0; i < unsent.length; i += CONCURRENCY) {
          await Promise.all(unsent.slice(i, i + CONCURRENCY).map((u) => this.deliver(u, s, state).catch((e: Error) => this.logger.warn(`Update ${u.id} not sent: ${e.message}`))));
        }
        for (let i = 0; i < fresh.length; i += CONCURRENCY) {
          await Promise.all(
            fresh.slice(i, i + CONCURRENCY).map(async (st) => {
              try {
                const u = await this.generate(tenantId, st.id, weekStart, s, state);
                if (u && !u.sentAt) await this.deliver(u, s, state);
              } catch (e) {
                // Mark it so one bad record can't stall the school's run; it shows as skipped.
                this.logger.warn(`Update for student ${st.id} failed: ${(e as Error).message}`);
                await this.saveSkipped(tenantId, st.id, week).catch(() => undefined);
              }
            }),
          );
        }
        done += unsent.length + fresh.length;
      }
    } finally {
      await this.finishRun(tenantId, state);
    }
    return done;
  }

  private async saveSkipped(tenantId: string, studentId: string, week: Date) {
    await this.prisma.root.learningUpdate.create({ data: { tenantId, studentId, weekStart: week, content: {}, text: '', sentAt: new Date() } });
  }

  /** Saves this week's update for a student (or a "skipped" marker); returns the existing one if another process got there first. */
  private async generate(tenantId: string, studentId: string, weekStart: string, s: LearningUpdateSettings, state: RunState): Promise<Row | null> {
    const db = this.prisma.root;
    const week = new Date(`${weekStart}T00:00:00Z`);
    const existing = await db.learningUpdate.findUnique({ where: { studentId_weekStart: { studentId, weekStart: week } } });
    if (existing) return existing;
    const built = await this.compose(tenantId, studentId, weekStart, s, state);
    try {
      if (!built) {
        await this.saveSkipped(tenantId, studentId, week);
        return null;
      }
      return await db.learningUpdate.create({
        data: { tenantId, studentId, weekStart: week, content: built.content as unknown as Prisma.InputJsonValue, text: built.text, source: built.source },
      });
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002') throw err;
      return db.learningUpdate.findUnique({ where: { studentId_weekStart: { studentId, weekStart: week } } });
    }
  }

  /** One "Weekly learning updates" message per school per week holds the email/SMS/push deliveries, so they show in Messages with costs and retries. */
  private async weekBroadcast(tenantId: string, weekStart: string, link: string | null): Promise<string> {
    const db = this.prisma.root;
    const title = `Weekly learning updates — week of ${longDate(weekStart)}`;
    const found = await db.broadcast.findFirst({ where: { tenantId, source: 'LEARNING_UPDATE', title }, select: { id: true } });
    if (found) return found.id;
    const audience: Audience = { type: 'PEOPLE', guardianIds: [], staffIds: [] };
    const b = await db.broadcast.create({
      data: {
        tenantId,
        title,
        channels: [],
        audience: audience as unknown as Prisma.InputJsonValue,
        audienceSummary: 'Parents (each gets their own child’s update)',
        subject: title,
        body: 'Each parent receives their own child’s weekly learning update. See the deliveries for what was sent.',
        status: 'SENDING',
        source: 'LEARNING_UPDATE',
        link,
        sentAt: new Date(),
      },
    });
    return b.id;
  }

  /** Where links in messages point: the school's verified portal domain, else the app's own address. */
  private async baseUrl(tenantId: string): Promise<string> {
    const domain = await this.prisma.root.tenantDomain.findFirst({ where: { tenantId, kind: 'PORTAL', verifiedAt: { not: null } }, orderBy: { isPrimary: 'desc' }, select: { hostname: true } });
    if (domain) return `https://${domain.hostname}`;
    const e = env();
    return e.CORS_ORIGINS[0] ?? (e.PLATFORM_DOMAIN_TARGET ? `https://${e.PLATFORM_DOMAIN_TARGET}` : '');
  }

  /**
   * Sends one saved update to the child's guardians (and the child, in the
   * app). Claimed by setting sentAt first, so it goes out once however many
   * processes try.
   */
  async deliver(u: Row, s: LearningUpdateSettings, state: RunState): Promise<{ recipients: number }> {
    const db = this.prisma.root;
    if (!u.text) return { recipients: 0 };
    const claim = await db.learningUpdate.updateMany({ where: { id: u.id, sentAt: null }, data: { sentAt: new Date() } });
    if (!claim.count) return { recipients: 0 };
    const tenantId = u.tenantId;
    const content = u.content as unknown as LearningUpdateContent;
    const weekStart = content.weekStart;
    const base = await this.baseUrl(tenantId);
    const school = await this.sender.school(tenantId);
    const schoolLanguage = asLanguage(school.settings.parentLanguage) ?? 'EN';
    if (!state.channels) state.channels = await this.channels.load(tenantId);
    const ch = state.channels;
    const listLink = `${base}/school/learning/${u.studentId}`;

    const [links, student] = await Promise.all([
      db.studentGuardian.findMany({
        where: { tenantId, studentId: u.studentId },
        select: { guardian: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, userId: true, learningUpdatesOff: true, preferredLanguage: true } } },
      }),
      db.student.findUniqueOrThrow({ where: { id: u.studentId }, select: { userId: true } }),
    ]);
    const subject = `How ${content.firstName} is learning — week of ${longDate(weekStart)}`;
    const deliveries: Omit<Prisma.DeliveryCreateManyInput, 'broadcastId'>[] = [];
    const notifications: Prisma.NotificationCreateManyInput[] = [];
    const used = new Set<string>();
    let recipients = 0;
    const pushUsers = new Set(
      this.channels.pushEnabled()
        ? (await db.pushSubscription.findMany({ where: { userId: { in: links.map((l) => l.guardian.userId).filter((x): x is string => !!x) } }, select: { userId: true } })).map((p) => p.userId)
        : [],
    );

    for (const { guardian: g } of links) {
      if (g.learningUpdatesOff) continue;
      // Each parent reads it in their language (subject and topic names stay in English).
      const language = asLanguage(g.preferredLanguage) ?? schoolLanguage;
      const text = language === 'EN' ? u.text : parentTextIn(content, language);
      const name = `${g.firstName} ${g.lastName}`.trim();
      const phone = normalisePhone(g.phone);
      const stop = base ? `${base}/api/learning-updates/stop/${stopToken(g.id)}` : null;
      const row = (channel: string, address: string | null, text: string, status: string, error: string | null = null): Omit<Prisma.DeliveryCreateManyInput, 'broadcastId'> => ({
        tenantId,
        channel,
        recipientName: name,
        address,
        guardianId: g.id,
        userId: g.userId,
        subject,
        text,
        status,
        error,
        units: channel === 'SMS' && status !== 'SKIPPED' ? smsInfo(text).segments : 0,
        sentAt: status === 'SENT' ? new Date() : null,
      });
      let reached = false;
      if (g.userId) {
        notifications.push({ tenantId, userId: g.userId, title: subject, body: text.slice(0, 500), link: `/school/learning/${u.studentId}/${u.id}` });
        deliveries.push(row('IN_APP', g.userId, text, 'SENT'));
        used.add('IN_APP');
        reached = true;
        if (pushUsers.has(g.userId)) {
          deliveries.push(row('PUSH', g.userId, `${content.localized?.[language] ?? content.recommendation.text}`.slice(0, 240), 'QUEUED'));
          used.add('PUSH');
        }
      }
      if (s.email) {
        const email = [`Dear ${g.firstName},`, text.replace(/\n/g, '\n\n'), base ? `See the full update in the school portal: ${base}/school/learning/${u.studentId}/${u.id}` : '', stop ? `To stop these weekly updates, open: ${stop}` : '']
          .filter(Boolean)
          .join('\n\n');
        const missing = !g.email ? 'No email address on record' : !ch.smtp ? 'Email is not set up' : null;
        deliveries.push(row('EMAIL', g.email, email, missing ? 'SKIPPED' : 'QUEUED', missing));
        if (!missing) {
          used.add('EMAIL');
          state.queued = true;
          reached = true;
        }
      }
      const short = smsSafe(`${text}${base ? `\nMore: ${listLink}` : ''}${stop ? `\nStop: ${stop}` : ''}`);
      if (s.sms) {
        const missing = !phone ? 'No valid phone number on record' : !ch.termii ? 'SMS is not set up' : null;
        deliveries.push(row('SMS', phone, short, missing ? 'SKIPPED' : 'QUEUED', missing));
        if (!missing) {
          used.add('SMS');
          state.queued = true;
          reached = true;
        }
      }
      // WhatsApp only through the approved template the school named; otherwise not at all.
      if (s.whatsappTemplate && ch.whatsapp && phone) {
        try {
          const r = await this.channels.sendWhatsapp({ ...ch, whatsapp: { ...ch.whatsapp, templateName: s.whatsappTemplate } }, phone, school.name, short);
          deliveries.push({ ...row('WHATSAPP', phone, short, 'SENT'), providerRef: r.ref, attempts: 1 });
          used.add('WHATSAPP');
          reached = true;
        } catch (err) {
          deliveries.push({ ...row('WHATSAPP', phone, short, 'FAILED', err instanceof SendError ? err.message : String((err as Error).message).slice(0, 300)), attempts: 1 });
        }
      }
      if (reached) recipients++;
    }

    if (s.students && student.userId) {
      notifications.push({ tenantId, userId: student.userId, title: 'Your week in learning', body: content.studentText.slice(0, 500), link: `/school/learning/${u.studentId}/${u.id}` });
      used.add('STUDENT_IN_APP');
    }
    // The week's "Weekly learning updates" message is only created once someone is actually contacted.
    if (deliveries.length && !state.broadcastId) state.broadcastId = await this.weekBroadcast(tenantId, weekStart, base ? `${base}/school/learning` : null);
    const broadcastId = state.broadcastId;
    await db.$transaction([
      db.delivery.createMany({ data: broadcastId ? deliveries.map((d) => ({ ...d, broadcastId })) : [] }),
      db.notification.createMany({ data: notifications }),
      db.learningUpdate.update({ where: { id: u.id }, data: { channels: [...used] } }),
    ]);
    if (deliveries.some((d) => d.status === 'QUEUED')) state.queued = true;
    return { recipients };
  }

  private async finishRun(tenantId: string, state: RunState) {
    if (state.channels) this.channels.close(state.channels);
    if (!state.broadcastId) return;
    const channels = await this.prisma.root.delivery.findMany({ where: { broadcastId: state.broadcastId }, distinct: ['channel'], select: { channel: true } });
    await this.prisma.root.broadcast.update({ where: { id: state.broadcastId }, data: { channels: channels.map((c) => c.channel), ...(state.queued ? { status: 'SENDING' } : {}) } });
    if (state.queued) void this.sender.dispatch(tenantId, state.broadcastId);
    else await this.sender.finishIfDone(state.broadcastId);
  }

  // ---------------------------------------------------------------- staff tools

  async preview(tenantId: string, studentId: string): Promise<LearningUpdatePreview> {
    const db = this.prisma.root;
    const [s, tenant] = await Promise.all([this.settings(tenantId), db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { timezone: true } })]);
    const weekStart = mondayOf(schoolNow(tenant.timezone).date);
    // Preview always shows a full update, even for a quiet week the school would skip.
    const built = await this.compose(tenantId, studentId, weekStart, { ...s, quietWeeks: 'SHORT' }, { aiOff: false, broadcastId: null, channels: null, queued: false });
    if (!built) throw new BadRequestException('Nothing to report for this student this week yet: no practice, homework or register marks.');
    const existing = await db.learningUpdate.findUnique({ where: { studentId_weekStart: { studentId, weekStart: new Date(`${weekStart}T00:00:00Z`) } }, select: { sentAt: true } });
    const ch = await this.channels.load(tenantId);
    this.channels.close(ch);
    const links = await db.studentGuardian.findMany({ where: { tenantId, studentId }, select: { guardian: true } });
    const recipients = links.map(({ guardian: g }) => {
      const phone = normalisePhone(g.phone);
      const list: string[] = [];
      if (g.userId) list.push('In-app', 'Push (if allowed on a device)');
      if (s.email && g.email && ch.smtp) list.push('Email');
      if (s.sms && phone && ch.termii) list.push('SMS');
      if (s.whatsappTemplate && phone && ch.whatsapp) list.push('WhatsApp');
      return {
        name: `${g.firstName} ${g.lastName}`,
        channels: list,
        optedOut: g.learningUpdatesOff,
        note: g.learningUpdatesOff ? 'Turned these updates off' : list.length ? null : 'No portal login or usable contact for the chosen channels',
      };
    });
    const base = await this.baseUrl(tenantId);
    return {
      content: built.content,
      text: built.text,
      smsText: smsSafe(`${built.text}${base ? `\nMore: ${base}/school/learning/${studentId}` : ''}\nStop: ${base}/api/learning-updates/stop/…`),
      source: built.source,
      alreadySent: !!existing?.sentAt,
      recipients,
    };
  }

  /** "Send now" for testing: this week's update for a class or one student, whatever the schedule says (opt-outs still apply). */
  async sendNow(tenantId: string, input: { classArmId?: string; studentId?: string }): Promise<LearningUpdateSendResult> {
    const db = this.prisma.root;
    const [s, tenant] = await Promise.all([this.settings(tenantId), db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { timezone: true } })]);
    const weekStart = mondayOf(schoolNow(tenant.timezone).date);
    const students = await db.student.findMany({
      where: { tenantId, status: 'ACTIVE', ...(input.studentId ? { id: input.studentId } : { classArmId: input.classArmId }) },
      select: { id: true },
      take: 200,
    });
    if (!students.length) throw new NotFoundException(input.studentId ? 'Student not found' : 'No active students in that class');
    const state: RunState = { aiOff: false, broadcastId: null, channels: null, queued: false };
    const out: LearningUpdateSendResult = { students: students.length, sent: 0, skipped: 0, alreadySent: 0, recipients: 0 };
    try {
      for (let i = 0; i < students.length; i += CONCURRENCY) {
        await Promise.all(
          students.slice(i, i + CONCURRENCY).map(async (st) => {
            const u = await this.generate(tenantId, st.id, weekStart, s, state);
            if (!u || !u.text) return void out.skipped++;
            if (u.sentAt) return void out.alreadySent++;
            const r = await this.deliver(u, s, state);
            out.sent++;
            out.recipients += r.recipients;
          }),
        );
      }
    } finally {
      await this.finishRun(tenantId, state);
    }
    return out;
  }

  // ---------------------------------------------------------------- families

  async list(tenantId: string, studentId: string, language: LanguageCode = 'EN'): Promise<LearningUpdateView[]> {
    const rows = await this.prisma.root.learningUpdate.findMany({
      where: { tenantId, studentId, sentAt: { not: null }, text: { not: '' } },
      orderBy: { weekStart: 'desc' },
      take: 52,
    });
    return rows.map((r) => view(r, language));
  }

  async one(tenantId: string, studentId: string, id: string, language: LanguageCode = 'EN'): Promise<LearningUpdateView> {
    const row = await this.prisma.root.learningUpdate.findFirst({ where: { id, tenantId, studentId, sentAt: { not: null }, text: { not: '' } } });
    if (!row) throw new NotFoundException('Update not found');
    return view(row, language);
  }

  /** Turns the updates on or off for every guardian record this user has in the school. */
  async setOptOut(tenantId: string, userId: string, off: boolean): Promise<number> {
    const r = await this.prisma.root.guardian.updateMany({ where: { tenantId, userId }, data: { learningUpdatesOff: off } });
    return r.count;
  }

  async optedOut(tenantId: string, userId: string): Promise<boolean> {
    const rows = await this.prisma.root.guardian.findMany({ where: { tenantId, userId }, select: { learningUpdatesOff: true } });
    return rows.length > 0 && rows.every((r) => r.learningUpdatesOff);
  }

  /** From a signed link: sets the guardian's choice; returns their first name and school name. */
  async setOptOutByGuardian(guardianId: string, off: boolean): Promise<{ firstName: string; school: string } | null> {
    const g = await this.prisma.root.guardian.findUnique({ where: { id: guardianId }, select: { firstName: true, tenant: { select: { name: true } } } });
    if (!g) return null;
    await this.prisma.root.guardian.update({ where: { id: guardianId }, data: { learningUpdatesOff: off } });
    return { firstName: g.firstName, school: g.tenant.name };
  }

  async guardianInfo(guardianId: string): Promise<{ firstName: string; school: string; off: boolean } | null> {
    const g = await this.prisma.root.guardian.findUnique({ where: { id: guardianId }, select: { firstName: true, learningUpdatesOff: true, tenant: { select: { name: true } } } });
    return g ? { firstName: g.firstName, school: g.tenant.name, off: g.learningUpdatesOff } : null;
  }
}

export function readSettings(portalSettings: unknown): LearningUpdateSettings {
  const saved = (portalSettings as { learningUpdates?: Partial<LearningUpdateSettings> } | null)?.learningUpdates ?? {};
  const merged = { ...DEFAULT_LEARNING_UPDATE_SETTINGS, ...saved };
  const parsed = learningUpdateSettingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_LEARNING_UPDATE_SETTINGS;
}

/** A parent sees the update in their language: the AI recommendation when there is one, and the text as it was sent to them. */
function view(r: Row, language: LanguageCode = 'EN'): LearningUpdateView {
  const content = r.content as unknown as LearningUpdateContent;
  const local = language !== 'EN' ? content.localized?.[language] : undefined;
  return {
    id: r.id,
    studentId: r.studentId,
    weekStart: r.weekStart.toISOString().slice(0, 10),
    content: local ? { ...content, recommendation: { ...content.recommendation, text: local } } : content,
    text: language !== 'EN' && content.weekStart ? parentTextIn(content, language) : r.text,
    source: r.source === 'AI' ? 'AI' : 'RULES',
    sentAt: r.sentAt?.toISOString() ?? null,
    channels: r.channels,
  };
}
