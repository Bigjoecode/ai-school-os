import { SetMetadata } from '@nestjs/common';
import type { Permission, PlatformRole } from '@aischool/shared';

export const IS_PUBLIC = 'isPublic';
export const ALLOW_NO_TENANT = 'allowNoTenant';
export const PERMISSIONS = 'permissions';
export const PLATFORM_ROLES_KEY = 'platformRoles';

/** No sign-in required. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Signed in, but no school needs to be selected (profile, platform admin). */
export const AllowNoTenant = () => SetMetadata(ALLOW_NO_TENANT, true);

/** Every listed permission is required in the current school. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS, permissions);

/** Restricted to SaaS operator staff with one of these platform roles. */
export const RequirePlatformRole = (...roles: PlatformRole[]) =>
  SetMetadata(PLATFORM_ROLES_KEY, roles);
