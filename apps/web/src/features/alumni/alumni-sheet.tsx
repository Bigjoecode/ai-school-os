import { ALUMNI_SOURCE_LABELS, type AlumniMatch, type AlumniPending, type AlumniRow } from '@aischool/shared';
import { BadgeCheck, Briefcase, Building2, GitMerge, GraduationCap, Link2, Mail, MapPin, Pencil, Phone, Send, Trash2, UserX } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ErrorState } from '@/components/ui/empty-state';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/format';
import { initials } from '@/lib/utils';
import { useAlumnus, useDeleteAlumnus, useVerifyAlumnus } from './api';

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-2.5">
      <span className="mt-0.5 text-muted-foreground [&_svg]:size-4">{icon}</span>
      <div className="min-w-0">
        <dt className="text-[12px] text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 break-words text-[13.5px]">{children}</dd>
      </div>
    </div>
  );
}

const dash = <span className="text-muted-foreground">—</span>;
const join = (...xs: (string | null)[]) => xs.filter(Boolean).join(', ') || null;

/** One old student: details, and for website sign-ups, the verify-and-match step. */
export function AlumniSheet({ id, onClose, canManage, onEdit, onMessage }: { id: string | null; onClose: () => void; canManage: boolean; onEdit: (r: AlumniRow) => void; onMessage?: (r: AlumniRow) => void }) {
  const q = useAlumnus(id);
  const d = q.data;
  const del = useDeleteAlumnus();
  const [confirm, setConfirm] = useState(false);
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent aria-describedby={undefined}>
        {q.error && !d ? (
          <>
            <SheetTitle className="sr-only">Alumni record</SheetTitle>
            <div className="p-6">
              <ErrorState error={q.error} onRetry={() => void q.refetch()} />
            </div>
          </>
        ) : !d ? (
          <>
            <SheetTitle className="sr-only">Loading</SheetTitle>
            <div className="space-y-3 p-6">
              <Skeleton className="h-16 w-full" />
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </>
        ) : (
          <>
            <SheetHeader>
              <div className="flex items-center gap-4">
                <Avatar name={d.name} initials={initials(d.firstName, d.lastName)} size="xl" />
                <div className="min-w-0">
                  <SheetTitle className="truncate font-display text-xl font-semibold tracking-tight">{d.name}</SheetTitle>
                  <SheetDescription className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                    {d.graduationYear ? `Class of ${d.graduationYear}` : 'Year not known'}
                    {d.finalClass ? ` · ${d.finalClass}` : ''}
                    {d.verified ? (
                      <Badge variant="success">
                        <BadgeCheck /> Verified
                      </Badge>
                    ) : (
                      <Badge variant="warning">Waiting for verification</Badge>
                    )}
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>
            <SheetBody className="space-y-6">
              {!d.verified && canManage && <VerifyPanel d={d} onDone={onClose} />}
              <dl className="grid gap-x-6 divide-y divide-border sm:grid-cols-2 sm:divide-y-0">
                <Row icon={<Mail />} label="Email">
                  {d.email ? (
                    <a className="text-brand hover:underline" href={`mailto:${d.email}`}>
                      {d.email}
                    </a>
                  ) : (
                    dash
                  )}
                </Row>
                <Row icon={<Phone />} label="Phone">
                  {d.phone ? (
                    <a className="text-brand hover:underline" href={`tel:${d.phone}`}>
                      {d.phone}
                    </a>
                  ) : (
                    dash
                  )}
                </Row>
                <Row icon={<GraduationCap />} label="Studying">
                  {join(d.course, d.currentInstitution) ?? dash}
                </Row>
                <Row icon={<Briefcase />} label="Work">
                  {join(d.occupation, d.employer) ?? dash}
                </Row>
                <Row icon={<MapPin />} label="Lives in">
                  {join(d.city, d.country) ?? dash}
                </Row>
                <Row icon={<Building2 />} label="Record">
                  {ALUMNI_SOURCE_LABELS[d.source]}
                  {d.student ? ` · ${d.student.admissionNumber}` : ''}
                  <span className="block text-[12px] text-muted-foreground">Added {formatDate(d.createdAt)}</span>
                </Row>
              </dl>
              <div className="flex flex-wrap gap-2">
                <Badge variant={d.consentToContact ? 'success' : 'secondary'} dot>
                  {d.consentToContact ? 'Happy to be contacted' : 'Does not want to be contacted'}
                </Badge>
              </div>
              {d.notes && (
                <div>
                  <p className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Notes</p>
                  <p className="whitespace-pre-line rounded-xl bg-muted/40 p-3 text-[13px]">{d.notes}</p>
                </div>
              )}
            </SheetBody>
            {canManage && (
              <SheetFooter className="flex-wrap">
                <Button variant="ghost" className="mr-auto text-danger hover:text-danger" onClick={() => setConfirm(true)}>
                  <Trash2 /> {d.verified ? 'Delete' : 'Turn down'}
                </Button>
                {onMessage && d.verified && d.consentToContact && (d.email || d.phone) && (
                  <Button variant="outline" onClick={() => onMessage(d)}>
                    <Send /> Message
                  </Button>
                )}
                <Button onClick={() => onEdit(d)}>
                  <Pencil /> Edit
                </Button>
              </SheetFooter>
            )}
            <ConfirmDialog
              open={confirm}
              onOpenChange={setConfirm}
              title={d.verified ? `Delete ${d.name}?` : `Turn down ${d.name}’s sign-up?`}
              description={d.verified ? 'The record is removed from the alumni directory. The student record (if any) is not affected.' : 'The sign-up is removed. They can sign up again on the website.'}
              confirmLabel={d.verified ? 'Delete' : 'Turn down'}
              loading={del.isPending}
              onConfirm={() =>
                del.mutate(d.id, {
                  onSuccess: () => {
                    toast.success(d.verified ? 'Record deleted' : 'Sign-up turned down');
                    setConfirm(false);
                    onClose();
                  },
                })
              }
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function VerifyPanel({ d, onDone }: { d: AlumniPending; onDone: () => void }) {
  const verify = useVerifyAlumnus();
  const [busy, setBusy] = useState<string | null>(null);
  const go = (key: string, m: AlumniMatch | null) => {
    setBusy(key);
    verify.mutate(
      { id: d.id, studentId: m?.studentId ?? null, intoId: m && !m.studentId ? m.profileId : null },
      {
        onSuccess: () => {
          toast.success(m ? (m.profileId ? `Merged into ${m.name}’s record` : `Verified and linked to ${m.admissionNumber}`) : `${d.name} verified`);
          onDone();
        },
        onSettled: () => setBusy(null),
      },
    );
  };
  return (
    <div className="rounded-2xl border border-warning/40 bg-warning-soft/30 p-4">
      <p className="text-[13.5px] font-semibold">Signed up on the website</p>
      <p className="mt-0.5 text-[12.5px] text-muted-foreground">
        Check this is a real old student, then verify. Linking to their student record keeps their history together.
        {d.admissionNumberGiven && (
          <>
            {' '}
            They gave admission number <span className="font-mono text-foreground">{d.admissionNumberGiven}</span>.
          </>
        )}
      </p>
      {d.matches.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {d.matches.map((m, i) => (
            <li key={m.studentId ?? m.profileId ?? i} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium">
                  {m.name} {m.admissionNumber && <span className="font-mono text-[12px] text-muted-foreground">{m.admissionNumber}</span>}
                </p>
                <p className="text-[12px] text-muted-foreground">
                  {[m.graduationYear && `Class of ${m.graduationYear}`, m.finalClass, m.reason].filter(Boolean).join(' · ')}
                </p>
              </div>
              <Button size="sm" variant={m.profileId ? 'outline' : 'default'} loading={busy === `m${i}`} disabled={!!busy} onClick={() => go(`m${i}`, m)}>
                {m.profileId ? (
                  <>
                    <GitMerge /> Merge
                  </>
                ) : (
                  <>
                    <Link2 /> Link &amp; verify
                  </>
                )}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 flex items-center gap-2 text-[12.5px] text-muted-foreground">
          <UserX className="size-4" /> No matching student or alumni record found.
        </p>
      )}
      <Button size="sm" variant="outline" className="mt-3" loading={busy === 'plain'} disabled={!!busy} onClick={() => go('plain', null)}>
        <BadgeCheck /> Verify without linking
      </Button>
    </div>
  );
}
