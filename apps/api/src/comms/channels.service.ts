import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import webpush from 'web-push';
import type { Channel, ChannelStatus } from '@aischool/shared';
import type { Prisma } from '../generated/prisma/client';
import { decryptSecret, encryptSecret } from '../common/crypto-box';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

export const PROVIDERS = { EMAIL: 'smtp', SMS: 'termii', WHATSAPP: 'whatsapp' } as const;
type Provider = (typeof PROVIDERS)[keyof typeof PROVIDERS];

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  fromEmail: string;
  fromName: string | null;
}
interface TermiiConfig {
  senderId: string;
  dnd: boolean;
}
interface WhatsappConfig {
  phoneNumberId: string;
  templateName: string;
  templateLanguage: string;
}

export interface SendResult {
  ref: string | null;
}

/** Loaded, decrypted channel credentials for one school, for one batch of sends. */
export interface SchoolChannels {
  smtp: (SmtpConfig & { transport: Transporter }) | null;
  termii: (TermiiConfig & { apiKey: string }) | null;
  whatsapp: (WhatsappConfig & { token: string }) | null;
}

/** Errors worth showing to the sender, without leaking secrets. */
export class SendError extends Error {}

/**
 * The delivery channels. Each school brings its own email (SMTP), SMS
 * (Termii) and WhatsApp (Meta Cloud API) accounts; secrets are stored
 * encrypted. Web push is server-wide (VAPID keys in the environment).
 */
@Injectable()
export class ChannelsService {
  private readonly logger = new Logger(ChannelsService.name);
  private pushReady = false;

  constructor(private readonly prisma: PrismaService) {
    const e = env();
    if (e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY) {
      try {
        webpush.setVapidDetails(e.VAPID_SUBJECT, e.VAPID_PUBLIC_KEY, e.VAPID_PRIVATE_KEY);
        this.pushReady = true;
      } catch (err) {
        this.logger.warn(`Web push is off: ${(err as Error).message}`);
      }
    }
  }

  pushEnabled(): boolean {
    return this.pushReady;
  }

  pushPublicKey(): string | null {
    return this.pushReady ? (env().VAPID_PUBLIC_KEY ?? null) : null;
  }

  // ---------------------------------------------------------- status & set-up

  async status(tenantId: string): Promise<ChannelStatus[]> {
    const rows = await this.prisma.root.tenantIntegration.findMany({ where: { tenantId, provider: { in: Object.values(PROVIDERS) } } });
    const by = new Map(rows.map((r) => [r.provider, r]));
    const smtp = by.get('smtp');
    const termii = by.get('termii');
    const wa = by.get('whatsapp');
    const smtpCfg = smtp?.config as SmtpConfig | undefined;
    const termiiCfg = termii?.config as TermiiConfig | undefined;
    const waCfg = wa?.config as WhatsappConfig | undefined;
    return [
      { channel: 'EMAIL', configured: !!smtp, detail: smtpCfg ? `${smtpCfg.host} · ${smtpCfg.fromEmail}` : null },
      { channel: 'SMS', configured: !!termii, detail: termiiCfg ? `Termii · sender ${termiiCfg.senderId}${termiiCfg.dnd ? ' · DND route' : ''}` : null },
      { channel: 'WHATSAPP', configured: !!wa, detail: waCfg ? `Cloud API · template ${waCfg.templateName}` : null },
      { channel: 'PUSH', configured: this.pushReady, detail: this.pushReady ? 'Browser notifications on this server' : 'Needs VAPID keys on the server', serverManaged: true },
      { channel: 'IN_APP', configured: true, detail: 'Bell notifications for people with an app account' },
    ];
  }

  private async save(tenantId: string, provider: Provider, secret: string, config: object) {
    const data = {
      secretEncrypted: encryptSecret(secret),
      secretHint: secret.slice(-4),
      config: config as Prisma.InputJsonValue,
      isLive: true,
    };
    await this.prisma.root.tenantIntegration.upsert({
      where: { tenantId_provider: { tenantId, provider } },
      update: data,
      create: { tenantId, provider, ...data },
    });
  }

  async remove(tenantId: string, channel: 'EMAIL' | 'SMS' | 'WHATSAPP') {
    await this.prisma.root.tenantIntegration.deleteMany({ where: { tenantId, provider: PROVIDERS[channel] } });
  }

  /** Checks the SMTP login before saving it. */
  async saveSmtp(tenantId: string, s: SmtpConfig & { password: string }) {
    const transport = this.smtpTransport(s, s.password);
    try {
      await transport.verify();
    } catch (err) {
      throw new BadRequestException(`The mail server didn't accept those details: ${(err as Error).message}`);
    } finally {
      transport.close();
    }
    const { password, ...config } = s;
    await this.save(tenantId, 'smtp', password, config);
  }

  /** Checks the Termii key (by reading the balance) before saving it. */
  async saveTermii(tenantId: string, s: { apiKey: string; senderId: string; dnd: boolean }): Promise<{ balance: string | null }> {
    const res = await this.http(`${env().TERMII_BASE_URL}/api/get-balance?api_key=${encodeURIComponent(s.apiKey)}`, { method: 'GET' }, 'Termii');
    if (!res.ok) throw new BadRequestException('Termii did not accept that API key');
    const body = (await res.json().catch(() => ({}))) as { balance?: number; currency?: string };
    await this.save(tenantId, 'termii', s.apiKey, { senderId: s.senderId, dnd: s.dnd } satisfies TermiiConfig);
    return { balance: body.balance !== undefined ? `${body.balance} ${body.currency ?? ''}`.trim() : null };
  }

  /** Checks the WhatsApp phone number and token before saving them. */
  async saveWhatsapp(tenantId: string, s: { phoneNumberId: string; accessToken: string; templateName: string; templateLanguage: string }) {
    const res = await this.http(`${env().WHATSAPP_BASE_URL}/${encodeURIComponent(s.phoneNumberId)}`, { method: 'GET', headers: { authorization: `Bearer ${s.accessToken}` } }, 'WhatsApp');
    if (!res.ok) throw new BadRequestException('WhatsApp did not accept that phone number ID and access token');
    await this.save(tenantId, 'whatsapp', s.accessToken, { phoneNumberId: s.phoneNumberId, templateName: s.templateName, templateLanguage: s.templateLanguage } satisfies WhatsappConfig);
  }

  // ---------------------------------------------------------- loading

  private smtpTransport(c: SmtpConfig, password: string): Transporter {
    return nodemailer.createTransport({
      host: c.host,
      port: c.port,
      secure: c.secure,
      auth: { user: c.username, pass: password },
      connectionTimeout: 15_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
      pool: true,
      maxConnections: 3,
    });
  }

  async load(tenantId: string): Promise<SchoolChannels> {
    const rows = await this.prisma.root.tenantIntegration.findMany({ where: { tenantId, provider: { in: Object.values(PROVIDERS) } } });
    const out: SchoolChannels = { smtp: null, termii: null, whatsapp: null };
    for (const r of rows) {
      let secret: string;
      try {
        secret = decryptSecret(r.secretEncrypted);
      } catch {
        this.logger.error(`Could not decrypt ${r.provider} credentials for tenant ${tenantId} — was APP_ENCRYPTION_KEY changed?`);
        continue;
      }
      if (r.provider === 'smtp') {
        const c = r.config as unknown as SmtpConfig;
        out.smtp = { ...c, transport: this.smtpTransport(c, secret) };
      } else if (r.provider === 'termii') out.termii = { ...(r.config as unknown as TermiiConfig), apiKey: secret };
      else if (r.provider === 'whatsapp') out.whatsapp = { ...(r.config as unknown as WhatsappConfig), token: secret };
    }
    return out;
  }

  close(ch: SchoolChannels) {
    ch.smtp?.transport.close();
  }

  configured(ch: SchoolChannels, channel: Channel): boolean {
    if (channel === 'EMAIL') return !!ch.smtp;
    if (channel === 'SMS') return !!ch.termii;
    if (channel === 'WHATSAPP') return !!ch.whatsapp;
    if (channel === 'PUSH') return this.pushReady;
    return true;
  }

  // ---------------------------------------------------------- sending

  private async http(url: string, init: RequestInit, name: string): Promise<Response> {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
    } catch (err) {
      throw new BadGatewayException(`Couldn't reach ${name}: ${(err as Error).message}`);
    }
  }

  async sendEmail(ch: SchoolChannels, to: string, subject: string, html: string, text: string, senderName: string | null): Promise<SendResult> {
    if (!ch.smtp) throw new SendError('Email is not set up');
    const from = { name: ch.smtp.fromName ?? senderName ?? '', address: ch.smtp.fromEmail };
    try {
      const info = await ch.smtp.transport.sendMail({ from, to, subject, html, text });
      return { ref: info.messageId ?? null };
    } catch (err) {
      throw new SendError((err as Error).message.slice(0, 300));
    }
  }

  async sendSms(ch: SchoolChannels, to: string, text: string): Promise<SendResult> {
    if (!ch.termii) throw new SendError('SMS is not set up');
    const res = await this.http(
      `${env().TERMII_BASE_URL}/api/sms/send`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to, from: ch.termii.senderId, sms: text, type: 'plain', channel: ch.termii.dnd ? 'dnd' : 'generic', api_key: ch.termii.apiKey }),
      },
      'Termii',
    ).catch((err: Error) => {
      throw new SendError(err.message);
    });
    const body = (await res.json().catch(() => ({}))) as { message_id?: string; message?: string };
    if (!res.ok) throw new SendError(`Termii: ${body.message ?? res.statusText}`.slice(0, 300));
    return { ref: body.message_id ?? null };
  }

  /**
   * WhatsApp business-initiated messages must use an approved template; the
   * school's template takes {{1}} = school name and {{2}} = the message.
   */
  async sendWhatsapp(ch: SchoolChannels, to: string, schoolName: string, text: string): Promise<SendResult> {
    if (!ch.whatsapp) throw new SendError('WhatsApp is not set up');
    // Template parameters can't contain new lines, tabs or long runs of spaces.
    const param = text.replace(/\s*\n+\s*/g, ' · ').replace(/\s{2,}/g, ' ').slice(0, 1000);
    const res = await this.http(
      `${env().WHATSAPP_BASE_URL}/${encodeURIComponent(ch.whatsapp.phoneNumberId)}/messages`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${ch.whatsapp.token}` },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: {
            name: ch.whatsapp.templateName,
            language: { code: ch.whatsapp.templateLanguage },
            components: [{ type: 'body', parameters: [{ type: 'text', text: schoolName }, { type: 'text', text: param }] }],
          },
        }),
      },
      'WhatsApp',
    ).catch((err: Error) => {
      throw new SendError(err.message);
    });
    const body = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
    if (!res.ok) throw new SendError(`WhatsApp: ${body.error?.message ?? res.statusText}`.slice(0, 300));
    return { ref: body.messages?.[0]?.id ?? null };
  }

  /** Sends to every browser the user has allowed; drops subscriptions the browser has revoked. */
  async sendPush(userId: string, payload: { title: string; body: string; url: string | null }): Promise<number> {
    if (!this.pushReady) throw new SendError('Push notifications are not set up on this server');
    const subs = await this.prisma.root.pushSubscription.findMany({ where: { userId } });
    if (!subs.length) throw new SendError('No device has allowed notifications yet');
    let sent = 0;
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 24 * 3600 });
        sent++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await this.prisma.root.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined);
        else this.logger.warn(`Push to ${userId} failed: ${(err as Error).message}`);
      }
    }
    if (!sent) throw new SendError('No device accepted the notification');
    return sent;
  }
}
