import { type DepartmentRow, type EmployeeRow, departmentSchema } from '@aischool/shared';
import { Building2, MoreHorizontal, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { type BaseSyntheticEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { type Column, DataTable, Pagination } from '@/components/ui/data-table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { formatNumber } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import { initialsFromName } from '@/lib/utils';
import { plural } from '../finance/ui';
import { type StaffAction, StaffActionDialogs, StaffActionsMenu } from '../staff/staff-actions';
import { useDeleteDepartment, useDepartments, useEmployees, useSaveDepartment } from './api';
import { EmployeeStatusBadge, STAFF_TYPE_LABEL, StaffSelect, yearsLabel } from './ui';

const PAGE_SIZE = 25;
type Tab = 'directory' | 'departments';

export default function EmployeesPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'departments' ? 'departments' : 'directory';
  const patch = (next: Record<string, string | undefined>) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(next)) {
          if (v) p.set(k, v);
          else p.delete(k);
        }
        return p;
      },
      { replace: true },
    );

  return (
    <Page>
      <PageHeader title="Employees" description="Everyone on staff — their department, service, leave and pay details in one place." />
      <Tabs value={tab} onValueChange={(t) => patch({ tab: t === 'directory' ? undefined : t })}>
        <TabsList aria-label="Employee sections">
          <TabsTrigger value="directory">
            <Users /> Directory
          </TabsTrigger>
          <TabsTrigger value="departments">
            <Building2 /> Departments
          </TabsTrigger>
        </TabsList>
        <TabsContent value="directory">
          <Directory params={params} patch={patch} />
        </TabsContent>
        <TabsContent value="departments">
          <Departments />
        </TabsContent>
      </Tabs>
    </Page>
  );
}

// ------------------------------------------------------------------ directory

function Directory({ params, patch }: { params: URLSearchParams; patch: (n: Record<string, string | undefined>) => void }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const q = useDebounced(search.trim(), 300);
  const departmentId = params.get('department') ?? undefined;
  const rawStatus = params.get('status');
  const status = rawStatus === 'ACTIVE' || rawStatus === 'ON_LEAVE' || rawStatus === 'EXITED' ? rawStatus : undefined;
  const rawType = params.get('type');
  const type = rawType === 'TEACHING' || rawType === 'NON_TEACHING' ? rawType : undefined;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const departments = useDepartments();
  const canManageStaff = useCan('staff.manage');
  const [action, setAction] = useState<StaffAction>(null);
  const menu = (e: EmployeeRow) => <StaffActionsMenu staff={e} onAction={(kind) => setAction({ kind, staff: e, open: true })} />;

  useEffect(() => {
    if ((params.get('q') ?? '') !== q) patch({ q: q || undefined, page: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const list = useEmployees({ q: q || undefined, departmentId, status, type, page, pageSize: PAGE_SIZE });
  const filtered = !!(q || departmentId || status || type);

  const columns: Column<EmployeeRow>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (e) => (
        <div className="flex items-center gap-3">
          <Avatar name={e.name} initials={initialsFromName(e.name)} />
          <div className="min-w-0">
            <p className="truncate font-medium">{e.name}</p>
            <p className="font-mono text-[12px] text-muted-foreground">{e.staffNumber}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'job',
      header: 'Job title',
      cell: (e) => (
        <div className="min-w-0">
          <p className="truncate">{e.jobTitle}</p>
          <p className="text-[12px] text-muted-foreground">{STAFF_TYPE_LABEL[e.type]}</p>
        </div>
      ),
    },
    { key: 'dept', header: 'Department', cell: (e) => (e.department ? e.department.name : <span className="text-muted-foreground">—</span>) },
    { key: 'service', header: 'Service', cell: (e) => <span className="whitespace-nowrap text-[13px] text-muted-foreground">{yearsLabel(e.yearsOfService)}</span> },
    {
      key: 'status',
      header: 'Status',
      cell: (e) => (
        <div className="flex flex-wrap gap-1.5">
          <EmployeeStatusBadge status={e.status} onLeaveUntil={e.onLeaveUntil} />
          {e.hasPayProfile === false && e.status !== 'EXITED' && <Badge variant="warning">No pay details</Badge>}
        </div>
      ),
    },
    ...(canManageStaff ? [{ key: 'actions', header: <span className="sr-only">Actions</span>, className: 'w-12 text-right', cell: menu }] : []),
  ];

  return (
    <Card className="overflow-hidden">
      <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_200px_160px_160px] [&>*]:min-w-0">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by name, number or job title…" className="sm:col-span-2 lg:col-span-1" />
        <Select value={departmentId ?? NONE} onValueChange={(v) => patch({ department: v === NONE ? undefined : v, page: undefined })}>
          <SelectTrigger aria-label="Department">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>All departments</SelectItem>
            {(departments.data ?? []).map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
            <SelectItem value="none">No department</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status ?? NONE} onValueChange={(v) => patch({ status: v === NONE ? undefined : v, page: undefined })}>
          <SelectTrigger aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Current staff</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="ON_LEAVE">On leave</SelectItem>
            <SelectItem value="EXITED">Left the school</SelectItem>
          </SelectContent>
        </Select>
        <Select value={type ?? NONE} onValueChange={(v) => patch({ type: v === NONE ? undefined : v, page: undefined })}>
          <SelectTrigger aria-label="Staff type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>All types</SelectItem>
            <SelectItem value="TEACHING">Teaching</SelectItem>
            <SelectItem value="NON_TEACHING">Non-teaching</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DataTable
        columns={columns}
        rows={list.data?.items}
        rowKey={(e) => e.id}
        loading={list.isLoading || list.isPlaceholderData}
        error={list.error}
        onRetry={() => void list.refetch()}
        onRowClick={(e) => navigate(`/hr/employees/${e.id}`)}
        rowLabel={(e) => `Open ${e.name}`}
        renderMobile={(e) => (
          <div className="flex items-center gap-3">
            <Avatar name={e.name} initials={initialsFromName(e.name)} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium">{e.name}</p>
              <p className="truncate text-[12.5px] text-muted-foreground">
                {e.jobTitle}
                {e.department && ` · ${e.department.name}`}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <EmployeeStatusBadge status={e.status} onLeaveUntil={e.onLeaveUntil} />
                {e.hasPayProfile === false && e.status !== 'EXITED' && <Badge variant="warning">No pay details</Badge>}
              </div>
            </div>
          </div>
        )}
        mobileActions={canManageStaff ? menu : undefined}
        empty={{
          icon: Users,
          title: filtered ? 'Nobody matches' : 'No staff yet',
          description: filtered ? 'Try a different search or clear the filters.' : (
            <>
              Add staff on <Link to="/staff" className="font-medium text-brand hover:underline">Teachers &amp; Staff</Link>, then manage their HR records here.
            </>
          ),
          action: filtered ? (
            <Button
              variant="outline"
              onClick={() => {
                setSearch('');
                patch({ q: undefined, department: undefined, status: undefined, type: undefined, page: undefined });
              }}
            >
              Clear filters
            </Button>
          ) : undefined,
        }}
      />
      {list.data && list.data.total > 0 && (
        <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPageChange={(p) => patch({ page: p > 1 ? String(p) : undefined })} noun="staff" />
      )}
      {canManageStaff && <StaffActionDialogs action={action} onActionChange={setAction} />}
    </Card>
  );
}

// ------------------------------------------------------------------ departments

function Departments() {
  const canManage = useCan('hr.manage');
  const q = useDepartments();
  const del = useDeleteDepartment();
  const [editing, setEditing] = useState<DepartmentRow | 'new' | null>(null);
  const [deleting, setDeleting] = useState<DepartmentRow | null>(null);

  if (q.error && !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-muted-foreground">{q.data ? `${plural(q.data.length, 'department')} · ${formatNumber(q.data.reduce((n, d) => n + d.headcount, 0))} staff assigned` : ' '}</p>
        {canManage && (
          <Button onClick={() => setEditing('new')}>
            <Plus /> Add department
          </Button>
        )}
      </div>
      {!q.data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0" aria-busy>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[136px] rounded-2xl" />
          ))}
        </div>
      ) : q.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={Building2}
            title="No departments yet"
            description="Group staff into departments — Sciences, Languages, Administration — to see headcount and leave overlaps."
            action={
              canManage ? (
                <Button onClick={() => setEditing('new')}>
                  <Plus /> Add department
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
          {q.data.map((d) => (
            <Card key={d.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link to={`/hr/employees?department=${d.id}`} className="font-display text-[15px] font-semibold tracking-tight hover:underline">
                    {d.name}
                  </Link>
                  {d.description && <p className="mt-0.5 line-clamp-2 text-[12.5px] text-muted-foreground">{d.description}</p>}
                </div>
                {canManage && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${d.name}`}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setEditing(d)}>
                        <Pencil /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem destructive onSelect={() => setDeleting(d)}>
                        <Trash2 /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              <div className="mt-auto flex items-end justify-between gap-3 pt-4">
                <div className="min-w-0 text-[12.5px]">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Head</p>
                  {d.head ? (
                    <Link to={`/hr/employees/${d.head.id}`} className="block truncate font-medium hover:underline">
                      {d.head.name}
                    </Link>
                  ) : (
                    <p className="text-muted-foreground">Not set</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="font-display text-[24px] font-semibold leading-none tabular">{d.headcount}</p>
                  <p className="text-[11px] text-muted-foreground">staff</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {editing && <DepartmentDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} department={editing === 'new' ? null : editing} />}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name ?? 'department'}?`}
        description={deleting?.headcount ? `${plural(deleting.headcount, 'staff member')} will have no department. Nobody is removed from staff.` : 'Nobody is removed from staff.'}
        confirmLabel="Delete department"
        loading={del.isPending}
        onConfirm={() => deleting && del.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
      />
    </div>
  );
}

function DepartmentDialog({ open, onOpenChange, department }: { open: boolean; onOpenChange: (o: boolean) => void; department: DepartmentRow | null }) {
  const save = useSaveDepartment(department?.id);
  const [name, setName] = useState(department?.name ?? '');
  const [description, setDescription] = useState(department?.description ?? '');
  const [headStaffId, setHead] = useState<string | null>(department?.head?.id ?? null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    const parsed = departmentSchema.safeParse({ name, description, headStaffId });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.path[0] === 'name' ? 'Give the department a name (at least 2 letters)' : i.message])));
      return;
    }
    setErrors({});
    save.mutate(parsed.data, {
      onSuccess: () => onOpenChange(false),
      onError: (err) => {
        if (err instanceof ApiError && err.errors.length) setErrors(Object.fromEntries(err.errors.map((x) => [x.path, x.message])));
        else toast.error(err.message);
      },
    });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={department ? `Edit ${department.name}` : 'Add a department'}
      icon={<Building2 />}
      submitLabel={department ? 'Save changes' : 'Add department'}
      pending={save.isPending}
      onSubmit={submit}
    >
      <div className="grid gap-4">
        <Field label="Name" htmlFor="dp-name" error={errors.name}>
          <Input id="dp-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Sciences" invalid={!!errors.name} autoFocus />
        </Field>
        <Field label="Description" htmlFor="dp-desc" optional>
          <Textarea id="dp-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
        </Field>
        <Field label="Head of department" htmlFor="dp-head" optional hint="They’re moved into this department if they aren’t already.">
          <StaffSelect id="dp-head" value={headStaffId} onChange={setHead} allowNone noneLabel="No head yet" />
        </Field>
      </div>
    </FormDialog>
  );
}
