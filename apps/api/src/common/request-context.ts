import { AsyncLocalStorage } from 'node:async_hooks';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Permission, PlatformRole } from '@aischool/shared';

/**
 * Per-request state, available anywhere in the call chain without passing it
 * around. A middleware opens an empty store for every request; the auth guard
 * fills it once the access token checks out.
 */
export interface RequestContext {
  userId?: string;
  tenantId?: string | null;
  sessionId?: string;
  platformRole?: PlatformRole | null;
  permissions: Set<Permission>;
  ip?: string;
  userAgent?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const RequestContextStore = {
  run<T>(ctx: RequestContext, fn: () => T): T {
    return storage.run(ctx, fn);
  },
  get(): RequestContext | undefined {
    return storage.getStore();
  },
};

export function currentContext(): RequestContext {
  const ctx = storage.getStore();
  if (!ctx) throw new Error('No request context — code ran outside a request');
  return ctx;
}

export function currentUserId(): string {
  const id = storage.getStore()?.userId;
  if (!id) throw new UnauthorizedException();
  return id;
}

/** The school the current request acts on. Throws when none is selected. */
export function currentTenantId(): string {
  const id = storage.getStore()?.tenantId;
  if (!id) throw new ForbiddenException('Select a school first');
  return id;
}
