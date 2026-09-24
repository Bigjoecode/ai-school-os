import { Injectable } from '@nestjs/common';
import {
  ALL_PERMISSIONS,
  isPermission,
  type MeResponse,
  type Permission,
  type PlatformRole,
} from '@aischool/shared';
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
  constructor(private readonly prisma: PrismaService) {}

  async resolve(userId: string, tenantId: string | null): Promise<ResolvedAccess | null> {
    const user = await this.prisma.root.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          // No school selected: match nothing rather than every membership.
          where: { tenantId: tenantId ?? '', status: 'ACTIVE' },
          include: { roles: { include: { role: true } } },
        },
      },
    });
    if (!user || user.status === 'DISABLED') return null;

    const base: ResolvedAccess = {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: user.avatarUrl,
        platformRole: user.platformRole,
        status: user.status,
      },
      tenant: null,
      roles: [],
      permissions: new Set(),
    };
    if (!tenantId) return base;

    const tenant = await this.prisma.root.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return base;

    const isSuperAdmin = user.platformRole === 'SUPER_ADMIN';
    if (BLOCKED_TENANT_STATUSES.has(tenant.status) && !isSuperAdmin) return base;

    const membership = user.memberships[0];
    if (!membership && !isSuperAdmin) return base;

    const roles = membership?.roles.map((mr) => mr.role) ?? [];
    const permissions = new Set<Permission>(
      isSuperAdmin ? ALL_PERMISSIONS : roles.flatMap((r) => r.permissions.filter(isPermission)),
    );

    return {
      ...base,
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        shortName: tenant.shortName,
        logoUrl: tenant.logoUrl,
        primaryColor: tenant.primaryColor,
        currency: tenant.currency,
        timezone: tenant.timezone,
        motto: tenant.motto,
        status: tenant.status,
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
    const { status: _status, ...user } = access.user;
    const tenant = access.tenant ? (({ status: _s, ...t }) => t)(access.tenant) : null;
    return {
      user,
      tenant,
      roles: access.roles,
      permissions: [...access.permissions],
      memberships: await this.memberships(userId),
    };
  }
}
