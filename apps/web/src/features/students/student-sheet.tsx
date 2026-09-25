import { Cake, CalendarDays, Hash, HeartPulse, MapPin, Pencil, Phone, School, Users } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/empty-state';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { useCan } from '@/lib/auth-store';
import { formatDate } from '@/lib/format';
import { applyServerErrors } from '@/lib/forms';
import { fullName, initials, titleCase } from '@/lib/utils';
import { StudentAttendanceSummary } from '../attendance/student-summary';
import { type StudentDetail, useStudent, useUpdateStudent } from './api';
import { StudentFields, studentDefaults, useStudentForm } from './student-form';

function age(dob: string | null): string | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - d.getUTCFullYear();
  const m = now.getMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getUTCDate())) a--;
  return `${a} yrs`;
}

function Detail({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-2.5">
      <span className="mt-0.5 text-muted-foreground [&_svg]:size-4">{icon}</span>
      <div className="min-w-0">
        <dt className="text-[12px] text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 break-words text-[13.5px] text-foreground">{children}</dd>
      </div>
    </div>
  );
}

export function StudentSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, isLoading, error, refetch } = useStudent(id);
  const [editing, setEditing] = useState(false);
  const canManage = useCan('students.manage');
  const canAttendance = useCan('attendance.read');

  useEffect(() => {
    setEditing(false);
  }, [id]);

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent aria-describedby={undefined}>
        {error && !data ? (
          <>
            <SheetTitle className="sr-only">Student</SheetTitle>
            <div className="p-6">
              <ErrorState error={error} onRetry={() => void refetch()} />
            </div>
          </>
        ) : isLoading || !data ? (
          <>
            <SheetTitle className="sr-only">Loading student</SheetTitle>
            <div className="space-y-4 p-6">
              <div className="flex items-center gap-4">
                <Skeleton className="size-16 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-1/2" />
                  <Skeleton className="h-4 w-1/3" />
                </div>
              </div>
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </>
        ) : editing ? (
          <EditStudent student={data} onDone={() => setEditing(false)} />
        ) : (
          <>
            <SheetHeader className="relative overflow-hidden">
              <div aria-hidden className="absolute -right-10 -top-16 size-48 rounded-full bg-brand/10 blur-3xl" />
              <div className="relative flex items-center gap-4">
                <Avatar name={fullName(data)} initials={initials(data.firstName, data.lastName)} size="xl" />
                <div className="min-w-0">
                  <SheetTitle className="truncate font-display text-xl font-semibold tracking-tight">{fullName(data)}</SheetTitle>
                  <SheetDescription className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                    <span className="font-mono">{data.admissionNumber}</span>
                    <StatusBadge status={data.status} />
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>
            <SheetBody>
              <dl className="grid gap-x-6 divide-y divide-border sm:grid-cols-2 sm:divide-y-0">
                <Detail icon={<School />} label="Class">
                  {data.classArm ? `${data.classArm.classLevel.name} ${data.classArm.name}` : 'Not assigned'}
                </Detail>
                <Detail icon={<Hash />} label="Gender">
                  {titleCase(data.gender)}
                </Detail>
                <Detail icon={<Cake />} label="Date of birth">
                  {formatDate(data.dateOfBirth)}
                  {age(data.dateOfBirth) && <span className="text-muted-foreground"> · {age(data.dateOfBirth)}</span>}
                </Detail>
                <Detail icon={<CalendarDays />} label="Admitted">
                  {formatDate(data.admittedOn)}
                </Detail>
                <Detail icon={<MapPin />} label="Address">
                  {data.address || <span className="text-muted-foreground">—</span>}
                </Detail>
                <Detail icon={<HeartPulse />} label="Medical notes">
                  {data.medicalNotes || <span className="text-muted-foreground">None recorded</span>}
                </Detail>
              </dl>

              <div className="mt-6">
                <h3 className="mb-3 flex items-center gap-2 text-[13px] font-semibold">
                  <Users className="size-4 text-muted-foreground" /> Parents & guardians
                  <span className="text-muted-foreground">({data.guardians.length})</span>
                </h3>
                {data.guardians.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-warning/40 bg-warning-soft/50 p-4 text-[13px] text-warning">
                    No guardian on record. Add one from the Parents page so the school can reach this family.
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {data.guardians.map((g) => (
                      <li key={g.id} className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3">
                        <Avatar name={`${g.firstName} ${g.lastName}`} initials={initials(g.firstName, g.lastName)} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13.5px] font-medium">
                            {g.firstName} {g.lastName}
                          </p>
                          <p className="text-[12px] text-muted-foreground">{titleCase(g.relationship)}</p>
                        </div>
                        <a
                          href={`tel:${g.phone}`}
                          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12.5px] font-medium text-brand hover:bg-brand-soft"
                        >
                          <Phone className="size-3.5" /> {g.phone}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {canAttendance && <StudentAttendanceSummary studentId={data.id} onNavigate={onClose} />}
            </SheetBody>
            {canManage && (
              <SheetFooter>
                <Button onClick={() => setEditing(true)}>
                  <Pencil /> Edit student
                </Button>
              </SheetFooter>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function EditStudent({ student, onDone }: { student: StudentDetail; onDone: () => void }) {
  const form = useStudentForm(studentDefaults(student));
  const update = useUpdateStudent(student.id);
  const onSubmit = form.handleSubmit((values) =>
    update.mutate(values, {
      onSuccess: () => {
        toast.success('Student updated');
        onDone();
      },
      onError: (err) => {
        if (!applyServerErrors(err, form.setError)) toast.error(err.message);
      },
    }),
  );
  return (
    <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle className="font-display text-lg font-semibold tracking-tight">Edit {student.firstName}</SheetTitle>
        <SheetDescription className="text-[13px] text-muted-foreground">Update the student's record.</SheetDescription>
      </SheetHeader>
      <SheetBody>
        <StudentFields form={form} showStatus />
      </SheetBody>
      <SheetFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={update.isPending}>
          Save changes
        </Button>
      </SheetFooter>
    </form>
  );
}
