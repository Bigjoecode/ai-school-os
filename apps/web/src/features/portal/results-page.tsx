import type { PortalResultTerm } from '@aischool/shared';
import { ArrowLeft, Award, ChevronRight, FileDown, KeyRound, Lock, MonitorCheck, Printer, ScrollText, Trophy } from 'lucide-react';
import * as React from 'react';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/api';
import { Link, useParams, useSearchParams } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ApiError } from '@/lib/api';
import { formatDate, formatPct } from '@/lib/format';
import { useDocumentTitle } from '@/lib/hooks';
import { PaperStyle, ReportCardDocument } from '../report-cards/card-document';
import { usePortalReportCard, usePortalResults, useUnlockPortalResult } from './api';
import { OnlineTestReview, OnlineTestsList } from './online-tests';
import { PortalShell, portalPath, positionText, type ShellCtx } from './ui';

export default function PortalResultsPage() {
  return (
    <PortalShell
      section="results"
      title={({ isParent, child }) => (isParent ? `${child.firstName}’s results` : 'My results')}
      description={() => 'Report cards appear once the school publishes them; online test scores once the teacher shares them.'}
    >
      {(ctx) => <ResultsTabs {...ctx} />}
    </PortalShell>
  );
}

/** Report cards and online tests (CBT); ?tab=online&exam=<id> opens one test, so notifications can link straight to it. */
function ResultsTabs(ctx: ShellCtx) {
  const [params, setParams] = useSearchParams();
  const exam = params.get('exam');
  const tab = exam || params.get('tab') === 'online' ? 'online' : 'cards';
  const go = (next: { tab?: string; exam?: string }) => {
    const p = new URLSearchParams();
    if (next.tab === 'online') p.set('tab', 'online');
    if (next.exam) p.set('exam', next.exam);
    setParams(p, { replace: !next.exam });
    if (next.exam) window.scrollTo({ top: 0 });
  };
  return (
    <Tabs value={tab} onValueChange={(t) => go({ tab: t })}>
      <TabsList className="w-full sm:w-auto">
        <TabsTrigger value="cards" className="flex-1 sm:flex-none">
          <ScrollText /> Report cards
        </TabsTrigger>
        <TabsTrigger value="online" className="flex-1 sm:flex-none">
          <MonitorCheck /> Online tests
        </TabsTrigger>
      </TabsList>
      <TabsContent value="cards" className="mt-4">
        <ResultsBody {...ctx} />
      </TabsContent>
      <TabsContent value="online" className="mt-4">
        {exam ? (
          <OnlineTestReview child={ctx.child} isParent={ctx.isParent} examId={exam} onBack={() => go({ tab: 'online' })} />
        ) : (
          <OnlineTestsList child={ctx.child} isParent={ctx.isParent} onOpen={(id) => go({ tab: 'online', exam: id })} />
        )}
      </TabsContent>
    </Tabs>
  );
}

function ResultsBody({ child, isParent }: ShellCtx) {
  const q = usePortalResults(child.id);
  if (q.error && !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
      </div>
    );
  }
  if (q.data.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Trophy}
          title="No results published yet"
          description={isParent ? `${child.firstName}’s report card will appear here as soon as the school publishes it.` : 'Your report card will appear here as soon as the school publishes it.'}
        />
      </Card>
    );
  }
  return (
    <ul className="space-y-3">
      {q.data.map((r) => (
        <li key={r.term.id}>
          <TermRow r={r} childId={child.id} />
        </li>
      ))}
    </ul>
  );
}

function TermRow({ r, childId }: { r: PortalResultTerm; childId: string }) {
  const pos = positionText(r.position, r.classSize);
  const heading = (
    <div className="min-w-0">
      <p className="flex flex-wrap items-center gap-2 font-display text-[15px] font-semibold">
        {r.term.name} · {r.term.sessionName}
        {r.term.isCurrent && <Badge variant="brand">This term</Badge>}
      </p>
      {r.publishedAt && <p className="text-[12px] text-muted-foreground">Published {formatDate(r.publishedAt)}</p>}
    </div>
  );
  if (r.withheld) {
    return (
      <Card className="p-4 sm:p-5">
        {heading}
        <div className="mt-3 flex gap-3 rounded-xl border border-warning/30 bg-warning-soft/40 p-3">
          <Lock className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <div className="min-w-0">
            <p className="text-[13.5px] font-medium">This result is on hold</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">{r.withheld}</p>
          </div>
        </div>
      </Card>
    );
  }
  return (
    <Link
      to={`${portalPath('results', childId)}/${r.term.id}`}
      className="group block rounded-2xl border border-border bg-card p-4 shadow-soft transition-all hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        {heading}
        <ChevronRight className="mt-0.5 size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
      </div>
      {r.pinRequired ? (
        <p className="mt-3 flex items-center gap-2 text-[13px] text-muted-foreground">
          <KeyRound className="size-4 shrink-0" aria-hidden /> Enter a result checker PIN to open this report card.
        </p>
      ) : (
      <div className="mt-3 grid grid-cols-2 gap-2 sm:max-w-sm">
        <div className="min-w-0 rounded-xl bg-muted/60 px-3 py-2">
          <p className="text-[11.5px] text-muted-foreground">Average</p>
          <p className="font-display text-lg font-semibold tabular">{formatPct(r.average, 1)}</p>
        </div>
        <div className="min-w-0 rounded-xl bg-muted/60 px-3 py-2">
          <p className="text-[11.5px] text-muted-foreground">Position</p>
          <p className="truncate font-display text-lg font-semibold tabular">{pos ?? '—'}</p>
        </div>
      </div>
      )}
      <p className="mt-3 text-[13px] font-medium text-brand">{r.pinRequired ? 'Enter PIN' : 'View report card'}</p>
    </Link>
  );
}

// ------------------------------------------------------------------ one report card

export function PortalReportCardPage() {
  return (
    <PortalShell
      section="results"
      className="print:max-w-none print:p-0"
      title={({ isParent, child }) => (isParent ? `${child.firstName}’s report card` : 'My report card')}
    >
      {(ctx) => <CardBody {...ctx} />}
    </PortalShell>
  );
}

function CardBody({ child }: ShellCtx) {
  const { termId = '' } = useParams();
  const q = usePortalReportCard(child.id, termId);
  const v = q.data;
  useDocumentTitle(v ? `${v.student.name} · ${v.term.name} report card` : undefined);
  const back = (
    <Button asChild variant="ghost" size="sm" className="-ml-2">
      <Link to={portalPath('results', child.id)}>
        <ArrowLeft /> All results
      </Link>
    </Button>
  );

  if (q.isLoading) return <Skeleton className="h-[560px] rounded-2xl" />;
  if (!v) {
    const err = q.error;
    const withheld = err instanceof ApiError && err.status === 403 && err.details.code === 'RESULT_WITHHELD';
    const notFound = err instanceof ApiError && err.status === 404;
    const pinRequired = err instanceof ApiError && err.status === 403 && err.details.code === 'RESULT_PIN_REQUIRED';
    return (
      <div className="space-y-3">
        {back}
        <Card>
          {pinRequired ? (
            <PinUnlock childId={child.id} termId={termId} />
          ) : withheld ? (
            <EmptyState icon={Lock} title="This result is on hold" description={err.message} />
          ) : notFound ? (
            <EmptyState icon={Award} title="Not published yet" description="The school hasn’t published this report card. Please check again later." />
          ) : (
            <ErrorState error={err} onRetry={() => void q.refetch()} />
          )}
        </Card>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        {back}
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer /> Print
          </Button>
          <Button onClick={() => window.print()} aria-label="Save as PDF (choose “Save as PDF” as the printer)">
            <FileDown /> Save as PDF
          </Button>
        </div>
      </div>
      <p className="mb-3 text-[12px] text-muted-foreground print:hidden">To save a PDF on a phone, tap Save as PDF and choose “Save as PDF” as the printer.</p>
      <PaperStyle paper={v.template.paper} />
      {/* Its own wrapper so the sheet is a :last-child (no blank page after it). */}
      <div className="-mx-4 overflow-x-auto sm:mx-0 print:mx-0 print:overflow-visible">
        <ReportCardDocument v={v} className="print:text-[10.5px]" />
      </div>
    </>
  );
}

/** The school requires a result PIN once per term: the parent enters a card's serial and PIN. */
function PinUnlock({ childId, termId }: { childId: string; termId: string }) {
  const unlock = useUnlockPortalResult(childId, termId);
  const [v, setV] = React.useState({ serial: '', pin: '' });
  return (
    <form
      className="mx-auto grid max-w-md gap-4 p-5 sm:p-6"
      onSubmit={(e) => {
        e.preventDefault();
        unlock.mutate({ serial: v.serial.replace(/[\s-]/g, ''), pin: v.pin.replace(/[\s-]/g, '') });
      }}
    >
      <div className="text-center">
        <div className="mx-auto mb-2 grid size-11 place-items-center rounded-xl bg-brand-soft text-brand"><KeyRound className="size-5" aria-hidden /></div>
        <p className="font-display text-[16px] font-semibold">Enter a result checker PIN</p>
        <p className="mt-1 text-[13px] text-muted-foreground">The school asks for a result checker card once per term for each child. Cards are sold by the school office.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
        <Field label="Serial number" htmlFor="pp-serial">
          <Input id="pp-serial" inputMode="numeric" autoComplete="off" className="font-mono" value={v.serial} onChange={(e) => setV((x) => ({ ...x, serial: e.target.value }))} />
        </Field>
        <Field label="PIN (12 digits)" htmlFor="pp-pin">
          <Input id="pp-pin" inputMode="numeric" autoComplete="off" className="font-mono" value={v.pin} onChange={(e) => setV((x) => ({ ...x, pin: e.target.value }))} />
        </Field>
      </div>
      {unlock.error && <p role="alert" className="text-[13px] text-danger">{errorMessage(unlock.error)}</p>}
      <Button type="submit" loading={unlock.isPending} disabled={!v.serial || !v.pin}>
        Open report card
      </Button>
    </form>
  );
}
