import { ordinal, type PortalChild, type PortalMe, type PortalSettings } from '@aischool/shared';
import { Banknote, CalendarCheck, CalendarDays, Compass, Download, HeartPulse, House, Lock, type LucideIcon, Sparkles, Trophy } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import { formatPct } from '@/lib/format';
import { cn, initialsFromName } from '@/lib/utils';
import { lastChild, rememberChild, usePortalMe } from './api';

/**
 * "My school": URLs are /school/<section>/<studentId> (the overview is
 * /school/<studentId>), so a parent's choice of child survives a refresh and
 * can be shared between their own devices. The sidebar links (/school,
 * /school/attendance…) resolve to the last child they looked at.
 */

export type PortalSection = 'overview' | 'learning' | 'attendance' | 'results' | 'fees' | 'calendar' | 'downloads' | 'welfare' | 'careers';

export const PORTAL_SECTIONS: { key: PortalSection; label: string; icon: LucideIcon; setting?: keyof PortalSettings; parentsOnly?: boolean }[] = [
  { key: 'overview', label: 'Overview', icon: House },
  { key: 'learning', label: 'Learning updates', icon: Sparkles },
  { key: 'attendance', label: 'Attendance', icon: CalendarCheck, setting: 'showAttendance' },
  { key: 'results', label: 'Results', icon: Trophy, setting: 'showResults' },
  { key: 'fees', label: 'Fees', icon: Banknote, setting: 'showFees', parentsOnly: true },
  { key: 'calendar', label: 'Exams & calendar', icon: CalendarDays, setting: 'showCalendar' },
  { key: 'downloads', label: 'Downloads', icon: Download, setting: 'showDownloads' },
  { key: 'welfare', label: 'Behaviour & health', icon: HeartPulse },
  // Students have their own Careers area; this tab is the parent's read-only view.
  { key: 'careers', label: 'Careers', icon: Compass, parentsOnly: true },
];

export function portalPath(section: PortalSection, childId: string): string {
  return section === 'overview' ? `/school/${childId}` : `/school/${section}/${childId}`;
}

export function sectionShared(settings: PortalSettings, section: PortalSection): boolean {
  const s = PORTAL_SECTIONS.find((x) => x.key === section);
  return !s?.setting || settings[s.setting] !== false;
}

/** Shared by the school and meant for this viewer (fees are for parents only). */
export function sectionVisible(me: PortalMe, section: PortalSection): boolean {
  const s = PORTAL_SECTIONS.find((x) => x.key === section);
  return sectionShared(me.settings, section) && (!s?.parentsOnly || me.role === 'PARENT');
}

/** /school and /school/<section>: open the last child looked at (or the first). */
export function PortalRedirect({ section }: { section: PortalSection }) {
  const q = usePortalMe();
  if (q.error) return <PortalError error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <ShellSkeleton />;
  const kids = q.data.children;
  if (kids.length === 0) return <NoChildren me={q.data} />;
  const remembered = lastChild();
  const child = kids.find((c) => c.id === remembered) ?? kids[0];
  return <Navigate to={portalPath(section, child.id)} replace />;
}

export interface ShellCtx {
  me: PortalMe;
  child: PortalChild;
  /** "Emeka" for parents, "you" for students — for friendly sentences. */
  who: string;
  isParent: boolean;
}

/** The frame every portal page shares: header, child switcher and section tabs. */
export function PortalShell({
  section,
  title,
  description,
  actions,
  className,
  children,
}: {
  section: PortalSection;
  title: (ctx: ShellCtx) => string;
  description?: (ctx: ShellCtx) => ReactNode;
  actions?: (ctx: ShellCtx) => ReactNode;
  className?: string;
  children: (ctx: ShellCtx) => ReactNode;
}) {
  const { studentId = '' } = useParams();
  const q = usePortalMe();
  const me = q.data;
  const child = me?.children.find((c) => c.id === studentId);

  useEffect(() => {
    if (child) rememberChild(child.id);
  }, [child]);

  if (q.error) return <PortalError error={q.error} onRetry={() => void q.refetch()} />;
  if (!me) return <ShellSkeleton />;
  if (me.children.length === 0) return <NoChildren me={me} />;
  // A stale or foreign id in the URL: quietly open a child they can see.
  if (!child) return <Navigate to={portalPath(section, me.children[0].id)} replace />;

  const isParent = me.role === 'PARENT';
  const ctx: ShellCtx = { me, child, isParent, who: isParent ? child.firstName : 'you' };
  const shared = sectionShared(me.settings, section);
  const forParents = !isParent && !!PORTAL_SECTIONS.find((s) => s.key === section)?.parentsOnly;

  return (
    <Page className={cn('max-w-5xl', className)}>
      <div className="print:hidden">
        <PageHeader title={title(ctx)} description={description?.(ctx)} actions={actions?.(ctx)} className="sm:mb-6" />
        {isParent && me.children.length > 1 && <ChildSwitcher kids={me.children} current={child.id} section={section} />}
        <SectionTabs me={me} childId={child.id} current={section} />
      </div>
      {forParents ? (
        <Card>
          <EmptyState icon={Lock} title="For parents" description="This part of the portal is for parents. Ask a parent or guardian if you have a question about it." />
        </Card>
      ) : shared ? (
        children(ctx)
      ) : (
        <Card>
          <EmptyState icon={Lock} title="Not shared by the school" description="Your school hasn’t made this part of the portal available. Please contact the school office if you need it." />
        </Card>
      )}
    </Page>
  );
}

function ChildSwitcher({ kids, current, section }: { kids: PortalChild[]; current: string; section: PortalSection }) {
  const navigate = useNavigate();
  return (
    <div role="radiogroup" aria-label="Choose a child" className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
      {kids.map((c) => {
        const on = c.id === current;
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => {
              rememberChild(c.id);
              navigate(portalPath(section, c.id));
            }}
            className={cn(
              'flex min-h-11 shrink-0 items-center gap-2.5 rounded-full border py-1 pl-1 pr-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              on ? 'border-brand bg-brand-soft' : 'border-border bg-card hover:bg-muted/50',
            )}
          >
            <Avatar name={c.name} initials={initialsFromName(c.name)} src={c.photoUrl} size="sm" />
            <span className="min-w-0 leading-tight">
              <span className={cn('block max-w-36 truncate text-[13.5px] font-medium', on && 'text-brand')}>{c.firstName}</span>
              <span className="block max-w-36 truncate text-[11.5px] text-muted-foreground">{c.className ?? 'No class yet'}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SectionTabs({ me, childId, current }: { me: PortalMe; childId: string; current: PortalSection }) {
  const tabs = PORTAL_SECTIONS.filter((s) => sectionVisible(me, s.key));
  const navRef = useRef<HTMLElement>(null);
  // On a phone the strip scrolls: keep the open section in view.
  useEffect(() => {
    const nav = navRef.current;
    const el = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !el) return;
    const box = nav.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.left < box.left || r.right > box.right) nav.scrollLeft += r.left - box.left - 16;
  }, [current]);
  return (
    <nav ref={navRef} aria-label="My school" className="no-scrollbar -mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0">
      {tabs.map((t) => {
        const active = t.key === current;
        return (
          <Link
            key={t.key}
            to={portalPath(t.key, childId)}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex shrink-0 items-center gap-1.5 px-3 pb-3 pt-1 text-[13.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <t.icon className={cn('size-4', active && 'text-brand')} aria-hidden />
            {t.label}
            {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand" />}
          </Link>
        );
      })}
    </nav>
  );
}

function ShellSkeleton() {
  return (
    <Page className="max-w-5xl">
      <Skeleton className="mb-3 h-8 w-56" />
      <Skeleton className="mb-6 h-4 w-72 max-w-full" />
      <Skeleton className="mb-5 h-9 w-full" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    </Page>
  );
}

function PortalError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const forbidden = error instanceof ApiError && error.status === 403;
  return (
    <Page className="max-w-5xl">
      <Card>
        {forbidden ? (
          <EmptyState icon={Lock} title="For parents and students" description="This area shows a child’s attendance, results and school documents. It’s only for parents and students." />
        ) : (
          <ErrorState error={error} onRetry={onRetry} />
        )}
      </Card>
    </Page>
  );
}

function NoChildren({ me }: { me: PortalMe }) {
  return (
    <Page className="max-w-5xl">
      <Card>
        <EmptyState
          icon={House}
          title={me.role === 'PARENT' ? 'No children linked yet' : 'Your school record isn’t linked yet'}
          description={
            me.role === 'PARENT'
              ? 'Ask the school office to link your children to your account. Once they do, you’ll see attendance, results and school documents here.'
              : 'Ask the school office to link your account to your student record.'
          }
        />
      </Card>
    </Page>
  );
}

/** Small "label + value" tile used across the portal. */
export function StatTile({ label, value, tone, icon: Icon, className }: { label: string; value: ReactNode; tone?: string; icon?: LucideIcon; className?: string }) {
  return (
    <div className={cn('min-w-0 rounded-xl bg-muted/60 px-3 py-2.5', className)}>
      <p className="flex items-center gap-1 truncate text-[11.5px] font-medium text-muted-foreground">
        {Icon && <Icon className="size-3.5 shrink-0" aria-hidden />}
        {label}
      </p>
      <p className={cn('mt-0.5 font-display text-xl font-semibold tabular leading-tight', tone)}>{value}</p>
    </div>
  );
}

/** "3rd of 34" */
export function positionText(position: number | null, classSize: number | null): string | null {
  if (!position) return null;
  return classSize ? `${ordinal(position)} of ${classSize}` : ordinal(position);
}

export function fileSize(bytes: number | null): string | null {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Attendance rate as a ring: green from 90%, amber from 75%, red below. */
export function AttendanceRing({ rate, size = 96 }: { rate: number | null; size?: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const pct = rate == null ? 0 : Math.max(0, Math.min(100, rate));
  const tone = rate == null ? 'var(--muted-foreground)' : pct >= 90 ? 'var(--success)' : pct >= 75 ? 'var(--warning)' : 'var(--danger)';
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--muted)" strokeWidth="10" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={tone} strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
      </svg>
      <span className="absolute inset-0 grid place-items-center font-display text-[20px] font-semibold tabular">{rate == null ? '—' : formatPct(rate, Number.isInteger(rate) ? 0 : 1)}</span>
    </div>
  );
}
