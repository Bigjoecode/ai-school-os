import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DEFAULT_COMMS_SETTINGS, smsInfo, smsSafe, type Audience, type Channel, type CommsSettings } from '@aischool/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AudienceService, personalise, type Contact } from './audience.service';
import { ChannelsService, SendError, type SchoolChannels } from './channels.service';

const CONCURRENCY = 4;
const MAX_ATTEMPTS = 3;

interface School {
  id: string;
  name: string;
  currency: string;
  logoUrl: string | null;
  primaryColor: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  settings: CommsSettings;
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A plain, well-behaved HTML email: the school's name and colour, the message as paragraphs. */
export function emailHtml(school: School, subject: string, text: string, link: string | null): string {
  const colour = /^#[0-9a-f]{6}$/i.test(school.primaryColor ?? '') ? school.primaryColor! : '#4f46e5';
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) =>
      escapeHtml(p)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:' + colour + '">$1</a>')
        .replace(/\n/g, '<br>'),
    )
    .map((p) => `<p style="margin:0 0 14px;line-height:1.6">${p}</p>`)
    .join('');
  const footer = [school.address, school.phone, school.email].filter(Boolean).map((x) => escapeHtml(x!)).join(' · ');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2430">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden">
<tr><td style="background:${colour};padding:18px 24px;color:#fff;font-size:17px;font-weight:600">${escapeHtml(school.name)}</td></tr>
<tr><td style="padding:24px;font-size:15px">${paragraphs}${link ? `<p style="margin:18px 0 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:${colour};color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px">Open in the school portal</a></p>` : ''}</td></tr>
<tr><td style="padding:14px 24px;border-top:1px solid #eceef2;font-size:12px;color:#6b7280">${footer || escapeHtml(school.name)}</td></tr>
</table></td></tr></table></body></html>`;
}

/**
 * Turns a broadcast into deliveries (one per person per channel) and works
 * through them in the background. Each delivery is claimed with a
 * conditional update, so several API processes (Passenger may run more than
 * one) never send the same message twice.
 */
@Injectable()
export class SenderService {
  private readonly logger = new Logger(SenderService.name);
  private readonly running = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audiences: AudienceService,
    private readonly channels: ChannelsService,
  ) {}

  async school(tenantId: string): Promise<School> {
    const t = await this.prisma.root.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { id: true, name: true, currency: true, logoUrl: true, primaryColor: true, address: true, phone: true, email: true, commsSettings: true },
    });
    const saved = (t.commsSettings as Partial<CommsSettings> | null) ?? {};
    return { ...t, settings: { ...DEFAULT_COMMS_SETTINGS, ...saved, birthdays: { ...DEFAULT_COMMS_SETTINGS.birthdays, ...(saved.birthdays ?? {}) } } };
  }

  /** Moves a draft or due scheduled broadcast to SENDING, creates its deliveries and starts sending. */
  async start(tenantId: string, broadcastId: string): Promise<void> {
    const db = this.prisma.root;
    const claimed = await db.broadcast.updateMany({
      where: { id: broadcastId, tenantId, status: { in: ['DRAFT', 'SCHEDULED'] } },
      data: { status: 'SENDING', sentAt: new Date() },
    });
    if (!claimed.count) throw new BadRequestException('This message has already been sent or cancelled');
    try {
      await this.prepare(tenantId, broadcastId);
    } catch (err) {
      // Put it back so it can be fixed and sent again.
      await db.broadcast.update({ where: { id: broadcastId }, data: { status: 'DRAFT', sentAt: null } });
      throw err;
    }
    void this.dispatch(tenantId, broadcastId);
  }

  private async prepare(tenantId: string, broadcastId: string) {
    const db = this.prisma.root;
    const b = await db.broadcast.findUniqueOrThrow({ where: { id: broadcastId } });
    const school = await this.school(tenantId);
    const channels = b.channels as Channel[];
    const wantsBalance = /\{\{\s*balance\s*\}\}/.test(`${b.body} ${b.smsBody ?? ''} ${b.subject ?? ''}`);
    const { contacts } = await this.audiences.resolve(tenantId, b.audience as unknown as Audience, { withBalances: wantsBalance });
    if (!contacts.length) throw new BadRequestException('Nobody is in this audience');
    const loaded = await this.channels.load(tenantId);
    this.channels.close(loaded);

    const rows: {
      tenantId: string;
      broadcastId: string;
      channel: Channel;
      recipientName: string;
      address: string | null;
      guardianId: string | null;
      staffId: string | null;
      userId: string | null;
      subject: string | null;
      text: string;
      status: string;
      error: string | null;
      units: number;
      sentAt: Date | null;
    }[] = [];
    const notifications: { tenantId: string; userId: string; title: string; body: string; link: string | null }[] = [];
    for (const c of contacts) {
      for (const channel of channels) {
        const short = channel === 'SMS' || channel === 'WHATSAPP';
        let text = personalise(short && b.smsBody ? b.smsBody : b.body, c, school);
        if (channel === 'SMS') text = smsSafe(text);
        const subject = b.subject ? personalise(b.subject, c, school) : null;
        const address = channel === 'EMAIL' ? c.email : channel === 'SMS' || channel === 'WHATSAPP' ? c.phone : c.userId;
        const base = {
          tenantId,
          broadcastId,
          channel,
          recipientName: c.name,
          address,
          guardianId: c.guardianId,
          staffId: c.staffId,
          userId: c.userId,
          subject,
          text,
          units: channel === 'SMS' ? smsInfo(text).segments : 0,
          sentAt: null as Date | null,
        };
        const missing = !address
          ? channel === 'EMAIL'
            ? 'No email address on record'
            : channel === 'SMS' || channel === 'WHATSAPP'
              ? 'No valid phone number on record'
              : 'Has no app account'
          : !this.channels.configured(loaded, channel)
            ? `${channel === 'EMAIL' ? 'Email' : channel === 'SMS' ? 'SMS' : channel === 'WHATSAPP' ? 'WhatsApp' : 'Push'} is not set up`
            : null;
        if (missing) {
          rows.push({ ...base, status: 'SKIPPED', error: missing, units: 0 });
        } else if (channel === 'IN_APP') {
          notifications.push({ tenantId, userId: c.userId!, title: subject ?? b.title, body: text.slice(0, 500), link: b.link });
          rows.push({ ...base, status: 'SENT', error: null, sentAt: new Date() });
        } else {
          rows.push({ ...base, status: 'QUEUED', error: null });
        }
      }
    }
    await db.$transaction([db.delivery.createMany({ data: rows }), db.notification.createMany({ data: notifications })]);
  }

  /** Works through a broadcast's queued deliveries. Safe to call more than once. */
  async dispatch(tenantId: string, broadcastId: string): Promise<void> {
    if (this.running.has(broadcastId)) return;
    this.running.add(broadcastId);
    let channels: SchoolChannels | null = null;
    try {
      const db = this.prisma.root;
      const b = await db.broadcast.findUniqueOrThrow({ where: { id: broadcastId } });
      const school = await this.school(tenantId);
      channels = await this.channels.load(tenantId);
      for (;;) {
        const batch = await db.delivery.findMany({ where: { broadcastId, status: 'QUEUED', attempts: { lt: MAX_ATTEMPTS } }, take: CONCURRENCY * 5, orderBy: { createdAt: 'asc' } });
        if (!batch.length) break;
        for (let i = 0; i < batch.length; i += CONCURRENCY) {
          await Promise.all(batch.slice(i, i + CONCURRENCY).map((d) => this.deliver(d, b, school, channels!)));
        }
      }
      await this.finishIfDone(broadcastId);
    } catch (err) {
      this.logger.error(`Broadcast ${broadcastId} stopped: ${(err as Error).message}`);
    } finally {
      if (channels) this.channels.close(channels);
      this.running.delete(broadcastId);
    }
  }

  private async deliver(
    d: { id: string; channel: string; address: string | null; userId: string | null; subject: string | null; text: string; attempts: number },
    b: { title: string; link: string | null },
    school: School,
    ch: SchoolChannels,
  ) {
    const db = this.prisma.root;
    // Claim this attempt; another process may have it already.
    const claim = await db.delivery.updateMany({ where: { id: d.id, status: 'QUEUED', attempts: d.attempts }, data: { attempts: d.attempts + 1 } });
    if (!claim.count) return;
    try {
      let ref: string | null = null;
      if (d.channel === 'EMAIL') {
        ref = (await this.channels.sendEmail(ch, d.address!, d.subject ?? b.title, emailHtml(school, d.subject ?? b.title, d.text, b.link), d.text, school.settings.senderName ?? school.name)).ref;
      } else if (d.channel === 'SMS') {
        ref = (await this.channels.sendSms(ch, d.address!, d.text)).ref;
      } else if (d.channel === 'WHATSAPP') {
        ref = (await this.channels.sendWhatsapp(ch, d.address!, school.name, d.text)).ref;
      } else if (d.channel === 'PUSH') {
        await this.channels.sendPush(d.userId!, { title: d.subject ?? b.title, body: d.text.slice(0, 240), url: b.link });
      }
      await db.delivery.update({ where: { id: d.id }, data: { status: 'SENT', providerRef: ref, sentAt: new Date(), error: null } });
    } catch (err) {
      const message = err instanceof SendError ? err.message : `Unexpected error: ${(err as Error).message}`.slice(0, 300);
      // Configuration problems won't fix themselves; network hiccups might.
      const permanent = err instanceof SendError && /not set up|No device|no app account/i.test(message);
      const final = permanent || d.attempts + 1 >= MAX_ATTEMPTS;
      await db.delivery.update({ where: { id: d.id }, data: { status: final ? 'FAILED' : 'QUEUED', error: message } });
    }
  }

  async finishIfDone(broadcastId: string) {
    const left = await this.prisma.root.delivery.count({ where: { broadcastId, status: 'QUEUED', attempts: { lt: MAX_ATTEMPTS } } });
    if (left) return;
    // Anything still queued has used all its attempts.
    await this.prisma.root.delivery.updateMany({ where: { broadcastId, status: 'QUEUED' }, data: { status: 'FAILED', error: 'Gave up after several attempts' } });
    await this.prisma.root.broadcast.updateMany({ where: { id: broadcastId, status: 'SENDING' }, data: { status: 'SENT' } });
  }

  /** Puts failed deliveries back in the queue (e.g. after fixing a setting). */
  async retryFailed(tenantId: string, broadcastId: string): Promise<number> {
    const r = await this.prisma.root.delivery.updateMany({ where: { tenantId, broadcastId, status: 'FAILED' }, data: { status: 'QUEUED', attempts: 0, error: null } });
    if (r.count) {
      await this.prisma.root.broadcast.update({ where: { id: broadcastId }, data: { status: 'SENDING' } });
      void this.dispatch(tenantId, broadcastId);
    }
    return r.count;
  }

  /** Who a message would reach, without sending. */
  async contactsFor(tenantId: string, audience: Audience, withBalances: boolean): Promise<{ contacts: Contact[]; summary: string }> {
    return this.audiences.resolve(tenantId, audience, { withBalances });
  }
}
