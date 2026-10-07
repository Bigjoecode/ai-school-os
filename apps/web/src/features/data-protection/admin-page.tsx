import { DPA_VERSION, DSR_KINDS, DSR_KIND_LABELS, type DsrKind, type DsrRequestRow, type DsrSubjectHit } from '@aischool/shared';
import { CheckCircle2, Download, FileJson, FileText, FolderArchive, Info, ScrollText, Search, ShieldAlert, ShieldCheck, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { formatDate, formatDateTime, formatNumber, todayIso } from '@/lib/format';
import { useDebounced, useDocumentTitle } from '@/lib/hooks';
import { LEGAL_DOCS } from '../legal/docs';
import {
  downloadConsentsCsv,
  downloadSubject,
  useAcceptDpa,
  useCloseDsr,
  useDataProtectionOverview,
  useDsrRequests,
  useLogDsr,
  useSetConsentRequired,
  useSubjectSearch,
} from './api';

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'success' | 'warning' | 'danger' }) {
  return (
    <div className="rounded-xl border border-border px-3 py-2.5">
      <p className="text-[11.5px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-0.5 font-display text-[20px] font-semibold tabular ${tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : tone === 'danger' ? 'text-danger' : ''}`}>
        {formatNumber(value)}
      </p>
    </div>
  );
}

function DpaCard() {
  const overview = useDataProtectionOverview();
  const canManage = useCan('school.manage');
  const accept = useAcceptDpa();
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [confirm, setConfirm] = useState(false);
  const dpa = overview.data?.settings.dpa ?? null;
  const current = dpa?.version === DPA_VERSION;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Data Processing Agreement
            {dpa ? <Badge variant={current ? 'success' : 'warning'}>{current ? 'Accepted' : 'Older version accepted'}</Badge> : <Badge variant="warning">Not accepted</Badge>}
          </CardTitle>
          <CardDescription>
            Your school is the data controller for its students, parents and staff; the AI School OS operator processes the data for you. The DPA sets out how.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {dpa && (
          <p className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-[13px]">
            Version <span className="font-medium">{dpa.version}</span> accepted on {formatDateTime(dpa.acceptedAt)} by <span className="font-medium">{dpa.signatoryName}</span> (
            {dpa.signatoryTitle}), signed in as {dpa.acceptedByName}.
          </p>
        )}
        <p className="text-[13px]">
          <Link to="/legal/dpa" target="_blank" className="font-medium text-brand underline underline-offset-2">
            Read the Data Processing Agreement
          </Link>{' '}
          (version {DPA_VERSION}), including its schedules: processing details, security measures, sub-processors, breach notification, help with requests, and deletion at
          the end of the contract.
        </p>
        {!current && canManage && (
          <div className="space-y-3 rounded-xl border border-border px-4 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Accepted by" htmlFor="dpa-name">
                <Input id="dpa-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
              </Field>
              <Field label="Position" htmlFor="dpa-title">
                <Input id="dpa-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Proprietor, Principal" />
              </Field>
            </div>
            <label htmlFor="dpa-confirm" className="flex cursor-pointer items-start gap-3 text-[13px]">
              <Checkbox id="dpa-confirm" checked={confirm} onCheckedChange={(v) => setConfirm(v === true)} className="mt-0.5" />
              <span>I have read the agreement and I am authorised to accept it on behalf of the school.</span>
            </label>
            {accept.error && <p role="alert" className="text-[13px] font-medium text-danger">{errorMessage(accept.error)}</p>}
            <Button
              disabled={!confirm || name.trim().length < 2 || title.trim().length < 2}
              loading={accept.isPending}
              onClick={() => accept.mutate({ version: DPA_VERSION, signatoryName: name.trim(), signatoryTitle: title.trim(), confirm: true })}
            >
              <ShieldCheck /> Accept for the school
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ConsentCard() {
  const overview = useDataProtectionOverview();
  const canManage = useCan('school.manage');
  const setRequired = useSetConsentRequired();
  const [busy, setBusy] = useState<null | 'now' | 'history'>(null);
  if (overview.error && !overview.data) return <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />;
  if (!overview.data) return <Skeleton className="h-60 rounded-2xl" />;
  const { coverage: c, settings, recentWithdrawals } = overview.data;
  const pct = c.guardians ? (c.current / c.guardians) * 100 : 0;

  const download = async (history: boolean) => {
    setBusy(history ? 'history' : 'now');
    try {
      await downloadConsentsCsv(history);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-4 text-brand" /> Parental consent
          </CardTitle>
          <CardDescription>
            Parents read a short summary of the privacy notice and agree on behalf of their children the first time they sign in to the portal. Each agreement is recorded
            with the time and the notice version.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <label className="flex items-start justify-between gap-4 rounded-xl border border-border px-4 py-3">
          <span>
            <span className="block text-[13.5px] font-semibold">Require consent before parents use the portal</span>
            <span className="block text-[12.5px] text-muted-foreground">
              On: parents see only the consent screen until they agree. Off: they can use the portal and see a reminder. Parents who are also staff are never blocked.
            </span>
          </span>
          <Switch checked={settings.consentRequired} disabled={!canManage || setRequired.isPending} onCheckedChange={(v) => setRequired.mutate(v)} aria-label="Require consent" />
        </label>

        <div>
          <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
            <span className="font-medium">Parents who agreed to the current notice</span>
            <span className="tabular text-muted-foreground">
              {formatNumber(c.current)} of {formatNumber(c.guardians)}
            </span>
          </div>
          <Progress value={pct} label="Consent coverage" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Agreed" value={c.current} tone="success" />
          <Stat label="Older notice" value={c.outdated} tone={c.outdated ? 'warning' : undefined} />
          <Stat label="Not yet" value={c.pending} />
          <Stat label="Withdrawn" value={c.withdrawn} tone={c.withdrawn ? 'danger' : undefined} />
        </div>
        <p className="text-[12.5px] text-muted-foreground">
          {formatNumber(c.withLogin)} parents have a portal login; {formatNumber(c.pendingWithLogin)} of them haven’t agreed yet and will be asked at their next sign-in.
          Parents without a login can’t agree online — record their consent on paper if the school relies on it.
        </p>

        {recentWithdrawals.length > 0 && (
          <div className="rounded-xl border border-danger/20 bg-danger-soft/40 px-4 py-3">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-danger">
              <ShieldAlert className="size-4" /> Withdrawals to follow up
            </p>
            <ul className="mt-2 space-y-1 text-[13px]">
              {recentWithdrawals.map((w) => (
                <li key={w.guardianId}>
                  <span className="font-medium">{w.name}</span> · {formatDate(w.at)}
                  {w.reason && <span className="text-muted-foreground"> — “{w.reason}”</span>}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[12.5px] text-muted-foreground">
              Nothing is deleted automatically. Contact the parent, decide what the school still needs to keep (for example results and attendance), and log any deletion
              request below.
            </p>
          </div>
        )}

        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" loading={busy === 'now'} onClick={() => void download(false)}>
              <Download /> Consent records (CSV)
            </Button>
            <Button variant="outline" size="sm" loading={busy === 'history'} onClick={() => void download(true)}>
              <ScrollText /> Full consent history (CSV)
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LogRequestDialog({ open, onOpenChange, subject }: { open: boolean; onOpenChange: (o: boolean) => void; subject: DsrSubjectHit | null }) {
  const log = useLogDsr();
  const [kind, setKind] = useState<DsrKind>('ACCESS');
  const [subjectName, setSubjectName] = useState(subject?.name ?? '');
  const [requesterName, setRequesterName] = useState('');
  const [receivedOn, setReceivedOn] = useState(todayIso());
  const [notes, setNotes] = useState('');
  const [prevSubject, setPrevSubject] = useState(subject);
  if (prevSubject !== subject) {
    setPrevSubject(subject);
    setSubjectName(subject?.name ?? '');
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log a data subject request</DialogTitle>
          <DialogDescription>Kept in the audit log, so you can show when it arrived and what you did.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <Field label="Kind of request" htmlFor="dsr-kind">
            <Select value={kind} onValueChange={(v) => setKind(v as DsrKind)}>
              <SelectTrigger id="dsr-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DSR_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {DSR_KIND_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="About" htmlFor="dsr-subject">
              <Input id="dsr-subject" value={subjectName} onChange={(e) => setSubjectName(e.target.value)} />
            </Field>
            <Field label="Requested by" htmlFor="dsr-requester">
              <Input id="dsr-requester" value={requesterName} onChange={(e) => setRequesterName(e.target.value)} placeholder="e.g. the child’s mother" />
            </Field>
          </div>
          <Field label="Received on" htmlFor="dsr-date">
            <Input id="dsr-date" type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} />
          </Field>
          <Field label="Notes" htmlFor="dsr-notes" optional hint="How identity was checked, what exactly was asked.">
            <Textarea id="dsr-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          {kind === 'DELETION' && (
            <p className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-[12.5px] text-warning">
              Deletion is handled by people, not automatically. See the guidance below before removing anything.
            </p>
          )}
          {log.error && <p role="alert" className="text-[13px] font-medium text-danger">{errorMessage(log.error)}</p>}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            loading={log.isPending}
            disabled={subjectName.trim().length < 2 || requesterName.trim().length < 2}
            onClick={() =>
              log.mutate(
                { kind, subjectType: subject?.type ?? null, subjectId: subject?.id ?? null, subjectName: subjectName.trim(), requesterName: requesterName.trim(), receivedOn, notes: notes.trim() || null },
                {
                  onSuccess: () => {
                    onOpenChange(false);
                    setRequesterName('');
                    setNotes('');
                  },
                },
              )
            }
          >
            Log request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CloseRequestDialog({ request, onClose }: { request: DsrRequestRow | null; onClose: () => void }) {
  const close = useCloseDsr();
  const [outcome, setOutcome] = useState('');
  return (
    <Dialog open={!!request} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Close request</DialogTitle>
          <DialogDescription>{request ? `${DSR_KIND_LABELS[request.kind]} — ${request.subjectName}` : ''}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Field label="What was done" htmlFor="dsr-outcome" hint="e.g. “Sent the export by email on 12 Oct”, “Corrected date of birth”, “Deleted AI conversations; kept results (legal requirement)”.">
            <Textarea id="dsr-outcome" rows={3} value={outcome} onChange={(e) => setOutcome(e.target.value)} />
          </Field>
          {close.error && <p role="alert" className="mt-3 text-[13px] font-medium text-danger">{errorMessage(close.error)}</p>}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={close.isPending}
            disabled={outcome.trim().length < 2 || !request}
            onClick={() => request && close.mutate({ id: request.id, outcome: outcome.trim() }, { onSuccess: () => { setOutcome(''); onClose(); } })}
          >
            Close request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RequestsCard() {
  const [q, setQ] = useState('');
  const debounced = useDebounced(q, 300);
  const hits = useSubjectSearch(debounced);
  const requests = useDsrRequests();
  const [logFor, setLogFor] = useState<DsrSubjectHit | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [closing, setClosing] = useState<DsrRequestRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const exportOne = async (h: DsrSubjectHit, format: 'json' | 'zip') => {
    setBusy(`${h.id}-${format}`);
    try {
      await downloadSubject(h.type, h.id, format);
      toast.success(`Exported ${h.name}’s data`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <Search className="size-4 text-brand" /> Data subject requests
          </CardTitle>
          <CardDescription>
            When a parent, student or member of staff asks to see, correct or delete their information: find them, export everything the school holds about them, and log
            the request and what you did. Check the person’s identity first.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <Input className="min-w-0 flex-1" placeholder="Search a student, parent or staff member by name, admission number, phone or email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" />
          <Button
            variant="outline"
            onClick={() => {
              setLogFor(null);
              setLogOpen(true);
            }}
          >
            Log a request
          </Button>
        </div>

        {debounced.trim().length >= 2 && (
          <div className="overflow-hidden rounded-xl border border-border">
            {hits.isLoading ? (
              <Skeleton className="h-16" />
            ) : !hits.data?.length ? (
              <p className="px-4 py-3 text-[13px] text-muted-foreground">No one matches “{debounced}”.</p>
            ) : (
              <ul className="divide-y divide-border">
                {hits.data.map((h) => (
                  <li key={`${h.type}-${h.id}`} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-medium">
                        {h.name} <Badge variant="outline">{h.type === 'guardian' ? 'parent' : h.type}</Badge>
                      </p>
                      <p className="truncate text-[12px] text-muted-foreground">{h.detail}</p>
                    </div>
                    <Button size="sm" variant="outline" loading={busy === `${h.id}-json`} onClick={() => void exportOne(h, 'json')}>
                      <FileJson /> JSON
                    </Button>
                    <Button size="sm" variant="outline" loading={busy === `${h.id}-zip`} onClick={() => void exportOne(h, 'zip')}>
                      <FolderArchive /> CSV (ZIP)
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setLogFor(h);
                        setLogOpen(true);
                      }}
                    >
                      Log request
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex gap-2.5 rounded-xl border border-border bg-muted/30 px-4 py-3 text-[12.5px] text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="space-y-1.5">
            <p>
              <span className="font-semibold text-foreground">Access / portability:</span> export JSON or CSV and send it to the person securely (not to anyone else). A
              child’s data goes to their parent or guardian. Every export is in the audit log.
            </p>
            <p>
              <span className="font-semibold text-foreground">Correction:</span> fix the record in the usual screen (Students, Parents, Staff), then close the request.
            </p>
            <p>
              <span className="font-semibold text-foreground">Deletion:</span> log it, then decide with your data protection lead what can go. Records the school must keep
              — for example results, transcripts, fee and payroll records — usually stay; optional data such as AI tutor conversations, photos or contact details for
              optional services can usually be removed. Change or remove what you can in the app; for anything you can’t, contact the AI School OS operator’s Data
              Protection Officer with the request reference. Record the outcome when you close the request.
            </p>
            <p>
              <span className="font-semibold text-foreground">Timing:</span> answer without undue delay and within the time the law allows. [PLACEHOLDER: response
              deadline to confirm with counsel.]
            </p>
          </div>
        </div>

        <div>
          <p className="mb-2 text-[13px] font-semibold">Logged requests</p>
          {requests.error && !requests.data ? (
            <ErrorState error={requests.error} onRetry={() => void requests.refetch()} />
          ) : !requests.data ? (
            <Skeleton className="h-16 rounded-xl" />
          ) : requests.data.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No requests logged yet.</p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
              {requests.data.map((r) => (
                <li key={r.id} className="flex flex-wrap items-start gap-3 px-4 py-3 text-[13px]">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {DSR_KIND_LABELS[r.kind]} — {r.subjectName}
                    </p>
                    <p className="text-[12px] text-muted-foreground">
                      From {r.requesterName} · received {formatDate(r.receivedOn)} · logged by {r.loggedBy ?? 'unknown'}
                      {r.notes && ` · ${r.notes}`}
                    </p>
                    {r.closedAt && (
                      <p className="mt-0.5 text-[12px] text-success">
                        Closed {formatDate(r.closedAt)}
                        {r.closedBy && ` by ${r.closedBy}`}: {r.outcome}
                      </p>
                    )}
                  </div>
                  {r.closedAt ? (
                    <Badge variant="success">
                      <CheckCircle2 /> Closed
                    </Badge>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setClosing(r)}>
                      Close
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
      <LogRequestDialog open={logOpen} onOpenChange={setLogOpen} subject={logFor} />
      <CloseRequestDialog request={closing} onClose={() => setClosing(null)} />
    </Card>
  );
}

/** Settings → Data protection (school admin): DPA, parental consent, documents and data subject requests. */
export default function DataProtectionPage() {
  useDocumentTitle('Data protection');
  const canManage = useCan('school.manage');
  return (
    <div className="max-w-4xl space-y-6">
      <p className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-[12.5px] text-warning">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        The privacy notice, terms and Data Processing Agreement are drafts awaiting legal review. Use these tools now; the wording may change, and parents will be asked to
        agree again if it does.
      </p>
      <DpaCard />
      <ConsentCard />
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Documents</CardTitle>
            <CardDescription>Public pages you can link from your website and share with parents and staff.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 sm:grid-cols-2">
            {LEGAL_DOCS.map((d) => (
              <li key={d.slug}>
                <Link to={`/legal/${d.slug}`} target="_blank" className="flex h-full items-start gap-2 rounded-lg border border-border px-3 py-2 hover:border-border-strong">
                  <FileText className="mt-0.5 size-4 shrink-0 text-brand" />
                  <span>
                    <span className="block text-[13px] font-medium">{d.title}</span>
                    <span className="block text-[12px] text-muted-foreground">{d.description}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      {canManage && <RequestsCard />}
    </div>
  );
}
