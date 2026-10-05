import {
  INTEREST_TYPES,
  RIASEC,
  TRACK_LABELS,
  formatOlevel,
  type CareerRow,
  type CourseView,
  type FitCheck,
  type InterestResult,
  type InterestType,
  type Track,
} from '@aischool/shared';
import {
  Bookmark,
  BookmarkCheck,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  Compass,
  FolderKanban,
  HandHeart,
  House,
  Lightbulb,
  ListChecks,
  type LucideIcon,
  MessageCircleHeart,
  Megaphone,
  Palette,
  Route,
  Library,
  Wrench,
  Clock,
  Check,
  ChevronsUpDown,
  GraduationCap,
  Loader2,
} from 'lucide-react';
import { Command } from 'cmdk';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { errorMessage } from '@/lib/api';
import { useDebounced } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { useCourseNames, useSaveCareer } from './api';

export const INTEREST_ICON: Record<InterestType, LucideIcon> = { R: Wrench, I: Lightbulb, A: Palette, S: HandHeart, E: Megaphone, C: FolderKanban };
export const INTEREST_TONE: Record<InterestType, string> = {
  R: 'bg-warning-soft text-warning',
  I: 'bg-info-soft text-info',
  A: 'bg-ai-2/10 text-ai-2',
  S: 'bg-success-soft text-success',
  E: 'bg-danger-soft text-danger',
  C: 'bg-brand-soft text-brand',
};
export const INTEREST_BAR: Record<InterestType, string> = { R: 'bg-warning', I: 'bg-info', A: 'bg-ai-2', S: 'bg-success', E: 'bg-danger', C: 'bg-brand' };

/** The careers area's own tabs (phones scroll them). */
const TABS: { to: string; label: string; icon: LucideIcon; exact?: boolean }[] = [
  { to: '/careers', label: 'Home', icon: House, exact: true },
  { to: '/careers/library', label: 'Library', icon: Library },
  { to: '/careers/quiz', label: 'Interest quiz', icon: ListChecks },
  { to: '/careers/advisor', label: 'Track advisor', icon: Route },
  { to: '/careers/counsellor', label: 'AI counsellor', icon: MessageCircleHeart },
  { to: '/careers/plan', label: 'My plan', icon: Compass },
];

export function CareersTabs() {
  const { pathname } = useLocation();
  const navRef = useRef<HTMLElement>(null);
  const active = (t: (typeof TABS)[number]) => (t.exact ? pathname === t.to : pathname === t.to || pathname.startsWith(`${t.to}/`) || (t.to === '/careers/quiz' && pathname === '/careers/results'));
  useEffect(() => {
    const nav = navRef.current;
    const el = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !el) return;
    const box = nav.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.left < box.left || r.right > box.right) nav.scrollLeft += r.left - box.left - 16;
  }, [pathname]);
  return (
    <nav ref={navRef} aria-label="Careers" className="no-scrollbar -mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0">
      {TABS.map((t) => {
        const on = active(t);
        return (
          <Link
            key={t.to}
            to={t.to}
            aria-current={on ? 'page' : undefined}
            className={cn('relative flex shrink-0 items-center gap-1.5 px-3 pb-3 pt-1 text-[13.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', on ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}
          >
            <t.icon className={cn('size-4', on && 'text-brand')} aria-hidden />
            {t.label}
            {on && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand" />}
          </Link>
        );
      })}
    </nav>
  );
}

export function InterestChip({ type, className }: { type: InterestType; className?: string }) {
  const Icon = INTEREST_ICON[type];
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium', INTEREST_TONE[type], className)} title={INTEREST_TYPES[type].blurb}>
      <Icon className="size-3" aria-hidden />
      {INTEREST_TYPES[type].name}
    </span>
  );
}

export function TrackBadge({ track }: { track: Track | string }) {
  return <Badge variant="outline">{TRACK_LABELS[track as Track] ?? track}</Badge>;
}

/** Six bars, strongest first, with the top three highlighted. */
export function InterestBars({ result, compact }: { result: InterestResult; compact?: boolean }) {
  const order = [...RIASEC].sort((a, b) => result.scores[b] - result.scores[a]);
  return (
    <ul className={cn('space-y-2', compact && 'space-y-1.5')}>
      {order.map((t) => {
        const Icon = INTEREST_ICON[t];
        const top = result.top.includes(t);
        return (
          <li key={t} className="flex items-center gap-2.5">
            <span className={cn('grid size-7 shrink-0 place-items-center rounded-lg', top ? INTEREST_TONE[t] : 'bg-muted text-muted-foreground')}>
              <Icon className="size-3.5" aria-hidden />
            </span>
            <span className={cn('w-20 shrink-0 text-[13px]', top ? 'font-semibold' : 'text-muted-foreground')}>{INTEREST_TYPES[t].name}</span>
            <span className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted" role="meter" aria-valuenow={result.scores[t]} aria-valuemin={0} aria-valuemax={100} aria-label={`${INTEREST_TYPES[t].name} ${result.scores[t]}%`}>
              <span className={cn('absolute inset-y-0 left-0 rounded-full', top ? INTEREST_BAR[t] : 'bg-border-strong')} style={{ width: `${Math.max(3, result.scores[t])}%` }} />
            </span>
            <span className="w-9 shrink-0 text-right text-[12px] tabular text-muted-foreground">{result.scores[t]}%</span>
          </li>
        );
      })}
    </ul>
  );
}

export function SaveCareerButton({ slug, saved, size = 'sm', className }: { slug: string; saved: boolean; size?: 'sm' | 'icon-sm'; className?: string }) {
  const m = useSaveCareer();
  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    m.mutate(
      { slug, saved: !saved },
      {
        onSuccess: () => toast.success(saved ? 'Removed from your saved careers' : 'Saved to your careers'),
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  };
  return (
    <Button type="button" variant={saved ? 'secondary' : 'outline'} size={size} onClick={onClick} disabled={m.isPending} aria-pressed={saved} aria-label={saved ? 'Remove from saved careers' : 'Save this career'} className={className}>
      {saved ? <BookmarkCheck className="text-brand" /> : <Bookmark />}
      {size === 'sm' && (saved ? 'Saved' : 'Save')}
    </Button>
  );
}

/** A career in a list: name, field, summary, tracks and interest types. */
export function CareerCard({ career, saved, match, reasons, className }: { career: CareerRow; saved?: boolean; match?: number; reasons?: string[]; className?: string }) {
  return (
    <Link
      to={`/careers/library/${career.slug}`}
      className={cn('group flex min-w-0 flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-soft transition-all hover:-translate-y-0.5 hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', className)}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] font-medium text-muted-foreground">{career.field}</p>
          <h3 className="font-display text-[15px] font-semibold leading-snug tracking-tight">{career.name}</h3>
        </div>
        {saved !== undefined && <SaveCareerButton slug={career.slug} saved={saved} size="icon-sm" className="-mr-1 -mt-1 shrink-0" />}
      </div>
      <p className="line-clamp-2 text-[13px] text-muted-foreground">{career.summary}</p>
      {reasons && reasons.length > 0 && (
        <ul className="space-y-0.5 text-[12.5px]">
          {reasons.slice(0, 2).map((r) => (
            <li key={r} className="flex gap-1.5">
              <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
        {match !== undefined && <Badge variant="brand">{match}% match</Badge>}
        {career.interests.slice(0, 2).map((t) => (
          <InterestChip key={t} type={t} />
        ))}
        {career.tracks.map((t) => (
          <TrackBadge key={t} track={t} />
        ))}
      </div>
    </Link>
  );
}

export const REQUIREMENTS_SOON = 'Requirements coming soon — check the JAMB brochure.';

/** A course's admission requirements, only when verified; otherwise a clear "coming soon". */
export function CourseRequirements({ course, className }: { course: CourseView; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-border p-3', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-[14px] font-semibold">{course.name}</p>
        {course.verified ? (
          <Badge variant="success" dot>
            Checked{course.sourceEdition ? ` · JAMB ${course.sourceEdition}` : ''}
          </Badge>
        ) : (
          <Badge variant="outline">
            <Clock /> Coming soon
          </Badge>
        )}
      </div>
      {course.faculty && <p className="text-[12px] text-muted-foreground">{course.faculty}</p>}
      {course.verified ? (
        <dl className="mt-2 space-y-1.5 text-[13px]">
          <div>
            <dt className="text-[11.5px] font-medium text-muted-foreground">UTME subjects</dt>
            <dd>{['Use of English', ...(course.utmeSubjects ?? []).map((r) => r.subjects.join(' or '))].join(' · ')}</dd>
          </div>
          {course.olevelRequirements && (
            <div>
              <dt className="text-[11.5px] font-medium text-muted-foreground">O’level (WASSCE/NECO)</dt>
              <dd>{formatOlevel(course.olevelRequirements)}</dd>
              {course.olevelRequirements.note && <dd className="text-[12px] text-muted-foreground">{course.olevelRequirements.note}</dd>}
            </div>
          )}
          {course.notes && <p className="whitespace-pre-line text-[12.5px] text-muted-foreground">{course.notes}</p>}
          <p className="text-[11.5px] text-muted-foreground">Cut-off marks change every year: check JAMB and the university.</p>
        </dl>
      ) : (
        <p className="mt-1.5 text-[12.5px] text-muted-foreground">{REQUIREMENTS_SOON} Your school counsellor can help you read it.</p>
      )}
    </div>
  );
}

const FIT: Record<FitCheck['status'], { label: string; icon: LucideIcon; tone: string }> = {
  FITS: { label: 'Fits', icon: CircleCheck, tone: 'text-success' },
  GAPS: { label: 'Check subjects', icon: CircleAlert, tone: 'text-warning' },
  NOT_LOADED: { label: 'Requirements coming soon', icon: Clock, tone: 'text-muted-foreground' },
  NO_SUBJECTS: { label: 'Choose a track to check', icon: CircleHelp, tone: 'text-muted-foreground' },
};

export function FitList({ fits, empty }: { fits: FitCheck[]; empty?: string }) {
  if (!fits.length) return <p className="text-[13px] text-muted-foreground">{empty ?? 'Save a career or pick a target course to see how your subjects fit.'}</p>;
  return (
    <ul className="divide-y divide-border">
      {fits.map((f) => {
        const s = FIT[f.status];
        return (
          <li key={`${f.kind}-${f.name}`} className="flex gap-3 py-3 first:pt-0 last:pb-0">
            <s.icon className={cn('mt-0.5 size-4 shrink-0', s.tone)} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                {f.slug ? (
                  <Link to={`/careers/library/${f.slug}`} className="text-[13.5px] font-medium hover:underline">
                    {f.name}
                  </Link>
                ) : (
                  <span className="text-[13.5px] font-medium">{f.name}</span>
                )}
                <span className="text-[11.5px] text-muted-foreground">{f.kind === 'COURSE' ? 'Target course' : 'Career'}</span>
                <span className={cn('text-[12px] font-medium', s.tone)}>{s.label}</span>
              </div>
              {f.notes.map((n) => (
                <p key={n} className="text-[12.5px] text-muted-foreground">
                  {n}
                </p>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Fit checks without career links (parents and staff). */
export function FitListPlain({ fits }: { fits: FitCheck[] }) {
  return <FitList fits={fits.map((f) => ({ ...f, slug: null }))} empty="Nothing to check yet: no saved careers or target course." />;
}

/** Searchable course picker (server search), for the target course. */
export function CoursePicker({ value, onChange, disabled }: { value: string | null; onChange: (name: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim(), 250);
  const q = useCourseNames(debounced, open);
  return (
    <Popover open={open} onOpenChange={(o) => (setOpen(o), o || setSearch(''))}>
      <PopoverTrigger asChild>
        <button
          id="target-course"
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="flex h-10 w-full min-w-0 items-center gap-2 rounded-lg border border-input bg-card px-3 text-left text-sm shadow-xs transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/15 disabled:opacity-50"
        >
          <GraduationCap className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className={cn('min-w-0 flex-1 truncate', !value && 'text-muted-foreground/80')}>{value ?? 'Choose a course…'}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-60" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0">
        <Command shouldFilter={false} label="Courses">
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Command.Input value={search} onValueChange={setSearch} placeholder="Search courses…" className="h-10 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-muted-foreground/70" />
            {q.isFetching && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />}
          </div>
          <Command.List className="scrollbar-thin max-h-64 overflow-y-auto p-1.5">
            {!q.isFetching && <Command.Empty className="px-3 py-6 text-center text-[13px] text-muted-foreground">No matching course yet.</Command.Empty>}
            {(q.data ?? []).map((c) => (
              <Command.Item
                key={c.name}
                value={c.name}
                onSelect={() => {
                  onChange(c.name);
                  setOpen(false);
                }}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] outline-none data-[selected=true]:bg-muted"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.name}</span>
                  <span className="block truncate text-[11.5px] text-muted-foreground">{[c.faculty, c.verified ? 'Requirements checked' : 'Requirements coming soon'].filter(Boolean).join(' · ')}</span>
                </span>
                <Check className={cn('size-4 text-brand', value === c.name ? 'opacity-100' : 'opacity-0')} aria-hidden />
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
