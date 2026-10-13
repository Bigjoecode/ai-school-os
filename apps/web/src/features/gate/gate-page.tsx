import type { GateChild, GateEventRow, GateScanResult } from '@aischool/shared';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, CheckCircle2, Clock, DoorOpen, IdCard, LogIn, LogOut, RotateCcw, ScanLine, Settings2, Users } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { Skeleton } from '@/components/ui/skeleton';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { errorMessage } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { useDocumentTitle } from '@/lib/hooks';
import { cn, initialsFromName } from '@/lib/utils';
import { Segmented } from '../operations/ui';
import { useGateSearch, useGateToday, useScan, useUndo } from './api';
import { ChildSheet } from './child-sheet';
import { CameraScanner } from './scanner';
import { GateSettingsSheet } from './settings-sheet';
import { clock, METHOD_LABEL, NoticeBadge } from './ui';

const looksLikePass = (s: string) => /^AISGATE:/i.test(s.trim()) || /\/verify\/id\//.test(s) || /^[A-HJ-NP-Z2-9]{14}$/.test(s.trim());

/**
 * The gate screen: scan passes as children arrive and leave (first scan of
 * the day = arrival, later = departure), see parents' notices, and release
 * children to the right people at home time.
 */
export default function GatePage() {
  useDocumentTitle('Gate');
  const today = useGateToday();
  const canSettings = useCan('attendance.manage');
  const [tab, setTab] = useState<'scan' | 'pickup'>('scan');
  const [open, setOpen] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const d = today.data;

  return (
    <div className="min-h-dvh bg-background pb-[env(safe-area-inset-bottom)]">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3">
          <Button asChild variant="ghost" size="icon" aria-label="Back to reception">
            <Link to="/reception">
              <ArrowLeft />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 font-display text-[17px] font-semibold tracking-tight">
              <DoorOpen className="size-[18px] text-brand" aria-hidden /> Gate
            </h1>
            <p className="truncate text-[12px] text-muted-foreground">
              {d ? `${d.time} · late after ${d.settings.studentLateAfter} · home time ${d.settings.homeTime}` : 'Arrivals, departures and pick-up'}
            </p>
          </div>
          <Button asChild variant="ghost" size="icon" aria-label="Print gate passes">
            <Link to="/gate/passes">
              <IdCard />
            </Link>
          </Button>
          {canSettings && (
            <Button variant="ghost" size="icon" aria-label="Gate settings" onClick={() => setSettings(true)}>
              <Settings2 />
            </Button>
          )}
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-4">
        {today.error && !d ? (
          <ErrorState error={today.error} onRetry={() => void today.refetch()} />
        ) : (
          <>
            <div className="grid grid-cols-4 gap-2">
              <Stat label="In school" value={d?.counts.inSchool} />
              <Stat label="Arrived" value={d?.counts.arrived} />
              <Stat label="Late" value={d?.counts.late} tone={d && d.counts.late > 0 ? 'text-warning' : undefined} />
              <Stat label="Left" value={d?.counts.left} />
            </div>
            {d && !d.schoolDay && <p className="rounded-lg bg-muted/60 px-3 py-2 text-[13px] text-muted-foreground">Today isn’t a school day in the timetable — scans still work.</p>}
            <Segmented
              label="Gate view"
              value={tab}
              onChange={setTab}
              className="w-full [&>button]:flex-1 [&>button]:justify-center"
              options={[
                { value: 'scan', label: <><ScanLine /> Arrivals & scans</> },
                { value: 'pickup', label: <><Users /> Pick-up</>, count: d?.notices.length },
              ]}
            />
            {tab === 'scan' ? <ScanTab recent={d?.recent} onOpen={setOpen} /> : <PickupTab onOpen={setOpen} />}
          </>
        )}
      </main>
      <ChildSheet id={open} onOpenChange={(o) => !o && setOpen(null)} />
      {canSettings && <GateSettingsSheet open={settings} onOpenChange={setSettings} />}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | undefined; tone?: string }) {
  return (
    <Card className="px-2 py-2.5 text-center">
      <p className={cn('font-display text-[22px] font-semibold leading-none tabular', tone)}>{value ?? '–'}</p>
      <p className="mt-1 truncate text-[11px] text-muted-foreground">{label}</p>
    </Card>
  );
}

// ------------------------------------------------------------------ scanning

function ScanTab({ recent, onOpen }: { recent: GateEventRow[] | undefined; onOpen: (id: string) => void }) {
  const scan = useScan();
  const undo = useUndo();
  const [text, setText] = useState('');
  const [result, setResult] = useState<GateScanResult | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const search = useGateSearch(looksLikePass(text) ? '' : text);

  // A barcode scanner types fast and presses Enter: keep the box focused.
  useEffect(() => field.current?.focus(), []);

  const send = (body: { code?: string; studentId?: string; type?: 'ARRIVE' | 'LEAVE' }) =>
    scan.mutate(body, {
      onSuccess: (r) => {
        setResult(r);
        setText('');
        field.current?.focus();
      },
      onError: (err) => {
        toast.error(errorMessage(err));
        setText('');
      },
    });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = text.trim();
    if (!v) return;
    if (looksLikePass(v)) send({ code: v });
    else if (search.data?.length === 1) send({ studentId: search.data[0]!.id });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <div className="space-y-3">
        <CameraScanner onCode={(code) => send({ code })} paused={scan.isPending} />
        <form onSubmit={submit}>
          <Input
            ref={field}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Scan a pass, or type a child’s name"
            aria-label="Scan a pass, or type a child’s name"
            autoComplete="off"
            enterKeyHint="go"
            className="h-11 text-[15px]"
          />
        </form>
        {!looksLikePass(text) && text.trim().length >= 2 && (
          <Card className="divide-y divide-border">
            {search.isLoading ? (
              <Skeleton className="m-3 h-10" />
            ) : !search.data?.length ? (
              <p className="p-3 text-[13px] text-muted-foreground">No active student matches “{text}”.</p>
            ) : (
              search.data.map((c) => <SearchRow key={c.id} c={c} onOpen={onOpen} onSign={(type) => send({ studentId: c.id, type })} pending={scan.isPending} />)
            )}
          </Card>
        )}
        <AnimatePresence mode="popLayout">{result && <ResultBanner key={result.event?.id ?? result.message} r={result} onUndo={(id) => undo.mutate(id, { onSuccess: () => setResult(null) })} onOpen={onOpen} />}</AnimatePresence>
      </div>

      <Card className="p-0">
        <h2 className="border-b border-border px-4 py-3 text-[13px] font-semibold">Latest at the gate</h2>
        {!recent ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : recent.length === 0 ? (
          <EmptyState compact icon={ScanLine} title="No scans yet today" description="Arrivals and departures appear here as they happen." />
        ) : (
          <ul className="max-h-[60dvh] divide-y divide-border overflow-y-auto">
            {recent.map((e) => (
              <li key={e.id} className={cn('flex items-center gap-3 px-4 py-2.5', e.undone && 'opacity-50')}>
                <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => onOpen(e.student.id)}>
                  <Avatar name={e.student.name} initials={initialsFromName(e.student.name)} src={e.student.photoUrl ?? undefined} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate text-[13.5px] font-medium', e.undone && 'line-through')}>{e.student.name}</span>
                    <span className="block truncate text-[12px] text-muted-foreground">
                      {e.type === 'ARRIVE' ? 'Arrived' : 'Left'} {clock(e.at)} · {e.collectedBy ? `with ${e.collectedBy}` : METHOD_LABEL[e.method]}
                      {e.student.classArm ? ` · ${e.student.classArm}` : ''}
                    </span>
                  </span>
                </button>
                {e.late && !e.undone && <Badge variant="warning">Late</Badge>}
                {!e.undone && e.method !== 'PICKUP' && e.method !== 'REGISTER' && (
                  <Button variant="ghost" size="icon-sm" aria-label={`Undo ${e.student.firstName}’s ${e.type === 'ARRIVE' ? 'arrival' : 'departure'}`} onClick={() => undo.mutate(e.id)}>
                    <RotateCcw />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function SearchRow({ c, onOpen, onSign, pending }: { c: GateChild; onOpen: (id: string) => void; onSign: (type: 'ARRIVE' | 'LEAVE') => void; pending: boolean }) {
  const inSchool = !!c.arrivedAt && !c.leftAt;
  return (
    <div className="flex items-center gap-3 p-3">
      <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => onOpen(c.id)}>
        <Avatar name={c.name} initials={initialsFromName(c.name)} src={c.photoUrl ?? undefined} size="md" />
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-medium">{c.name}</span>
          <span className="block truncate text-[12px] text-muted-foreground">
            {c.classArm} · {c.leftAt ? `left ${clock(c.leftAt)}` : c.arrivedAt ? `in since ${clock(c.arrivedAt)}` : 'not arrived'}
          </span>
        </span>
      </button>
      <Button size="sm" variant={inSchool ? 'outline' : 'default'} disabled={pending} onClick={() => onSign(inSchool ? 'LEAVE' : 'ARRIVE')}>
        {inSchool ? <LogOut /> : <LogIn />} {inSchool ? 'Leaving' : 'Arrived'}
      </Button>
    </div>
  );
}

function ResultBanner({ r, onUndo, onOpen }: { r: GateScanResult; onUndo: (id: string) => void; onOpen: (id: string) => void }) {
  const e = r.event;
  const tone = r.outcome === 'DUPLICATE' ? 'border-border bg-muted/60' : r.outcome === 'LEFT' ? 'border-info/40 bg-info-soft' : e?.late ? 'border-warning/40 bg-warning-soft' : 'border-success/40 bg-success-soft';
  const Icon = r.outcome === 'DUPLICATE' ? Clock : r.outcome === 'LEFT' ? LogOut : CheckCircle2;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={cn('rounded-2xl border p-4', tone)} role="status" aria-live="polite">
      <div className="flex items-center gap-3">
        {e ? <Avatar name={e.student.name} initials={initialsFromName(e.student.name)} src={e.student.photoUrl ?? undefined} size="xl" /> : <Icon className="size-8 text-muted-foreground" aria-hidden />}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-display text-[18px] font-semibold leading-tight">
            <Icon className="size-5 shrink-0" aria-hidden /> <span className="min-w-0">{r.message}</span>
          </p>
          {e?.student.classArm && <p className="text-[13px] text-muted-foreground">{e.student.classArm}</p>}
        </div>
        {e && (
          <Button variant="outline" size="sm" onClick={() => onUndo(e.id)}>
            <RotateCcw /> Undo
          </Button>
        )}
      </div>
      {r.notices.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {r.notices.map((n) => (
            <NoticeBadge key={n.id} n={n} />
          ))}
          {e && (
            <Button variant="link" size="sm" onClick={() => onOpen(e.student.id)}>
              Open pick-up details
            </Button>
          )}
        </div>
      )}
    </motion.div>
  );
}

// ------------------------------------------------------------------ pick-up

function PickupTab({ onOpen }: { onOpen: (id: string) => void }) {
  const today = useGateToday();
  const [q, setQ] = useState('');
  const search = useGateSearch(q);
  const d = today.data;
  if (!d) return <Skeleton className="h-64 rounded-2xl" />;
  const list = q.trim().length >= 2 ? (search.data ?? []) : d.due;
  return (
    <div className="space-y-4">
      {d.notices.length > 0 && (
        <Card className="p-0">
          <h2 className="border-b border-border px-4 py-3 text-[13px] font-semibold">Parents’ notices today</h2>
          <ul className="divide-y divide-border">
            {d.notices.map((n) => (
              <li key={n.id}>
                <button type="button" className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/40" onClick={() => onOpen(n.student.id)}>
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="block truncate text-[14px] font-medium">
                      {n.student.name} <span className="font-normal text-muted-foreground">· {n.student.classArm}</span>
                    </span>
                    <NoticeBadge n={n} />
                    {n.note && <span className="block text-[12.5px] text-muted-foreground">“{n.note}”</span>}
                  </span>
                  <span className="shrink-0 text-[12px] text-muted-foreground tabular">{clock(n.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <SearchInput value={q} onChange={setQ} placeholder="Find a child to release…" />
      <Card className="p-0">
        <h2 className="border-b border-border px-4 py-3 text-[13px] font-semibold">{q.trim().length >= 2 ? 'Search results' : `Still in school (${d.counts.inSchool})`}</h2>
        {list.length === 0 ? (
          <EmptyState compact icon={Users} title={q ? 'No matches' : 'Nobody is waiting'} description={q ? 'Try another name or admission number.' : 'Children who arrived and haven’t left show here.'} />
        ) : (
          <ul className="divide-y divide-border">
            {list.map((c) => (
              <li key={c.id}>
                <button type="button" className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/40" onClick={() => onOpen(c.id)}>
                  <Avatar name={c.name} initials={initialsFromName(c.name)} src={c.photoUrl ?? undefined} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{c.name}</span>
                    <span className="block truncate text-[12px] text-muted-foreground">
                      {c.classArm} · {c.leftAt ? `left ${clock(c.leftAt)}` : c.arrivedAt ? `in since ${clock(c.arrivedAt)}` : 'not arrived'}
                    </span>
                    {c.notices.length > 0 && (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {c.notices.map((n) => (
                          <NoticeBadge key={n.id} n={n} />
                        ))}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
