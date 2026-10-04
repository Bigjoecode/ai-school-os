import {
  ENQUIRY_SOURCE_LABELS,
  ENQUIRY_STATUS_LABELS,
  ENQUIRY_STATUSES,
  type EnquiryRow,
  type EnquiryStatus,
  type PickupRow,
  type VisitorRow,
} from '@aischool/shared';
import {
  ArrowRightLeft,
  Baby,
  BookUser,
  CalendarClock,
  ConciergeBell,
  FilePlus2,
  DoorOpen,
  Inbox,
  LogOut,
  MessageSquarePlus,
  MoreHorizontal,
  Pencil,
  Phone,
  ShieldAlert,
  Sparkles,
  UserCheck,
  Users,
} from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { type Column, DataTable } from '@/components/ui/data-table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCan } from '@/lib/auth-store';
import { formatRelative } from '@/lib/format';
import { useDebounced, useMediaQuery } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { StatTile } from '../attendance/ui';
import { addDaysIso, schoolDate, schoolToday } from '../finance/ui';
import { useEnquiries, useMoveEnquiry, usePickups, useReceptionToday, useSignOutVisitor, useVisitors } from './api';
import { EnquirySheet, OnRecordBadge, PickupDialog, ReplyDialog, VisitorDialog } from './reception-dialogs';
import { dateInput, plural, Segmented, telHref, timeOf } from './ui';

type Tab = 'today' | 'visitors' | 'enquiries' | 'pickups';
const TABS: Tab[] = ['today', 'visitors', 'enquiries', 'pickups'];

export default function ReceptionPage() {
  const canManage = useCan('reception.manage');
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') as Tab | null;
  const tab: Tab = raw && TABS.includes(raw) ? raw : 'today';
  const today = useReceptionToday();
  const flag = (k: string) => params.get(k) === '1' && canManage;
  const [visitorOpen, setVisitorOpen] = useState(flag('visitor'));
  const [enquiry, setEnquiry] = useState<EnquiryRow | 'new' | null>(flag('enquiry') ? 'new' : null);
  const [pickupOpen, setPickupOpen] = useState(flag('pickup'));
  const visitorFlag = flag('visitor');
  const enquiryFlag = flag('enquiry');
  const pickupFlag = flag('pickup');
  useEffect(() => {
    if (visitorFlag) setVisitorOpen(true);
    if (enquiryFlag) setEnquiry((s) => s ?? 'new');
    if (pickupFlag) setPickupOpen(true);
  }, [visitorFlag, enquiryFlag, pickupFlag]);

  const patch = (next: Record<string, string | undefined>) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(next)) {
          if (v) p.set(k, v);
          else p.delete(k);
        }
        return p;
      },
      { replace: true },
    );
  const closeFlag = (k: string) => params.get(k) && patch({ [k]: undefined });

  const e = today.data?.enquiries;
  return (
    <Page>
      <PageHeader
        title="Reception"
        description="The front desk — who’s on site, early pick-ups and admissions enquiries."
        actions={
          canManage && (
            <>
              <Button variant="outline" onClick={() => setPickupOpen(true)}>
                <Baby /> Early pick-up
              </Button>
              <Button variant="outline" onClick={() => setEnquiry('new')}>
                <MessageSquarePlus /> Log enquiry
              </Button>
              <Button onClick={() => setVisitorOpen(true)}>
                <UserCheck /> Sign in visitor
              </Button>
            </>
          )
        }
      />
      <Tabs value={tab} onValueChange={(t) => patch({ tab: t === 'today' ? undefined : t })}>
        <TabsList aria-label="Reception sections">
          <TabsTrigger value="today">
            <ConciergeBell /> Today
          </TabsTrigger>
          <TabsTrigger value="visitors">
            <BookUser /> Visitor book
          </TabsTrigger>
          <TabsTrigger value="enquiries">
            <Inbox /> Enquiries
            {!!e?.followUpsDue && <span className="rounded-full bg-warning-soft px-1.5 text-[10.5px] font-semibold text-warning tabular">{e.followUpsDue}</span>}
          </TabsTrigger>
          <TabsTrigger value="pickups">
            <Baby /> Early pick-ups
          </TabsTrigger>
        </TabsList>
        <TabsContent value="today">
          <TodayTab q={today} onEnquiries={() => patch({ tab: 'enquiries' })} />
        </TabsContent>
        <TabsContent value="visitors">
          <VisitorBook />
        </TabsContent>
        <TabsContent value="enquiries">
          <EnquiriesTab onEdit={setEnquiry} />
        </TabsContent>
        <TabsContent value="pickups">
          <PickupsTab />
        </TabsContent>
      </Tabs>

      {canManage && (
        <>
          <VisitorDialog
            open={visitorOpen}
            onOpenChange={(o) => {
              setVisitorOpen(o);
              if (!o) closeFlag('visitor');
            }}
          />
          <PickupDialog
            open={pickupOpen}
            onOpenChange={(o) => {
              setPickupOpen(o);
              if (!o) closeFlag('pickup');
            }}
          />
        </>
      )}
      <EnquirySheet
        open={!!enquiry && canManage}
        onOpenChange={(o) => {
          if (!o) {
            setEnquiry(null);
            closeFlag('enquiry');
          }
        }}
        enquiry={enquiry === 'new' ? null : enquiry}
      />
    </Page>
  );
}

// ------------------------------------------------------------------ today

function TodayTab({ q, onEnquiries }: { q: ReturnType<typeof useReceptionToday>; onEnquiries: () => void }) {
  if (q.error && !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const t = q.data;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
        <StatTile label="On site now" icon={<DoorOpen />} loading={!t} value={t?.onSite.length ?? '—'} sub={t ? (t.onSite.length ? 'Visitors not yet signed out' : 'Nobody waiting to sign out') : undefined} />
        <StatTile label="Visitors today" icon={<Users />} loading={!t} value={t?.visitors.length ?? '—'} sub={t ? `${t.visitors.filter((v) => v.checkOutAt).length} signed out` : undefined} />
        <StatTile
          label="Early pick-ups"
          icon={<Baby />}
          loading={!t}
          value={t?.pickups.length ?? '—'}
          tone={t && t.pickups.some((p) => !p.onRecord) ? 'warning' : undefined}
          sub={t ? (t.pickups.some((p) => !p.onRecord) ? <span className="font-medium text-warning">{plural(t.pickups.filter((p) => !p.onRecord).length, 'collector')} not on record</span> : 'All collectors on record') : undefined}
        />
        <button type="button" onClick={onEnquiries} className="rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <StatTile
            label="Open enquiries"
            icon={<Inbox />}
            loading={!t}
            value={t?.enquiries.open ?? '—'}
            tone={t && t.enquiries.followUpsDue > 0 ? 'warning' : undefined}
            sub={
              t ? (
                <span>
                  {t.enquiries.new} new
                  {t.enquiries.followUpsDue > 0 && <span className="font-medium text-warning"> · {t.enquiries.followUpsDue} to follow up</span>}
                  <span className="block">{t.enquiries.enrolledThisYear} enrolled this year</span>
                </span>
              ) : undefined
            }
          />
        </button>
      </div>

      <div className="grid gap-5 xl:grid-cols-3 [&>*]:min-w-0">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>On site now</CardTitle>
              <CardDescription>Visitors signed in and not yet out</CardDescription>
            </div>
          </CardHeader>
          <CardContent>{!t ? <ListSkeleton /> : t.onSite.length === 0 ? <Quiet icon={DoorOpen} text="No visitors on site." /> : <VisitorList rows={t.onSite} />}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Early pick-ups today</CardTitle>
              <CardDescription>Children collected before the end of the day</CardDescription>
            </div>
          </CardHeader>
          <CardContent>{!t ? <ListSkeleton /> : t.pickups.length === 0 ? <Quiet icon={Baby} text="No early pick-ups today." /> : <PickupList rows={t.pickups} compact />}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Today’s visitor book</CardTitle>
            <CardDescription>{t ? plural(t.visitors.length, 'visitor') : 'Loading…'}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>{!t ? <ListSkeleton /> : t.visitors.length === 0 ? <Quiet icon={BookUser} text="Nobody has signed in today yet." /> : <VisitorList rows={t.visitors} showOut />}</CardContent>
      </Card>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2" aria-busy>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

function Quiet({ icon: Icon, text }: { icon: typeof DoorOpen; text: string }) {
  return (
    <p className="flex items-center gap-2 rounded-xl border border-dashed border-border p-4 text-[13px] text-muted-foreground">
      <Icon className="size-4 shrink-0" aria-hidden /> {text}
    </p>
  );
}

function VisitorList({ rows, showOut }: { rows: VisitorRow[]; showOut?: boolean }) {
  const canManage = useCan('reception.manage');
  const out = useSignOutVisitor();
  return (
    <ul className="divide-y divide-border rounded-xl border border-border">
      {rows.map((v) => (
        <li key={v.id} className="flex flex-col gap-2 px-3.5 py-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-medium">
              <span className="truncate">{v.name}</span>
              {v.badgeNumber && (
                <Badge variant="outline" className="font-mono">
                  #{v.badgeNumber}
                </Badge>
              )}
              {v.organisation && <span className="text-[12px] font-normal text-muted-foreground">{v.organisation}</span>}
            </p>
            <p className="truncate text-[12.5px] text-muted-foreground">
              {v.purpose}
              {v.host && ` · to see ${v.host}`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-[12px] text-muted-foreground">
            <span className="tabular">
              In {timeOf(v.checkInAt)}
              {v.checkOutAt ? ` · out ${timeOf(v.checkOutAt)}` : showOut ? '' : ` · ${formatRelative(v.checkInAt)}`}
            </span>
            {!v.checkOutAt &&
              (canManage ? (
                <Button size="sm" variant="outline" loading={out.isPending && out.variables === v.id} onClick={() => out.mutate(v.id)}>
                  <LogOut /> Sign out
                </Button>
              ) : (
                <Badge variant="info" dot>
                  On site
                </Badge>
              ))}
          </div>
        </li>
      ))}
    </ul>
  );
}

function PickupList({ rows, compact }: { rows: PickupRow[]; compact?: boolean }) {
  return (
    <ul className="divide-y divide-border rounded-xl border border-border">
      {rows.map((p) => (
        <li key={p.id} className={cn('px-3.5 py-3', !p.onRecord && 'bg-warning-soft/30')}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 truncate text-[13.5px] font-medium">
              {p.student.name}
              {p.student.classArm && <span className="font-normal text-muted-foreground"> · {p.student.classArm}</span>}
            </p>
            <span className="text-[12px] text-muted-foreground tabular">{compact ? timeOf(p.at) : `${schoolDate(p.at)} · ${timeOf(p.at)}`}</span>
          </div>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            With {p.collectedBy} ({p.relationship})
            {p.phone && (
              <>
                {' · '}
                <a href={telHref(p.phone)} className="text-brand hover:underline">
                  {p.phone}
                </a>
              </>
            )}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <OnRecordBadge onRecord={p.onRecord} />
            <span className="truncate text-[12px] text-muted-foreground">
              {p.reason}
              {p.recordedBy && ` · logged by ${p.recordedBy}`}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ visitor book

function VisitorBook() {
  const [from, setFrom] = useState(() => addDaysIso(schoolToday(), -6));
  const [to, setTo] = useState(() => schoolToday());
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 300);
  const list = useVisitors({ from: from || undefined, to: to || undefined, q: q || undefined });
  const canManage = useCan('reception.manage');
  const out = useSignOutVisitor();

  const columns: Column<VisitorRow>[] = [
    {
      key: 'name',
      header: 'Visitor',
      cell: (v) => (
        <div className="min-w-0 max-w-[240px]">
          <p className="truncate font-medium">{v.name}</p>
          <p className="truncate text-[12px] text-muted-foreground">{[v.organisation, v.phone].filter(Boolean).join(' · ') || '—'}</p>
        </div>
      ),
    },
    { key: 'purpose', header: 'Purpose', cell: (v) => <span className="block max-w-[260px] truncate text-[13px]">{v.purpose}</span> },
    { key: 'host', header: 'To see', cell: (v) => <span className="block max-w-[200px] truncate text-[13px] text-muted-foreground">{v.host ?? '—'}</span>, headClassName: 'hidden lg:table-cell', className: 'hidden lg:table-cell' },
    { key: 'badge', header: 'Badge', cell: (v) => <span className="font-mono text-[12px] text-muted-foreground">{v.badgeNumber ?? '—'}</span>, headClassName: 'hidden xl:table-cell', className: 'hidden xl:table-cell' },
    { key: 'in', header: 'In', cell: (v) => <span className="whitespace-nowrap text-[13px] tabular">{schoolDate(v.checkInAt)} · {timeOf(v.checkInAt)}</span> },
    {
      key: 'out',
      header: 'Out',
      cell: (v) =>
        v.checkOutAt ? (
          <span className="text-[13px] tabular">{timeOf(v.checkOutAt)}</span>
        ) : canManage ? (
          <Button size="sm" variant="outline" loading={out.isPending && out.variables === v.id} onClick={() => out.mutate(v.id)}>
            <LogOut /> Sign out
          </Button>
        ) : (
          <Badge variant="info" dot>
            On site
          </Badge>
        ),
    },
  ];

  return (
    <Card className="overflow-hidden">
      <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end sm:px-5 [&>*]:min-w-0">
        <SearchInput value={search} onChange={setSearch} placeholder="Name, purpose or organisation…" />
        <Field label="From" htmlFor="vb-from" className="gap-1">
          <Input id="vb-from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={cn(dateInput, 'sm:w-40')} />
        </Field>
        <Field label="To" htmlFor="vb-to" className="gap-1">
          <Input id="vb-to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={cn(dateInput, 'sm:w-40')} />
        </Field>
      </div>
      <DataTable
        columns={columns}
        rows={list.data}
        rowKey={(v) => v.id}
        loading={list.isLoading || list.isPlaceholderData}
        error={list.error}
        onRetry={() => void list.refetch()}
        renderMobile={(v) => (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{v.name}</p>
              <p className="truncate text-[12.5px] text-muted-foreground">
                {v.purpose}
                {v.host && ` · ${v.host}`}
              </p>
              <p className="text-[12px] text-muted-foreground tabular">
                {schoolDate(v.checkInAt)} · in {timeOf(v.checkInAt)}
                {v.checkOutAt && ` · out ${timeOf(v.checkOutAt)}`}
              </p>
            </div>
            {!v.checkOutAt &&
              (canManage ? (
                <Button size="sm" variant="outline" loading={out.isPending && out.variables === v.id} onClick={() => out.mutate(v.id)}>
                  Sign out
                </Button>
              ) : (
                <Badge variant="info" dot>
                  On site
                </Badge>
              ))}
          </div>
        )}
        empty={{ icon: BookUser, title: q ? 'No visitors match' : 'No visitors in these dates', description: 'Visitors signed in at the front desk appear here.' }}
      />
    </Card>
  );
}

// ------------------------------------------------------------------ enquiries

const OPEN_STATUSES: EnquiryStatus[] = ['NEW', 'CONTACTED', 'VISIT_BOOKED', 'APPLIED'];
const STATUS_TONE: Record<EnquiryStatus, string> = {
  NEW: 'bg-info',
  CONTACTED: 'bg-chart-2',
  VISIT_BOOKED: 'bg-chart-3',
  APPLIED: 'bg-chart-5',
  ENROLLED: 'bg-success',
  CLOSED: 'bg-border-strong',
};

function EnquiriesTab({ onEdit }: { onEdit: (e: EnquiryRow) => void }) {
  const wide = useMediaQuery('(min-width: 1024px)');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<EnquiryStatus | 'OPEN' | 'ALL'>('OPEN');
  const q = useDebounced(search.trim(), 300);
  const list = useEnquiries({ q: q || undefined });
  const [replying, setReplying] = useState<EnquiryRow | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  const rows = useMemo(() => {
    const all = [...(list.data ?? [])].sort((a, b) => Number(b.followUpDue) - Number(a.followUpDue) || b.createdAt.localeCompare(a.createdAt));
    return all;
  }, [list.data]);
  const counts = useMemo(() => {
    const c = Object.fromEntries(ENQUIRY_STATUSES.map((s) => [s, 0])) as Record<EnquiryStatus, number>;
    for (const r of rows) c[r.status]++;
    return c;
  }, [rows]);
  const filtered = rows.filter((r) => (filter === 'ALL' ? true : filter === 'OPEN' ? OPEN_STATUSES.includes(r.status) : r.status === filter));
  const columns = showClosed ? ENQUIRY_STATUSES : [...OPEN_STATUSES, 'ENROLLED' as const];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SearchInput value={search} onChange={setSearch} placeholder="Parent, child or phone…" className="lg:w-80" />
        {wide ? (
          <label htmlFor="enq-closed" className="flex cursor-pointer items-center gap-2 text-[13px] text-muted-foreground">
            <Checkbox id="enq-closed" checked={showClosed} onCheckedChange={(c) => setShowClosed(c === true)} /> Show closed
          </label>
        ) : (
          <Segmented
            size="sm"
            label="Enquiry stage"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'OPEN', label: 'Open', count: OPEN_STATUSES.reduce((n, s) => n + counts[s], 0) },
              ...ENQUIRY_STATUSES.map((s) => ({ value: s, label: ENQUIRY_STATUS_LABELS[s], count: counts[s] })),
              { value: 'ALL', label: 'All' },
            ]}
          />
        )}
      </div>
      {list.error && !list.data ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : !list.data ? (
        <div className="grid gap-3 lg:grid-cols-4" aria-busy>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon={Inbox} title={q ? 'No enquiries match' : 'No enquiries yet'} description={q ? 'Try a different name or number.' : 'Log calls, walk-ins and WhatsApp messages from prospective parents here.'} />
        </Card>
      ) : wide ? (
        <div className="scrollbar-thin -mx-1 overflow-x-auto px-1 pb-2">
          <div className="grid auto-cols-[minmax(240px,1fr)] grid-flow-col gap-3">
            {columns.map((s) => {
              const items = rows.filter((r) => r.status === s);
              return (
                <section key={s} aria-label={ENQUIRY_STATUS_LABELS[s]} className="flex min-w-0 flex-col rounded-2xl border border-border bg-muted/30">
                  <header className="flex items-center gap-2 px-3 py-2.5">
                    <span className={cn('size-2 rounded-full', STATUS_TONE[s])} aria-hidden />
                    <span className="text-[13px] font-semibold">{ENQUIRY_STATUS_LABELS[s]}</span>
                    <span className="ml-auto text-[12px] text-muted-foreground tabular">{items.length}</span>
                  </header>
                  <ul className="flex flex-1 flex-col gap-2 px-2 pb-2">
                    {items.length === 0 && <li className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-[12px] text-muted-foreground">None</li>}
                    {items.map((r) => (
                      <li key={r.id}>
                        <EnquiryCard e={r} onEdit={onEdit} onReply={setReplying} />
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState compact icon={Inbox} title="Nothing at this stage" />
        </Card>
      ) : (
        <ul className="space-y-2">
          {filtered.map((r) => (
            <li key={r.id}>
              <EnquiryCard e={r} onEdit={onEdit} onReply={setReplying} showStatus />
            </li>
          ))}
        </ul>
      )}
      <ReplyDialog enquiry={replying} onOpenChange={(o) => !o && setReplying(null)} />
    </div>
  );
}

function EnquiryCard({ e, onEdit, onReply, showStatus }: { e: EnquiryRow; onEdit: (e: EnquiryRow) => void; onReply: (e: EnquiryRow) => void; showStatus?: boolean }) {
  const canManage = useCan('reception.manage');
  const canAi = useCan('ai.use');
  const canApply = useCan('admissions.manage');
  const navigate = useNavigate();
  const move = useMoveEnquiry();
  const today = schoolToday();
  const followLabel: ReactNode = e.followUpOn ? (
    e.followUpDue ? (
      <span className="inline-flex items-center gap-1 font-medium text-warning">
        <CalendarClock className="size-3" aria-hidden /> {e.followUpOn < today ? `Follow-up was due ${schoolDate(e.followUpOn)}` : 'Follow up today'}
      </span>
    ) : (
      <span className="inline-flex items-center gap-1">
        <CalendarClock className="size-3" aria-hidden /> Follow up {schoolDate(e.followUpOn)}
      </span>
    )
  ) : null;
  return (
    <Card className={cn('p-3.5 shadow-none', e.followUpDue && 'border-warning/50 bg-warning-soft/20')}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-medium">
            <span className="truncate">{e.parentName}</span>
            {showStatus && (
              <Badge variant="outline" className="gap-1.5">
                <span className={cn('size-1.5 rounded-full', STATUS_TONE[e.status])} aria-hidden />
                {ENQUIRY_STATUS_LABELS[e.status]}
              </Badge>
            )}
          </p>
          <p className="truncate text-[12.5px] text-muted-foreground">
            {[e.childName, e.classOfInterest, e.entryTerm].filter(Boolean).join(' · ') || 'No child details yet'}
          </p>
        </div>
        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="-mr-1 -mt-1 size-7" aria-label={`Actions for ${e.parentName}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onEdit(e)}>
                <Pencil /> Open and edit
              </DropdownMenuItem>
              {canAi && (
                <DropdownMenuItem onSelect={() => onReply(e)}>
                  <Sparkles /> Draft reply with AI
                </DropdownMenuItem>
              )}
              {canApply && e.status !== 'ENROLLED' && e.status !== 'CLOSED' && (
                <DropdownMenuItem onSelect={() => navigate(`/admissions/new?enquiry=${e.id}`)}>
                  <FilePlus2 /> {e.status === 'APPLIED' ? 'Open or start application' : 'Start an application'}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Move to</DropdownMenuLabel>
              {ENQUIRY_STATUSES.filter((s) => s !== e.status).map((s) => (
                <DropdownMenuItem key={s} onSelect={() => move.mutate({ row: e, status: s })}>
                  <ArrowRightLeft /> {ENQUIRY_STATUS_LABELS[s]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {e.question && <p className="mt-2 line-clamp-2 text-[12.5px] text-foreground/85">“{e.question}”</p>}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground">
        <a href={telHref(e.phone)} className="inline-flex items-center gap-1 font-medium text-brand hover:underline">
          <Phone className="size-3" aria-hidden /> {e.phone}
        </a>
        <span>{ENQUIRY_SOURCE_LABELS[e.source]}</span>
        <span>{formatRelative(e.createdAt)}</span>
        {followLabel}
      </div>
      {canAi && !canManage && (
        <Button size="sm" variant="ghost" className="mt-2 h-7 px-2 text-[12px]" onClick={() => onReply(e)}>
          <Sparkles /> Draft reply
        </Button>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ pick-ups

function PickupsTab() {
  const q = usePickups();
  const [search, setSearch] = useState('');
  const rows = useMemo(() => {
    const t = search.trim().toLowerCase();
    return (q.data ?? []).filter((p) => !t || `${p.student.name} ${p.collectedBy} ${p.student.classArm ?? ''}`.toLowerCase().includes(t));
  }, [q.data, search]);
  const notOnRecord = (q.data ?? []).filter((p) => !p.onRecord).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput value={search} onChange={setSearch} placeholder="Student or collector…" className="sm:w-80" />
        {notOnRecord > 0 && (
          <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-warning">
            <ShieldAlert className="size-3.5" aria-hidden /> {plural(notOnRecord, 'collector')} weren’t on record
          </p>
        )}
      </div>
      {q.error && !q.data ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <ListSkeleton />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon={Baby} title={search ? 'No pick-ups match' : 'No early pick-ups logged'} description="Each time a child leaves early, log who collected them — we check them against the record." />
        </Card>
      ) : (
        <PickupList rows={rows} />
      )}
    </div>
  );
}
