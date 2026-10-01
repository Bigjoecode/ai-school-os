import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { LiveIntegrationStatus, LiveProvider } from '@aischool/shared';
import type { Prisma } from '../generated/prisma/client';
import { decryptSecret, encryptSecret } from '../common/crypto-box';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

const GOOGLE_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/meetings.space.readonly'];

export interface MeetingRequest {
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
}

export interface CreatedMeeting {
  externalId: string;
  joinUrl: string | null;
  providerData: Record<string, unknown>;
}

export interface Participant {
  name: string;
  email: string | null;
  joinedAt: Date | null;
  leftAt: Date | null;
  seconds: number;
}

export interface PulledRecording {
  externalId: string;
  kind: 'VIDEO' | 'AUDIO' | 'TRANSCRIPT' | 'CHAT';
  title: string;
  url: string;
  durationSeconds: number | null;
  startedAt: Date | null;
}

export interface PullResult {
  participants: Participant[] | null;
  recordings: PulledRecording[];
  transcript: string | null;
}

type IntegrationKey = 'google' | 'zoom' | 'bbb';

/** WebVTT/SRT → plain "Speaker: words" lines. */
export function stripCaptions(text: string): string {
  return text
    .replace(/^WEBVTT.*$/m, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() && !/^\d+$/.test(l.trim()) && !/-->/.test(l) && !/^NOTE\b/.test(l))
    .map((l) => l.replace(/<[^>]+>/g, '').trim())
    .join('\n')
    .trim();
}

/**
 * Google Meet (via Google Calendar + the Meet REST API), Zoom (Server-to-
 * Server OAuth) and BigBlueButton (shared-secret API). Each school connects
 * its own account; secrets are encrypted at rest.
 */
@Injectable()
export class LiveProvidersService {
  private readonly logger = new Logger(LiveProvidersService.name);
  private readonly tokens = new Map<string, { token: string; until: number }>();

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------- storage

  private async integration(tenantId: string, key: IntegrationKey) {
    const row = await this.prisma.root.tenantIntegration.findUnique({ where: { tenantId_provider: { tenantId, provider: key } } });
    if (!row) return null;
    try {
      return { secret: decryptSecret(row.secretEncrypted), config: (row.config ?? {}) as Record<string, string> };
    } catch {
      this.logger.error(`Could not decrypt ${key} credentials for ${tenantId}`);
      return null;
    }
  }

  private async save(tenantId: string, key: IntegrationKey, secret: string, config: Record<string, string>) {
    const data = { secretEncrypted: encryptSecret(secret), secretHint: secret.slice(-4), config: config as Prisma.InputJsonValue, isLive: true };
    await this.prisma.root.tenantIntegration.upsert({ where: { tenantId_provider: { tenantId, provider: key } }, update: data, create: { tenantId, provider: key, ...data } });
    this.tokens.delete(`${tenantId}:${key}`);
  }

  async disconnect(tenantId: string, provider: LiveProvider) {
    const key = provider === 'GOOGLE_MEET' ? 'google' : provider === 'ZOOM' ? 'zoom' : provider === 'BBB' ? 'bbb' : null;
    if (!key) return;
    await this.prisma.root.tenantIntegration.deleteMany({ where: { tenantId, provider: key } });
    this.tokens.delete(`${tenantId}:${key}`);
  }

  async status(tenantId: string): Promise<LiveIntegrationStatus[]> {
    const rows = await this.prisma.root.tenantIntegration.findMany({ where: { tenantId, provider: { in: ['google', 'zoom', 'bbb'] } } });
    const by = new Map(rows.map((r) => [r.provider, (r.config ?? {}) as Record<string, string>]));
    const googleReady = !!env().GOOGLE_CLIENT_ID && !!env().GOOGLE_CLIENT_SECRET;
    return [
      {
        provider: 'GOOGLE_MEET',
        connected: by.has('google'),
        detail: by.get('google')?.email ?? null,
        unavailableReason: googleReady ? null : 'The platform needs a Google OAuth client (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET) before schools can connect Google Meet',
      },
      { provider: 'ZOOM', connected: by.has('zoom'), detail: by.get('zoom') ? `Account ${by.get('zoom')!.accountId}` : null, unavailableReason: null },
      { provider: 'BBB', connected: by.has('bbb'), detail: by.get('bbb')?.url ?? null, unavailableReason: null },
      { provider: 'EXTERNAL', connected: true, detail: 'Paste any meeting link (Teams, Jitsi, a personal Zoom room…)', unavailableReason: null },
    ];
  }

  async connected(tenantId: string, provider: LiveProvider): Promise<boolean> {
    if (provider === 'EXTERNAL') return true;
    const key = provider === 'GOOGLE_MEET' ? 'google' : provider === 'ZOOM' ? 'zoom' : 'bbb';
    return (await this.prisma.root.tenantIntegration.count({ where: { tenantId, provider: key } })) > 0;
  }

  private async http(url: string, init: RequestInit, name: string): Promise<Response> {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
    } catch (err) {
      throw new BadGatewayException(`Couldn't reach ${name}: ${(err as Error).message}`);
    }
  }

  private async json<T>(res: Response, name: string): Promise<T> {
    const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } | string; message?: string; error_description?: string };
    if (!res.ok) {
      const msg = typeof body.error === 'string' ? (body.error_description ?? body.error) : (body.error?.message ?? body.message ?? res.statusText);
      throw new BadGatewayException(`${name}: ${msg}`);
    }
    return body;
  }

  // ---------------------------------------------------------- Google

  googleAuthUrl(state: string, redirectUri: string): string {
    const e = env();
    if (!e.GOOGLE_CLIENT_ID || !e.GOOGLE_CLIENT_SECRET) throw new BadRequestException('Google Meet is not available on this platform yet (no Google OAuth client configured)');
    const q = new URLSearchParams({
      client_id: e.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: GOOGLE_SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    });
    return `${e.GOOGLE_AUTH_URL}?${q}`;
  }

  async googleConnect(tenantId: string, code: string, redirectUri: string): Promise<string> {
    const e = env();
    const res = await this.http(
      `${e.GOOGLE_OAUTH_BASE}/token`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: e.GOOGLE_CLIENT_ID!, client_secret: e.GOOGLE_CLIENT_SECRET!, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
      },
      'Google',
    );
    const t = await this.json<{ access_token: string; refresh_token?: string; id_token?: string; expires_in: number }>(res, 'Google');
    if (!t.refresh_token) throw new BadRequestException('Google did not grant offline access — try connecting again');
    let email = 'Google account';
    if (t.id_token) {
      try {
        email = (JSON.parse(Buffer.from(t.id_token.split('.')[1]!, 'base64url').toString()) as { email?: string }).email ?? email;
      } catch {
        // keep the generic label
      }
    }
    await this.save(tenantId, 'google', t.refresh_token, { email, calendarId: 'primary' });
    this.tokens.set(`${tenantId}:google`, { token: t.access_token, until: Date.now() + (t.expires_in - 120) * 1000 });
    return email;
  }

  private async googleToken(tenantId: string): Promise<{ token: string; calendarId: string }> {
    const i = await this.integration(tenantId, 'google');
    if (!i) throw new BadRequestException('Connect Google Meet first (Live classes → Settings)');
    const cached = this.tokens.get(`${tenantId}:google`);
    if (cached && cached.until > Date.now()) return { token: cached.token, calendarId: i.config.calendarId ?? 'primary' };
    const e = env();
    const res = await this.http(
      `${e.GOOGLE_OAUTH_BASE}/token`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ refresh_token: i.secret, client_id: e.GOOGLE_CLIENT_ID ?? '', client_secret: e.GOOGLE_CLIENT_SECRET ?? '', grant_type: 'refresh_token' }),
      },
      'Google',
    );
    const t = await this.json<{ access_token: string; expires_in: number }>(res, 'Google');
    this.tokens.set(`${tenantId}:google`, { token: t.access_token, until: Date.now() + (t.expires_in - 120) * 1000 });
    return { token: t.access_token, calendarId: i.config.calendarId ?? 'primary' };
  }

  // ---------------------------------------------------------- Zoom

  async zoomConnect(tenantId: string, s: { accountId: string; clientId: string; clientSecret: string }) {
    await this.zoomFetchToken(s.accountId, s.clientId, s.clientSecret);
    await this.save(tenantId, 'zoom', s.clientSecret, { accountId: s.accountId, clientId: s.clientId });
  }

  private async zoomFetchToken(accountId: string, clientId: string, secret: string) {
    const res = await this.http(
      `${env().ZOOM_OAUTH_BASE}/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(accountId)}`,
      { method: 'POST', headers: { authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}` } },
      'Zoom',
    );
    if (res.status === 400 || res.status === 401) throw new BadRequestException('Zoom did not accept those credentials (check the account ID, client ID and secret of your Server-to-Server OAuth app)');
    return this.json<{ access_token: string; expires_in: number }>(res, 'Zoom');
  }

  private async zoomToken(tenantId: string): Promise<string> {
    const cached = this.tokens.get(`${tenantId}:zoom`);
    if (cached && cached.until > Date.now()) return cached.token;
    const i = await this.integration(tenantId, 'zoom');
    if (!i) throw new BadRequestException('Connect Zoom first (Live classes → Settings)');
    const t = await this.zoomFetchToken(i.config.accountId!, i.config.clientId!, i.secret);
    this.tokens.set(`${tenantId}:zoom`, { token: t.access_token, until: Date.now() + (t.expires_in - 120) * 1000 });
    return t.access_token;
  }

  // ---------------------------------------------------------- BigBlueButton

  private bbbUrl(base: string, secret: string, call: string, params: Record<string, string>): string {
    const query = new URLSearchParams(params).toString();
    const checksum = createHash('sha1').update(call + query + secret).digest('hex');
    return `${base.replace(/\/?$/, '/')}api/${call}?${query}${query ? '&' : ''}checksum=${checksum}`;
  }

  async bbbConnect(tenantId: string, s: { url: string; secret: string }) {
    const res = await this.http(this.bbbUrl(s.url, s.secret, 'getMeetings', {}), { method: 'GET' }, 'BigBlueButton');
    const xml = await res.text();
    if (!/<returncode>SUCCESS<\/returncode>/.test(xml)) {
      throw new BadRequestException(/checksumError/.test(xml) ? 'BigBlueButton rejected the shared secret' : 'That does not look like a BigBlueButton server');
    }
    await this.save(tenantId, 'bbb', s.secret, { url: s.url.replace(/\/?$/, '/') });
  }

  /** Creates the BBB meeting (idempotent) and returns a personal join link. */
  async bbbJoin(tenantId: string, meetingId: string, data: Record<string, unknown>, title: string, who: { name: string; userId: string; host: boolean }): Promise<string> {
    const i = await this.integration(tenantId, 'bbb');
    if (!i) throw new BadRequestException('BigBlueButton is no longer connected');
    const base = i.config.url!;
    const create = await this.http(
      this.bbbUrl(base, i.secret, 'create', {
        name: title,
        meetingID: meetingId,
        attendeePW: String(data.attendeePW),
        moderatorPW: String(data.moderatorPW),
        record: 'true',
        autoStartRecording: 'false',
        allowStartStopRecording: 'true',
        welcome: `Welcome to ${title}`,
      }),
      { method: 'GET' },
      'BigBlueButton',
    );
    const xml = await create.text();
    if (!/<returncode>SUCCESS<\/returncode>/.test(xml)) {
      const msg = /<message>([^<]*)<\/message>/.exec(xml)?.[1];
      throw new BadGatewayException(`BigBlueButton: ${msg ?? 'could not start the meeting'}`);
    }
    return this.bbbUrl(base, i.secret, 'join', {
      fullName: who.name,
      meetingID: meetingId,
      role: who.host ? 'MODERATOR' : 'VIEWER',
      password: String(who.host ? data.moderatorPW : data.attendeePW),
      userID: who.userId,
      redirect: 'true',
    });
  }

  // ---------------------------------------------------------- create / update / cancel

  async create(tenantId: string, provider: LiveProvider, m: MeetingRequest): Promise<CreatedMeeting> {
    if (provider === 'GOOGLE_MEET') {
      const { token, calendarId } = await this.googleToken(tenantId);
      const res = await this.http(
        `${env().GOOGLE_API_BASE}/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1&sendUpdates=none`,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            summary: m.title,
            description: m.description ?? undefined,
            start: { dateTime: m.startsAt.toISOString(), timeZone: m.timezone },
            end: { dateTime: m.endsAt.toISOString(), timeZone: m.timezone },
            conferenceData: { createRequest: { requestId: randomBytes(12).toString('hex'), conferenceSolutionKey: { type: 'hangoutsMeet' } } },
            guestsCanSeeOtherGuests: false,
          }),
        },
        'Google Calendar',
      );
      const ev = await this.json<{ id: string; hangoutLink?: string; conferenceData?: { conferenceId?: string } }>(res, 'Google Calendar');
      if (!ev.hangoutLink) throw new BadGatewayException('Google created the event but no Meet link — is Google Meet enabled for this Workspace?');
      return { externalId: ev.id, joinUrl: ev.hangoutLink, providerData: { meetingCode: ev.conferenceData?.conferenceId ?? ev.hangoutLink.split('/').pop() } };
    }
    if (provider === 'ZOOM') {
      const token = await this.zoomToken(tenantId);
      const res = await this.http(
        `${env().ZOOM_API_BASE}/users/me/meetings`,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            topic: m.title,
            type: 2,
            start_time: m.startsAt.toISOString().replace(/\.\d{3}Z$/, 'Z'),
            duration: Math.round((m.endsAt.getTime() - m.startsAt.getTime()) / 60_000),
            timezone: m.timezone,
            agenda: m.description?.slice(0, 2000) ?? undefined,
            settings: { join_before_host: false, waiting_room: true, auto_recording: 'cloud', mute_upon_entry: true },
          }),
        },
        'Zoom',
      );
      const z = await this.json<{ id: number; join_url: string; start_url: string; password?: string }>(res, 'Zoom');
      return { externalId: String(z.id), joinUrl: z.join_url, providerData: { startUrl: z.start_url, passcode: z.password ?? null } };
    }
    if (provider === 'BBB') {
      if (!(await this.connected(tenantId, 'BBB'))) throw new BadRequestException('Connect BigBlueButton first (Live classes → Settings)');
      // The meeting is created on the server when the first person joins.
      return {
        externalId: `ais-${randomBytes(9).toString('hex')}`,
        joinUrl: null,
        providerData: { attendeePW: randomBytes(6).toString('hex'), moderatorPW: randomBytes(6).toString('hex') },
      };
    }
    return { externalId: '', joinUrl: null, providerData: {} };
  }

  async reschedule(tenantId: string, provider: LiveProvider, externalId: string, m: MeetingRequest) {
    if (provider === 'GOOGLE_MEET') {
      const { token, calendarId } = await this.googleToken(tenantId);
      const res = await this.http(
        `${env().GOOGLE_API_BASE}/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(externalId)}?sendUpdates=none`,
        {
          method: 'PATCH',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ summary: m.title, description: m.description ?? undefined, start: { dateTime: m.startsAt.toISOString(), timeZone: m.timezone }, end: { dateTime: m.endsAt.toISOString(), timeZone: m.timezone } }),
        },
        'Google Calendar',
      );
      await this.json(res, 'Google Calendar');
    } else if (provider === 'ZOOM') {
      const token = await this.zoomToken(tenantId);
      const res = await this.http(
        `${env().ZOOM_API_BASE}/meetings/${encodeURIComponent(externalId)}`,
        {
          method: 'PATCH',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ topic: m.title, start_time: m.startsAt.toISOString().replace(/\.\d{3}Z$/, 'Z'), duration: Math.round((m.endsAt.getTime() - m.startsAt.getTime()) / 60_000), timezone: m.timezone }),
        },
        'Zoom',
      );
      if (!res.ok && res.status !== 204) await this.json(res, 'Zoom');
    }
  }

  /** Best effort: a meeting already gone on the provider's side is fine. */
  async cancel(tenantId: string, provider: LiveProvider, externalId: string) {
    try {
      if (provider === 'GOOGLE_MEET') {
        const { token, calendarId } = await this.googleToken(tenantId);
        await this.http(`${env().GOOGLE_API_BASE}/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(externalId)}?sendUpdates=none`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } }, 'Google Calendar');
      } else if (provider === 'ZOOM') {
        const token = await this.zoomToken(tenantId);
        await this.http(`${env().ZOOM_API_BASE}/meetings/${encodeURIComponent(externalId)}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } }, 'Zoom');
      }
    } catch (err) {
      this.logger.warn(`Cancelling ${provider} meeting ${externalId}: ${(err as Error).message}`);
    }
  }

  // ---------------------------------------------------------- after the class

  /** Attendance, recordings and transcript from the provider, where it offers them. */
  async pull(tenantId: string, provider: LiveProvider, externalId: string, data: Record<string, unknown>): Promise<PullResult> {
    if (provider === 'GOOGLE_MEET') return this.pullGoogle(tenantId, String(data.meetingCode ?? ''));
    if (provider === 'ZOOM') return this.pullZoom(tenantId, externalId);
    if (provider === 'BBB') return this.pullBbb(tenantId, externalId);
    return { participants: null, recordings: [], transcript: null };
  }

  private async pullGoogle(tenantId: string, meetingCode: string): Promise<PullResult> {
    const { token } = await this.googleToken(tenantId);
    const base = env().GOOGLE_MEET_BASE;
    const get = async <T>(path: string) => this.json<T>(await this.http(`${base}/v2/${path}`, { headers: { authorization: `Bearer ${token}` } }, 'Google Meet'), 'Google Meet');
    const records = await get<{ conferenceRecords?: { name: string; startTime?: string; endTime?: string }[] }>(
      `conferenceRecords?filter=${encodeURIComponent(`space.meeting_code="${meetingCode}"`)}`,
    );
    const list = records.conferenceRecords ?? [];
    if (!list.length) return { participants: [], recordings: [], transcript: null };
    const participants: Participant[] = [];
    const recordings: PulledRecording[] = [];
    const names = new Map<string, string>();
    let transcript = '';
    for (const rec of list) {
      const ps = await get<{ participants?: { name: string; signedinUser?: { displayName?: string }; anonymousUser?: { displayName?: string }; phoneUser?: { displayName?: string }; earliestStartTime?: string; latestEndTime?: string }[] }>(
        `${rec.name}/participants?pageSize=250`,
      );
      for (const p of ps.participants ?? []) {
        const name = p.signedinUser?.displayName ?? p.anonymousUser?.displayName ?? p.phoneUser?.displayName ?? 'Guest';
        names.set(p.name, name);
        const joined = p.earliestStartTime ? new Date(p.earliestStartTime) : null;
        const left = p.latestEndTime ? new Date(p.latestEndTime) : null;
        participants.push({ name, email: null, joinedAt: joined, leftAt: left, seconds: joined && left ? Math.max(0, (left.getTime() - joined.getTime()) / 1000) : 0 });
      }
      const rs = await get<{ recordings?: { name: string; driveDestination?: { exportUri?: string }; startTime?: string; endTime?: string }[] }>(`${rec.name}/recordings`);
      for (const r of rs.recordings ?? []) {
        if (!r.driveDestination?.exportUri) continue;
        const s = r.startTime ? new Date(r.startTime) : null;
        const e = r.endTime ? new Date(r.endTime) : null;
        recordings.push({ externalId: r.name, kind: 'VIDEO', title: 'Meet recording', url: r.driveDestination.exportUri, durationSeconds: s && e ? Math.round((e.getTime() - s.getTime()) / 1000) : null, startedAt: s });
      }
      const ts = await get<{ transcripts?: { name: string; docsDestination?: { exportUri?: string } }[] }>(`${rec.name}/transcripts`);
      for (const t of ts.transcripts ?? []) {
        if (t.docsDestination?.exportUri) recordings.push({ externalId: t.name, kind: 'TRANSCRIPT', title: 'Meet transcript', url: t.docsDestination.exportUri, durationSeconds: null, startedAt: null });
        let page: string | undefined;
        do {
          const es = await get<{ transcriptEntries?: { participant?: string; text: string }[]; nextPageToken?: string }>(`${t.name}/entries?pageSize=1000${page ? `&pageToken=${page}` : ''}`);
          for (const e of es.transcriptEntries ?? []) transcript += `${names.get(e.participant ?? '') ?? 'Speaker'}: ${e.text}\n`;
          page = es.nextPageToken;
        } while (page && transcript.length < 300_000);
      }
    }
    return { participants, recordings, transcript: transcript.trim() || null };
  }

  private async pullZoom(tenantId: string, meetingId: string): Promise<PullResult> {
    const token = await this.zoomToken(tenantId);
    const base = env().ZOOM_API_BASE;
    const auth = { authorization: `Bearer ${token}` };
    let participants: Participant[] | null = null;
    const pr = await this.http(`${base}/past_meetings/${encodeURIComponent(meetingId)}/participants?page_size=300`, { headers: auth }, 'Zoom');
    if (pr.ok) {
      const body = (await pr.json()) as { participants?: { name: string; user_email?: string; join_time?: string; leave_time?: string; duration?: number }[] };
      participants = (body.participants ?? []).map((p) => ({
        name: p.name,
        email: p.user_email || null,
        joinedAt: p.join_time ? new Date(p.join_time) : null,
        leftAt: p.leave_time ? new Date(p.leave_time) : null,
        seconds: p.duration ?? 0,
      }));
    } else if (pr.status !== 404) {
      this.logger.warn(`Zoom participants for ${meetingId}: HTTP ${pr.status} (needs a Pro account or above)`);
    }
    const recordings: PulledRecording[] = [];
    let transcript: string | null = null;
    const rr = await this.http(`${base}/meetings/${encodeURIComponent(meetingId)}/recordings`, { headers: auth }, 'Zoom');
    if (rr.ok) {
      const body = (await rr.json()) as { recording_files?: { id: string; file_type: string; play_url?: string; download_url?: string; recording_start?: string; recording_end?: string }[] };
      for (const f of body.recording_files ?? []) {
        const kind = f.file_type === 'MP4' ? 'VIDEO' : f.file_type === 'M4A' ? 'AUDIO' : f.file_type === 'TRANSCRIPT' ? 'TRANSCRIPT' : f.file_type === 'CHAT' ? 'CHAT' : null;
        if (!kind) continue;
        const s = f.recording_start ? new Date(f.recording_start) : null;
        const e = f.recording_end ? new Date(f.recording_end) : null;
        recordings.push({
          externalId: f.id,
          kind,
          title: kind === 'VIDEO' ? 'Zoom recording' : kind === 'AUDIO' ? 'Audio only' : kind === 'TRANSCRIPT' ? 'Zoom transcript' : 'Chat',
          url: f.play_url ?? f.download_url ?? '',
          durationSeconds: s && e ? Math.round((e.getTime() - s.getTime()) / 1000) : null,
          startedAt: s,
        });
        if (kind === 'TRANSCRIPT' && f.download_url && !transcript) {
          const t = await this.http(f.download_url, { headers: auth }, 'Zoom');
          if (t.ok) transcript = stripCaptions(await t.text());
        }
      }
    }
    return { participants, recordings: recordings.filter((r) => r.url), transcript };
  }

  private async pullBbb(tenantId: string, meetingId: string): Promise<PullResult> {
    const i = await this.integration(tenantId, 'bbb');
    if (!i) throw new BadRequestException('BigBlueButton is no longer connected');
    const res = await this.http(this.bbbUrl(i.config.url!, i.secret, 'getRecordings', { meetingID: meetingId }), { method: 'GET' }, 'BigBlueButton');
    const xml = await res.text();
    const recordings: PulledRecording[] = [];
    for (const block of xml.match(/<recording>[\s\S]*?<\/recording>/g) ?? []) {
      const tag = (t: string) => new RegExp(`<${t}>([\\s\\S]*?)</${t}>`).exec(block)?.[1]?.trim() ?? null;
      const url = /<url>([^<]+)<\/url>/.exec(block)?.[1];
      const id = tag('recordID');
      if (!url || !id) continue;
      const start = tag('startTime');
      const end = tag('endTime');
      recordings.push({
        externalId: id,
        kind: 'VIDEO',
        title: 'BigBlueButton recording',
        url: url.replace(/&amp;/g, '&'),
        durationSeconds: start && end ? Math.round((Number(end) - Number(start)) / 1000) : null,
        startedAt: start ? new Date(Number(start)) : null,
      });
    }
    // BigBlueButton keeps no attendance after the meeting; attendance comes from joins through the portal.
    return { participants: null, recordings, transcript: null };
  }
}
