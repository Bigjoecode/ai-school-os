import { Logger } from '@nestjs/common';
import { createPrivateKey, sign, type KeyObject } from 'node:crypto';
import { connect, constants, type ClientHttp2Session } from 'node:http2';

/**
 * Apple Push Notification service (APNs) over HTTP/2 with a token-based (.p8) key: push to the
 * iPhone/iPad app. No extra dependency — node's http2 and an ES256 JWT signed with node:crypto.
 * https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns
 */

export interface ApnsConfig {
  keyId: string;
  teamId: string;
  /** The .p8 file: PEM text (literal "\n" allowed) or the whole file base64-encoded. */
  keyP8: string;
  bundleId: string;
  env: 'production' | 'sandbox';
}

export type ApnsResult = { ok: true } | { ok: false; status: number; reason: string; gone: boolean };

const HOSTS = { production: 'https://api.push.apple.com', sandbox: 'https://api.sandbox.push.apple.com' } as const;
/** Apple accepts a token for an hour and refuses one refreshed more than every 20 minutes. */
const TOKEN_TTL_MS = 40 * 60 * 1000;

function loadKey(raw: string): KeyObject {
  const text = raw.includes('BEGIN PRIVATE KEY') ? raw.replace(/\\n/g, '\n') : Buffer.from(raw.trim(), 'base64').toString('utf8');
  return createPrivateKey({ key: text, format: 'pem' });
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export class ApnsClient {
  private readonly logger = new Logger('APNs');
  private readonly key: KeyObject;
  private jwt: { value: string; at: number } | null = null;
  private session: ClientHttp2Session | null = null;

  constructor(private readonly cfg: ApnsConfig) {
    this.key = loadKey(cfg.keyP8);
  }

  private token(): string {
    if (this.jwt && Date.now() - this.jwt.at < TOKEN_TTL_MS) return this.jwt.value;
    const header = b64url(JSON.stringify({ alg: 'ES256', kid: this.cfg.keyId }));
    const claims = b64url(JSON.stringify({ iss: this.cfg.teamId, iat: Math.floor(Date.now() / 1000) }));
    const signature = sign('sha256', Buffer.from(`${header}.${claims}`), { key: this.key, dsaEncoding: 'ieee-p1363' });
    this.jwt = { value: `${header}.${claims}.${b64url(signature)}`, at: Date.now() };
    return this.jwt.value;
  }

  private connection(): ClientHttp2Session {
    if (this.session && !this.session.closed && !this.session.destroyed) return this.session;
    const s = connect(HOSTS[this.cfg.env]);
    s.on('error', (err) => this.logger.warn(`Connection: ${err.message}`));
    s.on('close', () => {
      if (this.session === s) this.session = null;
    });
    // Don't keep the process alive just for an idle push connection.
    s.unref();
    this.session = s;
    return s;
  }

  /** Sends one alert. `gone` means the token is no longer valid and should be forgotten. */
  send(deviceToken: string, alert: { title: string; body: string; url: string | null }): Promise<ApnsResult> {
    const payload = JSON.stringify({ aps: { alert: { title: alert.title, body: alert.body }, sound: 'default' }, url: alert.url });
    return new Promise((resolve) => {
      let req;
      try {
        req = this.connection().request({
          [constants.HTTP2_HEADER_METHOD]: 'POST',
          [constants.HTTP2_HEADER_PATH]: `/3/device/${deviceToken}`,
          authorization: `bearer ${this.token()}`,
          'apns-topic': this.cfg.bundleId,
          'apns-push-type': 'alert',
          'apns-priority': '10',
          'apns-expiration': String(Math.floor(Date.now() / 1000) + 24 * 3600),
          'content-type': 'application/json',
        });
      } catch (err) {
        this.session = null;
        resolve({ ok: false, status: 0, reason: (err as Error).message, gone: false });
        return;
      }
      let status = 0;
      let body = '';
      req.setEncoding('utf8');
      req.setTimeout(15_000, () => req.close(constants.NGHTTP2_CANCEL));
      req.on('response', (h) => (status = Number(h[constants.HTTP2_HEADER_STATUS]) || 0));
      req.on('data', (chunk: string) => (body += chunk));
      req.on('error', (err) => resolve({ ok: false, status, reason: err.message, gone: false }));
      req.on('close', () => {
        if (status === 200) return resolve({ ok: true });
        let reason = 'No response';
        try {
          reason = (JSON.parse(body) as { reason?: string }).reason ?? reason;
        } catch {
          /* empty body */
        }
        // 410: the app was removed or notifications turned off. BadDeviceToken: a sandbox token sent to production (or junk).
        const gone = status === 410 || (status === 400 && (reason === 'BadDeviceToken' || reason === 'DeviceTokenNotForTopic'));
        resolve({ ok: false, status, reason, gone });
      });
      req.end(payload);
    });
  }
}
