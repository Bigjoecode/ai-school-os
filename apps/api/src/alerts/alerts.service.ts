import { Global, Injectable, Logger, Module, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';
import { uploadRoot } from '../files/files.service';
import { PrismaService } from '../prisma/prisma.service';
import { BACKUP_STALE_HOURS, backupStatusFile, readBackupStatus } from './backup-status';

const FLUSH_MS = 5 * 60_000;
const REPEAT_MS = 60 * 60_000;
const CHECK_MS = 15 * 60_000;
/** A burst of server errors (any route) inside this window is alerted as one problem. */
const BURST_WINDOW_MS = 5 * 60_000;
const BURST_THRESHOLD = 20;
/** Survive Passenger restarts: when each problem was last emailed, and a crash left by the previous process. */
const THROTTLE_FILE = join(tmpdir(), 'ai-school-os-alerts-sent.json');
const CRASH_FILE = join(tmpdir(), 'ai-school-os-last-crash.txt');

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

let instance: AlertService | null = null;
const early: [string, string, string, string][] = [];

/**
 * Raises an alert from code outside Nest's dependency injection (boot tasks,
 * background installs, tick tasks). Before the alert service exists the
 * problem is queued and raised once it starts.
 */
export function raiseAlert(kind: string, key: string, title: string, detail: string) {
  if (instance) instance.raise(kind, key, title, detail);
  else if (early.length < 50) early.push([kind, key, title, detail]);
}

/**
 * Emails the operator when something breaks: unexpected server errors and
 * bursts of them, crashes, failed boot installs and scheduled jobs, failed
 * payment webhooks, and failing health checks (database, disk, backups, AI
 * providers, stuck queues). Alerts are grouped: the same problem is sent at
 * most once an hour (remembered across restarts), as a digest every five
 * minutes, with how often it happened. Messages carry the route and error,
 * never request bodies or personal data.
 */
@Injectable()
export class AlertService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(AlertService.name);
  private readonly pending = new Map<string, Pending>();
  private readonly lastSent = new Map<string, number>();
  private serverErrorTimes: number[] = [];
  private timers: NodeJS.Timeout[] = [];

  constructor(private readonly prisma: PrismaService) {}

  enabled() {
    return !!platformMailer();
  }

  onModuleInit() {
    instance = this;
    for (const a of early.splice(0)) this.raise(...a);
    if (env().NODE_ENV === 'test') return;
    this.loadThrottle();
    this.reportPreviousCrash();
    this.timers.push(setInterval(() => void this.flush(), FLUSH_MS), setInterval(() => void this.check(), CHECK_MS));
    for (const t of this.timers) t.unref();
    process.on('unhandledRejection', (r) => this.raise('crash', 'unhandledRejection', 'Unhandled promise rejection', r instanceof Error ? (r.stack ?? r.message) : String(r)));
    // The process is about to die: there is no time to send mail, so leave a note the next process emails.
    process.on('uncaughtExceptionMonitor', (err) => {
      try {
        writeFileSync(CRASH_FILE, `${new Date().toISOString()}\n${(err?.stack ?? String(err)).slice(0, 3000)}`);
      } catch {
        /* nothing more we can do */
      }
    });
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

  /** Every 5xx (including deliberate 502/503s): many in a few minutes means the site is failing for people. */
  noteServerError(status: number) {
    const now = Date.now();
    this.serverErrorTimes = this.serverErrorTimes.filter((t) => now - t < BURST_WINDOW_MS);
    this.serverErrorTimes.push(now);
    if (this.serverErrorTimes.length === BURST_THRESHOLD) {
      this.raise('error', 'burst', 'Many server errors at once', `${BURST_THRESHOLD} requests failed with a server error (5xx, latest ${status}) within ${BURST_WINDOW_MS / 60_000} minutes. Check System health and the error log in cPanel (ai-school-api/stderr.log).`);
    }
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
    await this.checkDisk();
    this.checkBackup();
  }

  /** Uploads must be writable: a full disk quota or wrong permissions break every upload. */
  private async checkDisk() {
    const probe = join(uploadRoot(), `.alert-probe-${process.pid}`);
    try {
      await mkdir(uploadRoot(), { recursive: true });
      await writeFile(probe, 'ok');
      await unlink(probe);
    } catch (err) {
      this.raise('health', 'disk', 'Files cannot be saved on the server', `Writing to the uploads folder failed: ${(err as Error).message}\n\nThe hosting disk quota may be full (cPanel → Disk Usage), or the folder's permissions are wrong.`);
    }
  }

  /** The daily database backup (scripts/backup-db.sh), once it has been scheduled. */
  private checkBackup() {
    const b = readBackupStatus();
    if (b.state === 'failed') this.raise('backup', 'failed', 'The database backup failed', `${b.message ?? 'No details.'}\n\nLast good backup: ${b.lastBackupAt ?? 'never'}. Status file: ${backupStatusFile()}`);
    else if (b.state === 'stale') this.raise('backup', 'stale', 'No recent database backup', `The last good backup was at ${b.lastBackupAt ?? 'never'} (over ${BACKUP_STALE_HOURS} hours ago). Check the backup cron job in cPanel → Cron Jobs.`);
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
    this.saveThrottle();
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

  private loadThrottle() {
    try {
      const saved = JSON.parse(readFileSync(THROTTLE_FILE, 'utf8')) as Record<string, number>;
      const now = Date.now();
      for (const [k, t] of Object.entries(saved)) if (typeof t === 'number' && now - t < REPEAT_MS) this.lastSent.set(k, t);
    } catch {
      /* first start */
    }
  }

  private saveThrottle() {
    const now = Date.now();
    for (const [k, t] of this.lastSent) if (now - t >= REPEAT_MS) this.lastSent.delete(k);
    try {
      writeFileSync(THROTTLE_FILE, JSON.stringify(Object.fromEntries(this.lastSent)));
    } catch {
      /* throttling still works in memory */
    }
  }

  private reportPreviousCrash() {
    try {
      const note = readFileSync(CRASH_FILE, 'utf8');
      unlinkSync(CRASH_FILE);
      const [at, ...stack] = note.split('\n');
      this.raise('crash', 'uncaught', 'The API crashed and restarted', `Crashed at ${at} UTC:\n${stack.join('\n')}`);
    } catch {
      /* no crash */
    }
  }
}

@Global()
@Module({ providers: [AlertService], exports: [AlertService] })
export class AlertsModule {}
