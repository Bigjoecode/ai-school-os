import { Injectable } from '@nestjs/common';
import {
  ALL_PERMISSIONS,
  isPermission,
  type MeResponse,
  type Permission,
  type PlatformRole,
} from '@aischool/shared';
import { FeatureService } from '../features/features.service';
import { PrismaService } from '../prisma/prisma.service';

export interface ResolvedAccess {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
    platformRole: PlatformRole | null;
    status: string;
    /** Two-step sign-in is switched on (enforced by the guard when a policy requires it). */
    twoFactorEnabled: boolean;
    /** An admin reset the password: the guard closes everything but changing it. */
    mustChangePassword: boolean;
  };
  tenant: {
    id: string;
    slug: string;
    name: string;
    shortName: string | null;
    logoUrl: string | null;
    primaryColor: string | null;
    currency: string;
    timezone: string;
    motto: string | null;
    status: string;
  } | null;
  roles: { id: string; key: string; name: string }[];
  permissions: Set<Permission>;
  /**
   * Only when resolve() was given a session ID: that sign-in session exists,
   * belongs to this user and has not been ended (sign-out, password change,
   * two-step reset, token reuse...).
   */
  sessionLive?: boolean;
}

/** One row of the access query in resolve(); tenant and membership columns are null when there is no match. */
interface AccessRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  platformRole: string | null;
  status: string;
  twoFactorEnabled: boolean;
  mustChangePassword: boolean;
  sessionLive: boolean;
  tenantId: string | null;
  slug: string | null;
  name: string | null;
  shortName: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  currency: string | null;
  timezone: string | null;
  motto: string | null;
  tenantStatus: string | null;
  membershipId: string | null;
  roles: { id: string; key: string; name: string; permissions: string[] | null }[] | null;
}

const BLOCKED_TENANT_STATUSES = new Set(['SUSPENDED', 'ARCHIVED']);

/**
 * Works out what a user may do in a school: their active membership's roles,
 * flattened into a permission set. Platform super admins get every
 * permission in any school they switch into (for support).
 * Resolved on every request, so role changes and disabled accounts take
 * effect immediately rather than when a token expires.
 */
@Injectable()
export class AccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly features: FeatureService,
  ) {}

  /**
   * With `sessionId` (the auth guard passes the access token's `sid`), also
   * reports whether that session is still live, so ending a session stops
   * its access tokens at once instead of when they expire.
   */
  async resolve(userId: string, tenantId: string | null, sessionId?: string): Promise<ResolvedAccess | null> {
    // One round trip (this runs on every signed-in request): the user, the
    // school, the roles of the user's active membership there, and (a
    // primary-key lookup) whether the session is live. A nested Prisma
    // include would be five queries.
    const [row] = await this.prisma.root.$queryRaw<AccessRow[]>`
      SELECT u.id, u.email, u."firstName", u."lastName", u."avatarUrl", u."platformRole"::text AS "platformRole",
        u.status::text AS status, (u."totpEnabledAt" IS NOT NULL) AS "twoFactorEnabled", u."mustChangePassword",
        EXISTS (SELECT 1 FROM auth_sessions s WHERE s.id = ${sessionId ?? null} AND s."userId" = u.id AND s."revokedAt" IS NULL) AS "sessionLive",
        t.id AS "tenantId", t.slug, t.name, t."shortName", t."logoUrl", t."primaryColor", t.currency, t.timezone, t.motto,
        t.status::text AS "tenantStatus", m.id AS "membershipId",
        (SELECT COALESCE(json_agg(json_build_object('id', r.id, 'key', r.key, 'name', r.name, 'permissions', r.permissions)), '[]'::json)
           FROM membership_roles mr JOIN roles r ON r.id = mr."roleId" WHERE mr."membershipId" = m.id) AS roles
      FROM users u
      LEFT JOIN tenants t ON t.id = ${tenantId}
      -- No school selected: match nothing rather than every membership.
      LEFT JOIN memberships m ON m."userId" = u.id AND m."tenantId" = ${tenantId} AND m.status = 'ACTIVE'
      WHERE u.id = ${userId}`;
    if (!row || row.status === 'DISABLED') return null;
    const user = row;

    const base: ResolvedAccess = {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: user.avatarUrl,
        platformRole: user.platformRole as PlatformRole | null,
        status: user.status,
        twoFactorEnabled: user.twoFactorEnabled,
        mustChangePassword: user.mustChangePassword,
      },
      tenant: null,
      roles: [],
      permissions: new Set(),
      ...(sessionId !== undefined ? { sessionLive: user.sessionLive } : {}),
    };
    if (!tenantId || !row.tenantId) return base;

    const isSuperAdmin = user.platformRole === 'SUPER_ADMIN';
    if (BLOCKED_TENANT_STATUSES.has(row.tenantStatus!) && !isSuperAdmin) return base;

    if (!row.membershipId && !isSuperAdmin) return base;

    const roles = row.roles ?? [];
    const permissions = new Set<Permission>(
      isSuperAdmin ? ALL_PERMISSIONS : roles.flatMap((r) => (r.permissions ?? []).filter(isPermission)),
    );

    return {
      ...base,
      tenant: {
        id: row.tenantId,
        slug: row.slug!,
        name: row.name!,
        shortName: row.shortName,
        logoUrl: row.logoUrl,
        primaryColor: row.primaryColor,
        currency: row.currency!,
        timezone: row.timezone!,
        motto: row.motto,
        status: row.tenantStatus!,
      },
      roles: roles.map((r) => ({ id: r.id, key: r.key, name: r.name })),
      permissions,
    };
  }

  /** Schools the user can switch between. */
  async memberships(userId: string) {
    const rows = await this.prisma.root.membership.findMany({
      where: { userId, status: 'ACTIVE', tenant: { status: { notIn: ['SUSPENDED', 'ARCHIVED'] } } },
      include: { tenant: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(({ tenant: t }) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      shortName: t.shortName,
      logoUrl: t.logoUrl,
      primaryColor: t.primaryColor,
    }));
  }

  async me(userId: string, tenantId: string | null): Promise<MeResponse | null> {
    const access = await this.resolve(userId, tenantId);
    if (!access) return null;
    const { status: _status, twoFactorEnabled: _tfa, mustChangePassword, ...rest } = access.user;
    const user = mustChangePassword ? { ...rest, mustChangePassword } : rest;
    const tenant = access.tenant ? (({ status: _s, ...t }) => t)(access.tenant) : null;
    return {
      user,
      tenant,
      roles: access.roles,
      permissions: [...access.permissions],
      features: access.tenant ? await this.features.enabledKeys(access.tenant.id) : [],
      memberships: await this.memberships(userId),
    };
  }
}
