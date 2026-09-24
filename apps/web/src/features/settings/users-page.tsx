import { inviteUserSchema, type RoleRow, type UserRow } from '@aischool/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Ellipsis, ShieldCheck, UserCheck, UserCog, UserPlus, UserX } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { type Column, DataTable } from '@/components/ui/data-table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Field } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { StatusBadge } from '@/components/ui/status-badge';
import { api } from '@/lib/api';
import { useCan, useMe } from '@/lib/auth-store';
import { formatRelative } from '@/lib/format';
import { applyServerErrors } from '@/lib/forms';
import { qk, queryClient } from '@/lib/query-client';
import { cn, initials } from '@/lib/utils';
import { useRoles, useUsers } from './api';
import { SectionHeader } from './settings-layout';

type InviteValues = z.input<typeof inviteUserSchema>;
type InviteOutput = z.output<typeof inviteUserSchema>;

function RoleChecklist({ roles, value, onChange, invalid }: { roles: RoleRow[]; value: string[]; onChange: (v: string[]) => void; invalid?: boolean }) {
  return (
    <div className={cn('max-h-64 divide-y divide-border overflow-y-auto rounded-xl border scrollbar-thin', invalid ? 'border-danger' : 'border-border')}>
      {roles.map((r) => {
        const checked = value.includes(r.id);
        return (
          <label key={r.id} className="flex cursor-pointer items-start gap-3 px-3.5 py-2.5 transition-colors hover:bg-muted/40">
            <Checkbox
              checked={checked}
              onCheckedChange={(c) => onChange(c ? [...value, r.id] : value.filter((id) => id !== r.id))}
              className="mt-0.5"
            />
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-[13.5px] font-medium">
                {r.name}
                {r.isSystem && <Badge variant="outline">System</Badge>}
              </span>
              {r.description && <span className="block text-[12px] text-muted-foreground">{r.description}</span>}
            </span>
          </label>
        );
      })}
    </div>
  );
}

export default function UsersPage() {
  const me = useMe();
  const canManage = useCan('users.manage');
  const users = useUsers();
  const roles = useRoles(canManage);
  const [search, setSearch] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);

  const update = useMutation({
    mutationFn: ({ membershipId, ...body }: { membershipId: string; roleIds?: string[]; status?: 'ACTIVE' | 'DISABLED' }) =>
      api.patch<UserRow>(`/users/${membershipId}`, body),
    onSuccess: (_d, vars) => {
      void queryClient.invalidateQueries({ queryKey: qk.users });
      void queryClient.invalidateQueries({ queryKey: qk.roles });
      toast.success(vars.status ? (vars.status === 'DISABLED' ? 'User disabled' : 'User re-enabled') : 'Roles updated');
    },
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!users.data) return undefined;
    if (!q) return users.data;
    return users.data.filter((u) => `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(q));
  }, [users.data, search]);

  const isSelf = (u: UserRow) => u.userId === me?.user.id;

  const actions = (u: UserRow) =>
    canManage && (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${u.firstName} ${u.lastName}`} onClick={(e) => e.stopPropagation()}>
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditing(u)}>
            <ShieldCheck /> Change roles
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {u.status === 'DISABLED' ? (
            <DropdownMenuItem onSelect={() => update.mutate({ membershipId: u.membershipId, status: 'ACTIVE' })}>
              <UserCheck /> Re-enable access
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem destructive disabled={isSelf(u)} onSelect={() => update.mutate({ membershipId: u.membershipId, status: 'DISABLED' })}>
              <UserX /> Disable access
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );

  const columns: Column<UserRow>[] = [
    {
      key: 'user',
      header: 'User',
      cell: (u) => (
        <div className="flex items-center gap-3">
          <Avatar name={`${u.firstName} ${u.lastName}`} initials={initials(u.firstName, u.lastName)} />
          <div className="min-w-0">
            <p className="truncate font-medium">
              {u.firstName} {u.lastName} {isSelf(u) && <span className="text-[12px] font-normal text-muted-foreground">(you)</span>}
            </p>
            <p className="truncate text-[12.5px] text-muted-foreground">{u.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'roles',
      header: 'Roles',
      cell: (u) => (
        <div className="flex flex-wrap gap-1">
          {u.roles.length ? u.roles.map((r) => <Badge key={r.id} variant="brand">{r.name}</Badge>) : <span className="text-muted-foreground">No roles</span>}
        </div>
      ),
    },
    { key: 'status', header: 'Status', cell: (u) => <StatusBadge status={u.status} /> },
    {
      key: 'last',
      header: 'Last sign-in',
      cell: (u) => <span className="text-muted-foreground">{u.lastLoginAt ? formatRelative(u.lastLoginAt) : 'Never'}</span>,
    },
    { key: 'actions', header: <span className="sr-only">Actions</span>, className: 'w-12 text-right', cell: actions },
  ];

  return (
    <div>
      <SectionHeader
        title="Users"
        description="People who can sign in to this school, and what they can do."
        actions={
          canManage && (
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus /> Invite user
            </Button>
          )
        }
      />
      <Card className="overflow-hidden">
        <div className="border-b border-border p-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Search users…" className="sm:max-w-sm" />
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(u) => u.membershipId}
          loading={users.isLoading}
          error={users.error}
          onRetry={() => void users.refetch()}
          renderMobile={(u) => (
            <div className="flex items-center gap-3">
              <Avatar name={`${u.firstName} ${u.lastName}`} initials={initials(u.firstName, u.lastName)} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium">
                  {u.firstName} {u.lastName}
                </p>
                <p className="truncate text-[12px] text-muted-foreground">{u.roles.map((r) => r.name).join(', ') || u.email}</p>
              </div>
              <StatusBadge status={u.status} />
              {actions(u)}
            </div>
          )}
          empty={{ icon: UserCog, title: search ? 'No users match' : 'No users yet', description: search ? 'Try a different search.' : 'Invite your team to get started.' }}
        />
      </Card>

      {canManage && (
        <>
          <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} roles={roles.data ?? []} />
          <RolesDialog
            user={editing}
            roles={roles.data ?? []}
            pending={update.isPending}
            onClose={() => setEditing(null)}
            onSave={(roleIds) => editing && update.mutate({ membershipId: editing.membershipId, roleIds }, { onSuccess: () => setEditing(null) })}
          />
        </>
      )}
    </div>
  );
}

function InviteDialog({ open, onOpenChange, roles }: { open: boolean; onOpenChange: (o: boolean) => void; roles: RoleRow[] }) {
  const defaults: InviteValues = { firstName: '', lastName: '', email: '', password: '', roleIds: [] };
  const form = useForm<InviteValues, unknown, InviteOutput>({ resolver: zodResolver(inviteUserSchema), defaultValues: defaults });
  const e = form.formState.errors;
  useEffect(() => {
    if (open) form.reset(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const invite = useMutation({
    mutationFn: (input: InviteOutput) => api.post<UserRow>('/users', input),
    meta: { silent: true },
    onSuccess: (_u, input) => {
      void queryClient.invalidateQueries({ queryKey: qk.users });
      void queryClient.invalidateQueries({ queryKey: qk.roles });
      toast.success(`${input.firstName} can now sign in`, { description: 'Share their email and temporary password securely.' });
      onOpenChange(false);
    },
    onError: (err) => {
      if (!applyServerErrors(err, form.setError)) toast.error(err.message);
    },
  });
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Invite a user"
      description="They'll sign in with this email and temporary password."
      icon={<UserPlus />}
      submitLabel="Create user"
      pending={invite.isPending}
      onSubmit={form.handleSubmit((v) => invite.mutate(v))}
      size="lg"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="iu-first" error={e.firstName?.message}>
          <Input id="iu-first" invalid={!!e.firstName} {...form.register('firstName')} />
        </Field>
        <Field label="Last name" htmlFor="iu-last" error={e.lastName?.message}>
          <Input id="iu-last" invalid={!!e.lastName} {...form.register('lastName')} />
        </Field>
        <Field label="Email" htmlFor="iu-email" error={e.email?.message}>
          <Input id="iu-email" type="email" autoComplete="off" invalid={!!e.email} {...form.register('email')} />
        </Field>
        <Field label="Temporary password" htmlFor="iu-pass" error={e.password?.message} hint="At least 10 characters">
          <Input id="iu-pass" type="text" autoComplete="new-password" invalid={!!e.password} {...form.register('password')} />
        </Field>
        <Field label="Roles" error={e.roleIds?.message} className="sm:col-span-2">
          <Controller
            control={form.control}
            name="roleIds"
            render={({ field }) => <RoleChecklist roles={roles} value={field.value ?? []} onChange={field.onChange} invalid={!!e.roleIds} />}
          />
        </Field>
      </div>
    </FormDialog>
  );
}

function RolesDialog({
  user,
  roles,
  pending,
  onClose,
  onSave,
}: {
  user: UserRow | null;
  roles: RoleRow[];
  pending: boolean;
  onClose: () => void;
  onSave: (roleIds: string[]) => void;
}) {
  const [value, setValue] = useState<string[]>([]);
  useEffect(() => {
    if (user) setValue(user.roles.map((r) => r.id));
  }, [user]);
  return (
    <FormDialog
      open={!!user}
      onOpenChange={(o) => !o && onClose()}
      title={`Roles for ${user?.firstName ?? ''} ${user?.lastName ?? ''}`}
      description="Permissions are the union of all selected roles."
      icon={<ShieldCheck />}
      submitLabel="Save roles"
      pending={pending}
      onSubmit={(e) => {
        e?.preventDefault();
        if (value.length === 0) {
          toast.error('Pick at least one role');
          return;
        }
        onSave(value);
      }}
    >
      <RoleChecklist roles={roles} value={value} onChange={setValue} />
    </FormDialog>
  );
}
