import type { IdCard, IdCardBatch } from '@aischool/shared';
import { Briefcase, CheckSquare, GraduationCap, IdCard as IdCardIcon, Printer, Settings2, Square } from 'lucide-react';
import QRCode from 'qrcode';
import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useCan } from '@/lib/auth-store';
import { formatDate } from '@/lib/format';
import { cn, initialsFromName } from '@/lib/utils';
import { armOptions, useStructure } from '../academics/api';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useIdCards } from './api';
import { OperationsSettingsSheet } from './settings-sheet';
import { plural, Segmented } from './ui';

const PER_SHEET = 10;

/** QR codes for every card, generated once per batch. */
function useQrMap(cards: IdCard[] | undefined): Record<string, string> {
  const [map, setMap] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!cards?.length) {
      setMap({});
      return;
    }
    let alive = true;
    const origin = window.location.origin;
    void Promise.all(
      cards.map(async (c) => [c.id, await QRCode.toDataURL(`${origin}${c.verifyPath}`, { margin: 0, width: 220, errorCorrectionLevel: 'M', color: { dark: '#0a1024', light: '#ffffff' } })] as const),
    ).then((pairs) => {
      if (alive) setMap(Object.fromEntries(pairs));
    });
    return () => {
      alive = false;
    };
  }, [cards]);
  return map;
}

export default function IdCardsPage() {
  const canAcademics = useCan('academics.read');
  const structure = useStructure();
  const arms = armOptions(structure.data);
  const [kind, setKind] = useState<'STUDENT' | 'STAFF'>(canAcademics ? 'STUDENT' : 'STAFF');
  const [armId, setArmId] = useState<string | undefined>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const enabled = kind === 'STAFF' || !!armId;
  const q = useIdCards(kind === 'STAFF' ? { kind } : { kind, classArmId: armId }, enabled);
  const cards = enabled ? q.data?.cards : undefined;
  const qr = useQrMap(cards);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  useEffect(() => setExcluded(new Set()), [kind, armId]);

  const selected = useMemo(() => (cards ?? []).filter((c) => !excluded.has(c.id)), [cards, excluded]);
  const sheets = useMemo(() => {
    const out: IdCard[][] = [];
    for (let i = 0; i < selected.length; i += PER_SHEET) out.push(selected.slice(i, i + PER_SHEET));
    return out;
  }, [selected]);
  const toggle = (id: string) =>
    setExcluded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Page className="print:max-w-none print:p-0">
      <div className="print:hidden">
        <PageHeader
          title="ID cards"
          description="Student and staff cards with a QR code that confirms they’re current. Prints ten to an A4 sheet."
          actions={
            <>
              <Button variant="outline" size="icon" aria-label="ID card settings" onClick={() => setSettingsOpen(true)}>
                <Settings2 />
              </Button>
              <Button onClick={() => window.print()} disabled={!selected.length}>
                <Printer /> Print {selected.length ? plural(selected.length, 'card') : 'cards'}
              </Button>
            </>
          }
        />

        <Card className="mb-5 flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-center sm:px-5">
          <Segmented
            label="Cards for"
            value={kind}
            onChange={(k) => setKind(k)}
            options={[
              { value: 'STUDENT', label: <><GraduationCap /> Students</> },
              { value: 'STAFF', label: <><Briefcase /> Staff</> },
            ]}
          />
          {kind === 'STUDENT' &&
            (canAcademics ? (
              <Select value={armId ?? NONE} onValueChange={(v) => setArmId(v === NONE ? undefined : v)}>
                <SelectTrigger aria-label="Class" className="sm:w-56">
                  <SelectValue placeholder="Choose a class" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE} disabled>
                    Choose a class
                  </SelectItem>
                  {arms.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-[12.5px] text-muted-foreground">Printing student cards needs access to the class list.</p>
            ))}
          {cards && cards.length > 0 && (
            <div className="flex items-center gap-2 sm:ml-auto">
              <span className="text-[12.5px] text-muted-foreground tabular">
                {selected.length} of {cards.length} selected · {plural(Math.ceil(selected.length / PER_SHEET), 'sheet')}
              </span>
              <Button variant="ghost" size="sm" onClick={() => setExcluded(excluded.size ? new Set() : new Set(cards.map((c) => c.id)))}>
                {excluded.size ? <CheckSquare /> : <Square />} {excluded.size ? 'Select all' : 'Select none'}
              </Button>
            </div>
          )}
        </Card>

        {!enabled ? (
          <Card>
            <EmptyState icon={IdCardIcon} title="Choose a class" description="Pick a class to preview its students’ cards." />
          </Card>
        ) : q.error && !q.data ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : !q.data ? (
          <div className="flex flex-wrap justify-center gap-4 sm:justify-start" aria-busy>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[54mm] w-[85.6mm] max-w-full rounded-[3mm]" />
            ))}
          </div>
        ) : q.data.cards.length === 0 ? (
          <Card>
            <EmptyState icon={IdCardIcon} title={kind === 'STAFF' ? 'No current staff' : 'No active students in this class'} />
          </Card>
        ) : (
          <ul className="flex flex-wrap justify-center gap-4 sm:justify-start">
            {q.data.cards.map((c) => {
              const on = !excluded.has(c.id);
              return (
                <li key={c.id} className="relative">
                  <label className={cn('block cursor-pointer rounded-[3.4mm] p-0.5 ring-2 transition-[box-shadow,opacity]', on ? 'ring-brand/60' : 'opacity-50 ring-transparent')}>
                    <Checkbox checked={on} onCheckedChange={() => toggle(c.id)} className="absolute right-2.5 top-2.5 z-10 bg-white" aria-label={`Include ${c.name}`} />
                    <IdCardFace card={c} school={q.data.school} qr={qr[c.id]} />
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {q.data && (
        <div className="print-idcards hidden print:block" aria-hidden>
          {sheets.map((sheet, i) => (
            <div key={i} className="idcard-sheet">
              {sheet.map((c) => (
                <IdCardFace key={c.id} card={c} school={q.data.school} qr={qr[c.id]} print />
              ))}
            </div>
          ))}
        </div>
      )}
      <OperationsSettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} section="documents" />
    </Page>
  );
}

function IdCardFace({ card, school, qr, print }: { card: IdCard; school: IdCardBatch['school']; qr: string | undefined; print?: boolean }) {
  const band = school.primaryColor || 'var(--brand)';
  const label = card.kind === 'STUDENT' ? 'Student' : 'Staff';
  return (
    <div
      className={cn('relative flex h-[54mm] w-[85.6mm] flex-col overflow-hidden rounded-[3mm] bg-white text-[#0a1024]', print ? 'border border-[#cdd3df]' : 'shadow-[0_1px_3px_rgb(0_0_0/0.12),0_8px_24px_-12px_rgb(0_0_0/0.25)]')}
      style={{ '--band': band } as CSSProperties}
    >
      <div className="flex h-[12.5mm] shrink-0 items-center gap-[2.2mm] bg-[var(--band)] px-[3mm] text-white">
        {school.logoUrl ? (
          <img src={school.logoUrl} alt="" className="size-[8.5mm] shrink-0 rounded-full bg-white object-contain p-[0.6mm]" />
        ) : (
          <span className="grid size-[8.5mm] shrink-0 place-items-center rounded-full bg-white text-[7pt] font-bold" style={{ color: band }}>
            {initialsFromName(school.shortName || school.name)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[8pt] font-bold leading-tight">{school.name}</p>
          {school.motto && <p className="truncate text-[5.5pt] italic leading-tight opacity-90">{school.motto}</p>}
        </div>
        <span className="shrink-0 rounded-[1mm] bg-white/20 px-[1.5mm] py-[0.4mm] text-[5.5pt] font-bold uppercase tracking-[0.12em]">{label} ID</span>
      </div>

      <div className="flex min-h-0 flex-1 gap-[2.6mm] px-[3mm] pt-[2.4mm]">
        {card.photoUrl ? (
          <img src={card.photoUrl} alt="" className="h-[24mm] w-[19mm] shrink-0 rounded-[1.2mm] object-cover" />
        ) : (
          <span className="grid h-[24mm] w-[19mm] shrink-0 place-items-center rounded-[1.2mm] bg-[#eef0f5] text-[13pt] font-semibold text-[#4b556b]">{initialsFromName(card.name)}</span>
        )}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[9pt] font-bold leading-[1.15]">{card.name}</p>
          {card.detail && <p className="truncate text-[6.8pt] text-[#4b556b]">{card.detail}</p>}
          <dl className="mt-[1.4mm] space-y-[0.4mm] text-[6pt] leading-tight">
            <div className="flex gap-[1mm]">
              <dt className="text-[#4b556b]">{card.kind === 'STUDENT' ? 'Adm. no.' : 'Staff no.'}</dt>
              <dd className="truncate font-mono font-semibold">{card.number}</dd>
            </div>
            {card.guardianPhone && (
              <div className="flex gap-[1mm]">
                <dt className="text-[#4b556b]">Parent</dt>
                <dd className="truncate font-semibold">{card.guardianPhone}</dd>
              </div>
            )}
            <div className="flex gap-[1mm]">
              <dt className="text-[#4b556b]">Valid until</dt>
              <dd className="truncate font-semibold">{card.validUntil ? formatDate(card.validUntil) : '—'}</dd>
            </div>
          </dl>
        </div>
        <div className="flex shrink-0 flex-col items-center">
          {qr ? <img src={qr} alt="" className="size-[16.5mm]" /> : <span className="size-[16.5mm] rounded-[1mm] bg-[#eef0f5]" />}
          <span className="mt-[0.6mm] text-[4.6pt] uppercase tracking-[0.1em] text-[#4b556b]">Scan to verify</span>
        </div>
      </div>

      <div className="mt-auto flex h-[4.2mm] shrink-0 items-center justify-between gap-[2mm] border-t border-[#e6e9f0] px-[3mm] text-[5pt] text-[#4b556b]">
        <span className="truncate">{school.address?.replace(/\n/g, ', ') ?? ''}</span>
        {school.phone && <span className="shrink-0">{school.phone}</span>}
      </div>
    </div>
  );
}
