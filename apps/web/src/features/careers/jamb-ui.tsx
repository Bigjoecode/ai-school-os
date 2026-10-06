import { JAMB_LEVEL_LABELS, type JambLevel, type JambStatus } from '@aischool/shared';
import { ArrowLeft, BookOpenText, Building2, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, CircleHelp, ExternalLink, GraduationCap, House, Layers, type LucideIcon, MessageCircleQuestion, ShieldCheck } from 'lucide-react';
import { Fragment, useEffect, useRef, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCan } from '@/lib/auth-store';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { CareersTabs } from './ui';

export const JAMB_BASE = '/careers/jamb';

const NAV: { to: string; label: string; icon: LucideIcon; exact?: boolean; also?: string[] }[] = [
  { to: JAMB_BASE, label: 'Overview', icon: House, exact: true },
  { to: `${JAMB_BASE}/institutions`, label: 'By institution', icon: Building2 },
  { to: `${JAMB_BASE}/programmes`, label: 'By programme', icon: Layers, also: [`${JAMB_BASE}/courses`] },
  { to: `${JAMB_BASE}/check`, label: 'Eligibility checker', icon: ShieldCheck },
  { to: `${JAMB_BASE}/syllabus`, label: 'E-syllabus', icon: BookOpenText },
  { to: `${JAMB_BASE}/faq`, label: 'FAQ', icon: MessageCircleQuestion },
];

/** IBASS-style sub-navigation (phones scroll it sideways). */
export function JambNav() {
  const { pathname } = useLocation();
  const ref = useRef<HTMLElement>(null);
  const on = (n: (typeof NAV)[number]) => (n.exact ? pathname === n.to : [n.to, ...(n.also ?? [])].some((p) => pathname === p || pathname.startsWith(`${p}/`)));
  useEffect(() => {
    const nav = ref.current;
    const el = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !el) return;
    const box = nav.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.left < box.left || r.right > box.right) nav.scrollLeft += r.left - box.left - 16;
  }, [pathname]);
  return (
    <nav ref={ref} aria-label="JAMB & universities" className="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      {NAV.map((n) => {
        const active = on(n);
        return (
          <Link
            key={n.to}
            to={n.to}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active ? 'border-brand bg-brand text-white' : 'border-border bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            <n.icon className="size-3.5" aria-hidden />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** The page frame: Careers tabs for students, a way back for parents and staff, then the JAMB sub-nav. */
export function JambShell({ title, description, children, back }: { title: string; description?: string; children: ReactNode; back?: { to: string; label: string } }) {
  const student = useCan('learning.use');
  const parent = useCan('family.manage');
  const staff = useCan('students.read');
  const home = student ? null : parent ? { to: '/school/careers', label: 'Careers' } : staff ? { to: '/careers-guidance', label: 'Careers guidance' } : null;
  return (
    <Page className="max-w-5xl">
      {back ? (
        <Link to={back.to} className="mb-3 inline-flex min-h-8 items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" aria-hidden /> {back.label}
        </Link>
      ) : (
        home && (
          <Link to={home.to} className="mb-3 inline-flex min-h-8 items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" aria-hidden /> {home.label}
          </Link>
        )
      )}
      <PageHeader eyebrow="JAMB & universities" title={title} description={description} />
      {student && !back && <CareersTabs />}
      {!back && <JambNav />}
      {children}
    </Page>
  );
}

const STATUS: Record<JambStatus, { label: string; icon: LucideIcon; badge: 'success' | 'warning' | 'danger'; tone: string }> = {
  MATCH: { label: 'Subjects match', icon: CircleCheck, badge: 'success', tone: 'text-success' },
  CHECK: { label: 'Check the wording', icon: CircleHelp, badge: 'warning', tone: 'text-warning' },
  MISMATCH: { label: 'Subjects don’t fit', icon: CircleAlert, badge: 'danger', tone: 'text-danger' },
};
export const statusInfo = (s: JambStatus) => STATUS[s];

export function StatusBadge({ status, className }: { status: JambStatus; className?: string }) {
  const s = STATUS[status];
  return (
    <Badge variant={s.badge} className={cn('gap-1', className)}>
      <s.icon className="size-3" aria-hidden />
      {s.label}
    </Badge>
  );
}

export function LevelBadge({ type }: { type: JambLevel }) {
  return <Badge variant={type === 'DEGREE' ? 'brand' : type === 'ND' ? 'info' : 'secondary'}>{JAMB_LEVEL_LABELS[type].replace(/s$/, '')}</Badge>;
}

/** JAMB's texts come from a PDF layout: join broken lines, keep list items on their own lines. */
export function tidyText(text: string): string {
  return text
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .reduce((out, line) => {
      const newItem = /^(\(?[ivx]{1,5}\)|\(?[a-h]\)|\d{1,2}[.)]|NB|GROUP\b|•|-)/i.test(line);
      if (!out) return line;
      return newItem || /[:.;]$/.test(out) && /^[A-Z(]/.test(line) ? `${out}\n${line}` : `${out} ${line}`;
    }, '')
    .replace(/ {2,}/g, ' ');
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A requirement text in JAMB's words, with the student's subjects highlighted. */
export function RequirementText({ text, have = [], missing = [], className }: { text: string | null | undefined; have?: string[]; missing?: string[]; className?: string }) {
  if (!text) return <p className={cn('text-[13px] text-muted-foreground', className)}>Not given in the brochure.</p>;
  const t = tidyText(text);
  const terms = [...have.map((h) => ({ h, kind: 'have' as const })), ...missing.map((h) => ({ h, kind: 'miss' as const }))].filter((x) => x.h.length > 1).sort((a, b) => b.h.length - a.h.length);
  if (!terms.length) return <p className={cn('whitespace-pre-line text-[13.5px] leading-relaxed', className)}>{t}</p>;
  const re = new RegExp(`(${terms.map((x) => esc(x.h)).join('|')})`, 'gi');
  const parts = t.split(re);
  return (
    <p className={cn('whitespace-pre-line text-[13.5px] leading-relaxed', className)}>
      {parts.map((p, i) => {
        const hit = terms.find((x) => x.h.toLowerCase() === p.toLowerCase());
        if (!hit) return <Fragment key={i}>{p}</Fragment>;
        return (
          <mark key={i} className={cn('rounded px-0.5', hit.kind === 'have' ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger')}>
            {p}
          </mark>
        );
      })}
    </p>
  );
}

/** One labelled requirement block (UTME, O'level, Direct Entry). */
export function RequirementBlock({ label, text, have, missing }: { label: string; text: string | null | undefined; have?: string[]; missing?: string[] }) {
  return (
    <div>
      <p className="mb-0.5 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <RequirementText text={text} have={have} missing={missing} />
    </div>
  );
}

export function NativeSelect({ value, onChange, label, children, className }: { value: string; onChange: (v: string) => void; label: string; children: ReactNode; className?: string }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn('h-10 min-w-0 rounded-lg border border-input bg-card px-2.5 text-[13.5px] shadow-xs focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/15', className)}
    >
      {children}
    </select>
  );
}

export function Pager({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between gap-3">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <ChevronLeft /> Previous
      </Button>
      <span className="text-[12.5px] tabular text-muted-foreground">
        Page {page} of {pages}
      </span>
      <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next <ChevronRight />
      </Button>
    </div>
  );
}

/** Where the data comes from, and the honest caveat about cut-off marks. */
export function SourceNote({ fetchedAt, className }: { fetchedAt?: string | null; className?: string }) {
  return (
    <p className={cn('text-[11.5px] text-muted-foreground', className)}>
      Source: JAMB IBASS (ibass.jamb.gov.ng){fetchedAt ? `, fetched ${formatDate(fetchedAt, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}. Cut-off marks are not in the brochure — each institution sets its own every year. Always confirm on{' '}
      <a href="https://ibass.jamb.gov.ng" target="_blank" rel="noreferrer" className="font-medium text-brand hover:underline">
        IBASS <ExternalLink className="inline size-3" aria-hidden />
      </a>{' '}
      and the institution’s website.
    </p>
  );
}

export const courseIcon = GraduationCap;
