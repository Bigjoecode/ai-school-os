import type { GatePassBatch } from '@aischool/shared';
import { DoorOpen, IdCard, Printer } from 'lucide-react';
import QRCode from 'qrcode';
import { type CSSProperties, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, initialsFromName } from '@/lib/utils';
import { useGatePasses } from './api';

type Pass = GatePassBatch['cards'][number];

function useQrs(cards: Pass[] | undefined): Record<string, string> {
  const [map, setMap] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!cards?.length) return setMap({});
    let alive = true;
    void Promise.all(cards.map(async (c) => [c.studentId, await QRCode.toDataURL(c.qr, { margin: 1, width: 260, errorCorrectionLevel: 'M', color: { dark: '#0a1024', light: '#ffffff' } })] as const)).then((pairs) => {
      if (alive) setMap(Object.fromEntries(pairs));
    });
    return () => {
      alive = false;
    };
  }, [cards]);
  return map;
}

/**
 * Printable gate passes: a QR code with a random code (never the student's
 * id) for scanning at the gate, ten to an A4 sheet. Student ID cards also
 * work at the gate.
 */
export default function GatePassesPage() {
  const [armId, setArmId] = useState<string | undefined>();
  const q = useGatePasses(armId);
  const cards = armId ? q.data?.cards : undefined;
  const qr = useQrs(cards);
  return (
    <Page className="print:max-w-none print:p-0">
      <div className="print:hidden">
        <PageHeader
          title="Gate passes"
          description="Cards with a QR code to scan at the gate. A pass holds a random code, never the child’s details; a lost pass can be cancelled from the gate. Student ID cards scan too."
          actions={
            <>
              <Button asChild variant="outline">
                <Link to="/gate">
                  <DoorOpen /> Open the gate
                </Link>
              </Button>
              <Button onClick={() => window.print()} disabled={!cards?.length}>
                <Printer /> Print {cards?.length ? `${cards.length} passes` : 'passes'}
              </Button>
            </>
          }
        />
        <Card className="mb-5 p-4">
          <Select value={armId ?? NONE} onValueChange={(v) => setArmId(v === NONE ? undefined : v)}>
            <SelectTrigger aria-label="Class" className="sm:w-64">
              <SelectValue placeholder="Choose a class" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE} disabled>
                Choose a class
              </SelectItem>
              {(q.data?.classes ?? []).map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Card>
        {q.error && !q.data ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : !armId ? (
          <Card>
            <EmptyState icon={IdCard} title="Choose a class" description="Pick a class to print its gate passes." />
          </Card>
        ) : !cards ? (
          <Skeleton className="h-48 rounded-2xl" />
        ) : cards.length === 0 ? (
          <Card>
            <EmptyState icon={IdCard} title="No active students in this class" />
          </Card>
        ) : (
          <ul className="flex flex-wrap justify-center gap-4 sm:justify-start">
            {cards.map((c) => (
              <li key={c.studentId}>
                <PassFace c={c} school={q.data!.school} qr={qr[c.studentId]} />
              </li>
            ))}
          </ul>
        )}
      </div>
      {cards && cards.length > 0 && (
        <div className="hidden print:grid print:grid-cols-2 print:gap-[6mm] print:p-[10mm]" aria-hidden>
          {cards.map((c) => (
            <div key={c.studentId} className="break-inside-avoid">
              <PassFace c={c} school={q.data!.school} qr={qr[c.studentId]} print />
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}

function PassFace({ c, school, qr, print }: { c: Pass; school: GatePassBatch['school']; qr: string | undefined; print?: boolean }) {
  const band = school.primaryColor || 'var(--brand)';
  return (
    <div
      className={cn('flex h-[54mm] w-[85.6mm] max-w-full overflow-hidden rounded-[3mm] bg-white text-[#0a1024]', print ? 'border border-[#cdd3df]' : 'shadow-[0_1px_3px_rgb(0_0_0/0.12),0_8px_24px_-12px_rgb(0_0_0/0.25)]')}
      style={{ '--band': band } as CSSProperties}
    >
      <div className="flex w-[5mm] shrink-0 bg-[var(--band)]" />
      <div className="flex min-w-0 flex-1 flex-col p-[3mm]">
        <p className="truncate text-[7pt] font-bold uppercase tracking-[0.08em] text-[#4b556b]">{school.shortName || school.name}</p>
        <p className="text-[6pt] uppercase tracking-[0.12em] text-[#4b556b]">Gate pass</p>
        <div className="mt-auto">
          {c.photoUrl ? (
            <img src={c.photoUrl} alt="" className="mb-[1.5mm] h-[14mm] w-[11mm] rounded-[1mm] object-cover" />
          ) : (
            <span className="mb-[1.5mm] grid h-[11mm] w-[11mm] place-items-center rounded-full bg-[#eef0f5] text-[8pt] font-semibold text-[#4b556b]">{initialsFromName(c.name)}</span>
          )}
          <p className="line-clamp-2 text-[10pt] font-bold leading-[1.15]">{c.name}</p>
          <p className="truncate text-[7pt] text-[#4b556b]">{c.classArm ?? ''}</p>
          <p className="truncate font-mono text-[6pt] text-[#4b556b]">{c.admissionNumber}</p>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-center justify-center pr-[3mm]">
        {qr ? <img src={qr} alt="" className="size-[40mm]" /> : <span className="size-[40mm] rounded-[1mm] bg-[#eef0f5]" />}
        <span className="mt-[0.5mm] text-[5pt] uppercase tracking-[0.1em] text-[#4b556b]">Scan at the gate</span>
      </div>
    </div>
  );
}
