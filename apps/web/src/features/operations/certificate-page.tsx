import { CERTIFICATE_KIND_LABELS, type CertificateView } from '@aischool/shared';
import { Ban, FileBadge, Printer, ShieldX } from 'lucide-react';
import { type BaseSyntheticEvent, useState } from 'react';
import { useParams } from 'react-router';
import { Page } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useDocumentTitle } from '@/lib/hooks';
import { cn, initialsFromName } from '@/lib/utils';
import { schoolDateTime } from '../finance/ui';
import { BackLink, DetailSkeleton } from '../planning/ui';
import { useCertificate, useRevokeCertificate } from './api';
import { useQrDataUrl } from './ui';

const INK = '#1b2440';
const GOLD = '#a8834a';

export default function CertificatePage() {
  const { id = '' } = useParams();
  const q = useCertificate(id);
  if (q.isLoading) {
    return (
      <Page className="max-w-5xl">
        <DetailSkeleton />
      </Page>
    );
  }
  if (!q.data) {
    const missing = q.error instanceof ApiError && q.error.status === 404;
    return (
      <Page className="max-w-5xl">
        <BackLink to="/certificates">Certificates</BackLink>
        {missing ? <EmptyState icon={FileBadge} title="Certificate not found" description="The link may be wrong." /> : <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      </Page>
    );
  }
  return <CertificateDoc c={q.data} />;
}

function CertificateDoc({ c }: { c: CertificateView }) {
  useDocumentTitle(`${c.serial} · ${c.recipient.name}`);
  const [revoking, setRevoking] = useState(false);
  const verifyUrl = `${window.location.origin}${c.verifyPath}`;
  const qr = useQrDataUrl(verifyUrl, 360);
  const revoked = !!c.revokedAt;
  const paragraphs = c.body.split(/\n{2,}|\r\n\r\n/).map((p) => p.trim()).filter(Boolean);

  return (
    <Page className="max-w-5xl print:max-w-none print:p-0">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <BackLink to="/certificates">Certificates</BackLink>
        <div className="flex flex-wrap items-center gap-2">
          {!revoked && (
            <Button variant="outline" onClick={() => setRevoking(true)}>
              <Ban /> Revoke
            </Button>
          )}
          <Button onClick={() => window.print()}>
            <Printer /> Print certificate
          </Button>
        </div>
      </div>

      {revoked && (
        <div role="alert" className="mb-5 flex items-start gap-3 rounded-2xl border border-danger/30 bg-danger-soft/50 px-4 py-3 text-[13px] print:hidden">
          <ShieldX className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
          <p>
            <span className="font-semibold text-danger">Revoked {schoolDateTime(c.revokedAt)}.</span> {c.revokeReason && <>Reason: {c.revokeReason}. </>}
            Scanning the QR code now shows it as not valid.
          </p>
        </div>
      )}

      <article
        className="print-landscape print-a4 relative mx-auto w-full rounded-2xl border border-border bg-[#fffdf8] text-[#1b2440] shadow-soft sm:aspect-[297/210] print:aspect-auto print:h-[189mm] print:w-[276mm] print:rounded-none print:border-0 print:shadow-none"
        aria-label={`${c.title} for ${c.recipient.name}`}
      >
        {/* Frame */}
        <div aria-hidden className="pointer-events-none absolute inset-2.5 rounded-xl border-2 sm:inset-4" style={{ borderColor: INK }} />
        <div aria-hidden className="pointer-events-none absolute inset-4 rounded-lg border sm:inset-[22px]" style={{ borderColor: `${GOLD}99` }} />
        {revoked && (
          <div aria-hidden className="pointer-events-none absolute inset-0 z-10 grid place-items-center overflow-hidden">
            <span className="-rotate-[18deg] rounded-2xl border-[6px] border-danger/40 px-10 py-1 font-display text-[72px] font-black tracking-[0.3em] text-danger/30 sm:text-[120px]">VOID</span>
          </div>
        )}

        <div className="relative flex h-full flex-col items-center px-7 py-9 text-center sm:px-16 sm:py-12 print:px-16 print:py-11">
          <header className="flex flex-col items-center">
            {c.school.logoUrl ? (
              <img src={c.school.logoUrl} alt="" className="size-14 object-contain sm:size-16" />
            ) : (
              <span className="grid size-14 place-items-center rounded-full border-2 font-serif text-[20px] font-bold sm:size-16" style={{ borderColor: GOLD, color: INK }}>
                {initialsFromName(c.school.name)}
              </span>
            )}
            <p className="mt-2 font-serif text-[18px] font-bold uppercase tracking-[0.14em] sm:text-[22px]">{c.school.name}</p>
            {c.school.motto && <p className="font-serif text-[14px] italic sm:text-[15px]" style={{ color: GOLD }}>“{c.school.motto}”</p>}
            {c.school.address && <p className="mt-0.5 max-w-md text-[10.5px] leading-snug text-[#4b556b]">{c.school.address.replace(/\n/g, ', ')}</p>}
          </header>

          <div className="my-auto flex w-full flex-col items-center py-5">
            <div className="flex items-center gap-3" aria-hidden>
              <span className="h-px w-10 sm:w-16" style={{ background: GOLD }} />
              <span className="size-1.5 rotate-45" style={{ background: GOLD }} />
              <span className="h-px w-10 sm:w-16" style={{ background: GOLD }} />
            </div>
            <h1 className="mt-3 font-serif text-[28px] font-bold leading-tight sm:text-[40px] print:text-[38px]">{c.title}</h1>
            <p className="mt-3 text-[10.5px] font-semibold uppercase tracking-[0.3em] text-[#4b556b]">Presented to</p>
            <p className="mt-1 font-serif text-[32px] font-semibold italic leading-tight sm:text-[46px] print:text-[44px]" style={{ color: INK }}>
              {c.recipient.name}
            </p>
            {c.recipient.detail && <p className="mt-0.5 text-[12.5px] text-[#4b556b]">{c.recipient.detail}</p>}
            <div className="mt-4 max-w-[64ch] space-y-2 font-serif text-[15.5px] leading-relaxed sm:text-[17px] print:text-[14pt]">
              {paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </div>

          <footer className="grid w-full grid-cols-2 items-end gap-x-6 gap-y-5 sm:grid-cols-[1fr_1fr_auto_auto] print:grid-cols-[1fr_1fr_auto_auto] [&>*]:min-w-0">
            <Signature label="Principal" />
            <Signature label="Proprietor" />
            <div className="text-left text-[11px] leading-relaxed text-[#4b556b] sm:text-right print:text-right">
              <p>
                Issued <span className="font-semibold text-[#1b2440]">{formatDate(c.issuedOn, { day: 'numeric', month: 'long', year: 'numeric' })}</span>
              </p>
              <p className="font-mono text-[10.5px]">{c.serial}</p>
              <p>{CERTIFICATE_KIND_LABELS[c.kind]}</p>
            </div>
            <div className="flex flex-col items-end justify-self-end text-right">
              {qr ? <img src={qr} alt={`QR code to verify ${c.serial}`} className="size-[72px] bg-white p-1 sm:size-20" /> : <span aria-hidden className="size-[72px] animate-pulse rounded bg-[#eef0f5] sm:size-20" />}
            </div>
          </footer>
          <p className={cn('mt-3 max-w-full break-all text-center text-[9.5px] text-[#4b556b]')}>
            Verify this certificate at <span className="font-mono">{verifyUrl}</span>
          </p>
        </div>
      </article>

      <RevokeDialog c={c} open={revoking} onOpenChange={setRevoking} />
    </Page>
  );
}

function Signature({ label }: { label: string }) {
  return (
    <div className="min-w-0">
      <div className="h-9 border-b" style={{ borderColor: INK }} />
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4b556b]">{label}</p>
    </div>
  );
}

function RevokeDialog({ c, open, onOpenChange }: { c: CertificateView; open: boolean; onOpenChange: (o: boolean) => void }) {
  const revoke = useRevokeCertificate(c.id);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string>();
  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    if (reason.trim().length < 3) {
      setError('Give a short reason — it’s kept on the record');
      return;
    }
    setError(undefined);
    revoke.mutate(reason.trim(), {
      onSuccess: () => {
        setReason('');
        onOpenChange(false);
      },
      onError: (err) => setError(err.message),
    });
  };
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Revoke ${c.serial}?`}
      description={`${c.title} for ${c.recipient.name}. Anyone scanning its QR code will see it’s no longer valid. This can’t be undone.`}
      icon={<Ban />}
      submitLabel="Revoke certificate"
      pending={revoke.isPending}
      onSubmit={submit}
      size="sm"
    >
      <Field label="Reason" htmlFor="rv-reason" error={error}>
        <Textarea id="rv-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} invalid={!!error} placeholder="e.g. Issued with the wrong name — replaced by a new certificate" autoFocus />
      </Field>
    </FormDialog>
  );
}
