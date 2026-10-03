import { Global, Injectable, Logger, Module, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

const FLUSH_MS = 5 * 60_000;
const REPEAT_MS = 60 * 60_000;
const CHECK_MS = 15 * 60_000;

interface Pending {
  kind: string;
  title: string;
  detail: string;
  count: number;
  first: Date;
  last: Date;
}

/** The platform's own mailer (operator alerts), separate from each school's SMTP. */
export function platformMailer(): { transport: Transporter; from: string; to: string[] } | null {
  const e = env();
  if (!e.SMTP_HOST || !e.ALERT_EMAIL) return null;
  return {
    transport: nodemailer.createTransport({
      host: e.SMTP_HOST,
      port: e.SMTP_PORT,
      secure: e.SMTP_PORT === 465,
      auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD } : undefined,
      connectionTimeout: 15_000,
    }),
    from: e.SMTP_FROM ?? e.SMTP_USER ?? `alerts@${e.SMTP_HOST}`,
    to: e.ALERT_EMAIL.split(',').map((s) => s.trim()).filter(Boolean),
  };
}

/** Sends one email straight away (used when the app can't even start). */
export async function sendAlertNow(subject: string, text: string) {
  const m = platformMailer();
  if (!m) return false;
  await m.transport.sendMail({ from: m.from, to: m.to, subject: `[AI School OS] ${subject}`, text });
  return true;
}

/**
 * Emails the operator when something breaks: unexpected server errors,
 * crashes, and failing health checks (database, AI providers, stuck
 * queues). Alerts are grouped: the same problem is sent at most once an
 * hour, as a digest every five minutes, with how often it happened.
 * Messages carry the route and error, never request bodies or personal data.
 */
@Injectable()
export class AlertService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(AlertService.name);
  private readonly pending = new Map<string, Pending>();
  private readonly lastSent = new Map<string, number>();
  private timers: NodeJS.Timeout[] = [];

  constructor(private readonly prisma: PrismaService) {}

  enabled() {
    return !!platformMailer();
  }

  onModuleInit() {
    if (env().NODE_ENV === 'test') return;
    this.timers.push(setInterval(() => void this.flush(), FLUSH_MS), setInterval(() => void this.check(), CHECK_MS));
    for (const t of this.timers) t.unref();
    process.on('unhandledRejection', (r) => this.raise('crash', 'unhandledRejection', 'Unhandled promise rejection', r instanceof Error ? (r.stack ?? r.message) : String(r)));
  }

  async onApplicationShutdown() {
    for (const t of this.timers) clearInterval(t);
    await this.flush();
  }

  /** Records a problem; same key = same problem. */
  raise(kind: string, key: string, title: string, detail: string) {
    const now = new Date();
    const k = `${kind}:${key}`.slice(0, 300);
    const p = this.pending.get(k);
    if (p) {
      p.count++;
      p.last = now;
    } else this.pending.set(k, { kind, title: title.slice(0, 200), detail: detail.slice(0, 2000), count: 1, first: now, last: now });
  }

  /** A server error from the global exception filter. */
  serverError(method: string, path: string, err: unknown) {
    const route = path.split('?')[0]!.replace(/\/c[a-z0-9]{20,}/g, '/:id').replace(/\/\d+/g, '/:n');
    const message = err instanceof Error ? err.message : String(err);
    this.raise('error', `${method} ${route} ${message.slice(0, 80)}`, `${method} ${route} failed`, `${message}\n\n${err instanceof Error ? (err.stack ?? '').split('\n').slice(1, 8).join('\n') : ''}`);
  }

  /** Every 15 minutes: the checks a person would look at on the System health page. */
  async check() {
    try {
      const started = Date.now();
      await this.prisma.root.$queryRaw`SELECT 1`;
      const ms = Date.now() - started;
      if (ms > 2000) this.raise('health', 'db-slow', 'The database is slow', `A trivial query took ${ms} ms.`);
      const since = new Date(Date.now() - CHECK_MS);
      const [aiCalls, aiFailed, stuckJobs, failedDeliveries] = await Promise.all([
        this.prisma.root.aiUsage.count({ where: { createdAt: { gte: since } } }),
        this.prisma.root.aiUsage.count({ where: { createdAt: { gte: since }, success: false } }),
        this.prisma.root.aiJob.count({ where: { state: { in: ['QUEUED', 'RUNNING'] }, createdAt: { lt: new Date(Date.now() - 30 * 60_000) } } }),
        this.prisma.root.delivery.count({ where: { status: 'FAILED', createdAt: { gte: since } } }),
      ]);
      if (aiCalls >= 5 && aiFailed / aiCalls > 0.3) this.raise('health', 'ai-failing', 'AI requests are failing', `${aiFailed} of ${aiCalls} AI requests failed in the last 15 minutes. Check the AI provider key and credit.`);
      if (stuckJobs) this.raise('health', 'jobs-stuck', 'Background AI jobs are stuck', `${stuckJobs} AI jobs have been waiting over 30 minutes.`);
      if (failedDeliveries >= 20) this.raise('health', 'deliveries', 'Messages are failing to send', `${failedDeliveries} email/SMS/WhatsApp deliveries failed in the last 15 minutes.`);
    } catch (err) {
      this.raise('health', 'db-down', 'The database is not responding', (err as Error).message);
    }
  }

  async flush(force = false) {
    if (!this.pending.size) return 0;
    const m = platformMailer();
    if (!m) {
      this.pending.clear();
      return 0;
    }
    const now = Date.now();
    const due = [...this.pending.entries()].filter(([k]) => force || now - (this.lastSent.get(k) ?? 0) >= REPEAT_MS);
    if (!due.length) return 0;
    for (const [k] of due) {
      this.pending.delete(k);
      this.lastSent.set(k, now);
    }
    const site = env().PLATFORM_DOMAIN_TARGET ?? 'the platform';
    const lines = due.map(([, p]) => `■ ${p.title}${p.count > 1 ? ` (×${p.count}, ${p.first.toISOString().slice(11, 16)}–${p.last.toISOString().slice(11, 16)} UTC)` : ` (${p.first.toISOString().slice(11, 16)} UTC)`}\n${p.detail}`);
    const subject = due.length === 1 ? due[0]![1].title : `${due.length} problems on ${site}`;
    try {
      await m.transport.sendMail({
        from: m.from,
        to: m.to,
        subject: `[AI School OS] ${subject}`,
        text: `${lines.join('\n\n')}\n\nSystem health: https://${site}/platform/health\nThe same problem is emailed at most once an hour.`,
      });
      return due.length;
    } catch (err) {
      this.logger.error(`Couldn't send alert email: ${(err as Error).message}`);
      return 0;
    }
  }
}

@Global()
@Module({ providers: [AlertService], exports: [AlertService] })
export class AlertsModule {}
