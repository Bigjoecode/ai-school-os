import { CERTIFICATE_KIND_LABELS, CERTIFICATE_KINDS, type CertificateKind, type CertificateRow, certificateSchema } from '@aischool/shared';
import { Award, FileBadge, Settings2, Sparkles } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { type Column, DataTable } from '@/components/ui/data-table';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { useCan } from '@/lib/auth-store';
import { useDebounced } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { schoolDate, schoolToday } from '../finance/ui';
import { useCertificates, useDraftCertificate, useIssueCertificate } from './api';
import { OperationsSettingsSheet } from './settings-sheet';
import { apiFieldErrors, dateInput, FormError, PersonPicker, type PickedPerson, zodErrors } from './ui';

export default function CertificatesPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<CertificateKind | undefined>();
  const q = useDebounced(search.trim(), 300);
  const list = useCertificates({ kind, q: q || undefined });
  const [issueOpen, setIssueOpen] = useState(params.get('new') === '1');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const newFlag = params.get('new') === '1';
  useEffect(() => {
    if (newFlag) setIssueOpen(true);
  }, [newFlag]);

  const columns: Column<CertificateRow>[] = [
    { key: 'serial', header: 'Serial', cell: (c) => <span className="whitespace-nowrap font-mono text-[12.5px]">{c.serial}</span> },
    {
      key: 'recipient',
      header: 'Recipient',
      cell: (c) => (
        <div className="min-w-0 max-w-[240px]">
          <p className="truncate font-medium">{c.recipient.name}</p>
          <p className="truncate text-[12px] text-muted-foreground">
            {c.recipient.kind === 'STAFF' ? 'Staff' : 'Student'}
            {c.recipient.detail && ` · ${c.recipient.detail}`}
          </p>
        </div>
      ),
    },
    {
      key: 'title',
      header: 'Certificate',
      cell: (c) => (
        <div className="min-w-0 max-w-[300px]">
          <p className={cn('truncate text-[13.5px]', c.revokedAt && 'text-muted-foreground line-through')}>{c.title}</p>
          <p className="truncate text-[12px] text-muted-foreground">{CERTIFICATE_KIND_LABELS[c.kind]}</p>
        </div>
      ),
    },
    { key: 'issued', header: 'Issued', cell: (c) => <span className="whitespace-nowrap text-[13px] tabular">{schoolDate(c.issuedOn)}</span>, headClassName: 'hidden lg:table-cell', className: 'hidden lg:table-cell' },
    { key: 'by', header: 'By', cell: (c) => <span className="block max-w-[160px] truncate text-[13px] text-muted-foreground">{c.issuedBy ?? '—'}</span>, headClassName: 'hidden xl:table-cell', className: 'hidden xl:table-cell' },
    {
      key: 'status',
      header: 'Status',
      cell: (c) =>
        c.revokedAt ? (
          <Badge variant="danger">Revoked</Badge>
        ) : (
          <Badge variant="success" dot>
            Valid
          </Badge>
        ),
    },
  ];

  return (
    <Page>
      <PageHeader
        title="Certificates"
        description="Testimonials, transfer letters and awards — numbered, printable and verifiable by QR code."
        actions={
          <>
            <Button variant="outline" size="icon" aria-label="Certificate settings" onClick={() => setSettingsOpen(true)}>
              <Settings2 />
            </Button>
            <Button onClick={() => setIssueOpen(true)}>
              <FileBadge /> Issue certificate
            </Button>
          </>
        }
      />
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:px-5">
          <SearchInput value={search} onChange={setSearch} placeholder="Name or serial…" className="sm:max-w-xs sm:flex-1" />
          <Select value={kind ?? NONE} onValueChange={(v) => setKind(v === NONE ? undefined : (v as CertificateKind))}>
            <SelectTrigger aria-label="Kind" className="sm:w-60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>All kinds</SelectItem>
              {CERTIFICATE_KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {CERTIFICATE_KIND_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DataTable
          columns={columns}
          rows={list.data}
          rowKey={(c) => c.id}
          loading={list.isLoading || list.isPlaceholderData}
          error={list.error}
          onRetry={() => void list.refetch()}
          onRowClick={(c) => navigate(`/certificates/${c.id}`)}
          rowLabel={(c) => `Open ${c.serial} for ${c.recipient.name}`}
          renderMobile={(c) => (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{c.recipient.name}</p>
                <p className={cn('truncate text-[12.5px] text-muted-foreground', c.revokedAt && 'line-through')}>{c.title}</p>
                <p className="font-mono text-[11.5px] text-muted-foreground">
                  {c.serial} · {schoolDate(c.issuedOn)}
                </p>
              </div>
              {c.revokedAt && <Badge variant="danger">Revoked</Badge>}
            </div>
          )}
          empty={{
            icon: Award,
            title: q || kind ? 'No certificates match' : 'No certificates issued yet',
            description: q || kind ? 'Try a different name, serial or kind.' : 'Issue a testimonial, transfer certificate or award — AI can draft the wording from the record.',
            action: !q && !kind && (
              <Button onClick={() => setIssueOpen(true)}>
                <FileBadge /> Issue the first one
              </Button>
            ),
          }}
        />
      </Card>
      <IssueCertificateSheet
        open={issueOpen}
        onOpenChange={(o) => {
          setIssueOpen(o);
          if (!o && params.get('new')) {
            const p = new URLSearchParams(params);
            p.delete('new');
            setParams(p, { replace: true });
          }
        }}
        onIssued={(id) => navigate(`/certificates/${id}`)}
      />
      <OperationsSettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} section="documents" />
    </Page>
  );
}

// ------------------------------------------------------------------ issue

function IssueCertificateSheet({ open, onOpenChange, onIssued }: { open: boolean; onOpenChange: (o: boolean) => void; onIssued: (id: string) => void }) {
  const canAi = useCan('ai.use');
  const issue = useIssueCertificate();
  const draft = useDraftCertificate();
  const [kind, setKind] = useState<CertificateKind>('TESTIMONIAL');
  const [who, setWho] = useState<'STUDENT' | 'STAFF'>('STUDENT');
  const [recipient, setRecipient] = useState<PickedPerson | null>(null);
  const [title, setTitle] = useState(CERTIFICATE_KIND_LABELS.TESTIMONIAL);
  const [body, setBody] = useState('');
  const [issuedOn, setIssuedOn] = useState(schoolToday());
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [drafted, setDrafted] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setKind('TESTIMONIAL');
    setWho('STUDENT');
    setRecipient(null);
    setTitle(CERTIFICATE_KIND_LABELS.TESTIMONIAL);
    setBody('');
    setIssuedOn(schoolToday());
    setNotes('');
    setErrors({});
    setDrafted(null);
  }, [open]);

  const changeKind = (k: CertificateKind) => {
    if (!title.trim() || title === CERTIFICATE_KIND_LABELS[kind]) setTitle(CERTIFICATE_KIND_LABELS[k]);
    if (k === 'SERVICE' && who === 'STUDENT') {
      setWho('STAFF');
      setRecipient(null);
    }
    setKind(k);
  };

  const ref = () => (recipient ? (who === 'STUDENT' ? { studentId: recipient.id } : { staffId: recipient.id }) : {});

  const runDraft = () => {
    if (!recipient) {
      setErrors({ studentId: 'Choose who it’s for first' });
      return;
    }
    setErrors({});
    draft.mutate(
      { kind, ...ref(), notes: notes.trim() || undefined },
      {
        onSuccess: (d) => {
          setTitle(d.title);
          setBody(d.body);
          setDrafted(`${d.provider} · ${d.model}`);
        },
      },
    );
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = certificateSchema.safeParse({ kind, ...ref(), title, body, issuedOn });
    if (!parsed.success) {
      const errs = zodErrors(parsed.error.issues);
      if (errs.studentId) errs.studentId = 'Choose who it’s for';
      if (errs.title) errs.title = 'Give it a title';
      if (errs.body) errs.body = 'Write the certificate text (at least a sentence)';
      setErrors(errs);
      return;
    }
    setErrors({});
    issue.mutate(parsed.data, {
      onSuccess: (c) => {
        onOpenChange(false);
        onIssued(c.id);
      },
      onError: (err) => setErrors(apiFieldErrors(err)),
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="font-display text-lg font-semibold tracking-tight">Issue a certificate</SheetTitle>
          <SheetDescription className="text-[13px] text-muted-foreground">It gets the next serial number and a QR code anyone can scan to check it’s genuine.</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <form id="cert-form" onSubmit={submit} noValidate className="grid gap-5">
            <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
              <Field label="Kind" htmlFor="ct-kind">
                <Select value={kind} onValueChange={(k) => changeKind(k as CertificateKind)}>
                  <SelectTrigger id="ct-kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CERTIFICATE_KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {CERTIFICATE_KIND_LABELS[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Date of issue" htmlFor="ct-date" error={errors.issuedOn}>
                <Input id="ct-date" type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} className={dateInput} invalid={!!errors.issuedOn} />
              </Field>
            </div>
            <Field label="Awarded to" htmlFor="ct-who" error={errors.studentId}>
              <PersonPicker id="ct-who" kind={who} onKind={setWho} value={recipient} onChange={setRecipient} invalid={!!errors.studentId} />
            </Field>

            {canAi && (
              <div className="ai-border relative overflow-hidden rounded-xl border border-transparent p-3.5">
                <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                  <Field label="Notes for the AI" htmlFor="ct-notes" optional>
                    <Input id="ct-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={600} placeholder="e.g. Head girl 2025/26, won the state debate" />
                  </Field>
                  <Button type="button" variant="ai" onClick={runDraft} loading={draft.isPending}>
                    {!draft.isPending && <Sparkles />} {body ? 'Draft again' : 'Draft with AI'}
                  </Button>
                </div>
                <p className="mt-2 text-[11.5px] text-muted-foreground">
                  {drafted ? `Drafted by ${drafted} from the record — read it through before issuing.` : 'Uses their class, attendance and report-card remarks (or service record for staff). Nothing is invented.'}
                </p>
              </div>
            )}

            <Field label="Title" htmlFor="ct-title" error={errors.title}>
              <Input id="ct-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} invalid={!!errors.title} />
            </Field>
            <Field label="Certificate text" htmlFor="ct-body" error={errors.body} hint={!errors.body ? `${body.trim().split(/\s+/).filter(Boolean).length} words` : undefined}>
              <Textarea id="ct-body" rows={9} value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} invalid={!!errors.body} placeholder="This is to certify that…" className={cn(draft.isPending && 'opacity-60')} />
            </Field>
            <FormError message={errors.form} />
          </form>
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="cert-form" loading={issue.isPending}>
            <FileBadge /> Issue certificate
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
