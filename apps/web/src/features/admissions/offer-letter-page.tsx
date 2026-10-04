import type { OfferLetter } from '@aischool/shared';
import { FileText, Printer } from 'lucide-react';
import { useParams } from 'react-router';
import { Page } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { ApiError } from '@/lib/api';
import { useDocumentTitle } from '@/lib/hooks';
import { initialsFromName } from '@/lib/utils';
import { money } from '../finance/ui';
import { BackLink, DetailSkeleton } from '../planning/ui';
import { useOfferLetter } from './api';

const INK = '#1b2440';

/** "2026-10-20" → "20 October 2026". */
const longDate = (iso: string | null) => (iso ? new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${iso}T00:00:00Z`)) : '');

export default function OfferLetterPage() {
  const { id = '' } = useParams();
  const q = useOfferLetter(id);
  if (q.isLoading) {
    return (
      <Page className="max-w-4xl">
        <DetailSkeleton />
      </Page>
    );
  }
  if (!q.data) {
    const bad = q.error instanceof ApiError && (q.error.status === 404 || q.error.status === 400);
    return (
      <Page className="max-w-4xl">
        <BackLink to={`/admissions/${id}`}>Application</BackLink>
        {bad ? <EmptyState icon={FileText} title="No offer letter yet" description={q.error?.message} /> : <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      </Page>
    );
  }
  return <Letter id={id} l={q.data} />;
}

function Letter({ id, l }: { id: string; l: OfferLetter }) {
  useDocumentTitle(`Offer letter · ${l.childName}`);
  const first = l.childName.split(' ')[0];
  const colour = /^#[0-9a-f]{6}$/i.test(l.school.primaryColor ?? '') ? l.school.primaryColor! : INK;
  const paragraphs = (l.note ?? '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return (
    <Page className="max-w-4xl print:max-w-none print:p-0">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <BackLink to={`/admissions/${id}`}>{l.number}</BackLink>
        <Button onClick={() => window.print()}>
          <Printer /> Print letter
        </Button>
      </div>

      <article className="print-a4 mx-auto w-full overflow-hidden rounded-2xl border border-border bg-white text-[#1b2440] shadow-soft print:rounded-none print:border-0 print:shadow-none" aria-label={`Offer of admission for ${l.childName}`}>
        <div aria-hidden className="h-2 w-full" style={{ background: colour }} />
        <div className="px-6 py-7 sm:px-12 sm:py-10 print:px-14 print:py-10">
          <header className="flex flex-col items-center gap-2 border-b pb-5 text-center sm:flex-row sm:items-center sm:gap-5 sm:text-left print:flex-row print:text-left" style={{ borderColor: `${colour}55` }}>
            {l.school.logoUrl ? (
              <img src={l.school.logoUrl} alt="" className="size-16 shrink-0 object-contain" />
            ) : (
              <span className="grid size-16 shrink-0 place-items-center rounded-full border-2 font-serif text-[20px] font-bold" style={{ borderColor: colour, color: colour }}>
                {initialsFromName(l.school.name)}
              </span>
            )}
            <div className="min-w-0">
              <p className="font-serif text-[20px] font-bold uppercase leading-tight tracking-[0.08em] sm:text-[24px]" style={{ color: colour }}>
                {l.school.name}
              </p>
              {l.school.motto && <p className="font-serif text-[13px] italic text-[#4b556b]">“{l.school.motto}”</p>}
              <p className="mt-1 text-[11.5px] leading-snug text-[#4b556b]">{[l.school.address?.replace(/\n/g, ', '), l.school.phone, l.school.email].filter(Boolean).join(' · ')}</p>
            </div>
          </header>

          <div className="mt-6 flex flex-col justify-between gap-1 text-[13px] sm:flex-row print:flex-row">
            <div>
              <p className="font-medium">{l.parentName}</p>
              {l.address && <p className="max-w-xs whitespace-pre-line text-[#4b556b]">{l.address}</p>}
            </div>
            <div className="text-[#4b556b] sm:text-right print:text-right">
              <p>{longDate(l.offeredOn)}</p>
              <p>
                Ref: <span className="font-mono">{l.number}</span>
              </p>
            </div>
          </div>

          <h1 className="mt-7 font-serif text-[20px] font-bold uppercase tracking-wide underline underline-offset-4">Offer of admission</h1>

          <div className="mt-4 space-y-3.5 font-serif text-[15px] leading-relaxed print:text-[12pt]">
            <p>Dear {l.parentName},</p>
            <p>
              We are delighted to inform you that, following the admissions process, <strong>{l.childName}</strong>
              {l.dateOfBirth ? ` (born ${longDate(l.dateOfBirth)})` : ''} has been offered a place at {l.school.name}
              {l.classLevel ? (
                <>
                  {' '}
                  in <strong>{l.classLevel}</strong>
                </>
              ) : null}
              {l.entryTerm ? `, starting ${l.entryTerm}` : ''}.
            </p>
            {paragraphs.map((p, i) => (
              <p key={i} className="whitespace-pre-line">
                {p}
              </p>
            ))}
            {l.offerExpiresOn && (
              <p>
                To accept this offer, please complete and return the acceptance slip below, or confirm with the admissions office, <strong>no later than {longDate(l.offerExpiresOn)}</strong>. After this date the place may be offered to another child.
              </p>
            )}
            {l.fees && (
              <div className="print-avoid-break">
                <p>The fees for {l.fees.termName} are:</p>
                <table className="mt-2 w-full max-w-md border-collapse font-sans text-[13px]">
                  <tbody>
                    {l.fees.items.map((f) => (
                      <tr key={f.name} className="border-b border-[#e3e6ee]">
                        <td className="py-1.5 pr-4">{f.name}</td>
                        <td className="py-1.5 text-right tabular">{money(f.amountKobo, l.currency)}</td>
                      </tr>
                    ))}
                    <tr className="font-semibold">
                      <td className="py-1.5 pr-4">Total</td>
                      <td className="py-1.5 text-right tabular">{money(l.fees.totalKobo, l.currency)}</td>
                    </tr>
                  </tbody>
                </table>
                <p className="mt-1 font-sans text-[11.5px] text-[#4b556b]">Optional items such as transport and boarding are charged separately where they apply.</p>
              </div>
            )}
            <p>We look forward to welcoming {first} and your family to our school community.</p>
            <p>Yours faithfully,</p>
          </div>

          <div className="mt-10 w-56">
            <div className="h-px" style={{ background: INK }} />
            <p className="mt-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#4b556b]">For the Principal</p>
          </div>

          <div className="print-avoid-break mt-10 border-t-2 border-dashed border-[#c5cad6] pt-5 text-[13px]">
            <p className="font-semibold uppercase tracking-wide">Acceptance slip</p>
            <p className="mt-2 leading-relaxed">
              I, ____________________________________, parent/guardian of <strong>{l.childName}</strong>, accept the offer of admission
              {l.classLevel ? ` into ${l.classLevel}` : ''} (ref. <span className="font-mono">{l.number}</span>).
            </p>
            <div className="mt-6 grid grid-cols-2 gap-8">
              <div>
                <div className="h-px bg-[#1b2440]" />
                <p className="mt-1 text-[11.5px] text-[#4b556b]">Signature</p>
              </div>
              <div>
                <div className="h-px bg-[#1b2440]" />
                <p className="mt-1 text-[11.5px] text-[#4b556b]">Date</p>
              </div>
            </div>
          </div>
        </div>
      </article>
    </Page>
  );
}
