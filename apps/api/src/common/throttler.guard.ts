import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { ThrottlerRequest } from '@nestjs/throttler';
import { REFRESH_COOKIE } from '../auth/tokens';
import { env } from '../config/env';

/** Sign-in and token refresh: the most attempts one IP address may make across all accounts, per minute. */
export const LOGIN_PER_IP_PER_MINUTE = 200;
export const REFRESH_PER_IP_PER_MINUTE = 600;

const sha = (v: string) => createHash('sha256').update(v).digest('hex').slice(0, 32);

/**
 * Rate limits that suit schools, where a whole school (or exam hall) often
 * shares one public IP address:
 *
 *  - Signed-in requests are counted per user (a valid access token), not per
 *    IP, so 500 pupils sitting a CBT behind one router don't share one
 *    allowance. Requests without a valid token are counted per IP as before.
 *  - Sign-in is counted per IP and account (each pupil gets the route's own
 *    limit), and token refresh per IP and session, each with an overall
 *    per-IP ceiling so one address can't spray guesses across accounts.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  private verifier?: JwtService;

  private jwt(): JwtService {
    return (this.verifier ??= new JwtService({ secret: env().JWT_SECRET }));
  }

  private static route(req: Record<string, any>): 'login' | 'refresh' | null {
    if (req.method !== 'POST') return null;
    const path = String(req.path ?? req.originalUrl ?? '').replace(/\/+$/, '');
    if (path.endsWith('/auth/login')) return 'login';
    if (path.endsWith('/auth/refresh')) return 'refresh';
    return null;
  }

  protected override async getTracker(req: Record<string, any>): Promise<string> {
    const token = String(req.headers?.authorization ?? '').match(/^Bearer (.+)$/i)?.[1];
    if (token) {
      try {
        const p = this.jwt().verify<{ sub?: string; typ?: string }>(token, { algorithms: ['HS256'] });
        if (p?.typ === 'access' && p.sub) return `user:${p.sub}`;
      } catch {
        // Expired or forged: fall back to the IP address.
      }
    }
    const ip = await super.getTracker(req);
    const route = AppThrottlerGuard.route(req);
    if (route === 'login') {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      if (email) return `${ip}|${sha(email)}`;
    }
    if (route === 'refresh') {
      const cookie = req.cookies?.[REFRESH_COOKIE];
      if (typeof cookie === 'string' && cookie) return `${ip}|${sha(cookie)}`;
    }
    return ip;
  }

  protected override async handleRequest(props: ThrottlerRequest): Promise<boolean> {
    const req = props.context.switchToHttp().getRequest<Record<string, any>>();
    const route = AppThrottlerGuard.route(req);
    if (route) {
      // The overall ceiling for this address, counted separately from the per-account limit.
      await super.handleRequest({
        ...props,
        limit: route === 'login' ? LOGIN_PER_IP_PER_MINUTE : REFRESH_PER_IP_PER_MINUTE,
        ttl: 60_000,
        blockDuration: 60_000,
        getTracker: async () => `ip:${await super.getTracker(req)}`,
        generateKey: (ctx, tracker, name) => props.generateKey(ctx, tracker, `${name}-ip`),
      });
    }
    return super.handleRequest(props);
  }
}
