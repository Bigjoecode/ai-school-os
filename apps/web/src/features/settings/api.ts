import type { RoleRow, UserRow } from '@aischool/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { qk } from '@/lib/query-client';

export function useRoles(enabled = true) {
  return useQuery({
    queryKey: qk.roles,
    queryFn: ({ signal }) => api.get<RoleRow[]>('/roles', undefined, signal),
    enabled,
  });
}

export function useUsers() {
  return useQuery({
    queryKey: qk.users,
    queryFn: ({ signal }) => api.get<UserRow[]>('/users', undefined, signal),
  });
}
