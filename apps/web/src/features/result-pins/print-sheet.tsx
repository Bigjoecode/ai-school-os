import { formatPin, type PinExport } from '@aischool/shared';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { money } from '../finance/ui';

/** Ten cards to an A4 sheet (two across, five down); cut along the dashed lines. */
export function PinCardSheet({ data, currency, className }: { data: PinExport; currency: string; className?: string }) {
  const b = data.batch;
  const scope = b.termName ? `${b.termName}, ${b.sessionName}` : `Any term, ${b.sessionName} session`;
  return (
    <div className={cn('pin-sheet grid grid-cols-1 gap-3 sm:grid-cols-2 print:grid-cols-2 print:gap-0', className)}>
      <style>{`@media print { @page { size: A4 portrait; margin: 10mm; } .pin-card { height: 54mm; } }`}</style>
      {data.cards.map((c) => (
        <div key={c.serial} className="pin-card print-avoid-break flex flex-col overflow-hidden rounded-xl border border-dashed border-border-strong bg-card p-3 text-card-foreground print:rounded-none print:border-[#9aa3b5] print:bg-white print:text-black">
          <div className="flex items-center gap-2 border-b border-border pb-1.5 print:border-[#d5d9e2]">
            {data.school.logoUrl ? <img src={data.school.logoUrl} alt="" className="size-7 shrink-0 object-contain" /> : null}
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-[12.5px] font-bold uppercase leading-tight">{data.school.name}</p>
              <p className="truncate text-[10px] text-muted-foreground print:text-[#555]">Result checker card · {scope}</p>
            </div>
            <p className="shrink-0 text-right text-[10px] leading-tight text-muted-foreground print:text-[#555]">
              Serial
              <span className="block font-mono text-[12px] font-semibold text-foreground print:text-black">{c.serial}</span>
            </p>
          </div>
          <div className="my-2 rounded-lg bg-[repeating-linear-gradient(45deg,#c9ced8,#c9ced8_6px,#b8bec9_6px,#b8bec9_12px)] p-[3px] print:bg-none">
            <div className="rounded-md bg-white px-2 py-1.5 text-center text-black print:border print:border-[#999]">
              <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#666]">PIN</p>
              <p className="font-mono text-[19px] font-bold tracking-[0.16em]">{formatPin(c.pin)}</p>
            </div>
          </div>
          <p className="text-[9.5px] leading-snug text-muted-foreground print:text-[#333]">
            Go to <span className="break-all font-semibold text-foreground print:text-black">{data.checkerUrl}</span>, enter the student’s admission number and surname, this serial and PIN. Works for one student, {b.usesPerPin} checks. Valid until {formatDate(b.expiresOn)}.
            {b.priceKobo > 0 && <> Price {money(b.priceKobo, currency)}.</>} Keep the PIN private.
          </p>
        </div>
      ))}
    </div>
  );
}

/** The CSV the school can send to a card printer. */
export function pinCsv(data: PinExport): string {
  const b = data.batch;
  const rows = [['serial', 'pin', 'school', 'session', 'term', 'uses', 'expires', 'checker_url']];
  for (const c of data.cards) rows.push([c.serial, c.pin, data.school.name, b.sessionName, b.termName ?? 'Any term', String(b.usesPerPin), b.expiresOn, data.checkerUrl]);
  return rows.map((r) => r.map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(',')).join('\r\n');
}

export function downloadText(name: string, text: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob(['﻿', text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
