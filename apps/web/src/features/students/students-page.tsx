import { STUDENT_STATUSES, type StudentRow } from '@aischool/shared';
import { GraduationCap, Plus, Users } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { type Column, DataTable, Pagination } from '@/components/ui/data-table';
import { SearchInput } from '@/components/ui/search-input';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';
import { useCan } from '@/lib/auth-store';
import { formatNumber } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import { cn, fullName, initials, titleCase } from '@/lib/utils';
import { armOptions, useStructure } from '../academics/api';
import { AdmitStudentDialog } from './admit-student-dialog';
import { useStudents } from './api';
import { StudentSheet } from './student-sheet';

const PAGE_SIZE = 20;

function classLabel(s: StudentRow) {
  return s.classArm ? `${s.classArm.classLevel.name} ${s.classArm.name}` : null;
}

export default function StudentsPage() {
  const [params, setParams] = useSearchParams();
  const canManage = useCan('students.manage');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [classArmId, setClassArmId] = useState<string | undefined>();
  const [status, setStatus] = useState<string | undefined>();
  const [selected, setSelected] = useState<string | null>(null);
  const q = useDebounced(search.trim(), 300);

  const structure = useStructure();
  const arms = armOptions(structure.data);
  const list = useStudents({ q: q || undefined, page, pageSize: PAGE_SIZE, classArmId, status });

  const admitOpen = params.get('new') === '1';
  const setAdmitOpen = (open: boolean) => {
    const next = new URLSearchParams(params);
    if (open) next.set('new', '1');
    else next.delete('new');
    setParams(next, { replace: true });
  };

  const columns: Column<StudentRow>[] = [
    {
      key: 'name',
      header: 'Student',
      cell: (s) => (
        <div className="flex items-center gap-3">
          <Avatar name={fullName(s)} initials={initials(s.firstName, s.lastName)} size="md" />
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{fullName(s)}</p>
            <p className="font-mono text-[12px] text-muted-foreground">{s.admissionNumber}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'class',
      header: 'Class',
      cell: (s) => classLabel(s) ?? <span className="text-muted-foreground">Unassigned</span>,
    },
    { key: 'gender', header: 'Gender', cell: (s) => <span className="text-muted-foreground">{titleCase(s.gender)}</span> },
    {
      key: 'guardians',
      header: 'Guardians',
      cell: (s) => (
        <span className={cn('inline-flex items-center gap-1.5 tabular', s.guardians.length === 0 ? 'text-warning' : 'text-muted-foreground')}>
          <Users className="size-3.5" /> {s.guardians.length}
        </span>
      ),
    },
    { key: 'status', header: 'Status', cell: (s) => <StatusBadge status={s.status} /> },
  ];

  const resetPage = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  const filtered = !!(q || classArmId || status);

  return (
    <Page>
      <PageHeader
        title="Students"
        description={
          list.data ? `${formatNumber(list.data.total)} student${list.data.total === 1 ? '' : 's'}${filtered ? ' match your filters' : ' on roll'}` : 'Every learner in your school.'
        }
        actions={
          canManage && (
            <Button onClick={() => setAdmitOpen(true)}>
              <Plus /> Admit student
            </Button>
          )
        }
      />
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <SearchInput
            value={search}
            onChange={resetPage(setSearch)}
            placeholder="Search by name or admission no…"
            className="sm:max-w-sm sm:flex-1"
          />
          <div className="grid grid-cols-2 gap-3 sm:ml-auto sm:flex">
            {structure.data && (
              <Select value={classArmId ?? NONE} onValueChange={resetPage((v: string) => setClassArmId(v === NONE ? undefined : v))}>
                <SelectTrigger className="sm:w-44" aria-label="Filter by class">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>All classes</SelectItem>
                  {arms.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={status ?? NONE} onValueChange={resetPage((v: string) => setStatus(v === NONE ? undefined : v))}>
              <SelectTrigger className="sm:w-40" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>All statuses</SelectItem>
                {STUDENT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {titleCase(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DataTable
          columns={columns}
          rows={list.data?.items}
          rowKey={(s) => s.id}
          loading={list.isFetching}
          error={list.error}
          onRetry={() => void list.refetch()}
          onRowClick={(s) => setSelected(s.id)}
          rowLabel={(s) => `Open ${fullName(s)}`}
          renderMobile={(s) => (
            <div className="flex items-center gap-3">
              <Avatar name={fullName(s)} initials={initials(s.firstName, s.lastName)} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium">{fullName(s)}</p>
                <p className="truncate text-[12px] text-muted-foreground">
                  <span className="font-mono">{s.admissionNumber}</span> · {classLabel(s) ?? 'Unassigned'}
                </p>
              </div>
              <StatusBadge status={s.status} />
            </div>
          )}
          empty={{
            icon: GraduationCap,
            title: filtered ? 'No students match' : 'No students yet',
            description: filtered ? 'Try a different search or clear the filters.' : 'Admit your first student to start building your school roll.',
            action:
              !filtered && canManage ? (
                <Button onClick={() => setAdmitOpen(true)}>
                  <Plus /> Admit student
                </Button>
              ) : undefined,
          }}
        />
        {list.data && list.data.total > 0 && (
          <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPageChange={setPage} noun="students" />
        )}
      </Card>

      {canManage && <AdmitStudentDialog open={admitOpen} onOpenChange={setAdmitOpen} />}
      <StudentSheet id={selected} onClose={() => setSelected(null)} />
    </Page>
  );
}
