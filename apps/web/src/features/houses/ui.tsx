import type { HousePeriod, HouseRef } from '@aischool/shared';
import { Crown, Shield } from 'lucide-react';
import type * as React from 'react';
import { cn } from '@/lib/utils';
import { Segmented } from '../operations/ui';

/** Dark ink on light house colours (yellow), white on dark ones. */
export function inkOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#ffffff';
  const n = parseInt(m[1]!, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! > 0.45 ? '#0b1220' : '#ffffff';
}

/** The house colour at a given strength, for tints and borders. */
export function tint(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}

/** A small house chip: colour dot and name. */
export function HouseBadge({ house, className, size = 'sm' }: { house: HouseRef; className?: string; size?: 'sm' | 'md' }) {
  return (
    <span
      className={cn('inline-flex max-w-full items-center gap-1.5 rounded-full border font-medium', size === 'md' ? 'px-2.5 py-1 text-[13px]' : 'px-2 py-0.5 text-[11.5px]', className)}
      style={{ borderColor: tint(house.colour, 0.35), backgroundColor: tint(house.colour, 0.1) }}
    >
      <span aria-hidden className={cn('shrink-0 rounded-full', size === 'md' ? 'size-2.5' : 'size-2')} style={{ backgroundColor: house.colour }} />
      <span className="truncate">{house.name}</span>
    </span>
  );
}

/** A shield in the house colour, optionally crowned (the leader). */
export function HouseCrest({ colour, size = 'md', crowned, className }: { colour: string; size?: 'sm' | 'md' | 'lg' | 'xl'; crowned?: boolean; className?: string }) {
  const box = { sm: 'size-8', md: 'size-11', lg: 'size-14', xl: 'size-24' }[size];
  const icon = { sm: 'size-4', md: 'size-5', lg: 'size-7', xl: 'size-12' }[size];
  return (
    <span className={cn('relative grid shrink-0 place-items-center rounded-2xl shadow-soft', box, className)} style={{ backgroundColor: colour, color: inkOn(colour) }}>
      <Shield className={icon} strokeWidth={2.2} aria-hidden />
      {crowned && (
        <span className="absolute -right-1.5 -top-2 grid size-6 rotate-12 place-items-center rounded-full bg-amber-400 text-amber-950 shadow ring-2 ring-card">
          <Crown className="size-3.5" aria-hidden />
        </span>
      )}
    </span>
  );
}

export const PERIOD_OPTIONS: { value: HousePeriod; label: string }[] = [
  { value: 'TERM', label: 'This term' },
  { value: 'SESSION', label: 'This session' },
  { value: 'ALL', label: 'All time' },
];

export function PeriodPicker({ value, onChange, className }: { value: HousePeriod; onChange: (v: HousePeriod) => void; className?: string }) {
  return <Segmented label="Period" value={value} onChange={onChange} options={PERIOD_OPTIONS} className={className} />;
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

export function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

export function PointsPill({ points, className }: { points: number; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex min-w-[3rem] justify-center rounded-full px-2 py-0.5 font-display text-[13px] font-semibold tabular',
        points > 0 ? 'bg-success-soft text-success' : points < 0 ? 'bg-danger-soft text-danger' : 'bg-muted text-muted-foreground',
        className,
      )}
    >
      {signed(points)}
    </span>
  );
}

export function SectionTitle({ icon, children, action }: { icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold [&_svg]:size-4 [&_svg]:text-muted-foreground">
        {icon}
        {children}
      </h2>
      {action}
    </div>
  );
}
