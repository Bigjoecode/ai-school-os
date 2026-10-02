import { motion } from 'framer-motion';
import { AlertTriangle, ArrowRight, Loader2, type LucideIcon } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router';
import { cn, initialsFromName } from '@/lib/utils';
import { useSite } from './context';

// ------------------------------------------------------------------ layout

export function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8', className)}>{children}</div>;
}

export function Section({ id, className, children, tone = 'plain' }: { id?: string; className?: string; children: React.ReactNode; tone?: 'plain' | 'surface' | 'soft' }) {
  return (
    <section id={id} className={cn('py-16 sm:py-20', tone === 'surface' && 'bg-site-surface', tone === 'soft' && 'bg-site-soft', className)}>
      <Container>{children}</Container>
    </section>
  );
}

/** Fades content up as it scrolls into view. */
export function Reveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('text-[12px] font-semibold uppercase tracking-[0.14em] text-site', className)}>{children}</p>;
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  align = 'left',
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  align?: 'left' | 'center';
  className?: string;
}) {
  return (
    <div className={cn('mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', align === 'center' && 'items-center text-center sm:flex-col sm:items-center', className)}>
      <div className={cn('min-w-0', align === 'center' ? 'max-w-2xl' : 'max-w-2xl')}>
        {eyebrow && <Eyebrow className="mb-3">{eyebrow}</Eyebrow>}
        <h2 className="site-h text-[28px] font-semibold leading-[1.15] text-site-ink sm:text-[34px]">{title}</h2>
        {description && <p className="mt-3 text-[15.5px] leading-relaxed text-site-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** The band at the top of every inner page. */
export function PageIntro({ eyebrow, title, description, children }: { eyebrow?: string; title: string; description?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden border-b border-site-line bg-site-soft">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-site/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 left-1/3 size-72 rounded-full bg-site-accent/10 blur-3xl" />
      <Container className="relative py-14 sm:py-20">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }} className="max-w-3xl">
          {eyebrow && <Eyebrow className="mb-3">{eyebrow}</Eyebrow>}
          <h1 className="site-h text-[34px] font-semibold leading-[1.1] text-site-ink sm:text-[46px]">{title}</h1>
          {description && <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-site-muted sm:text-[17px]">{description}</p>}
          {children}
        </motion.div>
      </Container>
    </div>
  );
}

// ------------------------------------------------------------------ links & buttons

export const SiteLink = React.forwardRef<HTMLAnchorElement, Omit<React.ComponentProps<typeof Link>, 'to'> & { to: string }>(({ to, ...props }, ref) => {
  const { href } = useSite();
  return <Link ref={ref} to={href(to)} {...props} />;
});
SiteLink.displayName = 'SiteLink';

type ButtonTone = 'primary' | 'accent' | 'outline' | 'light' | 'ghost';
const tones: Record<ButtonTone, string> = {
  primary: 'bg-site text-site-on shadow-[0_8px_20px_-10px_var(--site-primary)] hover:brightness-110',
  accent: 'bg-site-accent text-[#1a1306] shadow-[0_8px_20px_-10px_var(--site-accent)] hover:brightness-105',
  outline: 'border border-site-line bg-white text-site-ink hover:border-site/40 hover:text-site',
  light: 'bg-white/12 text-white ring-1 ring-inset ring-white/30 backdrop-blur hover:bg-white/20',
  ghost: 'text-site hover:bg-site-soft',
};

export function siteButton(tone: ButtonTone = 'primary', size: 'md' | 'lg' | 'sm' = 'md') {
  return cn(
    'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-site font-semibold transition-[filter,background-color,color,border-color,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60 [&_svg]:size-4 [&_svg]:shrink-0',
    size === 'lg' ? 'h-12 px-6 text-[15px]' : size === 'sm' ? 'h-9 px-3.5 text-[13.5px]' : 'h-11 px-5 text-[14.5px]',
    tones[tone],
  );
}

export function SiteButton({ tone = 'primary', size = 'md', loading, className, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ButtonTone; size?: 'md' | 'lg' | 'sm'; loading?: boolean }) {
  return (
    <button className={cn(siteButton(tone, size), className)} disabled={props.disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading && <Loader2 className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function MoreLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <SiteLink to={to} className="group inline-flex items-center gap-1.5 text-[14.5px] font-semibold text-site">
      {children}
      <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </SiteLink>
  );
}

// ------------------------------------------------------------------ cards & bits

export function SiteCard({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-site-lg border border-site-line bg-white shadow-[0_1px_2px_rgb(16_24_40/0.04),0_8px_24px_-12px_rgb(16_24_40/0.08)]', className)} {...props}>
      {children}
    </div>
  );
}

export function IconTile({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <div className={cn('grid size-11 shrink-0 place-items-center rounded-site bg-site-soft text-site', className)}>
      <Icon className="size-5" aria-hidden />
    </div>
  );
}

export function Initials({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  if (src) return <img src={src} alt={name} className={cn('object-cover', className)} loading="lazy" />;
  return (
    <div aria-hidden className={cn('grid place-items-center bg-gradient-to-br from-site to-site/70 font-semibold text-site-on', className)}>
      {initialsFromName(name.replace(/^(mr|mrs|ms|miss|dr|prof|rev|engr|chief|alhaji|alhaja)\.?\s+/i, ''))}
    </div>
  );
}

export function SiteEmpty({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-site-lg border border-dashed border-site-line bg-white/60 px-6 py-14 text-center">
      <div className="grid size-14 place-items-center rounded-site bg-site-soft text-site">
        <Icon className="size-6" aria-hidden />
      </div>
      <p className="site-h mt-4 text-[18px] font-semibold text-site-ink">{title}</p>
      {description && <p className="mt-1.5 max-w-md text-[14px] leading-relaxed text-site-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function SiteError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <SiteEmpty
      icon={AlertTriangle}
      title="We couldn’t load this"
      description={message}
      action={
        onRetry && (
          <SiteButton tone="outline" size="sm" onClick={onRetry}>
            Try again
          </SiteButton>
        )
      }
    />
  );
}

export function Shimmer({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-site bg-site-line/70', className)} />;
}

export function CardGridSkeleton({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid gap-6 sm:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <SiteCard key={i} className="overflow-hidden">
          <Shimmer className="aspect-[16/10] rounded-none" />
          <div className="space-y-3 p-5">
            <Shimmer className="h-3 w-24" />
            <Shimmer className="h-5 w-4/5" />
            <Shimmer className="h-3 w-full" />
          </div>
        </SiteCard>
      ))}
    </div>
  );
}

/** A calendar-style date tile: "OCT / 16". */
export function DateTile({ date, className }: { date: string; className?: string }) {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  const month = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' }).format(d);
  const day = d.getUTCDate();
  return (
    <div className={cn('flex w-14 shrink-0 flex-col items-center overflow-hidden rounded-site border border-site-line bg-white text-center', className)}>
      <span className="w-full bg-site py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-site-on">{month}</span>
      <span className="site-h py-1.5 text-[22px] font-semibold leading-none text-site-ink tabular">{day}</span>
    </div>
  );
}

export function siteDate(value: string | null | undefined, opts: Intl.DateTimeFormatOptions = {}) {
  if (!value) return '';
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const d = new Date(dateOnly ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', ...(dateOnly ? { timeZone: 'UTC' } : {}), ...opts }).format(d);
}

export function dateRange(start: string, end: string | null) {
  if (!end || end === start) return siteDate(start, { weekday: 'long' });
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  return sameMonth ? `${siteDate(start, { day: 'numeric', month: undefined, year: undefined })}–${siteDate(end)}` : `${siteDate(start, { year: undefined })} – ${siteDate(end)}`;
}

export function Chip({ children, className, tone = 'soft' }: { children: React.ReactNode; className?: string; tone?: 'soft' | 'accent' | 'outline' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium',
        tone === 'soft' && 'bg-site-soft text-site',
        tone === 'accent' && 'bg-site-accent-soft text-[color-mix(in_oklab,var(--site-accent)_70%,black)]',
        tone === 'outline' && 'border border-site-line bg-white text-site-muted',
        className,
      )}
    >
      {children}
    </span>
  );
}

// ------------------------------------------------------------------ safe text

const INLINE = /(\*\*[^*]+\*\*)/g;

/** **bold** only — everything stays a React text node. */
export function Inline({ text }: { text: string }) {
  return (
    <>
      {text
        .split(INLINE)
        .filter(Boolean)
        .map((part, i) =>
          part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
            <strong key={i} className="font-semibold text-site-ink">
              {part.slice(2, -2)}
            </strong>
          ) : (
            <React.Fragment key={i}>{part}</React.Fragment>
          ),
        )}
    </>
  );
}

type Block = { type: 'p'; lines: string[] } | { type: 'ul'; items: string[] } | { type: 'h'; text: string };

function blocks(text: string): Block[] {
  const out: Block[] = [];
  let cur: Block | null = null;
  const flush = () => {
    if (cur) out.push(cur);
    cur = null;
  };
  for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const h = /^#{1,3}\s+(.*)$/.exec(line);
    if (h) {
      flush();
      out.push({ type: 'h', text: h[1] });
      continue;
    }
    const li = /^[-*•]\s+(.*)$/.exec(line);
    if (li) {
      if (cur?.type !== 'ul') {
        flush();
        cur = { type: 'ul', items: [] };
      }
      cur.items.push(li[1]);
      continue;
    }
    if (cur?.type !== 'p') {
      flush();
      cur = { type: 'p', lines: [] };
    }
    cur.lines.push(line);
  }
  flush();
  return out;
}

/** Paragraphs, `- ` lists, `#` headings and **bold** — rendered as React elements, never as HTML. */
export function Prose({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn('space-y-5 text-[16.5px] leading-[1.75] text-site-ink/85', className)}>
      {blocks(text).map((b, i) =>
        b.type === 'h' ? (
          <h3 key={i} className="site-h pt-2 text-[21px] font-semibold text-site-ink">
            <Inline text={b.text} />
          </h3>
        ) : b.type === 'ul' ? (
          <ul key={i} className="space-y-2.5">
            {b.items.map((item, j) => (
              <li key={j} className="flex gap-3">
                <span aria-hidden className="mt-[11px] size-1.5 shrink-0 rounded-full bg-site" />
                <span className="min-w-0">
                  <Inline text={item} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p key={i}>
            {b.lines.map((l, j) => (
              <React.Fragment key={j}>
                {j > 0 && <br />}
                <Inline text={l} />
              </React.Fragment>
            ))}
          </p>
        ),
      )}
    </div>
  );
}

/** Split plain text into paragraphs. */
export function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

// ------------------------------------------------------------------ forms

export const siteInput =
  'block h-11 w-full min-w-0 rounded-site border border-site-line bg-white px-3.5 text-[15px] text-site-ink shadow-[0_1px_1px_rgb(16_24_40/0.03)] transition-[border-color,box-shadow] placeholder:text-site-muted/60 hover:border-site/30 focus:border-site focus:outline-none focus:ring-4 focus:ring-site/12 aria-[invalid=true]:border-red-500';

export function SiteField({ label, htmlFor, error, hint, optional, className, children }: { label: string; htmlFor: string; error?: string; hint?: string; optional?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('grid gap-1.5', className)}>
      <label htmlFor={htmlFor} className="flex items-center gap-2 text-[13.5px] font-medium text-site-ink">
        {label}
        {optional && <span className="text-[12px] font-normal text-site-muted">Optional</span>}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-[12.5px] font-medium text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12.5px] text-site-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function FormAlert({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-site border border-red-200 bg-red-50 px-3.5 py-3 text-[14px] text-red-700">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {message}
    </p>
  );
}

/** Hidden from people, visible to naive bots. Real visitors leave it empty. */
export function Honeypot({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
      <label>
        Website
        <input tabIndex={-1} autoComplete="off" name="website" value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
    </div>
  );
}

/** First zod issue per field. */
export function issuesToErrors(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) out[String(i.path[0] ?? 'form')] ??= i.message;
  return out;
}
