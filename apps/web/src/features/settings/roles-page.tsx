import { PERMISSION_GROUPS, roleSchema, type RoleRow } from '@aischool/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Lock, Pencil, Plus, ShieldCheck, Trash2, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tip } from '@/components/ui/tooltip';
import { api } from '@/lib/api';
import { applyServerErrors } from '@/lib/forms';
import { qk, queryClient } from '@/lib/query-client';
import { cn } from '@/lib/utils';
import { useRoles } from './api';
import { SectionHeader } from './settings-layout';

type RoleValues = z.input<typeof roleSchema>;
type RoleOutput = z.output<typeof roleSchema>;
const TOTAL = PERMISSION_GROUPS.reduce((n, g) => n + Object.keys(g.permissions).length, 0);

export default function RolesPage() {
  const [params, setParams] = useSearchParams();
  const roles = useRoles();
  const [editing, setEditing] = useState<RoleRow | null>(null);
  const [toDelete, setToDelete] = useState<RoleRow | null>(null);
  const creating = params.get('new') === '1';
  const setCreating = (open: boolean) => {
    const next = new URLSearchParams(params);
    if (open) next.set('new', '1');
    else next.delete('new');
    setParams(next, { replace: true });
  };

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/roles/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.roles });
      toast.success('Role deleted');
      setToDelete(null);
    },
  });

  const sorted = roles.data ? [...roles.data].sort((a, b) => Number(b.isSystem) - Number(a.isSystem) || a.name.localeCompare(b.name)) : [];

  return (
    <div>
      <SectionHeader
        title="Roles & permissions"
        description="Roles are named sets of permissions. Adjust the defaults or create your own."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> Create role
          </Button>
        }
      />
      {roles.error && !roles.data ? (
        <ErrorState error={roles.error} onRetry={() => void roles.refetch()} />
      ) : roles.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <Card>
          <EmptyState icon={ShieldCheck} title="No roles yet" />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sorted.map((r, i) => {
            const pct = (r.permissions.length / TOTAL) * 100;
            return (
              <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}>
                <Card className="group flex h-full flex-col p-5 transition-shadow hover:shadow-lift">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className={cn('grid size-10 place-items-center rounded-xl', r.isSystem ? 'bg-brand-soft text-brand' : 'bg-muted text-foreground')}>
                        <ShieldCheck className="size-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{r.name}</p>
                        <p className="flex items-center gap-1 text-[12px] text-muted-foreground">
                          <Users className="size-3" /> {r.memberCount} member{r.memberCount === 1 ? '' : 's'}
                        </p>
                      </div>
                    </div>
                    {r.isSystem && (
                      <Badge variant="outline">
                        <Lock /> System
                      </Badge>
                    )}
                  </div>
                  <p className="mt-3 line-clamp-2 flex-1 text-[13px] text-muted-foreground">{r.description || 'No description.'}</p>
                  <div className="mt-4">
                    <div className="mb-1.5 flex justify-between text-[12px] text-muted-foreground">
                      <span>Permissions</span>
                      <span className="tabular">
                        {r.permissions.length}/{TOTAL}
                      </span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-1.5 border-t border-border pt-3">
                    <Button variant="outline" size="sm" onClick={() => setEditing(r)}>
                      <Pencil /> Edit
                    </Button>
                    <Tip label={r.isSystem ? 'System roles can’t be deleted' : 'Delete role'}>
                      <span className="ml-auto">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={r.isSystem}
                          onClick={() => setToDelete(r)}
                          aria-label={`Delete ${r.name}`}
                          className="text-muted-foreground hover:text-danger"
                        >
                          <Trash2 />
                        </Button>
                      </span>
                    </Tip>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      <RoleEditor open={creating || !!editing} role={editing} onClose={() => (editing ? setEditing(null) : setCreating(false))} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Delete the ${toDelete?.name ?? ''} role?`}
        description={
          toDelete?.memberCount
            ? `${toDelete.memberCount} user(s) have this role and will lose its permissions.`
            : 'No one currently has this role.'
        }
        confirmLabel="Delete role"
        loading={del.isPending}
        onConfirm={() => toDelete && del.mutate(toDelete.id)}
      />
    </div>
  );
}

function RoleEditor({ open, role, onClose }: { open: boolean; role: RoleRow | null; onClose: () => void }) {
  const form = useForm<RoleValues, unknown, RoleOutput>({ resolver: zodResolver(roleSchema) });
  const e = form.formState.errors;

  useEffect(() => {
    if (open) form.reset({ name: role?.name ?? '', description: role?.description ?? '', permissions: role?.permissions ?? [] });
  }, [open, role, form]);

  const save = useMutation({
    mutationFn: (input: RoleOutput) => (role ? api.patch<RoleRow>(`/roles/${role.id}`, input) : api.post<RoleRow>('/roles', input)),
    meta: { silent: true },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.roles });
      void queryClient.invalidateQueries({ queryKey: qk.users });
      toast.success(role ? 'Role updated' : 'Role created');
      onClose();
    },
    onError: (err) => {
      if (!applyServerErrors(err, form.setError)) toast.error(err.message);
    },
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={role ? `Edit ${role.name}` : 'Create a role'}
      description={role?.isSystem ? 'This is a system role — you can adjust its permissions but not delete it.' : 'Choose exactly what people with this role can see and do.'}
      icon={<ShieldCheck />}
      submitLabel={role ? 'Save role' : 'Create role'}
      pending={save.isPending}
      onSubmit={form.handleSubmit((v) => save.mutate(v))}
      size="xl"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Role name" htmlFor="r-name" error={e.name?.message}>
          <Input id="r-name" placeholder="e.g. Head of Department" invalid={!!e.name} {...form.register('name')} />
        </Field>
        <Field label="Description" htmlFor="r-desc" optional error={e.description?.message}>
          <Input id="r-desc" {...form.register('description')} />
        </Field>
      </div>
      <Controller
        control={form.control}
        name="permissions"
        render={({ field }) => {
          const value = new Set(field.value ?? []);
          const set = (next: Set<string>) => field.onChange([...next]);
          return (
            <div className="mt-6">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[13px] font-semibold">
                  Permissions <span className="font-normal text-muted-foreground">· {value.size} selected</span>
                </p>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="sm" onClick={() => set(new Set(PERMISSION_GROUPS.flatMap((g) => Object.keys(g.permissions))))}>
                    Select all
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => set(new Set())}>
                    Clear
                  </Button>
                </div>
              </div>
              {e.permissions?.message && <p className="mb-2 text-[12px] font-medium text-danger">{e.permissions.message}</p>}
              <div className="grid gap-3 md:grid-cols-2">
                {PERMISSION_GROUPS.map((g) => {
                  const keys = Object.keys(g.permissions);
                  const on = keys.filter((k) => value.has(k)).length;
                  const state = on === 0 ? false : on === keys.length ? true : 'indeterminate';
                  return (
                    <div key={g.module} className={cn('rounded-xl border p-3.5 transition-colors', on > 0 ? 'border-brand/30 bg-brand-soft/30' : 'border-border')}>
                      <label className="flex cursor-pointer items-center gap-2.5">
                        <Checkbox
                          checked={state}
                          onCheckedChange={() => {
                            const next = new Set(value);
                            if (state === true) keys.forEach((k) => next.delete(k));
                            else keys.forEach((k) => next.add(k));
                            set(next);
                          }}
                          aria-label={`All ${g.label} permissions`}
                        />
                        <span className="text-[13.5px] font-semibold">{g.label}</span>
                        <span className="ml-auto text-[11.5px] text-muted-foreground tabular">
                          {on}/{keys.length}
                        </span>
                      </label>
                      <div className="mt-2.5 space-y-2 border-t border-border/70 pt-2.5">
                        {Object.entries(g.permissions).map(([key, label]) => (
                          <label key={key} className="flex cursor-pointer items-start gap-2.5 pl-0.5">
                            <Checkbox
                              checked={value.has(key)}
                              onCheckedChange={(c) => {
                                const next = new Set(value);
                                if (c) next.add(key);
                                else next.delete(key);
                                set(next);
                              }}
                              className="mt-0.5"
                            />
                            <span className="min-w-0">
                              <span className="block text-[13px]">{label as string}</span>
                              <span className="block font-mono text-[11px] text-muted-foreground">{key}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }}
      />
    </FormDialog>
  );
}
