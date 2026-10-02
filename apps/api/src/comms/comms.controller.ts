import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  BROADCAST_SOURCES,
  BROADCAST_STATUSES,
  CHANNELS,
  TRANSLATE_LANGUAGE_LABELS,
  aiComposeSchema,
  audienceSchema,
  broadcastSchema,
  commsSettingsSchema,
  composeRequestSchema,
  normalisePhone,
  sendBroadcastSchema,
  smsInfo,
  smsSafe,
  smsSettingsSchema,
  smtpSettingsSchema,
  testChannelSchema,
  translateRequestSchema,
  whatsappSettingsSchema,
  type AiCompose,
  type AiText,
  type Audience,
  type AudiencePreview,
  type BroadcastDetail,
  type BroadcastInput,
  type BroadcastRow,
  type BroadcastSource,
  type BroadcastStatus,
  type Channel,
  type CommsOverview,
  type CommsSettings,
  type DeliveryRow,
  type DeliveryStatus,
} from '@aischool/shared';
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { AuditService } from '../audit/audit.service';
import { RequireFeature, RequirePermissions } from '../common/decorators';
import { dateOnly, fullName, parseDate } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { schoolNow } from '../common/school-time';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { personalise } from './audience.service';
import { ChannelsService, SendError } from './channels.service';
import { eventRow } from './community.controller';
import { composePrompt, translatePrompt } from './prompts';
import { SenderService, emailHtml } from './sender.service';

const previewSchema = z.object({
  audience: audienceSchema,
  channels: z.array(z.enum(CHANNELS)).min(1),
  body: z.string().max(5000).optional(),
  smsBody: z.string().max(918).nullish(),
});

const listQuery = z.object({ status: z.enum(BROADCAST_STATUSES).optional(), source: z.enum(BROADCAST_SOURCES).optional() });

type BroadcastWithCounts = Prisma.BroadcastGetPayload<object> & { counts: Map<string, number> };

@Controller('comms')
@RequireFeature('messaging')
export class CommsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly channels: ChannelsService,
    private readonly sender: SenderService,
    private readonly gateway: AiGatewayService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------- helpers

  private async withCounts(rows: Prisma.BroadcastGetPayload<object>[]): Promise<BroadcastWithCounts[]> {
    const counts = await this.prisma.db.delivery.groupBy({ by: ['broadcastId', 'status'], where: { broadcastId: { in: rows.map((r) => r.id) } }, _count: { _all: true } });
    return rows.map((r) => ({ ...r, counts: new Map(counts.filter((c) => c.broadcastId === r.id).map((c) => [c.status, c._count._all])) }));
  }

  private row(b: BroadcastWithCounts, names: Map<string, string>): BroadcastRow {
    const n = (s: string) => b.counts.get(s) ?? 0;
    return {
      id: b.id,
      title: b.title,
      channels: b.channels as Channel[],
      audienceSummary: b.audienceSummary,
      status: b.status as BroadcastStatus,
      source: b.source as BroadcastSource,
      scheduledAt: b.scheduledAt?.toISOString() ?? null,
      sentAt: b.sentAt?.toISOString() ?? null,
      createdAt: b.createdAt.toISOString(),
      createdBy: b.createdById ? (names.get(b.createdById) ?? null) : b.source === 'MANUAL' ? null : 'Automation',
      totals: { recipients: n('SENT') + n('FAILED') + n('SKIPPED') + n('QUEUED'), sent: n('SENT'), failed: n('FAILED'), skipped: n('SKIPPED'), queued: n('QUEUED') },
    };
  }

  private async names(ids: (string | null)[]) {
    const unique = [...new Set(ids.filter((i): i is string => !!i))];
    const users = unique.length ? await this.prisma.root.user.findMany({ where: { id: { in: unique } }, select: { id: true, firstName: true, lastName: true } }) : [];
    return new Map(users.map((u) => [u.id, fullName(u)]));
  }

  private async settingsOf(): Promise<CommsSettings> {
    return (await this.sender.school(currentTenantId())).settings;
  }

  // ---------------------------------------------------------- overview & settings

  @Get('overview')
  @RequirePermissions('comms.read')
  async overview(): Promise<CommsOverview> {
    const db = this.prisma.db;
    const tenantId = currentTenantId();
    const school = await this.sender.school(tenantId);
    const t = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { timezone: true } });
    const today = schoolNow(t.timezone).date;
    const monthStart = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    const in14 = new Date(Date.parse(`${today}T00:00:00Z`) + 14 * 86_400_000);
    const md = today.slice(5);
    const [channels, monthBroadcasts, deliveries, scheduled, recent, events, kids, staff] = await Promise.all([
      this.channels.status(tenantId),
      db.broadcast.count({ where: { createdAt: { gte: monthStart }, status: { in: ['SENDING', 'SENT'] } } }),
      db.delivery.groupBy({ by: ['status', 'channel'], where: { createdAt: { gte: monthStart } }, _count: { _all: true }, _sum: { units: true } }),
      db.broadcast.findMany({ where: { status: 'SCHEDULED' }, orderBy: { scheduledAt: 'asc' }, take: 10 }),
      db.broadcast.findMany({ where: { status: { in: ['SENDING', 'SENT'] } }, orderBy: { sentAt: 'desc' }, take: 8 }),
      db.schoolEvent.findMany({ where: { startDate: { gte: parseDate(today), lte: in14 } }, orderBy: [{ startDate: 'asc' }, { startTime: 'asc' }], take: 8 }),
      this.prisma.root.$queryRaw<{ firstName: string; lastName: string; arm: string | null; level: string | null }[]>`
        SELECT s."firstName", s."lastName", a.name AS arm, l.name AS level FROM students s
        LEFT JOIN class_arms a ON a.id = s."classArmId" LEFT JOIN class_levels l ON l.id = a."classLevelId"
        WHERE s."tenantId" = ${tenantId} AND s.status = 'ACTIVE' AND to_char(s."dateOfBirth", 'MM-DD') = ${md}`,
      this.prisma.root.$queryRaw<{ firstName: string; lastName: string; jobTitle: string }[]>`
        SELECT "firstName", "lastName", "jobTitle" FROM staff WHERE "tenantId" = ${tenantId} AND status <> 'EXITED' AND to_char("dateOfBirth", 'MM-DD') = ${md}`,
    ]);
    const sum = (status: string) => deliveries.filter((d) => d.status === status).reduce((n, d) => n + d._count._all, 0);
    const units = deliveries.filter((d) => d.channel === 'SMS' && d.status === 'SENT').reduce((n, d) => n + (d._sum.units ?? 0), 0);
    const names = await this.names([...scheduled, ...recent].map((b) => b.createdById));
    const arms = await this.armNames(events.flatMap((e) => e.classArmIds));
    return {
      currency: school.currency,
      channels,
      thisMonth: { broadcasts: monthBroadcasts, delivered: sum('SENT'), failed: sum('FAILED'), smsUnits: units, smsCostKobo: units * school.settings.smsPricePerUnitKobo },
      scheduled: (await this.withCounts(scheduled)).map((b) => this.row(b, names)),
      recent: (await this.withCounts(recent)).map((b) => this.row(b, names)),
      upcomingEvents: events.map((e) => eventRow(e, arms)),
      birthdaysToday: [
        ...kids.map((k) => ({ kind: 'STUDENT' as const, name: `${k.firstName} ${k.lastName}`, detail: k.level ? `${k.level} ${k.arm}` : null })),
        ...staff.map((s) => ({ kind: 'STAFF' as const, name: `${s.firstName} ${s.lastName}`, detail: s.jobTitle })),
      ],
      settings: school.settings,
    };
  }

  private async armNames(ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const arms = await this.prisma.db.classArm.findMany({ where: { id: { in: [...new Set(ids)] } }, include: { classLevel: true } });
    return new Map(arms.map((a) => [a.id, `${a.classLevel.name} ${a.name}`]));
  }

  @Get('settings')
  @RequirePermissions('comms.read')
  settings(): Promise<CommsSettings> {
    return this.settingsOf();
  }

  @Put('settings')
  @RequirePermissions('comms.manage')
  async setSettings(@Body(new ZodPipe(commsSettingsSchema)) body: CommsSettings): Promise<CommsSettings> {
    await this.prisma.root.tenant.update({ where: { id: currentTenantId() }, data: { commsSettings: body as unknown as Prisma.InputJsonValue } });
    await this.audit.log({
      action: 'comms.settings',
      summary: `Updated messaging settings (student birthdays ${body.birthdays.students.enabled ? 'on' : 'off'}, staff birthdays ${body.birthdays.staff.enabled ? 'on' : 'off'}, event reminders ${body.eventReminders.enabled ? 'on' : 'off'})`,
    });
    return this.settingsOf();
  }

  // ---------------------------------------------------------- channels

  @Get('channels')
  @RequirePermissions('comms.read')
  channelStatus() {
    return this.channels.status(currentTenantId());
  }

  @Put('channels/email')
  @RequirePermissions('comms.manage')
  async email(@Body(new ZodPipe(smtpSettingsSchema)) body: z.infer<typeof smtpSettingsSchema>) {
    await this.channels.saveSmtp(currentTenantId(), { ...body, fromName: body.fromName ?? null });
    await this.audit.log({ action: 'comms.channel_email', summary: `Connected email (${body.host}, sending as ${body.fromEmail})` });
    return this.channels.status(currentTenantId());
  }

  @Put('channels/sms')
  @RequirePermissions('comms.manage')
  async sms(@Body(new ZodPipe(smsSettingsSchema)) body: z.infer<typeof smsSettingsSchema>) {
    const r = await this.channels.saveTermii(currentTenantId(), body);
    await this.audit.log({ action: 'comms.channel_sms', summary: `Connected SMS (Termii, sender ID ${body.senderId})` });
    return { channels: await this.channels.status(currentTenantId()), balance: r.balance };
  }

  @Put('channels/whatsapp')
  @RequirePermissions('comms.manage')
  async whatsapp(@Body(new ZodPipe(whatsappSettingsSchema)) body: z.infer<typeof whatsappSettingsSchema>) {
    await this.channels.saveWhatsapp(currentTenantId(), body);
    await this.audit.log({ action: 'comms.channel_whatsapp', summary: `Connected WhatsApp (template ${body.templateName})` });
    return this.channels.status(currentTenantId());
  }

  @Delete('channels/:channel')
  @HttpCode(204)
  @RequirePermissions('comms.manage')
  async disconnect(@Param('channel') channel: string) {
    if (channel !== 'EMAIL' && channel !== 'SMS' && channel !== 'WHATSAPP') throw new BadRequestException('Unknown channel');
    await this.channels.remove(currentTenantId(), channel);
    await this.audit.log({ action: 'comms.channel_removed', summary: `Disconnected ${channel.toLowerCase()}` });
  }

  /** Sends one test message straight away (not recorded as a broadcast). */
  @Post('channels/test')
  @HttpCode(200)
  @RequirePermissions('comms.manage')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async test(@Body(new ZodPipe(testChannelSchema)) body: z.infer<typeof testChannelSchema>) {
    const tenantId = currentTenantId();
    const school = await this.sender.school(tenantId);
    const ch = await this.channels.load(tenantId);
    const text = `This is a test message from ${school.name}. If you can read this, ${body.channel === 'EMAIL' ? 'email' : body.channel === 'SMS' ? 'SMS' : 'WhatsApp'} is working.`;
    try {
      if (body.channel === 'EMAIL') {
        if (!z.email().safeParse(body.to).success) throw new BadRequestException('Enter an email address');
        await this.channels.sendEmail(ch, body.to, `Test message from ${school.name}`, emailHtml(school, 'Test message', text, null), text, school.settings.senderName ?? school.name);
      } else {
        const phone = normalisePhone(body.to);
        if (!phone) throw new BadRequestException('Enter a valid phone number');
        if (body.channel === 'SMS') await this.channels.sendSms(ch, phone, smsSafe(text));
        else await this.channels.sendWhatsapp(ch, phone, school.name, text);
      }
      return { ok: true, message: `Sent to ${body.to}` };
    } catch (err) {
      if (err instanceof SendError) throw new BadRequestException(err.message);
      throw err;
    } finally {
      this.channels.close(ch);
    }
  }

  // ---------------------------------------------------------- broadcasts

  @Post('preview')
  @HttpCode(200)
  @RequirePermissions('comms.send')
  async preview(@Body(new ZodPipe(previewSchema)) body: z.infer<typeof previewSchema>): Promise<AudiencePreview> {
    const tenantId = currentTenantId();
    const school = await this.sender.school(tenantId);
    const text = `${body.body ?? ''} ${body.smsBody ?? ''}`;
    const { contacts, summary } = await this.sender.contactsFor(tenantId, body.audience, /\{\{\s*balance\s*\}\}/.test(text));
    const status = await this.channels.status(tenantId);
    const reach = (ch: Channel, c: (typeof contacts)[number]) => (ch === 'EMAIL' ? !!c.email : ch === 'SMS' || ch === 'WHATSAPP' ? !!c.phone : !!c.userId);
    let sms: AudiencePreview['sms'] = null;
    if (body.channels.includes('SMS') && (body.smsBody || body.body)) {
      const reachable = contacts.filter((c) => c.phone);
      let units = 0;
      for (const c of reachable) units += smsInfo(smsSafe(personalise(body.smsBody || body.body!, c, school))).segments;
      const sample = smsInfo(smsSafe(personalise(body.smsBody || body.body!, reachable[0] ?? contacts[0]!, school)));
      sms = { ...sample, units, costKobo: units * school.settings.smsPricePerUnitKobo };
    }
    return {
      recipients: contacts.length,
      byChannel: body.channels.map((ch) => {
        const ok = contacts.filter((c) => reach(ch, c)).length;
        return { channel: ch, reachable: ok, unreachable: contacts.length - ok, configured: status.find((s) => s.channel === ch)?.configured ?? false };
      }),
      sms,
      sample: contacts.slice(0, 8).map((c) => ({ name: c.name, detail: c.detail, email: c.email, phone: c.phone, hasApp: !!c.userId })),
      summary,
      currency: school.currency,
    };
  }

  @Get('broadcasts')
  @RequirePermissions('comms.read')
  async broadcasts(@Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>): Promise<BroadcastRow[]> {
    const rows = await this.prisma.db.broadcast.findMany({
      where: { ...(q.status ? { status: q.status } : {}), ...(q.source ? { source: q.source } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const names = await this.names(rows.map((r) => r.createdById));
    return (await this.withCounts(rows)).map((b) => this.row(b, names));
  }

  @Get('broadcasts/:id')
  @RequirePermissions('comms.read')
  async broadcast(@Param('id') id: string): Promise<BroadcastDetail> {
    const db = this.prisma.db;
    const b = await db.broadcast.findUniqueOrThrow({ where: { id } });
    const [withCounts] = await this.withCounts([b]);
    const [deliveries, byChannel, units] = await Promise.all([
      db.delivery.findMany({ where: { broadcastId: id }, orderBy: [{ status: 'asc' }, { recipientName: 'asc' }], take: 2000 }),
      db.delivery.groupBy({ by: ['channel', 'status'], where: { broadcastId: id }, _count: { _all: true } }),
      db.delivery.aggregate({ where: { broadcastId: id, channel: 'SMS', status: 'SENT' }, _sum: { units: true } }),
    ]);
    const channels = b.channels as Channel[];
    const names = await this.names([b.createdById]);
    return {
      ...this.row(withCounts!, names),
      subject: b.subject,
      body: b.body,
      smsBody: b.smsBody,
      link: b.link,
      audience: b.audience as unknown as Audience,
      byChannel: channels.map((ch) => {
        const n = (s: string) => byChannel.find((x) => x.channel === ch && x.status === s)?._count._all ?? 0;
        return { channel: ch, sent: n('SENT'), failed: n('FAILED'), skipped: n('SKIPPED'), queued: n('QUEUED') };
      }),
      deliveries: deliveries.map(
        (d): DeliveryRow => ({
          id: d.id,
          channel: d.channel as Channel,
          recipient: d.recipientName,
          address: d.address && (d.channel === 'PUSH' || d.channel === 'IN_APP') ? null : d.address,
          status: d.status as DeliveryStatus,
          error: d.error,
          units: d.units,
          sentAt: d.sentAt?.toISOString() ?? null,
        }),
      ),
      smsUnits: units._sum.units ?? 0,
    };
  }

  private async summaryFor(audience: Audience): Promise<string> {
    return (await this.sender.contactsFor(currentTenantId(), audience, false)).summary;
  }

  @Post('broadcasts')
  @RequirePermissions('comms.send')
  async create(@Body(new ZodPipe(broadcastSchema)) body: BroadcastInput): Promise<BroadcastDetail> {
    const b = await this.prisma.db.broadcast.create({
      data: {
        tenantId: currentTenantId(),
        title: body.title,
        channels: body.channels,
        audience: body.audience as unknown as Prisma.InputJsonValue,
        audienceSummary: await this.summaryFor(body.audience),
        subject: body.subject,
        body: body.body,
        smsBody: body.smsBody,
        source: body.source,
        link: body.link,
        createdById: currentContext().userId,
      },
    });
    return this.broadcast(b.id);
  }

  @Put('broadcasts/:id')
  @RequirePermissions('comms.send')
  async update(@Param('id') id: string, @Body(new ZodPipe(broadcastSchema)) body: BroadcastInput): Promise<BroadcastDetail> {
    const done = await this.prisma.db.broadcast.updateMany({
      where: { id, status: { in: ['DRAFT', 'SCHEDULED'] } },
      data: {
        title: body.title,
        channels: body.channels,
        audience: body.audience as unknown as Prisma.InputJsonValue,
        audienceSummary: await this.summaryFor(body.audience),
        subject: body.subject,
        body: body.body,
        smsBody: body.smsBody,
        link: body.link,
      },
    });
    if (!done.count) throw new BadRequestException('This message has already gone out and can no longer be edited');
    return this.broadcast(id);
  }

  @Delete('broadcasts/:id')
  @HttpCode(204)
  @RequirePermissions('comms.send')
  async remove(@Param('id') id: string) {
    const done = await this.prisma.db.broadcast.deleteMany({ where: { id, status: { in: ['DRAFT', 'CANCELLED'] } } });
    if (!done.count) throw new BadRequestException('Only drafts can be deleted');
  }

  @Post('broadcasts/:id/send')
  @HttpCode(200)
  @RequirePermissions('comms.send')
  async send(@Param('id') id: string, @Body(new ZodPipe(sendBroadcastSchema)) body: z.infer<typeof sendBroadcastSchema>): Promise<BroadcastDetail> {
    const b = await this.prisma.db.broadcast.findUniqueOrThrow({ where: { id } });
    if (body.scheduledAt) {
      const at = new Date(body.scheduledAt);
      if (at.getTime() < Date.now() + 60_000) throw new BadRequestException('Schedule it at least a minute from now, or send it now');
      const done = await this.prisma.db.broadcast.updateMany({ where: { id, status: { in: ['DRAFT', 'SCHEDULED'] } }, data: { status: 'SCHEDULED', scheduledAt: at } });
      if (!done.count) throw new BadRequestException('This message has already been sent');
      await this.audit.log({ action: 'comms.scheduled', entityType: 'Broadcast', entityId: id, summary: `Scheduled "${b.title}" to ${b.audienceSummary} for ${at.toISOString()}` });
    } else {
      await this.sender.start(currentTenantId(), id);
      await this.audit.log({ action: 'comms.sent', entityType: 'Broadcast', entityId: id, summary: `Sent "${b.title}" to ${b.audienceSummary} by ${(b.channels as string[]).map((c) => c.toLowerCase().replace('_', '-')).join(', ')}` });
    }
    return this.broadcast(id);
  }

  @Post('broadcasts/:id/cancel')
  @HttpCode(200)
  @RequirePermissions('comms.send')
  async cancel(@Param('id') id: string): Promise<BroadcastDetail> {
    const done = await this.prisma.db.broadcast.updateMany({ where: { id, status: 'SCHEDULED' }, data: { status: 'DRAFT', scheduledAt: null } });
    if (!done.count) throw new BadRequestException('Only a scheduled message can be cancelled');
    return this.broadcast(id);
  }

  @Post('broadcasts/:id/retry')
  @HttpCode(200)
  @RequirePermissions('comms.send')
  async retry(@Param('id') id: string): Promise<BroadcastDetail> {
    await this.prisma.db.broadcast.findUniqueOrThrow({ where: { id } });
    const n = await this.sender.retryFailed(currentTenantId(), id);
    if (!n) throw new BadRequestException('Nothing failed — there is nothing to retry');
    return this.broadcast(id);
  }

  // ---------------------------------------------------------- AI

  @Post('compose')
  @HttpCode(200)
  @RequirePermissions('comms.send', 'ai.use')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async compose(@Body(new ZodPipe(composeRequestSchema)) body: z.infer<typeof composeRequestSchema>): Promise<AiCompose & AiText> {
    const db = this.prisma.db;
    const tenantId = currentTenantId();
    const [school, t, term, events] = await Promise.all([
      this.sender.school(tenantId),
      this.prisma.root.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { timezone: true, motto: true } }),
      db.term.findFirst({ where: { isCurrent: true } }),
      db.schoolEvent.findMany({ where: { startDate: { gte: new Date() } }, orderBy: { startDate: 'asc' }, take: 8 }),
    ]);
    const today = schoolNow(t.timezone).date;
    const facts = [
      `BRIEF: ${body.brief}`,
      `Audience: ${body.audienceSummary ?? 'not specified'}. Channels: ${body.channels.join(', ')}. Tone: ${body.tone.toLowerCase()}.`,
      '',
      'SCHOOL FACTS',
      `School: ${school.name}. Today: ${today}.`,
      term ? `Current term: ${term.name}, ${dateOnly(term.startsOn)} to ${dateOnly(term.endsOn)}.` : '',
      events.length ? `Upcoming events: ${events.map((e) => `${e.title} on ${dateOnly(e.startDate)}${e.startTime ? ` at ${e.startTime}` : ''}${e.location ? `, ${e.location}` : ''}`).join('; ')}.` : '',
      school.phone ? `School phone: ${school.phone}.` : '',
    ]
      .filter((l) => l !== '')
      .join('\n');
    const { system, user } = composePrompt(school.name, facts);
    const r = await this.gateway.generateJson({ tier: 'standard', system, messages: [{ role: 'user', content: user }] }, aiComposeSchema, 'comms-compose');
    return { ...r.data, smsBody: smsSafe(r.data.smsBody), text: r.data.body, provider: r.provider, model: r.model };
  }

  @Post('translate')
  @HttpCode(200)
  @RequirePermissions('comms.send', 'ai.use')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async translate(@Body(new ZodPipe(translateRequestSchema)) body: z.infer<typeof translateRequestSchema>): Promise<AiText> {
    const r = await this.gateway.generate(
      { tier: 'standard', system: translatePrompt(TRANSLATE_LANGUAGE_LABELS[body.language]), messages: [{ role: 'user', content: body.text }] },
      'comms-translate',
    );
    return { text: r.text.trim(), provider: r.provider, model: r.model };
  }
}
