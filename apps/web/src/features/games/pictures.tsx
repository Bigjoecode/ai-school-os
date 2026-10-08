import { nairaText, type EarlyVisual, type ShapeKind } from '@aischool/shared';
import { cn } from '@/lib/utils';

/** Pictures for the early-years games, drawn inline (SVG and emoji): nothing to download, works offline. */

const poly = (n: number, r = 42, rot = -90) =>
  Array.from({ length: n }, (_, i) => {
    const a = ((rot + (360 / n) * i) * Math.PI) / 180;
    return `${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');

const starPoints = () =>
  Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? 18 : 44;
    const a = ((-90 + 36 * i) * Math.PI) / 180;
    return `${(50 + r * Math.cos(a)).toFixed(1)},${(52 + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');

export function ShapeSvg({ shape, colour, className, label }: { shape: ShapeKind; colour: string; className?: string; label?: string }) {
  const p = { fill: colour, stroke: 'color-mix(in oklab, currentColor 35%, transparent)', strokeWidth: 2 };
  return (
    <svg viewBox="0 0 100 100" className={cn('size-24', className)} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {shape === 'circle' && <circle cx={50} cy={50} r={40} {...p} />}
      {shape === 'oval' && <ellipse cx={50} cy={50} rx={46} ry={26} {...p} />}
      {shape === 'square' && <rect x={15} y={15} width={70} height={70} {...p} />}
      {shape === 'rectangle' && <rect x={4} y={28} width={92} height={44} {...p} />}
      {shape === 'triangle' && <polygon points="50,10 92,86 8,86" {...p} />}
      {shape === 'star' && <polygon points={starPoints()} {...p} />}
      {shape === 'heart' && <path d="M50 88 C 18 64, 4 44, 22 24 C 35 11, 48 18, 50 30 C 52 18, 65 11, 78 24 C 96 44, 82 64, 50 88 Z" {...p} />}
      {shape === 'diamond' && <polygon points="50,4 82,50 50,96 18,50" {...p} />}
      {shape === 'pentagon' && <polygon points={poly(5)} {...p} />}
      {shape === 'hexagon' && <polygon points={poly(6, 42, 0)} {...p} />}
    </svg>
  );
}

/** An analogue clock: numbers, a short thick hour hand and a long minute hand. */
export function ClockSvg({ h, m, className, label }: { h: number; m: number; className?: string; label?: string }) {
  const hourA = ((h % 12) * 30 + m * 0.5 - 90) * (Math.PI / 180);
  const minA = (m * 6 - 90) * (Math.PI / 180);
  return (
    <svg viewBox="0 0 100 100" className={cn('size-40', className)} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <circle cx={50} cy={50} r={46} fill="var(--card)" stroke="var(--foreground)" strokeWidth={3} />
      {Array.from({ length: 60 }, (_, i) => {
        const a = (i * 6 * Math.PI) / 180;
        const big = i % 5 === 0;
        return <line key={i} x1={50 + 42 * Math.sin(a)} y1={50 - 42 * Math.cos(a)} x2={50 + (big ? 38 : 40.5) * Math.sin(a)} y2={50 - (big ? 38 : 40.5) * Math.cos(a)} stroke="var(--muted-foreground)" strokeWidth={big ? 1.6 : 0.6} />;
      })}
      {Array.from({ length: 12 }, (_, i) => {
        const n = i + 1;
        const a = (n * 30 * Math.PI) / 180;
        return (
          <text key={n} x={50 + 31 * Math.sin(a)} y={50 - 31 * Math.cos(a)} textAnchor="middle" dominantBaseline="central" fontSize={9} fontWeight={600} fill="var(--foreground)">
            {n}
          </text>
        );
      })}
      <line x1={50} y1={50} x2={50 + 20 * Math.cos(hourA)} y2={50 + 20 * Math.sin(hourA)} stroke="var(--danger)" strokeWidth={5} strokeLinecap="round" />
      <line x1={50} y1={50} x2={50 + 34 * Math.cos(minA)} y2={50 + 34 * Math.sin(minA)} stroke="var(--brand)" strokeWidth={3} strokeLinecap="round" />
      <circle cx={50} cy={50} r={3.5} fill="var(--foreground)" />
    </svg>
  );
}

/** The picture at the top of an early-years question. */
export function EarlyPicture({ v }: { v: EarlyVisual }) {
  switch (v.kind) {
    case 'count':
      // Rows of five, so children can count in fives.
      return (
        <div className="mx-auto grid max-w-xs grid-cols-5 place-items-center gap-1.5" aria-label="Count the pictures" role="group">
          {Array.from({ length: v.n }, (_, i) => (
            <span key={i} className={cn('leading-none', v.n > 10 ? 'text-3xl' : 'text-4xl')} role="img" aria-label="picture">
              {v.emoji}
            </span>
          ))}
        </div>
      );
    case 'shape':
      return <ShapeSvg shape={v.shape} colour={v.colour} className="mx-auto size-36" label="A shape" />;
    case 'letter':
      return (
        <div className="mx-auto grid size-28 place-items-center rounded-3xl border-4 border-brand/40 bg-brand-soft font-display text-7xl font-bold text-brand" aria-label={`The letter ${v.letter}`}>
          {v.letter}
        </div>
      );
    case 'picture':
      return (
        <div className="flex flex-col items-center gap-2">
          <span className="text-7xl leading-none" aria-hidden>
            {v.emoji}
          </span>
          <span className="font-display text-4xl font-semibold tracking-[0.2em]" aria-label={`The word, with its first letter missing: blank ${v.masked.slice(1)}`}>
            {v.masked}
          </span>
        </div>
      );
    case 'clock':
      return <ClockSvg h={v.h} m={v.m} className="mx-auto size-48" label="A clock" />;
    case 'shop':
      return (
        <div className="space-y-2">
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {v.items.map((it) => (
              <li key={it.name} className="flex flex-col items-center rounded-2xl border border-border bg-muted/40 px-2 py-3 text-center">
                <span className="text-4xl leading-none" aria-hidden>
                  {it.emoji}
                </span>
                <span className="mt-1 text-[14px] font-medium">{it.name}</span>
                <span className="font-display text-xl font-semibold tabular">{nairaText(it.price)}</span>
              </li>
            ))}
          </ul>
          {v.paid !== null && (
            <p className="rounded-2xl bg-success-soft px-3 py-2 text-center text-lg">
              You pay with <strong className="tabular">{nairaText(v.paid)}</strong> 💵
            </p>
          )}
        </div>
      );
  }
}
