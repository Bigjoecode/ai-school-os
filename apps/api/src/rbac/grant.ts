import { ForbiddenException } from '@nestjs/common';
import { isPermission } from '@aischool/shared';

/**
 * Nobody hands out more than they hold: giving someone a role (inviting,
 * changing their roles, creating logins on import) needs every permission in
 * those roles. Without this, `users.manage` alone could invite a School Admin
 * account with a known password and sign in as it. Retired permission
 * names left on a role are ignored (sign-in ignores them too).
 */
export function assertCanGrant(held: ReadonlySet<string>, roles: { name: string; permissions: readonly string[] }[]): void {
  const over = roles.filter((r) => r.permissions.some((p) => isPermission(p) && !held.has(p)));
  if (over.length) {
    throw new ForbiddenException(`You can't give the ${over.map((r) => r.name).join(', ')} role${over.length === 1 ? '' : 's'}: ${over.length === 1 ? 'it has' : 'they have'} permissions you don't have yourself`);
  }
}
