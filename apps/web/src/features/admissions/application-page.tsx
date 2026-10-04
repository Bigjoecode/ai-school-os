import { ADMISSION_SOURCE_LABELS, type AdmissionDetail, type AdmissionEvent } from '@aischool/shared';
import {
  Award,
  CalendarClock,
  CheckCircle2,
  CircleSlash,
  ClipboardCheck,
  ExternalLink,
  FileText,
  GraduationCap,
  Hourglass,
  LogOut,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Phone,
  Printer,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  Wallet,
} from 'lucide-react';
import { type ReactNode, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { Page } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ApiError } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { formatRelative } from '@/lib/format';
import { useDocumentTitle } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { money, schoolDate, schoolDateTime } from '../finance/ui';
import { telHref } from '../operations/ui';
import { BackLink, DetailSkeleton } from '../planning/ui';
import { type ActionKind, DecisionDialog, FeeDialog, OfferDialog, ScheduleDialog, ScoreDialog, WithdrawDialog } from './action-dialogs';
import { openDocument, uploadPrivate, useAdmissionsMeta, useApplication, useApplicationAction, useRemoveDocument } from './api';
import { EnrolDialog } from './enrol-dialog';
import { AdmissionStatusBadge, ageOf, shortWhen } from './ui';

export default function ApplicationPage() {
  const { id = '' } = useParams();
  const q = useApplication(id);
  if (q.isLoading) {
    return (
      <Page className="max-w-6xl">
        <DetailSkeleton />
      </Page>
    );
  }
  if (!q.data) {
    const missing = q.error instanceof ApiError && q.error.status === 404;
    return (
      <Page className="max-w-6xl">
        <BackLink to="/admissions">Admissions</BackLink>
        {missing ? <EmptyState icon={Search} title="Application not found" description="It may have been removed, or the link is wrong." /> : <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      </Page>
    );
  }
  return <Application a={q.data} />;
}

type Open = ActionKind | 'enrol' | null;

function Application({ a }: { a: AdmissionDetail }) {
  useDocumentTitle(`${a.number} · ${a.childName}`);
  const canManage = useCan('admissions.manage');
  const meta = useAdmissionsMeta();
  const action = useApplicationAction(a.id);
  const [open, setOpen] = useState<Open>(null);
  const [confirm, setConfirm] = useState<'REVIEWING' | 'ACCEPTED' | null>(null);
  const can = (s: AdmissionDetail['next'][number]) => a.next.includes(s);
  const offered = ['OFFERED', 'ACCEPTED', 'ENROLLED'].includes(a.status) && !!a.offerExpiresOn;
  const currency = meta.data?.currency ?? 'NGN';
  const age = ageOf(a.dateOfBirth);

  const quickMove = (status: 'REVIEWING' | 'ACCEPTED') =>
    action.mutate(
      { kind: 'move', body: { status, note: null } },
      {
        onSuccess: () => {
          toast.success(status === 'ACCEPTED' ? 'Offer accepted' : a.status === 'SUBMITTED' ? 'Review started' : 'Application reopened');
          setConfirm(null);
        },
        onError: (err) => toast.error(err.message),
      },
    );

  // The one or two things most likely to happen next.
  const primary: ReactNode[] = [];
  if (canManage) {
    if (a.status === 'SUBMITTED') primary.push(<Button key="rev" variant="outline" onClick={() => quickMove('REVIEWING')} loading={action.isPending}>Start review</Button>);
    if (can('EXAM_SCHEDULED') && ['SUBMITTED', 'REVIEWING', 'WAITLISTED'].includes(a.status))
      primary.push(<Button key="sch" variant={a.status === 'SUBMITTED' ? 'outline' : 'default'} onClick={() => setOpen('schedule')}><CalendarClock /> Book exam</Button>);
    if (a.status === 'EXAM_SCHEDULED') primary.push(<Button key="score" variant="outline" onClick={() => setOpen('score')}><ClipboardCheck /> Record score</Button>);
    if (can('OFFERED') && a.status !== 'OFFERED' && a.status !== 'SUBMITTED') primary.push(<Button key="offer" onClick={() => setOpen('offer')}><Award /> Offer a place</Button>);
    if (a.status === 'OFFERED') primary.push(<Button key="acc" variant="outline" onClick={() => setConfirm('ACCEPTED')}><CheckCircle2 /> Mark accepted</Button>);
    if (a.canEnrol && ['OFFERED', 'ACCEPTED'].includes(a.status)) primary.push(<Button key="enrol" onClick={() => setOpen('enrol')}><GraduationCap /> Enrol</Button>);
    if (a.status === 'REJECTED' || a.status === 'WITHDRAWN') primary.push(<Button key="reopen" variant="outline" onClick={() => setConfirm('REVIEWING')}><RotateCcw /> Reopen</Button>);
  }

  return (
    <Page className="max-w-6xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <BackLink to="/admissions">Admissions</BackLink>
          <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight sm:text-[28px]">{a.childName}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
            <span className="font-mono tabular">{a.number}</span>
            <AdmissionStatusBadge status={a.status} />
            <span>{a.classLevel?.name ?? 'Class not chosen'}</span>
            {a.entryTerm && <span>· {a.entryTerm}</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {primary}
          {offered && (
            <Button variant="outline" asChild>
              <Link to={`/admissions/${a.id}/offer-letter`}>
                <Printer /> Offer letter
              </Link>
            </Button>
          )}
          {canManage && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {a.status !== 'ENROLLED' && (
                  <DropdownMenuItem asChild>
                    <Link to={`/admissions/${a.id}/edit`}>
                      <Pencil /> Edit details
                    </Link>
                  </DropdownMenuItem>
                )}
                {(can('EXAM_SCHEDULED') || can('INTERVIEW')) && (
                  <DropdownMenuItem onSelect={() => setOpen('schedule')}>
                    <CalendarClock /> {a.examAt || a.interviewAt ? 'Rebook exam or interview' : 'Book exam or interview'}
                  </DropdownMenuItem>
                )}
                {!['ENROLLED', 'WITHDRAWN', 'REJECTED'].includes(a.status) && (
                  <DropdownMenuItem onSelect={() => setOpen('score')}>
                    <ClipboardCheck /> Record exam score
                  </DropdownMenuItem>
                )}
                {can('OFFERED') && (
                  <DropdownMenuItem onSelect={() => setOpen('offer')}>
                    <Award /> {a.status === 'OFFERED' ? 'Update offer' : 'Offer a place'}
                  </DropdownMenuItem>
                )}
                {a.canEnrol && !['OFFERED', 'ACCEPTED'].includes(a.status) && (
                  <DropdownMenuItem onSelect={() => setOpen('enrol')}>
                    <GraduationCap /> Enrol now
                  </DropdownMenuItem>
                )}
                {a.applicationFeeKobo && !a.feePaidAt ? (
                  <DropdownMenuItem onSelect={() => setOpen('fee')}>
                    <Wallet /> Record application fee
                  </DropdownMenuItem>
                ) : null}
                {(can('WAITLISTED') || can('REJECTED') || can('WITHDRAWN')) && <DropdownMenuSeparator />}
                {can('WAITLISTED') && (
                  <DropdownMenuItem onSelect={() => setOpen('waitlist')}>
                    <Hourglass /> Waiting list
                  </DropdownMenuItem>
                )}
                {can('REJECTED') && (
                  <DropdownMenuItem onSelect={() => setOpen('reject')}>
                    <CircleSlash /> Don’t offer a place
                  </DropdownMenuItem>
                )}
                {can('WITHDRAWN') && (
                  <DropdownMenuItem onSelect={() => setOpen('withdraw')}>
                    <LogOut /> Withdraw
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {a.student && (
        <Card className="mt-5 flex flex-col gap-3 border-success/30 bg-success-soft/30 p-4 shadow-none sm:flex-row sm:items-center">
          <GraduationCap className="size-5 shrink-0 text-success" aria-hidden />
          <p className="flex-1 text-[13.5px]">
            Enrolled as <span className="font-medium">{a.student.name}</span> in {a.student.classArm ?? 'a class'} · admission no. <span className="font-mono font-medium">{a.student.admissionNumber}</span>
          </p>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/students?q=${encodeURIComponent(a.student.admissionNumber)}`}>Open student</Link>
          </Button>
        </Card>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] [&>*]:min-w-0">
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-[15px]">Application</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-3 text-[13px] sm:grid-cols-2">
                <Item label="Child">
                  {a.childName} · {a.gender === 'FEMALE' ? 'Girl' : 'Boy'}
                </Item>
                <Item label="Date of birth">{a.dateOfBirth ? `${schoolDate(a.dateOfBirth)}${age != null ? ` (${age})` : ''}` : '—'}</Item>
                <Item label="Class applied for">{a.classLevel?.name ?? '—'}</Item>
                <Item label="Starting">{a.entryTerm ?? '—'}</Item>
                <Item label="Previous school">{a.previousSchool ?? '—'}</Item>
                <Item label="Source">{ADMISSION_SOURCE_LABELS[a.source]}</Item>
                <Item label="Parent">
                  {a.parentName}
                  {a.relationship && <span className="text-muted-foreground"> · {a.relationship}</span>}
                </Item>
                <Item label="Contact">
                  <span className="flex flex-col gap-0.5">
                    <a href={telHref(a.parentPhone)} className="inline-flex items-center gap-1.5 font-medium text-brand hover:underline">
                      <Phone className="size-3.5" aria-hidden /> {a.parentPhone}
                    </a>
                    {a.parentEmail && (
                      <a href={`mailto:${a.parentEmail}`} className="inline-flex min-w-0 items-center gap-1.5 text-brand hover:underline">
                        <Mail className="size-3.5 shrink-0" aria-hidden /> <span className="truncate">{a.parentEmail}</span>
                      </a>
                    )}
                  </span>
                </Item>
                {a.address && <Item label="Address" wide>{a.address}</Item>}
                {a.medicalNotes && <Item label="Medical notes" wide>{a.medicalNotes}</Item>}
                {a.notes && (
                  <Item label="Notes" wide>
                    <span className="whitespace-pre-line">{a.notes}</span>
                  </Item>
                )}
              </dl>
            </CardContent>
          </Card>

          <Documents a={a} canManage={canManage} checklist={meta.data?.settings.documentChecklist ?? []} />

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-[15px]">History</CardTitle>
            </CardHeader>
            <CardContent>
              <Timeline events={a.timeline} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-[15px]">Assessment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-[13px]">
              <Row label="Entrance exam" value={a.examAt ? shortWhen(a.examAt) : 'Not booked'} />
              {a.examVenue && <Row label="Venue" value={a.examVenue} />}
              <Row label="Score" value={a.examScore != null ? String(a.examScore) : '—'} />
              <Row label="Interview" value={a.interviewAt ? shortWhen(a.interviewAt) : 'Not booked'} />
            </CardContent>
          </Card>

          {(a.offerExpiresOn || a.decisionNote) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-[15px]">Decision</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-[13px]">
                {a.offerExpiresOn && <Row label="Accept by" value={schoolDate(a.offerExpiresOn)} />}
                {a.decisionNote && <p className="whitespace-pre-line rounded-xl bg-muted/50 px-3 py-2 text-[12.5px]">{a.decisionNote}</p>}
              </CardContent>
            </Card>
          )}

          {(a.applicationFeeKobo ?? 0) > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-[15px]">Application fee</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-[13px]">
                <Row label="Amount" value={money(a.applicationFeeKobo!, currency)} />
                {a.feePaidAt ? (
                  <>
                    <Row label="Paid" value={schoolDate(a.feePaidAt)} />
                    <Row label="Reference" value={a.feeReference ?? '—'} />
                  </>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="warning">Not paid yet</Badge>
                    {canManage && (
                      <Button size="sm" variant="outline" onClick={() => setOpen('fee')}>
                        <Wallet /> Record payment
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="space-y-1 p-4 text-[12px] text-muted-foreground">
              <p>Received {schoolDateTime(a.createdAt)}{a.createdBy ? ` by ${a.createdBy}` : ''}</p>
              {a.enquiryId && (
                <p>
                  Converted from a{' '}
                  <Link to="/reception?tab=enquiries" className="text-brand hover:underline">
                    reception enquiry
                  </Link>
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {canManage && (
        <>
          <ScheduleDialog a={a} open={open === 'schedule'} onOpenChange={(o) => !o && setOpen(null)} />
          <ScoreDialog a={a} open={open === 'score'} onOpenChange={(o) => !o && setOpen(null)} />
          <OfferDialog a={a} open={open === 'offer'} onOpenChange={(o) => !o && setOpen(null)} />
          <DecisionDialog a={a} outcome="WAITLISTED" open={open === 'waitlist'} onOpenChange={(o) => !o && setOpen(null)} />
          <DecisionDialog a={a} outcome="REJECTED" open={open === 'reject'} onOpenChange={(o) => !o && setOpen(null)} />
          <WithdrawDialog a={a} open={open === 'withdraw'} onOpenChange={(o) => !o && setOpen(null)} />
          <FeeDialog a={a} open={open === 'fee'} onOpenChange={(o) => !o && setOpen(null)} />
          <EnrolDialog a={a} open={open === 'enrol'} onOpenChange={(o) => !o && setOpen(null)} />
          <ConfirmDialog
            open={!!confirm}
            onOpenChange={(o) => !o && setConfirm(null)}
            destructive={false}
            title={confirm === 'ACCEPTED' ? 'Mark the offer as accepted?' : 'Reopen this application?'}
            description={confirm === 'ACCEPTED' ? `${a.parentName} has accepted the place for ${a.childFirstName}. You can then enrol them.` : 'It goes back to Reviewing so you can book an exam or make an offer.'}
            confirmLabel={confirm === 'ACCEPTED' ? 'Mark accepted' : 'Reopen'}
            loading={action.isPending}
            onConfirm={() => confirm && quickMove(confirm)}
          />
        </>
      )}
    </Page>
  );
}

function Item({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn('min-w-0', wide && 'sm:col-span-2')}>
      <dt className="text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words">{children}</dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium tabular">{value}</span>
    </div>
  );
}

// ------------------------------------------------------------------ documents

function Documents({ a, canManage, checklist }: { a: AdmissionDetail; canManage: boolean; checklist: string[] }) {
  const action = useApplicationAction(a.id);
  const remove = useRemoveDocument(a.id);
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<string>(checklist.find((c) => !a.documents.some((d) => d.kind === c)) ?? 'Other');
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const kinds = [...new Set([...checklist, 'Other'])];

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const f = await uploadPrivate(file);
      await action.mutateAsync({ kind: 'documents', body: { fileId: f.id, name: f.filename || file.name, kind } });
      toast.success(`${kind} attached`);
      const nextMissing = checklist.find((c) => c !== kind && !a.documents.some((d) => d.kind === c));
      if (nextMissing) setKind(nextMissing);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-[15px]">
          Documents <span className="text-[12px] font-normal text-muted-foreground tabular">{a.documents.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {checklist.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Checklist">
            {checklist.map((c) => {
              const have = a.documents.some((d) => d.kind === c);
              return (
                <li key={c}>
                  <Badge variant={have ? 'success' : 'outline'}>
                    {have ? <CheckCircle2 /> : <span className="size-1.5 rounded-full bg-border-strong" aria-hidden />} {c}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
        {a.documents.length > 0 ? (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {a.documents.map((d) => (
              <li key={d.fileId} className="flex items-center gap-3 px-3 py-2.5">
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{d.kind}</p>
                  <p className="truncate text-[12px] text-muted-foreground">{d.name}</p>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => void openDocument(a.id, d.fileId)} aria-label={`Open ${d.name}`}>
                  <ExternalLink />
                </Button>
                {canManage && (
                  <Button variant="ghost" size="icon-sm" onClick={() => setRemoving(d.fileId)} aria-label={`Remove ${d.name}`}>
                    <Trash2 />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Paperclip className="size-4" aria-hidden /> No documents yet.
          </p>
        )}
        {canManage && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={kind || NONE} onValueChange={(v) => v && setKind(v === NONE ? 'Other' : v)}>
              <SelectTrigger aria-label="Document type" className="sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {kinds.map((k) => (
                  <SelectItem key={k} value={k}>
                    {k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input ref={input} type="file" accept="image/*,application/pdf,.docx" className="sr-only" tabIndex={-1} onChange={(e) => void upload(e.target.files?.[0])} aria-hidden />
            <Button variant="outline" onClick={() => input.current?.click()} loading={uploading}>
              {!uploading && <Upload />} Upload {kind.toLowerCase()}
            </Button>
          </div>
        )}
      </CardContent>
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove this document?"
        description="It is taken off the application."
        confirmLabel="Remove"
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing, { onSettled: () => setRemoving(null) })}
      />
    </Card>
  );
}

// ------------------------------------------------------------------ timeline

function Timeline({ events }: { events: AdmissionEvent[] }) {
  if (!events.length) return <p className="text-[13px] text-muted-foreground">Nothing recorded yet.</p>;
  return (
    <ol className="relative space-y-4 border-l border-border pl-5">
      {[...events].reverse().map((e) => (
        <li key={e.id} className="relative">
          <span className={cn('absolute -left-[25px] top-1 grid size-[9px] place-items-center rounded-full ring-4 ring-card', e.notification ? 'bg-info' : e.action.endsWith('enrolled') ? 'bg-success' : 'bg-border-strong')} aria-hidden />
          <p className="text-[13px]">
            {e.notification && <MessageSquare className="mr-1.5 inline size-3.5 text-info" aria-hidden />}
            {e.summary}
          </p>
          <p className="text-[11.5px] text-muted-foreground">
            {formatRelative(e.at)} · {schoolDateTime(e.at)}
            {e.actor && ` · ${e.actor}`}
          </p>
          {e.notification && <Delivery n={e.notification} />}
        </li>
      ))}
    </ol>
  );
}

function Delivery({ n }: { n: NonNullable<AdmissionEvent['notification']> }) {
  const parts = [n.sent && `${n.sent} sent`, n.queued && `${n.queued} sending`, n.failed && `${n.failed} failed`, n.skipped && `${n.skipped} not sent`].filter(Boolean);
  return (
    <p className={cn('mt-0.5 text-[11.5px]', n.failed || n.skipped ? 'text-warning' : 'text-muted-foreground')}>
      {parts.join(' · ') || 'Queued'}
      {n.problem && ` — ${n.problem}`}
    </p>
  );
}
